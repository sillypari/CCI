import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PanelHeader, Badge, EmptyState, number, Modal } from "./components/common.jsx";
import { GeoMap } from "./components/GeoMap.jsx";
import { PoIPage } from "./components/PoIPage.jsx";
import { IpPage } from "./components/IpPage.jsx";
import { ImeiPage } from "./components/ImeiPage.jsx";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  FileText,
  Filter,
  Gauge,
  LayoutDashboard,
  LocateFixed,
  Menu,
  Loader2,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Smartphone,
  Target,
  Upload,
  Trash2,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { api } from "./api/client.js";

const pageMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: 0.2, ease: "easeOut" }
};

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: BriefcaseBusiness, label: "Cases", path: "/cases" },
  { icon: Upload, label: "File Upload", path: "/uploads" },
  { icon: Database, label: "Sessions", path: "/sessions" },
  { icon: Target, label: "B-Party Extraction", path: "/extractions" },
  { icon: Network, label: "Communication Map", path: "/map" },
  { icon: BarChart3, label: "Analytics", path: "/analytics" },
  { icon: FileSpreadsheet, label: "Reports", path: "/reports" },
  { icon: Smartphone, label: "IMEI Analysis", path: "/imei" },
  { icon: FileText, label: "Request Packages", path: "/packages" },
  { icon: Clipboard, label: "Audit Log", path: "/audit" },
  { icon: Settings, label: "Settings", path: "/settings" }
];

const emptyStats = {
  cases: 0,
  uploads: 0,
  sessions: 0,
  actionable: 0,
  relay: 0,
  unknown: 0,
  quarantined_rows: 0,
  avg_confidence: 0,
  latest_upload: null,
  top_crime_types: []
};

const emptyGraphData = {
  nodes: [],
  links: [],
  sessions: [],
  metrics: {
    nodes: 0,
    edges: 0,
    sessions: 0,
    p2p: 0,
    relay: 0,
    unknown: 0,
    high_confidence: 0,
    first_seen: null,
    last_seen: null
  }
};

const initialState = {
  stats: emptyStats,
  cases: [],
  importSpecs: [],
  uploads: [],
  jobs: [],
  sessions: [],
  graph: emptyGraphData,
  patterns: [],
  extractions: [],
  packages: [],
  auditLogs: [],
  platformRanges: [],
  timeline: [],
  applications: [],
  persistence: null
};

function App() {
  const [data, setData] = useState(initialState);
  const [apiLive, setApiLive] = useState(false);
  const [apiError, setApiError] = useState("");
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((kind, title, body) => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, kind, title, body }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [stats, cases, importSpecs, uploads, jobs, sessions, graph, patterns, timeline, applications, extractions, packagesList, auditLogs, platformRanges, persistence] = await Promise.all([
        api.dashboard(),
        api.cases(),
        api.importSpecs(),
        api.uploads(),
        api.uploadJobs(),
        api.sessions(),
        api.graph(),
        api.patterns(),
        api.timeline(),
        api.applications(),
        api.extractions(),
        api.packages(),
        api.auditLogs(),
        api.platformRanges(),
        api.persistenceStatus()
      ]);
      setData({ stats, cases, importSpecs, uploads, jobs, sessions, graph: normalizeGraphResponse(graph), patterns, timeline, applications, extractions, packages: packagesList, auditLogs, platformRanges, persistence });
      setApiLive(true);
      setApiError("");
    } catch (error) {
      setApiLive(false);
      setApiError(error.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const uploadFile = useCallback(
    async (file, options = {}) => {
      try {
        const upload = await api.upload(file, options);
        pushToast(upload.status === "failed" ? "warning" : "success", upload.status === "failed" ? "Upload quarantined" : "Upload processed", upload.message ?? file.name);
        await refresh();
        return upload.status !== "failed";
      } catch (error) {
        setApiLive(false);
        setApiError(error.message);
        pushToast("error", "Upload failed", error.message);
        return false;
      }
    },
    [pushToast, refresh]
  );

  const deleteUpload = useCallback(
    async (upload) => {
      try {
        const deleted = await api.deleteUpload(upload.id);
        await refresh();
        pushToast("success", "Upload deleted", `${deleted.filename} and ${deleted.rows_valid} sessions removed`);
        return true;
      } catch (error) {
        pushToast("error", "Delete failed", error.message);
        return false;
      }
    },
    [pushToast, refresh]
  );

  const deleteCase = useCallback(
    async (caseItem) => {
      try {
        const deleted = await api.deleteCase(caseItem.id);
        await refresh();
        pushToast("success", "Case deleted", deleted.name);
        return true;
      } catch (error) {
        pushToast("error", "Delete failed", error.message);
        return false;
      }
    },
    [pushToast, refresh]
  );

  const validateFile = useCallback(
    async (file, options = {}) => {
      try {
        const report = await api.validateUpload(file, options);
        const missing = report.missing_required?.length ? `Missing ${report.missing_required.join(", ")}` : "Required fields detected";
        pushToast(report.missing_required?.length ? "warning" : "success", "Validation complete", `${report.adapter} | ${missing}`);
        return report;
      } catch (error) {
        setApiLive(false);
        setApiError(error.message);
        pushToast("error", "Validation failed", error.message);
        return null;
      }
    },
    [pushToast]
  );

  const createPersistenceSnapshot = useCallback(
    async () => {
      try {
        const status = await api.createPersistenceSnapshot();
        await refresh();
        pushToast("success", "SQLite snapshot updated", `${status.sessions} sessions persisted`);
        return status;
      } catch (error) {
        pushToast("error", "Snapshot failed", error.message);
        return null;
      }
    },
    [pushToast, refresh]
  );

  const runExtraction = useCallback(
    async (payload) => {
      try {
        const extraction = await api.extract(payload);
        const [packagesList, auditLogs] = await Promise.all([api.packages(), api.auditLogs()]);
        setData((current) => ({
          ...current,
          extractions: [extraction, ...current.extractions.filter((item) => item.id !== extraction.id)],
          packages: packagesList,
          auditLogs
        }));
        setApiLive(true);
        setApiError("");
        pushToast("success", "Extraction complete", `${extraction.actionable_count} actionable candidates found`);
        return extraction;
      } catch (error) {
        setApiError(error.message);
        pushToast("error", "Extraction failed", error.message);
        return null;
      }
    },
    [pushToast]
  );


  const createCase = useCallback(
    async (payload) => {
      try {
        const created = await api.createCase(payload);
        await refresh();
        pushToast("success", "Case created", created.name);
        return created;
      } catch (error) {
        pushToast("error", "Case failed", error.message);
        return null;
      }
    },
    [pushToast, refresh]
  );

  const createImportSpec = useCallback(
    async (payload) => {
      try {
        const spec = await api.createImportSpec(payload);
        await refresh();
        pushToast("success", "Import spec saved", spec.name);
        return spec;
      } catch (error) {
        pushToast("error", "Import spec failed", error.message);
        return null;
      }
    },
    [pushToast, refresh]
  );
  return (
    <>
      <Shell apiLive={apiLive} apiError={apiError}>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<DashboardPage data={data} />} />
            <Route path="/cases" element={<CasesPage cases={data.cases} stats={data.stats} createCase={createCase} deleteCase={deleteCase} />} />
            <Route path="/uploads" element={<UploadsPage uploads={data.uploads} jobs={data.jobs} cases={data.cases} importSpecs={data.importSpecs} uploadFile={uploadFile} validateFile={validateFile} deleteUpload={deleteUpload} />} />
            <Route path="/sessions" element={<SessionsPage sessions={data.sessions} />} />
            <Route path="/extractions" element={<ExtractionsPage extractions={data.extractions} runExtraction={runExtraction} />} />
            <Route path="/map" element={<MapPage initialGraph={data.graph} runExtraction={runExtraction} />} />
            <Route path="/analytics" element={<AnalyticsPage timeline={data.timeline} applications={data.applications} patterns={data.patterns} />} />
            <Route path="/poi/:msisdn" element={<PoIPage />} />
            <Route path="/ip/:ip" element={<IpPage />} />
            <Route path="/imei" element={<ImeiPage />} />
            <Route path="/reports" element={<ReportsPage sessions={data.sessions} />} />
            <Route path="/packages" element={<PackagesPage packagesList={data.packages} />} />
            <Route path="/audit" element={<AuditPage auditLogs={data.auditLogs} />} />
            <Route path="/settings" element={<SettingsPage ranges={data.platformRanges} stats={data.stats} apiLive={apiLive} persistence={data.persistence} importSpecs={data.importSpecs} createImportSpec={createImportSpec} createPersistenceSnapshot={createPersistenceSnapshot} />} />
          </Routes>
        </AnimatePresence>
      </Shell>
      <ToastViewport toasts={toasts} dismiss={(id) => setToasts((items) => items.filter((toast) => toast.id !== id))} />
    </>
  );
}

