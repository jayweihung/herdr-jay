// The files an agent read or edited, newest first, in a popup; pick one to open it in an editor.
// Opened by a key (macOS cmd-o, Windows ctrl-shift-j: "mod.open:agent-files") from the agent's pane or any pane of
// its tab. Type to filter, ↑/↓ and Enter to open, Tab for the next agent of the tab, Esc to leave.
//
// The list is kit's: `kit files --pid <the agent's process> --tool <claude|codex|omp> --dir <its folder> --git --json`
// on the agent's machine (kit 0.4.0 or later, `kit api` 1.1), the same way the kit mod runs kit there. kit reads the
// agent's own log (Claude Code, Codex, omp) and adds what git shows changed; this mod reads no log itself.
//
// Opening, on the agent's machine (a tab's panes all live on its space's machine):
//   1. an nvim-jay pane in the tab: it opens the file there (nvim --server <its address> --remote-expr, see
//      nvim-jay's JN.open_hex), and that pane gets the focus;
//   2. else a new pane right of the agent with an editor: agent-files.json's "editor", else $VISUAL / $EDITOR, else
//      vi (Windows: nvim);
//   3. "gui": true runs the editor without a pane (VS Code, Zed: only for agents on this computer).
// No kit (or one older than 0.4.0) where the agent runs: the tab's nvim-jay pane shows its own list instead (alt+o).
// <Herdr home>/agent-files.json, all optional:  { "editor": ["hx"], "gui": false, "nvim_jay": true }

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { agents, appHome, closeOverlay, exec, focused, hc, home, notify, panes, props, readTextFile, run, settings, spaces, terminals, theme, window } from "herdr";

// nvim-jay's argv marker: keep it identical to nvim-jay/mark.js (mods can't import from each other; tests/nvim-jay
// checks the two agree)
const MARK = "let g:nvim_jay = 1";
const KIT_FILES_API = { major: 1, minor: 1 };
const TAGS = { read: "讀", edit: "改", write: "寫", git: "git" };
const TOOL_OF = { "claude-code": "claude", claude: "claude", codex: "codex", pi: "omp", omp: "omp" };

const isWindows = () => window()?.platform === "windows";
const slash = (p) => String(p ?? "").replace(/\\/g, "/");
const clean = (s) => String(s ?? "").replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim().split("\n").slice(-3).join(" ").slice(0, 300);

// ---------- kit on the agent's machine (as the kit mod runs it) ----------
const REMOTE_SH = ["sh", "-c", 'command -v kit >/dev/null 2>&1 && exec kit "$@"; exec "$HOME/.local/bin/kit" "$@"', "kit"];
const localWays = () => (isWindows()
  ? [["kit.cmd"], [`${slash(home()).replace(/\//g, "\\")}\\AppData\\Local\\Programs\\agentkit\\kit.cmd`]]
  : [["kit"], [`${slash(home())}/.local/bin/kit`]]);
