// What's trending on the social sites now, beside your agents, and a trend agent to ask about it (like Gerrit's
// panel and its 問 agent). The data costs no tokens: launchd runs fetch.js every 10 minutes (last30days --discover, no
// model), which writes <Herdr home>/trend/trends.json and status.json; this mod only reads them (docs/trend.md).
// Asking costs tokens, only when you ask: the question goes to a kit trend agent (agents/trend.md in a kit source,
// skills: last30days) in this space with `hc send`; none here: the Kit panel places one (kit place) and it starts on
// the question.
// Roles (props.role): the panel (default) and "toggle", the tab-bar button that shows or hides the layout's
// "trend-panel": a number for topics you haven't seen, a ring while fetch.js runs, a red ! when its last run failed.
// 熱門：launchd 每 10 分鐘跑 fetch.js（不花 token）寫 trend/；這個 mod 只讀。問問題才叫 trend agent（花 token）。
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, settings, notify, appHome, readTextFile, writeTextFile, checking, exec, run, layout, shared, setShared, agents, terminals, focused, spaces, window, web, webCall, nextWebEvent, hc as herdrHc, props as blockProps } from "herdr";
import * as fsp from "fs/promises";

const TOGGLE = "trend-toggle", PANEL = "trend-panel";
const JOB = "com.herdr-jay.trend";   // the launchd job that runs fetch.js (docs/trend.md)
const TASK = "herdr-jay-trend";      // the same on Windows: a Task Scheduler task
const EVERY = 10 * 60000;            // its StartInterval: every 10 minutes
const STALE = 12 * 3600000;          // a front page not read for 3 times its slowest interval (fetch.js gently: 4 hours)
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
// under the player. The subtitles the panel already has first (player-extra.json, fetch.js --player: YouTube's
// Android app's way, where yt-dlp's gets 429), else one fetch of its own; a block stops it (the house's IP).
const notesAsk = (x, file, extra) => `用繁體中文整理這支 YouTube 影片的重點：https://www.youtube.com/watch?v=${x.id}（標題：${x.title}；頻道：${x.channel}）。`
  + `字幕先用面板已經抓好的：${extra} 裡 "${x.id}" 的 cap（[[開始毫秒, 長度毫秒, 文字]…]）；那裡沒有就跑 node ${extra.replace(/trend\/player-extra\.json$/, "mods/trend/fetch.js")} --player ${x.id}（印出同樣格式的 JSON）。`
  + `都沒有才用 yt-dlp --skip-download --write-auto-subs --sub-langs "zh-Hant,zh-TW,zh,en,ko,ja"，只抓這一支、被擋就停，不要重試；`
  + `沒有字幕就用影片說明和留言。寫成純文字（不要 markdown）：第一行一句話總結，接著 3 到 8 行「• 」開頭的重點（講到的時間點放前面，例如「• 02:15 …」），`
  + `最後一行寫「來源：字幕」或「來源：說明和留言」。存到 ${file}（資料夾不在就建立；先寫成同資料夾的 .tmp 檔再改名），寫好回一句就好。`;
