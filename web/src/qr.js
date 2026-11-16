// QR code images made on the server, so downloading one is an ordinary file download that works in every
// browser, in-app browsers (WhatsApp, Instagram…) and the Android app.
import qrcode from './qrcode.generated.cjs'; // made by scripts/build-assets.mjs

const QUIET = 4; // blank modules around the code so scanners can find it

function matrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return { n: qr.getModuleCount(), dark: (row, col) => qr.isDark(row, col) };
}

export function qrSvg(text) {
  const { n, dark } = matrix(text);
  const size = n + QUIET * 2;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (dark(y, x)) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path fill="#000" d="${d}"/></svg>\n`;
}

/** A black-on-white PNG about 1000 pixels wide: large enough to print on a business card. */
export async function qrPng(text) {
  const { n, dark } = matrix(text);
  const scale = Math.max(8, Math.floor(1024 / (n + QUIET * 2)));
  const width = (n + QUIET * 2) * scale;
  const rowBytes = Math.ceil(width / 8);

  // 1-bit greyscale: bit set = white. Each row starts with filter byte 0.
  const raw = new Uint8Array((rowBytes + 1) * width);
  for (let py = 0; py < width; py++) {
    const my = Math.floor(py / scale) - QUIET;
    const row = py * (rowBytes + 1);
    for (let px = 0; px < width; px++) {
      const mx = Math.floor(px / scale) - QUIET;
      const isDark = my >= 0 && my < n && mx >= 0 && mx < n && dark(my, mx);
      if (!isDark) raw[row + 1 + (px >> 3)] |= 0x80 >> (px & 7);
    }
  }

  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, width);
  header.set([1, 0, 0, 0, 0], 8); // bit depth 1, greyscale, deflate, no filter, no interlace

  const compressed = new Uint8Array(await new Response(
    new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')),
  ).arrayBuffer());

  return concat([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', compressed),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