async function kit(args, timeout, machine) {
  let last = "";
  for (const argv of machine ? [REMOTE_SH, ["kit.cmd"]] : localWays()) {
    let r;
    try { r = await exec(argv[0], [...argv.slice(1), ...args], { timeout, on: machine }); }
    catch (e) {
      const why = String(e?.message ?? e);
      if (/took longer than/.test(why)) return { code: -1, out: "", err: `kit 沒在 ${Math.round(timeout / 1000)} 秒內回應` };
      last = why;
      continue;
    }
    if (machine && ((argv === REMOTE_SH && r.code === 127) || (argv[0] === "kit.cmd" && r.code === 9009))) { last = String(r.stderr ?? ""); continue; }
    return { code: r.code, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
  }
  return { code: -1, out: "", missing: true,
    err: `${machine ? `連不到 ${machine}，或那台沒裝 kit` : "找不到 kit"}${last ? `（${clean(last)}）` : ""}` };
}
// why kit files gave no list: kit missing, too old (no kit files), or kit's own error
async function kitTrouble(r, machine) {
  if (r.missing) return `${r.err}\n照 kit 的說明裝好 kit（0.4.0 以上）。`;
  try { const e = JSON.parse(r.out.trim()).error; if (e?.message) return String(e.message); } catch {}
  const a = await kit(["api"], 15000, machine);
  const m = a.code === 0 ? a.out.trim().match(/^(\d+)(?:\.(\d+))?$/) : null;
  const major = m ? Number(m[1]) : null, minor = m ? Number(m[2] ?? 0) : null;
  if (major === KIT_FILES_API.major && minor < KIT_FILES_API.minor || !m)
    return `${machine ? `${machine} 上的 kit` : "kit"} 太舊，沒有 kit files（要 kit 0.4.0 以上）：在${machine ? ` ${machine} 的` : ""}終端機打  kit self-update`;
  if (major > KIT_FILES_API.major) return "kit 比這個 mod 新：請更新 herdr-jay 的 agent-files mod。";
  return clean(r.err || r.out) || `kit files 失敗（${r.code}）`;
}

// ---------- where things are ----------
function machineOf(spaceId) { return spaces().find((s) => s.id === spaceId)?.machine ?? null; }
async function fgPid(term) {
  const g = term ? await hc(["get", term, "--json"]).catch(() => null) : null;
  try { const j = JSON.parse(g?.stdout ?? "{}"); return j.foreground?.pid ?? j.pid ?? null; } catch { return null; }
}
// the agents of the focused tab, the focused one (or the one that changed last) first
function tabAgents() {
  const f = focused();
  if (!f) return [];
  const mine = agents().filter((a) => a.tab === f.tab);
  const at = (a) => (a.address === f.terminal || a.address === f.agent ? 1 : 0);
  return mine.sort((a, b) => at(b) - at(a) || b.seq - a.seq);
}
const isNvimJay = (t) => Array.isArray(t?.argv) && t.argv.includes(MARK);

async function config() {
  const sep = appHome().includes("\\") ? "\\" : "/";
  let c = {};
  try { c = JSON.parse((await readTextFile(`${appHome()}${sep}agent-files.json`)) ?? "{}") ?? {}; } catch (e) {
    notify({ title: "agent-files.json 讀不懂", body: String(e?.message ?? e), level: "warning" });
  }
  const editor = Array.isArray(c.editor) && c.editor.length && c.editor.every((x) => typeof x === "string") ? c.editor : null;
  return { editor, gui: c.gui === true, nvimJay: c.nvim_jay !== false };
}

// ---------- opening ----------
// the path's UTF-8 bytes as hex (encodeURIComponent, not TextEncoder: plain JavaScript, whatever runs the mod)
const hex = (s) => Array.from(s, (ch) => {
  const e = encodeURIComponent(ch);
  return e.startsWith("%") ? e.slice(1).split("%").join("").toLowerCase() : ch.charCodeAt(0).toString(16).padStart(2, "0");
}).join("");
// nvim on that machine as a client of nvim-jay's server (macOS / Linux: the same places nvim-jay looks for nvim)
const NVIM_CLIENT = `sock="$HOME/.cache/nvim-jay/sock/$1"; shift
for n in "$HOME/.local/bin/nvim" /opt/homebrew/bin/nvim /usr/local/bin/nvim /usr/bin/nvim; do
  [ -x "$n" ] && exec "$n" --server "$sock" --remote-expr "$1"
done
echo "nvim not found" >&2; exit 127`;
async function toNvimJay(pane, path, machine) {
  const pid = await fgPid(pane.terminal);
  if (!pid) return false;
  const expr = `v:lua.JN.open_hex('${hex(path)}')`;
  let r;
  try {
    r = isWindows() && !machine
      ? await exec("nvim", ["--server", `\\\\.\\pipe\\nvim-jay-${pid}`, "--remote-expr", expr], { timeout: 10000 })
      : await exec("/bin/sh", ["-c", NVIM_CLIENT, "sh", String(pid), expr], { timeout: 10000, on: machine });
  } catch { return false; }
  if (r.code !== 0 || String(r.stdout).trim() !== "ok") return false;
  run("pane.focus", { pane: pane.pane });
  return true;
}
// the editor's argv on that machine: its program found on the login PATH (a new pane gets a bare one)
const RESOLVE = `[ $# -gt 0 ] || set -- \${VISUAL:-\${EDITOR:-vi}}
p=$(command -v "$1") || { echo "找不到編輯器 $1" >&2; exit 127; }
shift; printf '%s\\n' "$p" "$@"`;
async function editorArgv(cfg, machine) {
  if (isWindows() && !machine) return cfg.editor ?? ["nvim"];
  const r = await exec("/bin/sh", ["-c", RESOLVE, "sh", ...(cfg.editor ?? [])], { timeout: 15000, on: machine });
  if (r.code !== 0) throw new Error(clean(r.stderr) || "找不到編輯器");
  return String(r.stdout).split("\n").slice(0, -1); // one word a line, the last one ends with a newline too
}
async function openFile(target, path) {
  const cfg = await config();
  const { machine } = target;
  if (cfg.nvimJay) {
    const byAddr = new Map(terminals().map((t) => [t.address, t]));
    const nv = panes().find((p) => p.tab === target.tab && p.terminal && isNvimJay(byAddr.get(p.terminal)));
    if (nv) {
      if (await toNvimJay(nv, path, machine)) return;
      notify({ title: "nvim-jay 沒接到", body: "這格 nvim-jay 可能是更新前開的：關掉重開一格。這次先用編輯器開。", level: "warning" });
    }
  }
  const argv = await editorArgv(cfg, machine);
  if (cfg.gui) {
    const r = await exec(argv[0], [...argv.slice(1), path], { timeout: 30000, on: machine });
    if (r.code !== 0) throw new Error(clean(r.stderr) || `${argv[0]} 結束碼 ${r.code}`);
    return;
  }
  // terminal.open opens right of the focused pane, on its machine: the agent's
  run("pane.focus", { terminal: target.address });
  run("terminal.open", { argv: [...argv, path], folder: target.dir ?? undefined, place: "right", name: "editor" });
}

export default class AgentFiles extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = 0;
    this.scroll = 0;
    this.input = InputState.new({ placeholder: "篩選檔名…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.pick(this.rows()[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
    this.list = tabAgents();
    this.which = 0;
    this.load(cx);
  }

  close() { const o = props()?.overlay; if (o) closeOverlay(o); }

  target() {
    const a = this.list[this.which];
    if (!a) return null;
    const p = panes().find((x) => x.pane === a.pane || x.terminal === a.address);
    return { address: a.address, pane: a.pane, tab: a.tab, machine: machineOf(a.space), dir: p?.cwd ?? null,
      tool: TOOL_OF[a.app] ?? null, name: a.program?.name ?? a.app ?? "agent" };
  }

  load(cx) {
    const t = this.target();
    this.data = null;
    this.error = t ? null : "這個分頁沒有 agent。";
    if (!t) return;
    this.loading = true;
    const want = this.which;
    cx.spawn(async (cx) => {
      let data = null, error = null;
      try {
        const pid = await fgPid(t.address);
        if (!pid) error = "找不到這個 agent 的程式（它可能已經關掉了）。";
        else {
          const args = ["files", "--pid", String(pid)];
          if (t.tool) args.push("--tool", t.tool);
          if (t.dir) args.push("--dir", t.dir);
          args.push("--git", "--json");
          const r = await kit(args, 30000, t.machine);
          let j = null;
          try { j = r.code === 0 ? JSON.parse(r.out.trim()) : null; } catch {}
          if (j && Array.isArray(j.files)) data = j;
          else if (r.missing || !j) {
            // no kit there, or one without kit files: nvim-jay's own list (Claude Code only), when the tab has one
            error = await kitTrouble(r, t.machine);
            if (want === this.which && this.nvimJayList(t, error)) return;
          } else error = await kitTrouble(r, t.machine);
        }
      } catch (e) { error = String(e?.message ?? e); }
      if (want !== this.which) return; // Tab moved on meanwhile
      this.loading = false;
      this.data = data;
      this.error = error;
      this.at = 0;
      cx.notify();
    });
  }

  // focus the tab's nvim-jay pane and press the key nvim-jay maps to its own list (alt+o: <M-o> in every mode)
  nvimJayList(t, why) {
    const byAddr = new Map(terminals().map((x) => [x.address, x]));
    const nv = panes().find((p) => p.tab === t.tab && p.terminal && isNvimJay(byAddr.get(p.terminal)));
    if (!nv) return false;
    this.close();
    run("pane.focus", { pane: nv.pane });
    hc(["keys", nv.terminal, "alt+o"]).catch(() => {});
    notify({ title: "改用 nvim-jay 的清單", body: why, level: "info" });
    return true;
  }

  rows() {
    const f = this.filter.toLowerCase();
    return (this.data?.files ?? []).filter((x) => !f || x.path.toLowerCase().includes(f));
  }

  shown(p) {
    const dir = slash(this.data?.dir ?? "").replace(/\/$/, "");
    const s = slash(p);
    if (dir && s.toLowerCase().startsWith(dir.toLowerCase() + "/")) return s.slice(dir.length + 1);
    return s;
  }

  pick(it, _cx) {
    if (!it) return;
    const t = this.target();
    this.close();
    if (!t) return;
    openFile(t, it.path).catch((e) => notify({ title: "開不起來", body: String(e?.message ?? e), level: "error" }));
  }

  render() {
    const t = theme();
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const tg = this.target();
    const ROW = 30, height = Math.min(420, this.listHeight ?? 420);
    const total = rows.length * ROW, maxScroll = Math.max(0, total - height);
    if (this.at * ROW < this.scroll) this.scroll = this.at * ROW;
    if ((this.at + 1) * ROW > this.scroll + height) this.scroll = (this.at + 1) * ROW - height;
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const first = Math.floor(this.scroll / ROW), last = Math.min(rows.length, Math.ceil((this.scroll + height) / ROW) + 1);
    const tagColor = { read: t.dim, edit: t.working, write: t.done, git: t.muted };

    const row = (it, i) => h_flex()
      .id(`af-${i}`)
      .absolute().left(0).right(0).top(i * ROW - this.scroll).h(ROW)
      .mx(4).px(10).gap(10).items_center().rounded(7).cursor_pointer()
      .when(i === this.at, (el) => el.bg(t.hover))
      .hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => this.pick(it, cx))
      .child(div().w(28).flex_none().text_size(11).font_semibold().text_color(tagColor[it.tag] ?? t.dim).child(TAGS[it.tag] ?? it.tag))
      .child(div().flex_1().truncate().text_color(it.exists === false ? t.dim : t.foreground).child(this.shown(it.path) + (it.exists === false ? "（已不在）" : "")));

    const who = tg ? `${tg.name} · ${tg.address}${this.list.length > 1 ? `（Tab 換下一個，共 ${this.list.length} 個）` : ""}` : "";
    const body = this.error
      ? div().p(10).text_color(t.blocked).child(this.error)
      : this.loading ? div().p(10).text_color(t.dim).child("讀取中…")
      : !rows.length ? div().p(10).text_color(t.dim).child(this.filter ? "沒有符合的檔" : (this.data?.note || "agent 還沒讀過或改過檔案，git 也沒有改動"))
      : v_flex()
        .id("af-list")
        .on_size_change((size, cx) => { this.listHeight = size.height / settings().zoom; cx.notify(); })
        .h(Math.min(420, total)).min_h(0).overflow_hidden()
        .on_scroll_wheel((e, cx) => {
          this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
          this.at = Math.max(Math.ceil(this.scroll / ROW), Math.min(this.at, Math.floor((this.scroll + height) / ROW) - 1));
          cx.notify();
        })
        .children(rows.slice(first, last).map((it, k) => row(it, first + k)));

    return v_flex()
      .id("agent-files")
      .track_focus(this.handle)
      .w_full().min_h(0).p(18).gap(10).bg(t.popover).text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down" && rows.length) this.at = (this.at + 1) % rows.length;
        else if (k === "up" && rows.length) this.at = (this.at + rows.length - 1) % rows.length;
        else if (k === "tab" && this.list.length > 1) { this.which = (this.which + 1) % this.list.length; this.load(cx); }
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().items_center().gap(10)
        .child(div().flex_none().text_size(15).font_semibold().text_color(t.foreground).child("agent 讀過／改過的檔"))
        .child(div().flex_1().truncate().text_size(11).text_color(t.dim).child(who))
        .child(div().id("af-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.close()).child("Esc")))
      .child(h_flex().h(36).flex_none().px(10).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)))
      .child(body);
  }
}
