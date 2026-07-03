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


class UploadStatus(BaseModel):
    id: str
    filename: str
    status: Literal["queued", "processing", "completed", "failed"]
    rows_total: int
    rows_valid: int
    rows_quarantined: int
    progress: int = Field(ge=0, le=100)
    created_at: datetime
    completed_at: datetime | None = None
    message: str | None = None
    quarantine_errors: list[QuarantineRecord] = Field(default_factory=list)


class SessionRecord(BaseModel):
    id: str
    upload_id: str
    a_party_msisdn: str
    destination_ip: str
    destination_port: int
    protocol: str
    started_at: datetime
    duration_seconds: int
    bytes_up: int
    bytes_down: int
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
    uploads: int
    sessions: int
    actionable: int
    relay: int
    unknown: int
    quarantined_rows: int
    avg_confidence: float
    latest_upload: UploadStatus | None = None


class ExtractionRequest(BaseModel):
    msisdn: str = Field(min_length=4)
    depth: int = Field(default=1, ge=1, le=2)
    min_confidence: float = Field(default=0.65, ge=0, le=1)


class ExtractionCandidate(BaseModel):
    session_id: str
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