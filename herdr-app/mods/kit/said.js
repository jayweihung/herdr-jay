// What the agents' Claude Code hook (nvim-jay's reply hook, on the agent's machine) keeps for the 關係 tab (graph.js):
//   ~/.cache/nvim-jay/said/<terminal id>  { at, text }   what it said when it stopped: the last line of its last words
//                                                         that asks something (？ or ?), else their last line
//   ~/.cache/nvim-jay/subs/<terminal id>  { at, list }   its sub-agents (SubagentStart / SubagentStop and every stop):
//                                                         [{ id, type, desc, done, start, last }], running or done in
//                                                         the last 30 minutes, newest first
// This computer's files are read directly, another machine's through `sh` there (cat). omp and Codex have no hook:
// their sub-agents are read from their own files (OMP_SH, CODEX_SH below). said: once per stop, only for
// agents done and not looked at; subs: every SUBS_MS while an agent works, once more when it stops. Nothing is
// guessed: a said file older than the stop says nothing (no hook there, or not Claude Code).
import { exec, hc, home, readTextFile, shared, setShared } from "herdr";
import { isWindows, slash } from "./common.js";

export const SAID = "kit.said.v1";   // address -> { at, text, asked, for, busy }
export const SUBS = "kit.subs.v1";   // address -> { at, list, asked, for, busy }
// A done agent may still have work of its own going: a command Claude Code's Bash tool runs in the background (a
// `sh -c` child of the agent's process that sources its shell-snapshots; MCP servers and caffeinate aren't shells) or
// a sub-agent. That isn't your turn: 關係 shows it working, 背景工作中, instead of 做完等你看. Asked every BG_MS (ps on its machine;
// none on Windows) while it is done and not looked at.
export const BG = "kit.bg.v1";       // address -> { at, jobs: [label], asked, busy }
// For Herdr's own Agents list (herdr-jay app patch 0009): address -> what still runs, for each done agent whose work
// goes on; the list shows those as working.
export const BUSY = "agents.busy";
// What each running sub-agent is doing now: the last step in its own transcript (the subs file says where), read
// every SUBS_MS (its last 64 KB, through sh on its machine; not on Windows). "<address>|<sub id>" -> { at, text }
export const STEPS = "kit.steps.v1";
const BG_MS = 15000;
const RETRY = 60000, MAX = 200, SUBS_MS = 15000, SUBS_MAX = 12;

const idOf = (addr) => String(addr).slice(String(addr).lastIndexOf("/") + 1);
const machineOf = (addr) => (String(addr).includes("/") ? String(addr).split("/")[0] : null);
const cut = (s, n) => { const c = [...String(s ?? "").replace(/\s+/g, " ").trim()]; return c.length > n ? `${c.slice(0, n - 1).join("")}…` : c.join(""); };

// the hook's said file -> { at, text } | null
export function parseSaid(s) {
  let j = null;
  try { j = JSON.parse(String(s ?? "")); } catch { return null; }
  const text = typeof j?.text === "string" ? cut(j.text, MAX) : "";
  const at = Number(j?.at);
  if (!text || !Number.isFinite(at) || at <= 0) return null;
  return { at, text };
}
// the hook's subs file -> { at, list } | null (each field checked; at most SUBS_MAX)
export function parseSubs(s) {
  let j = null;
  try { j = JSON.parse(String(s ?? "")); } catch { return null; }
  const at = Number(j?.at);
  if (!Number.isFinite(at) || at <= 0 || !Array.isArray(j?.list)) return null;
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const list = j.list.filter((x) => x && typeof x === "object" && typeof x.id === "string").slice(0, SUBS_MAX)
    .map((x) => ({ id: cut(x.id, 40), type: cut(x.type, 40), desc: cut(x.desc, 120), done: x.done === true, start: num(x.start), last: num(x.last),
      path: typeof x.path === "string" && /\/subagents\/agent-[\w-]+\.jsonl$/.test(x.path) ? x.path : "" }));
  return { at, list };
}

