// The 各機器 tab of the repository panel (repo.js): which kit every machine and account this Herdr knows has, what it
// lacks next to the newest one, and whether the sources (and kit itself) are at the approved commits (kit approve).
//
// Rows: this computer; every machine that has a space or that Herdr is connected to (spaces(), machines(),
// hc machine ls), each asked the way the mod always runs kit there (common.js kit()), all at once, each with a
// timeout; and the accounts that report themselves (root): <appHome>/kit-machines.json lists their report files,
// read (never run) on their machine. Only machines this Herdr knows are asked or read: nothing is written in here.
//   kit status --json        kit's version, api, its own commit and each source's, the approved ones (newer kit)
//   kit api, kit --version   an older kit without kit status: only its version and api
// Nothing loads until the tab is opened; then the answer is kept (shared state MACHINES) until ⟳ or 10 minutes.
// What a row lacks comes from FEATURES (keyed by kit api, which is compared but not shown). 複製升級指令 only copies
// the command: nothing here ever changes a machine.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, machines, hc, appHome, readTextFile, shared, setShared, notify } from "herdr";
import { mono, clean, spin, textBlock, copyOnRight, btn, kit, kitJson, isWindows } from "./common.js";

export const MACHINES = "kit.machines.v1";   // { seq, started, done, at, rows, settingsError }
export const SETTINGS_FILE = "kit-machines.json";
export const REPORT_MAX = 65536;             // a report file bigger than this is not read
const ASK_TTL = 20000, OLD_TTL = 15000;      // kit status; kit api / --version of an older kit
const HC_TTL = 30000;                        // hc machine ls (exec's own limit)
// A load older than LOAD_TTL never finished (Herdr quit meanwhile): longer than the slowest one, hc machine ls, then
// a machine's kit status by sh and then kit.cmd (common.js kit()), then an older kit's api / --version the same way,
// plus room (a report file, read there by cat and then type, 2 × 30 s, is quicker). Look again after 10 minutes.
export const LOAD_TTL = HC_TTL + 2 * ASK_TTL + 2 * OLD_TTL + 30000, STALE = 600000;

// What each kit api (major.minor) added that people see in Herdr, by the short name they know from the screen.
// A row whose api is older than the newest row's lacks the ones in between. New kit features: add a line here.
export const FEATURES = [
  { api: "1.0", name: "Kit 面板", kit: "0.3.0" },
  { api: "1.1", name: "agent-files 清單", kit: "0.4.0" },
  { api: "1.2", name: "按輪分段", kit: "0.4.1" },
  { api: "1.3", name: "貼上 MCP 設定", kit: "0.5.0" },
  { api: "1.3", name: "各機器的核准和來源", kit: "0.5.0" },
  { api: "1.3", name: "把 agent 放到 space", kit: "0.5.0" },
];
// what the copy button puts on the clipboard (kit's own steps: kit self-update, then kit sync)
export const UPGRADE = { sh: "kit self-update && kit sync", cmd: "kit self-update; if ($?) { kit sync }" };

// ---------- plain values (tests/kit/run.js runs these as they are) ----------
// "1.2" -> [1, 2]; "1" -> [1, 0]; anything else -> null
export function apiOf(s) {
  const m = String(s ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null;
}
const apiCmp = (a, b) => (a[0] - b[0]) || (a[1] - b[1]);
// kit versions "0.4.1" vs "0.4.0": < 0, 0, > 0 (missing parts are 0; "dev" is older than any number)
export function verCmp(a, b) {
  const p = (v) => String(v ?? "").split(/[.+-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : -1));
  const x = p(a), y = p(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] ?? 0) - (y[i] ?? 0); if (d) return d; }
  return 0;
}
// when, for people: 剛剛, 12 分鐘前, 5 小時前, 3 天前
export function agoText(at, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "剛剛";
  if (s < 3600) return `${Math.round(s / 60)} 分鐘前`;
  if (s < 172800) return `${Math.round(s / 3600)} 小時前`;
  return `${Math.round(s / 86400)} 天前`;
}

