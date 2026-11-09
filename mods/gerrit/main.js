// Gerrit beside your agents: a dashboard like Gerrit's own (輪到你 / 我送出的 / 等我 review / CC / 最近合併),
// a change's details on click, and a notification when a change turns to you or someone replies.
// Reads Gerrit's REST API with fetch. Settings (address, user, HTTP password) live in
// <home>/.config/herdr-app/gerrit.json, outside this folder, so updating the mod never touches them.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, settings, notify, home, readTextFile } from "herdr";

const CONFIG = () => `${home().replace(/\\/g, "/")}/.config/herdr-app/gerrit.json`;
const CONFIG_EXAMPLE = `{
  "url": "https://gerrit.example.com",
  "user": "your-gerrit-username",
  "http_password": "from Gerrit: Settings → HTTP Credentials → Generate",
  "poll_seconds": 60
}`;
// Gerrit's own dashboard ("Your Turn", "Work in progress", "Outgoing reviews", "Incoming reviews", "CCed on",
// "Recently submitted"). A config "sections": [{ "title", "query" }] replaces them.
const DEFAULT_SECTIONS = [
  { title: "輪到你", query: "attention:self is:open", turn: true },
  { title: "草稿（WIP）", query: "is:open owner:self is:wip" },
  { title: "我送出的", query: "is:open owner:self -is:wip -is:ignored" },
  { title: "等我 review", query: "is:open -owner:self -is:wip -is:ignored reviewer:self" },
  { title: "CC 我的", query: "is:open -is:ignored -is:wip cc:self" },
  { title: "最近合併／放棄", query: "is:closed -is:ignored (owner:self OR reviewer:self) -age:4w", closed: true },
];
const OPTS = "o=LABELS&o=DETAILED_ACCOUNTS&o=SUBMITTABLE";
const LIMIT = 25;

const fs = () => Number(settings().ui_font_size) || 13;
const mono = () => settings().font_family || "Menlo";
const stop = (_e, cx) => cx.stop_propagation();

// Gerrit time: "2026-11-09 11:37:51.000000000", UTC.
const when = (s) => Date.parse(String(s ?? "").replace(" ", "T").replace(/\.\d+$/, "") + "Z");
const ago = (s) => {
  const m = Math.max(0, Math.floor((Date.now() - when(s)) / 60000));
  return m < 1 ? "剛剛" : m < 60 ? `${m} 分前` : m < 1440 ? `${Math.floor(m / 60)} 小時前` : `${Math.floor(m / 1440)} 天前`;
};
const who = (a) => a?.display_name || a?.name || a?.username || (a?._account_id ? `#${a._account_id}` : "?");
// Gerrit's size column: XS < 10 lines, S < 50, M < 250, L < 1000, XL.
const size = (c) => {
  const n = (c.insertions ?? 0) + (c.deletions ?? 0);
  return n < 10 ? "XS" : n < 50 ? "S" : n < 250 ? "M" : n < 1000 ? "L" : "XL";
};
// "Code-Review" -> "CR", "Verified" -> "V"
const abbr = (name) => (name.match(/[A-Z]/g) ?? [name[0]]).join("");

function b64(text) {
  const bytes = [];
  for (const ch of unescape(encodeURIComponent(text))) bytes.push(ch.charCodeAt(0));
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += A[(n >> 18) & 63] + A[(n >> 12) & 63] + (i + 1 < bytes.length ? A[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? A[n & 63] : "=");
  }
  return out;
}

// One label as Gerrit shows it: ✓ approved, ✗ rejected, +1 / -1, or nothing.
function vote(t, l) {
  if (!l) return null;
  if (l.rejected) return { text: "✗", color: t.ansi1, strong: true };
  if (l.approved) return { text: "✓", color: t.ansi2, strong: true };
  if (l.disliked) return { text: String(l.value ?? -1), color: t.ansi1 };
  if (l.recommended) return { text: `+${l.value ?? 1}`, color: t.ansi2 };
  return null;
}
function voteValue(t, v) {
  const n = Number(v) || 0;
  return { text: n > 0 ? `+${n}` : String(n), color: n > 0 ? t.ansi2 : t.ansi1 };
}

