import React, { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Activity, AlertTriangle, Loader2, Smartphone } from 'lucide-react';
import { PanelHeader, Badge, EmptyState, number } from './common.jsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function ImeiPage({ sessionCount = null }) {
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
        const data = await api.imeiFrequency('?limit=50');
        if (active) setReport(data);
      } catch (err) {
        if (active) {
          setReport([]);
          setError(err.message || 'Unable to load IMEI intelligence.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, [sessionCount]);

  if (loading) return (
    <div className="page-loading-state">
      <Loader2 size={32} className="animate-spin" />
      <div>
        <strong>Analyzing handset signatures</strong>
        <span>Aggregating IMEI frequency and shared-device indicators.</span>
      </div>
    </div>
  );

  if (error) return <EmptyState label={error} />;
  if (!report.length) return <EmptyState label="No IMEI data available in evidence store" />;

  const chartData = report.slice(0, 10).map((row) => ({
    name: row.handset_hint || 'Unknown model',
    imei: row.imei,
    sessions: row.sessions,
    users: row.msisdns.length
  }));

  return (
    <div className="page-grid" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <section className="panel span-12">
        <PanelHeader icon={Smartphone} title="Handset & IMEI Intelligence" action={<Badge tone="brand">Top {report.length}</Badge>} />
        <div className="imei-chart-panel">
          <h3>Top 10 Most Active Handsets</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line-firm)" />
              <XAxis dataKey="name" stroke="var(--color-text-secondary)" />
              <YAxis yAxisId="left" orientation="left" stroke="var(--brand-icon)" />
              <YAxis yAxisId="right" orientation="right" stroke="#b9b437" />
              <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: 'var(--line-firm)', color: 'var(--color-text-primary)' }} />
              <Bar yAxisId="left" dataKey="sessions" name="Total Sessions" fill="var(--brand-icon)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="users" name="Unique MSISDNs" fill="#b9b437" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel span-12">
        <PanelHeader icon={Activity} title="Global IMEI Frequency" action={<Badge tone="brand">{report.length} unique IMEIs</Badge>} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>IMEI</th><th>Handset Model</th><th>Sessions</th><th>Unique A-parties</th></tr></thead>
            <tbody>
              {report.map((item) => (
                <tr key={item.imei}>
                  <td className="mono">{item.imei}</td>
                  <td><Badge tone="secondary">{item.handset_hint || 'Unknown model'}</Badge></td>
                  <td>{number(item.sessions)}</td>
                  <td>
                    {item.msisdns.length > 1 ? (
                      <div className="stack" style={{ gap: '4px' }}>
                        <Badge tone="danger"><AlertTriangle size={12} /> {item.msisdns.length} shared</Badge>
                        <div className="table-note">Used by: {item.msisdns.join(', ')}</div>
                      </div>
                    ) : (
                      <span>{item.msisdns[0] || '-'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}