const str = (v, max) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const sha = (v) => (typeof v === "string" && /^[0-9a-f]{7,64}$/i.test(v) ? v.toLowerCase() : null);
const count = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
// kit status --json (or a report file, the same JSON) -> only the fields this tab uses, each checked; null: not it
export function readStatus(j) {
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const version = str(j.kit, 40), api = str(j.api, 20);
  if (!version || !apiOf(api)) return null;
  const repo = (x) => (x && typeof x === "object" && str(x.name, 100) ? { name: x.name, commit: sha(x.commit), approved: sha(x.approved) } : null);
  const a = j.approvals && typeof j.approvals === "object" && !Array.isArray(j.approvals) ? j.approvals : null;
  return {
    kit: version, api, user: str(j.user, 64), at: Number.isFinite(j.at) && j.at > 0 ? j.at * 1000 : null,
    self: repo(j.self),
    approvals: a ? { serial: count(a.serial), used: count(a.used), valid: a.valid === true } : null,
    sources: Array.isArray(j.sources) ? j.sources.slice(0, 50).map(repo).filter(Boolean) : [],
    pending: pendingOf(j.pending),
  };
}
// kit status's pending (kit api 1.6): what waits for a person, each checked; none (an older kit): []
//   { kind: "sign", name, what, commits, head, since, machine }   new commits of a source waiting for kit approve
//   { kind: "owner", id, what, since, machine, dir, pid }          an agent or service waiting for the owner's OK
// since: Unix ms. Another kind: said by its what.
export function pendingOf(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).filter((p) => p && typeof p === "object").map((p) => ({
    kind: str(p.kind, 20) ?? "?", what: str(p.what, 300), name: str(p.name, 100), commits: count(p.commits),
    since: Number.isFinite(p.since) && p.since > 0 ? p.since : null, machine: str(p.machine, 64), id: str(p.id, 100),
    dir: str(p.dir, 500), pid: Number.isInteger(p.pid) && p.pid > 0 ? p.pid : null,
  })).filter((p) => p.what || p.name);
}
// what waits for a person on every machine and account the 各機器 load asked (rows), each with where it was read and
// the Herdr machine it is on (host: null is this computer), for finding the agent that waits (its pid)
export const pendingRows = (rows) => (rows ?? []).filter((r) => r.state === "ok")
  .flatMap((r) => (r.pending ?? []).map((p) => ({ ...p, where: rowLabel(r), host: r.here ? null : r.machine ?? null })));
// a report file's text -> { status } or { why }
export function readReport(text, file) {
  if (text == null) return { why: `還沒有回報檔 ${file}` };
  if (text.length > REPORT_MAX) return { why: `回報檔太大（超過 64 KB），不讀：${file}` };
  let j;
  try { j = JSON.parse(text); } catch { return { why: `回報檔不是 JSON：${file}` }; }
  const s = readStatus(j);
  return s ? { status: s } : { why: `回報檔不是 kit status --json 的內容：${file}` };
}
// <appHome>/kit-machines.json -> { reported: [{ label, machine, file }], error }; none: no rows, no error
export function readSettings(text) {
  if (text == null || !String(text).trim()) return { reported: [], error: null };
  let j;
  try { j = JSON.parse(text); } catch { return { reported: [], error: `${SETTINGS_FILE} 不是 JSON` }; }
  const list = j && typeof j === "object" && Array.isArray(j.reported) ? j.reported : null;
  if (!list) return { reported: [], error: `${SETTINGS_FILE} 要有 "reported": [ … ]` };
  const reported = [];
  for (const x of list.slice(0, 20)) {
    const label = str(x?.label, 60), file = str(x?.file, 500);
    const machine = x?.machine == null ? null : str(x.machine, 200);
    if (label && file && (x?.machine == null || machine)) reported.push({ label, machine, file });
  }
  return { reported, error: reported.length < list.length ? `${SETTINGS_FILE} 有 ${list.length - reported.length} 筆缺 label 或 file，沒用` : null };
}

