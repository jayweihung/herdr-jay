// The agents' logos (bots): a cute animal-robot head per agent, drawn by the mod itself with Zdog (bot-models.js: the
// animals; bot-paint.js: Zdog into Herdr's own paths): no browser, nothing to install.
// What an agent's logo is lives in its file, so kit push sends it like the rest: `bot: <animal>` (its own colors) or
// `bot: <animal> <color>` in its frontmatter. Without one, its name picks an animal (pickBot): the same everywhere.
// In lists a logo is a still picture: an SVG this file writes once under Herdr's folder
// (data/kit/bots/v<BOT_VERSION>/<animal>[-<color>].svg), shown only once it is there (Herdr remembers an image it
// asked for and didn't find). In an agent's page it is LiveBot: drawn live, it says hello (turns its head, blinks).
import { View, div, image } from "gpui-kit";
import { appHome, readTextFile, writeTextFile, setShared } from "herdr";
import { ANIMALS, COLORS, botScene } from "./bot-models.js";
import { zdogPolygons, polygonsView } from "./bot-paint.js";
import { spin } from "./common.js";

// how the logos look: a new version writes every SVG again (the file name has it)
export const BOT_VERSION = 2;
export const BOTS_TICK = "kit.bots.tick";      // bumped when a logo's SVG is ready (or can't be): every copy draws again

