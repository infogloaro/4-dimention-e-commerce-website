/**
 * Pure SVG renderers for the catalogue artwork. No I/O: used by the `/media/art/...` route (products and variants — drawn
 * from the product's own slug → device kind and its own variant colour) and by scripts/generate-product-art.ts (static
 * category tiles and neutral placeholders).
 *
 * The products are fictional, so these are illustrations of the right *type* of device in the right colour, not
 * photographs. Real photography uploaded through the admin media tools simply replaces these URLs.
 */
import { ART_KINDS, CATEGORY_KIND, type ArtKind } from "../../prisma/product-art";

// ── colour helpers ──
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i]! - v) * t)); };
const lighten = (c: string, t: number) => mix(c, "#ffffff", t);
const darken = (c: string, t: number) => mix(c, "#000000", t);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Palette { c: string; hi: string; lo: string; edge: string }
const palette = (c: string): Palette => ({ c, hi: lighten(c, 0.28), lo: darken(c, 0.35), edge: lighten(c, 0.5) });
const SCREEN = `<linearGradient id="scr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1626"/><stop offset=".55" stop-color="#27507f"/><stop offset="1" stop-color="#8fb8d8"/></linearGradient>`;
const GLASS = `<linearGradient id="gls" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".5" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;

function body(p: Palette, id = "bd") {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.hi}"/><stop offset=".5" stop-color="${p.c}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient>`;
}
const shadow = (cx: number, cy: number, rx: number, ry: number) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity=".16" filter="url(#blur)"/>`;
const widget = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(14, h / 2)}" fill="#fff" opacity=".22"/>`;