// The approvals to trust: a report file is the account's own word (anyone who can write that file could put any serial
// in it), so the rows asked directly come first and the reported ones count only when no asked row has valid approvals
// (Windows: kit there never has approvals of its own). -> the rows with valid approvals, and whether they are reported
function trusted(rows) {
  const ok = rows.filter((r) => r.state === "ok" && r.approvals?.valid);
  const asked = ok.filter((r) => !r.reported);
  return asked.length ? { rows: asked, reported: false } : { rows: ok, reported: ok.length > 0 };
}
// the newest kit and api among the rows that answered, and the newest valid approval serial (serialReported: it is
// only a report file's, see trusted)
export function newest(rows) {
  let kit = null, api = null, serial = null;
  for (const r of rows) {
    if (r.state !== "ok") continue;
    if (r.kit && (!kit || verCmp(r.kit, kit) > 0)) kit = r.kit;
    const a = apiOf(r.api);
    if (a && (!api || apiCmp(a, api) > 0)) api = a;
  }
  const t = trusted(rows);
  for (const r of t.rows) if (r.approvals.serial != null && (serial == null || r.approvals.serial > serial)) serial = r.approvals.serial;
  return { kit, api, serial, serialReported: serial != null && t.reported };
}
// what a row lacks next to the newest: [{ name, kit }], and the kit version that has them all
export function missing(row, top) {
  const mine = apiOf(row.api) ?? [0, 0];
  if (!top.api || apiCmp(mine, top.api) >= 0) return { lacks: [], kit: null };
  const lacks = FEATURES.filter((f) => apiCmp(apiOf(f.api), mine) > 0 && apiCmp(apiOf(f.api), top.api) <= 0).map(({ name, kit }) => ({ name, kit }));
  const known = FEATURES.reduce((m, f) => (apiCmp(apiOf(f.api), m) > 0 ? apiOf(f.api) : m), [0, 0]);
  // the newest kit has something this table doesn't know yet
  if (apiCmp(top.api, known) > 0) lacks.push({ name: `kit ${top.kit ?? "新版"} 的新功能`, kit: top.kit });
  const kit = lacks.reduce((v, f) => (f.kit && (!v || verCmp(f.kit, v) > 0) ? f.kit : v), null) ?? top.kit;
  return { lacks, kit };
}
// every repo the row reported whose approved commit it knows: all at it -> true, any not -> false, none known -> null
export function atApproved(row) {
  const known = [row.self, ...(row.sources ?? [])].filter((x) => x?.approved);
  return known.length ? known.every((x) => x.commit === x.approved) : null;
}
// the approved commits to compare this computer's sources with: this computer's own approvals, else the row with the
// newest valid serial among the trusted ones (asked rows; reported ones only when there is no asked one)
// -> { row, of(name) } or null
export function approvedRef(rows) {
  const t = trusted(rows);
  const here = t.rows.find((r) => r.here);
  const row = here ?? [...t.rows].sort((a, b) => (b.approvals.serial ?? -1) - (a.approvals.serial ?? -1))[0];
  if (!row) return null;
  const of = (name) => [row.self, ...(row.sources ?? [])].find((x) => x?.name === name)?.approved ?? null;
  return { row, of };
}
// the command to copy for this row: kit.cmd (Windows) -> PowerShell; sh -> Mac / Linux
export const upgradeFor = (via) => UPGRADE[via === "cmd" ? "cmd" : "sh"];
export const rowLabel = (r) => (r.here ? "這台電腦" : r.reported ? r.label : r.machine);

// ---------- loading (only once the tab is shown; every row asked at once) ----------
export function machinesData() { return shared(MACHINES) ?? null; }
export function machinesLoading() { const d = machinesData(); return Boolean(d && !d.done && Date.now() - (d.started ?? 0) < LOAD_TTL); }
// due: never loaded, a load that never finished (Herdr quit meanwhile), or 10 minutes old
export function machinesDue() { const d = machinesData(); return !machinesLoading() && (!d?.rows || !d.done || Date.now() - (d.at ?? 0) > STALE); }