function Shell({ apiLive, apiError, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const page = navItems.find((item) => item.path === location.pathname) ?? navItems[0];
  const PageIcon = page.icon;
  const sidebarToggleLabel = collapsed ? "Expand sidebar" : "Collapse sidebar";

  const submitSearch = (event) => {
    event.preventDefault();
    const q = query.trim();
    if (q) {
      if (/^\d{10,15}$/.test(q)) {
        navigate(`/poi/${q}`);
      } else if (/^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(q)) {
        navigate(`/ip/${q}`);
      } else {
        navigate(`/sessions?q=${encodeURIComponent(q)}`);
      }
    }
  };

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "mobile-open" : ""} ${location.pathname === "/map" ? "is-map-route" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__brand">
          <div className="brand-lockup">
            <img className="brand-mark" src="/brand-logo.png" alt="" />
            <div className="brand-copy">
              <strong>Pramaan IPDR</strong>
              <span>B-party intelligence</span>
            </div>
          </div>
          <button
            className="sidebar__toggle icon-button"
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            data-tooltip={sidebarToggleLabel}
            aria-label={sidebarToggleLabel}
            aria-expanded={!collapsed}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
        <nav className="sidebar__nav" aria-label="Main navigation">
          {navItems.map(({ icon: Icon, label, path }) => (
            <NavLink
              key={path}
              to={path}
              aria-label={label}
              data-tooltip={label}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

      </aside>
      <div className="shell-main">
        <header className="topbar">
          <button className="icon-button mobile-menu" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="Menu" data-tooltip="Menu">
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <div className="topbar__title">
            <PageIcon size={18} />
            <span>{page.label}</span>
          </div>
          <form className="global-search" onSubmit={submitSearch}>
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search MSISDN, IP, file" />
          </form>
          <div className={`system-state ${apiLive ? "healthy" : "offline"}`}>
            <span />
            {apiLive ? "API live" : "API offline"}
          </div>
        </header>
        <main className="content">
          {apiError ? <div className="error-banner" role="alert"><AlertTriangle size={16} /> <span>{apiError}</span></div> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function DashboardPage({ data }) {
  const recentSessions = data.sessions.slice(0, 5);
  const actionableRate = data.stats.sessions ? Math.round((data.stats.actionable / data.stats.sessions) * 100) : 0;
  const topPatterns = (data.patterns ?? []).slice(0, 4);
  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="case-ribbon span-12">
        <div className="case-ribbon__main">
          <span className="eyebrow">Investigation cockpit</span>
          <h1>A-party to B-party correlation</h1>
          <p>{number(data.stats.sessions)} normalized sessions | {number(data.stats.actionable)} P2P leads | {number(data.stats.relay)} relay/noise flows</p>
        </div>
        <div className="case-ribbon__metric">
          <span>Actionable rate</span>
          <strong>{actionableRate}%</strong>
        </div>
        <div className="case-ribbon__metric">
          <span>Confidence</span>
          <strong>{Math.round(data.stats.avg_confidence * 100)}%</strong>
        </div>
      </section>

      <div className="dashboard-strip">
        <StatCard icon={Upload} label="Uploads" value={data.stats.uploads} tone="brand" />
        <StatCard icon={Database} label="Sessions" value={number(data.stats.sessions)} tone="neutral" />
        <StatCard icon={Target} label="P2P leads" value={number(data.stats.actionable)} tone="success" />
        <StatCard icon={Server} label="Relay/noise" value={number(data.stats.relay)} tone="danger" />
        <StatCard icon={Gauge} label="Quarantine" value={number(data.stats.quarantined_rows)} tone="warning" />
      </div>

      <section className="panel span-7">
        <PanelHeader icon={Activity} title="Processing Overview" action={<Badge tone="success">Healthy</Badge>} />
        <div className="timeline">
          {["Upload", "Detect", "Normalize", "Classify", "Extract"].map((item, index) => (
            <div className="timeline__item" key={item}>
              <span className="timeline__dot">{index + 1}</span>
              <div>
                <strong>{item}</strong>
                <p>{index < 4 ? "Ready" : `${data.stats.actionable} candidates`}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel span-5">
        <PanelHeader icon={ShieldCheck} title="Latest Upload" action={<Badge tone="brand">{data.stats.latest_upload?.status ?? "none"}</Badge>} />
        {data.stats.latest_upload ? (
          <div className="upload-summary">
            <strong>{data.stats.latest_upload.filename}</strong>
            <Progress value={data.stats.latest_upload.progress} />
            <div className="metric-row">
              <span>{number(data.stats.latest_upload.rows_valid)} valid</span>
              <span>{number(data.stats.latest_upload.rows_quarantined)} quarantined</span>
              <span>{data.stats.latest_upload.format_report?.parser_engine ?? "parser"}</span>
            </div>
          </div>
        ) : (
          <EmptyState label="No uploads yet" />
        )}
      </section>

      <section className="panel span-5">
        <PanelHeader icon={AlertTriangle} title="Investigation Signals" action={<Badge tone={topPatterns.length ? "warning" : "success"}>{topPatterns.length}</Badge>} />
        {topPatterns.length ? <SignalList patterns={topPatterns} /> : <EmptyState label="No suspicious signals detected" />}
      </section>

      <section className="panel span-7">
        <PanelHeader icon={Database} title="Recent Sessions" action={<NavLink to="/sessions" className="text-link">View all</NavLink>} />
        <SessionsTable sessions={recentSessions} compact />
      </section>
    </motion.section>
  );
}

function SignalList({ patterns }) {
  return (
    <div className="signal-list">
      {patterns.map((pattern) => (
        <article className={`signal-row ${pattern.severity}`} key={pattern.id}>
          <div>
            <span className="eyebrow">{pattern.pattern_type.replaceAll("_", " ")}</span>
            <strong>{pattern.title}</strong>
            <p>{pattern.recommended_action}</p>
          </div>
          <Badge tone={pattern.severity === "high" ? "danger" : pattern.severity === "medium" ? "warning" : "neutral"}>{Math.round(pattern.score * 100)}%</Badge>
        </article>
      ))}
    </div>
  );
}
function CasesPage({ cases, stats, createCase, deleteCase }) {
  const [form, setForm] = useState({ name: "", crime_type: "Cybercrime", io_name: "", targets: "", tags: "" });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    const created = await createCase({
      name: form.name,
      crime_type: form.crime_type,
      io_name: form.io_name || "Unassigned",
      targets: splitList(form.targets),
      tags: splitList(form.tags),
      description: ""
    });
    if (created) setForm({ name: "", crime_type: "Cybercrime", io_name: "", targets: "", tags: "" });
  };

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="case-ribbon span-12 compact-ribbon">
        <div className="case-ribbon__main">
          <span className="eyebrow">Case workspace</span>
          <h1>Evidence organized by investigation</h1>
          <p>{number(stats.cases)} cases | {number(stats.uploads)} uploads | {number(stats.sessions)} normalized sessions</p>
        </div>
      </section>
      <section className="panel span-5">
        <PanelHeader icon={BriefcaseBusiness} title="Create Case" />
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Case name</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Operation / FIR / complaint reference" /></label>
          <label className="field"><span>Crime type</span><input value={form.crime_type} onChange={(event) => setForm({ ...form, crime_type: event.target.value })} placeholder="Cybercrime, fraud, extortion" /></label>
          <label className="field"><span>Investigating officer</span><input value={form.io_name} onChange={(event) => setForm({ ...form, io_name: event.target.value })} placeholder="Officer name" /></label>
          <label className="field"><span>Targets</span><input value={form.targets} onChange={(event) => setForm({ ...form, targets: event.target.value })} placeholder="Comma separated MSISDNs" /></label>
          <label className="field"><span>Tags</span><input value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="watchlist, urgent" /></label>
          <Button icon={BriefcaseBusiness} disabled={!form.name.trim()}>Create case</Button>
        </form>
      </section>
      <section className="panel span-7">
        <PanelHeader icon={Database} title="Case List" action={<Badge tone="brand">{cases.length}</Badge>} />
        <div className="table-wrap">
          <table style={{ minWidth: "100%" }}>
            <thead><tr><th>Case</th><th>Crime</th><th>IO</th><th>Targets</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {cases.length ? cases.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.name}</strong><br /><span className="mono">{item.id}</span></td>
                  <td>{item.crime_type}</td>
                  <td>{item.io_name}</td>
                  <td className="mono">{(item.targets ?? []).join(", ") || "-"}</td>
                  <td><Badge tone={item.status === "active" ? "success" : "neutral"}>{item.status}</Badge></td>
                  <td>
                    {item.id !== "CASE-GENERAL" ? (
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => {
                          if (window.confirm(`Are you sure you want to permanently delete case ${item.name}? Any uploads in this case will be moved back to the General Evidence Intake.`)) {
                            deleteCase(item);
                          }
                        }}
                        title="Delete Case"
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Protected</span>
                    )}
                  </td>
                </tr>
              )) : <TableEmptyRow colSpan={6} label="No cases created" />}
            </tbody>
          </table>
        </div>
      </section>
    </motion.section>
  );
}
function UploadsPage({ uploads, jobs = [], cases = [], importSpecs = [], uploadFile, validateFile, deleteUpload }) {
  const [activeFile, setActiveFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedQuarantine, setSelectedQuarantine] = useState(null);
  const [validationReport, setValidationReport] = useState(null);
  const [validating, setValidating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ percent: 0, speed: 0, loaded: 0, total: 0, phase: "" });
  const fileInputId = useId();
  const [caseId, setCaseId] = useState("CASE-GENERAL");
  const [importSpecId, setImportSpecId] = useState("");

  const caseOptions = useMemo(
    () => (cases.length ? cases : [{ id: "CASE-GENERAL", name: "General Evidence Intake" }]).map((item) => ({ value: item.id, label: item.name })),
    [cases]
  );
  const specOptions = useMemo(
    () => [{ value: "", label: "Auto detect" }, ...importSpecs.map((item) => ({ value: item.id, label: item.name }))],
    [importSpecs]
  );

  useEffect(() => {
    if (!caseOptions.some((item) => item.value === caseId)) {
      setCaseId(caseOptions[0]?.value ?? "CASE-GENERAL");
    }
  }, [caseId, caseOptions]);

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec || bytesPerSec === Infinity) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const setFile = (file) => {
    if (file && file.size > 50 * 1024 * 1024) {
      const confirmed = window.confirm(
        `This file is very large (${(file.size / (1024 * 1024)).toFixed(2)} MB). Processing large files may take a moment. Do you wish to proceed?`
      );
      if (!confirmed) {
        const inputEl = document.getElementById(fileInputId);
        if (inputEl) inputEl.value = "";
        setActiveFile(null);
        setValidationReport(null);
        return;
      }
    }
    setActiveFile(file);
    setValidationReport(null);
  };

  const runValidation = async () => {
    if (!activeFile || !validateFile) return;
    setValidating(true);
    setProgress({ percent: 0, speed: 0, loaded: 0, total: activeFile.size, phase: "validating" });
    try {
      setValidationReport(await validateFile(activeFile, { 
        importSpecId,
        onProgress: (p) => setProgress({ percent: p.percent, speed: p.speed, loaded: p.loaded, total: p.total, phase: "validating" })
      }));
    } finally {
      setValidating(false);
      setProgress({ percent: 0, speed: 0, loaded: 0, total: 0, phase: "" });
    }
  };

  const submitUpload = async (event) => {
    event.preventDefault();
    if (activeFile) {
      setUploading(true);
      setProgress({ percent: 0, speed: 0, loaded: 0, total: activeFile.size, phase: "uploading" });
      const uploaded = await uploadFile(activeFile, { 
        caseId, 
        importSpecId,
        onProgress: (p) => setProgress({ percent: p.percent, speed: p.speed, loaded: p.loaded, total: p.total, phase: "uploading" })
      });
      setUploading(false);
      setProgress({ percent: 0, speed: 0, loaded: 0, total: 0, phase: "" });
      if (uploaded) {
        setFile(null);
        event.currentTarget.reset();
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const [file] = event.dataTransfer.files;
    if (file) {
      setFile(file);
    }
  };

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-5">
        <PanelHeader icon={Upload} title="File Upload" />
        <form className="upload-drop" onSubmit={submitUpload}>
          <input
            id={fileInputId}
            className="upload-drop__input"
            type="file"
            accept=".csv,.txt,.tsv,.json,.xlsx,.xls,.zip"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            disabled={validating || uploading}
          />
          <label
            className={`upload-drop__surface ${activeFile ? "has-file" : ""} ${isDragging ? "is-dragging" : ""} ${validating || uploading ? "is-validating" : ""}`}
            htmlFor={fileInputId}
            onDragEnter={() => !(validating || uploading) && setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            style={validating || uploading ? { pointerEvents: "none", opacity: 0.7 } : {}}
          >
            {validating || uploading ? (
              <>
                <span className="upload-drop__icon animate-spin"><Loader2 size={34} style={{ color: "var(--color-brand)" }} /></span>
                <strong>{progress.phase === "validating" ? "Validating file format..." : "Uploading file to server..."}</strong>
                <span className="mono" style={{ fontSize: "14px", color: "var(--color-brand)", fontWeight: "bold", margin: "6px 0" }}>
                  {progress.percent}% ({formatSpeed(progress.speed)})
                </span>
                <span>
                  {progress.percent < 100 
                    ? `Transferring bytes (${number(progress.loaded)} / ${number(progress.total)})...` 
                    : progress.phase === "validating" ? "Processing validation checks on server..." : "Initializing server-side row parsing..."}
                </span>
              </>
            ) : (
              <>
                <span className="upload-drop__icon"><FileJson size={34} /></span>
                <strong>{activeFile ? activeFile.name : "Select IPDR evidence file"}</strong>
                <span>{activeFile ? `${number(activeFile.size)} bytes ready for validation` : "CSV, TSV, TXT, JSON, XLSX, ZIP batch"}</span>
                <span className="upload-drop__action">{activeFile ? "Change file" : "Browse file"}</span>
              </>
            )}
          </label>
          <div className="form-grid compact">
            <div className="field">
              <span>Case</span>
              <SelectControl ariaLabel="Case" value={caseId} onChange={setCaseId} options={caseOptions} disabled={validating || uploading} />
            </div>
            <div className="field">
              <span>Import spec</span>
              <SelectControl ariaLabel="Import specification" value={importSpecId} onChange={setImportSpecId} options={specOptions} disabled={validating || uploading} />
            </div>
          </div>
          {validationReport ? <ValidationReportCard report={validationReport} /> : null}
          <div className="button-row">
            <Button 
              type="button" 
              icon={validating ? Loader2 : CheckCircle2} 
              variant="secondary" 
              disabled={!activeFile || validating || uploading} 
              onClick={runValidation}
              iconClassName={validating ? "animate-spin" : ""}
            >
              {validating ? "Validating..." : "Validate format"}
            </Button>
            <Button icon={uploading ? Loader2 : Upload} disabled={!activeFile || validating || uploading} iconClassName={uploading ? "animate-spin" : ""}>
              {uploading ? "Uploading..." : "Process file"}
            </Button>
          </div>
        </form>
      </section>
      <section className="panel span-7">
        <PanelHeader icon={Activity} title="Upload Queue" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Rows</th>
                <th>Adapter</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {uploads.length ? uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{upload.filename}</td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <Badge tone={upload.status === "completed" ? "success" : upload.status === "failed" ? "danger" : "warning"}>{upload.status}</Badge>
                      {(upload.status === "processing" || upload.status === "pending") && (
                        <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-brand)" }} />
                      )}
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span>{number(upload.rows_valid)} / {number(upload.rows_total)}</span>
                      {upload.rows_quarantined > 0 && (
                        <div onClick={() => setSelectedQuarantine(upload.quarantine_errors || [])} style={{ cursor: "pointer" }}>
                          <Badge tone="warning" title="Click to review quarantined rows">{upload.rows_quarantined} Q</Badge>
                        </div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span style={{ fontSize: '13px' }}>
                      {upload.format_report?.adapter ?? "-"} 
                      {upload.format_report?.file_format ? ` (${upload.format_report.file_format.toUpperCase()})` : ""}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="icon-button danger"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete ${upload.filename} and remove all its sessions?`)) {
                          deleteUpload(upload);
                        }
                      }}
                      title="Permanently Delete Upload"
                      style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )) : <TableEmptyRow colSpan={5} label="No evidence files uploaded" />}
            </tbody>
          </table>
        </div>
        <div className="queue-ledger">
          <h3>Ingestion Jobs</h3>
          <div className="job-list">
            {jobs.length ? jobs.slice(0, 5).map((job) => {
              const isWorking = job.status === "processing" || job.status === "pending";
              
              // Calculate elapsed time and rows/sec speed
              const elapsedSec = (Date.now() - new Date(job.created_at).getTime()) / 1000;
              const rowsProcessed = Math.round((job.progress / 100) * job.rows_total);
              const speedRowsPerSec = elapsedSec > 0.5 ? Math.round(rowsProcessed / elapsedSec) : 0;
              
              let speedMessage = "";
              if (isWorking) {
                speedMessage = speedRowsPerSec > 0 ? `Ingesting: ${number(speedRowsPerSec)} rows/s` : "Starting...";
              } else if (job.status === "completed") {
                speedMessage = `Completed (${number(job.rows_valid)} rows)`;
              } else {
                speedMessage = `Failed (${job.message || "Unknown error"})`;
              }
              
              return (
                <article className="job-row" key={job.id} style={{ display: "grid", gap: "8px", padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", gap: "12px" }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.filename}</strong>
                      <span style={{ display: "block", fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "2px" }}>
                        {speedMessage}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }}>
                      {isWorking && (
                        <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-brand)" }} />
                      )}
                      <Badge tone={job.status === "completed" ? "success" : job.status === "failed" ? "danger" : "warning"}>
                        {job.progress}%
                      </Badge>
                    </div>
                  </div>
                  <div style={{ width: "100%", height: "4px", background: "var(--color-border-subtle)", borderRadius: "2px", overflow: "hidden" }}>
                    <div 
                      style={{ 
                        width: `${job.progress}%`, 
                        height: "100%", 
                        background: job.status === "failed" ? "var(--color-danger)" : "var(--color-brand)", 
                        transition: "width 0.3s ease",
                        borderRadius: "2px"
                      }} 
                    />
                  </div>
                </article>
              );
            }) : <EmptyState label="No ingestion jobs recorded" />}
          </div>
        </div>
      </section>
      {selectedQuarantine ? (
        <Modal title="Quarantine Review" onClose={() => setSelectedQuarantine(null)}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Field</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {selectedQuarantine.map((err, i) => (
                  <tr key={i}>
                    <td>{err.row_number}</td>
                    <td>{err.field ?? "-"}</td>
                    <td>{err.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      ) : null}
    </motion.section>
  );
}

function ValidationReportCard({ report }) {
  const ok = !report.missing_required?.length;
  return (
    <div className={`validation-card ${ok ? "is-ok" : "is-warning"}`}>
      <div>
        <strong>{report.adapter}</strong>
        <span>{report.file_format.toUpperCase()} | {number(report.rows_detected)} rows | {Math.round(report.confidence * 100)}% confidence</span>
      </div>
      <Badge tone={ok ? "success" : "warning"}>{ok ? "Ready" : "Needs mapping"}</Badge>
      {report.missing_required?.length ? <p>Missing: {report.missing_required.join(", ")}</p> : null}
      {report.archive_members?.length ? <p>{report.archive_members.length} archive member{report.archive_members.length === 1 ? "" : "s"} detected</p> : null}
    </div>
  );
}
function SessionsPage({ sessions }) {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [classification, setClassification] = useState("all");
  const deferredQuery = useDeferredValue(query);
  
  // Advanced filters state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [targetIp, setTargetIp] = useState("");
  const [app, setApp] = useState("");
  const [domain, setDomain] = useState("");
  const [cellId, setCellId] = useState("");
  const [imei, setImei] = useState("");
  
  // Date time filtration state
  const [timeMode, setTimeMode] = useState("serial"); // "serial" or "parallel"
  const [serialRange, setSerialRange] = useState({ from: "", to: "" });
  const [parallelRanges, setParallelRanges] = useState([{ from: "", to: "", id: 1 }]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return sessions.filter((session) => {
      // 1. Classification
      const matchesClass = classification === "all" || session.classification === classification;
      
      // 2. Search Query (MSISDN, IP, operator)
      const matchesQuery =
        !needle ||
        session.a_party_msisdn.includes(needle) ||
        session.destination_ip.includes(needle) ||
        (session.source_ip ?? "").includes(needle) ||
        (session.translated_ip ?? "").includes(needle) ||
        session.operator.toLowerCase().includes(needle);

      // 3. Target IP
      const matchesTargetIp = !targetIp.trim() || session.destination_ip.includes(targetIp.trim());

      // 4. Application
      const matchesApp = !app.trim() || (session.app_hint || "").toLowerCase().includes(app.trim().toLowerCase()) || (session.operator || "").toLowerCase().includes(app.trim().toLowerCase());

      // 5. Domain
      const matchesDomain = !domain.trim() || (session.domain || "").toLowerCase().includes(domain.trim().toLowerCase());

      // 6. Cell Tower
      const matchesCellId = !cellId.trim() || (session.cell_id || "").toLowerCase().includes(cellId.trim().toLowerCase());

      // 7. IMEI
      const matchesImei = !imei.trim() || (session.imei || "").toLowerCase().includes(imei.trim().toLowerCase());

      // 8. Date-Time filtration
      let matchesTime = true;
      const sessionTime = session.started_at ? new Date(session.started_at).getTime() : null;

      if (sessionTime) {
        if (timeMode === "serial") {
          const fromTime = serialRange.from ? new Date(serialRange.from).getTime() : null;
          const toTime = serialRange.to ? new Date(serialRange.to).getTime() : null;
          if (fromTime && sessionTime < fromTime) matchesTime = false;
          if (toTime && sessionTime > toTime) matchesTime = false;
        } else {
          // Parallel Mode: matches if it falls in ANY of the ranges (OR logic)
          let inAnyRange = false;
          let hasActiveRanges = false;
          for (const range of parallelRanges) {
            const fromTime = range.from ? new Date(range.from).getTime() : null;
            const toTime = range.to ? new Date(range.to).getTime() : null;
            if (fromTime || toTime) {
              hasActiveRanges = true;
              let inThisRange = true;
              if (fromTime && sessionTime < fromTime) inThisRange = false;
              if (toTime && sessionTime > toTime) inThisRange = false;
              if (inThisRange) {
                inAnyRange = true;
                break;
              }
            }
          }
          if (hasActiveRanges && !inAnyRange) {
            matchesTime = false;
          }
        }
      } else if (serialRange.from || serialRange.to || parallelRanges.some(r => r.from || r.to)) {
        // Session has no timestamp but we are filtering by timestamp
        matchesTime = false;
      }

      return matchesClass && matchesQuery && matchesTargetIp && matchesApp && matchesDomain && matchesCellId && matchesImei && matchesTime;
    });
  }, [classification, deferredQuery, sessions, targetIp, app, domain, cellId, imei, timeMode, serialRange, parallelRanges]);

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-12">
        <PanelHeader icon={Database} title="Session Explorer" action={<Badge tone="brand">{number(filtered.length)} rows</Badge>} />
        
        <div className="toolbar">
          <label className="input-shell">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="MSISDN, IP, operator" />
          </label>
          
          <SelectControl
            ariaLabel="Session classification filter"
            icon={Filter}
            value={classification}
            onChange={setClassification}
            options={[
              { value: "all", label: "All classes" },
              { value: "p2p", label: "P2P" },
              { value: "relay", label: "Relay" },
              { value: "unknown", label: "Unknown" }
            ]}
          />

          <Button
            type="button"
            icon={Filter}
            variant={showAdvanced ? "primary" : "secondary"}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            Advanced Filters
          </Button>
        </div>

        {showAdvanced && (
          <div className="stack" style={{ padding: "16px", borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-bg-secondary)", borderRadius: "var(--radius-md)", margin: "12px 0", gap: "16px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "14px" }}>
              <label className="field">
                <span>Target IP</span>
                <input value={targetIp} onChange={(e) => setTargetIp(e.target.value)} placeholder="e.g. 49.36.128.45" />
              </label>
              <label className="field">
                <span>Application</span>
                <input value={app} onChange={(e) => setApp(e.target.value)} placeholder="e.g. Whatsapp, Telegram" />
              </label>
              <label className="field">
                <span>Domain</span>
                <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="e.g. facebook.com, google" />
              </label>
              <label className="field">
                <span>Cell Tower ID</span>
                <input value={cellId} onChange={(e) => setCellId(e.target.value)} placeholder="e.g. 404-10-123" />
              </label>
              <label className="field">
                <span>IMEI</span>
                <input value={imei} onChange={(e) => setImei(e.target.value)} placeholder="e.g. 3567890123" />
              </label>
            </div>

            <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "12px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", flexWrap: "wrap", gap: "10px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600" }}>Advanced Date-Time Filtration</span>
                <div style={{ display: "flex", gap: "12px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                    <input type="radio" checked={timeMode === "serial"} onChange={() => setTimeMode("serial")} />
                    Serial Mode (Single window)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer" }}>
                    <input type="radio" checked={timeMode === "parallel"} onChange={() => setTimeMode("parallel")} />
                    Parallel Mode (Multiple windows)
                  </label>
                </div>
              </div>

              {timeMode === "serial" ? (
                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <label className="field" style={{ flex: 1, minWidth: "180px" }}>
                    <span>From Timestamp</span>
                    <input type="datetime-local" value={serialRange.from} onChange={(e) => setSerialRange({ ...serialRange, from: e.target.value })} />
                  </label>
                  <label className="field" style={{ flex: 1, minWidth: "180px" }}>
                    <span>To Timestamp</span>
                    <input type="datetime-local" value={serialRange.to} onChange={(e) => setSerialRange({ ...serialRange, to: e.target.value })} />
                  </label>
                  <Button type="button" variant="secondary" onClick={() => setSerialRange({ from: "", to: "" })} style={{ marginTop: "18px" }}>Clear</Button>
                </div>
              ) : (
                <div className="stack" style={{ gap: "10px" }}>
                  {parallelRanges.map((range, index) => (
                    <div key={range.id} style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                      <label className="field" style={{ flex: 1, minWidth: "180px" }}>
                        <span>Window #{index + 1} - From</span>
                        <input type="datetime-local" value={range.from} onChange={(e) => {
                          const updated = [...parallelRanges];
                          updated[index].from = e.target.value;
                          setParallelRanges(updated);
                        }} />
                      </label>
                      <label className="field" style={{ flex: 1, minWidth: "180px" }}>
                        <span>Window #{index + 1} - To</span>
                        <input type="datetime-local" value={range.to} onChange={(e) => {
                          const updated = [...parallelRanges];
                          updated[index].to = e.target.value;
                          setParallelRanges(updated);
                        }} />
                      </label>
                      {parallelRanges.length > 1 && (
                        <button
                          type="button"
                          className="icon-button danger"
                          onClick={() => setParallelRanges(parallelRanges.filter(r => r.id !== range.id))}
                          style={{ height: "36px", width: "36px", padding: 0, marginTop: "18px" }}
                          title="Remove Window"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setParallelRanges([...parallelRanges, { from: "", to: "", id: Date.now() }])}
                    >
                      + Add Time Window
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setParallelRanges([{ from: "", to: "", id: 1 }])}
                    >
                      Reset Windows
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "4px" }}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setTargetIp("");
                  setApp("");
                  setDomain("");
                  setCellId("");
                  setImei("");
                  setSerialRange({ from: "", to: "" });
                  setParallelRanges([{ from: "", to: "", id: 1 }]);
                  setQuery("");
                  setClassification("all");
                }}
              >
                Reset All Filters
              </Button>
            </div>
          </div>
        )}

        <SessionsTable sessions={filtered} />
      </section>
    </motion.section>
  );
}

function ExtractionsPage({ extractions, runExtraction }) {
  const [msisdn, setMsisdn] = useState("");
  const [depth, setDepth] = useState(1);
  const [busy, setBusy] = useState(false);
  const latest = extractions[0];

  const submit = async (event) => {
    event.preventDefault();
    if (!msisdn.trim()) return;
    setBusy(true);
    try {
      await runExtraction({ msisdn, depth: Number(depth), min_confidence: 0.65 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-4">
        <PanelHeader icon={Target} title="Extract B-Party" />
        <form className="stack" onSubmit={submit}>
          <label className="field">
            <span>MSISDN</span>
            <input value={msisdn} onChange={(event) => setMsisdn(event.target.value)} placeholder="Enter A-party MSISDN" />
          </label>
          <div className="field">
            <span>Depth</span>
            <SelectControl
              ariaLabel="Extraction depth"
              value={depth}
              onChange={setDepth}
              options={[
                { value: 1, label: "1 hop" },
                { value: 2, label: "2 hops" }
              ]}
            />
          </div>
          <Button icon={Play} disabled={busy || !msisdn.trim()}>{busy ? "Running" : "Run extraction"}</Button>
        </form>
      </section>
      <section className="panel span-8">
        <PanelHeader icon={ShieldCheck} title="Latest Result" action={latest ? <Badge tone="success">{latest.actionable_count} actionable</Badge> : null} />
        {latest ? <ExtractionResultView extraction={latest} /> : <EmptyState label="No extraction has been run" />}
      </section>
    </motion.section>
  );
}

function MapPage({ initialGraph, runExtraction }) {
  const [msisdn, setMsisdn] = useState("");
  const [classification, setClassification] = useState("all");
  const [selected, setSelected] = useState(null);
  const [graphData, setGraphData] = useState(() => normalizeGraphResponse(initialGraph));
  const [graphBusy, setGraphBusy] = useState(false);
  const [graphError, setGraphError] = useState("");
  const deferredMsisdn = useDeferredValue(msisdn);
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    const trimmedMsisdn = msisdn.trim();
    if (trimmedMsisdn) params.set("msisdn", trimmedMsisdn);
    if (classification !== "all") params.set("classification", classification);
    params.set("limit", "5000");
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [classification, msisdn]);

  useEffect(() => {
    setGraphData(normalizeGraphResponse(initialGraph));
  }, [initialGraph]);

  useEffect(() => {
    let cancelled = false;
    const loadGraph = async () => {
      const params = new URLSearchParams();
      const trimmedMsisdn = deferredMsisdn.trim();
      if (trimmedMsisdn) params.set("msisdn", trimmedMsisdn);
      if (classification !== "all") params.set("classification", classification);
      params.set("limit", "5000");
      setGraphBusy(true);
      try {
        const payload = await api.graph(`?${params.toString()}`);
        if (!cancelled) {
          setGraphData(normalizeGraphResponse(payload));
          setGraphError("");
        }
      } catch (error) {
        if (!cancelled) setGraphError(error.message);
      } finally {
        if (!cancelled) setGraphBusy(false);
      }
    };
    loadGraph();
    return () => {
      cancelled = true;
    };
  }, [classification, deferredMsisdn]);

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-12 map-shell graph-shell">
        <PanelHeader
          icon={Network}
          title="Communication Map"
          action={
            <div className="map-actions">
              <Badge tone={graphBusy ? "warning" : "brand"}>{graphBusy ? "Syncing" : "Backend graph"}</Badge>
              <label className="map-query">
                <Search size={16} />
                <input aria-label="A-party MSISDN" value={msisdn} onChange={(event) => setMsisdn(event.target.value)} placeholder="Filter MSISDN" />
              </label>
              <SelectControl
                ariaLabel="Graph classification filter"
                value={classification}
                onChange={setClassification}
                options={[
                  { value: "all", label: "All flows" },
                  { value: "p2p", label: "P2P only" },
                  { value: "relay", label: "Relay only" },
                  { value: "unknown", label: "Unknown" }
                ]}
              />
              <a className="button secondary button-link" href={api.graphJsonUrl(exportQuery)} download><Download size={16} /><span>JSON</span></a>
              <a className="button secondary button-link" href={api.graphGraphmlUrl(exportQuery)} download><Network size={16} /><span>GraphML</span></a>
              <Button type="button" icon={Target} disabled={!msisdn.trim()} onClick={() => runExtraction({ msisdn, depth: 1, min_confidence: 0.65 })}>Extract</Button>
            </div>
          }
        />
        {graphError ? <div className="graph-alert" role="alert"><AlertTriangle size={16} /> <span>{graphError}</span></div> : null}
        <NetworkGraph
          graphData={graphData}
          selected={selected}
          onSelect={setSelected}
          onExtract={() => (msisdn.trim() ? runExtraction({ msisdn, depth: 1, min_confidence: 0.65 }) : null)}
        />
      </section>
    </motion.section>
  );
}

function AnalyticsPage({ timeline, applications, patterns }) {
  const [bucket, setBucket] = useState("hour");
  const [points, setPoints] = useState(timeline);

  useEffect(() => {
    let cancelled = false;
    const loadTimeline = async () => {
      try {
        const payload = await api.timeline(`?bucket=${bucket}`);
        if (!cancelled) setPoints(payload);
      } catch {
        if (!cancelled) setPoints(timeline);
      }
    };
    loadTimeline();
    return () => {
      cancelled = true;
    };
  }, [bucket, timeline]);

  const maxSessions = Math.max(1, ...points.map((item) => item.sessions));
  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-8">
        <PanelHeader
          icon={BarChart3}
          title="Timeline Analysis"
          action={
            <SelectControl
              ariaLabel="Timeline bucket"
              value={bucket}
              onChange={setBucket}
              options={[
                { value: "year", label: "Year" },
                { value: "month", label: "Month" },
                { value: "day", label: "Day" },
                { value: "hour", label: "Hour" },
                { value: "minute", label: "Minute" },
                { value: "second", label: "Second" }
              ]}
            />
          }
        />
        <div className="timeline-chart">
          {points.length ? points.map((item) => (
            <div className="timeline-bar" key={item.bucket}>
              <span className="timeline-bar__label">{item.label}</span>
              <div className="timeline-bar__track"><span style={{ width: `${Math.max(4, (item.sessions / maxSessions) * 100)}%` }} /></div>
              <strong>{item.sessions}</strong>
            </div>
          )) : <EmptyState label="No timeline data yet" />}
        </div>
      </section>
      <section className="panel span-4">
        <PanelHeader icon={Activity} title="Applications" action={<Badge tone="brand">{applications.length}</Badge>} />
        <div className="signal-list compact-list">
          {applications.length ? applications.map((item) => (
            <article className="signal-row" key={item.name}>
              <div><strong>{item.name}</strong><p>{item.operator} | {item.destination_ips} IPs | {formatDuration(item.duration_seconds)}</p></div>
              <Badge tone="neutral">{item.sessions}</Badge>
            </article>
          )) : <EmptyState label="No application summary" />}
        </div>
      </section>
      <section className="panel span-12">
        <PanelHeader icon={AlertTriangle} title="Detection Signals" action={<Badge tone={patterns.length ? "warning" : "success"}>{patterns.length}</Badge>} />
        {patterns.length ? <SignalList patterns={patterns} /> : <EmptyState label="No suspicious signals detected" />}
      </section>
    </motion.section>
  );
}

function ReportsPage({ sessions }) {
  const [poi, setPoi] = useState("");
  const [ip, setIp] = useState("");
  const [report, setReport] = useState(null);
  const [commonApps, setCommonApps] = useState([]);
  const [imeiRows, setImeiRows] = useState([]);
  const [locationRows, setLocationRows] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadReports = async () => {
      try {
        const [apps, imeis, locations] = await Promise.all([api.commonApplications(), api.imeiFrequency(), api.locationSummary()]);
        if (!cancelled) {
          setCommonApps(apps);
          setImeiRows(imeis);
          setLocationRows(locations);
        }
      } catch {
        if (!cancelled) {
          setCommonApps([]);
          setImeiRows([]);
          setLocationRows([]);
        }
      }
    };
    loadReports();
    return () => {
      cancelled = true;
    };
  }, [sessions]);

  const runPoi = async (event) => {
    event.preventDefault();
    if (!poi.trim()) return;
    setBusy(true);
    try {
      setReport({ type: "poi", payload: await api.poiReport(poi.trim()) });
    } finally {
      setBusy(false);
    }
  };

  const runIp = async (event) => {
    event.preventDefault();
    if (!ip.trim()) return;
    setBusy(true);
    try {
      setReport({ type: "ip", payload: await api.ipReport(ip.trim()) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-5">
        <PanelHeader icon={FileSpreadsheet} title="Report Builder" />
        <form className="stack" onSubmit={runPoi}>
          <label className="field"><span>PoI MSISDN</span><input value={poi} onChange={(event) => setPoi(event.target.value)} placeholder="Target mobile number" /></label>
          <Button icon={FileSpreadsheet} disabled={busy || !poi.trim()}>{busy ? "Building" : "PoI summary"}</Button>
        </form>
        <form className="stack divided" onSubmit={runIp}>
          <label className="field"><span>Destination IP</span><input value={ip} onChange={(event) => setIp(event.target.value)} placeholder="B-party IP" /></label>
          <Button icon={Network} disabled={busy || !ip.trim()} variant="secondary">IP summary</Button>
        </form>
        <a className="text-link" href={api.sessionCsvUrl()}>Export sessions CSV</a>
      </section>
      <section className="panel span-7">
        <PanelHeader icon={ShieldCheck} title="Report Preview" action={<Badge tone="brand">{sessions.length} rows</Badge>} />
        {report ? <ReportPreview report={report} /> : <EmptyState label="Build a PoI or IP report" />}
      </section>
      <section className="panel span-4">
        <PanelHeader icon={Activity} title="Common Applications" action={<Badge tone="brand">{commonApps.length}</Badge>} />
        <div className="report-list">
          {commonApps.length ? commonApps.map((item) => (
            <article className="report-row" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.poi_msisdns.length} PoIs | {item.destination_ips.length} IPs | {formatDuration(item.total_duration_seconds)}</span>
            </article>
          )) : <EmptyState label="No common applications found" />}
        </div>
      </section>
      <section className="panel span-4">
        <PanelHeader icon={Database} title="IMEI Frequency" action={<Badge tone="brand">{imeiRows.length}</Badge>} />
        <div className="report-list">
          {imeiRows.length ? imeiRows.map((item) => (
            <article className="report-row" key={item.imei}>
              <strong className="mono">{item.imei}</strong>
              <span>{item.sessions} sessions | {item.msisdns.length} MSISDNs | {item.handset_hint ?? "TAC unavailable"}</span>
            </article>
          )) : <EmptyState label="No IMEI values in evidence" />}
        </div>
      </section>
      <section className="panel span-4">
        <PanelHeader icon={LocateFixed} title="Location Summary" action={<Badge tone="brand">{locationRows.length}</Badge>} />
        <div className="report-list">
          {locationRows.length ? locationRows.map((item) => (
            <article className="report-row" key={item.key}>
              <strong>{item.label}</strong>
              <span>{item.sessions} sessions | Day {item.day_sessions} | Night {item.night_sessions}</span>
            </article>
          )) : <EmptyState label="No cell tower/location columns found" />}
        </div>
      </section>
      
      <section className="panel span-12" style={{ gridColumn: 'span 12' }}>
        <PanelHeader icon={LocateFixed} title="GIS Location Analysis (Click to drop Geofence)" />
        <GeoMap locationData={locationRows} />
      </section>
    </motion.section>
  );
}
function ReportPreview({ report }) {
  const payload = report.payload;
  if (report.type === "ip") {
    return (
      <div className="report-card">
        <div className="report-card__head">
          <h3>{payload.destination_ip}</h3>
          <div className="report-export-actions">
            <a className="button secondary button-link" href={api.ipCsvUrl(payload.destination_ip)} download><Download size={16} /><span>CSV</span></a>
            <a className="button secondary button-link" href={api.ipHtmlUrl(payload.destination_ip)} download><FileText size={16} /><span>HTML</span></a>
          </div>
        </div>
        <div className="metric-row"><span>Sessions <strong>{payload.total_sessions}</strong></span><span>MSISDNs <strong>{payload.msisdns.length}</strong></span><span>Ports <strong>{payload.ports.join(", ") || "-"}</strong></span></div>
        <p>{payload.operator} | {payload.classification} | {number(payload.total_bytes)} bytes</p>
      </div>
    );
  }
  return (
    <div className="report-card">
      <div className="report-card__head">
        <h3>{payload.msisdn}</h3>
        <div className="report-export-actions">
          <a className="button secondary button-link" href={api.poiCsvUrl(payload.msisdn)} download><Download size={16} /><span>CSV</span></a>
          <a className="button secondary button-link" href={api.poiHtmlUrl(payload.msisdn)} download><FileText size={16} /><span>HTML</span></a>
        </div>
      </div>
      <div className="metric-row"><span>Sessions <strong>{payload.total_sessions}</strong></span><span>P2P <strong>{payload.p2p}</strong></span><span>Relay <strong>{payload.relay}</strong></span></div>
      <p>{number(payload.total_bytes)} bytes | IMEI {payload.imeis.join(", ") || "-"}</p>
      <div className="table-wrap">
        <table><thead><tr><th>Destination</th><th>Sessions</th><th>Class</th><th>Bytes</th></tr></thead><tbody>
          {payload.top_destinations.map((item) => <tr key={item.endpoint}><td className="mono">{item.endpoint}</td><td>{item.sessions}</td><td>{item.classification}</td><td>{number(item.bytes_total)}</td></tr>)}
        </tbody></table>
      </div>
    </div>
  );
}
function PackagesPage({ packagesList }) {
  const [selectedId, setSelectedId] = useState(packagesList[0]?.id);
  const selected = packagesList.find((item) => item.id === selectedId) ?? packagesList[0];

  useEffect(() => {
    if (!packagesList.length) {
      setSelectedId(undefined);
      return;
    }
    if (!selectedId || !packagesList.some((item) => item.id === selectedId)) {
      setSelectedId(packagesList[0].id);
    }
  }, [packagesList, selectedId]);

  const copyPayload = async () => {
    if (selected) {
      await navigator.clipboard?.writeText(JSON.stringify(selected.payload, null, 2));
    }
  };

  const exportPayload = () => {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected.payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selected.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-5">
        <PanelHeader icon={FileText} title="Packages" action={<Badge tone="brand">{packagesList.length}</Badge>} />
        <div className="package-list">
          {packagesList.length ? packagesList.map((item) => (
            <button className={`package-row ${item.id === selected?.id ? "active" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
              <span>{item.id}</span>
              <strong>{item.target_operator}</strong>
              <small>{item.payload.destination_ip}:{item.payload.destination_port}</small>
            </button>
          )) : <EmptyState label="No request packages generated" />}
        </div>
      </section>
      <section className="panel span-7">
        <PanelHeader
          icon={ShieldCheck}
          title="Request Package"
          action={
            <div className="toolbar compact">
              <Button icon={Copy} variant="secondary" disabled={!selected} onClick={copyPayload}>Copy</Button>
              <Button icon={Download} variant="secondary" disabled={!selected} onClick={exportPayload}>Export JSON</Button>
            </div>
          }
        />
        {selected ? <RequestPackageCard item={selected} /> : <EmptyState label="No package selected" />}
      </section>
    </motion.section>
  );
}
function AuditPage({ auditLogs }) {
  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-12">
        <PanelHeader icon={Clipboard} title="Audit Log" action={<Badge tone="brand">{auditLogs.length} events</Badge>} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Entity</th>
                <th>User</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length ? auditLogs.map((log) => (
                <tr key={log.id}>
                  <td className="mono">{date(log.timestamp)}</td>
                  <td><Badge tone="brand">{log.action}</Badge></td>
                  <td>{log.entity_type} / <span className="mono">{log.entity_id}</span></td>
                  <td>{log.user}</td>
                  <td className="mono">{JSON.stringify(log.details)}</td>
                </tr>
              )) : <TableEmptyRow colSpan={5} label="No audit events recorded" />}
            </tbody>
          </table>
        </div>
      </section>
    </motion.section>
  );
}

