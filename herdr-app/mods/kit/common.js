// What every part of the kit mod shares: how kit is run (and whether it is new enough: kit api), the shared state
// keys, the layout's node ids, one kit action at a time, and the small pieces of UI (copying, buttons, messages,
// editors). See main.js for the parts.
import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, TextView, EditorState } from "gpui-base";
import { exec, home, notify, settings, shared, setShared, theme, window, readTextFile } from "herdr";

// ---------- shared state (every copy sees it; it survives a restart, so nothing in it may stay "busy" forever) ----------
export const DATA = "kit.data.v2";             // the repository's data ({ at: 0 } = out of date: the panel loads it again)
export const LOAD = "kit.load";                // { seq, at, done } the repository's load in progress; only the newest is kept
export const BUSY = "kit.busy";                // { label, at, ttl, id, build } one kit action at a time; older than its ttl or another build's = finished
export const EDITORS = "kit.editors";          // path -> { dirty, at } the files open in big windows
export const MSG = (where) => `kit.msg.${where}`;   // kit's words after an action, per place (repo, agent:<key>, editor:<path>)
// per agent pane (key = "<machine>|<folder>|<terminal>", machine empty for this computer); the pane header asks kit
export const AGENT_CACHE = "kit.agent.v1";     // key -> { text, level, counts, news, started, at, busy }  the button's words
export const AGENT_DATA = "kit.agent.data.v1"; // key -> what kit list said (only for panes that still exist)
export const AGENT_WANT = "kit.agent.want";    // key -> when someone asked for a fresh look
export const CTX = "kit.ctx.v1";               // key -> how full the agent's context is
export const NOTE = "kit.note.v1";             // key -> the agent's progress note (kit note --pid --json; kit api 1.4)
export const LIMIT_SENT = "kit.limitSent.v1";  // key -> the limit (its until) 繼續 was typed for (kit context's limit; kit api 1.7)
export const AGENTS_DATA = "kit.agents.data.v1";   // kit agents --json
export const AGENTS_LOAD = "kit.agents.load";      // { seq, at, done } its load in progress
export const AGENTS_MSG = "kit.agents.msg";        // kit's words after an action in the Agents panel
export const PLACE_ASK = "kit.place.ask";          // [{ id, agent, space, tool, label, at, task? }] places the Agents window (or
                                                   // another mod: the Gerrit panel, with the first message as task) handed to
                                                   // the tab-bar button (place.js), taken off as it starts them
export const API = "kit.api.v1";               // machine ("" = this computer) -> what kit api said (see checkApi)

// ---------- the layout's nodes (the panels are found and shown / hidden by these ids) ----------
export const NODES = {
  repoToggle: "kit-toggle",           // the tab-bar button of the repository (role repo-toggle)
  repo: "kit-panel",                  // the column beside the work area that holds the repository (role repo)
  repoBlock: "kit",                   // the block in it
  agentsToggle: "kit-agents-toggle",  // the tab-bar button of Agents (role agents-toggle)
  agents: "kit-agents-panel",         // the column that holds Agents (role agents), hidden until its button is pressed
  agentsBlock: "kit-agents",          // the block in it
  tabsRow: "kit-tabs-row",            // a row put around a tab bar that stood in a column, so the buttons fit beside it
};

