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
  const all = [...(u.skills ?? []).map((x) => ({ ...x, k: "技能" })), ...(u.mcp ?? []).map((x) => ({ ...x, k: "MCP" }))]
    .sort((a, b) => (Number(b.turn) || 0) - (Number(a.turn) || 0));
  if (!all.length) return "這次對話還沒用到技能或 MCP";
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
// hc send, only to an agent that waits for you (idle or done), plainly: never --if idle, which hc refuses when the core
// still says done for an agent Herdr shows idle (someone looked at it after it finished; hc's --if knows only idle and
// working). Never while it works or needs you: Codex refuses a command typed in while it works, omp's /compact stops
// the work, Claude Code holds it until the turn ends. Your half-typed draft in its input box is not looked at here: hc
// get has no field for it; hc send itself waits until you send or clear it, at most draft_wait (60 s) after your last key.
export function sendArgs(addr, status, text) {
  return addr && text && (status === "idle" || status === "done") ? ["send", addr, text] : null;
}
// One /compact per agent per cycle, shared with Herdr's Agents list (its main.js has the same, app patch 0031/0032;
// keep the two the same): shared "compact/<address>" = { state: "queued" | "sent", at, text, quiet?, sent?, turn? }
// while one waits or runs, else null. A queued one is typed in once the agent waits (idle, done); a sent one ends when
// a turn ends after it (the core's turn goes up each time it stops working: Claude Code's and Codex's /compact work,
// then stop), when kit context says "compacted" (compactedAfter), or after COMPACT_SENT ms. quiet: an agent whose
// status doesn't move while it compacts (omp: it stays done), so no turn ends: done COMPACT_QUIET ms after the send.
export const COMPACT_SENT = 180000, COMPACT_QUEUED = 1800000, COMPACT_QUIET = 30000;
export const compactKey = (address) => `compact/${address}`;
// one of these (null, or another mod's mistake, is none: a press replaces it)
const isCompact = (e) => (e?.state === "queued" || e?.state === "sent") && Number.isFinite(e.at);
// what to do about it now: "send", "done", "timeout" (say so), "drop" (left from long ago: clear quietly), or null
export function compactStep(e, status, turn, now = Date.now()) {
  if (!isCompact(e)) return null;
  const sent = e.state === "sent", since = now - (sent ? e.sent ?? e.at : e.at), ttl = sent ? COMPACT_SENT : COMPACT_QUEUED;
  if (since > ttl + 600000) return "drop";
  if (since > ttl) return "timeout";
  const waits = status === "idle" || status === "done";
  if (!sent) return waits ? "send" : null;
  const turned = Number.isFinite(turn) && Number.isFinite(e.turn) && turn > e.turn;
  return waits && (turned || (e.quiet && since >= COMPACT_QUIET)) ? "done" : null;
}
// one is queued or running: another press only says so
export const compactLive = (e, now = Date.now()) => isCompact(e) && compactStep(e, null, null, now) === null;
// kit context (kit 0.7.5) says "compacted" right after a Claude /compact (what is left after it): an ask started after
// it was sent ends it. An older kit never says it: the turn or the timeout ends it then.
export const compactedAfter = (e, d, started) => e?.state === "sent" && d?.source === "compacted" && Number(started) > Number(e.sent);
// what the context window's footer says about it ("" none)
export const compactWords = (e, now = Date.now()) => (!compactLive(e, now) ? "" : e.state === "sent" ? "壓縮中…" : "已排隊，這輪結束後壓縮");

