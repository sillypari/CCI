import React, { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { api } from '../api/client.js';
import { Activity, Download, Loader2, Server } from 'lucide-react';
import { PanelHeader, Badge, EmptyState, number } from './common.jsx';

export function IpPage({ sessionCount = null }) {
  const { ip } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(sessionCount !== 0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionCount === 0) {
      setReport(null);
      setError('');
      setLoading(false);
      return undefined;
    }

    let active = true;
    const fetchReport = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.ipReport(ip);
        if (active) setReport(data);
      } catch (err) {
        if (active) {
          setReport(null);
          setError(err.message || 'Unable to load IP profile.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, [ip, sessionCount]);

  if (loading) return (
    <div className="page-loading-state">
      <Loader2 size={32} className="animate-spin" />
      <div>
        <strong>Querying IP infrastructure</strong>
        <span>Resolving sessions, operator hint, ports, and linked A-parties.</span>
      </div>
    </div>
  );

  if (error) return <EmptyState label={error} />;
  if (!report) return <EmptyState label="IP profile not found" />;

  return (
    <div className="page-grid" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <section className="panel span-12">
        <PanelHeader
          icon={Server}
          title={`Target IP: ${ip}`}
          action={
            <div className="toolbar compact">
              <a href={api.ipCsvUrl(ip)} target="_blank" rel="noreferrer" className="button secondary">
                <Download size={16} /> <span>Export CSV</span>
              </a>
              <NavLink to="/sessions" className="button brand">View sessions</NavLink>
            </div>
          }
        />
        <div className="detail-stat-grid three">
          <div className="stat-card neutral">
            <span>Total traffic hits</span>
            <strong>{number(report.total_sessions)}</strong>
          </div>
          <div className="stat-card brand">
            <span>Connected A-parties</span>
            <strong>{report.msisdns.length}</strong>
          </div>
          <div className="stat-card warning">
            <span>Operator / ASN</span>
            <strong>{report.operator || 'Unknown'}</strong>
          </div>
        </div>
      </section>

      <section className="panel span-12">
        <PanelHeader icon={Activity} title="Connected MSISDNs" action={<Badge tone="brand">{report.msisdns.length} unique numbers</Badge>} />
        {report.msisdns.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>MSISDN</th><th>IP class</th><th>Observed ports</th></tr></thead>
              <tbody>
                {report.msisdns.slice(0, 100).map((msisdn) => (
                  <tr key={msisdn}>
                    <td><NavLink to={`/poi/${msisdn}`} className="text-link mono">{msisdn}</NavLink></td>
                    <td><Badge tone={report.classification === 'p2p' ? 'success' : report.classification === 'relay' ? 'danger' : 'neutral'}>{report.classification}</Badge></td>
                    <td className="mono">{report.ports.join(', ') || '-'}</td>
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