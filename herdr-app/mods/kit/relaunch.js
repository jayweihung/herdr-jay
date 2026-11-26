// 自動重開接回 (kit 1.13): after a kit change that a tool reads only when a conversation starts (context.js RELOAD
// "relaunch": Claude Code's MCP and rules, Codex's plugins and MCP, omp's rules and a plugin's hooks), an open agent is
// closed once it waits and the same conversation opened again, so it reads the change and keeps what was said.
// Asked once per change (role "relaunch-ask": a window with 好 / 以後都直接做 / 這次不要; Herdr's notifications have
// no buttons). 以後都直接做 is kept in Herdr's shared state (RELAUNCH_AUTO: saved by Herdr, kept across restarts).
// How (tried 2026-11-21 on Claude Code 2.1.330, Codex 0.169, omp 18.18.6): the tool's own quit command (hc send), wait
// for the shell (hc get), read the resume line the tool printed (hc read) and check its id against the one found before
// (Claude: sessions/<pid>.json; omp: its open session file; Codex: its /status), then type that line in the shell.
// Never while it works, waits for you, or someone types in it; never a second try by itself (a try that goes wrong
// may open a new, empty conversation): it says what happened and the line to type. The decisions are context.js's
// (relaunchStep, parseResume, …); this file only asks Herdr and types. Other machines: the same hc commands with the
// machine/t7 address, the probe through exec on that machine. A tab kit open started (kit 0.17: kit tab list has it)
// is resumed through kit open (context.js tabResume), so it keeps its own copy.
import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, exec, hc, notify, shared, setShared, openOverlay, closeOverlay, props, theme, window } from "herdr";
import { RELAUNCH, RELAUNCH_AUTO, RELAUNCH_ASK, BUILD, fs, btn, isWindows, apiAtLeast, tabList } from "./common.js";
import { TOOL_NAME, QUIT_TEXT, probeOf, relaunchWhy, parseResume, statusId, resumeTyped, resumeByHand as plainByHand, tabResume, shellBack, shellStays, helpersWork,
  resumeFailed, updateMenu, questionOn, relaunchStep, compactKey, compactLive, reloadKey } from "./context.js";

// run there with the agent's process id and tool: "ok", then "kitrun" (kit run started it: its temporary files go when
// it ends), Claude's "session <sessions/<pid>.json>" and "transcript" (its conversation file is there and not empty),
// omp's "file <the session file it has open>"
const PROBE = String.raw`echo ok; pid=$1; tool=$2
c=$AGENTKIT_CONFIG; [ -n "$c" ] || c=$HOME/.config/agentkit
pp=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
[ -n "$pp" ] && [ -f "$c/run/$pp" ] && echo kitrun
case $tool in
claude) d=$CLAUDE_CONFIG_DIR; [ -n "$d" ] || d=$HOME/.claude; f=$d/sessions/$pid.json
  [ -r "$f" ] || exit 0
  printf 'session '; tr -d '\n' < "$f"; echo
  id=$(sed -n 's/.*"sessionId" *: *"\([^"]*\)".*/\1/p' "$f")
  [ -n "$id" ] && [ -n "$(find "$d/projects" -maxdepth 2 -name "$id.jsonl" -size +0 2>/dev/null | head -1)" ] && echo transcript ;;
omp) lsof -p "$pid" -Fn 2>/dev/null | sed -n 's/^n//p' | grep '/\.omp/agent/sessions/.*\.jsonl$' | head -1 | sed 's/^/file /' ;;
esac
exit 0`;
const machineOf = (addr) => (String(addr).includes("/") ? String(addr).split("/")[0] : null);
const statusOf = (a) => (a.status === "done" && (shared("agents.busy") ?? {})[a.address] ? "working" : a.status);
// how the notices and the window name an agent: its tab, then its address (t7, box/t7)
// a tab nobody named is called by its number ("2"): the agent's own title says more
export const agentName = (a) => `${(/^\d+$/.test(a.tab_name ?? "") ? "" : a.tab_name) || a.title || a.program?.name || "agent"}（${a.address}）`;
async function getJson(addr) {
  const r = await hc(["get", addr, "--json"]).catch(() => null);
  try { return r?.code === 0 ? JSON.parse(r.stdout) : null; } catch { return null; }
}
const screen = (addr) => hc(["read", addr, "--lines", "60"]).then((r) => (r?.code === 0 ? String(r.stdout ?? "") : ""), () => "");
const send = (addr, text) => hc(["send", addr, text]).then((r) => r?.code === 0, () => false);
const keys = (addr, k) => hc(["keys", addr, k]).then((r) => r?.code === 0, () => false);
// kit 0.17 (api 1.22) there and kit tab list has this terminal: kit open started it
async function kitTab(addr) {
  const m = machineOf(addr);
  if (!apiAtLeast(m, 22)) return false;
  return Boolean((await tabList(m).catch(() => null))?.tabs.some((x) => x.tab === String(addr).split("/").pop()));
}
// the line to type by hand (its entry e: its tool, id, and whether kit open started the tab)
const byHand = (e) => (e.tab ? tabResume(e.tool, plainByHand(e.tool, e.id)) : plainByHand(e.tool, e.id));

