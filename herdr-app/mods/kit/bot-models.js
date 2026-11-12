// The cute animal-robot heads in Zdog: a round, mochi-like head (its faces in lighter and darker paint stand in for
// light, Zdog has none), a dark screen for a face with big sparkly glowing eyes and pink cheeks, ear pods. Each animal
// has its own colors (its paint, its eyes' glow, its details) and something only it has: the cat's tabby stripes, the
// fox's black ear tips and white cheeks, the rabbit's folded ear, the bear's muzzle, the owl's goggles, the frog's
// crown, the penguin's curl, the dog's spot and tongue, the panda's bamboo leaf, the mouse's big ears.
// botScene(animal, color) -> { scene, head, blink(k) }: color null = the animal's own; turn head (head.rotate),
// blink(0..1) closes the eyes. Zdog's units: the head is about 112 wide; +y is down, +z toward you.
import Zdog from "./zdog.js";

const TAU = Zdog.TAU;

// main: the paint; glow: the eyes and lights; the rest: the animal's details
export const ANIMALS = [
  { key: "cat", name: "貓", main: "#ffb054", glow: "#b6ff7a", stripe: "#e8863a" },
  { key: "fox", name: "狐狸", main: "#ff7a3a", glow: "#ffd76b" },
  { key: "rabbit", name: "兔子", main: "#f6eef1", glow: "#ff8fc0" },
  { key: "bear", name: "熊", main: "#b98458", glow: "#7fe8ff", muzzle: "#f1d4b0" },
  { key: "owl", name: "貓頭鷹", main: "#8f72d9", glow: "#ffe36b", disc: "#ddd2fa" },
  { key: "frog", name: "青蛙", main: "#6fcf62", glow: "#efff8a" },
  { key: "penguin", name: "企鵝", main: "#3d4c78", glow: "#8fe3ff" },
  { key: "dog", name: "狗", main: "#f2bf76", glow: "#8fffd0", patch: "#b9824a" },
  { key: "panda", name: "熊貓", main: "#f7f6f2", glow: "#8fe3ff" },
  { key: "mouse", name: "老鼠", main: "#bcc3d1", glow: "#ff9ad5" },
];
// another paint for any animal (its details keep their own colors)
export const COLORS = [
  { key: "amber", name: "琥珀", hex: "#f5a524", glow: "#5ff0ff" }, { key: "coral", name: "珊瑚", hex: "#ff6b57", glow: "#5ff0ff" },
  { key: "rose", name: "玫瑰", hex: "#f2669f", glow: "#7af6ff" }, { key: "violet", name: "紫", hex: "#8b6cff", glow: "#ffe36b" },
  { key: "sky", name: "天藍", hex: "#3f9dff", glow: "#ffe36b" }, { key: "teal", name: "青綠", hex: "#16b3a6", glow: "#ffe36b" },
  { key: "mint", name: "薄荷", hex: "#4fd39a", glow: "#ff7fcf" }, { key: "lime", name: "萊姆", hex: "#9ccb2c", glow: "#5ff0ff" },
  { key: "gold", name: "金", hex: "#e0b43a", glow: "#5ff0ff" }, { key: "steel", name: "鋼", hex: "#9aa5b5", glow: "#5ff0ff" },
];