// ── device drawings (all centred on 0,0 inside a 1000×1000 canvas translated to 500,500) ──
const DRAW: Record<ArtKind, (p: Palette) => string> = {
  phone: (p) => `
    <defs>${body(p)}${SCREEN}${GLASS}</defs>
    ${shadow(0, 330, 330, 32)}
    <g transform="translate(150 10) rotate(7)">
      <rect x="-140" y="-300" width="280" height="600" rx="48" fill="url(#bd)"/>
      <rect x="-134" y="-294" width="268" height="588" rx="43" fill="none" stroke="${p.edge}" stroke-opacity=".35" stroke-width="3"/>
      <rect x="-112" y="-272" width="126" height="134" rx="36" fill="${p.lo}"/>
      ${[[-72, -232], [-72, -176], [-18, -204]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="26" fill="#161616" stroke="${p.edge}" stroke-opacity=".6" stroke-width="3"/><circle cx="${x}" cy="${y}" r="13" fill="#2b3a55"/><circle cx="${x! - 5}" cy="${y! - 5}" r="4" fill="#fff" opacity=".8"/>`).join("")}
      <circle cx="40" cy="-176" r="9" fill="#f2f2f2" opacity=".9"/>
    </g>
    <g transform="translate(-130 30) rotate(-5)">
      <rect x="-146" y="-312" width="292" height="624" rx="52" fill="url(#bd)"/>
      <rect x="-134" y="-300" width="268" height="600" rx="42" fill="url(#scr)"/>
      <rect x="-134" y="-300" width="268" height="600" rx="42" fill="url(#gls)"/>
      <rect x="-34" y="-282" width="68" height="20" rx="10" fill="#050505"/>
      ${widget(-110, -190, 220, 96)}${widget(-110, -80, 104, 104)}${widget(6, -80, 104, 104)}${widget(-110, 40, 220, 64)}
      <rect x="-52" y="272" width="104" height="6" rx="3" fill="#fff" opacity=".7"/>
    </g>`,

  tablet: (p) => `
    <defs>${body(p)}${SCREEN}${GLASS}</defs>
    ${shadow(0, 290, 380, 30)}
    <g transform="rotate(-6)">
      <rect x="-340" y="-235" width="680" height="470" rx="46" fill="url(#bd)"/>
      <rect x="-318" y="-213" width="636" height="426" rx="26" fill="url(#scr)"/>
      <rect x="-318" y="-213" width="636" height="426" rx="26" fill="url(#gls)"/>
      <circle cx="-330" cy="0" r="5" fill="#0a0a0a"/>
      ${widget(-290, -180, 200, 120)}${widget(-70, -180, 200, 120)}${widget(150, -180, 140, 120)}${widget(-290, -40, 580, 90)}${widget(-290, 70, 280, 100)}${widget(10, 70, 280, 100)}
    </g>
    <g transform="translate(300 -230) rotate(34)"><rect x="-10" y="-210" width="20" height="420" rx="10" fill="${p.edge}"/><rect x="-10" y="-210" width="20" height="60" rx="10" fill="${p.lo}"/><polygon points="-10,210 10,210 0,236" fill="${p.lo}"/></g>`,

  laptop: (p) => `
    <defs>${body(p)}${SCREEN}${GLASS}</defs>
    ${shadow(0, 300, 420, 30)}
    <rect x="-300" y="-250" width="600" height="380" rx="24" fill="url(#bd)"/>
    <rect x="-282" y="-232" width="564" height="344" rx="10" fill="url(#scr)"/>
    <rect x="-282" y="-232" width="564" height="344" rx="10" fill="url(#gls)"/>
    ${widget(-250, -200, 160, 90)}${widget(-70, -200, 160, 90)}${widget(110, -200, 140, 90)}${widget(-250, -90, 500, 70)}
    <circle cx="0" cy="-241" r="4" fill="#050505"/>
    <path d="M-390 160 L390 160 L420 200 Q424 230 392 232 L-392 232 Q-424 230 -420 200 Z" fill="url(#bd)"/>
    <rect x="-390" y="150" width="780" height="16" rx="6" fill="${p.lo}"/>
    <rect x="-70" y="150" width="140" height="10" rx="5" fill="${darken(p.c, 0.5)}"/>
    ${Array.from({ length: 3 }, (_, r) => Array.from({ length: 13 }, (_, k) => `<rect x="${-300 + k * 46}" y="${176 + r * 15}" width="38" height="10" rx="3" fill="${p.lo}" opacity=".7"/>`).join("")).join("")}`,

  headphones: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 330, 300, 28)}
    <path d="M-250 40 C-250 -270 250 -270 250 40" fill="none" stroke="${p.lo}" stroke-width="44" stroke-linecap="round"/>
    <path d="M-250 40 C-250 -270 250 -270 250 40" fill="none" stroke="${p.c}" stroke-width="30" stroke-linecap="round"/>
    <path d="M-170 -170 C-80 -230 80 -230 170 -170" fill="none" stroke="${p.edge}" stroke-opacity=".5" stroke-width="6" stroke-linecap="round"/>
    ${[-1, 1].map((s) => `<g transform="translate(${s * 250} 90)"><rect x="-92" y="-150" width="184" height="300" rx="88" fill="url(#bd)"/><ellipse cx="${-s * 28}" cy="0" rx="62" ry="112" fill="${p.lo}"/><ellipse cx="${-s * 28}" cy="0" rx="40" ry="84" fill="${darken(p.c, 0.6)}"/><circle cx="${s * 36}" cy="-70" r="6" fill="#d6ed79"/></g>`).join("")}`,

  earbuds: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 300, 330, 26)}
    <g transform="translate(0 40)">
      <rect x="-250" y="-30" width="500" height="260" rx="110" fill="url(#bd)"/>
      <path d="M-250 100 L250 100" stroke="${p.lo}" stroke-width="5"/>
      <path d="M-250 100 C-250 -30 250 -30 250 100 L250 120 C250 -10 -250 -10 -250 120 Z" fill="${p.hi}" opacity=".5"/>
      <circle cx="0" cy="100" r="9" fill="#d6ed79"/>
    </g>
    ${[-1, 1].map((s) => `<g transform="translate(${s * 150} -150) rotate(${s * 12})"><ellipse cx="0" cy="0" rx="68" ry="78" fill="url(#bd)"/><circle cx="${-s * 10}" cy="-4" r="30" fill="${p.lo}"/><rect x="${s > 0 ? 28 : -56}" y="40" width="28" height="170" rx="14" fill="url(#bd)"/></g>`).join("")}`,

  speaker: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 270, 380, 26)}
    <path d="M-120 -250 Q0 -360 120 -250" fill="none" stroke="${p.lo}" stroke-width="22" stroke-linecap="round"/>
    <rect x="-340" y="-200" width="680" height="440" rx="200" fill="url(#bd)"/>
    <rect x="-300" y="-160" width="600" height="360" rx="170" fill="${p.lo}"/>
    ${Array.from({ length: 9 }, (_, r) => Array.from({ length: 19 }, (_, k) => { const x = -270 + k * 30, y = -125 + r * 36; return Math.hypot(x / 300, (y + 20) / 180) < 0.97 ? `<circle cx="${x}" cy="${y}" r="6" fill="${darken(p.c, 0.65)}"/>` : ""; }).join("")).join("")}
    <circle cx="0" cy="215" r="10" fill="#d6ed79"/>`,

  smartwatch: (p) => `
    <defs>${body(p)}${SCREEN}</defs>
    ${shadow(0, 360, 200, 24)}
    <path d="M-100 -120 L-80 -330 Q0 -370 80 -330 L100 -120 Z" fill="${p.lo}"/>
    <path d="M-100 120 L-80 330 Q0 370 80 330 L100 120 Z" fill="${p.lo}"/>
    ${Array.from({ length: 4 }, (_, k) => `<circle cx="0" cy="${200 + k * 32}" r="6" fill="${darken(p.c, 0.6)}" opacity=".7"/>`).join("")}
    <rect x="-170" y="-185" width="340" height="370" rx="104" fill="url(#bd)"/>
    <rect x="-146" y="-160" width="292" height="320" rx="86" fill="#050505"/>
    <rect x="-140" y="-154" width="280" height="308" rx="82" fill="url(#scr)"/>
    <circle cx="0" cy="0" r="104" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="5"/>
    <line x1="0" y1="0" x2="0" y2="-74" stroke="#fff" stroke-width="9" stroke-linecap="round"/><line x1="0" y1="0" x2="52" y2="28" stroke="#d6ed79" stroke-width="7" stroke-linecap="round"/><circle cx="0" cy="0" r="9" fill="#fff"/>
    <rect x="168" y="-40" width="26" height="80" rx="12" fill="${p.hi}"/>`,

  band: (p) => `
    <defs>${body(p)}${SCREEN}</defs>
    ${shadow(0, 380, 160, 22)}
    <path d="M-62 -160 L-52 -380 Q0 -400 52 -380 L62 -160 Z" fill="${p.lo}"/>
    <path d="M-62 160 L-52 380 Q0 400 52 380 L62 160 Z" fill="${p.lo}"/>
    ${Array.from({ length: 4 }, (_, k) => `<circle cx="0" cy="${250 + k * 28}" r="5" fill="${darken(p.c, 0.6)}" opacity=".7"/>`).join("")}
    <rect x="-84" y="-190" width="168" height="380" rx="56" fill="url(#bd)"/>
    <rect x="-68" y="-172" width="136" height="344" rx="44" fill="url(#scr)"/>
    <rect x="-44" y="-130" width="88" height="40" rx="12" fill="#fff" opacity=".28"/><circle cx="0" cy="-10" r="42" fill="none" stroke="#d6ed79" stroke-width="9" stroke-dasharray="190 80"/><rect x="-44" y="70" width="88" height="40" rx="12" fill="#fff" opacity=".2"/>`,

  monitor: (p) => `
    <defs>${body(p)}${SCREEN}${GLASS}</defs>
    ${shadow(0, 360, 340, 24)}
    <path d="M-34 190 L34 190 L56 330 L-56 330 Z" fill="url(#bd)"/>
    <path d="M-170 340 Q0 310 170 340 L180 356 Q0 372 -180 356 Z" fill="${p.lo}"/>
    <rect x="-420" y="-270" width="840" height="470" rx="26" fill="url(#bd)"/>
    <rect x="-402" y="-252" width="804" height="418" rx="10" fill="url(#scr)"/>
    <rect x="-402" y="-252" width="804" height="418" rx="10" fill="url(#gls)"/>
    <path d="M-402 -60 Q-200 -190 0 -90 T402 -150 L402 166 L-402 166 Z" fill="#0b1626" opacity=".5"/>
    <path d="M-402 40 Q-120 -80 120 60 T402 -20" fill="none" stroke="#d6ed79" stroke-width="5" opacity=".7"/>
    <circle cx="0" cy="184" r="4" fill="#d6ed79"/>`,

  cpu: (p) => `
    <defs>${body(p, "bd")}<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8c777"/><stop offset="1" stop-color="#a77c2a"/></linearGradient></defs>
    ${shadow(0, 330, 300, 26)}
    <rect x="-300" y="-300" width="600" height="600" rx="34" fill="#1e2b1f"/>
    ${Array.from({ length: 12 }, (_, k) => [`<rect x="${-264 + k * 45}" y="-318" width="18" height="30" fill="url(#gold)"/>`, `<rect x="${-264 + k * 45}" y="288" width="18" height="30" fill="url(#gold)"/>`, `<rect x="-318" y="${-264 + k * 45}" width="30" height="18" fill="url(#gold)"/>`, `<rect x="288" y="${-264 + k * 45}" width="30" height="18" fill="url(#gold)"/>`].join("")).join("")}
    <rect x="-220" y="-220" width="440" height="440" rx="22" fill="url(#bd)"/>
    <rect x="-200" y="-200" width="400" height="400" rx="14" fill="none" stroke="${p.edge}" stroke-opacity=".5" stroke-width="3"/>
    <text x="0" y="-20" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="86" fill="#fff" opacity=".9">X9</text>
    <text x="0" y="46" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="34" letter-spacing="8" fill="#fff" opacity=".7">DESKTOP</text>
    <polygon points="-300,-300 -240,-300 -300,-240" fill="url(#gold)"/>`,

  gpu: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 250, 440, 24)}
    <rect x="-440" y="-160" width="840" height="320" rx="30" fill="url(#bd)"/>
    <rect x="-440" y="-160" width="60" height="320" rx="14" fill="${p.edge}" opacity=".55"/>
    ${[-190, 150].map((cx) => `<g transform="translate(${cx} 0)"><circle r="124" fill="${darken(p.c, 0.65)}"/><circle r="110" fill="none" stroke="${p.edge}" stroke-opacity=".4" stroke-width="3"/>${Array.from({ length: 9 }, (_, k) => `<path d="M0 0 Q40 -30 20 -104 Q-20 -60 0 0" transform="rotate(${k * 40})" fill="${lighten(p.c, 0.2)}" opacity=".85"/>`).join("")}<circle r="22" fill="${p.lo}"/></g>`).join("")}
    <rect x="-300" y="150" width="520" height="30" rx="6" fill="url(#gold2)"/>
    <defs><linearGradient id="gold2" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8c777"/><stop offset="1" stop-color="#a77c2a"/></linearGradient></defs>
    <rect x="-90" y="-135" width="170" height="26" rx="8" fill="#d6ed79" opacity=".85"/>
    <rect x="-446" y="-190" width="14" height="380" rx="4" fill="${p.edge}"/>`,

  ssd: (p) => `
    <defs>${body(p)}<linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e8c777"/><stop offset="1" stop-color="#a77c2a"/></linearGradient></defs>
    ${shadow(0, 190, 420, 22)}
    <g transform="rotate(-8)">
      <rect x="-420" y="-110" width="840" height="220" rx="16" fill="#18301f"/>
      <rect x="-440" y="-80" width="46" height="160" rx="6" fill="#18301f"/>
      ${Array.from({ length: 22 }, (_, k) => `<rect x="${-432 + k * 11}" y="-72" width="6" height="144" fill="url(#gold)" ${k === 8 ? 'opacity="0"' : ""}/>`).join("")}
      <circle cx="-340" cy="-8" r="0" fill="none"/>
      <rect x="-330" y="-95" width="720" height="190" rx="12" fill="url(#bd)"/>
      <rect x="-330" y="-95" width="720" height="190" rx="12" fill="none" stroke="${p.edge}" stroke-opacity=".5" stroke-width="3"/>
      <text x="-300" y="-6" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="70" fill="#fff" opacity=".92">NVMe</text>
      <text x="-298" y="50" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="34" letter-spacing="6" fill="#d6ed79">GEN4 · 2TB</text>
      <rect x="280" y="-70" width="90" height="140" rx="10" fill="${p.lo}" opacity=".6"/>
    </g>`,

  keyboard: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 270, 440, 26)}
    <g transform="skewX(-14)">
      <rect x="-440" y="-190" width="880" height="400" rx="40" fill="url(#bd)"/>
      <rect x="-420" y="-170" width="840" height="360" rx="26" fill="${p.lo}"/>
      ${Array.from({ length: 5 }, (_, r) => {
        const cols = r === 4 ? 0 : 15;
        if (r === 4) return `<rect x="-385" y="${-148 + r * 66}" width="90" height="52" rx="9" fill="${lighten(p.c, 0.12)}"/><rect x="-285" y="${-148 + r * 66}" width="90" height="52" rx="9" fill="${lighten(p.c, 0.12)}"/><rect x="-185" y="${-148 + r * 66}" width="420" height="52" rx="9" fill="${lighten(p.c, 0.12)}"/><rect x="245" y="${-148 + r * 66}" width="90" height="52" rx="9" fill="${lighten(p.c, 0.12)}"/>`;
        return Array.from({ length: cols }, (_, k) => `<rect x="${-385 + k * 53}" y="${-148 + r * 66}" width="46" height="52" rx="9" fill="${lighten(p.c, 0.12)}"/>`).join("");
      }).join("")}
      <rect x="-420" y="196" width="840" height="8" rx="4" fill="#d6ed79" opacity=".8"/>
    </g>`,

  mouse: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 330, 200, 24)}
    <path d="M0 -330 C150 -330 190 -150 190 40 C190 230 120 330 0 330 C-120 330 -190 230 -190 40 C-190 -150 -150 -330 0 -330 Z" fill="url(#bd)"/>
    <path d="M0 -330 L0 -60" stroke="${p.lo}" stroke-width="5"/>
    <path d="M-190 -60 Q0 -30 190 -60" fill="none" stroke="${p.lo}" stroke-width="5"/>
    <rect x="-18" y="-250" width="36" height="110" rx="18" fill="${p.lo}"/><rect x="-8" y="-240" width="16" height="50" rx="8" fill="#d6ed79"/>
    <path d="M-190 40 C-190 230 -120 330 0 330 C120 330 190 230 190 40" fill="none" stroke="#d6ed79" stroke-width="7" opacity=".75"/>
    <path d="M-182 -30 Q-210 40 -170 120" fill="none" stroke="${p.edge}" stroke-opacity=".5" stroke-width="6" stroke-linecap="round"/>`,

  router: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 330, 420, 26)}
    ${[-250, 0, 250].map((cx, i) => `<g transform="translate(${cx} ${i === 1 ? 10 : 60})"><rect x="-96" y="-250" width="192" height="520" rx="86" fill="url(#bd)"/><ellipse cx="0" cy="-250" rx="96" ry="30" fill="${p.hi}"/><ellipse cx="0" cy="-250" rx="78" ry="22" fill="${p.lo}"/><rect x="-60" y="120" width="120" height="10" rx="5" fill="#d6ed79"/><circle cx="0" cy="200" r="14" fill="${p.lo}"/></g>`).join("")}`,

  charger: (p) => `
    <defs>${body(p)}</defs>
    ${shadow(0, 300, 300, 26)}
    <rect x="-90" y="-420" width="40" height="150" rx="8" fill="#c9ccd1"/><rect x="50" y="-420" width="40" height="150" rx="8" fill="#c9ccd1"/>
    <rect x="-210" y="-290" width="420" height="500" rx="62" fill="url(#bd)"/>
    <rect x="-190" y="-270" width="380" height="460" rx="48" fill="none" stroke="${p.edge}" stroke-opacity=".4" stroke-width="3"/>
    <text x="0" y="-60" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="120" fill="#fff" opacity=".9">140W</text>
    <text x="0" y="10" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="600" font-size="36" letter-spacing="10" fill="#d6ed79">GaN</text>
    <rect x="-70" y="90" width="52" height="30" rx="10" fill="${p.lo}"/><rect x="18" y="90" width="52" height="30" rx="10" fill="${p.lo}"/>
    <path d="M0 210 C0 300 220 260 260 330" fill="none" stroke="${p.lo}" stroke-width="22" stroke-linecap="round"/>`,
};

