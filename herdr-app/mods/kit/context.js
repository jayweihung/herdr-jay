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
// the chip on a pane header: { has, pct (capped at 100, or null), nums "139k/400k" ("…" while asking, "—" none), copy }
export function chipNumbers(c) {
  const has = Boolean(c && (c.pct != null || c.used != null));
  const pct = has && c.pct != null ? Math.min(100, c.pct) : null;
  const nums = has ? (c.window ? `${kShort(c.used ?? 0)}/${kShort(c.window)}` : kShort(c.used ?? 0)) : !c || c.busy ? "…" : "—";
  const copy = has ? `${pct != null ? `${pct}% ` : ""}${c.used ?? ""}${c.window ? ` / ${c.window}` : ""}` : "";
  return { has, pct, nums, copy };
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
    tips.push(`「${tool.name}」的呼叫和結果約 ${kfmt(tool.tokens)}（${share(tool.tokens)}）：請它只拿需要的部分（只讀需要的行、先搜尋再讀、輸出很長時只看頭尾），或這段做完就壓縮。`);
  const att = items("attachments")[0];
  if (att && att.tokens >= 3000 && att.tokens >= used * 0.1)
    tips.push(`附加內容「${att.name}」約 ${kfmt(att.tokens)}（${share(att.tokens)}）：這是 Claude Code 自己加進對話的（例如 hook 的輸出、提到的檔案）。`);
  const mcp = cat("mcp_tools");
  if (mcp >= 5000 && mcp >= used * 0.05) {
    const mine = items("mcp").filter((i) => canRemove("mcp", i.name)).map((i) => i.name);
    tips.push(`MCP 工具的說明佔了 ${kfmt(mcp)}（${share(mcp)}）：${mine.length ? `用不到的（${mine.join("、")}）可以在下面「MCP」拿掉` : "用不到的 MCP 伺服器可以關掉"}，開新的對話就省下來。`);
  }
  const sk = cat("skills");
  if (sk >= 3000 && sk >= used * 0.03) {
    const mine = items("skills").filter((i) => canRemove("skills", i.name)).slice(0, 5).map((i) => i.name);
    tips.push(`Skills 的清單佔了 ${kfmt(sk)}（${share(sk)}）：${mine.length ? `用不到的（例如 ${mine.join("、")}）可以在下面拿掉` : "用不到的 skill 可以拿掉"}。`);
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