// what is known about an agent before it is closed -> { g, p, why } (why: words, it is not closed)
export async function relaunchFacts(addr, tool, g = null) {
  g ??= await getJson(addr);
  if (!g) return { why: "讀不到這一格（hc get）" };
  const pid = g.foreground?.pid;
  if (!pid || shellBack(g)) return { g, why: "它已經關掉了" };
  const machine = machineOf(addr);
  if (!machine && isWindows()) return { g, why: relaunchWhy({ tool, windows: true }) };   // the probe needs sh
  let out = "";
  try { out = String((await exec("sh", ["-c", PROBE, "sh", String(pid), tool], { on: machine, timeout: 15000 })).stdout ?? ""); } catch {}
  if (!out.startsWith("ok")) return { g, why: "讀不到它的程式資訊（那台不是 Mac 或 Linux？）" };
  const p = probeOf(tool, out);
  return { g, p, why: relaunchWhy({ tool, windows: !machine && isWindows(), shellStays: shellStays(g), ...p }) };
}

// ---------- the entries (shared RELAUNCH: address -> context.js relaunchStep's entry) ----------
const all = () => shared(RELAUNCH) ?? {};
function put(addr, e) {
  const next = { ...all() };
  if (e) next[addr] = e; else delete next[addr];
  setShared(RELAUNCH, next);
}
// one per agent: a second change while one waits adds its kinds
function queue(x) {
  const e = all()[x.address];
  if (e && e.state !== "done" && e.state !== "failed") {
    if (e.state === "queued") put(x.address, { ...e, what: [...new Set([...e.what.split("、"), ...x.what.split("、")])].join("、") });
    return;
  }
  put(x.address, { state: "queued", at: Date.now(), tool: x.tool, name: x.name, what: x.what });
}
// After a kit change (common.js reloadAfter): the agents it needs closed and opened again (list: [{ address, tool, name,
// what }]). Each is looked at first (relaunchFacts: one kit run started, one the phone drives … is only told);
// the rest are asked about once, or queued at once after 以後都直接做. -> address -> "queued" | "asked" | why not
export async function offerRelaunch(list) {
  const out = {}, go = [];
  for (const x of list) {
    const f = await relaunchFacts(x.address, x.tool);
    if (f.why) out[x.address] = f.why; else go.push(x);
  }
  if (!go.length) return out;
  if (shared(RELAUNCH_AUTO) === true) { for (const x of go) { queue(x); out[x.address] = "queued"; } return out; }
  const rows = [...(shared(RELAUNCH_ASK)?.rows ?? []).filter((r) => !go.some((x) => x.address === r.address)), ...go];
  setShared(RELAUNCH_ASK, { at: Date.now(), rows });
  openOverlay({ mod: "kit", props: { role: "relaunch-ask" }, kind: "window", key: "kit-relaunch-ask", width: 460, height: 230 });
  for (const x of go) out[x.address] = "asked";
  return out;
}