// ---------- after a kit change: the agents already open pick it up ----------
// What each tool does about an added or changed kind (kit add, sync; what was taken off: reloadPlan): "none" (it sees it by itself), "reload" (type
// /reload-plugins), "relaunch" (read only when a conversation starts: once it waits, Herdr closes it and opens the same
// conversation again, relaunch.js). Claude Code watches its skill folders; kit 0.10 (api 1.15) puts its MCP in its own
// plugin kit-mcp (kit list's claude_mcp "plugin"), which /reload-plugins connects, else in ~/.claude.json, which it
// does not read; omp has no watcher, /reload-plugins reloads its skills, tools, agents, MCP, but
// not a plugin's hooks; Codex 0.169 picks up a new skill on its next turn (tried), reads ~/.codex/AGENTS.md again every
// turn and reads config.toml (MCP, plugins) only when a conversation starts. Tried for all three (2026-11-21): the quit
// command prints the line that resumes the same conversation, and the resumed one reads the new rules and MCP.
export const RELOAD_TEXT = "/reload-plugins";
export const RELOAD = {
  claude: { skill: "none", plugin: "reload", mcp: "relaunch", rule: "relaunch" },
  omp: { skill: "reload", plugin: "reload", mcp: "reload", rule: "relaunch" },   // a plugin with hooks: relaunch (needOf)
  codex: { skill: "none", plugin: "relaunch", mcp: "relaunch", rule: "none" },
};
// one kind for one tool; hooks: the plugin brings hooks (kit list's parts.hooks), which omp loads only when it starts;
// cm: kit list's claude_mcp on that machine ("plugin": Claude's MCP reloads)
export const needOf = (tool, kind, hooks = false, cm = null) => (tool === "omp" && kind === "plugin" && hooks ? "relaunch"
  : tool === "claude" && kind === "mcp" && cm === "plugin" ? "reload" : RELOAD[tool]?.[kind] ?? "none");
