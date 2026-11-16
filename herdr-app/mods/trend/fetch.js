// What's trending now (last30days --discover, global): no model is called, so no tokens. Run every hour as
// `node fetch.js <last30days.py>` by launchd (macOS) or Task Scheduler (Windows) (docs/trend.md); the trend panel
// reads what it writes to <Herdr home>/trend/:
//   trends.json   last30days' discovery JSON (schema 1.x), replaced only by a run that succeeded
//   status.json   { started, finished, ok, error }: the panel's ring and 「上次更新」
//   last.log      the last run's own output
//   videos.json   my videos: what YouTube's search found for each line of videos.txt (yours), kept, newest first
// <last30days.py>: the skill's scripts/last30days.py in your kit source.
// A proxy goes in <Herdr home>/trend/proxy, one line http://user:pass@host:port (keep it private: chmod 600 on macOS):
// last30days' requests go through it (not Reddit's page below: a proxy didn't get past Reddit's 403 either).
// PYTHON: the Python to run it with (default python3; on Windows python). CHROME: the Chrome or Edge for the pages
// read in a browser (Reddit, Dcard, Threads).
// 每小時抓一次全網熱門（不叫模型、不花 token）。代理寫在 trend/proxy 一行，只給 last30days 用。
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const out = path.join(process.env.HERDR_APP_HOME || path.join(os.homedir(), ".config", "herdr-app"), "trend");
fs.mkdirSync(out, { recursive: true });
const put = (name, text) => { fs.writeFileSync(path.join(out, `${name}.tmp`), text); fs.renameSync(path.join(out, `${name}.tmp`), path.join(out, name)); };
const now = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");
const started = now();
put("status.json", JSON.stringify({ started, finished: null, ok: null, error: null }) + "\n");

// EXCLUDE_SOURCES=reddit: last30days' own Reddit search only gets 403 (Reddit's rows come from its page, below), and
// every try is one more hit from the house's IP / last30days 自己的 Reddit 搜尋只會 403，不讓它打
const env = { ...process.env, PYTHONDONTWRITEBYTECODE: "1", EXCLUDE_SOURCES: "reddit" };   // no __pycache__ in the kit source (kit check: text files only)
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

// last30days names at most 10 topics (and enriches 6): the panel fills its list with each site's own front page,
// ranked by that site. feeds.json: { at, hn, reddit, ptt, dcard, threads, digg (arrays), errors: {...}, and for each
// site read gently (reddit, ptt, dcard, threads): <site>At, <site>BlockedAt, <site>Blocks }. Free, no keys, no model.
// 面板用各站自己的熱門（HN 首頁、Reddit r/all 今日、PTT 熱門看板、Dcard 熱門、Threads 推薦、Digg 排行）補足清單。

// Sites read gently, since a block is likely by IP and every device in the house shares it (a production crawler's
// advice): no login, its own Chrome version in the user agent, zh-TW first, once every 2 to 3 hours (a random pick,
// not on the hour); a sign of a block: no tries for 6 hours, then 12, then 24 (one try each time), and the panel says
// so. What a site gave last stays until a new try says otherwise.
// 全家共用 IP，所以保守：每站 2 到 3 小時一次；被擋停 6、12、24 小時，面板會說。
const HOUR_MS = 3600000;
async function gently(f, before, key, read, hours = 2) {
  const at = `${key}At`, blockedAt = `${key}BlockedAt`, blocks = `${key}Blocks`;
  for (const k of [key, at, blockedAt, blocks]) if (before?.[k] != null) f[k] = before[k];
  const pause = 6 * HOUR_MS * 2 ** Math.min(2, Math.max(0, (f[blocks] ?? 1) - 1));
  if (Date.now() - Date.parse(f[blockedAt] ?? "") < pause) throw new Error(`被擋了，${Math.round(pause / HOUR_MS)} 小時內不再試（${f[blockedAt]}）`);
  if (Date.now() - Date.parse(f[at] ?? "") < (hours + Math.random()) * HOUR_MS) return;
  try {
    f[key] = await read();
  } catch (e) {
    if (e instanceof Blocked) Object.assign(f, { [blockedAt]: now(), [blocks]: (f[blocks] ?? 0) + 1 });
    throw e;
  }
  Object.assign(f, { [at]: now(), [blockedAt]: null, [blocks]: 0 });
}

