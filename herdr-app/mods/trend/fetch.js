// What's trending now (last30days --discover, global): no model is called, so no tokens. Run every hour as
// `node fetch.js <last30days.py>` by launchd (macOS) or Task Scheduler (Windows) (docs/trend.md); the trend panel
// reads what it writes to <Herdr home>/trend/:
//   trends.json   last30days' discovery JSON (schema 1.x), replaced only by a run that succeeded
//   status.json   { started, finished, ok, error }: the panel's ring and 「上次更新」
//   last.log      the last run's own output
// <last30days.py>: the skill's scripts/last30days.py in your kit source.
// A proxy goes in <Herdr home>/trend/proxy, one line http://user:pass@host:port (keep it private: chmod 600 on macOS):
// last30days' requests go through it (not Reddit's page below: a proxy didn't get past Reddit's 403 either).
// PYTHON: the Python to run it with (default python3; on Windows python). CHROME: the Chrome or Edge for Reddit's page.
// 每小時抓一次全網熱門（不叫模型、不花 token）。代理寫在 trend/proxy 一行，只給 last30days 用。
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const out = path.join(process.env.HERDR_APP_HOME || path.join(os.homedir(), ".config", "herdr-app"), "trend");
fs.mkdirSync(out, { recursive: true });
const put = (name, text) => { fs.writeFileSync(path.join(out, `${name}.tmp`), text); fs.renameSync(path.join(out, `${name}.tmp`), path.join(out, name)); };
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const started = now();
put("status.json", JSON.stringify({ started, finished: null, ok: null, error: null }) + "\n");

const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1" };   // no __pycache__ in the kit source (kit check: text files only)
let proxy = "";
try { proxy = fs.readFileSync(path.join(out, "proxy"), "utf8").split("\n")[0].trim(); } catch {}
if (proxy) Object.assign(env, { HTTPS_PROXY: proxy, HTTP_PROXY: proxy, NO_PROXY: "localhost,127.0.0.1" });

let error = null;
const l30 = process.argv[2];
if (!l30 || !fs.existsSync(l30)) error = `找不到 last30days.py：排程給的路徑是「${l30 ?? ""}」（docs/trend.md「安裝」）`;
else {
  const tmp = path.join(out, "trends.json.tmp");
  // --no-browser-cookies: never read the browser's logins / 不讀瀏覽器的登入資料
  const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
  const r = spawnSync(python, [l30, "--discover", "--emit=json", "--no-browser-cookies", "--output", tmp],
    { env, encoding: "utf8", maxBuffer: 64 << 20, timeout: 20 * 60000, windowsHide: true });
  fs.writeFileSync(path.join(out, "last.log"), `${r.stderr ?? ""}${r.error ? `\n${r.error.message}` : ""}`);
  try {
    if (r.status !== 0) throw new Error(r.error?.message || (r.stderr ?? "").trim().split("\n").pop() || `exit ${r.status}`);
    if (JSON.parse(fs.readFileSync(tmp, "utf8")).kind !== "discovery") throw new Error("輸出不是 discovery JSON");
    fs.renameSync(tmp, path.join(out, "trends.json"));
  } catch (e) {
    error = String(e.message ?? e).slice(0, 300) || "失敗";
    fs.rmSync(tmp, { force: true });
  }
}

// last30days names at most 10 topics (and enriches 6): the panel fills up to 20 with each site's own front page,
// ranked by that site. feeds.json: { at, hn: [...], reddit: [...], digg: [...], errors: {...}, redditAt, redditBlockedAt,
// redditBlocks }. Free, no keys, no model.
// 不夠 20 題時，面板用各站自己的熱門（HN 首頁、Reddit r/all 今日、Digg 排行）補上。

