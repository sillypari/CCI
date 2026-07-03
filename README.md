# Pramaan IPDR

Pramaan IPDR is a smart investigation workflow for extracting and identifying B-party public IP addresses, mobile endpoints, and communication relationships from IPDR logs. The project is designed for law-enforcement investigation teams that need to normalize operator-provided IPDR files, map A-party to B-party interactions, reduce relay/noise traffic, and prepare actionable request packages with an auditable evidence trail.

This repository contains a working Phase 1 implementation with a FastAPI backend, a Vite React dashboard, persistent local evidence storage, IPDR parsing, case management, configurable import specifications, IP classification, extraction workflows, communication mapping, timeline analytics, investigation reports, and request-package generation.

## Problem Statement

Develop a smart tool to extract and identify B-party recipient public IP or mobile numbers from IPDR logs, enabling accurate mapping of A-party to B-party interactions for use in law-enforcement investigations.

The system focuses on the following tasks:

- Understand IPDR structures and formats across telecom operators.
- Parse large and complex IPDR files.
- Identify A-party and B-party relationships from normalized records.
- Filter irrelevant relay and platform noise where possible.
- Normalize diverse formats such as CSV, TSV, TXT, JSON, and operator-specific exports.
- Provide communication mapping through tables and graph views.
- Detect suspicious or actionable activity patterns.
- Provide search and query tools for investigators.
- Maintain security, legal compliance, and auditability.

## Current Implementation Status

This repository is an implementation scaffold intended for hackathon validation and continued hardening. It starts empty, persists uploaded evidence and derived records to a local JSON-backed evidence store, and uses generated test fixtures for verification.

Implemented capabilities:

- FastAPI API service with health, case, import-specification, upload, session, extraction, graph, analytics, report, package, search, audit, and settings endpoints.
- Upload ingestion through a required Polars parser for CSV, TSV, TXT, JSON, and Excel-style IPDR files, with automatic delimiter handling, format reporting, validation, persistence, and row quarantine reporting.
- Case-scoped evidence intake so uploads, sessions, graphs, analytics, and reports can be tied to an investigation workspace.
- Custom import specifications for operator-specific column mappings, including DoT IPDR/NAT SYSLOG-style source, translated, destination, IMEI, domain, and cell-location fields.
- Session normalization into a common schema covering A-party MSISDN/access identifier, source/NAT endpoints, true B-party destination IP/port, domain, cell ID, city/state/country, latitude/longitude, IMEI, IMSI, protocol, bytes, and timestamps.
- Classification of likely peer-to-peer traffic, relay/platform traffic, and unknown flows.
- Known platform relay range detection for services such as WhatsApp, Telegram, and Google ranges included in the classifier.
- Operator range tagging for selected Indian telecom ranges.
- Extraction workflow for a supplied A-party MSISDN with confidence-filtered B-party candidates.
- Backend graph aggregation endpoint for visualization slices by case, MSISDN, and classification.
- Interactive React communication map with zoom, pan, drag, link inspection, node inspection, graph metrics, and extraction handoff.
- Suspicious-pattern detection for bursts, repeated direct contacts, shared endpoints, relay-heavy behavior, and quarantine review.
- Timeline analytics from year down to second-level buckets.
- Application summary and common-application reports for comparing app/destination usage across PoIs.
- PoI summary, IP summary, IMEI frequency, day/night location summary, and sessions CSV export reports.
- Request-package generation for actionable B-party candidates.
- Audit log surface for important workflow events.
- React dashboard with dashboard, cases, upload, sessions, extraction, communication map, analytics, reports, packages, audit log, and settings pages.
- App branding through Pramaan IPDR logo/favicons, Inter body font, JetBrains Mono technical font, and a restrained investigation-grade UI.
- Docker Compose wiring for API, frontend, TimescaleDB, and Redis.
- Unit and API tests for classifier, ingestion, extraction, graph, quarantine, and API behavior.

Not yet production complete:

- Persistent database models and migrations are not wired into the API flow yet; the current evidence store is JSON-backed for local validation.
- Background job processing is not active yet.
- Authentication, RBAC, case-level permissions, and read-only reviewer roles are planned but not complete.
- Operator-specific adapters need real operator sample files for hardening and certification.
- Offline ASN, GeoIP, cell tower master data, TAC lookup, and MNP lookup should be populated with approved local datasets before field deployment.
- OSINT, Truecaller, deep/dark web, and third-party lookup features are not claimed in this local build because they require legal approval, licensed data, and controlled integrations.
- Legal request templates should be reviewed by the relevant department before operational use.

## Repository Structure

```text
.
|-- backend/
|   |-- app/
|   |   |-- api/              # FastAPI route definitions
|   |   |-- schemas/          # Pydantic request and response models
|   |   |-- services/         # Evidence store and IP classification logic
|   |   |-- config.py         # Environment-based settings
|   |   `-- main.py           # FastAPI application factory
|   |-- scripts/              # Utility scripts, including test IPDR fixture generation
|   |-- tests/                # Backend unit tests
|   |-- Dockerfile
|   |-- pyproject.toml
|   `-- requirements.txt
|-- frontend/
|   |-- public/               # App icon and branding assets
|   |-- src/
|   |   |-- api/              # Frontend API client
|   |   |-- App.jsx           # Main React application
|   |   |-- index.css         # Design system and layout styles
|   |   `-- main.jsx
|   |-- Dockerfile
|   |-- package.json
|   `-- vite.config.js
|-- docker-compose.yml
|-- Logo.png
`-- README.md
```

## Technology Stack

Backend:

- Python 3.11 or newer recommended
- FastAPI
- Pydantic and pydantic-settings
- Uvicorn
- Polars and FastExcel for required upload parsing
- SQLAlchemy, asyncpg, and Alembic for the planned database layer
- Celery and Redis for the planned worker pipeline
- pyasn and GeoIP2 for offline ASN enrichment
- Pytest

Frontend:

- Node.js 20 or newer recommended
- React 19
- Vite 6
- React Router
- Framer Motion
- D3 force simulation
- TanStack Table for planned large data tables
- Lucide React icons
- Inter and JetBrains Mono font packages

Infrastructure wiring:

- Docker Compose
- TimescaleDB container for planned time-series persistence
- Redis container for planned background task coordination

## High-Level Workflow

1. Investigator creates or selects a case workspace.
2. Investigator optionally creates an import specification for the operator format.
3. Investigator uploads an IPDR log file against the case.
4. The backend parses the file and normalizes records into session objects.
5. Each session is classified as `p2p`, `relay`, or `unknown` using destination IP ranges, destination ports, byte counts, and operator/platform hints.
6. The dashboard presents case count, upload health, normalized sessions, candidate counts, quarantine count, and actionable rate.
7. The investigator searches or filters sessions by MSISDN, IP, IMEI, application, domain, cell ID, case, date range, operator, or classification.
8. The investigator opens the communication map to inspect A-party to B-party relationships with graph metrics, node details, link evidence, zoom, pan, and drag controls.
9. The investigator runs extraction for an A-party MSISDN.
10. The system returns B-party candidates with evidence references and confidence.
11. Actionable candidates can be converted into request-package payloads.
12. Analytics and Reports provide timeline drill-down, PoI summary, IP summary, common applications, IMEI frequency, day/night location summary, and CSV export.
13. Audit logs record investigation workflow events for traceability.

## Supported Upload Format

The parser expects delimited records with a header row, JSON records, or Excel workbooks. CSV, TSV, semicolon-delimited, pipe-delimited text, JSON arrays, and XLS/XLSX files are suitable for the current implementation. Upload parsing is handled by Polars; there is no secondary CSV parser fallback.

Required investigation columns:

| Column | Description | Example |
| --- | --- | --- |
| `msisdn` | A-party mobile number or access identifier alias | `919876543210` |
| `source_ip` | Subscriber/source IP from IPDR or NAT SYSLOG | `10.12.1.8` |
| `source_port` | Subscriber/source port | `49152` |
| `destination_ip` | True B-party destination IP | `49.36.128.45` |
| `destination_port` | True B-party destination port | `45892` |

Recommended DoT/NAT columns:

| Column | Description | Example |
| --- | --- | --- |
| `translated_ip` | NAT translated/public IP. This is not treated as B-party. | `49.37.10.21` |
| `translated_port` | NAT translated/public port | `45892` |
| `started_at` or `start_date` + `start_time` | IST session start | `2026-07-03T10:01:00+05:30` |
| `ended_at` or `end_date` + `end_time` | IST session end | `2026-07-03T10:06:42+05:30` |
| `ip_allocation` | Static or dynamic allocation | `Dynamic` |
| `imei`, `imsi`, `sim_type` | Mobile device/SIM identifiers when available | `356789012345678` |
| `protocol` | Protocol name | `UDP` |
| `bytes_up` / `bytes_down` | Traffic counters | `182044` / `880122` |

Optional investigation-enrichment columns:

| Column | Description | Example |
| --- | --- | --- |
| `domain` | Domain or hostname when supplied by the operator | `whatsapp.net` |
| `cell_id` | Cell tower, CGI, ECGI, or other tower identifier | `404-10-12345-77` |
| `tower_name` | Tower/site label when present | `Gwalior City Site 12` |
| `city`, `state`, `country` | Decoded location fields from operator or cell master data | `Gwalior`, `Madhya Pradesh`, `India` |
| `latitude`, `longitude` | Tower or event coordinates when available | `26.2183`, `78.1828` |

These optional columns power domain filtering, cell ID filtering, day/night location summaries, and future GIS workflows. They are not required for B-party extraction because many real IPDR exports do not include decoded cell or domain information.

Important: `translated_ip`, `public_ip`, `translated_port`, and `public_port` are parsed as NAT translation fields only. They are never used as the B-party destination unless the upload also contains a real `destination_ip` and `destination_port`.

Example:

```csv
msisdn,source_ip,source_port,translated_ip,translated_port,destination_ip,destination_port,protocol,duration_seconds,bytes_up,bytes_down,started_at
919876543210,10.12.1.8,49152,49.37.10.21,45892,49.36.128.45,45892,UDP,342,182044,880122,2026-07-03T10:01:00+05:30
919876543210,10.12.1.8,49153,,,157.240.16.35,443,TCP,88,12044,42120,2026-07-03T10:05:00+05:30
```

You can generate a sample file with:

```powershell
cd backend
python scripts/generate_test_ipdr.py
```

The generated files are written to `backend/tests/fixtures/` and are committed as deterministic test evidence files.

## Local Setup

### 1. Clone the repository

```powershell
git clone https://github.com/sillypari/CCI.git
cd CCI
```

### 2. Configure environment variables

Copy the sample environment file if you want to customize defaults:

```powershell
copy .env.example .env
```

Default backend settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `IPDR_API_PREFIX` | `/api` | API route prefix |
| `IPDR_UPLOAD_DIR` | `uploads` | Upload storage directory |
| `IPDR_MAX_UPLOAD_BYTES` | `52428800` | Maximum accepted upload size in bytes |
| `IPDR_CORS_ORIGINS` | `http://localhost:5173`, `http://127.0.0.1:5173` | Allowed frontend origins |

