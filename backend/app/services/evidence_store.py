from __future__ import annotations

import csv
import io
import ipaddress
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from app.config import get_settings
from app.schemas.core import (
    AuditLogEntry,
    DashboardStats,
    ExtractionCandidate,
    ExtractionRequest,
    ExtractionResult,
    PlatformRange,
    QuarantineRecord,
    RequestPackage,
    SearchResult,
    SessionRecord,
    UploadStatus,
)
from app.services.classifier import PLATFORM_RELAYS, classify_ip

IST = timezone(timedelta(hours=5, minutes=30))
STORE_VERSION = 1

COLUMN_ALIASES = {
    "msisdn": (
        "msisdn",
        "a_party_msisdn",
        "a_number",
        "a_party",
        "subscriber",
        "subscriber_number",
        "calling_number",
        "calling_party",
        "mobile_number",
    ),
    "destination_ip": (
        "destination_ip",
        "dest_ip",
        "server_ip",
        "b_party_ip",
        "b_party_public_ip",
        "remote_ip",
        "remote_address",
        "public_ip",
        "translated_ip",
    ),
    "destination_port": (
        "destination_port",
        "dest_port",
        "server_port",
        "b_party_port",
        "remote_port",
        "public_port",
        "translated_port",
    ),
    "duration_seconds": ("duration_seconds", "duration", "session_duration", "duration_sec", "duration_s"),
    "bytes_up": ("bytes_up", "uplink_bytes", "upload_bytes", "tx_bytes", "bytes_sent", "sent_bytes"),
    "bytes_down": ("bytes_down", "downlink_bytes", "download_bytes", "rx_bytes", "bytes_received", "received_bytes"),
    "protocol": ("protocol", "ip_protocol", "proto"),
    "started_at": ("started_at", "start_time", "timestamp", "session_start", "date_time", "datetime"),
}


class EvidenceStoreError(Exception):
    """Base class for controlled evidence-store failures."""


class UploadValidationError(EvidenceStoreError):
    """Raised when an uploaded file cannot be parsed as IPDR evidence."""


class RowValidationError(EvidenceStoreError):
    def __init__(self, field: str | None, reason: str) -> None:
        super().__init__(reason)
        self.field = field
        self.reason = reason


def now_ist() -> datetime:
    return datetime.now(tz=IST)