const KINDS = ["rule", "skill", "mcp", "plugin"];
// one pending reload per agent (shared "reload/<address>" = { state: "queued", at, text }), stepped like a compact
// (compactStep: "send" once it waits, "timeout" after 30 minutes)
export const reloadKey = (address) => `reload/${address}`;
// kit add / rm [--dir D] <kind> <names…> -> { kinds: [kind], dir, verb, names }; anything else null
export function changeOfArgs(args) {
  const a = args ?? [], rest = [];
  if (a[0] !== "add" && a[0] !== "rm") return null;
  let dir = null;
  for (let i = 1; i < a.length; i++) if (a[i] === "--dir") dir = a[++i] ?? null; else rest.push(a[i]);
  return KINDS.includes(rest[0]) ? { kinds: [rest[0]], dir, verb: a[0], names: rest.slice(1) } : null;
}
// kit sync: the kinds whose items (status, version …) or blocked differ between two kit list --json
export function syncKinds(before, after) {
  const by = (d) => new Map([...(d?.items ?? []).map((i) => [`i\u0000${i.kind}\u0000${i.name}`, i]),
    ...(d?.blocked ?? []).map((b) => [`b\u0000${b.kind}\u0000${b.name}\u0000${b.tool}`, b])].map(([k, v]) => [k, JSON.stringify(v)]));
  const b = by(before), a = by(after), out = new Set();
  for (const k of new Set([...b.keys(), ...a.keys()])) if (b.get(k) !== a.get(k)) out.add(k.split("\u0000")[1]);
  return KINDS.filter((k) => out.has(k));
}
// a changed plugin brings hooks (kit list --json's parts.hooks, before or after): names, those (kit add / rm); null,
// every plugin that differs between the two (kit sync)
export function pluginHooks(before, after, names = null) {
  const by = (d) => new Map((d?.items ?? []).filter((i) => i.kind === "plugin").map((i) => [i.name, i]));
  const b = by(before), a = by(after);
  return [...new Set([...b.keys(), ...a.keys()])].some((n) => (names ? names.includes(n) : JSON.stringify(b.get(n)) !== JSON.stringify(a.get(n)))
    && Boolean(b.get(n)?.parts?.hooks || a.get(n)?.parts?.hooks));
}
// the open agents a change reaches: those on its machine (null: this computer), with --dir only those in D or below,
// never one run as another account (user: root's kit is its own) (list: [{ address, machine, cwd, tool, user }])
export function reloadTargets(list, machine, dir) {
  const n = (p) => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");
  const d = dir && n(dir);
  return (list ?? []).filter((x) => x.tool && !x.user && (x.machine ?? null) === (machine ?? null) && (!d || n(x.cwd) === d || n(x.cwd).startsWith(d + "/")));
}
// A rule is read when a conversation starts: an open agent gets it as a message instead (jay: take effect without
// closing it), any tool. names: [{ name, path }] (path: where the rule is on that machine; null when not known)
export function ruleText(verb, names, dir) {
  const where = dir ? "這個資料夾" : "整個帳號", list = names.map((x) => x.name).join("、");
  if (verb === "rm") return `kit 剛從${where}拿掉規則 ${list}：之後不用再照它做`;
  const paths = names.map((x) => x.path).filter(Boolean);
  return `kit 剛把規則 ${list} 加到${where}（這個對話開始時還沒有）：${paths.length ? `請先讀 ${paths.join("、")}，` : ""}之後照它做`;
}
// one agent's need for the changed kinds -> { send, relaunch }: a relaunch reads everything, so no /reload-plugins then
export function reloadNeed(tool, kinds, hooks = false, cm = null) {
  const w = new Set((kinds ?? []).map((k) => needOf(tool, k, hooks, cm)));
  return { send: w.has("reload") && !w.has("relaunch"), relaunch: w.has("relaunch") };
}
// What was taken off (kit rm, or what a kit sync took off) is never a reason to close a conversation (jay): the open agent
// is told in a message, any tool. names: the item names
export function goneText(kind, names, dir) {
  const where = dir ? "這個資料夾" : "整個帳號", list = names.join("、");
  if (kind === "skill") return `kit 剛從${where}拿掉技能 ${list}：之後不要再用它`;
  if (kind === "mcp") return `kit 剛從${where}拿掉 MCP ${list}：之後不要再用它的工具`;
  return `kit 剛從${where}拿掉外掛 ${list}：之後不要再用它的技能和指令`;
}
// kit sync: what it took off (in use before: used / required; not after) -> [{ kind, name }]
export function removedBy(before, after) {
  const on = (i) => i.status === "used" || i.status === "required";
  const now = new Set((after?.items ?? []).filter(on).map((i) => `${i.kind}\u0000${i.name}`));
  return (before?.items ?? []).filter((i) => KINDS.includes(i.kind) && on(i) && !now.has(`${i.kind}\u0000${i.name}`)).map((i) => ({ kind: i.kind, name: i.name }));
}
// One agent after a change -> { send (/reload-plugins), relaunch, what (the kinds a relaunch is for), texts: [{ kind,
// text }] (the messages about what was taken off) }. adds: the kinds added or changed (today's way: reloadNeed);
// gone: [{ kind, name }] taken off: a message each kind (a rule's as ruleText; Codex reads AGENTS.md every turn: none),
// except a plugin with hooks (goneHooks): its hooks run whatever it is told, so Claude gets /reload-plugins (drops
// them) and omp, Codex a relaunch (as for an added one). A relaunch reads it all: no messages then.
export function reloadPlan(tool, { adds = [], addHooks = false, gone = [], goneHooks = false, dir = null, cm = null } = {}) {
  const need = reloadNeed(tool, adds, addHooks, cm), hookOff = goneHooks ? (tool === "claude" ? "reload" : "relaunch") : null;
  const relaunch = need.relaunch || hookOff === "relaunch";
  const what = [...new Set([...adds.filter((k) => needOf(tool, k, addHooks, cm) === "relaunch"), ...(hookOff === "relaunch" ? ["plugin"] : [])])];
  const texts = [];
  if (!relaunch) for (const kind of KINDS) {
    const names = gone.filter((g) => g.kind === kind).map((g) => g.name);
    if (!names.length || (kind === "rule" && tool === "codex") || (kind === "plugin" && hookOff === "reload")) continue;
    texts.push({ kind, text: kind === "rule" ? ruleText("rm", names.map((name) => ({ name })), dir) : goneText(kind, names, dir) });
  }
  return { send: !relaunch && (need.send || hookOff === "reload"), relaunch, what, texts };
}
// the line under the action: 「t1、t5 已重新載入；t2 排隊重新載入；t4（Codex）停下來時自動重開接回；t3 要自己重開（kit run
// 開的要自己重開）」 (rows: [{ name, tool, done: "sent" | "queued" | "failed" | null, rule, told (the same, for a rule's
// message and one about what was taken off), relaunch: "queued" | "asked" |
// "declined" | why not (words) | null }])
export function reloadLine(rows) {
  const of = (d) => rows.filter((r) => r.done === d).map((r) => r.name).join("、");
  const parts = [];
  if (of("sent")) parts.push(`${of("sent")} 已重新載入`);
  if (of("queued")) parts.push(`${of("queued")} 排隊重新載入（它停下來就送）`);
  if (of("failed")) parts.push(`${of("failed")} 沒送出重新載入`);
  const rule = (d) => rows.filter((r) => r.rule === d).map((r) => r.name).join("、");
  if (rule("sent")) parts.push(`${rule("sent")} 已收到規則（不用關）`);
  if (rule("queued")) parts.push(`${rule("queued")} 排隊送規則（它停下來就送）`);
  if (rule("failed")) parts.push(`${rule("failed")} 沒送出規則`);
  const told = (d) => rows.filter((r) => r.told === d).map((r) => r.name).join("、");
  if (told("sent")) parts.push(`${told("sent")} 已告訴它拿掉了（不用關）`);
  if (told("queued")) parts.push(`${told("queued")} 排隊告訴它拿掉了（它停下來就送）`);
  if (told("failed")) parts.push(`${told("failed")} 沒送出拿掉的訊息`);
  const rl = (d) => rows.filter((r) => r.relaunch === d).map((r) => `${r.name}（${TOOL_NAME[r.tool] ?? r.tool}）`).join("、");
  if (rl("queued")) parts.push(`${rl("queued")}停下來時自動重開接回`);
  if (rl("asked")) parts.push(`${rl("asked")}要重開才讀得到：在跳出的視窗選要不要自動重開接回`);
  for (const r of rows.filter((x) => x.relaunch && !["queued", "asked"].includes(x.relaunch))) parts.push(`${r.name} 要自己重開（${r.relaunch}）`);
  return parts.join("；");
}

