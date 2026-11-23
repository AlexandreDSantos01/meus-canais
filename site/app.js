'use strict';

const PERIODOS = [
  { id: '24h', rot: '24 horas', horas: 24 },
  { id: '7d', rot: '7 dias', horas: 24 * 7 },
  { id: '30d', rot: '30 dias', horas: 24 * 30 },
];
const app = document.getElementById('app');
const est = { atual: null, hist: null, periodo: lerPref('periodo', '24h'), ordem: '', metrica: 'inscritos' };

function lerPref(k, padrao) { try { return localStorage.getItem(k) || padrao; } catch { return padrao; } }
function salvarPref(k, v) { try { localStorage.setItem(k, v); } catch {} }

// ---------- formatação ----------
const nf = new Intl.NumberFormat('pt-BR');
const nfc = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const fmt = (n) => (n == null ? '—' : Math.abs(n) < 10000 ? nf.format(n) : nfc.format(n));
const fmtVar = (n) => (n == null ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)));
const classeVar = (n) => (!n ? 'neu' : n > 0 ? 'pos' : 'neg');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

// ---------- cálculos ----------
const agoraDados = () => Date.parse(est.atual.atualizado) / 1000;
const horasPeriodo = () => PERIODOS.find((p) => p.id === est.periodo).horas;

// Quanto a série cresceu no período. parcial = ainda não há histórico do período inteiro.
function variacao(serie, idx, horas, publicadoSeg) {
  if (!serie || !serie.length) return { v: null, parcial: true };
  const ult = serie[serie.length - 1];
  const alvo = agoraDados() - horas * 3600;
  let base = null;
  for (const p of serie) { if (p[0] <= alvo) base = p; else break; }
  if (base) return { v: ult[idx] - base[idx], parcial: false };
  if (publicadoSeg && publicadoSeg >= alvo) return { v: ult[idx], parcial: false }; // vídeo novo: começou do zero
  return { v: ult[idx] - serie[0][idx], parcial: true };
}

function ganhoVideo(v, horas = horasPeriodo()) {
  return variacao(est.hist.videos[v.id], 1, horas, Date.parse(v.publicado) / 1000);
}

function statsCanal(c, horas = horasPeriodo()) {
  const vids = est.atual.videos.filter((v) => v.canal === c.id);
  let views = 0, parcial = false;
  for (const v of vids) {
    const g = ganhoVideo(v, horas);
    views += g.v || 0;
    parcial ||= g.parcial;
  }
  const insc = variacao(est.hist.canais[c.id], 1, horas);
  const limite = agoraDados() - horas * 3600;
  const postados = vids.filter((v) => Date.parse(v.publicado) / 1000 >= limite).length;
  return { views, inscritos: insc.v, parcial: parcial || insc.parcial, postados, vids };
}

