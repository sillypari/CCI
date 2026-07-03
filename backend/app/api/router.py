import asyncio

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

from app.schemas.core import (
    AuditLogEntry,
    DashboardStats,
    ExtractionRequest,
    ExtractionResult,
    PlatformRange,
    RequestPackage,
    SearchResult,
    SessionRecord,
    UploadStatus,
)
from app.services.demo_store import store

api_router = APIRouter()


@api_router.get("/dashboard/stats", response_model=DashboardStats, tags=["dashboard"])
async def dashboard_stats() -> DashboardStats:
    return store.dashboard_stats()


@api_router.get("/uploads", response_model=list[UploadStatus], tags=["uploads"])
async def list_uploads() -> list[UploadStatus]:
    return store.list_uploads()


@api_router.post("/uploads", response_model=UploadStatus, tags=["uploads"])
async def upload_file(file: UploadFile = File(...)) -> UploadStatus:
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return store.ingest_upload(file.filename or "ipdr_upload.csv", content)


@api_router.get("/uploads/{upload_id}/status", response_model=UploadStatus, tags=["uploads"])
async def upload_status(upload_id: str) -> UploadStatus:
    upload = store.get_upload(upload_id)
    if upload is None:
        raise HTTPException(status_code=404, detail="Upload not found")
    return upload


@api_router.get("/sessions", response_model=list[SessionRecord], tags=["sessions"])
async def list_sessions(
    q: str | None = None,
    msisdn: str | None = None,
    classification: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[SessionRecord]:
    return store.list_sessions(q=q, msisdn=msisdn, classification=classification, limit=limit, offset=offset)


@api_router.get("/sessions/{session_id}", response_model=SessionRecord, tags=["sessions"])
async def get_session(session_id: str) -> SessionRecord:
    session = store.get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@api_router.post("/extract", response_model=ExtractionResult, tags=["extractions"])
async def create_extraction(request: ExtractionRequest) -> ExtractionResult:
    result = store.create_extraction(request)
    if result.total_sessions == 0:
        raise HTTPException(status_code=404, detail="No sessions found for the supplied MSISDN")
    return result


@api_router.get("/extractions", response_model=list[ExtractionResult], tags=["extractions"])
async def list_extractions() -> list[ExtractionResult]:
    return store.list_extractions()


@api_router.get("/extractions/{extraction_id}", response_model=ExtractionResult, tags=["extractions"])
async def get_extraction(extraction_id: str) -> ExtractionResult:
    extraction = store.get_extraction(extraction_id)
    if extraction is None:
        raise HTTPException(status_code=404, detail="Extraction not found")
    return extraction


@api_router.get("/packages", response_model=list[RequestPackage], tags=["packages"])
async def list_packages() -> list[RequestPackage]:
    return store.list_packages()


@api_router.get("/audit-logs", response_model=list[AuditLogEntry], tags=["audit"])
async def audit_logs(limit: int = 100) -> list[AuditLogEntry]:
    return store.list_audit_logs(limit=limit)


@api_router.get("/search", response_model=list[SearchResult], tags=["search"])
async def search(q: str, limit: int = 20) -> list[SearchResult]:
    return store.search(q=q, limit=limit)


@api_router.get("/platform-ranges", response_model=list[PlatformRange], tags=["settings"])
async def platform_ranges() -> list[PlatformRange]:
    return store.list_platform_ranges()


@api_router.post("/platform-ranges", response_model=PlatformRange, tags=["settings"])
async def add_platform_range(range_item: PlatformRange) -> PlatformRange:
    return store.add_platform_range(range_item)


@api_router.websocket("/ws/progress")
async def progress_socket(websocket: WebSocket):
    await websocket.accept()
    try:
        for percent, stage in [(8, "queued"), (28, "detecting format"), (52, "normalizing"), (76, "classifying"), (100, "complete")]:
            await websocket.send_json({"type": "upload_progress", "percent": percent, "stage": stage})
            await asyncio.sleep(0.45)
    except WebSocketDisconnect:
        return

