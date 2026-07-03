import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from "d3-force";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clipboard,
  Copy,
  Database,
  Download,
  FileJson,
  FileText,
  Filter,
  Gauge,
  LayoutDashboard,
  LocateFixed,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RotateCcw,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Target,
  Upload,
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
  { icon: Upload, label: "File Upload", path: "/uploads" },
  { icon: Database, label: "Sessions", path: "/sessions" },
  { icon: Target, label: "B-Party Extraction", path: "/extractions" },
  { icon: Network, label: "Communication Map", path: "/map" },
  { icon: FileText, label: "Request Packages", path: "/packages" },
  { icon: Clipboard, label: "Audit Log", path: "/audit" },
  { icon: Settings, label: "Settings", path: "/settings" }
];

const emptyStats = {
  uploads: 0,
  sessions: 0,
  actionable: 0,
  relay: 0,
  unknown: 0,
  quarantined_rows: 0,
  avg_confidence: 0,
  latest_upload: null
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
  uploads: [],
  sessions: [],
  graph: emptyGraphData,
  patterns: [],
  extractions: [],
  packages: [],
  auditLogs: [],
  platformRanges: []
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
      const [stats, uploads, sessions, graph, patterns, extractions, packagesList, auditLogs, platformRanges] = await Promise.all([
        api.dashboard(),
        api.uploads(),
        api.sessions(),
        api.graph(),
        api.patterns(),
        api.extractions(),
        api.packages(),
        api.auditLogs(),
        api.platformRanges()
      ]);
      setData({ stats, uploads, sessions, graph: normalizeGraphResponse(graph), patterns, extractions, packages: packagesList, auditLogs, platformRanges });
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
    async (file) => {
      try {
        const upload = await api.upload(file);
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

  return (
    <>
      <Shell apiLive={apiLive} apiError={apiError}>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<DashboardPage data={data} />} />
            <Route path="/uploads" element={<UploadsPage uploads={data.uploads} uploadFile={uploadFile} />} />
            <Route path="/sessions" element={<SessionsPage sessions={data.sessions} />} />
            <Route path="/extractions" element={<ExtractionsPage extractions={data.extractions} runExtraction={runExtraction} />} />
            <Route path="/map" element={<MapPage initialGraph={data.graph} runExtraction={runExtraction} />} />
            <Route path="/packages" element={<PackagesPage packagesList={data.packages} />} />
            <Route path="/audit" element={<AuditPage auditLogs={data.auditLogs} />} />
            <Route path="/settings" element={<SettingsPage ranges={data.platformRanges} stats={data.stats} apiLive={apiLive} />} />
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
    if (query.trim()) {
      navigate(`/sessions?q=${encodeURIComponent(query.trim())}`);
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
function UploadsPage({ uploads, uploadFile }) {
  const [activeFile, setActiveFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputId = useId();

  const submitUpload = async (event) => {
    event.preventDefault();
    if (activeFile) {
      const uploaded = await uploadFile(activeFile);
      if (uploaded) {
        setActiveFile(null);
        event.currentTarget.reset();
      }
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const [file] = event.dataTransfer.files;
    if (file) {
      setActiveFile(file);
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
            accept=".csv,.txt,.tsv,.json,.xlsx,.xls"
            onChange={(event) => setActiveFile(event.target.files?.[0] ?? null)}
          />
          <label
            className={`upload-drop__surface ${activeFile ? "has-file" : ""} ${isDragging ? "is-dragging" : ""}`}
            htmlFor={fileInputId}
            onDragEnter={() => setIsDragging(true)}
            onDragLeave={() => setIsDragging(false)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="upload-drop__icon"><FileJson size={34} /></span>
            <strong>{activeFile ? activeFile.name : "Select IPDR evidence file"}</strong>
            <span>{activeFile ? `${number(activeFile.size)} bytes ready for parsing` : "CSV, TSV, TXT, JSON, XLSX"}</span>
            <span className="upload-drop__action">{activeFile ? "Change file" : "Browse file"}</span>
          </label>
          <Button icon={Upload} disabled={!activeFile}>
            Process file
          </Button>
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
                <th>Format</th>
                <th>Adapter</th>
                <th>Progress</th>
              </tr>
            </thead>
            <tbody>
              {uploads.length ? uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{upload.filename}</td>
                  <td><Badge tone={upload.status === "completed" ? "success" : upload.status === "failed" ? "danger" : "warning"}>{upload.status}</Badge></td>
                  <td>{number(upload.rows_valid)} / {number(upload.rows_total)}</td>
                  <td><span className="mono">{upload.format_report?.file_format ?? "-"}</span></td>
                  <td>{upload.format_report?.adapter ?? "-"}</td>
                  <td><Progress value={upload.progress} /></td>
                </tr>
              )) : <TableEmptyRow colSpan={6} label="No evidence files uploaded" />}
            </tbody>
          </table>
        </div>
      </section>
    </motion.section>
  );
}

function SessionsPage({ sessions }) {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [classification, setClassification] = useState("all");
  const deferredQuery = useDeferredValue(query);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesClass = classification === "all" || session.classification === classification;
      const matchesQuery =
        !needle ||
        session.a_party_msisdn.includes(needle) ||
        session.destination_ip.includes(needle) ||
        session.operator.toLowerCase().includes(needle);
      return matchesClass && matchesQuery;
    });
  }, [classification, deferredQuery, sessions]);

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
        </div>
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

function SettingsPage({ ranges, stats, apiLive }) {
  const [tab, setTab] = useState("ranges");
  return (
    <motion.section {...pageMotion} className="page-grid">
      <section className="panel span-12">
        <PanelHeader icon={Settings} title="Settings" />
        <div className="tabs">
          {[
            ["ranges", "Platform Ranges"],
            ["adapters", "Operator Adapters"],
            ["system", "System Info"]
          ].map(([id, label]) => (
            <button className={tab === id ? "active" : ""} key={id} onClick={() => setTab(id)} type="button">{label}</button>
          ))}
        </div>
        {tab === "ranges" ? <RangesTable ranges={ranges} /> : null}
        {tab === "adapters" ? <AdaptersPanel /> : null}
        {tab === "system" ? <SystemPanel stats={stats} apiLive={apiLive} /> : null}
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
              <td className="mono">{session.a_party_msisdn}</td>
              <td><span className="mono">{session.destination_ip}:{session.destination_port}</span></td>
              <td>{session.operator}</td>
              <td><Badge tone={toneForClass(session.classification)}>{session.classification}</Badge></td>
              {!compact ? <td className="mono">{date(session.started_at)}</td> : null}
              <td>{Math.round(session.confidence * 100)}%</td>
            </tr>
          )) : <TableEmptyRow colSpan={compact ? 5 : 6} label="No normalized sessions found" />}
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
                <td className="mono">{candidate.destination_ip}:{candidate.destination_port}</td>
                <td>{candidate.target_operator}</td>
                <td><Badge tone={toneForClass(candidate.classification)}>{candidate.classification}</Badge></td>
                <td>{candidate.evidence}</td>
                <td>{Math.round(candidate.confidence * 100)}%</td>
              </tr>
            )) : <TableEmptyRow colSpan={5} label="No candidates met the confidence threshold" />}
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
            <span className="mono">{session.destination_ip}:{session.destination_port}</span>
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

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}m ${rest}s`;
}
function RequestPackageCard({ item }) {
  const details = [
    ["IP Address", item.payload.destination_ip],
    ["Port", item.payload.destination_port],
    ["Protocol", item.payload.protocol],
    ["Timestamp", item.payload.timestamp_ist],
    ["Duration", `${item.payload.duration_seconds}s`],
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

function AdaptersPanel() {
  return (
    <div className="adapter-grid">
      {["Airtel", "Jio", "Vodafone Idea", "BSNL", "Generic"].map((name) => (
        <div className="adapter-tile" key={name}>
          <strong>{name}</strong>
          <span>msisdn, destination_ip, destination_port, duration_seconds</span>
          <Badge tone="success">loaded</Badge>
        </div>
      ))}
    </div>
  );
}

function SystemPanel({ stats, apiLive }) {
  return (
    <div className="system-grid">
      <StatCard icon={Server} label="API" value={apiLive ? "Live" : "Offline"} tone={apiLive ? "success" : "danger"} />
      <StatCard icon={Database} label="Rows" value={number(stats.sessions)} tone="brand" />
      <StatCard icon={AlertTriangle} label="Quarantine" value={number(stats.quarantined_rows)} tone="danger" />
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

function PanelHeader({ icon: Icon, title, action = null }) {
  return (
    <div className="panel-header">
      <div>
        <Icon size={18} />
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
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

function EmptyState({ label }) {
  return <div className="empty-state">{label}</div>;
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

function number(value) {
  return new Intl.NumberFormat("en-IN").format(value ?? 0);
}

function date(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "short",
    timeStyle: "short",
    hour12: false
  }).format(new Date(value));
}

export default App;


