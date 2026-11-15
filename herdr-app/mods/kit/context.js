// What the context window (role "context", header.js) and the context chip compute: what is run, sent and said, what
// kit can take off for a line, the bar's pieces, the numbers. Nothing is drawn here and nothing asks Herdr (only
// common.js's number formats), so tests/kit checks it all with plain values.
import { num, kfmt, kShort } from "./common.js";

const TOOLS = { "claude-code": "claude", claude: "claude", codex: "codex", omp: "omp", pi: "omp" };
// which tool an agent pane runs: what the agent reported (claude-code, codex, pi), else the program table's key
export function toolOf(app, key) { return TOOLS[String(app ?? "").toLowerCase()] ?? TOOLS[String(key ?? "").toLowerCase()] ?? null; }
// kit context's arguments: --detail for the window (where the tokens go), --fresh for its ⟳
export function ctxArgs(pid, tool, cwd, detail = false, fresh = false) {
  const a = ["context", "--pid", String(pid)];
  if (tool) a.push("--tool", tool);
  if (cwd) a.push("--dir", cwd);
  if (detail) a.push("--detail");
  if (detail && fresh) a.push("--fresh");
  return a;
}
// kit used's arguments (kit api 1.10): the skills and MCP servers this conversation used
export function usedArgs(pid, tool, cwd) {
  const a = ["used", "--pid", String(pid)];
  if (tool) a.push("--tool", tool);
  if (cwd) a.push("--dir", cwd);
  a.push("--json");
  return a;
}
// what kit used said about one row (a skill, an MCP server, a plugin: its skills together): { count, recent } (recent:
// in the conversation's last turn), or null when this conversation has not used it
export function usedOf(u, kind, name) {
  if (!u || !name) return null;
  const list = kind === "skill" ? (u.skills ?? []).filter((x) => x.name === name)
    : kind === "mcp" ? (u.mcp ?? []).filter((x) => x.name === name)
    : kind === "plugin" ? (u.skills ?? []).filter((x) => x.plugin === name) : [];
  if (!list.length) return null;
  const count = list.reduce((n, x) => n + (Number(x.count) || 0), 0);
  return { count, recent: Number(u.turn) > 0 && list.some((x) => Number(x.turn) === Number(u.turn)) };
}
// the line above the list: everything this conversation used (also what is not kit's), the last used first
export function usedLine(u) {
  if (!u) return "";
  const all = [...(u.skills ?? []).map((x) => ({ ...x, k: "skill" })), ...(u.mcp ?? []).map((x) => ({ ...x, k: "MCP" }))]
    .sort((a, b) => (Number(b.turn) || 0) - (Number(a.turn) || 0));
  if (!all.length) return "這次對話還沒用到 skill 或 MCP";
  return `這次對話用了：${all.map((x) => `${x.k} ${x.name}（${x.count} 次${Number(u.turn) > 0 && Number(x.turn) === Number(u.turn) ? "・剛剛" : ""}）`).join("、")}`;
}
// the line typed into the agent: its tool's own command (kit context --detail names it); what to keep goes after
// /compact only where the tool takes it, on one line
export function sendText(cmds, what, keep) {
  const c = cmds ?? {};
  if (what === "clear") return c.clear ? String(c.clear) : null;
  if (what !== "compact" || !c.compact) return null;
  const k = String(keep ?? "").replace(/\s+/g, " ").trim();
  return k && c.with_text ? `${c.compact} ${k}` : String(c.compact);
}
// hc send, only to an agent that waits for you: idle (--if idle: hc refuses if it started working meanwhile) or done
// (it finished while nobody looked; hc's --if knows only idle and working). Never while it works or needs you.
export function sendArgs(addr, status, text) {
  if (!addr || !text) return null;
  if (status === "idle") return ["send", "--if", "idle", addr, text];
  if (status === "done") return ["send", addr, text];
  return null;
}
// what kit can take off for a line of the window (kit list --json of that agent), the Kit popup's rule: an agent in a
// folder only changes that folder (kit rm --dir), one in the home folder the account; a required one never.
// -> { args, kind, name, where, dir } | { required: true, ... } | null
export function removal(list, group, name, path) {
  const kind = group === "skills" ? "skill" : group === "mcp" ? "mcp" : group === "memory" || group === "instructions" ? "rule" : null;
  if (!kind || !list || list.error || list.here?.user) return null;
  const norm = (p) => String(p ?? "").replace(/\\/g, "/");
  const n = kind === "mcp" ? String(name ?? "").replace(/^mcp__/, "") : String(name ?? "");
  const it = (list.items ?? []).find((i) => i.kind === kind && (kind === "rule" ? Boolean(path) && norm(i.path) === norm(path) : i.name === n));
  if (!it) return null;
  const f = list.here?.folder, inDir = (f?.items ?? []).includes(`${kind}:${it.name}`);
  if (it.status === "required") return { required: true, kind, name: it.name };
  if (f && !f.why) return inDir ? { args: ["rm", "--dir", f.dir, kind, it.name], kind, name: it.name, where: "folder", dir: f.dir } : null;
  if (it.status === "used") return { args: ["rm", kind, it.name], kind, name: it.name, where: "account" };
  return null;
}
// just after /compact or /clear (or a new session) a Claude's status line says 0 until its next reply, so the chip
// would read "讀取中" until then, however long it sits idle. Then Claude Code itself is asked (kit context --detail),
// at most once every ZERO_EVERY per pane: -> true when a 0 from the quick ask should be asked that way
export const ZERO_EVERY = 10 * 60 * 1000;
export function askZero(d, before, tool, now = Date.now()) {
  if (tool !== "claude" || !d || d.error || Number(d.used) || Number(d.pct)) return false;
  return !(before?.zeroAt && now - before.zeroAt < ZERO_EVERY);
}
// the numbers from that ask, or the last ones it gave while the status line still says 0 (null: none)
export function zeroNumbers(d, before) {
  if (d && Number(d.used) && !d.error) return { used: d.used, window: d.window ?? null, pct: d.pct ?? null, model: d.model ?? null, exact: true };
  return before?.zeroAt && Number(before.used) ? { used: before.used, window: before.window ?? null, pct: before.pct ?? null, model: before.model ?? null, exact: true } : null;
}

