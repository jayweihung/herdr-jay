// What's trending on the social sites now, beside your agents, and a trend agent to ask about it (like Gerrit's
// panel and its 問 agent). The data costs no tokens: launchd runs fetch.js every hour (last30days --discover, no
// model), which writes <Herdr home>/trend/trends.json and status.json; this mod only reads them (docs/trend.md).
// Asking costs tokens, only when you ask: the question goes to a kit trend agent (agents/trend.md in a kit source,
// skills: last30days) in this space with `hc send`; none here: the Kit panel places one (kit place) and it starts on
// the question.
// Roles (props.role): the panel (default) and "toggle", the tab-bar button that shows or hides the layout's
// "trend-panel": a number for topics you haven't seen, a ring while fetch.js runs, a red ! when its last run failed.
// 熱門：launchd 每小時跑 fetch.js（不花 token）寫 trend/；這個 mod 只讀。問問題才叫 trend agent（花 token）。
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, settings, notify, appHome, readTextFile, writeTextFile, checking, exec, run, layout, shared, setShared, agents, terminals, focused, spaces, window, web, webCall, nextWebEvent, hc as herdrHc, props as blockProps } from "herdr";
import * as fsp from "fs/promises";

const TOGGLE = "trend-toggle", PANEL = "trend-panel";
const JOB = "com.herdr-jay.trend";   // the launchd job that runs fetch.js (docs/trend.md)
const TASK = "herdr-jay-trend";      // the same on Windows: a Task Scheduler task
const HOUR = 3600000;                // its StartInterval
const SEEN = "trend.seen.v1";        // the topics shown when the panel was last opened: the button counts the others
// The Kit panel's (mods/kit): the agents its sources have, and the places it is asked to make. A kit trend agent
// placed in a space is a folder whose .agentkit says agent:trend (kit place).
const KIT_AGENTS = "kit.agents.data.v1", KIT_PLACE_ASK = "kit.place.ask", KIT_TAKEN_WAIT = 8000;
const TOOLS = ["claude", "codex", "omp"], TOOL_NAMES = { claude: "Claude", codex: "Codex", omp: "omp" };
const toolOf = (x) => {
  const n = String(x ?? "").replace(/\\/g, "/").split("/").pop().replace(/\.(exe|cmd|ps1)$/i, "").toLowerCase();
  return n === "codex" ? "codex" : n === "omp" || n === "pi" ? "omp" : "claude";
};
// Written the Claude way (/last30days …); each tool calls a skill its own way
const skillFor = (text, tool) => String(text).replace(/^\/last30days\b/, tool === "codex" ? "$last30days" : tool === "omp" ? "/skill:last30days" : "/last30days");
const isTrendKit = (text) => /^agent:trend[ \t]*$/m.test(String(text ?? ""));
// a terminal whose program in front is an agent (one Herdr hasn't heard from shows as its shell in agents())
const runsAgent = (t) => /^(claude|codex|omp|pi)(\.exe|\.cmd)?$/i.test(String(t?.foreground?.argv?.[0] ?? "").split(/[\\/]/).pop());
// The trend agent's reports: HTML it writes to <Herdr home>/mods/trend/.reports/ (hidden: a write there doesn't
// reload the mod; inside the mod's folder: a web element may show it), named <YYYY-MM-DD-HHMM>-<topic>.html, with
// <meta name="trend-topic" content="the topic as asked"> so a topic's row finds its report (agents/trend.md).
const REPORT_CELL = "trend-report";
// a video played in the panel: the player page in <Herdr home>/trend/player (a URL with {id}; its site in your local
// mod.json's allow list, docs/trend.md), else YouTube's own watch page (mod.json allows www.youtube.com)
const VIDEO_CELL = "trend-video";
// 📝 整理重點: what the trend agent is asked (tokens, only when you press it); it writes plain text that the panel shows
// under the player. One video's subtitles, once: a block stops it (the house's IP is every device's).
const notesAsk = (x, file) => `用繁體中文整理這支 YouTube 影片的重點：https://www.youtube.com/watch?v=${x.id}（標題：${x.title}；頻道：${x.channel}）。`
  + `先拿這支影片的字幕（例如 yt-dlp --skip-download --write-auto-subs --sub-langs "zh-Hant,zh-TW,zh,en,ko,ja"，或 youtube-transcript-api），只抓這一支、被擋就停，不要重試；`
  + `沒有字幕就用影片說明和留言。寫成純文字（不要 markdown）：第一行一句話總結，接著 3 到 8 行「• 」開頭的重點（講到的時間點放前面，例如「• 02:15 …」），`
  + `最後一行寫「來源：字幕」或「來源：說明和留言」。存到 ${file}（資料夾不在就建立；先寫成同資料夾的 .tmp 檔再改名），寫好回一句就好。`;