function SettingsPage({ ranges, stats, apiLive, persistence, importSpecs = [], createImportSpec, createPersistenceSnapshot }) {
  const [tab, setTab] = useState("ranges");
  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-12">
        <PanelHeader icon={Settings} title="Settings" />
        <div className="tabs">
          {[
            ["ranges", "Platform Ranges"],
            ["adapters", "Operator Adapters"],
            ["import", "Import Specs"],
            ["system", "System Info"]
          ].map(([id, label]) => (
            <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
          ))}
        </div>
        {tab === "ranges" ? <RangesTable ranges={ranges} /> : null}
        {tab === "adapters" ? <AdaptersPanel /> : null}
        {tab === "import" ? <ImportSpecsPanel importSpecs={importSpecs} createImportSpec={createImportSpec} /> : null}
        {tab === "system" ? <SystemPanel stats={stats} apiLive={apiLive} persistence={persistence} createPersistenceSnapshot={createPersistenceSnapshot} /> : null}
      </section>
    </motion.section>
  );
}

function SessionsTable({ sessions, compact = false }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>MSISDN</th>
            {!compact ? <th>Source</th> : null}
            {!compact ? <th>NAT</th> : null}
            <th>Destination</th>
            <th>Operator</th>
            <th>Class</th>
            {!compact ? <th>Time</th> : null}
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {sessions.length ? sessions.map((session) => (
            <tr key={session.id}>
              <td><NavLink to={`/poi/${session.a_party_msisdn}`} className="text-link mono">{session.a_party_msisdn}</NavLink></td>
              {!compact ? <td className="mono">{formatEndpoint(session.source_ip, session.source_port)}</td> : null}
              {!compact ? <td className="mono">{formatEndpoint(session.translated_ip, session.translated_port)}</td> : null}
              <td><NavLink to={`/ip/${session.destination_ip}`} className="text-link mono">{formatEndpoint(session.destination_ip, session.destination_port)}</NavLink></td>
              <td>{session.operator}</td>
              <td><Badge tone={toneForClass(session.classification)}>{session.classification}</Badge></td>
              {!compact ? <td className="mono">{date(session.started_at)}</td> : null}
              <td>{Math.round(session.confidence * 100)}%</td>
            </tr>
          )) : <TableEmptyRow colSpan={compact ? 5 : 8} label="No normalized sessions found" />}
        </tbody>
      </table>
    </div>
  );
}

