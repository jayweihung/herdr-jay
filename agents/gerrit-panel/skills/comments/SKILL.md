---
name: comments
description: Sort out the open review comments on a Gerrit change: what each reviewer wants and where. Use when asked to go through / summarize the comments on a change, e.g. by the Herdr Gerrit panel's 整理留言 button.
argument-hint: <change number> [patch set] [url]
allowed-tools: mcp__gerrit__get_change_details, mcp__gerrit__list_change_comments, mcp__gerrit__get_file_diff, mcp__gerrit__get_file_content, mcp__plugin_gerrit_gerrit__get_change_details, mcp__plugin_gerrit_gerrit__list_change_comments, mcp__plugin_gerrit_gerrit__get_file_diff, mcp__plugin_gerrit_gerrit__get_file_content
---

# Go through the open comments on a Gerrit change

Arguments: `$ARGUMENTS` — the change number, then optionally the patch set and its web address.

1. `list_change_comments`: keep the unresolved threads (the latest comment is unresolved).
2. For each thread, read the code it points at (`get_file_content` at that line, on the thread's patch set, or the
   current one if the code moved) so you know what it is about.
3. Write one item per thread, grouped by file in file order:
   - where (file:line, or 整體留言 for patch-set level), who asked;
   - what they want, in one or two plain sentences;
   - what to change to satisfy it, or that it's a question to answer rather than code to change;
   - whether the latest patch set already seems to handle it.
4. End with a short count: N 個未解決，其中 M 個要改程式、K 個只要回答.

Rules: read only (no replies, drafts or votes unless the user then asks); answer in Traditional Chinese.