// Reddit answers scripts (its .json, curl, Python, a "HeadlessChrome" browser) with 403 "blocked by network
// security", even through a residential proxy; the installed Chrome or Edge, headless but saying it is a plain Chrome,
// gets the page (tried 2026-11-16), with one profile of its own kept between runs (not a brand-new visitor each time).
// Reddit 擋腳本（連住宅代理也擋）；用本機的 Chrome／Edge 無頭開一頁（UA 不帶 Headless）就拿得到。
const REDDIT_URL = "https://www.reddit.com/r/all/top/?t=day";
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
// a plain Chrome's user agent, its version the installed one's (150 when there's none)
function chromeUa() {
  const exe = findChrome(), v = exe ? chromeMajor(exe) : "150";
  return process.platform === "win32" ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`
    : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
}
async function readReddit() {
  const exe = findChrome();
  if (!exe) throw new Error("沒有 Chrome 或 Edge（或設 CHROME）");
  // its own profile, kept (nothing of yours is read); the page holds 3 posts and loads more as you scroll: a 2000 px tall window
  const r = spawnSync(exe, ["--headless=new", `--user-data-dir=${path.join(out, "reddit-profile")}`, "--no-first-run", "--no-default-browser-check",
    `--user-agent=${chromeUa()}`, "--accept-lang=zh-TW,zh,en-US,en", "--window-size=1200,2000", "--disable-blink-features=AutomationControlled",
    "--virtual-time-budget=8000", "--dump-dom", REDDIT_URL], { encoding: "utf8", maxBuffer: 64 << 20, timeout: 120000, windowsHide: true });
  const html = r.stdout ?? "";
  if (/blocked by network security/i.test(html)) throw new Blocked("被 Reddit 擋了（之後 6、12、24 小時再試一次）");
  const posts = redditPosts(html);
  if (!posts.length) throw new Error(r.error?.message || `頁面裡沒有貼文（${html.length} 字）`);
  return posts;
}

// PTT: plain HTTP is enough (tried 2026-11-16); over18=1 is the site's own age check, not a sign-in. The most popular
// boards (hotboards.html, adult ones left out), and on each the site's own search recommend:50 (the newest 20 posts
// with 50 or more 推), most 推 first; 爆 counts as 100. 9 requests, 5 seconds apart.
// PTT：純 HTTP；熱門看板前 8 個（濾掉成人板），每板用站內搜尋「推文 ≥ 50」的最新 20 篇，依推文數排。
const PTT = "https://www.ptt.cc", PTT_BOARDS = 8;
// shortcut: adult boards by name, add one when it shows up in hotboards
const PTT_ADULT = /^(sex|AV|japanavgirls|Beauty|AdultPics|Hentai|PttSexy|feminine_sex|BB-Love)/i;
const PTT_BLOCK = /請確認您已滿|Just a moment|cf-chl|Attention Required|verify you are human/i;
async function readPtt() {
  let n = 0;
  const ua = chromeUa();
  const get = async (p) => {
    if (n++) await new Promise((ok) => setTimeout(ok, 5000));
    const r = await fetch(PTT + p, { headers: { "user-agent": ua, "accept-language": "zh-TW,zh;q=0.9,en;q=0.8", cookie: "over18=1" }, signal: AbortSignal.timeout(30000) });
    const html = await r.text();
    if (r.status === 403 || r.status === 429 || PTT_BLOCK.test(html)) throw new Blocked(`被 PTT 擋了（HTTP ${r.status}；之後 6、12、24 小時再試一次）`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return html;
  };
  const boards = [...(await get("/bbs/hotboards.html")).matchAll(/<div class="board-name">([^<]+)<\/div>/g)].map((m) => m[1]).filter((b) => !PTT_ADULT.test(b)).slice(0, PTT_BOARDS);
  const posts = [];
  for (const board of boards) for (const ent of (await get(`/bbs/${board}/search?q=recommend%3A50`)).split('<div class="r-ent">').slice(1)) {
    const a = /<a href="(\/bbs\/[^"]+\/M\.(\d+)\.[^"]+\.html)">([\s\S]*?)<\/a>/.exec(ent);
    if (!a) continue;   // deleted
    const s = /<div class="nrec">(?:<span[^>]*>([^<]*)<\/span>)?/.exec(ent)?.[1] ?? "";
    posts.push({ title: unescapeHtml(a[3]).trim(), url: PTT + a[1], board, author: /<div class="author">([^<]*)</.exec(ent)?.[1] ?? "",
      score: s === "爆" ? 100 : s.startsWith("X") ? -10 * (s[1] === "X" ? 10 : Number(s[1]) || 1) : Number(s) || 0, created: new Date(Number(a[2]) * 1000).toISOString() });
  }
  if (!posts.length) throw new Error("熱門看板裡沒有文章");
  return posts.sort((x, y) => y.score - x.score || y.created.localeCompare(x.created));
}

// A page opened by the installed Chrome or Edge, headless but saying it is a plain Chrome, driven over DevTools
// (127.0.0.1 only) for pages where --dump-dom never returns (they never go idle): keeps the bodies of the responses
// whose url matches `keep`, waits up to `wait` seconds (less once done(bodies) or the text matches `stop`), scrolls
// `scrolls` times (more of a feed), and gives { status (the page's own), text (what it shows), html, bodies }.
// One profile of its own per site, kept between runs (nothing of yours is read).
async function chromePage(site, url, { keep, wait = 30, done = () => false, stop = null, scrolls = 0 }) {
  const exe = findChrome();
  if (!exe) throw new Error("沒有 Chrome 或 Edge（或設 CHROME）");
  const profile = path.join(out, `${site}-profile`), sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
  fs.mkdirSync(profile, { recursive: true });
  fs.rmSync(path.join(profile, "DevToolsActivePort"), { force: true });
  const chrome = spawn(exe, ["--headless=new", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", `--user-agent=${chromeUa()}`,
    "--accept-lang=zh-TW,zh,en-US,en", "--window-size=1200,2000", "--disable-blink-features=AutomationControlled",
    "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", "about:blank"], { stdio: "ignore", windowsHide: true });
  let ws;
  try {
    let port;
    for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch {} }
    if (!port) throw new Error("Chrome 沒開起來");
    const tab = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("連不上 Chrome")); });
    let id = 0, status = 0;
    const waiting = new Map(), resp = new Map(), bodies = [];
    const cdp = (method, params = {}) => new Promise((ok) => { waiting.set(++id, ok); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.id) { waiting.get(m.id)?.(m); waiting.delete(m.id); return; }
      if (m.method === "Network.responseReceived") {
        if (m.params.type === "Document" && !status) status = m.params.response.status;
        resp.set(m.params.requestId, m.params.response);
      }
      const r = m.method === "Network.loadingFinished" && resp.get(m.params.requestId);
      if (r && keep.test(r.url)) bodies.push({ url: r.url, status: r.status, body: (await cdp("Network.getResponseBody", { requestId: m.params.requestId })).result?.body ?? "" });
    };
    const read = async (expression) => (await cdp("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value ?? "";
    const shows = () => read("document.title + ' ' + (document.body?.innerText ?? '').slice(0, 3000)");
    await cdp("Network.enable");
    await cdp("Page.navigate", { url });
    let text = "";
    for (let i = 0; i < wait && !done(bodies); i++) {
      await sleep(1000);
      if (stop?.test(text = await shows())) break;
    }
    for (let i = 0; i < scrolls && !stop?.test(text); i++) {
      await read("window.scrollTo(0, document.body.scrollHeight)");
      await sleep(4000 + Math.random() * 2000);
    }
    return { status, text: await shows(), html: await read("document.documentElement.outerHTML"), bodies };
  } finally { ws?.close(); chrome.kill(); }
}

// Dcard: Cloudflare answers its API (and plain HTTP) with 403; opened in Chrome, https://www.dcard.tw/f asks Dcard's
// API itself (tried 2026-11-16): its popular list (globalPaging/page …listKey=popular…) is kept, about 21 posts.
// Every 3 to 4 hours. Dcard：Cloudflare 擋 API；本機 Chrome 無頭開熱門頁，接下頁面自己抓的熱門清單。3 到 4 小時一次。
// shortcut: adult forums by alias besides the post's own nsfw flag, add one when it shows up
const DCARD_ADULT = /^(sex|sexuality|bdsm|lgbt_sex|sex_toy|r18|adult|18x)$/i;
const CF_BLOCK = /Attention Required|you have been blocked|unable to access/i;
async function readDcard() {
  const p = await chromePage("dcard", "https://www.dcard.tw/f", { keep: /globalPaging\/page.*listKey=popular/, done: (b) => b.length > 0, stop: CF_BLOCK });
  const list = p.bodies[0];
  if (!list && (CF_BLOCK.test(p.text) || /Just a moment|verify you are human/i.test(p.text))) throw new Blocked("被 Dcard 擋了（之後 6、12、24 小時再試一次）");
  if (list?.status !== 200) throw new Error(`拿不到熱門清單（HTTP ${list?.status ?? p.status}）`);
  const posts = [], ids = new Set();
  const walk = (o) => {
    if (!o || typeof o !== "object") return;
    if (typeof o.title === "string" && o.forumAlias && Number.isInteger(o.id) && "likeCount" in o && !ids.has(o.id)) { ids.add(o.id); posts.push(o); }
    for (const v of Object.values(o)) walk(v);
  };
  walk(JSON.parse(list.body));
  const shown = posts.filter((x) => !x.nsfw && !x.unsafe && !DCARD_ADULT.test(x.forumAlias)).map((x) => ({ title: x.title,
    url: `https://www.dcard.tw/f/${x.forumAlias}/p/${x.id}`, score: x.likeCount ?? 0, comments: x.totalCommentCount ?? x.commentCount ?? 0,
    board: x.forumName ?? x.forumAlias, forum: x.forumAlias, created: x.createdAt }));
  if (!shown.length) throw new Error("熱門清單裡沒有文章");
  return shown;
}

