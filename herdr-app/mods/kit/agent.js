// Role "agent" of the kit mod (see main.js): a popup for one agent, opened by the Kit button in its pane header (role
// "header", header.js): what it uses (the set kit run started it with, kit's for the account, its folder's own), what
// kit has that it doesn't use yet, and the buttons that change that (kit add / rm, --dir for its folder; kit
// install-tool / install-deps for what a skill or an MCP needs; an MCP's unset ${VAR}s). All on the agent's machine.
// The header is the one that asks kit (kit list --json --dir --pid); this popup shows that answer (AGENT_DATA) and asks
// the header for a fresh one (AGENT_WANT).
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { theme, shared, setShared, closeOverlay, props } from "herdr";
import { AGENT_CACHE, AGENT_DATA, AGENT_WANT, MSG, fs, mono, stop, shortDir, spin, waiting, icon, textBlock, copyOnRight, btn,
  busyNow, dropStaleBusy, giveBusy, apiState, checkApi, apiCard, messageBox, problemCard, versionCard, localGet, localSet,
  kitAction, squeeze, groupRows } from "./common.js";
import { POPUP_H } from "./header.js";

const LONG = 600000, SHORT = 120000; // how long kit sync and install, and the other actions, may take
const LOAD_TTL = 90000;

export class AgentPopup {
  constructor(role) { this.role = role; }

  init(_p, cx) {
    this.mine = null;    // the id of the action this copy started in kit.busy
    this.asking = null;  // the 安裝 waiting for 確定安裝
    try { this.folded = JSON.parse(localGet("kit.folded") || "{}"); } catch { this.folded = {}; }
    dropStaleBusy();
    this.target = props()?.target ?? { key: "" };
    this.where = `agent:${this.target.key}`;
    const c = (shared(AGENT_CACHE) ?? {})[this.target.key];
    if (!c || Date.now() - (c.started ?? 0) > 10000) this.want();
    this.openedAt = Date.now();
    // 找: one box over the whole list (name, what it is, where it came from)
    this.filter = "";
    this.input = InputState.new({ placeholder: "找：名字、說明、從哪收的" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value().trim().toLowerCase(); cx.notify(); });
    checkApi(this.target.machine ?? null, cx);
    cx.timer.every(2000, (cx) => { if (!this.data) cx.notify(); });   // so a load nobody answers shows up (render)
  }

  async close(_cx) { giveBusy(this.mine); this.mine = null; }

  get data() { return (shared(AGENT_DATA) ?? {})[this.target?.key] ?? null; }
  get busy() { return busyNow(); }
  get loading() { const c = (shared(AGENT_CACHE) ?? {})[this.target?.key]; return Boolean(c?.busy && Date.now() - (c.started ?? 0) < LOAD_TTL); }
  get msg() { return shared(MSG(this.where)) ?? null; }
  // ask its pane header to look again
  want() {
    if (!this.target?.key) return;
    setShared(AGENT_WANT, { ...(shared(AGENT_WANT) ?? {}), [this.target.key]: Date.now() });
  }
  // add / rm / sync / install on the agent's machine: one at a time, kit's words above the list; then every Kit button
  // on that machine looks again
  act(label, args, cx, ttl = SHORT, okText = null) {
    kitAction(this, cx, { label, args, ttl, okText, machine: this.target?.machine ?? null, msg: MSG(this.where) });
  }

