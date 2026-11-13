// 在 nvim 看: a change's patch set as files on this computer, opened in nvim-jay's review mode.
//
// 1. Where: a git worktree <review root>/<project>-<change> (default root ~/src/review), made from
//    - your own clone of the project when there is one (gerrit.json review.repos, else found under review.search,
//      default ~/src: a folder whose .git/config has a remote on the Gerrit's host with that project's path), so
//      only what it lacks is downloaded and your own folder isn't touched (a worktree beside it);
//    - else a store <review root>/.repos/<project>.git made once you agree (asked per project), downloading only
//      the patch set and its parent (--depth 2), not the history.
// 2. Downloading runs in the background (a script this file writes into the review's data folder, run by sh on
//    macOS and by PowerShell on Windows), so a big repo isn't cut at exec's 10 minutes and closing the panel doesn't
//    stop it. The script appends to "status" (pid, step, head, base, done / fail) and git writes its progress to
//    "progress"; the panel reads both every second and draws a bar.
//    The Gerrit login (gerrit.json user / http_password) reaches git only through a credential helper that reads
//    gerrit.json itself and answers only for the Gerrit's host: nothing secret is in a script, an argument or a file
//    of its own.
// 3. Then the panel writes review.json (files, this patch set's comments, base / head) into the data folder and opens
//    nvim-jay with it (nvim-jay's REVIEW part); it rewrites the file when comments change or you click a file here
//    (jump). nvim appends what you do there to from-nvim.jsonl, one JSON object per line, each with an id:
//      draft  { path, line, message, head }          a new comment -> your Gerrit draft on that patch set
//      reply  { in_reply_to, message, unresolved }   an answer in a thread (Done / Ack too) -> your draft
//      edit   { id, message }  /  delete { id }      one of your drafts
//      update { to, base }                           another patch set into the same folder (base: null = its parent)
//      ask    { path, line, end, question, diff }    a question to the Gerrit agent about those lines
//      suggest { path, start, line, end_char, text, message }  a suggested edit of lines start..line -> your draft
//             with a ```suggestion block (Gerrit's web page shows an Apply button; no server setting needed)
//      fix    { path, line, thread }                 your own change: the agent changes the files in the folder as
//             a thread asks (no commit, no push)
//    Nothing nvim does is published: drafts go out with the panel's 💬 送出回覆.
// Data folder: <Herdr home>/data/gerrit/review/<change> (review.json, seen.json, from-nvim.jsonl, the job's files).

export const SKIP_FILES = new Set(["/COMMIT_MSG", "/MERGE_LIST", "/PATCHSET_LEVEL"]);
const slashes = (p) => String(p ?? "").replace(/\\/g, "/");
export const tilde = (p, home) => slashes(String(p ?? "").replace(/^~(?=$|[\\/])/, home));
// a folder name for a project: tools/build -> tools-build
export const slug = (project) => String(project ?? "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "project";
// Gerrit's change ref: refs/changes/<last two digits>/<change>/<patch set>
export const changeRef = (n, ps) => `refs/changes/${String(n % 100).padStart(2, "0")}/${n}/${ps}`;

// gerrit.json "review" (all optional): { root, repos: { project: folder }, search: [folders], fetch_url }
// fetch_url: how git reaches a project, {project} filled in (e.g. "ssh://you@gerrit.example.com:29418/{project}",
// then your own ssh key is used, not the HTTP password). Default: the Gerrit address + /a/<project> with a login,
// /<project> without.
export function reviewCfg(cfg, home) {
  const r = cfg?.review && typeof cfg.review === "object" ? cfg.review : {};
  const h = slashes(home).replace(/\/+$/, "");
  const repos = {};
  for (const [k, v] of Object.entries(r.repos && typeof r.repos === "object" ? r.repos : {})) if (typeof v === "string" && v) repos[k] = tilde(v, h).replace(/\/+$/, "");
  return {
    root: (typeof r.root === "string" && r.root ? tilde(r.root, h) : `${h}/src/review`).replace(/\/+$/, ""),
    repos,
    search: (Array.isArray(r.search) ? r.search.filter((x) => typeof x === "string" && x) : ["~/src"]).map((x) => tilde(x, h).replace(/\/+$/, "")),
    fetchUrl: typeof r.fetch_url === "string" && r.fetch_url.includes("{project}") ? r.fetch_url : null,
  };
}
export function fetchUrl(cfg, rc, project) {
  if (rc.fetchUrl) return rc.fetchUrl.replace("{project}", project);
  return `${String(cfg.url).replace(/\/+$/, "")}${cfg.auth ? "/a" : ""}/${project}`;
}
// the Gerrit's host (with its port), as git's credential helper is asked for it
export const gerritHost = (cfg) => { try { return new URL(cfg.url).host.toLowerCase(); } catch { return ""; } };

// Whether a remote URL is that project on that Gerrit: over http(s) <Gerrit address>[/a]/<project>[.git] (the same
// host; a Gerrit under a path keeps it), over ssh ssh://user@host:29418/<project> or user@host:<project>.
export function sameRepo(url, gerritUrl, project) {
  let g;
  try { g = new URL(String(gerritUrl)); } catch { return false; }
  const u = String(url ?? "").trim();
  const clean = (p) => decodeURIComponent(p).replace(/\.git\/?$/, "").replace(/\/+$/, "").replace(/^\/+/, "");
  const p = String(project ?? "").replace(/^\/+|\/+$/g, "");
  if (!p) return false;
  if (/^https?:\/\//i.test(u)) {
    let x;
    try { x = new URL(u); } catch { return false; }
    if (x.hostname.toLowerCase() !== g.hostname.toLowerCase()) return false;
    const prefix = clean(g.pathname);
    const path = clean(x.pathname);
    return [p, `a/${p}`].some((tail) => path === (prefix ? `${prefix}/${tail}` : tail));
  }
  let host = "", path = "";
  if (/^ssh:\/\//i.test(u)) { try { const x = new URL(u); host = x.hostname; path = x.pathname; } catch { return false; } }
  else { const m = u.match(/^(?:[^@/]+@)?([^:/]+):(?!\/\/)(.+)$/); if (!m) return false; host = m[1]; path = m[2]; }
  return host.toLowerCase() === g.hostname.toLowerCase() && clean(path) === p;
}
// the remote URLs in a .git/config's text
export const remoteUrls = (text) => [...String(text ?? "").matchAll(/^\s*url\s*=\s*(.+?)\s*$/gm)].map((m) => m[1].replace(/^"|"$/g, ""));

// The review's files: the patch set's (against its parent) or two patch sets' difference, without Gerrit's magic files.
export function reviewFiles(files) {
  return Object.entries(files ?? {}).filter(([p]) => !SKIP_FILES.has(p)).map(([path, f]) => ({
    path, status: f?.status ?? "M", ...(f?.old_path ? { old_path: f.old_path } : {}),
    ins: Number(f?.lines_inserted ?? 0), del: Number(f?.lines_deleted ?? 0),
  }));
}
// This patch set's comments (and your drafts on it) by file, as nvim shows them: line, who, text, open or not, its
// id and thread (the first comment's id: replies follow in_reply_to, like Gerrit's threads).
// ported: Gerrit's ported_comments / ported_drafts for this patch set (older patch sets' unresolved threads, moved to
// the lines they are on now), shown too with from_ps.
export function reviewComments(comments, drafts, ps, who, ported = null) {
  const out = {};
  const byId = new Map();
  for (const src of [comments, drafts]) for (const xs of Object.values(src ?? {})) for (const m of xs ?? []) if (m?.id) byId.set(m.id, m);
  const rootOf = (m) => { let r = m, i = 0; while (r.in_reply_to && byId.has(r.in_reply_to) && i++ < 50) r = byId.get(r.in_reply_to); return r; };
  const add = (list, draft) => {
    for (const [path, xs] of Object.entries(list ?? {})) {
      if (SKIP_FILES.has(path)) continue;
      for (const m of xs ?? []) {
        if (Number(m.patch_set) !== Number(ps) || m.side === "PARENT") continue;
        (out[path] ??= []).push({ ...(m.id ? { id: m.id, thread: rootOf(m).id ?? m.id } : {}), ...(m.in_reply_to ? { reply_to: m.in_reply_to } : {}),
          ...(m.line ? { line: m.line } : {}), author: draft ? "你" : who(m.author), message: String(m.message ?? ""),
          unresolved: Boolean(m.unresolved), ...(draft ? { draft: true } : {}), at: m.updated ?? "" });
      }
    }
  };
  add(comments, false);
  add(drafts, true);
  const seen = new Set(Object.values(out).flat().map((m) => m.id).filter(Boolean));
  for (const [list, draft] of [[ported?.comments, false], [ported?.drafts, true]]) {
    for (const [path, xs] of Object.entries(list ?? {})) {
      if (SKIP_FILES.has(path)) continue;
      for (const m of xs ?? []) {
        if (!m?.id || seen.has(m.id) || Number(m.patch_set) === Number(ps) || m.side === "PARENT") continue;
        seen.add(m.id);
        (out[path] ??= []).push({ id: m.id, thread: rootOf(m).id ?? m.id, ...(m.in_reply_to ? { reply_to: m.in_reply_to } : {}),
          ...(m.line ? { line: m.line } : {}), author: draft ? "你" : who(m.author), message: String(m.message ?? ""),
          unresolved: Boolean(m.unresolved), ...(draft ? { draft: true } : {}), at: m.updated ?? "", from_ps: Number(m.patch_set) });
      }
    }
  }
  for (const xs of Object.values(out)) xs.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || String(a.at).localeCompare(String(b.at)));
  return out;
}

// nvim's question about some lines -> the text the Gerrit agent gets (everything it needs, also in a new session)
export function askText(e, url, a) {
  const lines = Number(a.end) > Number(a.line) ? `第 ${a.line}–${a.end} 行` : `第 ${a.line} 行`;
  const diff = String(a.diff ?? "").replace(/```/g, "ˋˋˋ").slice(0, 12000);
  return [
    `我在 nvim 看 Gerrit change ${e.n}（${e.project}，第 ${e.ps} 版${e.base_ps != null ? `，跟第 ${e.base_ps} 版比` : ""}），想問這幾行：`,
    url,
    `檔案：${a.path} ${lines}（這台電腦上的檔案：${e.wt}/${a.path}，整個 change 在 ${e.wt}）`,
    ...(diff ? ["```diff", diff, "```"] : []),
    `問題：${String(a.question ?? "").trim() || "這段改動在做什麼？有沒有問題？"}`,
    "要對這段留意見的話，用 Gerrit 存成那一行的草稿（不要直接送出），我在 nvim 和 Gerrit 面板都看得到。用繁體中文回答。",
    "有具體改法的話，草稿可以附建議修改：range 涵蓋要換掉的那幾行（start_character 0，end_line 等於 line，end_character 是最後一行的長度），留言裡放 ˋˋˋsuggestion 區塊（三個反引號 + suggestion，下一行起是改好的那幾行，最後一行三個反引號），作者在 Gerrit 按一下就能套用。",
  ].join("\n");
}

// your own change: the agent changes the files in the review folder as a thread asks (you look, then push yourself)
export function fixText(e, url, f) {
  const thread = (Array.isArray(f.thread) ? f.thread : []).slice(0, 30)
    .map((m) => `- ${String(m?.author ?? "?")}${m?.draft ? "（我的草稿）" : ""}：${String(m?.message ?? "").replace(/```/g, "ˋˋˋ").slice(0, 3000)}`);
  return [
    `這是我的 Gerrit change ${e.n}（${e.project}，第 ${e.ps} 版）：`,
    url,
    `${f.path} 第 ${f.line} 行有這串留言：`,
    ...thread,
    `請照留言在 ${e.wt} 裡直接改檔案（這台電腦上的檔案：${e.wt}/${f.path}）。只改檔案：不要 commit、不要 push、不要在 Gerrit 留言或送出。`,
    "留言講得不清楚、或你覺得不該照改，就先不要改，跟我說為什麼。改完用繁體中文說改了什麼。",
  ].join("\n");
}
// the newest patch set's number of a change Gerrit gave (with its current revision)
export const latestPs = (c) => Number(c?.revisions?.[c?.current_revision]?._number) || null;

// ---------- git's progress, as the panel draws it ----------
const PHASES = [
  [/^remote: (Enumerating|Counting|Compressing|Finding|Total)/, "Gerrit 準備中"],
  [/^Receiving objects/, "下載"],
  [/^Resolving deltas/, "整理"],
  [/^(Updating files|Checking out files)/, "展開檔案"],
];
// -> { phase, percent, done, total, size, speed } from git's stderr (\r-separated updates), or null
export function parseProgress(text) {
  const lines = String(text ?? "").split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);
  // the newest line with a percentage (git's "remote: Total …" summary has none), else the newest phase at all
  const at = (want) => { for (let i = lines.length - 1; i >= 0; i--) if (PHASES.some(([re]) => re.test(lines[i])) && (!want || /\d+%/.test(lines[i]))) return lines[i]; };
  for (const l of [at(true) ?? at(false)].filter(Boolean)) {
    const ph = PHASES.find(([re]) => re.test(l));
    const m = l.match(/:\s+(\d+)%(?:\s+\((\d+)\/(\d+)\))?(?:,\s+([\d.]+\s+[KMG]?i?B)(?:\s+\|\s+([\d.]+\s+[KMG]?i?B\/s))?)?/);
    return { phase: ph[1], percent: m ? Number(m[1]) : null, done: m?.[2] ? Number(m[2]) : null, total: m?.[3] ? Number(m[3]) : null,
      size: m?.[4] ?? null, speed: m?.[5] ?? null };
  }
  return null;
}
// the script's status lines -> { pid, step, head, base, done, fail }
export function parseStatus(text) {
  const s = {};
  for (const raw of String(text ?? "").replace(/^﻿/, "").split(/\r?\n/)) {
    const l = raw.replace(/^﻿/, "");
    const m = l.match(/^(pid|step|head|base|fail)\s+(.*)$/);
    if (m) s[m[1]] = m[1] === "pid" ? Number(m[2]) : m[2].trim();
    else if (l.trim() === "done") s.done = true;
  }
  return s;
}

// ---------- the job scripts ----------
// Values go in as single-quoted strings (sh: ' -> '\''; PowerShell: ' -> ''). Paths with a newline are refused before.
const shq = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;
const fill = (tpl, vals, q) => tpl.replace(/@([A-Z_]+)@/g, (_m, k) => (k in vals ? q(vals[k]) : _m));

const SH_JOB = String.raw`#!/bin/sh
# Made by Herdr's Gerrit panel (在 nvim 看): downloads a change's patch set and checks it out. Safe to delete.
STATUS=@STATUS@; PROGRESS=@PROGRESS@; ERR=@ERR@; STORE=@STORE@; NEWSTORE=@NEWSTORE@; URL=@URL@; WT=@WT@
N=@N@; HEAD_REF=@HEAD_REF@; BASE_REF=@BASE_REF@; CRED=@CRED@
say() { printf '%s\n' "$*" >> "$STATUS"; }
fail() { say "fail $*"; exit 1; }
child=
trap '[ -n "$child" ] && kill "$child" 2>/dev/null; say "fail 取消了"; exit 1' TERM INT HUP
say "pid $$"
# git's progress in English, so the panel can read it (LC_ALL wins over LANG)
export GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never LC_ALL=C LANGUAGE=C
: > "$PROGRESS"; : > "$ERR"
# git runs in the background so a cancel (TERM) reaches it too
bg() { "$@" & child=$!; wait "$child"; rc=$?; child=; return $rc; }
last() { tail -c 400 "$1" | tr '\r\n' '  ' | sed 's/  */ /g'; }
if [ "$NEWSTORE" = 1 ] && [ ! -d "$STORE" ]; then
  say "step init"
  mkdir -p "$STORE" && git init -q --bare "$STORE" 2>>"$ERR" || fail "建不了 $STORE：$(last "$ERR")"
fi
say "step fetch"
set -- git -C "$STORE" -c credential.helper=
[ -n "$CRED" ] && set -- "$@" -c "credential.helper=!/bin/sh '$CRED'"
set -- "$@" fetch --progress --no-tags
[ "$NEWSTORE" = 1 ] && set -- "$@" --depth=2
set -- "$@" "$URL" "+$HEAD_REF:refs/gerrit-review/$N/head"
[ -n "$BASE_REF" ] && set -- "$@" "+$BASE_REF:refs/gerrit-review/$N/base"
bg "$@" 2>>"$PROGRESS" || fail "下載失敗：$(last "$PROGRESS")"
HEAD=$(git -C "$STORE" rev-parse --verify -q "refs/gerrit-review/$N/head^{commit}") || fail "下載了，但找不到這一版"
if [ -n "$BASE_REF" ]; then BASE=$(git -C "$STORE" rev-parse --verify -q "refs/gerrit-review/$N/base^{commit}")
else BASE=$(git -C "$STORE" rev-parse --verify -q "$HEAD^1^{commit}"); fi
[ -n "$BASE" ] || fail "找不到要比的那一版（上一個 commit）"
say "head $HEAD"
say "base $BASE"
say "step checkout"
if [ -e "$WT/.git" ]; then
  git -C "$WT" checkout -q --detach "$HEAD" 2>>"$ERR" || fail "換不到這一版（那個資料夾裡有改過的檔？）：$(last "$ERR")"
else
  mkdir -p "$(dirname "$WT")"
  bg git -C "$STORE" worktree add -q --detach "$WT" "$HEAD" 2>>"$ERR" || fail "放不進 $WT：$(last "$ERR")"
fi
# a partial clone fetches missing files now (nvim never fetches)
say "step prepare"
bg git -C "$WT" diff --no-ext-diff --no-textconv "$BASE" "$HEAD" >/dev/null 2>>"$ERR"
say "done"
`;
// git's credential helper: answers only for the Gerrit's host, with gerrit.json's user and HTTP password (plutil
// reads the JSON on macOS)
const SH_CRED = String.raw`#!/bin/sh
# Made by Herdr's Gerrit panel: gives git the Gerrit login from gerrit.json, for the Gerrit's host only.
[ "$1" = get ] || exit 0
CFG=@CFG@; HOST=@HOST@
h=
while IFS= read -r line; do
  case "$line" in host=*) h=${"$"}{line#host=} ;; "") break ;; esac
done
[ "$(printf '%s' "$h" | tr 'A-Z' 'a-z')" = "$HOST" ] || exit 0
u=$(/usr/bin/plutil -extract user raw -o - "$CFG" 2>/dev/null) || exit 0
p=$(/usr/bin/plutil -extract http_password raw -o - "$CFG" 2>/dev/null) || exit 0
printf 'username=%s\npassword=%s\n' "$u" "$p"
`;

const PS_JOB = String.raw`# Made by Herdr's Gerrit panel (在 nvim 看): downloads a change's patch set and checks it out. Safe to delete.
$status = @STATUS@; $progress = @PROGRESS@; $err = @ERR@; $store = @STORE@; $newStore = @NEWSTORE@; $url = @URL@; $wt = @WT@
$n = @N@; $headRef = @HEAD_REF@; $baseRef = @BASE_REF@; $cred = @CRED@
$utf8 = New-Object System.Text.UTF8Encoding $false
function Say([string]$t) { [System.IO.File]::AppendAllText($status, $t + "` + "`n" + String.raw`", $utf8) }
function Fail([string]$t) { Say ("fail " + $t); exit 1 }
function Last([string]$f) { if (Test-Path -LiteralPath $f) { $x = [System.IO.File]::ReadAllText($f); if ($x.Length -gt 400) { $x = $x.Substring($x.Length - 400) }; ($x -replace '\s+', ' ').Trim() } }
# one command line for git (Start-Process passes a single string as it is): every argument in double quotes
function Line([string[]]$a) { ($a | ForEach-Object { '"' + ($_ -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"' }) -join ' ' }
# (not named Git: PowerShell names ignore case, and "& git" below must reach git itself)
function Step([string[]]$a, [string]$errFile) {
  $p = Start-Process -FilePath git -ArgumentList (Line $a) -NoNewWindow -Wait -PassThru -RedirectStandardError $errFile -RedirectStandardOutput ($errFile + '.out')
  return $p.ExitCode
}
Say ("pid " + $PID)
$env:GIT_TERMINAL_PROMPT = '0'; $env:GCM_INTERACTIVE = 'never'; $env:LC_ALL = 'C'; $env:LANGUAGE = 'C'
if ($newStore -eq '1' -and -not (Test-Path -LiteralPath $store)) {
  Say 'step init'
  New-Item -ItemType Directory -Force -Path $store | Out-Null
  if ((Step @('init', '-q', '--bare', $store) $err) -ne 0) { Fail ('建不了 ' + $store + '：' + (Last $err)) }
}
Say 'step fetch'
$a = @('-C', $store, '-c', 'credential.helper=')
if ($cred) {
  $exe = (Get-Process -Id $PID).Path -replace '\\', '/'
  $a += @('-c', ('credential.helper=!"' + $exe + '" -NoProfile -ExecutionPolicy Bypass -File ''' + ($cred -replace '\\', '/') + ''''))
}
$a += @('fetch', '--progress', '--no-tags')
if ($newStore -eq '1') { $a += '--depth=2' }
$a += @($url, ('+' + $headRef + ':refs/gerrit-review/' + $n + '/head'))
if ($baseRef) { $a += ('+' + $baseRef + ':refs/gerrit-review/' + $n + '/base') }
if ((Step $a $progress) -ne 0) { Fail ('下載失敗：' + (Last $progress)) }
$head = (& git -C $store rev-parse --verify -q ('refs/gerrit-review/' + $n + '/head^{commit}')) | Select-Object -First 1
if (-not $head) { Fail '下載了，但找不到這一版' }
if ($baseRef) { $base = (& git -C $store rev-parse --verify -q ('refs/gerrit-review/' + $n + '/base^{commit}')) | Select-Object -First 1 }
else { $base = (& git -C $store rev-parse --verify -q ($head + '^1^{commit}')) | Select-Object -First 1 }
if (-not $base) { Fail '找不到要比的那一版（上一個 commit）' }
Say ('head ' + $head)
Say ('base ' + $base)
Say 'step checkout'
if (Test-Path -LiteralPath (Join-Path $wt '.git')) {
  if ((Step @('-C', $wt, 'checkout', '-q', '--detach', $head) $err) -ne 0) { Fail ('換不到這一版（那個資料夾裡有改過的檔？）：' + (Last $err)) }
} else {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $wt) | Out-Null
  if ((Step @('-C', $store, 'worktree', 'add', '-q', '--detach', $wt, $head) $err) -ne 0) { Fail ('放不進 ' + $wt + '：' + (Last $err)) }
}
Say 'step prepare'
Step @('-C', $wt, 'diff', '--no-ext-diff', '--no-textconv', $base, $head) ($err + '.diff') | Out-Null
Say 'done'
`;
const PS_CRED = String.raw`# Made by Herdr's Gerrit panel: gives git the Gerrit login from gerrit.json, for the Gerrit's host only.
if ($args[0] -ne 'get') { exit 0 }
$cfg = @CFG@; $want = @HOST@
$h = ''
while ($null -ne ($line = [Console]::In.ReadLine())) { if ($line -eq '') { break }; if ($line.StartsWith('host=')) { $h = $line.Substring(5) } }
if ($h.ToLower() -ne $want) { exit 0 }
$c = [System.IO.File]::ReadAllText($cfg) | ConvertFrom-Json
[Console]::Out.Write("username=" + $c.user + "` + "`n" + String.raw`password=" + $c.http_password + "` + "`n" + String.raw`")
`;

// The job's files for this computer: { files: { name: text }, run: [program, args] }
export function jobFiles(o, windows) {
  const vals = { STATUS: o.status, PROGRESS: o.progress, ERR: o.err, STORE: o.store, NEWSTORE: o.newStore ? "1" : "0", URL: o.url, WT: o.wt,
    N: String(o.n), HEAD_REF: o.headRef, BASE_REF: o.baseRef ?? "", CRED: o.cred ?? "" };
  for (const [k, v] of Object.entries(vals)) if (/[\r\n\0]/.test(String(v))) throw new Error(`${k} 有換行字元`);
  if (!/^refs\/changes\/\d\d\/\d+\/\d+$/.test(vals.HEAD_REF) || (vals.BASE_REF && !/^refs\/changes\/\d\d\/\d+\/\d+$/.test(vals.BASE_REF)))
    throw new Error(`不是 change 的 ref：${vals.HEAD_REF} ${vals.BASE_REF}`);
  if (windows) return { files: { "run.ps1": fill(PS_JOB, vals, psq), ...(o.cred ? { "cred.ps1": fill(PS_CRED, { CFG: o.cfgPath, HOST: o.host }, psq) } : {}) } };
  if (o.cred && o.cred.includes("'")) throw new Error("資料夾的名字有單引號");
  return { files: { "run.sh": fill(SH_JOB, vals, shq), ...(o.cred ? { "cred.sh": fill(SH_CRED, { CFG: o.cfgPath, HOST: o.host }, shq) } : {}) } };
}
// How to start the job in the background and get its pid (exec's stdout), and how to stop it.
export function launchArgs(dir, windows) {
  if (windows) {
    const file = `${dir}/run.ps1`.replace(/\//g, "\\");
    return ["powershell", ["-NoProfile", "-NonInteractive", "-Command",
      `$p = Start-Process -WindowStyle Hidden -PassThru -FilePath powershell -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',${psq(`"${file}"`)}; $p.Id`]];
  }
  return ["/bin/sh", ["-c", 'nohup /bin/sh "$1" </dev/null >/dev/null 2>&1 & echo $!', "sh", `${dir}/run.sh`]];
}
export const stopArgs = (pid, windows) => (windows ? ["taskkill", ["/T", "/F", "/PID", String(pid)]] : ["kill", ["-TERM", String(pid)]]);
// make folders (writeTextFile doesn't)
export const mkdirArgs = (dir, windows) => (windows
  ? ["powershell", ["-NoProfile", "-NonInteractive", "-Command", `New-Item -ItemType Directory -Force -Path ${psq(dir.replace(/\//g, "\\"))} | Out-Null`]]
  : ["/bin/mkdir", ["-p", dir]]);
// A review folder to the Trash / Recycle Bin (never deleted outright), then git forgets the worktree and its refs.
export function trashArgs(dirs, windows) {
  if (windows) return ["powershell", ["-NoProfile", "-NonInteractive", "-Command",
    `Add-Type -AssemblyName Microsoft.VisualBasic; foreach ($d in @(${dirs.map((d) => psq(d.replace(/\//g, "\\"))).join(",")})) { if (Test-Path -LiteralPath $d) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory($d, 'OnlyErrorDialogs', 'SendToRecycleBin') } }`]];
  // macOS: into ~/.Trash under a name that can't clash
  return ["/bin/sh", ["-c", 'for d in "$@"; do [ -e "$d" ] || continue; b=$(basename "$d"); mv "$d" "$HOME/.Trash/$b-$(date +%Y%m%d-%H%M%S)" || exit 1; done', "sh", ...dirs]];
}

// ---------- the panel's side (methods added to the Gerrit view by main.js) ----------
export const REVIEW_JOBS = "gerrit.review.jobs";   // { [change]: job } downloads in progress (and a failed one's words)
export const REVIEW_LIST = "gerrit.review.list";   // [{ n, project, subject, ps, base_ps, head, base, wt, data, store, seq, jump, latest }]
export const REVIEW_OK = "gerrit.review.ok";       // { project: true } you agreed to download it (no clone of it here)
export const REVIEW_DRAFTED = "gerrit.review.drafted"; // { n, at }: change n changed (nvim's drafts saved, a newer patch set): reload it
const LIST_MAX = 50;
const DRAFT_LINES_MAX = 200;
const LATEST_EVERY = 60000;   // how often an open review asks Gerrit for a newer patch set and its comments / drafts
export const quotePs = psq;

// h: what main.js has: herdr's functions, gpui's elements, and the panel's own helpers (ui)
export function reviewMethods(h) {
  const { div, h_flex, v_flex, exec, readTextFile, writeTextFile, openOverlay, run, shared, setShared, terminals, spaces, focused, home, notify, window, ui } = h;
  const win = () => window()?.platform === "windows";
  const homeDir = () => slashes(home()).replace(/\/+$/, "");
  const dataOf = (n) => `${homeDir()}/.config/herdr-app/data/gerrit/review/${n}`;
  const read = async (p) => { try { return await readTextFile(p); } catch { return null; } };
  const put = async (p, text) => writeTextFile(p, text, await read(p));
  const out = (r) => String(r?.stdout ?? "").trim();
  const reviewFile = (e) => `${e.data}/review.json`;
  // the nvim pane showing this review, if one is open (its argv names the review.json)
  const paneOf = (e) => (terminals() ?? []).find((t) => Array.isArray(t?.argv) && t.argv.some((a) => String(a).includes(reviewFile(e).replace(/'/g, "''"))));
  // a space on this computer for nvim (the files are here): the one you're in, else the first
  const localSpace = () => {
    let all = [], f = null;
    try { all = spaces() ?? []; f = focused(); } catch {}
    const here = all.find((s) => s.id === f?.space);
    return (here && !here.machine ? here : all.find((s) => !s.machine))?.id ?? null;
  };

  return {
    reviewEntry(n) { return (shared(REVIEW_LIST) ?? []).find((e) => e.n === n) ?? null; },
    reviewJob(n) { return (shared(REVIEW_JOBS) ?? {})[n] ?? null; },
    setReviewJob(n, j) { const all = { ...(shared(REVIEW_JOBS) ?? {}) }; if (j) all[n] = j; else delete all[n]; setShared(REVIEW_JOBS, all); },
    setReviewEntry(e) { setShared(REVIEW_LIST, [e, ...(shared(REVIEW_LIST) ?? []).filter((x) => x.n !== e.n)].slice(0, LIST_MAX)); },
    dropReviewEntry(n) { setShared(REVIEW_LIST, (shared(REVIEW_LIST) ?? []).filter((x) => x.n !== n)); },

    // Your own clone of the project: gerrit.json review.repos, else a folder under review.search (two levels) whose
    // .git/config has a remote for it on this Gerrit.
    async findClone(project, rc) {
      const own = rc.repos[project];
      if (own) return (await read(`${own}/.git/config`)) != null ? own : null;
      for (const root of rc.search) {
        let dirs = [];
        try {
          const r = win()
            ? await exec("powershell", ["-NoProfile", "-NonInteractive", "-Command",
              `Get-ChildItem -LiteralPath ${psq(root)} -Directory -Depth 1 -ErrorAction SilentlyContinue | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName '.git\\config') -PathType Leaf } | ForEach-Object { $_.FullName }`], { timeout: 20000 })
            : await exec("/bin/sh", ["-c", 'for d in "$1"/*/ "$1"/*/*/; do [ -f "$d.git/config" ] && printf "%s\\n" "${d%/}"; done; exit 0', "sh", root], { timeout: 20000 });
          dirs = String(r?.stdout ?? "").split(/\r?\n/).map(slashes).filter(Boolean);
        } catch {}
        for (const d of dirs) if (remoteUrls(await read(`${d}/.git/config`)).some((u) => sameRepo(u, this.cfg.url, project))) return d;
      }
      return null;
    },

    // 在 nvim 看: the patch set shown (or the two compared) -> download in the background, then nvim
    // want: { base, to } instead of the page's choice (nvim asking for another patch set)
    async reviewStart(c, cx, agreed = false, want = null) {
      const n = c?._number;
      if (!n || this.reviewJob(n)?.state === "running") return;
      this.reviewMsg = { n, finding: true };
      cx.notify();
      const say = (error) => { this.reviewMsg = { n, error }; cx.notify(); };
      try {
        this.cfg = await this.readConfig();
        if (this.cfg.missing || this.cfg.error) return say(this.cfg.error ?? "還沒有 gerrit.json");
        const { base, to } = want ?? this.compare();
        const revs = Object.entries(c.revisions ?? {});
        const headRev = revs.find(([, r]) => r._number === to);
        const baseRev = base != null ? revs.find(([, r]) => r._number === base) : null;
        if (!headRev || (base != null && !baseRev)) return say("Gerrit 沒給這一版的資料：重新整理再試一次");
        const rc = reviewCfg(this.cfg, home());
        const wt = `${rc.root}/${slug(c.project)}-${n}`;
        const clone = await this.findClone(c.project, rc);
        const store = clone ?? `${rc.root}/.repos/${slug(c.project)}.git`;
        if (!clone && !agreed && !(shared(REVIEW_OK) ?? {})[c.project]) { this.reviewMsg = { n, ask: true, wt, store, project: c.project }; cx.notify(); return; }
        if (!clone) setShared(REVIEW_OK, { ...(shared(REVIEW_OK) ?? {}), [c.project]: true });
        const data = dataOf(n), dir = `${data}/job-${Date.now()}`;
        const useCred = this.cfg.auth && !rc.fetchUrl;
        const ref = ([, r]) => r.ref || changeRef(n, r._number);
        const { files } = jobFiles({ status: `${dir}/status`, progress: `${dir}/progress`, err: `${dir}/err`, store, newStore: !clone,
          url: fetchUrl(this.cfg, rc, c.project), wt, n, headRef: ref(headRev), baseRef: baseRev ? ref(baseRev) : "",
          cred: useCred ? `${dir}/cred.${win() ? "ps1" : "sh"}` : "", cfgPath: h.configPath(), host: gerritHost(this.cfg) }, win());
        const [mk, mkArgs] = mkdirArgs(dir, win());
        const m = await exec(mk, mkArgs, { timeout: 20000 });
        if (m.code !== 0) return say(`建不了 ${dir}：${String(m.stderr || m.stdout).trim()}`);
        for (const [name, text] of Object.entries(files)) await writeTextFile(`${dir}/${name}`, text, null);
        const [prog, args] = launchArgs(dir, win());
        const r = await exec(prog, args, { timeout: 20000 });
        const pid = Number(out(r).split(/\s+/).pop());
        if (r.code !== 0 || !pid) return say(`下載程式開不起來：${String(r.stderr || r.stdout).trim() || `exit ${r.code}`}`);
        this.setReviewJob(n, { n, state: "running", dir, pid, at: Date.now(), project: c.project, subject: c.subject ?? "", ps: to, base_ps: base,
          wt, store, data, clone: Boolean(clone), owner: c.owner?._account_id ?? null });
        this.reviewMsg = null;
      } catch (e) { return say(String(e?.message ?? e)); }
      cx.notify();
      return true;
    },
    async reviewCancel(n, cx) {
      const j = this.reviewJob(n);
      if (!j?.pid) return;
      const [p, a] = stopArgs(j.pid, win());
      try { await exec(p, a, { timeout: 10000 }); } catch {}
      this.setReviewJob(n, { ...j, state: "fail", error: "取消了" });
      cx.notify();
    },

    // Every second, in the copy that polls: follow the downloads, then open nvim; save nvim's new comments as drafts.
    async reviewTick(cx) {
      if (this.reviewTicking) return;
      this.reviewTicking = true;
      try {
        for (const j of Object.values(shared(REVIEW_JOBS) ?? {})) {
          if (j.state !== "running") continue;
          const st = parseStatus(await read(`${j.dir}/status`));
          const pr = parseProgress(await read(`${j.dir}/progress`));
          const now = this.reviewJob(j.n);
          if (now?.state !== "running") continue; // cancelled meanwhile
          if (st.fail) { this.setReviewJob(j.n, { ...now, state: "fail", error: st.fail }); await this.reviewWrite(j.n); continue; }
          if (!st.pid && Date.now() - j.at > 30000) { this.setReviewJob(j.n, { ...now, state: "fail", error: `下載程式沒有開始（看 ${j.dir}）` }); await this.reviewWrite(j.n); continue; }
          if (st.done && st.head && st.base) {
            const e = { n: j.n, project: j.project, subject: j.subject, ps: j.ps, base_ps: j.base_ps, head: st.head, base: st.base,
              wt: j.wt, data: j.data, store: j.store, clone: j.clone, at: Date.now(), seq: this.reviewEntry(j.n)?.seq ?? 0,
              owner: j.owner ?? this.reviewEntry(j.n)?.owner ?? null,
              ...(this.reviewEntry(j.n)?.latest ? { latest: this.reviewEntry(j.n).latest } : {}) };
            this.setReviewEntry(e);
            this.setReviewJob(j.n, null);
            await this.reviewWrite(j.n);
            this.reviewOpen(j.n);
            continue;
          }
          const k = `${st.step}|${JSON.stringify(pr)}`;
          if (k !== now.seenKey) {
            this.setReviewJob(j.n, { ...now, step: st.step ?? now.step, progress: pr ?? now.progress, seenKey: k });
            if (this.reviewEntry(j.n)) await this.reviewWrite(j.n); // nvim shows the download too
          }
        }
        await this.reviewLatest();
        await this.reviewFromNvim(cx);
      } finally { this.reviewTicking = false; }
      cx.notify();
    },

    // review.json for nvim: the files, this patch set's comments and your drafts, the base and head, a jump.
    async reviewWrite(n, jump = null) {
      let e = this.reviewEntry(n);
      if (!e) return;
      if (!this.cfg || this.cfg.missing || this.cfg.error) this.cfg = await this.readConfig();
      const older = Number(e.ps) > 1; // older patch sets' unresolved threads, where they are now (Gerrit ports them)
      const [files, comments, drafts, pComments, pDrafts] = await Promise.all([
        this.get(`/changes/${n}/revisions/${e.head}/files${e.base_ps != null ? `?base=${e.base_ps}` : ""}`).catch(() => null),
        this.get(`/changes/${n}/comments`).catch(() => ({})),
        this.cfg.auth ? this.get(`/changes/${n}/drafts`).catch(() => ({})) : {},
        older ? this.get(`/changes/${n}/revisions/${e.head}/ported_comments`).catch(() => ({})) : {},
        older && this.cfg.auth ? this.get(`/changes/${n}/revisions/${e.head}/ported_drafts`).catch(() => ({})) : {},
      ]);
      if (jump) { e = { ...e, seq: (e.seq ?? 0) + 1, jump: { path: jump.path, ...(jump.line ? { line: jump.line } : {}) } }; this.setReviewEntry(e); }
      const old = this.reviewSent?.[n];
      const job = this.reviewJob(n);
      const updating = job ? { to: job.ps, base_ps: job.base_ps ?? null, ...(job.state === "fail" ? { error: String(job.error ?? "") }
        : { step: job.step ?? "init", ...(job.step === "fetch" && job.progress?.percent != null ? { percent: job.progress.percent } : {}) }) } : null;
      const body = { v: 1, change: n, ps: e.ps, base_ps: e.base_ps ?? null, latest: Math.max(Number(e.latest) || 0, Number(e.ps) || 0),
        ...(updating ? { updating } : {}), subject: e.subject, project: e.project,
        url: `${String(this.cfg.url ?? "").replace(/\/+$/, "")}/c/${e.project}/+/${n}/${e.ps}`, dir: e.wt, base: e.base, head: e.head,
        files: files ? reviewFiles(files) : old?.files ?? [],
        comments: reviewComments(comments, drafts, e.ps, ui.who, { comments: pComments, drafts: pDrafts }),
        mine: e.owner != null && e.owner === this.self?._account_id,
        ...(e.jump ? { jump: { ...e.jump, seq: e.seq } } : {}) };
      const text = JSON.stringify(body, null, 1);
      if (old && old.text === text) return;
      try { await put(reviewFile(e), text); (this.reviewSent ??= {})[n] = { text, files: body.files }; }
      catch (err) { notify({ title: "review.json 寫不進去", body: String(err?.message ?? err), level: "warning" }); }
    },
    // nvim for this review: the open pane, else a new tab in a space on this computer
    reviewOpen(n) {
      const e = this.reviewEntry(n);
      if (!e) return;
      const t = paneOf(e);
      if (t) { try { run("pane.focus", { terminal: t.address }); } catch {} return; }
      this.reviewWrite(n).catch(() => {}); // what Gerrit has now (nvim reads it again when it changes)
      const space = localSpace();
      if (!space) { notify({ title: "沒有這台電腦上的 space", body: "nvim 要開在檔案所在的這台電腦：先開一個本機的 space", level: "warning" }); return; }
      openOverlay({ mod: "nvim-jay", props: { review: reviewFile(e), folder: e.wt, name: `review ${n}`, space }, kind: "popup", width: 1, height: 1 });
    },
    // The change's page loaded again (new comments, your drafts): the open review's nvim shows them too.
    reviewRefresh(c) {
      let e = this.reviewEntry(c?._number);
      const last = latestPs(c);
      if (e && last && last !== e.latest) { e = { ...e, latest: last }; this.setReviewEntry(e); }
      if (e && e.owner == null && c?.owner?._account_id != null) { e = { ...e, owner: c.owner._account_id }; this.setReviewEntry(e); }
      if (e && paneOf(e)) this.reviewWrite(e.n).catch(() => {});
    },
    // Once a minute for a review nvim has open: comments and drafts made elsewhere, and a newer patch set (nvim offers to show what it changed).
    async reviewLatest() {
      this.reviewLatestAt ??= {};
      for (const e of shared(REVIEW_LIST) ?? []) {
        if (!paneOf(e) || Date.now() - (this.reviewLatestAt[e.n] ?? 0) < LATEST_EVERY) continue;
        this.reviewLatestAt[e.n] = Date.now();
        const c = await this.get(`/changes/${e.n}?o=CURRENT_REVISION`).catch(() => null);
        const last = latestPs(c), now = this.reviewEntry(e.n);
        if (!now) continue;
        if (!last || last === now.latest) { await this.reviewWrite(e.n); continue; } // comments and drafts made elsewhere (the agent's)
        this.setReviewEntry({ ...now, latest: last });
        await this.reviewWrite(e.n);
        setShared(REVIEW_DRAFTED, { n: e.n, at: Date.now() }); // a page showing it reloads (the newer patch set, its buttons)
      }
    },
    // A file clicked in the panel: the review's nvim (if open) goes there too.
    reviewJump(c, path, line) {
      const e = this.reviewEntry(c?._number);
      if (!e || !paneOf(e)) return;
      this.reviewWrite(e.n, { path, line });
    },
    // What nvim did (from-nvim.jsonl, see the top of this file) -> your Gerrit drafts, another patch set, a question to
    // the agent. The file is emptied once done; a line that failed stays for the next round (and says why).
    async reviewFromNvim(cx) {
      for (const e of shared(REVIEW_LIST) ?? []) {
        if (!paneOf(e)) continue; // only reviews nvim has open write there
        const f = `${e.data}/from-nvim.jsonl`;
        const text = await read(f);
        if (!text || !text.trim()) continue;
        if (!this.cfg?.auth) this.cfg = await this.readConfig();
        if (!this.cfg.auth) {
          if (!this.reviewNoAuth) notify({ title: "nvim 的留言還沒存", body: "要先在 gerrit.json 填帳號和 HTTP 密碼，才能存成 Gerrit 草稿", level: "warning" });
          this.reviewNoAuth = true;
          continue;
        }
        const keep = [];
        let saved = 0;
        this.reviewDone ??= new Set();
        // Gerrit's comments and your drafts with their path (a reply goes where its parent is), read once per round
        let known = null;
        const lookup = async () => {
          if (known) return known;
          const [cm, dr] = await Promise.all([this.get(`/changes/${e.n}/comments`), this.get(`/changes/${e.n}/drafts`)]);
          known = new Map();
          for (const [src, draft] of [[cm, false], [dr, true]]) for (const [path, xs] of Object.entries(src ?? {})) for (const m of xs ?? []) known.set(m.id, { ...m, path, draft });
          return known;
        };
        const where = (m) => ({ path: m.path, ...(m.line ? { line: m.line } : {}), ...(m.range ? { range: m.range } : {}), ...(m.side ? { side: m.side } : {}) });
        for (const line of text.split(/\r?\n/).filter((l) => l.trim()).slice(0, DRAFT_LINES_MAX)) {
          let rec;
          try { rec = JSON.parse(line); } catch { continue; }
          if (!rec?.id || this.reviewDone.has(rec.id)) continue;
          let what = "";
          try {
            if (rec.draft?.path && rec.draft?.message) {
              const d = rec.draft;
              what = `${d.path}:${d.line}`;
              const rev = /^[0-9a-f]{7,64}$/i.test(String(d.head ?? "")) ? d.head : e.head;
              await this.req("PUT", `/changes/${e.n}/revisions/${rev}/drafts`, { path: d.path, ...(Number(d.line) > 0 ? { line: Number(d.line) } : {}), message: String(d.message), unresolved: true });
              saved++;
            } else if (rec.reply?.in_reply_to && rec.reply?.message) {
              const r = rec.reply, parent = (await lookup()).get(r.in_reply_to);
              if (!parent || parent.draft) throw new Error("找不到要回覆的那則留言（被刪了？）");
              what = `${parent.path}:${parent.line ?? ""}`;
              await this.req("PUT", `/changes/${e.n}/revisions/${parent.patch_set}/drafts`, { ...where(parent), in_reply_to: parent.id, message: String(r.message), unresolved: Boolean(r.unresolved) });
              saved++;
            } else if ((rec.edit?.id && rec.edit?.message) || rec.delete?.id) {
              const id = rec.edit?.id ?? rec.delete.id, d = (await lookup()).get(id);
              if (!d?.draft) throw new Error("找不到這則草稿（已經送出或刪掉了？）");
              what = `${d.path}:${d.line ?? ""}`;
              if (rec.edit) await this.req("PUT", `/changes/${e.n}/revisions/${d.patch_set}/drafts/${id}`, { ...where(d), ...(d.in_reply_to ? { in_reply_to: d.in_reply_to } : {}), message: String(rec.edit.message), unresolved: Boolean(d.unresolved) });
              else await this.req("DELETE", `/changes/${e.n}/revisions/${d.patch_set}/drafts/${id}`);
              saved++;
            } else if (rec.update?.to) {
              what = `第 ${rec.update.to} 版`;
              const c = await this.get(`/changes/${e.n}?o=ALL_REVISIONS`);
              const base = rec.update.base != null ? Number(rec.update.base) : null;
              if (!(await this.reviewStart(c, cx, true, { base, to: Number(rec.update.to) }))) throw new Error(this.reviewMsg?.error ?? "沒有開始下載");
              await this.reviewWrite(e.n);
            } else if (rec.suggest?.path && typeof rec.suggest.text === "string") {
              const g = rec.suggest, l1 = Number(g.start), l2 = Number(g.line);
              if (!(l1 > 0 && l2 >= l1)) throw new Error("建議修改的行號不對");
              what = `${g.path}:${l1}${l2 > l1 ? `-${l2}` : ""}`;
              const msg = String(g.message ?? "").trim();
              await this.req("PUT", `/changes/${e.n}/revisions/${e.head}/drafts`, { path: g.path, line: l2,
                range: { start_line: l1, start_character: 0, end_line: l2, end_character: Math.max(0, Number(g.end_char) || 0) },
                message: `${msg ? `${msg}\n\n` : ""}\`\`\`suggestion\n${g.text}\n\`\`\``, unresolved: true });
              saved++;
            } else if (rec.fix?.path) {
              what = `請 agent 改：${rec.fix.path}:${rec.fix.line}`;
              const c = await this.get(`/changes/${e.n}?o=CURRENT_REVISION`);
              const url = `${String(this.cfg.url ?? "").replace(/\/+$/, "")}/c/${e.project}/+/${e.n}/${e.ps}`;
              await this.askAgent(c, { label: "nvim 請改", filled: fixText(e, url, rec.fix) }, cx);
              if (this.ask?.error) notify({ title: "沒有問到 Gerrit agent", body: this.ask.error, level: "warning" });
            } else if (rec.ask?.path) {
              what = `問 agent：${rec.ask.path}:${rec.ask.line}`;
              const c = await this.get(`/changes/${e.n}?o=CURRENT_REVISION`);
              const url = `${String(this.cfg.url ?? "").replace(/\/+$/, "")}/c/${e.project}/+/${e.n}/${e.ps}`;
              await this.askAgent(c, { label: "nvim 問", filled: askText(e, url, rec.ask) }, cx);
              if (this.ask?.error) notify({ title: "沒有問到 Gerrit agent", body: this.ask.error, level: "warning" });
            }
            this.reviewDone.add(rec.id);
          } catch (err) {
            // drafts are tried again a few times (Gerrit away for a moment); a patch set or a question once
            const tries = ((this.reviewTries ??= {})[rec.id] ?? 0) + 1;
            this.reviewTries[rec.id] = tries;
            const again = Boolean(rec.draft || rec.reply || rec.edit || rec.delete || rec.suggest) && tries < 5;
            if (again) keep.push(line);
            if (tries === 1 || !again) notify({ title: "nvim 那邊的動作沒做成", body: `${what}：${String(err?.message ?? err).slice(0, 200)}${again ? "（會再試幾次）" : ""}`, level: "warning" });
          }
        }
        try { await writeTextFile(f, keep.length ? `${keep.join("\n")}\n` : "", text); } catch { /* nvim added one meanwhile: next round */ }
        if (saved) { await this.reviewWrite(e.n); setShared(h.REFRESH, Date.now()); setShared(REVIEW_DRAFTED, { n: e.n, at: Date.now() }); }
      }
    },
    // Every copy, every second: one showing that change reloads it, so the drafts nvim just saved show
    // (the 📝 notice, inside their threads), or a newer patch set, without leaving the page.
    reviewDraftedTick(cx) {
      const d = shared(REVIEW_DRAFTED), at = d?.at ?? 0;
      if (this.reviewDraftedAt === undefined) { this.reviewDraftedAt = at; return; } // from before this copy started
      if (at === this.reviewDraftedAt) return;
      this.reviewDraftedAt = at;
      const c = this.detail?.change;
      if (this.role !== "toggle" && c?._number === d?.n && !this.detail.loading) this.openChange(c, cx, true);
    },
    // The review's folders to the Trash (its worktree and the data folder); git forgets the worktree and its refs.
    async reviewTrash(n, cx) {
      const e = this.reviewEntry(n);
      if (!e) return;
      if (paneOf(e)) { this.reviewMsg = { n, error: "nvim 還開著這個 review：先關掉那一格" }; cx.notify(); return; }
      const [p, a] = trashArgs([e.wt, e.data], win());
      const r = await exec(p, a, { timeout: 60000 }).catch((err) => ({ code: -1, stderr: String(err?.message ?? err) }));
      if (r.code !== 0) { this.reviewMsg = { n, error: `移不到垃圾桶：${String(r.stderr || r.stdout).trim()}` }; cx.notify(); return; }
      for (const args of [["worktree", "prune"], ["update-ref", "-d", `refs/gerrit-review/${n}/head`], ["update-ref", "-d", `refs/gerrit-review/${n}/base`]])
        await exec("git", ["-C", e.store, ...args], { timeout: 20000 }).catch(() => null);
      this.dropReviewEntry(n);
      this.reviewMsg = { n, info: `移到垃圾桶了：${e.wt}` };
      cx.notify();
    },

    // The card on a change's page
    reviewCard(t, z, c) {
      const n = c._number, job = this.reviewJob(n), e = this.reviewEntry(n), msg = this.reviewMsg?.n === n ? this.reviewMsg : null;
      const { base, to } = this.compare();
      const what = `第 ${to} 版${base != null ? `（跟第 ${base} 版比）` : ""}`;
      const card = v_flex().id("review").gap(6).p(10).rounded(8).bg(t.chrome).border_1().border_color(t.border);
      const small = (text, color = t.muted) => div().text_size(z - 1).text_color(color).whitespace_normal().child(text);
      card.child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).text_size(z - 1).font_semibold().text_color(t.muted).child("在 nvim 看（整個檔案、跳到定義）")));
      if (job?.state === "running") {
        const p = job.progress;
        const steps = { init: "準備", fetch: p?.phase ?? "下載", checkout: "放進資料夾", prepare: "整理要比的檔案" };
        const pct = job.step === "fetch" && p?.percent != null ? p.percent : null;
        card.child(small(`下載 ${c.project}（${what}）：${steps[job.step] ?? "開始中"}…`, t.foreground));
        card.child(div().w_full().h(8).rounded(4).bg(t.raised).child(div().h_full().rounded(4).bg(t.accent).w(`${pct ?? (job.step === "fetch" ? 3 : 100)}%`)));
        const nums = [pct != null ? `${pct}%` : "", p?.size ? `${p.size}` : "", p?.speed ?? "", p?.total ? `${p.done}/${p.total} 個物件` : ""].filter(Boolean).join(" · ");
        card.child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).text_size(z - 1).text_color(t.muted).child(nums || (job.step === "fetch" ? "Gerrit 準備中…" : "")))
          .child(this.big(t, z, "rv-cancel", "取消", { on: (cx) => cx.spawn(async (cx) => this.reviewCancel(n, cx)) })));
        return card;
      }
      if (msg?.finding) return card.child(ui.waiting(t, z - 1, "找這台電腦上的副本…"));
      if (msg?.ask) {
        card.child(small(`這台電腦上找不到 ${msg.project} 的 clone。要下載嗎？只下載這個 change 和它的上一個 commit（不含整個歷史）：`, t.foreground));
        card.child(small(`放在 ${msg.wt}（另存一份在 ${msg.store}，之後同一個 project 不用再問）`));
        card.child(small("自己有 clone 的話：在 gerrit.json 的 review.repos 寫它的位置，就用你的那份。"));
        return card.child(h_flex().gap(6)
          .child(this.big(t, z, "rv-yes", "下載", { kind: "primary", on: (cx) => cx.spawn(async (cx) => this.reviewStart(c, cx, true)) }))
          .child(this.big(t, z, "rv-no", "取消", { on: (cx) => { this.reviewMsg = null; cx.notify(); } })));
      }
      if (job?.state === "fail") card.child(div().id("rv-err").text_size(z - 1).text_color(t.ansi1).whitespace_normal().on_mouse_down("right", ui.copyOn(job.error)).child(`沒有下載好：${job.error}`));
      if (msg?.error) card.child(div().id("rv-err2").text_size(z - 1).text_color(t.ansi1).whitespace_normal().on_mouse_down("right", ui.copyOn(msg.error)).child(msg.error));
      if (msg?.info) card.child(small(msg.info));
      const row = h_flex().gap(6).flex_wrap();
      const same = e && e.ps === to && (e.base_ps ?? null) === base;
      if (same) {
        card.child(div().id("rv-wt").text_size(z - 1).text_color(t.muted).whitespace_normal().on_mouse_down("right", ui.copyOn(e.wt)).child(`已下載：${e.wt}`));
        row.child(this.big(t, z, "rv-open", paneOf(e) ? "切到 nvim" : `🔍 在 nvim 看${what}`, { kind: "primary", on: (cx) => { this.reviewOpen(n); cx.notify(); } }));
      } else {
        // the folder holds another patch set / comparison (nvim may have switched it): open that, or change it to this page's
        const open = e && paneOf(e);
        if (e) card.child(small(`資料夾裡是第 ${e.ps} 版${e.base_ps != null ? `（跟第 ${e.base_ps} 版比）` : ""}${open ? "，nvim 開著" : ""}`));
        if (open) row.child(this.big(t, z, "rv-open", "切到 nvim", { kind: "primary", on: (cx) => { this.reviewOpen(n); cx.notify(); } }));
        // a newer patch set than the folder's: only what it changed since (the files the author touched again)
        const since = e && base == null && to > e.ps ? { base: e.ps, to } : null;
        if (since) row.child(this.big(t, z, "rv-since", `🔍 只看第 ${e.ps}→${to} 版改的`, { kind: open ? undefined : "primary", on: (cx) => cx.spawn(async (cx) => { this.setReviewJob(n, null); await this.reviewStart(c, cx, false, since); }) }));
        row.child(this.big(t, z, "rv-start", `🔍 ${e ? "改成看" : "在 nvim 看"}${what}`, { kind: since || open ? undefined : "primary", on: (cx) => cx.spawn(async (cx) => { this.setReviewJob(n, null); await this.reviewStart(c, cx); }) }));
      }
      if (e) {
        const armed = this.armed === `rv-trash-${n}` && Date.now() - this.armedAt <= 4000;
        row.child(this.big(t, z, "rv-trash", armed ? "再按一次：移到垃圾桶" : "清掉資料夾", { kind: armed ? "danger" : undefined, on: (cx) => {
          if (!armed) { this.armed = `rv-trash-${n}`; this.armedAt = Date.now(); cx.notify(); cx.spawn(async (cx) => { await cx.sleep(4100); cx.notify(); }); return; }
          this.armed = null;
          cx.spawn(async (cx) => this.reviewTrash(n, cx));
        } }));
      }
      return card.child(row);
    },
    // The home page's list of review folders (each can go to the Trash from its change's page)
    reviewFolders(t, z) {
      const list = shared(REVIEW_LIST) ?? [];
      if (!list.length) return null;
      const box = v_flex().id("review-folders").px(10).py(6).gap(2).border_t(1).border_color(t.border);
      box.child(div().text_size(z - 1).font_semibold().text_color(t.muted).child(`在 nvim 看過的 change（${list.length} 個資料夾）`));
      for (const e of list) box.child(h_flex().id(`rvf-${e.n}`).gap(6).items_center().text_size(z - 1).px(4).py(2).rounded(4).cursor_pointer().hover((st) => st.bg(t.hover))
        .on_mouse_down("right", ui.copyOn(e.wt)).on_click((_e, cx) => { this.remember?.(); cx.spawn(async (cx) => this.openChange({ _number: e.n, id: String(e.n) }, cx)); })
        .child(div().flex_none().font_family(ui.mono()).text_color(t.muted).child(String(e.n)))
        .child(div().flex_1().min_w(0).truncate().child(e.subject || e.project))
        .child(div().flex_none().text_color(t.dim).child(paneOf(e) ? "nvim 開著" : `第 ${e.ps} 版`)));
      return box;
    },
  };
}