// hex a share of the way to another color
function mix(hex, to, k) {
  const a = parseInt(hex.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}
const WHITE = "#fff8f0", INK = "#262a33", PINK = "#ffa3c1", NOSE = "#ff7fa6", ORANGE = "#ffa53b", METAL = "#aeb6c4",
  GLASS = "#161b26", BLUSH = "#ff8cba", SHINE = "#ffffff", GOLD = "#ffd34d", LEAF = "#5fc35a";

// head: W x H x D box, rounded by its big stroke S (a soft, mochi-like block); the face's front at FZ
const W = 60, H = 48, D = 50, S = 52, TOP = -(H / 2 + S / 2), SIDE = W / 2 + S / 2, FZ = D / 2 + S / 2;

export function botScene(animal, colorKey = null) {
  const kind = ANIMALS.find((a) => a.key === animal) ?? ANIMALS[0];
  const paint = COLORS.find((c) => c.key === colorKey);
  const main = paint?.hex ?? kind.main, glow = paint?.glow ?? kind.glow;
  const dark = mix(main, "#000000", 0.22), light = mix(main, "#ffffff", 0.45);
  const scene = new Zdog.Anchor();
  const head = new Zdog.Anchor({ addTo: scene });
  // Zdog draws shapes far to near by each one's own depth; things this close together would cut into each other as
  // the head turns. A Group draws its shapes in the order they were added, as one: everything on the front of the
  // face (z at FZ or more) goes into face, an ear's (a pod's ...) parts into a group of their own.
  const face = new Zdog.Group({ addTo: head, translate: { z: FZ } });
  const eyes = [], glints = [];
  const add = (Kind, o) => {
    const z = o.translate?.z ?? 0;
    return z >= FZ - 1 ? new Kind({ ...o, addTo: face, translate: { ...o.translate, z: z - FZ } }) : new Kind({ ...o, addTo: head });
  };
  const group = (o) => new Zdog.Group({ addTo: head, ...o });
  const shape = (o) => (o.addTo ? new Zdog.Shape(o) : add(Zdog.Shape, o));
  const dot = (x, y, z, size, color, to) => shape({ addTo: to, translate: { x, y, z }, stroke: size, color });
  const line = (path, stroke, color, o = {}) => shape({ path, stroke, color, closed: false, ...o });
  const ellipse = (o) => (o.addTo ? new Zdog.Ellipse(o) : add(Zdog.Ellipse, o));

  // ---------- the robot every bot is ----------
  function skull(paintHex = main, size = {}) {
    add(Zdog.Box, { width: W, height: H, depth: D, stroke: S, ...size, color: paintHex, frontFace: paintHex,
      topFace: mix(paintHex, "#ffffff", 0.25), leftFace: mix(paintHex, "#000000", 0.08), rightFace: mix(paintHex, "#000000", 0.08),
      bottomFace: mix(paintHex, "#000000", 0.22), rearFace: mix(paintHex, "#000000", 0.18) });
  }
  function screen(w = 76, h = 46, y = 6) {
    add(Zdog.RoundedRect, { width: w, height: h, cornerRadius: 18, stroke: 6, fill: true, color: GLASS, translate: { y, z: FZ + 1 } });
  }
  // a glowing eye with two glints (a big one top left, a small one bottom right)
  function eye(x, y, { w = 15, h = 18, z = FZ + 5, to } = {}) {
    eyes.push(ellipse({ addTo: to, width: w, height: h, stroke: 2, fill: true, color: glow, translate: { x, y, z } }));
    glints.push(dot(x - w * 0.24, y - h * 0.24, z + 1, w * 0.36, SHINE, to));
    glints.push(dot(x + w * 0.22, y + h * 0.24, z + 1, w * 0.16, SHINE, to));
  }
  function eyesRound({ x = 16, y = 4, w, h } = {}) { for (const s of [-1, 1]) eye(s * x, y, { w, h }); }
  // happy eyes: arcs (∩); a half ellipse is its right half, turned a quarter the other way
  function eyesHappy({ x = 16, y = 6 } = {}) {
    for (const s of [-1, 1]) eyes.push(ellipse({ diameter: 15, quarters: 2, rotate: { z: -TAU / 4 }, stroke: 4, color: glow, translate: { x: s * x, y: y + 3, z: FZ + 5 } }));
  }
  function cheeks({ x = 29, y = 18, z = FZ + 5, w = 11, h = 6 } = {}) {
    for (const s of [-1, 1]) ellipse({ width: w, height: h, stroke: 3, fill: true, color: BLUSH, translate: { x: s * x, y, z } });
  }
  // a small smile (∪); two side by side make a cat's ω
  const smile = (x, y, d = 7) => ellipse({ diameter: d, quarters: 2, rotate: { z: TAU / 4 }, stroke: 2.4, color: glow, translate: { x, y, z: FZ + 5 } });
  function pods(paintHex = METAL, y = 4) {
    for (const s of [-1, 1]) {
      const g = group({ translate: { x: s * (SIDE + 2), y } });
      new Zdog.Cylinder({ addTo: g, diameter: 24, length: 8, color: paintHex, backface: mix(paintHex, "#000000", 0.25), rotate: { y: TAU / 4 } });
      new Zdog.Ellipse({ addTo: g, diameter: 13, stroke: 3, color: glow, rotate: { y: TAU / 4 }, translate: { x: s * 5 } });
    }
  }
  function antenna(x = 0, tip = glow) {
    line([{ y: 0 }, { y: -16 }], 3, METAL, { translate: { x, y: TOP + 4, z: -4 } });
    dot(x, TOP - 15, -4, 12, tip);
  }
  function whiskers(y = 22) {
    for (const s of [-1, 1]) for (const k of [-1, 1]) {
      line([{ x: 0 }, { x: s * 20, y: k * 4 }], 1.8, METAL, { translate: { x: s * (SIDE - 2), y: y + k * 3, z: FZ - 14 } });
      dot(s * (SIDE + 18), y + k * 7, FZ - 14, 4, glow);
    }
  }
  // a rounded triangle ear, tilted out; inside it a smaller one, at its top an optional tip
  function pointyEar(s, { x, w, h, tilt, color = main, inner = PINK, tip = null, y = TOP + 10 }) {
    const g = group({ translate: { x: s * x, y }, rotate: { z: s * tilt } });
    new Zdog.Shape({ addTo: g, path: [{ x: -w / 2, y: 0 }, { x: w / 2, y: 0 }, { x: 0, y: -h }], stroke: 12, fill: true, color });
    if (tip) new Zdog.Shape({ addTo: g, path: [{ x: -w / 5, y: -h * 0.7 }, { x: w / 5, y: -h * 0.7 }, { x: 0, y: -h }], stroke: 12, fill: true, color: tip });
    if (inner) new Zdog.Shape({ addTo: g, path: [{ x: -w / 4, y: -4 }, { x: w / 4, y: -4 }, { x: 0, y: -h * 0.6 }], stroke: 6, fill: true, color: inner, translate: { z: 6 } });
  }
  function roundEars(color, inner, { x = 36, y = TOP + 8, size = 30 } = {}) {
    for (const s of [-1, 1]) {
      const g = group({ translate: { x: s * x, y, z: -4 } });
      dot(0, 0, 0, size, color, g);
      if (inner) dot(0, 1, 6, size * 0.45, inner, g);
    }
  }
  const nose = (y, z, color = INK, w = 9, h = 7) => ellipse({ width: w, height: h, stroke: 3, fill: true, color, translate: { y, z } });

  // ---------- the animals ----------
  const ANIMAL = {
    cat() {
      skull(); screen(); eyesRound(); cheeks(); pods(); whiskers();
      for (const s of [-1, 1]) pointyEar(s, { x: 30, w: 32, h: 26, tilt: 0.22 });
      // tabby stripes on the forehead
      for (const x of [-11, 0, 11]) line([{ y: 0 }, { y: 7 }], 5, kind.stripe, { translate: { x, y: -36 + (x ? 2 : 0), z: FZ } });
      shape({ path: [{ x: -3, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 2.5 }], stroke: 2.5, fill: true, color: NOSE, translate: { y: 12, z: FZ + 5 } });
      smile(-3.5, 16, 7); smile(3.5, 16, 7);
    },
    fox() {
      skull(); screen(74, 42, 2); eyesRound({ y: 1, h: 16 }); cheeks({ y: 14 }); pods(METAL, -2);
      for (const s of [-1, 1]) pointyEar(s, { x: 31, w: 32, h: 38, tilt: 0.16, inner: WHITE, tip: INK });
      ellipse({ width: 26, height: 14, stroke: 8, fill: true, color: WHITE, translate: { y: 33, z: FZ + 3 } });
      nose(29, FZ + 10, INK, 8, 6);
    },
    rabbit() {
      skull(); screen(); eyesRound(); cheeks(); pods(PINK); smile(0, 16);
      // one ear up, one folded over
      const ears = [[{ y: 0 }, { y: -40 }], [{ y: 0 }, { y: -24 }, { x: 16, y: -32 }]];
      [-1, 1].forEach((s, i) => {
        const g = group({ translate: { x: s * 17, y: TOP + 6 }, rotate: { z: s * 0.12 } });
        line(ears[i], 20, main, { addTo: g, translate: { z: -4 } });
        line(ears[i].map((p, j) => (j === 0 ? { y: -4 } : p)), 8, PINK, { addTo: g, translate: { z: 4 } });
        shape({ path: [{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 5 }, { x: -2, y: 5 }], stroke: 2, fill: true, color: SHINE, translate: { x: s * 3, y: 32, z: FZ } });
      });
      nose(12, FZ + 5, NOSE, 5, 3.5);
    },
    bear() {
      skull(); screen(76, 40, -2); eyesRound({ y: -3, w: 14, h: 16 }); cheeks({ y: 10, x: 30 }); pods(); antenna(0);
      roundEars(main, kind.muzzle);
      ellipse({ width: 30, height: 18, stroke: 10, fill: true, color: kind.muzzle, translate: { y: 30, z: FZ + 4 } });
      nose(25, FZ + 11, INK, 11, 7);
      ellipse({ diameter: 6, quarters: 2, rotate: { z: TAU / 4 }, stroke: 2.4, color: INK, translate: { y: 32, z: FZ + 11 } });
    },
    owl() {
      skull(); pods(dark);
      // the light face disc and the goggles (no screen: its eyes are the lenses)
      for (const s of [-1, 1]) dot(s * 16, 6, FZ, 40, kind.disc);
      for (const s of [-1, 1]) {
        ellipse({ diameter: 30, stroke: 5, fill: true, color: GLASS, translate: { x: s * 17, y: 4, z: FZ + 3 } });
        ellipse({ diameter: 32, stroke: 4, color: METAL, translate: { x: s * 17, y: 4, z: FZ + 4 } });
        eye(s * 17, 4, { w: 15, h: 15, z: FZ + 6 });
        pointyEar(s, { x: 40, w: 14, h: 14, tilt: 0.85, color: dark, inner: null, y: TOP + 4 });
      }
      line([{ x: -3 }, { x: 3 }], 4, METAL, { translate: { y: 4, z: FZ + 4 } });
      shape({ path: [{ x: -5, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 8 }], stroke: 4, fill: true, color: ORANGE, translate: { y: 22, z: FZ + 6 } });
      cheeks({ x: 32, y: 26 });
    },
    frog() {
      skull(main, { width: 70, height: 40 });
      add(Zdog.RoundedRect, { width: 70, height: 22, cornerRadius: 11, stroke: 6, fill: true, color: GLASS, translate: { y: 14, z: FZ + 1 } });
      ellipse({ width: 10, height: 36, quarters: 2, rotate: { z: TAU / 4 }, stroke: 3, color: glow, translate: { y: 12, z: FZ + 5 } });
      for (const s of [-1, 1]) {
        // on the face's group (drawn after the head's front, which it sits above), FZ back from it
        const g = new Zdog.Group({ addTo: face, translate: { x: s * 27, y: TOP + 12, z: 10 - FZ } });
        dot(0, 0, 0, 38, main, g);
        dot(0, 0, 12, 24, GLASS, g);
        eye(0, 0, { w: 12, h: 14, z: 25, to: g });
        ellipse({ width: 12, height: 6, stroke: 3, fill: true, color: BLUSH, translate: { x: s * 42, y: 28, z: FZ - 6 } });
      }
      // a little crown
      const crown = group({ translate: { y: TOP - 4, z: 2 } });
      new Zdog.Shape({ addTo: crown, path: [{ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 11, y: -12 }, { x: 5, y: -6 }, { x: 0, y: -14 }, { x: -5, y: -6 }, { x: -11, y: -12 }], stroke: 3, fill: true, color: GOLD });
      dot(0, -4, 2, 4, NOSE, crown);
      pods(METAL, 8);
    },
    penguin() {
      skull(); pods();
      // the white heart of its face
      for (const s of [-1, 1]) dot(s * 15, -2, FZ - 1, 40, WHITE);
      ellipse({ width: 52, height: 34, stroke: 10, fill: true, color: WHITE, translate: { y: 16, z: FZ - 1 } });
      screen(62, 32, 0); eyesRound({ x: 13, y: 0, w: 12, h: 15 });
      cheeks({ x: 30, y: 22, z: FZ + 3, w: 10 });
      shape({ path: [{ x: -7, y: 0 }, { x: 7, y: 0 }, { x: 0, y: 7 }], stroke: 5, fill: true, color: ORANGE, translate: { y: 22, z: FZ + 8 } });
      // its curl
      line([{ x: 0, y: 0 }, { bezier: [{ x: 0, y: -12 }, { x: 12, y: -16 }, { x: 12, y: -7 }] }, { bezier: [{ x: 12, y: -2 }, { x: 5, y: -1 }, { x: 5, y: -6 }] }],
        6, mix(main, "#000000", 0.25), { translate: { y: TOP + 2, z: 4 } });
    },
    dog() {
      skull();
      // a spot around one eye, peeking out from behind the screen
      dot(26, -18, FZ - 1, 34, kind.patch);
      screen(76, 40, 0); eyesHappy({ y: -2 }); cheeks({ y: 12 }); antenna(-14);
      for (const s of [-1, 1]) line([{ y: 0 }, { y: 26 }], 24, kind.patch, { translate: { x: s * (SIDE - 2), y: TOP + 18 }, rotate: { z: -s * 0.4 } });
      ellipse({ width: 30, height: 16, stroke: 10, fill: true, color: light, translate: { y: 31, z: FZ + 4 } });
      nose(26, FZ + 11, INK, 12, 8);
      ellipse({ width: 8, height: 9, stroke: 3, fill: true, color: NOSE, translate: { y: 40, z: FZ + 8 } });
    },
    panda() {
      skull(); pods(LEAF);
      roundEars(INK, null, { size: 32 });
      for (const s of [-1, 1]) {
        ellipse({ width: 24, height: 30, stroke: 4, fill: true, color: INK, rotate: { z: -s * 0.5 }, translate: { x: s * 17, y: 2, z: FZ + 1 } });
        eye(s * 17, 2, { w: 12, h: 14, z: FZ + 4 });
      }
      cheeks({ x: 33, y: 22, z: FZ + 2 });
      ellipse({ width: 22, height: 12, stroke: 8, fill: true, color: WHITE, translate: { y: 26, z: FZ + 3 } });
      nose(22, FZ + 9, INK, 9, 6);
      // a bamboo leaf on its head
      const leaf = group({ translate: { x: 6, y: TOP - 2, z: 6 }, rotate: { z: 0.5 } });
      new Zdog.Shape({ addTo: leaf, path: [{ x: 0, y: 0 }, { bezier: [{ x: 9, y: -6 }, { x: 9, y: -20 }, { x: 0, y: -28 }] }, { bezier: [{ x: -9, y: -20 }, { x: -9, y: -6 }, { x: 0, y: 0 }] }], stroke: 3, fill: true, color: LEAF });
      new Zdog.Shape({ addTo: leaf, path: [{ y: -2 }, { y: -22 }], stroke: 1.5, color: mix(LEAF, "#000000", 0.25), translate: { z: 1 } });
    },
    mouse() {
      skull(); screen(); eyesRound(); cheeks(); whiskers(26);
      for (const s of [-1, 1]) {
        const g = group({ translate: { x: s * 42, y: TOP - 2, z: -8 }, rotate: { z: s * 0.2 } });
        new Zdog.Ellipse({ addTo: g, diameter: 42, stroke: 6, fill: true, color: main });
        new Zdog.Ellipse({ addTo: g, diameter: 26, stroke: 4, fill: true, color: PINK, translate: { z: 4 } });
      }
      pods();
      ellipse({ width: 18, height: 12, stroke: 8, fill: true, color: light, translate: { y: 32, z: FZ + 4 } });
      nose(30, FZ + 10, NOSE, 7, 6);
      shape({ path: [{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 4 }, { x: -2, y: 4 }], stroke: 2, fill: true, color: SHINE, translate: { y: 38, z: FZ + 6 } });
    },
  };
  ANIMAL[kind.key]();
  return {
    scene, head,
    // 0 open .. 1 shut: the eyes squash to a line, their glints go
    blink(k) { for (const e of eyes) e.scale.y = Math.max(0.08, 1 - k); for (const g of glints) g.visible = k < 0.4; },
  };
}
