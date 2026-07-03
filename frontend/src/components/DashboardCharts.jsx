import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export function DashboardCharts({ data }) {
    if (!data || !data.stats) return null;

    const monthlyData = [
        { name: 'Jan', cases: 14 },
        { name: 'Feb', cases: 22 },
        { name: 'Mar', cases: 18 },
        { name: 'Apr', cases: 28 },
        { name: 'May', cases: 25 },
        { name: 'Jun', cases: data.stats.cases || 30 }
    ];

    const crimeData = [
        { name: 'Financial Fraud', value: 45 },
        { name: 'Extortion', value: 20 },
        { name: 'Drug Trafficking', value: 15 },
        { name: 'Cyber Terrorism', value: 10 },
        { name: 'Other', value: 10 }
    ];
    
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

    return (
        <div style={{ display: 'flex', gap: '20px', marginTop: '20px', width: '100%', height: '300px', gridColumn: 'span 12' }}>
            <div style={{ flex: 1, backgroundColor: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)' }}>Cases Month-wise</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="name" stroke="var(--text-muted)" />
                        <YAxis stroke="var(--text-muted)" />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                        <Bar dataKey="cases" fill="var(--color-brand)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            
            <div style={{ flex: 1, backgroundColor: 'var(--panel-bg)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: '16px', fontSize: '14px', color: 'var(--text-muted)' }}>Top Crime Types</h3>
                <ResponsiveContainer width="100%" height="90%">
                    <PieChart>
                        <Pie
                            data={crimeData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {crimeData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: 'var(--panel-bg)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
