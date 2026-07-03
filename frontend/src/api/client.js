const API_URL = import.meta.env.VITE_API_URL ?? "/api";

export const API_BASE_URL = API_URL;

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

function requestWithProgress(path, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startTime = Date.now();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const elapsedTime = (Date.now() - startTime) / 1000;
        const speed = elapsedTime > 0 ? event.loaded / elapsedTime : 0;
        onProgress({ percent, speed, loaded: event.loaded, total: event.total });
      }
    });

    xhr.addEventListener("load", () => {
      const contentType = xhr.getResponseHeader("content-type") ?? "";
      let payload;
      try {
        payload = contentType.includes("application/json") ? JSON.parse(xhr.responseText) : xhr.responseText;
      } catch (e) {
        payload = xhr.responseText;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
      } else {
        const detail = typeof payload === "object" && payload !== null ? payload.detail : payload;
        const message = Array.isArray(detail)
          ? detail.map((item) => item.msg ?? JSON.stringify(item)).join("; ")
          : detail || xhr.statusText || "Request failed";
        reject(new ApiError(message, { status: xhr.status, details: payload }));
      }
    });

    xhr.addEventListener("error", () => {
      reject(new ApiError("Backend is unreachable. Confirm the API service is running."));
    });

    xhr.open("POST", `${API_URL}${path}`);
    xhr.send(body);
  });
}

export const api = {
  dashboard: () => request("/dashboard/stats"),
  uploads: () => request("/uploads"),
  deleteUpload: (uploadId) => request(`/uploads/${encodeURIComponent(uploadId)}`, { method: "DELETE" }),
  deleteCase: (caseId) => request(`/cases/${encodeURIComponent(caseId)}`, { method: "DELETE" }),
  uploadJobs: () => request("/uploads/jobs"),
  sessions: (query = "") => request(`/sessions${query}`),
  graph: (query = "") => request(`/graph${query}`),
  patterns: () => request("/analytics/patterns"),
  timeline: (query = "") => request(`/analytics/timeline${query}`),
  applications: (query = "") => request(`/analytics/applications${query}`),
  extractions: () => request("/extractions"),
  packages: () => request("/packages"),
  cases: () => request("/cases"),
  importSpecs: () => request("/import-specs"),
  auditLogs: () => request("/audit-logs"),
  platformRanges: () => request("/platform-ranges"),
  poiReport: (msisdn) => request(`/reports/poi/${encodeURIComponent(msisdn)}`),
  ipReport: (ip) => request(`/reports/ip/${encodeURIComponent(ip)}`),
  commonApplications: (query = "") => request(`/reports/common-applications${query}`),
  imeiFrequency: (query = "") => request(`/reports/imei-frequency${query}`),
  locationSummary: (query = "") => request(`/reports/location-summary${query}`),
  sessionCsvUrl: (query = "") => `${API_URL}/reports/sessions.csv${query}`,
  graphJsonUrl: (query = "") => `${API_URL}/graph/export.json${query}`,
  graphGraphmlUrl: (query = "") => `${API_URL}/graph/export.graphml${query}`,
  poiCsvUrl: (msisdn) => `${API_URL}/reports/poi/${encodeURIComponent(msisdn)}.csv`,
  poiHtmlUrl: (msisdn) => `${API_URL}/reports/poi/${encodeURIComponent(msisdn)}.html`,
  ipCsvUrl: (ip) => `${API_URL}/reports/ip/${encodeURIComponent(ip)}.csv`,
  ipHtmlUrl: (ip) => `${API_URL}/reports/ip/${encodeURIComponent(ip)}.html`,
  poiPdfUrl: (msisdn) => `${API_URL}/reports/poi/${encodeURIComponent(msisdn)}.pdf`,
  sessionsXlsxUrl: (query = "") => `${API_URL}/reports/sessions.xlsx${query}`,
  whatsappBparty: (msisdn) => request(`/reports/whatsapp/${encodeURIComponent(msisdn)}`),
  commonWhatsapp: (query = "") => request(`/reports/common-whatsapp${query}`),
  persistenceStatus: () => request("/persistence/status"),
  createPersistenceSnapshot: () => request("/persistence/snapshot", { method: "POST" }),
  createCase: (payload) =>
    request("/cases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  createImportSpec: (payload) =>
    request("/import-specs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  extract: (payload) =>
    request("/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
  upload: (file, options = {}) => {
    const body = new FormData();
    body.append("file", file);
    if (options.caseId) body.append("case_id", options.caseId);
    if (options.importSpecId) body.append("import_spec_id", options.importSpecId);
    if (options.onProgress) {
      return requestWithProgress("/uploads", body, options.onProgress);
    }
    return request("/uploads", { method: "POST", body });
  },
  validateUpload: (file, options = {}) => {
    const body = new FormData();
    body.append("file", file);
    if (options.importSpecId) body.append("import_spec_id", options.importSpecId);
    if (options.onProgress) {
      return requestWithProgress("/uploads/validate", body, options.onProgress);
    }
    return request("/uploads/validate", { method: "POST", body });
  },
  autoSuggestMapping: (file) => {
    const body = new FormData();
    body.append("file", file);
    return request("/uploads/auto-suggest-mapping", { method: "POST", body });
  }
};