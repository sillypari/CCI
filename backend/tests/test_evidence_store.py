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
    sessions = evidence_store.list_sessions(msisdn="919876543210", limit=10)

    assert upload.status == "completed"
    assert upload.rows_total == 6
    assert upload.rows_valid == 6
    assert upload.rows_quarantined == 0
    assert upload.format_report is not None
    assert upload.format_report.parser_engine == "polars"
    assert upload.format_report.file_format == "csv"
    assert upload.format_report.delimiter == ","
    assert evidence_store.dashboard_stats().sessions == 6
    assert sessions[0].source_ip is not None
    assert sessions[0].source_port is not None
    assert {session.record_type for session in sessions} >= {"ipdr", "ipdr_nat"}

    extraction = evidence_store.create_extraction(ExtractionRequest(msisdn="919876543210"))

    assert extraction.total_sessions == 3
    assert extraction.actionable_count == 2
    assert extraction.relay_count == 1
    assert any(candidate.source_ip for candidate in extraction.candidates)
    packages = evidence_store.list_packages()
    assert packages
    assert "source_ip" in packages[0].payload
    assert "translated_ip" in packages[0].payload

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
    assert all(session.source_ip == "10.55.1.18" for session in sessions)


def test_dot_nat_syslog_keeps_translation_separate_from_b_party(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    upload = evidence_store.ingest_upload("dot_nat_syslog.csv", read_fixture("dot_nat_syslog.csv"))
    sessions = evidence_store.list_sessions(msisdn="919876543210", limit=10)
    graph = evidence_store.communication_graph(msisdn="919876543210")
    extraction = evidence_store.create_extraction(ExtractionRequest(msisdn="919876543210"))

    assert upload.status == "completed"
    assert upload.format_report is not None
    assert upload.format_report.adapter in {"DoT IPDR", "NAT SYSLOG"}
    assert upload.rows_valid == 2
    assert {session.record_type for session in sessions} == {"ipdr_nat"}
    assert {session.translated_ip for session in sessions} == {"49.37.10.21", "106.204.10.7"}
    assert {session.destination_ip for session in sessions} == {"49.36.128.45", "106.205.44.12"}
    assert {link.target_id for link in graph.links} == {"49.36.128.45", "106.205.44.12"}
    assert "49.37.10.21" not in {link.target_id for link in graph.links}
    assert all(candidate.translated_ip for candidate in extraction.candidates)


def test_translated_ip_without_destination_is_rejected(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    with pytest.raises(UploadValidationError, match="destination_ip"):
        evidence_store.ingest_upload("translated_only_not_bparty.csv", read_fixture("translated_only_not_bparty.csv"))


def test_malformed_rows_are_quarantined_without_hiding_valid_rows(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)

    upload = evidence_store.ingest_upload("malformed_ipdr.csv", read_fixture("malformed_ipdr.csv"))

    assert upload.status == "completed"
    assert upload.rows_total == 6
    assert upload.rows_valid == 1
    assert upload.rows_quarantined == 5
    assert evidence_store.dashboard_stats().sessions == 1
    assert {item.field for item in upload.quarantine_errors} >= {"msisdn", "source_ip", "destination_ip", "destination_port", "duration_seconds"}


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
    assert {link.target_id for link in graph.links} == {"49.36.128.45", "157.240.16.35", "106.205.44.12"}


def test_suspicious_patterns_detect_short_window_burst(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)
    evidence_store.ingest_upload("valid_ipdr.csv", read_fixture("valid_ipdr.csv"))

    patterns = evidence_store.suspicious_patterns()

    burst = next(item for item in patterns if item.pattern_type == "burst_activity")
    assert burst.severity == "medium"
    assert burst.entities["msisdn"] == "919876543210"
    assert burst.entities["session_count"] == 3