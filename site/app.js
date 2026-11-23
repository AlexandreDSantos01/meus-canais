'use strict';

// ======================= CONFIGURAÇÃO =======================
// Requisitos do Programa de Parcerias do YouTube (YPP) para canais de Shorts.
// Se o YouTube mudar as regras, é só trocar os números aqui.
const METAS = [
  {
    id: 'ypp1',
    nome: 'Monetização nível 1',
    desc: 'Libera Super Thanks, clube de membros e loja.',
    inscritos: 500,
    uploads90: 3,
    shorts90: 3_000_000,
  },
  {
    id: 'ypp2',
    nome: 'Monetização completa',
    desc: 'Libera a receita de anúncios, inclusive dos Shorts.',
    inscritos: 1000,
    shorts90: 10_000_000,
  },
];
// Marcos de inscritos mostrados no card de cada canal
const MARCOS = [500, 1000, 10_000, 100_000, 1_000_000];
const SHORT_MAX_SEG = 180;

const PERIODOS = [
  { id: '24h', rot: '24 horas', horas: 24 },
  { id: '7d', rot: '7 dias', horas: 24 * 7 },
  { id: '30d', rot: '30 dias', horas: 24 * 30 },
];

// ======================= ESTADO =======================
const app = document.getElementById('app');
const est = { atual: null, hist: null, periodo: lerPref('periodo', '24h'), ordem: '', metrica: 'inscritos' };
const graficos = new Map(); // dados de cada gráfico de linha, para a dica ao tocar

function lerPref(k, padrao) { try { return localStorage.getItem(k) || padrao; } catch { return padrao; } }
function salvarPref(k, v) { try { localStorage.setItem(k, v); } catch {} }

