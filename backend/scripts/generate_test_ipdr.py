import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests" / "fixtures"

VALID_HEADER = [
    "msisdn",
    "source_ip",
    "source_port",
    "translated_ip",
    "translated_port",
    "destination_ip",
    "destination_port",
    "protocol",
    "duration_seconds",
    "bytes_up",
    "bytes_down",
    "started_at",
    "ended_at",
    "ip_allocation",
    "imei",
    "imsi",
    "sim_type",
]

VALID_ROWS = [
    ("919876543210", "10.12.1.8", 49152, "49.37.10.21", 45892, "49.36.128.45", 45892, "UDP", 342, 182044, 880122, "2026-07-03T10:01:00+05:30", "2026-07-03T10:06:42+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919876543210", "10.12.1.8", 49153, "", "", "157.240.16.35", 443, "TCP", 88, 12044, 42120, "2026-07-03T10:05:00+05:30", "2026-07-03T10:06:28+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919876543210", "10.12.1.8", 49154, "106.204.10.7", 52212, "106.205.44.12", 52212, "UDP", 141, 55890, 300110, "2026-07-03T10:08:00+05:30", "2026-07-03T10:10:21+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919845001122", "100.64.19.42", 50200, "", "", "149.154.167.50", 443, "TCP", 55, 9442, 38490, "2026-07-03T10:12:00+05:30", "2026-07-03T10:12:55+05:30", "Dynamic", "351111111111111", "404109999999999", "e-SIM"),
    ("919700441188", "10.25.4.19", 53001, "117.216.8.10", 49001, "117.215.9.22", 49001, "UDP", 419, 210770, 1044412, "2026-07-03T10:18:00+05:30", "2026-07-03T10:24:59+05:30", "Dynamic", "352222222222222", "404108888888888", "Physical"),
    ("919700441188", "10.25.4.19", 53002, "", "", "74.125.24.95", 3478, "UDP", 33, 7021, 16902, "2026-07-03T10:22:00+05:30", "2026-07-03T10:22:33+05:30", "Dynamic", "352222222222222", "404108888888888", "Physical"),
]

MALFORMED_ROWS = [
    ("919876543210", "10.12.1.8", 49152, "", "", "49.36.128.45", 45892, "UDP", 342, 182044, 880122, "2026-07-03T10:01:00+05:30", "2026-07-03T10:06:42+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("bad-msisdn", "10.12.1.8", 49152, "", "", "49.36.128.45", 45892, "UDP", 342, 182044, 880122, "2026-07-03T10:01:00+05:30", "2026-07-03T10:06:42+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919876543210", "not_an_ip", 49152, "", "", "49.36.128.45", 45892, "UDP", 342, 182044, 880122, "2026-07-03T10:01:00+05:30", "2026-07-03T10:06:42+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919876543210", "10.12.1.8", 49152, "", "", "not_an_ip", 45892, "UDP", 342, 182044, 880122, "2026-07-03T10:01:00+05:30", "2026-07-03T10:06:42+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919876543210", "10.12.1.8", 49152, "", "", "49.36.128.45", 99999, "UDP", 342, 182044, 880122, "2026-07-03T10:01:00+05:30", "2026-07-03T10:06:42+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919876543210", "10.12.1.8", 49152, "", "", "49.36.128.45", 45892, "UDP", -1, 182044, 880122, "2026-07-03T10:01:00+05:30", "2026-07-03T10:06:42+05:30", "Dynamic", "356789012345678", "404101234567890", "Physical"),
]

DOT_NAT_HEADER = [
    "MSISDN",
    "Start Date",
    "Start Time",
    "End Date",
    "End Time",
    "Source IP Address",
    "Source Port",
    "Translated IP Address",
    "Translated Port",
    "Destination IP Address",
    "Destination Port",
    "Protocol",
    "Bytes Up",
    "Bytes Down",
    "Static/Dynamic IP Address Allocation",
    "IMEI",
    "IMSI",
    "SIM Type",
]

DOT_NAT_ROWS = [
    ("919876543210", "03/07/2026", "10:01:00", "03/07/2026", "10:06:42", "10.12.1.8", 49152, "49.37.10.21", 45892, "49.36.128.45", 45892, "UDP", 182044, 880122, "Dynamic", "356789012345678", "404101234567890", "Physical"),
    ("919876543210", "03/07/2026", "10:08:00", "03/07/2026", "10:10:21", "10.12.1.8", 49154, "106.204.10.7", 52212, "106.205.44.12", 52212, "UDP", 55890, 300110, "Dynamic", "356789012345678", "404101234567890", "Physical"),
]

TRANSLATED_ONLY_ROWS = [
    ("919876543210", "10.12.1.8", 49152, "49.37.10.21", 45892, 45892, "2026-07-03T10:01:00+05:30"),
]


def write_csv(path: Path, header: list[str], rows: list[tuple], delimiter: str = ",") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle, delimiter=delimiter)
        writer.writerow(header)
        writer.writerows(rows)


def main() -> None:
    write_csv(FIXTURES / "valid_ipdr.csv", VALID_HEADER, VALID_ROWS)
    write_csv(
        FIXTURES / "operator_variant_ipdr.tsv",
        ["subscriber", "private_ip", "private_port", "remote_ip", "remote_port", "ip_protocol", "session_duration", "tx_bytes", "rx_bytes", "timestamp"],
        [
            ("918888001111", "10.55.1.18", 50144, "27.59.88.14", 50144, "UDP", 228, 99021, 401205, "03-07-2026 11:15:00"),
            ("918888001111", "10.55.1.18", 50145, "91.108.4.21", 443, "TCP", 61, 14000, 46000, "03-07-2026 11:19:00"),
        ],
        delimiter="\t",
    )
    write_csv(FIXTURES / "malformed_ipdr.csv", VALID_HEADER, MALFORMED_ROWS)
    write_csv(FIXTURES / "dot_nat_syslog.csv", DOT_NAT_HEADER, DOT_NAT_ROWS)
    write_csv(
        FIXTURES / "translated_only_not_bparty.csv",
        ["msisdn", "source_ip", "source_port", "translated_ip", "translated_port", "destination_port", "started_at"],
        TRANSLATED_ONLY_ROWS,
    )
    print(FIXTURES)


if __name__ == "__main__":
    main()