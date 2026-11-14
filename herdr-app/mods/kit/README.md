# kit

[kit](../../../docs/kit.md) (a separate tool for the rules, skills and MCP your coding agents use) inside
[Herdr](https://github.com/herdrdev/herdr-app): a Kit button and the context cell on every agent pane, the repository
panel and the Agents panel. It runs the `kit` command (kit 0.3.0 or later) and nothing else; the agents' logos it
draws itself (Zdog).
在 Herdr 裡用 kit：每個 agent 視窗上的 Kit 按鈕、倉庫面板、Agents 面板（每個 agent 有一個動物機器人 logo）。

What it does, what it needs, install, the roles for your own layout: **[docs/kit.md](../../../docs/kit.md)**
(online: <https://github.com/jayweihung/herdr-jay/blob/main/docs/kit.md>).

Files: `main.js` (picks the part by `props.role`), `repo.js`, `agent.js`, `agents.js`, `header.js`, `layout.js`,
`context.js`, `common.js`, `machines.js`, `graph.js`, `timeline.js`, `events.js`, `names.js` (the Agents panel's 關係 tab), `bots.js`, `bot-models.js`, `bot-paint.js` (each says what it holds at the top); `zdog.js`:
Zdog 1.1.3 (MIT), its `js/index.js` bundled as one ES module. Tests: `tests/kit/run.js`, `tests/check-mods.js`.

License: Apache 2.0 (see the repo's LICENSE); Zdog: MIT (Metafizzy, <https://zzz.dog>).
