from __future__ import annotations

import csv
import io
import json
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chardet
import polars as pl

from app.schemas.core import UploadFormatReport

REQUIRED_CANONICAL_COLUMNS = ("msisdn", "source_ip", "source_port", "destination_ip", "destination_port")

ADAPTER_PROFILES: dict[str, set[str]] = {
    "DoT IPDR": {"landline_msisdn_mdn_leased_circuit_id", "source_ip_address", "source_port", "destination_ip", "destination_port", "static_dynamic_ip_address_allocation"},
    "Fixed Line DSL": {"dsl_user_id", "session_start_time", "session_end_time", "source_public_ipv4", "source_private_ipv4", "source_private_port", "destination_ipv4", "destination_port", "mac_address", "user_type"},
    "NAT SYSLOG": {"start_date_time", "source_ip_address", "source_port", "translated_ip_address", "translated_port", "destination_ip_address", "destination_port"},
    "Airtel": {"a_party_msisdn", "source_ip", "source_port", "dest_ip", "dest_port", "session_duration", "uplink_bytes", "downlink_bytes"},
    "Jio": {"msisdn", "src_ip", "src_port", "translated_ip", "translated_port", "destination_ip", "destination_port"},
    "Vodafone Idea": {"subscriber", "private_ip", "private_port", "remote_ip", "remote_port", "tx_bytes", "rx_bytes"},
    "BSNL": {"mobile_number", "allocated_ip", "source_port", "server_ip", "server_port", "duration_sec"},
    "Generic Canonical": {"msisdn", "source_ip", "source_port", "destination_ip", "destination_port"},
}

COLUMN_ALIASES_FOR_REPORT = {
    "msisdn": {
        "msisdn",
        "a_party_msisdn",
        "a_number",
        "a_party",
        "subscriber",
        "subscriber_number",
        "calling_number",
        "calling_party",
        "mobile_number",
        "mdn",
        "landline_msisdn_mdn_leased_circuit_id",
        "landline_msisdn_mdn_leased_circuit_id_for_internet_access",
        "access_identifier",
        "dsl_user_id",
        "dsl_userid",
        "broadband_user_id",
        "internet_user_id",
        "pppoe_user_id",
        "radius_user_name",
        "username",
    },
    "source_ip": {
        "source_ip",
        "source_ip_address",
        "source_private_ip",
        "source_private_ipv4",
        "source_private_ipv6",
        "src_ip",
        "src_address",
        "private_ip",
        "subscriber_ip",
        "user_ip",
        "allocated_ip",
        "allocated_ip_address",
        "ip_address_allocated",
        "assigned_ip",
        "source_endpoint",
        "source_ip_port",
        "source_ip_address_with_source_port",
    },
    "source_port": {
        "source_port",
        "source_port_no",
        "source_port_number",
        "source_private_port",
        "source_private_port_no",
        "source_private_port_number",
        "src_port",
        "private_port",
        "subscriber_port",
        "user_port",
        "source_endpoint",
        "source_ip_port",
        "source_ip_address_with_source_port",
    },
    "destination_ip": {
        "destination_ip",
        "destination_ip_address",
        "destination_ipv4",
        "destination_ipv6",
        "dest_ip",
        "dst_ip",
        "dst_addr",
        "server_ip",
        "b_party_ip",
        "b_party_public_ip",
        "remote_ip",
        "remote_address",
        "peer_ip",
        "destination_endpoint",
        "destination_ip_port",
        "destination_ip_with_destination_port",
    },
    "destination_port": {
        "destination_port",
        "destination_port_no",
        "destination_port_number",
        "destination_ipv4_port",
        "destination_ipv6_port",
        "dest_port",
        "dst_port",
        "server_port",
        "b_party_port",
        "remote_port",
        "peer_port",
        "destination_endpoint",
        "destination_ip_port",
        "destination_ip_with_destination_port",
    },
}

SUPPORTED_ARCHIVE_SUFFIXES = {".csv", ".txt", ".tsv", ".json", ".xlsx", ".xls", ".zip"}


class IngestionError(Exception):
    """Raised when Polars cannot parse or describe the uploaded evidence."""


@dataclass(frozen=True)
class ParsedUpload:
    rows: list[dict[str, Any]]
    report: UploadFormatReport
    source_files: list[str]


def parse_ipdr_upload(filename: str, content: bytes) -> ParsedUpload:
    if not content:
        raise IngestionError("Uploaded file is empty")

    suffix = Path(filename).suffix.lower()
    if suffix == ".zip":
        return read_zip_archive(filename, content)
    if suffix == ".rar":
        raise IngestionError("RAR archives require a server-side extractor. Upload an extracted CSV/TSV/JSON/XLSX file or a ZIP archive.")

    encoding = detect_encoding(content)
    delimiter: str | None = None
    notes: list[str] = []

    try:
        if suffix in {".xlsx", ".xls"}:
            dataframe = read_excel(content)
            file_format = "excel"
        elif suffix == ".json" or content.lstrip()[:1] in {b"[", b"{"}:
            dataframe = read_json_records(content)
            file_format = "json"
        else:
            delimiter = detect_delimiter(content, encoding)
            dataframe = pl.read_csv(
                content,
                has_header=True,
                separator=delimiter,
                infer_schema=False,
                encoding=encoding,
                ignore_errors=False,
                truncate_ragged_lines=False,
                raise_if_empty=True,
            )
            file_format = delimiter_name(delimiter)
    except Exception as exc:  # Polars/encoding errors are converted into one controlled upload failure.
        raise IngestionError(f"Polars parser failed for {filename}: {exc}") from exc

    columns = [str(column) for column in dataframe.columns]
    normalized_columns = {normalize_key(column) for column in columns}
    missing_required = missing_canonical_columns(normalized_columns)
    adapter = detect_adapter(normalized_columns)

    if dataframe.height == 0:
        raise IngestionError("Polars parsed the file but found no data rows")
    if missing_required:
        notes.append("Required canonical evidence fields were not detected")

    report = UploadFormatReport(
        parser_engine="polars",
        file_format=file_format,
        delimiter=delimiter,
        adapter=adapter,
        encoding=encoding,
        columns=columns,
        rows_detected=dataframe.height,
        missing_required=missing_required,
        notes=notes,
    )
    return ParsedUpload(rows=dataframe.to_dicts(), report=report, source_files=[filename])