// The panel's pages are web pages (cards, subject chips to filter by, the full text): the mod writes them to
// <Herdr home>/mods/trend/.view/ (hidden: a write doesn't reload the mod) whenever what they show changes. A click
// in one sets the page's #hash (do=<what>&topic=…|name=…&n=<the click's time>), which comes back as a "url" event
// and the mod asks the agent or opens the report; links in them open in the browser.
// 面板的頁面用網頁畫：mod 寫 .view/*.html；網頁裡的按鈕改 #hash，mod 收到再去問 agent 或開報告。
const LIST_CELL = "trend-list", REPORTS_CELL = "trend-reports", VIDEOS_CELL = "trend-videos";
const PAGE_CELLS = { list: LIST_CELL, reports: REPORTS_CELL, videos: VIDEOS_CELL };   // a tab and the web element of its page
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// a page in Herdr's colors and font size: <nav> chips filter the <section data-cat>s; [data-do] clicks set the #hash
function pageHtml(body) {
  const t = theme(), z = fs();
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
:root{--bg:${t.surface};--fg:${t.foreground};--muted:${t.muted};--dim:${t.dim};--border:${t.border};--raised:${t.raised};--accent:${t.accent};
--accent-fg:${t.accent_foreground ?? t.background};--solid:${t.solid};--solid-fg:${t.solid_foreground};--green:${t.ansi2};--yellow:${t.ansi3}}
html,body{margin:0;background:var(--bg);color:var(--fg);font:${z}px/1.45 -apple-system,"PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
nav{position:sticky;top:0;z-index:1;display:flex;flex-wrap:wrap;gap:6px;padding:8px 10px;background:var(--bg);border-bottom:1px solid var(--border)}
nav button{font:inherit;font-size:.88em;padding:2px 10px;border-radius:999px;border:1px solid var(--border);background:var(--raised);color:var(--muted);cursor:pointer}
nav button.on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}nav button:disabled{opacity:.4;cursor:default}
h2{margin:14px 12px 6px;font-size:.85em;font-weight:600;color:var(--muted)}
.card{margin:0 10px 8px;padding:9px 11px;border:1px solid var(--border);border-radius:9px;background:var(--raised)}
.card[data-do]{cursor:pointer}.card[data-do]:hover{border-color:var(--accent)}
.top{display:flex;gap:6px;align-items:flex-start}
.title{flex:1;min-width:0;font-weight:600;color:var(--fg);text-decoration:none;overflow-wrap:anywhere}
a.title:hover{text-decoration:underline}
.chip{flex:none;margin-top:.15em;padding:1px 6px;border-radius:4px;font-size:.75em;background:var(--bg);color:var(--muted)}
.chip.x{color:var(--accent)}.chip.new{color:var(--green)}.chip.up{color:var(--yellow)}
.also{margin-top:5px;padding-left:8px;border-left:2px solid var(--border);font-size:.85em}
.also a{display:block;color:var(--muted);text-decoration:none;overflow-wrap:anywhere}.also a:hover{color:var(--fg)}
.also b{color:var(--accent);font-weight:600}.also span{margin-left:6px;color:var(--dim)}
.dot{flex:none;width:6px;height:6px;margin-top:.55em;border-radius:3px;background:var(--accent)}
.meta{margin-top:2px;font-size:.85em;color:var(--muted)}
.why{margin-top:3px;font-size:.9em;color:var(--dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.excerpt{margin-top:5px;font-size:.92em;color:var(--fg);opacity:.85;white-space:pre-line;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card:has(details[open]) .excerpt{display:none}
.body{margin:6px 0;white-space:pre-line;overflow-wrap:anywhere;color:var(--fg)}
details{margin-top:4px;font-size:.88em}summary{color:var(--muted);cursor:pointer}
blockquote{margin:6px 0;padding-left:8px;border-left:2px solid var(--border);color:var(--muted)}
.links a{display:block;color:var(--accent);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.acts button{font:inherit;font-size:.85em;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--fg);cursor:pointer}
.acts button.main{background:var(--solid);color:var(--solid-fg);border-color:var(--solid)}.acts button.rep{color:var(--accent);border-color:var(--accent)}
</style></head><body>${body}
<script>
const K=location.pathname.split("/").pop()+":",get=(k)=>{try{return localStorage.getItem(K+k)}catch{return null}},set=(k,v)=>{try{localStorage.setItem(K+k,v)}catch{}};
const nav=document.querySelector("nav");
// a chip shows its subject's sections; 升溫 and 新進榜 show those cards wherever they are
const show=(c)=>{for(const b of document.querySelectorAll("nav button"))b.classList.toggle("on",b.dataset.cat===c);for(const s of document.querySelectorAll("section")){let any=false;for(const k of s.querySelectorAll(".card")){const ok=c==="all"||s.dataset.cat===c||(c==="rising"&&"rising" in k.dataset)||(c==="new"&&"new" in k.dataset);k.hidden=!ok;any||=ok}s.hidden=!any}set("cat",c)};
if(nav){nav.onclick=(e)=>{const b=e.target.closest("button");if(b){show(b.dataset.cat);scrollTo(0,0)}};const c=get("cat");show([...nav.querySelectorAll("button")].some((b)=>b.dataset.cat===c)?c:"all")}
document.querySelector("main").onclick=(e)=>{const b=e.target.closest("[data-do]");if(!b||e.target.closest("a"))return;const k=b.closest(".card").dataset;
location.hash="do="+b.dataset.do+(k.topic?"&topic="+encodeURIComponent(k.topic):"")+(k.name?"&name="+encodeURIComponent(k.name):"")+"&n="+Date.now();
setTimeout(()=>history.replaceState(null,"",location.pathname),500)};
const y=Number(get("y"));if(y)scrollTo(0,y);addEventListener("scroll",()=>set("y",String(scrollY)),{passive:true});
</script></body></html>
`;
}
const fileUrl = (p) => { const s = p.replace(/\\/g, "/"); return "file://" + (/^[A-Za-z]:/.test(s) ? "/" : "") + encodeURI(s).replace(/#/g, "%23").replace(/\?/g, "%3F"); };
const unescape = (s) => (s == null ? null : String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim());
const metaTopic = (html) => unescape(/<meta\s+name=["']trend-topic["']\s+content=["']([^"']*)["']/i.exec(html)?.[1]);
const htmlTitle = (html) => unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]) || null;
const reportWhen = (name) => { const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/.exec(name); return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : ""; };
const PRESETS = [
  { label: "🔎 深入查", text: (r) => `/last30days ${r.topic}` },
  { label: "三句話說明", text: (r) => r.feed
    ? `用繁體中文三句話說明「${r.topic}」（${r.evidence_urls[0]}）最近發生什麼事、為什麼大家在討論。先看那個連結，不夠再查。`
    : `用繁體中文三句話說明「${r.topic}」最近發生什麼事、為什麼大家在討論。這一題的來源在 ~/.config/herdr-app/trend/trends.json（topic 是 ${JSON.stringify(r.topic)}），先看那些連結，不夠再查。` },
];
const MOMENTUM = { "new-this-week": "本週新", building: "升溫中" };
const DIGG_TOPIC = { ai: "AI", tech: "科技", "world-business": "國際商業", sports: "體育", science: "科學", gaming: "遊戲", entertainment: "娛樂" };
// The list by subject (no model, no tokens): AI and stock words in the title first, then what the site says (Digg's
// topic, Reddit's subreddit), then the other words, then the site's usual (HN: 科技, Reddit's front page: 趣聞).
// 依主題分類：先看標題的 AI、股票關鍵字，再看 Digg 的分類、Reddit 的看板，再看其他關鍵字，最後照網站慣例。
// shortcut: keyword lists misfile some titles; a cheap model call per row if that starts to matter.
const CATS = ["AI", "科技", "股票", "財經", "政治", "國際", "科學", "娛樂", "遊戲", "體育", "趣聞", "其他"];
const WORDS = [
  ["AI", /\b(AI|A\.I\.|AGI|LLMs?|GPTs?|ChatGPT|OpenAI|Anthropic|Claude|Gemini|Copilot|Qwen\w*|DeepSeek|Llama|Mistral|Grok|xAI|machine learning|neural)\b|人工智慧/i],
  ["股票", /\b(stocks?|stock market|earnings|IPO|Nasdaq|S&P ?500|Dow Jones|Wall Street|shareholders?|market cap|short sellers?|buyback|NYSE)\b|\$[A-Z]{1,5}\b|股票|股價|股市|台股|美股/i],
  ["財經", /\b(Fed|interest rates?|inflation|economy|economic|recession|tariffs?|bitcoin|crypto\w*|layoffs?|GDP|jobs report|mortgage|banks?)\b|經濟|通膨|利率/i],
  ["政治", /\b(Trump|Biden|Harris|Vance|Obama|election|Congress|Senate|House Republicans|Democrats?|Republicans?|GOP|White House|Supreme Court|governor|impeach\w*|Epstein|RFK)\b|政府|選舉|立法院|總統|國民黨|民進黨|民眾黨|藍營|綠營|藍白|民調|立委|議員|市長|罷免|造勢|候選人|政黑|賴清德|柯文哲|黃國昌/i],
  ["國際", /\b(war|Ukraine|Russia|Putin|Israel|Gaza|Iran|NATO|China|Beijing|Taiwan|sanctions?|UN|EU|Europe|ceasefire|missiles?)\b|中國|戰爭/i],
  ["科學", /\b(NASA|SpaceX|Starship|rocket|space|physics|biology|scientists?|study finds|climate|El Niño|species|fossil|quantum)\b|科學/i],
  ["體育", /\b(NBA|NFL|MLB|NHL|FIFA|World Cup|Olympics?|Premier League|Formula 1|F1|tennis|golf|touchdown)\b/i],
  ["科技", /\b(Nvidia|Jensen Huang|Apple|Microsoft|Google|Amazon|Meta|Tesla|Musk|Altman|Zuckerberg|Intel|AMD|TSMC|iPhone|Android|Linux|Windows|software|chips?|GPUs?|open source|outage|hack(ed|ers?)?|browser)\b|台積電/i],
];
const DIGG_CAT = { ai: "AI", tech: "科技", "world-business": "國際", sports: "體育", science: "科學", gaming: "遊戲", entertainment: "娛樂" };
const SUB_CAT = [
  ["政治", /^r\/(politics|PoliticalHumor|Conservative|democrats|Republican|law)$/i],
  ["國際", /^r\/(worldnews|europe|ukraine|geopolitics|UkrainianConflict|anime_titties)$/i],
  ["股票", /^r\/(wallstreetbets|stocks|investing|StockMarket|options|ValueInvesting|taiwanstock)$/i],
  ["財經", /^r\/(economics|economy|personalfinance|CryptoCurrency|Bitcoin|finance)$/i],
  ["科技", /^r\/(technology|gadgets|programming|apple|android|pcmasterrace|hardware)$/i],
  ["科學", /^r\/(science|space|askscience|EarthPorn)$/i],
  ["娛樂", /^r\/(movies|television|music|entertainment|shittymoviedetails|popculturechat|anime|Marvel)$/i],
  ["遊戲", /^r\/(gaming|pcgaming|Games|nintendo|PS5|xbox|GTA\w*|leagueoflegends|Minecraft)$/i],
  ["體育", /^r\/(sports|nba|nfl|soccer|baseball|hockey|formula1|tennis|MMA|CFB)$/i],
  ["其他", /^r\/news$/i],
];
// PTT's boards: the ones that are one subject (Gossiping isn't: its posts go by their words)
const PTT_CAT = [
  ["政治", /^(HatePolitics|Election|PublicIssue)$/i],
  ["股票", /^(Stock|Option|Fund|Foreign_Inv|DayTrade)$/i],
  ["財經", /^(Lifeismoney|home-sale|Finance|Bank_Service|Insurance|Salary)$/i],
  ["科技", /^(Tech_Job|Soft_Job|MobileComm|PC_Shopping|iOS|Android|e-shopping)$/i],
  ["國際", /^(Military|China-News|WorldNews)$/i],
  ["娛樂", /^(C_Chat|movie|KoreaStar|Japan_Star|TaiwanDrama|KoreaDrama|China-Drama|ACG|EAseries)$/i],
  ["遊戲", /^(LoL|PlayStation|NSwitch|Steam|mobile-game|Hearthstone|PCReDive)$/i],
  ["體育", /^(Baseball|NBA|basketballTW|Tennis|Football|MLB|Elephants|Lions|Guardians|Monkeys)$/i],
  ["趣聞", /^(joke|WomenTalk|Boy-Girl|marriage|StupidClown|CATCH|pet|cat|dog)$/i],
];
// Dcard's forums by alias (Dcard and Threads are mostly everyday life: 趣聞 when nothing else says otherwise)
const DCARD_CAT = [
  ["股票", /^(stock|stock_market)$/i],
  ["財經", /^(money|investment|creditcard|insurance|job)$/i],
  ["政治", /^(trending|politics|election\w*)$/i],
  ["科技", /^(3c|tech_job|apple|android|pc|softwareengineer)$/i],
  ["娛樂", /^(entertainer|movie|tvepisode|drama|kpop|japan_drama|show|youtuber|netflix|music|acg|vtuber|marvel)$/i],
  ["遊戲", /^(game|lol|mobilegame|steam|switch|ps|genshin)$/i],
  ["體育", /^(sport|baseball|basketball|nba|fitness|soccer)$/i],
];
function categoryOf(r) {
  const text = `${r.topic} ${r.feed ? "" : why(r)}`;
  const first = WORDS.slice(0, 2).find(([, re]) => re.test(text))?.[0];
  const table = r.digg ? null : r.sub ? [SUB_CAT, r.sub] : r.board && r.feed === "PTT" ? [PTT_CAT, r.board] : r.forum ? [DCARD_CAT, r.forum] : null;
  const site = r.digg ? DIGG_CAT[r.digg] : table ? table[0].find(([, re]) => re.test(table[1]))?.[0] : null;
  return first || site || WORDS.slice(2).find(([, re]) => re.test(text))?.[0] || (r.feed === "HN" ? "科技" : ["Reddit", "Dcard", "Threads"].includes(r.feed) ? "趣聞" : "其他");
}
// The same story on two sites: a title's key is its English words (3 letters or more, common ones left out) and its
// Chinese character pairs, the [新聞]-like tag in front dropped; two keys are the same story when they share SAME or
// more of what they have between them (Jaccard). shortcut: words only, a model or embeddings if it merges too little.
const SAME = 0.4;
const COMMON = new Set("the and for with that this from have you are was were will what when your about into after over just more than they them their its our has had not but how why who new".split(" "));
function titleKey(title) {
  const t = String(title).toLowerCase().replace(/^(\s*(\[[^\]]*\]|【[^】]*】|re:|fw:))+\s*/gi, "").replace(/https?:\S+/g, "");
  const key = new Set((t.match(/[a-z0-9]{3,}/g) ?? []).filter((w) => !COMMON.has(w)));
  for (const run of t.match(/\p{Script=Han}+/gu) ?? []) for (let i = 0; i + 1 < run.length; i++) key.add(run.slice(i, i + 2));
  return key;
}
function similar(a, b) {
  let both = 0;
  for (const x of a) if (b.has(x)) both++;
  return both / (a.size + b.size - both || 1);
}
const SOURCE = { hackernews: "HN", reddit: "Reddit", digg: "Digg", x: "X", grounding: "網頁", youtube: "YouTube", polymarket: "Polymarket", github: "GitHub" };
const STATE = { "rate-limited": "被限流", "auth-failed": "登入失效", "payment-required": "額度用完", unreachable: "連不到", timeout: "逾時",
  "schema-drift": "讀不到（常是被擋）", "skipped-unconfigured": "沒設定", error: "出錯", partial: "部分", "no-results": "沒結果" };
// why_spiking without the engine's own counting sentence (the line above shows the numbers): the headline that's left
const why = (r) => String(r.why_spiking ?? "").replace(/^\d+ evidence items? on .*? generated [\d,]+ native interactions?\.\s*/, "") || String(r.why_spiking ?? "");

const fs = () => Number(settings().ui_font_size) || 13;
const stop = (_e, cx) => cx.stop_propagation();
const spin = (size, color) => svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(color).spin(900);
// the small buttons above a web page (← back, ⟳)
const smallBtn = (t, z, id, label, fn) => div().id(id).h(26).px(8).flex().items_center().rounded(5).cursor_pointer().text_size(z - 1)
  .bg(t.raised).hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click(fn).child(label);
const ago = (ms) => { const m = Math.max(0, Math.floor((Date.now() - ms) / 60000)); return m < 1 ? "剛剛" : m < 60 ? `${m} 分前` : m < 1440 ? `${Math.floor(m / 60)} 小時前` : `${Math.floor(m / 1440)} 天前`; };
const hhmm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const num = (n) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
// "HN 4.7k 分 · 3.5k 留言 · Reddit 1.2k 分": each source's own counters, the ones people know
function engagementText(e) {
  return Object.entries(e ?? {}).map(([src, c]) => {
    const n = (k) => (typeof c?.[k] === "number" ? c[k] : null);
    const parts = [[n("points") ?? n("score") ?? n("likes") ?? n("digg_score"), "分"], [n("comments") ?? n("num_comments") ?? n("replies"), "留言"]]
      .filter(([v]) => v != null).map(([v, w]) => `${num(v)} ${w}`);
    return parts.length ? `${SOURCE[src] ?? src} ${parts.join(" · ")}` : null;
  }).filter(Boolean).join("　");
}
const copyOn = (value) => (_e, cx) => {
  const text = String(value ?? "");
  if (!text) return;
  cx.stop_propagation();
  cx.write_to_clipboard(text);
  notify({ title: "已複製", body: text.length > 120 ? `${text.slice(0, 120)}…` : text, level: "success", timeout: 1500 });
};
const shortLink = (url) => { try { const u = new URL(url); return `${u.hostname}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}`; } catch { return url.slice(0, 60); } };
// a web link in the system's browser
function openLink(url) {
  const p = window()?.platform;
  (p === "windows" ? exec("C:\\Windows\\System32\\rundll32.exe", ["url.dll,FileProtocolHandler", url]) : exec(p === "macos" ? "/usr/bin/open" : "xdg-open", [url])).catch(() => {});
}
function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}

export default class Trend extends View {
  init(_p, cx) {
    this.role = blockProps()?.role ?? "panel";
    if (this.role !== "toggle") {
      this.box = InputState.new({ placeholder: "問 trend agent，例如：這週 AI 圈最大的事是什麼？" });
      this.box.on("submit", (_e, cx) => cx.spawn(async (cx) => this.askFree(cx))); // Enter
    }
    this.view = "list";   // "list" (the topics), "videos", "reports", or a report's file name
    this.load(cx);
    if (this.role !== "toggle") cx.spawn(async (cx) => {
      for (;;) {
        const e = await nextWebEvent();
        // our pages (and a report) stay ours: a link to a site mod.json allows (YouTube, for the player) would load
        // in the element itself with no way back, so the page comes back and the link opens in the browser
        if ([LIST_CELL, REPORTS_CELL, VIDEOS_CELL, REPORT_CELL].includes(e?.id) && e.kind === "url" && /^https?:/i.test(e.url ?? "")) {
          webCall(e.id, e.id === REPORT_CELL ? "back" : "home");
          if (Date.now() - (this.leftAt ?? 0) > 3000) openLink(e.url);   // its redirects come as more url events: one browser tab
          this.leftAt = Date.now();
          continue;
        }
        // the player page says how far you got (#t=<seconds> every few seconds, 0 at the end): kept per video, saved
        // by load(), and the next play of it starts there
        if (e?.id === VIDEO_CELL && e.kind === "url" && this.playing && (e.url ?? "").includes(this.playing.id)) {
          const m = /#t=(\d+)/.exec(e.url ?? "");
          if (m) { (this.progress ??= {})[this.playing.id] = Number(m[1]); this.progressDirty = true; }
          continue;
        }
        if ((e?.id === LIST_CELL || e?.id === REPORTS_CELL || e?.id === VIDEOS_CELL) && e.kind === "url") { this.fromPage(e.url ?? "", cx); continue; }
        if (e?.id !== REPORT_CELL) continue;
        this.webNote = e.kind === "failed" ? `載入失敗：${e.error ?? ""}` : e.kind === "blocked" && e.url ? `已用瀏覽器開：${e.url}` : null;
        cx.notify();
      }
    });
    cx.timer.every(15000, (cx) => this.load(cx)); // fetch.js writes once an hour; this also keeps 「幾分前」 fresh
    cx.timer.every(1000, (cx) => { if (this.kitChanged) { this.kitChanged = false; cx.notify(); } }); // a trend agent's folder found
  }

  get dir() { return `${appHome().replace(/\\/g, "/")}/trend`; }
  async load(cx) {
    const [t, s, f, v, p] = await Promise.all(["trends.json", "status.json", "feeds.json", "videos.json", "player"].map((n) => readTextFile(`${this.dir}/${n}`).catch(() => null)));
    this.player = (p ?? "").split("\n")[0].trim();
    // how far you got in each video (progress.json): read once, then saved here when it changed
    const pf = `${this.dir}/progress.json`;
    if (this.progress === undefined) try { this.progress = JSON.parse((await readTextFile(pf).catch(() => null)) ?? "{}") ?? {}; } catch { this.progress = {}; }
    else if (this.progressDirty) {
      this.progressDirty = false;
      await writeTextFile(pf, JSON.stringify(this.progress) + "\n", await readTextFile(pf).catch(() => null)).catch(() => { this.progressDirty = true; });
    }
    // the videos you starred (stars.json, the panel's own): kept for good, whatever the searches find or drop
    if (this.stars === undefined) try { this.stars = JSON.parse((await readTextFile(`${this.dir}/stars.json`).catch(() => null)) ?? "{}") ?? {}; } catch { this.stars = {}; }
    // the key points of the video playing, once the trend agent has written them (📝 整理重點)
    this.notes = this.playing ? await readTextFile(`${this.dir}/notes/${this.playing.id}.txt`).catch(() => null) : null;
    try { this.feeds = f ? JSON.parse(f) : null; } catch { this.feeds = null; }
    // Reddit blocked the house's IP: the button says so, once (fetch.js waits 6, 12, 24 hours before trying again)
    const blocked = this.feeds?.redditBlockedAt ?? null;
    if (this.role === "toggle" && this.redditBlockedSeen !== undefined && blocked && blocked !== this.redditBlockedSeen)
      notify({ title: "熱門：Reddit 擋了家裡的 IP", body: this.feeds.errors?.reddit ?? "", level: "warning", timeout: 10000 });
    this.redditBlockedSeen = blocked;
    try { this.videos = v ? JSON.parse(v) : null; } catch { this.videos = null; }
    try { this.data = t ? JSON.parse(t) : null; this.bad = null; } catch (e) { this.bad = `trends.json 讀不懂：${e.message ?? e}`; }
    try { this.status = s ? JSON.parse(s) : null; } catch { this.status = null; }
    await this.loadReports();
    if (this.role !== "toggle" && !checking()) await this.writePages();
    cx.notify();
  }
  get reportDir() { return `${appHome().replace(/\\/g, "/")}/mods/trend/.reports`; }
  // the reports newest first, each file read once for its topic and title (a half-written one: again next time)
  async loadReports() {
    let names = [];
    try { names = (await fsp.readdir(this.reportDir)).filter((n) => /\.html?$/i.test(n) && !n.startsWith(".")).sort().reverse(); } catch {}
    this.reportInfo ??= new Map();
    for (const n of names) {
      if (this.reportInfo.has(n)) continue;
      const html = (await readTextFile(`${this.reportDir}/${n}`).catch(() => null)) ?? "";
      if (/<\/html>/i.test(html)) this.reportInfo.set(n, { topic: metaTopic(html), title: htmlTitle(html) });
    }
    const before = this.reports;
    this.reports = names.filter((n) => this.reportInfo.has(n)).map((n) => ({ name: n, ...this.reportInfo.get(n) }));
    // a new one: the tab-bar button says so (one copy: the button), once
    if (this.role === "toggle" && before) for (const r of this.reports.filter((r) => !before.some((b) => b.name === r.name)))
      notify({ title: "熱門：報告寫好了", body: r.title || r.topic || r.name, level: "success", timeout: 8000 });
    if (!["list", "reports", "videos"].includes(this.view) && !this.reports.some((r) => r.name === this.view)) this.view = "reports";
  }
  reportFor(topic) { return (this.reports ?? []).find((r) => r.topic === topic) ?? null; }

  tabButton(t, z, view, label) {
    const on = this.view === view || (view === "reports" && !["list", "videos"].includes(this.view));
    return div().id(`tab-${view}`).h(28).px(10).flex().items_center().rounded(6).cursor_pointer().font_semibold()
      .bg(on ? t.selected : t.surface).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop).on_click((_e, cx) => {
        // its own tab again: its page back to the top of itself, wherever it went
        if (this.view === view && PAGE_CELLS[view]) webCall(PAGE_CELLS[view], "home");
        this.view = view; cx.notify();
      }).child(label);
  }
  // the reports: a web page like the list's (writePages), newest first; a card opens its report
  reportList(t, z) {
    if (!this.reports?.length) return div().flex_1().p(14).text_color(t.muted).whitespace_normal()
      .child("還沒有報告：在熱門按「🔎 深入查」，trend agent 查完會把報告寫在這裡。");
    return this.pageCell(t, REPORTS_CELL, "reports.html");
  }
  // a report as a web page (the system's WebKit / WebView2); links in it open in the browser
  reportView(t, z) {
    const r = (this.reports ?? []).find((x) => x.name === this.view);
    const small = (id, label, fn) => smallBtn(t, z, id, label, fn);
    return v_flex().flex_1().min_h(0)
      .child(h_flex().h(34).px(8).gap(6).flex_none().items_center().border_b(1).border_color(t.border)
        .child(small("rep-back", "← 報告", (_e, cx) => { this.view = "reports"; cx.notify(); }))
        .child(div().flex_1().min_w(0).truncate().text_size(z - 1).text_color(t.muted).child(r?.title || r?.topic || this.view))
        .child(small("rep-reload", "⟳", () => webCall(REPORT_CELL, "reload"))))
      .when(Boolean(this.webNote), (el) => el.child(div().px(10).py(4).text_size(z - 1.5).text_color(t.muted).truncate().child(this.webNote)))
      .child(div().flex_1().min_h(0).child(web.new(REPORT_CELL, { src: fileUrl(`${this.reportDir}/${this.view}`) })));
  }
  // where a video plays: the player page in trend/player (?t=: from where you left it), else YouTube's watch page
  // (&t=…s); playFrom is set when you press play, so the page doesn't reload as the progress comes in
  playSrc(x) {
    const from = this.playFrom > 0 ? this.playFrom : 0;
    if (!this.player?.includes("{id}")) return `https://www.youtube.com/watch?v=${x.id}${from ? `&t=${from}s` : ""}`;
    const u = this.player.replace("{id}", x.id);
    return from ? `${u}${u.includes("?") ? "&" : "?"}t=${from}` : u;
  }
  // one video played here (the player page in trend/player, else YouTube's watch page); 📝 整理重點 asks the trend
  // agent (tokens) for its key points, which it writes to trend/notes/<id>.txt: shown under the player
  videoPlayer(t, z) {
    const x = this.playing, notes = this.notes?.trim(), label = `📝 整理重點：${x.title}`;
    const asked = this.asked?.sent === label || this.asked?.opening === label || this.asked?.sending === label;
    return v_flex().flex_1().min_h(0)
      .child(h_flex().h(34).px(8).gap(6).flex_none().items_center().border_b(1).border_color(t.border)
        .child(smallBtn(t, z, "vid-back", "← 影片", (_e, cx) => { this.playing = null; this.notes = null; cx.notify(); }))
        .child(div().flex_1().min_w(0).truncate().text_size(z - 1).text_color(t.muted).child(x.title))
        .child(smallBtn(t, z, "vid-notes", notes ? "📝 重新整理" : "📝 整理重點",
          (_e, cx) => cx.spawn(async (cx) => this.ask(label, notesAsk(x, `${this.dir}/notes/${x.id}.txt`), cx)))))
      .child(div().flex_1().min_h(0).child(web.new(VIDEO_CELL, { src: this.playSrc(x) })))
      .when(Boolean(notes), (el) => el.child(div().id("vid-notes-text").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(8)
        .border_t(1).border_color(t.border).whitespace_normal().on_mouse_down("right", copyOn(notes)).child(notes)))
      .when(!notes && asked, (el) => el.child(div().flex_none().px(12).py(8).border_t(1).border_color(t.border).text_color(t.muted)
        .whitespace_normal().child("trend agent 整理中，好了會出現在這裡。")));
  }
  // My videos: what fetch.js's YouTube searches (one per line of videos.txt) found, a web page like the list's
  // (writePages): a chip per search, newest found first; a click plays it here
  videoList(t, z) {
    if (this.playing) return this.videoPlayer(t, z);
    if (!this.videos?.queries?.length && !Object.keys(this.stars ?? {}).length) return div().flex_1().p(14).text_color(t.muted).whitespace_normal()
      .child(`在 ${this.dir}/videos.txt 一行寫一個 YouTube 搜尋（例如 TWICE 子瑜），排程每 3 小時搜一次這週的新影片；按 ↻ 現在更新 馬上搜。`);
    return this.pageCell(t, VIDEOS_CELL, "videos.html");
  }
  get results() { return Array.isArray(this.data?.results) ? this.data.results : []; }
  // What the list shows: last30days' topics, then everything the sites' own front pages gave (HN, Reddit, PTT, Dcard,
  // Threads, Digg), taken in turn (each site's rank), skipping a story a topic already cites; the subject chips sort it.
  // A story on several sites (or boards) is one card: a row whose title shares enough with an earlier row's joins it
  // (its .also). Worked out again only when the files change.
  get shown() {
    if (this.shownOf && this.shownOf.data === this.data && this.shownOf.feeds === this.feeds) return this.shownOf.rows;
    const topics = this.results, cited = new Set(topics.flatMap((r) => r.evidence_urls ?? []));
    const moved = (x) => ({ first: x.first, rise: x.rise, body: x.body });   // fetch.js: when it showed up, how its score rose, its text
    const hn = (this.feeds?.hn ?? []).map((h) => ({ topic: h.title, feed: "HN", line: `HN ${num(h.points)} 分 · ${num(h.comments)} 留言`, ...moved(h),
      why_spiking: shortLink(h.url).split("/")[0], evidence_urls: [h.url, h.discussion].filter((u, i, a) => u && a.indexOf(u) === i) }));
    const digg = (this.feeds?.digg ?? []).map((d) => ({ topic: d.title, feed: "Digg", ...moved(d),
      line: `Digg ${num(d.score)} 分 · ${d.sources} 個來源${DIGG_TOPIC[d.topic] ? ` · ${DIGG_TOPIC[d.topic]}` : ""}`,
      why_spiking: d.description, evidence_urls: [d.url], digg: d.topic }));
    const reddit = (this.feeds?.reddit ?? []).map((p) => ({ topic: p.title, feed: "Reddit", line: `Reddit ${num(p.score)} 分 · ${num(p.comments)} 留言`, sub: p.subreddit, ...moved(p),
      why_spiking: [p.subreddit, shortLink(p.url).split("/")[0]].filter(Boolean).join(" · "), evidence_urls: [p.url, p.discussion].filter((u, i, a) => u && a.indexOf(u) === i) }));
    const ptt = (this.feeds?.ptt ?? []).map((p) => ({ topic: p.title, feed: "PTT", line: `PTT ${p.score >= 100 ? "爆" : `${p.score} 推`} · ${p.board}`, board: p.board, ...moved(p),
      why_spiking: [p.board, p.author].filter(Boolean).join(" · "), evidence_urls: [p.url] }));
    const dcard = (this.feeds?.dcard ?? []).map((p) => ({ topic: p.title, feed: "Dcard", line: `Dcard ${num(p.score)} 心情 · ${num(p.comments)} 留言 · ${p.board}`, ...moved(p),
      forum: p.forum, why_spiking: p.board, evidence_urls: [p.url] }));
    const threads = (this.feeds?.threads ?? []).map((p) => ({ topic: p.title, feed: "Threads", line: `Threads ${num(p.score)} 讚 · ${num(p.comments)} 回覆`, ...moved(p),
      why_spiking: `@${p.author}`, evidence_urls: [p.url] }));
    const out = [...topics], names = new Set(topics.map((r) => r.topic)), feeds = [hn, reddit, ptt, dcard, threads, digg];
    for (let i = 0; feeds.some((f) => i < f.length); i++)
      for (const x of feeds.map((f) => f[i])) if (x && !names.has(x.topic) && !x.evidence_urls.some((u) => cited.has(u))) {
        names.add(x.topic);
        out.push(x);
      }
    const rows = [];
    for (const x of out) {
      const key = x.feed ? titleKey(x.topic) : null;   // last30days' topics stay on their own
      const into = key && key.size >= 3 && rows.find((r) => r.key && r.key.size >= 3 && similar(r.key, key) >= SAME);
      if (into) (into.also ??= []).push(x); else rows.push({ ...x, key, rank: rows.length + 1 });
    }
    this.shownOf = { data: this.data, feeds: this.feeds, rows };
    return rows;
  }
  // a run killed midway (the Mac slept, shut down) never writes finished: after 30 minutes it isn't running
  get running() { return Boolean(this.status?.started && !this.status?.finished && Date.now() - Date.parse(this.status.started) < 1800000); }
  get failed() { return this.status?.ok === false ? this.status.error || "上次沒抓成功" : null; }

  // fetch.js --videos: the 影片 searches that are due (a new one is), with the node the job uses (Herdr's own PATH may
  // lack Homebrew's)
  async searchVideos() {
    let node = "node";
    if (window()?.platform !== "windows") for (const p of ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"])
      if (await fsp.access(p).then(() => true, () => false)) { node = p; break; }
    await exec(node, [`${appHome().replace(/\\/g, "/")}/mods/trend/fetch.js`, "--videos"]);
  }
  // ↻: run the scheduled job now (launchd on macOS, Task Scheduler on Windows); it writes status.json at once
  async kick(cx) {
    this.msg = null;
    try {
      const r = window()?.platform === "windows"
        ? await exec("C:\\Windows\\System32\\schtasks.exe", ["/Run", "/TN", TASK])
        : await exec("/bin/launchctl", ["kickstart", `gui/${(await exec("/usr/bin/id", ["-u"])).stdout.trim()}/${JOB}`]);
      if (r.code !== 0) this.msg = `排程還沒裝（docs/trend.md「安裝」）：${(r.stderr || r.stdout).trim().slice(0, 120)}`;
    } catch (e) { this.msg = `沒跑起來：${e?.message ?? e}`; }
    cx.timer.after(1500, (cx) => this.load(cx));
    cx.notify();
  }

  // ---- asking the trend agent (as Gerrit's panel asks its gerrit agent)
  // Only kit trend agents (folder's .agentkit says agent:trend): another agent may lack last30days. This space's first.
  agentList() {
    let all = [];
    try { all = (agents() ?? []).filter((x) => x?.address); } catch {}
    // an agent that never sent Herdr a status report shows as its shell, or not at all: the program in front decides
    // (as kit's place.js does), so asking again doesn't open a second one
    try {
      const seen = new Set(all.map((x) => x.address));
      for (const t of terminals() ?? []) if (t?.address && !seen.has(t.address) && runsAgent(t))
        all.push({ address: t.address, space: t.labels?.["herdr.space"] ?? null, title: t.title, app: t.foreground.argv[0] });
    } catch {}
    const kit = this.kitAgents(all), here = this.currentSpace()?.id;
    return all.filter((x) => kit.has(x.address)).sort((a, b) => Number(b.space === here) - Number(a.space === here));
  }
  // The agents whose folder (or one up to 3 above) has an .agentkit saying agent:trend; each folder read once a minute
  kitAgents(all) {
    this.kitDirs ??= new Map();
    let cwds = new Map();
    try { cwds = new Map((terminals() ?? []).map((t) => [t?.address, t?.cwd])); } catch {}
    const found = new Set();
    for (const x of all) {
      const cwd = cwds.get(x.address);
      if (!cwd || x.address.includes("/")) continue;   // another machine's folder can't be read from here
      const dirs = [];
      for (let d = String(cwd).replace(/[\\/]+$/, ""), i = 0; d && i < 4; i++) {
        dirs.push(d);
        const up = d.replace(/[\\/][^\\/]*$/, "");
        if (up === d) break;
        d = up;
      }
      if (dirs.some((d) => this.kitDirs.get(d)?.trend)) found.add(x.address);
      for (const d of dirs) {
        const k = this.kitDirs.get(d);
        if (k && (k.reading || Date.now() - k.at < 60000)) continue;
        this.kitDirs.set(d, { trend: k?.trend ?? false, at: Date.now(), reading: true });
        readTextFile(`${d}/.agentkit`).then(isTrendKit, () => false).then((trend) => {
          this.kitDirs.set(d, { trend, at: Date.now() });
          if (trend !== Boolean(k?.trend)) this.kitChanged = true;
        });
      }
    }
    return found;
  }
  currentSpace() {
    let f = null, all = [];
    try { f = focused(); all = spaces() ?? []; } catch {}
    return all.find((s) => s.id === f?.space) ?? null;
  }
  kitHasTrend() { return (shared(KIT_AGENTS)?.agents ?? []).some((a) => a?.name === "trend"); }
  openTool() { const t = localStorage.getItem("tool"); return TOOLS.includes(t) ? t : "claude"; }
  picked(list) { const want = this.agentAddr ?? localStorage.getItem("agent"); return list.find((x) => x.address === want) ?? list[0] ?? null; }

  async ask(label, text, cx) {
    const target = this.picked(this.agentList());
    if (!target) return this.openAndAsk(label, text, cx);
    this.asked = { sending: label };
    cx.notify();
    let err = null;
    try {
      // Herdr's own hc(): it reaches the running core
      const out = await herdrHc(["send", target.address, skillFor(text, toolOf(target.app))]);
      if (out?.code !== 0) err = String(out?.stderr || out?.stdout || `exit ${out?.code}`).trim().slice(0, 200);
    } catch (e) { err = String(e?.message ?? e); }
    this.asked = err ? { error: `沒送出：${err}` } : { sent: label, to: target.title || target.tab_name || target.address };
    if (!err) try { run("agent.focus", { terminal: target.address }); } catch {}
    cx.notify();
  }
  // None here: the Kit panel puts a trend agent in this space (kit place) with the question as its first message
  openAndAsk(label, text, cx) {
    const space = this.currentSpace();
    if (!space) { this.asked = { error: "沒有開著的 space" }; cx.notify(); return; }
    if (!this.kitHasTrend()) { this.asked = { error: "kit 來源還沒有 trend agent（docs/trend.md「安裝」）" }; cx.notify(); return; }
    const id = `trend-${Date.now()}-${Math.random()}`, tool = this.openTool();
    const plain = { id: space.id, name: space.name ?? "", machine: space.machine ?? null, folder: space.folder ?? "" };
    const asks = Array.isArray(shared(KIT_PLACE_ASK)) ? shared(KIT_PLACE_ASK) : [];
    setShared(KIT_PLACE_ASK, [...asks, { id, agent: "trend", space: plain, tool, label: "熱門面板", at: Date.now(), task: skillFor(text, tool) }]);
    this.asked = { opening: label, to: `trend（在 ${space.name || "這個 space"} 開一個）` };
    cx.timer.after(KIT_TAKEN_WAIT, (cx) => {
      const left = Array.isArray(shared(KIT_PLACE_ASK)) ? shared(KIT_PLACE_ASK) : [];
      if (!left.some((x) => x?.id === id)) return;
      setShared(KIT_PLACE_ASK, left.filter((x) => x?.id !== id));
      this.asked = { error: "Kit 面板沒有接手：版面裡要有 Kit 的按鈕（或從 Agents 面板把 trend 拖到 space）" };
      cx.notify();
    });
    cx.notify();
  }
  async askFree(cx) {
    const q = this.box.value().trim();
    if (!q) return;
    this.box.set_value("");
    await this.ask("你的問題", q, cx);
  }

  render(cx) {
    if (this.role === "toggle") return this.renderToggle();
    const t = theme(), z = fs();
    return v_flex().id("trend").size_full().bg(t.surface).text_size(z).text_color(t.foreground)
      .child(this.header(t, z))
      .child(this.view === "list" ? this.list(t, z) : this.view === "videos" ? this.videoList(t, z) : this.view === "reports" ? this.reportList(t, z) : this.reportView(t, z))
      .child(this.askCard(t, z))
      // a video left (← 影片, another tab): a web element lives on unseen, so its page turns to a blank one, or the
      // video would keep playing; drawn 1 px, only once a video was played
      .when(Boolean(this.played) && !(this.view === "videos" && this.playing), (el) => el.child(div().w(1).h(1).flex_none()
        .child(web.new(VIDEO_CELL, { src: fileUrl(`${this.viewDir}/blank.html`) }))));
  }

  // The tab-bar button: 熱門, how many topics you haven't seen, a ring while fetching, ! when the last run failed
  renderToggle() {
    const t = theme(), node = find(layout(), PANEL), on = node && !node.hidden;
    const seen = new Set(Array.isArray(shared(SEEN)) ? shared(SEEN) : []);
    const fresh = this.shown.filter((r) => !seen.has(r.topic)).length;
    const badge = this.running ? spin(12, t.muted)
      : this.failed ? div().text_color(t.ansi1).child("!")
      : fresh ? div().px(5).rounded(8).text_size(11).font_semibold().bg(t.blocked).text_color(t.background).child(String(fresh)) : null;
    return h_flex().size_full().pr(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("toggle-trend").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((st) => st.bg(t.hover)).on_mouse_down("left", stop)
        .on_click((_e, cx) => {
          if (!on) setShared(SEEN, this.shown.map((r) => r.topic)); // opening it: what it shows now counts as seen
          run("layout.toggle", { id: PANEL });
          cx.notify();
        })
        .child("熱門")
        .when(Boolean(badge), (el) => el.child(badge)));
  }

  header(t, z) {
    const btn = (id, label, fn) => div().id(id).h(28).px(10).flex().items_center().rounded(6).cursor_pointer().bg(t.raised).text_color(t.foreground)
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click(fn).child(label);
    const done = Date.parse(this.status?.finished ?? this.data?.generated_at ?? "");
    const next = Date.parse(this.status?.started ?? "") + HOUR;
    const line = this.running ? `更新中…（${ago(Date.parse(this.status.started)).replace("前", "開始")}，通常幾分鐘）`
      : this.bad ?? this.failed ?? (Number.isFinite(done) ? `更新於 ${ago(done)}${Number.isFinite(next) && next > Date.now() ? ` · 下次約 ${hhmm(next)}` : ""} · 不花 token` : "還沒有資料：排程還沒跑過（docs/trend.md「安裝」）");
    const red = Boolean(this.bad || (this.failed && !this.running));
    // One row, each site once: ✓ when it answered (last30days' search and the site's own front page), else why not.
    // Reddit, PTT, Dcard and Threads are only their front pages, read every 2 to 4 hours (how long ago, red when blocked).
    // Right-click copies the reason.
    const st = this.data?.source_status ?? {}, fe = this.feeds ?? {};
    const site = (key, name, l30, feed) => {
      const why = (l30 && st[l30] && st[l30] !== "ok" ? STATE[st[l30]] ?? st[l30] : null) ?? (feed ? fe.errors?.[feed] ?? null : null);
      const ok = !why && (!feed || (fe[feed]?.length ?? 0) > 0);
      return { key, name, why, ok, when: ok && fe[`${feed}At`] ? ` ${ago(Date.parse(fe[`${feed}At`]))}` : "", red: Boolean(fe[`${feed}BlockedAt`]) };
    };
    const sites = [site("hn", "HN", "hackernews", "hn"), site("reddit", "Reddit", null, "reddit"), site("ptt", "PTT", null, "ptt"),
      site("dcard", "Dcard", null, "dcard"), site("threads", "Threads", null, "threads"), site("digg", "Digg", "digg", "digg"),
      ...Object.keys(st).filter((k) => !["hackernews", "digg", "reddit"].includes(k)).map((k) => site(k, SOURCE[k] ?? k, k, null))];
    return v_flex().flex_none().border_b(1).border_color(t.border)
      .child(h_flex().px(10).py(6).gap(6).items_center()
        .child(h_flex().flex_1().min_w(0).gap(2).items_center()
          .child(this.tabButton(t, z, "list", "熱門"))
          .child(this.tabButton(t, z, "videos", `影片${this.videos?.items?.length ? ` ${this.videos.items.length}` : ""}`))
          .child(this.tabButton(t, z, "reports", `報告${this.reports?.length ? ` ${this.reports.length}` : ""}`)))
        .child(btn("refresh", this.running ? "更新中…" : "↻ 現在更新", (_e, cx) => cx.spawn(async (cx) => this.kick(cx))))
        .when(Boolean(find(layout(), PANEL)), (el) => el.child(btn("zoom", "⤢", () => run("layout.zoom", { id: PANEL }))))   // alone in its row; again: back
        .when(Boolean(find(layout(), TOGGLE)), (el) => el.child(btn("hide", "✕", () => run("layout.hide", { id: PANEL })))))
      .child(h_flex().px(12).pb(4).gap(5).items_center().min_w(0)
        .when(this.running, (el) => el.child(spin(z - 3, t.muted)))
        .child(div().id("status").flex_1().min_w(0).text_size(z - 1.5).truncate().text_color(red ? t.ansi1 : t.muted)
          .on_mouse_down("right", copyOn(line)).child(line)))
      .when(Boolean(this.msg), (el) => el.child(div().id("msg").px(12).pb(4).text_size(z - 1.5).text_color(t.ansi1).whitespace_normal()
        .on_mouse_down("right", copyOn(this.msg)).child(this.msg)))
      .when(Boolean(this.data || this.feeds), (el) => el.child(h_flex().px(12).pb(6).gap(10).flex_wrap().items_center().text_size(z - 2)
        .child(div().text_color(t.dim).child("來源"))
        .children(sites.map((s) => div().id(`site-${s.key}`).text_color(s.ok ? t.ansi2 : s.red ? t.ansi1 : t.dim).on_mouse_down("right", copyOn(s.why ?? ""))
          .child(s.ok ? `${s.name} ✓${s.when}` : `${s.name} ${s.why ?? "—"}`)))));
  }

  // the list: the web page writePages() keeps up to date
  list(t, z) {
    if (!this.shown.length) {
      const why = this.data?.outcome === "nothing-solid" ? `這一輪沒有夠強的熱門${this.data.weak_signal ? `（最接近的：${this.data.weak_signal}）` : ""}` : "還沒有主題";
      return div().flex_1().p(14).text_color(t.muted).child(why);
    }
    return this.pageCell(t, LIST_CELL, "list.html");
  }
  // one of the pages in .view/ (its first write: a moment of 「載入中」). Its src carries the time it was written, so a
  // new write loads it again, wherever the element went since (the same src never reloads)
  pageCell(t, cell, file) {
    if (this.written?.[file] === undefined) return div().flex_1().p(14).text_color(t.muted).child("載入中…");
    return div().flex_1().min_h(0).child(web.new(cell, { src: `${fileUrl(`${this.viewDir}/${file}`)}?v=${this.written[file].at}` }));
  }
  get viewDir() { return `${appHome().replace(/\\/g, "/")}/mods/trend/.view`; }
  async writePages() {
    await this.writePage("list.html", this.listHtml());
    await this.writePage("reports.html", this.reportsHtml());
    await this.writePage("videos.html", this.videosHtml());
    await this.writePage("blank.html", '<!doctype html><meta charset="utf-8"><body style="background:#000"></body>');
  }
  // written only when it changed (the page keeps its subject and scroll: its localStorage)
  async writePage(file, html) {
    this.written ??= {};
    if (html === this.written[file]?.html) return;
    const path = `${this.viewDir}/${file}`;
    try {
      await fsp.mkdir(this.viewDir, { recursive: true });
      await writeTextFile(path, html, await readTextFile(path).catch(() => null));
    } catch { return; }   // tried again on the next load (15 s)
    this.written[file] = { html, at: Date.now() };
  }
  // A click in a page: #do=deep|three|report&topic=… or do=open&name=…, &n=<the click's time>; each click once (a
  // reload repeats the url)
  fromPage(url, cx) {
    const h = new URLSearchParams(url.split("#")[1] ?? ""), n = h.get("n"), act = h.get("do");
    if (!act || !n || this.pageClicks?.has(n)) return;
    (this.pageClicks ??= new Set()).add(n);
    if (act === "open") {
      if (this.reports?.some((r) => r.name === h.get("name"))) { this.view = h.get("name"); this.webNote = null; cx.notify(); }
      return;
    }
    if (act === "play") {
      const x = this.videos?.items?.find((i) => i.id === h.get("name")) ?? this.stars?.[h.get("name")];
      if (!x) return;
      this.playing = x; this.playFrom = this.progress?.[x.id] > 5 ? this.progress[x.id] : 0; this.played = true; this.notes = null; this.load(cx);
      // what you play: fetch.js suggests searches from it (channels, title words); the newest 300
      cx.spawn(async () => {
        const file = `${this.dir}/plays.json`, was = await readTextFile(file).catch(() => null);
        let plays = [];
        try { plays = JSON.parse(was ?? "[]"); } catch {}
        plays = [{ id: x.id, title: x.title, channel: x.channel, query: x.query, at: new Date().toISOString() }, ...(Array.isArray(plays) ? plays : [])].slice(0, 300);
        await writeTextFile(file, JSON.stringify(plays) + "\n", was).catch(() => {});
      });
      return;
    }
    // ☆ on a card stars the video (kept in stars.json, shown under ⭐ 收藏 for good); ⭐ unstars it
    if (act === "star") {
      const id = h.get("name"), x = this.videos?.items?.find((i) => i.id === id) ?? this.stars?.[id];
      if (!x || !this.stars) return;
      if (this.stars[id]) delete this.stars[id];
      else this.stars[id] = { ...x, starred: new Date().toISOString() };
      const stars = JSON.stringify(this.stars) + "\n";
      cx.spawn(async (cx) => {
        const file = `${this.dir}/stars.json`;
        await writeTextFile(file, stars, await readTextFile(file).catch(() => null)).catch(() => {});
        await this.writePages();
        cx.notify();
      });
      return;
    }
    // a suggested search: ＋ puts it in videos.txt and searches it now (fetch.js --videos; the page says 搜尋中 meanwhile),
    // ✕ puts it in videos-skip.txt (never suggested again)
    if (act === "add" || act === "skip") {
      const q = (h.get("name") ?? "").trim();
      if (!q) return;
      (this.handled ??= new Set()).add(q);   // gone from the page now; videos.json drops it on the next run
      cx.spawn(async (cx) => {
        const file = `${this.dir}/${act === "add" ? "videos.txt" : "videos-skip.txt"}`, was = await readTextFile(file).catch(() => null);
        await writeTextFile(file, `${was ?? ""}${was && !was.endsWith("\n") ? "\n" : ""}${q}\n`, was).catch(() => {});
        await this.writePages();
        cx.notify();
        if (act !== "add") return;
        (this.searching ??= new Set()).add(q);
        await this.writePages();
        // one search run at a time: two at once would both rewrite videos.json
        this.searchRun = (this.searchRun ?? Promise.resolve()).then(() => this.searchVideos()).catch(() => {});
        await this.searchRun;
        this.searching.delete(q);
        await this.load(cx);
      });
      return;
    }
    const r = this.shown.find((x) => x.topic === h.get("topic"));
    if (!r) return;
    if (act === "report" && this.reportFor(r.topic)) { this.view = this.reportFor(r.topic).name; this.webNote = null; cx.notify(); return; }
    const p = PRESETS[act === "deep" ? 0 : act === "three" ? 1 : -1];
    if (p) cx.spawn(async (cx) => this.ask(`${p.label}：${r.topic}`, p.text(r), cx));
  }
  // the 熱門 list: subject chips (全部 and each subject with rows), then a card per row by subject
  listHtml() {
    const seen = new Set(Array.isArray(shared(SEEN)) ? shared(SEEN) : []);
    const groups = new Map(CATS.map((c) => [c, []]));
    for (const r of this.shown) groups.get(categoryOf(r)).push(r);
    const used = [...groups].filter(([, rows]) => rows.length);
    const since = Date.parse(this.feeds?.since ?? ""), hour = 3600000;
    // 升溫: its score up by 10 or more and a fifth or more in the last 1 to 3 hours; 新進榜: here for under 3 hours, once
    // fetch.js has kept history for 6 (before that, everything would look new)
    const rising = (x) => x.rise && x.rise.by >= 10 && x.rise.by >= 0.2 * Math.max(x.rise.from, 1);
    const fresh = (x) => x.first && Date.now() - Date.parse(x.first) < 3 * hour && Date.now() - since > 6 * hour;
    const card = (r) => {
      const all = [r, ...(r.also ?? [])], up = all.filter(rising).sort((a, b) => b.rise.by - a.rise.by)[0];
      const sites = new Set(all.map((x) => x.feed)).size;
      const links = (r.evidence_urls ?? []).filter((u) => /^https?:\/\//i.test(u));
      const title = links[0] ? `<a class="title" href="${esc(links[0])}">${esc(r.topic)}</a>` : `<span class="title">${esc(r.topic)}</span>`;
      const line = r.line ?? (engagementText(r.engagement) || (r.sources ?? []).map((s) => SOURCE[s] ?? s).join("、"));
      // the post's own text (PTT, Dcard's excerpt, Threads, Reddit): its first lines on the card, all of it under 更多
      // (Threads' title is already its first 120 characters)
      const body = String(r.body ?? "").trim(), longer = body && !(r.feed === "Threads" && body.replace(/\s+/g, " ").length <= 120);
      const more = [longer ? `<div class="body">${esc(body)}</div>` : "", r.top_comment ? `<blockquote>${esc(r.top_comment)}</blockquote>` : "",
        links.length ? `<div class="links">${links.slice(0, 6).map((u) => `<a href="${esc(u)}">↗ ${esc(shortLink(u))}</a>`).join("")}</div>` : ""].join("");
      // the same story elsewhere: each with its own numbers and link
      const also = r.also?.length ? `<div class="also">${r.also.map((a) => `<a href="${esc(a.evidence_urls[0])}"><b>${esc(a.feed)}</b> ${esc(a.topic)}<span>${esc(a.line ?? "")}</span></a>`).join("")}</div>` : "";
      return `<div class="card" data-topic="${esc(r.topic)}"${up ? " data-rising" : ""}${all.some(fresh) ? " data-new" : ""}>`
        + `<div class="top">${seen.has(r.topic) ? "" : '<span class="dot"></span>'}${title}`
        + `${up ? `<span class="chip up">↑ +${num(up.rise.by)}・${up.rise.hours} 小時</span>` : ""}${all.some(fresh) ? '<span class="chip new">新進榜</span>' : ""}`
        + `${MOMENTUM[r.momentum] ? `<span class="chip ${r.momentum === "new-this-week" ? "new" : "up"}">${MOMENTUM[r.momentum]}</span>` : ""}`
        + `${r.also?.length ? `<span class="chip x">${sites > 1 ? `${sites} 站` : `${all.length} 篇`}</span>` : ""}`
        + `<span class="chip${r.feed ? "" : " x"}">${esc(r.feed ?? "跨站")}</span></div>`
        + `${line ? `<div class="meta">${esc(line)}</div>` : ""}${why(r) ? `<div class="why">${esc(why(r))}</div>` : ""}`
        + `${longer && r.feed !== "Threads" ? `<div class="excerpt">${esc(body)}</div>` : ""}${also}`
        + `${more ? `<details><summary>更多</summary>${more}</details>` : ""}`
        + `<div class="acts"><button class="main" data-do="deep">🔎 深入查</button><button data-do="three">三句話說明</button>`
        + `${this.reportFor(r.topic) ? '<button class="rep" data-do="report">📄 看報告</button>' : ""}</div></div>`;
    };
    const nUp = this.shown.filter((r) => [r, ...(r.also ?? [])].some(rising)).length, nNew = this.shown.filter((r) => [r, ...(r.also ?? [])].some(fresh)).length;
    // every subject has its chip (one with nothing this hour: greyed), so the set stays the same from hour to hour
    return pageHtml(`<nav><button data-cat="all">全部 ${this.shown.length}</button><button data-cat="rising"${nUp ? "" : " disabled"}>🔥 升溫 ${nUp}</button>`
      + `<button data-cat="new"${nNew ? "" : " disabled"}>🆕 新進榜 ${nNew}</button>${[...groups].map(([c, rows]) => `<button data-cat="${esc(c)}"${rows.length ? "" : " disabled"}>${esc(c)} ${rows.length}</button>`).join("")}</nav>`
      + `<main>${used.map(([c, rows]) => `<section data-cat="${esc(c)}"><h2>${esc(c)}</h2>${rows.map(card).join("")}</section>`).join("")}</main>`);
  }
  // the reports: a card each (title, when, the topic asked), newest first; a click opens it
  reportsHtml() {
    return pageHtml(`<main><h2>trend agent 的報告</h2>${(this.reports ?? []).map((r) => `<div class="card" data-do="open" data-name="${esc(r.name)}">`
      + `<div class="top"><span class="title">${esc(r.title || r.topic || r.name)}</span></div>`
      + `<div class="meta">${esc([reportWhen(r.name), r.topic].filter(Boolean).join(" · "))}</div></div>`).join("")}</main>`);
  }
  // the videos: a chip per search (videos.txt's order), its videos as cards with YouTube's thumbnail, newest found
  // first; a card plays it (do=play&name=<id>). When found: a date, not 「幾分前」, so the page doesn't change every minute
  videosHtml() {
    const v = this.videos ?? {}, items = v.items ?? [], t = theme(), sug = (v.suggest ?? []).filter((s) => !this.handled?.has(s.q));
    const when = (s) => { const d = new Date(Date.parse(s)); return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${hhmm(d.getTime())} 找到`; };
    const errs = [...[...(this.searching ?? [])].map((q) => `<p class="err" style="color:var(--muted)">正在搜「${esc(q)}」…</p>`),
      ...Object.entries(v.errors ?? {}).map(([q, e]) => `<p class="err">${esc(q ? `「${q}」：${e}` : e)}</p>`)].join("");
    const card = (x) => `<div class="card vid" data-do="play" data-name="${esc(x.id)}">`
      + `<img src="https://i.ytimg.com/vi/${esc(x.id)}/mqdefault.jpg" alt="" loading="lazy"><div class="vb">`
      + `<div class="title">${esc(x.title)}</div>`
      + `<div class="meta">${esc([x.channel, x.length, x.published, x.views].filter(Boolean).join(" · "))}</div>`
      + `<div class="meta">${esc([when(x.found), this.progress?.[x.id] > 5 ? `▶ 上次看到 ${mmss(this.progress[x.id])}` : ""].filter(Boolean).join(" · "))}</div></div>`
      + `<button class="star${this.stars?.[x.id] ? " on" : ""}" data-do="star" title="${this.stars?.[x.id] ? "取消收藏" : "收藏：一直留著"}">${this.stars?.[x.id] ? "⭐" : "☆"}</button></div>`;
    const starred = Object.values(this.stars ?? {}).sort((a, b) => String(b.starred).localeCompare(String(a.starred)));
    const groups = (v.queries ?? []).map((q) => [q, items.filter((x) => x.query === q)]);
    return pageHtml(`<style>.vid{display:flex;gap:10px;align-items:flex-start}.vid img{flex:none;width:136px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:var(--bg)}`
      + `.vb{flex:1;min-width:0}.err{margin:8px 12px;font-size:.88em;color:${t.ansi1}}`
      + `.star{flex:none;border:0;background:none;padding:0 2px;font-size:1.2em;line-height:1;color:var(--muted);cursor:pointer}.star:hover,.star.on{color:var(--yellow)}`
      + `.sugs{display:flex;flex-wrap:wrap;gap:6px;margin:0 10px 8px}.card.pill{display:inline-flex;align-items:center;gap:6px;margin:0;padding:3px 4px 3px 10px}`
      + `.pill button{font:inherit;font-size:.85em;padding:1px 7px;border-radius:5px;border:1px solid var(--border);background:var(--bg);color:var(--fg);cursor:pointer}</style>`
      + `<nav><button data-cat="all">全部 ${items.length}</button>${starred.length ? `<button data-cat="⭐ 收藏">⭐ 收藏 ${starred.length}</button>` : ""}`
      + `${groups.map(([q, xs]) => `<button data-cat="${esc(q)}"${xs.length ? "" : " disabled"}>${esc(q)} ${xs.length}</button>`).join("")}</nav>`
      + `<main>${sug.length ? `<h2>建議的主題（滑過看原因）</h2><div class="sugs">${sug.map((s) => `<div class="card pill" data-name="${esc(s.q)}" title="${esc(s.why)}">`
        + `<span>${esc(s.q)}</span><button data-do="add" title="加進 videos.txt">＋</button><button data-do="skip" title="不要，不再建議">✕</button></div>`).join("")}</div>` : ""}`
      + `${errs}${items.length ? "" : '<p class="err" style="color:var(--muted)">還沒找到影片</p>'}`
      + `${starred.length ? `<section data-cat="⭐ 收藏"><h2>⭐ 收藏</h2>${starred.map(card).join("")}</section>` : ""}`
      + `${groups.filter(([, xs]) => xs.length).map(([q, xs]) => `<section data-cat="${esc(q)}"><h2>${esc(q)}</h2>${xs.map(card).join("")}</section>`).join("")}</main>`);
  }

  // 問 agent: which trend agent (this space's first), the tool a new one opens with, a free question, what happened
  askCard(t, z) {
    const list = this.agentList(), picked = this.picked(list);
    const card = v_flex().id("ask").flex_none().gap(6).p(10).bg(t.chrome).border_t(1).border_color(t.border);
    card.child(div().text_size(z - 1).font_semibold().text_color(t.muted).child(picked ? `問 agent：${picked.title || picked.tab_name}（花 token）` : "問 agent（花 token）"));
    if (list.length > 1) card.child(h_flex().gap(6).flex_wrap().children(list.slice(0, 8).map((x, i) => {
      const on = picked?.address === x.address;
      return div().id(`ag-${i}`).px(8).py(3).rounded(5).text_size(z - 1.5).cursor_pointer()
        .bg(on ? t.accent : t.raised).text_color(on ? t.background : t.foreground).hover((h) => (on ? h : h.bg(t.hover)))
        .on_click((_e, cx) => { this.agentAddr = x.address; localStorage.setItem("agent", x.address); cx.notify(); })
        .child(`${x.title || x.tab_name || x.address}${x.space_name ? ` · ${x.space_name}` : ""}`);
    })));
    if (!list.length) card.child(div().text_size(z - 1.5).text_color(t.dim).whitespace_normal()
      .child(this.kitHasTrend() ? "還沒有 trend agent：問了會先在這個 space 開一個，開好就回答。" : "kit 來源還沒有 trend agent（docs/trend.md「安裝」）。"));
    if (!list.length && this.kitHasTrend()) card.child(h_flex().gap(6).items_center()
      .child(div().text_size(z - 1.5).text_color(t.dim).child("用"))
      .children(TOOLS.map((k) => {
        const on = this.openTool() === k;
        return div().id(`tool-${k}`).px(8).py(2).rounded(5).text_size(z - 1.5).cursor_pointer()
          .bg(on ? t.accent : t.raised).text_color(on ? t.background : t.foreground).hover((h) => (on ? h : h.bg(t.hover)))
          .on_click((_e, cx) => { localStorage.setItem("tool", k); cx.notify(); }).child(TOOL_NAMES[k]);
      }))
      .child(div().text_size(z - 1.5).text_color(t.dim).child("開")));
    card.child(h_flex().gap(6).items_center()
      .child(div().id("ask-box").flex_1().min_w(0).h(34).px(6).flex().items_center().rounded(6).bg(t.background).border_1().border_color(t.input)
        .cursor_text().child(Input.new(this.box).w_full().text_size(z).text_color(t.foreground)))
      .child(div().id("ask-send").h(34).px(14).flex().items_center().rounded(7).cursor_pointer().font_semibold().bg(t.solid).text_color(t.solid_foreground)
        .hover((s) => s.opacity(0.88)).on_click((_e, cx) => cx.spawn(async (cx) => this.askFree(cx))).child("送出")));
    const s = this.asked;
    if (s?.error) card.child(div().id("ask-err").text_size(z - 1).text_color(t.ansi1).whitespace_normal().on_mouse_down("right", copyOn(s.error)).child(s.error));
    else if (s?.sent) card.child(div().text_size(z - 1).text_color(t.ansi2).whitespace_normal().child(`✓「${s.sent}」已送給 ${s.to}，在它的分頁回答`));
    else if (s?.opening) card.child(div().text_size(z - 1).text_color(t.ansi2).whitespace_normal().child(`✓ ${s.to}，開好就回答「${s.opening}」`));
    return card;
  }
}
