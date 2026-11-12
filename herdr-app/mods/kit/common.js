// What every part of the kit mod shares: how kit is run (and whether it is new enough: kit api), the shared state
// keys, and the small pieces of UI (copying, buttons, messages). See main.js for the parts.
import { div, svg, image } from "gpui-kit";
import { h_flex, v_flex, TextView } from "gpui-base";
import { exec, home, notify, settings, shared, setShared, window } from "herdr";

// ---------- shared state (every copy sees it; it survives a restart, so nothing in it may stay "busy" forever) ----------
export const DATA = "kit.data.v2";             // the repository's data ({ at: 0 } = out of date: the panel loads it again)
export const LOAD = "kit.load";                // { seq, at, done } the repository's load in progress; only the newest is kept
export const BUSY = "kit.busy";                // { label, at, ttl, id } one kit action at a time; older than its ttl = finished
export const EDITORS = "kit.editors";          // path -> { dirty, at } the files open in big windows
export const MSG = (where) => `kit.msg.${where}`;   // kit's words after an action, per place (panel, pane:<key>, editor:<path>)
// per agent pane (key = "<machine>|<folder>|<terminal>", machine empty for this computer); the pane header asks kit
export const PANE_CACHE = "kit.pane.v1";       // key -> { text, level, counts, news, started, at, busy }  the button's words
export const PANE_DATA = "kit.pane.data.v1";   // key -> what kit list said (only for panes that still exist)
export const PANE_WANT = "kit.pane.want";      // key -> when someone asked for a fresh look
export const CTX = "kit.ctx.v1";               // key -> how full the agent's context is
export const AGENTS_DATA = "kitag.data.v1";    // kit agents --json
export const AGENTS_MSG = "kitag.msg";         // kit's words after an action in the Agents panel
export const API = "kit.api.v1";               // machine ("" = this computer) -> what kit api said (see checkApi)

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

// Copying (the same in every part, and the same as the gerrit mod's): blocks of text (kit's messages, errors,
// descriptions, prompts) are selectable — drag over them, then Cmd/Ctrl+C; a right-click on a single value (a name,
// a path, a command) copies it and says 已複製. Left clicks are untouched.
// Leading spaces and tabs kept visible (text wraps, so they'd collapse).
const keepIndent = (l) => String(l ?? "").replace(/^[ \t]+/, (m) => m.replace(/\t/g, "    ").replace(/ /g, " "));
// Plain text as a selectable TextView: every line kept (a Markdown hard break: an HTML <br> inside a <p> is lost),
// nothing in it read as markup (every ASCII punctuation mark escaped). Its press is stopped, so selecting text in a
// window never drags the window.
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

// ---------- one kit action at a time (every part, every copy) ----------
export function busyNow() { const b = shared(BUSY); return b && typeof b === "object" && Date.now() - (b.at ?? 0) < (b.ttl ?? 0) ? b.label : null; }
// an action whose window closed (or the app quit) before it ended must not keep every button grey
export function dropStaleBusy() {
  const b = shared(BUSY);
  if (b && (typeof b !== "object" || Date.now() - (b.at ?? 0) > (b.ttl ?? 0))) setShared(BUSY, null);
}
// take the lock: its id, or null when another action holds it; only the copy that took it gives it back
export function takeBusy(label, ttl) {
  if (busyNow()) return null;
  const id = `${Date.now()}-${Math.random()}`;
  setShared(BUSY, { label, at: Date.now(), ttl, id });
  return id;
}
export function giveBusy(id) { if (id && shared(BUSY)?.id === id) setShared(BUSY, null); }

// after a change on a machine (null: this computer): the repository (this computer's) and every agent header there
// are out of date
export function markRepoStale() { const d = shared(DATA); if (d) setShared(DATA, { ...d, at: 0 }); }
export function markChanged(machine) {
  if (!machine) markRepoStale();
  const m = machine ?? "", now = Date.now(), want = { ...(shared(PANE_WANT) ?? {}) };
  for (const k of Object.keys(shared(PANE_CACHE) ?? {})) if (k.split("|")[0] === m) want[k] = now;
  setShared(PANE_WANT, want);
}

