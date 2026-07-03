from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


Classification = Literal["p2p", "relay", "unknown"]
GraphNodeKind = Literal["source", "p2p", "relay", "unknown"]
PatternSeverity = Literal["low", "medium", "high"]


class QuarantineRecord(BaseModel):
    row_number: int
    field: str | None = None
    reason: str


class UploadFormatReport(BaseModel):
    parser_engine: str
    file_format: str
    delimiter: str | None = None
    adapter: str
    encoding: str
    columns: list[str] = Field(default_factory=list)
    rows_detected: int
    missing_required: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class UploadStatus(BaseModel):
    id: str
    filename: str
    case_id: str = "CASE-GENERAL"
    import_spec_id: str | None = None
    status: Literal["queued", "processing", "completed", "failed"]
    rows_total: int
    rows_valid: int
    rows_quarantined: int
    progress: int = Field(ge=0, le=100)
    created_at: datetime
    completed_at: datetime | None = None
    message: str | None = None
    quarantine_errors: list[QuarantineRecord] = Field(default_factory=list)
    format_report: UploadFormatReport | None = None


class SessionRecord(BaseModel):
    id: str
    upload_id: str
    case_id: str = "CASE-GENERAL"
    a_party_msisdn: str
    subscriber_name: str | None = None
    subscriber_address: str | None = None
    contact_number: str | None = None
    alternate_contact_number: str | None = None
    email: str | None = None
    access_identifier: str | None = None
    user_id: str | None = None
    source_ip: str | None = None
    source_port: int | None = None
    translated_ip: str | None = None
    translated_port: int | None = None
    destination_ip: str
    destination_port: int
    domain: str | None = None
    cell_id: str | None = None
    tower_name: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    ip_allocation: str | None = None
    protocol: str
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int
    bytes_up: int
    bytes_down: int
    source_mac: str | None = None
    imei: str | None = None
    device_id: str | None = None
    tmsi: str | None = None
    imsi: str | None = None
    sim_type: str | None = None
    record_type: Literal["ipdr", "nat_syslog", "ipdr_nat"] = "ipdr"
    app_hint: str
    operator: str
    asn: str
    classification: Classification
    confidence: float = Field(ge=0, le=1)
    source_file: str
    row_number: int


class GraphNode(BaseModel):
    id: str
    label: str
    title: str
    kind: GraphNodeKind
    operator: str
    count: int
    bytes: int
    confidence: float = Field(ge=0, le=1)
    last_seen: datetime | None = None
    sessions: list[SessionRecord] = Field(default_factory=list)


class GraphEdge(BaseModel):
    id: str
    source_id: str
    target_id: str
    classification: Classification
    count: int
    bytes: int
    duration_seconds: int
    confidence: float = Field(ge=0, le=1)
    sessions: list[SessionRecord] = Field(default_factory=list)


class GraphMetrics(BaseModel):
    nodes: int
    edges: int
    sessions: int
    p2p: int
    relay: int
    unknown: int
    high_confidence: int
    first_seen: datetime | None = None
    last_seen: datetime | None = None


class CommunicationGraph(BaseModel):
    nodes: list[GraphNode]
    links: list[GraphEdge]
    sessions: list[SessionRecord]
    metrics: GraphMetrics


class SuspiciousPattern(BaseModel):
    id: str
    severity: PatternSeverity
    pattern_type: str
    title: str
    description: str
    entities: dict[str, Any]
    evidence: list[str]
    recommended_action: str
    score: float = Field(ge=0, le=1)


class DashboardStats(BaseModel):
    cases: int = 0
    uploads: int
    sessions: int
    actionable: int
    relay: int
    unknown: int
    quarantined_rows: int
    avg_confidence: float
    latest_upload: UploadStatus | None = None
    top_crime_types: list[dict[str, Any]] = Field(default_factory=list)


class ExtractionRequest(BaseModel):
    msisdn: str = Field(min_length=4)
    depth: int = Field(default=1, ge=1, le=2)
    min_confidence: float = Field(default=0.65, ge=0, le=1)


class ExtractionCandidate(BaseModel):
    session_id: str
    source_ip: str | None = None
    source_port: int | None = None
    translated_ip: str | None = None
    translated_port: int | None = None
    destination_ip: str
    destination_port: int
    target_operator: str
    asn: str
    classification: Classification
    confidence: float
    evidence: str


class ExtractionResult(BaseModel):
    id: str
    requested_msisdn: str
    depth: int
    total_sessions: int
    actionable_count: int
    relay_count: int
    candidates: list[ExtractionCandidate]
    created_at: datetime


class RequestPackage(BaseModel):
    id: str
    extraction_id: str
    session_id: str
    request_type: str
    target_operator: str
    payload: dict[str, Any]
    created_at: datetime


class AuditLogEntry(BaseModel):
    id: str
    timestamp: datetime
    action: str
    entity_type: str
    entity_id: str
    user: str
    details: dict[str, Any]
    ip_address: str = "127.0.0.1"


class PlatformRange(BaseModel):
    id: str
    platform: str
    cidr: str
    asn: str
    description: str
    active: bool = True
    last_verified: datetime


class SearchResult(BaseModel):
    type: Literal["session", "upload", "package"]
    id: str
    title: str
    subtitle: str
    metadata: dict[str, Any] = Field(default_factory=dict)
class CaseCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    crime_type: str = Field(default="Unspecified", max_length=80)
    io_name: str = Field(default="Unassigned", max_length=100)
    description: str = ""
    targets: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)


class CaseRecord(CaseCreate):
    id: str
    status: Literal["active", "review", "closed"] = "active"
    created_at: datetime
    updated_at: datetime


class ImportSpecCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    mapping: dict[str, str] = Field(default_factory=dict)
    delimiter: str | None = None


class ImportSpecification(ImportSpecCreate):
    id: str
    created_at: datetime
    updated_at: datetime


class TimelinePoint(BaseModel):
    bucket: str
    label: str
    sessions: int
    p2p: int
    relay: int
    unknown: int
    bytes_total: int


class ApplicationSummary(BaseModel):
    name: str
    operator: str
    sessions: int
    msisdns: int
    destination_ips: int
    duration_seconds: int
    bytes_total: int


class CommonApplicationReport(BaseModel):
    name: str
    sessions: int
    poi_msisdns: list[str] = Field(default_factory=list)
    destination_ips: list[str] = Field(default_factory=list)
    total_duration_seconds: int
    total_bytes: int
    first_seen: datetime | None = None
    last_seen: datetime | None = None


class ImeiFrequencyReport(BaseModel):
    imei: str
    sessions: int
    msisdns: list[str] = Field(default_factory=list)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    handset_hint: str | None = None


class LocationSummaryReport(BaseModel):
    key: str
    label: str
    sessions: int
    day_sessions: int
    night_sessions: int
    msisdns: list[str] = Field(default_factory=list)
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    latitude: float | None = None
    longitude: float | None = None


class PoiSummaryReport(BaseModel):
    msisdn: str
    total_sessions: int
    p2p: int
    relay: int
    unknown: int
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    total_bytes: int
    imeis: list[str] = Field(default_factory=list)
    applications: list[dict[str, Any]] = Field(default_factory=list)
    top_destinations: list[dict[str, Any]] = Field(default_factory=list)


class IpSummaryReport(BaseModel):
    destination_ip: str
    total_sessions: int
    msisdns: list[str] = Field(default_factory=list)
    ports: list[int] = Field(default_factory=list)
    operator: str
    classification: Classification
    first_seen: datetime | None = None
    last_seen: datetime | None = None
    total_bytes: int