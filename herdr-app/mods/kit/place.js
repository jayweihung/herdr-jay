// Put an agent in a space, from the Agents panel (agents.js): its card dragged onto a space (Herdr's drag API, a newer
// Herdr only: on_drag / nextDrop), or 放到 space… and a space picked (every Herdr). On the space's machine:
//   kit place <agent> <space folder>/<agent> --tool <tool> --json   that folder becomes the agent (kit 0.5.0, api 1.3):
//                                                                     its rules, skills, MCP, prompt and tool limits
//   tab.new { space, folder, argv, icon }                            a new tab there runs the command kit gave (claude,
//                                                                     codex, omp): started in that folder, it is that agent
// After that the folder is changed like any other, with 加到這個資料夾 / 從資料夾拿掉 in its Kit list; several agents
// dragged are several folders. One of each agent per space: dropping it again where it already runs shows that tab, and
// a newer Herdr shows it while dragging (on_drag's refuse: those spaces dim, the chip says so, the pointer says no, and
// the drop does nothing there).
// The drag API is looked up at run time (import * as host): an older Herdr has no nextDrop and no on_drag, and then
// only the button is there.
// A copy's unfinished work is cancelled when it closes (never settles: no finally). The Agents window is closed
// whenever people like, so it hands a place to the tab-bar button (the longest-lived copy) through shared state
// (PLACE_ASK) and runs it itself only when no button took it; whichever copy runs it holds the lock in owner.mine, and
// its close gives the lock back and says the tab wasn't opened (placeClosed).
import * as host from "herdr";
import { run, notify, home, shared, setShared, agents, terminals, spaces } from "herdr";
import { AGENTS_DATA, AGENTS_MSG, PLACE_ASK, kit, kitJson, isWindows, busyNow, takeBusy, giveBusy, markChanged } from "./common.js";
import { pickBot, botFile } from "./bots.js";

export const PLACE_TTL = 180000;
export const ASK_WAIT = 1500;    // a window's place no button took by then: the window runs it itself
export const ASK_OLD = 10000;    // an ask older than this is dropped, never run (its window is long gone)
export const CLOSED_TEXT = "視窗關了，分頁沒開：再放一次（kit place 可以重跑）";
const TOOLS = ["claude", "codex", "omp"];
const NAME = /^[a-z0-9][a-z0-9-]*$/;   // kit's names

// this Herdr can drag: drops come through nextDrop (and elements have on_drag)
export const canDrag = () => typeof host.nextDrop === "function";
// what an agent card carries when dragged (at most 8 KiB: a few names)
export const dragPayload = (a, tool = "claude") => JSON.stringify({ agent: a.name, source: a.source ?? "", tool });
// the chip's text over a space where that agent already runs
export const refusedLabel = (agent) => `${agent} 已經在這個 space 開著了`;
// an agent card, draggable when this Herdr can (a chip with its name follows the pointer); as it is otherwise. The spaces
// where it already runs are refused (ids one per line; an older Herdr ignores the extra arguments). live: liveNow(),
// read once for every card.
export function draggable(el, a, tool, live = liveNow()) {
  if (!canDrag() || typeof el.on_drag !== "function") return el;
  const open = openSpaces(a.name, live);
  return open.length
    ? el.on_drag(dragPayload(a, tool), a.name, open.join("\n"), refusedLabel(a.name))
    : el.on_drag(dragPayload(a, tool), a.name);
}
// a drop's payload -> { agent, tool }, null when it isn't one of these
export function readPayload(p) {
  let j = null;
  try { j = JSON.parse(String(p ?? "")); } catch { return null; }
  if (!j || typeof j !== "object" || typeof j.agent !== "string" || !NAME.test(j.agent)) return null;
  return { agent: j.agent, tool: TOOLS.includes(j.tool) ? j.tool : "claude" };
}

