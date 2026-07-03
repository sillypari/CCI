import React from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, Circle, useMapEvents } from 'react-leaflet';
import { useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix leaflet icon issue in react-leaflet
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});


function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function GeofenceHandler({ enabled, onGeofenceUpdate }) {
    useMapEvents({
        click(e) {
            if (enabled) onGeofenceUpdate([e.latlng.lat, e.latlng.lng]);
        }
    });
    return null;
}

export function GeoMap({ locationData }) {
    if (!locationData || locationData.length === 0) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No location data available to map.</div>;
    }

    // Filter out locations without coordinates
    const validLocations = locationData.filter(loc => loc.latitude && loc.longitude);
    const [geofenceMode, setGeofenceMode] = useState(false);
    const [geofenceCenter, setGeofenceCenter] = useState(null);
    const [geofenceRadius, setGeofenceRadius] = useState(2000); // 2km default
    
    if (validLocations.length === 0) {
        return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Locations found, but no geographic coordinates (Lat/Lng) available.</div>;
    }

    // Default center to Gwalior or first location
    const center = validLocations.length > 0 
        ? [validLocations[0].latitude, validLocations[0].longitude] 
        : [26.2183, 78.1828];

    // Calculate locations inside geofence
    const pointsInside = geofenceCenter 
        ? validLocations.filter(loc => getDistance(loc.latitude, loc.longitude, geofenceCenter[0], geofenceCenter[1]) <= geofenceRadius)
        : validLocations;

    return (
        <div style={{ width: '100%', height: '400px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', marginTop: '20px', gridColumn: 'span 12', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, background: 'var(--panel-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.5)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={geofenceMode} onChange={(e) => { setGeofenceMode(e.target.checked); if (!e.target.checked) setGeofenceCenter(null); }} />
                        <strong>Geofence Mode</strong>
                    </label>
                    {geofenceMode && (
                        <select value={geofenceRadius} onChange={(e) => setGeofenceRadius(Number(e.target.value))} style={{ background: 'var(--bg-main)', color: 'white', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 4px' }}>
                            <option value={500}>500m Radius</option>
                            <option value={1000}>1km Radius</option>
                            <option value={2000}>2km Radius</option>
                            <option value={5000}>5km Radius</option>
                            <option value={10000}>10km Radius</option>
                        </select>
                    )}
                </div>
                {geofenceMode && geofenceCenter && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--color-warning)' }}>
                        <MapPin size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }}/>
                        Captured {pointsInside.length} locations in zone.
                    </div>
                )}
                {geofenceMode && !geofenceCenter && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Click anywhere on map to drop zone.</div>
                )}
            </div>
            <MapContainer center={center} zoom={11} style={{ height: '100%', width: '100%' }}>
                <GeofenceHandler enabled={geofenceMode} onGeofenceUpdate={setGeofenceCenter} />
                {geofenceCenter && (
                    <Circle center={geofenceCenter} radius={geofenceRadius} pathOptions={{ color: 'var(--color-warning)', fillColor: 'var(--color-warning)', fillOpacity: 0.2, weight: 2 }} />
                )}
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                {validLocations.map((loc, idx) => {
                    const isDayHeavy = loc.day_sessions > loc.night_sessions;
                    const color = isDayHeavy ? '#FFBB28' : '#0088FE'; // Yellow for day, Blue for night
                    
                    return (
                        <CircleMarker 
                            key={idx} 
                            center={[loc.latitude, loc.longitude]}
                            pathOptions={{ color: color, fillColor: color, fillOpacity: 0.6, opacity: (geofenceCenter && !pointsInside.includes(loc)) ? 0.1 : 1 }}
                            radius={Math.max(8, Math.min(25, loc.sessions * 2))} // Scale by session count
                        >
                            <Popup>
                                <div style={{ color: '#000' }}>
                                    <strong>{loc.label}</strong><br />
                                    Total Sessions: {loc.sessions}<br />
                                    Day: {loc.day_sessions} | Night: {loc.night_sessions}<br />
                                    Unique MSISDNs: {loc.msisdns.length}
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}
            </MapContainer>
        </div>
    );
}
