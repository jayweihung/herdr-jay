// An item's version (kit list --json, kit api 1.14: version, upstream, installed, loaded) in words, and whether what an
// agent reads is old and why. Plain values only (no Herdr), so tests run these as they are. Every field may be missing
// (an older kit): then null, and nothing new is shown.

// "2026-11-21" -> "11/21"; anything else -> null
export function monthDay(date) {
  const m = String(date ?? "").match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : null;
}

// the small words on a row and its hover text: { text, tip } | null
//   own: "11/21 版", "11/21 版（3）" (changed 3 times that day), "改了還沒送出"
//   collected: "原作者 11/10 版" (the author's commit time); not known: the date it has in the source, "11/15 版"
export function versionText(i) {
  const v = i?.version;
  if (!v || typeof v !== "object") return null;
  const up = i.upstream && typeof i.upstream === "object" ? i.upstream : null;
  const tip = [v.date, v.message, v.id ? `指紋 ${v.id}` : "",
    up?.date ? `原作者 ${up.date}` : "", up?.collected ? `收進來 ${up.collected}` : ""].filter(Boolean).join(" · ");
  if (v.dirty) return { text: "改了還沒送出", tip };
  const author = monthDay(up?.date), own = monthDay(v.date);
  if (author) return { text: `原作者 ${author} 版`, tip };
  if (!own) return null;
  return { text: `${own} 版${!up && v.n > 1 ? `（${v.n}）` : ""}`, tip };
}

import { needOf, RELOAD_TEXT } from "./context.js";

// why what an agent running `tool` (claude | codex | omp) reads is old: { kind: "sync" | "reload" | "relaunch" | "new", why } | null
//   sync: this machine's copy for that tool is not the newest one (installed[tool].id ≠ version.id)
//   new:  the machine has it, but this conversation started before it changed (loaded "old")
export function oldReason(i, tool) {
  const v = i?.version, have = tool ? i?.installed?.[tool] : null;
  if (v?.id && have?.id && have.id !== v.id)
    return { kind: "sync", why: `這台還沒同步（最新是${v.dirty ? "還沒送出的那份" : ` ${versionText(i)?.text ?? v.id}`}）` };
  if (i?.loaded !== "old") return null;
  // what that tool needs to read the new one (context.js needOf): reload | relaunch (close it and resume the same
  // conversation: Herdr does it once it waits, relaunch.js) | nothing (it re-reads each turn); omp's /reload-plugins
  // does not load a plugin's hooks
  const need = needOf(tool, i.kind, Boolean(i.parts?.hooks));
  if (need === "none" && i.kind !== "skill") return null;
  const kind = need === "reload" ? "reload" : need === "relaunch" ? "relaunch" : "new";
  const how = { reload: `打 ${RELOAD_TEXT} 就會讀到`, relaunch: "重開接回同一個對話才會讀到", new: "開新對話才會讀到" }[kind];
  if (i.kind === "skill") return { kind, why: `這次對話用的是舊版，${how}新的` };
  const when = versionText(i)?.text;
  return { kind, why: `這次對話開始後改過${when ? `（${when}）` : ""}，${how}` };
}

// the popup's one line over the lists, from the rows' oldReason: "全部最新" | "2 項舊版：按同步" | "3 項舊版：開新對話才會讀到"
export function oldSummary(reasons) {
  const old = reasons.filter(Boolean);
  if (!old.length) return "全部最新";
  const n = (k) => old.filter((r) => r.kind === k).length, sync = n("sync"), reload = n("reload");
  // the most common thing to do; a tie: 同步 first (a new conversation still reads the old copy until then)
  return `${old.length} 項舊版：${sync * 2 >= old.length ? "按同步" : reload * 2 > old.length ? `打 ${RELOAD_TEXT}`
    : n("relaunch") > n("new") ? "重開接回才會讀到" : "開新對話才會讀到"}`;
}