function ExtractionResultView({ extraction }) {
  return (
    <div className="stack">
      <div className="metric-row">
        <span>Total sessions: <strong>{extraction.total_sessions}</strong></span>
        <span>Relay: <strong>{extraction.relay_count}</strong></span>
        <span>Depth: <strong>{extraction.depth}</strong></span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>NAT</th>
              <th>Destination</th>
              <th>Operator</th>
              <th>Class</th>
              <th>Evidence</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {extraction.candidates.length ? extraction.candidates.map((candidate) => (
              <tr key={`${candidate.session_id}-${candidate.destination_ip}`}>
                <td className="mono">{formatEndpoint(candidate.source_ip, candidate.source_port)}</td>
                <td className="mono">{formatEndpoint(candidate.translated_ip, candidate.translated_port)}</td>
                <td className="mono">{formatEndpoint(candidate.destination_ip, candidate.destination_port)}</td>
                <td>{candidate.target_operator}</td>
                <td><Badge tone={toneForClass(candidate.classification)}>{candidate.classification}</Badge></td>
                <td>{candidate.evidence}</td>
                <td>{Math.round(candidate.confidence * 100)}%</td>
              </tr>
            )) : <TableEmptyRow colSpan={7} label="No candidates met the confidence threshold" />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function normalizeGraphResponse(payload) {
  const graph = payload ?? emptyGraphData;
  return {
    nodes: (graph.nodes ?? []).map((node) => ({
      ...node,
      lastSeen: node.last_seen ?? node.lastSeen ?? null,
      sessions: node.sessions ?? []
    })),
    links: (graph.links ?? []).map((link) => ({
      ...link,
      sourceId: link.source_id ?? link.sourceId,
      targetId: link.target_id ?? link.targetId,
      duration: link.duration_seconds ?? link.duration ?? 0,
      sessions: link.sessions ?? []
    })),
    sessions: graph.sessions ?? [],
    metrics: { ...emptyGraphData.metrics, ...(graph.metrics ?? {}) }
  };
}
function NetworkGraph({ graphData, selected, onSelect, onExtract }) {
  const VIEW_WIDTH = 1120;
  const VIEW_HEIGHT = 640;
  const svgRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [manualPositions, setManualPositions] = useState({});

  const graph = useMemo(() => {
    const sourceGraph = graphData ?? emptyGraphData;
    const nodes = sourceGraph.nodes ?? [];
    const links = sourceGraph.links ?? [];
    const simulationNodes = nodes.map((node, index) => ({ ...node, x: 180 + index * 42, y: 160 + index * 22 }));
    const simulationLinks = links.map((link) => ({ ...link, source: link.sourceId, target: link.targetId }));

    if (simulationNodes.length > 1) {
      const simulation = forceSimulation(simulationNodes)
        .force("link", forceLink(simulationLinks).id((node) => node.id).distance((link) => link.classification === "p2p" ? 185 : 150).strength(0.55))
        .force("charge", forceManyBody().strength(-720))
        .force("center", forceCenter(VIEW_WIDTH / 2, VIEW_HEIGHT / 2))
        .force("collide", forceCollide((node) => node.kind === "source" ? 58 : 48))
        .stop();

      for (let index = 0; index < 260; index += 1) {
        simulation.tick();
      }
    } else if (simulationNodes.length === 1) {
      simulationNodes[0].x = VIEW_WIDTH / 2;
      simulationNodes[0].y = VIEW_HEIGHT / 2;
    }

    const positions = new Map(simulationNodes.map((node) => [node.id, { x: node.x, y: node.y }]));
    const positionedNodes = nodes.map((node) => ({ ...node, ...positions.get(node.id) }));
    const metrics = sourceGraph.metrics ?? emptyGraphData.metrics;

    return {
      nodes: positionedNodes,
      links,
      sessions: sourceGraph.sessions ?? [],
      metrics: {
        nodes: metrics.nodes ?? positionedNodes.length,
        edges: metrics.edges ?? links.length,
        sessions: metrics.sessions ?? sourceGraph.sessions?.length ?? 0,
        p2p: metrics.p2p ?? 0,
        relay: metrics.relay ?? 0,
        unknown: metrics.unknown ?? 0,
        high_confidence: metrics.high_confidence ?? 0
      }
    };
  }, [graphData]);
  useEffect(() => {
    setManualPositions({});
    setPan({ x: 0, y: 0 });
    setZoom(1);
    onSelect(null);
  }, [graphData, onSelect]);

  const positions = useMemo(() => {
    const map = new Map();
    graph.nodes.forEach((node) => {
      map.set(node.id, manualPositions[node.id] ?? { x: node.x, y: node.y });
    });
    return map;
  }, [graph.nodes, manualPositions]);

  const getRawPointFromClient = useCallback((clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_WIDTH,
      y: ((clientY - rect.top) / rect.height) * VIEW_HEIGHT
    };
  }, []);

  const zoomToPoint = useCallback((nextZoom, rawPoint, baseZoom = zoom, basePan = pan) => {
    const graphX = (rawPoint.x - basePan.x) / baseZoom;
    const graphY = (rawPoint.y - basePan.y) / baseZoom;
    setZoom(nextZoom);
    setPan({
      x: rawPoint.x - graphX * nextZoom,
      y: rawPoint.y - graphY * nextZoom
    });
  }, [pan, zoom]);

  const toGraphPoint = (event) => {
    const raw = getRawPointFromClient(event.clientX, event.clientY);
    return { x: (raw.x - pan.x) / zoom, y: (raw.y - pan.y) / zoom, rawX: raw.x, rawY: raw.y };
  };

  const rememberPointer = (event) => {
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    try {
      svgRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture can fail when the browser has already cancelled the gesture.
    }
  };

  const getPinchPoints = () => Array.from(pointersRef.current.values()).slice(0, 2);

  const getPinchSnapshot = () => {
    const [first, second] = getPinchPoints();
    if (!first || !second) return null;
    const centerClientX = (first.clientX + second.clientX) / 2;
    const centerClientY = (first.clientY + second.clientY) / 2;
    return {
      distance: Math.max(Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY), 1),
      rawCenter: getRawPointFromClient(centerClientX, centerClientY)
    };
  };

  const beginPinch = () => {
    const snapshot = getPinchSnapshot();
    if (!snapshot) return false;
    gestureRef.current = {
      distance: snapshot.distance,
      startZoom: zoom,
      graphX: (snapshot.rawCenter.x - pan.x) / zoom,
      graphY: (snapshot.rawCenter.y - pan.y) / zoom
    };
    dragRef.current = { type: "pinch" };
    return true;
  };

  const updatePinch = () => {
    const snapshot = getPinchSnapshot();
    if (!snapshot) return false;
    if (!gestureRef.current && !beginPinch()) return false;
    const gesture = gestureRef.current;
    const nextZoom = clamp(gesture.startZoom * (snapshot.distance / gesture.distance), 0.45, 2.4);
    setZoom(nextZoom);
    setPan({
      x: snapshot.rawCenter.x - gesture.graphX * nextZoom,
      y: snapshot.rawCenter.y - gesture.graphY * nextZoom
    });
    return true;
  };

  const beginPan = (event) => {
    rememberPointer(event);
    if (pointersRef.current.size > 1) {
      beginPinch();
      return;
    }
    const point = toGraphPoint(event);
    dragRef.current = { type: "pan", startX: point.rawX, startY: point.rawY, startPan: pan };
  };

  const beginNodeDrag = (event, node) => {
    event.stopPropagation();
    rememberPointer(event);
    if (pointersRef.current.size > 1) {
      beginPinch();
      return;
    }
    const point = toGraphPoint(event);
    const current = positions.get(node.id) ?? { x: node.x, y: node.y };
    dragRef.current = { type: "node", nodeId: node.id, offsetX: point.x - current.x, offsetY: point.y - current.y };
    onSelect({ type: "node", node });
  };

  const handlePointerMove = (event) => {
    if (pointersRef.current.has(event.pointerId)) {
      event.preventDefault();
      pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    if (pointersRef.current.size > 1) {
      updatePinch();
      return;
    }
    if (!dragRef.current) return;
    const point = toGraphPoint(event);
    if (dragRef.current.type === "node") {
      setManualPositions((current) => ({
        ...current,
        [dragRef.current.nodeId]: { x: point.x - dragRef.current.offsetX, y: point.y - dragRef.current.offsetY }
      }));
      return;
    }
    if (dragRef.current.type === "pan") {
      setPan({
        x: dragRef.current.startPan.x + point.rawX - dragRef.current.startX,
        y: dragRef.current.startPan.y + point.rawY - dragRef.current.startY
      });
    }
  };

  const endPointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    try {
      svgRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignore cancelled pointer captures.
    }
    if (pointersRef.current.size < 2) gestureRef.current = null;
    if (pointersRef.current.size === 0 || dragRef.current?.type === "pinch") dragRef.current = null;
  };

  const clearDrag = () => {
    pointersRef.current.clear();
    gestureRef.current = null;
    dragRef.current = null;
  };

  const zoomBy = (delta) => {
    const nextZoom = clamp(zoom + delta, 0.45, 2.4);
    zoomToPoint(nextZoom, { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 });
  };

  useEffect(() => {
    const target = svgRef.current;
    if (!target) return undefined;
    const handleWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const scale = event.deltaY > 0 ? (event.ctrlKey ? 0.86 : 0.92) : (event.ctrlKey ? 1.14 : 1.08);
      zoomToPoint(clamp(zoom * scale, 0.45, 2.4), getRawPointFromClient(event.clientX, event.clientY));
    };
    target.addEventListener("wheel", handleWheel, { passive: false });
    return () => target.removeEventListener("wheel", handleWheel);
  }, [getRawPointFromClient, zoom, zoomToPoint]);

  useEffect(() => {
    const target = canvasRef.current;
    if (!target) return undefined;
    const stopBrowserGesture = (event) => event.preventDefault();
    target.addEventListener("gesturestart", stopBrowserGesture, { passive: false });
    target.addEventListener("gesturechange", stopBrowserGesture, { passive: false });
    target.addEventListener("gestureend", stopBrowserGesture, { passive: false });
    return () => {
      target.removeEventListener("gesturestart", stopBrowserGesture);
      target.removeEventListener("gesturechange", stopBrowserGesture);
      target.removeEventListener("gestureend", stopBrowserGesture);
    };
  }, []);

  const fitGraph = () => {
    if (!graph.nodes.length) return;
    const allPositions = graph.nodes.map((node) => positions.get(node.id) ?? node);
    const minX = Math.min(...allPositions.map((node) => node.x));
    const maxX = Math.max(...allPositions.map((node) => node.x));
    const minY = Math.min(...allPositions.map((node) => node.y));
    const maxY = Math.max(...allPositions.map((node) => node.y));
    const width = Math.max(maxX - minX, 240);
    const height = Math.max(maxY - minY, 180);
    const nextZoom = clamp(Math.min((VIEW_WIDTH - 180) / width, (VIEW_HEIGHT - 150) / height), 0.55, 1.8);
    setZoom(nextZoom);
    setPan({
      x: VIEW_WIDTH / 2 - ((minX + maxX) / 2) * nextZoom,
      y: VIEW_HEIGHT / 2 - ((minY + maxY) / 2) * nextZoom
    });
  };

  const resetGraph = () => {
    setManualPositions({});
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const selectedNode = selected?.type === "node" ? selected.node : null;
  const selectedEdge = selected?.type === "edge" ? selected.link : null;

  return (
    <div className="network-workspace">
      <div className="network-stage">
        <div className="graph-statusbar">
          <GraphMetric label="Sessions" value={graph.metrics.sessions} />
          <GraphMetric label="Nodes" value={graph.metrics.nodes} />
          <GraphMetric label="Links" value={graph.metrics.edges} />
          <GraphMetric label="P2P" value={graph.metrics.p2p} tone="success" />
          <GraphMetric label="Relay" value={graph.metrics.relay} tone="danger" />
          <div className="graph-legend" aria-label="Graph legend">
            <span><i className="legend-dot source" />A-party</span>
            <span><i className="legend-dot p2p" />P2P lead</span>
            <span><i className="legend-dot relay" />Relay/noise</span>
          </div>
        </div>

        <div ref={canvasRef} className="network-canvas graph-canvas">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            role="img"
            aria-label="Interactive communication graph"
            onPointerMove={handlePointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onLostPointerCapture={endPointer}
          >
            <defs>
              <marker id="arrow-p2p" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
              <marker id="arrow-relay" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <rect className="graph-hit-area" width={VIEW_WIDTH} height={VIEW_HEIGHT} onPointerDown={beginPan} />
            <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
              <g className="graph-links">
                {graph.links.map((link) => {
                  const source = positions.get(link.sourceId);
                  const target = positions.get(link.targetId);
                  if (!source || !target) return null;
                  const active = selectedEdge?.id === link.id;
                  const midX = (source.x + target.x) / 2;
                  const midY = (source.y + target.y) / 2;
                  return (
                    <g key={link.id} className={`graph-link-group ${active ? "is-selected" : ""}`} onClick={() => onSelect({ type: "edge", link })}>
                      <line className="graph-link-hit" x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
                      <line
                        className={`graph-link ${link.classification}`}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        strokeWidth={2 + Math.min(link.count, 4)}
                        markerEnd={`url(#arrow-${link.classification === "relay" ? "relay" : "p2p"})`}
                      />
                      <text className="graph-link-label" x={midX} y={midY - 8} textAnchor="middle">{link.count} session{link.count === 1 ? "" : "s"}</text>
                    </g>
                  );
                })}
              </g>
              <g className="graph-nodes">
                {graph.nodes.map((node) => {
                  const point = positions.get(node.id) ?? node;
                  const active = selectedNode?.id === node.id;
                  const radius = node.kind === "source" ? 34 : 25;
                  return (
                    <g
                      key={node.id}
                      role="button"
                      tabIndex="0"
                      className={`graph-node ${node.kind} ${active ? "is-selected" : ""}`}
                      transform={`translate(${point.x} ${point.y})`}
                      onPointerDown={(event) => beginNodeDrag(event, node)}
                      onClick={() => onSelect({ type: "node", node })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") onSelect({ type: "node", node });
                      }}
                    >
                      <circle r={radius} />
                      <text className="graph-node-title" y={node.kind === "source" ? 4 : 3} textAnchor="middle">{node.label}</text>
                      <text className="graph-node-subtitle" y={radius + 17} textAnchor="middle">{node.kind === "source" ? "A-party" : node.operator}</text>
                    </g>
                  );
                })}
              </g>
            </g>
          </svg>

          <div className="graph-tools" aria-label="Graph controls">
            <button type="button" onClick={() => zoomBy(0.15)} aria-label="Zoom in" data-tooltip="Zoom in"><ZoomIn size={16} /></button>
            <button type="button" onClick={() => zoomBy(-0.15)} aria-label="Zoom out" data-tooltip="Zoom out"><ZoomOut size={16} /></button>
            <button type="button" onClick={fitGraph} aria-label="Fit graph" data-tooltip="Fit graph"><LocateFixed size={16} /></button>
            <button type="button" onClick={resetGraph} aria-label="Reset graph" data-tooltip="Reset graph"><RotateCcw size={16} /></button>
          </div>
        </div>
      </div>

      <aside className="graph-inspector">
        {selectedNode ? (
          <GraphNodeInspector node={selectedNode} onExtract={onExtract} />
        ) : selectedEdge ? (
          <GraphEdgeInspector link={selectedEdge} />
        ) : (
          <div className="graph-empty-inspector">
            <strong>Select a node or connection</strong>
            <span>Inspect operators, confidence, evidence rows, and actionable B-party leads.</span>
          </div>
        )}
      </aside>
    </div>
  );
}

function GraphMetric({ label, value, tone = "neutral" }) {
  return (
    <div className={`graph-metric ${tone}`}>
      <span>{label}</span>
      <strong>{number(value)}</strong>
    </div>
  );
}

function GraphNodeInspector({ node, onExtract }) {
  const sessions = node.sessions ?? [];
  const latest = sessions[0];
  return (
    <div className="graph-inspector__content">
      <span className="eyebrow">Node</span>
      <h3>{node.title}</h3>
      <Badge tone={toneForClass(node.kind === "source" ? "p2p" : node.kind)}>{node.kind === "source" ? "A-party" : node.kind}</Badge>
      <dl>
        <div><dt>Operator</dt><dd>{node.operator}</dd></div>
        <div><dt>Sessions</dt><dd>{number(node.count)}</dd></div>
        <div><dt>Confidence</dt><dd>{Math.round(node.confidence * 100)}%</dd></div>
        <div><dt>Last seen</dt><dd>{latest ? date(latest.started_at) : "-"}</dd></div>
      </dl>
      {node.kind === "source" ? <Button type="button" icon={Target} onClick={onExtract}>Run extraction</Button> : null}
      {latest ? <p className="graph-evidence mono">{latest.source_file} row {latest.row_number}</p> : null}
    </div>
  );
}

function GraphEdgeInspector({ link }) {
  const first = link.sessions[0];
  return (
    <div className="graph-inspector__content">
      <span className="eyebrow">Connection</span>
      <h3>{link.sourceId} {"->"} {link.targetId}</h3>
      <Badge tone={toneForClass(link.classification)}>{link.classification}</Badge>
      <dl>
        <div><dt>Sessions</dt><dd>{number(link.count)}</dd></div>
        <div><dt>Total bytes</dt><dd>{number(link.bytes)}</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(link.duration)}</dd></div>
        <div><dt>Confidence</dt><dd>{Math.round(link.confidence * 100)}%</dd></div>
      </dl>
      <div className="graph-evidence-list">
        {link.sessions.slice(0, 4).map((session) => (
          <div key={session.id}>
            <strong>{session.operator}</strong>
            <span className="mono">Dst {formatEndpoint(session.destination_ip, session.destination_port)}</span>
            <small>{formatEndpoint(session.source_ip, session.source_port)}{session.translated_ip ? ` via ${formatEndpoint(session.translated_ip, session.translated_port)}` : ""}</small>
            <small>{session.source_file} row {session.row_number}</small>
          </div>
        ))}
      </div>
      {first ? <p className="graph-evidence mono">Protocol {first.protocol} | {first.app_hint}</p> : null}
    </div>
  );
}

