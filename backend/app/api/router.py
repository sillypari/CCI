from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.config import get_settings
from app.schemas.core import (
    AuditLogEntry,
    DashboardStats,
    ExtractionRequest,
    ExtractionResult,
    PlatformRange,
    QuarantineRecord,
    RequestPackage,
    SearchResult,
    SessionRecord,
    UploadStatus,
)
from app.services.evidence_store import EvidenceStoreError, UploadValidationError, store

api_router = APIRouter()


@api_router.get("/dashboard/stats", response_model=DashboardStats, tags=["dashboard"])
async def dashboard_stats() -> DashboardStats:
    return store.dashboard_stats()


@api_router.get("/uploads", response_model=list[UploadStatus], tags=["uploads"])
async def list_uploads() -> list[UploadStatus]:
    return store.list_uploads()


@api_router.post("/uploads", response_model=UploadStatus, tags=["uploads"])
async def upload_file(file: UploadFile = File(...)) -> UploadStatus:
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
        return store.ingest_upload(file.filename or "ipdr_upload.csv", content)
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
    limit: int = Query(default=100, ge=1, le=10_000),
    offset: int = Query(default=0, ge=0),
) -> list[SessionRecord]:
    return store.list_sessions(q=q, msisdn=msisdn, classification=classification, limit=limit, offset=offset)


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