// ======================= FORMATAÇÃO =======================
const nf = new Intl.NumberFormat('pt-BR');
const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = (n) => (n == null ? '—' : Math.abs(n) < 10000 ? nf.format(Math.round(n)) : nfc.format(n));
const fmtVar = (n) => (n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)));
const pct = (v) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: v < 0.1 ? 1 : 0 })}%`;
const classeVar = (n) => (!n ? 'neu' : n > 0 ? 'pos' : 'neg');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const limpaTitulo = (t) => String(t).replace(/\s*#\S+/g, '').trim() || t;

function ha(seg) {
  const d = Date.now() / 1000 - seg;
  if (d < 90) return 'agora';
  if (d < 3600) return `há ${Math.round(d / 60)} min`;
  if (d < 86400) return `há ${Math.round(d / 3600)} h`;
  if (d < 86400 * 30) return `há ${Math.round(d / 86400)} d`;
  return new Date(seg * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
const dataCurta = (seg) => new Date(seg * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const dataHora = (seg) => new Date(seg * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
function prazo(dias) {
  if (dias == null || !isFinite(dias)) return null;
  if (dias < 1) return 'menos de 1 dia';
  if (dias < 60) return `~${Math.ceil(dias)} dias`;
  if (dias < 730) return `~${Math.round(dias / 30)} meses`;
  return `~${(dias / 365).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} anos`;
}

// ======================= CÁLCULOS =======================
const agoraDados = () => Date.parse(est.atual.atualizado) / 1000;
const horasPeriodo = () => PERIODOS.find((p) => p.id === est.periodo).horas;
const pubSeg = (v) => Date.parse(v.publicado) / 1000;
const videosDo = (id) => est.atual.videos.filter((v) => v.canal === id);
const ehShort = (v) => v.duracao <= SHORT_MAX_SEG;

// Quanto a série cresceu no período. parcial = ainda não há histórico do período inteiro.
function variacao(serie, idx, horas, publicadoSeg) {
  const pts = (serie || []).filter((p) => p[idx] != null);
  if (!pts.length) return { v: null, parcial: true };
  const ult = pts[pts.length - 1];
  const alvo = agoraDados() - horas * 3600;
  let base = null;
  for (const p of pts) { if (p[0] <= alvo) base = p; else break; }
  if (base) return { v: ult[idx] - base[idx], parcial: false };
  if (publicadoSeg && publicadoSeg >= alvo) return { v: ult[idx], parcial: false }; // vídeo novo: começou do zero
  return { v: ult[idx] - pts[0][idx], parcial: true };
}

// Último valor conhecido até o instante t
function valorAte(serie, idx, t) {
  let v = null;
  for (const p of serie || []) { if (p[0] > t) break; if (p[idx] != null) v = p[idx]; }
  return v;
}

// Ritmo por dia (usa os últimos 7 dias, ou o que houver de histórico)
function ritmoDia(serie, idx) {
  const pts = (serie || []).filter((p) => p[idx] != null);
  if (pts.length < 2) return null;
  const ult = pts[pts.length - 1];
  const alvo = ult[0] - 7 * 86400;
  let base = pts[0];
  for (const p of pts) { if (p[0] <= alvo) base = p; else break; }
  const dias = (ult[0] - base[0]) / 86400;
  if (dias < 0.5) return null;
  return (ult[idx] - base[idx]) / dias;
}

function ganhoVideo(v, horas = horasPeriodo()) {
  return variacao(est.hist.videos[v.id], 1, horas, pubSeg(v));
}

function statsCanal(c, horas = horasPeriodo()) {
  const vids = videosDo(c.id);
  let views = 0, parcial = false;
  for (const v of vids) {
    const g = ganhoVideo(v, horas);
    views += g.v || 0;
    parcial ||= g.parcial;
  }
  const insc = variacao(est.hist.canais[c.id], 1, horas);
  const limite = agoraDados() - horas * 3600;
  const postados = vids.filter((v) => pubSeg(v) >= limite).length;
  return { views, inscritos: insc.v, parcial: parcial || insc.parcial, postados, vids };
}

// Views de Shorts nos últimos 90 dias (é o que o YouTube conta para monetizar)
function shorts90(c) {
  const serie = est.hist.canais[c.id];
  const r = variacao(serie, 5, 90 * 24);
  if (r.v != null && !r.parcial) return { v: r.v, estimativa: false };
  // Sem 90 dias de histórico: Shorts postados nos últimos 90 dias contam inteiros;
  // os mais antigos contam só o que ganharam desde que o app começou a acompanhar.
  const limite = agoraDados() - 90 * 86400;
  let soma = 0;
  for (const v of videosDo(c.id).filter(ehShort)) {
    soma += pubSeg(v) >= limite ? v.views : ganhoVideo(v, 90 * 24).v || 0;
  }
  return { v: soma, estimativa: true };
}

function metasCanal(c) {
  const serie = est.hist.canais[c.id];
  const ritmoInsc = ritmoDia(serie, 1);
  const s90 = shorts90(c);
  const uploads90 = videosDo(c.id).filter((v) => pubSeg(v) >= agoraDados() - 90 * 86400).length;
  return METAS.map((m) => {
    const reqs = [];
    const falta = Math.max(0, m.inscritos - c.inscritos);
    reqs.push({
      rot: 'Inscritos', atual: c.inscritos, alvo: m.inscritos,
      info: falta === 0 ? 'Concluído' : `Faltam ${fmt(falta)}`
        + (ritmoInsc > 0 ? ` · no ritmo atual (${fmtVar(ritmoInsc)}/dia): ${prazo(falta / ritmoInsc)}` : ''),
    });
    if (m.uploads90) {
      reqs.push({
        rot: 'Vídeos públicos (90 dias)', atual: uploads90, alvo: m.uploads90,
        info: uploads90 >= m.uploads90 ? 'Concluído' : `Faltam ${m.uploads90 - uploads90}`,
      });
    }
    const faltaV = Math.max(0, m.shorts90 - s90.v);
    reqs.push({
      rot: 'Views de Shorts (90 dias)', atual: s90.v, alvo: m.shorts90,
      info: faltaV === 0 ? 'Concluído'
        : `Faltam ${fmt(faltaV)} · precisa de ~${fmt(m.shorts90 / 90)}/dia, você faz ~${fmt(s90.v / 90)}/dia`,
      estimativa: s90.estimativa,
    });
    const ok = reqs.every((r) => r.atual >= r.alvo);
    // Progresso = média de inscritos e views (o requisito de 3 vídeos é fácil e inflaria a conta)
    const principais = reqs.filter((r) => !r.rot.startsWith('Vídeos'));
    const progresso = principais.reduce((a, r) => a + Math.min(1, r.atual / r.alvo), 0) / principais.length;
    return { ...m, reqs, ok, progresso };
  });
}

// ======================= GRÁFICOS =======================

// Linhas (uma ou várias séries). series: [{nome, cor, pts: [[t, v], ...]}]
function graficoLinhas(series, unidade) {
  series = series.filter((s) => s.pts.length);
  const todos = series.flatMap((s) => s.pts);
  if (todos.length < 2 || series.every((s) => s.pts.length < 2)) {
    return `<p class="vazio pequeno">O gráfico aparece depois de algumas coletas (a cada 3 horas).</p>`;
  }
  const W = 600, H = 220, E = 64, T = 12, B = 28;
  const xs = todos.map((p) => p[0]), ys = todos.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const px = (x) => E + ((x - x0) / (x1 - x0 || 1)) * (W - E - 8);
  const py = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  graficos.set(id, { series, x0, x1, E, W, unidade });
  const caminhos = series.map((s) => {
    const d = s.pts.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join('');
    const area = series.length === 1
      ? `<path d="${d}L${px(s.pts.at(-1)[0]).toFixed(1)},${H - B}L${px(s.pts[0][0]).toFixed(1)},${H - B}Z" fill="url(#${id}a)"/>
         <defs><linearGradient id="${id}a" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${s.cor}" stop-opacity="0.28"/><stop offset="1" stop-color="${s.cor}" stop-opacity="0"/></linearGradient></defs>`
      : '';
    return `${area}<path d="${d}" fill="none" stroke="${s.cor}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
  }).join('');
  const meio = (y0 + y1) / 2;
  const legenda = series.length > 1
    ? `<div class="legenda">${series.map((s) => `<span style="--cor:${s.cor}">${esc(s.nome)}</span>`).join('')}</div>` : '';
  return `${legenda}
    <svg class="linhas" viewBox="0 0 ${W} ${H}" data-graf="${id}">
      ${[y1, meio, y0].map((v) => `<line class="grade" x1="${E}" x2="${W}" y1="${py(v)}" y2="${py(v)}"/>
        <text x="${E - 8}" y="${py(v) + 5}" text-anchor="end">${fmt(Math.round(v))}</text>`).join('')}
      <text x="${E}" y="${H - 4}">${dataCurta(x0)}</text>
      <text x="${W}" y="${H - 4}" text-anchor="end">${dataCurta(x1)}</text>
      ${caminhos}
      <line class="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0"/>
    </svg>
    <div class="dica">Toque no gráfico para ver cada ponto.</div>`;
}

function ligarGraficos() {
  document.querySelectorAll('svg.linhas').forEach((svg) => {
    const g = graficos.get(svg.dataset.graf);
    if (!g) return;
    const dica = svg.nextElementSibling, cursor = svg.querySelector('.cursor');
    const todos = [...new Set(g.series.flatMap((s) => s.pts.map((p) => p[0])))].sort((a, b) => a - b);
    const mover = (ev) => {
      const r = svg.getBoundingClientRect();
      const fx = ((ev.clientX - r.left) / r.width) * g.W;
      const t = g.x0 + ((fx - g.E) / (g.W - g.E - 8)) * (g.x1 - g.x0);
      let melhor = todos[0];
      for (const x of todos) if (Math.abs(x - t) < Math.abs(melhor - t)) melhor = x;
      const cx = g.E + ((melhor - g.x0) / (g.x1 - g.x0 || 1)) * (g.W - g.E - 8);
      cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.setAttribute('opacity', '0.6');
      const vals = g.series.map((s) => {
        const v = valorAte(s.pts, 1, melhor);
        return v == null ? null : (g.series.length > 1 ? `${s.nome}: ` : '') + nf.format(v);
      }).filter(Boolean);
      dica.textContent = `${dataHora(melhor)} · ${vals.join(' · ')} ${g.unidade}`;
    };
    svg.addEventListener('pointermove', mover);
    svg.addEventListener('pointerdown', mover);
  });
}

// Colunas verticais. dados: [{rot, v, cor?, dica?}]
function graficoColunas(dados, { cor = 'var(--texto-2)', vazio = 'Sem dados ainda.', mostrarValor } = {}) {
  if (!dados.length || dados.every((d) => !d.v)) return `<p class="vazio pequeno">${vazio}</p>`;
  const max = Math.max(...dados.map((d) => d.v || 0)) || 1;
  const comValor = mostrarValor ?? dados.length <= 16;
  const passoRot = dados.length > 8 ? Math.ceil(dados.length / 7) : 1;
  return `
    <div class="colunas ${dados.length > 7 ? 'densa' : ''}" style="--n:${dados.length}">
      <span class="max">${fmt(max)}</span>
      ${dados.map((d, i) => `
        <button class="col" data-dica="${esc(d.dica || `${d.rot}: ${fmt(d.v)}`)}">
          ${comValor && d.v ? `<span class="cv">${fmt(d.v)}</span>` : ''}
          <span class="cb" style="height:${d.v ? Math.max(2, (d.v / max) * 100) : 0}%;background:${d.cor || cor}"></span>
          <span class="cr">${i % passoRot === 0 ? esc(d.rot) : ''}</span>
        </button>`).join('')}
    </div>
    <div class="dica">Toque numa coluna para ver o valor.</div>`;
}

// Barras horizontais. dados: [{rot, v, cor?, sub?, href?}]
function graficoBarras(dados, { cor = 'var(--texto-2)', vazio = 'Sem dados ainda.', formato = fmt } = {}) {
  if (!dados.length || dados.every((d) => !d.v)) return `<p class="vazio pequeno">${vazio}</p>`;
  const max = Math.max(...dados.map((d) => d.v || 0)) || 1;
  return `<div class="barras">${dados.map((d) => {
    const tag = d.href ? 'a' : 'div';
    return `<${tag} class="hb" ${d.href ? `href="${d.href}" target="_blank" rel="noopener"` : ''}>
      <span class="hb-rot">${esc(d.rot)}${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</span>
      <span class="hb-trilho"><span class="hb-barra" style="width:${Math.max(1, ((d.v || 0) / max) * 100)}%;background:${d.cor || cor}"></span></span>
      <span class="hb-val">${formato(d.v)}</span>
    </${tag}>`;
  }).join('')}</div>`;
}

function barraProgresso(frac, cor) {
  return `<div class="prog"><span style="width:${Math.min(100, frac * 100).toFixed(1)}%;background:${cor}"></span></div>`;
}

// Views ganhas por dia, a partir da soma das views dos vídeos do canal
function viewsPorDia(serie, dias) {
  const fimDados = agoraDados();
  const hoje = new Date(fimDados * 1000); hoje.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    const ini = d.getTime() / 1000, fim = Math.min(ini + 86400, fimDados);
    const a = valorAte(serie, 4, ini), b = valorAte(serie, 4, fim);
    out.push({ t: ini, v: a != null && b != null ? Math.max(0, b - a) : 0 });
  }
  return out;
}

const urlVideo = (v) => (ehShort(v) ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`);

