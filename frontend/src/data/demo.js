const now = new Date("2026-07-03T10:30:00+05:30").toISOString();

export const demoUploads = [
  {
    id: "UPL-demo",
    filename: "synthetic_ipdr_demo.csv",
    status: "completed",
    rows_total: 8,
    rows_valid: 8,
    rows_quarantined: 0,
    progress: 100,
    created_at: now,
    completed_at: now,
    message: "Demo dataset loaded"
  }
];

export const demoSessions = [
  {
    id: "SES-1001",
    upload_id: "UPL-demo",
    a_party_msisdn: "919876543210",
    destination_ip: "49.36.128.45",
    destination_port: 45892,
    protocol: "UDP",
    started_at: "2026-07-03T09:42:00+05:30",
    duration_seconds: 342,
    bytes_up: 182044,
    bytes_down: 880122,
    app_hint: "Direct media flow",
    operator: "Jio",
    asn: "AS55836",
    classification: "p2p",
    confidence: 0.92,
    source_file: "synthetic_ipdr_demo.csv",
    row_number: 145892
  },
  {
    id: "SES-1002",
    upload_id: "UPL-demo",
    a_party_msisdn: "919876543210",
    destination_ip: "157.240.16.35",
    destination_port: 443,
    protocol: "TCP",
    started_at: "2026-07-03T09:50:00+05:30",
    duration_seconds: 88,
    bytes_up: 12044,
    bytes_down: 42120,
    app_hint: "Meta WhatsApp relay",
    operator: "Meta WhatsApp",
    asn: "relay",
    classification: "relay",
    confidence: 0.82,
    source_file: "synthetic_ipdr_demo.csv",
    row_number: 145900
  },
  {
    id: "SES-1003",
    upload_id: "UPL-demo",
    a_party_msisdn: "919876543210",
    destination_ip: "106.205.44.12",
    destination_port: 52212,
    protocol: "UDP",
    started_at: "2026-07-03T10:04:00+05:30",
    duration_seconds: 141,
    bytes_up: 55890,
    bytes_down: 300110,
    app_hint: "Direct media flow",
    operator: "Airtel",
    asn: "AS45609",
    classification: "p2p",
    confidence: 0.9,
    source_file: "synthetic_ipdr_demo.csv",
    row_number: 145921
  },
  {
    id: "SES-1004",
    upload_id: "UPL-demo",
    a_party_msisdn: "919845001122",
    destination_ip: "149.154.167.50",
    destination_port: 443,
    protocol: "TCP",
    started_at: "2026-07-03T10:11:00+05:30",
    duration_seconds: 55,
    bytes_up: 9442,
    bytes_down: 38490,
    app_hint: "Telegram relay",
    operator: "Telegram",
    asn: "relay",
    classification: "relay",
    confidence: 0.82,
    source_file: "synthetic_ipdr_demo.csv",
    row_number: 146002
  },
  {
    id: "SES-1005",
    upload_id: "UPL-demo",
    a_party_msisdn: "919700441188",
    destination_ip: "117.215.9.22",
    destination_port: 49001,
    protocol: "UDP",
    started_at: "2026-07-03T10:16:00+05:30",
    duration_seconds: 419,
    bytes_up: 210770,
    bytes_down: 1044412,
    app_hint: "Direct media flow",
    operator: "BSNL",
    asn: "AS9829",
    classification: "p2p",
    confidence: 0.9,
    source_file: "synthetic_ipdr_demo.csv",
    row_number: 146090
  }
];

export const demoStats = {
  uploads: demoUploads.length,
  sessions: demoSessions.length,
  actionable: demoSessions.filter((session) => session.classification === "p2p").length,
  relay: demoSessions.filter((session) => session.classification === "relay").length,
  unknown: 0,
  quarantined_rows: 0,
  avg_confidence: 0.87,
  latest_upload: demoUploads[0]
};

export const demoExtractions = [
  {
    id: "EXT-demo",
    requested_msisdn: "919876543210",
    depth: 1,
    total_sessions: 3,
    actionable_count: 2,
    relay_count: 1,
    created_at: now,
    candidates: [
      {
        session_id: "SES-1001",
        destination_ip: "49.36.128.45",
        destination_port: 45892,
        target_operator: "Jio",
        asn: "AS55836",
        classification: "p2p",
        confidence: 0.92,
        evidence: "synthetic_ipdr_demo.csv row 145892; Direct media flow"
      },
      {
        session_id: "SES-1003",
        destination_ip: "106.205.44.12",
        destination_port: 52212,
        target_operator: "Airtel",
        asn: "AS45609",
        classification: "p2p",
        confidence: 0.9,
        evidence: "synthetic_ipdr_demo.csv row 145921; Direct media flow"
      }
    ]
  }
];

export const demoPackages = [
  {
    id: "PKG-demo",
    extraction_id: "EXT-demo",
    session_id: "SES-1001",
    request_type: "Section 91/92 CrPC subscriber identity request",
    target_operator: "Jio",
    created_at: now,
    payload: {
      requesting_unit: "Gwalior Police Cyber Cell",
      a_party_msisdn: "919876543210",
      destination_ip: "49.36.128.45",
      destination_port: 45892,
      protocol: "UDP",
      timestamp_ist: "2026-07-03T09:42:00+05:30",
      duration_seconds: 342,
      classification: "p2p",
      confidence: 0.92,
      evidence_chain: {
        source_file: "synthetic_ipdr_demo.csv",
        row_number: 145892,
        extraction_id: "EXT-demo",
        session_id: "SES-1001"
      }
    }
  }
];

export const demoAuditLogs = [
  {
    id: "AUD-1001",
    timestamp: now,
    action: "extract",
    entity_type: "extraction",
    entity_id: "EXT-demo",
    user: "demo.operator",
    ip_address: "127.0.0.1",
    details: { msisdn: "919876543210", candidates: 2 }
  },
  {
    id: "AUD-1002",
    timestamp: now,
    action: "upload",
    entity_type: "upload",
    entity_id: "UPL-demo",
    user: "demo.operator",
    ip_address: "127.0.0.1",
    details: { filename: "synthetic_ipdr_demo.csv", valid_rows: 8 }
  }
];

export const demoPlatformRanges = [
  {
    id: "RNG-001",
    platform: "Meta WhatsApp",
    cidr: "157.240.0.0/16",
    asn: "relay",
    description: "Known WhatsApp relay infrastructure",
    active: true,
    last_verified: now
  },
  {
    id: "RNG-002",
    platform: "Telegram",
    cidr: "149.154.160.0/20",
    asn: "relay",
    description: "Known Telegram relay infrastructure",
    active: true,
    last_verified: now
  },
  {
    id: "RNG-003",
    platform: "Google",
    cidr: "74.125.0.0/16",
    asn: "relay",
    description: "Google STUN/TURN infrastructure",
    active: true,
    last_verified: now
  }
];
