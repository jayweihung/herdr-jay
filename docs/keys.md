# New Herdr default keys per release / 各版新增的預設按鍵

Herdr writes its default keys into `keys.json` only while you haven't edited it. Once you added the jay-nvim keys,
new versions **don't add their new default keys** for you. This page lists them per release, ready to paste into the
`"global": {` section (or the section named), and says whether one clashes with the jay-nvim keys.
改過 `keys.json` 之後，新版 Herdr 不會再幫你加新的預設按鍵；這裡列出每一版新增的，照貼就好。

Check it yourself (any OS, no script), in your herdr-app checkout:

```sh
git diff v0.1.13 v0.1.14 -- defaults/keys.json defaults/keys.macos.json
```

(`defaults/keys.macos.json` is macOS, `defaults/keys.json` is Windows / Linux.)

## v0.1.14

No default key changes (macOS and Windows / Linux). The jay-nvim keys are still free. Nothing to add.

## v0.1.13

Baseline: the jay-nvim keys are free (`cmd-e` / `cmd-o` on macOS, `ctrl-shift-i` / `ctrl-shift-j` on Windows).
Nothing to add.