def read_zip_archive(filename: str, content: bytes) -> ParsedUpload:
    rows: list[dict[str, Any]] = []
    member_reports: list[UploadFormatReport] = []
    source_files: list[str] = []
    notes: list[str] = []
    try:
        archive = zipfile.ZipFile(io.BytesIO(content))
    except zipfile.BadZipFile as exc:
        raise IngestionError(f"ZIP archive is not readable: {exc}") from exc

    with archive:
        for member in archive.infolist():
            if member.is_dir():
                continue
            member_name = member.filename.replace("\\", "/")
            member_basename = Path(member_name).name
            if member_name.startswith("__MACOSX/") or member_basename.startswith("."):
                continue
            suffix = Path(member_name).suffix.lower()
            if suffix not in SUPPORTED_ARCHIVE_SUFFIXES:
                notes.append(f"Skipped unsupported archive member {member_name}")
                continue
            try:
                nested = parse_ipdr_upload(member_name, archive.read(member))
            except IngestionError as exc:
                notes.append(f"Skipped {member_name}: {exc}")
                continue
            for row in nested.rows:
                row["source_file"] = member_name
                rows.append(row)
            member_reports.append(nested.report)
            source_files.extend(nested.source_files or [member_name])

    if not rows:
        detail = "; ".join(notes) if notes else "No supported IPDR files were found inside the ZIP archive"
        raise IngestionError(detail)

    columns = sorted({column for report in member_reports for column in report.columns})
    missing_required = sorted({field for report in member_reports for field in report.missing_required})
    adapters = sorted({report.adapter for report in member_reports})
    report = UploadFormatReport(
        parser_engine="polars",
        file_format="zip",
        delimiter=None,
        adapter=adapters[0] if len(adapters) == 1 else "Archive Mixed",
        encoding="archive",
        columns=columns,
        rows_detected=len(rows),
        missing_required=missing_required,
        notes=[f"Archive members parsed: {len(member_reports)}", *notes],
    )
    return ParsedUpload(rows=rows, report=report, source_files=sorted(set(source_files)))


def read_json_records(content: bytes) -> pl.DataFrame:
    payload = json.loads(content.decode("utf-8-sig"))
    if isinstance(payload, dict):
        for key in ("records", "rows", "sessions", "data"):
            if isinstance(payload.get(key), list):
                payload = payload[key]
                break
    if not isinstance(payload, list):
        raise IngestionError("JSON upload must be a list of records or an object containing records/rows/sessions")
    if not all(isinstance(item, dict) for item in payload):
        raise IngestionError("Every JSON record must be an object")
    return pl.DataFrame(payload, infer_schema_length=0)


def read_excel(content: bytes) -> pl.DataFrame:
    dataframe = pl.read_excel(content, infer_schema_length=0)
    if isinstance(dataframe, dict):
        first_sheet = next(iter(dataframe.values()), None)
        if first_sheet is None:
            raise IngestionError("Excel workbook does not contain a readable sheet")
        return first_sheet
    return dataframe


def detect_encoding(content: bytes) -> str:
    if content.startswith(b"\xef\xbb\xbf"):
        return "utf8-lossy"
    result = chardet.detect(content[:65536])
    encoding = (result.get("encoding") or "utf-8").lower().replace("_", "-")
    if encoding in {"ascii", "utf-8", "utf8"}:
        return "utf8-lossy"
    if encoding in {"windows-1252", "cp1252"}:
        return "windows-1252"
    return "utf8-lossy"


def detect_delimiter(content: bytes, encoding: str) -> str:
    sample = content[:8192].decode("utf-8", errors="replace") if encoding == "utf8-lossy" else content[:8192].decode(encoding, errors="replace")
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",|\t;")
        return dialect.delimiter
    except csv.Error as exc:
        raise IngestionError("Could not detect a supported delimiter; expected CSV, TSV, pipe, or semicolon text") from exc


def delimiter_name(delimiter: str) -> str:
    return {
        ",": "csv",
        "\t": "tsv",
        "|": "pipe-delimited",
        ";": "semicolon-delimited",
    }.get(delimiter, "delimited")


def detect_adapter(normalized_columns: set[str]) -> str:
    best_name = "Generic Canonical"
    best_score = -1
    for name, profile_columns in ADAPTER_PROFILES.items():
        score = len(normalized_columns.intersection(profile_columns))
        if score > best_score:
            best_name = name
            best_score = score
    return best_name


def missing_canonical_columns(normalized_columns: set[str]) -> list[str]:
    missing = []
    for canonical in REQUIRED_CANONICAL_COLUMNS:
        if not normalized_columns.intersection(COLUMN_ALIASES_FOR_REPORT[canonical]):
            missing.append(canonical)
    return missing


def normalize_key(key: str) -> str:
    return "_".join("".join(character.lower() if character.isalnum() else " " for character in key).split())