// ---------- gráficos ----------
function sparkline(serie, cor) {
  if (!serie || serie.length < 2) return '<svg class="spark"></svg>';
  const W = 96, H = 36, xs = serie.map((p) => p[0]), ys = serie.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const px = (x) => ((x - x0) / (x1 - x0 || 1)) * (W - 4) + 2;
  const py = (y) => H - 3 - ((y - y0) / (y1 - y0 || 1)) * (H - 6);
  const d = serie.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path d="${d}" fill="none" stroke="${cor}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function grafico(serie, cor, rotulo) {
  if (!serie || serie.length < 2) {
    return `<p class="vazio">O gráfico aparece depois de algumas coletas.</p>`;
  }
  const W = 600, H = 200, E = 70, T = 12, B = 30;
  const xs = serie.map((p) => p[0]), ys = serie.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const px = (x) => E + ((x - x0) / (x1 - x0 || 1)) * (W - E - 8);
  const py = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  const linha = serie.map((p, i) => `${i ? 'L' : 'M'}${px(p[0]).toFixed(1)},${py(p[1]).toFixed(1)}`).join('');
  const area = `${linha}L${px(x1).toFixed(1)},${H - B}L${px(x0).toFixed(1)},${H - B}Z`;
  const meio = (y0 + y1) / 2;
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return `
    <svg class="grafico" viewBox="0 0 ${W} ${H}" data-serie='${JSON.stringify(serie)}' data-rot="${esc(rotulo)}">
      <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="${cor}" stop-opacity="0.28"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/>
      </linearGradient></defs>
      ${[y1, meio, y0].map((v) => `<line class="grade" x1="${E}" x2="${W}" y1="${py(v)}" y2="${py(v)}"/>
        <text x="${E - 6}" y="${py(v) + 4}" text-anchor="end">${fmt(Math.round(v))}</text>`).join('')}
      <text x="${E}" y="${H - 4}">${dataCurta(x0)}</text>
      <text x="${W}" y="${H - 4}" text-anchor="end">${dataCurta(x1)}</text>
      <path d="${area}" fill="url(#${gid})"/>
      <path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      <line class="cursor" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="${cor}" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0"/>
    </svg>
    <div class="dica-graf">Toque no gráfico para ver cada ponto.</div>`;
}

function ligarGraficos() {
  document.querySelectorAll('.grafico').forEach((svg) => {
    const serie = JSON.parse(svg.dataset.serie);
    const dica = svg.nextElementSibling, cursor = svg.querySelector('.cursor');
    const x0 = serie[0][0], x1 = serie[serie.length - 1][0], E = 70, W = 600;
    const mover = (ev) => {
      const r = svg.getBoundingClientRect();
      const fx = ((ev.clientX - r.left) / r.width) * W;
      const t = x0 + ((fx - E) / (W - E - 8)) * (x1 - x0);
      let melhor = serie[0];
      for (const p of serie) if (Math.abs(p[0] - t) < Math.abs(melhor[0] - t)) melhor = p;
      const cx = E + ((melhor[0] - x0) / (x1 - x0 || 1)) * (W - E - 8);
      cursor.setAttribute('x1', cx); cursor.setAttribute('x2', cx); cursor.setAttribute('opacity', '0.8');
      dica.textContent = `${dataHora(melhor[0])} · ${nf.format(melhor[1])} ${svg.dataset.rot}`;
    };
    svg.addEventListener('pointermove', mover);
    svg.addEventListener('pointerdown', mover);
  });
}

// ---------- telas ----------
function topo(titulo, sub, comVoltar) {
  return `
    ${comVoltar ? `<button class="voltar" onclick="location.hash=''">← Todos os canais</button>` : ''}
    <div class="topo">
      <div><h1>${titulo}</h1><div class="sub">${sub}</div></div>
      <div class="espaco"></div>
      <button class="icone-btn" id="recarregar" aria-label="Atualizar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg>
      </button>
    </div>`;
}

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
  const url = v.duracao <= 180 ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
  return `
    <a class="video" href="${url}" target="_blank" rel="noopener" style="--cor:${c.cor}">
      ${i != null ? `<span class="pos-n">${i + 1}</span>` : ''}
      <img src="${esc(v.thumb)}" alt="" loading="lazy" onerror="this.dataset.falhou=1">
      <div class="info">
        <div class="tit">${esc(v.titulo)}</div>
        <div class="meta">
          ${i != null ? `<span class="tag">${esc(c.nome || '')}</span>` : ''}
          <span>${fmt(v.views)} views</span><span>♥ ${fmt(v.likes)}</span><span>💬 ${fmt(v.comentarios)}</span>
          <span>${ha(Date.parse(v.publicado) / 1000)}</span>
        </div>
      </div>
      <div class="ganho"><div class="g ${classeVar(g.v)}">${fmtVar(g.v)}</div><div class="r">no período${g.parcial ? '*' : ''}</div></div>
    </a>`;
}