// ---------- small things ----------
export const fs = () => Number(settings().ui_font_size) || 13;
export const isWindows = () => window()?.platform === "windows";
export const mono = () => settings().font_family || (isWindows() ? "Consolas" : "Menlo");
export const stop = (_e, cx) => cx.stop_propagation();
export const slash = (p) => String(p ?? "").replace(/\\/g, "/");
// a folder with ~ for this computer's home (other machines' paths stay as they are)
export const shortDir = (d) => { const h = slash(home()), p = slash(d); return p && h && (p + "/").startsWith(h + "/") ? "~" + p.slice(h.length) : p; };
// kit's own messages, without the "kit: " / "kit：" in front of each line
export const clean = (s) => String(s).split("\n").map((l) => l.replace(/^kit[:：]\s?/, "")).join("\n").trim();
// something under way: a turning ring (Herdr turns it natively, no timer), alone or before "讀取中…" or a button's "送出中…"
export const spin = (size, color) => svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(color).spin(900);
export const withSpin = (label, size, color) => (typeof label === "string" && /中…$/.test(label) ? h_flex().gap(5).items_center().child(spin(size, color)).child(label) : label);
export const waiting = (t, z, text, color = t.muted) => h_flex().gap(6).items_center().text_color(color).child(spin(z - 1, color)).child(text);
export function find(node, id) {
  if (node?.id === id) return node;
  for (const c of node?.children ?? []) { const f = find(c, id); if (f) return f; }
  return null;
}
export function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}
// a long run of file lines (indented, as kit lists them) shows its first few and how many more: the reason stays in view
export const squeeze = (text) => {
  const out = [], lines = String(text).split("\n");
  for (let i = 0; i < lines.length;) {
    let j = i; while (j < lines.length && /^  \S/.test(lines[j])) j++;
    if (j - i > 8) { out.push(...lines.slice(i, i + 5), `  …還有 ${j - i - 5} 個檔案`); i = j; }
    else if (j > i) { out.push(...lines.slice(i, j)); i = j; }
    else out.push(lines[i++]);
  }
  return out.join("\n");
};

// ---------- numbers ----------
// 130,000
export const num = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// 13.5k, 139k, 1.25M: the context window's lists
export const kfmt = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(2).replace(/\.?0+$/, "")}M`;
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : String(Math.round(v));
};
// 14k, 1M, 1.5M: the context chip on a pane header (one fixed width, so as short as it gets)
export const kShort = (n) => {
  const v = Number(n) || 0;
  return v >= 1000000 ? `${+(v / 1000000).toFixed(v % 1000000 ? 1 : 0)}M` : `${Math.round(v / 1000)}k`;
};

// ---------- this copy's own settings (localStorage: each copy, each window has its own) ----------
export function localGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function localSet(key, value) { try { localStorage.setItem(key, value); } catch {} }

// Copying (the same in every part, and the same as the gerrit mod's): blocks of text (kit's messages, errors,
// descriptions, prompts) are selectable — drag over them, then Cmd/Ctrl+C; a right-click on a single value (a name,
// a path, a command) copies it and says 已複製. Left clicks are untouched.
// Leading spaces and tabs kept visible (text wraps, so they'd collapse): each becomes a no-break space (U+00A0).
const keepIndent = (l) => String(l ?? "").replace(/^[ \t]+/, (m) => m.replace(/\t/g, "    ").replace(/ /g, " "));
// Plain text as a selectable TextView: every line kept (a Markdown hard break: an HTML <br> inside a <p> is lost; an
// empty line is a no-break space), nothing in it read as markup (every ASCII punctuation mark escaped). Its press is
// stopped, so selecting text in a window never drags the window.
export const mdLines = (text) => String(text ?? "").replace(/\r/g, "").split("\n")
  .map((l) => keepIndent(l.replace(/[\\`*_{}[\]<>()#+\-.!|~$&:"'@^=?%,;\/]/g, "\\$&")) || " ").join("\\\n");
export const textBlock = (id, text) => div().on_mouse_down("left", stop).child(TextView.markdown(id, mdLines(text)).selectable(true));
// on_mouse_down("right", copyOn(value))
export const copyOn = (value) => (_e, cx) => {
  const text = String(value ?? "");
  if (!text) return;
  cx.stop_propagation();
  cx.write_to_clipboard(text);
  notify({ title: "已複製", body: text.length > 120 ? `${text.slice(0, 120)}…` : text, level: "success", timeout: 1500 });
};
export const copyOnRight = (el, value) => el.on_mouse_down("right", copyOn(value));

// A button. small: the panels' small one; tiny: the pane popups' (context window) smaller one.
export function btn(t, z, id, label, { kind, on, off, small, tiny } = {}) {
  const bg = off ? t.raised : kind === "primary" ? t.solid : kind === "danger" ? t.ansi1 : t.raised;
  const fg = off ? t.dim : kind === "primary" ? t.solid_foreground : kind === "danger" ? t.background : t.foreground;
  const [h, px, ts] = tiny ? [22, 8, z - 2] : small ? [26, 10, z - 1] : [30, 12, z];
  return div().id(id).h(h).px(px).flex().flex_none().items_center().justify_center().rounded(6)
    .text_size(ts).font_semibold().bg(bg).text_color(fg)
    .when(!off, (el) => el.cursor_pointer().hover((st) => st.opacity(0.85)).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); on?.(cx); }))
    .child(withSpin(label, tiny ? z - 3 : small ? z - 2 : z - 1, fg));
}