// machine name -> why it can't be asked now (null: ask it): spaces, Herdr's connections, hc machine ls
async function knownMachines() {
  const known = new Map();
  for (const s of spaces() ?? []) if (s?.machine) known.set(s.machine, null);
  for (const m of machines() ?? []) if (m?.name) known.set(m.name, m.layout === "unavailable" ? "Herdr 現在連不到那台" : known.get(m.name) ?? null);
  try {
    const r = await hc(["machine", "ls", "--json"]);
    for (const m of JSON.parse(String(r?.stdout ?? "")).machines ?? []) {
      if (!m?.name || typeof m.name !== "string") continue;
      const down = m.state && m.state !== "connected" ? `沒連上（${m.state}）` : null;
      known.set(m.name, down ?? known.get(m.name) ?? null);
    }
  } catch {}   // an hc without machine ls: the spaces' machines are enough
  return known;
}
// one machine (null: this computer), the way the mod always runs kit there
export async function askKit(machine) {
  const r = await kit(["status", "--json"], ASK_TTL, machine);
  if (r.missing || r.timedOut) return { state: "down", why: clean(r.err) };
  const j = kitJson(r, "kit status --json"), s = j.data ? readStatus(j.data) : null;
  if (s) return { state: "ok", ...s, at: null, reportedAt: s.at, hasStatus: true, via: r.via };
  // an older kit, without kit status: its version and api only
  const [a, v] = await Promise.all([kit(["api"], OLD_TTL, machine), kit(["--version"], OLD_TTL, machine)]);
  if (a.missing || a.timedOut) return { state: "down", why: clean(a.err) };
  const api = a.code === 0 ? apiOf(a.out) : null, version = v.code === 0 ? String(v.out).trim().match(/^kit\s+(\S+)/)?.[1] ?? null : null;
  if (!api && !version) return { state: "error", why: clean(a.err || v.err || "kit 沒說它的版本") };
  return { state: "ok", kit: version, api: api ? api.join(".") : "0.0", user: null, self: null, approvals: null, sources: null, hasStatus: false, via: r.via ?? a.via };
}
const sepOf = (p) => (String(p).includes("\\") ? "\\" : "/");
// a report file, read (never run) on its machine
async function askReport(row) {
  const text = await readTextFile(row.file, { on: row.machine ?? null }).catch((e) => { throw new Error(`讀不到 ${row.file}（${clean(e?.message ?? e)}）`); });
  const r = readReport(text, row.file);
  return r.status ? { state: "ok", ...r.status, reportedAt: r.status.at, hasStatus: true } : { state: "error", why: r.why };
}

export function loadMachines(cx) {
  const seq = (machinesData()?.seq ?? 0) + 1, started = Date.now();
  setShared(MACHINES, { ...(machinesData() ?? {}), seq, started, done: false });
  const mine = () => machinesData()?.seq === seq;
  const put = (f) => { if (mine()) setShared(MACHINES, f(machinesData())); };
  cx.spawn(async (cx) => {
    const known = await knownMachines();
    const home = appHome(), settings = readSettings(await readTextFile(`${home}${sepOf(home)}${SETTINGS_FILE}`).catch(() => null));
    const rows = [{ key: "here", machine: null, here: true, state: "loading" },
      ...[...known].sort(([a], [b]) => a.localeCompare(b)).map(([m, why]) => ({ key: `m:${m}`, machine: m, state: why ? "down" : "loading", why })),
      ...settings.reported.map((x, i) => {
        const why = x.machine && !known.has(x.machine) ? `這個 Herdr 不認得 ${x.machine}，不讀` : x.machine ? known.get(x.machine) : null;
        return { key: `r:${i}`, ...x, reported: true, state: why ? "down" : "loading", why };
      })];
    put((d) => ({ ...d, rows, settingsError: settings.error, at: Date.now() }));
    cx.notify();
    await Promise.all(rows.filter((r) => r.state === "loading").map(async (row) => {
      let got;
      try { got = row.reported ? await askReport(row) : await askKit(row.machine); }
      catch (e) { got = { state: "error", why: String(e?.message ?? e) }; }
      put((d) => ({ ...d, rows: (d.rows ?? []).map((r) => (r.key === row.key ? { ...r, ...got, asked: Date.now() } : r)) }));
      cx.notify();
    }));
    put((d) => ({ ...d, done: true, at: Date.now() }));
    cx.notify();
  });
}

