# agent-files

A key that lists the files the agent read or edited (newest first, then what git shows changed) in a popup; pick
one and it opens in your editor. Works with Claude Code, Codex and omp, on this computer or on another machine.
一個按鍵：跳出 agent 讀過、改過的檔（新的在前，再加 git 的改動），選一個就用你的編輯器打開。

Keys: macOS `"cmd-o": "mod.open:agent-files"`, Windows `"ctrl-shift-j": "mod.open:agent-files"`.
Needs **kit 0.4.0 or later** where the agent runs (`kit files`). More: **[docs/agent-files.md](../../../docs/agent-files.md)**.

It finds nvim-jay's pane by the argv marker in `../nvim-jay/mark.js` (kept identical in `main.js`; tests/nvim-jay
checks that).

License: Apache 2.0 (see the repo's LICENSE).