// A file in an editor: Markdown (or YAML), wrapped, the theme's colors
export function newEditor(value, language = "md") {
  const th = theme();
  return EditorState.new({ language, value, soft_wrap: true, font_family: settings().font_family, font_size: 12,
    syntax: { keyword: th.ansi5, string: th.ansi2, comment: th.dim, function: th.ansi4, type: th.ansi3, number: th.ansi1, constant: th.ansi6 } });
}
// big windows that said within 2 minutes that they are open
export function liveEditors() {
  const all = shared(EDITORS) ?? {}, now = Date.now(), out = {};
  for (const [k, v] of Object.entries(all)) if (v && now - (v.at ?? 0) < 120000) out[k] = v;
  return out;
}

// ---------- one kit action at a time (every part, every copy) ----------
// This build of the mod (every copy of every part runs in it). A reload (an edit to the mod) or a restart ends every task
// of the build before it, so a lock that build took is let go at once: collecting 39 skills takes one for 88 minutes,
// and an edit mid-run had left every button grey that long.
export const BUILD = `${Date.now()}-${Math.random()}`;
const live = (b) => Boolean(b) && typeof b === "object" && b.build === BUILD && Date.now() - (b.at ?? 0) < (b.ttl ?? 0);
export function busyNow() { const b = shared(BUSY); return live(b) ? b.label : null; }
// an action whose window closed (or the app quit, or the mod was reloaded) before it ended must not keep every button grey
export function dropStaleBusy() {
  const b = shared(BUSY);
  if (b && !live(b)) setShared(BUSY, null);
}
// take the lock: its id, or null when another action holds it; only the copy that took it gives it back
export function takeBusy(label, ttl) {
  if (busyNow()) return null;
  const id = `${Date.now()}-${Math.random()}`;
  setShared(BUSY, { label, at: Date.now(), ttl, id, build: BUILD });
  return id;
}
export function giveBusy(id) { if (id && shared(BUSY)?.id === id) setShared(BUSY, null); }

// A kit action (add / rm / sync / install …): takes the lock (owner.mine holds its id, so the owner's close can give it
// back), clears the message, runs kit there (machine null: this computer), puts kit's words in the shared key msg,
// gives the lock back, then after(cx) (what changed is out of date). okText: one plain sentence instead of kit's own
// lines when it worked (kit's warnings, stderr, still shown under it). false: another action holds the lock.
export function kitAction(owner, cx, { label, args, msg, ttl = 120000, machine = null, okText = null, after = null }) {
  owner.mine = takeBusy(label, ttl);
  if (!owner.mine) return false;
  setShared(msg, null);
  cx.notify();
  cx.spawn(async (cx) => {
    try {
      const r = await kit(args, ttl, machine);
      const text = clean([r.out, r.err].filter(Boolean).join("\n"));
      if (r.code === 0 && okText) setShared(msg, { ok: true, plain: true, label, text: [okText, clean(r.err ?? "")].filter(Boolean).join("\n"), at: Date.now() });
      else setShared(msg, { ok: r.code === 0, label, text: text || (r.code === 0 ? "完成" : `失敗（${r.code}）`), at: Date.now() });
    } finally {
      giveBusy(owner.mine);
      owner.mine = null;
      (after ?? (() => markChanged(machine)))(cx);
      cx.notify();
    }
  });
  return true;
}

