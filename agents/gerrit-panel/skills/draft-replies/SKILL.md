---
name: draft-replies
description: Draft replies to the open review comments on the user's Gerrit change, shown to the user first and saved as Gerrit drafts only after they agree. Use when asked to help answer comments, e.g. by the Herdr Gerrit panel's 幫我回覆 button.
argument-hint: <change number> [patch set] [url]
allowed-tools: mcp__gerrit__get_change_details, mcp__gerrit__list_change_comments, mcp__gerrit__get_file_content, mcp__gerrit__get_file_diff, mcp__gerrit__list_draft_comments, mcp__gerrit__post_draft_comment, mcp__plugin_gerrit_gerrit__get_change_details, mcp__plugin_gerrit_gerrit__list_change_comments, mcp__plugin_gerrit_gerrit__get_file_content, mcp__plugin_gerrit_gerrit__get_file_diff, mcp__plugin_gerrit_gerrit__list_draft_comments, mcp__plugin_gerrit_gerrit__post_draft_comment
---

# Draft replies to open comments

Arguments: `$ARGUMENTS` — the change number, then optionally the patch set and its web address.

1. `list_change_comments`: the unresolved threads; `list_draft_comments`: drafts the user already has (don't
   duplicate them).
2. For each thread, read the code it is about and the latest patch set: if the request is already done, the reply
   says where ("Done in patch set N: …"); if it's a question, answer it; if the user would have to decide, write
   the reply with a clear [你決定：…] gap instead of guessing.
3. Show all drafts to the user first, numbered, each under the comment it answers. Write each reply in the
   language the reviewer used; talk to the user in Traditional Chinese.
4. Only after the user says which ones are fine: save those with `post_draft_comment` and `in_reply_to` (drafts,
   not published), and say they can review and send them in Gerrit or the Herdr panel.

Rules: never publish comments or vote; never save a draft the user hasn't approved.
