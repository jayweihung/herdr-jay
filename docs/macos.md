# Herdr + herdr-jay on macOS / 在 Mac 上用

Build Herdr from the official source (plus jay's text patches), then install two mods (and the kit mod if you use kit).
jay's own Mac is built from these same public sources and patches. Checked on Apple Silicon with only the Command Line Tools
(no full Xcode), Herdr app v0.1.15 and core v0.1.21. Intel Macs are fine too: the official releases are
Apple-Silicon-only, so building from source is the way there.
從官方原始碼 build Herdr（加上 jay 的文字補丁），再裝兩個 mod（有用 kit 再加 kit 的 mod）。jay 自己的 Mac 就是這樣裝的。

| Step / 步驟 | |
|---|---|
| [1](#1-tools--工具一次) | Tools (once) / 工具 |
| [2](#2-herdr-core-hc) | Herdr core (`hc`) |
| [3](#3-herdr-app) | Herdr app |
| [4](#4-neovim) | Neovim (≥ 0.11) and optional LSP tools |
| [5](#5-install-herdr-jay--安裝-herdr-jay) | Install herdr-jay / 安裝 |
| [6](#6-try-it--試用) | Try it / 試用 |
| [7](#7-when-something-goes-wrong--出問題時) | When something goes wrong / 出問題時 |
| [8](#8-updating--更新) | Updating / 更新 |

---

## 1. Tools / 工具（一次）

Command Line Tools (clang, git, the macOS SDK; full Xcode not needed), then the rest:

```sh
xcode-select --install
brew install just zig@0.16 rustup neovim
```

(Without Homebrew: rustup from <https://rustup.rs>, Zig 0.16.0 from <https://ziglang.org/download/>.)
`zig@0.16` and `rustup` are keg-only, and Herdr installs its commands into `~/.local/bin`, which macOS doesn't put on
PATH. Add all three once, then open a **new terminal**:

```sh
echo "export PATH=\"\$HOME/.local/bin:$(brew --prefix)/opt/zig@0.16/bin:$(brew --prefix)/opt/rustup/bin:\$PATH\"" >> ~/.zprofile
```

`$(brew --prefix)` is filled in once, now (`/opt/homebrew` on Apple Silicon, `/usr/local` on Intel).

```sh
rustup toolchain install 1.95.0 && rustup default 1.95.0
```

**Check** / 檢查: `zig version` → `0.16.0` (not 0.17: plain `brew install zig` is too new), `rustc --version` →
`rustc 1.95.0`, `just --version`.

**Remove an official Herdr first** (same app id, and it updates itself over yours):
`brew uninstall --cask herdr-app`, or delete `/Applications/Herdr.app` / `~/Applications/Herdr.app` installed from the DMG.
Also an official core: `brew uninstall herdr-core` if Homebrew has it; after step 2, `which -a hc` must show only
`~/.local/bin/hc` (the installer keeps an existing `~/.local/bin/hc`; if `ls -l ~/.local/bin/hc` doesn't point into
`~/.local/share/herdr-core`, delete it and run step 2 again).
先移除官方版 Herdr（和官方 core）。

```sh
mkdir -p ~/src && cd ~/src
git clone https://github.com/jayweihung/herdr-jay.git
```

---

## 2. Herdr core (`hc`)

Install the core **before** the app.

```sh
cd ~/src
git clone --recurse-submodules https://github.com/herdrdev/herdr-core.git
cd herdr-core
git checkout v0.1.21
git rev-parse --short HEAD
git submodule update --init --recursive
```

`git rev-parse` must print `1b0393f` (README versions table). An older clone: `git fetch --tags --force` before
`git checkout`.

**jay's patches** — one for core v0.1.21: `0001`, the record of who sent messages to whom (the Kit panel's 關係 tab;
[patches.md](patches.md)). The one v0.1.19 needed (skip Ghostty's Xcode framework) is in the official source since v0.1.20 (#182).

```sh
ls ~/src/herdr-jay/herdr-core/patches/v0.1.21/
```

It shows `0001-….patch` today; apply the folder's `.patch` files before `just install`:
`git -c user.name=me -c user.email=me@local am -3 ~/src/herdr-jay/herdr-core/patches/v0.1.21/*.patch`

```sh
just install
```

It builds a release, installs `~/.local/share/herdr-core/…/Herdr Core.app` (ad-hoc signed), links
`~/.local/bin/herdr-core` and `~/.local/bin/hc`, and restarts the core server (running terminals are kept).

**Check**: `hc --version` → `hc 0.1.21`; `hc server status --json` shows `"version":"0.1.21"`.

**Never run plain `hc update`**, and never "Update herdr-core" / Install on Herdr's core screen: they replace your
build with the official one. Update as in [step 8](#8-updating--更新).
不要跑 `hc update`，也不要按 Herdr 的更新 core：會換回官方版。

---

## 3. Herdr app

Run from a terminal that has `~/.local/bin` on PATH (step 1): the installer writes that PATH into the app.

```sh
cd ~/src
git clone --recurse-submodules https://github.com/herdrdev/herdr-app.git
cd herdr-app
git checkout v0.1.15
git rev-parse --short HEAD
git submodule update --init --recursive
git -c user.name=me -c user.email=me@local am -3 ~/src/herdr-jay/herdr-app/patches/v0.1.15/*.patch
```

`git rev-parse` must print `9950887` (an older clone: `git fetch --tags --force` first). `git am` applies the five app
patches (drag from a mod onto a space: the Kit panel's 「把 agent 放到 space」; a terminal's own icon: the placed
agent's logo; a drag shows the spaces that won't take it; drop at a place in a space, reorder agents; [patches.md](patches.md)); if it
fails: `git am --abort`, check the tag, try again.
`git am` 套上五個 app patch（mod 的東西可以拖到左邊的 space，Kit 面板「把 agent 放到 space」要用；放好的 agent 用自己的 logo；拖的時候看得出哪個 space 不收；可以放在 space 裡的某個位置，Agents 面板也能拖來排順序）。

```sh
cd ~/src/herdr-app && just install
```

Installs `~/Applications/Herdr.app` (ad-hoc signed) and `~/.local/bin/herdr-app`. A self-built app never updates itself.

**Check**: `herdr-app --version` → `herdr-app 0.1.15`. Open it once (`open ~/Applications/Herdr.app`): it creates
`~/.config/herdr-app/` with `keys.json`, `settings.json` and `mods/`. Then `herdr-app status` answers.
Privacy permissions (microphone, automation…) may have to be granted again after a rebuild.

---

## 4. Neovim

nvim-jay needs **Neovim 0.11 or newer** in `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin` or `/usr/bin`
(Herdr starts panes with a bare PATH, so it looks only there). `brew install neovim` (step 1) is fine.
MacPorts / nix installs: link `nvim` into `~/.local/bin`.

**Check**: `nvim --version` → `NVIM v0.11` or newer.

Optional LSP (go-to-definition, errors): `brew install pyright ruff typescript-language-server`.
TypeScript starts only in projects that have `node_modules/typescript`.

---

## 5. Install herdr-jay / 安裝 herdr-jay

```sh
cd ~/.config/herdr-app/mods
ln -sfn ~/src/herdr-jay/herdr-app/mods/nvim-jay ~/src/herdr-jay/herdr-app/mods/agent-files .
```

Symlinks follow `git pull` in herdr-jay (jay's setup). Copying (`cp -R`) works too, but then copy again after each update.
用連結，herdr-jay `git pull` 之後就是新的。

Keys: open `~/.config/herdr-app/keys.json` and paste **directly under** the line `  "global": {`:

```json
"cmd-e": "mod.open:nvim-jay",
"cmd-o": "mod.open:agent-files",
```

Herdr reloads `keys.json` by itself. Once edited, new Herdr versions no longer add their new default keys to it:
[docs/keys.md](keys.md) lists them per release.

**Check** → both print `check passed: ...`:

```sh
herdr-app check ~/.config/herdr-app/mods/nvim-jay
herdr-app check ~/.config/herdr-app/mods/agent-files
```

**kit** (optional, only if you use kit: kit 0.3.0 or later, installed per kit's own guide): the `kit` mod puts kit's
buttons on every agent pane and its panels in the window; it goes with jay's layout. Install it with
[kit.md → Install](kit.md#install--安裝), then the layout with [layout.md](layout.md).
kit 的 mod（選用，有裝 kit 0.3.0 以上才要）：照 kit.md 的安裝步驟，再照 layout.md 放 jay 的 layout。

---

## 6. Try it / 試用

1. In Herdr, start Claude Code in a terminal in your project folder.
   Codex or omp instead (optional): `codex --version` (→ `codex-cli 0.167.0` or newer; `codex --help` lists
   `--no-daemon`) and `omp --version` (→ `omp/18.18.6` or newer) must work; missing: `brew install --cask codex`,
   `brew install can1357/tap/omp` (or <https://omp.sh>); log in once: `codex login` (check `codex login status`),
   `omp login`. Start Codex as `codex --no-daemon` (Herdr's new-tab menu and the Kit panel do): without it a shared
   Codex daemon runs its commands outside Herdr's terminal. omp isn't in the new-tab menu by default: add
   `{ "programs": { "omp": { "name": "omp", "icon": "icons/pi.svg", "tint": true, "run": ["omp"] } } }` to
   `~/.config/herdr-app/programs.json` (merge if it exists). The steps below are written for Claude Code.
   Codex 要加 `--no-daemon` 才在 Herdr 的終端機裡跑指令；omp 要自己加進 programs.json 才出現在新分頁選單。
2. With its pane focused: `cmd-e` → Neovim on the right, file tree beside it.
3. Ask Claude to read or edit a file → nvim opens it; edits show red `-` / green `+`.
4. `cmd-o` → a popup lists the files Claude read or edited; pick one → it opens in that nvim
   ([agent-files.md](agent-files.md); needs kit 0.4.0, else nvim's own list opens). In nvim: `space o`.
5. Comment a line: `space a c`. Send all comments to Claude: `space a s`.
6. Python / TypeScript: open a file; pyright / TypeScript start by themselves
   ([what they run](nvim-jay.md#3-language-servers--語言伺服器)).

Codex or omp instead of Claude Code: the same, nothing to set up. Optional hooks (Bash snapshots, the reply check)
for Claude Code: [nvim-jay.md §7](nvim-jay.md#7-snapshots-for-bash-edits-optional--bash-改檔的快照選用), §7a; for Codex and omp
(`~/.codex/hooks.json`, `~/.omp/agent/hooks/pre/nvim-jay.js`): [§7b](nvim-jay.md#7b-codex-and-omp--codex-和-omp).
用 Codex 或 omp 也一樣，不用設定；選用的 hook 看 nvim-jay.md §7、§7a、§7b。

All keys and features: [docs/nvim-jay.md](nvim-jay.md). On a space of another machine (Herdr "machines"), the pane opens
there: that machine needs nvim ≥ 0.11, git and `hc`.

---

## 7. When something goes wrong / 出問題時

| What you see / 看到什麼 | Why / 原因 | Fix / 怎麼修 |
|---|---|---|
| `cmd-e` does nothing | key missing or a typo in `keys.json` | `herdr-app status` shows keys.json errors |
| "nvim not found on <host>" | nvim not in the four folders above | `brew install neovim`, or link it into `~/.local/bin` |
| "找不到 hc" inside nvim | `hc` not in `~/.local/bin` | step 2 |
| `herdr-app` / `hc`: command not found | `~/.local/bin` not on PATH | step 1, `~/.zprofile` line; new terminal |
| Core build: `xcodebuild` / xcframework error | jay's core patch not applied | step 2, `git am` |
| Zig errors | wrong Zig | `zig version` must be `0.16.0` (`zig@0.16`) |
| Linker / SDK errors | Command Line Tools missing or broken | `xcode-select --install` |
| Herdr shows a core setup screen | no core, or older than the app needs | **don't press Install / Update there** (it installs the official core); step 2, then quit and reopen Herdr |
| Two Herdrs, or Herdr updates itself | an official app is still installed | step 1, remove it |
| `hc --version` shows another version than you built | `hc update`, "Update herdr-core" or an official installer ran | step 2 `just install` again |

nvim itself (follow, LSP, comments): [docs/nvim-jay.md → 8](nvim-jay.md#8-when-something-goes-wrong--出問題時).

---

## 8. Updating / 更新

Build only the versions in the [README versions table](../README.md#versions--版本); what changed is in the
[CHANGELOG](../CHANGELOG.md). Order: herdr-jay, core, app. **Never plain `hc update`, never "Update herdr-core".**
只 build README 版本表裡的版本。順序：herdr-jay → core → app。

What you have now: `hc --version`, `herdr-app --version`, `git -C ~/src/herdr-jay describe --tags --always`.

```sh
cd ~/src/herdr-jay && git checkout main && git pull
```

If the README tag table names a tag for your Herdr (`for-herdr-v<app>-r<N>`), you may check it out instead of staying on
`main`; follow the docs inside that tag then (`for-herdr-v0.1.15-r1` still has the older `mods/` and `patches/` folders).

Core, then the same for the app (`repo=herdr-app`), only if the table lists a newer version **or the same version with different patches** (2026-11-13: app v0.1.15 got two patches, drag an agent onto a space, then three more, a terminal's own icon, refused drop targets, a place in a space: app only). Set `tag` to the
version from the table. The block runs `just install` only when the tag checked out, the app's
`distribution/core-version` is ≤ `hc --version` (app only), and jay's patches (if any) applied (terminals keep running):

```sh
repo=herdr-core tag=vX.Y.Z
cd ~/src/$repo
git am --abort 2>/dev/null
git fetch --tags --force
git checkout --force "$tag"
git submodule update --init --recursive
rd=~/src/herdr-jay/$repo/patches; pd=$rd/$tag
set -- "$pd"/*.patch(N)
if ! git rev-parse -q --verify "$tag^{commit}" >/dev/null; then echo "no tag $tag"
elif [ "$(git rev-parse HEAD)" != "$(git rev-parse "$tag^{commit}")" ]; then echo "checkout of $tag failed: not installing"
elif [ -d "$rd" ] && [ ! -d "$pd" ]; then echo "no patches for $repo $tag yet: stay on your version"
elif [ "$repo" = herdr-app ] && ! printf '%s\n' "$(cat distribution/core-version)" "$(hc --version | awk '{print $2}')" | sort -V -C; then echo "core too old: needs $(cat distribution/core-version), have $(hc --version)"
else
  { [ -z "$1" ] || git -c user.name=me -c user.email=me@local am -3 "$@"; } && just install
fi
```

A version folder holding only `README.md` means jay checked that tag and it needs no patches. If `git am` fails:
`git am --abort`, run the block again with your old `tag` (the `hc --version` / `herdr-app --version` number with a
`v` in front), and bring the message to jay.

Then: new default keys from [docs/keys.md](keys.md); quit and reopen Herdr; `herdr-app check` each mod (`nvim-jay`,
`agent-files`, and `kit`, `gerrit` if you use them). With symlinks the mods are already current (copied:
copy again). A mod that was renamed or merged (the CHANGELOG says which): link the new folder, remove the old link.
