import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { api } from '../api/client.js';
import { Smartphone, Activity, Download, Loader2 } from 'lucide-react';
import { PanelHeader, Badge, EmptyState, number } from './common.jsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function ImeiPage() {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const fetchReport = async () => {
      setLoading(true);
      try {
        const data = await api.imeiFrequency();
        if (active) setReport(data);
      } catch (err) {
        console.error("IMEI load error:", err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh', gap: '16px' }}>
      <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-brand)' }} />
      <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--color-text-secondary)' }}>Analyzing handset signatures & IMEI logs...</div>
    </div>
  );
  if (!report.length) return <EmptyState label="No IMEI data available in evidence store" />;

  const chartData = report.slice(0, 10).map(r => ({
    name: r.handset_hint || "Unknown Model",
    imei: r.imei,
    sessions: r.sessions,
    users: r.msisdns.length
  }));

  return (
    <div className="page-grid" style={{ animation: "fade-in 0.2s ease-out" }}>
      <section className="panel span-12">
        <PanelHeader 
          icon={Smartphone} 
          title="Handset & IMEI Intelligence" 
        />
        
        <div style={{ width: '100%', height: '300px', marginTop: '20px' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)' }}>Top 10 Most Active Handsets</h3>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--text-muted)" />
              <YAxis yAxisId="left" orientation="left" stroke="var(--color-brand)" />
              <YAxis yAxisId="right" orientation="right" stroke="var(--color-warning)" />
              <Tooltip contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border)' }} />
              <Bar yAxisId="left" dataKey="sessions" name="Total Sessions" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
              <Bar yAxisId="right" dataKey="users" name="Unique MSISDNs" fill="var(--color-warning)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel span-12">
        <PanelHeader icon={Activity} title="Global IMEI Frequency" action={<Badge tone="brand">{report.length} unique IMEIs</Badge>} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>IMEI</th><th>Handset Model</th><th>Sessions</th><th>Unique Suspects</th></tr></thead>
            <tbody>
              {report.map((item, i) => (
                <tr key={i}>
                  <td className="mono">{item.imei}</td>
                  <td><Badge tone="secondary">{item.handset_hint || "Unknown Model"}</Badge></td>
                  <td>{number(item.sessions)}</td>
                  <td>
                    {item.msisdns.length > 1 ? (
                      <div className="stack" style={{ gap: "4px" }}>
                        <Badge tone="danger">{item.msisdns.length} (Shared Handset!)</Badge>
                        <div style={{ fontSize: "11px", color: "var(--color-danger)" }}>
                          Used by: {item.msisdns.join(", ")}
                        </div>
                      </div>
                    ) : (
                      <span>1 ({item.msisdns[0] || "-"})</span>
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
