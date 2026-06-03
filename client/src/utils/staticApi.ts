/**
 * Static API interceptor.
 *
 * In demo / Vercel deployment mode there is no live FastAPI backend. This module
 * monkey-patches window.fetch so any request to /api/* is served from a static
 * JSON file in /public/data/.
 *
 * For endpoints with no matching static file (POST mutations, exports, etc.)
 * we return a benign empty payload so the UI can render without throwing.
 */

const DATA_BASE = "/data";

type StaticEntry = { file: string; transform?: (data: any, url: URL) => any };

const ROUTES: Array<{ match: (url: URL) => boolean; entry: StaticEntry }> = [
  // Properties (bbox / cluster / list)
  {
    match: (u) =>
      u.pathname === "/api/properties/bbox" ||
      u.pathname === "/api/properties/cluster" ||
      u.pathname === "/api/properties" ||
      u.pathname === "/api/properties/",
    entry: { file: "properties.json" },
  },
  // Individual property: /api/properties/{id}
  {
    match: (u) => /^\/api\/properties\/[^/]+$/.test(u.pathname),
    entry: {
      file: "properties.json",
      transform: (data, url) => {
        const id = decodeURIComponent(url.pathname.split("/").pop() || "");
        const feature = (data.features || []).find(
          (f: any) => String(f.id) === id || String(f.properties?.id) === id
        );
        if (!feature) return null;
        return { ...feature.properties, latitude: feature.geometry.coordinates[1], longitude: feature.geometry.coordinates[0] };
      },
    },
  },
  // Property operations / detail
  {
    match: (u) => /^\/api\/analytics\/property-operations\//.test(u.pathname),
    entry: { file: "empty-object.json" },
  },
  // Analytics
  { match: (u) => u.pathname === "/api/analytics/overview", entry: { file: "analytics-overview.json" } },
  { match: (u) => u.pathname === "/api/analytics/epc-distribution", entry: { file: "epc-distribution.json" } },
  { match: (u) => u.pathname === "/api/analytics/flood-summary", entry: { file: "flood-summary.json" } },
  { match: (u) => u.pathname === "/api/analytics/region-summary", entry: { file: "region-summary.json" } },
  { match: (u) => u.pathname === "/api/analytics/crime-summary", entry: { file: "crime-summary.json" } },
  { match: (u) => u.pathname === "/api/analytics/geographic-summary", entry: { file: "geographic-summary.json" } },
  { match: (u) => u.pathname === "/api/analytics/retrofit-priorities", entry: { file: "retrofit-priorities.json" } },
  // Flood Intelligence dashboard
  { match: (u) => u.pathname === "/api/analytics/flood-map-data", entry: { file: "flood-map-data.json" } },
  { match: (u) => u.pathname === "/api/analytics/flood-forecast", entry: { file: "flood-forecast.json" } },
  { match: (u) => u.pathname === "/api/analytics/wms-layer-names", entry: { file: "wms-layer-names.json" } },
  // Other analytics endpoints — return null payload so UI degrades gracefully
  {
    match: (u) => u.pathname.startsWith("/api/analytics/"),
    entry: { file: "empty-object.json" },
  },
  // Operational
  { match: (u) => u.pathname === "/api/awaab/kanban", entry: { file: "awaab-kanban.json" } },
  { match: (u) => u.pathname === "/api/tsm/measures", entry: { file: "tsm-measures.json" } },
  { match: (u) => u.pathname === "/api/compliance/summary", entry: { file: "compliance-summary.json" } },
  { match: (u) => u.pathname === "/api/compliance/breaches", entry: { file: "empty-list.json" } },
  { match: (u) => u.pathname === "/api/damp-mould/heatmap", entry: { file: "damp-mould-heatmap.json" } },
  { match: (u) => u.pathname === "/api/damp-mould/top-at-risk", entry: { file: "empty-list.json" } },
  { match: (u) => u.pathname.startsWith("/api/damp-mould/"), entry: { file: "empty-object.json" } },
  // Favourites + search + everything else: empty
  { match: (u) => u.pathname.startsWith("/api/favourites"), entry: { file: "empty-list.json" } },
  { match: (u) => u.pathname.startsWith("/api/search"), entry: { file: "empty-list.json" } },
  { match: (u) => u.pathname.startsWith("/api/data-hub/"), entry: { file: "empty-object.json" } },
  { match: (u) => u.pathname.startsWith("/api/scenarios/"), entry: { file: "empty-object.json" } },
  { match: (u) => u.pathname.startsWith("/api/exports/"), entry: { file: "empty-object.json" } },
  { match: (u) => u.pathname.startsWith("/api/awaab/"), entry: { file: "empty-object.json" } },
  { match: (u) => u.pathname.startsWith("/api/tsm/"), entry: { file: "empty-object.json" } },
  { match: (u) => u.pathname.startsWith("/api/compliance/"), entry: { file: "empty-object.json" } },
  // Final catch-all for any /api/*
  { match: (u) => u.pathname.startsWith("/api/"), entry: { file: "empty-object.json" } },
];

function makeJsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function resolveStaticPayload(url: URL): Promise<any> {
  const route = ROUTES.find((r) => r.match(url));
  if (!route) return { status: "success", data: null };
  try {
    // Bypass our own interceptor: fetch the static file directly
    const res = await ORIGINAL_FETCH(`${DATA_BASE}/${route.entry.file}`);
    if (!res.ok) return { status: "success", data: null };
    let data = await res.json();
    if (route.entry.transform) {
      data = route.entry.transform(data, url);
    }
    return data;
  } catch (err) {
    console.warn("[staticApi] failed to load", route.entry.file, err);
    return { status: "success", data: null };
  }
}

let ORIGINAL_FETCH: typeof window.fetch =
  typeof window !== "undefined" ? window.fetch.bind(window) : (undefined as any);

function normaliseApiUrl(raw: string): URL | null {
  try {
    const u = new URL(raw, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    // Treat any pathname containing /api/ as in-scope, even if hostname is localhost:8000
    if (!u.pathname.startsWith("/api/")) return null;
    return u;
  } catch {
    return null;
  }
}

export function installStaticApi(): void {
  if (typeof window === "undefined") return;
  ORIGINAL_FETCH = window.fetch.bind(window);

  // --- Patch window.fetch ---
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let urlString: string;
    if (typeof input === "string") urlString = input;
    else if (input instanceof URL) urlString = input.toString();
    else urlString = (input as Request).url;

    const apiUrl = normaliseApiUrl(urlString);
    if (!apiUrl) return ORIGINAL_FETCH(input as any, init);

    const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? (input as Request).method : "GET") || "GET").toUpperCase();
    if (method !== "GET") return makeJsonResponse({ status: "success", data: {} });

    const data = await resolveStaticPayload(apiUrl);
    return makeJsonResponse(data);
  }) as typeof window.fetch;

  // --- Patch axios (if loaded) ---
  // We attach a request interceptor that redirects /api/* to a data URL we
  // can serve in the response interceptor.
  (async () => {
    try {
      const axiosMod = await import("axios");
      const axios = axiosMod.default;

      axios.interceptors.request.use((config) => {
        const raw = (config.baseURL || "") + (config.url || "");
        const apiUrl = normaliseApiUrl(raw);
        if (apiUrl) {
          (config as any).__staticApi = apiUrl;
          // Short-circuit the actual network call by setting a dummy adapter
          (config as any).adapter = async () => {
            const method = (config.method || "GET").toUpperCase();
            if (method !== "GET") {
              return {
                data: { status: "success", data: {} },
                status: 200,
                statusText: "OK",
                headers: {},
                config,
                request: {},
              };
            }
            const data = await resolveStaticPayload(apiUrl);
            return {
              data,
              status: 200,
              statusText: "OK",
              headers: { "content-type": "application/json" },
              config,
              request: {},
            };
          };
        }
        return config;
      });
    } catch {
      // axios not present — fetch patch is sufficient
    }
  })();
}