// Reddit answers scripts (its .json, curl, Python, a "HeadlessChrome" browser) with 403 "blocked by network
// security", even through a residential proxy; the installed Chrome or Edge, headless but saying it is a plain Chrome,
// gets the page (tried 2026-11-16). A block is likely by IP, and every device in the house shares it, so gently (a
// production crawler's advice): no login, one profile of its own kept between runs (not a brand-new visitor each time), its
// own Chrome version in the user agent, zh-TW first, one page every 2 to 3 hours (a random pick, not on the hour);
// blocked: no tries for 6 hours, then 12, then 24 (one try each time), and the panel says so.
// Reddit 擋腳本（連住宅代理也擋）；用本機的 Chrome／Edge 無頭開一頁（UA 不帶 Headless）就拿得到。全家共用 IP，所以保守：
// 2 到 3 小時一次、固定的專用設定檔；被擋停 6、12、24 小時，面板會說。
const REDDIT_URL = "https://www.reddit.com/r/all/top/?t=day", HOUR_MS = 3600000;
const findChrome = () => [process.env.CHROME,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ...["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"].flatMap((v) => process.env[v]
    ? [path.join(process.env[v], "Google", "Chrome", "Application", "chrome.exe"), path.join(process.env[v], "Microsoft", "Edge", "Application", "msedge.exe")] : []),
].find((p) => p && fs.existsSync(p));
// its major version, for a user agent like its own (Windows: the version folder beside the exe; chrome.exe --version prints nothing there)
function chromeMajor(exe) {
  try { const v = fs.readdirSync(path.dirname(exe)).find((n) => /^\d+\.\d+\./.test(n)); if (v) return v.split(".")[0]; } catch {}
  return /(\d+)\.\d+\./.exec(spawnSync(exe, ["--version"], { encoding: "utf8", timeout: 20000 }).stdout ?? "")?.[1] ?? "150";
}
const unescapeHtml = (s) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
// the <shreddit-post> elements of the page (each says its title, subreddit, score, comments), NSFW ones left out
function redditPosts(html) {
  // \s: not <shreddit-post-overflow-menu> (an ad's menu)
  return [...html.matchAll(/<shreddit-post\s([^>]*)>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map((a) => [a[1], unescapeHtml(a[2] ?? "")])))
    .filter((a) => a["post-title"] && a.permalink && !("nsfw" in a))
    .map((a) => {
      const discussion = new URL(a.permalink, "https://www.reddit.com").href;
      return { title: a["post-title"], url: a["content-href"] || discussion, discussion, subreddit: a["subreddit-prefixed-name"] ?? "",
        score: Number(a.score) || 0, comments: Number(a["comment-count"]) || 0 };
    });
}
function reddit(f, before) {
  for (const k of ["reddit", "redditAt", "redditBlockedAt", "redditBlocks"]) if (before?.[k] != null) f[k] = before[k];   // kept until a new try says otherwise
  const pause = 6 * HOUR_MS * 2 ** Math.min(2, Math.max(0, (f.redditBlocks ?? 1) - 1));
  if (Date.now() - Date.parse(f.redditBlockedAt ?? "") < pause) throw new Error(`被 Reddit 擋了，${Math.round(pause / HOUR_MS)} 小時內不再試（${f.redditBlockedAt}）`);
  if (Date.now() - Date.parse(f.redditAt ?? "") < (2 + Math.random()) * HOUR_MS) return;
  const exe = findChrome();
  if (!exe) throw new Error("沒有 Chrome 或 Edge（或設 CHROME）");
  const ua = process.platform === "win32" ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor(exe)}.0.0.0 Safari/537.36`
    : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor(exe)}.0.0.0 Safari/537.36`;
  // its own profile, kept (nothing of yours is read); the page holds 3 posts and loads more as you scroll: a 2000 px tall window
  const r = spawnSync(exe, ["--headless=new", `--user-data-dir=${path.join(out, "reddit-profile")}`, "--no-first-run", "--no-default-browser-check",
    `--user-agent=${ua}`, "--accept-lang=zh-TW,zh,en-US,en", "--window-size=1200,2000", "--disable-blink-features=AutomationControlled",
    "--virtual-time-budget=8000", "--dump-dom", REDDIT_URL], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 120000, windowsHide: true });
  const html = r.stdout ?? "";
  if (/blocked by network security/i.test(html)) {
    f.redditBlockedAt = now();
    f.redditBlocks = (f.redditBlocks ?? 0) + 1;
    throw new Error("被 Reddit 擋了（之後 6、12、24 小時再試一次）");
  }
  const posts = redditPosts(html);
  if (!posts.length) throw new Error(r.error?.message || `頁面裡沒有貼文（${html.length} 字）`);
  Object.assign(f, { reddit: posts, redditAt: now(), redditBlockedAt: null, redditBlocks: 0 });
}

async function feeds() {
  const f = { at: now(), hn: [], reddit: [], digg: [], errors: {} };
  let before = null;
  try { before = JSON.parse(fs.readFileSync(path.join(out, "feeds.json"), "utf8")); } catch {}
  try {
    const r = await fetch("https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30", { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    f.hn = ((await r.json()).hits ?? []).sort((a, b) => (b.points ?? 0) - (a.points ?? 0)).map((h) => ({
      title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discussion: `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points ?? 0, comments: h.num_comments ?? 0,
    }));
  } catch (e) { f.errors.hn = String(e.message ?? e).slice(0, 200); }
  try { reddit(f, before); } catch (e) { f.errors.reddit = String(e.message ?? e).slice(0, 200); }
  // digg-pp-cli on PATH (docs/trend.md): the stories of every Digg topic in the last 24 h, by Digg Score
  const d = spawnSync(process.platform === "win32" ? "digg-pp-cli.exe" : "digg-pp-cli", ["top", "--limit", "30", "--agent"],
    { encoding: "utf8", maxBuffer: 16 << 20, timeout: 120000, windowsHide: true });
  try {
    if (d.status !== 0) throw new Error(d.error?.message || (d.stderr ?? "").trim().split("\n").pop() || `exit ${d.status}`);
    f.digg = (JSON.parse(d.stdout).results ?? []).map((s) => ({
      title: s.title, url: s.url, description: s.description ?? "", score: s.diggScore ?? 0, sources: s.postCount ?? 0, topic: s.topic ?? "",
    }));
  } catch (e) { f.errors.digg = String(e.message ?? e).slice(0, 200); }
  put("feeds.json", JSON.stringify(f) + "\n");
}
feeds().catch(() => {}).finally(() => {
  put("status.json", JSON.stringify({ started, finished: now(), ok: !error, error }) + "\n");
  process.exit(error ? 1 : 0);
});
