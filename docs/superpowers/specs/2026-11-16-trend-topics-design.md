# 熱門：主題搜尋、收藏、排列、來源分類（design）

## Why
The 影片 tab has your own topics, ☆ 收藏 and a sort bar; jay wants the same in 熱門, so what he follows (a person, a
company) shows up beside what's hot, from each site, and the list stops being one pile.

## Goals
- **主題**: words you type (＋ 加主題, ✕ to drop, like 影片). Each is searched on HN, PTT, Reddit and Dcard; its results
  are cards in its own section (the same card as now: excerpt, 升溫, also-elsewhere).
- **⭐ 收藏**: ☆ on any card keeps it for good, split by its 主題 or category, as in 影片.
- **排列**: 最熱 / 最新進榜 / 升溫最快 / 留言最多 (one batch, reordered: 熱門 has only one).
- **來源 chips**: HN, Reddit, PTT, Dcard, Threads, Digg beside the categories; one shows only that site's cards.
- Every choice (chip, 排列) remembered across restarts (the page's persisted storage).

## Non-goals
- Threads search (needs a sign-in), any use of jay's sign-ins.
- IPRoyal: jay's call (2026-11-16) is to use it, no root needed; the account goes in `trend/proxy` (local, never in
  this repo), and fetch.js's own requests go through it then. Chrome's pages stay direct (no password on its flag).

## Approaches (picked: A)
- **A. Each site's own public way** (picked): HN's Algolia API; PTT's ALLPOST board search (it copies every board's
  posts, so one request finds the boards), then those boards' own search (pttGet, 5 s apart) for 推 counts; Reddit's
  search page and Dcard's search page in the headless Chrome fetch.js already opens for their 熱門 (Dcard's search
  page carries its results as JSON: tried 2026-11-16).
- B. Reddit's OAuth API: steadier for Reddit, but needs an app registered under an account; later if the page breaks.
- C. A third-party search API (Apify, Bycrawl): costs per call and sends the topics elsewhere.

## Rhythm and blocks (shared IP)
- HN every hour (an official API). PTT, Reddit, Dcard: every hour as jay asked, but one shared block per site with
  feeds (a block of PTT search stops PTT's 熱門 too: 6/12/24 h), a few seconds apart, at most 3 PTT boards a topic.
- Risk: topics × sites requests an hour from one home IP; if a site blocks, it blocks the 熱門 feed too.

## Data
- `trend/topics.txt` one topic a line (like `videos.txt`); `trend/topics.json` the results per topic and site, with
  `first` / score history for 升溫 and 新進榜 (`track()` gets the topic keys); `trend/hot-stars.json` the stars.

## Left to the builder
Card layout details, chip order, how many results per topic and site (start: 10), the PTT board pick (most hits in
ALLPOST).