// ======================= PEDAÇOS DE TELA =======================
const iconeRecarregar = `<button class="icone-btn" id="recarregar" aria-label="Atualizar">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg></button>`;

function chips() {
  return `<div class="chips">${PERIODOS.map((p) =>
    `<button class="chip ${p.id === est.periodo ? 'ativo' : ''}" data-periodo="${p.id}">${p.rot}</button>`).join('')}</div>`;
}

function avisos() {
  const e = est.atual.erros || [];
  return e.length ? `<div class="aviso">Falha na última coleta: ${e.map(esc).join(' · ')}</div>` : '';
}

function linhaVideo(v, i, horas) {
  const c = est.atual.canais.find((k) => k.id === v.canal) || {};
  const g = ganhoVideo(v, horas);
  return `
    <a class="video" href="${urlVideo(v)}" target="_blank" rel="noopener" style="--cor:${c.cor}">
      ${i != null ? `<span class="pos-n">${i + 1}</span>` : ''}
      <img src="${esc(v.thumb)}" alt="" loading="lazy" onerror="this.dataset.falhou=1">
      <div class="info">
        <div class="tit">${esc(v.titulo)}</div>
        <div class="meta">
          ${i != null ? `<span class="tag">${esc(c.nome || '')}</span>` : ''}
          <span>${fmt(v.views)} views</span><span>♥ ${fmt(v.likes)}</span><span>💬 ${fmt(v.comentarios)}</span>
          <span>${ha(pubSeg(v))}</span>
        </div>
      </div>
      <div class="ganho"><div class="g ${classeVar(g.v)}">${fmtVar(g.v)}</div><div class="r">no período${g.parcial ? '*' : ''}</div></div>
    </a>`;
}

