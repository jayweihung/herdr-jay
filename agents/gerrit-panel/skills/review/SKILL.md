---
name: review
description: Review a Gerrit change for the user, read-only. Use when asked to review a change, e.g. by the Herdr Gerrit panel's Review button ("/gerrit-panel:review <change> <patch set> <url>").
argument-hint: <change number> [patch set] [url]
allowed-tools: mcp__gerrit__get_change_details, mcp__gerrit__get_commit_message, mcp__gerrit__list_change_files, mcp__gerrit__get_file_diff, mcp__gerrit__get_file_content, mcp__gerrit__list_change_comments, mcp__gerrit__get_related_changes, mcp__plugin_gerrit_gerrit__get_change_details, mcp__plugin_gerrit_gerrit__get_commit_message, mcp__plugin_gerrit_gerrit__list_change_files, mcp__plugin_gerrit_gerrit__get_file_diff, mcp__plugin_gerrit_gerrit__get_file_content, mcp__plugin_gerrit_gerrit__list_change_comments, mcp__plugin_gerrit_gerrit__get_related_changes
---

# Review a Gerrit change (read-only)

Arguments: `$ARGUMENTS` — the change number, then optionally the patch set and its web address.

1. `get_change_details` and `get_commit_message`: what the change says it does, who owns it, its votes.
2. `list_change_files`, then `get_file_diff` for each file (skip generated or vendored files; say which you
   skipped). Use `get_file_content` when a diff needs more around it.
3. `list_change_comments`: what reviewers already asked, so you don't repeat it; note whether the latest patch set
   answers the unresolved threads.
4. Write the review for the user:
   - one line: what the change does, and your overall call (looks fine / needs changes / has a blocker);
   - the problems, most serious first, each with file:line, what is wrong, and a concrete fix;
   - smaller suggestions after that, clearly marked as optional;
   - unresolved comments the latest patch set doesn't address yet.

Rules:
- Read only. Don't post comments, drafts or votes, and don't change the change, unless the user then asks.
- If a tool fails (not logged in, no such change), say so and stop; don't guess.
- Answer in Traditional Chinese (code, names and paths stay as they are).