Default frontend setting:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:8000/api` | Backend API base URL |

### 3. Run the backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend URLs:

- Health check: `http://localhost:8000/health`
- API docs: `http://localhost:8000/docs`
- OpenAPI schema: `http://localhost:8000/openapi.json`

### 4. Run the frontend

Open a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Frontend URL:

```text
http://localhost:5173
```

### 5. Run the full stack with Docker Compose

```powershell
docker compose up --build
```

This starts:

| Service | URL or Port | Purpose |
| --- | --- | --- |
| Frontend | `http://localhost:5173` | React investigator UI |
| API | `http://localhost:8000` | FastAPI backend |
| TimescaleDB | `localhost:5432` | Planned persistent store |
| Redis | `localhost:6379` | Planned background jobs/cache |

## How to Use the Application

### Dashboard

Use the dashboard to view upload count, normalized session count, actionable candidate count, relay/noise count, quarantine count, latest upload status, and recent sessions.

### File Upload

1. Open `File Upload`.
2. Select or drag an IPDR-style delimited file.
3. Click `Process file`.
4. Review upload status, valid rows, quarantined rows, and progress.

For best results, use the column names or accepted aliases listed in `Supported Upload Format`. Invalid rows are quarantined with row-level reasons.

### Sessions

Use `Sessions` to inspect normalized IPDR records. You can search and filter sessions by:

- MSISDN
- Destination IP
- Operator or platform hint
- Classification: `p2p`, `relay`, or `unknown`

### B-Party Extraction

1. Open `B-Party Extraction`.
2. Enter the target A-party MSISDN.
3. Select extraction depth.
4. Run extraction.
5. Review returned B-party candidates, classification, confidence, and evidence.

Current extraction request shape:

```json
{
  "msisdn": "919876543210",
  "depth": 1,
  "min_confidence": 0.65
}
```

### Communication Map

Use `Communication Map` to visualize A-party to destination endpoint relationships. The graph is intended to make investigation patterns easier to inspect than a table alone.

Recommended use:

- Filter by MSISDN before analysis.
- Use classification filters to isolate likely P2P leads.
- Inspect relay-heavy clusters separately from actionable P2P candidates.
- Use the graph as a lead-discovery surface, then verify in the session table and extraction result.

### Request Packages

Use `Request Packages` to review generated payloads for actionable candidates. These payloads collect the target operator, destination endpoint, timestamp, protocol, classification, confidence, and evidence chain.

These packages are technical payloads and should be reviewed against departmental legal templates before operational use.

### Audit Log

Use `Audit Log` to review workflow events. In production, this surface should be tied to authenticated users, case IDs, and immutable storage.

### Settings

Use `Settings` to review or extend platform and operator ranges used by the classification workflow.

## API Reference

Base URL in local development:

```text
http://localhost:8000/api
```

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/dashboard/stats` | Dashboard metrics, case count, crime-type counts, and latest upload summary |
| `GET` | `/cases` | List investigation cases |
| `POST` | `/cases` | Create an investigation case |
| `GET` | `/import-specs` | List configurable operator import specifications |
| `POST` | `/import-specs` | Create a custom import specification |
| `GET` | `/uploads` | List upload records |
| `POST` | `/uploads` | Upload an IPDR file as multipart form data, optionally with `case_id` and `import_spec_id` |
| `GET` | `/uploads/{upload_id}/status` | Read upload processing status |
| `GET` | `/uploads/{upload_id}/quarantine` | List row-level quarantine reasons for an upload |
| `GET` | `/sessions` | List normalized sessions with filters for case, MSISDN, class, IP, IMEI, app, domain, cell ID, and date range |
| `GET` | `/sessions/{session_id}` | Read a single session |
| `GET` | `/graph` | Return backend-aggregated graph nodes, links, sessions, and metrics |
| `GET` | `/analytics/patterns` | List suspicious investigation signals detected from uploaded evidence |
| `GET` | `/analytics/timeline` | Return year/month/day/hour/minute/second timeline buckets |
| `GET` | `/analytics/applications` | Return application frequency and duration summary |
| `POST` | `/extract` | Run B-party extraction for a supplied MSISDN |
| `GET` | `/extractions` | List extraction results |
| `GET` | `/extractions/{extraction_id}` | Read a single extraction result |
| `GET` | `/reports/poi/{msisdn}` | Preview PoI MSISDN summary report |
| `GET` | `/reports/ip/{destination_ip}` | Preview destination IP summary report |
| `GET` | `/reports/common-applications` | List applications/destination IPs shared across PoIs |
| `GET` | `/reports/imei-frequency` | List IMEI frequency and shared-handset evidence |
| `GET` | `/reports/location-summary` | List cell/location day-night summaries when location columns exist |
| `GET` | `/reports/sessions.csv` | Export normalized sessions as CSV |
| `GET` | `/packages` | List generated request packages |
| `GET` | `/audit-logs` | List audit log events |
| `GET` | `/search` | Search sessions, uploads, and packages |
| `GET` | `/platform-ranges` | List configured platform ranges |
| `POST` | `/platform-ranges` | Add a platform range |

Example upload request:

```powershell
curl.exe -X POST "http://localhost:8000/api/uploads" `
  -F "file=@backend/tests/fixtures/valid_ipdr.csv"
```