function telaInicio() {
  const { atual } = est, horas = horasPeriodo();
  const porCanal = atual.canais.map((c) => ({ c, s: statsCanal(c, horas) }));
  const totInsc = atual.canais.reduce((a, c) => a + c.inscritos, 0);
  const varInsc = porCanal.reduce((a, x) => a + (x.s.inscritos || 0), 0);
  const totViews = porCanal.reduce((a, x) => a + x.s.views, 0);
  const totPost = porCanal.reduce((a, x) => a + x.s.postados, 0);
  const parcial = porCanal.some((x) => x.s.parcial);

  const emAlta = atual.videos
    .map((v) => ({ v, g: ganhoVideo(v, horas).v || 0 }))
    .filter((x) => x.g > 0)
    .sort((a, b) => b.g - a.g)
    .slice(0, 10);

  app.innerHTML = `
    ${topo('Meus Canais', `Atualizado ${ha(agoraDados())}`)}
    ${avisos()}
    ${chips()}
    <div class="resumo">
      <div class="tile"><div class="rot">Inscritos</div><div class="val">${fmt(totInsc)}</div><div class="var ${classeVar(varInsc)}">${fmtVar(varInsc)}</div></div>
      <div class="tile"><div class="rot">Views no período</div><div class="val">${fmt(totViews)}</div><div class="var neu">${parcial ? 'desde o início*' : '&nbsp;'}</div></div>
      <div class="tile"><div class="rot">Cortes postados</div><div class="val">${fmt(totPost)}</div><div class="var neu">&nbsp;</div></div>
    </div>

    <section>
      <h2>Canais</h2>
      <div class="canais">
        ${porCanal.map(({ c, s }) => `
          <a class="card" href="#/canal/${c.id}" style="--cor:${c.cor}">
            <div class="cab">
              <img class="avatar" src="${esc(c.thumb)}" alt="" onerror="this.dataset.falhou=1">
              <div><div class="nome">${esc(c.nome)}</div><div class="handle">${esc(c.youtube)}</div></div>
            </div>
            <div class="nums">
              <div class="num"><div class="rot">Inscritos</div><div class="val">${c.inscritosOcultos ? 'oculto' : fmt(c.inscritos)}</div><div class="var ${classeVar(s.inscritos)}">${fmtVar(s.inscritos)}</div></div>
              <div class="num"><div class="rot">Views no período</div><div class="val">${fmt(s.views)}</div><div class="var neu">${s.postados} ${s.postados === 1 ? 'corte novo' : 'cortes novos'}</div></div>
              ${sparkline(est.hist.canais[c.id], c.cor)}
            </div>
          </a>`).join('')}
      </div>
    </section>

    <section>
      <h2>Cortes em alta <span class="dica">· mais views ganhas no período</span></h2>
      ${emAlta.length
        ? `<div class="lista">${emAlta.map((x, i) => linhaVideo(x.v, i, horas)).join('')}</div>`
        : `<p class="vazio">Ainda sem dados suficientes. Volte depois da próxima coleta.</p>`}
    </section>
    ${rodape(parcial)}`;
}

