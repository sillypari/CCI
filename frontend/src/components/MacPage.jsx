import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, Loader2, Network, Server } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { api } from '../api/client.js';
import { PanelHeader, Badge, EmptyState, number } from './common.jsx';

function date(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function compactList(items = [], max = 3) {
  const visible = items.slice(0, max);
  const remaining = Math.max(0, items.length - visible.length);
  return { visible, remaining };
}

export function MacPage({ sessionCount = null }) {
  const [params] = useSearchParams();
  const initialQuery = params.get('mac') ?? params.get('q') ?? '';
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(sessionCount !== 0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionCount === 0) {
      setReport([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    let active = true;
    const fetchReport = async () => {
      setLoading(true);
      setError('');
      try {
        const data = await api.macFrequency('?limit=100');
        if (active) setReport(data);
      } catch (err) {
        if (active) {
          setReport([]);
          setError(err.message || 'Unable to load MAC intelligence.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, [sessionCount]);

  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    if (!needle) return report;
    return report.filter((row) => (
      row.source_mac.toLowerCase().includes(needle) ||
      row.access_identifiers.some((item) => item.toLowerCase().includes(needle)) ||
      row.source_public_ips.some((item) => item.toLowerCase().includes(needle)) ||
      row.source_private_ips.some((item) => item.toLowerCase().includes(needle))
    ));
  }, [deferredQuery, report]);

  const metrics = useMemo(() => {
    const sourcePublicIps = new Set();
    let shared = 0;
    for (const row of report) {
      if ((row.shared_access_identifiers ?? 0) > 1) shared += 1;
      for (const ip of row.source_public_ips ?? []) sourcePublicIps.add(ip);
    }
    return { total: report.length, shared, sourcePublicIps: sourcePublicIps.size };
  }, [report]);

  const chartData = filtered.slice(0, 10).map((row) => ({
    name: row.source_mac.slice(-8),
    mac: row.source_mac,
    sessions: row.sessions,
    identifiers: row.shared_access_identifiers,
    publicIps: row.public_ip_count
  }));

  if (loading) return (
    <div className="page-loading-state">
      <Loader2 size={32} className="animate-spin" />
      <div>
        <strong>Analyzing broadband device signatures</strong>
        <span>Aggregating MAC reuse, public IP rotation, and access identifier links.</span>
      </div>
    </div>
  );

  if (error) return <EmptyState label={error} />;
  if (!report.length) return <EmptyState label="No MAC address data available in evidence store" />;

  return (
    <div className="page-grid" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <section className="case-ribbon span-12">
        <div className="case-ribbon__main">
          <span className="eyebrow">Fixed-line broadband intelligence</span>
          <h1>MAC address linkage</h1>
          <p>{number(metrics.total)} MAC addresses | {number(metrics.shared)} shared across access identifiers | {number(metrics.sourcePublicIps)} public source IPs</p>
        </div>
        <label className="input-shell" style={{ maxWidth: 420 }}>
          <Network size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="MAC, DSL user ID, public IP" />
        </label>
      </section>

      <section className="panel span-12">
        <PanelHeader icon={Server} title="Broadband MAC Activity" action={<Badge tone="brand">{filtered.length} visible</Badge>} />
        <div className="imei-chart-panel">
          <h3>Most Active MAC Addresses</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line-firm)" />
              <XAxis dataKey="name" stroke="var(--color-text-secondary)" />
              <YAxis yAxisId="left" orientation="left" stroke="var(--brand-icon)" />
              <YAxis yAxisId="right" orientation="right" stroke="#b9b437" />
              <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: 'var(--line-firm)', color: 'var(--color-text-primary)' }} />
              <Bar yAxisId="left" dataKey="sessions" name="Sessions" fill="var(--brand-icon)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="identifiers" name="Access IDs" fill="#b9b437" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel span-12">
        <PanelHeader icon={Activity} title="MAC Reuse Matrix" action={<Badge tone="brand">{number(filtered.length)} rows</Badge>} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>MAC address</th>
                <th>Access identifiers</th>
                <th>Public source IPs</th>
                <th>Top destinations</th>
                <th>Sessions</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const ids = compactList(item.access_identifiers);
                const publicIps = compactList(item.source_public_ips);
                const destinations = compactList(item.top_destinations ?? [], 2);
                const shared = (item.shared_access_identifiers ?? 0) > 1;
                return (
                  <tr key={item.source_mac}>
                    <td className="mono">
                      <div className="stack" style={{ gap: 4 }}>
                        <NavLink to={`/sessions?q=${encodeURIComponent(item.source_mac)}`} className="text-link mono">{item.source_mac}</NavLink>
                        {shared ? <Badge tone="danger"><AlertTriangle size={12} /> shared MAC</Badge> : <Badge tone="neutral">single access ID</Badge>}
                      </div>
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        {ids.visible.map((value) => <span className="mono" key={value}>{value}</span>)}
                        {ids.remaining ? <small className="table-note">+{ids.remaining} more</small> : null}
                      </div>
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        {publicIps.visible.length ? publicIps.visible.map((value) => <span className="mono" key={value}>{value}</span>) : <span>-</span>}
                        {publicIps.remaining ? <small className="table-note">+{publicIps.remaining} more</small> : null}
                      </div>
                    </td>
                    <td>
                      <div className="stack" style={{ gap: 4 }}>
                        {destinations.visible.map((value) => (
                          <span className="mono" key={value.endpoint}>{value.endpoint} <Badge tone="secondary">{value.classification}</Badge></span>
                        ))}
                        {destinations.remaining ? <small className="table-note">+{destinations.remaining} more</small> : null}
                      </div>
                    </td>
                    <td>{number(item.sessions)}</td>
                    <td className="mono">{date(item.last_seen)}</td>
                  </tr>
                );
              })}
              {!filtered.length ? <tr><td colSpan={6} className="table-empty">No MAC rows match the current filter</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