// Where kit place makes the folder: <space folder>/<agent>, written the way that machine writes paths (\ on Windows).
// A space without a folder starts in its machine's home: this computer's home(); another machine's is not known here,
// so the agent's name alone, which kit (started in that machine's home) takes from there.
const looksWindows = (p) => /^[A-Za-z]:([\\/]|$)|^\\\\/.test(p) || (p.includes("\\") && !p.includes("/"));
function join(dir, name, win) {
  const d = win ? String(dir).replace(/\//g, "\\") : String(dir);
  return d.replace(/[\\/]+$/, "") + (win ? "\\" : "/") + name;
}
export function placeDir(space, agent) {
  const f = String(space?.folder ?? "");
  if (!f) return space?.machine ? agent : join(home(), agent, isWindows());
  return join(f, agent, space?.machine ? looksWindows(f) : isWindows());
}

// The agent's logo as its tab's own icon in Herdr's lists (a newer Herdr: tab.new {icon}; an older one says it doesn't
// know icon, and the tab opens without it): the one its file names, else the one its name picks, as in the Kit list
async function agentIcon(agent) {
  const a = (shared(AGENTS_DATA)?.agents ?? []).find((x) => x?.name === agent);
  return botFile(a?.bot ?? pickBot(agent));
}
export function openTab(args, icon) {
  if (icon) {
    try { return run("tab.new", { ...args, icon }); }
    catch (e) { if (!/\bicon\b/.test(String(e?.message ?? e))) throw e; }
  }
  return run("tab.new", args);
}

// The agent already running in that space, in its folder (dir: placeDir's): -> { tab, address }, else null. A space
// has one of each agent: dropping it again shows that one, it doesn't open another. (A space without a folder on
// another machine: dir is the agent's name alone, so a folder ending in it.)
export function openHere(space, dir, live = liveNow()) {
  const win = looksWindows(String(dir));
  const norm = (p) => { const s = String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, ""); return win ? s.toLowerCase() : s; };
  const want = norm(dir), rel = !/^([A-Za-z]:)?\//.test(want);
  const at = (cwd) => {
    const c = norm(cwd);
    if (!c || !want) return false;
    return rel ? c.endsWith(`/${want}`) || c.includes(`/${want}/`) : c === want || c.startsWith(`${want}/`);
  };
  const a = live.agents.find((x) => x?.space === space?.id && at(live.cwds.get(x.address)));
  return a ? { tab: a.tab, address: a.address } : null;
}
// the running agents and every terminal's folder, read once for several openHere
export function liveNow() {
  return { agents: agents() ?? [], cwds: new Map((terminals() ?? []).map((t) => [t?.address, t?.cwd])) };
}
// the ids of the spaces where that agent already runs
export function openSpaces(agent, live = liveNow()) {
  return (spaces() ?? []).filter((s) => s?.id && openHere(s, placeDir(s, agent), live)).map((s) => s.id);
}

// kit's error codes (kit place --json) in plain words
const ERRORS = {
  other_agent: "那裡已經是另一個 agent 的資料夾",
  not_empty: "那裡已經有一個資料夾，裡面有東西，不是 kit 放的：kit 不會動它",
  no_parent: "這個 space 的資料夾在那台找不到",
  no_agent: "那台的 kit 來源裡沒有這個 agent：先在那台同步（kit sync）",
  bad_dir: "不能放在這裡",
  not_init: "那台還沒設定 kit：先在那台打  kit init <團隊來源的網址>",
  busy: "那台的 kit 正在忙（例如同步中）：等一下再試一次",
};
function placeError(error, r, machine) {
  if (/沒有這個指令/.test(`${r?.err ?? ""}\n${error.message}`))
    return `${machine ? `${machine} 上` : "這台"}的 kit 太舊，沒有 kit place：要 kit 0.5.0 以上（在那台打  kit self-update）。`;
  const plain = ERRORS[error.code];
  return plain ? `${plain}。\n${error.message}` : error.message;
}

// the outcome, in the Agents panel's message and as a toast
function sayer(agent, where, label) {
  return (ok, text) => {
    setShared(AGENTS_MSG, { ok, label, text, at: Date.now() });
    notify({ title: ok ? `${agent} 放到 ${where} 了` : `${agent} 放不進 ${where}`, body: text, level: ok ? "success" : "error", timeout: ok ? 5000 : 10000 });
  };
}

// kit place on the space's machine, then a tab there in the folder kit made, running the command kit gave. Progress
// and the outcome as toasts, and in the Agents panel's message. One kit action at a time (the mod's lock, its id in
// owner.mine and the place in owner.placeRun while it runs, so owner's close can give it back: placeClosed).
// -> false when another action holds the lock (said so)
export function placeAgent(agent, space, tool, cx, label = "放到 space", owner = {}) {
  const where = space?.name || "這個 space", machine = space?.machine ?? null;
  const say = sayer(agent, where, label);
  const there = openHere(space, placeDir(space, agent));
  if (there) {
    try { run("tab.select", { id: there.tab }); } catch { /* the tab went away meanwhile: still said */ }
    const text = `${agent} 已經在 ${where} 開著了（${there.address}）：一個 space 只開一個 ${agent}，切到那一格。`;
    setShared(AGENTS_MSG, { ok: true, label, text, at: Date.now() });   // (no toast: the tab it shows says enough)
    return true;
  }
  const id = takeBusy(`放 ${agent}`, PLACE_TTL);
  if (!id) { say(false, "另一個 kit 動作還在跑，等它跑完再試一次。"); return false; }
  owner.mine = id;
  owner.placeRun = { agent, where, label };
  const dir = placeDir(space, agent);
  notify({ title: `把 ${agent} 放到 ${where}…`, body: `kit place ${agent} ${dir}${machine ? `（在 ${machine}）` : ""}`, level: "info", timeout: 3000 });
  cx.spawn(async (cx) => {
    try {
      const r = await kit(["place", agent, dir, "--tool", tool, "--json"], PLACE_TTL, machine);
      const { data, error } = kitJson(r, "kit place");
      if (error) { say(false, placeError(error, r, machine)); return; }
      const cmd = Array.isArray(data.command) && data.command.length && data.command.every((x) => typeof x === "string") ? data.command : [tool];
      const folder = typeof data.dir === "string" && data.dir ? data.dir : dir;
      const icon = await agentIcon(agent);
      try { openTab({ name: agent, space: space.id, folder, argv: cmd }, icon); }
      catch (e) { say(false, `資料夾做好了（${folder}），但開不了分頁：${e?.message ?? e}`); return; }
      const warns = (Array.isArray(data.warnings) ? data.warnings : []).filter((w) => typeof w === "string");
      say(true, [`在 ${folder} 開了 ${agent}：在那裡開的 ${cmd[0]} 就是它。`,
        "之後在它的 Kit 清單按「加到這個資料夾」或「從資料夾拿掉」，只改這個資料夾。", ...warns.map((w) => `⚠ ${w}`)].join("\n"));
    } finally {
      giveBusy(id);
      if (owner.mine === id) owner.mine = null;
      owner.placeRun = null;
      markChanged(machine);
      cx.notify();
    }
  });
  return true;
}

