// What fetch.js made, sent to your site's backend (<origin>/api/v1/trend, the origin in <Herdr home>/trend/sync-origin,
// as for the sync), so the desktop panel and the phone read it from there (data in the backend, not in a panel). The
// write key: the file named on the first line of <Herdr home>/trend/push-key (yours, local, not in git; the key file
// itself private: folder 700, file 600, never in git, a synced folder or the launchd plist); no push-key, no origin or
// no key: nothing is sent. Only the key's qtk_ prefix is ever printed. A file sent before with the same text isn't sent
// again (pushed.json: the site counts requests per IP, the panel's and the phone's too).
// 把抓到的結果送到自己網站的後端；金鑰檔的位置寫在 trend/push-key（沒有就不送），log 只印 qtk_ 開頭。
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const line = (file) => { try { return fs.readFileSync(file, "utf8").split("\n")[0].trim(); } catch { return ""; } };
const SNAPSHOTS = ["feeds", "topics", "trends", "videos", "status", "list"];
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");
const reportAt = (name, file) => { const m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})/.exec(name); return m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`) : fs.statSync(file).mtimeMs; };
const metaTopic = (html) => /<meta\s+name=["']trend-topic["']\s+content=["']([^"']*)["']/i.exec(html)?.[1]?.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim() ?? "";
// out: <Herdr home>/trend; names: which snapshots (all by default); the reports too unless only some were asked for.
// Gives a line for last.log.
async function push(out, names = SNAPSHOTS) {
  const origin = line(path.join(out, "sync-origin")).replace(/\/+$/, ""), keyFile = line(path.join(out, "push-key")).replace(/^~(?=\/|$)/, os.homedir());
  if (!/^https?:\/\//.test(origin) || !keyFile) return "送後端：沒有 sync-origin 或 push-key，不送";
  let key;
  try { key = fs.readFileSync(keyFile, "utf8").trim(); } catch { return "送後端：沒有金鑰檔，不送"; }
  if (!/^qtk_\S+$/.test(key)) return "送後端：金鑰檔不是 qtk_ 開頭，不送";
  let done = {};
  try { done = JSON.parse(fs.readFileSync(path.join(out, "pushed.json"), "utf8")); } catch {}
  const sent = [], failed = [];
  const send = async (method, url, body, what) => {
    try {
      const r = await fetch(`${origin}/api/v1/trend${url}`, { method, body, signal: AbortSignal.timeout(60000),
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" } });
      if (!r.ok) { failed.push(`${what} ${r.status}`); return false; }
      sent.push(what); return true;
    } catch (e) { failed.push(`${what} ${e.cause?.code ?? e.name}`); return false; }
  };
  for (const n of names) {
    let text;
    try { text = fs.readFileSync(path.join(out, `${n}.json`), "utf8"); } catch { continue; }
    const h = sha(text);
    if (done[n] !== h && await send("PUT", `/snapshots/${n}`, text, n)) done[n] = h;
  }
  if (names === SNAPSHOTS) {
    const dir = path.join(path.dirname(out), "mods", "trend", ".reports");
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^[\w.-]+\.html$/.test(f)); } catch {}
    for (const name of files) {
      const file = path.join(dir, name), html = fs.readFileSync(file, "utf8"), h = sha(html);
      if (done[`report:${name}`] === h) continue;
      if (await send("POST", "/reports", JSON.stringify({ name, topic: metaTopic(html), at: reportAt(name, file), html }), `報告 ${name}`)) done[`report:${name}`] = h;
    }
  }
  fs.writeFileSync(path.join(out, "pushed.json.tmp"), JSON.stringify(done) + "\n");
  fs.renameSync(path.join(out, "pushed.json.tmp"), path.join(out, "pushed.json"));
  return `送後端（金鑰 ${key.slice(0, 4)}…）：${sent.length ? `送了 ${sent.join("、")}` : "沒有新的"}${failed.length ? `；沒送成：${failed.join("、")}` : ""}`;
}
module.exports = { push, SNAPSHOTS };
