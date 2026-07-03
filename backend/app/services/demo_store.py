from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from app.schemas.core import (
    AuditLogEntry,
    DashboardStats,
    ExtractionCandidate,
    ExtractionRequest,
    ExtractionResult,
    PlatformRange,
    RequestPackage,
    SearchResult,
    SessionRecord,
    UploadStatus,
)
from app.services.classifier import PLATFORM_RELAYS, classify_ip

IST = timezone(timedelta(hours=5, minutes=30))


def now_ist() -> datetime:
    return datetime.now(tz=IST)


class DemoStore:
    def __init__(self) -> None:
        self.uploads: list[UploadStatus] = []
        self.sessions: list[SessionRecord] = []
        self.extractions: list[ExtractionResult] = []
        self.packages: list[RequestPackage] = []
        self.audit_logs: list[AuditLogEntry] = []
        self.platform_ranges: list[PlatformRange] = []
        self._seed()

    def _seed(self) -> None:
        upload = UploadStatus(
            id="UPL-demo",
            filename="synthetic_ipdr_demo.csv",
            status="completed",
            rows_total=8,
            rows_valid=8,
            rows_quarantined=0,
            progress=100,
            created_at=now_ist() - timedelta(hours=4),
            completed_at=now_ist() - timedelta(hours=4, minutes=-2),
            message="Demo dataset loaded",
        )
        self.uploads.append(upload)
        seed_rows = [
            ("919876543210", "49.36.128.45", 45892, 342, 182044, 880122, "UDP"),
            ("919876543210", "157.240.16.35", 443, 88, 12044, 42120, "TCP"),
            ("919876543210", "106.205.44.12", 52212, 141, 55890, 300110, "UDP"),
            ("919845001122", "49.37.88.91", 48771, 204, 77542, 522902, "UDP"),
            ("919845001122", "149.154.167.50", 443, 55, 9442, 38490, "TCP"),
            ("919700441188", "117.215.9.22", 49001, 419, 210770, 1044412, "UDP"),
            ("919700441188", "74.125.24.95", 3478, 33, 7021, 16902, "UDP"),
            ("919812345678", "27.59.88.14", 50144, 228, 99021, 401205, "UDP"),
        ]
        for idx, row in enumerate(seed_rows, start=1):
            self.sessions.append(self._session_from_values(upload.id, upload.filename, idx, *row))
        self._seed_platform_ranges()
        self._audit("seed", "upload", upload.id, {"rows": upload.rows_total})

    def _seed_platform_ranges(self) -> None:
        counter = 1
        for platform, cidrs in PLATFORM_RELAYS.items():
            for cidr in cidrs:
                self.platform_ranges.append(
                    PlatformRange(
                        id=f"RNG-{counter:03d}",
                        platform=platform,
                        cidr=cidr,
                        asn="relay",
                        description=f"Known {platform} infrastructure range",
                        active=True,
                        last_verified=now_ist() - timedelta(days=7),
                    )
                )
                counter += 1

    def _session_from_values(
        self,
        upload_id: str,
        filename: str,
        row_number: int,
        msisdn: str,
        destination_ip: str,
        destination_port: int,
        duration_seconds: int,
        bytes_up: int,
        bytes_down: int,
        protocol: str,
    ) -> SessionRecord:
        result = classify_ip(destination_ip, destination_port, bytes_down)
        return SessionRecord(
            id=f"SES-{uuid.uuid4().hex[:8]}",
            upload_id=upload_id,
            a_party_msisdn=msisdn,
            destination_ip=destination_ip,
            destination_port=destination_port,
            protocol=protocol.upper(),
            started_at=now_ist() - timedelta(minutes=10 + row_number * 7),
            duration_seconds=duration_seconds,
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

    def dashboard_stats(self) -> DashboardStats:
        confidences = [session.confidence for session in self.sessions]
        return DashboardStats(
            uploads=len(self.uploads),
            sessions=len(self.sessions),
            actionable=sum(1 for session in self.sessions if session.classification == "p2p"),
            relay=sum(1 for session in self.sessions if session.classification == "relay"),
            unknown=sum(1 for session in self.sessions if session.classification == "unknown"),
            quarantined_rows=sum(upload.rows_quarantined for upload in self.uploads),
            avg_confidence=round(sum(confidences) / len(confidences), 2) if confidences else 0,
            latest_upload=self.uploads[-1] if self.uploads else None,
        )

    def list_uploads(self) -> list[UploadStatus]:
        return sorted(self.uploads, key=lambda item: item.created_at, reverse=True)

    def get_upload(self, upload_id: str) -> UploadStatus | None:
        return next((upload for upload in self.uploads if upload.id == upload_id), None)

    def ingest_upload(self, filename: str, content: bytes) -> UploadStatus:
        upload_id = f"UPL-{uuid.uuid4().hex[:8]}"
        decoded = content.decode("utf-8-sig", errors="replace")
        rows = self._parse_rows(decoded)
        valid = 0
        quarantined = 0
        for row_number, row in enumerate(rows, start=1):
            try:
                session = self._session_from_row(upload_id, filename, row_number, row)
            except (KeyError, TypeError, ValueError):
                quarantined += 1
                continue
            self.sessions.append(session)
            valid += 1

        upload = UploadStatus(
            id=upload_id,
            filename=filename,
            status="completed" if valid else "failed",
            rows_total=len(rows),
            rows_valid=valid,
            rows_quarantined=quarantined,
            progress=100,
            created_at=now_ist(),
            completed_at=now_ist(),
            message=f"Ingested {valid} rows; quarantined {quarantined}",
        )
        self.uploads.append(upload)
        self._audit("upload", "upload", upload.id, {"filename": filename, "valid_rows": valid, "quarantined": quarantined})
        return upload

    def _parse_rows(self, decoded: str) -> list[dict[str, str]]:
        sample = decoded[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",|\t;")
        except csv.Error:
            dialect = csv.excel
        reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
        return [dict(row) for row in reader if any(row.values())]

    def _session_from_row(self, upload_id: str, filename: str, row_number: int, row: dict[str, str]) -> SessionRecord:
        normalized = {key.strip().lower().replace(" ", "_"): (value or "").strip() for key, value in row.items()}
        msisdn = self._first(normalized, "msisdn", "a_party_msisdn", "a_number", "subscriber", "calling_number")
        destination_ip = self._first(normalized, "destination_ip", "dest_ip", "server_ip", "b_party_ip", "remote_ip")
        destination_port = int(self._first(normalized, "destination_port", "dest_port", "server_port", "remote_port") or 0)
        duration = int(float(self._first(normalized, "duration_seconds", "duration", "session_duration") or 0))
        bytes_up = int(float(self._first(normalized, "bytes_up", "uplink_bytes", "upload_bytes", "tx_bytes") or 0))
        bytes_down = int(float(self._first(normalized, "bytes_down", "downlink_bytes", "download_bytes", "rx_bytes") or 0))
        protocol = self._first(normalized, "protocol", "ip_protocol") or "UDP"
        return self._session_from_values(
            upload_id,
            filename,
            row_number,
            msisdn,
            destination_ip,
            destination_port,
            duration,
            bytes_up,
            bytes_down,
            protocol,
        )

    def _first(self, row: dict[str, str], *keys: str) -> str:
        for key in keys:
            if row.get(key):
                return row[key]
        raise KeyError(keys[0])

    def list_sessions(
        self,
        q: str | None = None,
        msisdn: str | None = None,
        classification: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[SessionRecord]:
        sessions = self.sessions
        if msisdn:
            sessions = [session for session in sessions if msisdn in session.a_party_msisdn]
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
        return sorted(sessions, key=lambda item: item.started_at, reverse=True)[offset : offset + limit]

    def get_session(self, session_id: str) -> SessionRecord | None:
        return next((session for session in self.sessions if session.id == session_id), None)

    def create_extraction(self, request: ExtractionRequest) -> ExtractionResult:
        sessions = self.list_sessions(msisdn=request.msisdn, limit=10_000)
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
            requested_msisdn=request.msisdn,
            depth=request.depth,
            total_sessions=len(sessions),
            actionable_count=sum(1 for item in candidates if item.classification == "p2p"),
            relay_count=sum(1 for item in candidates if item.classification == "relay"),
            candidates=candidates,
            created_at=now_ist(),
        )
        self.extractions.append(extraction)
        self._audit("extract", "extraction", extraction.id, {"msisdn": request.msisdn, "candidates": len(candidates)})
        for candidate in candidates:
            if candidate.classification == "p2p":
                self._create_package(extraction, candidate)
        return extraction

    def _create_package(self, extraction: ExtractionResult, candidate: ExtractionCandidate) -> None:
        session = self.get_session(candidate.session_id)
        if session is None:
            return
        package = RequestPackage(
            id=f"PKG-{uuid.uuid4().hex[:8]}",
            extraction_id=extraction.id,
            session_id=session.id,
            request_type="Section 91/92 CrPC subscriber identity request",
            target_operator=session.operator,
            payload={
                "requesting_unit": "Gwalior Police Cyber Cell",
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
                },
            },
            created_at=now_ist(),
        )
        self.packages.append(package)
        self._audit("package_created", "package", package.id, {"session_id": session.id})

    def list_extractions(self) -> list[ExtractionResult]:
        return sorted(self.extractions, key=lambda item: item.created_at, reverse=True)

    def get_extraction(self, extraction_id: str) -> ExtractionResult | None:
        return next((extraction for extraction in self.extractions if extraction.id == extraction_id), None)

    def list_packages(self) -> list[RequestPackage]:
        return sorted(self.packages, key=lambda item: item.created_at, reverse=True)

    def list_audit_logs(self, limit: int = 100) -> list[AuditLogEntry]:
        return sorted(self.audit_logs, key=lambda item: item.timestamp, reverse=True)[:limit]

    def list_platform_ranges(self) -> list[PlatformRange]:
        return self.platform_ranges

    def add_platform_range(self, range_item: PlatformRange) -> PlatformRange:
        self.platform_ranges.append(range_item)
        self._audit("platform_range_added", "platform_range", range_item.id, {"cidr": range_item.cidr})
        return range_item

    def search(self, q: str, limit: int = 20) -> list[SearchResult]:
        needle = q.lower()
        results: list[SearchResult] = []
        for session in self.sessions:
            if needle in session.a_party_msisdn.lower() or needle in session.destination_ip.lower():
                results.append(
                    SearchResult(
                        type="session",
                        id=session.id,
                        title=f"{session.a_party_msisdn} -> {session.destination_ip}",
                        subtitle=f"{session.classification.upper()} | {session.operator}",
                        metadata={"confidence": session.confidence},
                    )
                )
        for upload in self.uploads:
            if needle in upload.filename.lower():
                results.append(
                    SearchResult(
                        type="upload",
                        id=upload.id,
                        title=upload.filename,
                        subtitle=f"{upload.rows_valid} valid rows",
                    )
                )
        for package in self.packages:
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
        return results[:limit]

    def _audit(self, action: str, entity_type: str, entity_id: str, details: dict[str, Any]) -> None:
        self.audit_logs.append(
            AuditLogEntry(
                id=f"AUD-{uuid.uuid4().hex[:8]}",
                timestamp=now_ist(),
                action=action,
                entity_type=entity_type,
                entity_id=entity_id,
                user="demo.operator",
                details=details,
            )
        )


store = DemoStore()