function telaCanal(id) {
  const c = est.atual.canais.find((k) => k.id === id);
  if (!c) { location.hash = ''; return; }
  const horas = horasPeriodo(), s = statsCanal(c, horas);
  const serieCanal = est.hist.canais[c.id] || [];
  const metricas = { inscritos: { idx: 1, rot: 'inscritos' }, views: { idx: 2, rot: 'views totais' } };
  const m = metricas[est.metrica] || metricas.inscritos;
  const serie = serieCanal.map((p) => [p[0], p[m.idx]]);

  const ordem = est.ordem || 'alta';
  const vids = [...s.vids];
  if (ordem === 'alta') vids.sort((a, b) => (ganhoVideo(b, horas).v || 0) - (ganhoVideo(a, horas).v || 0));
  if (ordem === 'total') vids.sort((a, b) => b.views - a.views);
  if (ordem === 'recentes') vids.sort((a, b) => Date.parse(b.publicado) - Date.parse(a.publicado));

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
      <div class="espaco" style="flex:1"></div>
      <button class="icone-btn" id="recarregar" aria-label="Atualizar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 4v5h-5"/></svg>
      </button>
    </div>
    ${chips()}
    <div class="resumo quatro">
      <div class="tile"><div class="rot">Inscritos</div><div class="val">${c.inscritosOcultos ? 'oculto' : fmt(c.inscritos)}</div><div class="var ${classeVar(s.inscritos)}">${fmtVar(s.inscritos)}</div></div>
      <div class="tile"><div class="rot">Views no período</div><div class="val">${fmt(s.views)}</div><div class="var neu">${s.parcial ? 'desde o início*' : '&nbsp;'}</div></div>
      <div class="tile"><div class="rot">Views totais</div><div class="val">${fmt(c.views)}</div><div class="var neu">&nbsp;</div></div>
      <div class="tile"><div class="rot">Vídeos</div><div class="val">${fmt(c.videos)}</div><div class="var neu">${s.postados} no período</div></div>
    </div>

    <section>
      <div class="grafico-box">
        <div class="chips abas">
          <button class="chip ${est.metrica !== 'views' ? 'ativo' : ''}" data-metrica="inscritos">Inscritos</button>
          <button class="chip ${est.metrica === 'views' ? 'ativo' : ''}" data-metrica="views">Views totais</button>
        </div>
        ${grafico(serie, c.cor, m.rot)}
      </div>
    </section>

    <section>
      <h2>Vídeos <span class="dica">· últimos ${s.vids.length}</span></h2>
      <div class="chips">
        ${[['alta', 'Em alta'], ['total', 'Mais vistos'], ['recentes', 'Recentes']].map(([k, r]) =>
          `<button class="chip ${ordem === k ? 'ativo' : ''}" data-ordem="${k}">${r}</button>`).join('')}
      </div>
      <div class="lista" style="--cor:${c.cor}">${vids.map((v) => linhaVideo(v, null, horas)).join('') || '<p class="vazio">Nenhum vídeo.</p>'}</div>
    </section>
    ${rodape(s.parcial)}`;
  ligarGraficos();
}

function rodape(parcial) {
  return `<p class="rodape">${parcial ? '* O app ainda não tem histórico do período inteiro; conta desde a primeira coleta.<br>' : ''}
    O YouTube arredonda inscritos acima de 1.000 (ex.: 1,23 mil).</p>`;
}

function render() {
  if (!est.atual) return;
  const m = location.hash.match(/^#\/canal\/(.+)$/);
  if (m) telaCanal(decodeURIComponent(m[1])); else telaInicio();
}

// ---------- eventos ----------
app.addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  if (b.dataset.periodo) { est.periodo = b.dataset.periodo; salvarPref('periodo', est.periodo); render(); }
  if (b.dataset.ordem) { est.ordem = b.dataset.ordem; render(); }
  if (b.dataset.metrica) { est.metrica = b.dataset.metrica; render(); }
  if (b.id === 'recarregar') carregar(true);
});
window.addEventListener('hashchange', () => { est.ordem = ''; render(); window.scrollTo(0, 0); });

async function carregar(manual) {
  const btn = document.getElementById('recarregar');
  btn?.classList.add('girando');
  try {
    const [a, h] = await Promise.all([
      fetch('dados/atual.json', { cache: 'no-store' }).then((r) => { if (!r.ok) throw 0; return r.json(); }),
      fetch('dados/historico.json', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : { canais: {}, videos: {} })),
    ]);
    est.atual = a; est.hist = h;
    render();
  } catch {
    if (!est.atual) {
      app.innerHTML = `${topo('Meus Canais', '')}<p class="vazio">Ainda não há dados.<br>A primeira coleta ainda não rodou (veja o LEIA-ME).</p>`;
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