function proximoMarco(n) { return MARCOS.find((m) => m > n) || MARCOS.at(-1); }

function rodape(parcial) {
  return `<p class="rodape">${parcial ? '* O app ainda não tem histórico do período inteiro; conta desde a primeira coleta.<br>' : ''}
    O YouTube arredonda inscritos acima de 1.000 (ex.: 1,23 mil). Dados atualizados a cada 3 horas.</p>`;
}

// ======================= TELA INICIAL =======================
function telaInicio() {
  const { atual } = est, horas = horasPeriodo();
  const porCanal = atual.canais.map((c) => ({ c, s: statsCanal(c, horas), m: metasCanal(c) }));
  const totInsc = atual.canais.reduce((a, c) => a + c.inscritos, 0);
  const varInsc = porCanal.reduce((a, x) => a + (x.s.inscritos || 0), 0);
  const totViews = porCanal.reduce((a, x) => a + x.s.views, 0);
  const totPost = porCanal.reduce((a, x) => a + x.s.postados, 0);
  const totViewsGeral = atual.canais.reduce((a, c) => a + c.views, 0);
  const parcial = porCanal.some((x) => x.s.parcial);

  const emAlta = atual.videos
    .map((v) => ({ v, g: ganhoVideo(v, horas).v || 0 }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g)
    .slice(0, 10);

  const seriesInsc = atual.canais.map((c) => ({
    nome: c.nome, cor: c.cor, pts: (est.hist.canais[c.id] || []).map((p) => [p[0], p[1]]),
  }));

  app.innerHTML = `
    <div class="topo">
      <div><h1>Meus Canais</h1><div class="sub">Atualizado ${ha(agoraDados())}</div></div>
      <div class="espaco"></div>${iconeRecarregar}
    </div>
    ${avisos()}
    ${chips()}
    <div class="resumo">
      <div class="tile"><div class="rot">Inscritos (4 canais)</div><div class="val">${fmt(totInsc)}</div><div class="var ${classeVar(varInsc)}">${fmtVar(varInsc)} no período</div></div>
      <div class="tile"><div class="rot">Views no período</div><div class="val">${fmt(totViews)}</div><div class="var neu">${parcial ? 'desde o início*' : '&nbsp;'}</div></div>
      <div class="tile"><div class="rot">Cortes postados</div><div class="val">${fmt(totPost)}</div><div class="var neu">no período</div></div>
      <div class="tile"><div class="rot">Views totais</div><div class="val">${fmt(totViewsGeral)}</div><div class="var neu">desde a criação</div></div>
    </div>

    <section>
      <h2>Canais</h2>
      <div class="canais">
        ${porCanal.map(({ c, s, m }) => {
          const marco = proximoMarco(c.inscritos);
          const ypp = m.find((x) => !x.ok) || m.at(-1);
          return `
          <a class="card" href="#/canal/${c.id}" style="--cor:${c.cor}">
            <div class="cab">
              <img class="avatar" src="${esc(c.thumb)}" alt="" onerror="this.dataset.falhou=1">
              <div><div class="nome">${esc(c.nome)}</div><div class="handle">${esc(c.youtube)}</div></div>
            </div>
            <div class="nums">
              <div class="num"><div class="rot">Inscritos</div><div class="val">${c.inscritosOcultos ? 'oculto' : fmt(c.inscritos)}</div><div class="var ${classeVar(s.inscritos)}">${fmtVar(s.inscritos)}</div></div>
              <div class="num"><div class="rot">Views no período</div><div class="val">${fmt(s.views)}</div><div class="var neu">${s.postados} ${s.postados === 1 ? 'corte novo' : 'cortes novos'}</div></div>
            </div>
            <div class="meta-mini">
              <div class="mm-lin"><span>Rumo a ${fmt(marco)} inscritos</span><b>${pct(c.inscritos / marco)}</b></div>
              ${barraProgresso(c.inscritos / marco, c.cor)}
              <div class="mm-lin"><span>${esc(ypp.nome)}</span><b>${ypp.ok ? '✓ liberada' : pct(ypp.progresso)}</b></div>
              ${barraProgresso(ypp.progresso, c.cor)}
            </div>
          </a>`;
        }).join('')}
      </div>
    </section>

    <div class="grade-2">
      <section class="painel">
        <h2>Crescimento de inscritos</h2>
        ${graficoLinhas(seriesInsc, 'inscritos')}
      </section>
      <section class="painel">
        <h2>Comparativo <span class="dica-h">· views no período</span></h2>
        ${graficoBarras(porCanal.map(({ c, s }) => ({ rot: c.nome, v: s.views, cor: c.cor })), { vazio: 'Ainda sem views registradas no período.' })}
        <h2 class="mt">Inscritos por canal</h2>
        ${graficoBarras(porCanal.map(({ c }) => ({ rot: c.nome, v: c.inscritos, cor: c.cor })))}
      </section>
    </div>

    <section>
      <h2>Cortes em alta <span class="dica-h">· mais views ganhas no período</span></h2>
      ${emAlta.length
        ? `<div class="lista">${emAlta.map((x, i) => linhaVideo(x.v, i, horas)).join('')}</div>`
        : `<p class="vazio">Ainda sem dados suficientes. Volte depois da próxima coleta.</p>`}
    </section>
    ${rodape(parcial)}`;
  ligarGraficos();
}

// ======================= TELA DO CANAL =======================
function telaCanal(id) {
  const c = est.atual.canais.find((k) => k.id === id);
  if (!c) { location.hash = ''; return; }
  const horas = horasPeriodo(), s = statsCanal(c, horas);
  const serieCanal = est.hist.canais[c.id] || [];
  const metricas = { inscritos: { idx: 1, rot: 'inscritos' }, views: { idx: 2, rot: 'views totais' } };
  const m = metricas[est.metrica] || metricas.inscritos;
  const metas = metasCanal(c);

  // Dados dos gráficos
  const vids = s.vids;
  const recentes = [...vids].sort((a, b) => pubSeg(a) - pubSeg(b)).slice(-20);
  const top = [...vids].sort((a, b) => b.views - a.views).slice(0, 10);
  const porDia = viewsPorDia(serieCanal, 14);

  const hoje = new Date(agoraDados() * 1000); hoje.setHours(0, 0, 0, 0);
  const posts30 = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(hoje); d.setDate(d.getDate() - i);
    const ini = d.getTime() / 1000;
    const n = vids.filter((v) => pubSeg(v) >= ini && pubSeg(v) < ini + 86400).length;
    posts30.push({ rot: dataCurta(ini), v: n, dica: `${dataCurta(ini)}: ${n} ${n === 1 ? 'corte' : 'cortes'}` });
  }

  const porHora = Array.from({ length: 24 }, () => ({ n: 0, views: 0 }));
  for (const v of vids) { const h = new Date(v.publicado).getHours(); porHora[h].n++; porHora[h].views += v.views; }

  const engaj = recentes.map((v) => ({
    rot: limpaTitulo(v.titulo), v: v.views ? v.likes / v.views : 0, cor: c.cor,
  })).reverse().slice(0, 10);

  const ordem = est.ordem || 'alta';
  const lista = [...vids];
  if (ordem === 'alta') lista.sort((a, b) => (ganhoVideo(b, horas).v || 0) - (ganhoVideo(a, horas).v || 0));
  if (ordem === 'total') lista.sort((a, b) => b.views - a.views);
  if (ordem === 'recentes') lista.sort((a, b) => pubSeg(b) - pubSeg(a));

  const somaViews = vids.reduce((a, v) => a + v.views, 0);
  const mediaViews = vids.length ? somaViews / vids.length : 0;
  const mediaLikes = somaViews ? vids.reduce((a, v) => a + v.likes, 0) / somaViews : 0;

  app.innerHTML = `
    <button class="voltar" onclick="location.hash=''">← Todos os canais</button>
    <div class="det-cab" style="--cor:${c.cor}">
      <img class="avatar" src="${esc(c.thumb)}" alt="" onerror="this.dataset.falhou=1">
      <div>
        <h1>${esc(c.nome)}</h1>
        <div class="links">
          <a href="${c.url}" target="_blank" rel="noopener">YouTube ${esc(c.youtube)}</a>
          ${c.tiktok ? `<a href="https://www.tiktok.com/${esc(c.tiktok)}" target="_blank" rel="noopener">TikTok ${esc(c.tiktok)}</a>` : ''}
          <span>atualizado ${ha(agoraDados())}</span>
        </div>
      </div>
      <div class="espaco"></div>${iconeRecarregar}
    </div>
    ${chips()}
    <div class="resumo seis">
      <div class="tile"><div class="rot">Inscritos</div><div class="val">${c.inscritosOcultos ? 'oculto' : fmt(c.inscritos)}</div><div class="var ${classeVar(s.inscritos)}">${fmtVar(s.inscritos)}</div></div>
      <div class="tile"><div class="rot">Views no período</div><div class="val">${fmt(s.views)}</div><div class="var neu">${s.parcial ? 'desde o início*' : '&nbsp;'}</div></div>
      <div class="tile"><div class="rot">Views totais</div><div class="val">${fmt(c.views)}</div><div class="var neu">&nbsp;</div></div>
      <div class="tile"><div class="rot">Vídeos</div><div class="val">${fmt(c.videos)}</div><div class="var neu">${s.postados} no período</div></div>
      <div class="tile"><div class="rot">Média por corte</div><div class="val">${fmt(mediaViews)}</div><div class="var neu">views</div></div>
      <div class="tile"><div class="rot">Curtidas por view</div><div class="val">${pct(mediaLikes)}</div><div class="var neu">engajamento</div></div>
    </div>

    <section>
      <h2>Metas de monetização</h2>
      <div class="metas">
        ${metas.map((mt) => `
          <div class="meta-card ${mt.ok ? 'ok' : ''}" style="--cor:${c.cor}">
            <div class="mc-cab">
              <div><div class="mc-nome">${mt.ok ? '✓ ' : ''}${esc(mt.nome)}</div><div class="mc-desc">${esc(mt.desc)}</div></div>
              <div class="mc-pct">${pct(mt.progresso)}</div>
            </div>
            ${mt.reqs.map((r) => `
              <div class="req">
                <div class="req-lin"><span>${esc(r.rot)}</span><b>${fmt(r.atual)} / ${fmt(r.alvo)}</b></div>
                ${barraProgresso(r.atual / r.alvo, r.atual >= r.alvo ? 'var(--positivo)' : c.cor)}
                <div class="req-info">${esc(r.info)}${r.estimativa ? ' · estimativa*' : ''}</div>
              </div>`).join('')}
          </div>`).join('')}
      </div>
      <p class="nota">O YouTube também aceita 4.000 horas assistidas em vídeos longos (ou 3.000 h no nível 1) no lugar das views de Shorts.
        Esse número só aparece no YouTube Studio. *Até o app juntar 90 dias de histórico, as views de 90 dias são estimadas.</p>
    </section>

    <section class="painel">
      <div class="painel-cab">
        <h2>Crescimento</h2>
        <div class="chips mini">
          <button class="chip ${est.metrica !== 'views' ? 'ativo' : ''}" data-metrica="inscritos">Inscritos</button>
          <button class="chip ${est.metrica === 'views' ? 'ativo' : ''}" data-metrica="views">Views totais</button>
        </div>
      </div>
      ${graficoLinhas([{ nome: c.nome, cor: c.cor, pts: serieCanal.map((p) => [p[0], p[m.idx]]) }], m.rot)}
    </section>

    <div class="grade-2">
      <section class="painel">
        <h2>Views ganhas por dia <span class="dica-h">· últimos 14 dias</span></h2>
        ${graficoColunas(porDia.map((d) => ({ rot: dataCurta(d.t), v: d.v })), { cor: c.cor, vazio: 'Aparece a partir do segundo dia de coleta.' })}
      </section>
      <section class="painel">
        <h2>Views por corte <span class="dica-h">· últimos ${recentes.length} postados, do mais antigo ao mais novo</span></h2>
        ${graficoColunas(recentes.map((v) => ({ rot: dataCurta(pubSeg(v)), v: v.views, dica: `${limpaTitulo(v.titulo)}: ${fmt(v.views)} views` })), { cor: c.cor, mostrarValor: false })}
      </section>
      <section class="painel">
        <h2>Top 10 cortes <span class="dica-h">· views totais</span></h2>
        ${graficoBarras(top.map((v) => ({ rot: limpaTitulo(v.titulo), sub: ha(pubSeg(v)), v: v.views, cor: c.cor, href: urlVideo(v) })))}
      </section>
      <section class="painel">
        <h2>Curtidas por view <span class="dica-h">· últimos 10 cortes</span></h2>
        ${graficoBarras(engaj, { formato: pct, vazio: 'Sem curtidas ainda.' })}
      </section>
      <section class="painel">
        <h2>Cortes postados por dia <span class="dica-h">· últimos 30 dias</span></h2>
        ${graficoColunas(posts30, { cor: c.cor, mostrarValor: false })}
      </section>
      <section class="painel">
        <h2>Média de views por horário de postagem</h2>
        ${graficoColunas(porHora.map((h, i) => ({ rot: `${i}h`, v: h.n ? h.views / h.n : 0,
          dica: h.n ? `${i}h: média de ${fmt(h.views / h.n)} views (${h.n} ${h.n === 1 ? 'corte' : 'cortes'})` : `${i}h: nenhum corte postado` })), { cor: c.cor, mostrarValor: false })}
      </section>
    </div>

    <section>
      <h2>Vídeos <span class="dica-h">· últimos ${vids.length}</span></h2>
      <div class="chips">
        ${[['alta', 'Em alta'], ['total', 'Mais vistos'], ['recentes', 'Recentes']].map(([k, r]) =>
          `<button class="chip ${ordem === k ? 'ativo' : ''}" data-ordem="${k}">${r}</button>`).join('')}
      </div>
      <div class="lista" style="--cor:${c.cor}">${lista.map((v) => linhaVideo(v, null, horas)).join('') || '<p class="vazio">Nenhum vídeo.</p>'}</div>
    </section>
    ${rodape(s.parcial)}`;
  ligarGraficos();
}

