from fastapi import APIRouter, File, Form, HTTPException, Query, Response, UploadFile, status

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
from app.services.evidence_store import EvidenceStoreError, UploadValidationError, store
from app.services.export_service import ExportService

api_router = APIRouter()
export_service = ExportService()


@api_router.get("/dashboard/stats", response_model=DashboardStats, tags=["dashboard"])
def dashboard_stats() -> DashboardStats:
    return store.dashboard_stats()


@api_router.get("/cases", response_model=list[CaseRecord], tags=["cases"])
def list_cases() -> list[CaseRecord]:
    return store.list_cases()


@api_router.post("/cases", response_model=CaseRecord, tags=["cases"])
def create_case(payload: CaseCreate) -> CaseRecord:
    try:
        return store.create_case(payload)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


@api_router.delete("/cases/{case_id}", response_model=CaseRecord, tags=["cases"])
def delete_case(case_id: str) -> CaseRecord:
    case = store.delete_case(case_id)
    if case is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Case not found or protected")
    return case


@api_router.get("/import-specs", response_model=list[ImportSpecification], tags=["import-specs"])
def list_import_specs() -> list[ImportSpecification]:
    return store.list_import_specs()


@api_router.post("/import-specs", response_model=ImportSpecification, tags=["import-specs"])
def create_import_spec(payload: ImportSpecCreate) -> ImportSpecification:
    return store.create_import_spec(payload)

@api_router.get("/uploads", response_model=list[UploadStatus], tags=["uploads"])
def list_uploads() -> list[UploadStatus]:
    return store.list_uploads()


@api_router.post("/uploads", response_model=UploadStatus, tags=["uploads"])
def upload_file(
    file: UploadFile = File(...),
    case_id: str | None = Form(default=None),
    import_spec_id: str | None = Form(default=None),
) -> UploadStatus:
    settings = get_settings()
    content = file.file.read()
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


@api_router.get("/uploads/jobs", response_model=list[IngestionJob], tags=["uploads"])
def list_ingestion_jobs() -> list[IngestionJob]:
    return store.list_jobs()


@api_router.get("/uploads/jobs/{job_id}", response_model=IngestionJob, tags=["uploads"])
def ingestion_job(job_id: str) -> IngestionJob:
    job = store.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingestion job not found")
    return job

@api_router.delete("/uploads/jobs/{job_id}", tags=["uploads"])
def delete_ingestion_job(job_id: str) -> dict[str, str]:
    if store.delete_job(job_id):
        return {"status": "success", "message": "Job deleted"}
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

@api_router.delete("/uploads/jobs", tags=["uploads"])
def clear_ingestion_jobs() -> dict[str, str]:
    store.clear_jobs()
    return {"status": "success", "message": "Job history cleared"}


@api_router.post("/uploads/validate", response_model=AdapterValidationReport, tags=["uploads"])
def validate_upload(
    file: UploadFile = File(...),
    import_spec_id: str | None = Form(None),
) -> AdapterValidationReport:
    try:
        content = file.file.read()
        return store.validate_upload(file.filename, content, import_spec_id=import_spec_id)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

@api_router.post("/uploads/auto-suggest-mapping", tags=["uploads"])
def auto_suggest_mapping(file: UploadFile = File(...)) -> dict[str, str]:
    content = file.file.read(2048)
    text = content.decode('utf-8', errors='ignore')
    first_line = text.split('\n')[0]
    delimiter = ',' if ',' in first_line else '\t' if '\t' in first_line else ';'
    columns = [c.strip('"\' ') for c in first_line.split(delimiter) if c.strip()]
    return store.auto_suggest_mapping(columns)