  render(_cx) {
    const t = theme(), z = fs(), msg = this.msg;
    // a popup is as tall as its content, and the list (flex_1) has none of its own: give the popup a height
    const root = v_flex().id("kit-agent-root").size_full().h(POPUP_H).rounded(8).bg(t.surface).text_size(z).text_color(t.foreground)
      .child(this.paneHeader(t, z));
    // kit there can't be used (none, too old, newer than this mod, no answer): what to do, in place of everything else
    const machine = this.target?.machine ?? null, api = apiState(machine);
    if (api?.kind && !api.ok) return root.child(apiCard(t, z, api, machine, this.where));
    if (msg) root.child(messageBox(t, z, this.where, msg, () => setShared(MSG(this.where), null), squeeze));
    const d = this.data;
    if (!d && !this.loading && Date.now() - (this.openedAt ?? 0) > 8000)
      return root.child(div().p(14).text_color(t.muted).child("讀不到這個 agent（它可能換了資料夾，或已經關掉）。關掉這個視窗，再按一次它上面的 Kit 按鈕。"));
    if (!d) return root.child(div().p(14).child(waiting(t, z, "讀取中…")));
    if (d.error) return root.child(problemCard(t, z, this.where, d.error, d.code));
    if (d.here?.user) return root.child(v_flex().p(14).gap(6)
      .child(div().font_semibold().child(`這個 agent 用 ${d.here.user} 帳號跑`))
      .child(div().text_size(z - 1).text_color(t.muted).child(d.here.user === "root"
        ? "root 只用簽過的版本（kit approve），這裡看不到也不能改。要換版本：簽一個新的 kit approve，再請它 kit sync。"
        : "這裡只看得到你自己帳號的 kit，看不到也不能改它的。")));
    if (d.kit_version_wanted) root.child(versionCard(t, z, this.where, d));
    return root.child(this.agentList(t, z, d));
  }

