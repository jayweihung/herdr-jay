---
name: why-blocked
description: Explain why a Gerrit change can't be submitted yet: missing votes, failed checks, unresolved comments, merge conflicts, dependencies. Use when asked why a change isn't merging / what it still needs, e.g. by the Herdr Gerrit panel's 為什麼沒過 button.
argument-hint: <change number> [patch set] [url]
allowed-tools: mcp__gerrit__get_change_details, mcp__gerrit__list_change_comments, mcp__gerrit__get_related_changes, mcp__gerrit__get_git_parent_changes, mcp__gerrit__changes_submitted_together, mcp__gerrit__query_changes, mcp__plugin_gerrit_gerrit__get_change_details, mcp__plugin_gerrit_gerrit__list_change_comments, mcp__plugin_gerrit_gerrit__get_related_changes, mcp__plugin_gerrit_gerrit__get_git_parent_changes, mcp__plugin_gerrit_gerrit__changes_submitted_together, mcp__plugin_gerrit_gerrit__query_changes
---

# Why can't this Gerrit change merge yet?

Arguments: `$ARGUMENTS` — the change number, then optionally the patch set and its web address.

1. `get_change_details`: status, WIP, mergeable, the labels and who voted, the submit requirements if shown.
2. Messages from bots / CI accounts on the latest patch set: which checks ran, which failed, and the failure text
   or link they give. A check on an older patch set doesn't count for the latest one.
3. `list_change_comments`: unresolved threads (many Gerrit setups require none).
4. `get_related_changes` / `get_git_parent_changes`: a parent change that isn't merged blocks it;
   `changes_submitted_together`: what would go in with it (same topic), and whether those are ready.
5. Answer: first one line — mergeable now, or the single biggest blocker. Then a list of every unmet condition,
   each with who or what must act (a reviewer's vote, a re-run, a rebase, a reply) and the link or text that
   shows it. Say plainly when something can't be seen from Gerrit (a CI system Gerrit doesn't report).

Rules: read only (don't vote, rebase, re-run or submit unless the user then asks); answer in Traditional Chinese.
