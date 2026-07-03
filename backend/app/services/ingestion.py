from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import chardet
import polars as pl

from app.schemas.core import UploadFormatReport

REQUIRED_CANONICAL_COLUMNS = ("msisdn", "destination_ip", "destination_port")

ADAPTER_PROFILES: dict[str, set[str]] = {
    "Airtel": {"a_party_msisdn", "dest_ip", "dest_port", "session_duration", "uplink_bytes", "downlink_bytes"},
    "Jio": {"msisdn", "public_ip", "public_port", "translated_ip", "translated_port"},
    "Vodafone Idea": {"subscriber", "remote_ip", "remote_port", "tx_bytes", "rx_bytes"},
    "BSNL": {"mobile_number", "server_ip", "server_port", "duration_sec"},
    "Generic Canonical": {"msisdn", "destination_ip", "destination_port"},
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
    },
    "destination_ip": {
        "destination_ip",
        "dest_ip",
        "server_ip",
        "b_party_ip",
        "b_party_public_ip",
        "remote_ip",
        "remote_address",
        "public_ip",
        "translated_ip",
    },
    "destination_port": {
        "destination_port",
        "dest_port",
        "server_port",
        "b_party_port",
        "remote_port",
        "public_port",
        "translated_port",
    },
}


class IngestionError(Exception):
    """Raised when Polars cannot parse or describe the uploaded evidence."""


@dataclass(frozen=True)
class ParsedUpload:
    rows: list[dict[str, Any]]
    report: UploadFormatReport


def parse_ipdr_upload(filename: str, content: bytes) -> ParsedUpload:
    if not content:
        raise IngestionError("Uploaded file is empty")

    suffix = Path(filename).suffix.lower()
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
    return ParsedUpload(rows=dataframe.to_dicts(), report=report)


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