function render() {
  if (!est.atual) return;
  graficos.clear();
  const m = location.hash.match(/^#\/canal\/(.+)$/);
  if (m) telaCanal(decodeURIComponent(m[1])); else telaInicio();
}

// ======================= EVENTOS =======================
app.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.periodo) { est.periodo = b.dataset.periodo; salvarPref('periodo', est.periodo); render(); }
  if (b.dataset.ordem) { est.ordem = b.dataset.ordem; render(); }
  if (b.dataset.metrica) { est.metrica = b.dataset.metrica; render(); }
  if (b.dataset.dica) {
    const box = b.closest('.colunas');
    box.querySelectorAll('.col.sel').forEach((x) => x.classList.remove('sel'));
    b.classList.add('sel');
    box.nextElementSibling.textContent = b.dataset.dica;
  }
  if (b.id === 'recarregar') carregar();
});
window.addEventListener('hashchange', () => { est.ordem = ''; render(); window.scrollTo(0, 0); });

async function carregar() {
  document.getElementById('recarregar')?.classList.add('girando');
  try {
    const [a, h] = await Promise.all([
      fetch('dados/atual.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw 0; return r.json(); }),
      fetch('dados/historico.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { canais: {}, videos: {} })),
    ]);
    est.atual = a; est.hist = h;
    render();
  } catch {
    if (!est.atual) {
      app.innerHTML = `<div class="topo"><h1>Meus Canais</h1></div><p class="vazio">Ainda não há dados.<br>A primeira coleta ainda não rodou (veja o LEIA-ME).</p>`;
    }
  } finally {
    document.getElementById('recarregar')?.classList.remove('girando');
  }
}

carregar();
// Recarrega ao voltar para o app (ex.: abriu de novo no celular)
document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