const DEFS_COMMON = `<filter id="blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="14"/></filter>`;
const BG = (a = "#fbfaf6", b = "#e2e0d5") => `<defs><radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>${DEFS_COMMON}</defs><rect width="1000" height="1000" fill="url(#bg)"/>`;

export function svg(inner: string, title: string, desc: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" role="img" aria-labelledby="t d"><title id="t">${esc(title)}</title><desc id="d">${esc(desc)}</desc>${inner}</svg>\n`;
}

export function render(kind: ArtKind, colour: string, opts: { scale?: number; tx?: number; ty?: number; bg?: [string, string] } = {}) {
  const { scale = 1, tx = 500, ty = 500, bg } = opts;
  const device = DRAW[kind](palette(colour));
  return `${BG(...(bg ?? []))}<g transform="translate(${tx} ${ty}) scale(${scale})">${device}</g>`;
}


const wrap = (text: string, max: number): string[] => {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > max) { out.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) out.push(line);
  return out;
};

export function specsPanel(kind: ArtKind, colour: string, name: string, brand: string, highlights: string[]) {
  const lines = highlights.slice(0, 4).flatMap((h) => wrap(h, 33).map((l, i) => ({ l, bullet: i === 0 })));
  const text = lines.slice(0, 9).map((ln, i) => `<text x="${ln.bullet ? 500 : 522}" y="${520 + i * 38}" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#3a3c33">${ln.bullet ? "• " : ""}${esc(ln.l)}</text>`).join("");
  const title = wrap(name, 19).slice(0, 3).map((l, i) => `<text x="500" y="${250 + i * 54}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="42" fill="#22231f">${esc(l)}</text>`).join("");
  return svg(
    `${render(kind, colour, { scale: 0.46, tx: 235, ty: 500 })}<rect x="470" y="120" width="6" height="760" rx="3" fill="#758446"/>
     <text x="500" y="190" font-family="Arial,Helvetica,sans-serif" font-size="24" letter-spacing="6" fill="#758446">${esc(brand.toUpperCase())}</text>${title}${text}`,
    `${name} — key features`, `Illustration of ${name} with its key features.`,
  );
}