function upsertGraphNode(nodesById, node) {
  const existing = nodesById.get(node.id);
  const bytes = node.session.bytes_up + node.session.bytes_down;
  if (!existing) {
    nodesById.set(node.id, {
      ...node,
      count: 1,
      bytes,
      confidence: node.session.confidence,
      sessions: [node.session]
    });
    return;
  }
  existing.count += 1;
  existing.bytes += bytes;
  existing.confidence = Math.max(existing.confidence, node.session.confidence);
  existing.sessions.push(node.session);
  if (existing.kind !== "source" && node.kind === "p2p") existing.kind = "p2p";
  if (existing.kind === "unknown" && node.kind === "relay") existing.kind = "relay";
}

function shortIp(ip) {
  const parts = ip.split(".");
  return parts.length === 4 ? `${parts[2]}.${parts[3]}` : ip;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatEndpoint(ip, port) {
  if (!ip) return "-";
  return port ? `${ip}:${port}` : ip;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}
function RequestPackageCard({ item }) {
  const details = [
    ["Source", formatEndpoint(item.payload.source_ip, item.payload.source_port)],
    ["NAT", formatEndpoint(item.payload.translated_ip, item.payload.translated_port)],
    ["Destination", formatEndpoint(item.payload.destination_ip, item.payload.destination_port)],
    ["Protocol", item.payload.protocol],
    ["Started", item.payload.timestamp_ist],
    ["Ended", item.payload.end_timestamp_ist ?? "-"],
    ["Duration", `${item.payload.duration_seconds}s`],
    ["Record", item.payload.record_type ?? "ipdr"],
    ["Confidence", `${Math.round(item.payload.confidence * 100)}%`]
  ];

  return (
    <article className="request-package">
      <header>
        <span>{item.request_type}</span>
        <strong>To: {item.target_operator}</strong>
      </header>
      <section>
        <h3>Technical Details</h3>
        <dl>
          {details.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h3>Evidence Chain</h3>
        <p className="mono">{JSON.stringify(item.payload.evidence_chain, null, 2)}</p>
      </section>
    </article>
  );
}

function RangesTable({ ranges }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Platform</th>
            <th>CIDR</th>
            <th>ASN</th>
            <th>Status</th>
            <th>Verified</th>
          </tr>
        </thead>
        <tbody>
          {ranges.length ? ranges.map((range) => (
            <tr key={range.id}>
              <td>{range.platform}</td>
              <td className="mono">{range.cidr}</td>
              <td className="mono">{range.asn}</td>
              <td><Badge tone={range.active ? "success" : "neutral"}>{range.active ? "active" : "inactive"}</Badge></td>
              <td className="mono">{date(range.last_verified)}</td>
            </tr>
          )) : <TableEmptyRow colSpan={5} label="No platform ranges configured" />}
        </tbody>
      </table>
    </div>
  );
}

function ImportSpecsPanel({ importSpecs, createImportSpec }) {
  const defaultMapping = [
    "msisdn=MSISDN",
    "source_ip=Source IP Address",
    "source_port=Source Port",
    "translated_ip=Translated IP Address",
    "translated_port=Translated Port",
    "destination_ip=Destination IP Address",
    "destination_port=Destination Port",
    "started_at=Start Date Time",
    "imei=IMEI",
    "domain=Domain",
    "cell_id=Cell ID"
  ].join("\n");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [delimiter, setDelimiter] = useState("");
  const [mappingText, setMappingText] = useState(defaultMapping);
  const fileInputRef = useRef(null);
  const [analyzing, setAnalyzing] = useState(false);

  const handleAutoSuggest = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    try {
      const result = await api.autoSuggestMapping(file);
      const newMappingText = Object.entries(result.suggested_mapping || result)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      setMappingText(newMappingText);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    const mapping = Object.fromEntries(
      mappingText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [canonical, ...sourceParts] = line.split("=");
          return [canonical.trim(), sourceParts.join("=").trim()];
        })
        .filter(([canonical, source]) => canonical && source)
    );
    const created = await createImportSpec({ name, description, delimiter: delimiter || null, mapping });
    if (created) {
      setName("");
      setDescription("");
      setDelimiter("");
      setMappingText(defaultMapping);
    }
  };

  return (
    <div className="settings-split">
      <form className="stack" onSubmit={submit}>
        <div className="form-grid compact">
          <label className="field"><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Operator / format name" /></label>
          <label className="field"><span>Delimiter</span><input value={delimiter} onChange={(event) => setDelimiter(event.target.value)} placeholder="Auto, comma, tab, pipe" /></label>
        </div>
        <label className="field"><span>Description</span><input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="When investigators should use this spec" /></label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", marginBottom: "4px" }}>
           <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-secondary)" }}>COLUMN MAPPING</span>
           <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
             <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={analyzing}>
               {analyzing ? "Analyzing..." : "Auto-Detect"}
             </Button>
             <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleAutoSuggest} />
           </label>
        </div>
        <label className="field"><textarea value={mappingText} onChange={(event) => setMappingText(event.target.value)} rows={12} style={{ fontFamily: "var(--font-mono)" }} /></label>
        <Button icon={FileText} disabled={!name.trim()}>Save import spec</Button>
      </form>
      <div className="spec-list">
        {importSpecs.length ? importSpecs.map((spec) => (
          <article className="spec-card" key={spec.id}>
            <div><strong>{spec.name}</strong><span className="mono">{spec.id}</span></div>
            <p>{spec.description || "Custom operator mapping"}</p>
            <Badge tone="brand">{Object.keys(spec.mapping ?? {}).length} fields</Badge>
          </article>
        )) : <EmptyState label="No import specs configured" />}
      </div>
    </div>
  );
}

function AdaptersPanel() {
  return (
    <div className="adapter-grid">
      {["DoT IPDR", "NAT SYSLOG", "Airtel", "Jio", "Vodafone Idea", "BSNL", "Generic"].map((name) => (
        <div className="adapter-tile" key={name}>
          <strong>{name}</strong>
          <span>msisdn, source_ip:port, translated_ip:port, destination_ip:port</span>
          <Badge tone="success">loaded</Badge>
        </div>
      ))}
    </div>
  );
}

function SystemPanel({ stats, apiLive, persistence, createPersistenceSnapshot }) {
  const [busy, setBusy] = useState(false);
  const snapshot = async () => {
    if (!createPersistenceSnapshot) return;
    setBusy(true);
    try {
      await createPersistenceSnapshot();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="system-stack">
      <div className="system-grid">
        <StatCard icon={Server} label="API" value={apiLive ? "Live" : "Offline"} tone={apiLive ? "success" : "danger"} />
        <StatCard icon={Database} label="Rows" value={number(stats.sessions)} tone="brand" />
        <StatCard icon={AlertTriangle} label="Quarantine" value={number(stats.quarantined_rows)} tone="danger" />
      </div>
      <article className="persistence-card">
        <div>
          <span>Evidence database</span>
          <strong>{persistence?.backend ?? "sqlite_snapshot"}</strong>
          <p className="mono">{persistence?.path ?? "Snapshot path unavailable"}</p>
        </div>
        <div className="persistence-card__meta">
          <Badge tone={persistence?.enabled ? "success" : "warning"}>{persistence?.enabled ? "Enabled" : "Pending"}</Badge>
          <span>{persistence?.last_snapshot_at ? `Last ${date(persistence.last_snapshot_at)}` : "No snapshot yet"}</span>
          <Button type="button" icon={Database} variant="secondary" onClick={snapshot} disabled={busy}>{busy ? "Writing" : "Write snapshot"}</Button>
        </div>
      </article>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = "neutral" }) {
  return (
    <div className={`stat-card ${tone}`}>
      <span className="stat-card__icon"><Icon size={18} /></span>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}





function Button({ children, icon: Icon, variant = "primary", ...props }) {
  return (
    <button className={`button ${variant}`} type={props.type ?? "submit"} {...props}>
      {Icon ? <Icon size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}

function SelectControl({ ariaLabel, icon: Icon, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className={`select-control ${open ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
    >
      <button
        className="select-control__button"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        {Icon ? <Icon size={16} /> : null}
        <span>{selected.label}</span>
        <ChevronDown size={16} className="select-control__chevron" />
      </button>
      {open ? (
        <div className="select-control__menu" role="listbox" aria-label={ariaLabel} tabIndex={-1}>
          {options.map((option) => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                className={`select-control__option ${active ? "is-selected" : ""}`}
                type="button"
                role="option"
                aria-selected={active}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {active ? <Check size={15} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Progress({ value }) {
  return (
    <div className="progress" aria-label={`${value}%`}>
      <span style={{ width: `${value}%` }} />
    </div>
  );
}



function TableEmptyRow({ colSpan, label }) {
  return (
    <tr>
      <td className="table-empty" colSpan={colSpan}>{label}</td>
    </tr>
  );
}

function ToastViewport({ toasts, dismiss }) {
  return (
    <div className="toast-stack">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            className={`toast ${toast.kind}`}
            type="button"
            onClick={() => dismiss(toast.id)}
            initial={{ opacity: 0, x: 80 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 80 }}
          >
            {toast.kind === "success" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>
              <strong>{toast.title}</strong>
              <small>{toast.body}</small>
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

function toneForClass(classification) {
  if (classification === "p2p") return "success";
  if (classification === "relay") return "danger";
  return "warning";
}

function splitList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}


function date(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false
  }).format(new Date(value));
}

export default App;


