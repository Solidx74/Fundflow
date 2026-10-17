export const dynamic = "force-dynamic"; // never run at build time
import { ctx } from "@/lib/auth";
// Booleans only. Never returns secret values. Lets the UI show live versus demo/unconfigured modes honestly.
export async function GET(req) {
  const c = await ctx(req); if (!c) return Response.json({ error: "unauthorised" }, { status: 401 });
  return Response.json({ ai: process.env.OPENAI_API_KEY ? "live" : "demo", whatsapp: process.env.TWILIO_AUTH_TOKEN && process.env.APP_BASE_URL ? "configured" : "unconfigured", reminders: process.env.CRON_SECRET ? "configured" : "unconfigured" });
}
