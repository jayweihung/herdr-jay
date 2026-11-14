// What ship.js does, with no Herdr in it: the tests run it under node with their own exec and file reader.

// UTF-8 length of a JS string, and the string cut into pieces of at most max bytes (never inside a character)
export function bytes(s) {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
export function pieces(s, max = 100000) {
  const out = [];
  let start = 0, n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const w = c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? 4 : 3;
    if (n + w > max) { out.push(s.slice(start, i)); start = i; n = 0; }
    n += w;
    if (w === 4) i++;
  }
  out.push(s.slice(start));
  return out;
}
// A name for some text, 16 hex digits: two FNV-1a hashes, the second mixed with the first. Not for security, only
// "is it the same text".
export function hash(s) {
  let a = 0x811c9dc5, b = 0x050c5d1f;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x01000193) >>> 0;
    b = (b ^ (a >>> 13)) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

// The shell side, in ~/.cache/nvim-jay on the machine.
// CHECK: prints each folder given that isn't whole there (no "ok" in it); touches the ones that are.
const CHECK = `d="$HOME/.cache/nvim-jay"
for x in "$@"; do
  if [ -f "$d/$x/ok" ]; then touch "$d/$x" "$d/$x/ok" 2>/dev/null; else echo "$x"; fi
done`;
// PUT: $1 a new folder's name; then pairs of a path in it and text to add to that file (a long file takes several).
const PUT = `set -e
d="$HOME/.cache/nvim-jay"
mkdir -p "$d"
chmod 700 "$d"
t="$d/$1"
shift
mkdir -p "$t"
while [ $# -ge 2 ]; do
  case "$1" in /*|*..*) echo "not a path in the folder: $1" >&2; exit 1 ;; esac
  mkdir -p "$t/$(dirname "$1")"
  printf '%s' "$2" >> "$t/$1"
  shift 2
done`;
// DONE: $1 the new folder, now whole; $2 its name in place (if another pane put it there first, that one stays).
// Then what older versions left: folders no start used for 30 days, copies cut short a day ago.
const DONE = `set -e
d="$HOME/.cache/nvim-jay"
: > "$d/$1/ok"
if [ -f "$d/$2/ok" ]; then rm -rf "$d/$1"; else rm -rf "$d/$2"; mv "$d/$1" "$d/$2"; fi
find "$d" -maxdepth 1 \\( -name 'init-*' -o -name 'nvim-tree-*' \\) ! -name '*.part.*' -mtime +30 -exec rm -rf {} + 2>/dev/null || :
find "$d" -maxdepth 1 -name '*.part.*' -mtime +1 -exec rm -rf {} + 2>/dev/null || :`;

// io: { exec (as Herdr's), readTextFile (as Herdr's), modFile(rel) (a file of this mod on this computer), init()
// (nvim-jay's Lua) }; maxArg / maxCall: bytes per argument, per exec (macOS takes 1 MiB for every argument and the
// environment together; Linux 131072 bytes per argument)
export function makeWhere(io, { maxArg = 100000, maxCall = 400000 } = {}) {
  async function sh(script, args, machine) {
    const r = await io.exec("/bin/sh", ["-c", script, "sh", ...args], { timeout: 60000, on: machine });
    if (r.code !== 0) throw new Error(`${machine ?? "這台電腦"}：${String(r.stderr || r.stdout || `exit ${r.code}`).trim().slice(0, 300)}`);
    return r.stdout;
  }
  // sends one folder: files is [path, text] pairs
  async function put(name, files, machine) {
    const part = `${name}.part.${Math.random().toString(36).slice(2, 10)}`;
    let call = [], size = 0;
    const flush = async () => { if (call.length) await sh(PUT, [part, ...call], machine); call = []; size = 0; };
    for (const [path, text] of files) {
      for (const p of pieces(text, maxArg)) {
        const n = bytes(path) + bytes(p);
        if (size + n > maxCall) await flush();
        call.push(path, p);
        size += n;
      }
    }
    await flush();
    await sh(DONE, [part, name], machine);
  }
  // Makes sure both folders are whole on that machine (null: this computer). Gives their names under ~/.cache/nvim-jay
  // and whether anything was sent.
  return async function where(machine) {
    const lua = io.init();
    const list = await io.readTextFile(io.modFile("nvim-tree/files.txt"));
    if (!list) throw new Error("nvim-jay 的 nvim-tree 不見了（mods/nvim-jay/nvim-tree/files.txt）");
    const init = `init-${hash(lua)}`, tree = `nvim-tree-${hash(list)}`;
    const missing = (await sh(CHECK, [init, tree], machine)).split(/\r?\n/).filter(Boolean);
    if (missing.includes(init)) await put(init, [["init.lua", lua]], machine);
    if (missing.includes(tree)) {
      const files = [];
      for (const p of list.split(/\r?\n/).slice(1).filter(Boolean)) {
        const text = await io.readTextFile(io.modFile(`nvim-tree/${p}`));
        if (text == null) throw new Error(`nvim-jay 的 nvim-tree 少了 ${p}`);
        files.push([p, text]);
      }
      await put(tree, files, machine);
    }
    return { init, tree, sent: missing.length > 0 };
  };
}
