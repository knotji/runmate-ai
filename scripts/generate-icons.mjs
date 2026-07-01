/**
 * RunMate PWA icon generator
 * Design: sage-green (#5B947E) rounded-square bg + white heartbeat/pulse waveform
 * Run: node scripts/generate-icons.mjs
 */

import sharp from "sharp";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ICONS = join(ROOT, "public/icons");
const PUBLIC = join(ROOT, "public");
const APP = join(ROOT, "src/app");

const SAGE = "#5B947E";

// ---------------------------------------------------------------------------
// Pulse waveform path (100×100 canvas → scaled to target size)
// Points within inner 80% safe zone → maskable-safe by design.
//   flat → P wave (subtle) → QRS spike → T wave → flat
// ---------------------------------------------------------------------------
function pulsePath(sz) {
  const s = sz / 100;
  const pts = [
    [10, 62],  // start flat
    [29, 62],  // flat
    [33, 56],  // P wave up
    [37, 62],  // P wave down
    [44, 62],  // pre-spike flat
    [48, 28],  // QRS peak (top)
    [54, 72],  // QRS trough
    [64, 62],  // back to baseline
    [68, 52],  // T wave up
    [74, 62],  // T wave down
    [90, 62],  // end flat
  ].map(([x, y]) => [x * s, y * s]);
  return "M " + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ");
}

// Simplified waveform for tiny sizes (≤48px): just the QRS spike
function simpleWaveformPath(sz) {
  const s = sz / 100;
  const pts = [
    [10, 62], [32, 62], [46, 28], [54, 72], [68, 62], [90, 62],
  ].map(([x, y]) => [x * s, y * s]);
  return "M " + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L ");
}

// ---------------------------------------------------------------------------
// SVG builders
// ---------------------------------------------------------------------------
function stdIconSvg(size) {
  const rx = Math.round(size * 0.18);
  const sw = (size * 0.063).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="${SAGE}"/>
  <path d="${pulsePath(size)}" stroke="white" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

function maskableIconSvg(size) {
  const sw = (size * 0.063).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${SAGE}"/>
  <path d="${pulsePath(size)}" stroke="white" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

function faviconSvg(size) {
  const rx = Math.round(size * 0.18);
  const sw = (size * 0.09).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="${SAGE}"/>
  <path d="${simpleWaveformPath(size)}" stroke="white" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function svgToPng(svgString, outPath) {
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
  console.log("  ✓", outPath.replace(ROOT, "").replace(/\\/g, "/"));
}

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------
mkdirSync(PUBLIC_ICONS, { recursive: true });

console.log("Generating RunMate PWA icons…");

// PWA manifest icons
await svgToPng(stdIconSvg(192),      join(PUBLIC_ICONS, "icon-192.png"));
await svgToPng(stdIconSvg(512),      join(PUBLIC_ICONS, "icon-512.png"));
await svgToPng(maskableIconSvg(192), join(PUBLIC_ICONS, "maskable-icon-192.png"));
await svgToPng(maskableIconSvg(512), join(PUBLIC_ICONS, "maskable-icon-512.png"));

// Apple Touch Icon
await svgToPng(stdIconSvg(180), join(PUBLIC, "apple-touch-icon.png"));

// Next.js App Router route-based icons
await svgToPng(stdIconSvg(180), join(APP, "apple-icon.png"));
await svgToPng(faviconSvg(32),  join(APP, "favicon.ico")); // browsers accept PNG-in-ICO slot

console.log("\nDone.");
