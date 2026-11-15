// What's trending now (last30days --discover, global): no model is called, so no tokens. launchd runs it every hour
// with node (docs/trend.md); the trend panel reads what it writes to <Herdr home>/trend/:
//   trends.json   last30days' discovery JSON (schema 1.x), replaced only by a run that succeeded
//   status.json   { started, finished, ok, error }: the panel's ring and 「上次更新」
//   last.log      the last run's own output
// LAST30DAYS: the path of last30days.py (the skill's scripts/last30days.py in your kit source), set in the launchd job.
// A proxy (e.g. IPRoyal: Reddit blocks some home networks with 403) goes in <Herdr home>/trend/proxy, one line
// http://user:pass@host:port, chmod 600; every request of the run goes through it.
// 每小時抓一次全網熱門（不叫模型、不花 token）。Reddit 擋家裡網路（403）時，把代理（例如 IPRoyal）寫在 trend/proxy 一行。
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
const l30 = process.env.LAST30DAYS;
if (!l30 || !fs.existsSync(l30)) error = `找不到 last30days.py：launchd 的 LAST30DAYS 是「${l30 ?? ""}」（docs/trend.md「安裝」）`;
else {
  const tmp = path.join(out, "trends.json.tmp");
  // --no-browser-cookies: never read the browser's logins / 不讀瀏覽器的登入資料
  const r = spawnSync("python3", [l30, "--discover", "--emit=json", "--no-browser-cookies", "--output", tmp], { env, encoding: "utf8", maxBuffer: 64 << 20, timeout: 20 * 60000 });
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
put("status.json", JSON.stringify({ started, finished: now(), ok: !error, error }) + "\n");
process.exit(error ? 1 : 0);