export const VALID_HEX = /^[0-9a-f]{6}$/i;

export function heroSvg(kind: ArtKind, colourHex: string, name: string, colourName?: string) {
  return svg(render(kind, `#${colourHex}`), name, `Illustration of ${name}${colourName ? ` in ${colourName}` : ""}.`);
}

const TINTS: [string, string][] = [["#f3f7e3", "#d3dfa9"], ["#f6f4ea", "#dcd8c6"], ["#eef2f6", "#cfd9e4"]];
export function categorySvg(slug: string) {
  const kind = CATEGORY_KIND[slug];
  if (!kind) return null;
  const i = Object.keys(CATEGORY_KIND).indexOf(slug);
  return svg(render(kind, "#3b3f36", { scale: 0.85, bg: TINTS[i % 3] }), slug, `Illustration for the ${slug} category.`);
}

const COMING_SOON = `<text x="500" y="900" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="34" letter-spacing="5" fill="#77786f">IMAGE COMING SOON</text>`;
export function placeholderSvg(slugOrKind: string) {
  const kind = (ART_KINDS as string[]).includes(slugOrKind) ? (slugOrKind as ArtKind) : CATEGORY_KIND[slugOrKind];
  const title = "Product image coming soon";
  if (!kind) return svg(`${BG("#f4f3ee", "#e3e2da")}<g fill="none" stroke="#b9bbb1" stroke-width="14" stroke-linejoin="round"><rect x="330" y="300" width="340" height="340" rx="40"/><path d="M330 420 H670 M500 300 V420"/></g><text x="500" y="760" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="38" letter-spacing="6" fill="#77786f">IMAGE COMING SOON</text>`, title, "Neutral placeholder; the product photo is not available yet.");
  return svg(`${render(kind, "#b9bbb1", { scale: 0.7, ty: 450, bg: ["#f4f3ee", "#e3e2da"] })}${COMING_SOON}`, title, `Neutral ${kind} placeholder; the product photo is not available yet.`);
}
