// Tests for 熱門's list (list.js) and its push to the site's backend (push.js), without Herdr or the network:
// node tests/trend/run.js (macOS, Linux, Windows; Node 18+). The backend is a stand-in on 127.0.0.1.
const assert = require("assert/strict"), fs = require("fs"), os = require("os"), path = require("path"), http = require("http");
const MOD = path.join(__dirname, "..", "..", "herdr-app", "mods", "trend");
const { buildList } = require(path.join(MOD, "list.js"));

// the list: the same story on two sites is one card, each card has its subject, my topics are their own
const hn = (title, url) => ({ title, url, points: 120, comments: 30, first: "2026-11-18T10:00:00Z" });
const L = buildList(
  { results: [{ topic: "Solid topic", evidence_urls: ["https://a.example/1"], engagement: { hackernews: { points: 900, comments: 80 } } }] },
  { since: "2026-11-17T00:00:00Z", hn: [hn("OpenAI releases new GPT model for coding", "https://hn.example/1"), hn("Cited elsewhere", "https://a.example/1")],
    reddit: [{ title: "OpenAI releases new GPT model for coding agents", url: "https://r.example/1", score: 5000, comments: 900, subreddit: "r/technology" }],
    ptt: [{ title: "[情報] 中職今天的比賽", url: "https://ptt.example/1", score: 120, board: "Baseball" }] },
  { items: { 台積電: { hn: [hn("TSMC opens a new fab in Arizona", "https://hn.example/2")] } } });
assert.equal(L.rows[0].topic, "Solid topic");
assert.equal(L.rows[0].line, "HN 900 分 · 80 留言");
assert(!L.rows.some((r) => r.topic === "Cited elsewhere"), "a story a topic already cites is left out");
const gpt = L.rows.find((r) => r.feed === "HN" && /GPT/.test(r.topic));
assert.equal(gpt.cat, "AI");
assert.equal(gpt.also?.[0]?.feed, "Reddit", "the same story on Reddit joins the HN card");
assert.equal(L.rows.find((r) => r.feed === "PTT").cat, "體育");
assert.equal(L.topics["台積電"][0].q, "台積電");
assert(L.rows.every((r) => !("key" in r)), "no Set left in what is written");
assert.equal(JSON.parse(JSON.stringify(L)).rows.length, L.rows.length);

// the push: every snapshot and report once, the same text not again, no key file: nothing sent, the key never printed
(async () => {
  const got = [];
  const srv = http.createServer((q, r) => { let b = ""; q.on("data", (c) => (b += c)); q.on("end", () => {
    got.push(`${q.method} ${q.url} ${q.headers.authorization}`); r.writeHead(/^Bearer qtk_/.test(q.headers.authorization) ? 200 : 401); r.end("{}"); }); });
  await new Promise((ok) => srv.listen(0, "127.0.0.1", ok));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trend-")), out = path.join(tmp, "trend"), key = path.join(tmp, "key");
  fs.mkdirSync(out); fs.mkdirSync(path.join(tmp, "mods", "trend", ".reports"), { recursive: true });
  for (const n of ["feeds", "list"]) fs.writeFileSync(path.join(out, `${n}.json`), `{"n":"${n}"}`);
  fs.writeFileSync(path.join(tmp, "mods", "trend", ".reports", "2026-11-18-1030-ai.html"), '<meta name="trend-topic" content="AI &amp; chips">x');
  fs.writeFileSync(key, "qtk_secretvalue\n");
  fs.writeFileSync(path.join(out, "sync-origin"), `http://127.0.0.1:${srv.address().port}\n`); fs.writeFileSync(path.join(out, "push-key"), `${key}\n`);
  const { push } = require(path.join(MOD, "push.js"));
  const line1 = await push(out);
  assert.deepEqual(got.map((g) => g.split(" ").slice(0, 2).join(" ")), ["PUT /api/v1/trend/snapshots/feeds", "PUT /api/v1/trend/snapshots/list", "POST /api/v1/trend/reports"]);
  assert(!line1.includes("secretvalue") && line1.includes("qtk_"), line1);
  assert.equal((await push(out)).endsWith("沒有新的"), true, "unchanged: not sent again");
  assert.equal(got.length, 3);
  fs.writeFileSync(path.join(out, "push-key"), `${path.join(tmp, "none")}\n`);
  assert.match(await push(out), /沒有金鑰檔/);
  fs.rmSync(path.join(out, "push-key"));
  assert.match(await push(out), /沒有 sync-origin 或 push-key/);
  srv.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log("trend: ok");
})().catch((e) => { console.error(e); process.exit(1); });
