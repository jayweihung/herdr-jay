// 熱門's list, worked out where the data is made (jay: 資料狀態跟存取在後端): fetch.js runs this after each run and
// writes list.json (and sends it to the site's backend with the rest, push.js), so the desktop panel and the phone only
// draw it. Moved here from main.js as it was: no model, no tokens.
// 熱門清單在抓資料這一端算好（分主題、合併跨站同一則），寫成 list.json；電腦面板和手機只照著畫。
"use strict";
const num = (n) => (n >= 10000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const shortLink = (url) => { try { const u = new URL(url); return `${u.hostname}${u.pathname.length > 1 ? u.pathname.slice(0, 40) : ""}`; } catch { return url.slice(0, 60); } };
const DIGG_TOPIC = { ai: "AI", tech: "科技", "world-business": "國際商業", sports: "體育", science: "科學", gaming: "遊戲", entertainment: "娛樂" };
// The list by subject (no model, no tokens): AI, stock and game words in the title first, then what the site says
// (Reddit's subreddit, PTT's board, Dcard's forum), then the other words, then Digg's topic, then the site's usual
// (HN: 軟體, PTT 八卦's [新聞]/[爆卦]: 社會, Dcard and Threads: 生活, Reddit's front page: 搞笑).
// 依主題分類：先看標題的 AI、股票、遊戲關鍵字，再看各站的分類／看板，再看其他關鍵字，最後照網站慣例。
// shortcut: keyword lists misfile some titles; a cheap model call per row if that starts to matter.
// The usual order; list.json's cats go by how many cards each has (其他 last).
const CATS = ["AI", "軟體", "硬體", "3C", "科技", "科學", "股票", "財經", "政治", "社會", "國際", "娛樂", "遊戲", "體育", "生活", "搞笑", "美食", "旅遊", "汽車", "其他"];
const FIRST = [
  ["AI", /\b(AI|A\.I\.|AGI|LLMs?|GPTs?|ChatGPT|OpenAI|Anthropic|Claude|Gemini|Copilot|Qwen\w*|DeepSeek|Llama|Mistral|Grok|xAI|machine learning|neural|agents?ic)\b|人工智慧|生成式|大模型|語言模型/i],
  ["股票", /\b(stocks?|stock market|earnings|IPO|Nasdaq|S&P ?500|Dow Jones|Wall Street|shareholders?|market cap|short sellers?|buyback|NYSE|ETFs?)\b|\$[A-Z]{1,5}\b|股票|股價|股市|台股|美股|大盤|加權|漲停|跌停|斷頭|融資|融券|除息|殖利率|0050|00878|當沖|存股/i],
  ["遊戲", /\b(GTA ?\w*|Nintendo|Switch 2|PS5|PlayStation|Xbox|Steam|Minecraft|Pok[eé]mon|Zelda|Elden Ring|League of Legends|LoL|Valorant|Genshin|video games?|gaming)\b|遊戲|手遊|電玩|原神|鳴潮|寶可夢|英雄聯盟|崩壞|絕區零|任天堂/i],
];
const WORDS = [
  ["政治", /\b(Trump|Biden|Harris|Vance|Obama|election|Congress|Senate|House Republicans|Democrats?|Republicans?|GOP|White House|Supreme Court|governor|impeach\w*|Epstein|RFK|Pelosi|MAGA)\b|政府|選舉|立法院|行政院|總統|國民黨|民進黨|民眾黨|藍營|綠營|藍白|民調|立委|議員|市長|市府|罷免|公投|造勢|候選人|政黑|賴清德|柯文哲|黃國昌|蔣萬安|沈伯洋|卓榮泰|韓國瑜|朱立倫|侯友宜|盧秀燕|鄭麗文|黃復興|川普|拜登|國安|國防部|內政部|外交部|經濟部|部長|政院|府院/i],
  ["社會", /警方|警察|檢方|檢察|法院|判刑|判決|起訴|羈押|車禍|火災|命案|兇手|性侵|猥褻|詐騙|詐團|酒駕|墜樓|失蹤|身亡|喪命|死亡|事故|竊|搶劫|家暴|虐童|霸凌|消防|颱風|地震|豪雨|停電|停水|\b(police|arrested|shooting|killed|murder|lawsuit|sued|crash|wildfire|earthquake|hurricane)\b/i],
  ["國際", /\b(war|Ukraine|Russia|Putin|Israel|Gaza|Iran|NATO|China|Beijing|Taiwan|sanctions?|UN|EU|Europe|ceasefire|missiles?|North Korea|Kim Jong)\b|中國|中共|習近平|大陸|戰爭|烏克蘭|俄羅斯|普丁|以色列|伊朗|北韓|南韓|日本首相|高市|外交|聯合國|關稅/i],
  ["財經", /\b(Fed|interest rates?|inflation|economy|economic|recession|tariffs?|bitcoin|crypto\w*|layoffs?|GDP|jobs report|mortgage|banks?)\b|經濟|通膨|利率|升息|降息|央行|匯率|房價|房市|打房|薪水|薪資|加薪|年終|物價|基金|保險|比特幣|加密貨幣|裁員|退休金|勞保/i],
  ["硬體", /\b(chips?|semiconductors?|GPUs?|CPUs?|TSMC|AMD|Intel|ARM|Qualcomm|RISC-V|transistors?|wafers?|fab|DRAM|HBM|NAND|SSDs?|motherboard|FPGA|silicon|hardware|data ?centers?)\b|晶片|半導體|台積電|聯發科|顯卡|處理器|晶圓|封裝|製程|伺服器|記憶體|硬體|散熱/i],
  ["軟體", /\b(software|open[- ]source|GitHub|Linux|Windows 1[01]|macOS|kernel|Rust|Python|JavaScript|TypeScript|Go(lang)?|Java|C\+\+|compiler|database|Postgres\w*|SQLite|API|SDK|framework|programming|programmers?|developers?|coding|code|bugs?|vulnerability|CVE|exploit|malware|ransomware|hack(ed|ers?)?|browser|Firefox|Chrome|Nginx|Kubernetes|Docker|cloud|outage|algorithm|engineers?|FFmpeg|git|regex|TCP\/IP|protocols?|CAD|security advisory)\b|軟體|工程師|程式|寫code|開源|資安|漏洞|駭客|當機|系統更新/i],
  ["3C", /\b(iPhone|iPad|MacBook|Mac mini|AirPods|Apple Watch|Pixel|Galaxy|smartphones?|laptops?|tablets?|headphones?|earbuds|cameras?|Kindle|Vision Pro|monitor)\b|手機|筆電|平板|耳機|相機|螢幕|充電|行動電源|藍牙|3C|規格|開箱/i],
  ["科學", /\b(NASA|SpaceX|Starship|rocket|space|physics|biology|scientists?|study finds|research(ers)?|climate|El Niño|species|fossil|quantum|astronom\w*|telescope|Mars|moon|DNA|genes?|vaccines?|cancer|brain)\b|科學|研究|太空|火箭|天文|基因|疫苗|醫學/i],
  ["科技", /\b(Apple|Microsoft|Google|Amazon|Meta|Tesla|Musk|Nvidia|Jensen Huang|Altman|Zuckerberg|Bezos|Netflix|Uber|startups?|tech|Silicon Valley|robots?|drones?)\b|科技|蘋果|微軟|谷歌|馬斯克|輝達|黃仁勳|新創|機器人|無人機/i],
  ["汽車", /\b(cars?|EVs?|electric vehicles?|Toyota|Honda|BMW|Mercedes|Porsche|Ferrari|Ford|GM|BYD|Rivian|Waymo|self-driving|autopilot)\b|汽車|車款|新車|電動車|機車|重機|油價|加油|駕照|開車|停車|國道|特斯拉|Gogoro/i],
  ["美食", /\b(food|restaurants?|recipes?|cooking|chefs?|pizza|burgers?|coffee|ramen|sushi)\b|美食|餐廳|好吃|食記|料理|拉麵|咖啡|甜點|火鍋|燒肉|吃到飽|便當|手搖|飲料|早餐|宵夜|夜市|麥當勞|超商|全家|7-11|小七|麵包/i],
  ["旅遊", /\b(travel|trips?|tourists?|flights?|airlines?|airports?|hotels?|vacation|Airbnb)\b|旅遊|旅行|自由行|出國|機票|航空|班機|飯店|住宿|民宿|景點|行程|日本玩|東京|大阪|京都|福岡|沖繩|首爾|釜山|曼谷|簽證/i],
  ["體育", /\b(NBA|NFL|MLB|NHL|FIFA|World Cup|Olympics?|Premier League|Formula 1|F1|tennis|golf|touchdown|Ohtani|WBC)\b|中職|職棒|職籃|棒球|籃球|足球|網球|羽球|桌球|奧運|世界盃|經典賽|大谷|球員|球隊|教練|冠軍賽|季後賽|中信兄弟|統一獅|樂天桃猿|富邦悍將|味全龍|台鋼雄鷹/i],
  ["娛樂", /\b(movies?|films?|TV|series|Netflix|Disney|Marvel|Star Wars|actors?|actress|singers?|albums?|concerts?|K-?pop|anime|manga|Oscars?|Grammys?|Emmys?)\b|電影|影集|韓劇|日劇|台劇|陸劇|綜藝|藝人|明星|偶像|演唱會|專輯|歌手|演員|動畫|漫畫|新番|追劇|金曲|金馬|網紅|YouTuber|直播主|TWICE|BLACKPINK|BTS/i],
  ["搞笑", /笑死|好笑|爆笑|梗圖|迷因|有梗|廢文|\b(meme|memes|lol|lmao|funny)\b/i],
  ["生活", /感情|男友|女友|老公|老婆|婆婆|公婆|曖昧|分手|交往|結婚|離婚|外遇|小三|閨蜜|室友|租屋|房東|搬家|上班|主管|同事|離職|面試|穿搭|保養|化妝|減肥|健身|網購|蝦皮|寵物|貓|狗|小孩|育兒|懷孕|生日|爸媽|家人|日常/i],
];
const DIGG_CAT = { ai: "AI", tech: "科技", "world-business": "國際", sports: "體育", science: "科學", gaming: "遊戲", entertainment: "娛樂" };
const SUB_CAT = [
  ["政治", /^r\/(politics|PoliticalHumor|Conservative|democrats|Republican|law|JoeBuddenPodcasts)$/i],
  ["國際", /^r\/(worldnews|europe|ukraine|geopolitics|UkrainianConflict|anime_titties)$/i],
  ["股票", /^r\/(wallstreetbets|stocks|investing|StockMarket|options|ValueInvesting|taiwanstock)$/i],
  ["財經", /^r\/(economics|economy|personalfinance|CryptoCurrency|Bitcoin|finance)$/i],
  ["軟體", /^r\/(programming|webdev|linux|sysadmin|cybersecurity|ProgrammerHumor|selfhosted)$/i],
  ["硬體", /^r\/(hardware|pcmasterrace|buildapc|nvidia|Amd|intel)$/i],
  ["3C", /^r\/(gadgets|apple|android|iphone|mac|ipad)$/i],
  ["科技", /^r\/(technology|Futurology)$/i],
  ["科學", /^r\/(science|space|askscience|EarthPorn|interestingasfuck|Damnthatsinteresting|nextfuckinglevel)$/i],
  ["娛樂", /^r\/(movies|television|music|entertainment|shittymoviedetails|popculturechat|anime|Marvel|kpop|BravoRealHousewives|marvelstudios|lordoftherings|StarWars|harrypotter)$/i],
  ["遊戲", /^r\/(gaming|pcgaming|Games|nintendo|PS5|xbox|GTA\w*|leagueoflegends|Minecraft|Gamingcirclejerk|pokemon|videogames|PS4|NintendoSwitch)$/i],
  ["體育", /^r\/(sports|nba|nfl|soccer|baseball|hockey|formula1|tennis|MMA|CFB|SquaredCircle)$/i],
  ["美食", /^r\/(food|FoodPorn|Cooking|recipes|KitchenConfidential)$/i],
  ["旅遊", /^r\/(travel|solotravel|TravelHacks)$/i],
  ["汽車", /^r\/(cars|electricvehicles|teslamotors|Justrolledintotheshop)$/i],
  ["生活", /^r\/(AskReddit|mildlyinfuriating|AmItheAsshole|relationship_advice|LifeProTips|aww|pics|BeAmazed|todayilearned)$/i],
  ["搞笑", /^r\/(funny|memes|SipsTea|comics|me_irl|meirl|dankmemes|whitepeopletwitter|BlackPeopleTwitter|facepalm|therewasanattempt|Unexpected|HolUp|clevercomebacks)$/i],
  ["其他", /^r\/news$/i],
];
// PTT's boards: the ones that are one subject (Gossiping isn't: its posts go by their words)
const PTT_CAT = [
  ["政治", /^(HatePolitics|Election|PublicIssue)$/i],
  ["股票", /^(Stock|Option|Fund|Foreign_Inv|DayTrade|ETF)$/i],
  ["財經", /^(Lifeismoney|home-sale|Finance|Bank_Service|Insurance|Salary|Economics)$/i],
  ["軟體", /^(Soft_Job|Python|Programming|Linux|Ajax|Web_Design)$/i],
  ["硬體", /^(PC_Shopping|Hardware|DIY_PC)$/i],
  ["3C", /^(MobileComm|iOS|Android|iPhone|MacShop|Headphone|DigiCamera)$/i],
  ["科技", /^(Tech_Job|Tech|e-shopping)$/i],
  ["國際", /^(Military|China-News|WorldNews|Japan_Living|Korea)$/i],
  ["娛樂", /^(C_Chat|movie|KoreaStar|Japan_Star|TaiwanDrama|KoreaDrama|China-Drama|ACG|EAseries|Drama-Ticket|BabyMother|TW_Entertain|marvel)$/i],
  ["遊戲", /^(LoL|PlayStation|NSwitch|Steam|mobile-game|Hearthstone|PCReDive|Gamesale|PokemonGO|Genshin-Impact|WutheringWaves)$/i],
  ["體育", /^(Baseball|NBA|basketballTW|Tennis|Football|MLB|Elephants|Lions|Guardians|Monkeys|FuBon_Guardians|Wanted|Volleyball|Badminton)$/i],
  ["美食", /^(Food|Kaohsiung_Food|KoreanFood|Japan_Food|cookclub|Coffee)$/i],
  ["旅遊", /^(Japan_Travel|Travel|Taiwan_Travel|Korea_Travel|Europe_Travel|Aviation)$/i],
  ["汽車", /^(car|CarShop|biker|Gogoro|EV|Tesla)$/i],
  ["搞笑", /^(joke|StupidClown|CATCH|funny)$/i],
  ["生活", /^(WomenTalk|Boy-Girl|marriage|pet|cat|dog|Beauty_|BeautySalon|MakeUp|e-coupon|Tainan|Kaohsiung|Taichung|ToS|AllTogether|SENIORHIGH|graduate|Salary_|job)$/i],
];
// Dcard's forums by alias (Dcard and Threads are mostly everyday life: 生活 when nothing else says otherwise)
const DCARD_CAT = [
  ["股票", /^(stock|stock_market|etf)$/i],
  ["財經", /^(money|investment|creditcard|insurance|job|salary)$/i],
  ["政治", /^(trending|politics|election\w*)$/i],
  ["軟體", /^(softwareengineer|engineer|tech_job)$/i],
  ["3C", /^(3c|apple|android|phone|headphone|camera)$/i],
  ["硬體", /^(pc)$/i],
  ["娛樂", /^(entertainer|movie|tvepisode|drama|kpop|japan_drama|show|youtuber|netflix|music|acg|vtuber|marvel|twice|blackpink)$/i],
  ["遊戲", /^(game|lol|mobilegame|steam|switch|ps|genshin|pokemon)$/i],
  ["體育", /^(sport|baseball|basketball|nba|fitness|soccer|badminton)$/i],
  ["美食", /^(food|cooking|coffee|drink|cvs)$/i],
  ["旅遊", /^(travel|japan_travel|korea_travel|taiwan_travel|airline)$/i],
  ["汽車", /^(car|motorcycle|ev)$/i],
  ["搞笑", /^(funny|meme)$/i],
  ["生活", /^(talk|mood|relationship|girl|boy|marriage|makeup|dressup|pet|cat|dog|house|rent|life|parenting|wedding)$/i],
];
const match = (list, s) => list.find(([, re]) => re.test(s))?.[0];
function categoryOf(r) {
  const text = `${r.topic} ${r.feed ? "" : why(r)}`;
  const table = r.sub ? [SUB_CAT, r.sub] : r.board && r.feed === "PTT" ? [PTT_CAT, r.board] : r.forum ? [DCARD_CAT, r.forum] : null;
  const site = table ? match(table[0], table[1]) : null;
  // a site's own 其他 (r/news) or a board that is all sorts: the words decide
  const usual = r.feed === "HN" ? "軟體" : r.feed === "PTT" && /^\s*(Re:\s*)?\[(新聞|爆卦)\]/.test(r.topic) ? "社會"
    : ["Dcard", "Threads"].includes(r.feed) ? "生活" : r.feed === "Reddit" ? "搞笑" : r.feed === "PTT" ? "生活" : "其他";
  return match(FIRST, text) || (site !== "其他" && site) || match(WORDS, text) || site || DIGG_CAT[r.digg] || usual;
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
  const rows = joined(out).map(kept), n = (c) => rows.filter((r) => r.cat === c).length;
  // the subjects by how many cards each has now (其他 last), so the chips and the sections lead with the busy ones
  const cats = [...CATS].sort((a, b) => (a === "其他") - (b === "其他") || n(b) - n(a));
  return { at: new Date().toISOString().replace(/\.\d+Z$/, "Z"), since: feeds?.since ?? null, cats, rows, topics: mine };
}
module.exports = { buildList, categoryOf, titleKey, similar, joined, CATS };