export default class Gerrit extends View {
  init(_p, cx) {
    this.collapsed = new Set(JSON.parse(this.load("collapsed") ?? '["最近合併／放棄"]'));
    this.seen = JSON.parse(this.load("seen") ?? "null"); // change id -> updated; null until the first poll
    this.nextAt = 0;
    cx.timer.every(1000, (cx) => { if (Date.now() >= this.nextAt) this.poll(cx); });
    cx.timer.every(30000, (cx) => cx.notify()); // keep "幾分前" fresh
  }

  load(k) { try { return localStorage.getItem(`gerrit.${k}`); } catch { return null; } }
  save(k, v) { try { localStorage.setItem(`gerrit.${k}`, v); } catch {} }

  async readConfig() {
    const text = await readTextFile(CONFIG()).catch(() => null);
    if (text == null) return { missing: true };
    try {
      const c = JSON.parse(text);
      if (!c.url) return { error: "gerrit.json 沒有 url" };
      c.url = String(c.url).replace(/\/+$/, "");
      c.auth = Boolean(c.user && c.http_password);
      return c;
    } catch (e) { return { error: `gerrit.json 格式不對：${e.message ?? e}` }; }
  }

  // GET a REST path; with a user it goes through /a/ (authenticated). Strips Gerrit's )]}' prefix.
  async get(path) {
    const c = this.cfg;
    const headers = { Accept: "application/json" };
    if (c.auth) headers.Authorization = `Basic ${b64(`${c.user}:${c.http_password}`)}`;
    const r = await fetch(`${c.url}${c.auth ? "/a" : ""}${path}`, { headers });
    const body = await r.text();
    if (!r.ok) {
      const why = r.status === 401 ? "帳號或 HTTP 密碼不對（401）" : r.status === 403 ? "沒有權限（403）" : `HTTP ${r.status}`;
      throw new Error(`${why}${body && r.status !== 401 ? `：${body.trim().split("\n")[0].slice(0, 120)}` : ""}`);
    }
    return JSON.parse(body.replace(/^\)\]\}'\n?/, ""));
  }

  sectionsFor(c) {
    const own = Array.isArray(c.sections) && c.sections.length ? c.sections : null;
    // Without a login "self" means nobody: show what the config asks for, or an open-changes list.
    return own ?? (c.auth ? DEFAULT_SECTIONS : [{ title: "公開的 change（沒有登入）", query: "is:open" }]);
  }

  async poll(cx) {
    if (this.busy) return;
    this.busy = true;
    try {
      this.cfg = await this.readConfig();
      if (this.cfg.missing || this.cfg.error) { this.nextAt = Date.now() + 10000; return; }
      if (this.cfg.auth && !this.self) this.self = await this.get("/accounts/self").catch(() => null);
      const secs = this.sectionsFor(this.cfg);
      const q = secs.map((s) => `q=${encodeURIComponent(`${s.query} limit:${s.limit ?? LIMIT}`)}`).join("&");
      let lists;
      try {
        lists = await this.get(`/changes/?${q}&${OPTS}`);
        if (secs.length === 1) lists = [lists];
      } catch (e) {
        // One query this Gerrit doesn't know (attention: needs 3.3+) fails them all: ask one by one.
        lists = [];
        for (const s of secs) lists.push(await this.get(`/changes/?q=${encodeURIComponent(`${s.query} limit:${s.limit ?? LIMIT}`)}&${OPTS}`).catch((e2) => ({ error: String(e2.message ?? e2) })));
        if (lists.every((l) => l.error)) throw e;
      }
      this.sections = secs.map((s, i) => ({ ...s, items: Array.isArray(lists[i]) ? lists[i] : [], error: lists[i]?.error ?? null }));
      this.err = null;
      this.at = Date.now();
      await this.tell();
    } catch (e) {
      this.err = String(e.message ?? e);
    } finally {
      this.busy = false;
      this.nextAt = Date.now() + Math.max(15, Number(this.cfg?.poll_seconds) || 60) * 1000;
      cx.notify();
    }
  }

  // Notify like Gerrit's mail: a change turned to you, or someone else replied / voted. Nothing on the first poll.
  async tell() {
    const now = {};
    const turn = new Set();
    for (const s of this.sections) for (const c of s.items) {
      now[c.id] = c.updated;
      if (s.turn) turn.add(c.id);
    }
    const before = this.seen;
    const turnBefore = new Set(JSON.parse(this.load("turn") ?? "[]"));
    this.seen = now;
    this.save("seen", JSON.stringify(now));
    this.save("turn", JSON.stringify([...turn]));
    if (!before || !this.self) return; // without a login there is no "you": nothing to tell
    let sent = 0;
    const all = new Map(this.sections.flatMap((s) => s.items.map((c) => [c.id, c])));
    for (const [id, c] of all) {
      if (sent >= 3) break;
      const newTurn = turn.has(id) && !turnBefore.has(id);
      if (!newTurn && (!before[id] || before[id] === c.updated)) continue;
      let line = "";
      try {
        const msgs = await this.get(`/changes/${encodeURIComponent(id)}/messages`);
        const last = msgs[msgs.length - 1];
        if (!newTurn && last && this.self && last.author?._account_id === this.self._account_id) continue; // my own reply
        if (last) line = `${who(last.author)}：${String(last.message ?? "").split("\n").filter(Boolean).slice(0, 2).join(" ")}`;
      } catch {}
      const reason = newTurn ? (c.attention_set?.[this.self?._account_id]?.reason ?? "").replace(/<GERRIT_ACCOUNT_\d+>/g, "有人") : "";
      notify({ title: `${newTurn ? "輪到你" : "Gerrit 有新動態"}：#${c._number} ${c.subject}`, body: line || reason || c.project, level: newTurn ? "warning" : "info", timeout: 10000 });
      sent++;
    }
  }

  async openChange(c, cx) {
    this.openId = c.id;
    this.detail = { change: c, loading: true };
    cx.notify();
    try {
      const id = encodeURIComponent(c.id);
      const [d, comments] = await Promise.all([
        this.get(`/changes/${id}/detail?o=ALL_REVISIONS&o=CURRENT_FILES&o=CURRENT_COMMIT&o=DETAILED_LABELS&o=MESSAGES&o=SUBMITTABLE`),
        this.get(`/changes/${id}/comments`).catch(() => ({})),
      ]);
      if (this.openId === c.id) this.detail = { change: d, comments };
    } catch (e) {
      if (this.openId === c.id) this.detail = { change: c, error: String(e.message ?? e) };
    }
    cx.notify();
  }

  webUrl(c) { return `${this.cfg.url}/c/${c.project}/+/${c._number}`; }

  render(cx) {
    const t = theme(), z = fs();
    const root = v_flex().id("gerrit").size_full().bg(t.surface).text_size(z).text_color(t.foreground);
    if (!this.cfg) return root.child(div().p(14).text_color(t.muted).child("讀取 Gerrit 設定…"));
    if (this.cfg.missing || this.cfg.error) return root.child(this.setup(t, z));
    if (this.openId && this.detail) return root.child(this.header(t, z, true)).child(this.renderDetail(t, z, cx));
    return root.child(this.header(t, z, false)).child(this.renderList(t, z));
  }

  setup(t, z) {
    return v_flex().p(14).gap(8).overflow_y_scrollbar()
      .child(div().font_semibold().child("Gerrit 還沒設定"))
      .child(div().text_color(this.cfg.error ? t.ansi1 : t.muted).child(this.cfg.error ?? `建立這個檔（用文字編輯器），存檔後 10 秒內會自己讀到：`))
      .child(div().font_family(mono()).text_size(z - 1).child(CONFIG()))
      .child(div().font_family(mono()).text_size(z - 1.5).p(8).rounded(6).bg(t.raised).child(CONFIG_EXAMPLE))
      .child(div().text_size(z - 1).text_color(t.muted).child("HTTP 密碼不是登入密碼：在 Gerrit 網頁右上角 → Settings → HTTP Credentials 產生。這個檔只在你的電腦上，不會進 repo。"));
  }

  header(t, z, back) {
    const btn = (id, label, fn) => div().id(id).px(8).py(2).rounded(4).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover))
      .on_mouse_down("left", stop).on_click(fn).child(label);
    const status = this.err ? `讀不到：${this.err}` : this.busy && !this.at ? "讀取中…" : this.at ? `更新於 ${ago(new Date(this.at).toISOString().replace("T", " ").replace("Z", ""))}` : "";
    return v_flex().flex_none().border_b(1).border_color(t.border)
      .child(h_flex().px(10).py(6).gap(6).items_center()
        .when(back, (el) => el.child(btn("back", "← 返回", (_e, cx) => { this.openId = null; this.detail = null; cx.notify(); })))
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(back ? `#${this.detail.change._number}` : "Gerrit"))
        .when(back, (el) => el.child(btn("web", "在瀏覽器開", (_e, cx) => cx.open_url(this.webUrl(this.detail.change)))))
        .when(!back, (el) => el.child(btn("refresh", this.busy ? "更新中…" : "重新整理", (_e, cx) => { this.nextAt = 0; cx.notify(); }))))
      .when(!back && Boolean(status), (el) => el.child(div().px(12).pb(5).text_size(z - 1.5).truncate().text_color(this.err ? t.ansi1 : t.muted).child(status)));
  }

  renderList(t, z) {
    const list = v_flex().id("list").flex_1().min_h(0).overflow_y_scrollbar();
    for (const s of this.sections ?? []) {
      const open = !this.collapsed.has(s.title);
      list.child(h_flex().id(`sec-${s.title}`).px(10).py(6).gap(6).items_center().bg(t.chrome).border_b(1).border_color(t.border)
        .cursor_pointer().hover((st) => st.bg(t.hover))
        .on_click((_e, cx) => {
          if (open) this.collapsed.add(s.title); else this.collapsed.delete(s.title);
          this.save("collapsed", JSON.stringify([...this.collapsed]));
          cx.notify();
        })
        .child(div().w(10).text_color(t.muted).child(open ? "▾" : "▸"))
        .child(div().flex_1().font_semibold().text_size(z - 0.5).text_color(s.turn && s.items.length ? t.blocked : t.foreground).child(s.title))
        .child(div().text_color(t.muted).text_size(z - 1).child(s.error ? "讀不到" : String(s.items.length))));
      if (!open) continue;
      if (s.error) { list.child(div().px(14).py(6).text_size(z - 1).text_color(t.muted).child(s.error.includes("attention") ? "這個 Gerrit 太舊，沒有「輪到你」（要 3.3 以上）" : s.error)); continue; }
      if (!s.items.length) { list.child(div().px(14).py(6).text_size(z - 1).text_color(t.dim).child("沒有")); continue; }
      for (const c of s.items) list.child(this.row(t, z, c, s));
    }
    return list;
  }

  chips(t, z, c) {
    const out = [];
    if (c.work_in_progress) out.push({ text: "WIP", color: t.muted });
    if (c.is_private) out.push({ text: "私人", color: t.muted });
    if (c.status === "MERGED") out.push({ text: "已合併", color: t.ansi5 });
    else if (c.status === "ABANDONED") out.push({ text: "已放棄", color: t.muted });
    else if (c.mergeable === false) out.push({ text: "合併衝突", color: t.ansi1 });
    else if (c.submittable) out.push({ text: "可以送出", color: t.ansi2 });
    return out.map((x, i) => div().id(`chip-${c._number}-${i}`).flex_none().px(5).rounded(4).text_size(z - 2).bg(t.raised).text_color(x.color).child(x.text));
  }

  row(t, z, c, s) {
    const labels = Object.entries(c.labels ?? {}).map(([name, l]) => [name, vote(t, l)]).filter(([, v]) => v);
    const unresolved = c.unresolved_comment_count ?? 0;
    return v_flex().id(`c-${s.title}-${c._number}`).px(12).py(6).gap(2).border_b(1).border_color(t.border)
      .cursor_pointer().hover((st) => st.bg(t.hover))
      .on_click((_e, cx) => { cx.spawn(async (cx) => this.openChange(c, cx)); })
      .child(h_flex().gap(6).items_center()
        .child(div().flex_none().font_family(mono()).text_size(z - 1).text_color(t.muted).child(String(c._number)))
        .child(div().flex_1().min_w(0).truncate().child(c.subject))
        .children(this.chips(t, z, c)))
      .child(h_flex().gap(8).items_center().text_size(z - 1.5).text_color(t.muted)
        .child(div().flex_1().min_w(0).truncate().child(`${c.project} · ${c.branch} · ${who(c.owner)}`))
        .when(unresolved > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(`留言 ${unresolved}`)))
        .child(h_flex().flex_none().gap(5).font_family(mono()).children(labels.map(([name, v]) =>
          h_flex().id(`l-${c._number}-${name}`).gap(1).child(div().text_color(t.dim).child(abbr(name))).child(div().text_color(v.color).when(Boolean(v.strong), (el) => el.font_semibold()).child(v.text)))))
        .child(div().flex_none().w(18).text_color(t.dim).child(size(c)))
        .child(div().flex_none().child(ago(c.updated))));
  }

  renderDetail(t, z, cx) {
    const { change: c, comments, loading, error } = this.detail;
    const body = v_flex().id("detail").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(10).gap(10);
    body.child(v_flex().gap(4)
      .child(div().font_semibold().text_size(z + 1).whitespace_normal().child(c.subject))
      .child(h_flex().gap(6).flex_wrap().items_center().children(this.chips(t, z, c))
        .child(div().text_size(z - 1).text_color(t.muted).child(`${c.project} · ${c.branch} · ${who(c.owner)} · 更新 ${ago(c.updated)}`))));
    if (loading) return body.child(div().text_color(t.muted).child("讀取中…"));
    if (error) return body.child(div().text_color(t.ansi1).child(`讀不到：${error}`));
    const title = (text) => div().pt(4).text_size(z - 1).font_semibold().text_color(t.muted).child(text);

    // Attention set: whose turn it is
    const att = Object.values(c.attention_set ?? {});
    if (att.length) body.child(h_flex().gap(6).flex_wrap().text_size(z - 1)
      .child(div().text_color(t.muted).child("輪到："))
      .children(att.map((a, i) => div().id(`att-${i}`).px(6).rounded(4).bg(t.raised).text_color(a.account?._account_id === this.self?._account_id ? t.blocked : t.foreground).child(who(a.account)))));

    // Labels and who voted
    // Like Gerrit's submit requirements: labels someone voted on, or ones the change needs; optional unvoted ones stay out.
    const labels = Object.entries(c.labels ?? {}).filter(([, l]) => !l.optional || (l.all ?? []).some((v) => Number(v.value)));
    if (labels.length) {
      body.child(title("分數"));
      for (const [name, l] of labels) {
        const votes = (l.all ?? []).filter((v) => Number(v.value));
        body.child(h_flex().id(`lab-${name}`).gap(8).items_start().text_size(z - 1)
          .child(div().w(96).flex_none().truncate().child(name))
          .child(h_flex().flex_1().gap(6).flex_wrap().children(votes.length ? votes.map((v, i) => {
            const x = voteValue(t, v.value);
            return h_flex().id(`v-${name}-${i}`).gap(3).child(div().text_color(x.color).font_semibold().child(x.text)).child(div().child(who(v)));
          }) : [div().text_color(t.dim).child(l.optional ? "（選填）" : "還沒有人給")])));
      }
    }

    const revs = Object.entries(c.revisions ?? {}).map(([sha, r]) => ({ sha, ...r })).sort((a, b) => b._number - a._number);
    const cur = revs.find((r) => r.sha === c.current_revision) ?? revs[0];

    // Comment threads (replies follow in_reply_to), unresolved first, like Gerrit's Comments tab
    const byId = new Map();
    for (const [path, list] of Object.entries(comments ?? {})) for (const m of list) byId.set(m.id, { path, ...m });
    const rootOf = (m) => { let r = m, n = 0; while (r.in_reply_to && byId.has(r.in_reply_to) && n++ < 50) r = byId.get(r.in_reply_to); return r; };
    const threads = new Map();
    for (const m of byId.values()) { const r = rootOf(m); if (!threads.has(r.id)) threads.set(r.id, []); threads.get(r.id).push(m); }
    const list = [...threads.values()].map((ms) => {
      ms.sort((a, b) => when(a.updated) - when(b.updated));
      return { root: ms[0], msgs: ms, unresolved: Boolean(ms[ms.length - 1].unresolved) };
    }).sort((a, b) => Number(b.unresolved) - Number(a.unresolved) || a.root.path.localeCompare(b.root.path) || (a.root.line ?? 0) - (b.root.line ?? 0));
    if (list.length) {
      const open = list.filter((x) => x.unresolved).length;
      const all = this.allComments === c.id;
      const shown = all ? list.slice(0, 60) : list.filter((x) => x.unresolved).slice(0, 30);
      body.child(title(`程式碼留言（${open} 個未解決，共 ${list.length} 串）`));
      const where = (m) => m.path === "/PATCHSET_LEVEL" ? "整體留言" : `${m.path === "/COMMIT_MSG" ? "提交說明" : m.path}${m.line ? `:${m.line}` : ""}`;
      shown.forEach((x, i) => body.child(v_flex().id(`th-${i}`).gap(4).p(8).rounded(6).bg(t.raised).text_size(z - 1)
        .child(h_flex().gap(6).items_center()
          .child(div().flex_1().min_w(0).text_ellipsis_start().font_family(mono()).text_color(t.muted).child(where(x.root)))
          .child(div().flex_none().text_color(x.unresolved ? t.blocked : t.ansi2).child(x.unresolved ? "未解決" : "已解決")))
        .children(x.msgs.map((m, k) => v_flex().id(`th-${i}-${k}`).gap(1)
          .child(div().text_color(t.muted).child(`${who(m.author)} · 第 ${m.patch_set} 版 · ${ago(m.updated)}`))
          .child(div().whitespace_normal().child(String(m.message ?? "").trim()))))));
      if (list.length > shown.length || all) body.child(div().id("more-comments").text_size(z - 1).text_color(t.accent).cursor_pointer()
        .on_click((_e, cx) => { this.allComments = all ? null : c.id; cx.notify(); })
        .child(all ? "只看未解決的" : `還有 ${list.length - shown.length} 串已解決的，點一下看`));
    }

    // Files of the current patch set, with comment counts
    const files = Object.entries(cur?.files ?? {});
    if (files.length) {
      body.child(title(`檔案（第 ${cur._number} 版，共 ${files.length} 個）`));
      for (const [path, f] of files) {
        const n = (comments?.[path] ?? []).length;
        body.child(h_flex().id(`f-${path}`).gap(8).items_center().text_size(z - 1)
          .child(div().flex_none().w(14).text_color(t.muted).child(f.status === "A" ? "+" : f.status === "D" ? "−" : f.status === "R" ? "→" : ""))
          .child(div().flex_1().min_w(0).text_ellipsis_start().font_family(mono()).child(path))
          .when(n > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(`留言 ${n}`)))
          .child(div().flex_none().font_family(mono()).text_color(t.ansi2).child(f.lines_inserted ? `+${f.lines_inserted}` : ""))
          .child(div().flex_none().font_family(mono()).text_color(t.ansi1).child(f.lines_deleted ? `−${f.lines_deleted}` : "")));
      }
    }

    // Commit message: the first lines, click for all
    const msg = String(cur?.commit?.message ?? "").trim();
    if (msg) {
      const lines = msg.split("\n"), long = lines.length > 6, full = this.fullMsg === c.id;
      body.child(title("提交說明"))
        .child(div().id("commit-msg").font_family(mono()).text_size(z - 1.5).p(8).rounded(6).bg(t.raised).whitespace_normal()
          .when(long, (el) => el.cursor_pointer().hover((st) => st.bg(t.hover)).on_click((_e, cx) => { this.fullMsg = full ? null : c.id; cx.notify(); }))
          .child(long && !full ? `${lines.slice(0, 6).join("\n")}\n…（點一下看全部）` : msg));
    }

    // Patch sets
    if (revs.length) {
      body.child(title(`版本（共 ${revs.length} 版）`));
      revs.forEach((r) => body.child(h_flex().id(`ps-${r._number}`).gap(8).text_size(z - 1)
        .child(div().w(42).flex_none().font_family(mono()).text_color(r.sha === c.current_revision ? t.foreground : t.muted).child(`第 ${r._number} 版`))
        .child(div().flex_1().min_w(0).truncate().text_color(t.muted).child(`${who(r.uploader)} · ${ago(r.created)}${r.kind && r.kind !== "REWORK" ? ` · ${r.kind === "TRIVIAL_REBASE" ? "只是 rebase" : r.kind === "NO_CODE_CHANGE" ? "程式沒變" : r.kind === "NO_CHANGE" ? "沒有改變" : r.kind}` : ""}`))));
    }

    // Change log (newest first)
    const msgs = (c.messages ?? []).slice(-15).reverse();
    if (msgs.length) {
      body.child(title("紀錄"));
      msgs.forEach((m, i) => body.child(v_flex().id(`msg-${i}`).gap(1).pb(4).border_b(1).border_color(t.border).text_size(z - 1)
        .child(div().text_color(t.muted).child(`${who(m.author)} · ${ago(m.date)}`))
        .child(div().whitespace_normal().child(String(m.message ?? "").trim().split("\n").slice(0, 6).join("\n")))));
    }
    return body;
  }
}
