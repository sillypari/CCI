const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

export class ApiError extends Error {
  constructor(message, { status = 0, details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, options);
  } catch (error) {
    throw new ApiError("Backend is unreachable. Confirm the API service is running.", { details: error.message });
  }

  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : await response.text().catch(() => "");

  if (!response.ok) {
    const detail = typeof payload === "object" && payload !== null ? payload.detail : payload;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg ?? JSON.stringify(item)).join("; ")
      : detail || response.statusText || "Request failed";
    throw new ApiError(message, { status: response.status, details: payload });
  }

  return payload;
}

export const api = {
  dashboard: () => request("/dashboard/stats"),
  uploads: () => request("/uploads"),
  sessions: (query = "") => request(`/sessions${query}`),
  graph: (query = "") => request(`/graph${query}`),
  patterns: () => request("/analytics/patterns"),
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