// Load into shared state (load: the in-progress key, data: where the answer goes), the newest load wins: a slower,
// older one can't put back what an action changed meanwhile. -> what was loaded
export async function loadNewest(load, data, fn) {
  const seq = (shared(load)?.seq ?? 0) + 1;
  setShared(load, { seq, at: Date.now(), done: false });
  let d;
  try { d = await fn(); } catch (e) { d = { error: `讀不到：${e?.message ?? e}`, at: Date.now() }; }
  if ((shared(load)?.seq ?? 0) === seq) { setShared(data, d); setShared(load, { seq, at: Date.now(), done: true }); }
  return d;
}
// a load of loadNewest under way (younger than ttl: one that never finished, the app quit, doesn't count)
export function loadingNow(load, ttl = 90000) { const l = shared(load); return Boolean(l && !l.done && Date.now() - (l.at ?? 0) < ttl); }

// after a change on a machine (null: this computer): the repository (this computer's) and every agent header there
// are out of date
export function markRepoStale() { const d = shared(DATA); if (d) setShared(DATA, { ...d, at: 0 }); }
export function markChanged(machine) {
  if (!machine) markRepoStale();
  const m = machine ?? "", now = Date.now(), want = { ...(shared(AGENT_WANT) ?? {}) };
  for (const k of Object.keys(shared(AGENT_CACHE) ?? {})) if (k.split("|")[0] === m) want[k] = now;
  setShared(AGENT_WANT, want);
}

// ---------- running kit ----------
// This computer: kit from PATH (kit.cmd on Windows). Herdr started from the Dock / Finder loads the login shell's
// PATH, so ~/.local/bin (where kit installs itself) is on it; a Linux desktop launcher doesn't add it, and a Windows
// PATH may not have caught up yet: then kit's own install folder (~/.local/bin/kit; Windows
// %LOCALAPPDATA%\Programs\agentkit\kit.cmd, taken as <home>\AppData\Local: a mod sees no environment variables).
// Another machine (a space's machine): kit from PATH or ~/.local/bin (Mac/Linux, through sh), else kit.cmd (Windows).
// Only a kit that could not be started counts as "no kit" here; what a kit that ran says (any exit code) is kit's.
export const localKit = () => (isWindows() ? "kit.cmd" : "kit");
const localWays = () => (isWindows()
  ? [["kit.cmd"], [`${slash(home()).replace(/\//g, "\\")}\\AppData\\Local\\Programs\\agentkit\\kit.cmd`]]
  : [["kit"], [`${slash(home())}/.local/bin/kit`]]);
const REMOTE_SH = ["sh", "-c", 'command -v kit >/dev/null 2>&1 && exec kit "$@"; exec "$HOME/.local/bin/kit" "$@"', "kit"];
const SH_NOT_FOUND = 127, CMD_NOT_FOUND = 9009;   // sh found no kit; cmd found no kit.cmd (Windows)
// exec's own words when it stopped a program that ran too long (here, or on another machine)
const TIMED_OUT = /took longer than/;
// -> { code, out, err, via, missing, timedOut } (via: "cmd" when it was kit.cmd (Windows), else "sh"; missing: no kit
// to run there, or the machine can't be reached; timedOut: kit started but didn't answer within timeout)
export async function kit(args, timeout = 60000, machine = null) {
  const ways = machine ? [REMOTE_SH, ["kit.cmd"]] : localWays();
  let last = "";
  for (const argv of ways) {
    let r;
    try { r = await exec(argv[0], [...argv.slice(1), ...args], { timeout, on: machine }); }
    catch (e) {
      const why = String(e?.message ?? e);
      if (TIMED_OUT.test(why)) return { code: -1, out: "", err: `kit 沒在 ${Math.round(timeout / 1000)} 秒內回應${machine ? `（${machine}）` : ""}`, timedOut: true };
      last = why;
      continue;   // couldn't start it that way: the next way
    }
    if (machine && ((argv === REMOTE_SH && r.code === SH_NOT_FOUND) || (argv[0] === "kit.cmd" && r.code === CMD_NOT_FOUND))) { last = String(r.stderr ?? ""); continue; }
    return { code: r.code, out: String(r.stdout ?? ""), err: String(r.stderr ?? ""), via: /kit\.cmd$/i.test(argv[0]) ? "cmd" : "sh" };
  }
  return { code: -1, out: "", missing: true,
    err: machine ? `連不到 ${machine}，或那台沒裝 kit${last ? `（${clean(last)}）` : ""}` : `找不到 kit：這台電腦的 PATH 上沒有 ${localKit()}，kit 的安裝資料夾裡也沒有${last ? `（${clean(last)}）` : ""}` };
}