// ---------- the tab ----------
const COL = { kit: 52, feat: 120, ok: 58, when: 82 };
export function machinesTab(t, z) {
  const d = machinesData(), rows = d?.rows ?? [], top = newest(rows), loading = machinesLoading();
  const box = v_flex().flex_1().min_h(0).overflow_y_scrollbar().px(10).py(8).gap(2);
  if (!d?.rows) return box.child(h_flex().gap(6).items_center().text_color(t.muted).child(spin(z - 1, t.muted)).child("讀取中…"));
  const head = [top.kit ? `kit ${top.kit}` : null, top.serial != null ? `核准簽到第 ${top.serial} 號${top.serialReported ? "（自報）" : ""}` : null].filter(Boolean).join(" · ");
  box.child(h_flex().gap(6).items_center().pb(6).font_semibold()
    .child(`最新：${head || "—"}`).when(loading, (el) => el.child(spin(z - 2, t.muted))));
  const cell = (w, el) => div().w(w).flex_none().min_w(0).child(el);
  box.child(h_flex().gap(6).px(4).pb(2).text_size(z - 2).text_color(t.dim).border_b(1).border_color(t.border)
    .child(div().flex_1().min_w(0).child("機器 / 帳號")).child(cell(COL.kit, "kit")).child(cell(COL.feat, "功能"))
    .child(cell(COL.ok, "核准")).child(cell(COL.when, "上次回報")));
  for (const r of rows) box.child(machineRow(t, z, r, top, rows));
  if (d.settingsError) box.child(div().pt(4).text_size(z - 2).text_color(t.ansi1).child(textBlock("machines-settings", d.settingsError)));
  box.child(sourcesCard(t, z, rows));
  return box;
}

function machineRow(t, z, r, top, rows) {
  const dim = t.dim, down = r.state === "down", bad = r.state === "error", wait = r.state === "loading";
  const gap = r.state === "ok" ? missing(r, top) : { lacks: [], kit: null };
  const color = down ? dim : bad ? t.ansi1 : gap.lacks.length ? t.working : t.done;
  const dot = wait ? spin(z - 4, t.muted) : div().size(8).flex_none().rounded(4).bg(color);
  const fg = down ? dim : t.foreground;
  const ap = r.approvals, at = atApproved(r);
  const approval = !r.hasStatus || !ap ? "—" : !ap.valid ? "簽章不對" : ap.serial == null ? "—" : `#${ap.serial}${at === true ? " ✓" : at === false ? " ⚠" : ""}`;
  const apColor = ap && !ap.valid ? t.ansi1 : at === false ? t.working : fg;
  const when = r.reported ? (r.reportedAt ? `${agoText(r.reportedAt)}（自己回報）` : "—") : r.asked ? agoText(r.asked) : "—";
  const old = r.reported && r.reportedAt && Date.now() - r.reportedAt > 172800000;
  const feat = r.state !== "ok" ? div().text_color(dim).child("—")
    : gap.lacks.length ? div().text_color(t.working).child(`沒有：${gap.lacks.map((f) => f.name).join("、")}`)
      : div().text_color(t.done).child("齊全");
  const v = v_flex().px(4).py(4).gap(3).rounded(6).hover((s) => s.bg(t.hover))
    .child(h_flex().gap(6).items_start().text_size(z - 1).text_color(fg)
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .child(dot)
        .child(copyOnRight(div().min_w(0).truncate().font_semibold().child(rowLabel(r)), rowLabel(r)))
        .when(Boolean(r.user), (el) => el.child(div().flex_none().text_color(t.muted).child(r.user))))
      .child(div().w(COL.kit).flex_none().font_family(mono()).text_size(z - 2).child(r.kit ?? "—"))
      .child(div().w(COL.feat).flex_none().min_w(0).text_size(z - 2).child(feat))
      .child(div().w(COL.ok).flex_none().text_size(z - 2).text_color(apColor).child(approval))
      .child(div().w(COL.when).flex_none().text_size(z - 2).text_color(old ? t.working : t.muted).child(when)));
  if (down || bad) v.child(div().pl(14).text_size(z - 2).text_color(bad ? t.ansi1 : dim).child(textBlock(`why-${r.key}`, r.why || (down ? "連不到" : "出錯了"))));
  else if (gap.lacks.length) {
    // the same machine's normal row says whether it runs kit.cmd (Windows) or sh
    const via = r.here || (r.reported && !r.machine) ? (isWindows() ? "cmd" : "sh")
      : r.via ?? rows.find((x) => !x.reported && x.machine === r.machine)?.via ?? "sh";
    const cmd = upgradeFor(via);
    v.child(h_flex().pl(14).gap(8).items_center().flex_wrap()
      .child(div().text_size(z - 2).text_color(t.working).child(`升到 kit ${gap.kit} 就有`))
      .child(btn(t, z, `upgrade-${r.key}`, "複製升級指令", { tiny: true, on: (cx) => copyCommand(cx, cmd) })));
  }
  return v;
}
// only copies: an upgrade on a server is its owner's call
function copyCommand(cx, text) {
  cx.write_to_clipboard(text);
  notify({ title: "已複製升級指令", body: `${text}\n（只複製，沒有執行。伺服器上請先問過那台的主人）`, level: "success", timeout: 3000 });
}

