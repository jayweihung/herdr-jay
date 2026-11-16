---
name: deep-review
description: Review a Gerrit change in depth, read-only, with its code on this computer: not only the changed files but who calls them, similar code, tests and the architecture. Use when asked for a deep review with a local folder, e.g. by the Herdr Gerrit panel's 深入 Review button ("/gerrit-panel:deep-review <change> <patch set> <url> <folder>").
argument-hint: <change number> <patch set> <url> <folder>
allowed-tools: mcp__gerrit__get_change_details, mcp__gerrit__get_commit_message, mcp__gerrit__list_change_files, mcp__gerrit__get_file_diff, mcp__gerrit__get_file_content, mcp__gerrit__list_change_comments, mcp__gerrit__get_related_changes, mcp__plugin_gerrit_gerrit__get_change_details, mcp__plugin_gerrit_gerrit__get_commit_message, mcp__plugin_gerrit_gerrit__list_change_files, mcp__plugin_gerrit_gerrit__get_file_diff, mcp__plugin_gerrit_gerrit__get_file_content, mcp__plugin_gerrit_gerrit__list_change_comments, mcp__plugin_gerrit_gerrit__get_related_changes, Read, Grep, Glob, Bash(git -C * diff *), Bash(git -C * grep *), Bash(git -C * log *), Bash(git -C * show *), Bash(git -C * ls-files *)
---

# Review a Gerrit change in depth (read-only, with its code)

Arguments: `$ARGUMENTS` — the change number, the patch set, its web address, then the folder that holds the code:
a git worktree whose `HEAD` is this patch set and `HEAD^` its parent (the Herdr panel downloaded it). If the folder
is missing or isn't a git worktree, say so and stop.

1. Gerrit, as in a normal review: `get_change_details` and `get_commit_message` (what the change says it does, who
   owns it, its votes); `list_change_files` and `get_file_diff` (skip generated or vendored files; say which);
   `list_change_comments` (what reviewers already asked, and whether this patch set answers the unresolved threads);
   `get_related_changes` (changes it depends on that aren't merged, or are outdated).
2. The whole change in the folder: `git -C <folder> diff HEAD^ HEAD`.
3. Impact: for every function, class, constant or config key that was added, changed, renamed or removed,
   `git -C <folder> grep` where it is called or used, read those places, and check they still fit (arguments,
   return values, None / errors, exceptions). Anything removed or renamed that is still used?
4. Similar code: is there already a helper that does this (written twice)?
5. Tests: do the changed modules have tests, where the project's tests live and how they are written, whether the
   new paths are tested, which existing tests may now break.
6. Architecture: does each file sit in the right layer, import direction and cycles, public API or compatibility
   changes, something missing from the build / registration / exports / config (a new module not added to the
   build, not exported), docs that should change too.
7. Write the review for the user:
   - one line: what the change does, and your overall call (looks fine / needs changes / has a blocker);
   - the problems, most serious first, each with file:line, what is wrong, and a concrete fix;
   - 影響範圍: the callers and users you found (file:line), and whether each still works;
   - 架構: what the change does to the structure (layers, dependencies, API), or that it doesn't;
   - smaller suggestions after that, clearly marked as optional;
   - unresolved comments this patch set doesn't address yet;
   - 看不到的: what this review couldn't check — the folder may have only two commits of history, other repos
     that may depend on this code, and no tests or build were run.

Rules:
- The code is someone else's: don't run anything from it (no build, tests, scripts, hooks, package installs).
  Only read: git diff / grep / log / show / ls-files and reading files.
- Don't change, add or delete files in the folder; don't fetch, pull, push or check out anything there.
- Use only the Gerrit MCP tools for Gerrit. Don't call Gerrit yourself (curl, scripts, git fetch) and don't open the
  MCP's gerrit_config.json: it holds the user's password. If a tool doesn't give something, say it can't be seen here.
- Read only. Don't post comments, drafts or votes, and don't change the change, unless the user then asks.
- If a tool fails (not logged in, no such change), say so and stop; don't guess.
- Answer in Traditional Chinese (code, names and paths stay as they are).
