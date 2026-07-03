from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app
from app.services.evidence_store import EvidenceStore

FIXTURES = Path(__file__).parent / "fixtures"


def test_upload_extract_and_quarantine_api_flow(tmp_path: Path, monkeypatch) -> None:
    import app.api.router as router

    monkeypatch.setattr(router, "store", EvidenceStore(tmp_path))
    client = TestClient(create_app())

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    with (FIXTURES / "valid_ipdr.csv").open("rb") as handle:
        upload_response = client.post("/api/uploads", files={"file": ("valid_ipdr.csv", handle, "text/csv")})
    assert upload_response.status_code == 200
    upload = upload_response.json()
    assert upload["rows_valid"] == 6

    sessions = client.get("/api/sessions", params={"msisdn": "919876543210", "classification": "p2p"})
    assert sessions.status_code == 200
    assert len(sessions.json()) == 2

    graph = client.get("/api/graph", params={"msisdn": "919876543210"})
    assert graph.status_code == 200
    assert graph.json()["metrics"]["sessions"] == 3
    assert graph.json()["links"]

    patterns = client.get("/api/analytics/patterns")
    assert patterns.status_code == 200
    assert any(item["pattern_type"] == "burst_activity" for item in patterns.json())

    extraction = client.post("/api/extract", json={"msisdn": "919876543210", "depth": 1, "min_confidence": 0.65})
    assert extraction.status_code == 200
    assert extraction.json()["actionable_count"] == 2

    packages = client.get("/api/packages")
    assert packages.status_code == 200
    assert packages.json()


def test_api_rejects_empty_upload_with_clear_error(tmp_path: Path, monkeypatch) -> None:
    import app.api.router as router

    monkeypatch.setattr(router, "store", EvidenceStore(tmp_path))
    client = TestClient(create_app())

    response = client.post("/api/uploads", files={"file": ("empty.csv", b"", "text/csv")})

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file is empty"