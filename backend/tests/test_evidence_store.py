from pathlib import Path

import pytest

from app.schemas.core import ExtractionRequest
from app.services.evidence_store import EvidenceStore, UploadValidationError

FIXTURES = Path(__file__).parent / "fixtures"


def read_fixture(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def test_ingest_valid_ipdr_file_persists_sessions_and_packages(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    upload = evidence_store.ingest_upload("valid_ipdr.csv", read_fixture("valid_ipdr.csv"))

    assert upload.status == "completed"
    assert upload.rows_total == 6
    assert upload.rows_valid == 6
    assert upload.rows_quarantined == 0
    assert upload.format_report is not None
    assert upload.format_report.parser_engine == "polars"
    assert upload.format_report.file_format == "csv"
    assert upload.format_report.delimiter == ","
    assert upload.format_report.adapter == "Generic Canonical"
    assert evidence_store.dashboard_stats().sessions == 6

    extraction = evidence_store.create_extraction(ExtractionRequest(msisdn="919876543210"))

    assert extraction.total_sessions == 3
    assert extraction.actionable_count == 2
    assert extraction.relay_count == 1
    assert evidence_store.list_packages()

    reloaded_store = EvidenceStore(tmp_path)
    assert reloaded_store.dashboard_stats().sessions == 6
    assert reloaded_store.list_extractions()[0].id == extraction.id


def test_operator_variant_tsv_columns_are_normalized(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    upload = evidence_store.ingest_upload("operator_variant_ipdr.tsv", read_fixture("operator_variant_ipdr.tsv"))
    sessions = evidence_store.list_sessions(msisdn="918888001111", limit=10)

    assert upload.status == "completed"
    assert upload.rows_valid == 2
    assert upload.format_report is not None
    assert upload.format_report.file_format == "tsv"
    assert upload.format_report.adapter == "Vodafone Idea"
    assert {session.classification for session in sessions} == {"p2p", "relay"}


def test_malformed_rows_are_quarantined_without_hiding_valid_rows(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    upload = evidence_store.ingest_upload("malformed_ipdr.csv", read_fixture("malformed_ipdr.csv"))

    assert upload.status == "completed"
    assert upload.rows_total == 5
    assert upload.rows_valid == 1
    assert upload.rows_quarantined == 4
    assert evidence_store.dashboard_stats().sessions == 1
    assert {item.field for item in upload.quarantine_errors} >= {"msisdn", "destination_ip", "destination_port", "duration_seconds"}


def test_empty_upload_is_rejected(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    with pytest.raises(UploadValidationError, match="empty"):
        evidence_store.ingest_upload("empty.csv", b"")


def test_missing_required_columns_are_rejected(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    with pytest.raises(UploadValidationError, match="Missing required column"):
        evidence_store.ingest_upload("bad.csv", b"phone,ip,port\n1,2,3\n")

def test_communication_graph_is_aggregated_for_filtered_msisdn(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)
    evidence_store.ingest_upload("valid_ipdr.csv", read_fixture("valid_ipdr.csv"))

    graph = evidence_store.communication_graph(msisdn="919876543210")

    assert graph.metrics.sessions == 3
    assert graph.metrics.nodes == 4
    assert graph.metrics.edges == 3
    assert graph.metrics.p2p == 2
    assert graph.metrics.relay == 1
    assert {node.kind for node in graph.nodes} >= {"source", "p2p", "relay"}
    assert all(link.sessions for link in graph.links)


def test_suspicious_patterns_detect_short_window_burst(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)
    evidence_store.ingest_upload("valid_ipdr.csv", read_fixture("valid_ipdr.csv"))

    patterns = evidence_store.suspicious_patterns()

    burst = next(item for item in patterns if item.pattern_type == "burst_activity")
    assert burst.severity == "medium"
    assert burst.entities["msisdn"] == "919876543210"
    assert burst.entities["session_count"] == 3