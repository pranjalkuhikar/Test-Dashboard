export const NODE_API = process.env.NODE_API_URL || "http://localhost:4000";
export const NEXT_URL = process.env.NEXT_URL || "http://localhost:3000";
export async function api(base, path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(base + path, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  let json = null; try { json = await res.json(); } catch {}
  return { status: res.status, json, headers: res.headers };
}
