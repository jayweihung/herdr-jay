// 熱門's list, worked out where the data is made (jay: 資料狀態跟存取在後端): fetch.js runs this after each run and
// writes list.json (and sends it to the site's backend with the rest, push.js), so the desktop panel and the phone only
// draw it. Moved here from main.js as it was: no model, no tokens.
// 熱門清單在抓資料這一端算好（分主題、合併跨站同一則），寫成 list.json；電腦面板和手機只照著畫。
"use strict";
const num = (n) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const shortLink = (url) => { try { const u = new URL(url); return `${u.hostname}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}`; } catch { return url.slice(0, 60); } };
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
// Each site's rows (feeds.json's front pages and topics.json's searches alike) as the list's cards: title, the
// site's own counters, its link(s); first, rise and body as fetch.js gave them, comments for 留言最多
const FEEDS = ["hn", "reddit", "ptt", "dcard", "threads", "digg"];
const moved = (x) => ({ first: x.first, rise: x.rise, body: x.body, comments: x.comments ?? 0, created: x.created });
const ROW = {
  hn: (h) => ({ topic: h.title, feed: "HN", line: `HN ${num(h.points)} 分 · ${num(h.comments)} 留言`, ...moved(h),
    why_spiking: shortLink(h.url).split("/")[0], evidence_urls: [h.url, h.discussion].filter((u, i, a) => u && a.indexOf(u) === i) }),
  reddit: (p) => ({ topic: p.title, feed: "Reddit", line: `Reddit ${num(p.score)} 分 · ${num(p.comments)} 留言`, sub: p.subreddit, ...moved(p),
    why_spiking: [p.subreddit, shortLink(p.url).split("/")[0]].filter(Boolean).join(" · "), evidence_urls: [p.url, p.discussion].filter((u, i, a) => u && a.indexOf(u) === i) }),
  ptt: (p) => ({ topic: p.title, feed: "PTT", line: `PTT ${p.score >= 100 ? "爆" : `${p.score} 推`} · ${p.board}`, board: p.board, ...moved(p),
    why_spiking: [p.board, p.author].filter(Boolean).join(" · "), evidence_urls: [p.url] }),
  dcard: (p) => ({ topic: p.title, feed: "Dcard", line: `Dcard ${num(p.score)} 心情 · ${num(p.comments)} 留言 · ${p.board}`, ...moved(p),
    forum: p.forum, why_spiking: p.board, evidence_urls: [p.url] }),
  threads: (p) => ({ topic: p.title, feed: "Threads", line: `Threads ${num(p.score)} 讚 · ${num(p.comments)} 回覆`, ...moved(p),
    why_spiking: `@${p.author}`, evidence_urls: [p.url] }),
  digg: (d) => ({ topic: d.title, feed: "Digg", ...moved(d), line: `Digg ${num(d.score)} 分 · ${d.sources} 個來源${DIGG_TOPIC[d.topic] ? ` · ${DIGG_TOPIC[d.topic]}` : ""}`,
    why_spiking: d.description, evidence_urls: [d.url], digg: d.topic }),
};
// A story on several sites (or boards) is one card: a row whose title shares enough with an earlier row's joins it
// (its .also); rank: its place
function joined(list) {
  const rows = [];
  for (const x of list) {
    const key = x.feed ? titleKey(x.topic) : null;   // last30days' topics stay on their own
    const into = key && key.size >= 3 && rows.find((r) => r.key && r.key.size >= 3 && similar(r.key, key) >= SAME);
    if (into) (into.also ??= []).push(x); else rows.push({ ...x, key, rank: rows.length + 1 });
  }
  return rows;
}

const SOURCE = { hackernews: "HN", reddit: "Reddit", digg: "Digg", x: "X", grounding: "網頁", youtube: "YouTube", polymarket: "Polymarket", github: "GitHub" };
// why_spiking without the engine's own counting sentence (the line above shows the numbers): the headline that's left
const why = (r) => String(r.why_spiking ?? "").replace(/^\d+ evidence items? on .*? generated [\d,]+ native interactions?\.\s*/, "") || String(r.why_spiking ?? "");

// "HN 4.7k 分 · 3.5k 留言 · Reddit 1.2k 分": each source's own counters, the ones people know
function engagementText(e) {
  return Object.entries(e ?? {}).map(([src, c]) => {
    const n = (k) => (typeof c?.[k] === "number" ? c[k] : null);
    const parts = [[n("points") ?? n("score") ?? n("likes") ?? n("digg_score"), "分"], [n("comments") ?? n("num_comments") ?? n("replies"), "留言"]]
      .filter(([v]) => v != null).map(([v, w]) => `${num(v)} ${w}`);
    return parts.length ? `${SOURCE[src] ?? src} ${parts.join(" · ")}` : null;
  }).filter(Boolean).join("　");
}
// a card as it is kept: every row field the panels use, its subject (cat), its line and why already written, no key
const kept = ({ key, ...r }) => ({ ...r, cat: categoryOf(r), line: r.line ?? (engagementText(r.engagement) || (r.sources ?? []).map((s) => SOURCE[s] ?? s).join("、")), why: why(r) });
// What the list shows: last30days' topics, then everything the sites' own front pages gave (HN, Reddit, PTT, Dcard,
// Threads, Digg), taken in turn (each site's rank), skipping a story a topic already cites; my topics' searches, each
// on its own, the sites taken in turn. A story on several sites (or boards) is one card (joined).
function buildList(trends, feeds, topics) {
  const results = Array.isArray(trends?.results) ? trends.results : [];
  const cited = new Set(results.flatMap((r) => r.evidence_urls ?? []));
  const out = [...results], names = new Set(results.map((r) => r.topic)), lists = FEEDS.map((k) => (feeds?.[k] ?? []).map(ROW[k]));
  for (let i = 0; lists.some((f) => i < f.length); i++)
    for (const x of lists.map((f) => f[i])) if (x && !names.has(x.topic) && !x.evidence_urls.some((u) => cited.has(u))) { names.add(x.topic); out.push(x); }
  const mine = {};
  for (const q of Object.keys(topics?.items ?? {})) {
    const ls = ["hn", "reddit", "ptt", "dcard"].map((k) => (topics.items[q]?.[k] ?? []).map((x) => ({ ...ROW[k](x), q })));
    const o = [];
    for (let i = 0; ls.some((l) => i < l.length); i++) for (const l of ls) if (l[i] && !o.some((x) => x.topic === l[i].topic)) o.push(l[i]);
    mine[q] = joined(o).map(kept);
  }
  return { at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), since: feeds?.since ?? null, cats: CATS, rows: joined(out).map(kept), topics: mine };
}
module.exports = { buildList, categoryOf, titleKey, similar, joined, CATS };