// ps lines "<ppid> <command>" -> what the agent's background shells run (the command inside eval '…'), at most 3
export function bgJobs(out, pid) {
  const jobs = [];
  for (const line of String(out ?? "").split("\n")) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!m || Number(m[1]) !== Number(pid) || !/shell-snapshots/.test(m[2]) || !/(^|\/)(z|ba)?sh\s+-c\s/.test(m[2])) continue;
    const ev = /\beval '([\s\S]*?)' < \/dev\/null/.exec(m[2]);
    jobs.push(cut((ev ? ev[1].replace(/'"'"'/g, "'") : "shell").split("\n")[0], 60));
  }
  return jobs.slice(0, 3);
}
async function readBg(addr) {
  const g = await hc(["get", addr, "--json"]).catch(() => null);
  let pid = null;
  try { const j = JSON.parse(g?.stdout ?? "{}"); pid = j.foreground?.pid ?? j.pid ?? null; } catch {}
  if (!pid) return null;
  const r = await exec("sh", ["-c", 'ps -A -ww -o ppid=,command= | awk -v p="$1" \'$1 == p\'', "sh", String(pid)], { timeout: 15000, on: machineOf(addr) }).catch(() => null);
  return r ? { at: Date.now(), jobs: bgJobs(r.stdout, pid) } : null;
}

// one tool call in a few words: "Bash：ls ~/x", "Read：src/a.rs" (its first telling argument)
const toolText = (name, i) => {
  const o = i && typeof i === "object" ? i : {};
  const arg = [o.command, o.cmd, o.file_path, o.path, o.pattern, o.url, o.query, o.description, o.prompt].find((v) => typeof v === "string" && v.trim());
  return `${cut(name, 30)}${arg ? `：${cut(String(arg).split("\n")[0], 70)}` : ""}`;
};
const firstLine = (t) => cut(String(t).trim().split("\n")[0], 80);
// a transcript's tail (the first line may be cut) -> its last step, in a few words: a tool call, or the first line of
// what it last wrote. Claude Code (assistant: tool_use / text), omp (message, assistant: toolCall / text) and Codex
// (response_item: function_call / custom_tool_call / assistant message) each write their own JSONL.
export function lastStep(tail) {
  let step = "";
  for (const line of String(tail ?? "").split("\n")) {
    let r = null;
    try { r = JSON.parse(line); } catch { continue; }
    if (r?.type === "response_item") {   // Codex
      const p = r.payload ?? {};
      if (p.type === "function_call") { let a = {}; try { a = JSON.parse(p.arguments); } catch {} step = toolText(p.name, a); }
      else if (p.type === "custom_tool_call") {
        // its code mode: the command is inside the script, cmd:"…"
        const m = /\bcmd:\s*"((?:[^"\\]|\\.)*)"/.exec(String(p.input ?? ""));
        let c = "";
        if (m) try { c = JSON.parse(`"${m[1]}"`); } catch { c = m[1]; }
        step = toolText(p.name, { command: c || String(p.input ?? "") });
      } else if (p.type === "message" && p.role === "assistant" && Array.isArray(p.content)) {
        const t = p.content.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
        if (t.trim()) step = firstLine(t);
      }
      continue;
    }
    const m = r?.message, mine = r?.type === "assistant" || (r?.type === "message" && m?.role === "assistant");
    for (const b of mine && Array.isArray(m?.content) ? m.content : []) {
      if (b?.type === "tool_use") step = toolText(b.name, b.input);
      else if (b?.type === "toolCall") step = toolText(b.name, b.arguments);
      else if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) step = firstLine(b.text);
    }
  }
  return step;
}