// ---------- kit's JSON (kit list / agents / push --json, kit collect --look) ----------
// Every one of these prints only JSON on stdout, its words for people on stderr (shown as they are). It fails with a
// non-zero exit and one line {"error": {"code", "message"}}; a code this mod doesn't know (a newer kit's) is "error".
// The list is kit's README, "給程式讀的介面".
export const KIT_ERRORS = ["usage", "not_init", "busy", "no_source", "not_git", "check_failed", "no_git_identity", "author_not_allowed",
  "bad_push_mode", "no_origin", "no_remote", "not_on_branch", "out_of_sync", "host_not_allowed", "push_failed", "not_maintainer",
  "not_allowed", "download_failed", "no_skill",
  // kit 0.5.0 (api 1.3): kit new mcp --config (a pasted MCP setup), kit place (an agent's own folder)
  "bad_config", "several_servers", "not_found", "no_name", "bad_name", "exists", "no_agent", "no_parent", "other_agent", "not_empty", "bad_dir",
  "error"];
// kit's answer (from kit()) -> { data } or { error: { code, message } }; what: the command, for a message of our own
export function kitJson(r, what) {
  let j = null;
  try { j = JSON.parse(String(r?.out ?? "").trim() || "null"); } catch { j = null; }
  if (r?.code === 0 && j && typeof j === "object" && !Array.isArray(j) && !j.error) return { data: j };
  const e = j && typeof j === "object" ? j.error : null;
  if (e && typeof e === "object") {
    const code = KIT_ERRORS.includes(e.code) ? e.code : "error";
    // several_servers / not_found (kit new mcp --config): the servers in the paste, to pick one
    const servers = Array.isArray(e.servers) ? e.servers.filter((x) => typeof x === "string") : null;
    return { error: { code, message: String(e.message || clean(r.err ?? "") || `${what} 失敗（${code}）`), ...(servers ? { servers } : {}) } };
  }
  if (r?.missing || r?.timedOut) return { error: { code: r.timedOut ? "timeout" : "missing", message: String(r.err ?? "") } };
  return { error: { code: "error", message: r?.code === 0 ? `${what} 的輸出讀不懂（kit 太舊？請打 kit self-update）`
    : clean(r?.err || r?.out || "") || `${what} 失敗（${r?.code}）` } };
}