// ---------- 自動重開接回: close an agent that waits and open the same conversation again (relaunch.js does it) ----------
export const TOOL_NAME = { claude: "Claude Code", codex: "Codex", omp: "omp" };
export const KIND_NAME = { rule: "規則", skill: "技能", mcp: "MCP", plugin: "外掛" };
// how each tool is told to quit (Claude Code shows a menu after /exit: Enter takes its first choice, exit)
export const QUIT_TEXT = { claude: "/exit", codex: "/quit", omp: "/exit" };
// the probe's lines (relaunch.js PROBE: "kitrun", "session <Claude's sessions/<pid>.json>", "transcript", "file <omp's
// open session file>") -> { kitRun, id, transcript, bridge, busy }
export function probeOf(tool, out) {
  const lines = String(out ?? "").split("\n"), line = (k) => lines.find((l) => l.startsWith(`${k} `))?.slice(k.length + 1) ?? null;
  const r = { kitRun: lines.includes("kitrun"), id: null, transcript: lines.includes("transcript"), bridge: false, busy: false };
  if (tool === "claude") {
    let s = null;
    try { s = JSON.parse(line("session") ?? "null"); } catch {}
    r.id = typeof s?.sessionId === "string" ? s.sessionId : null;
    r.bridge = Boolean(s?.bridgeSessionId);   // Remote Control is on (remoteControlAtStartup: every session): it reconnects by itself after the resume, so not a reason to skip
    r.busy = s?.status === "busy";
  } else if (tool === "omp") {
    const m = /_([\w-]+)\.jsonl$/.exec(line("file") ?? "");   // ~/.omp/agent/sessions/<folder>/<time>_<id>.jsonl
    r.id = m ? m[1] : null;
  }
  return r;
}
// why this agent is not closed and opened again (words), or null: it may be. f: { tool, windows, shellStays, kitRun,
// bridge, id, transcript } (Codex: its id is read from its /status just before)
export function relaunchWhy(f) {
  if (!QUIT_TEXT[f?.tool]) return "不認得這個程式";
  if (f.windows) return "Windows 還不能自動重開";
  if (!f.shellStays) return "程式關掉後這格不會留下 shell";
  if (f.kitRun) return "kit run 開的要自己重開";
  if (f.tool === "claude" && !f.id) return "找不到它的對話 id";
  if (f.tool === "claude" && !f.transcript) return "它的對話沒有存檔，重開會接不回";
  if (f.tool === "omp" && !f.id) return "找不到它的對話檔（還沒說過話？）";
  return null;
}
// the resume line the tool printed as it quit (the bottom-most): Claude `claude <its flags> --resume <id>`, Codex
// `codex resume <id>`, omp `omp --resume <id>` -> { cmd, id } | null. It is typed into a shell: a line with shell
// syntax in it ($, ;, |, `, redirections …) is not taken
const RESUME = {
  claude: /(?:^|[\s"'])(claude\s[^\n]*?--resume[= ]([0-9a-f][0-9a-f-]{7,}))/,
  codex: /(?:^|[\s"'])(codex\s+resume\s+([0-9a-f][0-9a-f-]{7,}))/,
  omp: /(?:^|[\s"'])(omp\s[^\n]*?--resume[= ]([\w-]{6,}))/,
};
export function parseResume(tool, text) {
  const re = RESUME[tool];
  if (!re) return null;
  for (const l of String(text ?? "").split("\n").reverse()) {
    const m = re.exec(l);
    if (m) return /[;&|`$<>(){}\\]/.test(m[1]) ? null : { cmd: m[1].trim(), id: m[2] };
  }
  return null;
}
// Codex's /status: its "Session:" line -> the id, or null
export function statusId(text) {
  const all = [...String(text ?? "").matchAll(/Session(?: id)?:\s*([0-9a-f]{8}-[0-9a-f-]{27,})/gi)];
  return all.length ? all[all.length - 1][1] : null;
}
// what is typed in the shell: Claude without CLAUDE_CODE_CHILD_SESSION (else its conversation is not saved from then on)
export const resumeTyped = (tool, cmd) => (tool === "claude" ? `env -u CLAUDE_CODE_CHILD_SESSION ${cmd}` : cmd);
// the line people type themselves when it was not done (its id known)
export const resumeByHand = (tool, id) => (!id ? null : tool === "claude" ? `claude --resume ${id}` : tool === "codex" ? `codex resume ${id}` : tool === "omp" ? `omp --resume ${id}` : null);
// hc get --json: the program has ended and its shell is in front again
export function shellBack(g) {
  const fg = g?.foreground;
  if (!fg) return true;
  if (fg.pid != null && fg.pid === g.pid) return true;
  const base = String(fg.argv?.[0] ?? fg.name ?? "").split("/").pop().replace(/^-/, "");
  return /^(zsh|bash|sh|fish|dash|ksh|tcsh|nu)$/.test(base);
}
// hc get --json: the program leaves a shell when it ends (Herdr's shell wrapper `"$@"; exec "$0" -li`, or a kept terminal)
export const shellStays = (g) => Boolean(g?.keep) || (g?.argv ?? []).some((a) => /exec "\$0"/.test(String(a)));
// hc get --json: a helper it started still works (a sub-agent)
export const helpersWork = (g) => Object.values(g?.records ?? {}).some((r) => r?.state === "working");
// the screen after it came back says it could not resume
export const resumeFailed = (text) => /No conversation found|No session found|session not found|Could not (find|resume)/i.test(String(text ?? ""));
// Codex's update menu, shown as it opens: Esc closes it (else what is typed next goes into the menu)
export const updateMenu = (text) => /Update available|new version|Update now|Skip until next/i.test(String(text ?? ""));
// a question the tool asks before its prompt once it came back (Claude: "Allow external CLAUDE.md file imports?", "Do
// you trust the files in this folder?"): never answered for you. Only the bottom of the screen counts (the resumed
// conversation above it may hold the same words). -> its line ("…?"), "" when the question line isn't seen, or null
const ASKING = /Enter to confirm|Esc to cancel|Do you trust|❯\s*(\d+\.\s*)?(Yes|No)\b/i;
export function questionOn(text) {
  const lines = String(text ?? "").split("\n").map((l) => l.replace(/[│┃║╭╮╰╯─━═]/g, "").trim()).filter(Boolean).slice(-25);
  let at = -1;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 12) && at < 0; i--) if (ASKING.test(lines[i])) at = i;
  if (at < 0) return null;
  for (let i = at; i >= 0; i--) if (/[?？]$/.test(lines[i])) return lines[i];
  return "";
}
// One relaunch per agent (shared kit.relaunch.v1: address -> { state, at, tool, name, what, id?, cmd?, sent?, menu?, esc?, why?, question?,
// lock?, build? }), stepped by any header's tick (relaunch.js). -> what to do now:
//   queued:   "begin" once it waits (idle or done), no work of its own runs and nobody types in it; "timeout" after 30 min
//   status:   (Codex) "read" its /status for the id; "fail" after 15 s
//   quitting: "enter" (Claude's menu after /exit) once after 1.5 s; "type" once the shell is back; "fail" after 30 s
//   starting: (Codex) "menu" to look for its update menu (Esc) until esc; "check" once the program is back and waits,
//             "look" for a question (questionOn) while it doesn't yet (and doesn't work); "fail" when the shell is still there 10 s on, or after 60 s
//   asking:   it came back and asks you something: "check" once it waits (done when the question is gone); "fail" when
//             the shell is back (the answer closed it)
//   done:     "clear" after 8 s (the header says 已接回 until then)
//   failed:   "clear" once the program runs again (someone typed the line), else it stays (the header: 接不回)
// f: { status, busy, typing, shell (null: not asked) }. Locked (another copy is at it): null
export const RELAUNCH_QUEUED = 1800000, RELAUNCH_DONE = 8000;
export function relaunchStep(e, f, now = Date.now()) {
  if (!e?.state || (e.lock ?? 0) > now) return null;
  const waits = f?.status === "idle" || f?.status === "done", since = now - (e.sent ?? e.at ?? 0);
  switch (e.state) {
    case "queued":
      if (now - (e.at ?? 0) > RELAUNCH_QUEUED) return "timeout";
      return waits && !f.busy && !f.typing ? "begin" : null;
    case "status": return since > 15000 ? "fail" : "read";
    case "quitting":
      if (f?.shell) return "type";
      if (since > 30000) return "fail";
      return e.tool === "claude" && !e.menu && since >= 1500 ? "enter" : null;
    case "starting":
      if (since > 60000 || (f?.shell && since > 10000)) return "fail";
      if (f?.shell === false && e.tool === "codex" && !e.esc) return since >= 2000 ? "menu" : null;   // its update menu first
      if (f?.shell === false && waits) return "check";
      return f?.shell === false && since >= 3000 && f.status !== "working" ? "look" : null;
    case "asking":
      if (f?.shell) return "fail";
      return f?.shell === false && waits ? "check" : null;
    case "done": return now - (e.at ?? 0) > RELAUNCH_DONE ? "clear" : null;
    case "failed": return f?.shell === false && Boolean(f?.status) ? "clear" : null;
    default: return null;
  }
}
// the pane header's words for it: { text, level: "dim" | "bad" | "ok" | "ask", tip } | null. f: { status, typing } of the
// pane now (typing: it has the focus in the front window, relaunchStep's "someone types in it")
export function relaunchWords(e, f = {}) {
  if (!e?.state) return null;
  if (e.state === "queued" && f.typing && (f.status === "idle" || f.status === "done"))
    return { text: "你在這格：切到別格就重開接回", level: "dim", tip: `kit 改了${e.what ?? ""}：你可能正在這格打字，先等；切到別格（或別的程式）就自動關掉再接回同一個對話` };
  if (e.state === "queued") return { text: "等它停下來就重開接回", level: "dim", tip: `kit 改了${e.what ?? ""}：等它這一輪做完，自動關掉再接回同一個對話` };
  if (e.state === "asking") return { text: "接回了，在等你回答它的問題", level: "ask", tip: `${e.question ? `它問：${e.question}\n` : ""}在這格回答後就好了（不會替你回答）` };
  if (e.state === "done") return { text: "已接回", level: "ok", tip: "已接回同一個對話" };
  if (e.state === "failed") return { text: "接不回", level: "bad",
    tip: `${e.why ?? "沒接回"}${e.cmd ? `\n接回指令：${e.cmd}\n按一下：在這格重試；右鍵：複製指令` : ""}\n對話紀錄在磁碟上，不會丟` };
  return { text: "套用 kit 的改動中… 關掉 → 接回同一個對話", level: "dim", tip: "先不要在這格打字，好了會通知你" };
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
  if (tool !== "claude" || !d || d.error || d.user || Number(d.used) || Number(d.pct)) return false;   // (user: run as another user, no numbers to ask for)
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
    tips.push(`${mem.name} 有 ${kfmt(mem.tokens)}，每次對話都整份讀進來：不常用的內容可以搬到技能（用到才讀）。`);
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