// ---------- the steps (relaunchStep says which; any header's tick walks them, one copy at a time per agent) ----------
// not done, nothing touched: say why, forget it
function skip(e, why) {
  notify({ title: "沒有重開接回", level: "warning", timeout: 8000, body: `${e.name}：${why}。沒動它；要讀到新的${e.what}，自己關掉再接回${e.id ? `（${byHand(e)}）` : ""}` });
  return null;
}
// closed, not back: the shell is there, the line to type is said (the header: 接不回, a click types it again)
function failed(addr, e, why, cmd) {
  notify({ title: "接不回", level: "error", action: { name: "pane.focus", args: { terminal: addr } },
    body: `${e.name}：${why}。對話紀錄在磁碟上；${cmd ? `在那一格打 ${cmd}（標題列「接不回」按一下重試，右鍵複製）` : "在那一格自己接回"}` });
  return { state: "failed", at: Date.now(), tool: e.tool, name: e.name, what: e.what, id: e.id ?? null, why, cmd: cmd ?? null };
}
// it came back and asks something before its prompt: said once (never answered for you); done once the question is gone
function asking(addr, e, q) {
  if (e.state === "asking") return { ...e, lock: 0 };
  notify({ title: "接回了，在問你", level: "warning", action: { name: "pane.focus", args: { terminal: addr } },
    body: `${e.name} 接回了，但它在問你：${q || "（看那一格）"}。請到那一格回答` });
  return { ...e, state: "asking", question: q, lock: 0 };
}
const STEPS = {
  timeout: (_a, e) => skip(e, "等了 30 分鐘它還沒停下來"),
  clear: () => null,
  async begin(addr, e) {
    const g = await getJson(addr);
    if (g && helpersWork(g)) return { ...e, lock: 0 };   // a helper of it still works: later
    const f = await relaunchFacts(addr, e.tool, g);
    if (f.p?.busy) return { ...e, lock: 0 };
    if (f.why) return skip(e, f.why);
    setShared(reloadKey(addr), null);   // what waited to be typed in: the resumed conversation reads it all anyway
    const first = e.tool === "codex" ? "/status" : QUIT_TEXT[e.tool];
    if (!(await send(addr, first))) return skip(e, `${first} 沒送出去`);
    return { ...e, state: e.tool === "codex" ? "status" : "quitting", id: f.p.id, tab: await kitTab(addr), sent: Date.now(), build: BUILD, lock: 0 };
  },
  async read(addr, e) {   // Codex: its id from /status, then /quit
    const id = statusId(await screen(addr));
    if (!id) return { ...e, lock: 0 };
    if (!(await send(addr, QUIT_TEXT.codex))) return skip({ ...e, id }, "/quit 沒送出去");
    return { ...e, state: "quitting", id, sent: Date.now(), lock: 0 };
  },
  async enter(addr, e) { await keys(addr, "enter"); return { ...e, menu: true, lock: 0 }; },
  async type(addr, e) {
    const r = parseResume(e.tool, await screen(addr)), by = byHand(e);
    if (!r) return failed(addr, e, "畫面上找不到它印的接回指令", by);
    if (r.id !== e.id) return failed(addr, e, "畫面上的接回指令不是原本那個對話，沒有打", by);
    const cmd = resumeTyped(e.tool, e.tab ? tabResume(e.tool, r.cmd) : r.cmd);
    if (!(await send(addr, cmd))) return failed(addr, e, "接回指令沒打進去", cmd);
    return { ...e, state: "starting", cmd, sent: Date.now(), lock: 0 };
  },
  async menu(addr, e) {   // Codex: its update menu, as it opens
    if (updateMenu(await screen(addr))) { await keys(addr, "esc"); return { ...e, esc: true, lock: 0 }; }
    return { ...e, esc: Date.now() - e.sent > 8000, lock: 0 };
  },
  async look(addr, e) {   // not waiting yet: a question in front of its prompt?
    const q = questionOn(await screen(addr));
    return q == null ? { ...e, lock: 0 } : asking(addr, e, q);
  },
  async check(addr, e) {
    const text = await screen(addr), q = questionOn(text);
    if (resumeFailed(text)) return failed(addr, e, "它說找不到這個對話", e.cmd);
    if (q != null) return asking(addr, e, q);
    notify({ title: "已接回", level: "success", timeout: 5000, body: `${e.name} 已接回同一個對話，新的${e.what}已經可以用` });
    return { state: "done", at: Date.now(), tool: e.tool, name: e.name, what: e.what };
  },
  fail(addr, e) {
    if (e.state === "status") return skip(e, "找不到 Codex 的對話 id");
    if (e.state === "quitting") return skip(e, `打了 ${QUIT_TEXT[e.tool]}，30 秒還沒關掉，不再動它（看一下那一格）`);
    if (e.state === "asking") return failed(addr, e, "回答它的問題後它關掉了", e.cmd);
    return failed(addr, e, "接回的程式沒有起來", e.cmd);
  },
};
async function act(addr, e, step) {
  const lock = Date.now() + 120000;   // while hc types (it waits for a draft up to a minute) and reads
  put(addr, { ...e, lock });
  let next;
  try { next = await STEPS[step](addr, e); } catch (err) { next = e.state === "queued" ? skip(e, `出錯了（${err?.message ?? err}）`) : failed(addr, e, `出錯了（${err?.message ?? err}）`, e.cmd ?? byHand(e)); }
  if (all()[addr]?.lock === lock) put(addr, next);
}
// every relaunch's next step; from every header's tick (1.5 s)
export function relaunchTick(now = Date.now()) {
  let list = [];
  try { list = agents() ?? []; } catch {}
  for (const [addr, e] of Object.entries(all())) {
    if (!e || (e.lock ?? 0) > now) continue;
    const a = list.find((x) => x.address === addr), status = a ? statusOf(a) : null;
    // one half done when Herdr (or this mod) started again: never carried on by itself
    if (["status", "quitting", "starting"].includes(e.state) && e.build !== BUILD) {
      put(addr, e.state === "status" ? skip(e, "Herdr 重開了") : failed(addr, e, "Herdr 重開了，做到一半停下來", e.cmd ?? byHand(e)));
      continue;
    }
    if (e.state === "queued" || e.state === "done") {
      const step = relaunchStep(e, { status, busy: compactLive(shared(compactKey(addr))), typing: Boolean(a?.focused) && window()?.active !== false }, now);
      if (step) act(addr, e, step);
      continue;
    }
    // the rest look at the terminal first (is its shell in front?)
    const lock = now + 30000;
    put(addr, { ...e, lock });
    getJson(addr).then((g) => {
      if (all()[addr]?.lock !== lock) return;
      const step = relaunchStep(e, { status, shell: g ? shellBack(g) : null }, now);
      if (step) act(addr, { ...e, lock: 0 }, step); else put(addr, { ...e, lock: 0 });
    });
  }
}
// 接不回's click: type the line again in that pane (only while its shell is in front) -> words, or null when typed
export async function relaunchRetry(addr) {
  const e = all()[addr];
  if (e?.state !== "failed" || !e.cmd) return "沒有接回指令可以打";
  const g = await getJson(addr);
  if (!g || !shellBack(g)) return "那一格現在不是 shell，沒有打";
  if (!(await send(addr, e.cmd))) return "沒打進去";
  put(addr, { ...e, state: "starting", sent: Date.now(), build: BUILD, lock: 0 });
  return null;
}