// ---------- is kit new enough: kit api ----------
// kit api prints the version of what this mod reads from kit (kit list --json, kit agents --json, kit context ...)
// as major.minor: a new major breaks this mod, a new minor only adds. This mod reads major KIT_API.major, and needs at
// least minor KIT_API.minor. A plain "1" (kit 0.2.x) is 1.0. Asked when Herdr starts (the first copy that needs it;
// the others reuse the answer), again every few minutes, and at once from a ⟳.
export const KIT_API = { major: 1, minor: 0 };
const API_OK_TTL = 300000, API_BAD_TTL = 30000;
// the first ask waits longer (a company computer's virus scanner may hold kit's first start a long time); a busy
// mark older than API_BUSY is an ask that never came back
const API_FIRST = 40000, API_AGAIN = 15000, API_BUSY = 45000;
const BOOT = Date.now();   // this source version's start (module code runs once per version, shared by copies)
const WANT = `${KIT_API.major}.${KIT_API.minor}`;
// what kit api's answer means: { ok, kind: "ok" | "missing" | "timeout" | "old" | "newer", api, title, text }
export function readApi(r, machine = null) {
  const there = machine ? `${machine} 上的 kit` : "這台電腦的 kit";
  if (r?.timedOut) return { ok: false, kind: "timeout", api: null, title: "kit 沒回應",
    text: `${r.err || "kit 沒回應"}。\n可能是第一次開、防毒軟體在檢查它，或那台很忙：等一下再按 ⟳。` };
  if (!r || r.missing) return { ok: false, kind: "missing", api: null, title: machine ? `${machine} 沒有 kit` : "找不到 kit",
    text: machine ? `${r?.err || `連不到 ${machine}，或那台沒裝 kit`}\n在 ${machine} 照 kit 的說明裝好 kit，再按 ⟳。`
      : `${r?.err || "找不到 kit"}\n照 kit 的說明裝好 kit（Windows 要找得到 kit.cmd），再按 ⟳。裝好後還是找不到：重開 Herdr，讓它重新讀 PATH。` };
  const m = r.code === 0 ? String(r.out ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/) : null;
  const major = m ? Number(m[1]) : null, minor = m ? Number(m[2] ?? 0) : null, api = m ? `${major}.${minor}` : null;
  if (major === KIT_API.major && minor >= KIT_API.minor) return { ok: true, kind: "ok", api, title: "", text: "" };
  if (major != null && major > KIT_API.major) return { ok: false, kind: "newer", api, title: "Herdr 的 kit mod 太舊",
    text: `${there}比這個 Herdr kit mod 新（kit api 是 ${api}，這個 mod 只認得 ${KIT_API.major}.x）。\n請更新 herdr-jay 的 kit mod：照 herdr-jay 的 docs/kit.md 重新複製（或連結）herdr-app/mods/kit，再重開 Herdr。` };
  return { ok: false, kind: "old", api, title: "kit 太舊",
    text: `${there}太舊：${api ? `kit api 是 ${api}，這個 mod 要 ${WANT} 以上` : "沒有 kit api"}（要 kit 0.3.0 以上）。\n${machine ? `在 ${machine} 的終端機` : "在終端機"}打  kit self-update，好了再按 ⟳。` };
}
export function apiState(machine = null) { return (shared(API) ?? {})[machine ?? ""] ?? null; }
// kit api there is known to be at least 1.<minor> (kit 0.5.0 is 1.3: kit place, kit new mcp --config); false when it is
// older, or not known yet
export function apiAtLeast(machine, minor) {
  const m = String(apiState(machine)?.api ?? "").match(/^(\d+)\.(\d+)$/);
  return Boolean(m && Number(m[1]) === KIT_API.major && Number(m[2]) >= minor);
}
// kit api's answer, when there is a recent one (from this start of Herdr): ok or not; null = not known yet
export function apiKnown(machine = null) {
  const a = apiState(machine);
  if (!a || a.busy || !a.kind || (a.at ?? 0) < BOOT) return null;
  return Date.now() - a.at < (a.ok ? API_OK_TTL : API_BAD_TTL) ? a : null;
}
// ask kit api on that machine unless there is a recent answer (force: ask anyway); one ask at a time per machine
export function checkApi(machine, cx, force = false) {
  const m = machine ?? "", a = apiState(machine);
  if (a?.busy && Date.now() - (a.started ?? 0) < API_BUSY) return;
  if (!force && apiKnown(machine)) return;
  const started = Date.now(), first = !a?.kind || (a.at ?? 0) < BOOT;
  setShared(API, { ...(shared(API) ?? {}), [m]: { ...(a ?? {}), busy: true, started } });
  cx.spawn(async (cx) => {
    let r;
    try { r = await kit(["api"], first ? API_FIRST : API_AGAIN, machine); } catch (e) { r = { code: -1, out: "", err: String(e?.message ?? e), missing: true }; }
    setShared(API, { ...(shared(API) ?? {}), [m]: { ...readApi(r, machine), busy: false, started, at: Date.now() } });
    cx.notify();
  });
}
// the card shown in place of a part's content while kit isn't usable there
export function apiCard(t, z, a, machine, id) {
  return v_flex().p(14).gap(8)
    .child(div().font_semibold().text_color(t.ansi1).child(a.title || "kit 不能用"))
    .child(div().text_size(z - 1).child(textBlock(`api-${id}`, a.text)))
    .child(h_flex().child(btn(t, z, `api-again-${id}`, apiState(machine)?.busy ? "檢查中…" : "⟳ 再檢查一次", { small: true, kind: "primary",
      off: Boolean(apiState(machine)?.busy), on: (cx) => checkApi(machine, cx, true) })));
}