// Threads has no logged-out trending list (search is empty, the Trending Topics API is US and Japan, with Meta's app
// review); what it shows a visitor from here is its own pick of posts, about 10 a load (the page's JSON and the
// feed page one scroll brings). So each run's pick is added to the last day's, most 讚 first, 30 kept.
// Threads 沒有訪客看得到的熱門榜；開首頁拿它推薦給訪客的約 10 則，累積 24 小時、依讚數排，留 30 則。
async function readThreads(before) {
  const p = await chromePage("threads", "https://www.threads.com/", { keep: /\/graphql\//, wait: 8, scrolls: 2 });
  if (p.status && p.status !== 200 || /checkpoint|verify you are human|unusual activity|請稍後再試|Please wait a few minutes/i.test(p.text))
    throw new Blocked(`被 Threads 擋了（HTTP ${p.status}；之後 6、12、24 小時再試一次）`);
  const found = [];
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") { if (Array.isArray(o.thread_items) && o.thread_items[0]?.post?.code) found.push(o.thread_items[0].post); else Object.values(o).forEach(walk); }
  };
  for (const m of p.html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) if (m[1].includes("thread_items")) try { walk(JSON.parse(m[1])); } catch {}
  for (const b of p.bodies) for (const line of b.body.split("\n")) if (line.includes("thread_items")) try { walk(JSON.parse(line)); } catch {}
  const fresh = found.map((x) => ({ title: (x.caption?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "(無文字)",
    url: `https://www.threads.com/@${x.user?.username}/post/${x.code}`, score: x.like_and_view_counts_disabled ? 0 : x.like_count ?? 0,
    comments: x.text_post_app_info?.direct_reply_count ?? 0, author: x.user?.username ?? "", created: new Date(x.taken_at * 1000).toISOString(), seen: now() }));
  if (!fresh.length) throw new Error("首頁沒有貼文（要登入了，或版面改了）");
  const all = new Map([...(before?.threads ?? []).filter((x) => Date.now() - Date.parse(x.seen ?? "") < 24 * HOUR_MS), ...fresh].map((x) => [x.url, x]));
  return [...all.values()].sort((a, b) => b.score - a.score).slice(0, 30);
}

// My videos: videos.txt holds one YouTube search per line (e.g. TWICE 子瑜; # starts a comment). Each is run on
// YouTube's own search page (uploads of this week) and read from its ytInitialData: no key, no browser (a search
// page needs no PO token; only playing or downloading does). Gently, from the home IP every device in the house
// shares (a production crawler's advice, 2026-11-16): a search at most once every 3 hours, a few seconds apart, zh-TW, the
// installed Chrome's version in the user agent, YouTube's cookies kept between runs (a visitor coming back, not a
// new one each time). A sign of a block (429, the consent or sorry page, "confirm you're not a bot", no
// ytInitialData) stops all searches for 6 hours, then 12, then 24 (one try each time, with fresh cookies); a page
// with ytInitialData but no videos is "nothing this week", not a block.
// shortcut: Node's TLS fingerprint, not Chrome's (curl_cffi isn't installed); if YouTube starts blocking, that or a YouTube Data API key (search.list, 100 a day free).
// shortcut: scrapes the search page, it breaks when YouTube changes it; the same API key then.
// 我的影片：videos.txt 一行一個搜尋；每個搜尋 3 小時最多一次；被擋就全部停 6、12、24 小時（全家共用一個 IP，寧可保守）。
const VIDEO_EVERY = 3 * HOUR_MS, VIDEO_KEEP = 300;
class Blocked extends Error {}
async function ytSearch(q, ua, cookies) {
  const r = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIIAw%3D%3D&hl=zh-TW&gl=TW`, {
    headers: { "user-agent": ua, "accept-language": "zh-TW,zh;q=0.9", cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
    signal: AbortSignal.timeout(30000) });
  for (const c of r.headers.getSetCookie()) { const m = /^([^=;\s]+)=([^;]*)/.exec(c); if (m) cookies[m[1]] = m[2]; }
  const html = await r.text();
  if (r.status === 429 || /consent\.youtube\.com|google\.com\/sorry/.test(r.url) || /confirm you.re not a bot/i.test(html)) throw new Blocked(`YouTube 擋了（HTTP ${r.status}）`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const m = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html);
  if (!m) throw new Blocked("頁面裡沒有搜尋結果的資料（可能被擋）");
  const found = [];
  const walk = (o) => { if (o && typeof o === "object") { if (o.videoRenderer) found.push(o.videoRenderer); else for (const v of Object.values(o)) walk(v); } };
  walk(JSON.parse(m[1]));
  return found.filter((v) => v.videoId).map((v) => ({ id: v.videoId, title: (v.title?.runs ?? []).map((x) => x.text).join(""),
    channel: (v.ownerText?.runs?.[0]?.text ?? "").trim(), length: v.lengthText?.simpleText ?? "",
    views: v.viewCountText?.simpleText ?? "", published: v.publishedTimeText?.simpleText ?? "" }));
}
async function videos() {
  let queries = [], before = null;
  try { queries = fs.readFileSync(path.join(out, "videos.txt"), "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")); } catch {}
  try { before = JSON.parse(fs.readFileSync(path.join(out, "videos.json"), "utf8")); } catch {}
  // a search taken out of videos.txt takes its videos with it
  const v = { queries, searched: {}, items: (before?.items ?? []).filter((x) => queries.includes(x.query)), errors: {},
    blockedAt: before?.blockedAt ?? null, blocks: before?.blocks ?? 0, cookies: before?.cookies ?? {} };
  for (const q of queries) if (before?.searched?.[q]) v.searched[q] = before.searched[q];
  const left = () => (v.blockedAt ? Date.parse(v.blockedAt) + 6 * HOUR_MS * 2 ** Math.min(Math.max(v.blocks - 1, 0), 2) - Date.now() : 0);   // 6, 12, 24 hours
  const paused = left() > 0;
  if (v.blockedAt && !paused) v.cookies = {};   // the try after a block starts clean
  const exe = findChrome(), major = exe ? chromeMajor(exe) : "150";
  const ua = process.platform === "win32" ? `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`
    : `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
  let asked = false;
  for (const q of paused ? [] : queries) {
    if (Date.now() - Date.parse(v.searched[q] ?? "") < VIDEO_EVERY) continue;
    if (asked) await new Promise((ok) => setTimeout(ok, 3000 + Math.random() * 4000));
    asked = true;
    try {
      const have = new Set(v.items.map((x) => x.id)), at = now();
      v.items = [...(await ytSearch(q, ua, v.cookies)).filter((x) => !have.has(x.id)).map((x) => ({ ...x, query: q, found: at })), ...v.items];
      v.searched[q] = at;
      Object.assign(v, { blockedAt: null, blocks: 0 });
    } catch (e) {
      v.errors[q] = String(e.message ?? e).slice(0, 200);
      if (e instanceof Blocked) { Object.assign(v, { blockedAt: now(), blocks: v.blocks + 1 }); break; }
    }
  }
  if (left() > 0) v.errors[""] = `被 YouTube 擋了：${Math.ceil(left() / HOUR_MS)} 小時後再試一次`;
  v.items = v.items.slice(0, VIDEO_KEEP);
  put("videos.json", JSON.stringify(v) + "\n");
}

async function feeds() {
  const f = { at: now(), hn: [], reddit: [], ptt: [], dcard: [], threads: [], digg: [], errors: {} };
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
  for (const [key, read, hours] of [["reddit", readReddit], ["ptt", readPtt], ["dcard", readDcard, 3], ["threads", () => readThreads(before)]])
    try { await gently(f, before, key, read, hours); } catch (e) { f.errors[key] = String(e.message ?? e).slice(0, 200); }
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
feeds().catch(() => {}).then(videos).catch(() => {}).finally(() => {
  put("status.json", JSON.stringify({ started, finished: now(), ok: !error, error }) + "\n");
  process.exit(error ? 1 : 0);
});
