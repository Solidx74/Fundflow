import { ctx } from "@/lib/auth";
import { processGrant } from "@/lib/process";
import { aiMode } from "@/lib/extract";
import { limited } from "@/lib/rate";
export const maxDuration = 30;
export async function POST(req) {
  const c = await ctx(req); if (!c) return Response.json({ error: "unauthorised" }, { status: 401 });
  if ((await limited(c.db, "intake:" + c.userId, 10, 60)) || (await limited(c.db, "org:" + c.orgId + ":ai-day", 200, 86400))) return Response.json({ error: "Rate limit reached. Try again later." }, { status: 429 });
  try {
    const { text } = await req.json(); if (!text || text.length > 20000) return Response.json({ error: "invalid input" }, { status: 400 });
    return Response.json({ ...(await processGrant({ db: c.db, orgId: c.orgId, userId: c.userId, text, via: aiMode() === "mock" ? "demo" : "manual" })), mode: aiMode() });
  } catch { return Response.json({ error: "Processing failed. Nothing was saved." }, { status: 500 }); }
}