// the chip on a pane header: { has, pct (capped at 100, or null), nums "139k/400k" ("…" while asking, "—" none), copy }
// nothing counted yet (0 tokens: just after /compact or /clear, or a new session, until its next reply; or kit still
// reading): no 0 %, "讀取中" (loading: the chip breathes)
export function chipNumbers(c) {
  const zero = Boolean(c) && (c.pct != null || c.used != null) && !Number(c.pct) && !Number(c.used);
  const has = Boolean(c && (c.pct != null || c.used != null)) && !zero;
  const pct = has && c.pct != null ? Math.min(100, c.pct) : null;
  const loading = zero || !c || Boolean(c.busy);
  const nums = has ? (c.window ? `${kShort(c.used ?? 0)}/${kShort(c.window)}` : kShort(c.used ?? 0)) : loading ? "讀取中" : "—";
  const copy = has ? `${pct != null ? `${pct}% ` : ""}${c.used ?? ""}${c.window ? ` / ${c.window}` : ""}` : "";
  return { has, pct, nums, copy, loading };
}
// ---------- the plan's usage limits (kit api 1.7: kit context's "limit", kit usage) ----------
// what a usage window is called: by its kind (Claude) or how long it is (Codex's primary / secondary)
const KIND_NAMES = { five_hour: "5 小時", seven_day: "每週", monthly: "每月", seven_day_opus: "每週（Opus）", seven_day_sonnet: "每週（Sonnet）" };
export function windowName(kind, minutes) {
  if (KIND_NAMES[kind]) return KIND_NAMES[kind];
  const m = Number(minutes);
  if (m === 300) return "5 小時";
  if (m === 10080) return "每週";
  if (m >= 40000 && m <= 45000) return "每月";
  if (m > 0) return m % 1440 === 0 ? `${m / 1440} 天` : m % 60 === 0 ? `${m / 60} 小時` : `${m} 分鐘`;
  return "用量";
}
// a time to come: "00:10" today, "明天 10:00", "11/20 10:00" (this computer's clock)
export function whenText(ms, now = Date.now()) {
  const d = new Date(Number(ms)), n = new Date(now);
  if (!Number.isFinite(d.getTime())) return "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(n)) / 86400000);
  return diff === 0 ? hm : diff === 1 ? `明天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}
// an agent stopped at its plan's usage limit (kit context's limit) -> { until, name, back } | null; back: the limit
// has reset (until passed)
export function limitOf(c, now = Date.now()) {
  const until = Number(c?.limit?.until);
  if (!until) return null;
  return { until, name: windowName(c.limit.kind), back: now >= until };
}
// how long after the reset 繼續 is typed (the server's clock and this one differ a little)
export const LIMIT_GRACE = 60000;
export const CONTINUE_TEXT = "繼續";
// type 繼續 now? Only once per stop (sent: the until it was typed for), only once the limit has reset, only to an agent
// that waits (idle or done: never one at work or asking you)
export function continueDue(c, status, sent, now = Date.now(), on = true) {
  const l = limitOf(c, now);
  if (!on || !l || sent === l.until || now < l.until + LIMIT_GRACE) return false;
  return status === "idle" || status === "done";
}
// kit usage's answer for one tool -> lines "5 小時：用了 41%，00:10 重置" (a window whose reset has passed: started again)
export function usageLines(u, now = Date.now()) {
  if (!u || !Array.isArray(u.windows)) return [];
  return u.windows.filter((w) => w && w.pct != null).map((w) => {
    // omp names a limit of one model family after the window ("7d:fable"): 每週（fable）
    const tier = typeof w.id === "string" && w.id.includes(":") ? w.id.slice(w.id.indexOf(":") + 1) : "";
    const name = windowName(w.id, w.minutes) + (tier ? `（${tier}）` : ""), r = Number(w.resets_at);
    if (r && now >= r) return { name, pct: null, text: `${name}：已重新計算（${whenText(r, now)} 重置過）` };
    return { name, pct: Math.min(100, Number(w.pct)), text: `${name}：用了 ${Math.min(100, Number(w.pct))}%${r ? `，${whenText(r, now)} 重置` : ""}` };
  });
}

// an omp agent's plan use (kit usage's "omp", kit 0.6.7): the provider of its model ("anthropic/claude-opus-5-5")
export function ompUsage(usage, model) {
  const p = typeof model === "string" && model.includes("/") ? model.slice(0, model.indexOf("/")) : "";
  const u = p ? usage?.omp?.[p] : null;
  return u ? { provider: p, u } : null;
}
// how full: "" below 70 %, "high" from 70 %, "full" from 90 %
export const level = (pct) => (pct == null ? "" : pct >= 90 ? "full" : pct >= 70 ? "high" : "");
// whose count the total is
export function howCounted(d) {
  if (d?.exact) return d.tool === "claude" ? "Claude Code 自己算的" : "精確";
  return d?.tool === "codex" ? "總數是 Codex 記的，細項估算" : d?.tool === "omp" ? "總數是 omp 記的，細項估算" : "估算";
}
// "12 秒前", "3 分鐘前" (at: seconds since 1970, as kit gives it)
export const ago = (at, now = Date.now()) => { const s = Math.max(0, Math.round(now / 1000 - Number(at || 0))); return s < 60 ? `${s} 秒前` : `${Math.round(s / 60)} 分鐘前`; };
// what an agent wrote about where it is (kit note --pid <pid> --json, kit api 1.4): its args, and 關係's line, the
// tooltip (all of it and when), what a right-click copies, and whether it is old (2 hours: shown dim). null: none.
export const noteArgs = (pid) => ["note", "--pid", String(pid), "--json"];
export function noteView(n, now = Date.now()) {
  const text = String(n?.text ?? "").trim();
  if (!text) return null;
  const s = Math.max(0, Math.round(now / 1000 - Number(n.at || 0)));
  const when = s < 60 ? "剛剛" : s < 3600 ? `${Math.floor(s / 60)} 分鐘前` : s < 86400 ? `${Math.floor(s / 3600)} 小時前` : `${Math.floor(s / 86400)} 天前`;
  return { line: text.split("\n")[0], tip: `${text}\n（${when}寫的；右鍵複製）`, copy: text, old: s >= 7200 };
}
// The pane header's widths (px): the name at most, the context chip (one width whatever it says: the header never moves).
export const NAME_MAX = 260, CTX_FULL = 154;
// a category's color: the theme's key for it
const CAT_COLOR = { system_prompt: "ansi4", system_tools: "ansi6", mcp_tools: "ansi2", mcp_instructions: "ansi2", memory_files: "ansi3",
  instructions: "ansi3", skills: "ansi5", custom_agents: "ansi1", slash_commands: "ansi1", messages: "accent", compaction: "done", other: "dim" };
export const catColorKey = (id) => CAT_COLOR[id] ?? "dim";
// the stacked bar: what is used (by category, % of the window, never past 100 in all), then what is free, Claude's
// auto-compact reserve at the end -> { used: [{ id, pct }], buffer: pct | null }
export function barSegments(d) {
  const w = Number(d?.window) || Number(d?.used) || 1, cats = d?.categories ?? [];
  let left = 100;
  const take = (c) => { const pc = Math.min(left, ((Number(c.tokens) || 0) / w) * 100); if (pc <= 0.05) return null; left -= pc; return +pc.toFixed(3); };
  const used = [];
  for (const c of cats) if (c.kind === "used") { const pct = take(c); if (pct != null) used.push({ id: c.id, pct }); }
  const buf = cats.find((c) => c.kind === "buffer");
  return { used, buffer: buf ? take(buf) : null };
}
// a category's share of the window: "12.3%", or "—" (deferred, or no window)
export const catShare = (c, window) => (c.kind === "deferred" || !Number(window) ? "—" : `${((c.tokens / Number(window)) * 100).toFixed(1)}%`);
// the footer's line: how far to the auto-compaction, or what is left -> { left, line }
export function compactLine(d) {
  const used = Number(d?.used) || 0, at = Number(d?.compact_at) || 0;
  const left = at ? Math.max(0, at - used) : d?.window ? Math.max(0, d.window - used) : null;
  return { left, line: at ? `距自動壓縮還有 ${kfmt(left)}（到 ${kfmt(at)} 會自動壓縮）` : left != null ? `還有 ${kfmt(left)} 可用` : "" };
}
// 怎麼省: only what the numbers show. canRemove(group, name): kit can take it off here
export function ctxTips(d, canRemove = (_group, _name) => false) {
  const tips = [], used = Number(d?.used) || 0, win = Number(d?.window) || 0, c = d?.commands ?? {};
  if (!used) return tips;
  const cat = (id) => Number((d.categories ?? []).find((x) => x.id === id)?.tokens) || 0;
  const items = (id) => ((d.groups ?? []).find((g) => g.id === id)?.items ?? []).filter((i) => i.tokens != null).sort((a, b) => b.tokens - a.tokens);
  const share = (n) => `${Math.round((n / used) * 100)}%`;
  const at = Number(d.compact_at) || 0;
  if ((at && used >= at * 0.8) || (win && used >= win * 0.7))
    tips.push(`快滿了${at ? `（到 ${kfmt(at)} 會自動壓縮）` : ""}：告一段落時按下面的「壓縮」${c.with_text ? "（可以寫要保留什麼）" : ""}；要換別的事做，就「清空重來」。`);
  const tool = items("tool_results")[0];
  if (tool && tool.tokens >= 5000 && tool.tokens >= used * 0.2)
    tips.push(`「${tool.name}」的呼叫和結果約 ${kfmt(tool.tokens)}（${share(tool.tokens)}）：是它讀檔、跑指令拿到的內容，它靠這些記得做到哪。告一段落時按下面的「壓縮」就省下來；做到一半壓縮，細節（例如錯誤訊息的原文）可能會忘。`);
  const att = items("attachments")[0];
  if (att && att.tokens >= 3000 && att.tokens >= used * 0.1)
    tips.push(`附加內容「${att.name}」約 ${kfmt(att.tokens)}（${share(att.tokens)}）：這是 Claude Code 自己加進對話的（例如 hook 的輸出、提到的檔案）。`);
  const mcp = cat("mcp_tools");
  if (mcp >= 5000 && mcp >= used * 0.05) {
    const mine = items("mcp").filter((i) => canRemove("mcp", i.name)).map((i) => i.name);
    tips.push(`MCP 工具的說明佔了 ${kfmt(mcp)}（${share(mcp)}）：${mine.length ? `用不到的（${mine.join("、")}）可以在下面「MCP」拿掉` : "用不到的 MCP 伺服器可以關掉"}，開新的對話就省下來。`);
  }
  const mem = [...items("memory"), ...items("instructions")].sort((a, b) => b.tokens - a.tokens)[0];
  if (mem && mem.tokens >= 2000)
    tips.push(`${mem.name} 有 ${kfmt(mem.tokens)}，每次對話都整份讀進來：不常用的內容可以搬到 skill（用到才讀）。`);
  const other = cat("other");
  if (d.tool === "claude" && other >= 5000 && other >= used * 0.2)
    tips.push(`有 ${kfmt(other)} 這次分不出細項（剛剛才加進來的，或這個 session 之後才連上的 MCP）：等一下按 ⟳ 再看。`);
  return tips;
}
// the 複製 text: the numbers as the window shows them
export function summaryText(d, title, where) {
  if (!d) return "";
  const w = Number(d.window) || 0, pc = (n) => (w ? `（${((n / w) * 100).toFixed(1)}%）` : "");
  const lines = [`${title || "agent"} 的 context${where ? ` · ${where}` : ""}`,
    `已使用 ${d.pct ?? "?"}% · ${num(d.used)} / ${d.window != null ? num(d.window) : "?"} tokens${d.model ? ` · ${d.model}` : ""}${d.exact ? "" : "（細項是估算）"}`];
  for (const c of d.categories ?? []) lines.push(c.kind === "deferred" ? `  ${c.name}：用到才載入（${num(c.tokens)}）` : `  ${c.name}：${c.est ? "≈" : ""}${num(c.tokens)}${pc(c.tokens)}`);
  for (const g of d.groups ?? []) {
    const it = g.items ?? [];
    lines.push(`${g.name}${g.tokens != null ? `：${g.est ? "≈" : ""}${num(g.tokens)}` : ""}`);
    for (const i of it.slice(0, 20)) lines.push(`  ${i.name}${i.tokens != null ? `：${num(i.tokens)}` : ""}${i.note ? `（${i.note}）` : ""}`);
    if (it.length > 20) lines.push(`  …還有 ${it.length - 20} 個`);
  }
  if (d.compact_at) lines.push(`距自動壓縮還有 ${num(Math.max(0, d.compact_at - (d.used ?? 0)))}`);
  return lines.join("\n");
}
