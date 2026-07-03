import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function TimelineChart({ timelineData }) {
    if (!timelineData || timelineData.length === 0) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No timeline data available.</div>;
    }

    return (
        <div style={{ width: '100%', height: '300px', backgroundColor: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', gridColumn: 'span 12' }}>
            <h3 style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)' }}>Session Timeline (Actionable vs Relay)</h3>
            <ResponsiveContainer width="100%" height="85%">
                <AreaChart data={timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorP2p" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-success)" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="var(--color-success)" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorRelay" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-danger)" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="var(--color-danger)" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" stroke="var(--text-muted)" />
                    <YAxis stroke="var(--text-muted)" />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                    <Area type="monotone" dataKey="p2p" stroke="var(--color-success)" fillOpacity={1} fill="url(#colorP2p)" />
                    <Area type="monotone" dataKey="relay" stroke="var(--color-danger)" fillOpacity={1} fill="url(#colorRelay)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