@api_router.delete("/uploads/{upload_id}", response_model=UploadStatus, tags=["uploads"])
def delete_upload(upload_id: str) -> UploadStatus:
    upload = store.delete_upload(upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    return upload


@api_router.get("/uploads/{upload_id}/status", response_model=UploadStatus, tags=["uploads"])
def upload_status(upload_id: str) -> UploadStatus:
    upload = store.get_upload(upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    return upload


@api_router.get("/uploads/{upload_id}/quarantine", response_model=list[QuarantineRecord], tags=["uploads"])
def upload_quarantine(upload_id: str) -> list[QuarantineRecord]:
    quarantine = store.get_upload_quarantine(upload_id)
    if quarantine is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found")
    return quarantine


@api_router.get("/sessions", response_model=list[SessionRecord], tags=["sessions"])
def list_sessions(
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
def get_session(session_id: str) -> SessionRecord:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@api_router.post("/extract", response_model=ExtractionResult, tags=["extractions"])
def create_extraction(request: ExtractionRequest) -> ExtractionResult:
    try:
        result = store.create_extraction(request)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if result.total_sessions == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No sessions found for the supplied MSISDN")
    return result


@api_router.get("/extractions", response_model=list[ExtractionResult], tags=["extractions"])
def list_extractions() -> list[ExtractionResult]:
    return store.list_extractions()


@api_router.get("/extractions/{extraction_id}", response_model=ExtractionResult, tags=["extractions"])
def get_extraction(extraction_id: str) -> ExtractionResult:
    extraction = store.get_extraction(extraction_id)
    if extraction is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Extraction not found")
    return extraction



@api_router.get("/graph", response_model=CommunicationGraph, tags=["graph"])
def communication_graph(
    msisdn: str | None = None,
    case_id: str | None = None,
    classification: str | None = Query(default=None, pattern="^(p2p|relay|unknown)$"),
    limit: int = Query(default=250, ge=1, le=5_000),
    scan_limit: int = Query(default=20_000, ge=1, le=100_000),
) -> CommunicationGraph:
    return store.communication_graph(msisdn=msisdn, classification=classification, case_id=case_id, limit=limit, scan_limit=scan_limit)

@api_router.get("/graph/export.json", tags=["graph"])
def export_graph_json(
    msisdn: str | None = None,
    case_id: str | None = None,
    classification: str | None = Query(default=None, pattern="^(p2p|relay|unknown)$"),
    limit: int = Query(default=5_000, ge=1, le=20_000),
) -> Response:
    return Response(
        content=store.export_graph_json(msisdn=msisdn, classification=classification, case_id=case_id, limit=limit),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=pramaan-ipdr-graph.json"},
    )


@api_router.get("/graph/export.graphml", tags=["graph"])
def export_graph_graphml(
    msisdn: str | None = None,
    case_id: str | None = None,
    classification: str | None = Query(default=None, pattern="^(p2p|relay|unknown)$"),
    limit: int = Query(default=5_000, ge=1, le=20_000),
) -> Response:
    return Response(
        content=store.export_graph_graphml(msisdn=msisdn, classification=classification, case_id=case_id, limit=limit),
        media_type="application/graphml+xml",
        headers={"Content-Disposition": "attachment; filename=pramaan-ipdr-graph.graphml"},
    )


@api_router.get("/analytics/patterns", response_model=list[SuspiciousPattern], tags=["analytics"])
def suspicious_patterns(limit: int = Query(default=50, ge=1, le=100)) -> list[SuspiciousPattern]:
    return store.suspicious_patterns(limit=limit)


@api_router.get("/analytics/timeline", response_model=list[TimelinePoint], tags=["analytics"])
def timeline(
    bucket: str = Query(default="hour", pattern="^(year|month|day|hour|minute|second)$"),
    case_id: str | None = None,
    msisdn: str | None = None,
) -> list[TimelinePoint]:
    return store.timeline(bucket=bucket, case_id=case_id, msisdn=msisdn)


@api_router.get("/analytics/applications", response_model=list[ApplicationSummary], tags=["analytics"])
def application_summary(case_id: str | None = None, limit: int = Query(default=10, ge=1, le=100)) -> list[ApplicationSummary]:
    return store.application_summary(case_id=case_id, limit=limit)


@api_router.get("/reports/poi/{msisdn}.csv", tags=["reports"])
def export_poi_csv(msisdn: str, case_id: str | None = None) -> Response:
    return Response(
        content=store.export_poi_csv(msisdn=msisdn, case_id=case_id),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=poi-{msisdn}.csv"},
    )


@api_router.get("/reports/poi/{msisdn}.html", tags=["reports"])
def export_poi_html(msisdn: str, case_id: str | None = None) -> Response:
    return Response(
        content=store.export_poi_html(msisdn=msisdn, case_id=case_id),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename=poi-{msisdn}.html"},
    )

@api_router.get("/reports/poi/{msisdn}.pdf", tags=["reports"])
def export_poi_pdf(msisdn: str, case_id: str | None = None) -> Response:
    poi_data = store.poi_summary(msisdn=msisdn, case_id=case_id).model_dump()
    poi_data["sessions"] = [s.model_dump() for s in store.list_sessions(msisdn=msisdn, case_id=case_id, limit=50)]
    pdf_bytes = export_service.export_poi_pdf(poi_data, filename=f"poi_{msisdn}.pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=poi-{msisdn}.pdf"},
    )


@api_router.get("/reports/ip/{destination_ip}.csv", tags=["reports"])
def export_ip_csv(destination_ip: str, case_id: str | None = None) -> Response:
    return Response(
        content=store.export_ip_csv(destination_ip=destination_ip, case_id=case_id),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=ip-{destination_ip}.csv"},
    )


@api_router.get("/reports/ip/{destination_ip}.html", tags=["reports"])
def export_ip_html(destination_ip: str, case_id: str | None = None) -> Response:
    return Response(
        content=store.export_ip_html(destination_ip=destination_ip, case_id=case_id),
        media_type="text/html",
        headers={"Content-Disposition": f"attachment; filename=ip-{destination_ip}.html"},
    )


@api_router.get("/reports/poi/{msisdn}", response_model=PoiSummaryReport, tags=["reports"])
def poi_summary(msisdn: str, case_id: str | None = None) -> PoiSummaryReport:
    return store.poi_summary(msisdn=msisdn, case_id=case_id)


@api_router.get("/reports/ip/{destination_ip}", response_model=IpSummaryReport, tags=["reports"])
def ip_summary(destination_ip: str, case_id: str | None = None) -> IpSummaryReport:
    return store.ip_summary(destination_ip=destination_ip, case_id=case_id)



@api_router.get("/reports/common-applications", response_model=list[CommonApplicationReport], tags=["reports"])
def common_applications(case_id: str | None = None, msisdns: str | None = None, limit: int = Query(default=10, ge=1, le=100)) -> list[CommonApplicationReport]:
    targets = [item.strip() for item in (msisdns or "").split(",") if item.strip()]
    return store.common_applications(case_id=case_id, msisdns=targets or None, limit=limit)

@api_router.get("/reports/whatsapp/{msisdn}", response_model=list[SessionRecord], tags=["reports"])
def whatsapp_bparty_report(msisdn: str, case_id: str | None = None) -> list[SessionRecord]:
    # Custom filter for WhatsApp relay sessions
    sessions = store.list_sessions(msisdn=msisdn, case_id=case_id, limit=1000)
    return [s for s in sessions if "WhatsApp" in s.app_hint or "Meta" in s.app_hint or "WhatsApp" in s.operator or "Meta" in s.operator]

@api_router.get("/reports/common-whatsapp", response_model=list[CommonApplicationReport], tags=["reports"])
def common_whatsapp(case_id: str | None = None, msisdns: str | None = None, limit: int = Query(default=10, ge=1, le=100)) -> list[CommonApplicationReport]:
    targets = [item.strip() for item in (msisdns or "").split(",") if item.strip()]
    common_apps = store.common_applications(case_id=case_id, msisdns=targets or None, limit=limit)
    return [app for app in common_apps if "WhatsApp" in app.name or "Meta" in app.name]


@api_router.get("/reports/imei-frequency", response_model=list[ImeiFrequencyReport], tags=["reports"])
def imei_frequency(case_id: str | None = None, msisdn: str | None = None, limit: int = Query(default=20, ge=1, le=100)) -> list[ImeiFrequencyReport]:
    return store.imei_frequency(case_id=case_id, msisdn=msisdn, limit=limit)


@api_router.get("/reports/location-summary", response_model=list[LocationSummaryReport], tags=["reports"])
def location_summary(case_id: str | None = None, msisdn: str | None = None, limit: int = Query(default=20, ge=1, le=100)) -> list[LocationSummaryReport]:
    return store.location_summary(case_id=case_id, msisdn=msisdn, limit=limit)


@api_router.get("/reports/sessions.csv", tags=["reports"])
def export_sessions_csv(case_id: str | None = None) -> Response:
    return Response(content=store.export_sessions_csv(case_id=case_id), media_type="text/csv")

@api_router.get("/reports/sessions.xlsx", tags=["reports"])
def export_sessions_xlsx(case_id: str | None = None) -> Response:
    sessions = [s.model_dump() for s in store.list_sessions(case_id=case_id, limit=10000)]
    xlsx_bytes = export_service.export_xlsx({"Sessions": sessions}, filename="sessions.xlsx")
    return Response(
        content=xlsx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=sessions.xlsx"},
    )


@api_router.get("/packages", response_model=list[RequestPackage], tags=["packages"])
def list_packages() -> list[RequestPackage]:
    return store.list_packages()


@api_router.get("/audit-logs", response_model=list[AuditLogEntry], tags=["audit"])
def audit_logs(limit: int = Query(default=100, ge=1, le=1000)) -> list[AuditLogEntry]:
    return store.list_audit_logs(limit=limit)


@api_router.get("/search", response_model=list[SearchResult], tags=["search"])
def search(q: str = Query(min_length=1), limit: int = Query(default=20, ge=1, le=100)) -> list[SearchResult]:
    return store.search(q=q, limit=limit)


@api_router.get("/persistence/status", response_model=PersistenceStatus, tags=["persistence"])
def persistence_status() -> PersistenceStatus:
    return store.persistence_status()


@api_router.post("/persistence/snapshot", response_model=PersistenceStatus, tags=["persistence"])
def create_persistence_snapshot() -> PersistenceStatus:
    return store.write_sqlite_snapshot()


@api_router.post("/persistence/reset", response_model=PersistenceStatus, tags=["persistence"])
def reset_persistence() -> PersistenceStatus:
    store.reset_store()
    return store.persistence_status()


@api_router.get("/platform-ranges", response_model=list[PlatformRange], tags=["settings"])
def platform_ranges() -> list[PlatformRange]:
    return store.list_platform_ranges()


@api_router.post("/platform-ranges", response_model=PlatformRange, tags=["settings"])
def add_platform_range(range_item: PlatformRange) -> PlatformRange:
    try:
        return store.add_platform_range(range_item)
    except UploadValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc