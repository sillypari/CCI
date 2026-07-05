import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PanelHeader, Badge, EmptyState, number, Modal } from "./components/common.jsx";
import { GeoMap } from "./components/GeoMap.jsx";
import { PoIPage } from "./components/PoIPage.jsx";
import { IpPage } from "./components/IpPage.jsx";
import { ImeiPage } from "./components/ImeiPage.jsx";
import { AnimatePresence, motion } from "framer-motion";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  Code,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  Star,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  Layers,
  Maximize2,
  Minimize2,
  XCircle
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
  imeiRows: [],
  locationRows: [],
  persistence: null
};

function App() {
  const [data, setData] = useState(initialState);
  const [apiLive, setApiLive] = useState(false);
  const [apiError, setApiError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [isServerActive, setIsServerActive] = useState(false);

  const pushToast = useCallback((kind, title, body) => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, kind, title, body }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [stats, cases, importSpecs, uploads, jobs, sessions, patterns, timeline, applications, extractions, packagesList, auditLogs, platformRanges, persistence, imeiRows, locationRows] = await Promise.all([
        api.dashboard(),
        api.cases(),
        api.importSpecs(),
        api.uploads(),
        api.uploadJobs(),
        api.sessions(),
        api.patterns(),
        api.timeline(),
        api.applications(),
        api.extractions(),
        api.packages(),
        api.auditLogs(),
        api.platformRanges(),
        api.persistenceStatus(),
        api.imeiFrequency("?limit=6"),
        api.locationSummary("?limit=6")
      ]);
      setData((current) => ({ ...current, stats, cases, importSpecs, uploads, jobs, sessions, patterns, timeline, applications, extractions, packages: packagesList, auditLogs, platformRanges, persistence, imeiRows, locationRows }));
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

  useEffect(() => {
    let timer = null;

    const poll = async () => {
      try {
        const jobsList = await api.uploadJobs();
        setData((current) => ({ ...current, jobs: jobsList }));
        
        const hasActive = jobsList.some((j) => j.status === "processing" || j.status === "pending");
        if (!hasActive) {
          const [statsList, uploadsList] = await Promise.all([api.dashboard(), api.uploads()]);
          setData((current) => ({ ...current, stats: statsList, uploads: uploadsList }));
        }
      } catch (err) {
        console.error("Polling jobs failed:", err);
      }
    };

    const hasActiveJob = isServerActive || data.jobs.some((j) => j.status === "processing" || j.status === "pending");
    if (hasActiveJob) {
      timer = setInterval(poll, 1500);
    } else {
      timer = setInterval(poll, 6000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [data.jobs, isServerActive]);

  const setJobs = useCallback((jobsList) => {
    setData((current) => ({ ...current, jobs: jobsList }));
  }, []);

  const uploadFile = useCallback(
    async (file, options = {}) => {
      setIsServerActive(true);
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
      } finally {
        setIsServerActive(false);
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
      setIsServerActive(true);
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
      } finally {
        setIsServerActive(false);
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

  const resetPersistence = useCallback(
    async () => {
      try {
        const status = await api.resetPersistence();
        await refresh();
        pushToast("success", "Database reset complete", "All records have been cleared to 0.");
        return status;
      } catch (error) {
        pushToast("error", "Database reset failed", error.message);
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
            <Route path="/uploads" element={<UploadsPage uploads={data.uploads} jobs={data.jobs} cases={data.cases} importSpecs={data.importSpecs} uploadFile={uploadFile} validateFile={validateFile} deleteUpload={deleteUpload} setJobs={setJobs} />} />
            <Route path="/sessions" element={<SessionsPage sessions={data.sessions} />} />
            <Route path="/extractions" element={<ExtractionsPage extractions={data.extractions} runExtraction={runExtraction} />} />
            <Route path="/map" element={<MapPage runExtraction={runExtraction} sessionCount={data.stats.sessions} />} />
            <Route path="/analytics" element={<AnalyticsPage timeline={data.timeline} applications={data.applications} patterns={data.patterns} />} />
            <Route path="/poi/:msisdn" element={<PoIPage sessionCount={data.stats.sessions} />} />
            <Route path="/ip/:ip" element={<IpPage sessionCount={data.stats.sessions} />} />
            <Route path="/imei" element={<ImeiPage sessionCount={data.stats.sessions} />} />
            <Route path="/reports" element={<ReportsPage sessions={data.sessions} sessionCount={data.stats.sessions} />} />
            <Route path="/packages" element={<PackagesPage packagesList={data.packages} />} />
            <Route path="/audit" element={<AuditPage auditLogs={data.auditLogs} />} />
            <Route path="/settings" element={<SettingsPage ranges={data.platformRanges} stats={data.stats} apiLive={apiLive} persistence={data.persistence} importSpecs={data.importSpecs} createImportSpec={createImportSpec} createPersistenceSnapshot={createPersistenceSnapshot} resetPersistence={resetPersistence} />} />
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

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "mobile-open" : ""} ${location.pathname === "/map" ? "is-map-route" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__brand" onClick={() => collapsed && setCollapsed(false)} style={{ cursor: collapsed ? "pointer" : "default" }}>
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
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((value) => !value);
            }}
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
          <div className="topbar__left">
            <button className="icon-button mobile-menu" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label="Menu" data-tooltip="Menu">
              {mobileOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="topbar__title">
              <PageIcon size={18} />
              <span>{page.label}</span>
            </div>
          </div>

          <div className="topbar__center">
            <div className="brand-lockup">
              <img className="brand-mark" src="/brand-logo.png" alt="" />
              <div className="brand-copy">
                <strong>Pramaan IPDR</strong>
                <span>B-party intelligence</span>
              </div>
            </div>
          </div>

          <div className="topbar__right">
            {location.pathname !== "/map" && (
              <form className="global-search" onSubmit={submitSearch}>
                <Search size={16} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search MSISDN, IP..." />
              </form>
            )}
            <div 
              className={`system-state ${apiLive ? "healthy" : "offline"}`}
              onDoubleClick={toggleFullScreen}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Double click to toggle fullscreen"
            >
              <span />
              {apiLive ? "API live" : "API offline"}
            </div>
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
  const recentSessions = (data.sessions ?? []).slice(0, 5);
  const actionableRate = data.stats?.sessions ? Math.round((data.stats.actionable / data.stats.sessions) * 100) : 0;
  const topPatterns = (data.patterns ?? []).slice(0, 4);

  const imeiRows = (data.imeiRows ?? []).slice(0, 6);
  const locationRows = (data.locationRows ?? []).slice(0, 6);
  const applications = (data.applications ?? []).slice(0, 6);

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="case-ribbon span-12">
        <div className="case-ribbon__main">
          <span className="eyebrow">Investigation cockpit</span>
          <h1>A-party to B-party correlation</h1>
          <p>{number(data.stats?.sessions)} normalized sessions | {number(data.stats?.actionable)} P2P leads | {number(data.stats?.relay)} relay/noise flows</p>
        </div>
        <div className="case-ribbon__metric">
          <span>Actionable rate</span>
          <strong>{actionableRate}%</strong>
        </div>
        <div className="case-ribbon__metric">
          <span>Confidence</span>
          <strong>{Math.round((data.stats?.avg_confidence ?? 0) * 100)}%</strong>
        </div>
      </section>

      <div className="dashboard-strip">
        <StatCard icon={Upload} label="Uploads" value={data.stats?.uploads} tone="brand" />
        <StatCard icon={Database} label="Sessions" value={number(data.stats?.sessions)} tone="neutral" />
        <StatCard icon={Target} label="P2P leads" value={number(data.stats?.actionable)} tone="success" />
        <StatCard icon={Server} label="Relay/noise" value={number(data.stats?.relay)} tone="danger" />
        <StatCard icon={Gauge} label="Quarantine" value={number(data.stats?.quarantined_rows)} tone="warning" />
      </div>

      {/* Row 1: IMEI Handset Frequency & Location Hotspots */}
      <motion.section 
        className="panel span-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.22 }}
      >
        <PanelHeader icon={Smartphone} title="Top Active Handsets (IMEI)" action={<Badge tone="brand">{imeiRows.length}</Badge>} />
        <div className="report-list scrollable-list">
          {imeiRows.length ? imeiRows.map((item) => (
            <article className="report-row" key={item.imei}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong className="mono" style={{ fontSize: '13px' }}>{item.imei}</strong>
                <Badge tone="brand">{item.sessions} sessions</Badge>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'block' }}>
                {item.msisdns?.length || 0} suspect lines | {item.handset_hint ?? "TAC model details unavailable"}
              </span>
            </article>
          )) : <EmptyState label="No IMEI records found in active case" />}
        </div>
      </motion.section>

      <motion.section 
        className="panel span-6"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.22 }}
      >
        <PanelHeader icon={LocateFixed} title="Location Hotspots" action={<Badge tone="brand">{locationRows.length}</Badge>} />
        <div className="report-list scrollable-list">
          {locationRows.length ? locationRows.map((item) => (
            <article className="report-row" key={item.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px' }}>{item.label}</strong>
                <Badge tone="neutral">{item.sessions} sessions</Badge>
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                <span>Day: <strong>{item.day_sessions}</strong></span>
                <span>•</span>
                <span>Night: <strong>{item.night_sessions}</strong></span>
              </div>
            </article>
          )) : <EmptyState label="No cell tower location records found" />}
        </div>
      </motion.section>

      {/* Row 2: Top Apps, Latest Upload & Investigation Signals */}
      <section className="panel span-4">
        <PanelHeader icon={Layers} title="Top Apps & VoIP" action={<Badge tone="brand">{applications.length}</Badge>} />
        <div className="report-list scrollable-list">
          {applications.length ? applications.map((item) => (
            <article className="report-row" key={item.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px' }}>{item.name}</strong>
                <Badge tone="brand">{item.msisdns || 0} PoIs</Badge>
              </div>
              <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'block' }}>
                {item.destination_ips || 0} destination IPs | {formatDuration(item.duration_seconds || 0)}
              </span>
            </article>
          )) : <EmptyState label="No VoIP application records found" />}
        </div>
      </section>

      <section className="panel span-4">
        <PanelHeader icon={ShieldCheck} title="Latest Upload" action={<Badge tone="brand">{data.stats?.latest_upload?.status ?? "none"}</Badge>} />
        {data.stats?.latest_upload ? (
          <div className="upload-summary" style={{ padding: '4px' }}>
            <strong style={{ display: 'block', marginBottom: '8px', overflowWrap: 'break-word' }}>{data.stats.latest_upload.filename}</strong>
            <Progress value={data.stats.latest_upload.progress} />
            <div className="metric-row" style={{ marginTop: '12px', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{number(data.stats.latest_upload.rows_valid)} valid</span>
              <span>{number(data.stats.latest_upload.rows_quarantined)} quarantined</span>
              <span>{data.stats.latest_upload.format_report?.parser_engine ?? "parser"}</span>
            </div>
          </div>
        ) : (
          <EmptyState label="No uploads yet" />
        )}
      </section>

      <section className="panel span-4">
        <PanelHeader icon={AlertTriangle} title="Investigation Signals" action={<Badge tone={topPatterns.length ? "warning" : "success"}>{topPatterns.length}</Badge>} />
        {topPatterns.length ? <SignalList patterns={topPatterns} /> : <EmptyState label="No suspicious signals detected" />}
      </section>

      {/* Row 3: Full Width Recent Sessions Table */}
      <section className="panel span-12">
        <PanelHeader icon={Database} title="Recent Sessions Stream" action={<NavLink to="/sessions" className="text-link">View all sessions</NavLink>} />
        <SessionsTable sessions={recentSessions} compact={false} />
      </section>
    </motion.section>
  );
}

function SignalList({ patterns }) {
  return (
    <div className="signal-list scrollable-list">
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
function CasesPage({ cases = [], stats = {}, createCase, deleteCase }) {
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
function UploadsPage({ uploads = [], jobs = [], cases = [], importSpecs = [], uploadFile, validateFile, deleteUpload, setJobs }) {
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
    const form = event.currentTarget;
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
        form?.reset();
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
                <strong>
                  {progress.percent < 100 
                    ? (progress.phase === "validating" ? "Validating file format..." : "Uploading file to server...")
                    : (progress.phase === "validating" ? "Validating data schema..." : "Ingesting IPDR logs into database...")}
                </strong>
                <span className="mono" style={{ fontSize: "14px", color: "var(--color-brand)", fontWeight: "bold", margin: "6px 0" }}>
                  {progress.percent < 100 
                    ? `${progress.percent}% (${formatSpeed(progress.speed)})` 
                    : "100% (Upload finished)"}
                </span>
                <span style={{ fontSize: "12.5px", color: "var(--color-text-muted)", opacity: 0.9 }}>
                  {progress.percent < 100 
                    ? `Transferring bytes (${number(progress.loaded)} / ${number(progress.total)})...` 
                    : progress.phase === "validating" 
                      ? "Verifying structure and validating column mappings..." 
                      : "Parsing CSV rows and populating Case session telemetry... Please wait."}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
            <h3 style={{ margin: 0 }}>Ingestion Jobs</h3>
            {jobs.some(j => j.status !== "processing") && (
              <button 
                onClick={async () => {
                  try {
                    await api.clearJobs();
                    const updatedJobs = await api.uploadJobs();
                    setJobs(updatedJobs);
                  } catch (err) {
                    console.error("Failed to clear jobs:", err);
                  }
                }}
                style={{
                  fontSize: "11px",
                  background: "none",
                  border: "none",
                  color: "var(--color-danger)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  borderRadius: "4px"
                }}
                title="Clear finished and failed jobs history"
              >
                <Trash2 size={12} /> Clear History
              </button>
            )}
          </div>
          <div className="job-list">
            {jobs.length ? [...jobs].reverse().slice(0, 5).map((job) => {
              const isWorking = job.status === "processing" || job.status === "pending";
              
              // Calculate elapsed time and rows/sec speed
              const elapsedSec = (Date.now() - new Date(job.created_at).getTime()) / 1000;
              const rowsProcessed = Math.round((job.progress / 100) * job.rows_total);
              const speedRowsPerSec = elapsedSec > 0.5 ? Math.round(rowsProcessed / elapsedSec) : 0;
              
              let speedMessage = "";
              if (isWorking) {
                const rowProgMessage = job.message || "Starting...";
                speedMessage = speedRowsPerSec > 0 
                  ? `${rowProgMessage} (${number(speedRowsPerSec)} rows/s)` 
                  : rowProgMessage;
              } else if (job.status === "completed") {
                speedMessage = job.message || `Completed (${number(job.rows_valid)} rows)`;
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
                      {isWorking ? (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to terminate ingestion for ${job.filename}?`)) {
                              try {
                                await api.deleteJob(job.id);
                                const updatedJobs = await api.uploadJobs();
                                setJobs(updatedJobs);
                              } catch (err) {
                                console.error("Failed to terminate job:", err);
                              }
                            }
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-danger)",
                            cursor: "pointer",
                            padding: "2px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                          title="Terminate active ingestion job"
                        >
                          <XCircle size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await api.deleteJob(job.id);
                              const updatedJobs = await api.uploadJobs();
                              setJobs(updatedJobs);
                            } catch (err) {
                              console.error("Failed to delete job:", err);
                            }
                          }}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--color-text-secondary)",
                            cursor: "pointer",
                            padding: "2px",
                            borderRadius: "4px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center"
                          }}
                          className="hover:text-red-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                          title="Delete job entry"
                        >
                          <X size={12} />
                        </button>
                      )}
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
function SessionsPage({ sessions = [] }) {
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

function ExtractionsPage({ extractions = [], runExtraction }) {
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
      <section className="panel span-8" style={{ position: "relative" }}>
        <PanelHeader icon={ShieldCheck} title="Latest Result" action={latest ? <Badge tone="success">{latest.actionable_count} actionable</Badge> : null} />
        {busy ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', gap: '16px' }}>
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
            <div style={{ fontSize: '14px', fontWeight: '500' }}>Running B-Party extraction and network mapping...</div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>This may take a moment for large datasets.</div>
          </div>
        ) : latest ? (
          <ExtractionResultView extraction={latest} />
        ) : (
          <EmptyState label="No extraction has been run" />
        )}
      </section>
    </motion.section>
  );
}

function PremiumDatePicker({ value, onChange, placeholder = "Select date" }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = value ? new Date(value) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  });
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDate = (val) => {
    if (!val) return "";
    const d = new Date(val);
    return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const handleSelectDay = (day, isCurrentMonth = true) => {
    let targetDate;
    if (isCurrentMonth) {
      targetDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    } else {
      const offset = day > 15 ? -1 : 1;
      targetDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, day);
    }
    
    const offsetTime = targetDate.getTime() - targetDate.getTimezoneOffset() * 60000;
    const localDateString = new Date(offsetTime).toISOString().split("T")[0];
    
    onChange(localDateString);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setIsOpen(false);
  };

  const handleToday = () => {
    const today = new Date();
    const offsetTime = today.getTime() - today.getTimezoneOffset() * 60000;
    const localDateString = new Date(offsetTime).toISOString().split("T")[0];
    onChange(localDateString);
    setIsOpen(false);
  };

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const days = [];
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    days.push({ day: daysInPrevMonth - i, current: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, current: true });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, current: false });
  }

  const isSelected = (day, isCurrent) => {
    if (!value || !isCurrent) return false;
    const d = new Date(value);
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  };

  return (
    <div className="premium-datepicker" ref={containerRef}>
      <button
        type="button"
        className="premium-datepicker__trigger"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Calendar size={16} />
        <span>{value ? formatDate(value) : placeholder}</span>
      </button>

      {isOpen && (
        <div className="premium-datepicker__dropdown">
          <div className="premium-datepicker__header">
            <button type="button" onClick={handlePrevMonth} className="premium-datepicker__nav-btn">
              <ChevronLeft size={16} />
            </button>
            <span className="premium-datepicker__title">
              {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </span>
            <button type="button" onClick={handleNextMonth} className="premium-datepicker__nav-btn">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="premium-datepicker__weekdays">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="premium-datepicker__days">
            {days.map((item, idx) => {
              const selected = isSelected(item.day, item.current);
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectDay(item.day, item.current)}
                  className={`premium-datepicker__day ${item.current ? "current" : "adjacent"} ${selected ? "selected" : ""}`}
                >
                  {item.day}
                </button>
              );
            })}
          </div>

          <div className="premium-datepicker__footer">
            <button type="button" onClick={handleClear} className="premium-datepicker__footer-btn">
              Clear
            </button>
            <button type="button" onClick={handleToday} className="premium-datepicker__footer-btn">
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function primarySourceMsisdnFromNode(node) {
  if (!node) return "";
  if (node.kind === "source") return node.id;
  return node.sessions?.find((session) => session.a_party_msisdn)?.a_party_msisdn ?? "";
}

function sourceMsisdnFromSelection(selection) {
  if (!selection) return "";
  if (selection.type === "node") return primarySourceMsisdnFromNode(selection.node);
  if (selection.type === "edge") return selection.link?.sourceId ?? "";
  return "";
}
function MapPage({ runExtraction, sessionCount = 0 }) {
  // ── Query state ──────────────────────────────────────────────
  const [focus,         setFocus]         = useState("");
  const [focusType,     setFocusType]     = useState("msisdn");
  const [classification,setClassification]= useState("all");
  const [graphLimit,    setGraphLimit]    = useState(100);
  const [hops,          setHops]          = useState(1);
  const [includeRelay,  setIncludeRelay]  = useState(true);
  const [rankBy,        setRankBy]        = useState("score");
  const [minScore,      setMinScore]      = useState(0);
  const [startedFrom,   setStartedFrom]   = useState("");
  const [startedTo,     setStartedTo]     = useState("");
  const [layoutMode,    setLayoutMode]    = useState("force"); // "force" | "concentric" | "sankey" | "matrix"
  
  const handleFocusChange = (val) => {
    setFocus(val);
    const clean = val.trim();
    if (!clean) {
      setFocusType("any");
      return;
    }
    if (clean.includes(".") || clean.includes(":")) {
      setFocusType("ip");
    } else if (/^\d{15}$/.test(clean)) {
      setFocusType("imei");
    } else if (/^\d{10}$/.test(clean) || /^\d{14}$/.test(clean)) {
      setFocusType("msisdn");
    } else {
      setFocusType("any");
    }
  };
  // ── Graph state ──────────────────────────────────────────────
  const [selected,  setSelected]  = useState(null);
  const [graphData, setGraphData] = useState(() => emptyGraphData);
  const [graphBusy, setGraphBusy] = useState(false);
  const [graphError,setGraphError]= useState("");
  const deferredFocus = useDeferredValue(focus);

  const focusTypeOptions  = [
    { value: "msisdn",   label: "MSISDN" },
    { value: "ip",       label: "Dest IP" },
    { value: "imei",     label: "IMEI" },
    { value: "imsi",     label: "IMSI" },
    { value: "any",      label: "Any field" },
  ];
  const rankByOptions = [
    { value: "score",      label: "Investigation score" },
    { value: "p2p",        label: "P2P first" },
    { value: "confidence", label: "Confidence" },
    { value: "volume",     label: "Session volume" },
    { value: "recent",     label: "Most recent" },
  ];
  const graphLimitOptions = [
    { value: 50,   label: "Top 50 flows"   },
    { value: 100,  label: "Top 100 flows"  },
    { value: 250,  label: "Top 250 flows"  },
    { value: 500,  label: "Top 500 flows"  },
  ];

  // ── Derived export query ─────────────────────────────────────
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams();
    const f = focus.trim();
    if (f) { params.set("focus", f); params.set("focus_type", focusType); }
    if (classification !== "all") params.set("classification", classification);
    params.set("limit",          String(graphLimit));
    params.set("hops",           String(hops));
    params.set("include_relay",  String(includeRelay));
    params.set("rank_by",        rankBy);
    if (minScore > 0) params.set("min_score", String(minScore));
    if (startedFrom) params.set("started_from", startedFrom);
    if (startedTo)   params.set("started_to",   startedTo);
    const q = params.toString(); return q ? `?${q}` : "";
  }, [focus, focusType, classification, graphLimit, hops, includeRelay, rankBy, minScore, startedFrom, startedTo]);

  // ── Focus helpers ────────────────────────────────────────────
  const focusAparty = useCallback((target) => {
    const v = String(target ?? "").trim();
    if (v) { setFocus(v); setFocusType("msisdn"); }
  }, []);

  const selectedSourceMsisdn = useMemo(() => sourceMsisdnFromSelection(selected), [selected]);
  const topSourceMsisdn = useMemo(() => {
    const srcs = graphData.nodes?.filter(n => n.kind === "source") ?? [];
    return [...srcs].sort((a,b) => (b.score??0)-(a.score??0) || (b.count??0)-(a.count??0))[0]?.id ?? "";
  }, [graphData.nodes]);
  const extractionMsisdn = focus.trim() || selectedSourceMsisdn || topSourceMsisdn;

  const handleRunExtraction = useCallback((target) => {
    const v = String(target ?? extractionMsisdn).trim();
    if (!v) return null;
    return runExtraction({ msisdn: v, depth: 1, min_confidence: 0.65 });
  }, [extractionMsisdn, runExtraction]);

  // ── Load graph ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!sessionCount) { setGraphData(emptyGraphData); setGraphBusy(false); setGraphError(""); return; }
      const params = new URLSearchParams();
      const f = deferredFocus.trim();
      if (f) { params.set("focus", f); params.set("focus_type", focusType); }
      if (classification !== "all") params.set("classification", classification);
      params.set("limit",          String(graphLimit));
      params.set("scan_limit",     "20000");
      params.set("hops",           String(hops));
      params.set("include_relay",  String(includeRelay));
      params.set("rank_by",        rankBy);
      if (minScore > 0) params.set("min_score", String(minScore));
      if (startedFrom) params.set("started_from", startedFrom);
      if (startedTo)   params.set("started_to",   startedTo);
      setGraphBusy(true);
      try {
        const payload = await api.graph(`?${params.toString()}`);
        if (!cancelled) { setGraphData(normalizeGraphResponse(payload)); setGraphError(""); }
      } catch(err) {
        if (!cancelled) { setGraphData(emptyGraphData); setGraphError(err.message); }
      } finally {
        if (!cancelled) setGraphBusy(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [deferredFocus, focusType, classification, graphLimit, hops, includeRelay, rankBy, minScore, startedFrom, startedTo, sessionCount]);

  const graphStatus = sessionCount
    ? (graphBusy ? "Syncing" : `${number(graphData.metrics?.edges ?? 0)} flows · ${number(graphData.metrics?.nodes ?? 0)} nodes`)
    : "No data";

  const serverInsights  = graphData.insights  ?? [];
  const serverClusters  = graphData.clusters  ?? [];
  const serverView      = graphData.view      ?? {};

  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-12 map-shell graph-shell">
        <PanelHeader
          icon={Network}
          title="Investigation Cockpit"
          action={
            <div className="map-actions">
              <Badge tone={graphBusy ? "warning" : sessionCount ? "brand" : "neutral"}>{graphStatus}</Badge>

              {/* 1. Target & Timeframe Scope */}
              <label className="map-query" title="Search focus phone number, IP or IMEI">
                <Search size={16} />
                <input
                  aria-label="Focus entity"
                  value={focus}
                  onChange={e => handleFocusChange(e.target.value)}
                  placeholder="MSISDN / IP / IMEI…"
                />
              </label>

              <PremiumDatePicker value={startedFrom} onChange={setStartedFrom} placeholder="Start date" />
              <span style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "0 2px" }}>→</span>
              <PremiumDatePicker value={startedTo} onChange={setStartedTo} placeholder="End date" />

              {/* 2. Flow Quality Filters & Thresholds */}
              <label className="map-score-filter" title="Minimum investigation score (0 = show all)">
                <span>Score ≥ {Math.round(minScore * 100)}%</span>
                <input type="range" min={0} max={0.9} step={0.05} value={minScore} onChange={e => setMinScore(parseFloat(e.target.value))} />
              </label>

              <SelectControl ariaLabel="Classification"    value={classification} onChange={setClassification} options={[
                { value: "all",     label: "All flows"  },
                { value: "p2p",     label: "P2P only (Leads)" },
                { value: "relay",   label: "Relay only (Infra)" },
                { value: "unknown", label: "Unknown classification" },
              ]} />

              <label className="map-toggle" title="Expand 2-hop neighborhood">
                <input type="checkbox" checked={hops === 2} onChange={e => setHops(e.target.checked ? 2 : 1)} />
                2-hop
              </label>

              {/* 3. Visual Arrangement Controls */}
              <SelectControl ariaLabel="Flow limit"        value={graphLimit}     onChange={setGraphLimit}     options={graphLimitOptions}  />
              <SelectControl ariaLabel="Rank by"           value={rankBy}         onChange={setRankBy}         options={rankByOptions}      />
              <SelectControl ariaLabel="Layout mode"       value={layoutMode}     onChange={setLayoutMode}     options={[
                { value: "force",      label: "Force Clustered" },
                { value: "concentric", label: "Concentric Radial" },
                { value: "sankey",     label: "Sankey Flow" },
                { value: "matrix",     label: "Adjacency Matrix" },
              ]} />

              {/* 4. Forensic Exports & Action */}
              <a className="button secondary button-link" href={api.graphJsonUrl(exportQuery)} download><Download size={16} /><span>JSON</span></a>
              <a className="button secondary button-link" href={api.graphGraphmlUrl(exportQuery)} download><Network size={16} /><span>GraphML</span></a>
              <Button type="button" icon={Target} disabled={!extractionMsisdn} onClick={() => handleRunExtraction()}>Extract</Button>
            </div>
          }
        />

        {/* Alert bar */}
        {graphError ? <div className="graph-alert" role="alert"><AlertTriangle size={16} /> <span>{graphError}</span></div> : null}
        {!sessionCount ? <div className="graph-alert neutral"><Database size={16} /> <span>Upload IPDR evidence to build an investigation map.</span></div> : null}

        {/* Server insights bar */}
        {serverInsights.length > 0 && (
          <div className="graph-insights-bar">
            {serverInsights.map(ins => (
              <div key={ins.id} className={`graph-insight-chip ${ins.severity}`}>
                <span className="graph-insight-chip__title">{ins.title}</span>
                <span className="graph-insight-chip__desc">{ins.description}</span>
                <span className={`badge ${ins.severity === "high" ? "danger" : ins.severity === "medium" ? "warning" : "neutral"}`}>{Math.round((ins.score ?? 0) * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        {/* Cluster summary bar */}
        {serverClusters.length > 0 && (
          <div className="graph-clusters-bar">
            {serverClusters.slice(0, 6).map(c => (
              <div key={c.id} className="graph-cluster-chip">
                <span className="graph-cluster-chip__label">{c.label}</span>
                <span className="graph-cluster-chip__meta">{number(c.sessions)} sessions · {number(c.edges)} links</span>
              </div>
            ))}
            {serverView.mode === "focused" && (
              <div className="graph-cluster-chip focused">
                <span className="graph-cluster-chip__label">Focused: {serverView.focus}</span>
                <span className="graph-cluster-chip__meta">{serverView.hops}-hop · ranked by {serverView.rank_by}</span>
              </div>
            )}
          </div>
        )}

        <div className="graph-render-wrap">
          {graphBusy ? (
            <div className="graph-loading-panel">
              <Loader2 size={28} className="animate-spin" />
              <strong>Computing ranked investigation slice…</strong>
              <span>Scoring edges, clustering nodes, and suppressing relay noise.</span>
            </div>
          ) : null}
          {layoutMode === "matrix" ? (
            <GraphMatrixView
              graphData={graphData}
              selected={selected}
              onSelect={setSelected}
            />
          ) : (
            <NetworkGraph
              graphData={graphData}
              selected={selected}
              onSelect={setSelected}
              onExtract={handleRunExtraction}
              onFocusSource={focusAparty}
              layoutMode={layoutMode}
            />
          )}
        </div>
      </section>
    </motion.section>
  );
}
function AnalyticsPage({ timeline = [], applications = [], patterns = [] }) {
  const [bucket, setBucket] = useState("hour");
  const [points, setPoints] = useState(timeline ?? []);
  const [busy, setBusy] = useState(false);

  // Sync points with parent timeline when it changes (only for default hour bucket)
  useEffect(() => {
    if (bucket === "hour") {
      setPoints(timeline ?? []);
    }
  }, [timeline, bucket]);

  // Fetch timeline data only when bucket changes
  useEffect(() => {
    if (bucket === "hour") return;

    let cancelled = false;
    const loadTimeline = async () => {
      setBusy(true);
      try {
        const payload = await api.timeline(`?bucket=${bucket}`);
        if (!cancelled) setPoints(payload ?? []);
      } catch {
        if (!cancelled) setPoints(timeline ?? []);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    loadTimeline();
    return () => {
      cancelled = true;
    };
  }, [bucket]);

  const maxSessions = Math.max(1, ...points.map((item) => item.sessions));
  return (
    <motion.section {...pageMotion} className="page-grid">
      <motion.section 
        className="panel span-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.04, duration: 0.22 }}
        style={{ display: "flex", flexDirection: "column" }}
      >
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
        <div style={{ position: "relative", maxHeight: "310px", overflowY: "auto", paddingRight: "4px" }}>
          {busy && (
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,0.2)",
              backdropFilter: "blur(1px)",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Loader2 className="animate-spin" size={24} style={{ color: "var(--color-brand)" }} />
            </div>
          )}
          <div className="timeline-chart">
            {points.length ? points.map((item) => (
              <div className="timeline-bar" key={item.bucket}>
                <span className="timeline-bar__label">{item.label}</span>
                <div className="timeline-bar__track"><span style={{ width: `${Math.max(4, (item.sessions / maxSessions) * 100)}%` }} /></div>
                <strong>{item.sessions}</strong>
              </div>
            )) : <EmptyState label="No timeline data yet" />}
          </div>
        </div>
      </motion.section>
      <motion.section 
        className="panel span-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.22 }}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <PanelHeader icon={Activity} title="Applications" action={<Badge tone="brand">{applications.length}</Badge>} />
        <div style={{ maxHeight: "310px", overflowY: "auto", paddingRight: "4px" }}>
          <div className="signal-list compact-list">
            {applications.length ? applications.map((item) => (
              <article className="signal-row" key={item.name}>
                <div><strong>{item.name}</strong><p>{item.operator} | {item.destination_ips} IPs | {formatDuration(item.duration_seconds)}</p></div>
                <Badge tone="neutral">{item.sessions}</Badge>
              </article>
            )) : <EmptyState label="No application summary" />}
          </div>
        </div>
      </motion.section>
      <motion.section 
        className="panel span-12"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.22 }}
        style={{ display: "flex", flexDirection: "column" }}
      >
        <PanelHeader icon={AlertTriangle} title="Detection Signals" action={<Badge tone={patterns.length ? "warning" : "success"}>{patterns.length}</Badge>} />
        <div style={{ maxHeight: "250px", overflowY: "auto", paddingRight: "4px" }}>
          {patterns.length ? <SignalList patterns={patterns} /> : <EmptyState label="No suspicious signals detected" />}
        </div>
      </motion.section>
    </motion.section>
  );
}

function ReportsPage({ sessions, sessionCount = sessions.length }) {
  const [poi, setPoi] = useState("");
  const [ip, setIp] = useState("");
  const [report, setReport] = useState(null);
  const [commonApps, setCommonApps] = useState([]);
  const [imeiRows, setImeiRows] = useState([]);
  const [locationRows, setLocationRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [summaryBusy, setSummaryBusy] = useState(false);

  useEffect(() => {
    if (!sessionCount) {
      setCommonApps([]);
      setImeiRows([]);
      setLocationRows([]);
      setSummaryBusy(false);
      return undefined;
    }
    let cancelled = false;
    const loadReports = async () => {
      setSummaryBusy(true);
      try {
        const [apps, imeis, locations] = await Promise.all([
          api.commonApplications("?limit=10"),
          api.imeiFrequency("?limit=10"),
          api.locationSummary("?limit=10")
        ]);
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
      } finally {
        if (!cancelled) setSummaryBusy(false);
      }
    };
    loadReports();
    return () => {
      cancelled = true;
    };
  }, [sessionCount]);
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
          <Button icon={Network} disabled={busy || !ip.trim()} variant="secondary">{busy ? "Building" : "IP summary"}</Button>
        </form>
        <a className="text-link" href={api.sessionCsvUrl()}>Export sessions CSV</a>
      </section>
      <section className="panel span-7">
        <PanelHeader icon={ShieldCheck} title="Report Preview" action={<Badge tone="brand">{number(sessionCount)} rows</Badge>} />
        {busy ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '220px', gap: '12px' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
            <div style={{ fontSize: '13px', fontWeight: '500' }}>Compiling intelligence metrics & geodata...</div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>This may take up to a minute for millions of sessions.</div>
          </div>
        ) : report ? (
          <ReportPreview report={report} />
        ) : (
          <EmptyState label="Build a PoI or IP report" />
        )}
      </section>
      <section className="panel span-4">
        <PanelHeader icon={Activity} title="Common Applications" action={<Badge tone="brand">{commonApps.length}</Badge>} />
        <div className="report-list">
          {summaryBusy ? <MiniLoading label="Loading application summary" /> : commonApps.length ? commonApps.map((item) => (
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
          {summaryBusy ? <MiniLoading label="Loading IMEI frequency" /> : imeiRows.length ? imeiRows.map((item) => (
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
          {summaryBusy ? <MiniLoading label="Loading location summary" /> : locationRows.length ? locationRows.map((item) => (
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
function MiniLoading({ label }) {
  return (
    <div className="mini-loading">
      <Loader2 size={16} className="animate-spin" />
      <span>{label}</span>
    </div>
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
function PackagesPage({ packagesList = [] }) {
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
      <section className="panel span-5" style={{ display: "flex", flexDirection: "column", height: "fit-content" }}>
        <PanelHeader icon={FileText} title="Packages" action={<Badge tone="brand">{packagesList.length}</Badge>} />
        <div className="package-list" style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto", paddingRight: "4px" }}>
          {packagesList.length ? packagesList.map((item) => (
            <button className={`package-row ${item.id === selected?.id ? "active" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)} type="button">
              <span>{item.id}</span>
              <strong>{item.target_operator}</strong>
              <small>{item.payload.destination_ip}:{item.payload.destination_port}</small>
            </button>
          )) : <EmptyState label="No request packages generated" />}
        </div>
      </section>
      <section className="panel span-7" style={{ display: "flex", flexDirection: "column", height: "fit-content" }}>
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
        <div style={{ maxHeight: "calc(100vh - 240px)", overflowY: "auto", paddingRight: "4px" }}>
          {selected ? <RequestPackageCard item={selected} /> : <EmptyState label="No package selected" />}
        </div>
      </section>
    </motion.section>
  );
}
function AuditPage({ auditLogs = [] }) {
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

function SettingsPage({ ranges = [], stats = {}, apiLive, persistence, importSpecs = [], createImportSpec, createPersistenceSnapshot, resetPersistence }) {
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
        {tab === "system" ? <SystemPanel stats={stats} apiLive={apiLive} persistence={persistence} createPersistenceSnapshot={createPersistenceSnapshot} resetPersistence={resetPersistence} /> : null}
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
    metrics: { ...emptyGraphData.metrics, ...(graph.metrics ?? {}) },
    view: graph.view ?? {}
  };
}
function stableGraphHash(value) {
  let hash = 2166136261;
  const text = String(value ?? "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(value) {
  return (stableGraphHash(value) % 10000) / 10000;
}

function stretchGraphPositionsX(positions, width, padding = 72, factor = 1.44) {
  const stretched = new Map();
  positions.forEach((point, id) => {
    stretched.set(id, {
      x: clamp(width / 2 + (point.x - width / 2) * factor, padding, width - padding),
      y: point.y
    });
  });
  return stretched;
}

function fitGraphPositions(rawPositions, width, height, padding = 76, maxScale = 1.18) {
  const values = [...rawPositions.values()];
  if (!values.length) return rawPositions;
  const minX = Math.min(...values.map((point) => point.x));
  const maxX = Math.max(...values.map((point) => point.x));
  const minY = Math.min(...values.map((point) => point.y));
  const maxY = Math.max(...values.map((point) => point.y));
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, maxScale);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const fitted = new Map();
  rawPositions.forEach((point, id) => {
    fitted.set(id, {
      x: width / 2 + (point.x - midX) * scale,
      y: height / 2 + (point.y - midY) * scale
    });
  });
  return fitted;
}

function layoutClusteredCommunicationGraph(nodes, links, width, height) {
  if (!nodes.length) return new Map();

  const sourceNodes = nodes
    .filter((node) => node.kind === "source")
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));
  const destinationNodes = nodes
    .filter((node) => node.kind !== "source")
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));
  const sourceIds = new Set(sourceNodes.map((node) => node.id));
  const primarySourceByTarget = new Map();

  [...links]
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id))
    .forEach((link) => {
      if (sourceIds.has(link.sourceId) && !primarySourceByTarget.has(link.targetId)) {
        primarySourceByTarget.set(link.targetId, link.sourceId);
      }
    });

  const positions = new Map();
  const centerX = width * 0.48;
  const centerY = height * 0.5;
  const sourceRadiusX = Math.min(190, Math.max(92, sourceNodes.length * 12));
  const sourceRadiusY = Math.min(230, Math.max(105, sourceNodes.length * 16));

  sourceNodes.forEach((node, index) => {
    if (sourceNodes.length === 1) {
      positions.set(node.id, { x: centerX, y: centerY });
      return;
    }
    const angle = -Math.PI / 2 + (index / sourceNodes.length) * Math.PI * 2;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * sourceRadiusX,
      y: centerY + Math.sin(angle) * sourceRadiusY
    });
  });

  if (!sourceNodes.length) {
    destinationNodes.forEach((node, index) => {
      const ring = Math.floor(index / 18);
      const slot = index % 18;
      const slots = Math.min(18, destinationNodes.length - ring * 18);
      const angle = (slot / Math.max(slots, 1)) * Math.PI * 2 + seededUnit(`${node.id}:angle`) * 0.18;
      const radius = 115 + ring * 70;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius * 0.78
      });
    });
    return fitGraphPositions(positions, width, height);
  }

  const groups = new Map(sourceNodes.map((source) => [source.id, []]));
  destinationNodes.forEach((node) => {
    const sourceId = primarySourceByTarget.get(node.id) ?? sourceNodes[stableGraphHash(node.id) % sourceNodes.length]?.id;
    if (!groups.has(sourceId)) groups.set(sourceId, []);
    groups.get(sourceId).push(node);
  });

  sourceNodes.forEach((source, sourceIndex) => {
    const group = groups.get(source.id) ?? [];
    const sourcePoint = positions.get(source.id) ?? { x: centerX, y: centerY };
    const sourceAngle = sourceNodes.length === 1
      ? 0
      : Math.atan2(sourcePoint.y - centerY, sourcePoint.x - centerX);
    const arc = sourceNodes.length === 1 ? Math.PI * 1.86 : Math.PI * 0.96;
    const perRing = sourceNodes.length === 1 ? 22 : 12;

    group.forEach((node, index) => {
      const ring = Math.floor(index / perRing);
      const slot = index % perRing;
      const slots = Math.min(perRing, group.length - ring * perRing);
      const local = slots <= 1 ? 0 : (slot / (slots - 1)) - 0.5;
      const jitter = (seededUnit(`${node.id}:jitter`) - 0.5) * 0.16;
      const angle = sourceAngle + local * arc + jitter + (sourceNodes.length === 1 ? 0 : sourceIndex * 0.018);
      const radius = (sourceNodes.length === 1 ? 155 : 110) + ring * (sourceNodes.length === 1 ? 74 : 58);
      positions.set(node.id, {
        x: sourcePoint.x + Math.cos(angle) * radius,
        y: sourcePoint.y + Math.sin(angle) * radius * 0.82
      });
    });
  });

  return fitGraphPositions(positions, width, height);
}

function graphVisualScale(width, height, nodeCount, linkCount) {
  const area = width * height;
  const density = nodeCount + linkCount * 0.35;
  const roomScale = clamp(Math.sqrt(area / (1120 * 640)), 0.78, 1.18);
  const densityScale = density > 160 ? 0.62 : density > 90 ? 0.74 : density > 45 ? 0.86 : 1;
  return clamp(roomScale * densityScale, 0.52, 1.05);
}

function graphNodeVisual(node, visualScale, isSankey = false) {
  if (node.kind === "source") {
    const baseRadius = (isSankey ? 22 : 28) * visualScale;
    const charCount = String(node.label).length;
    const w = Math.max(baseRadius * 1.35, charCount * 7.5 * visualScale);
    const h = baseRadius * 1.95;
    return { width: w, height: h, radius: baseRadius };
  }
  const baseRadius = (node.kind === "p2p" ? 18 : 14) * visualScale;
  const r = isSankey ? baseRadius * 0.8 : baseRadius;
  return { radius: r };
}

function layoutRadialInvestigationGraph(nodes, links, width, height) {
  if (!nodes.length) return new Map();
  const positions = new Map();
  const centerX = width * 0.5;
  const centerY = height * 0.5;

  const sourceNodes = nodes
    .filter((node) => node.kind === "source")
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));
  const destinationNodes = nodes
    .filter((node) => node.kind !== "source")
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));

  sourceNodes.forEach((node, index) => {
    if (sourceNodes.length === 1) {
      positions.set(node.id, { x: centerX, y: centerY });
    } else {
      const angle = -Math.PI / 2 + (index / sourceNodes.length) * Math.PI * 2;
      const radius = Math.min(50, sourceNodes.length * 10);
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      });
    }
  });

  const sourceIds = new Set(sourceNodes.map((n) => n.id));
  const primarySourceByTarget = new Map();
  [...links]
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id))
    .forEach((link) => {
      if (sourceIds.has(link.sourceId) && !primarySourceByTarget.has(link.targetId)) {
        primarySourceByTarget.set(link.targetId, link.sourceId);
      }
    });

  const groups = new Map(sourceNodes.map((n) => [n.id, []]));
  const ungrouped = [];
  destinationNodes.forEach((node) => {
    const sourceId = primarySourceByTarget.get(node.id);
    if (sourceId && groups.has(sourceId)) {
      groups.get(sourceId).push(node);
    } else {
      ungrouped.push(node);
    }
  });

  sourceNodes.forEach((source, sourceIndex) => {
    const group = groups.get(source.id) ?? [];
    const sourceAngle = sourceNodes.length === 1
      ? 0
      : -Math.PI / 2 + (sourceIndex / sourceNodes.length) * Math.PI * 2;
    const arc = sourceNodes.length === 1 ? Math.PI * 1.9 : (Math.PI * 2) / sourceNodes.length;

    group.forEach((node, index) => {
      const ring = Math.floor(index / 12);
      const slot = index % 12;
      const slots = Math.min(12, group.length - ring * 12);
      const fraction = slots <= 1 ? 0 : (slot / (slots - 1)) - 0.5;
      const jitter = (seededUnit(`${node.id}:jitter`) - 0.5) * 0.12;
      const angle = sourceAngle + fraction * arc * 0.8 + jitter;
      const radius = 120 + ring * 65;
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      });
    });
  });

  ungrouped.forEach((node, index) => {
    const angle = (index / Math.max(ungrouped.length, 1)) * Math.PI * 2 + (seededUnit(`${node.id}:jitter`) - 0.5) * 0.2;
    const radius = 250 + Math.floor(index / 16) * 60;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius
    });
  });

  return fitGraphPositions(positions, width, height, 76, 1.1);
}

function layoutSankeyInvestigationGraph(nodes, links, width, height) {
  if (!nodes.length) return new Map();
  const positions = new Map();

  const sourceNodes = nodes
    .filter((node) => node.kind === "source")
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));
  const destinationNodes = nodes
    .filter((node) => node.kind !== "source")
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));

  const sourceIds = new Set(sourceNodes.map((n) => n.id));
  const targetSourcesMap = new Map();
  links.forEach((link) => {
    if (sourceIds.has(link.sourceId)) {
      if (!targetSourcesMap.has(link.targetId)) {
        targetSourcesMap.set(link.targetId, new Set());
      }
      targetSourcesMap.get(link.targetId).add(link.sourceId);
    }
  });

  const middleLaneNodes = [];
  const rightLaneNodes = [];

  destinationNodes.forEach((node) => {
    const connectedSources = targetSourcesMap.get(node.id)?.size ?? 0;
    const isHighValue = node.classification === "p2p" || (node.count ?? 0) > 10;
    if (connectedSources > 1 || isHighValue) {
      middleLaneNodes.push(node);
    } else {
      rightLaneNodes.push(node);
    }
  });

  const sourceX = width * 0.18;
  const midX = width * 0.52;
  const targetX = width * 0.82;

  const placeLaneNodes = (laneNodes, xPos) => {
    if (!laneNodes.length) return;
    const len = laneNodes.length;
    const padding = 64;
    const usableHeight = height - padding * 2;
    laneNodes.forEach((node, index) => {
      const fraction = len <= 1 ? 0.5 : index / (len - 1);
      const y = padding + fraction * usableHeight;
      positions.set(node.id, { x: xPos, y });
    });
  };

  placeLaneNodes(sourceNodes, sourceX);
  placeLaneNodes(middleLaneNodes, midX);
  placeLaneNodes(rightLaneNodes, targetX);

  return positions;
}

function layoutCommunicationGraph(nodes, links, width, height) {
  if (!nodes.length) return new Map();

  const clusteredPositions = layoutClusteredCommunicationGraph(nodes, links, width, height);
  const graphTooLargeForPhysics = nodes.length > 700 || links.length > 900;
  if (graphTooLargeForPhysics || !links.length) return clusteredPositions;

  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const simNodes = nodes.map((node) => {
    const initial = clusteredPositions.get(node.id) ?? {
      x: centerX + (seededUnit(`${node.id}:x`) - 0.5) * width * 0.36,
      y: centerY + (seededUnit(`${node.id}:y`) - 0.5) * height * 0.36
    };
    return { ...node, x: initial.x, y: initial.y, vx: 0, vy: 0 };
  });
  const nodeById = new Map(simNodes.map((node) => [node.id, node]));
  const simLinks = links
    .filter((link) => nodeById.has(link.sourceId) && nodeById.has(link.targetId))
    .map((link) => ({ ...link, source: link.sourceId, target: link.targetId }));

  if (!simLinks.length) return clusteredPositions;

  const linkDistance = (link) => {
    const countPull = Math.min(Math.log1p(link.count || 1) * 6, 34);
    const base = link.classification === "p2p" ? 112 : link.classification === "relay" ? 182 : 150;
    return Math.max(76, base - countPull);
  };
  const linkStrength = (link) => {
    const countBoost = Math.min(Math.log1p(link.count || 1) * 0.018, 0.08);
    if (link.classification === "p2p") return 0.2 + countBoost;
    if (link.classification === "relay") return 0.045 + countBoost * 0.45;
    return 0.08 + countBoost * 0.6;
  };
  const forceDense = nodes.length > 180 || links.length > 220;
  const collideRadius = (node) => (node.kind === "source" ? (forceDense ? 22 : 47) : (forceDense ? 13 : 31));
  const chargeStrength = (node) => {
    if (node.kind === "source") return forceDense ? -145 : -680;
    return forceDense ? -42 : nodes.length > 220 ? -82 : -118;
  };

  const simulation = forceSimulation(simNodes)
    .force("link", forceLink(simLinks).id((node) => node.id).distance(linkDistance).strength(linkStrength).iterations(1))
    .force("charge", forceManyBody().strength(chargeStrength).distanceMax(370))
    .force("collide", forceCollide(collideRadius).strength(0.88).iterations(2))
    .force("x", forceX((node) => {
      const target = clusteredPositions.get(node.id);
      return node.kind === "source" ? centerX : target?.x ?? centerX;
    }).strength((node) => (node.kind === "source" ? (forceDense ? 0.035 : 0.09) : (forceDense ? 0.012 : 0.024))))
    .force("y", forceY((node) => {
      const target = clusteredPositions.get(node.id);
      return node.kind === "source" ? centerY : target?.y ?? centerY;
    }).strength((node) => (node.kind === "source" ? (forceDense ? 0.035 : 0.09) : (forceDense ? 0.012 : 0.024))))
    .stop();

  const tickCount = nodes.length > 420 ? 82 : nodes.length > 280 ? 96 : nodes.length > 140 ? 116 : 150;
  for (let index = 0; index < tickCount; index += 1) {
    simulation.tick();
  }

  const fittedPositions = fitGraphPositions(new Map(simNodes.map((node) => [node.id, { x: node.x, y: node.y }])), width, height, forceDense ? 72 : 92, forceDense ? 1.68 : 1.18);
  return forceDense ? stretchGraphPositionsX(fittedPositions, width) : fittedPositions;
}
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawPhoneIcon(ctx, cx, cy, size) {
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.translate(cx, cy);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  
  // Smartphone rect
  ctx.beginPath();
  drawRoundedRect(ctx, 5, 2, 14, 20, 2);
  ctx.stroke();
  
  // Home button dot
  ctx.beginPath();
  ctx.arc(12, 18, 0.5, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

function drawServerIcon(ctx, cx, cy, size) {
  ctx.save();
  const color = "#2f9e44";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.translate(cx, cy);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  
  // Server rack 1
  ctx.beginPath();
  drawRoundedRect(ctx, 2, 2, 20, 8, 2);
  ctx.stroke();
  
  // Server rack 2
  ctx.beginPath();
  drawRoundedRect(ctx, 2, 14, 20, 8, 2);
  ctx.stroke();
  
  // Status indicator lights
  ctx.beginPath();
  ctx.arc(6, 6, 0.6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  
  ctx.beginPath();
  ctx.arc(6, 18, 0.6, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  
  ctx.restore();
}

function drawTowerIcon(ctx, cx, cy, size) {
  ctx.save();
  const color = "#e03131";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.translate(cx, cy);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  
  // Outer left arc
  ctx.beginPath();
  ctx.arc(12, 12, 10, Math.PI * 0.75, Math.PI * 1.25);
  ctx.stroke();
  
  // Inner left arc
  ctx.beginPath();
  ctx.arc(12, 12, 6, Math.PI * 0.75, Math.PI * 1.25);
  ctx.stroke();
  
  // Center transmitter
  ctx.beginPath();
  ctx.arc(12, 12, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
  
  // Inner right arc
  ctx.beginPath();
  ctx.arc(12, 12, 6, -Math.PI * 0.25, Math.PI * 0.25);
  ctx.stroke();
  
  // Outer right arc
  ctx.beginPath();
  ctx.arc(12, 12, 10, -Math.PI * 0.25, Math.PI * 0.25);
  ctx.stroke();
  
  ctx.restore();
}

function drawShieldWarningBadge(ctx, x, y, size) {
  ctx.save();
  const color = "#e03131";
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  ctx.translate(-12, -12);
  
  // Shield Alert Path
  ctx.beginPath();
  const shield = new Path2D("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
  ctx.fill(shield);
  ctx.stroke(shield);
  
  // Exclamation mark
  ctx.beginPath();
  const alertMark = new Path2D("M12 8v4 M12 16h.01");
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2.2;
  ctx.stroke(alertMark);
  
  ctx.restore();
}

function distToSegment(p, v, w) {
  const l2 = (v.x - w.x) ** 2 + (v.y - w.y) ** 2;
  if (l2 === 0) return Math.sqrt((p.x - v.x) ** 2 + (p.y - v.y) ** 2);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.sqrt((p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2);
}

function GraphMatrixView({ graphData, selected, onSelect }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [hoveredCell, setHoveredCell] = useState(null);

  const sources = useMemo(() => {
    return (graphData.nodes ?? []).filter(n => n.kind === "source")
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));
  }, [graphData.nodes]);

  const endpoints = useMemo(() => {
    return (graphData.nodes ?? []).filter(n => n.kind !== "source")
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id));
  }, [graphData.nodes]);

  const linkMap = useMemo(() => {
    const map = new Map();
    (graphData.links ?? []).forEach(link => {
      const srcId = link.sourceId ?? link.source_id;
      const tgtId = link.targetId ?? link.target_id;
      map.set(`${srcId}__${tgtId}`, link);
    });
    return map;
  }, [graphData.links]);

  const ROW_HEADER_WIDTH = 130;
  const COL_HEADER_HEIGHT = 130;
  const CELL_SIZE = 26;

  const width = ROW_HEADER_WIDTH + endpoints.length * CELL_SIZE;
  const height = COL_HEADER_HEIGHT + sources.length * CELL_SIZE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= sources.length; i++) {
      const y = COL_HEADER_HEIGHT + i * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(ROW_HEADER_WIDTH, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let j = 0; j <= endpoints.length; j++) {
      const x = ROW_HEADER_WIDTH + j * CELL_SIZE;
      ctx.beginPath();
      ctx.moveTo(x, COL_HEADER_HEIGHT);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    ctx.save();
    ctx.font = "bold 10px var(--font-mono, monospace)";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    endpoints.forEach((ep, idx) => {
      const x = ROW_HEADER_WIDTH + idx * CELL_SIZE + CELL_SIZE / 2;
      const y = COL_HEADER_HEIGHT - 6;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-Math.PI / 2);
      
      ctx.fillStyle = ep.kind === "p2p" ? "#2b8a3e" : ep.kind === "relay" ? "#c92a2a" : "#495057";
      ctx.fillText(ep.title || ep.label, 0, 0);
      ctx.restore();
    });
    ctx.restore();

    ctx.save();
    ctx.font = "bold 11px var(--font-mono, monospace)";
    ctx.fillStyle = "#1c7ed6";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    sources.forEach((src, idx) => {
      const x = ROW_HEADER_WIDTH - 8;
      const y = COL_HEADER_HEIGHT + idx * CELL_SIZE + CELL_SIZE / 2;
      ctx.fillText(src.id.slice(-6) + "...", x, y);
    });
    ctx.restore();

    sources.forEach((src, sIdx) => {
      endpoints.forEach((ep, eIdx) => {
        const link = linkMap.get(`${src.id}__${ep.id}`);
        if (!link) return;

        const x = ROW_HEADER_WIDTH + eIdx * CELL_SIZE;
        const y = COL_HEADER_HEIGHT + sIdx * CELL_SIZE;

        const countVal = link.count || 1;
        const opacity = 0.35 + 0.65 * Math.min(Math.log1p(countVal) / Math.log1p(42), 1);
        
        ctx.save();
        ctx.fillStyle = link.classification === "p2p" 
          ? `rgba(47, 158, 68, ${opacity})` 
          : link.classification === "relay" 
            ? `rgba(224, 49, 49, ${opacity})` 
            : `rgba(134, 142, 150, ${opacity})`;
            
        ctx.beginPath();
        drawRoundedRect(ctx, x + 2.5, y + 2.5, CELL_SIZE - 5, CELL_SIZE - 5, 3.5);
        ctx.fill();

        const isSelected = selected?.type === "edge" && (selected.link?.id === link.id);
        const isHovered = hoveredCell && hoveredCell.rowIdx === sIdx && hoveredCell.colIdx === eIdx;
        
        if (isSelected) {
          ctx.strokeStyle = "#121f2b";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (isHovered) {
          ctx.strokeStyle = "#495057";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        ctx.restore();
      });
    });

  }, [sources, endpoints, linkMap, width, height, selected, hoveredCell]);

  const handleMouseMove = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x < ROW_HEADER_WIDTH || y < COL_HEADER_HEIGHT) {
      setHoveredCell(null);
      return;
    }

    const colIdx = Math.floor((x - ROW_HEADER_WIDTH) / CELL_SIZE);
    const rowIdx = Math.floor((y - COL_HEADER_HEIGHT) / CELL_SIZE);

    if (rowIdx >= 0 && rowIdx < sources.length && colIdx >= 0 && colIdx < endpoints.length) {
      const src = sources[rowIdx];
      const ep = endpoints[colIdx];
      const link = linkMap.get(`${src.id}__${ep.id}`);
      if (link) {
        setHoveredCell({
          rowIdx,
          colIdx,
          link,
          src,
          ep,
          x: event.clientX - rect.left + containerRef.current.offsetLeft,
          y: event.clientY - rect.top + containerRef.current.offsetTop - 140
        });
        return;
      }
    }
    setHoveredCell(null);
  };

  const handleMouseLeave = () => {
    setHoveredCell(null);
  };

  const handleClick = () => {
    if (hoveredCell?.link) {
      onSelect({ type: "edge", link: hoveredCell.link });
    }
  };

  return (
    <div ref={containerRef} className="matrix-wrapper" style={{ position: "relative", width: "100%", height: "520px", overflow: "auto" }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        style={{ display: "block", background: "#f8f9fa", cursor: hoveredCell ? "pointer" : "default" }}
      />
      {hoveredCell && (
        <div
          className="matrix-tooltip"
          style={{
            position: "absolute",
            left: `${hoveredCell.x + 12}px`,
            top: `${hoveredCell.y + 12}px`,
            zIndex: 1000,
            background: "rgba(18, 31, 43, 0.96)",
            color: "#ffffff",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "11px",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
            lineHeight: "1.4"
          }}
        >
          <div style={{ fontWeight: "bold", borderBottom: "1px solid rgba(255,255,255,0.2)", paddingBottom: "3px", marginBottom: "4px" }}>
            Connection Lead
          </div>
          <div><strong>A-party:</strong> {hoveredCell.src.id}</div>
          <div><strong>B-party IP:</strong> {hoveredCell.ep.id}</div>
          <div><strong>Operator:</strong> {hoveredCell.ep.operator}</div>
          <div><strong>Classification:</strong> <span style={{ textTransform: "capitalize", color: hoveredCell.link.classification === "p2p" ? "#40c057" : "#fa5252" }}>{hoveredCell.link.classification}</span></div>
          <div><strong>Sessions:</strong> {hoveredCell.link.count}</div>
          <div><strong>Duration:</strong> {formatDuration(hoveredCell.link.duration_seconds || hoveredCell.link.duration || 0)}</div>
        </div>
      )}
    </div>
  );
}

function graphBoundsForPositions(nodes, positions, visualScale, layoutMode) {
  if (!nodes.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    const point = positions.get(node.id) ?? node;
    const visual = graphNodeVisual(node, visualScale, layoutMode === "sankey");
    const radius = node.kind === "source"
      ? Math.max(visual.width, visual.height) / 2
      : visual.radius;
    minX = Math.min(minX, point.x - radius);
    maxX = Math.max(maxX, point.x + radius);
    minY = Math.min(minY, point.y - radius);
    maxY = Math.max(maxY, point.y + radius);
  });

  return { minX, maxX, minY, maxY };
}

function NetworkGraph({ graphData, selected, onSelect, onExtract, onFocusSource, layoutMode }) {
  const [canvasSize, setCanvasSize] = useState({ width: 1120, height: 640 });
  const VIEW_WIDTH = canvasSize.width;
  const VIEW_HEIGHT = canvasSize.height;

  const realCanvasRef = useRef(null);
  const containerRef = useRef(null);
  const workspaceRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const dragRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [manualPositions, setManualPositions] = useState({});
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || !entries[0]) return;
      const rect = entries[0].contentRect;
      setCanvasSize({
        width: Math.max(800, rect.width),
        height: Math.max(480, rect.height)
      });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsGraphFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      workspaceRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const graph = useMemo(() => {
    const sourceGraph = graphData ?? emptyGraphData;
    const nodes = sourceGraph.nodes ?? [];
    const links = sourceGraph.links ?? [];
    const layout = layoutCommunicationGraph(nodes, links, VIEW_WIDTH, VIEW_HEIGHT);
    const positionedNodes = nodes.map((node) => ({ ...node, ...layout.get(node.id) }));
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
  }, [graphData, VIEW_WIDTH, VIEW_HEIGHT]);

  useEffect(() => {
    setManualPositions({});
    setPan({ x: 0, y: 0 });
    setZoom(1);
    onSelect(null);
  }, [graphData, onSelect]);

  const visualScale = useMemo(() => {
    return graphVisualScale(VIEW_WIDTH, VIEW_HEIGHT, graph.nodes.length, graph.links.length);
  }, [VIEW_WIDTH, VIEW_HEIGHT, graph.nodes.length, graph.links.length]);

  const layoutPositions = useMemo(() => {
    if (layoutMode === "sankey") {
      return layoutSankeyInvestigationGraph(graph.nodes, graph.links, VIEW_WIDTH, VIEW_HEIGHT);
    }
    if (layoutMode === "concentric") {
      return layoutRadialInvestigationGraph(graph.nodes, graph.links, VIEW_WIDTH, VIEW_HEIGHT);
    }
    return layoutCommunicationGraph(graph.nodes, graph.links, VIEW_WIDTH, VIEW_HEIGHT);
  }, [graph.nodes, graph.links, layoutMode, VIEW_WIDTH, VIEW_HEIGHT]);

  const positions = useMemo(() => {
    const map = new Map();
    
    let sumX = 0, sumY = 0, count = 0;
    graph.nodes.forEach((node) => {
      const pos = manualPositions[node.id] ?? layoutPositions.get(node.id) ?? { x: node.x, y: node.y };
      sumX += pos.x;
      sumY += pos.y;
      count++;
    });
    
    const centerX = count > 0 ? sumX / count : VIEW_WIDTH / 2;
    const centerY = count > 0 ? sumY / count : VIEW_HEIGHT / 2;
    
    const spreadFactor = zoom > 1 ? 1.0 + (zoom - 1.0) * 1.25 : 1.0;
    
    graph.nodes.forEach((node) => {
      const basePos = manualPositions[node.id] ?? layoutPositions.get(node.id) ?? { x: node.x, y: node.y };
      if (manualPositions[node.id]) {
        map.set(node.id, basePos);
      } else {
        map.set(node.id, {
          x: centerX + (basePos.x - centerX) * spreadFactor,
          y: centerY + (basePos.y - centerY) * spreadFactor
        });
      }
    });
    return map;
  }, [graph.nodes, manualPositions, layoutPositions, zoom, VIEW_WIDTH, VIEW_HEIGHT]);

  const getRawPointFromClient = useCallback((clientX, clientY) => {
    const canvas = realCanvasRef.current;
    if (!canvas) return { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 };
    return {
      x: ((clientX - rect.left) / rect.width) * VIEW_WIDTH,
      y: ((clientY - rect.top) / rect.height) * VIEW_HEIGHT
    };
  }, [VIEW_WIDTH, VIEW_HEIGHT]);

  const zoomToPoint = useCallback((nextZoom, rawPoint, baseZoom = zoom, basePan = pan) => {
    let sumX = 0, sumY = 0, count = 0;
    graph.nodes.forEach((node) => {
      const pos = manualPositions[node.id] ?? layoutPositions.get(node.id) ?? { x: node.x, y: node.y };
      sumX += pos.x;
      sumY += pos.y;
      count++;
    });
    const centerX = count > 0 ? sumX / count : VIEW_WIDTH / 2;
    const centerY = count > 0 ? sumY / count : VIEW_HEIGHT / 2;

    const graphX = (rawPoint.x - basePan.x) / baseZoom;
    const graphY = (rawPoint.y - basePan.y) / baseZoom;

    const factorBase = baseZoom > 1 ? 1.0 + (baseZoom - 1.0) * 1.25 : 1.0;
    const factorNext = nextZoom > 1 ? 1.0 + (nextZoom - 1.0) * 1.25 : 1.0;

    const unspreadX = centerX + (graphX - centerX) / factorBase;
    const unspreadY = centerY + (graphY - centerY) / factorBase;

    const graphXNext = centerX + (unspreadX - centerX) * factorNext;
    const graphYNext = centerY + (unspreadY - centerY) * factorNext;

    setZoom(nextZoom);
    setPan({
      x: rawPoint.x - graphXNext * nextZoom,
      y: rawPoint.y - graphYNext * nextZoom
    });
  }, [pan, zoom, graph.nodes, manualPositions, layoutPositions, VIEW_WIDTH, VIEW_HEIGHT]);

  const toGraphPoint = (event) => {
    const raw = getRawPointFromClient(event.clientX, event.clientY);
    return { x: (raw.x - pan.x) / zoom, y: (raw.y - pan.y) / zoom, rawX: raw.x, rawY: raw.y };
  };

  const rememberPointer = (event) => {
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    try {
      realCanvasRef.current?.setPointerCapture?.(event.pointerId);
    } catch {
      // capture can fail
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
      startPan: pan
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
    zoomToPoint(nextZoom, snapshot.rawCenter, gesture.startZoom, gesture.startPan);
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

  const handleCanvasPointerDown = (event) => {
    const point = toGraphPoint(event);
    
    let clickedNode = null;
    for (let i = graph.nodes.length - 1; i >= 0; i--) {
      const node = graph.nodes[i];
      const visual = graphNodeVisual(node, visualScale, layoutMode === "sankey");
      const pos = positions.get(node.id) ?? node;
      
      if (node.kind === "source") {
        const w = visual.width;
        const h = visual.height;
        const hitW = w + 16 / zoom;
        const hitH = h + 16 / zoom;
        if (Math.abs(point.x - pos.x) <= hitW / 2 && Math.abs(point.y - pos.y) <= hitH / 2) {
          clickedNode = node;
          break;
        }
      } else {
        const r = visual.radius;
        const hitR = r + 12 / zoom;
        const dx = point.x - pos.x;
        const dy = point.y - pos.y;
        if (dx * dx + dy * dy <= hitR * hitR) {
          clickedNode = node;
          break;
        }
      }
    }

    if (clickedNode) {
      beginNodeDrag(event, clickedNode);
    } else {
      let clickedLink = null;
      for (const link of graph.links) {
        const source = positions.get(link.sourceId ?? link.source_id);
        const target = positions.get(link.targetId ?? link.target_id);
        if (!source || !target) continue;
        
        const dist = distToSegment(point, source, target);
        if (dist <= 12 / zoom) {
          clickedLink = link;
          break;
        }
      }
      
      if (clickedLink) {
        onSelect({ type: "edge", link: clickedLink });
      } else {
        beginPan(event);
      }
    }
  };

  const handleCanvasPointerMove = (event) => {
    if (pointersRef.current.has(event.pointerId)) {
      event.preventDefault();
      pointersRef.current.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    if (pointersRef.current.size > 1) {
      updatePinch();
      return;
    }
    
    const point = toGraphPoint(event);
    
    if (dragRef.current) {
      const drag = dragRef.current;
      if (drag.type === "node") {
        setManualPositions((current) => ({
          ...current,
          [drag.nodeId]: { x: point.x - drag.offsetX, y: point.y - drag.offsetY }
        }));
        return;
      }
      if (drag.type === "pan") {
        setPan({
          x: drag.startPan.x + point.rawX - drag.startX,
          y: drag.startPan.y + point.rawY - drag.startY
        });
        return;
      }
    }

    let hoverNode = null;
    for (let i = graph.nodes.length - 1; i >= 0; i--) {
      const node = graph.nodes[i];
      const visual = graphNodeVisual(node, visualScale, layoutMode === "sankey");
      const pos = positions.get(node.id) ?? node;
      
      if (node.kind === "source") {
        const w = visual.width;
        const h = visual.height;
        const hitW = w + 16 / zoom;
        const hitH = h + 16 / zoom;
        if (Math.abs(point.x - pos.x) <= hitW / 2 && Math.abs(point.y - pos.y) <= hitH / 2) {
          hoverNode = node;
          break;
        }
      } else {
        const r = visual.radius;
        const hitR = r + 12 / zoom;
        const dx = point.x - pos.x;
        const dy = point.y - pos.y;
        if (dx * dx + dy * dy <= hitR * hitR) {
          hoverNode = node;
          break;
        }
      }
    }
    
    setHoveredNodeId(hoverNode?.id ?? null);
  };

  const endPointer = (event) => {
    pointersRef.current.delete(event.pointerId);
    try {
      realCanvasRef.current?.releasePointerCapture?.(event.pointerId);
    } catch {
      // capture can fail
    }
    if (pointersRef.current.size < 2) gestureRef.current = null;
    if (pointersRef.current.size === 0 || dragRef.current?.type === "pinch") dragRef.current = null;
  };

  const zoomBy = (delta) => {
    const nextZoom = clamp(zoom + delta, 0.45, 2.4);
    zoomToPoint(nextZoom, { x: VIEW_WIDTH / 2, y: VIEW_HEIGHT / 2 });
  };

  useEffect(() => {
    const target = realCanvasRef.current;
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
    const target = realCanvasRef.current;
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

  const fitGraph = useCallback((options = {}) => {
    if (!graph.nodes.length) return;

    const bounds = graphBoundsForPositions(graph.nodes, layoutPositions, visualScale, layoutMode);
    if (!bounds) return;

    const padding = options.padding ?? Math.max(72, Math.min(VIEW_WIDTH, VIEW_HEIGHT) * 0.1);
    const width = Math.max(bounds.maxX - bounds.minX, 160);
    const height = Math.max(bounds.maxY - bounds.minY, 140);
    const nextZoom = clamp(
      Math.min((VIEW_WIDTH - padding * 2) / width, (VIEW_HEIGHT - padding * 2) / height),
      0.35,
      2.2
    );
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;

    setZoom(nextZoom);
    setPan({
      x: VIEW_WIDTH / 2 - centerX * nextZoom,
      y: VIEW_HEIGHT / 2 - centerY * nextZoom
    });
  }, [VIEW_WIDTH, VIEW_HEIGHT, graph.nodes, layoutPositions, visualScale, layoutMode]);

  const [fitRequest, setFitRequest] = useState(0);

  const resetGraph = () => {
    setManualPositions({});
    setFitRequest((value) => value + 1);
  };

  useEffect(() => {
    fitGraph({ padding: 96 });
  }, [fitRequest, fitGraph]);

  useEffect(() => {
    fitGraph({ padding: 80 });
  }, [graphData, layoutMode, fitGraph]);

  const selectedNode = selected?.type === "node" ? selected.node : null;
  const selectedEdge = selected?.type === "edge" ? selected.link : null;
  const denseGraph = graph.nodes.length > 80 || graph.links.length > 80;
  const showLinkLabels = graph.links.length <= 42;
  
  const graphInsights = useMemo(() => {
    const byCount = (a, b) => (b.count ?? 0) - (a.count ?? 0) || a.id.localeCompare(b.id);
    const sources = graph.nodes.filter((node) => node.kind === "source").sort(byCount).slice(0, 6);
    const endpoints = graph.nodes.filter((node) => node.kind !== "source").sort(byCount).slice(0, 6);
    const relayLinks = graph.links.filter((link) => link.classification === "relay").sort(byCount).slice(0, 4);
    return { sources, endpoints, relayLinks };
  }, [graph.links, graph.nodes]);

  useEffect(() => {
    const canvas = realCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(VIEW_WIDTH * dpr);
    canvas.height = Math.round(VIEW_HEIGHT * dpr);
    canvas.style.width = `${VIEW_WIDTH}px`;
    canvas.style.height = `${VIEW_HEIGHT}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT);

    ctx.save();
    ctx.translate(Math.round(pan.x), Math.round(pan.y));
    ctx.scale(zoom, zoom);

    graph.links.forEach((link) => {
      const sourceRaw = positions.get(link.sourceId ?? link.source_id);
      const targetRaw = positions.get(link.targetId ?? link.target_id);
      if (!sourceRaw || !targetRaw) return;

      const source = { x: Math.round(sourceRaw.x), y: Math.round(sourceRaw.y) };
      const target = { x: Math.round(targetRaw.x), y: Math.round(targetRaw.y) };

      const isSelected = selectedEdge?.id === link.id;
      
      ctx.save();
      
      let strokeColor = "#1c7ed6";
      const isRelay = link.classification === "relay";
      const isP2p = link.classification === "p2p";

      if (isP2p) strokeColor = "#2b8a3e";
      else if (isRelay) strokeColor = "#e03131";
      else strokeColor = "#8b949e";
      
      ctx.strokeStyle = strokeColor;
      ctx.lineCap = "round";
      
      let opacity = denseGraph ? 0.35 : 0.65;
      if (isRelay) opacity *= 0.55;
      if (isSelected) opacity = 1.0;
      ctx.globalAlpha = opacity;
      
      let linkWidth = denseGraph
        ? 1.0 + Math.min(Math.log1p(link.count || 1) * 0.3, 1.8)
        : 1.8 + Math.min(Math.log1p(link.count || 1) * 0.5, 3.0);
      if (isSelected) linkWidth = 4.5;
      ctx.lineWidth = linkWidth / zoom;

      ctx.beginPath();
      if (layoutMode === "sankey") {
        ctx.moveTo(source.x, source.y);
        ctx.bezierCurveTo(
          source.x + (target.x - source.x) * 0.5,
          source.y,
          source.x + (target.x - source.x) * 0.5,
          target.y,
          target.x,
          target.y
        );
      } else {
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);
      }
      
      if (isRelay) {
        ctx.setLineDash([4 / zoom, 3 / zoom]);
      }
      
      ctx.stroke();
      ctx.restore();

      if (showLinkLabels && zoom > 0.65) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        ctx.font = "bold 9px var(--font-mono, monospace)";
        ctx.fillStyle = "#516070";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const screenMidX = midX * zoom + pan.x;
        const screenMidY = midY * zoom + pan.y;

        ctx.fillText(`${link.count} session${link.count === 1 ? "" : "s"}`, screenMidX, screenMidY - 8);
        ctx.restore();
      }
    });

    graph.nodes.forEach((node) => {
      const posRaw = positions.get(node.id) ?? node;
      const pos = { x: Math.round(posRaw.x), y: Math.round(posRaw.y) };
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNodeId === node.id;
      const visual = graphNodeVisual(node, visualScale, layoutMode === "sankey");

      let fillStyle = "#ffffff";
      let strokeStyle = "#9aa8b5";
      
      if (node.kind === "source") {
        fillStyle = "#1c7ed6";
        strokeStyle = "#121f2b";
      } else if (node.kind === "p2p") {
        fillStyle = "#f3fbf4";
        strokeStyle = "#2f9e44";
      } else if (node.kind === "relay") {
        fillStyle = "#fff6f6";
        strokeStyle = "#e03131";
      } else if (node.kind === "unknown") {
        fillStyle = "#f5f7fa";
        strokeStyle = "#8b949e";
      }

      let strokeWidth = 2.5;
      if (denseGraph) strokeWidth = 1.8;
      if (isSelected) strokeWidth = 4;
      else if (isHovered) strokeWidth = 3.5;

      const drawStrokeWidth = strokeWidth / zoom;

      if (node.kind === "source") {
        const w = visual.width / zoom;
        const h = visual.height / zoom;
        const r = Math.min(8 / zoom, w * 0.28);
        
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(pos.x - w / 2, pos.y - h / 2, w, h, r);
        } else {
          ctx.moveTo(pos.x - w / 2 + r, pos.y - h / 2);
          ctx.lineTo(pos.x + w / 2 - r, pos.y - h / 2);
          ctx.quadraticCurveTo(pos.x + w / 2, pos.y - h / 2, pos.x + w / 2, pos.y - h / 2 + r);
          ctx.lineTo(pos.x + w / 2, pos.y + h / 2 - r);
          ctx.quadraticCurveTo(pos.x + w / 2, pos.y + h / 2, pos.x + w / 2 - r, pos.y + h / 2);
          ctx.lineTo(pos.x - w / 2 + r, pos.y + h / 2);
          ctx.quadraticCurveTo(pos.x - w / 2, pos.y + h / 2, pos.x - w / 2, pos.y + h / 2 - r);
          ctx.lineTo(pos.x - w / 2, pos.y - h / 2 + r);
          ctx.quadraticCurveTo(pos.x - w / 2, pos.y - h / 2, pos.x - w / 2 + r, pos.y - h / 2);
        }
        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = drawStrokeWidth;
        ctx.fill();
        ctx.stroke();

        // Draw smartphone speaker slot and home button details
        ctx.beginPath();
        ctx.moveTo(pos.x - w / 4, pos.y - h / 2 + 4 / zoom);
        ctx.lineTo(pos.x + w / 4, pos.y - h / 2 + 4 / zoom);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1.3 / zoom;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y + h / 2 - 5 / zoom, 2.2 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.fill();

        ctx.restore();
      } else {
        const r = visual.radius / zoom;
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = drawStrokeWidth;
        if (node.kind === "relay") {
          ctx.setLineDash([4 / zoom, 3 / zoom]);
        }
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }

      const r = visual.radius / zoom;

      // Always draw inside glyphs for server & tower nodes if size fits
      if (r >= 6 && zoom > 0.35) {
        const glyphSize = r * 1.15;
        if (node.kind === "p2p" || (node.kind !== "source" && node.kind !== "relay" && node.kind !== "unknown")) {
          drawServerIcon(ctx, pos.x, pos.y, glyphSize);
        } else if (node.kind === "relay") {
          drawTowerIcon(ctx, pos.x, pos.y, glyphSize);
        }
      }

      if (node.score >= 0.7 && node.kind !== "source") {
        const badgeX = pos.x + r * 0.7;
        const badgeY = pos.y + r * 0.7;
        drawShieldWarningBadge(ctx, badgeX, badgeY, r * 0.6);
      }

      const showTitle = !denseGraph || isSelected || isHovered || node.kind === "source";
      if (showTitle && zoom > 0.55) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        const baseFontSize = denseGraph ? (node.kind === "source" ? 9 : 8) : 11;
        ctx.font = `bold ${baseFontSize}px var(--font-mono, monospace)`;
        ctx.textBaseline = "middle";
        
        ctx.fillStyle = node.kind === "source" ? "#ffffff" : "#121f2b";
        
        const screenX = Math.round(pos.x * zoom + pan.x);
        const screenY = Math.round(pos.y * zoom + pan.y);
        
        if (node.kind === "source") {
          ctx.textAlign = "center";
          ctx.fillText(node.label, screenX, screenY);
        } else {
          ctx.textAlign = "left";
          const textX = Math.round(screenX + r * zoom + 8);
          const textY = !denseGraph ? Math.round(screenY - 6) : screenY;
          ctx.fillText(node.label, textX, textY);
        }
        ctx.restore();
      }

      const showSubtitle = !denseGraph;
      if (showSubtitle && zoom > 0.65) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);

        ctx.font = `700 10px var(--font-sans, sans-serif)`;
        ctx.fillStyle = "#516070";
        ctx.textBaseline = "top";

        const screenX = Math.round(pos.x * zoom + pan.x);
        const screenY = Math.round(pos.y * zoom + pan.y);

        if (node.kind === "source") {
          ctx.textAlign = "center";
          ctx.fillText("A-party", screenX, Math.round(screenY + r * zoom + 6));
        } else {
          ctx.textAlign = "left";
          const textX = Math.round(screenX + r * zoom + 8);
          const textY = Math.round(screenY + 2);
          ctx.fillText(node.operator, textX, textY);
        }
        ctx.restore();
      }
    });

    ctx.restore();

  }, [graph, positions, zoom, pan, selectedNode, selectedEdge, hoveredNodeId, denseGraph, showLinkLabels, layoutMode, VIEW_WIDTH, VIEW_HEIGHT]);

  return (
    <div ref={workspaceRef} className={`network-workspace graph-layout-${layoutMode} ${denseGraph ? "is-dense" : ""} ${isGraphFullscreen ? "is-fullscreen" : ""}`}>
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

        <div ref={containerRef} className="network-canvas graph-canvas">
          <canvas
            ref={realCanvasRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onLostPointerCapture={endPointer}
            style={{ width: "100%", height: "100%", display: "block" }}
          />

          <div className="graph-tools" aria-label="Graph controls">
            <button type="button" onClick={() => zoomBy(0.15)} aria-label="Zoom in" data-tooltip="Zoom in"><ZoomIn size={16} /></button>
            <button type="button" onClick={() => zoomBy(-0.15)} aria-label="Zoom out" data-tooltip="Zoom out"><ZoomOut size={16} /></button>
            <button type="button" onClick={fitGraph} aria-label="Fit graph" data-tooltip="Fit graph"><LocateFixed size={16} /></button>
            <button type="button" onClick={resetGraph} aria-label="Reset graph" data-tooltip="Reset graph"><RotateCcw size={16} /></button>
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isGraphFullscreen ? "Exit fullscreen" : "Fullscreen graph"}
              data-tooltip={isGraphFullscreen ? "Exit fullscreen" : "Fullscreen graph"}
            >
              {isGraphFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      </div>

      <aside className="graph-inspector">
        {selectedNode ? (
          <GraphNodeInspector node={selectedNode} onExtract={onExtract} onFocusSource={onFocusSource} />
        ) : selectedEdge ? (
          <GraphEdgeInspector link={selectedEdge} onExtract={onExtract} onFocusSource={onFocusSource} />
        ) : (
          <GraphInvestigationSummary graph={graph} insights={graphInsights} denseGraph={denseGraph} onExtract={onExtract} onFocusSource={onFocusSource} />
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

function GraphInvestigationSummary({ graph, insights, denseGraph, onExtract, onFocusSource }) {
  const hasGraph = graph.nodes.length > 0;
  if (!hasGraph) {
    return (
      <div className="graph-empty-inspector">
        <strong>Select a focus entity</strong>
        <span>Enter an MSISDN, IP, or IMEI in the search bar above to load a focused investigation subgraph — or leave it blank for a ranked overview of the top flows.</span>
      </div>
    );
  }

  // Use backend-ranked data if available, else fall back to local sort
  const sourceNodes    = graph.nodes.filter(n => n.kind === "source")
    .sort((a,b) => (b.score??0)-(a.score??0) || (b.count??0)-(a.count??0)).slice(0,6);
  const endpointNodes  = graph.nodes.filter(n => n.kind !== "source")
    .sort((a,b) => (b.score??0)-(a.score??0) || (b.count??0)-(a.count??0)).slice(0,6);
  const sharedEndpoints= endpointNodes.filter(n => (n.metadata?.source_count ?? 1) > 1);
  const p2pLinks       = graph.links.filter(l => l.classification === "p2p")
    .sort((a,b) => (b.score??0)-(a.score??0)).slice(0,4);

  return (
    <div className="graph-inspector__content">
      <span className="eyebrow">Investigation overview</span>
      <h3>{denseGraph ? "Dense overview" : graph.metrics?.sessions ? `${number(graph.metrics.sessions)} sessions` : "Graph overview"}</h3>
      <p className="graph-inspector-note">Click any node or link for details · Click "Focus A-party" to re-query around a single suspect.</p>

      {/* Metrics row */}
      <div className="graph-mini-metrics">
        <div><span>P2P leads</span><strong className="success">{number(graph.metrics?.p2p ?? 0)}</strong></div>
        <div><span>High conf.</span><strong>{number(graph.metrics?.high_confidence ?? 0)}</strong></div>
        <div><span>Omitted</span><strong className="muted">{number(graph.metrics?.omitted_edges ?? 0)}</strong></div>
      </div>

      {/* Ranked A-parties */}
      <div className="graph-insight-panel">
        <strong>Ranked A-parties</strong>
        <div className="graph-insight-list">
          {sourceNodes.length ? sourceNodes.map(node => (
            <div className="graph-insight-row" key={node.id}>
              <button type="button" onClick={() => onFocusSource(node.id)}>
                <span className="mono">{node.title}</span>
                <small>score {Math.round((node.score??0)*100)}% · {number(node.count)} sessions</small>
              </button>
              <button type="button" className="graph-row-action" onClick={() => onExtract(node.id)}>Extract</button>
            </div>
          )) : <span className="graph-muted">No A-party nodes in this slice.</span>}
        </div>
      </div>

      {/* Shared endpoints (multi-source) */}
      {sharedEndpoints.length > 0 && (
        <div className="graph-insight-panel warning">
          <strong>Shared endpoints <Badge tone="warning">{sharedEndpoints.length}</Badge></strong>
          <div className="graph-insight-list compact">
            {sharedEndpoints.map(node => (
              <div className="graph-insight-stat" key={node.id}>
                <span className="mono">{node.title}</span>
                <small>{node.metadata?.source_count ?? "?"} A-parties · {node.kind}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* P2P direct leads */}
      {p2pLinks.length > 0 && (
        <div className="graph-insight-panel success">
          <strong>Direct P2P leads</strong>
          <div className="graph-insight-list compact">
            {p2pLinks.map(link => (
              <div className="graph-insight-stat" key={link.id}>
                <span className="mono">{link.sourceId?.slice(-4)} → {link.targetId}</span>
                <small>score {Math.round((link.score??0)*100)}% · {number(link.count)} sessions · {formatDuration(link.duration_seconds??0)}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* High-volume endpoints */}
      <div className="graph-insight-panel">
        <strong>Top endpoints</strong>
        <div className="graph-insight-list compact">
          {endpointNodes.length ? endpointNodes.map(node => (
            <div className="graph-insight-stat" key={node.id}>
              <span className="mono">{node.title}</span>
              <small>{number(node.count)} sessions · {node.kind} · {node.operator}</small>
            </div>
          )) : <span className="graph-muted">No endpoint nodes in this slice.</span>}
        </div>
      </div>
    </div>
  );
}
function GraphNodeInspector({ node, onExtract, onFocusSource }) {
  const sessions     = node.sessions ?? [];
  const latest       = sessions[0];
  const primarySource= primarySourceMsisdnFromNode(node);
  const isSource     = node.kind === "source";
  const imeis        = node.metadata?.imeis?.filter(Boolean) ?? [];
  const imsis        = node.metadata?.imsis?.filter(Boolean) ?? [];
  const ports        = node.metadata?.destination_ports ?? node.metadata?.ports ?? [];
  const apps         = node.metadata?.apps?.filter(Boolean) ?? [];
  const sharedCount  = node.metadata?.source_count ?? null;
  return (
    <div className="graph-inspector__content">
      <span className="eyebrow">{isSource ? "A-party (suspect)" : "Destination endpoint"}</span>
      <h3>{node.title}</h3>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
        <Badge tone={toneForClass(isSource ? "p2p" : node.kind)}>{isSource ? "A-party" : node.kind}</Badge>
        {node.score > 0 && <Badge tone={node.score >= 0.7 ? "danger" : node.score >= 0.5 ? "warning" : "neutral"}>score {Math.round(node.score*100)}%</Badge>}
        {sharedCount > 1 && <Badge tone="danger">shared by {sharedCount}</Badge>}
      </div>
      <dl>
        <div><dt>Operator</dt><dd>{node.operator}</dd></div>
        <div><dt>Sessions</dt><dd>{number(node.count)}</dd></div>
        <div><dt>Confidence</dt><dd>{Math.round(node.confidence * 100)}%</dd></div>
        <div><dt>First seen</dt><dd>{node.first_seen ? date(node.first_seen) : "-"}</dd></div>
        <div><dt>Last seen</dt><dd>{node.last_seen ? date(node.last_seen) : (latest ? date(latest.started_at) : "-")}</dd></div>
        {imeis.length > 0 && <div><dt>IMEI(s)</dt><dd className="mono" style={{fontSize:11}}>{imeis.join(", ")}</dd></div>}
        {imsis.length > 0 && <div><dt>IMSI(s)</dt><dd className="mono" style={{fontSize:11}}>{imsis.join(", ")}</dd></div>}
        {ports.length > 0 && <div><dt>Ports</dt><dd className="mono" style={{fontSize:11}}>{ports.slice(0,8).join(", ")}</dd></div>}
        {apps.length  > 0 && <div><dt>Apps</dt><dd style={{fontSize:11}}>{apps.slice(0,4).join(", ")}</dd></div>}
      </dl>
      {primarySource ? (
        <div className="graph-inspector-actions">
          <Button type="button" icon={LocateFixed} variant="secondary" onClick={() => onFocusSource(primarySource)}>Focus</Button>
          <Button type="button" icon={Target} onClick={() => onExtract(primarySource)}>{isSource ? "Run extraction" : "Extract linked A-party"}</Button>
        </div>
      ) : null}
      {latest ? <p className="graph-evidence mono">{latest.source_file} row {latest.row_number}</p> : null}
    </div>
  );
}

function GraphEdgeInspector({ link, onExtract, onFocusSource }) {
  const first       = link.sessions?.[0];
  const nightCount  = link.metadata?.night_sessions ?? 0;
  const sharedSrcs  = link.metadata?.shared_source_count ?? 1;
  const destPorts   = link.metadata?.destination_ports ?? [];
  const linkApps    = link.metadata?.applications?.filter(Boolean) ?? [];
  return (
    <div className="graph-inspector__content">
      <span className="eyebrow">Connection — why this edge exists</span>
      <h3 style={{fontSize:13, wordBreak:"break-all"}}>{link.source_id} → {link.target_id}</h3>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:8 }}>
        <Badge tone={toneForClass(link.classification)}>{link.classification}</Badge>
        {link.score > 0 && <Badge tone={link.score >= 0.7 ? "danger" : link.score >= 0.5 ? "warning" : "neutral"}>score {Math.round(link.score*100)}%</Badge>}
        {nightCount > 0 && <Badge tone="warning">{nightCount} night sessions</Badge>}
        {sharedSrcs > 1 && <Badge tone="danger">shared by {sharedSrcs} suspects</Badge>}
      </div>
      <dl>
        <div><dt>Sessions</dt><dd>{number(link.count)}</dd></div>
        <div><dt>Confidence</dt><dd>{Math.round(link.confidence * 100)}%</dd></div>
        <div><dt>Total bytes</dt><dd>{number(link.bytes)}</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(link.duration_seconds ?? link.duration ?? 0)}</dd></div>
        <div><dt>First seen</dt><dd>{link.first_seen ? date(link.first_seen) : "-"}</dd></div>
        <div><dt>Last seen</dt><dd>{link.last_seen ? date(link.last_seen) : "-"}</dd></div>
        {destPorts.length > 0 && <div><dt>Dest ports</dt><dd className="mono" style={{fontSize:11}}>{destPorts.slice(0,8).join(", ")}</dd></div>}
        {linkApps.length  > 0 && <div><dt>Apps</dt><dd style={{fontSize:11}}>{linkApps.slice(0,4).join(", ")}</dd></div>}
      </dl>
      <div className="graph-inspector-actions">
        <Button type="button" icon={LocateFixed} variant="secondary" onClick={() => onFocusSource(link.source_id ?? link.sourceId)}>Focus A-party</Button>
        <Button type="button" icon={Target} onClick={() => onExtract(link.source_id ?? link.sourceId)}>Extract source</Button>
      </div>
      {/* Evidence rows */}
      <div className="graph-evidence-list">
        {(link.sessions ?? []).slice(0,4).map(session => (
          <div key={session.id}>
            <strong>{session.operator}</strong>
            <span className="mono">→ {formatEndpoint(session.destination_ip, session.destination_port)}</span>
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

function SystemPanel({ stats, apiLive, persistence, createPersistenceSnapshot, resetPersistence }) {
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

  const performReset = async () => {
    if (!resetPersistence) return;
    const confirmed = window.confirm(
      "CRITICAL ACTION REQUIRED:\n\n" +
      "Are you sure you want to perform a factory reset? This will permanently clear all uploads, cases, search history, request packages, and database logs back to 0.\n\n" +
      "This action is completely irreversible! Proceed?"
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await resetPersistence();
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

      {/* ── Project Team Credits ── */}
      <article className="persistence-card" style={{ marginTop: "16px", borderColor: "rgba(99, 102, 241, 0.25)", background: "linear-gradient(135deg, rgba(99,102,241,0.05), transparent 70%)" }}>
        <div style={{ width: "100%" }}>
          <span style={{ color: "var(--color-brand)", fontWeight: "600", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
            <Users size={13} /> Project Team
          </span>
          <strong style={{ display: "block", fontSize: "14px", marginTop: "6px", marginBottom: "14px" }}>Pramaan IPDR Engine — Built by</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {[
              { name: "Parikshit Singh Bais", role: "Senior Developer", icon: Code, color: "var(--color-brand)" },
              { name: "Adarsh Singh",         role: "Project Manager",  icon: BriefcaseBusiness, color: "var(--color-warning)" },
              { name: "Akmal Qureshi",        role: "Researcher",       icon: Search, color: "var(--color-success)" },
            ].map((member) => (
              <div key={member.name} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", borderRadius: "8px", background: "var(--panel-bg)", border: "1px solid var(--border)" }}>
                <span style={{ 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center", 
                  width: "28px", 
                  height: "28px", 
                  borderRadius: "6px", 
                  background: "var(--color-border-subtle)", 
                  color: member.color 
                }}>
                  <member.icon size={14} />
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "13px", color: "var(--color-text-primary)" }}>{member.name}</strong>
                  <span style={{ fontSize: "11px", color: "var(--color-text-muted)", letterSpacing: "0.3px" }}>{member.role}</span>
                </div>
                <Star size={12} style={{ marginLeft: "auto", color: "var(--color-brand)", opacity: 0.6 }} />
              </div>
            ))}
          </div>
        </div>
      </article>

      <article className="persistence-card" style={{ marginTop: "16px", borderColor: "rgba(214, 76, 74, 0.25)", background: "linear-gradient(135deg, rgba(214, 76, 74, 0.03), #ffffff 52%)" }}>
        <div>
          <span style={{ color: "var(--color-danger)", fontWeight: "600", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Danger Zone</span>
          <strong style={{ display: "block", fontSize: "14px", marginTop: "4px" }}>Factory Reset Database</strong>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "13px", marginTop: "4px" }}>Permanently clear all target uploads, cases, search histories, request packages, and database logs to 0.</p>
        </div>
        <div className="persistence-card__meta">
          <Badge tone="danger">Irreversible</Badge>
          <Button 
            type="button" 
            icon={Trash2} 
            variant="danger" 
            onClick={performReset} 
            disabled={busy}
          >
            {busy ? "Resetting..." : "Reset to 0"}
          </Button>
        </div>
      </article>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone = "neutral" }) {
  return (
    <motion.div 
      className={`stat-card ${tone}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.12 } }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <span className="stat-card__icon"><Icon size={18} /></span>
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.div>
  );
}





function Button({ children, icon: Icon, iconClassName = "", variant = "primary", ...props }) {
  return (
    <button className={`button ${variant}`} type={props.type ?? "submit"} {...props}>
      {Icon ? <Icon size={16} className={iconClassName} /> : null}
      <span>{children}</span>
    </button>
  );
}

function SelectControl({ ariaLabel, icon: Icon, value, onChange, options, disabled = false }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className={`select-control ${open ? "is-open" : ""} ${disabled ? "is-disabled" : ""}`}
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
        disabled={disabled}
        onClick={() => !disabled && setOpen((current) => !current)}
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