  paneHeader(t, z) {
    const d = this.data, busy = this.busy, tg = this.target ?? {};
    const where = [tg.machine ?? "這台電腦", shortDir(d?.here?.dir ?? tg.cwd)].filter(Boolean).join(" · ");
    const pic = icon(tg.program, 18, t.foreground), canSync = d && !d.error && !d.here?.user;
    return h_flex().flex_none().px(10).py(8).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().size(32).flex_none().rounded(16).bg(t.raised).flex().items_center().justify_center().child(pic ?? div().text_color(t.muted).child("•")))
      .child(v_flex().flex_1().min_w(0)
        .child(copyOnRight(div().truncate().font_semibold().child(tg.title || "agent"), tg.title || "agent"))
        .child(h_flex().gap(5).items_center().min_w(0).when(this.loading, (el) => el.child(spin(z - 3, t.muted)))
          .child(copyOnRight(div().truncate().text_size(z - 1.5).text_color(t.muted).child(this.loading ? `${where} · 讀取中…` : where),
            d?.here?.dir ?? tg.cwd ?? where))))
      .when(Boolean(canSync), (el) => el.child(btn(t, z, "sync", busy === "同步" ? "同步中…" : "同步", { small: true, off: Boolean(busy), on: (cx) => this.act("同步", ["sync"], cx, LONG) })))
      .child(btn(t, z, "reload", this.loading ? spin(z - 2, t.dim) : "⟳", { small: true, off: this.loading, on: () => this.want() }))
      .child(btn(t, z, "close", "✕", { small: true, on: () => closeOverlay(props()?.overlay) }));
  }

  agentList(t, z, d) {
    const items = d.items ?? [], here = d.here?.items ?? [], ag = d.here?.agent;
    const machine = this.target?.machine ?? "這台電腦";
    // the folder's own (kit add --dir): the folder the agent runs in, or the one above it that already has some
    const f = d.here?.folder, inDir = new Set(f?.items ?? []);
    this.folder = f ? { dir: f.dir, why: f.why, has: inDir } : null;
    const mine = (i) => inDir.has(`${i.kind}:${i.name}`);
    const f0 = this.filter, hit = (i) => !f0 || [i.name, i.description, i.source, i.from, i.path].some((x) => String(x ?? "").toLowerCase().includes(f0));
    const body = v_flex().id("kit-agent-body").flex_1().min_h(0).overflow_y_scrollbar().px(10).py(8).gap(8);
    body.child(Input.new(this.input).flex_none().h(28).px(8).rounded(6).border_1().border_color(t.border).bg(t.background).text_size(z - 1).text_color(t.foreground));
    const kindName = { rule: "規則", skill: "Skills", mcp: "MCP" };
    // 1. what kit run started it with: only this agent has it, for this run
    if (ag) {
      body.child(div().font_semibold().child(`這次啟動帶的（agent ${ag.name}）`));
      body.child(div().text_size(z - 1.5).text_color(t.muted).child(`用 kit run 開的：只有這個 agent 有，關掉就沒了。要改它，到 Agents 改 ${ag.name}。`));
      for (const [kind, key] of [["rule", "rules"], ["skill", "skills"], ["mcp", "mcp"]]) {
        const names = ag[key] ?? [];
        if (names.length) body.child(h_flex().gap(6).flex_wrap().pl(8).text_size(z - 1)
          .child(div().text_color(t.dim).child(`${kindName[kind]}：`))
          .children(names.map((n) => copyOnRight(div().px(6).rounded(4).bg(t.raised).child(n), n))));
      }
      body.child(div().mt(4).border_t(1).border_color(t.border));
    }
    // 2. what it reads besides: kit's for the whole account (can be taken off) and its folder's / account's own (look only)
    body.child(div().font_semibold().child(ag ? "另外也讀到的" : "這個 agent 在用的"));
    for (const kind of ["rule", "skill", "mcp"]) {
      const kitRows = items.filter((i) => i.kind === kind && (i.status === "used" || i.status === "required" || mine(i)) && hit(i));
      const ownRows = here.filter((i) => i.kind === kind && hit(i));
      const n = kitRows.length + ownRows.length;
      if (f0 && !n) continue;   // searching: only the parts with something found
      const folded = !f0 && (this.folded[`use-${kind}`] ?? n > 8);
      body.child(this.secHead(t, z, `use-${kind}`, `${kindName[kind]}（${n}）`, folded, ""));
      if (folded) continue;
      if (!n) { body.child(div().pl(18).text_size(z - 1.5).text_color(t.dim).child("沒有")); continue; }
      body.child(v_flex().gap(2).children([...kitRows.map((i) => this.row(t, z, i)), ...ownRows.map((i) => this.hereRow(t, z, i))]));
    }
    if (d.here?.error) body.child(div().text_size(z - 1.5).text_color(t.muted).child(textBlock(`here-error-${this.where}`, `${shortDir(d.here.dir)}：${d.here.error}`)));
    // 3. what kit has that the account does not use yet
    //    kit's own first, then what kit collect took, one group per URL it came from (closed until clicked; open while
    //    searching); a URL with one thing is a plain row
    const more = items.filter((i) => i.kind !== "agent" && i.status === "unused" && !mine(i) && hit(i));
    const news = more.filter((i) => i.new).length;
    if (more.length) {
      const folded = !f0 && (this.folded.paneMore ?? false);
      body.child(div().mt(6).border_t(1).border_color(t.border));
      body.child(this.secHead(t, z, "paneMore", `還沒用的（${more.length}）`, folded, news ? `${news} 個新的` : ""));
      if (!folded) {
        const groups = groupRows(more), list = v_flex().gap(2).children(groups[0].rows.map((i) => this.row(t, z, i)));
        for (const g of groups.slice(1)) {
          if (g.rows.length === 1) { list.child(this.row(t, z, g.rows[0], true)); continue; }
          const shut = !f0 && (this.folded[`from-${g.from}`] ?? true);
          list.child(this.secHead(t, z, `from-${g.from}`, `收自 ${g.from}（${g.rows.length}）`, shut, g.rows.some((i) => i.new) ? "有新的" : ""));
          if (!shut) list.child(v_flex().pl(14).gap(2).children(g.rows.map((i) => this.row(t, z, i))));
        }
        body.child(list);
      }
    } else if (f0) body.child(div().text_size(z - 1.5).text_color(t.dim).child("還沒用的裡面找不到符合的。"));
    const where = f ? shortDir(f.dir) : "這個資料夾";
    body.child(v_flex().mt(6).p(8).gap(4).rounded(6).bg(t.raised).text_size(z - 1.5).text_color(t.muted)
      .children(f && !f.why
        ? [`這裡只改 ${where}：加的東西只有在 ${where}（含子資料夾）開的 agent 讀得到，整個帳號和別的資料夾都不受影響。會寫進 ${where} 的 .agentkit、CLAUDE.md、AGENTS.md、.claude/、.agents/ 等檔案。omp 只在這個資料夾本身開時讀得到資料夾的 MCP（子資料夾裡開的讀不到）。`,
           "標「整個帳號」「團隊必備」的是整個帳號的，這裡不能改：要改，請在家目錄（~）開的 agent 改。"]
        : [`這裡改的是整個帳號：${machine} 上你這個帳號的 Claude Code、Codex、omp（有裝的）和每個 agent、每個資料夾都會有或都沒有。`,
           "只想給某個資料夾：請在那個資料夾開的 agent 改。"])
      .child("正在跑的要開新的對話才會讀到。"));
    if (!items.length && !here.length && !ag) body.child(div().text_color(t.muted).child("來源裡還沒有東西。"));
    return body;
  }

  secHead(t, z, id, title, folded, note) {
    return h_flex().id(`sec-${id}`).gap(6).items_center().cursor_pointer().on_mouse_down("left", stop)
      .on_click((_e, cx) => { this.folded[id] = !folded; localSet("kit.folded", JSON.stringify(this.folded)); cx.notify(); })
      .child(div().w(12).text_color(t.muted).child(folded ? "▸" : "▾"))
      .child(div().text_size(z - 0.5).child(title))
      .when(Boolean(note), (el) => el.child(div().px(5).rounded(4).text_size(z - 3).bg(t.done).text_color(t.background).child(note)));
  }

  // something the agent reads that kit doesn't manage: its folder's (CLAUDE.md, .claude/…, .mcp.json) or the account's own
  hereRow(t, z, i) {
    const badge = (text) => div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(t.muted).child(text);
    const head = h_flex().gap(5).items_center().min_w(0)
      .child(copyOnRight(div().min_w(0).truncate().font_semibold().child(shortDir(i.name)), i.name))
      .child(badge(i.scope === "user" ? "這個帳號（不是 kit 的）" : "這個資料夾"));
    if (i.tools && i.tools !== "claude") head.child(badge(i.tools === "codex omp" ? "Codex／omp" : i.tools));
    const sub = i.description || shortDir(i.path);
    return v_flex().id(`here-${i.scope}-${i.kind}-${i.path}-${i.name}`).px(8).py(4).gap(1).rounded(6).hover((s) => s.bg(t.hover))
      .child(head)
      .when(Boolean(sub), (el) => el.child(copyOnRight(div().min_w(0).truncate().text_size(z - 1.5).text_color(t.muted).child(sub), i.description || i.path)));
  }

  // one of kit's things: for this folder (加到這個資料夾 / 從資料夾拿掉) and for the account (加到整個帳號 / 從帳號拿掉;
  // required ones cannot be taken off)
  row(t, z, i, from = false) {
    const busy = Boolean(this.busy), f = this.folder, inDir = Boolean(f?.has.has(`${i.kind}:${i.name}`));
    const canDir = Boolean(f && !f.why);
    const badge = (text, color) => div().flex_none().px(5).rounded(4).text_size(z - 2.5).text_color(t.background).bg(color).child(text);
    const head = h_flex().gap(5).items_center().min_w(0)
      .child(copyOnRight(div().min_w(0).truncate().font_semibold().text_color(i.status === "unused" && !inDir ? t.muted : t.foreground).child(i.name), i.name));
    if (i.status === "required") head.child(badge("Kit · 團隊必備", t.accent));
    if (i.status === "used") head.child(badge("Kit · 整個帳號", t.working));
    if (inDir) head.child(badge("Kit · 這個資料夾", t.done));
    if (i.new) head.child(badge("新", t.done));
    const dirArgs = (verb) => [verb, "--dir", f.dir, i.kind, i.name];
    const fd = f ? shortDir(f.dir) : "";
    const action = h_flex().flex_none().gap(4).items_center();
    // An agent started in a folder only changes that folder; the account is changed only from one started in the home
    // folder (there the folder buttons make no sense: the home folder is the account). No button that reaches further
    // than the folder the agent runs in.
    if (canDir) {
      if (inDir) action.child(btn(t, z, `rmdir-${i.kind}-${i.name}`, "從資料夾拿掉", { small: true, off: busy, on: (cx) => this.act(`從資料夾拿掉 ${i.name}`, dirArgs("rm"), cx, SHORT, `已從 ${fd} 拿掉 ${i.name}。在 ${fd} 開新的對話就不會有了。`) }));
      else if (i.status === "unused") action.child(btn(t, z, `adddir-${i.kind}-${i.name}`, "加到這個資料夾", { small: true, kind: "primary", off: busy, on: (cx) => this.act(`加到這個資料夾 ${i.name}`, dirArgs("add"), cx, SHORT, `已加到 ${fd}：${i.name}。在 ${fd}（含子資料夾）開新的對話才會讀到，別的地方不受影響。`) }));
    } else if (i.status === "required") action.child(div().text_size(z - 1.5).text_color(t.dim).child("拿不掉"));
    else if (i.status === "used") action.child(btn(t, z, `rm-${i.kind}-${i.name}`, "從帳號拿掉", { small: true, off: busy, on: (cx) => this.act(`從帳號拿掉 ${i.name}`, ["rm", i.kind, i.name], cx, SHORT, `已從整個帳號拿掉 ${i.name}。開新的對話就不會有了。`) }));
    else if (!inDir) action.child(btn(t, z, `add-${i.kind}-${i.name}`, "加到整個帳號", { small: true, kind: "primary", off: busy, on: (cx) => this.act(`加到整個帳號 ${i.name}`, ["add", i.kind, i.name], cx, SHORT, `已加到整個帳號：${i.name}。每個資料夾開新的對話都會讀到。`) }));
    const sub = [from && i.from ? `收自 ${i.from}` : "", i.description, i.source].filter(Boolean).join(" · ");
    const row = h_flex().gap(8).items_center()
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(head)
        .when(Boolean(sub), (el) => el.child(copyOnRight(div().min_w(0).truncate().text_size(z - 1.5).text_color(t.muted).child(sub), i.description || i.source || sub))))
      .child(action);
    // what is missing for it to run: programs (node, python ...), then its own npm packages
    const missing = (i.needs ?? []).filter((x) => !x.ok).map((x) => ({
      key: `${i.name}-${x.tool}`, install: x.install, label: x.have ? "升級" : "安裝", title: x.title,
      what: `需要 ${x.title}${x.min ? ` ${x.min} 以上` : ""}（${x.have ? `這台是 ${x.have}，太舊` : "這台沒有"}）`,
      none: "請自己裝：這台沒有 kit 可以用的安裝方式",
      args: ["install-tool", x.tool, ...(x.min ? ["--min", x.min] : [])],
    }));
    for (const pk of (i.packages ?? []).filter((x) => !x.ok)) {
      const py = pk.kind === "pip", lang = py ? "Python" : "npm";
      // an MCP's one pinned package (kit list --json, api 1.3): not installed = downloaded each time it starts
      if (i.kind === "mcp") {
        const what = `${pk.package}${pk.version ? `@${pk.version}` : ""}`;
        missing.push({
          key: `${i.name}-mcp`, install: pk.bad ? "" : pk.install, label: "裝套件", title: `MCP ${i.name} 的套件`,
          what: pk.had ? `套件 ${what} 要重裝（版本改過了）：現在每次啟動時下載` : `每次啟動時下載 ${what}`,
          note: "裝在 kit 自己的資料夾，固定這個版本，不跑套件自己的安裝程式；裝好後 kit sync 改成直接跑裝好的",
          none: pk.bad ? `kit 不幫它裝：${pk.bad}` : (py ? "要先有 Python 才能裝" : "要先有 Node.js（npm）才能裝"),
          args: ["install-deps", "mcp", i.name],
        });
        continue;
      }
      missing.push({
        key: `${i.name}-${pk.kind}`, install: pk.bad ? "" : pk.install, label: pk.had ? "更新" : "安裝", title: `${i.name} 的 ${lang} 套件`,
        what: pk.had ? `它的 ${lang} 套件要更新（skill 改過了）` : `需要先裝它自己的 ${lang} 套件`,
        note: py ? "裝在 kit 自己的 venv，只裝現成的 wheel，不跑套件自己的安裝程式" : "裝在 kit 自己的資料夾，只裝 npm registry 上的版本，不跑套件自己的安裝程式",
        none: !pk.bad ? (py ? "要先有 Python 才能裝" : "要先有 Node.js（npm）才能裝")
          : py ? `kit 不裝：requirements.txt 第 ${pk.bad}（只能寫套件名和版本）`
          : `kit 不裝：${pk.bad}（只能裝 npm registry 上的版本，不能是 git、網址、檔案或連結）`,
        args: ["install-deps", i.name, pk.kind],
      });
    }
    // an MCP's ${VAR}s that this machine has not set (names only; the values are never read here)
    const unset = (i.vars ?? []).filter((v) => v && v.set === false && typeof v.name === "string").map((v) => v.name);
    return v_flex().id(`row-${i.kind}-${i.name}`).gap(4).px(8).py(5).rounded(6).hover((s) => s.bg(t.hover))
      .child(row)
      .when(unset.length > 0, (el) => el.child(div().pl(2).text_size(z - 1.5).text_color(t.working)
        .child(`⚠ 這台沒設環境變數：${unset.join("、")}（設好再開新的對話；值不會進倉）`)))
      .children(missing.map((x) => this.needLine(t, z, x)));
  }

  // something a skill needs that this machine lacks (a program, or too old; its own packages): 安裝 shows kit's
  // command first, 確定安裝 runs it
  needLine(t, z, x) {
    const busy = Boolean(this.busy), asking = this.asking === x.key;
    const line = h_flex().gap(6).items_center().flex_wrap().pl(2).text_size(z - 1.5)
      .child(div().text_color(t.working).child(`⚠ ${x.what}`));
    if (!x.install) return line.child(div().text_color(t.muted).child(x.none));
    if (!asking) return line.child(btn(t, z, `need-${x.key}`, x.label, { small: true, off: busy, on: (cx) => { this.asking = x.key; cx.notify(); } }));
    return v_flex().gap(4).pl(2).text_size(z - 1.5)
      .child(div().text_color(t.working).child(`⚠ ${x.what}`))
      .child(h_flex().gap(6).items_center().flex_wrap()
        .child(div().text_color(t.muted).child("會執行："))
        .child(copyOnRight(div().px(5).rounded(4).bg(t.raised).font_family(mono()).child(x.install), x.install)))
      .when(Boolean(x.note), (el) => el.child(div().text_color(t.muted).child(x.note)))
      .child(h_flex().gap(6)
        .child(btn(t, z, `need-go-${x.key}`, "確定安裝", { small: true, kind: "primary", off: busy, on: (cx) => { this.asking = null; this.act(`安裝 ${x.title}`, x.args, cx, LONG); } }))
        .child(btn(t, z, `need-no-${x.key}`, "取消", { small: true, off: busy, on: (cx) => { this.asking = null; cx.notify(); } })));
  }
}