// ---------- running kit ----------
// This computer: kit from PATH (kit.cmd on Windows). Herdr started from the Dock / Finder loads the login shell's
// PATH, so ~/.local/bin (where kit installs itself) is on it.
// Another machine (a space's machine): kit from PATH or ~/.local/bin (Mac/Linux), else kit.cmd (Windows).
export const localKit = () => (isWindows() ? "kit.cmd" : "kit");
const REMOTE_SH = ["sh", "-c", 'command -v kit >/dev/null 2>&1 && exec kit "$@"; exec "$HOME/.local/bin/kit" "$@"', "kit"];
const NOT_FOUND = (code) => code === 127 || code === 9009;   // a shell that found no command (9009: Windows' cmd)
// -> { code, out, err, missing } (missing: no kit to run there, or the machine can't be reached)
export async function kit(args, timeout = 60000, machine = null) {
  const ways = machine ? [REMOTE_SH, ["kit.cmd"]] : [[localKit()]];
  let last = "";
  for (const argv of ways) {
    let r;
    try { r = await exec(argv[0], [...argv.slice(1), ...args], { timeout, on: machine }); }
    catch (e) { last = String(e?.message ?? e); continue; }   // couldn't start it that way: the next way
    if (NOT_FOUND(r.code) && (argv === REMOTE_SH || !machine)) { last = String(r.stderr ?? ""); continue; }
    return { code: r.code, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
  }
  return { code: -1, out: "", missing: true,
    err: machine ? `連不到 ${machine}，或那台沒裝 kit${last ? `（${clean(last)}）` : ""}` : `找不到 kit：這台電腦的 PATH 上沒有 ${localKit()}${last ? `（${clean(last)}）` : ""}` };
}

// ---------- is kit new enough: kit api ----------
// kit api prints one number, the version of what this mod reads from kit (kit list --json, kit agents --json,
// kit context ...). This mod reads version KIT_API. Asked when Herdr starts (the first copy that needs it; the
// others reuse the answer), again every few minutes, and at once from a ⟳.
export const KIT_API = 1;
const API_OK_TTL = 300000, API_BAD_TTL = 30000, API_BUSY = 20000;
const BOOT = Date.now();   // this source version's start (module code runs once per version, shared by copies)
// what kit api's answer means: { ok, kind: "ok" | "missing" | "old" | "newer", api, title, text }
export function readApi(r, machine = null) {
  const there = machine ? `${machine} 上的 kit` : "這台電腦的 kit";
  if (!r || r.missing) return { ok: false, kind: "missing", api: null, title: machine ? `${machine} 沒有 kit` : "找不到 kit",
    text: machine ? `${r?.err || `連不到 ${machine}，或那台沒裝 kit`}\n在 ${machine} 照 kit 的說明裝好 kit，再按 ⟳。`
      : `${r?.err || "找不到 kit"}\n照 kit 的說明裝好 kit（Windows 要找得到 kit.cmd），再按 ⟳。裝好後還是找不到：重開 Herdr，讓它重新讀 PATH。` };
  const out = String(r.out ?? "").trim();
  const n = r.code === 0 && /^\d+$/.test(out) ? Number(out) : null;
  if (n === KIT_API) return { ok: true, kind: "ok", api: n, title: "", text: "" };
  if (n != null && n > KIT_API) return { ok: false, kind: "newer", api: n, title: "Herdr 的 kit mod 太舊",
    text: `${there}比這個 Herdr kit mod 新（kit api 是 ${n}，這個 mod 只認得 ${KIT_API}）。\n請更新 herdr-jay 的 kit mod：照 herdr-jay 的 docs/kit.md 重新複製（或連結）mods/kit，再重開 Herdr。` };
  return { ok: false, kind: "old", api: n, title: "kit 太舊",
    text: `${there}太舊：沒有 kit api（要 0.2.0 之後的版本）。\n${machine ? `在 ${machine} 的終端機` : "在終端機"}打  kit self-update，好了再按 ⟳。` };
}
export function apiState(machine = null) { return (shared(API) ?? {})[machine ?? ""] ?? null; }
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
  const started = Date.now();
  setShared(API, { ...(shared(API) ?? {}), [m]: { ...(a ?? {}), busy: true, started } });
  cx.spawn(async (cx) => {
    let r;
    try { r = await kit(["api"], 15000, machine); } catch (e) { r = { code: -1, out: "", err: String(e?.message ?? e), missing: true }; }
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
