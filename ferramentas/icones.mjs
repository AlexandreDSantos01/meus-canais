// Gera os ícones PNG do app (mesmo desenho do site/icone.svg), sem dependências.
// Uso: node ferramentas/icones.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// [x, y, w, h, raio, cor] no espaço 512x512
const FORMAS = [
  [0, 0, 512, 512, 112, '#0E0F13'],
  [112, 280, 48, 112, 14, '#8B5CF6'],
  [192, 226, 48, 166, 14, '#22C55E'],
  [272, 172, 48, 220, 14, '#22D3EE'],
  [352, 120, 48, 272, 14, '#FACC15'],
];

function dentro(px, py, [x, y, w, h, r]) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r), cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function bloco(tipo, dados) {
  const t = Buffer.from(tipo), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(dados.length); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, crc]);
}

function png(tam, fundoCheio) {
  const S = 4, esc = 512 / tam, linhas = [];
  for (let y = 0; y < tam; y++) {
    const l = Buffer.alloc(1 + tam * 4);
    for (let x = 0; x < tam; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const px = (x + (sx + 0.5) / S) * esc, py = (y + (sy + 0.5) / S) * esc;
        let cor = null;
        for (let i = 0; i < FORMAS.length; i++) {
          const f = i === 0 && fundoCheio ? [0, 0, 512, 512, 0] : FORMAS[i];
          if (dentro(px, py, f)) cor = hex(FORMAS[i][5]);
        }
        if (cor) { r += cor[0]; g += cor[1]; b += cor[2]; a += 255; }
      }
      const n = S * S, cob = a / 255 || 1;
      l.set([r / cob, g / cob, b / cob, a / n].map(Math.round), 1 + x * 4);
    }
    linhas.push(l);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tam, 0); ihdr.writeUInt32BE(tam, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    bloco('IHDR', ihdr), bloco('IDAT', deflateSync(Buffer.concat(linhas))), bloco('IEND', Buffer.alloc(0)),
  ]);
}

const destino = new URL('../site/', import.meta.url);
writeFileSync(new URL('icone-192.png', destino), png(192, false));
writeFileSync(new URL('icone-512.png', destino), png(512, true)); // fundo cheio: serve como "maskable"
writeFileSync(new URL('icone-180.png', destino), png(180, true)); // iPhone arredonda sozinho
console.log('Ícones gerados em site/.');
