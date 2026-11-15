import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SVG_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">
  <defs>
    <linearGradient id="pulse-grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
      <stop stop-color="#ef4444" />
      <stop offset="1" stop-color="#dc2626" />
    </linearGradient>
  </defs>
  <rect width="48" height="48" rx="14" fill="url(#pulse-grad)" />
  <path
    d="M11 25.5h6.2l2.6-7.1 4.6 13.2 3.4-9.2 2.2 3.1H37"
    stroke="#ffffff"
    stroke-width="2.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <circle cx="37" cy="25.5" r="2.2" fill="#ffffff" />
</svg>`;

// Fast CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBody = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcBody);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgbaBuffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type 6: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Scanlines with filter byte 0 (None)
  const rowSize = width * 4;
  const rawScanlines = Buffer.alloc(height * (rowSize + 1));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (rowSize + 1);
    rawScanlines[rowOffset] = 0; // Filter: None
    rgbaBuffer.copy(rawScanlines, rowOffset + 1, y * rowSize, (y + 1) * rowSize);
  }

  const idatCompressed = zlib.deflateSync(rawScanlines, { level: 9 });
  const idatChunk = createChunk('IDAT', idatCompressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Distance from point (px, py) to line segment (x1, y1)-(x2, y2)
function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Distance from point to rounded rectangle [x, y, w, h, r]
function distToRoundRect(px, py, rx, ry, rw, rh, rad) {
  const cx = Math.max(rx + rad, Math.min(rx + rw - rad, px));
  const cy = Math.max(ry + rad, Math.min(ry + rh - rad, py));
  const dx = Math.abs(px - cx) - (rw / 2 - rad);
  const dy = Math.abs(py - cy) - (rh / 2 - rad);
  // signed distance: negative inside
  const qx = Math.max(0, Math.abs(px - (rx + rw / 2)) - (rw / 2 - rad));
  const qy = Math.max(0, Math.abs(py - (ry + rh / 2)) - (rh / 2 - rad));
  return Math.hypot(qx, qy) - rad;
}

function renderPulseIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 48;

  // Polyline nodes in 48x48 scale
  const pts = [
    [11, 25.5],
    [17.2, 25.5],
    [19.8, 18.4],
    [24.4, 31.6],
    [27.8, 22.4],
    [30.0, 25.5],
    [37.0, 25.5],
  ].map(([x, y]) => [x * scale, y * scale]);

  const circleCenter = [37.0 * scale, 25.5 * scale];
  const circleRadius = 2.2 * scale;
  const strokeRadius = 1.45 * scale;
  const rectRadius = 14 * scale;

  // Super-sampling factor for buttery smooth edges
  const SAMPLES = 3;
  const step = 1 / SAMPLES;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rectCover = 0;
      let strokeCover = 0;

      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) * step;
          const py = y + (sy + 0.5) * step;

          // Check rounded rect
          const dRect = distToRoundRect(px, py, 0, 0, size, size, rectRadius);
          if (dRect <= 0) rectCover += 1;

          // Check pulse line distance
          let minLineDist = 999999;
          for (let i = 0; i < pts.length - 1; i++) {
            const d = distToSegment(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
            if (d < minLineDist) minLineDist = d;
          }
          const dCircle = Math.hypot(px - circleCenter[0], py - circleCenter[1]);

          if (minLineDist <= strokeRadius || dCircle <= circleRadius) {
            strokeCover += 1;
          }
        }
      }

      const totalSamples = SAMPLES * SAMPLES;
      const alphaRect = rectCover / totalSamples;
      const alphaStroke = strokeCover / totalSamples;

      if (alphaRect > 0) {
        // Gradient from #ef4444 to #dc2626
        const t = (x + y) / (2 * size);
        const rGrad = Math.round(239 + (220 - 239) * t);
        const gGrad = Math.round(68 + (38 - 68) * t);
        const bGrad = Math.round(68 + (38 - 68) * t);

        // Alpha blend white stroke over gradient
        const rFinal = Math.round(rGrad * (1 - alphaStroke) + 255 * alphaStroke);
        const gFinal = Math.round(gGrad * (1 - alphaStroke) + 255 * alphaStroke);
        const bFinal = Math.round(bGrad * (1 - alphaStroke) + 255 * alphaStroke);
        const aFinal = Math.round(alphaRect * 255);

        const idx = (y * size + x) * 4;
        buf[idx] = rFinal;
        buf[idx + 1] = gFinal;
        buf[idx + 2] = bFinal;
        buf[idx + 3] = aFinal;
      }
    }
  }

  return encodePng(size, heightOrSize(size), buf);
}

function heightOrSize(size) {
  return size;
}

function buildIco(pngBuffers) {
  // ICO header: 6 bytes
  // Count: pngBuffers.length
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(pngBuffers.length, 4);

  const dirEntries = [];
  let offset = 6 + pngBuffers.length * 16;

  for (const { size, buffer } of pngBuffers) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buffer.length, 8); // image size
    entry.writeUInt32LE(offset, 12); // image offset
    dirEntries.push(entry);
    offset += buffer.length;
  }

  return Buffer.concat([header, ...dirEntries, ...pngBuffers.map((p) => p.buffer)]);
}

// Output paths
const publicDir = path.resolve('public');
fs.mkdirSync(publicDir, { recursive: true });

// 1. Write SVG favicon
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), SVG_FAVICON, 'utf8');
console.log('✓ Created public/favicon.svg');

// 2. Render multi-resolution PNGs
const png16 = renderPulseIcon(16);
const png32 = renderPulseIcon(32);
const png48 = renderPulseIcon(48);
const png180 = renderPulseIcon(180);
const png192 = renderPulseIcon(192);

// 3. Write apple-touch-icon.png
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), png180);
console.log('✓ Created public/apple-touch-icon.png');

// 4. Write web icon
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), png192);
console.log('✓ Created public/icon-192.png');

// 5. Build and write favicon.ico
const icoData = buildIco([
  { size: 16, buffer: png16 },
  { size: 32, buffer: png32 },
  { size: 48, buffer: png48 },
]);
fs.writeFileSync(path.join(publicDir, 'favicon.ico'), icoData);
console.log('✓ Created public/favicon.ico with 16x16, 32x32, 48x48 icons');
