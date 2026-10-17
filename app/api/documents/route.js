export const dynamic = "force-dynamic"; // never run at build time
import { randomUUID } from "node:crypto";
import { ctx } from "@/lib/auth";
import { limited } from "@/lib/rate";
const MAX = 4 * 1024 * 1024, BUCKET = "org-docs", CATS = ["registration", "profile", "annual_report", "impact_report", "bio", "project_summary", "template", "other"];
function sniff(buf, name) { // never trust extension or client MIME
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" && buf.subarray(0, 5).toString("latin1") === "%PDF-") return ["pdf", "application/pdf"];
  if (ext === "docx" && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4 && buf.includes("[Content_Types].xml") && buf.includes("word/")) return ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (ext === "txt" && !buf.subarray(0, 4096).includes(0)) { try { new TextDecoder("utf-8", { fatal: true }).decode(buf); return ["txt", "text/plain"]; } catch {} }
  return null;
}
export async function POST(req) {
  const c = await ctx(req); if (!c) return Response.json({ error: "unauthorised" }, { status: 401 });
  if (await limited(c.db, "doc:" + c.userId, 20, 60)) return Response.json({ error: "rate limited" }, { status: 429 });
  const len = +(req.headers.get("content-length") || 0); if (len > MAX + 65536) return Response.json({ error: "File too large" }, { status: 413 }); // reject before buffering. Chunked bodies without a length are bounded only by the host limit.
  const f = await req.formData().catch(() => null), file = f?.get("file"); if (!file || typeof file === "string") return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX || file.size === 0) return Response.json({ error: "File must be 1 byte to 4 MB" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer()), t = sniff(buf, file.name || ""); if (!t) return Response.json({ error: "Only valid PDF, DOCX or TXT files are accepted" }, { status: 400 });
  const cat = CATS.includes(f.get("category")) ? f.get("category") : "other", path = `${c.orgId}/${randomUUID()}.${t[0]}`;
  const up = await c.db.storage.from(BUCKET).upload(path, buf, { contentType: t[1], upsert: false }); if (up.error) return Response.json({ error: "Upload failed" }, { status: 500 });
  const { data, error } = await c.db.from("org_documents").insert({ organization_id: c.orgId, filename: String(file.name).slice(0, 200), storage_path: path, content_type: t[1], size_bytes: buf.length, category: cat, description: String(f.get("description") || "").slice(0, 500) || null, uploaded_by: c.userId }).select().single();
  if (error) { await c.db.storage.from(BUCKET).remove([path]); return Response.json({ error: "Could not save metadata" }, { status: 500 }); }
  return Response.json(data);
}
export async function GET(req) {
  const c = await ctx(req); if (!c) return Response.json({ error: "unauthorised" }, { status: 401 });
  const { data: d } = await c.db.from("org_documents").select("storage_path,filename").eq("id", new URL(req.url).searchParams.get("id")).eq("organization_id", c.orgId).maybeSingle(); if (!d) return Response.json({ error: "Not found" }, { status: 404 });
  const { data } = await c.db.storage.from(BUCKET).createSignedUrl(d.storage_path, 60, { download: d.filename.replace(/[^\w.\- ]/g, "_").slice(0, 100) }); return data ? Response.json({ url: data.signedUrl }) : Response.json({ error: "Unavailable" }, { status: 500 });
}
export async function DELETE(req) {
  const c = await ctx(req); if (!c || c.role === "member") return Response.json({ error: "forbidden" }, { status: 403 });
  const { data: d } = await c.db.from("org_documents").select("id,storage_path").eq("id", new URL(req.url).searchParams.get("id")).eq("organization_id", c.orgId).maybeSingle(); if (!d) return Response.json({ error: "Not found" }, { status: 404 });
  const r = await c.db.storage.from(BUCKET).remove([d.storage_path]); if (r.error) return Response.json({ error: "Could not delete the stored file. Nothing was removed." }, { status: 500 }); // keep metadata so the file is never untracked
  const { error } = await c.db.from("org_documents").delete().eq("id", d.id); return error ? Response.json({ error: "File removed but record could not be deleted. Retry." }, { status: 500 }) : Response.json({ ok: true });
}
