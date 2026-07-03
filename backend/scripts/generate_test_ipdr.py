import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"

VALID_ROWS = [
    ("919876543210", "49.36.128.45", 45892, "UDP", 342, 182044, 880122, "2026-07-03T10:01:00+05:30"),
    ("919876543210", "157.240.16.35", 443, "TCP", 88, 12044, 42120, "2026-07-03T10:05:00+05:30"),
    ("919876543210", "106.205.44.12", 52212, "UDP", 141, 55890, 300110, "2026-07-03T10:08:00+05:30"),
    ("919845001122", "149.154.167.50", 443, "TCP", 55, 9442, 38490, "2026-07-03T10:12:00+05:30"),
    ("919700441188", "117.215.9.22", 49001, "UDP", 419, 210770, 1044412, "2026-07-03T10:18:00+05:30"),
    ("919700441188", "74.125.24.95", 3478, "UDP", 33, 7021, 16902, "2026-07-03T10:22:00+05:30"),
]

MALFORMED_ROWS = [
    ("919876543210", "49.36.128.45", 45892, "UDP", 342, 182044, 880122),
    ("bad-msisdn", "49.36.128.45", 45892, "UDP", 342, 182044, 880122),
    ("919876543210", "not_an_ip", 45892, "UDP", 342, 182044, 880122),
    ("919876543210", "49.36.128.45", 99999, "UDP", 342, 182044, 880122),
    ("919876543210", "49.36.128.45", 45892, "UDP", -1, 182044, 880122),
]


def write_csv(path: Path, header: list[str], rows: list[tuple], delimiter: str = ",") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, delimiter=delimiter)
        writer.writerow(header)
        writer.writerows(rows)


def main() -> None:
    write_csv(
        FIXTURES / "valid_ipdr.csv",
        ["msisdn", "destination_ip", "destination_port", "protocol", "duration_seconds", "bytes_up", "bytes_down", "started_at"],
        VALID_ROWS,
    )
    write_csv(
        FIXTURES / "operator_variant_ipdr.tsv",
        ["a_number", "remote_ip", "remote_port", "ip_protocol", "session_duration", "tx_bytes", "rx_bytes", "timestamp"],
        [
            ("918888001111", "27.59.88.14", 50144, "UDP", 228, 99021, 401205, "03-07-2026 11:15:00"),
            ("918888001111", "91.108.4.21", 443, "TCP", 61, 14000, 46000, "03-07-2026 11:19:00"),
        ],
        delimiter="\t",
    )
    write_csv(
        FIXTURES / "malformed_ipdr.csv",
        ["msisdn", "destination_ip", "destination_port", "protocol", "duration_seconds", "bytes_up", "bytes_down"],
        MALFORMED_ROWS,
    )
    print(FIXTURES)


if __name__ == "__main__":
    main()