// ---------- shared cards ----------
// kit's words after an action (msg: { ok, label, text, plain }): kit's own lines in mono, or one plain sentence
export function messageBox(t, z, id, msg, onClose, shape = (s) => s) {
  return h_flex().flex_none().mx(10).mt(8).p(8).gap(8).items_start().rounded(6).bg(t.raised)
    .border_1().border_color(msg.ok ? t.border : t.ansi1)
    .child(msg.plain
      ? div().flex_1().min_w(0).text_size(z - 1).text_color(t.foreground).child(textBlock(`msg-text-${id}`, msg.text))
      : div().flex_1().min_w(0).text_size(z - 1).font_family(mono()).text_color(msg.ok ? t.foreground : t.ansi1)
        .child(textBlock(`msg-text-${id}`, `${msg.label}：${msg.ok ? "" : "失敗\n"}${shape(msg.text)}`)))
    .child(div().id(`msg-close-${id}`).flex_none().px(4).cursor_pointer().text_color(t.muted).hover((s) => s.text_color(t.foreground))
      .on_mouse_down("left", stop).on_click((_e, cx) => { onClose(); cx.notify(); }).child("✕"));
}
// kit said something went wrong (a load's error: its words, and kit's error code): what to do
export function problemCard(t, z, id, text, code = null) {
  const notInit = code === "not_init";
  return v_flex().p(14).gap(8)
    .child(div().font_semibold().text_color(t.ansi1).child("kit 出錯了"))
    .child(div().font_family(mono()).text_size(z - 1).child(textBlock(`problem-${id}`, text)))
    .child(div().text_size(z - 1).text_color(t.muted).child(notInit
      ? "第一次用要先在終端機打  kit init <團隊來源的網址>，好了再按上面的 ⟳。"
      : "修好後按上面的 ⟳ 重新讀取。"));
}
// the team wants a newer kit than this one (kit list's kit_version_wanted)
export function versionCard(t, z, id, d) {
  return div().flex_none().mx(10).mt(8).p(8).rounded(6).bg(t.raised).text_size(z - 1).text_color(t.blocked)
    .child(textBlock(`want-${id}`, `團隊要 kit ${d.kit_version_wanted} 以上，你的是 ${d.kit}。請在終端機打  kit self-update`));
}

// ---------- what kit collect took, and from whom (the repository's Skills list, an agent's 還沒用的) ----------
// third_party.lock (kit collect: "name TAB url TAB path TAB ref TAB commit TAB license TAB date", # comments) ->
// { name: "author/repo" } (the URL without scheme, user, host, .git: who it was collected from)
export function lockFrom(text) {
  const out = {};
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const [name, url] = line.split("\t");
    if (!name || name.startsWith("#") || !url) continue;
    out[name] = urlId(url);
  }
  return out;
}
// a git URL -> "author/repo" (kit's url_id without the host): https://github.com/a/r.git, git@host:a/r -> a/r
export const urlId = (url) => String(url ?? "").trim().replace(/^[a-z+]+:\/\//, "").replace(/^[^@/]*@/, "").replace(/^([^/:]+):/, "$1/")
  .replace(/\/+$/, "").replace(/\.git$/, "").split("/").slice(1).join("/") || String(url ?? "");
// each source's third_party.lock (on the machine kit runs on: null is this computer) -> { source: { name: "author/repo" } }
export async function collectedFrom(sources, machine = null) {
  const out = {};
  for (const s of sources ?? []) {
    if (!s?.dir) continue;
    const p = `${String(s.dir).replace(/\\/g, "/").replace(/\/+$/, "")}/third_party.lock`;
    out[s.name] = lockFrom(await (machine ? readTextFile(p, { on: machine }) : readTextFile(p)).catch(() => null));
  }
  return out;
}
// the list of one kind: your own first, then what was collected, by whom it was collected from
//   -> [{ from: "", rows }, { from: "author/repo", rows }, ...]  (groups by name; rows as sorted)
export function groupRows(rows) {
  const own = rows.filter((i) => !i.from), by = new Map();
  for (const i of rows) if (i.from) by.set(i.from, [...(by.get(i.from) ?? []), i]);
  return [{ from: "", rows: own }, ...[...by.keys()].sort((a, b) => a.localeCompare(b)).map((from) => ({ from, rows: by.get(from) }))];
}
