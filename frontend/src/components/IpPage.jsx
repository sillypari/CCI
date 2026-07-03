import React, { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { api, API_BASE_URL } from '../api/client.js';
import { ArrowLeft, Server, MapPin, Activity, Download, Globe, Loader2 } from 'lucide-react';
import { PanelHeader, Badge, EmptyState, number } from './common.jsx';

export function IpPage() {
  const { ip } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchReport = async () => {
      setLoading(true);
      try {
        const data = await api.ipReport(ip);
        if (active) setReport(data);
      } catch (err) {
        console.error("IP load error:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, [ip]);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: '16px' }}>
      <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
      <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--color-text-secondary)' }}>Querying IP infrastructure & routing registry...</div>
    </div>
  );
  if (!report) return <EmptyState label="IP profile not found" />;

  return (
    <div className="page-grid" style={{ animation: "fade-in 0.2s ease-out" }}>
      <section className="panel span-12">
        <PanelHeader 
          icon={Server} 
          title={`Target IP: ${ip}`} 
          action={
            <div style={{ display: "flex", gap: "10px" }}>
              <a href={api.ipCsvUrl(ip)} target="_blank" rel="noreferrer" className="button secondary">
                <Download size={16} /> Export CSV
              </a>
              <NavLink to="/sessions" className="button brand">View All Sessions</NavLink>
            </div>
          } 
        />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '24px' }}>
          <div className="stat-card">
            <span>Total Traffic Hits</span>
            <strong>{number(report.total_sessions)}</strong>
          </div>
          <div className="stat-card">
            <span>Connected MSISDNs</span>
            <strong>{report.connected_msisdns.length}</strong>
          </div>
          <div className="stat-card">
            <span>Owner / ASN</span>
            <strong>{report.asn_operator ?? "Unknown"}</strong>
          </div>
        </div>
      </section>

      <section className="panel span-12">
        <PanelHeader icon={Activity} title="Connected MSISDNs" action={<Badge tone="brand">{report.connected_msisdns.length} unique numbers</Badge>} />
        {report.connected_msisdns.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>MSISDN</th><th>Connection Count</th></tr></thead>
              <tbody>
                {report.connected_msisdns.slice(0, 50).map((conn, i) => (
                  <tr key={i}>
                    <td><NavLink to={`/poi/${conn.msisdn}`} className="text-link mono">{conn.msisdn}</NavLink></td>
                    <td>{number(conn.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState label="No connected MSISDNs found" />}
      </section>
    </div>
  );
}
