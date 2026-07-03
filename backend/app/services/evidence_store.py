from __future__ import annotations

import csv
import html
import io
import ipaddress
import json
import re
import sqlite3
import uuid
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import RLock
from typing import Any

from app.config import get_settings
from app.schemas.core import (
    AdapterValidationReport,
    ApplicationSummary,
    AuditLogEntry,
    CaseCreate,
    CaseRecord,
    CommunicationGraph,
    CommonApplicationReport,
    DashboardStats,
    ExtractionCandidate,
    ExtractionRequest,
    ExtractionResult,
    GraphEdge,
    GraphMetrics,
    GraphNode,
    ImportSpecCreate,
    ImportSpecification,
    IngestionJob,
    ImeiFrequencyReport,
    IpSummaryReport,
    LocationSummaryReport,
    PersistenceStatus,
    PlatformRange,
    PoiSummaryReport,
    QuarantineRecord,
    RequestPackage,
    SearchResult,
    SessionRecord,
    SuspiciousPattern,
    TimelinePoint,
    UploadStatus,
)
from app.services.classifier import classify_ip
from app.services.ingestion import IngestionError, parse_ipdr_upload
from app.services.tac_decoder import TACDecoder
from app.services.cell_decoder import CellDecoder

tac_decoder = TACDecoder()
cell_decoder = CellDecoder()

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
    "domain": ("domain", "domain_name", "host", "hostname", "server_domain", "url_domain", "fqdn"),
    "cell_id": ("cell_id", "cellid", "cell_tower_id", "tower_id", "cgi", "ecgi", "lac_cell_id", "enodeb_cell_id"),
    "tower_name": ("tower_name", "site_name", "cell_site", "mast_name", "location_name"),
    "city": ("city", "district", "location_city"),
    "state": ("state", "telecom_circle", "circle", "location_state"),
    "country": ("country", "country_name"),
    "latitude": ("latitude", "lat", "tower_latitude", "cell_latitude"),
    "longitude": ("longitude", "lon", "lng", "tower_longitude", "cell_longitude"),
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
        self.sqlite_file = self.storage_dir / "evidence_store.sqlite"
        self._lock = RLock()
        self.cases: list[CaseRecord] = []
        self.import_specs: list[ImportSpecification] = []
        self.uploads: list[UploadStatus] = []
        self.jobs: list[IngestionJob] = []
        self.sessions: list[SessionRecord] = []
        self.extractions: list[ExtractionResult] = []
        self.packages: list[RequestPackage] = []
        self.audit_logs: list[AuditLogEntry] = []
        self.platform_ranges: list[PlatformRange] = []
        self.last_persistence_snapshot_at: datetime | None = None
        self._ensure_dirs()
        self._load()

    def _init_db(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        connection = sqlite3.connect(self.sqlite_file)
        try:
            with connection:
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("PRAGMA synchronous=NORMAL")
                connection.execute(
                    "CREATE TABLE IF NOT EXISTS sessions ("
                    "id TEXT PRIMARY KEY, "
                    "upload_id TEXT, "
                    "case_id TEXT, "
                    "a_party_msisdn TEXT, "
                    "source_ip TEXT, "
                    "source_port INTEGER, "
                    "translated_ip TEXT, "
                    "translated_port INTEGER, "
                    "destination_ip TEXT, "
                    "destination_port INTEGER, "
                    "started_at TEXT, "
                    "classification TEXT, "
                    "confidence REAL, "
                    "source_file TEXT, "
                    "row_number INTEGER, "
                    "payload_json TEXT NOT NULL"
                    ")"
                )
                connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_case_id ON sessions (case_id)")
                connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_upload_id ON sessions (upload_id)")
                connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_msisdn ON sessions (a_party_msisdn)")
                connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_dest_ip ON sessions (destination_ip)")
                connection.execute("CREATE INDEX IF NOT EXISTS idx_sessions_classification ON sessions (classification)")
        finally:
            connection.close()

    def _ensure_dirs(self) -> None:
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.evidence_dir.mkdir(parents=True, exist_ok=True)

    def _load(self) -> None:
        self._init_db()
        if not self.storage_file.exists():
            self.cases = self._default_cases()
            self.import_specs = self._default_import_specs()
            self.platform_ranges = self._default_platform_ranges()
            self._save()
            return
        try:
            payload = json.loads(self.storage_file.read_text(encoding="utf-8"))
            self.cases = [CaseRecord.model_validate(item) for item in payload.get("cases", [])] or self._default_cases()
            self.import_specs = [ImportSpecification.model_validate(item) for item in payload.get("import_specs", [])] or self._default_import_specs()
            self.uploads = [UploadStatus.model_validate(item) for item in payload.get("uploads", [])]
            self.jobs = [IngestionJob.model_validate(item) for item in payload.get("jobs", [])]
            snapshot_at = payload.get("last_persistence_snapshot_at")
            self.last_persistence_snapshot_at = datetime.fromisoformat(snapshot_at) if snapshot_at else None
            
            # Keep in-memory sessions empty to save memory
            self.sessions = []
            
            self.extractions = [ExtractionResult.model_validate(item) for item in payload.get("extractions", [])]
            
            # Auto-resolve zombie processing jobs and uploads
            zombies_found = False
            for job in self.jobs:
                if job.status == "processing":
                    job.status = "failed"
                    job.progress = 100
                    job.message = "Job interrupted (server restarted)"
                    job.completed_at = now_ist()
                    zombies_found = True
            for upload in self.uploads:
                if upload.status == "processing":
                    upload.status = "failed"
                    upload.progress = 100
                    upload.message = "Upload interrupted (server restarted)"
                    upload.completed_at = now_ist()
                    zombies_found = True
            if zombies_found:
                # Save changes silently
                payload["jobs"] = [item.model_dump(mode="json") for item in self.jobs]
                payload["uploads"] = [item.model_dump(mode="json") for item in self.uploads]
                tmp_path = self.storage_file.with_suffix(".tmp")
                tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
                tmp_path.replace(self.storage_file)
            self.packages = [RequestPackage.model_validate(item) for item in payload.get("packages", [])]
            self.audit_logs = [AuditLogEntry.model_validate(item) for item in payload.get("audit_logs", [])]
            ranges = payload.get("platform_ranges") or []
            self.platform_ranges = [PlatformRange.model_validate(item) for item in ranges] if ranges else self._default_platform_ranges()
            # Auto-upgrade legacy databases that only have 1 dummy platform range
            if len(self.platform_ranges) <= 1:
                self.platform_ranges = self._default_platform_ranges()
                self._save()
            
            # Migrate sessions from JSON file to SQLite database if any exist
            json_sessions = payload.get("sessions", [])
            if json_sessions:
                print(f"Migrating {len(json_sessions)} sessions from JSON file to SQLite...")
                sessions_to_insert = [SessionRecord.model_validate(item) for item in json_sessions]
                connection = sqlite3.connect(self.sqlite_file)
                try:
                    with connection:
                        connection.execute("PRAGMA journal_mode=WAL")
                        connection.execute("PRAGMA synchronous=NORMAL")
                        connection.executemany(
                            "INSERT OR IGNORE INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                            [
                                (
                                    item.id,
                                    item.upload_id,
                                    item.case_id,
                                    item.a_party_msisdn,
                                    item.source_ip,
                                    item.source_port,
                                    item.translated_ip,
                                    item.translated_port,
                                    item.destination_ip,
                                    item.destination_port,
                                    item.started_at.isoformat(),
                                    item.classification,
                                    item.confidence,
                                    item.source_file,
                                    item.row_number,
                                    json.dumps(item.model_dump(mode="json"), sort_keys=True)
                                )
                                for item in sessions_to_insert
                            ]
                        )
                finally:
                    connection.close()
                # Clear sessions in file
                payload["sessions"] = []
                # Atomic rewrite
                tmp_path = self.storage_file.with_suffix(".tmp")
                tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
                tmp_path.replace(self.storage_file)
                print("Migration complete, JSON store size minimized.")
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            raise EvidenceStoreError(f"Evidence store is unreadable: {exc}") from exc

    def _save(self) -> None:
        payload = {
            "version": STORE_VERSION,
            "saved_at": now_ist().isoformat(),
            "cases": [item.model_dump(mode="json") for item in self.cases],
            "import_specs": [item.model_dump(mode="json") for item in self.import_specs],
            "uploads": [item.model_dump(mode="json") for item in self.uploads],
            "jobs": [item.model_dump(mode="json") for item in self.jobs],
            "last_persistence_snapshot_at": self.last_persistence_snapshot_at.isoformat() if self.last_persistence_snapshot_at else None,
            "sessions": [],
            "extractions": [item.model_dump(mode="json") for item in self.extractions],
            "packages": [item.model_dump(mode="json") for item in self.packages],
            "audit_logs": [item.model_dump(mode="json") for item in self.audit_logs],
            "platform_ranges": [item.model_dump(mode="json") for item in self.platform_ranges],
        }
        tmp_path = self.storage_file.with_suffix(".tmp")
        tmp_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
        tmp_path.replace(self.storage_file)

    def _default_cases(self) -> list[CaseRecord]:
        timestamp = now_ist()
        return [
            CaseRecord(
                id="CASE-GENERAL",
                name="General Evidence Intake",
                crime_type="Unspecified",
                io_name="System",
                description="Default case for uncategorized IPDR evidence.",
                targets=[],
                tags=["default"],
                status="active",
                created_at=timestamp,
                updated_at=timestamp,
            )
        ]

    def _default_import_specs(self) -> list[ImportSpecification]:
        timestamp = now_ist()
        return [
            ImportSpecification(
                id="SPEC-DOT-NAT",
                name="DoT IPDR / NAT SYSLOG",
                description="Canonical mapping for DoT-style source, translated, and destination endpoint records.",
                delimiter=None,
                mapping={
                    "msisdn": "MSISDN",
                    "source_ip": "Source IP Address",
                    "source_port": "Source Port",
                    "translated_ip": "Translated IP Address",
                    "translated_port": "Translated Port",
                    "destination_ip": "Destination IP Address",
                    "destination_port": "Destination Port",
                    "start_date": "Start Date",
                    "start_time": "Start Time",
                    "end_date": "End Date",
                    "end_time": "End Time",
                    "imei": "IMEI",
                    "imsi": "IMSI",
                    "domain": "Domain",
                    "cell_id": "Cell ID",
                    "tower_name": "Tower Name",
                    "city": "City",
                    "state": "State",
                    "country": "Country",
                    "latitude": "Latitude",
                    "longitude": "Longitude",
                    "sim_type": "SIM Type",
                },
                created_at=timestamp,
                updated_at=timestamp,
            )
        ]
    def _default_platform_ranges(self) -> list[PlatformRange]:
        # Realistic static ranges list for communication and VoIP platforms
        ranges: list[PlatformRange] = []
        verified_at = now_ist()
        
        default_data = [
            ("Meta/WhatsApp", "157.240.0.0/16", "AS32934", "WhatsApp media and messaging relays"),
            ("Meta/WhatsApp", "31.13.64.0/18", "AS32934", "Meta core content delivery nodes"),
            ("Meta/WhatsApp", "129.134.0.0/16", "AS32934", "WhatsApp VoIP and registration servers"),
            ("Telegram Messenger", "149.154.160.0/20", "AS62041", "Telegram application server range"),
            ("Telegram Messenger", "91.108.4.0/22", "AS59930", "Telegram core data center Europe"),
            ("Telegram Messenger", "91.108.56.0/22", "AS62041", "Telegram media and storage relays"),
            ("Telegram Messenger", "91.108.8.0/22", "AS59930", "Telegram core messaging server"),
            ("Signal Messenger", "205.251.200.0/24", "AS396903", "Quiet Riddle/Signal server nodes"),
            ("Signal Messenger", "138.197.192.0/20", "AS14061", "Signal application gateway"),
            ("Apple iMessage/FaceTime", "17.0.0.0/8", "AS714", "Apple Global IP networks"),
            ("Google Duo/Meet", "172.217.0.0/16", "AS15169", "Google services and video calls"),
            ("Google Duo/Meet", "142.250.0.0/15", "AS15169", "Google Cloud platform infrastructure"),
            ("Discord VoIP", "162.159.128.0/20", "AS6432", "Discord VoIP servers & gateways"),
            ("Microsoft Teams", "52.112.0.0/14", "AS8075", "MS Teams video/audio conference nodes"),
            ("Microsoft Teams", "52.120.0.0/14", "AS8075", "Skype and Teams enterprise gateway")
        ]
        
        for idx, (platform, cidr, asn, desc) in enumerate(default_data, start=1):
            ranges.append(
                PlatformRange(
                    id=f"RNG-{idx:03d}",
                    platform=platform,
                    cidr=cidr,
                    asn=asn,
                    description=desc,
                    active=True,
                    last_verified=verified_at
                )
            )
        return ranges

    def dashboard_stats(self) -> DashboardStats:
        connection = sqlite3.connect(self.sqlite_file)
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT count(*), sum(case when classification='p2p' then 1 else 0 end), sum(case when classification='relay' then 1 else 0 end), sum(case when classification='unknown' then 1 else 0 end), avg(confidence) FROM sessions")
            total_sessions, actionable, relay, unknown, avg_conf = cursor.fetchone()
        finally:
            connection.close()

        with self._lock:
            return DashboardStats(
                cases=len(self.cases),
                uploads=len(self.uploads),
                sessions=total_sessions or 0,
                actionable=actionable or 0,
                relay=relay or 0,
                unknown=unknown or 0,
                quarantined_rows=sum(upload.rows_quarantined for upload in self.uploads),
                avg_confidence=round(avg_conf, 2) if avg_conf is not None else 0,
                latest_upload=max(self.uploads, key=lambda item: item.created_at) if self.uploads else None,
                top_crime_types=self._crime_type_counts(),
            )

    def _crime_type_counts(self) -> list[dict[str, Any]]:
        counts: dict[str, int] = defaultdict(int)
        for case in self.cases:
            counts[case.crime_type or "Unspecified"] += 1
        return [{"crime_type": key, "cases": value} for key, value in sorted(counts.items(), key=lambda item: (-item[1], item[0]))]

    def list_cases(self) -> list[CaseRecord]:
        with self._lock:
            return sorted(self.cases, key=lambda item: item.updated_at, reverse=True)

    def get_case(self, case_id: str | None) -> CaseRecord | None:
        target_id = case_id or "CASE-GENERAL"
        with self._lock:
            return next((item for item in self.cases if item.id == target_id), None)

    def create_case(self, payload: CaseCreate) -> CaseRecord:
        timestamp = now_ist()
        case = CaseRecord(
            id=f"CASE-{uuid.uuid4().hex[:8]}",
            name=payload.name.strip(),
            crime_type=payload.crime_type.strip() or "Unspecified",
            io_name=payload.io_name.strip() or "Unassigned",
            description=payload.description.strip(),
            targets=[self._parse_msisdn(value, "targets") for value in payload.targets if value.strip()],
            tags=[value.strip() for value in payload.tags if value.strip()],
            status="active",
            created_at=timestamp,
            updated_at=timestamp,
        )
        with self._lock:
            self.cases.append(case)
            self._audit_unlocked("case_created", "case", case.id, {"name": case.name, "crime_type": case.crime_type})
            self._save()
        return case

    def delete_case(self, case_id: str) -> CaseRecord | None:
        if case_id == "CASE-GENERAL":
            return None
        with self._lock:
            case = next((item for item in self.cases if item.id == case_id), None)
            if case is None:
                return None
            self.cases = [item for item in self.cases if item.id != case_id]
            for upload in self.uploads:
                if upload.case_id == case_id:
                    upload.case_id = "CASE-GENERAL"
            self._audit_unlocked("case_deleted", "case", case_id, {"name": case.name})
            self._save()
        return case

    def list_import_specs(self) -> list[ImportSpecification]:
        with self._lock:
            return sorted(self.import_specs, key=lambda item: item.created_at, reverse=True)

    def auto_suggest_mapping(self, columns: list[str]) -> dict[str, str]:
        mapping = {}
        for col in columns:
            col_lower = col.lower().strip()
            for canonical, aliases in COLUMN_ALIASES.items():
                if col_lower in aliases or any(a in col_lower for a in aliases if len(a) > 4):
                    if canonical not in mapping:
                        mapping[canonical] = col
                        break
        return mapping

    def get_import_spec(self, spec_id: str | None) -> ImportSpecification | None:
        if not spec_id:
            return None
        with self._lock:
            return next((item for item in self.import_specs if item.id == spec_id), None)

    def create_import_spec(self, payload: ImportSpecCreate) -> ImportSpecification:
        timestamp = now_ist()
        spec = ImportSpecification(
            id=f"SPEC-{uuid.uuid4().hex[:8]}",
            name=payload.name.strip(),
            description=payload.description.strip(),
            mapping={self._normalize_key(key): value.strip() for key, value in payload.mapping.items() if key.strip() and value.strip()},
            delimiter=payload.delimiter,
            created_at=timestamp,
            updated_at=timestamp,
        )
        with self._lock:
            self.import_specs.append(spec)
            self._audit_unlocked("import_spec_created", "import_spec", spec.id, {"name": spec.name, "fields": sorted(spec.mapping)})
            self._save()
        return spec

    def _resolve_case_id(self, case_id: str | None) -> str:
        target_id = case_id or "CASE-GENERAL"
        if self.get_case(target_id) is None:
            raise UploadValidationError(f"Case not found: {target_id}")
        return target_id

    def _apply_import_spec(self, rows: list[dict[str, Any]], spec: ImportSpecification) -> list[dict[str, Any]]:
        mapped_rows: list[dict[str, Any]] = []
        for row in rows:
            normalized_lookup = {self._normalize_key(str(key)): key for key in row.keys() if key is not None}
            mapped = dict(row)
            for canonical, source_column in spec.mapping.items():
                source_key = normalized_lookup.get(self._normalize_key(source_column))
                if source_key is not None:
                    mapped[canonical] = row[source_key]
            mapped_rows.append(mapped)
        return mapped_rows

    def _missing_required_after_mapping(self, rows: list[dict[str, Any]]) -> list[str]:
        if not rows:
            return ["msisdn", "source_ip", "source_port", "destination_ip", "destination_port"]
        normalized_columns = {self._normalize_key(str(column)) for column in rows[0].keys() if column is not None}
        missing: list[str] = []
        for canonical in ("msisdn", "source_ip", "source_port", "destination_ip", "destination_port"):
            if not normalized_columns.intersection(COLUMN_ALIASES[canonical]):
                missing.append(canonical)
        return missing

    def list_jobs(self) -> list[IngestionJob]:
        with self._lock:
            return sorted(self.jobs, key=lambda item: item.created_at, reverse=True)

    def get_job(self, job_id: str) -> IngestionJob | None:
        with self._lock:
            return next((job for job in self.jobs if job.id == job_id), None)

    def delete_job(self, job_id: str) -> bool:
        with self._lock:
            initial_len = len(self.jobs)
            self.jobs = [job for job in self.jobs if job.id != job_id]
            if len(self.jobs) < initial_len:
                self._save()
                return True
            return False

    def clear_jobs(self) -> None:
        with self._lock:
            # Clear finished or failed jobs, keep processing ones
            self.jobs = [job for job in self.jobs if job.status == "processing"]
            self._save()

    def list_uploads(self) -> list[UploadStatus]:
        with self._lock:
            return sorted(self.uploads, key=lambda item: item.created_at, reverse=True)

    def get_upload(self, upload_id: str) -> UploadStatus | None:
        with self._lock:
            return next((upload for upload in self.uploads if upload.id == upload_id), None)

    def get_upload_quarantine(self, upload_id: str) -> list[QuarantineRecord] | None:
        upload = self.get_upload(upload_id)
        return None if upload is None else upload.quarantine_errors

    def delete_upload(self, upload_id: str) -> UploadStatus | None:
        with self._lock:
            upload = next((item for item in self.uploads if item.id == upload_id), None)
            if upload is None:
                return None

            removed_sessions = [session for session in self.sessions if session.upload_id == upload_id]
            removed_session_ids = {session.id for session in removed_sessions}
            removed_msisdns = {session.a_party_msisdn for session in removed_sessions}
            removed_package_count = sum(1 for package in self.packages if package.session_id in removed_session_ids)
            removed_extraction_count = sum(
                1
                for extraction in self.extractions
                if extraction.requested_msisdn in removed_msisdns or any(candidate.session_id in removed_session_ids for candidate in extraction.candidates)
            )

            deleted_files: list[str] = []
            file_errors: list[str] = []
            for stored_path in self.evidence_dir.glob(f"{upload_id}_*"):
                try:
                    stored_path.unlink(missing_ok=True)
                    deleted_files.append(stored_path.name)
                except OSError as exc:
                    file_errors.append(f"{stored_path.name}: {exc}")

            self.uploads = [item for item in self.uploads if item.id != upload_id]
            self.sessions = [session for session in self.sessions if session.upload_id != upload_id]
            self.jobs = [job for job in self.jobs if job.upload_id != upload_id]
            self.packages = [package for package in self.packages if package.session_id not in removed_session_ids]
            self.extractions = [
                extraction
                for extraction in self.extractions
                if extraction.requested_msisdn not in removed_msisdns and all(candidate.session_id not in removed_session_ids for candidate in extraction.candidates)
            ]
            self._audit_unlocked(
                "upload_deleted",
                "upload",
                upload_id,
                {
                    "filename": upload.filename,
                    "case_id": upload.case_id,
                    "removed_sessions": len(removed_sessions),
                    "removed_packages": removed_package_count,
                    "removed_extractions": removed_extraction_count,
                    "deleted_files": deleted_files,
                    "file_errors": file_errors,
                },
            )
            self._save()
            return upload

    def validate_upload(self, filename: str, content: bytes, import_spec_id: str | None = None) -> AdapterValidationReport:
        if not content:
            raise UploadValidationError("Uploaded file is empty")
        safe_filename = self._safe_filename(filename or "ipdr_upload.csv")
        import_spec = self.get_import_spec(import_spec_id)
        if import_spec_id and import_spec is None:
            raise UploadValidationError(f"Import specification not found: {import_spec_id}")
        try:
            parsed_upload = parse_ipdr_upload(safe_filename, content)
        except IngestionError as exc:
            raise UploadValidationError(str(exc)) from exc

        rows = parsed_upload.rows
        report = parsed_upload.report
        if import_spec is not None:
            rows = self._apply_import_spec(rows, import_spec)
            report = report.model_copy(
                update={
                    "adapter": f"Custom: {import_spec.name}",
                    "missing_required": self._missing_required_after_mapping(rows),
                    "notes": [*report.notes, f"Applied import specification {import_spec.id}"],
                }
            )

        required_detected = [field for field in ("msisdn", "source_ip", "source_port", "destination_ip", "destination_port") if field not in report.missing_required]
        optional_detected = sorted(set(report.columns).difference(required_detected))[:50]
        completeness = len(required_detected) / 5
        quality_penalty = 0.12 if report.notes else 0
        confidence = max(0.05, min(1.0, completeness - quality_penalty))
        return AdapterValidationReport(
            filename=safe_filename,
            adapter=report.adapter,
            file_format=report.file_format,
            rows_detected=report.rows_detected,
            required_detected=required_detected,
            missing_required=report.missing_required,
            optional_detected=optional_detected,
            columns=report.columns,
            archive_members=parsed_upload.source_files if report.file_format == "zip" else [],
            confidence=round(confidence, 2),
            notes=report.notes,
        )

    def ingest_upload(self, filename: str, content: bytes, case_id: str | None = None, import_spec_id: str | None = None) -> UploadStatus:
        start_time_secs = time.time()
        if not content:
            raise UploadValidationError("Uploaded file is empty")

        safe_filename = self._safe_filename(filename or "ipdr_upload.csv")
        resolved_case_id = self._resolve_case_id(case_id)
        import_spec = self.get_import_spec(import_spec_id)
        if import_spec_id and import_spec is None:
            raise UploadValidationError(f"Import specification not found: {import_spec_id}")

        job = IngestionJob(
            id=f"JOB-{uuid.uuid4().hex[:8]}",
            filename=safe_filename,
            case_id=resolved_case_id,
            import_spec_id=import_spec.id if import_spec else None,
            status="processing",
            progress=5,
            message="Parsing evidence file",
            created_at=now_ist(),
        )
        with self._lock:
            self.jobs.append(job)
            self._save()

        try:
            parsed_upload = parse_ipdr_upload(safe_filename, content)
            rows = parsed_upload.rows
            report = parsed_upload.report
            if import_spec is not None:
                rows = self._apply_import_spec(rows, import_spec)
                report = report.model_copy(
                    update={
                        "adapter": f"Custom: {import_spec.name}",
                        "missing_required": self._missing_required_after_mapping(rows),
                        "notes": [*report.notes, f"Applied import specification {import_spec.id}"],
                    }
                )
            if report.missing_required:
                missing = ", ".join(report.missing_required)
                raise UploadValidationError(f"Missing required column(s): {missing}")
            if not rows:
                raise UploadValidationError("No IPDR data rows were found in the uploaded file")
        except IngestionError as exc:
            self._finish_job(job.id, status="failed", progress=100, message=str(exc))
            raise UploadValidationError(str(exc)) from exc
        except UploadValidationError as exc:
            self._finish_job(job.id, status="failed", progress=100, message=str(exc))
            raise

        upload_id = f"UPL-{uuid.uuid4().hex[:8]}"
        stored_path = self.evidence_dir / f"{upload_id}_{safe_filename}"
        stored_path.write_bytes(content)

        sessions: list[SessionRecord] = []
        quarantine: list[QuarantineRecord] = []
        chunk_log = max(1, len(rows) // 20)
        for row_number, row in enumerate(rows, start=1):
            row_filename = self._safe_filename(str(row.get("source_file") or safe_filename))
            try:
                sessions.append(self._session_from_row(upload_id, row_filename, row_number, row, resolved_case_id))
            except RowValidationError as exc:
                quarantine.append(QuarantineRecord(row_number=row_number, field=exc.field, reason=exc.reason))
            except (TypeError, ValueError) as exc:
                quarantine.append(QuarantineRecord(row_number=row_number, reason=str(exc)))

            # Progressive row logging (5% increments) in memory
            if row_number % chunk_log == 0 or row_number == len(rows):
                with self._lock:
                    for j in self.jobs:
                        if j.id == job.id:
                            j.progress = int(5 + 90 * (row_number / len(rows)))
                            j.rows_total = len(rows)
                            j.rows_valid = len(sessions)
                            j.rows_quarantined = len(quarantine)
                            j.message = f"Ingesting rows ({row_number:,} / {len(rows):,})"

        elapsed_sec = time.time() - start_time_secs
        status = "completed" if sessions else "failed"
        upload = UploadStatus(
            id=upload_id,
            filename=safe_filename,
            case_id=resolved_case_id,
            import_spec_id=import_spec.id if import_spec else None,
            status=status,
            rows_total=len(rows),
            rows_valid=len(sessions),
            rows_quarantined=len(quarantine),
            progress=100,
            created_at=job.created_at,
            completed_at=now_ist(),
            message=self._upload_message(len(sessions), len(quarantine), elapsed=elapsed_sec),
            quarantine_errors=quarantine[:100],
            format_report=report,
        )

        # Ingest sessions into SQLite database in a batch transaction
        connection = sqlite3.connect(self.sqlite_file)
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=NORMAL")
            with connection:
                connection.executemany(
                    "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            item.id,
                            item.upload_id,
                            item.case_id,
                            item.a_party_msisdn,
                            item.source_ip,
                            item.source_port,
                            item.translated_ip,
                            item.translated_port,
                            item.destination_ip,
                            item.destination_port,
                            item.started_at.isoformat(),
                            item.classification,
                            item.confidence,
                            item.source_file,
                            item.row_number,
                            json.dumps(item.model_dump(mode="json"), sort_keys=True)
                        )
                        for item in sessions
                    ]
                )
        finally:
            connection.close()

        with self._lock:
            self.sessions = []
            self.uploads.append(upload)
            self._replace_job_unlocked(
                job.id,
                job.model_copy(
                    update={
                        "upload_id": upload.id,
                        "status": status,
                        "progress": 100,
                        "rows_total": upload.rows_total,
                        "rows_valid": upload.rows_valid,
                        "rows_quarantined": upload.rows_quarantined,
                        "archive_members": parsed_upload.source_files if report.file_format == "zip" else [],
                        "message": upload.message,
                        "completed_at": upload.completed_at,
                    }
                ),
            )
            self._audit_unlocked(
                "upload",
                "upload",
                upload.id,
                {
                    "filename": safe_filename,
                    "stored_path": str(stored_path),
                    "valid_rows": len(sessions),
                    "quarantined_rows": len(quarantine),
                    "parser_engine": report.parser_engine,
                    "adapter": report.adapter,
                    "file_format": report.file_format,
                    "archive_members": parsed_upload.source_files if report.file_format == "zip" else [],
                    "case_id": resolved_case_id,
                    "import_spec_id": import_spec.id if import_spec else None,
                },
            )
            self._save()
        return upload

    def _finish_job(self, job_id: str, status: str, progress: int, message: str) -> None:
        with self._lock:
            current = next((job for job in self.jobs if job.id == job_id), None)
            if current is None:
                return
            self._replace_job_unlocked(
                job_id,
                current.model_copy(update={"status": status, "progress": progress, "message": message, "completed_at": now_ist()}),
            )
            self._save()

    def _replace_job_unlocked(self, job_id: str, replacement: IngestionJob) -> None:
        for index, item in enumerate(self.jobs):
            if item.id == job_id:
                self.jobs[index] = replacement
                return
        self.jobs.append(replacement)

    def _upload_message(self, valid: int, quarantined: int, elapsed: float | None = None) -> str:
        time_suffix = f" in {elapsed:.1f}s" if elapsed is not None else ""
        if valid and quarantined:
            return f"Ingested {valid} rows; quarantined {quarantined} rows requiring review{time_suffix}"
        if valid:
            return f"Ingested {valid} rows{time_suffix}"
        return f"No valid rows ingested; quarantined {quarantined} rows{time_suffix}" 

    def _session_from_row(self, upload_id: str, filename: str, row_number: int, row: dict[str, Any], case_id: str = "CASE-GENERAL") -> SessionRecord:
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
        result = classify_ip(destination_ip, destination_port, bytes_down, protocol=protocol, duration=duration)
        record_type = "ipdr_nat" if translated_ip or translated_port else "ipdr"
        return SessionRecord(
            id=f"SES-{uuid.uuid4().hex}",
            upload_id=upload_id,
            case_id=case_id,
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
            domain=self._optional(normalized, "domain"),
            cell_id=self._optional(normalized, "cell_id"),
            tower_name=self._optional(normalized, "tower_name"),
            city=self._optional(normalized, "city"),
            state=self._optional(normalized, "state"),
            country=self._optional(normalized, "country"),
            latitude=self._parse_optional_float(self._optional(normalized, "latitude"), "latitude"),
            longitude=self._parse_optional_float(self._optional(normalized, "longitude"), "longitude"),
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

    def _parse_optional_float(self, value: str | None, field: str) -> float | None:
        if value in (None, ""):
            return None
        try:
            return float(value.replace(",", ""))
        except ValueError as exc:
            raise RowValidationError(field, f"{field} must be numeric") from exc

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
        case_id: str | None = None,
        destination_ip: str | None = None,
        imei: str | None = None,
        app: str | None = None,
        domain: str | None = None,
        cell_id: str | None = None,
        started_from: str | None = None,
        started_to: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[SessionRecord]:
        query = "SELECT payload_json FROM sessions WHERE 1=1"
        params = []

        if msisdn:
            needle_msisdn = re.sub(r"\D", "", msisdn)
            query += " AND a_party_msisdn LIKE ?"
            params.append(f"%{needle_msisdn}%")
        if classification:
            query += " AND classification = ?"
            params.append(classification)
        if case_id:
            query += " AND case_id = ?"
            params.append(case_id)
        if destination_ip:
            query += " AND destination_ip LIKE ?"
            params.append(f"%{destination_ip}%")
        if imei:
            query += " AND json_extract(payload_json, '$.imei') LIKE ?"
            params.append(f"%{imei}%")
        if app:
            query += " AND (lower(json_extract(payload_json, '$.app_hint')) LIKE ? OR lower(json_extract(payload_json, '$.operator')) LIKE ?)"
            params.extend([f"%{app.lower()}%", f"%{app.lower()}%"])
        if domain:
            query += " AND lower(json_extract(payload_json, '$.domain')) LIKE ?"
            params.append(f"%{domain.lower()}%")
        if cell_id:
            query += " AND lower(json_extract(payload_json, '$.cell_id')) LIKE ?"
            params.append(f"%{cell_id.lower()}%")
        if started_from:
            query += " AND started_at >= ?"
            params.append(started_from)
        if started_to:
            query += " AND started_at <= ?"
            params.append(started_to)
        if q:
            needle = f"%{q.lower()}%"
            query += (
                " AND (lower(a_party_msisdn) LIKE ?"
                " OR lower(destination_ip) LIKE ?"
                " OR lower(source_ip) LIKE ?"
                " OR lower(translated_ip) LIKE ?"
                " OR lower(json_extract(payload_json, '$.operator')) LIKE ?"
                " OR lower(json_extract(payload_json, '$.app_hint')) LIKE ?"
                " OR lower(json_extract(payload_json, '$.domain')) LIKE ?"
                " OR lower(json_extract(payload_json, '$.cell_id')) LIKE ?"
                " OR lower(json_extract(payload_json, '$.imei')) LIKE ?"
                " OR lower(source_file) LIKE ?)"
            )
            params.extend([needle] * 10)

        bounded_limit = max(1, min(limit, 10_000))
        bounded_offset = max(0, offset)
        query += " ORDER BY started_at DESC LIMIT ? OFFSET ?"
        params.extend([bounded_limit, bounded_offset])

        connection = sqlite3.connect(self.sqlite_file)
        try:
            cursor = connection.cursor()
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [SessionRecord.model_validate_json(row[0]) for row in rows]
        finally:
            connection.close()

    def get_session(self, session_id: str) -> SessionRecord | None:
        connection = sqlite3.connect(self.sqlite_file)
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT payload_json FROM sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            if row:
                return SessionRecord.model_validate_json(row[0])
            return None
        finally:
            connection.close()

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
        session = self.get_session(candidate.session_id)
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
        case_id: str | None = None,
        limit: int = 250,
        scan_limit: int = 20_000,
        sample_limit: int = 4,
    ) -> CommunicationGraph:
        normalized_classification = None if classification in (None, "all") else classification
        visible_limit = max(1, min(limit, 5_000))
        scan_cap = max(visible_limit, min(max(scan_limit, 1), 100_000))
        sample_cap = max(1, min(sample_limit, 10))
        sessions = self.list_sessions(msisdn=msisdn, classification=normalized_classification, case_id=case_id, limit=scan_cap)
        nodes: dict[str, dict[str, Any]] = {}
        links: dict[str, dict[str, Any]] = {}

        def append_sample(target: dict[str, Any], session: SessionRecord) -> None:
            if len(target["sessions"]) < sample_cap:
                target["sessions"].append(session)

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
            append_sample(existing, session)
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
            append_sample(existing_link, session)

        classification_rank = {"p2p": 2, "unknown": 1, "relay": 0}
        top_links = sorted(
            links.values(),
            key=lambda item: (item["count"], classification_rank.get(item["classification"], 0), item["bytes"], item["confidence"]),
            reverse=True,
        )[:visible_limit]
        visible_node_ids = {link["source_id"] for link in top_links} | {link["target_id"] for link in top_links}
        node_models = [GraphNode.model_validate(item) for item in nodes.values() if item["id"] in visible_node_ids]
        link_models = [GraphEdge.model_validate(item) for item in top_links]
        visible_sessions: list[SessionRecord] = []
        seen_session_ids: set[str] = set()
        for link in top_links:
            for session in link["sessions"]:
                if session.id in seen_session_ids:
                    continue
                seen_session_ids.add(session.id)
                visible_sessions.append(session)
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
        return CommunicationGraph(nodes=node_models, links=link_models, sessions=visible_sessions, metrics=metrics)
    def suspicious_patterns(self, limit: int = 50) -> list[SuspiciousPattern]:
        with self._lock:
            sessions = self.list_sessions(limit=20_000)
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

    def timeline(self, bucket: str = "hour", case_id: str | None = None, msisdn: str | None = None) -> list[TimelinePoint]:
        sessions = self.list_sessions(case_id=case_id, msisdn=msisdn, limit=10_000)
        formats = {
            "year": ("%Y", "%Y"),
            "month": ("%Y-%m", "%b %Y"),
            "day": ("%Y-%m-%d", "%d %b %Y"),
            "hour": ("%Y-%m-%d %H", "%d %b %H:00"),
            "minute": ("%Y-%m-%d %H:%M", "%H:%M"),
            "second": ("%Y-%m-%d %H:%M:%S", "%H:%M:%S"),
        }
        key_format, label_format = formats.get(bucket, formats["hour"])
        grouped: dict[str, dict[str, Any]] = {}
        for session in sessions:
            key = session.started_at.strftime(key_format)
            item = grouped.setdefault(
                key,
                {"bucket": key, "label": session.started_at.strftime(label_format), "sessions": 0, "p2p": 0, "relay": 0, "unknown": 0, "bytes_total": 0},
            )
            item["sessions"] += 1
            item[session.classification] += 1
            item["bytes_total"] += session.bytes_up + session.bytes_down
        return [TimelinePoint.model_validate(grouped[key]) for key in sorted(grouped)]

    def application_summary(self, case_id: str | None = None, limit: int = 10) -> list[ApplicationSummary]:
        sessions = self.list_sessions(case_id=case_id, limit=10_000)
        grouped: dict[str, dict[str, Any]] = {}
        for session in sessions:
            key = session.app_hint or session.operator or "Unknown"
            item = grouped.setdefault(
                key,
                {"name": key, "operator": session.operator, "sessions": 0, "msisdns": set(), "destination_ips": set(), "duration_seconds": 0, "bytes_total": 0},
            )
            item["sessions"] += 1
            item["msisdns"].add(session.a_party_msisdn)
            item["destination_ips"].add(session.destination_ip)
            item["duration_seconds"] += session.duration_seconds
            item["bytes_total"] += session.bytes_up + session.bytes_down
            if item["operator"] != session.operator:
                item["operator"] = "Multiple"
        rows = []
        for item in grouped.values():
            rows.append(
                ApplicationSummary(
                    name=item["name"],
                    operator=item["operator"],
                    sessions=item["sessions"],
                    msisdns=len(item["msisdns"]),
                    destination_ips=len(item["destination_ips"]),
                    duration_seconds=item["duration_seconds"],
                    bytes_total=item["bytes_total"],
                )
            )
        return sorted(rows, key=lambda item: (-item.sessions, -item.bytes_total, item.name))[: max(1, min(limit, 100))]

    def common_applications(self, case_id: str | None = None, msisdns: list[str] | None = None, limit: int = 10) -> list[CommonApplicationReport]:
        sessions = self.list_sessions(case_id=case_id, limit=10_000)
        if msisdns:
            targets = {self._parse_msisdn(value, "msisdns") for value in msisdns if value.strip()}
            sessions = [session for session in sessions if session.a_party_msisdn in targets]
        grouped: dict[str, dict[str, Any]] = {}
        for session in sessions:
            key = session.app_hint or session.domain or session.operator or "Unknown"
            item = grouped.setdefault(
                key,
                {
                    "name": key,
                    "sessions": 0,
                    "poi_msisdns": set(),
                    "destination_ips": set(),
                    "total_duration_seconds": 0,
                    "total_bytes": 0,
                    "times": [],
                },
            )
            item["sessions"] += 1
            item["poi_msisdns"].add(session.a_party_msisdn)
            item["destination_ips"].add(session.destination_ip)
            item["total_duration_seconds"] += session.duration_seconds
            item["total_bytes"] += session.bytes_up + session.bytes_down
            item["times"].append(session.started_at)
        rows: list[CommonApplicationReport] = []
        for item in grouped.values():
            if len(item["poi_msisdns"]) < 2 and not msisdns:
                continue
            rows.append(
                CommonApplicationReport(
                    name=item["name"],
                    sessions=item["sessions"],
                    poi_msisdns=sorted(item["poi_msisdns"]),
                    destination_ips=sorted(item["destination_ips"]),
                    total_duration_seconds=item["total_duration_seconds"],
                    total_bytes=item["total_bytes"],
                    first_seen=min(item["times"]) if item["times"] else None,
                    last_seen=max(item["times"]) if item["times"] else None,
                )
            )
        return sorted(rows, key=lambda item: (-len(item.poi_msisdns), -item.sessions, item.name))[: max(1, min(limit, 100))]

    def imei_frequency(self, case_id: str | None = None, msisdn: str | None = None, limit: int = 20) -> list[ImeiFrequencyReport]:
        sessions = self.list_sessions(case_id=case_id, msisdn=msisdn, limit=10_000)
        grouped: dict[str, dict[str, Any]] = {}
        for session in sessions:
            if not session.imei:
                continue
            item = grouped.setdefault(session.imei, {"sessions": 0, "msisdns": set(), "times": []})
            item["sessions"] += 1
            item["msisdns"].add(session.a_party_msisdn)
            item["times"].append(session.started_at)
        rows = [
            ImeiFrequencyReport(
                imei=imei,
                sessions=item["sessions"],
                msisdns=sorted(item["msisdns"]),
                first_seen=min(item["times"]) if item["times"] else None,
                last_seen=max(item["times"]) if item["times"] else None,
                handset_hint=tac_decoder.decode_imei(imei).model if tac_decoder.decode_imei(imei).model else f"TAC {imei[:8]}" if len(imei) >= 8 else None,
            )
            for imei, item in grouped.items()
        ]
        return sorted(rows, key=lambda item: (-item.sessions, item.imei))[: max(1, min(limit, 100))]

    def location_summary(self, case_id: str | None = None, msisdn: str | None = None, limit: int = 20) -> list[LocationSummaryReport]:
        sessions = self.list_sessions(case_id=case_id, msisdn=msisdn, limit=10_000)
        grouped: dict[str, dict[str, Any]] = {}
        for session in sessions:
            key = session.cell_id or " | ".join(part for part in (session.city, session.state, session.country) if part)
            if not key:
                continue
            
            lat = session.latitude
            lng = session.longitude
            label = session.tower_name or key
            
            if session.cell_id:
                cell_info = cell_decoder.decode(session.cell_id)
                lat = lat or cell_info.latitude
                lng = lng or cell_info.longitude
                if cell_info.address and not session.tower_name:
                    label = cell_info.address
                    
            item = grouped.setdefault(
                key,
                {
                    "key": key,
                    "label": label,
                    "sessions": 0,
                    "day_sessions": 0,
                    "night_sessions": 0,
                    "msisdns": set(),
                    "times": [],
                    "latitude": lat,
                    "longitude": lng,
                },
            )
            item["sessions"] += 1
            if 6 <= session.started_at.hour < 18:
                item["day_sessions"] += 1
            else:
                item["night_sessions"] += 1
            item["msisdns"].add(session.a_party_msisdn)
            item["times"].append(session.started_at)
            item["latitude"] = item["latitude"] if item["latitude"] is not None else lat
            item["longitude"] = item["longitude"] if item["longitude"] is not None else lng
        rows = [
            LocationSummaryReport(
                key=item["key"],
                label=item["label"],
                sessions=item["sessions"],
                day_sessions=item["day_sessions"],
                night_sessions=item["night_sessions"],
                msisdns=sorted(item["msisdns"]),
                first_seen=min(item["times"]) if item["times"] else None,
                last_seen=max(item["times"]) if item["times"] else None,
                latitude=item["latitude"],
                longitude=item["longitude"],
            )
            for item in grouped.values()
        ]
        return sorted(rows, key=lambda item: (-item.sessions, item.label))[: max(1, min(limit, 100))]

    def poi_summary(self, msisdn: str, case_id: str | None = None) -> PoiSummaryReport:
        normalized_msisdn = self._parse_msisdn(msisdn, "msisdn")
        sessions = self.list_sessions(msisdn=normalized_msisdn, case_id=case_id, limit=10_000)
        total_bytes = sum(session.bytes_up + session.bytes_down for session in sessions)
        by_destination: dict[str, dict[str, Any]] = defaultdict(lambda: {"sessions": 0, "bytes_total": 0, "classification": "unknown", "operator": "Unknown"})
        by_application: dict[str, int] = defaultdict(int)
        by_application_duration: dict[str, int] = defaultdict(int)
        for session in sessions:
            endpoint = f"{session.destination_ip}:{session.destination_port}"
            by_destination[endpoint]["sessions"] += 1
            by_destination[endpoint]["bytes_total"] += session.bytes_up + session.bytes_down
            by_destination[endpoint]["classification"] = self._merge_classification(by_destination[endpoint]["classification"], session.classification)
            by_destination[endpoint]["operator"] = session.operator
            by_application[session.app_hint] += 1
            by_application_duration[session.app_hint] += session.duration_seconds
        times = [session.started_at for session in sessions]
        return PoiSummaryReport(
            msisdn=normalized_msisdn,
            total_sessions=len(sessions),
            p2p=sum(1 for session in sessions if session.classification == "p2p"),
            relay=sum(1 for session in sessions if session.classification == "relay"),
            unknown=sum(1 for session in sessions if session.classification == "unknown"),
            first_seen=min(times) if times else None,
            last_seen=max(times) if times else None,
            total_bytes=total_bytes,
            imeis=sorted({session.imei for session in sessions if session.imei}),
            applications=[{"name": key, "sessions": value, "duration": by_application_duration[key]} for key, value in sorted(by_application.items(), key=lambda item: (-item[1], item[0]))[:10]],
            top_destinations=[{"endpoint": key, **value} for key, value in sorted(by_destination.items(), key=lambda item: (-item[1]["sessions"], -item[1]["bytes_total"]))[:10]],
        )

    def ip_summary(self, destination_ip: str, case_id: str | None = None) -> IpSummaryReport:
        ip_value = self._parse_ip(destination_ip, "destination_ip")
        sessions = self.list_sessions(destination_ip=ip_value, case_id=case_id, limit=10_000)
        times = [session.started_at for session in sessions]
        classification = "unknown"
        operator = "Unknown"
        for session in sessions:
            classification = self._merge_classification(classification, session.classification)
            operator = session.operator if operator in {"Unknown", session.operator} else "Multiple"
        return IpSummaryReport(
            destination_ip=ip_value,
            total_sessions=len(sessions),
            msisdns=sorted({session.a_party_msisdn for session in sessions}),
            ports=sorted({session.destination_port for session in sessions}),
            operator=operator,
            classification=classification,
            first_seen=min(times) if times else None,
            last_seen=max(times) if times else None,
            total_bytes=sum(session.bytes_up + session.bytes_down for session in sessions),
        )

    def export_sessions_csv(self, case_id: str | None = None) -> str:
        output = io.StringIO()
        fields = [
            "case_id",
            "a_party_msisdn",
            "source_ip",
            "source_port",
            "translated_ip",
            "translated_port",
            "destination_ip",
            "destination_port",
            "domain",
            "cell_id",
            "city",
            "state",
            "country",
            "latitude",
            "longitude",
            "protocol",
            "started_at",
            "ended_at",
            "duration_seconds",
            "bytes_up",
            "bytes_down",
            "imei",
            "imsi",
            "classification",
            "confidence",
            "source_file",
            "row_number",
        ]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for session in self.list_sessions(case_id=case_id, limit=10_000):
            data = session.model_dump(mode="json")
            writer.writerow({field: data.get(field, "") for field in fields})
        return output.getvalue()

    def reset_store(self) -> None:
        import sqlite3
        with self._lock:
            # 1. Truncate sessions in SQLite database
            connection = sqlite3.connect(self.sqlite_file)
            try:
                with connection:
                    connection.execute("DELETE FROM sessions")
                connection.isolation_level = None
                connection.execute("VACUUM")
            finally:
                connection.close()

            # 2. Reset in-memory state fields to default clean values
            self.cases = self._default_cases()
            self.import_specs = self._default_import_specs()
            self.platform_ranges = self._default_platform_ranges()
            self.uploads = []
            self.jobs = []
            self.extractions = []
            self.packages = []
            self.audit_logs = []
            self.last_persistence_snapshot_at = None

            # 3. Clean files in evidence_dir
            for item in self.evidence_dir.iterdir():
                if item.is_file():
                    try:
                        item.unlink()
                    except OSError:
                        pass

            # 4. Save clean state to disk
            self._save()
            self._audit_unlocked("system_reset", "system", "all", {"message": "All data reset to zero."})

    def persistence_status(self) -> PersistenceStatus:
        connection = sqlite3.connect(self.sqlite_file)
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT count(*) FROM sessions")
            total_sessions = cursor.fetchone()[0]
        finally:
            connection.close()

        with self._lock:
            return PersistenceStatus(
                backend="sqlite_snapshot",
                enabled=True,
                path=str(self.sqlite_file),
                cases=len(self.cases),
                uploads=len(self.uploads),
                sessions=total_sessions or 0,
                reports=len(self.extractions) + len(self.packages),
                last_snapshot_at=self.last_persistence_snapshot_at,
            )

    def write_sqlite_snapshot(self) -> PersistenceStatus:
        with self._lock:
            cases = list(self.cases)
            uploads = list(self.uploads)
            jobs = list(self.jobs)
            sessions = self.list_sessions(limit=20_000)
            extractions = list(self.extractions)
            packages = list(self.packages)
            audit_logs = list(self.audit_logs)

        connection = sqlite3.connect(self.sqlite_file)
        try:
            with connection:
                connection.execute("PRAGMA journal_mode=WAL")
                connection.execute("CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, name TEXT, crime_type TEXT, status TEXT, updated_at TEXT, payload_json TEXT NOT NULL)")
                connection.execute("CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, filename TEXT, case_id TEXT, status TEXT, rows_total INTEGER, rows_valid INTEGER, rows_quarantined INTEGER, created_at TEXT, payload_json TEXT NOT NULL)")
                connection.execute("CREATE TABLE IF NOT EXISTS ingestion_jobs (id TEXT PRIMARY KEY, upload_id TEXT, filename TEXT, case_id TEXT, status TEXT, progress INTEGER, created_at TEXT, completed_at TEXT, payload_json TEXT NOT NULL)")
                connection.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, upload_id TEXT, case_id TEXT, a_party_msisdn TEXT, source_ip TEXT, source_port INTEGER, translated_ip TEXT, translated_port INTEGER, destination_ip TEXT, destination_port INTEGER, started_at TEXT, classification TEXT, confidence REAL, source_file TEXT, row_number INTEGER, payload_json TEXT NOT NULL)")
                connection.execute("CREATE TABLE IF NOT EXISTS investigation_reports (id TEXT PRIMARY KEY, report_type TEXT, subject TEXT, created_at TEXT, payload_json TEXT NOT NULL)")
                connection.execute("CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, timestamp TEXT, action TEXT, entity_type TEXT, entity_id TEXT, payload_json TEXT NOT NULL)")
                for table in ("cases", "uploads", "ingestion_jobs", "sessions", "investigation_reports", "audit_logs"):
                    connection.execute(f"DELETE FROM {table}")
                connection.executemany(
                    "INSERT INTO cases VALUES (?, ?, ?, ?, ?, ?)",
                    [(item.id, item.name, item.crime_type, item.status, item.updated_at.isoformat(), json.dumps(item.model_dump(mode="json"), sort_keys=True)) for item in cases],
                )
                connection.executemany(
                    "INSERT INTO uploads VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [(item.id, item.filename, item.case_id, item.status, item.rows_total, item.rows_valid, item.rows_quarantined, item.created_at.isoformat(), json.dumps(item.model_dump(mode="json"), sort_keys=True)) for item in uploads],
                )
                connection.executemany(
                    "INSERT INTO ingestion_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [(item.id, item.upload_id, item.filename, item.case_id, item.status, item.progress, item.created_at.isoformat(), item.completed_at.isoformat() if item.completed_at else None, json.dumps(item.model_dump(mode="json"), sort_keys=True)) for item in jobs],
                )
                connection.executemany(
                    "INSERT INTO sessions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    [
                        (
                            item.id,
                            item.upload_id,
                            item.case_id,
                            item.a_party_msisdn,
                            item.source_ip,
                            item.source_port,
                            item.translated_ip,
                            item.translated_port,
                            item.destination_ip,
                            item.destination_port,
                            item.started_at.isoformat(),
                            item.classification,
                            item.confidence,
                            item.source_file,
                            item.row_number,
                            json.dumps(item.model_dump(mode="json"), sort_keys=True),
                        )
                        for item in sessions
                    ],
                )
                report_rows = [
                    (item.id, "extraction", item.requested_msisdn, item.created_at.isoformat(), json.dumps(item.model_dump(mode="json"), sort_keys=True))
                    for item in extractions
                ] + [
                    (item.id, "request_package", item.session_id, item.created_at.isoformat(), json.dumps(item.model_dump(mode="json"), sort_keys=True))
                    for item in packages
                ]
                connection.executemany("INSERT INTO investigation_reports VALUES (?, ?, ?, ?, ?)", report_rows)
                connection.executemany(
                    "INSERT INTO audit_logs VALUES (?, ?, ?, ?, ?, ?)",
                    [(item.id, item.timestamp.isoformat(), item.action, item.entity_type, item.entity_id, json.dumps(item.model_dump(mode="json"), sort_keys=True)) for item in audit_logs],
                )
        finally:
            connection.close()

        with self._lock:
            self.last_persistence_snapshot_at = now_ist()
            self._audit_unlocked("sqlite_snapshot", "persistence", "evidence_store.sqlite", {"path": str(self.sqlite_file), "sessions": len(sessions)})
            self._save()
        return self.persistence_status()

    def export_graph_json(self, msisdn: str | None = None, classification: str | None = None, case_id: str | None = None, limit: int = 5_000) -> str:
        return self.communication_graph(msisdn=msisdn, classification=classification, case_id=case_id, limit=limit).model_dump_json(indent=2)

    def export_graph_graphml(self, msisdn: str | None = None, classification: str | None = None, case_id: str | None = None, limit: int = 5_000) -> str:
        graph = self.communication_graph(msisdn=msisdn, classification=classification, case_id=case_id, limit=limit)
        lines = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">',
            '  <key id="label" for="node" attr.name="label" attr.type="string"/>',
            '  <key id="kind" for="node" attr.name="kind" attr.type="string"/>',
            '  <key id="operator" for="node" attr.name="operator" attr.type="string"/>',
            '  <key id="classification" for="edge" attr.name="classification" attr.type="string"/>',
            '  <key id="sessions" for="edge" attr.name="sessions" attr.type="int"/>',
            '  <key id="confidence" for="edge" attr.name="confidence" attr.type="double"/>',
            '  <graph id="PramaanIPDR" edgedefault="directed">',
        ]
        for node in graph.nodes:
            node_id = html.escape(node.id, quote=True)
            lines.extend(
                [
                    f'    <node id="{node_id}">',
                    f'      <data key="label">{html.escape(node.title, quote=True)}</data>',
                    f'      <data key="kind">{html.escape(node.kind, quote=True)}</data>',
                    f'      <data key="operator">{html.escape(node.operator, quote=True)}</data>',
                    '    </node>',
                ]
            )
        for link in graph.links:
            lines.extend(
                [
                    f'    <edge id="{html.escape(link.id, quote=True)}" source="{html.escape(link.source_id, quote=True)}" target="{html.escape(link.target_id, quote=True)}">',
                    f'      <data key="classification">{html.escape(link.classification, quote=True)}</data>',
                    f'      <data key="sessions">{link.count}</data>',
                    f'      <data key="confidence">{link.confidence:.2f}</data>',
                    '    </edge>',
                ]
            )
        lines.extend(['  </graph>', '</graphml>'])
        return "\n".join(lines)

    def export_poi_csv(self, msisdn: str, case_id: str | None = None) -> str:
        report = self.poi_summary(msisdn=msisdn, case_id=case_id)
        output = io.StringIO()
        fields = ["msisdn", "total_sessions", "p2p", "relay", "unknown", "first_seen", "last_seen", "total_bytes", "imei", "endpoint", "destination_sessions", "classification", "operator", "destination_bytes"]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        destinations = report.top_destinations or [{}]
        for destination in destinations:
            writer.writerow(
                {
                    "msisdn": report.msisdn,
                    "total_sessions": report.total_sessions,
                    "p2p": report.p2p,
                    "relay": report.relay,
                    "unknown": report.unknown,
                    "first_seen": report.first_seen.isoformat() if report.first_seen else "",
                    "last_seen": report.last_seen.isoformat() if report.last_seen else "",
                    "total_bytes": report.total_bytes,
                    "imei": ";".join(report.imeis),
                    "endpoint": destination.get("endpoint", ""),
                    "destination_sessions": destination.get("sessions", ""),
                    "classification": destination.get("classification", ""),
                    "operator": destination.get("operator", ""),
                    "destination_bytes": destination.get("bytes_total", ""),
                }
            )
        return output.getvalue()

    def export_ip_csv(self, destination_ip: str, case_id: str | None = None) -> str:
        report = self.ip_summary(destination_ip=destination_ip, case_id=case_id)
        output = io.StringIO()
        fields = ["destination_ip", "total_sessions", "msisdn", "ports", "operator", "classification", "first_seen", "last_seen", "total_bytes"]
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for msisdn in report.msisdns or [""]:
            writer.writerow(
                {
                    "destination_ip": report.destination_ip,
                    "total_sessions": report.total_sessions,
                    "msisdn": msisdn,
                    "ports": ";".join(str(port) for port in report.ports),
                    "operator": report.operator,
                    "classification": report.classification,
                    "first_seen": report.first_seen.isoformat() if report.first_seen else "",
                    "last_seen": report.last_seen.isoformat() if report.last_seen else "",
                    "total_bytes": report.total_bytes,
                }
            )
        return output.getvalue()

    def export_poi_html(self, msisdn: str, case_id: str | None = None) -> str:
        report = self.poi_summary(msisdn=msisdn, case_id=case_id)
        rows = "".join(
            f"<tr><td>{html.escape(str(item.get('endpoint', '')))}</td><td>{item.get('sessions', '')}</td><td>{html.escape(str(item.get('classification', '')))}</td><td>{html.escape(str(item.get('operator', '')))}</td><td>{item.get('bytes_total', '')}</td></tr>"
            for item in report.top_destinations
        )
        return self._html_report(
            title=f"PoI Summary {html.escape(report.msisdn)}",
            summary=f"Sessions: {report.total_sessions} | P2P: {report.p2p} | Relay: {report.relay} | Bytes: {report.total_bytes}",
            body=f"<p><strong>IMEI:</strong> {html.escape(', '.join(report.imeis) or '-')}</p><table><thead><tr><th>Endpoint</th><th>Sessions</th><th>Class</th><th>Operator</th><th>Bytes</th></tr></thead><tbody>{rows}</tbody></table>",
        )

    def export_ip_html(self, destination_ip: str, case_id: str | None = None) -> str:
        report = self.ip_summary(destination_ip=destination_ip, case_id=case_id)
        msisdns = "".join(f"<li>{html.escape(value)}</li>" for value in report.msisdns)
        return self._html_report(
            title=f"IP Summary {html.escape(report.destination_ip)}",
            summary=f"Sessions: {report.total_sessions} | Class: {report.classification} | Operator: {html.escape(report.operator)} | Bytes: {report.total_bytes}",
            body=f"<p><strong>Ports:</strong> {html.escape(', '.join(str(port) for port in report.ports) or '-')}</p><h2>A-party MSISDNs</h2><ul>{msisdns}</ul>",
        )

    def _html_report(self, title: str, summary: str, body: str) -> str:
        generated_at = html.escape(now_ist().isoformat())
        return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{title}</title>
  <style>
    body {{ font-family: Inter, Arial, sans-serif; margin: 32px; color: #1f2328; }}
    h1 {{ font-size: 22px; margin: 0 0 8px; }}
    h2 {{ font-size: 16px; margin-top: 24px; }}
    .meta {{ color: #656d76; margin-bottom: 24px; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 16px; }}
    th, td {{ border: 1px solid #d1d9e0; padding: 8px; text-align: left; }}
    th {{ background: #f0f2f5; }}
  </style>
</head>
<body>
  <h1>{title}</h1>
  <div class="meta">Generated by Pramaan IPDR at {generated_at}</div>
  <p>{html.escape(summary)}</p>
  {body}
</body>
</html>"""
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
            sessions = self.list_sessions(limit=20_000)
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