class EvidenceStore:
    def __init__(self, storage_dir: Path | str | None = None) -> None:
        base_dir = Path(storage_dir) if storage_dir is not None else get_settings().upload_dir
        self.storage_dir = base_dir
        self.evidence_dir = self.storage_dir / "evidence_files"
        self.storage_file = self.storage_dir / "evidence_store.json"
        self._lock = RLock()
        self.uploads: list[UploadStatus] = []
        self.sessions: list[SessionRecord] = []
        self.extractions: list[ExtractionResult] = []
        self.packages: list[RequestPackage] = []
        self.audit_logs: list[AuditLogEntry] = []
        self.platform_ranges: list[PlatformRange] = []
        self._ensure_dirs()
        self._load()

    def _ensure_dirs(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.evidence_dir.mkdir(parents=True, exist_ok=True)

    def _load(self) -> None:
        if not self.storage_file.exists():
            self.platform_ranges = self._default_platform_ranges()
            self._save()
            return
        try:
            payload = json.loads(self.storage_file.read_text(encoding="utf-8"))
            self.uploads = [UploadStatus.model_validate(item) for item in payload.get("uploads", [])]
            self.sessions = [SessionRecord.model_validate(item) for item in payload.get("sessions", [])]
            self.extractions = [ExtractionResult.model_validate(item) for item in payload.get("extractions", [])]
            self.packages = [RequestPackage.model_validate(item) for item in payload.get("packages", [])]
            self.audit_logs = [AuditLogEntry.model_validate(item) for item in payload.get("audit_logs", [])]
            ranges = payload.get("platform_ranges") or []
            self.platform_ranges = [PlatformRange.model_validate(item) for item in ranges] if ranges else self._default_platform_ranges()
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise EvidenceStoreError(f"Evidence store is unreadable: {exc}") from exc

    def _save(self) -> None:
        payload = {
            "version": STORE_VERSION,
            "saved_at": now_ist().isoformat(),
            "uploads": [item.model_dump(mode="json") for item in self.uploads],
            "sessions": [item.model_dump(mode="json") for item in self.sessions],
            "extractions": [item.model_dump(mode="json") for item in self.extractions],
            "packages": [item.model_dump(mode="json") for item in self.packages],
            "audit_logs": [item.model_dump(mode="json") for item in self.audit_logs],
            "platform_ranges": [item.model_dump(mode="json") for item in self.platform_ranges],
        }
        tmp_path = self.storage_file.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp_path.replace(self.storage_file)

    def _default_platform_ranges(self) -> list[PlatformRange]:
        ranges: list[PlatformRange] = []
        counter = 1
        verified_at = now_ist() - timedelta(days=7)
        for platform, cidrs in PLATFORM_RELAYS.items():
            for cidr in cidrs:
                ranges.append(
                    PlatformRange(
                        id=f"RNG-{counter:03d}",
                        platform=platform,
                        cidr=cidr,
                        asn="relay",
                        description=f"Known {platform} infrastructure range",
                        active=True,
                        last_verified=verified_at,
                    )
                )
                counter += 1
        return ranges

    def dashboard_stats(self) -> DashboardStats:
        with self._lock:
            confidences = [session.confidence for session in self.sessions]
            return DashboardStats(
                uploads=len(self.uploads),
                sessions=len(self.sessions),
                actionable=sum(1 for session in self.sessions if session.classification == "p2p"),
                relay=sum(1 for session in self.sessions if session.classification == "relay"),
                unknown=sum(1 for session in self.sessions if session.classification == "unknown"),
                quarantined_rows=sum(upload.rows_quarantined for upload in self.uploads),
                avg_confidence=round(sum(confidences) / len(confidences), 2) if confidences else 0,
                latest_upload=max(self.uploads, key=lambda item: item.created_at) if self.uploads else None,
            )

    def list_uploads(self) -> list[UploadStatus]:
        with self._lock:
            return sorted(self.uploads, key=lambda item: item.created_at, reverse=True)

    def get_upload(self, upload_id: str) -> UploadStatus | None:
        with self._lock:
            return next((upload for upload in self.uploads if upload.id == upload_id), None)

    def get_upload_quarantine(self, upload_id: str) -> list[QuarantineRecord] | None:
        upload = self.get_upload(upload_id)
        return None if upload is None else upload.quarantine_errors

    def ingest_upload(self, filename: str, content: bytes) -> UploadStatus:
        if not content:
            raise UploadValidationError("Uploaded file is empty")

        safe_filename = self._safe_filename(filename or "ipdr_upload.csv")
        decoded = self._decode_upload(content)
        rows = self._parse_rows(decoded, safe_filename)
        if not rows:
            raise UploadValidationError("No IPDR data rows were found in the uploaded file")

        upload_id = f"UPL-{uuid.uuid4().hex[:8]}"
        stored_path = self.evidence_dir / f"{upload_id}_{safe_filename}"
        stored_path.write_bytes(content)

        sessions: list[SessionRecord] = []
        quarantine: list[QuarantineRecord] = []
        for row_number, row in enumerate(rows, start=1):
            try:
                sessions.append(self._session_from_row(upload_id, safe_filename, row_number, row))
            except RowValidationError as exc:
                quarantine.append(QuarantineRecord(row_number=row_number, field=exc.field, reason=exc.reason))
            except (TypeError, ValueError) as exc:
                quarantine.append(QuarantineRecord(row_number=row_number, reason=str(exc)))

        status = "completed" if sessions else "failed"
        upload = UploadStatus(
            id=upload_id,
            filename=safe_filename,
            status=status,
            rows_total=len(rows),
            rows_valid=len(sessions),
            rows_quarantined=len(quarantine),
            progress=100,
            created_at=now_ist(),
            completed_at=now_ist(),
            message=self._upload_message(len(sessions), len(quarantine)),
            quarantine_errors=quarantine[:100],
        )

        with self._lock:
            self.sessions.extend(sessions)
            self.uploads.append(upload)
            self._audit_unlocked(
                "upload",
                "upload",
                upload.id,
                {
                    "filename": safe_filename,
                    "stored_path": str(stored_path),
                    "valid_rows": len(sessions),
                    "quarantined_rows": len(quarantine),
                },
            )
            self._save()
        return upload

    def _upload_message(self, valid: int, quarantined: int) -> str:
        if valid and quarantined:
            return f"Ingested {valid} rows; quarantined {quarantined} rows requiring review"
        if valid:
            return f"Ingested {valid} rows"
        return f"No valid rows ingested; quarantined {quarantined} rows"

    def _decode_upload(self, content: bytes) -> str:
        for encoding in ("utf-8-sig", "utf-8", "cp1252"):
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
        raise UploadValidationError("File encoding is not supported; expected UTF-8 or Windows-1252 text")

    def _parse_rows(self, decoded: str, filename: str) -> list[dict[str, Any]]:
        stripped = decoded.strip()
        if not stripped:
            raise UploadValidationError("Uploaded file contains no readable text")
        if filename.lower().endswith(".json") or stripped[0] in "[{":
            return self._parse_json_rows(stripped)
        sample = stripped[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",|\t;")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(io.StringIO(stripped), dialect=dialect)
        if not reader.fieldnames:
            raise UploadValidationError("Delimited file is missing a header row")
        self._validate_headers(reader.fieldnames)
        return [dict(row) for row in reader if any(value for value in row.values() if value is not None)]

    def _parse_json_rows(self, stripped: str) -> list[dict[str, Any]]:
        try:
            payload = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise UploadValidationError(f"Invalid JSON upload: {exc.msg}") from exc
        if isinstance(payload, dict):
            for key in ("records", "rows", "sessions", "data"):
                if isinstance(payload.get(key), list):
                    payload = payload[key]
                    break
        if not isinstance(payload, list):
            raise UploadValidationError("JSON upload must be a list of records or an object containing records/rows/sessions")
        rows = []
        for index, item in enumerate(payload, start=1):
            if not isinstance(item, dict):
                raise UploadValidationError(f"JSON record {index} is not an object")
            rows.append(item)
        if rows:
            self._validate_headers(rows[0].keys())
        return rows

    def _validate_headers(self, headers: Any) -> None:
        normalized = {self._normalize_key(str(header)) for header in headers if header is not None}
        required = ("msisdn", "destination_ip", "destination_port")
        for canonical in required:
            accepted = set(COLUMN_ALIASES[canonical])
            if not normalized.intersection(accepted):
                aliases = ", ".join(COLUMN_ALIASES[canonical])
                raise UploadValidationError(f"Missing required column for {canonical}. Accepted aliases: {aliases}")

    def _session_from_row(self, upload_id: str, filename: str, row_number: int, row: dict[str, Any]) -> SessionRecord:
        normalized = {self._normalize_key(str(key)): self._clean_value(value) for key, value in row.items() if key is not None}
        msisdn = self._parse_msisdn(self._first(normalized, "msisdn"), "msisdn")
        destination_ip = self._parse_ip(self._first(normalized, "destination_ip"))
        destination_port = self._parse_int(self._first(normalized, "destination_port"), "destination_port", minimum=1, maximum=65535)
        duration = self._parse_int(self._optional(normalized, "duration_seconds") or "0", "duration_seconds", minimum=0)
        bytes_up = self._parse_int(self._optional(normalized, "bytes_up") or "0", "bytes_up", minimum=0)
        bytes_down = self._parse_int(self._optional(normalized, "bytes_down") or "0", "bytes_down", minimum=0)
        protocol = self._parse_protocol(self._optional(normalized, "protocol") or "UDP")
        started_at = self._parse_timestamp(self._optional(normalized, "started_at"), row_number)
        result = classify_ip(destination_ip, destination_port, bytes_down)
        return SessionRecord(
            id=f"SES-{uuid.uuid4().hex[:8]}",
            upload_id=upload_id,
            a_party_msisdn=msisdn,
            destination_ip=destination_ip,
            destination_port=destination_port,
            protocol=protocol,
            started_at=started_at,
            duration_seconds=duration,
            bytes_up=bytes_up,
            bytes_down=bytes_down,
            app_hint=result.app_hint,
            operator=result.operator,
            asn=result.asn,
            classification=result.classification,
            confidence=result.confidence,
            source_file=filename,
            row_number=row_number,
        )

    def _normalize_key(self, key: str) -> str:
        return re.sub(r"[^a-z0-9]+", "_", key.strip().lower()).strip("_")

    def _clean_value(self, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    def _first(self, row: dict[str, str], canonical: str) -> str:
        value = self._optional(row, canonical)
        if value is None:
            aliases = ", ".join(COLUMN_ALIASES[canonical])
            raise RowValidationError(canonical, f"Missing required value. Accepted columns: {aliases}")
        return value

    def _optional(self, row: dict[str, str], canonical: str) -> str | None:
        for key in COLUMN_ALIASES[canonical]:
            value = row.get(key)
            if value not in (None, ""):
                return value
        return None

    def _parse_msisdn(self, value: str, field: str) -> str:
        digits = re.sub(r"\D", "", value)
        if len(digits) < 4 or len(digits) > 15:
            raise RowValidationError(field, "MSISDN must contain 4 to 15 digits")
        return digits

    def _parse_ip(self, value: str) -> str:
        try:
            return str(ipaddress.ip_address(value))
        except ValueError as exc:
            raise RowValidationError("destination_ip", f"Invalid destination IP: {value}") from exc

    def _parse_int(self, value: str, field: str, minimum: int = 0, maximum: int | None = None) -> int:
        try:
            parsed = int(float(value.replace(",", "")))
        except ValueError as exc:
            raise RowValidationError(field, f"{field} must be numeric") from exc
        if parsed < minimum:
            raise RowValidationError(field, f"{field} must be at least {minimum}")
        if maximum is not None and parsed > maximum:
            raise RowValidationError(field, f"{field} must be at most {maximum}")
        return parsed

    def _parse_protocol(self, value: str) -> str:
        cleaned = value.strip().upper()
        if not cleaned:
            return "UDP"
        if not re.fullmatch(r"[A-Z0-9_./-]{1,16}", cleaned):
            raise RowValidationError("protocol", "Protocol contains unsupported characters")
        return cleaned

    def _parse_timestamp(self, value: str | None, row_number: int) -> datetime:
        if not value:
            return now_ist() - timedelta(minutes=5 + row_number)
        candidate = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%Y/%m/%d %H:%M:%S"):
                try:
                    parsed = datetime.strptime(value, fmt)
                    break
                except ValueError:
                    parsed = None
            if parsed is None:
                raise RowValidationError("started_at", f"Unsupported timestamp format: {value}")
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=IST)
        return parsed.astimezone(IST)

    def _safe_filename(self, filename: str) -> str:
        name = Path(filename).name.strip() or "ipdr_upload.csv"
        safe = re.sub(r"[^A-Za-z0-9._-]+", "_", name)
        return safe[:120] or "ipdr_upload.csv"

    def list_sessions(
        self,
        q: str | None = None,
        msisdn: str | None = None,
        classification: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[SessionRecord]:
        with self._lock:
            sessions = list(self.sessions)
        if msisdn:
            needle_msisdn = re.sub(r"\D", "", msisdn)
            sessions = [session for session in sessions if needle_msisdn in session.a_party_msisdn]
        if classification:
            sessions = [session for session in sessions if session.classification == classification]
        if q:
            needle = q.lower()
            sessions = [
                session
                for session in sessions
                if needle in session.a_party_msisdn.lower()
                or needle in session.destination_ip.lower()
                or needle in session.operator.lower()
                or needle in session.source_file.lower()
            ]
        bounded_limit = max(1, min(limit, 10_000))
        bounded_offset = max(0, offset)
        return sorted(sessions, key=lambda item: item.started_at, reverse=True)[bounded_offset : bounded_offset + bounded_limit]

    def get_session(self, session_id: str) -> SessionRecord | None:
        with self._lock:
            return next((session for session in self.sessions if session.id == session_id), None)

    def create_extraction(self, request: ExtractionRequest) -> ExtractionResult:
        normalized_msisdn = self._parse_msisdn(request.msisdn, "msisdn")
        sessions = self.list_sessions(msisdn=normalized_msisdn, limit=10_000)
        candidates = [
            ExtractionCandidate(
                session_id=session.id,
                destination_ip=session.destination_ip,
                destination_port=session.destination_port,
                target_operator=session.operator,
                asn=session.asn,
                classification=session.classification,
                confidence=session.confidence,
                evidence=f"{session.source_file} row {session.row_number}; {session.app_hint}",
            )
            for session in sessions
            if session.confidence >= request.min_confidence
        ]
        extraction = ExtractionResult(
            id=f"EXT-{uuid.uuid4().hex[:8]}",
            requested_msisdn=normalized_msisdn,
            depth=request.depth,
            total_sessions=len(sessions),
            actionable_count=sum(1 for item in candidates if item.classification == "p2p"),
            relay_count=sum(1 for item in candidates if item.classification == "relay"),
            candidates=candidates,
            created_at=now_ist(),
        )
        with self._lock:
            self.extractions.append(extraction)
            self._audit_unlocked("extract", "extraction", extraction.id, {"msisdn": normalized_msisdn, "candidates": len(candidates)})
            for candidate in candidates:
                if candidate.classification == "p2p":
                    self._create_package_unlocked(extraction, candidate)
            self._save()
        return extraction

    def _create_package_unlocked(self, extraction: ExtractionResult, candidate: ExtractionCandidate) -> None:
        session = next((item for item in self.sessions if item.id == candidate.session_id), None)
        if session is None:
            return
        package = RequestPackage(
            id=f"PKG-{uuid.uuid4().hex[:8]}",
            extraction_id=extraction.id,
            session_id=session.id,
            request_type="Subscriber identity request for B-party public IP endpoint",
            target_operator=session.operator,
            payload={
                "requesting_unit": "Cyber investigation unit",
                "a_party_msisdn": extraction.requested_msisdn,
                "destination_ip": session.destination_ip,
                "destination_port": session.destination_port,
                "protocol": session.protocol,
                "timestamp_ist": session.started_at.isoformat(),
                "duration_seconds": session.duration_seconds,
                "classification": session.classification,
                "confidence": session.confidence,
                "evidence_chain": {
                    "source_file": session.source_file,
                    "row_number": session.row_number,
                    "extraction_id": extraction.id,
                    "session_id": session.id,
                    "upload_id": session.upload_id,
                },
            },
            created_at=now_ist(),
        )
        self.packages.append(package)
        self._audit_unlocked("package_created", "package", package.id, {"session_id": session.id})

    def list_extractions(self) -> list[ExtractionResult]:
        with self._lock:
            return sorted(self.extractions, key=lambda item: item.created_at, reverse=True)

    def get_extraction(self, extraction_id: str) -> ExtractionResult | None:
        with self._lock:
            return next((extraction for extraction in self.extractions if extraction.id == extraction_id), None)

    def list_packages(self) -> list[RequestPackage]:
        with self._lock:
            return sorted(self.packages, key=lambda item: item.created_at, reverse=True)

    def list_audit_logs(self, limit: int = 100) -> list[AuditLogEntry]:
        with self._lock:
            return sorted(self.audit_logs, key=lambda item: item.timestamp, reverse=True)[: max(1, min(limit, 1000))]

    def list_platform_ranges(self) -> list[PlatformRange]:
        with self._lock:
            return list(self.platform_ranges)

    def add_platform_range(self, range_item: PlatformRange) -> PlatformRange:
        try:
            ipaddress.ip_network(range_item.cidr)
        except ValueError as exc:
            raise UploadValidationError(f"Invalid CIDR range: {range_item.cidr}") from exc
        with self._lock:
            self.platform_ranges.append(range_item)
            self._audit_unlocked("platform_range_added", "platform_range", range_item.id, {"cidr": range_item.cidr})
            self._save()
        return range_item

    def search(self, q: str, limit: int = 20) -> list[SearchResult]:
        needle = q.strip().lower()
        if not needle:
            return []
        results: list[SearchResult] = []
        with self._lock:
            sessions = list(self.sessions)
            uploads = list(self.uploads)
            packages = list(self.packages)
        for session in sessions:
            if needle in session.a_party_msisdn.lower() or needle in session.destination_ip.lower() or needle in session.operator.lower():
                results.append(
                    SearchResult(
                        type="session",
                        id=session.id,
                        title=f"{session.a_party_msisdn} -> {session.destination_ip}",
                        subtitle=f"{session.classification.upper()} | {session.operator}",
                        metadata={"confidence": session.confidence},
                    )
                )
        for upload in uploads:
            if needle in upload.filename.lower():
                results.append(SearchResult(type="upload", id=upload.id, title=upload.filename, subtitle=f"{upload.rows_valid} valid rows"))
        for package in packages:
            payload = package.payload
            if needle in str(payload).lower():
                results.append(
                    SearchResult(
                        type="package",
                        id=package.id,
                        title=f"{package.request_type} to {package.target_operator}",
                        subtitle=f"Session {package.session_id}",
                    )
                )
        return results[: max(1, min(limit, 100))]

    def _audit_unlocked(self, action: str, entity_type: str, entity_id: str, details: dict[str, Any]) -> None:
        self.audit_logs.append(
            AuditLogEntry(
                id=f"AUD-{uuid.uuid4().hex[:8]}",
                timestamp=now_ist(),
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                user="system",
                details=details,
            )
        )


store = EvidenceStore()