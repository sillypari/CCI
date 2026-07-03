from app.schemas.core import ExtractionRequest
from app.services.demo_store import DemoStore


def test_extraction_creates_actionable_candidates() -> None:
    demo_store = DemoStore()

    extraction = demo_store.create_extraction(ExtractionRequest(msisdn="919876543210"))

    assert extraction.total_sessions >= 1
    assert extraction.actionable_count >= 1
    assert demo_store.list_packages()