// ---------- role "relaunch-ask": the one question per kit change ----------
export class RelaunchAsk {
  constructor(role) { this.role = role; }
  init() {}
  close() {}
  answer(how) {
    const rows = shared(RELAUNCH_ASK)?.rows ?? [];
    setShared(RELAUNCH_ASK, null);
    if (how === "always") setShared(RELAUNCH_AUTO, true);
    if (how !== "no") for (const x of rows) queue(x);
    closeOverlay(props()?.overlay);
  }
  render() {
    const t = theme(), z = fs(), rows = shared(RELAUNCH_ASK)?.rows ?? [];
    const box = v_flex().size_full().p(14).gap(8).bg(t.surface).text_size(z - 1).text_color(t.foreground);
    if (!rows.length) return box.child(div().text_color(t.muted).child("沒有要重開的 agent"))
      .child(h_flex().child(btn(t, z, "rl-close", "關掉", { small: true, on: () => closeOverlay(props()?.overlay) })));
    return box
      .child(div().font_semibold().child("kit 的改動要重開才讀得到"))
      .children(rows.map((x) => div().whitespace_normal().child(`${x.name}（${TOOL_NAME[x.tool] ?? x.tool}）要重開才讀得到新的${x.what}：等它這一輪做完，自動關掉再接回同一個對話`)))
      .child(div().whitespace_normal().text_size(z - 2).text_color(t.muted)
        .child("接回後，這次對話裡給過的「這次都允許」要再給一次；它還有背景工作時會等做完。在做事、等你回答或你正在那格打字時先等"))
      .child(h_flex().gap(6).pt(4)
        .child(btn(t, z, "rl-yes", "好", { small: true, kind: "primary", on: () => this.answer("yes") }))
        .child(btn(t, z, "rl-always", "以後都直接做", { small: true, on: () => this.answer("always") }))
        .child(btn(t, z, "rl-no", "這次不要", { small: true, on: () => this.answer("no") })));
  }
}
