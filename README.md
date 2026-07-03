# Pramaan IPDR

Pramaan IPDR is a smart investigation workflow for extracting and identifying B-party public IP addresses, mobile endpoints, and communication relationships from IPDR logs. The project is designed for law-enforcement investigation teams that need to normalize operator-provided IPDR files, map A-party to B-party interactions, reduce relay/noise traffic, and prepare actionable request packages with an auditable evidence trail.

This repository contains a working Phase 1 implementation with a FastAPI backend, a Vite React dashboard, persistent local evidence storage, IPDR parsing, IP classification, extraction workflows, communication mapping, and request-package generation.

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

- FastAPI API service with health, upload, session, extraction, package, search, audit, and settings endpoints.
- Upload ingestion for delimited and JSON IPDR-style files with automatic delimiter handling, validation, persistence, and row quarantine reporting.
- Session normalization into a common schema.
- Classification of likely peer-to-peer traffic, relay/platform traffic, and unknown flows.
- Known platform relay range detection for services such as WhatsApp, Telegram, and Google ranges included in the classifier.
- Operator range tagging for selected Indian telecom ranges.
- Extraction workflow for a supplied A-party MSISDN.
- Request-package generation for actionable B-party candidates.
- Audit log surface for important workflow events.
- React dashboard with dashboard, upload, sessions, extraction, communication map, packages, audit log, and settings pages.
- Docker Compose wiring for API, frontend, TimescaleDB, and Redis.
- Unit tests for classifier and extraction behavior.

Not yet production complete:

- Persistent database models and migrations are not wired into the API flow yet.
- Background job processing is not active yet.
- Authentication, RBAC, and case-level permissions are planned but not complete.
- Operator-specific adapters are represented conceptually and need production data samples for hardening.
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
- Pytest

Frontend:

- Node.js 20 or newer recommended
- React 19
- Vite 6
- React Router
- Framer Motion
- D3 force simulation
- Lucide React icons
- Inter and JetBrains Mono font packages

Infrastructure wiring:

- Docker Compose
- TimescaleDB container for planned time-series persistence
- Redis container for planned background task coordination

## High-Level Workflow

1. Investigator uploads an IPDR log file.
2. The backend parses the file and normalizes records into session objects.
3. Each session is classified as `p2p`, `relay`, or `unknown` using destination IP ranges, destination ports, byte counts, and operator/platform hints.
4. The dashboard presents upload health, normalized sessions, candidate counts, and actionable rate.
5. The investigator searches or filters sessions by MSISDN, IP, operator, or classification.
6. The investigator runs extraction for an A-party MSISDN.
7. The system returns B-party candidates with evidence references.
8. Actionable candidates can be converted into request-package payloads.
9. Audit logs record investigation workflow events for traceability.
10. Communication map visualizes connections between A-party MSISDNs and destination endpoints.

## Supported Upload Format

The parser expects delimited records with a header row or JSON records. CSV, TSV, semicolon-delimited, pipe-delimited text, and JSON arrays are suitable for the current implementation.

Recommended columns:

| Column | Description | Example |
| --- | --- | --- |
| `msisdn` | A-party mobile number | `919876543210` |
| `destination_ip` | Destination public IP observed in IPDR | `49.36.128.45` |
| `destination_port` | Destination port | `45892` |
| `protocol` | Protocol name | `UDP` |
| `duration_seconds` | Session duration in seconds | `342` |
| `bytes_up` | Uploaded bytes | `182044` |
| `bytes_down` | Downloaded bytes | `880122` |

Example:

```csv
msisdn,destination_ip,destination_port,protocol,duration_seconds,bytes_up,bytes_down
919876543210,49.36.128.45,45892,UDP,342,182044,880122
919876543210,157.240.16.35,443,TCP,88,12044,42120
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
| `GET` | `/dashboard/stats` | Dashboard metrics and latest upload summary |
| `GET` | `/uploads` | List upload records |
| `POST` | `/uploads` | Upload an IPDR file as multipart form data |
| `GET` | `/uploads/{upload_id}/status` | Read upload processing status |
| `GET` | `/sessions` | List normalized sessions with optional filters |
| `GET` | `/sessions/{session_id}` | Read a single session |
| `POST` | `/extract` | Run B-party extraction for a supplied MSISDN |
| `GET` | `/extractions` | List extraction results |
| `GET` | `/extractions/{extraction_id}` | Read a single extraction result |
| `GET` | `/packages` | List generated request packages |
| `GET` | `/audit-logs` | List audit log events |
| `GET` | `/search` | Search sessions, uploads, and packages |
| `GET` | `/platform-ranges` | List configured platform ranges |
| `POST` | `/platform-ranges` | Add a platform range |
| `GET` | `/uploads/{upload_id}/quarantine` | List row-level quarantine reasons for an upload |

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
2. Persist uploads, normalized sessions, extractions, request packages, and audit logs in TimescaleDB/PostgreSQL.
3. Add Redis-backed Celery or RQ workers for large-file parsing.
4. Add streaming ingestion with Polars for large operator files.
5. Create operator-specific adapters for Jio, Airtel, Vodafone Idea, BSNL, and other required formats.
6. Add authentication, RBAC, case management, and evidence permissions.
7. Add graph export, timeline correlation, and suspicious pattern detection.
8. Add production-grade observability, structured logs, and metrics.
9. Add legal request template generation with department-approved language.
10. Harden deployment with secrets management, TLS, backups, and disaster recovery.

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