// The panel's pages are web pages (cards, subject chips to filter by, the full text): the mod writes them to
// <Herdr home>/mods/trend/.view/ (hidden: a write doesn't reload the mod) whenever what they show changes. A click
// in one sets the page's #hash (do=<what>&topic=…|name=…&n=<the click's time>), which comes back as a "url" event
// and the mod asks the agent or opens the report; links in them open in the browser.
// 面板的頁面用網頁畫：mod 寫 .view/*.html；網頁裡的按鈕改 #hash，mod 收到再去問 agent 或開報告。
const LIST_CELL = "trend-list", REPORTS_CELL = "trend-reports", VIDEOS_CELL = "trend-videos";
const PAGE_CELLS = { list: LIST_CELL, reports: REPORTS_CELL, videos: VIDEOS_CELL };   // a tab and the web element of its page
// 同步: your topics, stars, progress, plays, the agent's notes and the player's settings kept on your own site, so
// another device has them too (docs/trend.md「Sync」). The site's sync page runs in a persistent web element (1 px; the
// whole panel while you sign in, yourself) told what to do by its #hash, answering in its own. The site: one line in
// <Herdr home>/trend/sync-origin, local only like its place in your local mod.json's allow list; none: the files only.
// 同步：同步頁放在 1px 的持久網頁格，用 #hash 下指令、收結果；沒登入就放大給你自己登入。沒有 sync-origin 就照舊只用本機檔。
const SYNC_CELL = "trend-sync", SYNC_KEY = "sync.key", SYNC_MOVED = "sync.migrated", SYNC_NOTES = "sync.notes", SYNC_OUT = "sync.out";
// a pull every 5 minutes; a push: 50 items, 1 MB of URL at most (4 MB went through, 2026-11-17)
const SYNC_EVERY = 5 * 60000, SYNC_BATCH = 50, SYNC_URL = 1000000;
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// two texts saying the same (letters and digits only): a line that is the title again isn't shown
const flat = (s) => String(s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const same = (a, b) => { const x = flat(a); return !x || flat(b).includes(x); };
// under ⭐ 收藏: a chip per group it is split by (a topic, a subject), shown only while ⭐ 收藏 is
const starSubs = (groups) => (groups.length > 1 ? `<div class="row subs" hidden><button data-sub="*">全部收藏</button>`
  + groups.map(([u, n]) => `<button data-sub="${esc(u)}">${esc(u || "其他")} ${n}</button>`).join("") + "</div>" : "");
// line icons (lucide, 1.5 stroke) where the pages had emoji; they take their text's color. Each is drawn once
// (SPRITE, at the top of every page) and a card only points at it: inlined, 3 icons on 300+ cards made the list
// page pass Herdr's 1 MiB file limit
const PATHS = {
  deep: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  three: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  report: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8M16 13H8M16 17H8"/>',
  star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
};
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(PATHS).map(([k, d]) =>
  `<symbol id="i-${k}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${d}</symbol>`).join("")}</svg>`;
const ico = (k, fill = "none") => `<svg width="15" height="15" fill="${fill}" aria-hidden="true"><use href="#i-${k}"/></svg>`;
const ICON = { deep: ico("deep"), three: ico("three"), report: ico("report") };
const starIcon = (on) => ico("star", on ? "currentColor" : "none");
// a page in Herdr's colors and font size: <nav> chips filter the <section data-cat>s; [data-do] clicks set the #hash.
// The chips are one row that scrolls sideways (the chosen one scrolled into view); 篩選 opens the less used ones.
function pageHtml(body) {
  const t = theme(), z = fs();
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>
:root{--bg:${t.surface};--fg:${t.foreground};--muted:${t.muted};--dim:${t.dim};--border:${t.border};--raised:${t.raised};--accent:${t.accent};
--accent-fg:${t.accent_foreground ?? t.background};--solid:${t.solid};--solid-fg:${t.solid_foreground};--green:${t.ansi2};--yellow:${t.ansi3};
--c1:${t.ansi1};--c2:${t.ansi2};--c3:${t.ansi3};--c4:${t.ansi4};--c5:${t.ansi5};--c6:${t.ansi6}}
html,body{margin:0;background:var(--bg);color:var(--fg);font:${z}px/1.45 -apple-system,"PingFang TC","Microsoft JhengHei",system-ui,sans-serif}
nav{position:sticky;top:0;z-index:1;display:flex;flex-direction:column;gap:8px;padding:8px 12px;background:var(--bg);border-bottom:1px solid var(--border)}
nav .row{display:flex;gap:8px;align-items:center;overflow-x:auto;scrollbar-width:none}nav .row::-webkit-scrollbar{display:none}nav .row>button{flex:none;white-space:nowrap}
nav .row[hidden],nav .panel[hidden]{display:none}nav .subs button{font-size:.82em}
nav .panel{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding-top:8px;border-top:1px dashed var(--border)}
nav .panel .br{flex-basis:100%;height:0}nav .lbl{font-size:.82em;color:var(--muted);display:inline-flex;flex-wrap:wrap;gap:8px;align-items:center}
nav button.pt{margin-left:auto;position:sticky;right:0;box-shadow:-8px 0 8px var(--bg)}
.ib{flex:none;display:inline-flex;border:0;background:none;padding:2px;border-radius:4px;color:var(--muted);cursor:pointer}.ib:hover{color:var(--fg);background:var(--bg)}.ib.rep{color:var(--accent)}
nav button{font:inherit;font-size:.88em;padding:2px 8px;border-radius:8px;border:1px solid var(--border);background:var(--raised);color:var(--muted);cursor:pointer}
nav button.on{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}nav button:disabled{opacity:.4;cursor:default}
nav button:not(.on):not(:disabled):hover{color:var(--fg);border-color:var(--muted)}
h2{margin:20px 12px 8px;font-size:.9em;font-weight:600;color:var(--fg)}
.card{margin:0 12px 8px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--raised);transition:border-color .15s}
.card:hover{border-color:color-mix(in srgb,var(--fg) 20%,var(--border))}
.card[data-do]{cursor:pointer}.card[data-do]:hover{border-color:var(--accent)}
.top{display:flex;gap:8px;align-items:flex-start}
.title{flex:1;min-width:0;font-weight:600;color:var(--fg);text-decoration:none;overflow-wrap:anywhere}
a.title:hover{color:var(--accent)}
.chip{flex:none;margin-top:.15em;padding:1px 6px;border-radius:4px;font-size:.75em;background:var(--bg);color:var(--muted)}
.chip.x{color:var(--muted)}
.chip.new{color:var(--green);background:color-mix(in srgb,var(--green) 15%,transparent)}.chip.up{color:var(--yellow);background:color-mix(in srgb,var(--yellow) 15%,transparent)}
/* each site its own color (the theme's own ANSI ones), only as a small dot: beside its name on a card and on its 篩選 button */
.s-HN{--s:var(--c3)}.s-Reddit{--s:var(--c1)}.s-PTT{--s:var(--c4)}.s-Dcard{--s:var(--c6)}.s-Threads{--s:var(--c5)}.s-Digg{--s:var(--c2)}
.site{flex:none;margin-top:.15em;display:inline-flex;align-items:center;gap:4px;font-size:.75em;color:var(--muted);white-space:nowrap}
.site::before,nav button.s::before{content:"";flex:none;width:6px;height:6px;border-radius:3px;background:var(--s,var(--dim))}
nav button.s::before{display:inline-block;margin-right:6px;vertical-align:.1em}
.also{margin-top:4px;padding-left:8px;border-left:2px solid var(--border);font-size:.85em}
.also a{display:block;color:var(--muted);text-decoration:none;overflow-wrap:anywhere}.also a:hover{color:var(--fg)}
.also b{color:var(--fg);font-weight:500}.also span{margin-left:6px;color:var(--dim)}
/* not seen yet: the title bright; seen: dimmer (the only dot left is the site's) */
.card.seen .title{color:color-mix(in srgb,var(--fg) 68%,var(--raised))}
.meta{margin-top:2px;font-size:.85em;color:var(--muted)}
.why{margin-top:4px;font-size:.9em;color:var(--dim);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.excerpt{margin-top:4px;font-size:.92em;color:var(--fg);opacity:.85;white-space:pre-line;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.card:has(details[open]) .excerpt{display:none}
.body{margin:8px 0;white-space:pre-line;overflow-wrap:anywhere;color:var(--fg)}
details{margin-top:4px;font-size:.88em}summary{color:var(--muted);cursor:pointer}summary:hover{color:var(--fg)}
blockquote{margin:8px 0;padding-left:8px;border-left:2px solid var(--border);color:var(--muted)}
.links a{display:block;color:var(--accent);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.links a:hover{text-decoration:underline}
.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.acts button{font:inherit;font-size:.85em;padding:4px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--fg);cursor:pointer}
.acts button.main{background:var(--solid);color:var(--solid-fg);border-color:var(--solid)}.acts button.rep{color:var(--accent);border-color:var(--accent)}
.acts button:hover{border-color:var(--muted)}.acts button:active{transform:translateY(1px)}
.spin{display:inline-block;width:.75em;height:.75em;margin:0 5px 0 2px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite;vertical-align:-.1em}
@keyframes spin{to{transform:rotate(360deg)}}.busy{color:var(--accent)!important;font-weight:600}
</style></head><body>${SPRITE}${body}
<script>
const K=location.pathname.split("/").pop()+":",get=(k)=>{try{return localStorage.getItem(K+k)}catch{return null}},set=(k,v)=>{try{localStorage.setItem(K+k,v)}catch{}};
// a chip shows its subject's sections (a section with data-show even with no cards: its 正在搜); 升溫 and 新進榜 show
// those cards wherever they are, a site (site:PTT) its cards
const nav=document.querySelector("nav"),subs=document.querySelector("nav .subs"),panel=document.querySelector("nav .panel"),pt=document.querySelector("nav [data-panel]");
// ⭐ 收藏's groups: one group, or all of them (*)
const showSub=(u)=>{if(!subs)return;if(![...subs.querySelectorAll("button")].some((b)=>b.dataset.sub===u))u="*";for(const b of subs.querySelectorAll("button"))b.classList.toggle("on",b.dataset.sub===u);for(const s of document.querySelectorAll('section[data-cat="⭐ 收藏"]'))s.hidden=u!=="*"&&s.dataset.under!==u;set("sub",u)};
const openPanel=(on)=>{if(!panel)return;panel.hidden=!on;set("panel",on?"1":"")};
const show=(c)=>{for(const b of document.querySelectorAll("nav button[data-cat]"))b.classList.toggle("on",b.dataset.cat===c);for(const s of document.querySelectorAll("section")){let any=false;for(const k of s.querySelectorAll(".card")){const ok=c==="all"||s.dataset.cat===c||(c==="rising"&&"rising" in k.dataset)||(c==="new"&&"new" in k.dataset)||(String(c).startsWith("site:")&&(k.dataset.feeds||"").split(",").includes(c.slice(5)));k.hidden=!ok;any||=ok}s.hidden=!any&&!(s.hasAttribute("data-show")&&(c==="all"||s.dataset.cat===c))}set("cat",c);
if(subs){subs.hidden=c!=="⭐ 收藏";if(c==="⭐ 收藏")showSub(get("sub")||"*")}
// a chip chosen in 篩選 says so on its button, so the row tells what is shown
if(pt){const p=panel&&[...panel.querySelectorAll("button[data-cat]")].find((b)=>b.dataset.cat===c);pt.classList.toggle("on",Boolean(p));pt.textContent=p?"篩選・"+p.textContent.replace(/\\s*\\d+$/,""):"篩選 ▾"}
nav.querySelector(".row button.on")?.scrollIntoView({block:"nearest",inline:"center"})};
if(nav){nav.onclick=(e)=>{const b=e.target.closest("button");if(!b)return;if("panel" in b.dataset){openPanel(panel.hidden);return}if(b.dataset.sub){showSub(b.dataset.sub);scrollTo(0,0);return}if(b.dataset.cat){show(b.dataset.cat);scrollTo(0,0)}};
const c=get("cat");show([...nav.querySelectorAll("button[data-cat]")].some((b)=>b.dataset.cat===c)?c:"all");openPanel(get("panel")==="1")}
document.querySelector("main").onclick=(e)=>{const b=e.target.closest("[data-do]");if(!b||e.target.closest("a"))return;const k=b.closest(".card").dataset;
location.hash="do="+b.dataset.do+(k.topic?"&topic="+encodeURIComponent(k.topic):"")+(k.name?"&name="+encodeURIComponent(k.name):"")+"&n="+Date.now();
setTimeout(()=>history.replaceState(null,"",location.pathname),500)};
const y=Number(get("y"));if(y)scrollTo(0,y);addEventListener("scroll",()=>set("y",String(scrollY)),{passive:true});
// <span class="ago" data-t=ms data-w=word>: the date and time ("11/20 14:05"; another year adds it), then how long ago
// while under a week, written here and again each minute (the page itself isn't rewritten)
const ago=()=>{for(const e of document.querySelectorAll(".ago[data-t]")){const t=+e.dataset.t,m=Math.round((Date.now()-t)/60000),d=new Date(t),p=(n)=>String(n).padStart(2,"0");
const at=(d.getFullYear()!==new Date().getFullYear()?d.getFullYear()+"/":"")+(d.getMonth()+1)+"/"+d.getDate()+" "+p(d.getHours())+":"+p(d.getMinutes());
e.textContent=(e.dataset.w||"")+at+(m<1?"（剛剛）":m<60?"（"+m+" 分鐘前）":m<1440?"（"+Math.round(m/60)+" 小時前）":m<10080?"（"+Math.round(m/1440)+" 天前）":"")}};ago();setInterval(ago,60000);
</script></body></html>
`;
}
const fileUrl = (p) => { const s = p.replace(/\\/g, "/"); return "file://" + (/^[A-Za-z]:/.test(s) ? "/" : "") + encodeURI(s).replace(/#/g, "%23").replace(/\?/g, "%3F"); };
const unescape = (s) => (s == null ? null : String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim());
const metaTopic = (html) => unescape(/<meta\s+name=["']trend-topic["']\s+content=["']([^"']*)["']/i.exec(html)?.[1]);
const htmlTitle = (html) => unescape(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]) || null;
const reportWhen = (name) => { const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/.exec(name); return m ? `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}` : ""; };
const PRESETS = [
  { label: "深入查", text: (r) => `/last30days ${r.topic}` },
  { label: "三句話說明", text: (r) => r.feed
    ? `用繁體中文三句話說明「${r.topic}」（${r.evidence_urls[0]}）最近發生什麼事、為什麼大家在討論。先看那個連結，不夠再查。`
    : `用繁體中文三句話說明「${r.topic}」最近發生什麼事、為什麼大家在討論。這一題的來源在 ~/.config/herdr-app/trend/trends.json（topic 是 ${JSON.stringify(r.topic)}），先看那些連結，不夠再查。` },
];
const MOMENTUM = { "new-this-week": "本週新", building: "升溫中" };
// The list itself (subjects, the same story on several sites as one card, my topics' searches) is worked out by
// fetch.js where the data is made (list.js → list.json, also sent to the site's backend): this panel only draws it.
// 清單在抓資料那一端算好（list.js → list.json）；面板只畫。
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
// the topics in videos.txt: one per line, # a comment
const topicsOf = (text) => String(text ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
// videos-skip.txt's lines, lowercase
const skipOf = (text) => topicsOf(text).map((l) => l.toLowerCase());
// YouTube's "2 年前" / "3 天前" / "1 hour ago" as milliseconds (0: not said)
const agoMs = (s) => {
  const m = /(\d+)\s*(秒|分鐘|分|小時|天|週|周|個月|月|年|second|minute|hour|day|week|month|year)/i.exec(String(s ?? ""));
  if (!m) return 0;
  const u = m[2].toLowerCase(), unit = /^(秒|second)/.test(u) ? 1e3 : /^(分|minute)/.test(u) ? 6e4 : /^(小時|hour)/.test(u) ? 36e5
    : /^(天|day)/.test(u) ? 864e5 : /^(週|周|week)/.test(u) ? 6048e5 : /^(個月|月|month)/.test(u) ? 2592e6 : 31536e6;
  return Number(m[1]) * unit;
};
// YouTube's view count as a number: "觀看次數：24,442,452次", "18萬次", "1.4萬", "2.3億", "1.2M views"
const viewsOf = (s) => {
  const m = /([\d.,]+)\s*([萬万億亿KMB])?/i.exec(String(s ?? ""));
  if (!m) return 0;
  const unit = { 萬: 1e4, 万: 1e4, 億: 1e8, 亿: 1e8, k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase()] ?? 1;
  return Number(m[1].replace(/,/g, "")) * unit || 0;
};
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

// ---------- the mod's version and 改動紀錄: CHANGES.md beside main.js, newest first ("## 1.2（2026-11-18）", then "- " lines) ----------
// [{ v, date, items }], read once in init (render has 50 ms); the version is the first one's
async function readChanges(mod) {
  let s = "";
  try { s = await fsp.readFile(`${appHome().replace(/\\/g, "/").replace(/\/+$/, "")}/mods/${mod}/CHANGES.md`, "utf8"); } catch {}
  const out = [];
  for (const l of s.split(/\r?\n/)) {
    const h = l.match(/^##\s+([^\s（(]+)\s*(?:[（(]([^）)]*)[）)])?/);
    if (h) out.push({ v: h[1], date: h[2] ?? "", items: [] });
    else if (out.length && /^\s*-\s+/.test(l)) out[out.length - 1].items.push(l.replace(/^\s*-\s+/, ""));
  }
  return out;
}
// localStorage <mod>.changes: "1" = 改動紀錄 open; <mod>.changes.<version>: that version's list ("1" / "0", the newest open by default)
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const changesOpen = (mod, list) => list?.length > 0 && lsGet(`${mod}.changes`) === "1";
// v1.2 in the title row; a click opens or closes 改動紀錄 (changesBox)
const versionLabel = (t, z, mod, list) => (list?.length
  ? div().id(`${mod}-version`).flex_none().text_size(z - 2).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_mouse_down("left", stop)
    .on_click((_e, cx) => { cx.stop_propagation(); lsSet(`${mod}.changes`, changesOpen(mod, list) ? "0" : "1"); cx.notify(); })
    .child(`v${list[0].v}`)
  : div());
function changesBox(t, z, mod, list) {
  return v_flex().flex_none().mx(10).my(6).p(8).gap(4).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.foreground)
    .child(div().font_semibold().child("改動紀錄"))
    .children(list.map((c, i) => {
      const key = `${mod}.changes.${c.v}`, open = (lsGet(key) ?? (i === 0 ? "1" : "0")) === "1";
      return v_flex().gap(2)
        .child(h_flex().id(`${mod}-changes-${i}`).gap(6).items_center().cursor_pointer().hover((s) => s.opacity(0.85)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { cx.stop_propagation(); lsSet(key, open ? "0" : "1"); cx.notify(); })
          .child(div().w(10).text_color(t.muted).child(open ? "▾" : "▸"))
          .child(div().font_semibold().child(`v${c.v}`))
          .child(div().text_color(t.muted).child(c.date)))
        .when(open, (el) => el.children(c.items.map((s) => div().pl(16).whitespace_normal().child(`• ${s}`))));
    }));
}

export default class Trend extends View {
  init(_p, cx) {
    this.role = blockProps()?.role ?? "panel";
    if (this.role !== "toggle") {
      cx.spawn(async (cx) => { this.changes = await readChanges("trend"); cx.notify(); });
      this.box = InputState.new({ placeholder: "問 trend agent" });
      this.box.on("submit", (_e, cx) => cx.spawn(async (cx) => this.askFree(cx))); // Enter
      // while a video plays the box asks about it (askFree adds which video)
      this.videoBox = InputState.new({ placeholder: "問這支影片，例如：這段在講什麼？" });
      this.videoBox.on("submit", (_e, cx) => cx.spawn(async (cx) => this.askFree(cx)));
    }
    // where you were: the tab (localStorage, so a closed panel or a restart comes back to it). Not the video: a new
    // copy draws (and its page plays) even while the panel is hidden or off screen; its card says ▶ 上次看到 instead
    this.view = (this.role !== "toggle" && localStorage.getItem("view")) || "list";   // "list" (the topics), "videos", "reports", or a report's file name
    this.load(cx);
    if (this.role !== "toggle" && !checking()) cx.spawn(async (cx) => this.syncStart(cx));
    if (this.role !== "toggle") cx.spawn(async (cx) => {
      for (;;) {
        const e = await nextWebEvent();
        if (e?.id === SYNC_CELL) { await this.syncHeard(e, cx); continue; }
        // our pages (and a report) stay ours: a link to a site mod.json allows (YouTube, for the player) would load
        // in the element itself with no way back, so the page comes back and the link opens in the browser
        if ([LIST_CELL, REPORTS_CELL, VIDEOS_CELL, REPORT_CELL].includes(e?.id) && e.kind === "url" && /^https?:/i.test(e.url ?? "")) {
          webCall(e.id, e.id === REPORT_CELL ? "back" : "home");
          if (Date.now() - (this.leftAt ?? 0) > 3000) openLink(e.url);   // its redirects come as more url events: one browser tab
          this.leftAt = Date.now();
          continue;
        }
        // the player page says how far you got (#t=<seconds> every few seconds, 0 at the end): kept per video, saved
        // by load(), and the next play of it starts there; #card=0/1: its 字卡 button, kept for the next video
        if (e?.id === VIDEO_CELL && e.kind === "url" && this.playing && (e.url ?? "").includes(this.playing.id)) {
          const m = /#t=(\d+)/.exec(e.url ?? ""), card = /#card=([01])/.exec(e.url ?? "");
          if (m) { (this.progress ??= {})[this.playing.id] = Number(m[1]); this.progressDirty = true; (this.progressIds ??= new Set()).add(this.playing.id); }
          if (card && localStorage.getItem("card") !== card[1]) { localStorage.setItem("card", card[1]); this.syncSettings(cx); }
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
  // a load that fails says so where its pages would be (it was 「載入中」 for good, with no way to tell why)
  async load(cx) {
    try { await this.loadOnce(cx); this.loadErr = null; } catch (e) { this.loadErr = String(e?.stack ?? e).slice(0, 600); cx.notify(); }
  }
  async loadOnce(cx) {
    const [t, s, f, v, p, tj, lj] = await Promise.all(["trends.json", "status.json", "feeds.json", "videos.json", "player", "topics.json", "list.json"].map((n) => readTextFile(`${this.dir}/${n}`).catch(() => null)));
    if (lj !== this.listText) try { this.listData = lj ? JSON.parse(lj) : null; this.listText = lj; } catch { this.listData = null; }
    this.player = (p ?? "").split("\n")[0].trim();
    // how far you got in each video (progress.json): read once, then saved here when it changed
    const pf = `${this.dir}/progress.json`;
    if (this.progress === undefined) try { this.progress = JSON.parse((await readTextFile(pf).catch(() => null)) ?? "{}") ?? {}; } catch { this.progress = {}; }
    else if (this.progressDirty) {
      this.progressDirty = false;
      this.syncPut([...(this.progressIds ?? [])].map((id) => ({ kind: "progress", key: id, data: { t: this.progress[id] } })), cx);
      this.progressIds = new Set();
      await writeTextFile(pf, JSON.stringify(this.progress) + "\n", await readTextFile(pf).catch(() => null)).catch(() => { this.progressDirty = true; });
    }
    // the videos you starred (stars.json, the panel's own): kept for good, whatever the searches find or drop
    if (this.stars === undefined) try { this.stars = JSON.parse((await readTextFile(`${this.dir}/stars.json`).catch(() => null)) ?? "{}") ?? {}; } catch { this.stars = {}; }
    // 熱門's own: the cards you starred (hot-stars.json, by title), your topics (topics.txt, its ＋ and ✕ write it) and
    // what fetch.js's searches found for them (topics.json; the same text: the same object, so topicRows stays)
    if (this.hotStars === undefined) try { this.hotStars = JSON.parse((await readTextFile(`${this.dir}/hot-stars.json`).catch(() => null)) ?? "{}") ?? {}; } catch { this.hotStars = {}; }
    // your topics (videos.txt, which the 影片 tab's ＋ and ✕ write), and videos-skip.txt: a line there is never suggested
    // and hides the videos it's about (videosHtml). Synced: the synced lists, a line changed by hand synced too
    const [ht, vt, kt] = await Promise.all(["topics.txt", "videos.txt", "videos-skip.txt"].map((n) => readTextFile(`${this.dir}/${n}`).catch(() => null)));
    if (this.syncOn && this.syncFiles) for (const [name, text, kind, field] of [["topics.txt", ht, "hot_topic", "hotQueries"], ["videos.txt", vt, "video_topic", "queries"],
      ["videos-skip.txt", kt, "muted_topic", "skip"]]) this.syncHand(name, text, kind, field, cx);
    else { this.hotQueries = topicsOf(ht); this.queries = topicsOf(vt); this.skip = skipOf(kt); }
    if (tj !== this.topicsText) try { this.topicsData = tj ? JSON.parse(tj) : null; this.topicsText = tj; } catch { this.topicsData = null; }
    // the key points of the video playing, once the trend agent has written them (📝 整理重點). Synced: a new text in
    // the file goes up (the panel passes the agent's notes on), and the synced one shows (another device's, maybe newer)
    if (!this.playing) this.notes = null;
    else {
      const id = this.playing.id, file = await readTextFile(`${this.dir}/notes/${id}.txt`).catch(() => null);
      if (this.syncOn && file && this.noteSeen[id] !== hash(file)) { this.syncPut([{ kind: "note", key: id, data: { text: file } }], cx); this.noteSeen[id] = hash(file); localStorage.setItem(SYNC_NOTES, JSON.stringify(this.noteSeen)); }
      const synced = this.syncOn ? this.syncCopy.get(`note\t${id}`) : null;
      this.notes = synced && !synced.deleted && typeof synced.data?.text === "string" ? synced.data.text : file;
    }
    // the same text: the same object, so the list (shown, worked out from it) isn't worked out again
    if (f !== this.feedsText) try { this.feeds = f ? JSON.parse(f) : null; this.feedsText = f; } catch { this.feeds = null; }
    // Reddit blocked the house's IP: the button says so, once (fetch.js waits 6, 12, 24 hours before trying again)
    const blocked = this.feeds?.redditBlockedAt ?? null;
    if (this.role === "toggle" && this.redditBlockedSeen !== undefined && blocked && blocked !== this.redditBlockedSeen)
      notify({ title: "熱門：Reddit 擋了家裡的 IP", body: this.feeds.errors?.reddit ?? "", level: "warning", timeout: 10000 });
    this.redditBlockedSeen = blocked;
    try { this.videos = v ? JSON.parse(v) : null; } catch { this.videos = null; }
    if (t !== this.dataText) try { this.data = t ? JSON.parse(t) : null; this.bad = null; this.dataText = t; } catch (e) { this.bad = `trends.json 讀不懂：${e.message ?? e}`; }
    try { this.status = s ? JSON.parse(s) : null; } catch { this.status = null; }
    await this.loadReports();
    // the list worked out here, in a task (half a second allowed), not in render (50 ms: a long list there is cut
    // off as 「This view could not be rendered」)
    void this.shown;
    if (this.role !== "toggle" && !checking()) { await this.writePages(); this.searchMissed(cx); }
    // 同步: a pull every 5 minutes and whenever the panel is opened again (a hidden panel's sync page isn't told anything)
    if (this.syncOrigin) {
      const shown = this.panelShown;
      if (shown && (!this.syncShown || Date.now() - (this.syncPullAt ?? 0) > SYNC_EVERY)) {
        if (!this.syncShown) this.syncDead = false;
        this.syncPullAt = Date.now();
        this.syncNeed.add("pull");
      }
      this.syncShown = shown;
      this.syncKick(cx);
    }
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
      .child("還沒有報告：在熱門卡片右上角按放大鏡（深入查），trend agent 查完會把報告寫在這裡。");
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
  // (&t=…s); playFrom is set when you press play, so the page doesn't reload as the progress comes in. glow=0: the
  // player page's 背光 off, as ✨ 背光 left it. After the #, for the page only (a fragment never reaches its server):
  // sb (the storyboard spec: the 背光 follows the video), cap (the subtitles, JSON), ti / ch / vw / pub (title,
  // channel, views, when: the glass pod's lines), card=0 (the caption card folded, as its 字卡 button left it)
  playSrc(x) {
    const from = this.playFrom > 0 ? this.playFrom : 0;
    if (!this.player?.includes("{id}")) return `https://www.youtube.com/watch?v=${x.id}${from ? `&t=${from}s` : ""}`;
    const glow = localStorage.getItem("glow") !== "0", e = this.extras?.[x.id] ?? {};
    const u = this.player.replace("{id}", x.id), q = [from ? `t=${from}` : "", glow ? "" : "glow=0"].filter(Boolean).join("&");
    const f = [glow && e.sb ? ["sb", e.sb] : null, e.cap?.length ? ["cap", JSON.stringify(e.cap)] : null, ["ti", x.title], ["ch", x.channel], ["vw", x.views], ["pub", x.published],
      localStorage.getItem("card") === "0" ? ["card", "0"] : null].filter((p) => p && p[1]).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return `${q ? `${u}${u.includes("?") ? "&" : "?"}${q}` : u}#${f}`;
  }
  // one video played here (the player page in trend/player, else YouTube's watch page); 📝 整理重點 asks the trend
  // agent (tokens) for its key points, which it writes to trend/notes/<id>.txt (kept: there again the next time the
  // video plays). Under the player: a bar (its first line) that opens them, at most 240 px, so the player page keeps
  // its height (the panel's video is as wide as the panel allows; the room below it is what the notes take)
  videoPlayer(t, z) {
    const x = this.playing, notes = this.notes?.trim(), label = `整理重點：${x.title}`;
    const asked = this.asked?.sent === label || this.asked?.opening === label || this.asked?.sending === label;
    return v_flex().flex_1().min_h(0)
      .child(h_flex().h(34).px(8).gap(6).flex_none().items_center().border_b(1).border_color(t.border)
        .child(smallBtn(t, z, "vid-back", "← 影片", (_e, cx) => { this.playing = null; this.notes = null; cx.notify(); }))
        .child(div().flex_1().min_w(0).truncate().text_size(z - 1).text_color(t.muted).child(x.title))
        .child(smallBtn(t, z, "vid-glow", localStorage.getItem("glow") === "0" ? "背光：關" : "背光：開", (_e, cx) => {
          localStorage.setItem("glow", localStorage.getItem("glow") === "0" ? "1" : "0");
          this.syncSettings(cx);
          if (this.progress?.[x.id] > 5) this.playFrom = this.progress[x.id];   // the page reloads: on from where it was
          cx.notify();
        }))
        .child(smallBtn(t, z, "vid-notes", notes ? "重新整理" : "整理重點",
          (_e, cx) => cx.spawn(async (cx) => this.ask(label, notesAsk(x, `${this.dir}/notes/${x.id}.txt`, `${this.dir}/player-extra.json`), cx)))))
      .child(div().flex_1().min_h(0).child(web.new(VIDEO_CELL, { src: this.playSrc(x) })))
      .when(Boolean(notes), (el) => {
        const open = localStorage.getItem("notesOpen") === "1";
        return el.child(h_flex().id("vid-notes-bar").flex_none().h(30).px(12).gap(8).items_center().border_t(1).border_color(t.border).cursor_pointer()
          .text_size(z - 1).text_color(t.muted).hover((s) => s.bg(t.hover)).on_mouse_down("left", stop)
          .on_click((_e, cx) => { localStorage.setItem("notesOpen", open ? "0" : "1"); this.syncSettings(cx); cx.notify(); })
          .child(div().flex_none().text_color(t.foreground).child(open ? "▾ 重點" : "▸ 重點"))
          .child(div().flex_1().min_w(0).truncate().child(open ? "收起" : notes.split("\n").find((l) => l.trim()) ?? "")))
          .when(open, (el) => el.child(div().id("vid-notes-text").flex_none().max_h(240).overflow_y_scrollbar().px(12).py(8)
            .whitespace_normal().on_mouse_down("right", copyOn(notes)).child(notes)));
      })
      .when(!notes && asked, (el) => el.child(div().flex_none().px(12).py(8).border_t(1).border_color(t.border).text_color(t.muted)
        .whitespace_normal().child("trend agent 整理中，好了會出現在這裡。")));
  }
  // My videos: what fetch.js's YouTube searches (one per line of videos.txt) found, a web page like the list's
  // (writePages): a chip per search, newest found first; a click plays it here
  videoList(t, z) {
    // the storyboard spec on its way (a few seconds, once a day a video): the player waits for it, not loads twice
    if (this.playing) return this.sbWait === this.playing.id ? div().flex_1().bg(theme().background) : this.videoPlayer(t, z);
    return this.pageCell(t, VIDEOS_CELL, "videos.html");
  }
  get results() { return Array.isArray(this.data?.results) ? this.data.results : []; }
  // What the list shows (fetch.js's list.json, list.js): its cards, each with its subject (cat)
  get shown() { return this.listData?.rows ?? []; }
  // My topics (topics.txt, the ＋ above the list), in its order: what fetch.js's searches found for each
  get topicRows() {
    if (this.topicRowsOf?.l === this.listData && this.topicRowsOf.qs === this.hotQueries) return this.topicRowsOf.rows;
    const rows = new Map((this.hotQueries ?? []).map((q) => [q, this.listData?.topics?.[q] ?? []]));
    this.topicRowsOf = { l: this.listData, qs: this.hotQueries, rows };
    return rows;
  }
  // a run killed midway (the Mac slept, shut down) never writes finished: after 30 minutes it isn't running
  get running() { return Boolean(this.status?.started && !this.status?.finished && Date.now() - Date.parse(this.status.started) < 1800000); }
  get failed() { return this.status?.ok === false ? this.status.error || "上次沒抓成功" : null; }

  // fetch.js --videos / --topics: the 影片 or 熱門 topic searches that are due (a new one is), with the node the job
  // uses (Herdr's own PATH may lack Homebrew's); a 熱門 topic opens Reddit's and Dcard's pages in Chrome: minutes
  async searchNow(flag) {
    const r = await this.fetchJs([flag], 300000);
    if (r?.code !== 0) throw new Error(String(r?.stderr || r?.stdout || `exit ${r?.code}`).trim().slice(0, 200));
  }
  // node fetch.js <args>, with the node the job uses (Herdr's own PATH may lack Homebrew's): each node tried in turn.
  // Not fs.exists: the mod may read only under the home folder, and a path outside throws at the call (not a
  // rejected promise), so the ＋ searches and the player's subtitles silently did nothing (2026-11-16)
  async fetchJs(args, timeout) {
    const script = `${appHome().replace(/\\/g, "/")}/mods/trend/fetch.js`;
    const nodes = window()?.platform === "windows" ? ["node"] : ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node", "node"];
    for (const node of nodes) {
      try {
        const r = await exec(node, [script, ...args], { timeout });
        if (!(r?.code === 127 || /no such file|not found|ENOENT/i.test(String(r?.stderr ?? "")))) return r;
      } catch {}
    }
    return { code: 127, stdout: "", stderr: "找不到 node" };
  }
  // what the player page needs for a video (fetch.js --player: its storyboard spec and subtitles, once a day); none
  // in 8 seconds: it plays without (the thumbnails, no subtitles)
  extraFor(x, cx) {
    if ((this.extras ??= {})[x.id] !== undefined || this.sbWait === x.id) return;
    this.sbWait = x.id;
    cx.spawn(async (cx) => {
      const r = await this.fetchJs(["--player", x.id], 8000).catch(() => null);
      try { this.extras[x.id] = JSON.parse(r?.stdout || "{}"); } catch { this.extras[x.id] = {}; }
      if (this.sbWait === x.id) this.sbWait = null;
      cx.notify();
    });
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

  // ---- 同步 (docs/trend.md「Sync」): the sync page in SYNC_CELL, told by its #hash (op, id, k: the pairing key its
  // first load said in #hello), answering in its own (res=<id>). One command at a time: a src change may load the page
  // again, which would cut the one before off.
  async syncStart(cx) {
    const origin = String((await readTextFile(`${this.dir}/sync-origin`).catch(() => null)) ?? "").trim().split("\n")[0].trim().replace(/\/+$/, "");
    if (!/^https:\/\/[^/\s]+$/.test(origin)) return;   // none: the files only
    // what the page hasn't taken yet (no push answered ok=1) is kept in the mod's localStorage: a page that never loads
    // loses nothing at a restart; state then pull lays it over the page's copy (syncTake) and it goes up first
    let out = [];
    try { out = JSON.parse(localStorage.getItem(SYNC_OUT) ?? "[]"); } catch {}
    Object.assign(this, { syncOrigin: origin, syncR: 0, syncN: 0, syncOut: Array.isArray(out) ? out : [], syncCopy: new Map(), syncNeed: new Set(["state", "pull"]), syncPending: 0 });
    this.syncSrc = this.syncBase;   // its first load says #hello
    cx.notify();
  }
  get syncBase() { return `${this.syncOrigin}/sync-bridge.html${this.syncR ? `?r=${this.syncR}` : ""}`; }
  // synced: once the first sync moved the files up (syncMove); before that, or with no sync-origin, the files only
  get syncOn() { return Boolean(this.syncOrigin) && localStorage.getItem(SYNC_MOVED) === "1"; }
  get panelShown() { const n = find(layout(), PANEL); return !n || !n.hidden; }
  get noteSeen() { if (!this.noteSeenOf) try { this.noteSeenOf = JSON.parse(localStorage.getItem(SYNC_NOTES) ?? "{}") ?? {}; } catch { this.noteSeenOf = {}; } return this.noteSeenOf; }
  get syncLine() {
    if (!this.syncOrigin) return null;
    const n = this.syncPending + this.syncOut.length;
    return `同步：${this.syncErr ?? (this.syncOn ? "✓" : "連線中…")}${n ? `，待送 ${n} 筆` : ""}`;
  }
  // the next command: the page's copy first, then what waits to go up (SYNC_BATCH at most, SYNC_URL of URL), then a pull
  syncKick(cx) {
    if (!this.syncKey || this.syncCmd || this.syncLogin || this.syncDead || !this.panelShown) return;
    let cmd = null;
    if (this.syncNeed.has("state")) cmd = { op: "state" };
    else if (this.syncOn && this.syncOut.length) {
      const size = (x) => encodeURIComponent(JSON.stringify(x)).length;
      let n = 0, len = 0;
      while (n < Math.min(this.syncOut.length, SYNC_BATCH) && (n === 0 || len + size(this.syncOut[n]) <= SYNC_URL)) len += size(this.syncOut[n++]);
      cmd = { op: "push", items: this.syncOut.slice(0, n) };
    } else if (this.syncNeed.has("pull")) cmd = { op: "pull" };
    if (cmd) { this.syncCmd = cmd; this.syncSend(cmd, cx); }
  }
  syncSend(cmd, cx) {
    cmd.id = String(++this.syncN);
    this.syncSrc = `${this.syncBase}#op=${cmd.op}&id=${cmd.id}&k=${encodeURIComponent(this.syncKey)}${cmd.items ? `&items=${encodeURIComponent(JSON.stringify(cmd.items))}` : ""}`;
    this.syncWait(cmd, cmd.op === "state" ? 5000 : 30000, cx);   // state is the page's own copy; pull and push go to the site
    cx.notify();
  }
  // No answer: a key the page doesn't know (it answers none) or a page that's gone. Once: the page loaded again (?r=: a
  // new load) for a new key (#hello), and the command sent again; twice: given up until the panel is opened again
  syncWait(cmd, ms, cx) {
    const at = cmd.at = (cmd.at ?? 0) + 1;
    cx.timer.after(ms, (cx) => {
      if (this.syncCmd !== cmd || cmd.at !== at) return;
      if (cmd.again) { this.syncCmd = null; this.syncDead = true; this.syncErr = "同步頁沒有回應（重開面板再試）"; cx.notify(); return; }
      cmd.again = true; this.syncKey = null; this.syncR++; this.syncSrc = this.syncBase;
      this.syncWait(cmd, 10000, cx);
      cx.notify();
    });
  }
  // What the sync page did: #hello=1&key=…, #res=<id>&ok=1&data=…&pending=n[&full=1] or &err=login|offline|rejected:…;
  // while you sign in, the site's own pages (/market/index: signed in)
  async syncHeard(e, cx) {
    if (e.kind === "failed" && !this.syncLogin) { this.syncErr = "離線（同步頁沒載入）"; cx.notify(); return; }
    if (e.kind !== "url") return;
    const url = e.url ?? "";
    if (this.syncLogin) {
      let path = "";
      try { path = new URL(url).pathname; } catch {}
      if (path.startsWith("/market/index")) { this.syncLogin = false; this.syncErr = null; this.syncR++; this.syncSrc = this.syncBase; cx.notify(); }
      return;
    }
    const h = new URLSearchParams(url.split("#")[1] ?? "");
    if (h.get("hello") === "1" && h.get("key")) {
      this.syncKey = h.get("key");
      localStorage.setItem(SYNC_KEY, this.syncKey);
      if (this.syncCmd) this.syncSend(this.syncCmd, cx); else this.syncKick(cx);
      return;
    }
    const cmd = this.syncCmd;
    if (!cmd || h.get("res") !== cmd.id) return;
    this.syncCmd = null;
    const ok = h.get("ok") === "1", err = h.get("err");
    let data = null;
    try { data = JSON.parse(h.get("data") ?? "null"); } catch {}
    if (h.get("pending") !== null) this.syncPending = Number(h.get("pending")) || 0;
    this.syncErr = !err ? null : err === "login" ? "未登入" : err === "offline" ? "離線" : err.startsWith("rejected:") ? `有資料被拒（${err.slice(9)}）` : err.slice(0, 80);
    if (cmd.op === "push" && ok) { this.syncOut = this.syncOut.slice(cmd.items.length); this.syncSaveOut(); }   // the page has them (queued, if it couldn't send yet)
    if (cmd.op === "state" && ok) { this.syncNeed.delete("state"); this.syncPending = Number(data?.pending) || 0; this.syncTake(data?.items ?? [], true); }
    if (cmd.op === "pull") {
      this.syncNeed.delete("pull");
      if (ok) { this.syncTake(Array.isArray(data) ? data : [], h.get("full") === "1"); if (!this.syncOn) await this.syncMove(); }
    }
    // not signed in: the site's sign-in page, the whole panel, for you to sign in; the pull again after it
    if (err === "login" && !this.syncLater) { this.syncLogin = true; this.syncKey = null; this.syncSrc = `${this.syncOrigin}/login`; this.syncNeed.add("pull"); }
    if (ok && cmd.op !== "push" && this.syncOn) await this.syncApply(cx);
    this.syncKick(cx);
    cx.notify();
  }
  // the page's copy into the panel's (full: all of it, else what changed), what still waits to go up kept on top
  syncTake(items, full) {
    if (full) this.syncCopy = new Map();
    for (const it of [...items, ...(full ? this.syncOut : [])]) if (typeof it?.kind === "string" && typeof it.key === "string") this.syncMerge(it);
  }
  syncMerge(it) { const id = `${it.kind}\t${it.key}`, cur = this.syncCopy.get(id); if (!cur || it.at >= cur.at) this.syncCopy.set(id, it); }
  syncSaveOut() { localStorage.setItem(SYNC_OUT, JSON.stringify(this.syncOut)); }
  // a change of yours: in the panel's copy now, up with the next push (none before the first sync moved the files up)
  syncPut(items, cx) {
    if (!this.syncOn || !items.length) return;
    const at = Date.now();
    for (const it of items) { const x = { kind: it.kind, key: it.key, data: it.data ?? {}, at, deleted: Boolean(it.deleted) }; this.syncMerge(x); this.syncOut.push(x); }
    this.syncSaveOut();
    this.syncKick(cx);
  }
  // the player's settings (✨ 背光, its 字卡, 📝 重點 open or not): one item
  syncSettings(cx) {
    if (!this.syncOn) return;
    const data = Object.fromEntries(["glow", "card", "notesOpen"].map((k) => [k, localStorage.getItem(k) ?? ""]));
    if (JSON.stringify(this.syncCopy.get("settings\tpanel")?.data) !== JSON.stringify(data)) this.syncPut([{ kind: "settings", key: "panel", data }], cx);
  }
  // The first sync, once: each kind the site has nothing of yet goes up from the files (the newest 200 plays), which
  // stay as they are, a backup. 第一次同步：後台沒有的種類才從本機檔搬上去，舊檔留著。
  async syncMove() {
    if (this.stars === undefined || this.hotStars === undefined) return;   // the files not read yet: the next pull
    const have = new Set([...this.syncCopy.values()].map((x) => x.kind)), now = Date.now(), items = [];
    const add = (kind, key, data, at) => { if (!have.has(kind) && key) items.push({ kind, key, data, at: at || now, deleted: false }); };
    (this.queries ?? []).forEach((q, i) => add("video_topic", q, {}, now + i));   // in the file's order
    (this.hotQueries ?? []).forEach((q, i) => add("hot_topic", q, {}, now + i));
    (this.skip ?? []).forEach((q, i) => add("muted_topic", q, {}, now + i));
    for (const [id, x] of Object.entries(this.stars)) add("fav_video", id, x, Date.parse(x?.starred));
    for (const [title, x] of Object.entries(this.hotStars)) add("fav_card", title, x, Date.parse(x?.starred));
    for (const [id, t] of Object.entries(this.progress ?? {})) add("progress", id, { t }, now);
    let plays = [];
    try { plays = JSON.parse((await readTextFile(`${this.dir}/plays.json`).catch(() => null)) ?? "[]"); } catch {}
    for (const x of (Array.isArray(plays) ? plays : []).slice(0, 200)) add("history", `${x?.at} ${x?.id}`, x, Date.parse(x?.at));
    for (const n of await fsp.readdir(`${this.dir}/notes`).catch(() => [])) {
      const text = /\.txt$/.test(n) ? await readTextFile(`${this.dir}/notes/${n}`).catch(() => null) : null;
      if (text) { add("note", n.slice(0, -4), { text }, now); this.noteSeen[n.slice(0, -4)] = hash(text); }
    }
    for (const it of items) { this.syncMerge(it); this.syncOut.push(it); }
    this.syncSaveOut();
    localStorage.setItem(SYNC_NOTES, JSON.stringify(this.noteSeen));
    localStorage.setItem(SYNC_MOVED, "1");
  }
  // the synced items as the panel's own, then the files (syncMirror) and the pages
  async syncApply(cx) {
    const live = [...this.syncCopy.values()].filter((x) => !x.deleted).sort((a, b) => a.at - b.at), of = (k) => live.filter((x) => x.kind === k);
    this.queries = of("video_topic").map((x) => x.key);
    this.hotQueries = of("hot_topic").map((x) => x.key);
    this.skip = of("muted_topic").map((x) => x.key.toLowerCase());
    this.stars = Object.fromEntries(of("fav_video").map((x) => [x.key, x.data]));
    this.hotStars = Object.fromEntries(of("fav_card").map((x) => [x.key, x.data]));
    const p = Object.fromEntries(of("progress").map((x) => [x.key, Number(x.data?.t) || 0]));
    if (this.playing && this.progress?.[this.playing.id] != null) p[this.playing.id] = this.progress[this.playing.id];   // the playing one's is newer
    this.progress = p;
    const s = this.syncCopy.get("settings\tpanel");
    if (s && !s.deleted) for (const k of ["glow", "card", "notesOpen"]) if (typeof s.data?.[k] === "string" && s.data[k]) localStorage.setItem(k, s.data[k]);
    await this.syncMirror(of("history").reverse().slice(0, 300).map((x) => x.data));
    await this.writePages();
    cx.notify();
  }
  // The files rewritten from the synced state, each only when its content changed: fetch.js reads videos.txt,
  // topics.txt, videos-skip.txt and plays.json; the others are the panel's, read when the sync is off. A list file
  // keeps its # comments.
  async syncMirror(plays) {
    const list = (was, qs, parse) => (parse(was).join("\n") === qs.join("\n") ? was
      : [...String(was ?? "").split("\n").filter((l) => l.trim().startsWith("#")), ...qs, ""].join("\n"));
    const json = (o) => JSON.stringify(o) + "\n";
    const files = { "videos.txt": (w) => list(w, this.queries, topicsOf), "topics.txt": (w) => list(w, this.hotQueries, topicsOf), "videos-skip.txt": (w) => list(w, this.skip, skipOf),
      "stars.json": () => json(this.stars), "hot-stars.json": () => json(this.hotStars), "progress.json": () => json(this.progress), "plays.json": () => json(plays) };
    this.syncFiles ??= {};
    for (const [name, make] of Object.entries(files)) {
      const path = `${this.dir}/${name}`, was = await readTextFile(path).catch(() => null), text = make(was);
      if (text != null && text !== was && !(await writeTextFile(path, text, was).then(() => true, () => false))) continue;
      this.syncFiles[name] = text;
    }
  }
  // synced, a list file that isn't what syncMirror wrote was changed by hand: its lines added or taken out are synced
  syncHand(name, text, kind, field, cx) {
    if (text == null || text === this.syncFiles[name]) return;
    this.syncFiles[name] = text;
    const now = (field === "skip" ? skipOf : topicsOf)(text), was = this[field] ?? [], same = (a) => (b) => a.toLowerCase() === b.toLowerCase();
    this.syncPut([...now.filter((q) => !was.some(same(q))).map((key) => ({ kind, key })), ...was.filter((w) => !now.some(same(w))).map((key) => ({ kind, key, deleted: true }))], cx);
    this[field] = now;
  }
  syncCell() { return web.new(SYNC_CELL, { src: this.syncSrc, persist: true }); }
  // signing in: the site's page as the whole panel; 稍後: back to 1 px, not asked again this session
  syncLoginView(t, z) {
    return v_flex().flex_1().min_h(0)
      .child(h_flex().h(34).px(8).gap(6).flex_none().items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().text_size(z - 1).text_color(t.muted).child("同步：請在下面登入，登入好會自動縮回"))
        .child(smallBtn(t, z, "sync-later", "稍後", (_e, cx) => { this.syncLater = true; this.syncLogin = false; this.syncR++; this.syncSrc = this.syncBase; cx.notify(); })))
      .child(div().flex_1().min_h(0).child(this.syncCell()));
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
  get watching() { return this.view === "videos" ? this.playing : null; }
  async askFree(cx) {
    const x = this.watching, box = x ? this.videoBox : this.box, q = box.value().trim();
    if (!q) return;
    box.set_value("");
    if (!x) return this.ask("你的問題", q, cx);
    await this.ask(`問影片：${q}`, `關於 YouTube 影片「${x.title}」（${[x.channel, `https://www.youtube.com/watch?v=${x.id}`].filter(Boolean).join("，")}）：${q}\n`
      + `先看它的字幕：${this.dir}/player-extra.json 裡 "${x.id}" 的 cap（[[開始毫秒, 長度毫秒, 文字]…]，面板已經抓好）；沒有再看說明和留言，不夠再查。用繁體中文回答。`, cx);
  }

  render(cx) {
    if (this.role === "toggle") return this.renderToggle();
    const t = theme(), z = fs();
    if (this.view !== this.savedView) { this.savedView = this.view; localStorage.setItem("view", this.view); }
    return v_flex().id("trend").size_full().bg(t.surface).text_size(z).text_color(t.foreground)
      .child(this.header(t, z))
      .child(this.syncLogin ? this.syncLoginView(t, z) : this.view === "list" ? this.list(t, z) : this.view === "videos" ? this.videoList(t, z) : this.view === "reports" ? this.reportList(t, z) : this.reportView(t, z))
      .child(this.askCard(t, z))
      // ← 影片: a web element lives on unseen, so its page turns to a blank one, or the video would keep playing;
      // drawn 1 px, only once a video was played. Another tab, the panel hidden or off screen: the player page
      // pauses itself (it hears the page go hidden; tried 2026-11-16) and goes on when shown, no reload
      .when(Boolean(this.played) && !this.playing, (el) => el.child(div().w(1).h(1).flex_none()
        .child(web.new(VIDEO_CELL, { src: fileUrl(`${this.viewDir}/blank.html`) }))))
      // the sync page (syncStart): 1 px, the whole panel while you sign in (syncLoginView)
      .when(Boolean(this.syncSrc) && !this.syncLogin, (el) => el.child(div().w(1).h(1).flex_none().child(this.syncCell())));
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
          // the toggle first: a setShared before it re-renders every mod and the layout change was lost (the button
          // could hide the panel but never show it)
          run("layout.toggle", { id: PANEL });
          if (!on) setShared(SEEN, this.shown.map((r) => r.topic)); // opening it: what it shows now counts as seen
          cx.notify();
        })
        .child("熱門")
        .when(Boolean(badge), (el) => el.child(badge)));
  }

  header(t, z) {
    const btn = (id, label, fn) => div().id(id).h(28).px(10).flex().items_center().rounded(6).cursor_pointer().bg(t.raised).text_color(t.foreground)
      .hover((s) => s.bg(t.hover)).on_mouse_down("left", stop).on_click(fn).child(label);
    const done = Date.parse(this.status?.finished ?? this.data?.generated_at ?? "");
    const next = Date.parse(this.status?.started ?? "") + EVERY;
    const line = this.running ? `更新中…（${ago(Date.parse(this.status.started)).replace("前", "開始")}，通常幾分鐘）`
      : this.bad ?? this.failed ?? (Number.isFinite(done) ? `更新於 ${ago(done)}${Number.isFinite(next) && next > Date.now() ? ` · 下次約 ${hhmm(next)}` : ""}` : "還沒有資料：排程還沒跑過（docs/trend.md「安裝」）");
    const red = Boolean(this.bad || (this.failed && !this.running));
    // One row, each site once: ✓ when it answered (last30days' search and the site's own front page), else why not.
    // Reddit, PTT, Dcard and Threads are only their front pages, read every 2 to 4 hours (how long ago, red when blocked).
    // Quiet while healthy: red when it failed, yellow when its page is older than STALE.
    // Right-click copies the reason.
    const st = this.data?.source_status ?? {}, fe = this.feeds ?? {};
    const site = (key, name, l30, feed) => {
      const why = (l30 && st[l30] && st[l30] !== "ok" ? STATE[st[l30]] ?? st[l30] : null) ?? (feed ? fe.errors?.[feed] ?? null : null);
      const ok = !why && (!feed || (fe[feed]?.length ?? 0) > 0);
      const at = Date.parse(fe[`${feed}At`] ?? "");
      return { key, name, why, ok, when: ok && at ? ` ${ago(at)}` : "", red: Boolean(why || fe[`${feed}BlockedAt`]), stale: ok && Date.now() - at > STALE };
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
          .on_mouse_down("right", copyOn(line)).child(line))
        .when(Boolean(this.syncLine), (el) => el.child(div().id("sync").flex_none().text_size(z - 1.5).text_color(this.syncErr ? t.ansi1 : t.dim).child(this.syncLine)))
        .child(versionLabel(t, z, "trend", this.changes)))
      .when(changesOpen("trend", this.changes), (el) => el.child(changesBox(t, z, "trend", this.changes)))
      .when(Boolean(this.msg), (el) => el.child(div().id("msg").px(12).pb(4).text_size(z - 1.5).text_color(t.ansi1).whitespace_normal()
        .on_mouse_down("right", copyOn(this.msg)).child(this.msg)))
      .when(Boolean(this.data || this.feeds), (el) => el.child(h_flex().px(12).pb(6).gap(10).flex_wrap().items_center().text_size(z - 2)
        .child(div().text_color(t.dim).child("來源"))
        .children(sites.map((s) => div().id(`site-${s.key}`).text_color(s.red ? t.ansi1 : s.stale ? t.ansi3 : s.ok ? t.muted : t.dim).on_mouse_down("right", copyOn(s.why ?? ""))
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
  // new write loads it again, wherever the element went since (the same src never reloads). persist: the page's
  // localStorage (the chip, 看, the ＋ box) outlives the panel and Herdr restarts
  pageCell(t, cell, file) {
    if (this.written?.[file] === undefined) {
      const err = this.writeErr?.[file] ? `寫不出頁面：${this.writeErr[file]}` : this.loadErr ? `載入失敗：${this.loadErr}` : null;
      return div().flex_1().p(14).text_color(err ? t.ansi1 : t.muted).child(err ?? "載入中…");
    }
    return div().flex_1().min_h(0).child(web.new(cell, { src: `${fileUrl(`${this.viewDir}/${file}`)}?v=${this.written[file].at}`, persist: true }));
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
      // half an emoji (a text cut short before fetch.js cut whole characters) can't be written: dropped
      html = html.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(^|[^\ud800-\udbff])[\udc00-\udfff]/g, "$1");
      await writeTextFile(path, html, await readTextFile(path).catch(() => null));
    } catch (e) { (this.writeErr ??= {})[file] = `${String(e?.message ?? e)}（${Math.round(html.length / 1024)}K 字）`; return; }   // tried again on the next load (15 s)
    if (this.writeErr) delete this.writeErr[file];
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
      const play = { id: x.id, title: x.title, channel: x.channel, query: x.query, at: new Date().toISOString() };
      // synced: a history item, the ones past the newest 300 taken out
      const old = this.syncOn ? [...this.syncCopy.values()].filter((p) => p.kind === "history" && !p.deleted).sort((a, b) => b.at - a.at).slice(299) : [];
      this.syncPut([{ kind: "history", key: `${play.at} ${play.id}`, data: play }, ...old.map((p) => ({ kind: "history", key: p.key, deleted: true }))], cx);
      this.extraFor(x, cx);
      // what you play: fetch.js suggests searches from it (channels, title words); the newest 300
      cx.spawn(async () => {
        const file = `${this.dir}/plays.json`, was = await readTextFile(file).catch(() => null);
        let plays = [];
        try { plays = JSON.parse(was ?? "[]"); } catch {}
        plays = [play, ...(Array.isArray(plays) ? plays : [])].slice(0, 300);
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
      this.syncPut([{ kind: "fav_video", key: id, data: this.stars[id], deleted: !this.stars[id] }], cx);
      const stars = JSON.stringify(this.stars) + "\n";
      cx.spawn(async (cx) => {
        const file = `${this.dir}/stars.json`;
        await writeTextFile(file, stars, await readTextFile(file).catch(() => null)).catch(() => {});
        await this.writePages();
        cx.notify();
      });
      return;
    }
    // ☆ on a 熱門 card stars it (hot-stars.json, by title), kept under ⭐ 收藏 by the topic or subject it was under
    if (act === "hstar") {
      const id = h.get("topic") ?? "", x = this.rowOf(id);
      if (!x || !this.hotStars) return;
      if (this.hotStars[id]) delete this.hotStars[id];
      else { const { key, ...row } = x; this.hotStars[id] = { ...row, under: x.q ?? x.cat ?? "其他", starred: new Date().toISOString() }; }
      this.syncPut([{ kind: "fav_card", key: id, data: this.hotStars[id], deleted: !this.hotStars[id] }], cx);
      const stars = JSON.stringify(this.hotStars) + "\n";
      cx.spawn(async (cx) => {
        const file = `${this.dir}/hot-stars.json`;
        await writeTextFile(file, stars, await readTextFile(file).catch(() => null)).catch(() => {});
        await this.writePages();
        cx.notify();
      });
      return;
    }
    // ＋ 加主題 (typed, or a suggestion clicked): into videos.txt (熱門's tadd: topics.txt) and searched now (fetch.js
    // --videos / --topics; 正在搜 meanwhile). ✕ on a topic (drop / tdrop): out of the file, and its results with it (a
    // starred one stays under ⭐ 收藏)
    if (["add", "drop", "tadd", "tdrop"].includes(act)) {
      const q = (h.get("name") ?? "").trim().replace(/\s+/g, " "), hot = act.startsWith("t"), adding = act.endsWith("add");
      if (!q) return;
      const file = `${this.dir}/${hot ? "topics" : "videos"}.txt`, busy = hot ? (this.hotSearching ??= new Set()) : (this.searching ??= new Set());
      cx.spawn(async (cx) => {
        const was = await readTextFile(file).catch(() => null), lines = (was ?? "").split("\n");
        const same = (l) => l.trim().toLowerCase() === q.toLowerCase();
        if (adding && lines.some(same)) return;
        const text = adding ? `${was ?? ""}${was && !was.endsWith("\n") ? "\n" : ""}${q}\n` : lines.filter((l) => !same(l)).join("\n");
        if (!(await writeTextFile(file, text, was).then(() => true, () => false))) return;
        this.syncPut([{ kind: hot ? "hot_topic" : "video_topic", key: adding ? q : ((hot ? this.hotQueries : this.queries) ?? []).find(same) ?? q, deleted: !adding }], cx);
        if (this.syncFiles) this.syncFiles[`${hot ? "topics" : "videos"}.txt`] = text;
        if (hot) this.hotQueries = topicsOf(text); else this.queries = topicsOf(text);
        if (adding) await this.runSearch(hot, [q], cx);
        else { await this.writePages(); cx.notify(); }
      });
      return;
    }
    const r = this.rowOf(h.get("topic"));
    if (!r) return;
    if (act === "report" && this.reportFor(r.topic)) { this.view = this.reportFor(r.topic).name; this.webNote = null; cx.notify(); return; }
    const p = PRESETS[act === "deep" ? 0 : act === "three" ? 1 : -1];
    if (p) cx.spawn(async (cx) => this.ask(`${p.label}：${r.topic}`, p.text(r), cx));
  }
  // fetch.js --videos / --topics for these topics now, 正在搜 on them meanwhile; one run at a time of each kind (two
  // at once would both rewrite videos.json / topics.json). Runs in the caller's task
  async runSearch(hot, qs, cx) {
    const busy = hot ? (this.hotSearching ??= new Set()) : (this.searching ??= new Set()), run = hot ? "topicRun" : "searchRun";
    for (const q of qs) busy.add(q);
    await this.writePages();
    cx.notify();
    this[run] = (this[run] ?? Promise.resolve()).then(() => this.searchNow(hot ? "--topics" : "--videos"))
      .catch((e) => notify({ title: `${hot ? "熱門" : "影片"}：「${qs.join("、")}」沒搜成`, body: String(e?.message ?? e), level: "error", timeout: 10000 }));
    await this[run];
    for (const q of qs) busy.delete(q);
    await this.load(cx);
  }
  // a topic never searched (its ＋'s search cut off, say by a reload of the mod): searched now, once a session
  searchMissed(cx) {
    const tried = (d, q) => Object.keys(d?.done ?? {}).some((k) => k.endsWith(` ${q}`)), healed = (this.healed ??= new Set());
    for (const [hot, qs, d] of [[false, this.queries, this.videos], [true, this.hotQueries, this.topicsData]]) {
      const missed = (qs ?? []).filter((q) => !healed.has(`${hot} ${q}`) && !(hot ? this.hotSearching : this.searching)?.has(q) && !tried(d, q));
      for (const q of missed) healed.add(`${hot} ${q}`);
      if (missed.length) this.runSearch(hot, missed, cx);
    }
  }
  // a 熱門 card's row by its title: the list's, a topic's, or a starred one
  rowOf(topic) {
    return this.shown.find((x) => x.topic === topic) ?? [...this.topicRows.values()].flat().find((x) => x.topic === topic) ?? this.hotStars?.[topic] ?? null;
  }
  // the 熱門 list: chips on top (全部, ⭐ 收藏, 升溫, 新進榜; your topics with ✕ and ＋ 加主題; the subjects; the sites),
  // an 排列 bar, then the cards: starred ones by where they were, each topic's, each subject's
  listHtml() {
    const seen = new Set(Array.isArray(shared(SEEN)) ? shared(SEEN) : []), t = theme();
    const cats = this.listData?.cats ?? [], groups = new Map(cats.map((c) => [c, []]));
    for (const r of this.shown) (groups.get(r.cat) ?? groups.set(r.cat ?? "其他", []).get(r.cat ?? "其他")).push(r);
    const used = [...groups].filter(([, rows]) => rows.length), tops = [...this.topicRows];
    const every = [...this.shown, ...tops.flatMap(([, rows]) => rows)];
    const since = Date.parse(this.feeds?.since ?? ""), hour = 3600000;
    // 升溫: its score up by 10 or more and a fifth or more in the last 1 to 3 hours; 新進榜: here for under 3 hours, once
    // fetch.js has kept history for 6 (before that, everything would look new)
    const rising = (x) => x.rise && x.rise.by >= 10 && x.rise.by >= 0.2 * Math.max(x.rise.from, 1);
    const fresh = (x) => x.first && Date.now() - Date.parse(x.first) < 3 * hour && Date.now() - since > 6 * hour;
    // data-rank / data-first / data-up / data-c: what the 排列 bar sorts by (its place, when it showed up, its rise,
    // its 留言); data-feeds: its sites, for the site chips
    const card = (r) => {
      const all = [r, ...(r.also ?? [])], up = all.filter(rising).sort((a, b) => b.rise.by - a.rise.by)[0];
      const sites = new Set(all.map((x) => x.feed)).size, starred = Boolean(this.hotStars?.[r.topic]);
      const links = (r.evidence_urls ?? []).filter((u) => /^https?:\/\//i.test(u));
      const title = links[0] ? `<a class="title" href="${esc(links[0])}">${esc(r.topic)}</a>` : `<span class="title">${esc(r.topic)}</span>`;
      const line = r.line ?? (engagementText(r.engagement) || (r.sources ?? []).map((s) => SOURCE[s] ?? s).join("、"));
      // the post's own text (PTT, Dcard's excerpt, Threads, Reddit): its first lines on the card, all of it under 更多
      // (Threads' title is already its first 120 characters)
      const body = String(r.body ?? "").trim(), longer = body && !(r.feed === "Threads" && body.replace(/\s+/g, " ").length <= 120);
      // a front-page PTT post whose text fetch.js hasn't read yet (20 a run, best first) says so instead of showing only its link
      const more = [longer ? `<div class="body">${esc(body)}</div>` : r.feed === "PTT" && !r.q ? '<div class="body" style="color:var(--dim)">內文還沒讀到：每輪讀 20 篇，晚點再看</div>' : "",
        r.top_comment ? `<blockquote>${esc(r.top_comment)}</blockquote>` : "",
        links.length ? `<div class="links">${links.slice(0, 6).map((u) => `<a href="${esc(u)}">↗ ${esc(shortLink(u))}</a>`).join("")}</div>` : ""].join("");
      // the same story elsewhere: each with its own numbers and link
      const also = r.also?.length ? `<div class="also">${r.also.map((a) => `<a href="${esc(a.evidence_urls[0])}"><b>${esc(a.feed)}</b> ${esc(a.topic)}<span>${esc(a.line ?? "")}</span></a>`).join("")}</div>` : "";
      const first = Math.max(...all.map((x) => Date.parse(x.first ?? x.created ?? "") || 0));
      const posted = Date.parse(r.created ?? ""), listed = Date.parse(r.first ?? "");
      const when = posted ? `<span class="ago" data-t="${posted}"></span>` : listed ? `<span class="ago" data-t="${listed}" data-w="上榜 "></span>` : "";
      return `<div class="card${seen.has(r.topic) || r.q ? " seen" : ""}" data-topic="${esc(r.topic)}" data-feed="${esc(r.feed ?? "")}" data-feeds="${esc([...new Set(all.map((x) => x.feed).filter(Boolean))].join(","))}"`
        + ` data-rank="${r.rank ?? 0}" data-first="${first}" data-up="${up?.rise.by ?? 0}" data-c="${all.reduce((n, x) => n + (x.comments ?? 0), 0)}"`
        + `${up ? " data-rising" : ""}${all.some(fresh) ? " data-new" : ""}>`
        + `<div class="top">${title}`
        + `${up ? `<span class="chip up">↑ +${num(up.rise.by)}・${up.rise.hours} 小時</span>` : ""}${all.some(fresh) ? '<span class="chip new">新進榜</span>' : ""}`
        + `${MOMENTUM[r.momentum] ? `<span class="chip ${r.momentum === "new-this-week" ? "new" : "up"}">${MOMENTUM[r.momentum]}</span>` : ""}`
        + `${r.also?.length ? `<span class="chip x">${sites > 1 ? `${sites} 站` : `${all.length} 篇`}</span>` : ""}`
        + `<span class="site${r.feed ? ` s-${esc(r.feed)}` : ""}">${esc(r.feed ?? "跨站")}</span>`
        + `<button class="ib" data-do="deep" title="深入查：trend agent 查完寫一份報告">${ICON.deep}</button><button class="ib" data-do="three" title="三句話說明">${ICON.three}</button>`
        + `${this.reportFor(r.topic) ? `<button class="ib rep" data-do="report" title="看報告">${ICON.report}</button>` : ""}`
        + `<button class="star${starred ? " on" : ""}" data-do="hstar" title="${starred ? "取消收藏" : "收藏：一直留著"}">${starIcon(starred)}</button></div>`
        // a headline or excerpt that only says the title again isn't shown
        // when it was posted (HN, Reddit, PTT, Dcard, Threads, Digg say), else when it showed up here
        + `${line || when ? `<div class="meta">${esc(line ?? "")}${line && when ? " · " : ""}${when}</div>` : ""}${why(r) && !same(why(r), r.topic) ? `<div class="why">${esc(why(r))}</div>` : ""}`
        + `${longer && r.feed !== "Threads" && !same(body, r.topic) ? `<div class="excerpt">${esc(body)}</div>` : ""}${also}`
        + `${more ? `<details><summary>更多</summary>${more}</details>` : ""}</div>`;
    };
    const nUp = every.filter((r) => [r, ...(r.also ?? [])].some(rising)).length, nNew = every.filter((r) => [r, ...(r.also ?? [])].some(fresh)).length;
    // ⭐ 收藏 by where each was (your topics' order, the subjects', then the rest), newest starred first in each
    // (趣聞 was 生活's name before 2026-11-20)
    const starred = Object.values(this.hotStars ?? {}).map((x) => (x.under === "趣聞" ? { ...x, under: "生活" } : x))
      .sort((a, b) => String(b.starred).localeCompare(String(a.starred)));
    const starUnder = [...new Set([...tops.map(([q]) => q), ...cats, ...starred.map((x) => x.under ?? "")])]
      .map((u) => [u, starred.filter((x) => (x.under ?? "") === u)]).filter(([, xs]) => xs.length);
    // the busy subjects get a chip in the row; the ones with 1 or 2 cards wait in 篩選 (none: no chip)
    const big = used.filter(([c, rows]) => rows.length >= 3 && c !== "其他"), small = used.filter((g) => !big.includes(g));
    const siteCount = (f) => every.filter((r) => [r, ...(r.also ?? [])].some((x) => x.feed === f)).length;
    const d = this.topicsData ?? {}, siteName = { hn: "HN", ptt: "PTT", reddit: "Reddit", dcard: "Dcard" };
    // a topic's state: 正在搜, or what its sites said (a block, a page it couldn't read)
    const status = (q, n) => {
      if (this.hotSearching?.has(q)) return '<p class="empty busy"><span class="spin"></span>正在搜 HN、PTT、Reddit、Dcard…（Reddit、Dcard 要開瀏覽器，一兩分鐘）</p>';
      const errs = Object.keys(siteName).map((s) => d.errors?.[`${s} ${q}`] ?? d.errors?.[s] ? `${siteName[s]}：${d.errors[`${s} ${q}`] ?? d.errors[s]}` : "").filter(Boolean);
      return `${n ? "" : '<p class="empty">還沒有結果：下一輪搜（約一小時一次）</p>'}${errs.map((e) => `<p class="err">${esc(e)}</p>`).join("")}`;
    };
    return pageHtml(`<style>nav .x{margin-left:8px;opacity:.55}nav .x:hover{opacity:1;color:${t.ansi1}}`
      + `nav button.addt{color:var(--accent);border-style:dashed}.err{margin:2px 12px;font-size:.85em;color:${t.ansi1}}`
      + `.empty{margin:4px 12px 8px;font-size:.88em;color:var(--muted)}#addbox{margin:12px 12px 4px;padding:12px;border:1px dashed var(--border);border-radius:12px}`
      + `#addbox .hd{font-size:.85em;color:var(--muted);margin-bottom:8px}#addform{display:flex;gap:8px}`
      + `#addq{flex:1;min-width:0;font:inherit;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--fg)}`
      + `#addform button{font:inherit;font-size:.88em;padding:3px 10px;border-radius:6px;border:1px solid var(--solid);background:var(--solid);color:var(--solid-fg);cursor:pointer}`
      + `#addform button:hover{opacity:.9}`
      + `.star{flex:none;display:inline-flex;border:0;background:none;padding:2px;color:var(--muted);cursor:pointer}.star:hover,.star.on{color:var(--yellow)}</style>`
      + `<nav><div class="row"><button data-cat="all">全部 ${every.length}</button>${starred.length ? `<button data-cat="⭐ 收藏">收藏 ${starred.length}</button>` : ""}`
      + `${nUp ? `<button data-cat="rising">升溫 ${nUp}</button>` : ""}${nNew ? `<button data-cat="new">新進榜 ${nNew}</button>` : ""}`
      + tops.map(([q, rows]) => `<button data-cat="🔍 ${esc(q)}">${esc(q)} ${this.hotSearching?.has(q) ? '<span class="spin"></span>' : rows.length}<span class="x" data-act="tdrop" data-q="${esc(q)}" title="拿掉這個主題">✕</span></button>`).join("")
      + `<button class="addt" data-act="toggle">＋ 加主題</button>`
      + big.map(([c, rows]) => `<button data-cat="${esc(c)}">${esc(c)} ${rows.length}</button>`).join("")
      + `<button class="pt" data-panel>篩選 ▾</button></div>`
      + starSubs(starUnder.map(([u, xs]) => [u, xs.length]))
      // 篩選: the sites, the 排列, the small subjects
      + `<div class="panel" hidden><span class="lbl">來源</span>${["HN", "Reddit", "PTT", "Dcard", "Threads", "Digg"].filter(siteCount)
        .map((f) => `<button class="s s-${f}" data-cat="site:${f}">${f} ${siteCount(f)}</button>`).join("")}`
      + `<i class="br"></i><span class="lbl sortbar">排列 ${[["hot", "最熱"], ["new", "最新進榜"], ["up", "升溫最快"], ["c", "留言最多"]].map(([k, l]) => `<button data-act="sort" data-k="${k}">${l}</button>`).join("")}</span>`
      + `${small.length ? `<i class="br"></i><span class="lbl">其他分類</span>${small.map(([c, rows]) => `<button data-cat="${esc(c)}">${esc(c)} ${rows.length}</button>`).join("")}` : ""}</div>`
      + `</nav><main><div id="addbox" hidden><div class="hd">加主題：打一個關鍵字（例：台積電、子瑜），馬上去 HN、PTT、Reddit、Dcard 搜，之後約每小時一次</div>`
      + `<form id="addform"><input id="addq" placeholder="例如：台積電" autocomplete="off"><button>加</button></form></div>`
      + starUnder.map(([u, xs]) => `<section data-cat="⭐ 收藏" data-under="${esc(u)}" data-keep><h2>收藏${u ? ` · ${esc(u)}` : ""}</h2>${xs.map(card).join("")}</section>`).join("")
      + tops.map(([q, rows]) => `<section data-cat="🔍 ${esc(q)}" data-show><h2>${esc(q)}</h2>${status(q, rows.length)}${rows.map(card).join("")}</section>`).join("")
      + used.map(([c, rows]) => `<section data-cat="${esc(c)}"><h2>${esc(c)}</h2>${rows.map(card).join("")}</section>`).join("") + "</main>"
      // this page's own clicks, before pageHtml's: ＋ 加主題 opens the box (remembered), 加 adds, ✕ drops (asks first),
      // 排列 reorders each section's cards (remembered; ⭐ 收藏 keeps its order)
      + `<script>(()=>{const K="list.html:add",S="list.html:sort",box=document.getElementById("addbox"),inp=document.getElementById("addq");`
      + `const go=(a,q)=>{if(!q)return;location.hash="do="+a+"&name="+encodeURIComponent(q)+"&n="+Date.now();setTimeout(()=>history.replaceState(null,"",location.pathname),500)};`
      + `const open=(on)=>{box.hidden=!on;try{localStorage.setItem(K,on?"1":"")}catch{}};try{open(localStorage.getItem(K)==="1")}catch{}`
      + `const by={hot:(c)=>+c.dataset.rank,new:(c)=>-c.dataset.first,up:(c)=>-c.dataset.up,c:(c)=>-c.dataset.c};`
      + `const sortBy=(k)=>{if(!by[k])k="hot";for(const s of document.querySelectorAll("section:not([data-keep])"))[...s.querySelectorAll(":scope>.card")]`
      + `.sort((a,b)=>by[k](a)-by[k](b)||a.dataset.rank-b.dataset.rank).forEach((c)=>s.appendChild(c));`
      + `for(const b of document.querySelectorAll(".sortbar button"))b.classList.toggle("on",b.dataset.k===k);try{localStorage.setItem(S,k)}catch{}};`
      + `try{sortBy(localStorage.getItem(S)||"hot")}catch{sortBy("hot")}`
      + `document.addEventListener("click",(e)=>{const b=e.target.closest("[data-act]");if(!b)return;e.preventDefault();e.stopPropagation();const a=b.dataset.act;`
      + `if(a==="toggle"){open(box.hidden);if(!box.hidden)inp.focus();return}if(a==="sort"){sortBy(b.dataset.k);return}`
      + `if(a==="tdrop"&&!confirm("拿掉主題「"+b.dataset.q+"」？（收藏的會留著）"))return;go(a,b.dataset.q)},true);`
      + `document.getElementById("addform").addEventListener("submit",(e)=>{e.preventDefault();go("tadd",inp.value.trim());inp.value=""})})()</script>`);
  }
  // the reports: a card each (title, when, the topic asked), newest first; a click opens it
  reportsHtml() {
    return pageHtml(`<main><h2>trend agent 的報告</h2>${(this.reports ?? []).map((r) => `<div class="card" data-do="open" data-name="${esc(r.name)}">`
      + `<div class="top"><span class="title">${esc(r.title || r.topic || r.name)}</span></div>`
      + `<div class="meta">${esc([reportWhen(r.name), r.topic].filter(Boolean).join(" · "))}</div></div>`).join("")}</main>`);
  }
  // the videos: a chip per topic (videos.txt's order; ✕ takes the topic and its videos out), ＋ 加主題 opening a box
  // to type one or click a suggestion (searched at once), then each topic's videos as cards with YouTube's thumbnail,
  // newest found first; a card plays it (do=play&name=<id>). When found: a date, not 「幾分前」, so the page doesn't
  // change every minute. The topic and add clicks are this page's own (data-act, below), not pageHtml's.
  videosHtml() {
    const v = this.videos ?? {}, t = theme(), queries = this.queries ?? v.queries ?? [];
    const isTopic = (s) => queries.some((q) => q.toLowerCase() === s.toLowerCase());
    const sug = (v.suggest ?? []).filter((s) => !(this.skip ?? []).includes(s.q.toLowerCase()) && !isTopic(s.q));
    // a line of videos-skip.txt hides the videos it's about: what it says beyond your topics' words ("tzuyu owndays" →
    // owndays), all of it in the title; a starred video stays
    const qwords = queries.flatMap((q) => q.toLowerCase().split(/\s+/)).filter(Boolean);
    const nots = (this.skip ?? []).map((s) => qwords.reduce((r, w) => r.split(w).join(" "), s).split(/\s+/).filter(Boolean)).filter((ws) => ws.length);
    const items = (v.items ?? []).filter((x) => queries.includes(x.query) && (this.stars?.[x.id] || !nots.some((ws) => ws.every((w) => x.title.toLowerCase().includes(w)))));
    const when = (s) => { const d = new Date(Date.parse(s)); return Number.isNaN(d.getTime()) ? "" : `${d.getMonth() + 1}/${d.getDate()} ${hhmm(d.getTime())} 找到`; };
    const errs = Object.entries(v.errors ?? {}).filter(([q]) => !q || isTopic(q)).map(([q, e]) => `<p class="err">${esc(q ? `「${q}」：${e}` : e)}</p>`).join("");
    // data-rel / data-views / data-new: the video's rank in that list of its topic (fetch.js: each list its own YouTube
    // search), empty when it isn't in it; data-v its views, data-up when it was put up (found minus 「…前」)
    const rank = (x, l) => (x.lists?.[l] ?? "");
    const card = (x) => `<div class="card vid" data-do="play" data-name="${esc(x.id)}" data-v="${viewsOf(x.views)}"`
      + ` data-up="${agoMs(x.published) ? Date.parse(x.found) - agoMs(x.published) : 0}" data-rel="${rank(x, "rel")}" data-views="${rank(x, "views")}" data-new="${rank(x, "new")}">`
      + `<img src="https://i.ytimg.com/vi/${esc(x.id)}/mqdefault.jpg" alt="" loading="lazy"><div class="vb">`
      + `<div class="title">${esc(x.title)}</div>`
      + `<div class="meta">${esc([x.channel, x.length, x.published, x.views].filter(Boolean).join(" · "))}</div>`
      + `<div class="meta">${esc([when(x.found), this.progress?.[x.id] > 5 ? `▶ 上次看到 ${mmss(this.progress[x.id])}` : ""].filter(Boolean).join(" · "))}</div></div>`
      + `<button class="star${this.stars?.[x.id] ? " on" : ""}" data-do="star" title="${this.stars?.[x.id] ? "取消收藏" : "收藏：一直留著"}">${starIcon(this.stars?.[x.id])}</button></div>`;
    // ⭐ 收藏 by the topic that found each (your topics' order, then gone ones), newest starred first in each
    const starred = Object.values(this.stars ?? {}).sort((a, b) => String(b.starred).localeCompare(String(a.starred)));
    const starTopics = [...new Set([...queries, ...starred.map((x) => x.query ?? "")])].map((q) => [q, starred.filter((x) => (x.query ?? "") === q)]).filter(([, xs]) => xs.length);
    // each topic's videos: all its lists' (the 看 bar shows one list at a time)
    const groups = queries.map((q) => [q, items.filter((x) => x.query === q)]);
    // a topic's state under its heading: 正在搜 (turning), never searched yet, or searched and found nothing
    const status = (q, n) => this.searching?.has(q) ? '<p class="empty busy"><span class="spin"></span>正在搜 YouTube…（三份清單，約半分鐘）</p>'
      : n ? "" : Object.keys(v.done ?? {}).some((k) => k.endsWith(` ${q}`))
        ? `<p class="empty">搜過了，沒有標題含「${esc(q)}」的影片：YouTube 上常用別的寫法，試試中英並列（例如「中文名 英文名」）</p>`
        : '<p class="empty">還沒搜：馬上會搜</p>';
    return pageHtml(`<style>.vid{display:flex;gap:12px;align-items:flex-start}.vid[hidden]{display:none}.vid img{flex:none;width:136px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:var(--bg)}`
      + `.vb{flex:1;min-width:0}.err{margin:8px 12px;font-size:.88em;color:${t.ansi1}}.empty{margin:4px 12px 10px;font-size:.88em;color:var(--muted)}`
      + `.star{flex:none;display:inline-flex;border:0;background:none;padding:2px;color:var(--muted);cursor:pointer}.star:hover,.star.on{color:var(--yellow)}`
      + `nav .x{margin-left:8px;opacity:.55}nav .x:hover{opacity:1;color:${t.ansi1}}nav button.addt{color:var(--accent);border-style:dashed}`
      + `#addbox{margin:12px 12px 4px;padding:12px;border:1px dashed var(--border);border-radius:12px}#addbox .hd{font-size:.85em;color:var(--muted);margin-bottom:8px}`
      + `#addform{display:flex;gap:8px;margin-bottom:8px}#addq{flex:1;min-width:0;font:inherit;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg);color:var(--fg)}`
      + `#addbox button{font:inherit;font-size:.88em;padding:3px 10px;border-radius:6px;border:1px solid var(--border);background:var(--raised);color:var(--fg);cursor:pointer}#addbox button:hover{border-color:var(--accent)}`
      + `#addform button{background:var(--solid);color:var(--solid-fg);border-color:var(--solid)}.sugs{display:flex;flex-wrap:wrap;gap:8px}`
      + `.sortbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 12px 0;font-size:.85em;color:var(--muted)}`
      + `.sortbar button{font:inherit;padding:2px 8px;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--muted);cursor:pointer}.sortbar button:not(.on):hover{color:var(--fg);border-color:var(--muted)}`
      + `.sortbar button.on{background:var(--raised);color:var(--fg);border-color:var(--accent)}</style>`
      + `<nav><div class="row"><button data-cat="all">全部 ${items.length}</button>${starred.length ? `<button data-cat="⭐ 收藏">收藏 ${starred.length}</button>` : ""}`
      + `${groups.map(([q, xs]) => `<button data-cat="${esc(q)}">${esc(q)} ${this.searching?.has(q) ? '<span class="spin"></span>' : xs.length}<span class="x" data-act="drop" data-q="${esc(q)}" title="拿掉這個主題和它的影片">✕</span></button>`).join("")}`
      + `<button class="addt" data-act="toggle">＋ 加主題</button></div>${starSubs(starTopics.map(([q, xs]) => [q, xs.length]))}</nav>`
      + `<main><div id="addbox" hidden><div class="hd">加主題：打一個 YouTube 搜尋，或點一個建議，馬上搜；影片會出現在它自己的分類</div>`
      + `<form id="addform"><input id="addq" placeholder="例如：TWICE 子瑜 直拍" autocomplete="off"><button>加</button></form>`
      + `${sug.length ? `<div class="sugs">${sug.map((s) => `<button data-act="add" data-q="${esc(s.q)}" title="${esc(s.why)}">＋ ${esc(s.q)}</button>`).join("")}</div>` : ""}</div>`
      + `<div class="sortbar">看：${[["rel", "最相關"], ["views", "最多人看"], ["new", "最新上傳"]]
        .map(([k, l]) => `<button data-act="sort" data-q="${k}">${l}</button>`).join("")}</div>`
      + `${errs}${queries.length ? "" : '<p class="empty">還沒有主題：按上面的「＋ 加主題」</p>'}`
      + starTopics.map(([q, xs]) => `<section data-cat="⭐ 收藏" data-under="${esc(q)}" data-keep><h2>收藏${q ? ` · ${esc(q)}` : ""}</h2>${xs.map(card).join("")}</section>`).join("")
      + `${groups.map(([q, xs]) => `<section data-cat="${esc(q)}" data-show><h2>${esc(q)}</h2>${status(q, xs.length)}`
        + `<p class="empty none" hidden>這份清單還沒有影片</p>${xs.map(card).join("")}</section>`).join("")}</main>`
      // this page's own clicks, before pageHtml's: ＋ 加主題 opens the box (remembered), a suggestion or 加 adds, ✕ drops
      + `<script>(()=>{const K="videos.html:add",box=document.getElementById("addbox"),inp=document.getElementById("addq");`
      + `const go=(a,q)=>{if(!q)return;location.hash="do="+a+"&name="+encodeURIComponent(q)+"&n="+Date.now();setTimeout(()=>history.replaceState(null,"",location.pathname),500)};`
      + `const open=(on)=>{box.hidden=!on;try{localStorage.setItem(K,on?"1":"")}catch{}};try{open(localStorage.getItem(K)==="1")}catch{}`
      // 看: which list each topic shows (its own YouTube search), the choice remembered: 最相關 in YouTube's order,
      // 最多人看 by views, 最新上傳 newest first; ⭐ 收藏 shows all of it, in that order too (最相關: newest starred first)
      + `const S="videos.html:list",by={rel:(c)=>+c.dataset.rel,views:(c)=>-c.dataset.v,new:(c)=>-c.dataset.up||+c.dataset.new},keepBy={rel:(c)=>+c.dataset.i,views:(c)=>-c.dataset.v,new:(c)=>-c.dataset.up};`
      + `const sortBy=(k)=>{if(!by[k])k="rel";for(const s of document.querySelectorAll("section")){const cs=[...s.querySelectorAll(":scope>.card.vid")],keep=s.hasAttribute("data-keep");`
      + `cs.forEach((c,i)=>{c.dataset.i??=i});const on=keep?cs:cs.filter((c)=>c.dataset[k]!=="");for(const c of cs)c.hidden=!on.includes(c);`
      + `on.sort((a,b)=>(keep?keepBy:by)[k](a)-(keep?keepBy:by)[k](b)||a.dataset.i-b.dataset.i).forEach((c)=>s.appendChild(c));const none=s.querySelector(".none");if(none)none.hidden=!!on.length||!cs.length}`
      + `for(const b of document.querySelectorAll(".sortbar button"))b.classList.toggle("on",b.dataset.q===k);try{localStorage.setItem(S,k)}catch{}};`
      // pageHtml's script (after this one) and its chips (show) show all of a section's cards: the 看 list hides the
      // others again after it
      + `const again=()=>sortBy(document.querySelector(".sortbar button.on")?.dataset.q);try{sortBy(localStorage.getItem(S)||"rel")}catch{sortBy("rel")}`
      + `addEventListener("DOMContentLoaded",again);document.addEventListener("click",(e)=>{if(e.target.closest("nav button"))again()});`
      + `document.addEventListener("click",(e)=>{const b=e.target.closest("[data-act]");if(!b)return;e.preventDefault();e.stopPropagation();const a=b.dataset.act;`
      + `if(a==="toggle"){open(box.hidden);if(!box.hidden)inp.focus();return}if(a==="sort"){sortBy(b.dataset.q);return}`
      + `if(a==="drop"&&!confirm("拿掉主題「"+b.dataset.q+"」和它的影片？（收藏的會留著）"))return;go(a,b.dataset.q)},true);`
      + `document.getElementById("addform").addEventListener("submit",(e)=>{e.preventDefault();go("add",inp.value.trim());inp.value=""})})()</script>`);
  }

  // 問 agent: which trend agent (this space's first), the tool a new one opens with, a free question, what happened
  askCard(t, z) {
    const list = this.agentList(), picked = this.picked(list);
    const card = v_flex().id("ask").flex_none().gap(6).p(10).bg(t.chrome).border_t(1).border_color(t.border);
    // the line says what the box asks about: the video playing, or what's trending (the agent's own tab title, often
    // its last task, said nothing about it)
    const x = this.watching;
    card.child(div().text_size(z - 1).font_semibold().text_color(t.muted).truncate().child(x ? `問這支影片：${x.title}（花 token）` : "問 trend agent（花 token）"));
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
        .cursor_text().child(Input.new(x ? this.videoBox : this.box).w_full().text_size(z).text_color(t.foreground)))
      .child(div().id("ask-send").h(34).px(14).flex().items_center().rounded(7).cursor_pointer().font_semibold().bg(t.solid).text_color(t.solid_foreground)
        .hover((s) => s.opacity(0.88)).on_click((_e, cx) => cx.spawn(async (cx) => this.askFree(cx))).child("送出")));
    const s = this.asked;
    if (s?.error) card.child(div().id("ask-err").text_size(z - 1).text_color(t.ansi1).whitespace_normal().on_mouse_down("right", copyOn(s.error)).child(s.error));
    else if (s?.sent) card.child(div().text_size(z - 1).text_color(t.ansi2).whitespace_normal().child(`✓「${s.sent}」已送給 ${s.to}，在它的分頁回答`));
    else if (s?.opening) card.child(div().text_size(z - 1).text_color(t.ansi2).whitespace_normal().child(`✓ ${s.to}，開好就回答「${s.opening}」`));
    return card;
  }
}
