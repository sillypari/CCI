from pathlib import Path

import pytest

from app.schemas.core import CaseCreate, ExtractionRequest, ImportSpecCreate
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

def test_case_scoped_import_spec_and_investigation_reports(tmp_path: Path) -> None:
    evidence_store = EvidenceStore(tmp_path)
    case = evidence_store.create_case(
        CaseCreate(
            name="Shared app investigation",
            crime_type="Cybercrime",
            io_name="IO Test",
            targets=["919000000001", "919000000002"],
            tags=["reports"],
        )
    )
    spec = evidence_store.create_import_spec(
        ImportSpecCreate(
            name="Operator custom report",
            mapping={
                "msisdn": "Subscriber",
                "source_ip": "Src",
                "source_port": "SPort",
                "destination_ip": "Dst",
                "destination_port": "DPort",
                "started_at": "Start",
                "duration_seconds": "Duration",
                "bytes_up": "Up",
                "bytes_down": "Down",
                "protocol": "Proto",
                "imei": "Handset",
                "cell_id": "Cell",
                "domain": "Host",
            },
        )
    )
    content = "\n".join(
        [
            "Subscriber,Src,SPort,Dst,DPort,Start,Duration,Up,Down,Proto,Handset,Cell,Host,City,State,Country,Latitude,Longitude",
            "919000000001,10.20.1.2,49152,49.36.128.45,45892,2026-07-03T10:00:00+05:30,120,1000,5000,UDP,356789012345678,CELL-101,media.example,Gwalior,Madhya Pradesh,India,26.2183,78.1828",
            "919000000002,10.20.1.3,49153,49.36.128.46,45893,2026-07-03T23:30:00+05:30,180,1200,5200,UDP,356789012345678,CELL-101,media.example,Gwalior,Madhya Pradesh,India,26.2183,78.1828",
        ]
    ).encode("utf-8")

    upload = evidence_store.ingest_upload("operator_custom.csv", content, case_id=case.id, import_spec_id=spec.id)
    sessions = evidence_store.list_sessions(case_id=case.id, domain="media", cell_id="CELL-101", limit=10)
    common_apps = evidence_store.common_applications(case_id=case.id)
    imeis = evidence_store.imei_frequency(case_id=case.id)
    locations = evidence_store.location_summary(case_id=case.id)
    csv_export = evidence_store.export_sessions_csv(case_id=case.id)

    assert upload.case_id == case.id
    assert upload.import_spec_id == spec.id
    assert upload.rows_valid == 2
    assert len(sessions) == 2
    assert {session.domain for session in sessions} == {"media.example"}
    assert common_apps[0].sessions == 2
    assert sorted(common_apps[0].poi_msisdns) == ["919000000001", "919000000002"]
    assert imeis[0].imei == "356789012345678"
    assert len(imeis[0].msisdns) == 2
    assert locations[0].key == "CELL-101"
    assert locations[0].day_sessions == 1
    assert locations[0].night_sessions == 1
    assert "domain" in csv_export and "cell_id" in csv_export
