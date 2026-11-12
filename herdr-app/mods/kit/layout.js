// Where the kit mod sits in a layout: two buttons in the tab bar (Agents, Kit), their panels beside the work area, kit's
// header on every pane. placed() makes that from any layout with a tab bar; layoutNeeds() says whether the current one
// still has to be changed (the repository panel's 放進上排 / 更新版面, repo.js); moveIntoBar() does it.
import { run, layout, shared, window } from "herdr";
import { NODES, liveEditors, find } from "./common.js";

const SHIPPED = ["main", "terminals", "win98"]; // Herdr's own layouts: read-only, so they are cloned first
const REPO_TOGGLE = { id: NODES.repoToggle, type: "block", content: { mod: "kit", props: { role: "repo-toggle" } }, size: { px: 56 } };
const REPO_NODE = { id: NODES.repo, type: "column", children: [{ id: NODES.repoBlock, type: "block", content: { mod: "kit" } }],
  size: { px: 420 }, min: 320, max: 800 };
// Agents stand beside Kit (role "agents"): their button before Kit's, their panel after Kit's, hidden until clicked
const AGENTS_TOGGLE = { id: NODES.agentsToggle, type: "block", content: { mod: "kit", props: { role: "agents-toggle" } }, size: { px: 66 } };
const AGENTS_NODE = { id: NODES.agents, type: "column", children: [{ id: NODES.agentsBlock, type: "block", content: { mod: "kit", props: { role: "agents" } } }],
  size: { px: 420 }, min: 320, max: 800, hidden: true };
export const HEADER = { mod: "kit", props: { role: "header" } };
// the mods an older kit had (before they became roles of this one), and the pane headers kit's header replaces:
// Herdr's own ("pane") and the older kit's ("kit-pane")
const OLD_MODS = ["kit-agents", "kit-pane"];
const OTHER_HEADERS = ["pane", "kit-pane"];

function parentOf(node, test) {
  for (const c of node?.children ?? []) {
    if (test(c)) return node;
    const p = parentOf(c, test);
    if (p) return p;
  }
  return null;
}
// every content object in the tree (blocks', and the pane headers' inside them)
function contents(node, out = []) {
  if (Array.isArray(node)) { for (const x of node) contents(x, out); return out; }
  if (!node || typeof node !== "object") return out;
  if (node.content && typeof node.content === "object") out.push(node.content);
  for (const v of Object.values(node)) contents(v, out);
  return out;
}
// every pane header drawn by kit's (role "header")
function withKitHeaders(node) {
  if (Array.isArray(node)) return node.map(withKitHeaders);
  if (!node || typeof node !== "object") return node;
  const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, withKitHeaders(v)]));
  if (out.content && OTHER_HEADERS.includes(out.content.mod)) out.content = { ...out.content, ...HEADER };
  return out;
}

// What the layout still needs: "missing" (no Kit button in the tab bar: 放進上排), "old" (it has one, but also an older
// kit's mods or pane headers that aren't kit's: 更新版面), or null (nothing).
export function layoutNeeds(root) {
  if (!find(root, NODES.repoToggle)) return "missing";
  return contents(root).some((c) => OLD_MODS.includes(c.mod) || OTHER_HEADERS.includes(c.mod)) ? "old" : null;
}

// The layout with a tab-bar button + the panel beside the work area, kit's pane headers, the stray dock and an older
// kit's mods removed. Kit's buttons go in one row with the tab bar. A tab bar in a column (Herdr's own layouts) gets a
// row around it (NODES.tabsRow, its size; the bar fills the rest). Where the bar draws the window buttons itself
// (Windows, Linux) kit's go before it so the close button stays in the corner; on a Mac after it. null: no tab bar.
export function placed(root, buttons = Boolean(window()?.buttons)) {
  // kit's blocks (and an older kit's) out; a column or row that held only those goes too (null)
  const ours = (c) => ["kit", ...OLD_MODS].includes(c.content?.mod) || c.id === NODES.repo || c.id === NODES.agents;
  const strip = (n) => {
    if (!n.children) return { ...n };
    const kids = n.children.filter((c) => !ours(c)).map(strip).filter(Boolean);
    if (n.children.length && !kids.length) return null;
    return { ...n, children: kids.map((c) => (c.id === NODES.tabsRow && c.children?.length === 1 ? unrow(c) : c)) };
  };
  const unrow = (r) => { const x = { ...r.children[0] }; if (r.size) x.size = r.size; else delete x.size; return x; };
  const tree = withKitHeaders(strip(JSON.parse(JSON.stringify(root))) ?? { children: [] });
  let bar = parentOf(tree, (c) => c.content?.mod === "tabs");
  const body = parentOf(tree, (c) => c.content?.tab != null);
  if (!bar || !body) return null;
  if (bar.type !== "row") {
    const i = bar.children.findIndex((c) => c.content?.mod === "tabs"), tabs = bar.children[i];
    const row = { id: NODES.tabsRow, type: "row", ...(tabs.size ? { size: tabs.size } : {}), children: [{ ...tabs, size: { weight: 1 } }] };
    bar.children[i] = row;
    bar = row;
  }
  const at = bar.children.findIndex((c) => c.content?.mod === "tabs");
  const copy = (n) => JSON.parse(JSON.stringify(n));
  if (buttons) bar.children.splice(at, 0, copy(AGENTS_TOGGLE), copy(REPO_TOGGLE));
  else bar.children.splice(at + 1, 0, copy(AGENTS_TOGGLE), copy(REPO_TOGGLE));
  body.children.push(copy(REPO_NODE), copy(AGENTS_NODE));
  return tree;
}

// 放進上排 / 更新版面: the current layout through placed(); Herdr's own layouts are cloned first (once: later moves
// reuse the copy). owner.moveErr says why it didn't work.
export async function moveIntoBar(owner, cx) {
  owner.moveErr = null;
  if (Object.values(liveEditors()).some((e) => e.dirty)) {
    owner.moveErr = "有大視窗還沒存檔：換版面會把它關掉。先存檔或關掉大視窗，再按一次。";
    cx.notify();
    return;
  }
  try {
    let name = shared("layout");
    if (SHIPPED.includes(name)) {
      const as = `${name}-kit`;
      try { await run("layout.clone", { name, as }); } catch { await run("layout.switch", { name: as }); }
      for (let i = 0; i < 50 && shared("layout") !== as; i++) await cx.sleep(100);
      if (shared("layout") !== as) throw new Error(`沒有切到 ${as}`);
      name = as;
    }
    const tree = placed(layout());
    if (!tree) { owner.moveErr = "這個版面沒有上排分頁列，沒辦法自動放。"; return; }
    await run("layout.set", { layout: tree });
  } catch (e) {
    owner.moveErr = `沒放成功：${e?.message ?? e}`;
  } finally { cx.notify(); }
}
