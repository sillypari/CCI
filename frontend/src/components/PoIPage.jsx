import React, { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import { api } from '../api/client.js';
import { Activity, Download, Loader2, MapPin, Phone, Smartphone, User } from 'lucide-react';
import { PanelHeader, Badge, EmptyState, number } from './common.jsx';

function formatSeconds(seconds = 0) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function PoIPage({ sessionCount = null }) {
  const { msisdn } = useParams();
  const [report, setReport] = useState(null);
  const [locations, setLocations] = useState([]);
  const [imeis, setImeis] = useState([]);
  const [whatsapp, setWhatsapp] = useState([]);
  const [loading, setLoading] = useState(sessionCount !== 0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (sessionCount === 0) {
      setReport(null);
      setLocations([]);
      setImeis([]);
      setWhatsapp([]);
      setError('');
      setLoading(false);
      return undefined;
    }

    let active = true;
    const fetchReport = async () => {
      setLoading(true);
      setError('');
      const query = `?msisdn=${encodeURIComponent(msisdn)}&limit=10`;
      try {
        const [poiData, locationData, imeiData, waData] = await Promise.all([
          api.poiReport(msisdn),
          api.locationSummary(query).catch(() => []),
          api.imeiFrequency(query).catch(() => []),
          api.whatsappBparty(msisdn).catch(() => [])
        ]);
        if (active) {
          setReport(poiData);
          setLocations(locationData);
          setImeis(imeiData);
          setWhatsapp(waData);
        }
      } catch (err) {
        if (active) {
          setReport(null);
          setLocations([]);
          setImeis([]);
          setWhatsapp([]);
          setError(err.message || 'Unable to load PoI dossier.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchReport();
    return () => { active = false; };
  }, [msisdn, sessionCount]);

  if (loading) return (
    <div className="page-loading-state">
      <Loader2 size={32} className="animate-spin" />
      <div>
        <strong>Compiling PoI intelligence dossier</strong>
        <span>Aggregating B-party endpoints, cell locations, handsets, and platform relays.</span>
      </div>
    </div>
  );

  if (error) return <EmptyState label={error} />;
  if (!report) return <EmptyState label="PoI profile not found" />;

  return (
    <div className="page-grid" style={{ animation: 'fade-in 0.2s ease-out' }}>
      <section className="panel span-12">
        <PanelHeader
          icon={User}
          title={`Person of Interest: ${msisdn}`}
          action={
            <div className="toolbar compact">
              <a href={api.poiPdfUrl(msisdn)} target="_blank" rel="noreferrer" className="button secondary">
                <Download size={16} /> <span>Export PDF brief</span>
              </a>
              <NavLink to="/sessions" className="button brand">View sessions</NavLink>
            </div>
          }
        />
        <div className="detail-stat-grid four">
          <div className="stat-card neutral"><span>Total sessions</span><strong>{number(report.total_sessions)}</strong></div>
          <div className="stat-card brand"><span>Top destinations</span><strong>{report.top_destinations.length}</strong></div>
          <div className="stat-card success"><span>Locations</span><strong>{locations.length}</strong></div>
          <div className="stat-card warning"><span>IMEIs</span><strong>{report.imeis.length || imeis.length}</strong></div>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={MapPin} title="Top Locations" action={<Badge tone="brand">{locations.length}</Badge>} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Location / Cell</th><th>Sessions</th><th>Day / Night</th></tr></thead>
            <tbody>
              {locations.length ? locations.map((loc) => (
                <tr key={loc.key}>
                  <td className="mono">{loc.label}</td>
                  <td>{number(loc.sessions)}</td>
                  <td>{number(loc.day_sessions)} / {number(loc.night_sessions)}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="table-empty">No location fields found for this PoI</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Smartphone} title="Associated IMEIs" action={<Badge tone="brand">{report.imeis.length || imeis.length}</Badge>} />
        <div className="table-wrap">
          <table>
            <thead><tr><th>IMEI</th><th>Handset</th><th>Sessions</th></tr></thead>
            <tbody>
              {imeis.length ? imeis.map((item) => (
                <tr key={item.imei}>
                  <td className="mono">{item.imei}</td>
                  <td>{item.handset_hint || 'Unknown model'}</td>
                  <td>{number(item.sessions)}</td>
                </tr>
              )) : report.imeis.length ? report.imeis.map((imei) => (
                <tr key={imei}>
                  <td className="mono">{imei}</td>
                  <td>Lookup unavailable</td>
                  <td>-</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="table-empty">No IMEI values for this PoI</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Activity} title="Top Applications" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Platform</th><th>Sessions</th><th>Duration</th></tr></thead>
            <tbody>
              {report.applications.length ? report.applications.slice(0, 10).map((app) => (
                <tr key={app.name}>
                  <td><Badge tone="brand">{app.name}</Badge></td>
                  <td>{number(app.sessions)}</td>
                  <td className="mono">{formatSeconds(app.duration ?? 0)}</td>
                </tr>
              )) : (
                <tr><td colSpan={3} className="table-empty">No applications detected</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Activity} title="Top B-party Destinations" />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Endpoint</th><th>Sessions</th><th>Class</th><th>Bytes</th></tr></thead>
            <tbody>
              {report.top_destinations.length ? report.top_destinations.map((item) => (
                <tr key={item.endpoint}>
                  <td><NavLink to={`/ip/${item.endpoint.split(':')[0]}`} className="text-link mono">{item.endpoint}</NavLink></td>
                  <td>{number(item.sessions)}</td>
                  <td><Badge tone={item.classification === 'p2p' ? 'success' : item.classification === 'relay' ? 'danger' : 'neutral'}>{item.classification}</Badge></td>
                  <td>{number(item.bytes_total)}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="table-empty">No destination endpoints found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel span-6">
        <PanelHeader icon={Phone} title="WhatsApp / Meta Relay Activity" action={<Badge tone="success">{whatsapp.length}</Badge>} />
        {whatsapp.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Target IP</th><th>Time</th><th>Class</th></tr></thead>
              <tbody>
                {whatsapp.slice(0, 10).map((session) => (
                  <tr key={session.id}>
                    <td><NavLink to={`/ip/${session.destination_ip}`} className="text-link mono">{session.destination_ip}</NavLink></td>
                    <td>{new Date(session.started_at).toLocaleString()}</td>
                    <td><Badge tone="success">{session.classification}</Badge></td>
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