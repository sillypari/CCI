from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status

from app.config import get_settings
from app.schemas.core import (
    ApplicationSummary,
    AuditLogEntry,
    CaseCreate,
    CaseRecord,
    CommunicationGraph,
    CommonApplicationReport,
    DashboardStats,
    ExtractionRequest,
    ExtractionResult,
    ImportSpecCreate,
    ImportSpecification,
    ImeiFrequencyReport,
    IpSummaryReport,
    LocationSummaryReport,
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
from app.services.evidence_store import EvidenceStoreError, UploadValidationError, store

api_router = APIRouter()


@api_router.get("/dashboard/stats", response_model=DashboardStats, tags=["dashboard"])
async def dashboard_stats() -> DashboardStats:
    return store.dashboard_stats()



@api_router.get("/cases", response_model=list[CaseRecord], tags=["cases"])
async def list_cases() -> list[CaseRecord]:
    return store.list_cases()


@api_router.post("/cases", response_model=CaseRecord, tags=["cases"])
async def create_case(payload: CaseCreate) -> CaseRecord:
    try:
        return store.create_case(payload)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@api_router.get("/import-specs", response_model=list[ImportSpecification], tags=["import-specs"])
async def list_import_specs() -> list[ImportSpecification]:
    return store.list_import_specs()


@api_router.post("/import-specs", response_model=ImportSpecification, tags=["import-specs"])
async def create_import_spec(payload: ImportSpecCreate) -> ImportSpecification:
    return store.create_import_spec(payload)

@api_router.get("/uploads", response_model=list[UploadStatus], tags=["uploads"])
async def list_uploads() -> list[UploadStatus]:
    return store.list_uploads()


@api_router.post("/uploads", response_model=UploadStatus, tags=["uploads"])
async def upload_file(
    file: UploadFile = File(...),
    case_id: str | None = Form(default=None),
    import_spec_id: str | None = Form(default=None),
) -> UploadStatus:
    settings = get_settings()
    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty")
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file exceeds {settings.max_upload_bytes} bytes",
        )
    try:
        return store.ingest_upload(file.filename or "ipdr_upload.csv", content, case_id=case_id, import_spec_id=import_spec_id)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except EvidenceStoreError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@api_router.get("/uploads/{upload_id}/status", response_model=UploadStatus, tags=["uploads"])
