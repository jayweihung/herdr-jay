// An argv item only nvim-jay's panes carry, so agent-files finds them (not a "claude 'fix nvim-jay'" beside).
// Keep it identical in agent-files/main.js (mods can't import from each other).
export const MARK = "let g:nvim_jay = 1";
// A Gerrit review (the Gerrit panel's 在 nvim 看): the path of its review.json, as a Vim string ('' doubles a quote).
// It opens in a new tab of space (tab.new: a space on this computer, where the files are), in the change's folder;
// nvim.js's REVIEW part does the rest. -> how the launchers open the pane
export const openPane = (run, argv, folder, { review, name, space } = {}) => (review
  ? run("tab.new", { name: name || "review", ...(space ? { space } : {}), folder: folder ?? undefined, argv })
  : run("terminal.open", { folder: folder ?? undefined, argv, place: "right", name: "nvim" }));
export const reviewArgs = (review) => (typeof review === "string" && review && !/[\r\n]/.test(review)
  ? ["--cmd", `let g:nvim_jay_review = '${review.replace(/'/g, "''")}'`] : []);
