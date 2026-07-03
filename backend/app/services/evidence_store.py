from __future__ import annotations

import ipaddress
import json
import re
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from app.config import get_settings
from app.schemas.core import (
    AuditLogEntry,
    CommunicationGraph,
    DashboardStats,
    ExtractionCandidate,
    ExtractionRequest,
    ExtractionResult,
    GraphEdge,
    GraphMetrics,
    GraphNode,
    PlatformRange,
    QuarantineRecord,
    RequestPackage,
    SearchResult,
    SessionRecord,
    SuspiciousPattern,
    UploadStatus,
)
from app.services.classifier import PLATFORM_RELAYS, classify_ip
from app.services.ingestion import IngestionError, parse_ipdr_upload

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
        "mdn",
        "landline_msisdn_mdn_leased_circuit_id",
        "landline_msisdn_mdn_leased_circuit_id_for_internet_access",
        "access_identifier",
    ),
    "subscriber_name": ("subscriber_name", "customer_name", "name_of_person_organization", "name_of_person_or_organization", "name"),
    "subscriber_address": ("subscriber_address", "customer_address", "address"),
    "contact_number": ("contact_number", "contact_no", "contact"),
    "alternate_contact_number": ("alternate_contact_number", "alternate_contact_no", "alternate_contact"),
    "email": ("email", "email_address", "e_mail_address"),
    "access_identifier": ("access_identifier", "landline_msisdn_mdn_leased_circuit_id", "leased_circuit_id", "circuit_id", "mdn"),
    "user_id": ("user_id", "user_id_for_internet_access", "internet_user_id", "authentication_user_id"),
    "source_ip": (
        "source_ip",
        "source_ip_address",
        "src_ip",
        "src_address",
        "private_ip",
        "subscriber_ip",
        "user_ip",
        "allocated_ip",
        "allocated_ip_address",
        "ip_address_allocated",
        "assigned_ip",
        "source_endpoint",
        "source_ip_port",
        "source_ip_address_with_source_port",
    ),
    "source_port": (
        "source_port",
        "source_port_no",
        "source_port_number",
        "src_port",
        "private_port",
        "subscriber_port",
        "user_port",
        "source_endpoint",
        "source_ip_port",
        "source_ip_address_with_source_port",
    ),
    "translated_ip": (
        "translated_ip",
        "translated_ip_address",
        "translated_public_ip",
        "public_ip",
        "public_ip_address",
        "nat_ip",
        "nat_public_ip",
        "mapped_ip",
        "mapped_public_ip",
        "translated_endpoint",
        "nat_endpoint",
    ),
    "translated_port": (
        "translated_port",
        "translated_port_no",
        "translated_port_number",
        "public_port",
        "nat_port",
        "mapped_port",
        "translated_endpoint",
        "nat_endpoint",
    ),
    "destination_ip": (
        "destination_ip",
        "destination_ip_address",
        "dest_ip",
        "dst_ip",
        "dst_addr",
        "server_ip",
        "b_party_ip",
        "b_party_public_ip",
        "remote_ip",
        "remote_address",
        "peer_ip",
        "destination_endpoint",
        "destination_ip_port",
        "destination_ip_with_destination_port",
    ),
    "destination_port": (
        "destination_port",
        "destination_port_no",
        "destination_port_number",
        "dest_port",
        "dst_port",
        "server_port",
        "b_party_port",
        "remote_port",
        "peer_port",
        "destination_endpoint",
        "destination_ip_port",
        "destination_ip_with_destination_port",
    ),
    "ip_allocation": ("ip_allocation", "static_dynamic_ip_address_allocation", "allocation_type", "ip_address_allocation"),
    "duration_seconds": ("duration_seconds", "duration", "session_duration", "duration_sec", "duration_s"),
    "bytes_up": ("bytes_up", "uplink_bytes", "upload_bytes", "tx_bytes", "bytes_sent", "sent_bytes"),
    "bytes_down": ("bytes_down", "downlink_bytes", "download_bytes", "rx_bytes", "bytes_received", "received_bytes"),
    "protocol": ("protocol", "ip_protocol", "proto"),
    "started_at": ("started_at", "start_datetime", "start_date_time", "timestamp", "session_start", "date_time", "datetime"),
    "start_date": ("start_date", "ist_start_date", "start_date_of_ip_address_allocation"),
    "start_time": ("start_time", "ist_start_time", "start_time_of_ip_address_allocation"),
    "ended_at": ("ended_at", "end_datetime", "end_date_time", "session_end"),
    "end_date": ("end_date", "ist_end_date", "end_date_of_ip_address_allocation"),
    "end_time": ("end_time", "ist_end_time", "end_time_of_ip_address_allocation"),
    "source_mac": ("source_mac", "source_mac_address", "mac_address", "customer_device_mac"),
    "imei": ("imei", "imei_number"),
    "device_id": ("device_id", "device_identification_number", "other_device_identification_number"),
    "tmsi": ("tmsi",),
    "imsi": ("imsi",),
    "sim_type": ("sim_type", "type_of_sim"),
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
        try:
            parsed_upload = parse_ipdr_upload(safe_filename, content)
        except IngestionError as exc:
            raise UploadValidationError(str(exc)) from exc
        if parsed_upload.report.missing_required:
            missing = ", ".join(parsed_upload.report.missing_required)
            raise UploadValidationError(f"Missing required column(s): {missing}")
        rows = parsed_upload.rows
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
            format_report=parsed_upload.report,
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
                    "parser_engine": parsed_upload.report.parser_engine,
                    "adapter": parsed_upload.report.adapter,
                    "file_format": parsed_upload.report.file_format,
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

    def _session_from_row(self, upload_id: str, filename: str, row_number: int, row: dict[str, Any]) -> SessionRecord:
        normalized = {self._normalize_key(str(key)): self._clean_value(value) for key, value in row.items() if key is not None}
        msisdn = self._parse_msisdn(self._first(normalized, "msisdn"), "msisdn")
        source_ip, source_port = self._parse_endpoint(normalized, "source_ip", "source_port", "source")
        destination_ip, destination_port = self._parse_endpoint(normalized, "destination_ip", "destination_port", "destination")
        translated_ip, translated_port = self._parse_optional_endpoint(normalized, "translated_ip", "translated_port", "translated")
        duration = self._parse_int(self._optional(normalized, "duration_seconds") or "0", "duration_seconds", minimum=0)
        bytes_up = self._parse_int(self._optional(normalized, "bytes_up") or "0", "bytes_up", minimum=0)
        bytes_down = self._parse_int(self._optional(normalized, "bytes_down") or "0", "bytes_down", minimum=0)
        protocol = self._parse_protocol(self._optional(normalized, "protocol") or "UDP")
        started_at = self._timestamp_from_row(normalized, "started", row_number, required=True)
        ended_at = self._timestamp_from_row(normalized, "ended", row_number, required=False)
        if duration == 0 and ended_at is not None and ended_at >= started_at:
            duration = int((ended_at - started_at).total_seconds())
        result = classify_ip(destination_ip, destination_port, bytes_down)
        record_type = "ipdr_nat" if translated_ip or translated_port else "ipdr"
        return SessionRecord(
            id=f"SES-{uuid.uuid4().hex[:8]}",
            upload_id=upload_id,
            a_party_msisdn=msisdn,
            subscriber_name=self._optional(normalized, "subscriber_name"),
            subscriber_address=self._optional(normalized, "subscriber_address"),
            contact_number=self._optional(normalized, "contact_number"),
            alternate_contact_number=self._optional(normalized, "alternate_contact_number"),
            email=self._optional(normalized, "email"),
            access_identifier=self._optional(normalized, "access_identifier"),
            user_id=self._optional(normalized, "user_id"),
            source_ip=source_ip,
            source_port=source_port,
            translated_ip=translated_ip,
            translated_port=translated_port,
            destination_ip=destination_ip,
            destination_port=destination_port,
            ip_allocation=self._optional(normalized, "ip_allocation"),
            protocol=protocol,
            started_at=started_at,
            ended_at=ended_at,
            duration_seconds=duration,
            bytes_up=bytes_up,
            bytes_down=bytes_down,
            source_mac=self._optional(normalized, "source_mac"),
            imei=self._optional(normalized, "imei"),
            device_id=self._optional(normalized, "device_id"),
            tmsi=self._optional(normalized, "tmsi"),
            imsi=self._optional(normalized, "imsi"),
            sim_type=self._optional(normalized, "sim_type"),
            record_type=record_type,
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

    def _parse_endpoint(self, row: dict[str, str], ip_canonical: str, port_canonical: str, field_prefix: str) -> tuple[str, int]:
        ip_value = self._first(row, ip_canonical)
        port_value = self._first(row, port_canonical)
        ip_part, port_part = self._split_endpoint(ip_value)
        if port_part is None:
            _, port_part = self._split_endpoint(port_value)
        return (
            self._parse_ip(ip_part, f"{field_prefix}_ip"),
            self._parse_int(port_part or port_value, f"{field_prefix}_port", minimum=1, maximum=65535),
        )

    def _parse_optional_endpoint(self, row: dict[str, str], ip_canonical: str, port_canonical: str, field_prefix: str) -> tuple[str | None, int | None]:
        ip_value = self._optional(row, ip_canonical)
        port_value = self._optional(row, port_canonical)
        if not ip_value and not port_value:
            return None, None
        if not ip_value or not port_value:
            raise RowValidationError(field_prefix, f"Both {field_prefix}_ip and {field_prefix}_port are required when NAT translation is present")
        ip_part, port_part = self._split_endpoint(ip_value)
        if port_part is None:
            _, port_part = self._split_endpoint(port_value)
        return (
            self._parse_ip(ip_part, f"{field_prefix}_ip"),
            self._parse_int(port_part or port_value, f"{field_prefix}_port", minimum=1, maximum=65535),
        )

    def _split_endpoint(self, value: str) -> tuple[str, str | None]:
        cleaned = value.strip()
        if not cleaned:
            return cleaned, None
        if cleaned.startswith("[") and "]:" in cleaned:
            host, port = cleaned.rsplit(":", 1)
            return host.strip("[]"), port
        if cleaned.count(":") == 1:
            host, port = cleaned.rsplit(":", 1)
            if port.isdigit():
                return host, port
        return cleaned, None

    def _timestamp_from_row(self, row: dict[str, str], prefix: str, row_number: int, required: bool) -> datetime | None:
        canonical = "started_at" if prefix == "started" else "ended_at"
        combined = self._optional(row, canonical)
        if combined:
            return self._parse_timestamp(combined, row_number, required=required, field=canonical)
        date_value = self._optional(row, "start_date" if prefix == "started" else "end_date")
        time_value = self._optional(row, "start_time" if prefix == "started" else "end_time")
        if date_value and time_value:
            return self._parse_timestamp(f"{date_value} {time_value}", row_number, required=required, field=canonical)
        if required:
            return now_ist() - timedelta(minutes=5 + row_number)
        return None

    def _parse_msisdn(self, value: str, field: str) -> str:
        digits = re.sub(r"\D", "", value)
        if len(digits) < 4 or len(digits) > 15:
            raise RowValidationError(field, "MSISDN must contain 4 to 15 digits")
        return digits

    def _parse_ip(self, value: str, field: str) -> str:
        try:
            return str(ipaddress.ip_address(value))
        except ValueError as exc:
            raise RowValidationError(field, f"Invalid {field}: {value}") from exc

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

    def _parse_timestamp(self, value: str | None, row_number: int, required: bool = True, field: str = "started_at") -> datetime | None:
        if not value:
            return now_ist() - timedelta(minutes=5 + row_number) if required else None
        candidate = value.replace("Z", "+00:00")
        try:
            parsed = datetime.fromisoformat(candidate)
        except ValueError:
            parsed = None
            for fmt in (
                "%Y-%m-%d %H:%M:%S",
                "%d-%m-%Y %H:%M:%S",
                "%d/%m/%Y %H:%M:%S",
                "%m/%d/%Y %H:%M:%S",
                "%m:%d:%Y %H:%M:%S",
                "%Y/%m/%d %H:%M:%S",
                "%d.%m.%Y %H:%M:%S",
            ):
                try:
                    parsed = datetime.strptime(value, fmt)
                    break
                except ValueError:
                    continue
            if parsed is None:
                raise RowValidationError(field, f"Unsupported timestamp format: {value}")
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
                or needle in (session.source_ip or "").lower()
                or needle in (session.translated_ip or "").lower()
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
                source_ip=session.source_ip,
                source_port=session.source_port,
                translated_ip=session.translated_ip,
                translated_port=session.translated_port,
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
                "source_ip": session.source_ip,
                "source_port": session.source_port,
                "translated_ip": session.translated_ip,
                "translated_port": session.translated_port,
                "destination_ip": session.destination_ip,
                "destination_port": session.destination_port,
                "protocol": session.protocol,
                "timestamp_ist": session.started_at.isoformat(),
                "end_timestamp_ist": session.ended_at.isoformat() if session.ended_at else None,
                "duration_seconds": session.duration_seconds,
                "ip_allocation": session.ip_allocation,
                "record_type": session.record_type,
                "classification": session.classification,
                "confidence": session.confidence,
                "subscriber_context": {
                    "access_identifier": session.access_identifier,
                    "user_id": session.user_id,
                    "contact_number": session.contact_number,
                    "imei": session.imei,
                    "imsi": session.imsi,
                    "sim_type": session.sim_type,
                },
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

    def communication_graph(
        self,
        msisdn: str | None = None,
        classification: str | None = None,
        limit: int = 5_000,
    ) -> CommunicationGraph:
        normalized_classification = None if classification in (None, "all") else classification
        sessions = self.list_sessions(msisdn=msisdn, classification=normalized_classification, limit=limit)
        nodes: dict[str, dict[str, Any]] = {}
        links: dict[str, dict[str, Any]] = {}

        def add_node(node_id: str, kind: str, label: str, title: str, operator: str, session: SessionRecord) -> None:
            total_bytes = session.bytes_up + session.bytes_down
            existing = nodes.get(node_id)
            if existing is None:
                nodes[node_id] = {
                    "id": node_id,
                    "label": label,
                    "title": title,
                    "kind": kind,
                    "operator": operator,
                    "count": 1,
                    "bytes": total_bytes,
                    "confidence": session.confidence,
                    "last_seen": session.started_at,
                    "sessions": [session],
                }
                return
            existing["count"] += 1
            existing["bytes"] += total_bytes
            existing["confidence"] = max(existing["confidence"], session.confidence)
            existing["last_seen"] = max(existing["last_seen"], session.started_at)
            existing["sessions"].append(session)
            if existing["kind"] != "source":
                existing["kind"] = self._merge_classification(existing["kind"], kind)
            if existing["operator"] != operator:
                existing["operator"] = "Multiple"

        for session in sessions:
            add_node(
                session.a_party_msisdn,
                "source",
                session.a_party_msisdn[-4:],
                session.a_party_msisdn,
                session.operator,
                session,
            )
            add_node(
                session.destination_ip,
                session.classification,
                self._short_ip(session.destination_ip),
                session.destination_ip,
                session.operator,
                session,
            )

            link_id = f"{session.a_party_msisdn}__{session.destination_ip}"
            total_bytes = session.bytes_up + session.bytes_down
            existing_link = links.get(link_id)
            if existing_link is None:
                links[link_id] = {
                    "id": link_id,
                    "source_id": session.a_party_msisdn,
                    "target_id": session.destination_ip,
                    "classification": session.classification,
                    "count": 1,
                    "bytes": total_bytes,
                    "duration_seconds": session.duration_seconds,
                    "confidence": session.confidence,
                    "sessions": [session],
                }
                continue
            existing_link["count"] += 1
            existing_link["bytes"] += total_bytes
            existing_link["duration_seconds"] += session.duration_seconds
            existing_link["confidence"] = max(existing_link["confidence"], session.confidence)
            existing_link["classification"] = self._merge_classification(existing_link["classification"], session.classification)
            existing_link["sessions"].append(session)

        node_models = [GraphNode.model_validate(item) for item in nodes.values()]
        link_models = [GraphEdge.model_validate(item) for item in links.values()]
        seen_times = [session.started_at for session in sessions]
        metrics = GraphMetrics(
            nodes=len(node_models),
            edges=len(link_models),
            sessions=len(sessions),
            p2p=sum(1 for session in sessions if session.classification == "p2p"),
            relay=sum(1 for session in sessions if session.classification == "relay"),
            unknown=sum(1 for session in sessions if session.classification == "unknown"),
            high_confidence=sum(1 for session in sessions if session.confidence >= 0.85),
            first_seen=min(seen_times) if seen_times else None,
            last_seen=max(seen_times) if seen_times else None,
        )
        return CommunicationGraph(nodes=node_models, links=link_models, sessions=sessions, metrics=metrics)

    def suspicious_patterns(self, limit: int = 50) -> list[SuspiciousPattern]:
        with self._lock:
            sessions = list(self.sessions)
            uploads = list(self.uploads)

        patterns: list[SuspiciousPattern] = []
        by_endpoint: dict[str, list[SessionRecord]] = defaultdict(list)
        by_msisdn: dict[str, list[SessionRecord]] = defaultdict(list)
        by_pair: dict[tuple[str, str, int], list[SessionRecord]] = defaultdict(list)

        for session in sessions:
            endpoint = f"{session.destination_ip}:{session.destination_port}"
            by_endpoint[endpoint].append(session)
            by_msisdn[session.a_party_msisdn].append(session)
            by_pair[(session.a_party_msisdn, session.destination_ip, session.destination_port)].append(session)

        for endpoint, items in by_endpoint.items():
            p2p_items = [item for item in items if item.classification == "p2p"]
            msisdns = sorted({item.a_party_msisdn for item in p2p_items})
            if len(msisdns) < 2:
                continue
            score = min(0.99, 0.62 + len(msisdns) * 0.08 + len(p2p_items) * 0.02)
            severity = "high" if len(msisdns) >= 3 or len(p2p_items) >= 5 else "medium"
            patterns.append(
                SuspiciousPattern(
                    id=self._pattern_id("shared_endpoint", endpoint),
                    severity=severity,
                    pattern_type="shared_endpoint",
                    title="Shared B-party endpoint across A-parties",
                    description="Multiple A-party MSISDNs connected to the same high-confidence public endpoint.",
                    entities={"endpoint": endpoint, "msisdns": msisdns},
                    evidence=[f"{item.a_party_msisdn} -> {endpoint} at {item.started_at.isoformat()}" for item in p2p_items[:5]],
                    recommended_action="Review the endpoint in the graph, compare timestamps, and prepare operator request packages for matching high-confidence sessions.",
                    score=round(score, 2),
                )
            )

        for (msisdn, destination_ip, destination_port), items in by_pair.items():
            p2p_items = [item for item in items if item.classification == "p2p"]
            if len(p2p_items) < 2:
                continue
            endpoint = f"{destination_ip}:{destination_port}"
            patterns.append(
                SuspiciousPattern(
                    id=self._pattern_id("repeat_contact", f"{msisdn}:{endpoint}"),
                    severity="medium",
                    pattern_type="repeat_contact",
                    title="Repeated direct B-party contact",
                    description="The same A-party repeatedly contacted one actionable public endpoint.",
                    entities={"msisdn": msisdn, "endpoint": endpoint},
                    evidence=[f"{item.source_file} row {item.row_number} at {item.started_at.isoformat()}" for item in p2p_items[:5]],
                    recommended_action="Use the edge inspector to validate all supporting rows, then run extraction for this A-party if not already done.",
                    score=round(min(0.95, 0.6 + len(p2p_items) * 0.08), 2),
                )
            )

        for msisdn, items in by_msisdn.items():
            if len(items) >= 3:
                relay_count = sum(1 for item in items if item.classification == "relay")
                relay_ratio = relay_count / len(items)
                if relay_ratio >= 0.6:
                    patterns.append(
                        SuspiciousPattern(
                            id=self._pattern_id("relay_heavy", msisdn),
                            severity="medium" if relay_ratio < 0.8 else "high",
                            pattern_type="relay_heavy",
                            title="Relay-heavy communication pattern",
                            description="Most sessions for this A-party resolve to platform relay or noise infrastructure.",
                            entities={"msisdn": msisdn, "relay_ratio": round(relay_ratio, 2)},
                            evidence=[f"{item.destination_ip}:{item.destination_port} {item.classification}" for item in items[:5]],
                            recommended_action="Filter the graph to relay/noise, then isolate remaining P2P or unknown flows for manual review.",
                            score=round(min(0.95, 0.5 + relay_ratio * 0.45), 2),
                        )
                    )

            ordered = sorted(items, key=lambda item: item.started_at)
            for index, first in enumerate(ordered):
                window = [item for item in ordered[index:] if item.started_at - first.started_at <= timedelta(minutes=10)]
                if len(window) >= 3:
                    patterns.append(
                        SuspiciousPattern(
                            id=self._pattern_id("burst_activity", f"{msisdn}:{first.started_at.isoformat()}"),
                            severity="high" if len(window) >= 5 else "medium",
                            pattern_type="burst_activity",
                            title="Short-window burst activity",
                            description="Multiple sessions for one A-party occurred inside a ten-minute window.",
                            entities={"msisdn": msisdn, "window_start": first.started_at.isoformat(), "session_count": len(window)},
                            evidence=[f"{item.destination_ip}:{item.destination_port} at {item.started_at.isoformat()}" for item in window[:5]],
                            recommended_action="Open the communication map for this MSISDN and inspect whether the burst contains direct endpoints or only relay traffic.",
                            score=round(min(0.98, 0.58 + len(window) * 0.07), 2),
                        )
                    )
                    break

        for upload in uploads:
            if upload.rows_quarantined <= 0:
                continue
            ratio = upload.rows_quarantined / max(upload.rows_total, 1)
            patterns.append(
                SuspiciousPattern(
                    id=self._pattern_id("quarantine_rows", upload.id),
                    severity="high" if ratio >= 0.5 else "low",
                    pattern_type="quarantine_rows",
                    title="Evidence rows require quarantine review",
                    description="One uploaded evidence file contains rows that were excluded from normalized investigation data.",
                    entities={"upload_id": upload.id, "filename": upload.filename, "quarantined_rows": upload.rows_quarantined},
                    evidence=[f"Row {item.row_number}: {item.reason}" for item in upload.quarantine_errors[:5]],
                    recommended_action="Review quarantine reasons before relying on completeness of extraction or graph conclusions.",
                    score=round(min(0.9, 0.35 + ratio), 2),
                )
            )

        severity_rank = {"high": 0, "medium": 1, "low": 2}
        patterns.sort(key=lambda item: (severity_rank[item.severity], -item.score, item.title))
        return patterns[: max(1, min(limit, 100))]

    def _pattern_id(self, pattern_type: str, key: str) -> str:
        return f"SIG-{uuid.uuid5(uuid.NAMESPACE_URL, f'pramaan-ipdr:{pattern_type}:{key}').hex[:8]}"

    def _merge_classification(self, current: str, new_value: str) -> str:
        if current == "p2p" or new_value == "p2p":
            return "p2p"
        if current == "relay" or new_value == "relay":
            return "relay"
        return "unknown"

    def _short_ip(self, value: str) -> str:
        parts = value.split(".")
        return f"{parts[2]}.{parts[3]}" if len(parts) == 4 else value

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
            if (
                needle in session.a_party_msisdn.lower()
                or needle in session.destination_ip.lower()
                or needle in (session.source_ip or "").lower()
                or needle in (session.translated_ip or "").lower()
                or needle in session.operator.lower()
            ):
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