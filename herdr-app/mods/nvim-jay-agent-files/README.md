# nvim-jay-agent-files

A key for [nvim-jay](../nvim-jay/README.md): from the agent's pane, jump to the nvim-jay pane in the same tab and
list the files the agent read or edited. Nothing to see on its own: it opens, sends nvim the key, and closes.
nvim-jay 的按鍵：從 agent 跳到同一分頁的 nvim-jay，列出 agent 讀過、改過的檔。

Keys: macOS `"cmd-o": "mod.open:nvim-jay-agent-files"`, Windows `"ctrl-shift-j": "mod.open:nvim-jay-agent-files"`.
More: **[docs/nvim-jay.md](../../../docs/nvim-jay.md)**.

It finds nvim-jay's pane by the argv marker in `../nvim-jay/mark.js` (kept identical in `main.js`; tests/nvim-jay
checks that).

License: Apache 2.0 (see the repo's LICENSE).
