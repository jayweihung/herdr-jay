// Each agent's name as Herdr's Agents list (the built-in agents mod, grouped by space) shows it, so a card in the
// 關係 tab reads the same as its row there: a tab someone named, else the agent's own title (its terminal title,
// when it tells something), never an automatic tab number unless two in one space would read the same.
// Kept in step with defaults/mods/agents/main.js (title, leadPanes, the `detail` rule); tests/kit/run.js checks it.

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// tab id -> the pane that speaks for it: its first agent, else its focused terminal, else its first terminal
function leadPanes(all) {
  const leads = new Map();
  for (const p of all ?? []) {
    if (!p?.terminal) continue;
    const cur = leads.get(p.tab);
    if (!cur || (!cur.program?.agent && (p.program?.agent || (!cur.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name, live = clean(l?.title);
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}

// list: agents(); panes: panes(); spaces: spaces() -> address -> name
export function sidebarNames(list, panes, spaces) {
  list = list ?? [];
  const tabCounts = new Map();
  for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
  const leads = leadPanes(panes);
  const tabs = new Map((spaces ?? []).flatMap((s) => s.tabs ?? []).map((tab) => [tab.id, tab]));
  const label = new Map(list.map((a) => {
    const tab = tabs.get(a.tab), many = tabCounts.get(a.tab) > 1;
    return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
  }));
  const detail = new Map(list.map((a) => [a.address, /^\d+$/.test(label.get(a.address)) ? null : label.get(a.address)]));
  const seen = {};
  for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
  for (const a of list) if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label.get(a.address));
  return Object.fromEntries(list.map((a) => {
    const l = label.get(a.address);
    return [a.address, detail.get(a.address) ?? (/^\d+$/.test(l) ? a.program?.name || l : l)];
  }));
}

// the list's time: "<1m", "5m", "3h", "2d"
export function shortSpan(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}