// the asks still waiting (younger than ASK_OLD); a JSON copy of the space: shared state keeps plain values
const asksNow = () => (Array.isArray(shared(PLACE_ASK)) ? shared(PLACE_ASK) : []).filter((a) => a && Date.now() - (a.at ?? 0) < ASK_OLD);
const plainSpace = (s) => ({ id: s.id, name: s.name ?? "", machine: s.machine ?? null, folder: s.folder ?? "" });
// take one ask off the list (only one copy gets it: copies run one at a time) -> the ask, or null when it is gone
function takeAsk(id) {
  const all = asksNow(), a = all.find((x) => x.id === id) ?? null;
  if (a) setShared(PLACE_ASK, all.filter((x) => x.id !== id));
  return a;
}

// Put an agent in a space from a copy of the Agents panel (owner). The Agents window (owner.handOff) hands it to the
// tab-bar button, and runs it itself only when no button took it within ASK_WAIT (a layout without the button);
// the panel in the layout and the button run it themselves. -> false when another action holds the lock (said so)
export function requestPlace(agent, space, tool, cx, label = "放到 space", owner = {}) {
  if (!owner.handOff) return placeAgent(agent, space, tool, cx, label, owner);
  if (busyNow()) { sayer(agent, space?.name || "這個 space", label)(false, "另一個 kit 動作還在跑，等它跑完再試一次。"); return false; }
  const ask = { id: `${Date.now()}-${Math.random()}`, agent, space: plainSpace(space), tool, label, at: Date.now() };
  setShared(PLACE_ASK, [...asksNow(), ask]);
  (owner.asks ??= new Set()).add(ask.id);
  cx.timer.after(ASK_WAIT, (cx) => {
    owner.asks?.delete(ask.id);
    const mine = takeAsk(ask.id);
    if (mine) placeAgent(mine.agent, mine.space, mine.tool, cx, mine.label, owner);
  });
  return true;
}
// The tab-bar button (owner): start the places the Agents window handed over, one each time (the lock: one at a time)
export function takeAsks(owner, cx) {
  const all = asksNow();
  if (all.length !== (Array.isArray(shared(PLACE_ASK)) ? shared(PLACE_ASK).length : 0)) setShared(PLACE_ASK, all);   // drop old ones
  if (!all.length || busyNow()) return;
  const a = takeAsk(all[0].id);
  if (a) placeAgent(a.agent, a.space, a.tool, cx, a.label, owner);
}
// owner closes: its unfinished work is cancelled and never ends, so the lock is given back here, and the asks no button
// took are taken back; either way the tab wasn't opened, and people are told
export function placeClosed(owner) {
  const going = owner.placeRun, left = [...(owner.asks ?? [])].map(takeAsk).filter(Boolean);
  owner.asks?.clear();
  if (going) {
    giveBusy(owner.mine);
    owner.mine = null;
    owner.placeRun = null;
  }
  const what = going ?? (left[0] ? { agent: left[0].agent, where: left[0].space.name || "這個 space", label: left[0].label } : null);
  if (what) sayer(what.agent, what.where, what.label)(false, CLOSED_TEXT);
}

// The drops of this mod's drags (an agent card onto a space). One waiting loop per copy that runs it (the Agents panel
// and its tab-bar button: whichever waits gets the drop); the work is started, never awaited inside the loop. A closed
// copy's wait is cancelled, which ends its loop.
export function dropLoop(owner, cx) {
  if (!canDrag() || owner.dropping) return;
  owner.dropping = true;
  cx.spawn(async (cx) => {
    try {
      for (;;) {
        const d = await host.nextDrop();
        const p = readPayload(d?.payload);
        if (p && d?.space?.id) requestPlace(p.agent, d.space, p.tool, cx, "拖到 space", owner);
        cx.notify();
      }
    } catch { /* this copy closed */ } finally { owner.dropping = false; }
  });
}
