import csv
from pathlib import Path


ROWS = [
    ("919876543210", "49.36.128.45", 45892, "UDP", 342, 182044, 880122),
    ("919876543210", "157.240.16.35", 443, "TCP", 88, 12044, 42120),
    ("919845001122", "149.154.167.50", 443, "TCP", 55, 9442, 38490),
    ("919700441188", "117.215.9.22", 49001, "UDP", 419, 210770, 1044412),
]


def main() -> None:
    output = Path(__file__).resolve().parents[1] / "sample_ipdr.csv"
    with output.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["msisdn", "destination_ip", "destination_port", "protocol", "duration_seconds", "bytes_up", "bytes_down"])
        writer.writerows(ROWS)
    print(output)


if __name__ == "__main__":
    main()

