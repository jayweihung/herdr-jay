# git-graph + Git button / Git 面板和按鈕

[git-graph](https://github.com/rabeeh-ta/herdr-git-graph) (MIT, by rabeeh-ta) is a Herdr panel with your repo's
commit graph. herdr-jay doesn't include it: install it from its author at the tag below, plus jay's text patch
`herdr-app/patches/git-graph/<tag>/`:

- a branch checkout (double-click or menu) **asks first**, like git-graph's other actions;
- a commit's message is selectable text; a right-click on a hash, author, date, file path, diff line, branch or
  error copies it and says 已複製.

`herdr-app/mods/git-toggle` (in this repo) is the **Git** button in the tab bar that opens and closes it. It needs a
layout with a node `"id": "git-graph-panel"` holding the git-graph mod.
git-graph 從原作者裝，再套 jay 的補丁（切分支前先問、可以選取複製）；Git 按鈕是 herdr-jay 的 git-toggle。

Checked: git-graph **v0.3.1** (Herdr app v0.1.15). Newer git-graph tags are not checked yet.

## macOS

```sh
cd ~/src
git clone https://github.com/rabeeh-ta/herdr-git-graph.git
cd herdr-git-graph
git checkout v0.3.1
git -c user.name=me -c user.email=me@local am -3 ~/src/herdr-jay/herdr-app/patches/git-graph/v0.3.1/*.patch
cd ~/.config/herdr-app/mods
ln -sfn ~/src/herdr-git-graph/mods/git-graph git-graph
ln -sfn ~/src/herdr-jay/herdr-app/mods/git-toggle git-toggle
herdr-app check ~/.config/herdr-app/mods/git-graph
herdr-app check ~/.config/herdr-app/mods/git-toggle
```

## Windows (PowerShell)

```powershell
$j = "$env:USERPROFILE\src\herdr-jay"; $h = "$env:USERPROFILE\.config\herdr-app"
Set-Location "$env:USERPROFILE\src"
git clone https://github.com/rabeeh-ta/herdr-git-graph.git
Set-Location "$env:USERPROFILE\src\herdr-git-graph"
git checkout v0.3.1
git -c user.name=me -c user.email=me@local am -3 (Get-ChildItem "$j\herdr-app\patches\git-graph\v0.3.1\*.patch" | Sort-Object Name).FullName
Remove-Item -Recurse -Force "$h\mods\git-graph", "$h\mods\git-toggle" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$env:USERPROFILE\src\herdr-git-graph\mods\git-graph", "$j\herdr-app\mods\git-toggle" "$h\mods\"
herdr-app check "$h\mods\git-graph" | Out-Host
herdr-app check "$h\mods\git-toggle" | Out-Host
```

**Check**: both print `check passed`. If `git am` fails: `git am --abort`, make sure `git checkout v0.3.1` worked,
try again.
