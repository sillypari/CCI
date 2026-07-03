const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || "Request failed");
  }
  return response.json();
}

export const api = {
  dashboard: () => request("/dashboard/stats"),
  uploads: () => request("/uploads"),
  sessions: (query = "") => request(`/sessions${query}`),
  extractions: () => request("/extractions"),
  packages: () => request("/packages"),
  auditLogs: () => request("/audit-logs"),
  platformRanges: () => request("/platform-ranges"),
  extract: (payload) =>
    request("/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  upload: (file) => {
    const body = new FormData();
    body.append("file", file);
    return request("/uploads", { method: "POST", body });
  }
};

