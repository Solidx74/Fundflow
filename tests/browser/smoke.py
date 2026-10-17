# Real Chromium against the built app. Supabase and /api are MOCKED via request interception (no live backend). Run: see README "Browser smoke test".
import json, re, sys, datetime, urllib.parse
from playwright.sync_api import sync_playwright, expect
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
SB = "https://fake.supabase.co"; today = datetime.date.today()
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "content-type": "application/json"}
ST = ["New", "Evaluating", "Shortlisted", "Drafting", "Submitted", "Won", "Lost", "Archived"]
OPPS = [{"id": f"00000000-0000-4000-8000-{i:012d}", "organization_id": "o1", "grant_title": f"Grant {i:02d}", "funder_name": f"Funder {i}", "status": ST[i % 8], "alignment_score": (i * 13) % 100,
  "deadline": None if i % 7 == 0 else str(today + datetime.timedelta(days=i * 3 - 10)), "eligibility_status": ["likely_eligible", "needs_review", "likely_ineligible"][i % 3], "assigned_to": "u1" if i % 4 == 0 else None,
  "created_at": f"2026-10-{(i % 28) + 1:02d}T10:00:00Z", "received_via": "whatsapp", "vault_version_at_analysis": 1 if i % 2 else 2, "summary": "s", "focus_areas": ["flood"], "funding_max": 5000, "currency": "USD",
  "eligibility_findings": [{"kind": "conflict", "field": "geography", "text": "Only Kenya", "evidence": "Open to Kenya"}], "source_evidence": {"confidence": 60}, "user_corrections": {}, "last_analyzed_at": "2026-10-01T00:00:00Z"} for i in range(1, 21)]