// this computer's kit and sources, each with its commit and whether it is the approved one
function sourcesCard(t, z, rows) {
  const here = rows.find((r) => r.here), ref = approvedRef(rows);
  const v = v_flex().mt(10).pt(6).gap(3).border_t(1).border_color(t.border)
    .child(div().font_semibold().text_size(z - 1).child("來源（這台電腦）"));
  if (here?.state === "loading") return v.child(h_flex().gap(6).items_center().text_color(t.muted).text_size(z - 2).child(spin(z - 3, t.muted)).child("讀取中…"));
  if (here?.state !== "ok" || !here.hasStatus) return v.child(div().text_size(z - 2).text_color(t.dim)
    .child("—　這台的 kit 還沒有 kit status，看不到 commit 和核准（kit 更新後就有）"));
  const list = [here.self, ...(here.sources ?? [])].filter(Boolean);
  if (!list.length) return v.child(div().text_size(z - 2).text_color(t.dim).child("—"));
  if (ref) v.child(div().text_size(z - 2).text_color(t.dim).child(ref.row.here ? `核准紀錄：第 ${ref.row.approvals.serial} 號（這台的）`
    : `核准紀錄：第 ${ref.row.approvals.serial} 號（${rowLabel(ref.row)}${ref.row.user ? ` ${ref.row.user}` : ""} 回報的）${ref.row.reported ? "（自報）" : ""}`));
  for (const s of list) {
    const ok = ref?.of(s.name) ?? null;
    const [mark, color] = !s.commit ? ["不是 git，沒有 commit", t.dim] : !ref ? ["—　沒有核准紀錄", t.dim] : !ok ? ["—　核准紀錄裡沒有它", t.dim]
      : ok === s.commit ? ["✓ 跟核准的一樣", t.done] : [`⚠ 跟核准的不一樣（核准的是 ${ok.slice(0, 7)}）`, t.working];
    v.child(h_flex().gap(8).items_center().px(4).text_size(z - 1)
      .child(copyOnRight(div().w(140).flex_none().truncate().child(s.name), s.name))
      .child(copyOnRight(div().w(64).flex_none().font_family(mono()).text_size(z - 2).child(s.commit ? s.commit.slice(0, 7) : "—"), s.commit ?? ""))
      .child(div().flex_1().min_w(0).text_size(z - 2).text_color(color).child(mark)));
  }
  return v;
}