Example extraction request:

```powershell
curl.exe -X POST "http://localhost:8000/api/extract" `
  -H "Content-Type: application/json" `
  -d "{\"msisdn\":\"919876543210\",\"depth\":1,\"min_confidence\":0.65}"
```

Example session query:

```powershell
curl.exe "http://localhost:8000/api/sessions?msisdn=919876543210&classification=p2p&limit=50"
```

## Classification Logic

The current classifier is intentionally simple and explainable for Phase 1.

Classification outcomes:

| Class | Meaning |
| --- | --- |
| `p2p` | Likely direct peer-to-peer or direct media flow candidate |
| `relay` | Likely platform relay, STUN/TURN signalling, or known relay infrastructure |
| `unknown` | Insufficient evidence or invalid/unmapped destination |

Main signals used today:

- Destination IP validity.
- Known relay CIDR ranges for supported platforms.
- Destination port patterns such as STUN/TURN-related ports.
- Download byte count and high destination port behavior.
- Operator IP range mapping.

The classifier should be extended with operator-specific field mappings, verified platform ASN/range feeds, temporal correlation, NAT behavior, and confidence scoring calibrated against real investigation samples.

## Testing

Run backend tests:

```powershell
cd backend
pytest
```

Run frontend production build:

```powershell
cd frontend
npm run build
```

Recommended pre-push check:

```powershell
cd backend
pytest
cd ..\frontend
npm run build
```

## Security and Legal Considerations

IPDR data can contain sensitive personal information. Treat every upload and derived result as restricted investigation material.

Operational recommendations before production use:

- Add authentication and role-based access control.
- Enforce case-level access boundaries.
- Encrypt uploads and extracted artifacts at rest.
- Use TLS in all deployed environments.
- Store audit logs in append-only or tamper-evident storage.
- Redact personal data in non-production logs.
- Do not commit real IPDR files, subscriber data, or investigation exports.
- Validate request-package formats with the relevant legal authority before use.
- Establish retention, deletion, and chain-of-custody procedures.

## Development Roadmap

Recommended next milestones:

1. Replace the local JSON-backed evidence store with SQLAlchemy async models and Alembic migrations.
2. Persist uploads, normalized sessions, extractions, request packages, reports, import specifications, and audit logs in TimescaleDB/PostgreSQL.
3. Add Redis-backed Celery or RQ workers for large-file parsing.
4. Add streaming ingestion with Polars for very large operator files and benchmark import throughput against the target 2500+ records per second.
5. Harden operator adapters for Jio, Airtel, Vodafone Idea, BSNL, and other required formats using real sanitized samples.
6. Add authentication, RBAC, case-level permissions, read-only reviewers, and module-level access controls.
7. Add approved offline datasets for ASN/IP decode, GeoIP, cell tower master data, TAC/handset lookup, and MNP lookup.
8. Add graph export, i2 Analyst's Notebook-compatible export, and map/image export.
9. Add department-approved legal request templates and PDF/Excel exports.
10. Harden deployment with secrets management, TLS, backups, disaster recovery, observability, and tamper-evident audit storage.

## Troubleshooting

### Backend does not start

Check that the virtual environment is active and dependencies are installed:

```powershell
cd backend
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend cannot reach the API

Confirm the backend is running:

```powershell
curl.exe http://localhost:8000/health
```

If the API is hosted on a different URL, set `VITE_API_URL` before running the frontend.

### Upload returns invalid or quarantined rows

Confirm the file has a header row and includes the expected columns. Start with `backend/tests/fixtures/valid_ipdr.csv` or regenerate fixtures with `python backend/scripts/generate_test_ipdr.py` if you need a known-good sample.

### Docker Compose port conflict

If ports `5173`, `8000`, `5432`, or `6379` are already in use, stop the conflicting service or edit `docker-compose.yml` port mappings.

## License and Usage Notice

A license file is not currently included. Add the intended license before public distribution or reuse.

This project is built for lawful investigation workflows. It must be deployed and used only under applicable legal authority, departmental policy, and evidence-handling procedures.