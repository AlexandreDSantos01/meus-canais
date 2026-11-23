// Coleta as estatísticas públicas dos canais do YouTube (YouTube Data API v3)
// e grava em site/dados/: atual.json (foto de agora) e historico.json (séries).
// Uso: YT_API_KEY=... node coletor/coletar.mjs   (ou coloque YT_API_KEY no arquivo .env)

import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';

const RAIZ = new URL('../', import.meta.url);
const DADOS = new URL('site/dados/', RAIZ);
const MAX_VIDEOS = 250;          // últimos N vídeos de cada canal
const DIAS_HIST_VIDEO = 35;      // quanto tempo guardar a série de cada vídeo
const DIAS_DETALHE_CANAL = 30;   // depois disso, o canal guarda 1 ponto por dia

// .env simples (só para rodar no PC)
const envArq = new URL('.env', RAIZ);
if (existsSync(envArq)) {
  for (const linha of readFileSync(envArq, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const KEY = process.env.YT_API_KEY;
if (!KEY) {
  console.error('Falta a chave YT_API_KEY (veja o LEIA-ME).');
  process.exit(1);
}

async function yt(recurso, params) {
  const u = new URL(`https://www.googleapis.com/youtube/v3/${recurso}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set('key', KEY);
  const r = await fetch(u);
  const j = await r.json();
  if (!r.ok) throw new Error(`${recurso}: ${j.error?.message || r.status}`);
  return j;
}

function duracaoSeg(iso = '') {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/) || [];
  return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
}

const melhorThumb = (t = {}) => (t.medium || t.high || t.default || {}).url || '';

async function coletarCanal(cfg) {
  const handle = cfg.youtube.startsWith('@') ? cfg.youtube : '@' + cfg.youtube;
  const c = await yt('channels', { part: 'snippet,statistics,contentDetails', forHandle: handle });
  const ch = c.items?.[0];
  if (!ch) throw new Error(`canal ${handle} não encontrado`);

  // IDs dos últimos vídeos (playlist de uploads)
  const uploads = ch.contentDetails.relatedPlaylists.uploads;
  const ids = [];
  let pagina;
  do {
    const p = await yt('playlistItems', {
      part: 'contentDetails', playlistId: uploads, maxResults: 50, ...(pagina && { pageToken: pagina }),
    });
    ids.push(...p.items.map((i) => i.contentDetails.videoId));
    pagina = p.nextPageToken;
  } while (pagina && ids.length < MAX_VIDEOS);

  // Estatísticas dos vídeos, de 50 em 50
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const v = await yt('videos', { part: 'snippet,statistics,contentDetails', id: ids.slice(i, i + 50).join(',') });
    for (const it of v.items) {
      videos.push({
        id: it.id,
        canal: cfg.id,
        titulo: it.snippet.title,
        thumb: melhorThumb(it.snippet.thumbnails),
        publicado: it.snippet.publishedAt,
        duracao: duracaoSeg(it.contentDetails.duration),
        views: +it.statistics.viewCount || 0,
        likes: +it.statistics.likeCount || 0,
        comentarios: +it.statistics.commentCount || 0,
      });
    }
  }

  return {
    canal: {
      id: cfg.id,
      nome: cfg.nome,
      cor: cfg.cor,
      youtube: handle,
      tiktok: cfg.tiktok || '',
      titulo: ch.snippet.title,
      thumb: melhorThumb(ch.snippet.thumbnails),
      url: `https://www.youtube.com/${handle}`,
      inscritos: +ch.statistics.subscriberCount || 0,
      inscritosOcultos: !!ch.statistics.hiddenSubscriberCount,
      views: +ch.statistics.viewCount || 0,
      videos: +ch.statistics.videoCount || 0,
    },
    videos,
  };
}

async function lerJson(nome, padrao) {
  try { return JSON.parse(await fs.readFile(new URL(nome, DADOS), 'utf8')); } catch { return padrao; }
}

// Pontos antigos do canal: fica só o último de cada dia
function compactar(serie, agora) {
  const limite = agora - DIAS_DETALHE_CANAL * 86400;
  const porDia = new Map();
  const recentes = [];
  for (const p of serie) {
    if (p[0] >= limite) recentes.push(p);
    else porDia.set(Math.floor(p[0] / 86400), p);
  }
  return [...porDia.values(), ...recentes];
}

const canaisCfg = JSON.parse(await fs.readFile(new URL('canais.json', RAIZ), 'utf8'));
const agora = Math.floor(Date.now() / 1000);
const hist = await lerJson('historico.json', { canais: {}, videos: {} });
const anterior = await lerJson('atual.json', null);
const atual = { atualizado: new Date(agora * 1000).toISOString(), canais: [], videos: [], erros: [] };

for (const cfg of canaisCfg) {
  try {
    const { canal, videos } = await coletarCanal(cfg);
    atual.canais.push(canal);
    atual.videos.push(...videos);
    const s = (hist.canais[cfg.id] ||= []);
    s.push([agora, canal.inscritos, canal.views, canal.videos]);
    hist.canais[cfg.id] = compactar(s, agora);
    for (const v of videos) (hist.videos[v.id] ||= []).push([agora, v.views]);
    console.log(`✓ ${cfg.nome}: ${canal.inscritos} inscritos, ${videos.length} vídeos`);
  } catch (e) {
    console.error(`✗ ${cfg.nome}: ${e.message}`);
    atual.erros.push(`${cfg.nome}: ${e.message}`);
    // mantém os últimos dados conhecidos desse canal
    const velho = anterior?.canais.find((c) => c.id === cfg.id);
    if (velho) {
      atual.canais.push(velho);
      atual.videos.push(...anterior.videos.filter((v) => v.canal === cfg.id));
    }
  }
}

// Limpa séries de vídeos antigas / que saíram da lista
const vivos = new Set(atual.videos.map((v) => v.id));
const corte = agora - DIAS_HIST_VIDEO * 86400;
for (const id of Object.keys(hist.videos)) {
  if (!vivos.has(id)) { delete hist.videos[id]; continue; }
  hist.videos[id] = hist.videos[id].filter((p) => p[0] >= corte);
}

await fs.mkdir(DADOS, { recursive: true });
await fs.writeFile(new URL('atual.json', DADOS), JSON.stringify(atual));
await fs.writeFile(new URL('historico.json', DADOS), JSON.stringify(hist));
console.log(`Salvo em site/dados (${atual.videos.length} vídeos no total).`);
if (atual.canais.length === 0) process.exit(1);
