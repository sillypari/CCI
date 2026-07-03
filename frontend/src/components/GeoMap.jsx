import React, { useMemo, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { AlertTriangle, Check, ChevronDown, Crosshair, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function GeofenceHandler({ enabled, onGeofenceUpdate }) {
  useMapEvents({
    click(event) {
      if (enabled) onGeofenceUpdate([event.latlng.lat, event.latlng.lng]);
    }
  });
  return null;
}

function MapSelect({ ariaLabel, value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value) ?? options[0];

  return (
    <div
      className={`select-control geo-select ${open ? 'is-open' : ''}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
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
                className={`select-control__option ${active ? 'is-selected' : ''}`}
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

export function GeoMap({ locationData = [] }) {
  const [geofenceMode, setGeofenceMode] = useState(false);
  const [geofenceCenter, setGeofenceCenter] = useState(null);
  const [geofenceRadius, setGeofenceRadius] = useState(2000);
  const [mapLimit, setMapLimit] = useState(250);
  const locations = Array.isArray(locationData) ? locationData : [];

  const validLocations = useMemo(() => locations
    .map((loc) => ({
      ...loc,
      latitude: Number(loc.latitude),
      longitude: Number(loc.longitude)
    }))
    .filter((loc) => Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)), [locations]);

  const sortedLocations = useMemo(() => [...validLocations].sort((a, b) => (b.sessions || 0) - (a.sessions || 0)), [validLocations]);

  const displayedLocations = useMemo(() => {
    return mapLimit === 'all' ? sortedLocations : sortedLocations.slice(0, mapLimit);
  }, [mapLimit, sortedLocations]);

  const center = displayedLocations.length
    ? [displayedLocations[0].latitude, displayedLocations[0].longitude]
    : [26.2183, 78.1828];

  const pointsInside = useMemo(() => {
    if (!geofenceCenter) return displayedLocations;
    return displayedLocations.filter((loc) => getDistance(loc.latitude, loc.longitude, geofenceCenter[0], geofenceCenter[1]) <= geofenceRadius);
  }, [displayedLocations, geofenceCenter, geofenceRadius]);

  const radiusOptions = [
    { value: 500, label: '500 m' },
    { value: 1000, label: '1 km' },
    { value: 2000, label: '2 km' },
    { value: 5000, label: '5 km' },
    { value: 10000, label: '10 km' }
  ];
  const limitOptions = [
    { value: 100, label: 'Top 100 hotspots' },
    { value: 250, label: 'Top 250 hotspots' },
    { value: 500, label: 'Top 500 hotspots' },
    { value: 1000, label: 'Top 1000 hotspots' },
    { value: 'all', label: `All (${validLocations.length})` }
  ];

  if (!locations.length) {
    return <div className="geo-map-empty"><MapPin size={18} /><span>No location data available to map.</span></div>;
  }

  if (!validLocations.length) {
    return <div className="geo-map-empty"><MapPin size={18} /><span>Locations found, but no latitude/longitude coordinates are available.</span></div>;
  }

  return (
    <div className="geo-map-shell">
      <div className="geo-map-toolbar">
        <label className="geo-toggle">
          <input
            type="checkbox"
            checked={geofenceMode}
            onChange={(event) => {
              setGeofenceMode(event.target.checked);
              if (!event.target.checked) setGeofenceCenter(null);
            }}
          />
          <Crosshair size={15} />
          <strong>Geofence</strong>
        </label>
        {geofenceMode ? <MapSelect ariaLabel="Geofence radius" value={geofenceRadius} onChange={setGeofenceRadius} options={radiusOptions} /> : null}
        <div className="geo-map-divider" />
        <MapSelect ariaLabel="Hotspot display limit" value={mapLimit} onChange={setMapLimit} options={limitOptions} />
        {geofenceMode && geofenceCenter ? (
          <span className="geo-map-note"><MapPin size={13} />{pointsInside.length} in zone</span>
        ) : null}
        {geofenceMode && !geofenceCenter ? <span className="geo-map-note muted">Click the map to drop a zone.</span> : null}
        {mapLimit === 'all' && validLocations.length > 500 ? (
          <span className="geo-map-note danger"><AlertTriangle size={13} />Rendering {validLocations.length} markers may be slow.</span>
        ) : null}
      </div>
      <MapContainer key={`${center[0]}-${center[1]}-${displayedLocations.length}`} center={center} zoom={11} className="geo-map-canvas">
        <GeofenceHandler enabled={geofenceMode} onGeofenceUpdate={setGeofenceCenter} />
        {geofenceCenter ? (
          <Circle center={geofenceCenter} radius={geofenceRadius} pathOptions={{ color: '#b9b437', fillColor: '#b9b437', fillOpacity: 0.18, weight: 2 }} />
        ) : null}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        {displayedLocations.map((loc, index) => {
          const isDayHeavy = (loc.day_sessions ?? 0) > (loc.night_sessions ?? 0);
          const color = isDayHeavy ? '#b9b437' : '#0a9aa8';
          const outsideZone = geofenceCenter && !pointsInside.includes(loc);
          return (
            <CircleMarker
              key={`${loc.key ?? loc.label ?? 'loc'}-${index}`}
              center={[loc.latitude, loc.longitude]}
              pathOptions={{ color, fillColor: color, fillOpacity: outsideZone ? 0.08 : 0.58, opacity: outsideZone ? 0.18 : 0.95 }}
              radius={Math.max(7, Math.min(24, (loc.sessions || 1) * 1.8))}
            >
              <Popup>
                <div className="geo-popup">
                  <strong>{loc.label}</strong><br />
                  Total sessions: {loc.sessions}<br />
                  Day: {loc.day_sessions} | Night: {loc.night_sessions}<br />
                  Unique MSISDNs: {(loc.msisdns ?? []).length}
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}