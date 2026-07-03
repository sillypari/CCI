import React from 'react';
import { X } from 'lucide-react';

export function PanelHeader({ icon: Icon, title, action = null }) {
  return (
    <div className="panel-header">
      <div>
        {Icon ? <Icon size={18} /> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function EmptyState({ label }) {
  return <div className="empty-state">{label}</div>;
}

export function number(value) {
  return new Intl.NumberFormat("en-IN").format(value ?? 0);
}

export function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}>
      <div className="panel" style={{ width: "90%", maxWidth: "700px", maxHeight: "85vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <PanelHeader title={title} action={<button type="button" className="icon-button" onClick={onClose}><X size={20}/></button>} />
        <div style={{ padding: "16px", overflow: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
