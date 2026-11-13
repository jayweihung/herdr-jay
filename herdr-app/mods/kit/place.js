// Put an agent in a space, from the Agents panel (agents.js): its card dragged onto a space (Herdr's drag API, a newer
// Herdr only: on_drag / nextDrop), or 放到 space… and a space picked (every Herdr). On the space's machine:
//   kit place <agent> <space folder>/<agent> --tool <tool> --json   that folder becomes the agent (kit 0.5.0, api 1.3):
//                                                                     its rules, skills, MCP, prompt and tool limits
//   tab.new { space, folder, argv }                                  a new tab there runs the command kit gave (claude,
//                                                                     codex, omp): started in that folder, it is that agent
// After that the folder is changed like any other, with 加到這個資料夾 / 從資料夾拿掉 in its Kit list; several agents
// dragged are several folders. Dropping the same agent again on the same space syncs its folder and opens another tab.
// The drag API is looked up at run time (import * as host): an older Herdr has no nextDrop and no on_drag, and then
// only the button is there.
import * as host from "herdr";
import { run, notify, home, setShared } from "herdr";
import { AGENTS_MSG, kit, kitJson, isWindows, takeBusy, giveBusy, markChanged } from "./common.js";

export const PLACE_TTL = 180000;
const TOOLS = ["claude", "codex", "omp"];
const NAME = /^[a-z0-9][a-z0-9-]*$/;   // kit's names

// this Herdr can drag: drops come through nextDrop (and elements have on_drag)
export const canDrag = () => typeof host.nextDrop === "function";
// what an agent card carries when dragged (at most 8 KiB: a few names)
export const dragPayload = (a, tool = "claude") => JSON.stringify({ agent: a.name, source: a.source ?? "", tool });
// an agent card, draggable when this Herdr can (a chip with its name follows the pointer); as it is otherwise
export function draggable(el, a, tool) {
  return canDrag() && typeof el.on_drag === "function" ? el.on_drag(dragPayload(a, tool), a.name) : el;
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

// kit place on the space's machine, then a tab there in the folder kit made, running the command kit gave. Progress
// and the outcome as toasts, and in the Agents panel's message. One kit action at a time (the mod's lock).
// -> false when another action holds the lock (said so)
export function placeAgent(agent, space, tool, cx, label = "放到 space") {
  const where = space?.name || "這個 space", machine = space?.machine ?? null;
  const say = (ok, text) => {
    setShared(AGENTS_MSG, { ok, label, text, at: Date.now() });
    notify({ title: ok ? `${agent} 放到 ${where} 了` : `${agent} 放不進 ${where}`, body: text, level: ok ? "success" : "error", timeout: ok ? 5000 : 10000 });
  };
  const id = takeBusy(`放 ${agent}`, PLACE_TTL);
  if (!id) { say(false, "另一個 kit 動作還在跑，等它跑完再試一次。"); return false; }
  const dir = placeDir(space, agent);
  notify({ title: `把 ${agent} 放到 ${where}…`, body: `kit place ${agent} ${dir}${machine ? `（在 ${machine}）` : ""}`, level: "info", timeout: 3000 });
  cx.spawn(async (cx) => {
    try {
      const r = await kit(["place", agent, dir, "--tool", tool, "--json"], PLACE_TTL, machine);
      const { data, error } = kitJson(r, "kit place");
      if (error) { say(false, placeError(error, r, machine)); return; }
      const cmd = Array.isArray(data.command) && data.command.length && data.command.every((x) => typeof x === "string") ? data.command : [tool];
      const folder = typeof data.dir === "string" && data.dir ? data.dir : dir;
      try { run("tab.new", { name: agent, space: space.id, folder, argv: cmd }); }
      catch (e) { say(false, `資料夾做好了（${folder}），但開不了分頁：${e?.message ?? e}`); return; }
      const warns = (Array.isArray(data.warnings) ? data.warnings : []).filter((w) => typeof w === "string");
      say(true, [`在 ${folder} 開了 ${agent}：在那裡開的 ${cmd[0]} 就是它。`,
        "之後在它的 Kit 清單按「加到這個資料夾」或「從資料夾拿掉」，只改這個資料夾。", ...warns.map((w) => `⚠ ${w}`)].join("\n"));
    } finally { giveBusy(id); markChanged(machine); cx.notify(); }
  });
  return true;
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
        if (p && d?.space?.id) placeAgent(p.agent, d.space, p.tool, cx, "拖到 space");
        cx.notify();
      }
    } catch { /* this copy closed */ } finally { owner.dropping = false; }
  });
}