// ---------- what a logo is ----------
const has = (list, key) => list.some((x) => x.key === key);
// "fox" -> { animal: "fox", color: null } (its own colors); "fox sky" -> { animal: "fox", color: "sky" };
// null when it isn't one there is
export function parseBot(text) {
  const [animal, color, ...rest] = String(text ?? "").trim().split(/\s+/);
  if (rest.length || !has(ANIMALS, animal) || (color !== undefined && !has(COLORS, color))) return null;
  return { animal, color: color ?? null };
}
export const botText = (b) => (b.color ? `${b.animal} ${b.color}` : b.animal);
// the logo an agent without `bot:` gets: an animal from its name (FNV-1a) in its own colors, the same everywhere
export function pickBot(name) {
  let h = 0x811c9dc5;
  for (const ch of String(name)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return { animal: ANIMALS[h % ANIMALS.length].key, color: null };
}

// ---------- the agent file's `bot:` ----------
const FRONTMATTER = /^---(\r?\n)([\s\S]*?)\r?\n---(\r?\n|$)/;
// the bot its file names (frontmatter `bot: fox`), or null (no bot: line, or one this mod doesn't know)
export function readBot(text) {
  const fm = FRONTMATTER.exec(String(text ?? ""));
  const line = fm && /^bot[ \t]*:[ \t]*(.*?)[ \t]*$/m.exec(fm[2]);
  return line ? parseBot(line[1].replace(/^["']|["']$/g, "")) : null;
}
// the file with its `bot:` set to bot (null: the line taken out), its line ends kept; null when it has no frontmatter
export function withBot(text, bot) {
  const s = String(text ?? ""), fm = FRONTMATTER.exec(s);
  if (!fm) return null;
  const eol = fm[1], lines = fm[2].split(/\r?\n/);
  const at = lines.findIndex((l) => /^bot[ \t]*:/.test(l));
  if (at >= 0) { if (bot) lines[at] = `bot: ${botText(bot)}`; else lines.splice(at, 1); }
  else if (bot) {
    const desc = lines.findIndex((l) => /^description[ \t]*:/.test(l));
    lines.splice(desc >= 0 ? desc + 1 : lines.length, 0, `bot: ${botText(bot)}`);
  }
  return `---${eol}${lines.join(eol)}${eol}---${fm[3]}${s.slice(fm[0].length)}`;
}

// ---------- the still ones: SVG files ----------
const UNITS = 200;                              // Zdog units across the square: a head with its ears and whiskers fits
const PX = 128;                                 // the SVG's own size (it scales to any)
const STILL = { x: -0.12, y: -0.35, z: 0.06 };  // turned a little, head tilted
function posed(b, pose = STILL) {
  const s = botScene(b.animal, b.color);
  Object.assign(s.head.rotate, pose);
  s.scene.translate.y = 12;
  return s;
}
// the logo as an SVG document. tight: the square just around the drawing (a little margin), for a tab's icon in
// Herdr's lists, where it shares a small box with the programs' icons: the whole square (made for the page's big
// logo, with room around the head) would draw it a size smaller than they are.
export function botSvg(b, tight = false) {
  const polys = zdogPolygons(posed(b).scene, PX, PX / UNITS);
  const n = (v) => String(Math.round(v * 10) / 10);
  let box = `0 0 ${PX} ${PX}`;
  const pts = polys.flatMap((p) => p.pts);
  if (tight && pts.length) {
    const xs = pts.map(([x]) => x), ys = pts.map(([, y]) => y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const side = Math.max(x1 - x0, y1 - y0) * 1.04;
    box = [(x0 + x1 - side) / 2, (y0 + y1 - side) / 2, side, side].map(n).join(" ");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PX}" height="${PX}" viewBox="${box}">\n`
    + polys.map((p) => `<polygon fill="${p.color}" points="${p.pts.map(([x, y]) => `${n(x)},${n(y)}`).join(" ")}"/>`).join("\n")
    + "\n</svg>\n";
}
const DIR = `data/kit/bots/v${BOT_VERSION}`;
const fileName = (b, tight = false) => `${b.animal}${b.color ? `-${b.color}` : ""}${tight ? ".icon" : ""}.svg`;

// file name -> "checking" | "ready" | "failed"
const state = new Map();
let failText = null;
const bump = () => setShared(BOTS_TICK, Date.now());

// its SVG is written (again when what is there isn't this version's drawing)
async function ensure(b, tight = false) {
  const path = `${String(appHome()).replace(/[\\/]+$/, "")}/${DIR}/${fileName(b, tight)}`, svg = botSvg(b, tight);
  const now = await readTextFile(path);
  if (now !== svg) await writeTextFile(path, svg, now);
}
// a logo's tab icon (botSvg tight: <animal>[-<color>].icon.svg), written when it isn't there -> its path under Herdr's
// folder (what tab.new / terminal.icon take), or null when it can't be written
export async function botFile(b) {
  try { await ensure(b, true); return `${DIR}/${fileName(b, true)}`; } catch { return null; }
}
// what the logo's SVG is up to; the first ask writes it when it isn't there
export function botStatus(b) {
  const k = fileName(b), s = state.get(k);
  if (s) return s;
  state.set(k, "checking");
  ensure(b).then(() => state.set(k, "ready"), (e) => { state.set(k, "failed"); failText = `logo 存不進 ${DIR}：${e?.message ?? e}`; })
    .finally(bump);
  return "checking";
}
// why a logo couldn't be written, or null
export const botProblem = () => failText;

// the logo, size px square: its SVG once it's there; a placeholder (turning while it's written) until then
export function botIcon(t, b, size) {
  const s = botStatus(b);
  if (s === "ready") return image(`${DIR}/${fileName(b)}`).size(size).flex_none();
  const box = div().size(size).flex_none().rounded(size / 4).bg(t.raised).flex().items_center().justify_center();
  return s === "failed" ? box.text_color(t.dim).text_size(size / 2.6).child("?") : box.child(spin(Math.max(10, size / 3), t.dim));
}

// ---------- the live one ----------
const FPS = 30, HELLO = 3.2, BLINK_EVERY = 4.5, BLINK = 0.18;
// One agent's logo drawn live (a view: cx.new(LiveBot, { animal, color, size })). When it appears, when its bot
// changes and when it's clicked, it says hello: turns its head side to side and back, blinks; then it keeps still and
// blinks now and then. Still, it costs nothing: the timer only draws while something moves.
export class LiveBot extends View {
  init(p, cx) {
    this.size = p.size ?? 80;
    this.update(p);
    cx.timer.every(Math.round(1000 / FPS), (cx) => { if (this.draw()) cx.notify(); });
  }
  update(p) {
    if (p.animal === this.animal && p.color === this.color) return;
    this.animal = p.animal; this.color = p.color ?? null;
    this.bot = posed({ animal: this.animal, color: this.color });
    this.hello();
  }
  hello() { this.since = Date.now(); this.moving = true; this.draw(true); }
  // the pose now; true when it changed (something to draw)
  draw(force = false) {
    const age = (Date.now() - this.since) / 1000, b = this.bot;
    const blinkAt = age % BLINK_EVERY, blink = blinkAt > BLINK_EVERY - BLINK ? Math.sin(((blinkAt - (BLINK_EVERY - BLINK)) / BLINK) * Math.PI) : 0;
    const waving = age < HELLO;
    if (!force && !waving && !this.moving && blink === 0 && !this.blinking) return false;
    const k = waving ? 1 - age / HELLO : 0;   // the wave fades out into the still pose
    b.head.rotate.y = STILL.y + Math.sin(age * 4.2) * 0.55 * k;
    b.head.rotate.x = STILL.x + Math.sin(age * 6.5) * 0.06 * k;
    b.head.rotate.z = STILL.z + Math.sin(age * 3.1) * 0.08 * k;
    b.blink(waving && age > 0.9 && age < 1.1 ? Math.sin(((age - 0.9) / 0.2) * Math.PI) : blink);
    this.moving = waving; this.blinking = blink > 0;
    this.polys = zdogPolygons(b.scene, this.size, this.size / UNITS);
    return true;
  }
  render() {
    return div().id("kit-live-bot").flex_none().cursor_pointer()
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => { this.hello(); cx.notify(); })
      .child(polygonsView(this.polys ?? [], this.size));
  }
}
