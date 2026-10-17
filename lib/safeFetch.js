import dns from "node:dns/promises";
export function isPrivateIp(ip) {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (v.includes(":")) return v === "::1" || v === "::" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
  const [a, b] = v.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
// Residual risk: DNS rebinding between lookup and connect. Pin IPs with a custom agent for stricter setups.
export async function safeFetchText(u, { max = 500000, timeout = 8000 } = {}) {
  let url = new URL(u);
  for (let i = 0; i < 4; i++) {
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("blocked url");
    if ((await dns.lookup(url.hostname, { all: true })).some((x) => isPrivateIp(x.address))) throw new Error("blocked address");
    const r = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeout) });
    const loc = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && loc) { url = new URL(loc, url); continue; }
    if (!/text\/(html|plain)/.test(r.headers.get("content-type") || "")) throw new Error("unsupported content");
    const rd = r.body.getReader(); const parts = []; let size = 0;
    for (;;) { const { done, value } = await rd.read(); if (done) break; size += value.length; if (size > max) { await rd.cancel(); break; } parts.push(value); }
    return Buffer.concat(parts).toString("utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ");
  }
  throw new Error("too many redirects");
}
