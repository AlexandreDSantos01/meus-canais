// Servidor local para abrir o painel no PC: node ferramentas/servidor.mjs  →  http://localhost:5180
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../site/', import.meta.url));
const PORTA = +process.env.PORT || 5180;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  let caminho = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([\\/])+/, '');
  if (caminho.includes('..')) { res.writeHead(400).end(); return; }
  if (!caminho || caminho.endsWith('/') || caminho.endsWith('\\')) caminho += 'index.html';
  try {
    const dados = await readFile(RAIZ + caminho);
    res.writeHead(200, { 'Content-Type': (TIPOS[extname(caminho)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(dados);
  } catch { res.writeHead(404).end('não encontrado'); }
}).listen(PORTA, () => console.log(`Painel em http://localhost:${PORTA}`));
