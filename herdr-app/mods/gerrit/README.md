# gerrit

Gerrit beside your coding agents, inside [Herdr](https://github.com/herdrdev/herdr-app): a dashboard like Gerrit's
own (輪到你 / 我送出的 / 等我 review / CC / 最近合併), a change's votes, comment threads, files and diffs, replies, and
notifications.
在 Herdr 裡看 Gerrit：清單、change 的細節、留言、通知。

Setup (`gerrit.json`, the HTTP password), what you see, the Gerrit agent: **[docs/gerrit.md](../../../docs/gerrit.md)**
(online: <https://github.com/jayweihung/herdr-jay/blob/main/docs/gerrit.md>).

Files: `main.js` (the panel and its tab-bar button), `claude-plugin/` (the `gerrit-panel` Claude Code plugin: the
skills the 問 agent buttons call, loaded with `--plugin-dir`; see docs/gerrit.md §8 step 5). Tests: `tests/gerrit/run.js`.

License: Apache 2.0 (see the repo's LICENSE).