// omp and Codex have no hook here: the panel reads their own files, on the agent's machine (sh there; not on
// Windows), every SUBS_MS while the agent works or is done, from its process (Herdr's foreground pid).
//   omp: ~/.omp/agent/terminal-sessions/<its tty, / as -> says its session file (line 2); its sub-agents are
//        <session>/<name>.jsonl (session_init: task, agent; done: session_exit at the end, <name>.md written after
//        it, or <name>.tombstone)
//   Codex: the rollout files its process holds open; one without parent_thread_id is the agent's own thread, and its
//        sub-agents are the rollouts of the last 30 minutes whose parent_thread_id leads to it (done: task_complete
//        or turn_aborted after the last task_started)
// Last, "@@kit-said@@" and the end of the agent's own transcript (for what it said when it stopped: saidOf).
// Each sub-agent comes out as "@@kit-sub@@ TAB name TAB mtime (s) TAB done (0, 1, or empty: from its tail)", lines of
// "key":"value, then "@@kit-tail@@" and its last bytes; Codex's own threads as "@@kit-root@@ TAB id".
export const OMP_SH = String.raw`t=$(ps -o tty= -p "$1" 2>/dev/null | tr -d ' ' | tr / -)
case "$t" in ''|'?'|'??') exit 0;; esac
s=$(sed -n 2p "$HOME/.omp/agent/terminal-sessions/$t" 2>/dev/null)
case "$s" in /*.jsonl) ;; *) exit 0;; esac
d=$(printf '%s' "$s" | sed 's/\.jsonl$//')
[ -d "$d" ] || exit 0
find "$d" -maxdepth 1 -name '*.jsonl' -mmin -30 2>/dev/null | head -n 20 | while IFS= read -r x; do
  n=$(basename "$x" .jsonl); e=0
  if [ -e "$d/$n.tombstone" ] || tail -c 4096 "$x" | grep -q '"customType":"session_exit"' || { [ -e "$d/$n.md" ] && ! [ "$x" -nt "$d/$n.md" ]; }; then e=1; fi
  printf '\n@@kit-sub@@\t%s\t%s\t%s\n' "$n" "$(date -r "$x" +%s 2>/dev/null)" "$e"
  head -c 4096 "$x" | grep -m1 '"type":"session"' | grep -oE '"timestamp":"[^"]*' | head -n 1
  grep -m1 '"type":"session_init"' "$x" | grep -oE '"(task|agent)":"([^"\\]|\\.){0,250}' | head -n 2
  [ "$e" = 1 ] || { printf '@@kit-tail@@\n'; tail -c 32768 "$x"; }
done
printf '\n@@kit-said@@\n'; tail -c 65536 "$s"`;
export const CODEX_SH = String.raw`own=$( { ls -l "/proc/$1/fd" 2>/dev/null; lsof -p "$1" -Fn 2>/dev/null; } | grep -oE '/[^ ]*/rollout-[^ /]*\.jsonl' | sort -u)
[ -n "$own" ] || exit 0
printf '%s\n' "$own" | while IFS= read -r x; do
  head -n 1 "$x" | grep -q '"parent_thread_id"' || printf '\n@@kit-root@@\t%s\n' "$(head -n 1 "$x" | grep -oE '"id":"[^"]*' | head -n 1 | cut -d'"' -f4)"
done
r=$(dirname "$(dirname "$(dirname "$(dirname "$(printf '%s\n' "$own" | head -n 1)")")")")
find "$r" -mindepth 3 -maxdepth 3 -type d -mtime -2 2>/dev/null | while IFS= read -r dd; do find "$dd" -name 'rollout-*.jsonl' -mmin -30 2>/dev/null; done | head -n 40 | while IFS= read -r x; do
  h=$(head -n 1 "$x" | grep -oE '"(id|parent_thread_id|agent_nickname|agent_path|timestamp)":"[^"]*' | head -n 12)
  case "$h" in *parent_thread_id*) ;; *) continue;; esac
  printf '\n@@kit-sub@@\t%s\t%s\t\n%s\n@@kit-tail@@\n' "$(basename "$x")" "$(date -r "$x" +%s 2>/dev/null)" "$h"
  tail -c 16384 "$x"
done
printf '%s\n' "$own" | while IFS= read -r x; do head -n 1 "$x" | grep -q '"parent_thread_id"' || { printf '\n@@kit-said@@\n'; tail -c 65536 "$x"; }; done`;
// "key":"value (maybe cut short) in a block of such lines -> the value
const field = (head, k) => {
  const m = new RegExp(`"${k}":"((?:[^"\\\\\\n]|\\\\.)*)`).exec(String(head ?? ""));
  if (!m) return "";
  try { return JSON.parse(`"${m[1].replace(/\\[^"]{0,5}$/, "")}"`); } catch { return m[1]; }
};
// an omp task (its assignment, in sections) -> one line: what it is to change, else its first line
export function ompDesc(task) {
  const lines = String(task ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !/^complete assignment/i.test(l));
  const h = lines.findIndex((l) => /^#+\s*(change|goal|task|objective|目標|任務)/i.test(l));
  const pick = (h >= 0 ? lines.slice(h + 1) : lines).find((l) => !/^#/.test(l)) ?? "";
  return cut(pick.replace(/^[-*]\s+/, ""), 120);
}
// OMP_SH / CODEX_SH's output -> { at, list: [{ id, type, desc, done, start, last, path: "" }], steps: { id: step } }
export function parseOwnSubs(out, kind, now = Date.now()) {
  const all = String(out ?? ""), si = all.indexOf("\n@@kit-said@@\n");
  const text = si < 0 ? all : all.slice(0, si), said = saidOf(si < 0 ? "" : all.slice(si + 14)), steps = {}, subs = [];
  const roots = new Set([...text.matchAll(/\n@@kit-root@@\t([\w-]+)/g)].map((m) => m[1]));
  for (const block of text.split("\n@@kit-sub@@\t").slice(1)) {
    const nl = block.indexOf("\n"), [name, mt, dn] = block.slice(0, nl < 0 ? block.length : nl).split("\t");
    const rest = nl < 0 ? "" : block.slice(nl + 1), ti = rest.indexOf("@@kit-tail@@\n");
    const head = ti < 0 ? rest : rest.slice(0, ti), tail = ti < 0 ? "" : rest.slice(ti + 13);
    const last = Number(mt) * 1000 || 0, start = Date.parse(field(head, "timestamp")) || last;
    if (kind === "omp") {
      subs.push({ id: cut(name, 40), parent: "", type: cut(field(head, "agent") || "task", 40), desc: ompDesc(field(head, "task")), done: dn === "1", start, last, tail });
    } else {
      const s = tail.lastIndexOf('"type":"task_started"'), e = Math.max(tail.lastIndexOf('"type":"task_complete"'), tail.lastIndexOf('"type":"turn_aborted"'));
      const path = field(head, "agent_path"), nick = field(head, "agent_nickname");
      subs.push({ id: cut(field(head, "id") || name, 40), parent: field(head, "parent_thread_id"), type: cut(nick || "agent", 40),
        desc: cut((path.split("/").pop() || "").replace(/_/g, " "), 120), done: e > s || (s < 0 && now - last > 10 * 60000), start, last, tail });
    }
  }
  // Codex: only the agent's own threads' sub-agents (and theirs)
  let mine = subs;
  if (kind === "codex") {
    const ok = new Set(roots);
    for (let grew = true; grew;) { grew = false; for (const x of subs) if (!ok.has(x.id) && ok.has(x.parent)) { ok.add(x.id); grew = true; } }
    mine = subs.filter((x) => ok.has(x.id) && !roots.has(x.id));
  }
  const list = mine.filter((x) => !x.done || now - x.last < 30 * 60000).sort((a, b) => b.start - a.start).slice(0, SUBS_MAX).map((x) => {
    if (!x.done && x.tail) steps[x.id] = lastStep(x.tail);
    return { id: x.id, type: x.type, desc: x.desc, done: x.done, start: x.start, last: x.last, path: "" };
  });
  return { at: now, list, steps, said };
}
// what it last wrote (a transcript's tail: omp's message / Codex's task_complete or assistant message / Claude
// Code's) -> the line the reply hook would keep: the last one that asks something (？ or ?), else the last one
export function saidOf(tail) {
  let last = "";
  for (const line of String(tail ?? "").split("\n")) {
    let r = null;
    try { r = JSON.parse(line); } catch { continue; }
    const p = r?.payload, m = r?.message;
    if (r?.type === "event_msg" && p?.type === "task_complete" && typeof p.last_agent_message === "string") last = p.last_agent_message;
    else if (r?.type === "response_item" && p?.type === "message" && p.role === "assistant" && Array.isArray(p.content)) last = p.content.map((b) => (typeof b?.text === "string" ? b.text : "")).join("\n") || last;
    else if ((r?.type === "assistant" || (r?.type === "message" && m?.role === "assistant")) && Array.isArray(m?.content)) last = m.content.map((b) => (b?.type === "text" && typeof b.text === "string" ? b.text : "")).join("\n") || last;
  }
  let pick = "", ask = "";
  for (let l of last.split("\n")) {
    l = l.replace(/\*\*/g, "").replace(/`/g, "").replace(/^\s*[#>*-]+\s*/, "").replace(/^\s*\d+[.)]\s+/, "").trim();
    if (!l || l.startsWith("|")) continue;
    pick = l;
    if (/[？?]/.test(l)) ask = l;
  }
  return cut(ask || pick, MAX);
}
const OWN = { omp: OMP_SH, codex: CODEX_SH };
// the programs whose sub-agents the panel reads itself (agents(): app, else program.key) -> "omp" | "codex" | null
export const ownKind = (a) => { const k = String(a?.app || a?.program?.key || ""); return k === "omp" || k === "codex" ? k : null; };
async function readOwn(addr, kind) {
  const g = await hc(["get", addr, "--json"]).catch(() => null);
  let pid = null;
  try { pid = JSON.parse(g?.stdout ?? "{}").foreground?.pid ?? null; } catch {}
  if (!pid) return null;
  const r = await exec("sh", ["-c", OWN[kind], "sh", String(pid)], { timeout: 15000, on: machineOf(addr) }).catch(() => null);
  return r && r.code === 0 ? parseOwnSubs(r.stdout, kind) : null;
}
// its last step, and its description from the meta file next to it (the subs file may not have it yet: the hook ran
// before Claude Code wrote it)
async function readStep(addr, path) {
  const meta = path.replace(/\.jsonl$/, ".meta.json");
  const r = await exec("sh", ["-c", 'tail -c 65536 "$1" 2>/dev/null; printf "\\n@@kit-meta@@\\n"; head -c 8192 "$2" 2>/dev/null', "sh", path, meta],
    { timeout: 15000, on: machineOf(addr) }).catch(() => null);
  if (!r) return null;
  const [tail, m] = String(r.stdout ?? "").split("\n@@kit-meta@@\n");
  let desc = "";
  try { const j = JSON.parse(m ?? ""); desc = typeof j?.description === "string" ? cut(j.description, 120) : ""; } catch {}
  return { at: Date.now(), text: lastStep(tail), desc };
}

async function readCache(addr, kind) {
  const id = idOf(addr), m = machineOf(addr);
  if (!/^[\w-]+$/.test(id)) return null;
  if (!m) {
    const path = `${slash(home())}/.cache/nvim-jay/${kind}/${id}`;
    return readTextFile(isWindows() ? path.replace(/\//g, "\\") : path).catch(() => null);
  }
  const r = await exec("sh", ["-c", 'cat "$HOME/.cache/nvim-jay/$1/$2" 2>/dev/null', "sh", kind, id], { timeout: 15000, on: m }).catch(() => null);
  return r?.stdout ?? null;
}

// one ask per agent at a time; key: which entry in the shared state; parse: the file's reader
function ask(key, a, stop, kind, parse, cx) {
  const e = (shared(key) ?? {})[a.address];
  setShared(key, { ...(shared(key) ?? {}), [a.address]: { ...(e?.for === stop ? e : {}), for: stop, asked: Date.now(), busy: true } });
  cx.spawn(async (cx) => {
    const d = parse(await readCache(a.address, kind).catch(() => null));
    const cur = shared(key) ?? {};
    setShared(key, { ...cur, [a.address]: { ...(cur[a.address] ?? {}), ...(d ?? {}), for: stop, asked: Date.now(), busy: false } });
    cx.notify();
  });
}
// the agents still there only
function prune(key, live) {
  const all = shared(key) ?? {}, kept = Object.fromEntries(Object.entries(all).filter(([a]) => live.has(a)));
  if (Object.keys(kept).length !== Object.keys(all).length) setShared(key, kept);
  return kept;
}

// ags: Herdr's agents(); terms: terminals(). said: each done or idle agent at each status change (its record's
// status_ms) and every RETRY. subs: every SUBS_MS while it works, and once per status change.
export function saidTick(ags, terms, cx) {
  const rec = new Map((terms ?? []).map((r) => [r?.address, r])), now = Date.now();
  const live = new Set((ags ?? []).map((a) => a.address));
  const said = prune(SAID, live), subs = prune(SUBS, live);
  prune(BG, live);
  for (const a of ags ?? []) {
    const stop = Number(rec.get(a.address)?.status_ms) || 0;
    const e = said[a.address];
    // Read while you look at it too, and once idle (done and looked at): its words say whether it asks you (問你),
    // and that stays until it answers or works again.
    // Read again every RETRY anyway: Herdr's record of another machine's agent can keep an old status_ms, so a new
    // stop there isn't seen as one (its words then stayed those of the stop before, 問你 something already answered)
    if (!ownKind(a) && (a.status === "done" || a.status === "idle") && !e?.busy && !(e && e.for === stop && now - e.asked < RETRY))
      ask(SAID, a, stop, "said", parseSaid, cx);
    const b = (shared(BG) ?? {})[a.address];
    if (a.status === "done" && !a.focused && !b?.busy && (!b || now - b.asked >= BG_MS)) {
      setShared(BG, { ...(shared(BG) ?? {}), [a.address]: { ...(b ?? {}), asked: now, busy: true } });
      cx.spawn(async (cx) => {
        const d = await readBg(a.address).catch(() => null);
        setShared(BG, { ...(shared(BG) ?? {}), [a.address]: { ...((shared(BG) ?? {})[a.address] ?? {}), ...(d ?? {}), asked: Date.now(), busy: false } });
        cx.notify();
      });
    }
    const s = subs[a.address], kind = ownKind(a);
    if (!s?.busy && (!s || s.for !== stop || ((a.status === "working" || a.status === "done") && now - s.asked >= SUBS_MS))) {
      if (!kind) ask(SUBS, a, stop, "subs", parseSubs, cx);
      else if (!isWindows() || machineOf(a.address)) {
        setShared(SUBS, { ...(shared(SUBS) ?? {}), [a.address]: { ...(s?.for === stop ? s : {}), for: stop, asked: now, busy: true } });
        cx.spawn(async (cx) => {
          const d = await readOwn(a.address, kind).catch(() => null);
          const cur = shared(SUBS) ?? {};
          setShared(SUBS, { ...cur, [a.address]: { ...(cur[a.address] ?? {}), ...(d ? { at: d.at, list: d.list } : {}), for: stop, asked: Date.now(), busy: false } });
          // what each running one does now comes in the same read (STEPS, as Claude Code's do)
          // done: what it said, from the same read (omp and Codex have no reply hook to write it)
          if (d?.said && a.status === "done") setShared(SAID, { ...(shared(SAID) ?? {}), [a.address]: { at: d.at, text: d.said, for: stop, asked: d.at, busy: false } });
          if (d) setShared(STEPS, { ...(shared(STEPS) ?? {}), ...Object.fromEntries(Object.entries(d.steps).map(([id, text]) => [`${a.address}|${id}`, { at: d.at, text, asked: d.at, busy: false }])) });
          cx.notify();
        });
      }
    }
  }
  // the latest step of each running sub-agent (only while its agent is listed)
  const steps = shared(STEPS) ?? {};
  for (const a of ags ?? []) for (const x of subsNow(shared(SUBS), a.address, now, a.status === "working")) {
    const k = `${a.address}|${x.id}`, e = steps[k];
    if (x.done || !x.path || e?.busy || (e && now - e.asked < SUBS_MS)) continue;
    setShared(STEPS, { ...(shared(STEPS) ?? {}), [k]: { ...(e ?? {}), asked: now, busy: true } });
    cx.spawn(async (cx) => {
      const d = await readStep(a.address, x.path).catch(() => null);
      setShared(STEPS, { ...(shared(STEPS) ?? {}), [k]: { ...((shared(STEPS) ?? {})[k] ?? {}), ...(d ?? {}), asked: Date.now(), busy: false } });
      cx.notify();
    });
  }
  const keep = Object.fromEntries(Object.entries(shared(STEPS) ?? {}).filter(([k]) => live.has(k.slice(0, k.lastIndexOf("|")))));
  if (Object.keys(keep).length !== Object.keys(shared(STEPS) ?? {}).length) setShared(STEPS, keep);
  const busy = busyOf(ags, terms, shared(BG), shared(SUBS), now);
  if (JSON.stringify(busy) !== JSON.stringify(shared(BUSY) ?? {})) setShared(BUSY, busy);
}

// done agents whose own work still runs: address -> what runs (the newest background shell, else its sub-agents)
export function busyOf(ags, terms, bg, subs, now = Date.now()) {
  const rec = new Map((terms ?? []).map((r) => [r?.address, r])), out = {};
  for (const a of ags ?? []) {
    if (a.status !== "done") continue;
    const stop = Number(rec.get(a.address)?.status_ms) || 0, b = bg?.[a.address];
    const jobs = b?.at >= stop ? b.jobs ?? [] : [];
    const run = subsNow(subs, a.address, now).filter((x) => !x.done).length;
    if (jobs.length || run) out[a.address] = jobs[0] ?? `子 agent ${run} 個`;
  }
  return out;
}

// address -> what it said, when it said it at this stop (not long before its status became done)
// a line that asks you something, so its agent waits for your answer: a question mark, or the usual ways of asking
// without one (要推的話跟我說。 / 要不要… / …嗎。 / 回我「更新」)
const ASK = /[？?]|跟我說|告訴我|回我|要不要|你決定|你選|請(你)?(確認|決定|選)|嗎[。！!.]?\s*$/;
export const asks = (line) => ASK.test(String(line ?? ""));
export function saidNow(all, address, since) {
  const e = (all ?? {})[address];
  return e?.text && (!since || e.at >= since - 120000) ? e.text : "";
}
// address -> its sub-agents as last read: running first, then done; none when the file is over 30 minutes old and
// the agent isn't working (a long sub-agent of a working one may write nothing for a while)
export function subsNow(all, address, now = Date.now(), working = false) {
  const e = (all ?? {})[address];
  if (!e?.list || (!working && now - e.at > 30 * 60000)) return [];
  return [...e.list.filter((x) => !x.done), ...e.list.filter((x) => x.done)];
}