MEMBERS = [{"user_id": "u1", "organization_id": "o1", "display_name": "kareeb", "role": "owner", "email": "k@x.org"}, {"user_id": "u2", "organization_id": "o1", "display_name": "sara", "role": "member", "email": "s@x.org"}]
ORG = {"id": "o1", "name": "Test Org", "country": "Bangladesh", "onboarding_completed": True, "vault_version": 2, "focus_areas": ["flood"], "budget_currency": "USD"}
NOTIFS = [{"id": "n1", "type": "assigned", "title": "Assigned to you: Grant 01", "opportunity_id": OPPS[0]["id"], "read_at": None, "created_at": "2026-10-12T10:00:00Z"}, {"id": "n2", "type": "new_opportunity", "title": "New opportunity: Grant 02", "opportunity_id": OPPS[1]["id"], "read_at": "2026-10-12T11:00:00Z", "created_at": "2026-10-11T10:00:00Z"}]
TABLES = {"opportunities": OPPS, "organization_members": MEMBERS, "organizations": ORG, "notifications": NOTIFS}
SESSION = {"access_token": "a.b.c", "token_type": "bearer", "expires_in": 3600, "expires_at": 4102444800, "refresh_token": "r", "user": {"id": "u1", "email": "k@x.org", "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}, "created_at": "2026-01-01T00:00:00Z"}}
seen, errors, results = [], [], []
def handler(route, req):
    u = urllib.parse.urlparse(req.url); m = req.method
    if m == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    seen.append((m, u.path, req.post_data))
    if u.path.startswith("/auth/v1/token"): return route.fulfill(status=200, headers=CORS, body=json.dumps(SESSION))
    if u.path == "/auth/v1/user": return route.fulfill(status=200, headers=CORS, body=json.dumps(SESSION["user"]))
    if u.path.startswith("/auth/v1/"): return route.fulfill(status=200, headers=CORS, body="{}")
    t = u.path.split("/rest/v1/")[-1]
    if m != "GET": return route.fulfill(status=204, headers=CORS)
    d = TABLES.get(t, []); d = d if isinstance(d, list) else [d]
    for k, v in urllib.parse.parse_qsl(u.query):
        if v.startswith("eq."): d = [r for r in d if str(r.get(k)) == v[3:]]  # PostgREST eq filter
    one = "vnd.pgrst.object" in (req.headers.get("accept") or "")
    if one: return route.fulfill(status=200, headers=CORS, body=json.dumps(d[0])) if d else route.fulfill(status=406, headers=CORS, body="{}")
    return route.fulfill(status=200, headers=CORS, body=json.dumps(d))
def api(route, req):
    seen.append((req.method, "/api" + req.url.split("/api")[-1], req.post_data))
    if req.url.endswith("/api/intake"): return route.fulfill(status=401, content_type="application/json", body='{"error":"unauthorised"}')
    route.fulfill(status=200, content_type="application/json", body="{}")
def step(name, fn):
    try: fn(); results.append(("PASS", name))
    except Exception as e: results.append(("FAIL", name + " :: " + str(e).split("\n")[0][:160]))
    print(*results[-1], flush=True)
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={"width": 1280, "height": 900}); ctx.set_default_timeout(5000); ctx.route(SB + "/**", handler); ctx.route(re.compile(r".*/api/(intake|opportunity|reanalyse|retry|senders|invites|documents)"), api)
    page = ctx.new_page(); page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:150])); page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append("console: " + m.text[:150]))
    def landing(): page.goto(BASE + "/"); expect(page.get_by_role("heading", name="Every grant opportunity, organized.")).to_be_visible()
    step("landing renders", landing)
    def recovery():
        rp = ctx.new_page(); rp.goto(BASE + "/app#access_token=a.b.c&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery"); expect(rp.get_by_role("heading", name="Set a new password")).to_be_visible(timeout=6000); rp.close()
    step("password-recovery link shows the set-new-password screen", recovery)
    ctx.clear_cookies(); page.goto(BASE + "/"); page.evaluate("localStorage.clear()")
    def login():
        page.goto(BASE + "/app"); page.get_by_label("Email").fill("k@x.org"); page.get_by_label("Password").fill("pw"); page.get_by_role("button", name="Sign in").click()
        expect(page.get_by_role("heading", name="Test Org")).to_be_visible(timeout=8000)
    step("sign in reaches workspace", login)
    step("summary cards and stale banner", lambda: (expect(page.get_by_text("Eligibility concerns")).to_be_visible(), expect(page.get_by_text("analyses are stale")).to_be_visible()))
    def search():
        page.get_by_label("Search", exact=True).fill("Grant 05"); expect(page.locator("button.card", has_text="Grant 05")).to_have_count(1); expect(page.locator("button.card", has_text="Grant 06")).to_have_count(0)
        page.get_by_role("button", name="Clear filters").click(); expect(page.locator("button.card", has_text="Grant 06")).to_have_count(1)
    step("search and clear filters (kanban)", search)
    def lst():
        page.get_by_role("button", name="List").click(); expect(page.locator("tbody tr")).to_have_count(15); page.get_by_role("button", name="Next").click(); expect(page.locator("tbody tr")).to_have_count(5); page.get_by_role("button", name="Previous").click()
    step("list view and pagination", lst)
    def sort():
        page.get_by_label("Sort").select_option("score"); s = [int(x) for x in page.locator("tbody tr td:nth-child(5)").all_inner_texts()]; assert s == sorted(s, reverse=True), s
    step("list sort by alignment", sort)
    def unknown():
        page.get_by_label("Deadline filter").select_option("unknown"); n = page.locator("tbody tr").count(); assert n > 0
        assert all("Unknown" in t for t in page.locator("tbody tr td:nth-child(4)").all_inner_texts()); page.get_by_role("button", name="Clear filters").click()
    step("unknown-deadline filter", unknown)
    step("switch back to kanban", lambda: page.get_by_role("button", name="Kanban").click())
    def detail():
        page.locator("button.card", has_text="Grant 01").first.click(); expect(page.get_by_role("dialog", name="Opportunity details")).to_be_visible(); page.keyboard.press("Escape"); expect(page.get_by_role("dialog")).to_have_count(0, timeout=2000)
    step("detail dialog opens and Escape closes it", detail)
    def edit():
        page.locator("button.card", has_text="Grant 01").first.click(); page.get_by_text("Edit details and application tracking").click(); page.get_by_label("Title", exact=True).fill("Renamed"); page.get_by_role("button", name="Save changes").click(); page.wait_for_timeout(500)
        assert any(m == "PATCH" and "/api/opportunity" in u and "Renamed" in (d or "") for m, u, d in seen)
    step("edit form sends validated PATCH", edit)
    def close():
        page.get_by_role("button", name="Close", exact=True).click(); expect(page.get_by_role("dialog")).to_have_count(0)
    step("close button", close)
    def notif():
        page.get_by_role("button", name=re.compile("Notifications, 1 unread")).click(); expect(page.get_by_role("region", name="Notifications")).to_be_visible(); page.get_by_role("button", name="Mark all read").click(); page.wait_for_timeout(400)
        assert any(m == "PATCH" and "notifications" in u for m, u, d in seen); page.get_by_role("button", name="Close", exact=True).click()
    step("notifications bell and mark all read", notif)
    step("team page for owner", lambda: (page.get_by_role("button", name="Team").click(), expect(page.get_by_label("Role for sara")).to_be_visible(), expect(page.get_by_role("button", name="Remove")).to_have_count(1)))
    def expiry():
        page.get_by_role("button", name="Add opportunity").click(); page.get_by_label("Grant link or text").fill("some grant"); page.get_by_role("button", name="Analyse and add").click(); expect(page.get_by_role("button", name="Sign in")).to_be_visible(timeout=6000)
    step("401 from API signs the user out", expiry)
    ctx.close()
    # mobile, signed in via fresh login
    m = b.new_context(viewport={"width": 390, "height": 844}); m.set_default_timeout(5000); m.route(SB + "/**", handler); m.route(re.compile(r".*/api/.*"), api); mp = m.new_page()
    mp.goto(BASE + "/app"); mp.get_by_label("Email").fill("k@x.org"); mp.get_by_label("Password").fill("pw"); mp.get_by_role("button", name="Sign in").click(); mp.get_by_role("heading", name="Test Org").wait_for(timeout=8000)
    step("mobile: page itself has no horizontal overflow", lambda: (lambda w: (_ for _ in ()).throw(AssertionError(f"scrollWidth {w[0]} > {w[1]}")) if w[0] > w[1] + 1 else None)(mp.evaluate("[document.scrollingElement.scrollWidth, window.innerWidth]")))
    step("mobile: filter controls stay usable (search box at least 120px wide)", lambda: (lambda w: (_ for _ in ()).throw(AssertionError(f"search width {w}")) if w < 120 else None)(mp.get_by_label("Search", exact=True).bounding_box()["width"]))
    mp.screenshot(path="/tmp/mobile.png"); b.close()
print("console/page errors:", errors or "none")
sys.exit(1 if any(r[0] == "FAIL" for r in results) else 0)