async def upload_status(upload_id: str) -> UploadStatus:
    upload = store.get_upload(upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    return upload


@api_router.get("/uploads/{upload_id}/quarantine", response_model=list[QuarantineRecord], tags=["uploads"])
async def upload_quarantine(upload_id: str) -> list[QuarantineRecord]:
    quarantine = store.get_upload_quarantine(upload_id)
    if quarantine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    return quarantine


@api_router.get("/sessions", response_model=list[SessionRecord], tags=["sessions"])
async def list_sessions(
    q: str | None = None,
    msisdn: str | None = None,
    classification: str | None = Query(default=None, pattern="^(p2p|relay|unknown)$"),
    case_id: str | None = None,
    destination_ip: str | None = None,
    imei: str | None = None,
    app: str | None = None,
    domain: str | None = None,
    cell_id: str | None = None,
    started_from: str | None = None,
    started_to: str | None = None,
    limit: int = Query(default=100, ge=1, le=10_000),
    offset: int = Query(default=0, ge=0),
) -> list[SessionRecord]:
    return store.list_sessions(q=q, msisdn=msisdn, classification=classification, case_id=case_id, destination_ip=destination_ip, imei=imei, app=app, domain=domain, cell_id=cell_id, started_from=started_from, started_to=started_to, limit=limit, offset=offset)


@api_router.get("/sessions/{session_id}", response_model=SessionRecord, tags=["sessions"])
async def get_session(session_id: str) -> SessionRecord:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@api_router.post("/extract", response_model=ExtractionResult, tags=["extractions"])
async def create_extraction(request: ExtractionRequest) -> ExtractionResult:
    try:
        result = store.create_extraction(request)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result.total_sessions == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No sessions found for the supplied MSISDN")
    return result


@api_router.get("/extractions", response_model=list[ExtractionResult], tags=["extractions"])
async def list_extractions() -> list[ExtractionResult]:
    return store.list_extractions()


@api_router.get("/extractions/{extraction_id}", response_model=ExtractionResult, tags=["extractions"])
async def get_extraction(extraction_id: str) -> ExtractionResult:
    extraction = store.get_extraction(extraction_id)
    if extraction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction not found")
    return extraction



@api_router.get("/graph", response_model=CommunicationGraph, tags=["graph"])
async def communication_graph(
    msisdn: str | None = None,
    case_id: str | None = None,
    classification: str | None = Query(default=None, pattern="^(p2p|relay|unknown)$"),
    limit: int = Query(default=5_000, ge=1, le=20_000),
) -> CommunicationGraph:
    return store.communication_graph(msisdn=msisdn, classification=classification, case_id=case_id, limit=limit)


@api_router.get("/analytics/patterns", response_model=list[SuspiciousPattern], tags=["analytics"])
async def suspicious_patterns(limit: int = Query(default=50, ge=1, le=100)) -> list[SuspiciousPattern]:
    return store.suspicious_patterns(limit=limit)


@api_router.get("/analytics/timeline", response_model=list[TimelinePoint], tags=["analytics"])
async def timeline(
    bucket: str = Query(default="hour", pattern="^(year|month|day|hour|minute|second)$"),
    case_id: str | None = None,
    msisdn: str | None = None,
) -> list[TimelinePoint]:
    return store.timeline(bucket=bucket, case_id=case_id, msisdn=msisdn)


@api_router.get("/analytics/applications", response_model=list[ApplicationSummary], tags=["analytics"])
async def application_summary(case_id: str | None = None, limit: int = Query(default=10, ge=1, le=100)) -> list[ApplicationSummary]:
    return store.application_summary(case_id=case_id, limit=limit)


@api_router.get("/reports/poi/{msisdn}", response_model=PoiSummaryReport, tags=["reports"])
async def poi_summary(msisdn: str, case_id: str | None = None) -> PoiSummaryReport:
    return store.poi_summary(msisdn=msisdn, case_id=case_id)


@api_router.get("/reports/ip/{destination_ip}", response_model=IpSummaryReport, tags=["reports"])
async def ip_summary(destination_ip: str, case_id: str | None = None) -> IpSummaryReport:
    return store.ip_summary(destination_ip=destination_ip, case_id=case_id)



@api_router.get("/reports/common-applications", response_model=list[CommonApplicationReport], tags=["reports"])
async def common_applications(case_id: str | None = None, msisdns: str | None = None, limit: int = Query(default=10, ge=1, le=100)) -> list[CommonApplicationReport]:
    targets = [item.strip() for item in (msisdns or "").split(",") if item.strip()]
    return store.common_applications(case_id=case_id, msisdns=targets or None, limit=limit)


@api_router.get("/reports/imei-frequency", response_model=list[ImeiFrequencyReport], tags=["reports"])
async def imei_frequency(case_id: str | None = None, msisdn: str | None = None, limit: int = Query(default=20, ge=1, le=100)) -> list[ImeiFrequencyReport]:
    return store.imei_frequency(case_id=case_id, msisdn=msisdn, limit=limit)


@api_router.get("/reports/location-summary", response_model=list[LocationSummaryReport], tags=["reports"])
async def location_summary(case_id: str | None = None, msisdn: str | None = None, limit: int = Query(default=20, ge=1, le=100)) -> list[LocationSummaryReport]:
    return store.location_summary(case_id=case_id, msisdn=msisdn, limit=limit)


@api_router.get("/reports/sessions.csv", tags=["reports"])
async def export_sessions_csv(case_id: str | None = None) -> Response:
    return Response(content=store.export_sessions_csv(case_id=case_id), media_type="text/csv")


@api_router.get("/packages", response_model=list[RequestPackage], tags=["packages"])
async def list_packages() -> list[RequestPackage]:
    return store.list_packages()


@api_router.get("/audit-logs", response_model=list[AuditLogEntry], tags=["audit"])
async def audit_logs(limit: int = Query(default=100, ge=1, le=1000)) -> list[AuditLogEntry]:
    return store.list_audit_logs(limit=limit)


@api_router.get("/search", response_model=list[SearchResult], tags=["search"])
async def search(q: str = Query(min_length=1), limit: int = Query(default=20, ge=1, le=100)) -> list[SearchResult]:
    return store.search(q=q, limit=limit)


@api_router.get("/platform-ranges", response_model=list[PlatformRange], tags=["settings"])
async def platform_ranges() -> list[PlatformRange]:
    return store.list_platform_ranges()


@api_router.post("/platform-ranges", response_model=PlatformRange, tags=["settings"])
async def add_platform_range(range_item: PlatformRange) -> PlatformRange:
    try:
        return store.add_platform_range(range_item)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc