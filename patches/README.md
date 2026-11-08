# Patches to Herdr itself / 對 Herdr 本體的修改

jayweihung's own changes to Herdr's source, as plain-text `git format-patch` files.
Most of what herdr-jay adds is mods (no source change); this folder is only for what a mod can't do.
這裡是 jayweihung 對 Herdr 原始碼的修改（純文字 patch）。大部分功能是 mod，不用改原始碼；只有 mod 做不到的才在這裡。

Layout: `patches/<repo>/<official tag>/NNNN-*.patch`, e.g. `patches/herdr-app/v0.1.13/0001-....patch`.
Each set applies on top of exactly that official release tag.
**No folder for a repo = no changes to it**: build the official tag as is.
沒有某個 repo 的資料夾＝沒改它，直接 build 官方版本。

## Apply / 套用

```sh
git clone --recurse-submodules https://github.com/herdrdev/herdr-app.git
cd herdr-app
git checkout v0.1.13                      # the tag the patch folder is named after
git submodule update --init --recursive
git am /path/to/herdr-jay/patches/herdr-app/v0.1.13/*.patch
```

Then build as the official README says. Same for `herdr-core`.
If `git am` fails, your checkout isn't that exact tag: `git am --abort`, check out the tag, try again.

## License

Apache License 2.0, like Herdr and the rest of herdr-jay.
