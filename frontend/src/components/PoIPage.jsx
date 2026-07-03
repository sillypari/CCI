import React, { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { api, API_BASE_URL } from '../api/client.js';
import { ArrowLeft, User, MapPin, Smartphone, Activity, Download, Phone, Globe, Loader2 } from 'lucide-react';
import { PanelHeader, Badge, EmptyState, number } from './common.jsx';

export function PoIPage() {
  const { msisdn } = useParams();
  const [report, setReport] = useState(null);
  const [whatsapp, setWhatsapp] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchReport = async () => {
      setLoading(true);
      try {
        const [poiData, waData] = await Promise.all([
          api.poiReport(msisdn),
          api.whatsappBparty(msisdn).catch(() => [])
        ]);
        if (active) {
          setReport(poiData);
          setWhatsapp(waData);
        }
      } catch (err) {
        console.error("PoI load error:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, [msisdn]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: '16px' }}>
      <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
      <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--color-text-secondary)' }}>Compiling Person of Interest intelligence dossier...</div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Aggregating geolocational cell towers, associated handsets, and WhatsApp logs...</div>
    </div>
  );
  if (!report) return <EmptyState label="PoI profile not found" />;

  return (
    <div className="page-grid" style={{ animation: "fade-in 0.2s ease-out" }}>
      <section className="panel span-12">
        <PanelHeader 
          icon={User} 
          title={`Person of Interest: ${msisdn}`} 
          action={
            <div style={{ display: "flex", gap: "10px" }}>
              <a href={api.poiPdfUrl(msisdn)} target="_blank" rel="noreferrer" className="button secondary">
                <Download size={16} /> Export PDF Brief
              </a>
              <NavLink to="/sessions" className="button brand">View All Sessions</NavLink>
            </div>
          } 
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div className="stat-card">
            <span>Total Sessions</span>
            <strong>{number(report.total_sessions)}</strong>
          </div>
          <div className="stat-card">
            <span>Locations Visited</span>
            <strong>{report.locations.length}</strong>
          </div>
          <div className="stat-card">
            <span>Applications Used</span>
            <strong>{report.applications.length}</strong>
          </div>
          <div className="stat-card">
            <span>Handsets (IMEIs)</span>
            <strong>{report.imeis.length}</strong>
          </div>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={MapPin} title="Top Locations" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cell ID</th><th>Visits</th></tr></thead>
            <tbody>
              {report.locations.slice(0, 5).map((loc, i) => (
                <tr key={i}>
                  <td className="mono">{loc.cell_id}</td>
                  <td>{number(loc.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Smartphone} title="Associated IMEIs" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>IMEI</th><th>Sessions</th></tr></thead>
            <tbody>
              {report.imeis.map((imei, i) => (
                <tr key={i}>
                  <td className="mono">{imei.imei}</td>
                  <td>{number(imei.count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Activity} title="Top Applications Grid" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Platform</th>
                <th>Sessions</th>
                <th>Cumulative Duration</th>
              </tr>
            </thead>
            <tbody>
              {report.applications && report.applications.length ? report.applications.slice(0, 10).map((app, i) => (
                <tr key={i}>
                  <td><Badge tone="brand">{app.name}</Badge></td>
                  <td>{number(app.sessions)}</td>
                  <td className="mono">{number(app.duration)}s</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>No applications detected</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Activity} title="Top 10 Application Durations (Bar Graph)" />
        <div style={{ padding: "16px 8px 8px 8px" }}>
          {report.applications && report.applications.length ? (() => {
            const maxDuration = Math.max(...report.applications.map(a => a.duration ?? 0), 1);
            return report.applications.slice(0, 10).map((app, i) => {
              const pct = Math.max(5, ((app.duration ?? 0) / maxDuration) * 100);
              return (
                <div key={i} style={{ marginBottom: "14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px", fontSize: "12px" }}>
                    <strong>{app.name}</strong>
                    <span className="mono" style={{ color: "var(--text-muted)" }}>
                      {number(app.duration)}s ({number(app.sessions)} sessions)
                    </span>
                  </div>
                  <div style={{ height: "10px", background: "var(--color-border-subtle)", borderRadius: "5px", overflow: "hidden" }}>
                    <div 
                      style={{ 
                        width: `${pct}%`, 
                        height: "100%", 
                        background: "linear-gradient(90deg, var(--color-brand) 0%, var(--color-brand-hover) 100%)", 
                        borderRadius: "5px",
                        transition: "width 0.3s ease" 
                      }} 
                    />
                  </div>
                </div>
              );
            });
          })() : <EmptyState label="No application durations to analyze" />}
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Phone} title="WhatsApp Interactions" action={<Badge tone="success">{whatsapp.length} relays</Badge>} />
        {whatsapp.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Target IP</th><th>Time</th><th>Class</th></tr></thead>
              <tbody>
                {whatsapp.slice(0, 10).map((sess, i) => (
                  <tr key={i}>
                    <td><NavLink to={`/ip/${sess.destination_ip}`} className="text-link mono">{sess.destination_ip}</NavLink></td>
                    <td>{new Date(sess.started_at).toLocaleString()}</td>
                    <td><Badge tone="success">{sess.classification}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState label="No WhatsApp infrastructure activity detected" />}
      </section>
    </div>
  );
}
