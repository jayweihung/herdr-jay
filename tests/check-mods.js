// herdr-app check on every mod in herdr-app/mods, and on the kit mod once per role: node tests/check-mods.js
// (macOS, Linux, Windows; Node 18+). herdr-app check loads a mod in a hidden window and builds what it draws; it always
// gives the mod no props, so for each role the kit mod is copied to a temp folder where props() (from "herdr") answers
// that role's props. Skipped (exit 0) when herdr-app is not on PATH.
// It runs the mods as Herdr would: the kit mod asks the kit on PATH `kit api` (nothing else while it isn't a kit it can
// read). Nothing of yours is changed: check keeps shared state in memory, and writes only gpui-kit.d.ts and
// jsconfig.json next to each mod (both ignored by git).
import { readdirSync, existsSync, mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const win = process.platform === "win32";
const MODS = join(dirname(fileURLToPath(import.meta.url)), "..", "herdr-app", "mods");
const found = win ? spawnSync("where", ["herdr-app"], { encoding: "utf8" }) : spawnSync("sh", ["-c", "command -v herdr-app"], { encoding: "utf8" });
if (found.status !== 0 || !found.stdout.trim()) { console.log("skipped: herdr-app is not on PATH"); process.exit(0); }
const app = found.stdout.trim().split(/\r?\n/)[0];

// each kit role with the props Herdr would give it (a pane header gets { pane, terminal } too)
const target = { key: "|/tmp|t1", pane: "p1", term: "t1", machine: null, cwd: "/tmp", tool: "claude", title: "Claude Code" };
const KIT_ROLES = {
  repo: {}, "repo-toggle": { role: "repo-toggle" }, editor: { role: "editor", item: { path: "/tmp/x.md", name: "x", kind: "rule" } },
  agent: { role: "agent", target }, agents: { role: "agents" }, "agents-toggle": { role: "agents-toggle" },
  header: { role: "header", pane: "p1", terminal: "t1" }, context: { role: "context", target },
  "older name panel": { role: "panel" }, "older name pane": { role: "pane", target }, "a misspelled role": { role: "agnets" },
};
// every file's `import { ..., props [as x], ... } from "herdr";`: props becomes a function that answers these props
function withProps(src, props) {
  return src.replace(/^import\s*\{([^}]*)\}\s*from\s*"herdr";\s*$/m, (_m, names) => {
    const list = names.split(",").map((x) => x.trim()).filter(Boolean);
    const mine = list.filter((x) => /^props(\s+as\s+\w+)?$/.test(x)).map((x) => x.split(/\s+as\s+/)[1] ?? "props");
    const rest = list.filter((x) => !/^props(\s+as\s+\w+)?$/.test(x));
    return `${rest.length ? `import { ${rest.join(", ")} } from "herdr";` : ""}${mine.map((v) => `\nconst ${v} = () => (${JSON.stringify(props)});`).join("")}`;
  });
}

let fail = 0, n = 0;
function check(dir, name) {
  n++;
  const r = spawnSync(app, ["check", dir], { encoding: "utf8", timeout: 120000 });
  const ok = r.status === 0;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) console.log(`      ${String((r.stdout || "") + (r.stderr || "") || r.error?.message || `exit ${r.status}`).trim().split("\n").join("\n      ")}`);
}

for (const mod of readdirSync(MODS).filter((m) => existsSync(join(MODS, m, "main.js")))) check(join(MODS, mod), mod);

const kit = join(MODS, "kit");
for (const [name, props] of Object.entries(KIT_ROLES)) {
  const dir = mkdtempSync(join(tmpdir(), "kit-check-"));
  try {
    cpSync(kit, dir, { recursive: true });
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".js"))) writeFileSync(join(dir, f), withProps(readFileSync(join(dir, f), "utf8"), props));
    check(dir, `kit, role ${name}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
console.log(`\n${n - fail} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
