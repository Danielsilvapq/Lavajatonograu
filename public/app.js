'use strict';
// ====================== Sistema No Grau - interface ======================

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reais = c => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const paraCent = s => { const t = String(s ?? '').replace(/[^\d,.-]/g, ''); if (!t) return 0; const n = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t; return Math.round(parseFloat(n) * 100) || 0; };
const centTxt = c => (Number(c || 0) / 100).toFixed(2).replace('.', ',');
const pad = n => String(n).padStart(2, '0');
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const agoraLocal = () => { const d = new Date(); return `${hojeISO()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const dataBR = s => s ? s.slice(0, 10).split('-').reverse().join('/') : '';
const horaBR = s => s && s.length > 10 ? s.slice(11, 16) : '';
const dataHoraBR = s => s ? `${dataBR(s)} ${horaBR(s)}`.trim() : '';
const somarDias = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const inicioMes = () => hojeISO().slice(0, 8) + '01';

const STATUS = { agendado: 'Agendado', aguardando: 'Aguardando', lavando: 'Lavando', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
const PROXIMO = { agendado: ['aguardando', 'Chegou'], aguardando: ['lavando', 'Iniciar'], lavando: ['pronto', 'Pronto'], pronto: ['entregue', 'Entregar'] };
const FORMAS = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Débito', credito: 'Crédito', outro: 'Outro' };
const PORTES = { pequeno: 'Pequeno (hatch)', medio: 'Médio (sedã/SUV compacto)', grande: 'Grande (SUV/caminhonete)', moto: 'Moto' };
const CORES = { 'Branco': '#f4f5f6', 'Preto': '#16181b', 'Prata': '#c3c7cc', 'Cinza': '#7d838a', 'Grafite': '#44494f', 'Vermelho': '#c62828', 'Vinho': '#6d1a2a',
  'Azul': '#1e5bb8', 'Azul marinho': '#1b2a4a', 'Verde': '#2e7d32', 'Amarelo': '#f2c200', 'Laranja': '#ef7d00', 'Bege': '#d9c7a3', 'Marrom': '#6d4c33',
  'Dourado': '#c9a227', 'Rosa': '#e48cab', 'Roxo': '#6a3fa0' };
function corHex(nome) {
  const n = String(nome || '').trim().toLowerCase(); if (!n) return null;
  const achou = Object.keys(CORES).sort((a, b) => b.length - a.length).find(c => n === c.toLowerCase() || n.startsWith(c.toLowerCase()) || n.startsWith(c.toLowerCase().slice(0, -1)));
  return achou ? CORES[achou] : null;
}
const corDot = nome => corHex(nome) ? `<span class="cor-dot" style="background:${corHex(nome)}" aria-hidden="true"></span>` : '';
const corTxt = nome => nome ? `${corDot(nome)}${esc(nome)}` : '';
const LOCAIS_AVARIA = CARRO.LOCAIS;
const TIPOS_AVARIA = ['Risco', 'Amassado', 'Trinca / quebrado', 'Pintura descascada', 'Pintura queimada / manchada', 'Ferrugem', 'Rasgo', 'Mancha', 'Peça faltando', 'Outro'];

// fotos: escolher (câmera ou galeria), reduzir no aparelho e enviar
function escolherFotos(multiplo = true) {
  return new Promise(ok => {
    const i = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: multiplo });
    i.onchange = () => ok([...i.files]); i.addEventListener('cancel', () => ok([])); i.click();
  });
}
async function reduzirFoto(arquivo, max = 1600) {
  let img;
  try { img = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); }
  catch { img = await new Promise((ok, falha) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => falha(new Error('Não consegui abrir essa imagem')); im.src = URL.createObjectURL(arquivo); }); }
  const esc = Math.min(1, max / Math.max(img.width, img.height));
  const cv = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * esc), height: Math.round(img.height * esc) });
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return new Promise(ok => cv.toBlob(ok, 'image/jpeg', 0.82));
}
async function enviarFotos(veiculoId, arquivos, tipo, avariaId) {
  let n = 0;
  for (const arq of arquivos) {
    aviso(`Enviando foto ${++n} de ${arquivos.length}…`);
    const blob = await reduzirFoto(arq);
    const r = await fetch(`/api/veiculos/${veiculoId}/fotos?tipo=${tipo}${avariaId ? '&avaria_id=' + avariaId : ''}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'Falha ao enviar a foto');
  }
  if (arquivos.length) aviso(arquivos.length > 1 ? `${arquivos.length} fotos salvas` : 'Foto salva');
}
const galeria = (fotos, vazio = '') => fotos.length ? `<div class="fotos">${fotos.map(f => `<button type="button" class="foto" data-foto="${f.id}" title="${esc(dataHoraBR(f.criado_em))}${f.usuario_nome ? ' · ' + esc(f.usuario_nome) : ''}"><img src="/api/fotos/${f.id}" alt="Foto" loading="lazy"></button>`).join('')}</div>` : vazio;
// abre a foto grande; "lista" permite passar para a próxima
function verFoto(lista, id, aoExcluir) {
  let i = lista.findIndex(f => f.id === id);
  const desenhar = () => { const f = lista[i];
    abrirModal(`<div class="visor"><img src="/api/fotos/${f.id}" alt="Foto ampliada"><div class="linha entre mt"><small>${dataHoraBR(f.criado_em)}${f.usuario_nome ? ' · ' + esc(f.usuario_nome) : ''} · ${i + 1} de ${lista.length}</small>
      <div class="linha">${lista.length > 1 ? '<button class="peq" data-ant>←</button><button class="peq" data-prox>→</button>' : ''}
      <a class="btn peq" href="/api/fotos/${f.id}" download="foto-${f.id}.jpg">Baixar</a>${dono() && aoExcluir ? '<button class="peq perigo" data-excluir>Excluir</button>' : ''}<button class="peq" data-fechar>Fechar</button></div></div></div>`, cx => {
      cx.classList.add('larga');
      const ant = $('[data-ant]', cx), prox = $('[data-prox]', cx);
      if (ant) ant.onclick = () => { i = (i - 1 + lista.length) % lista.length; desenhar(); };
      if (prox) prox.onclick = () => { i = (i + 1) % lista.length; desenhar(); };
      const ex = $('[data-excluir]', cx); if (ex) ex.onclick = () => confirm('Excluir esta foto?') && tentar(async () => { await DEL('/api/fotos/' + f.id); fecharModal(); aoExcluir(); });
    }); };
  desenhar();
}
const UNIDADES = { un: 'unidade', L: 'litro', ml: 'mililitro', kg: 'quilo', g: 'grama', cx: 'caixa', par: 'par' };
const fmtQtd = (v, u) => `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${u || ''}`.trim();
const paraQtd = s => { const t = String(s ?? '').trim(); if (!t) return 0; return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t) || 0; };
const qtdTxt = v => String(Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false }));
function situacaoEstoque(p) {
  if (p.quantidade <= 0) return ['zerado', 'Zerado', 's-cancelado'];
  if (p.minimo > 0 && p.quantidade <= p.minimo) return ['baixo', 'Baixo', 's-aguardando'];
  return ['ok', 'OK', 's-pago'];
}
function marcarEstoqueBaixo(n) {
  const a = $('a[data-rota="estoque"]'); if (!a) return;
  $('.badge-menu', a)?.remove();
  if (n > 0) a.insertAdjacentHTML('beforeend', `<span class="badge-menu" title="Produtos com estoque baixo">${n}</span>`);
}
const TIPOS_MOV = { entrada: ['Compra', 's-pago'], uso: ['Uso', 's-entregue'], venda: ['Venda', 's-lavando'], consumo: ['Consumo da OS', 's-entregue'], estorno: ['Devolução', 's-agendado'], ajuste: ['Ajuste', 's-aguardando'] };
const selo = st => `<span class="selo s-${st}">${STATUS[st] || st}</span>`;
const placa = p => p ? `<span class="placa">${esc(p)}</span>` : '';
const idade = n => { if (!n) return null; const h = hojeISO(); let a = +h.slice(0, 4) - +n.slice(0, 4); if (h.slice(5) < n.slice(5)) a--; return a >= 0 && a < 130 ? a : null; };
const aniversarioHoje = n => !!n && n.slice(5) === hojeISO().slice(5);
const aniversarioTxt = n => n ? `${n.slice(8, 10)}/${n.slice(5, 7)}${idade(n) !== null ? ` · ${idade(n)} anos` : ''}${aniversarioHoje(n) ? ' 🎂 Hoje!' : ''}` : '';
const msgAniversario = nome => (estado.config.msg_aniversario || 'Feliz aniversário, {cliente}!').replace(/\{cliente\}/g, String(nome || '').split(' ')[0]).replace(/\{empresa\}/g, estado.empresa);
const telLink = t => { const d = String(t || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : ''; };

async function api(metodo, url, corpo) {
  const r = await fetch(url, { method: metodo, headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
  let dados = {}; try { dados = await r.json(); } catch {}
  if (r.status === 401 && !url.includes('/login')) { estado.usuario = null; iniciar(); throw new Error('Sessão expirada'); }
  if (!r.ok) throw new Error(dados.erro || 'Erro ao comunicar com o sistema');
  return dados;
}
const GET = u => api('GET', u), POST = (u, b) => api('POST', u, b || {}), PUT = (u, b) => api('PUT', u, b || {}), DEL = u => api('DELETE', u, {});

let toastTimer;
function aviso(msg, erro) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (erro ? ' erro' : ''); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, erro ? 5000 : 2500);
}
// executa ação mostrando erro amigável
async function tentar(fn) { try { return await fn(); } catch (e) { aviso(e.message, true); } }

function abrirModal(html, aoAbrir) {
  const m = $('#modal'); $('.modal-caixa', m).innerHTML = html; m.hidden = false;
  m.onclick = e => { if (e.target === m || e.target.closest('[data-fechar]')) fecharModal(); };
  const f = $('input, select, textarea', m); if (f) setTimeout(() => { if (!m.contains(document.activeElement)) f.focus(); }, 30);
  aoAbrir && aoAbrir($('.modal-caixa', m));
}
function fecharModal() { $('#modal').hidden = true; const c = $('#modal .modal-caixa'); c.innerHTML = ''; c.classList.remove('larga'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) fecharModal(); });
function mascaraDoc(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2})/, '$1.$2.$3/$4-$5');
}
document.addEventListener('input', e => { if (e.target.matches?.('[data-doc]')) e.target.value = mascaraDoc(e.target.value); });
// Consulta de CNPJ: ao digitar 14 dígitos, busca na Receita e preenche os campos vazios.
// alvo = { nome, endereco, telefone, email } com o "name" de cada campo a preencher
function ligarBuscaCnpj(raiz, nomeDoc, alvo) {
  const input = $(`[name=${nomeDoc}]`, raiz); if (!input) return;
  const box = document.createElement('div'); box.className = 'cnpj-box'; box.hidden = true;
  (input.closest('.grade') || input.closest('.campo')).after(box);
  let ultimo = '', timer;
  const campo = k => alvo[k] && $(`[name=${alvo[k]}]`, raiz);
  async function consultar(forcar) {
    const d = input.value.replace(/\D/g, '');
    if (d.length !== 14) { box.hidden = true; ultimo = ''; return; }
    if (d === ultimo && !forcar) return; ultimo = d;
    box.hidden = false; box.className = 'cnpj-box'; box.innerHTML = '<small>Consultando CNPJ na Receita…</small>';
    try {
      const r = await GET('/api/cnpj/' + d);
      if (input.value.replace(/\D/g, '') !== d) return;
      const valores = { nome: r.razao_social, endereco: r.endereco, telefone: r.telefone, email: r.email };
      const preenchidos = []; let conflito = false;
      for (const [k, v] of Object.entries(valores)) { const c = campo(k); if (!c || !v) continue;
        if (!c.value.trim()) { c.value = v; preenchidos.push(k); } else if (c.value.trim() !== v) conflito = true; }
      const ativa = !r.situacao || /^ativa$/i.test(r.situacao.trim());
      box.className = 'cnpj-box ' + (ativa ? 'ok' : 'alerta');
      box.innerHTML = `<b>${esc(r.razao_social)}</b>${r.nome_fantasia ? ` <small>(${esc(r.nome_fantasia)})</small>` : ''}
        <br><small>Situação: <b>${esc(r.situacao || '—')}</b>${ativa ? '' : ' ⚠ empresa não está ativa'}${r.endereco ? ' · ' + esc(r.endereco) : ''}</small>
        <div class="linha" style="margin-top:6px">${preenchidos.length ? `<small>✔ Dados preenchidos automaticamente</small>` : ''}
        ${conflito ? `<button type="button" class="peq" data-sobrescrever>Usar dados da Receita</button>` : ''}</div>`;
      const b = $('[data-sobrescrever]', box);
      if (b) b.onclick = () => { for (const [k, v] of Object.entries(valores)) { const c = campo(k); if (c && v) c.value = v; } b.replaceWith(Object.assign(document.createElement('small'), { textContent: '✔ Dados substituídos' })); };
    } catch (e) {
      box.className = 'cnpj-box alerta';
      box.innerHTML = `<small>${esc(e.message)}</small> <button type="button" class="peq fantasma" data-tentar>Tentar de novo</button>`;
      $('[data-tentar]', box).onclick = () => consultar(true);
    }
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(consultar, 350); });
}
const dadosForm = form => Object.fromEntries(new FormData(form));

// ---------- estado e navegação ----------
const estado = { demo: false, usuario: null, empresa: 'No Grau', config: {}, servicos: [], usuarios: [] };
const dono = () => estado.usuario?.papel === 'dono';
let atualizador = null;

const MENU = [
  ['painel', 'Painel', '▦'], ['os/nova', 'Nova OS', '＋'], ['agenda', 'Agenda', '◷'], ['ordens', 'Ordens de serviço', '☰'], ['clientes', 'Clientes', '☺'], ['aniversariantes', 'Aniversariantes', '✿'], ['estoque', 'Estoque', '▣'],
  ['-', 'Gestão', '', 1], ['caixa', 'Caixa', '$', 1], ['despesas', 'Despesas', '↘', 1], ['relatorios', 'Relatórios', '▤', 1], ['planos', 'Planos mensais', '★', 1],
  ['-', 'Cadastros'], ['servicos', 'Serviços e preços', '✦'], ['equipe', 'Equipe', '⚇', 1], ['config', 'Configurações', '⚙'],
];

function montarLayout() {
  const itens = MENU.filter(m => !m[3] || dono()).map(([r, nome, ic]) => r === '-' ? `<div class="sep">${nome}</div>` : `<a href="#/${r}" data-rota="${r}"><span aria-hidden="true">${ic}</span>${nome}</a>`).join('');
  $('#app').innerHTML = `
  <div class="layout">
    <aside class="lateral">
      <div class="marca"><img src="/icone.svg" alt=""><span>${esc(estado.empresa)}<small>Gestão de lava jato</small></span></div>
      <nav class="menu">${itens}</nav>
      <div class="usuario-box"><b>${esc(estado.usuario.nome)}</b>${dono() ? 'Dono' : 'Funcionário'}<br><button class="peq" id="sair">Sair</button></div>
    </aside>
    <div>
      <div class="barra-mobile"><button id="abrir-menu" aria-label="Menu">☰</button>${esc(estado.empresa)}</div>
      ${estado.demo ? `<div class="faixa-demo"><b>Demonstração</b> · dados fictícios. Fique à vontade para testar: tudo volta ao original quando a demonstração reinicia.</div>` : ''}
      <main class="principal" id="conteudo"></main>
    </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', `<datalist id="lista-cores">${Object.keys(CORES).map(c => `<option value="${c}">`).join('')}</datalist>`);
  $('#sair').onclick = async () => { await POST('/api/logout'); estado.usuario = null; iniciar(); };
  $('#abrir-menu').onclick = e => { e.stopPropagation(); $('.layout').classList.toggle('menu-aberto'); };
  $('.principal').onclick = () => $('.layout').classList.remove('menu-aberto');
}

const ROTAS = [];
const rota = (re, fn, soDono) => ROTAS.push({ re, fn, soDono });

async function navegar() {
  if (!estado.usuario) return;
  clearInterval(atualizador);
  const hash = location.hash.replace(/^#\/?/, '') || 'painel';
  const [caminho, busca] = hash.split('?');
  const params = Object.fromEntries(new URLSearchParams(busca || ''));
  $$('.menu a').forEach(a => a.classList.toggle('ativo', caminho === a.dataset.rota || (a.dataset.rota !== 'os/nova' && caminho.startsWith(a.dataset.rota + '/'))));
  $('.layout')?.classList.remove('menu-aberto');
  const el = $('#conteudo');
  for (const r of ROTAS) {
    const m = caminho.match(r.re);
    if (m) {
      if (r.soDono && !dono()) { el.innerHTML = '<div class="card vazio">Acesso só para o dono.</div>'; return; }
      el.innerHTML = '<div class="vazio">Carregando…</div>';
      try { await r.fn(el, m, params); } catch (e) { el.innerHTML = `<div class="card vazio">${esc(e.message)}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  el.innerHTML = '<div class="card vazio">Página não encontrada.</div>';
}
window.addEventListener('hashchange', navegar);

async function carregarBase() {
  [estado.servicos, estado.usuarios, estado.config] = await Promise.all([GET('/api/servicos'), GET('/api/usuarios'), GET('/api/config')]);
  estado.empresa = estado.config.nome_empresa || estado.empresa;
}

// ---------- login e primeira configuração ----------
async function iniciar() {
  clearInterval(atualizador);
  const st = await GET('/api/status');
  estado.empresa = st.empresa || estado.empresa; estado.demo = !!st.demo;
  document.title = (estado.demo ? 'DEMO · ' : '') + estado.empresa;
  if (st.precisaSetup) return telaSetup();
  if (!st.usuario) return telaLogin();
  estado.usuario = st.usuario;
  await carregarBase();
  montarLayout();
  navegar();
}

function telaLogin() {
  $('#app').innerHTML = `<div class="tela-login"><form class="card" id="f">
    <div class="marca"><img src="/icone.svg" alt="" width="40"><span>${esc(estado.empresa)}<small>Entre para continuar</small></span></div>
    <div class="campo"><label>Login</label><input name="login" autocomplete="username" required autocapitalize="none"></div>
    <div class="campo"><label>Senha</label><input name="senha" type="password" autocomplete="current-password" required></div>
    <button class="prim" style="width:100%;justify-content:center">Entrar</button>
    ${estado.demo ? `<div class="login-demo"><b>Versão de demonstração</b><br><small>Dados fictícios. Entre com um clique:</small>
      <div class="linha mt" style="justify-content:center"><button type="button" class="prim" data-demo="dono">Entrar como dono</button><button type="button" data-demo="carlos">Entrar como funcionário</button></div></div>` : ''}</form></div>`;
  $('#f').onsubmit = e => { e.preventDefault(); tentar(async () => { await POST('/api/login', dadosForm(e.target)); iniciar(); }); };
  $$('[data-demo]').forEach(b => b.onclick = () => tentar(async () => { await POST('/api/login', { login: b.dataset.demo, senha: 'demo123' }); iniciar(); }));
  $('[name=login]').focus();
}

function telaSetup() {
  $('#app').innerHTML = `<div class="tela-login"><form class="card" id="f">
    <div class="marca"><img src="/icone.svg" alt="" width="40"><span>Bem-vindo!<small>Crie o acesso do dono</small></span></div>
    <div class="campo"><label>Seu nome</label><input name="nome" required></div>
    <div class="campo"><label>Login</label><input name="login" required autocapitalize="none"></div>
    <div class="campo"><label>Senha (mín. 6 caracteres)</label><input name="senha" type="password" minlength="6" required></div>
    <button class="prim" style="width:100%;justify-content:center">Começar a usar</button></form></div>`;
  $('#f').onsubmit = e => { e.preventDefault(); tentar(async () => { await POST('/api/setup', dadosForm(e.target)); iniciar(); }); };
}

// ---------- painel ----------
rota(/^painel$/, async el => {
  const desenhar = async () => {
    const d = await GET('/api/painel');
    const hoje = d.dia;
    const col = {
      agendado: d.ordens.filter(o => o.status === 'agendado' && o.data_ref.slice(0, 10) === hoje),
      aguardando: d.ordens.filter(o => o.status === 'aguardando'),
      lavando: d.ordens.filter(o => o.status === 'lavando'),
      pronto: d.ordens.filter(o => o.status === 'pronto'),
      entregue: d.ordens.filter(o => o.status === 'entregue' && o.data_ref.slice(0, 10) === hoje),
    };
    const abertas = col.aguardando.length + col.lavando.length;
    const card = o => `<div class="os-card ${o.status}" data-os="${o.id}">
      <div class="cab"><span>${placa(o.placa) || '<b>' + esc(o.modelo || 'Veículo') + '</b>'} <small>#${o.id}</small></span><small>${horaBR(o.data_ref)}</small></div>
      <div><b>${esc(o.cliente_nome || '—')}</b> <small>${esc(o.modelo || '')}</small></div>
      <div class="serv">${esc(o.servicos || '')}${o.funcionario_nome ? ` · <i>${esc(o.funcionario_nome)}</i>` : ''}</div>
      <div class="rod"><span class="num"><b>${reais(o.total)}</b> ${o.total > 0 ? (o.pago >= o.total ? '<span class="selo s-pago">Pago</span>' : '') : (o.usa_plano ? '<span class="selo s-agendado">Plano</span>' : '')}</span>
      ${PROXIMO[o.status] ? `<button class="${o.status === 'lavando' ? 'verde' : 'prim'}" data-avancar="${o.id}" data-para="${PROXIMO[o.status][0]}">${PROXIMO[o.status][1]} →</button>` : ''}</div></div>`;
    const coluna = (st, titulo) => `<div class="coluna"><h3>${titulo}<span>${col[st].length}</span></h3>${col[st].map(card).join('') || '<div class="vazio" style="padding:14px 4px;font-size:13px">Nada aqui</div>'}</div>`;
    el.innerHTML = `
      <div class="topo"><div><h1>Painel do dia</h1><small>${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</small></div>
        <div class="acoes"><a class="btn" href="#/agenda">Agendar</a><a class="btn prim" href="#/os/nova">＋ Nova OS</a></div></div>
      <div class="grade g4">
        <div class="card kpi"><div class="rotulo">Na fila / lavando</div><div class="valor">${abertas}</div></div>
        <div class="card kpi"><div class="rotulo">Prontos p/ retirar</div><div class="valor">${col.pronto.length}</div></div>
        ${dono() ? `<div class="card kpi"><div class="rotulo">Recebido hoje</div><div class="valor">${reais(d.faturamento)}</div></div>
        <div class="card kpi"><div class="rotulo">Recebido no mês</div><div class="valor">${reais(d.faturamento_mes)}</div></div>` :
        `<div class="card kpi"><div class="rotulo">Agendados hoje</div><div class="valor">${col.agendado.length}</div></div>
        <div class="card kpi"><div class="rotulo">Entregues hoje</div><div class="valor">${col.entregue.length}</div></div>`}
      </div>
      ${d.estoque_baixo.length ? `<div class="card mt aviso-estoque"><div class="linha entre"><h2 style="margin:0">⚠ Estoque baixo</h2><a href="#/estoque?filtro=baixo">Ver estoque</a></div>
        <div class="linha mt">${d.estoque_baixo.slice(0, 8).map(x => `<a class="chip-estoque" href="#/estoque/${x.id}"><b>${esc(x.nome)}</b> ${fmtQtd(x.quantidade, x.unidade)} <small>mín. ${fmtQtd(x.minimo, x.unidade)}</small></a>`).join('')}
        ${d.estoque_baixo.length > 8 ? `<small>e mais ${d.estoque_baixo.length - 8}</small>` : ''}</div></div>` : ''}
      ${d.aniversariantes.length ? `<div class="card mt" style="border-left:4px solid var(--roxo)"><div class="linha entre"><h2 style="margin:0">🎂 Aniversariantes de hoje</h2><a href="#/aniversariantes" class="peq">Ver do mês</a></div>
        <div class="linha mt">${d.aniversariantes.map(a => `<span class="linha" style="gap:6px;background:var(--roxo-claro);padding:6px 10px;border-radius:8px">
          ${a.tipo === 'cliente' ? `<a href="#/clientes/${a.id}"><b>${esc(a.nome)}</b></a>` : `<b>${esc(a.nome)}</b> <small>(equipe)</small>`}${idade(a.nascimento) !== null ? ` <small>${idade(a.nascimento)} anos</small>` : ''}
          ${linkWhats(a.telefone, msgAniversario(a.nome)) ? `<a class="btn peq" href="${esc(linkWhats(a.telefone, msgAniversario(a.nome)))}" target="_blank" rel="noopener">Parabéns no WhatsApp</a>` : ''}</span>`).join('')}</div></div>` : ''}
      <div class="kanban mt">${coluna('agendado', 'Agendados hoje')}${coluna('aguardando', 'Aguardando')}${coluna('lavando', 'Lavando')}${coluna('pronto', 'Pronto')}${coluna('entregue', 'Entregues hoje')}</div>`;
    marcarEstoqueBaixo(d.estoque_baixo.length);
    $$('[data-os]', el).forEach(c => c.onclick = e => { if (!e.target.closest('button')) location.hash = '#/os/' + c.dataset.os; });
    $$('[data-avancar]', el).forEach(b => b.onclick = () => tentar(async () => {
      const id = b.dataset.avancar, para = b.dataset.para;
      if (para === 'entregue') return location.hash = '#/os/' + id + '?entregar=1';
      await PUT(`/api/ordens/${id}/status`, { status: para });
      if (para === 'pronto') { const o = await GET('/api/ordens/' + id); oferecerWhats(o); }
      desenhar();
    }));
  };
  await desenhar();
  atualizador = setInterval(() => { if ($('#modal').hidden && location.hash.replace(/^#\/?/, '') in { '': 1, painel: 1 }) desenhar().catch(() => {}); }, 30000);
});

function mensagemPronto(o) {
  const tpl = estado.config.msg_pronto || 'Olá {cliente}! Seu veículo está pronto.';
  return tpl.replace(/\{cliente\}/g, (o.cliente_nome || '').split(' ')[0]).replace(/\{veiculo\}/g, o.modelo || 'veículo').replace(/\{placa\}/g, o.placa || '')
    .replace(/\{empresa\}/g, estado.empresa).replace(/\{total\}/g, reais(o.total)).replace(/\s\(\)/g, '');
}
function linkWhats(tel, msg) { const n = telLink(tel); if (!n) return ''; return estado.demo ? `https://wa.me/?text=${encodeURIComponent(msg)}` : `https://wa.me/${n}?text=${encodeURIComponent(msg)}`; }
function oferecerWhats(o) {
  const link = linkWhats(o.cliente_telefone, mensagemPronto(o));
  if (!link) return aviso('Veículo marcado como pronto');
  abrirModal(`<h2>Veículo pronto! ✔</h2><p>Avisar <b>${esc(o.cliente_nome)}</b> pelo WhatsApp?</p>
    <div class="card" style="background:var(--fundo);white-space:pre-wrap">${esc(mensagemPronto(o))}</div>
    <div class="rodape"><button data-fechar>Agora não</button><a class="btn verde" style="background:var(--verde);color:#fff" href="${esc(link)}" target="_blank" rel="noopener" data-fechar>Enviar no WhatsApp</a></div>`);
}

// ---------- formulário de OS (nova / editar) ----------
rota(/^os\/nova$/, (el, m, p) => formOS(el, null, p));
rota(/^os\/(\d+)\/editar$/, async (el, m) => formOS(el, await GET('/api/ordens/' + m[1]), {}));

async function formOS(el, ordem, p) {
  const f = {
    cliente: null, veiculoId: ordem?.veiculo_id || null, novoCliente: false, novoVeiculo: false,
    itens: new Map(), // servico_id -> {descricao, valor}; avulsos com chave 'a1', 'a2'...
    agendar: ordem ? ordem.status === 'agendado' : p.agendar === '1',
    dataRef: ordem ? ordem.data_ref.replace(' ', 'T') : (p.data ? `${p.data}T${p.hora || '08:00'}` : agoraLocal()),
    funcionario: ordem?.funcionario_id || '', desconto: ordem?.desconto || 0, usaPlano: !!ordem?.usa_plano, obs: ordem?.obs || '',
  };
  let seqAvulso = 0;
  if (ordem) {
    for (const i of ordem.itens) f.itens.set(i.servico_id && !f.itens.has(i.servico_id) ? i.servico_id : 'a' + (++seqAvulso), { descricao: i.descricao, valor: i.valor });
    if (ordem.usa_plano) f.desconto = 0;
    if (ordem.cliente_id) f.cliente = await GET('/api/clientes/' + ordem.cliente_id);
  } else if (p.cliente) {
    f.cliente = await GET('/api/clientes/' + p.cliente);
    f.veiculoId = p.veiculo ? Number(p.veiculo) : f.cliente.veiculos[0]?.id || null;
  }
  if (f.cliente && !f.veiculoId) f.novoVeiculo = true;

  const veiculoAtual = () => f.cliente?.veiculos.find(v => v.id === f.veiculoId);
  const porteAtual = () => f.novoVeiculo || !veiculoAtual() ? ($('[name=nv_porte]', el)?.value || 'medio') : veiculoAtual().porte;
  const servicosLista = estado.servicos;

  el.innerHTML = `
    <div class="topo"><h1>${ordem ? `Editar OS #${ordem.id}` : f.agendar ? 'Novo agendamento' : 'Nova ordem de serviço'}</h1></div>
    <div class="grade" style="grid-template-columns:minmax(0,1fr) 320px;align-items:start" id="os-grade">
      <div class="grade">
        <div class="card" id="bloco-cliente"></div>
        <div class="card"><h2>Serviços</h2><div class="serv-lista" id="serv-lista"></div>
          <button class="peq mt" id="add-avulso">＋ Item avulso</button></div>
        <div class="card"><h2>Detalhes</h2>
          <div class="linha" style="margin-bottom:12px"><label class="check"><input type="radio" name="quando" value="agora" ${!f.agendar ? 'checked' : ''}> Carro já está aqui</label>
            <label class="check"><input type="radio" name="quando" value="agendar" ${f.agendar ? 'checked' : ''}> Agendar</label></div>
          <div class="grade g2">
            <div class="campo"><label>${f.agendar ? 'Data e hora do agendamento' : 'Entrada'}</label><input type="datetime-local" id="data-ref" value="${esc(f.dataRef)}"></div>
            <div class="campo"><label>Funcionário responsável</label><select id="func"><option value="">— definir depois —</option>
              ${estado.usuarios.filter(u => u.ativo || u.id === f.funcionario).map(u => `<option value="${u.id}" ${u.id === f.funcionario ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select></div>
          </div>
          <div class="campo"><label>Observações (riscos, objetos no carro, pedido do cliente…)</label><textarea id="obs">${esc(f.obs)}</textarea></div>
        </div>
      </div>
      <div class="grade" style="position:sticky;top:16px">
        <div class="card"><div id="plano-box"></div>
          <div class="campo" id="desc-box"><label>Desconto (R$)</label><input id="desconto" inputmode="decimal" value="${f.desconto ? centTxt(f.desconto) : ''}" placeholder="0,00"></div>
          <div class="total-box"><div class="linha entre"><span>Subtotal</span><span id="t-sub" class="num"></span></div><div class="linha entre"><span>Desconto</span><span id="t-desc" class="num"></span></div>
            <div class="grande" id="t-total"></div></div>
          <button class="prim mt" id="salvar" style="width:100%;justify-content:center;padding:12px">${ordem ? 'Salvar alterações' : f.agendar ? 'Agendar' : 'Abrir OS'}</button>
          ${ordem ? `<a class="btn mt" href="#/os/${ordem.id}" style="width:100%;justify-content:center">Cancelar</a>` : ''}
        </div>
      </div>
    </div>`;
  if (innerWidth < 860) $('#os-grade', el).style.gridTemplateColumns = '1fr';

  function desenharCliente() {
    const b = $('#bloco-cliente', el);
    if (f.novoCliente) {
      b.innerHTML = `<div class="linha entre"><h2>Novo cliente</h2><button class="peq fantasma" id="voltar-busca">← buscar cadastrado</button></div>
        <div class="grade g3"><div class="campo"><label>Nome / Razão social *</label><input name="nc_nome"></div><div class="campo"><label>WhatsApp / telefone</label><input name="nc_tel" inputmode="tel"></div>
        <div class="campo"><label>CPF/CNPJ</label><input name="nc_doc" data-doc inputmode="numeric"></div></div>
        <input type="hidden" name="nc_endereco"><input type="hidden" name="nc_email">
        ${camposVeiculo()}`;
      ligarBuscaCnpj(b, 'nc_doc', { nome: 'nc_nome', telefone: 'nc_tel', endereco: 'nc_endereco', email: 'nc_email' });
      $('#voltar-busca', b).onclick = () => { f.novoCliente = false; desenharCliente(); };
      $('[name=nc_nome]', b).focus();
    } else if (!f.cliente) {
      b.innerHTML = `<h2>Cliente e veículo</h2><div class="linha"><input id="busca-cli" class="cresce" placeholder="Buscar por placa, nome ou telefone…" autocomplete="off" style="flex:1;min-width:200px">
        <button id="novo-cli">＋ Cliente novo</button></div><div id="res-cli"></div>`;
      let timer;
      $('#busca-cli', b).oninput = e => { clearTimeout(timer); const q = e.target.value.trim(); if (q.length < 2) return $('#res-cli', b).innerHTML = '';
        timer = setTimeout(async () => {
          const lista = await GET('/api/clientes?limite=15&q=' + encodeURIComponent(q));
          $('#res-cli', b).innerHTML = lista.length ? `<div class="resultados">${lista.map(c => `<div data-cli="${c.id}"><b>${esc(c.nome)}</b> <small>${esc(c.telefone || '')}</small><br><small>${esc(c.veiculos || 'sem veículo')}</small></div>`).join('')}</div>`
            : `<p class="suave">Ninguém encontrado. <a href="#" id="cad-agora">Cadastrar agora</a></p>`;
          $$('[data-cli]', b).forEach(d => d.onclick = async () => { f.cliente = await GET('/api/clientes/' + d.dataset.cli); f.veiculoId = f.cliente.veiculos[0]?.id || null; f.novoVeiculo = !f.veiculoId; desenharCliente(); recalcPrecos(); });
          const cad = $('#cad-agora', b); if (cad) cad.onclick = ev => { ev.preventDefault(); f.novoCliente = true; desenharCliente();
            const placaQ = q.replace(/[\s-]/g, ''); if (/^[a-z]{3}\d[a-z0-9]\d{2}$/i.test(placaQ)) $('[name=nv_placa]', b).value = placaQ.toUpperCase(); else $('[name=nc_nome]', b).value = q; };
        }, 250); };
      $('#novo-cli', b).onclick = () => { f.novoCliente = true; desenharCliente(); };
      $('#busca-cli', b).focus();
    } else {
      const c = f.cliente;
      b.innerHTML = `<div class="linha entre"><h2 style="margin:0">${esc(c.nome)}</h2><button class="peq fantasma" id="trocar-cli">Trocar cliente</button></div>
        <small>${esc(c.telefone || 'sem telefone')}${c.assinatura ? ` · Plano <b>${esc(c.assinatura.plano_nome)}</b>` : ''}</small>
        <div class="campo mt"><label>Veículo</label><select id="sel-veic">${c.veiculos.map(v => `<option value="${v.id}" ${v.id === f.veiculoId && !f.novoVeiculo ? 'selected' : ''}>${esc([v.placa, v.modelo, v.cor].filter(Boolean).join(' · '))} — ${PORTES[v.porte].split(' ')[0]}</option>`).join('')}
          <option value="novo" ${f.novoVeiculo ? 'selected' : ''}>＋ Outro veículo…</option></select></div>
        ${!f.novoVeiculo && veiculoAtual()?.avarias_abertas ? `<div class="aviso-avaria">⚠ Este veículo tem <b>${veiculoAtual().avarias_abertas} avaria(s)</b> registrada(s). Confira antes de começar. <a href="#/veiculos/${f.veiculoId}" target="_blank" rel="noopener">Ver avarias</a></div>` : ''}
        ${f.novoVeiculo ? camposVeiculo() : ''}`;
      $('#trocar-cli', b).onclick = () => { f.cliente = null; f.veiculoId = null; f.novoVeiculo = false; f.usaPlano = false; desenharCliente(); recalcPrecos(); };
      $('#sel-veic', b).onchange = e => { f.novoVeiculo = e.target.value === 'novo'; f.veiculoId = f.novoVeiculo ? null : Number(e.target.value); desenharCliente(); recalcPrecos(); };
    }
    $$('[name=nv_porte]', b).forEach(s => s.onchange = recalcPrecos);
    desenharPlano();
  }
  const camposVeiculo = () => `<div class="grade g4" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
    <div class="campo"><label>Placa</label><input name="nv_placa" style="text-transform:uppercase" maxlength="8"></div>
    <div class="campo"><label>Modelo</label><input name="nv_modelo" placeholder="Ex.: Onix"></div>
    <div class="campo"><label>Cor</label><input name="nv_cor" list="lista-cores" autocomplete="off"></div>
    <div class="campo"><label>Porte</label><select name="nv_porte">${Object.entries(PORTES).map(([k, v]) => `<option value="${k}" ${k === 'medio' ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>`;

  const precoServ = (s, porte) => s['preco_' + porte] || 0;
  function desenharServicos() {
    const porte = porteAtual();
    const avulsos = [...f.itens.entries()].filter(([k]) => typeof k === 'string');
    $('#serv-lista', el).innerHTML = servicosLista.map(s => {
      const it = f.itens.get(s.id);
      return `<div class="serv-item ${it ? 'marcado' : ''}"><label class="check"><input type="checkbox" data-serv="${s.id}" ${it ? 'checked' : ''}> ${esc(s.nome)} <small>${s.duracao_min} min</small></label>
        <input type="text" inputmode="decimal" data-preco="${s.id}" value="${centTxt(it ? it.valor : precoServ(s, porte))}" aria-label="Preço ${esc(s.nome)}"></div>`;
    }).join('') + avulsos.map(([k, it]) => `<div class="serv-item marcado"><div class="linha"><button class="peq fantasma perigo" data-rem="${k}" title="Remover">✕</button><input class="cresce" data-desc-av="${k}" value="${esc(it.descricao)}" placeholder="Descrição" style="flex:1"></div>
        <input type="text" inputmode="decimal" data-preco-av="${k}" value="${centTxt(it.valor)}"></div>`).join('')
      || '<p class="suave">Nenhum serviço cadastrado. Cadastre em “Serviços e preços”.</p>';
    $$('[data-serv]', el).forEach(c => c.onchange = () => {
      const id = Number(c.dataset.serv), s = servicosLista.find(x => x.id === id);
      if (c.checked) f.itens.set(id, { descricao: s.nome, valor: paraCent($(`[data-preco="${id}"]`, el).value) }); else f.itens.delete(id);
      c.closest('.serv-item').classList.toggle('marcado', c.checked); totais();
    });
    $$('[data-preco]', el).forEach(i => i.oninput = () => { const id = Number(i.dataset.preco); if (f.itens.has(id)) { f.itens.get(id).valor = paraCent(i.value); totais(); } });
    $$('[data-preco-av]', el).forEach(i => i.oninput = () => { f.itens.get(i.dataset.precoAv).valor = paraCent(i.value); totais(); });
    $$('[data-desc-av]', el).forEach(i => i.oninput = () => { f.itens.get(i.dataset.descAv).descricao = i.value; });
    $$('[data-rem]', el).forEach(b => b.onclick = () => { f.itens.delete(b.dataset.rem); desenharServicos(); });
    totais();
  }
  function recalcPrecos() {
    const porte = porteAtual();
    for (const s of servicosLista) if (f.itens.has(s.id)) f.itens.get(s.id).valor = precoServ(s, porte);
    desenharServicos();
  }
  $('#add-avulso', el).onclick = () => { const k = 'a' + (++seqAvulso); f.itens.set(k, { descricao: '', valor: 0 }); desenharServicos(); $(`[data-desc-av="${k}"]`, el).focus(); };

  function desenharPlano() {
    const a = f.cliente?.assinatura; const box = $('#plano-box', el);
    if (!a) { f.usaPlano = false; box.innerHTML = ''; $('#desc-box', el).hidden = false; return totais(); }
    const restam = a.lavagens_mes - a.usadas_mes + (ordem?.usa_plano ? 1 : 0);
    box.innerHTML = `<label class="check" style="margin-bottom:12px"><input type="checkbox" id="usa-plano" ${f.usaPlano ? 'checked' : ''} ${restam <= 0 && !f.usaPlano ? 'disabled' : ''}>
      Usar plano “${esc(a.plano_nome)}” <small>(${Math.max(0, restam)} de ${a.lavagens_mes} restantes no mês)</small></label>`;
    $('#usa-plano', box).onchange = e => { f.usaPlano = e.target.checked; $('#desc-box', el).hidden = f.usaPlano; totais(); };
    $('#desc-box', el).hidden = f.usaPlano; totais();
  }

  function totais() {
    const sub = [...f.itens.values()].reduce((s, i) => s + i.valor, 0);
    const desc = f.usaPlano ? sub : Math.min(sub, paraCent($('#desconto', el).value));
    $('#t-sub', el).textContent = reais(sub); $('#t-desc', el).textContent = '− ' + reais(desc); $('#t-total', el).textContent = reais(sub - desc);
  }
  $('#desconto', el).oninput = totais;
  $$('[name=quando]', el).forEach(r => r.onchange = () => {
    f.agendar = r.value === 'agendar' && r.checked;
    $('#data-ref', el).previousElementSibling.textContent = f.agendar ? 'Data e hora do agendamento' : 'Entrada';
    if (!ordem) $('#salvar', el).textContent = f.agendar ? 'Agendar' : 'Abrir OS';
    if (!f.agendar && !ordem) $('#data-ref', el).value = agoraLocal();
  });

  $('#salvar', el).onclick = () => tentar(async () => {
    const corpo = {
      cliente_id: f.cliente?.id, veiculo_id: f.novoVeiculo ? null : f.veiculoId,
      itens: [...f.itens.entries()].map(([k, i]) => ({ servico_id: typeof k === 'number' ? k : null, descricao: i.descricao, valor: i.valor })),
      funcionario_id: $('#func', el).value, data_ref: $('#data-ref', el).value, desconto: paraCent($('#desconto', el).value), usa_plano: f.usaPlano, obs: $('#obs', el).value,
    };
    if (f.novoCliente) corpo.novo_cliente = { nome: $('[name=nc_nome]', el).value, telefone: $('[name=nc_tel]', el).value, documento: $('[name=nc_doc]', el).value, endereco: $('[name=nc_endereco]', el).value, email: $('[name=nc_email]', el).value };
    if (f.novoCliente || f.novoVeiculo) corpo.novo_veiculo = { placa: $('[name=nv_placa]', el).value, modelo: $('[name=nv_modelo]', el).value, cor: $('[name=nv_cor]', el).value, porte: $('[name=nv_porte]', el).value };
    if (f.novoCliente && !corpo.novo_cliente.nome.trim()) {
      if (!corpo.novo_veiculo.placa.trim()) throw new Error('Informe o nome do cliente ou a placa');
      corpo.novo_cliente.nome = 'Cliente ' + corpo.novo_veiculo.placa.toUpperCase();
    }
    if (!corpo.itens.length) throw new Error('Marque pelo menos um serviço');
    $('#salvar', el).disabled = true;
    try {
      let id;
      if (ordem) { await PUT('/api/ordens/' + ordem.id, corpo); id = ordem.id;
        if (ordem.status === 'agendado' && !f.agendar) await PUT(`/api/ordens/${id}/status`, { status: 'aguardando' });
        if (ordem.status === 'aguardando' && f.agendar) await PUT(`/api/ordens/${id}/status`, { status: 'agendado' });
      } else { corpo.status = f.agendar ? 'agendado' : 'aguardando'; id = (await POST('/api/ordens', corpo)).id; }
      aviso(ordem ? 'OS atualizada' : f.agendar ? 'Agendamento criado' : `OS #${id} aberta`);
      location.hash = f.agendar && !ordem ? '#/agenda?data=' + corpo.data_ref.slice(0, 10) : '#/os/' + id;
    } finally { const b = $('#salvar', el); if (b) b.disabled = false; }
  });

  desenharCliente(); desenharServicos();
}

// ---------- detalhe da OS ----------
rota(/^os\/(\d+)$/, async (el, m, p) => {
  const o = await GET('/api/ordens/' + m[1]);
  const restante = Math.max(0, o.total - o.pago);
  const whats = linkWhats(o.cliente_telefone, mensagemPronto(o));
  const podeEditar = o.status !== 'entregue' || dono();
  el.innerHTML = `
    <div class="topo"><div><h1>OS #${o.id} ${selo(o.status)}</h1><small>${dataHoraBR(o.data_ref)}${o.criado_em ? ` · aberta em ${dataHoraBR(o.criado_em)}` : ''}</small></div>
      <div class="acoes">
        ${whats ? `<a class="btn" href="${esc(whats)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <a class="btn" href="/api/ordens/${o.id}/pdf" target="_blank" rel="noopener">PDF</a>
        <a class="btn" href="/api/ordens/${o.id}/pdf?baixar=1" title="Baixar PDF">⤓ Baixar</a>
        <button id="imprimir">Cupom</button>
        ${podeEditar && o.status !== 'cancelado' ? `<a class="btn" href="#/os/${o.id}/editar">Editar</a>` : ''}
        ${PROXIMO[o.status] ? `<button class="prim" id="avancar">${PROXIMO[o.status][1]} →</button>` : ''}
      </div></div>
    <div class="grade g2" style="align-items:start">
      <div class="grade">
        <div class="card"><h2>Cliente e veículo</h2>
          ${o.cliente_id ? `<p style="margin:0"><a href="#/clientes/${o.cliente_id}"><b>${esc(o.cliente_nome)}</b></a><br><small>${esc(o.cliente_telefone || 'sem telefone')}${o.cliente_documento ? ` · ${(o.cliente_documento.replace(/\D/g, '').length === 14 ? 'CNPJ ' : 'CPF ') + esc(o.cliente_documento)}` : ''}</small></p>` : '<p>—</p>'}
          ${o.veiculo_id ? `<a class="veic-linha" href="#/veiculos/${o.veiculo_id}">${o.foto_id ? `<img src="/api/fotos/${o.foto_id}" alt="">` : '<span class="sem-foto">🚗</span>'}
            <span>${placa(o.placa)} ${esc(o.modelo || '')}<br><small>${corTxt(o.cor)}${o.porte ? ` · ${PORTES[o.porte].split(' ')[0]}` : ''} · ver veículo →</small></span></a>` : ''}
          ${o.avarias_abertas ? `<div class="aviso-avaria">⚠ <b>${o.avarias_abertas} avaria(s)</b> já registrada(s) neste veículo. <a href="#/veiculos/${o.veiculo_id}">Ver fotos</a></div>` : ''}
          ${o.funcionario_nome ? `<p class="suave" style="margin:10px 0 0">Responsável: <b>${esc(o.funcionario_nome)}</b></p>` : ''}
          ${o.obs ? `<p style="margin:10px 0 0;white-space:pre-wrap;background:var(--amarelo-claro);padding:8px 10px;border-radius:8px">${esc(o.obs)}</p>` : ''}
        </div>
        <div class="card"><h2>Andamento</h2><table>
          <tr><td>${o.status === 'agendado' ? 'Agendado para' : 'Entrada'}</td><td class="dir">${dataHoraBR(o.data_ref)}</td></tr>
          <tr><td>Início da lavagem</td><td class="dir">${dataHoraBR(o.inicio_em) || '—'}</td></tr>
          <tr><td>Pronto</td><td class="dir">${dataHoraBR(o.pronto_em) || '—'}</td></tr>
          <tr><td>Entregue</td><td class="dir">${dataHoraBR(o.entregue_em) || '—'}</td></tr></table>
          <div class="linha mt">${podeEditar ? `<select id="mudar-status" style="width:auto">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}</select>
            <button class="peq" id="aplicar-status">Mudar status</button>` : ''}
            ${dono() ? `<button class="peq perigo" id="excluir" style="margin-left:auto">Excluir OS</button>` : ''}</div>
        </div>
      </div>
      <div class="grade">
        <div class="card"><h2>Serviços</h2><table>${o.itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="dir num">${reais(i.valor)}</td></tr>`).join('')}
          ${o.desconto ? `<tr><td class="suave">${o.usa_plano ? 'Coberto pelo plano' : 'Desconto'}</td><td class="dir num suave">− ${reais(o.desconto)}</td></tr>` : ''}
          <tr><td><b>Total</b></td><td class="dir num"><b>${reais(o.total)}</b></td></tr></table></div>
        <div class="card"><div class="linha entre"><h2 style="margin:0">Pagamento</h2>${o.total > 0 ? (restante ? `<span class="selo s-pendente">Falta ${reais(restante)}</span>` : '<span class="selo s-pago">Pago</span>') : ''}</div>
          <table class="mt">${o.pagamentos.map(pg => `<tr><td>${FORMAS[pg.forma]}<br><small>${dataHoraBR(pg.data)} · ${esc(pg.usuario_nome || '')}</small></td><td class="dir num">${reais(pg.valor)}
            ${dono() ? `<button class="peq fantasma perigo" data-del-pag="${pg.id}" title="Estornar">✕</button>` : ''}</td></tr>`).join('') || '<tr><td class="suave">Nenhum pagamento registrado.</td></tr>'}</table>
          ${restante > 0 ? `<button class="verde mt" id="receber">Receber ${reais(restante)}</button>` : ''}
        </div>
      </div>
    </div>`;

  $('#imprimir', el).onclick = () => imprimirOS(o);
  const av = $('#avancar', el);
  if (av) av.onclick = () => tentar(async () => {
    const para = PROXIMO[o.status][0];
    if (para === 'entregue' && restante > 0) return receber(true);
    await PUT(`/api/ordens/${o.id}/status`, { status: para });
    if (para === 'pronto') oferecerWhats(o);
    navegar();
  });
  const ap = $('#aplicar-status', el);
  if (ap) ap.onclick = () => tentar(async () => { await PUT(`/api/ordens/${o.id}/status`, { status: $('#mudar-status', el).value }); aviso('Status alterado'); navegar(); });
  const ex = $('#excluir', el);
  if (ex) ex.onclick = () => { if (confirm(`Excluir a OS #${o.id} e os pagamentos dela? Isso não tem volta.\n\nDica: para desistências, use o status “Cancelado”.`)) tentar(async () => { await DEL('/api/ordens/' + o.id); aviso('OS excluída'); location.hash = '#/ordens'; }); };
  $$('[data-del-pag]', el).forEach(b => b.onclick = () => { if (confirm('Estornar este pagamento?')) tentar(async () => { await DEL('/api/pagamentos/' + b.dataset.delPag); navegar(); }); });

  function receber(entregarDepois) {
    abrirModal(`<form id="f-pag"><h2>Receber pagamento</h2><p>OS #${o.id} · ${esc(o.cliente_nome || '')} · falta <b>${reais(restante)}</b></p>
      <div class="campo"><label>Forma de pagamento</label><div class="linha">${Object.entries(FORMAS).map(([k, v], i) => `<label class="check"><input type="radio" name="forma" value="${k}" ${i === 1 ? 'checked' : ''}> ${v}</label>`).join('')}</div></div>
      <div class="campo"><label>Valor (R$)</label><input name="valor" inputmode="decimal" value="${centTxt(restante)}"></div>
      <div class="campo" id="troco-box"><label>Valor entregue pelo cliente (para troco)</label><input name="entregue" inputmode="decimal" placeholder="opcional"><small id="troco"></small></div>
      ${entregarDepois || o.status === 'pronto' ? `<label class="check"><input type="checkbox" name="entregar" checked> Marcar como entregue</label>` : ''}
      <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="verde">Confirmar</button></div></form>`, cx => {
      const f = $('#f-pag', cx);
      const atual = () => { $('#troco-box', cx).hidden = f.forma.value !== 'dinheiro'; const tr = paraCent(f.entregue.value) - paraCent(f.valor.value); $('#troco', cx).textContent = tr > 0 ? 'Troco: ' + reais(tr) : ''; };
      f.oninput = atual; atual();
      f.onsubmit = e => { e.preventDefault(); tentar(async () => {
        await POST('/api/pagamentos', { ordem_id: o.id, forma: f.forma.value, valor: paraCent(f.valor.value) });
        if (f.entregar?.checked) await PUT(`/api/ordens/${o.id}/status`, { status: 'entregue' });
        fecharModal(); aviso('Pagamento registrado'); navegar();
      }); };
    });
  }
  const rb = $('#receber', el); if (rb) rb.onclick = () => receber(false);
  if (p.entregar) { if (restante > 0) receber(true); else tentar(async () => { await PUT(`/api/ordens/${o.id}/status`, { status: 'entregue' }); aviso('Veículo entregue'); location.hash = '#/painel'; }); }
});

function imprimirOS(o) {
  const c = estado.config;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) return aviso('Permita pop-ups para imprimir', true);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>OS #${o.id}</title><style>
    body{font:13px/1.4 ui-monospace,Consolas,monospace;width:300px;margin:10px auto;color:#000} h1{font-size:16px;text-align:center;margin:0}
    .c{text-align:center} hr{border:0;border-top:1px dashed #000;margin:8px 0} table{width:100%;border-collapse:collapse} td{padding:2px 0} td.d{text-align:right}</style></head><body>
    <h1>${esc(c.nome_empresa)}</h1><div class="c">${c.cnpj ? 'CNPJ ' + esc(c.cnpj) + '<br>' : ''}${esc(c.endereco || '')}<br>${esc(c.telefone || '')}</div><hr>
    <b>ORDEM DE SERVIÇO #${o.id}</b><br>${dataHoraBR(o.data_ref)}<br>Cliente: ${esc(o.cliente_nome || '')}<br>${o.cliente_documento ? 'CPF/CNPJ: ' + esc(o.cliente_documento) + '<br>' : ''}${esc(o.cliente_telefone || '')}<br>
    Veículo: ${esc([o.placa, o.modelo, o.cor].filter(Boolean).join(' / '))}<hr>
    <table>${o.itens.map(i => `<tr><td>${esc(i.descricao)}</td><td class="d">${reais(i.valor)}</td></tr>`).join('')}
    ${o.desconto ? `<tr><td>${o.usa_plano ? 'Plano' : 'Desconto'}</td><td class="d">-${reais(o.desconto)}</td></tr>` : ''}
    <tr><td><b>TOTAL</b></td><td class="d"><b>${reais(o.total)}</b></td></tr>
    ${o.pagamentos.map(p => `<tr><td>Pago (${FORMAS[p.forma]})</td><td class="d">${reais(p.valor)}</td></tr>`).join('')}</table>
    ${o.obs ? `<hr>Obs: ${esc(o.obs)}` : ''}<hr><div class="c">Obrigado pela preferência!</div>
    <script>window.onload=()=>{window.print()}<\/script></body></html>`);
  w.document.close();
}

// ---------- lista de ordens ----------
rota(/^ordens$/, async (el, m, p) => {
  const de = p.de || somarDias(hojeISO(), -6), ate = p.ate || hojeISO();
  el.innerHTML = `<div class="topo"><h1>Ordens de serviço</h1><div class="acoes"><a class="btn prim" href="#/os/nova">＋ Nova OS</a></div></div>
    <form class="card linha" id="filtro">
      <div><label>De</label><input type="date" name="de" value="${de}"></div><div><label>Até</label><input type="date" name="ate" value="${ate}"></div>
      <div><label>Status</label><select name="status"><option value="">Todos</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="cresce" style="min-width:180px"><label>Busca</label><input name="q" value="${esc(p.q || '')}" placeholder="Placa, cliente ou nº"></div>
      <div style="align-self:flex-end"><button class="prim">Filtrar</button></div></form>
    <div class="card mt tabela-rolagem" id="lista"></div>`;
  $('#filtro', el).onsubmit = e => { e.preventDefault(); location.hash = '#/ordens?' + new URLSearchParams(dadosForm(e.target)); };
  const lista = await GET('/api/ordens?' + new URLSearchParams({ de, ate, status: p.status || '', q: p.q || '' }));
  const soma = lista.filter(o => o.status !== 'cancelado').reduce((s, o) => s + o.total, 0);
  $('#lista', el).innerHTML = lista.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th>Cliente / veículo</th><th class="esconde-mobile">Serviços</th><th>Status</th><th class="dir">Total</th></tr></thead><tbody>
    ${lista.map(o => `<tr class="clicavel" data-os="${o.id}"><td>#${o.id}</td><td>${dataHoraBR(o.data_ref)}</td><td><b>${esc(o.cliente_nome || '—')}</b><br>${placa(o.placa)} <small>${esc(o.modelo || '')}</small></td>
      <td class="esconde-mobile"><small>${esc(o.servicos || '')}</small></td><td>${selo(o.status)} ${o.total > 0 && o.status !== 'cancelado' ? (o.pago >= o.total ? '' : '<br><span class="selo s-pendente">A receber</span>') : ''}</td><td class="dir num">${reais(o.total)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="4" class="esconde-mobile"></td><td><b>${lista.length} OS</b></td><td class="dir num"><b>${reais(soma)}</b></td></tr></tfoot></table>` : '<div class="vazio">Nenhuma ordem nesse período.</div>';
  $$('[data-os]', el).forEach(r => r.onclick = () => location.hash = '#/os/' + r.dataset.os);
});

// ---------- agenda ----------
rota(/^agenda$/, async (el, m, p) => {
  const dia = p.data || hojeISO();
  const lista = (await GET(`/api/ordens?de=${dia}&ate=${dia}&ordem=asc`)).filter(o => o.status !== 'cancelado');
  const nomeDia = new Date(dia + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  // grade de horários das 7h às 19h
  const horas = []; for (let h = 7; h <= 19; h++) horas.push(pad(h));
  const porHora = h => lista.filter(o => horaBR(o.data_ref).slice(0, 2) === h);
  const foraGrade = lista.filter(o => !horas.includes(horaBR(o.data_ref).slice(0, 2)));
  el.innerHTML = `<div class="topo"><div><h1>Agenda</h1><small style="text-transform:capitalize">${nomeDia}</small></div>
    <div class="acoes"><a class="btn" href="#/agenda?data=${somarDias(dia, -1)}">←</a><input type="date" id="dia" value="${dia}" style="width:auto"><a class="btn" href="#/agenda?data=${somarDias(dia, 1)}">→</a>
    ${dia !== hojeISO() ? '<a class="btn" href="#/agenda">Hoje</a>' : ''}<a class="btn prim" href="#/os/nova?agendar=1&data=${dia}">＋ Agendar</a></div></div>
    <div class="card" style="padding:0">${[...horas.map(h => [h, porHora(h)]), ...(foraGrade.length ? [['outros', foraGrade]] : [])].map(([h, os]) => `
      <div class="linha" style="align-items:stretch;border-bottom:1px solid var(--borda);gap:0;flex-wrap:nowrap">
        <div style="width:70px;padding:10px;color:var(--suave);font-weight:600;flex-shrink:0">${h === 'outros' ? 'Outros' : h + ':00'}</div>
        <div style="flex:1;padding:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-height:44px">
          ${os.map(o => `<a href="#/os/${o.id}" class="os-card ${o.status}" style="margin:0;color:inherit;min-width:200px;flex:1;max-width:340px">
            <div class="cab"><b>${horaBR(o.data_ref)} · ${esc(o.cliente_nome || '')}</b>${selo(o.status)}</div>
            <div class="serv" style="margin:2px 0 0">${placa(o.placa)} ${esc(o.modelo || '')} · ${esc(o.servicos || '')}</div></a>`).join('')}
          ${h !== 'outros' ? `<a href="#/os/nova?agendar=1&data=${dia}&hora=${h}:00" class="suave" style="padding:4px 8px;font-size:13px" title="Agendar às ${h}:00">＋</a>` : ''}
        </div></div>`).join('')}</div>`;
  $('#dia', el).onchange = e => location.hash = '#/agenda?data=' + e.target.value;
});

// ---------- clientes ----------
rota(/^clientes$/, async (el, m, p) => {
  el.innerHTML = `<div class="topo"><h1>Clientes</h1><div class="acoes"><button class="prim" id="novo">＋ Novo cliente</button></div></div>
    <div class="card"><input id="busca" placeholder="Buscar por nome, telefone, placa ou modelo…" value="${esc(p.q || '')}"></div>
    <div class="card mt tabela-rolagem" id="lista"><div class="vazio">Carregando…</div></div>`;
  const carregar = async q => {
    const lista = await GET('/api/clientes?q=' + encodeURIComponent(q));
    $('#lista', el).innerHTML = lista.length ? `<table><thead><tr><th>Cliente</th><th>Veículos</th><th class="esconde-mobile">Visitas</th><th class="esconde-mobile">Última visita</th></tr></thead><tbody>
      ${lista.map(c => `<tr class="clicavel" data-cli="${c.id}"><td><b>${esc(c.nome)}</b><br><small>${esc(c.telefone || '')}</small></td><td><small>${esc(c.veiculos || '—')}</small></td>
      <td class="esconde-mobile">${c.visitas}</td><td class="esconde-mobile">${dataBR(c.ultima_visita) || '—'}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum cliente encontrado.</div>';
    $$('[data-cli]', el).forEach(r => r.onclick = () => location.hash = '#/clientes/' + r.dataset.cli);
  };
  let t; $('#busca', el).oninput = e => { clearTimeout(t); t = setTimeout(() => carregar(e.target.value), 250); };
  $('#novo', el).onclick = () => modalCliente(null, id => location.hash = '#/clientes/' + id);
  carregar(p.q || '');
});

function modalCliente(c, depois) {
  abrirModal(`<form id="f-cli"><h2>${c ? 'Editar cliente' : 'Novo cliente'}</h2>
    <div class="campo"><label>Nome *</label><input name="nome" required value="${esc(c?.nome)}"></div>
    <div class="grade g2"><div class="campo"><label>WhatsApp / telefone</label><input name="telefone" inputmode="tel" value="${esc(c?.telefone)}"></div>
    <div class="campo"><label>CPF/CNPJ</label><input name="documento" data-doc inputmode="numeric" placeholder="Para OS de empresa" value="${esc(c?.documento)}"></div></div>
    <div class="campo"><label>Endereço</label><input name="endereco" value="${esc(c?.endereco)}" placeholder="Rua, número, bairro, cidade"></div>
    <div class="grade g2"><div class="campo"><label>E-mail</label><input name="email" type="email" value="${esc(c?.email)}"></div>
    <div class="campo"><label>Data de aniversário</label><input name="nascimento" type="date" max="${hojeISO()}" value="${esc(c?.nascimento)}"></div></div>
    ${c ? '' : `<h3 class="mt">Veículo</h3><div class="grade g2"><div class="campo"><label>Placa</label><input name="placa" style="text-transform:uppercase"></div><div class="campo"><label>Modelo</label><input name="modelo"></div>
      <div class="campo"><label>Cor</label><input name="cor" list="lista-cores" autocomplete="off"></div><div class="campo"><label>Porte</label><select name="porte">${Object.entries(PORTES).map(([k, v]) => `<option value="${k}" ${k === 'medio' ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>`}
    <div class="campo"><label>Observações</label><textarea name="obs">${esc(c?.obs)}</textarea></div>
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    ligarBuscaCnpj(cx, 'documento', { nome: 'nome', endereco: 'endereco', telefone: 'telefone', email: 'email' });
    $('#f-cli', cx).onsubmit = e => { e.preventDefault(); tentar(async () => {
      const d = dadosForm(e.target);
      if (c) { await PUT('/api/clientes/' + c.id, d); fecharModal(); aviso('Cliente salvo'); depois(c.id); }
      else { const r = await POST('/api/clientes', { ...d, veiculos: [{ placa: d.placa, modelo: d.modelo, cor: d.cor, porte: d.porte }] }); fecharModal(); aviso('Cliente cadastrado'); depois(r.id); }
    }); };
  });
}
function modalVeiculo(clienteId, v, depois) {
  abrirModal(`<form id="f-v"><h2>${v ? 'Editar veículo' : 'Novo veículo'}</h2><div class="grade g2">
    <div class="campo"><label>Placa</label><input name="placa" style="text-transform:uppercase" value="${esc(v?.placa)}"></div><div class="campo"><label>Modelo</label><input name="modelo" value="${esc(v?.modelo)}"></div>
    <div class="campo"><label>Cor</label><input name="cor" list="lista-cores" autocomplete="off" value="${esc(v?.cor)}"></div><div class="campo"><label>Porte</label><select name="porte">${Object.entries(PORTES).map(([k, n]) => `<option value="${k}" ${k === (v?.porte || 'medio') ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="rodape">${v && dono() ? '<button type="button" class="perigo" id="del-v" style="margin-right:auto">Remover</button>' : ''}<button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    $('#f-v', cx).onsubmit = e => { e.preventDefault(); tentar(async () => {
      const d = dadosForm(e.target); if (v) await PUT('/api/veiculos/' + v.id, d); else await POST(`/api/clientes/${clienteId}/veiculos`, d);
      fecharModal(); depois();
    }); };
    const del = $('#del-v', cx); if (del) del.onclick = () => confirm('Remover este veículo com todas as fotos e avarias?') && tentar(async () => { await DEL('/api/veiculos/' + v.id); fecharModal(); depois('removido'); });
  });
}

rota(/^clientes\/(\d+)$/, async (el, m) => {
  const c = await GET('/api/clientes/' + m[1]);
  const a = c.assinatura;
  const whats = telLink(c.telefone);
  const gasto = c.ordens.filter(o => o.status !== 'cancelado').reduce((s, o) => s + o.total, 0);
  el.innerHTML = `<div class="topo"><div><h1>${esc(c.nome)}</h1><small>Cliente desde ${dataBR(c.criado_em)}</small></div>
    <div class="acoes">${whats ? `<a class="btn" href="${estado.demo ? 'https://wa.me/' : 'https://wa.me/' + whats}" target="_blank" rel="noopener">WhatsApp</a>` : ''}<button id="editar">Editar</button>
    ${dono() ? '<button class="perigo" id="excluir">Excluir</button>' : ''}<a class="btn prim" href="#/os/nova?cliente=${c.id}">＋ Nova OS</a></div></div>
    <div class="grade g3">
      <div class="card"><h2>Contato</h2><p style="margin:0">${esc(c.telefone || 'Sem telefone')}${c.email ? '<br>' + esc(c.email) : ''}
        ${c.documento ? `<br>${c.documento.replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF'}: <b>${esc(c.documento)}</b>` : ''}${c.endereco ? '<br>' + esc(c.endereco) : ''}</p>
        ${c.nascimento ? `<p style="margin:8px 0 0">🎂 Aniversário: <b>${aniversarioTxt(c.nascimento)}</b></p>` : ''}
        ${aniversarioHoje(c.nascimento) && linkWhats(c.telefone, msgAniversario(c.nome)) ? `<a class="btn peq mt" href="${esc(linkWhats(c.telefone, msgAniversario(c.nome)))}" target="_blank" rel="noopener">Mandar parabéns</a>` : ''}
        ${c.obs ? `<p class="suave" style="white-space:pre-wrap">${esc(c.obs)}</p>` : ''}</div>
      <div class="card kpi"><div class="rotulo">Visitas</div><div class="valor">${c.ordens.filter(o => o.status !== 'cancelado').length}</div><div class="rotulo mt">Total gasto</div><div class="valor">${reais(gasto)}</div></div>
      <div class="card"><h2>Plano mensal</h2>${a ? `<p style="margin:0"><b>${esc(a.plano_nome)}</b> · ${reais(a.preco)}/mês<br><small>Desde ${dataBR(a.inicio)} · usou ${a.usadas_mes} de ${a.lavagens_mes} neste mês</small><br>
        ${a.pago_mes >= a.preco ? '<span class="selo s-pago">Mês pago</span>' : '<span class="selo s-pendente">Mês em aberto</span>'}</p>` : '<p class="suave">Sem plano.</p>'}
        ${dono() ? `<a class="btn peq mt" href="#/planos">Gerenciar planos</a>` : ''}</div>
    </div>
    <div class="card mt"><div class="linha entre"><h2 style="margin:0">Veículos</h2><button class="peq" id="add-v">＋ Veículo</button></div>
      <table class="mt">${c.veiculos.map(v => `<tr class="clicavel" data-veic="${v.id}"><td><span class="veic-linha">${v.foto_id ? `<img src="/api/fotos/${v.foto_id}" alt="">` : '<span class="sem-foto">🚗</span>'}
          <span>${placa(v.placa)} ${esc(v.modelo || '')}<br><small>${corTxt(v.cor)} · ${PORTES[v.porte].split(' ')[0]}</small>${v.avarias_abertas ? ` <span class="selo s-aguardando">⚠ ${v.avarias_abertas} avaria(s)</span>` : ''}</span></span></td>
        <td class="dir"><a class="btn peq" href="#/os/nova?cliente=${c.id}&veiculo=${v.id}">Nova OS</a> <a class="btn peq prim" href="#/veiculos/${v.id}">Abrir</a></td></tr>`).join('') || '<tr><td class="suave">Nenhum veículo.</td></tr>'}</table></div>
    <div class="card mt tabela-rolagem"><h2>Histórico</h2>${c.ordens.length ? `<table><thead><tr><th>Nº</th><th>Data</th><th>Veículo</th><th class="esconde-mobile">Serviços</th><th>Status</th><th class="dir">Total</th></tr></thead><tbody>
      ${c.ordens.map(o => `<tr class="clicavel" data-os="${o.id}"><td>#${o.id}</td><td>${dataBR(o.data_ref)}</td><td>${placa(o.placa)}</td><td class="esconde-mobile"><small>${esc(o.servicos || '')}</small></td><td>${selo(o.status)}</td><td class="dir num">${reais(o.total)}</td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Ainda sem visitas.</div>'}</div>`;
  $('#editar', el).onclick = () => modalCliente(c, navegar);
  const ex = $('#excluir', el); if (ex) ex.onclick = () => confirm(`Excluir ${c.nome} e todos os veículos? O histórico de OS continua, mas sem o cliente.`) && tentar(async () => { await DEL('/api/clientes/' + c.id); location.hash = '#/clientes'; });
  $('#add-v', el).onclick = () => modalVeiculo(c.id, null, navegar);
  $$('[data-veic]', el).forEach(r => r.onclick = e => { if (!e.target.closest('a')) location.hash = '#/veiculos/' + r.dataset.veic; });
  $$('[data-os]', el).forEach(r => r.onclick = () => location.hash = '#/os/' + r.dataset.os);
});

// ---------- aniversariantes ----------
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
rota(/^aniversariantes$/, async (el, m, p) => {
  const mes = p.mes || hojeISO().slice(5, 7);
  const lista = await GET('/api/aniversariantes?mes=' + mes);
  const mesAnt = pad((+mes + 10) % 12 + 1), mesProx = pad(+mes % 12 + 1);
  el.innerHTML = `<div class="topo"><div><h1>Aniversariantes</h1><small>Clientes e equipe</small></div>
    <div class="acoes"><a class="btn" href="#/aniversariantes?mes=${mesAnt}">←</a><select id="mes" style="width:auto">${MESES.map((n, i) => `<option value="${pad(i + 1)}" ${pad(i + 1) === mes ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <a class="btn" href="#/aniversariantes?mes=${mesProx}">→</a></div></div>
    <div class="card tabela-rolagem">${lista.length ? `<table><thead><tr><th>Dia</th><th>Nome</th><th class="esconde-mobile">Idade</th><th></th></tr></thead><tbody>
      ${lista.map(a => { const w = a.tipo === 'cliente' && linkWhats(a.telefone, msgAniversario(a.nome)); const hj = aniversarioHoje(a.nascimento);
        return `<tr style="${hj ? 'background:var(--roxo-claro)' : ''}"><td><b>${a.nascimento.slice(8, 10)}/${a.nascimento.slice(5, 7)}</b>${hj ? ' 🎂' : ''}</td>
        <td>${a.tipo === 'cliente' ? `<a href="#/clientes/${a.id}">${esc(a.nome)}</a>` : `${esc(a.nome)} <span class="selo s-entregue">Equipe</span>`}</td>
        <td class="esconde-mobile">${idade(a.nascimento) !== null ? `faz ${idade(a.nascimento) + (a.nascimento.slice(5) > hojeISO().slice(5) ? 1 : 0)} anos` : ''}</td>
        <td class="dir">${w ? `<a class="btn peq" href="${esc(w)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="vazio">Nenhum aniversariante em ${MESES[+mes - 1]}.</div>`}</div>`;
  $('#mes', el).onchange = e => location.hash = '#/aniversariantes?mes=' + e.target.value;
});

// ---------- veículo: fotos, avarias e observações ----------
rota(/^veiculos\/(\d+)$/, async (el, m) => {
  const v = await GET('/api/veiculos/' + m[1]);
  const abertas = v.avarias.filter(a => !a.resolvida);
  const todasFotos = [...v.fotos, ...v.avarias.flatMap(a => a.fotos), ...v.fotos_obs];
  el.innerHTML = `<div class="topo"><div><h1>${placa(v.placa)} ${esc(v.modelo || 'Veículo')}</h1>
      <small>${v.cliente_id ? `Cliente: <a href="#/clientes/${v.cliente_id}">${esc(v.cliente_nome)}</a>` : ''}</small></div>
    <div class="acoes"><button id="editar">Editar dados</button><a class="btn prim" href="#/os/nova?cliente=${v.cliente_id}&veiculo=${v.id}">＋ Nova OS</a></div></div>
    <div class="grade g2" style="align-items:start">
      <div class="card"><div class="linha entre"><h2 style="margin:0">Fotos do veículo</h2><button class="peq prim" data-add-foto="veiculo">📷 Adicionar fotos</button></div>
        <div class="mt">${galeria(v.fotos, '<div class="vazio" style="padding:16px">Nenhuma foto ainda. Tire fotos de frente, traseira e laterais.</div>')}</div></div>
      <div class="card"><h2>Dados</h2><table>
        <tr><td class="suave">Placa</td><td>${placa(v.placa) || '—'}</td></tr><tr><td class="suave">Modelo</td><td>${esc(v.modelo || '—')}</td></tr>
        <tr><td class="suave">Cor</td><td>${corTxt(v.cor) || '—'}</td></tr><tr><td class="suave">Porte</td><td>${PORTES[v.porte]}</td></tr>
        <tr><td class="suave">Lavagens</td><td>${v.ordens.filter(o => o.status !== 'cancelado').length}</td></tr></table></div>
    </div>
    <div class="card mt"><div class="linha entre"><h2 style="margin:0">Avarias ${abertas.length ? `<span class="selo s-aguardando">${abertas.length} em aberto</span>` : ''}</h2>
        <button class="prim" id="nova-avaria">＋ Registrar avaria</button></div>
      <p class="suave" style="margin:6px 0 0">Toque na parte do carro para registrar um risco, amassado ou outro dano que ele já tinha ao chegar. As avarias aparecem na OS e no PDF.</p>
      <div class="avarias-grade mt"><div class="carro-box" id="carro-veic">${CARRO.svgCarro({ marcados: abertas.reduce((m, a) => (m[a.local] = (m[a.local] || 0) + 1, m), {}) })}
        <small class="suave">Frente para cima · lado esquerdo do carro à esquerda</small></div>
      <div>${v.avarias.map(a => `<div class="avaria ${a.resolvida ? 'resolvida' : ''}">
        <div class="linha entre"><div><b>${esc(a.local)}</b> — ${esc(a.tipo)} ${a.resolvida ? '<span class="selo s-pago">Resolvida</span>' : ''}<br>
          <small>Registrada em ${dataHoraBR(a.registrado_em)}${a.usuario_nome ? ' por ' + esc(a.usuario_nome) : ''}</small></div>
          <div class="linha"><button class="peq" data-foto-avaria="${a.id}">📷 Foto</button><button class="peq" data-editar-avaria="${a.id}">Editar</button>
          ${dono() ? `<button class="peq" data-resolver="${a.id}">${a.resolvida ? 'Reabrir' : 'Marcar resolvida'}</button><button class="peq perigo" data-excluir-avaria="${a.id}">Excluir</button>` : ''}</div></div>
        ${a.descricao ? `<p style="margin:6px 0 0;white-space:pre-wrap">${esc(a.descricao)}</p>` : ''}
        ${galeria(a.fotos)}</div>`).join('') || '<div class="vazio" style="padding:16px">Nenhuma avaria registrada.</div>'}</div></div></div>
    <div class="card mt"><h2>Observações</h2>
      <textarea id="obs-veic" placeholder="Ex.: som original, insulfilm, adesivos, rodas especiais, cliente prefere produto X…">${esc(v.obs || '')}</textarea>
      <div class="linha mt"><button id="salvar-obs">Salvar observação</button><button class="peq" data-add-foto="obs">📷 Fotos da observação</button></div>
      <div class="mt">${galeria(v.fotos_obs)}</div></div>
    <div class="card mt tabela-rolagem"><h2>Histórico deste veículo</h2>${v.ordens.length ? `<table>${v.ordens.map(o => `<tr class="clicavel" data-os="${o.id}"><td>#${o.id}</td><td>${dataBR(o.data_ref)}</td>
      <td class="esconde-mobile"><small>${esc(o.servicos || '')}</small></td><td>${selo(o.status)}</td><td class="dir num">${reais(o.total)}</td></tr>`).join('')}</table>` : '<div class="vazio">Ainda sem lavagens.</div>'}</div>`;

  $('#editar', el).onclick = () => modalVeiculo(v.cliente_id, v, r => { if (r === 'removido') location.hash = '#/clientes/' + v.cliente_id; else navegar(); });
  $$('[data-foto]', el).forEach(b => b.onclick = () => verFoto(todasFotos, Number(b.dataset.foto), navegar));
  $$('[data-add-foto]', el).forEach(b => b.onclick = () => tentar(async () => { const arqs = await escolherFotos(); if (!arqs.length) return; await enviarFotos(v.id, arqs, b.dataset.addFoto); navegar(); }));
  $$('[data-foto-avaria]', el).forEach(b => b.onclick = () => tentar(async () => { const arqs = await escolherFotos(); if (!arqs.length) return; await enviarFotos(v.id, arqs, 'avaria', b.dataset.fotoAvaria); navegar(); }));
  $('#salvar-obs', el).onclick = () => tentar(async () => { await PUT(`/api/veiculos/${v.id}/obs`, { obs: $('#obs-veic', el).value }); aviso('Observação salva'); });
  const modalAvaria = (a, localInicial) => abrirModal(`<form id="f-av"><h2>${a ? 'Editar avaria' : 'Registrar avaria'}</h2>
    <div class="carro-modal"><div class="carro-box" id="carro-av">${CARRO.svgCarro({ selecionado: a?.local || localInicial })}</div>
      <div><label>Toque na parte do carro</label><small class="suave">ou escolha abaixo</small>
        <div class="chips mt">${CARRO.INTERIOR.map(l => `<button type="button" class="chip" data-chip="${l}">${l}</button>`).join('')}</div></div></div>
    <div class="grade g2"><div class="campo"><label>Local *</label><select name="local" required>${a || localInicial ? "" : `<option value="" selected>— toque no desenho ou escolha —</option>`}${LOCAIS_AVARIA.map(l => `<option ${(a?.local || localInicial) === l ? 'selected' : ''}>${l}</option>`).join('')}
      ${a && !LOCAIS_AVARIA.includes(a.local) ? `<option selected>${esc(a.local)}</option>` : ''}</select></div>
    <div class="campo"><label>Tipo *</label><select name="tipo">${TIPOS_AVARIA.map(t => `<option ${a?.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
      ${a && !TIPOS_AVARIA.includes(a.tipo) ? `<option selected>${esc(a.tipo)}</option>` : ''}</select></div></div>
    <div class="campo"><label>Descrição</label><textarea name="descricao" placeholder="Ex.: risco de uns 10 cm perto da maçaneta">${esc(a?.descricao)}</textarea></div>
    ${a ? '' : `<div class="campo"><label>Fotos da avaria</label><input type="file" name="fotos" accept="image/*" multiple><small>No celular, dá para tirar a foto na hora.</small></div>`}
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    cx.classList.add('larga');
    const sel = $('[name=local]', cx);
    const marcar = local => { sel.value = local; $$('#carro-av .zona', cx).forEach(z => z.classList.toggle('sel', z.dataset.local === local));
      $$('[data-chip]', cx).forEach(c => c.classList.toggle('ativo', c.dataset.chip === local)); };
    $$('#carro-av .zona', cx).forEach(z => z.onclick = () => marcar(z.dataset.local));
    $$('[data-chip]', cx).forEach(c => c.onclick = () => marcar(c.dataset.chip));
    sel.onchange = () => marcar(sel.value); marcar(sel.value);
    $('#f-av', cx).onsubmit = e => { e.preventDefault(); tentar(async () => {
      const f = e.target; const corpo = { local: f.local.value, tipo: f.tipo.value, descricao: f.descricao.value, resolvida: a ? !!a.resolvida : false };
      const botao = $('button.prim', f); botao.disabled = true;
      try {
        if (a) await PUT('/api/avarias/' + a.id, corpo);
        else { const r = await POST(`/api/veiculos/${v.id}/avarias`, corpo); await enviarFotos(v.id, [...(f.fotos?.files || [])], 'avaria', r.id); }
        fecharModal(); aviso('Avaria salva'); navegar();
      } finally { botao.disabled = false; }
    }); };
  });
  $('#nova-avaria', el).onclick = () => modalAvaria(null);
  $$('#carro-veic .zona', el).forEach(z => z.onclick = () => modalAvaria(null, z.dataset.local));
  const acharAvaria = id => v.avarias.find(a => a.id === Number(id));
  $$('[data-editar-avaria]', el).forEach(b => b.onclick = () => modalAvaria(acharAvaria(b.dataset.editarAvaria)));
  $$('[data-resolver]', el).forEach(b => b.onclick = () => tentar(async () => { const a = acharAvaria(b.dataset.resolver); await PUT('/api/avarias/' + a.id, { ...a, resolvida: !a.resolvida }); navegar(); }));
  $$('[data-excluir-avaria]', el).forEach(b => b.onclick = () => confirm('Excluir esta avaria e as fotos dela?') && tentar(async () => { await DEL('/api/avarias/' + b.dataset.excluirAvaria); navegar(); }));
  $$('[data-os]', el).forEach(r => r.onclick = () => location.hash = '#/os/' + r.dataset.os);
});

// ---------- estoque ----------
function modalProduto(prod, depois) {
  abrirModal(`<form id="f-prod"><h2>${prod ? 'Editar produto' : 'Novo produto'}</h2>
    <div class="campo"><label for="pr-nome">Nome *</label><input id="pr-nome" name="nome" required value="${esc(prod?.nome)}" placeholder="Ex.: Shampoo automotivo 5 L"></div>
    <div class="grade g2"><div class="campo"><label for="pr-cat">Tipo</label><select id="pr-cat" name="categoria"><option value="uso">Uso interno (gasto nas lavagens)</option><option value="venda" ${prod?.categoria === 'venda' ? 'selected' : ''}>Para venda (balcão)</option></select></div>
      <div class="campo"><label for="pr-un">Unidade de controle</label><select id="pr-un" name="unidade">${Object.entries(UNIDADES).map(([k, v]) => `<option value="${k}" ${(prod?.unidade || 'un') === k ? 'selected' : ''}>${k} (${v})</option>`).join('')}</select></div>
      ${prod ? '' : `<div class="campo"><label for="pr-qtd">Quantidade atual</label><input id="pr-qtd" name="quantidade" inputmode="decimal" placeholder="0"></div>`}
      <div class="campo"><label for="pr-min">Estoque mínimo</label><input id="pr-min" name="minimo" inputmode="decimal" value="${prod ? qtdTxt(prod.minimo) : ''}" placeholder="Avisar quando chegar a…"></div>
      <div class="campo"><label for="pr-custo">Custo por unidade (R$)</label><input id="pr-custo" name="custo" inputmode="decimal" value="${prod?.custo ? centTxt(prod.custo) : ''}"></div>
      <div class="campo" id="campo-preco"><label for="pr-preco">Preço de venda (R$)</label><input id="pr-preco" name="preco_venda" inputmode="decimal" value="${prod?.preco_venda ? centTxt(prod.preco_venda) : ''}"></div></div>
    <div class="campo"><label for="pr-forn">Fornecedor</label><input id="pr-forn" name="fornecedor" value="${esc(prod?.fornecedor)}"></div>
    ${prod ? `<label class="check"><input type="checkbox" name="ativo" ${prod.ativo ? 'checked' : ''}> Produto ativo</label>` : ''}
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    const cat = $('[name=categoria]', cx); const ver = () => $('#campo-preco', cx).hidden = cat.value !== 'venda'; cat.onchange = ver; ver();
    $('#f-prod', cx).onsubmit = e => { e.preventDefault(); tentar(async () => {
      const d = dadosForm(e.target);
      const corpo = { ...d, quantidade: paraQtd(d.quantidade), minimo: paraQtd(d.minimo), custo: paraCent(d.custo), preco_venda: paraCent(d.preco_venda), ativo: prod ? !!d.ativo : true };
      const r = prod ? await PUT('/api/produtos/' + prod.id, corpo) : await POST('/api/produtos', corpo);
      fecharModal(); aviso('Produto salvo'); depois(r.id);
    }); };
  });
}
function modalMovimento(prod, tipo, depois) {
  const u = prod.unidade;
  const titulos = { uso: 'Registrar uso', venda: 'Vender', entrada: 'Registrar compra', ajuste: 'Contagem de estoque' };
  const campos = {
    uso: `<div class="campo"><label for="mv-q">Quantidade usada (${u})</label><input id="mv-q" name="quantidade" inputmode="decimal" required></div>
      <div class="campo"><label for="mv-obs">Para quê?</label><input id="mv-obs" name="obs" placeholder="Ex.: limpeza do box, carro da equipe"></div>`,
    venda: `<div class="grade g2"><div class="campo"><label for="mv-q">Quantidade (${u})</label><input id="mv-q" name="quantidade" inputmode="decimal" value="1" required></div>
      <div class="campo"><label for="mv-v">Valor total (R$)</label><input id="mv-v" name="valor_total" inputmode="decimal" value="${centTxt(prod.preco_venda)}"></div></div>
      <div class="campo"><label>Forma de pagamento</label><div class="linha">${Object.entries(FORMAS).map(([k, v], i) => `<label class="check"><input type="radio" name="forma" value="${k}" ${i === 1 ? 'checked' : ''}> ${v}</label>`).join('')}</div></div>
      <small class="suave">O valor entra no caixa do dia.</small>`,
    entrada: `<div class="grade g2"><div class="campo"><label for="mv-q">Quantidade comprada (${u})</label><input id="mv-q" name="quantidade" inputmode="decimal" required></div>
      <div class="campo"><label for="mv-v">Valor total pago (R$)</label><input id="mv-v" name="valor_total" inputmode="decimal"></div></div>
      <p class="suave" id="mv-unit" style="margin:-4px 0 10px"></p>
      <div class="campo"><label for="mv-obs">Fornecedor / nota</label><input id="mv-obs" name="obs" value="${esc(prod.fornecedor || '')}"></div>
      <label class="check"><input type="checkbox" name="lancar_despesa" checked> Lançar o valor em Despesas</label>`,
    ajuste: `<p class="suave" style="margin-top:0">O sistema tem <b>${fmtQtd(prod.quantidade, u)}</b>. Conte o que tem na prateleira e informe abaixo.</p>
      <div class="campo"><label for="mv-q">Quantidade contada (${u})</label><input id="mv-q" name="quantidade" inputmode="decimal" value="${qtdTxt(Math.max(0, prod.quantidade))}" required></div>
      <div class="campo"><label for="mv-obs">Observação</label><input id="mv-obs" name="obs" placeholder="Ex.: vazou um galão"></div>`,
  };
  abrirModal(`<form id="f-mov"><h2>${titulos[tipo]}</h2><p style="margin-top:0"><b>${esc(prod.nome)}</b> <small class="suave">· em estoque: ${fmtQtd(prod.quantidade, u)}</small></p>
    ${campos[tipo]}<div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">${tipo === 'venda' ? 'Confirmar venda' : 'Salvar'}</button></div></form>`, cx => {
    const f = $('#f-mov', cx);
    if (tipo === 'venda') f.quantidade.oninput = () => { f.valor_total.value = centTxt(Math.round(prod.preco_venda * paraQtd(f.quantidade.value))); };
    if (tipo === 'entrada') f.oninput = () => { const q = paraQtd(f.quantidade.value), v = paraCent(f.valor_total.value); $('#mv-unit', cx).textContent = q && v ? `Custo: ${reais(Math.round(v / q))} por ${u}` : ''; };
    f.onsubmit = e => { e.preventDefault(); tentar(async () => {
      const corpo = { tipo, quantidade: paraQtd(f.quantidade.value), obs: f.obs?.value, valor_total: f.valor_total ? paraCent(f.valor_total.value) : undefined,
        forma: f.forma?.value, lancar_despesa: !!f.lancar_despesa?.checked };
      await POST(`/api/produtos/${prod.id}/movimentos`, corpo);
      fecharModal(); aviso({ uso: 'Uso registrado', venda: 'Venda registrada', entrada: 'Compra registrada', ajuste: 'Estoque ajustado' }[tipo]); depois();
    }); };
  });
}
const barraEstoque = x => { const [sit] = situacaoEstoque(x); const ref = Math.max(x.minimo * 2, x.quantidade, 1);
  return `<div class="barra barra-estoque ${sit}"><div style="width:${Math.max(0, Math.min(100, x.quantidade / ref * 100))}%"></div></div>`; };
const botoesProduto = x => `${x.categoria === 'venda' ? `<button class="peq" data-mov="venda" data-p="${x.id}">Vender</button>` : `<button class="peq" data-mov="uso" data-p="${x.id}">Usar</button>`}
  ${dono() ? `<button class="peq" data-mov="entrada" data-p="${x.id}">Compra</button>` : ''}`;

rota(/^estoque$/, async (el, m, p) => {
  const lista = await GET('/api/produtos' + (dono() ? '?todos=1' : ''));
  const filtro = p.filtro || 'todos';
  const ativos = lista.filter(x => x.ativo);
  const baixos = ativos.filter(x => situacaoEstoque(x)[0] !== 'ok');
  marcarEstoqueBaixo(baixos.length);
  const valor = ativos.reduce((t, x) => t + Math.max(0, x.quantidade) * (x.custo || 0), 0);
  const abas = [['todos', 'Todos', lista.length], ['uso', 'Uso interno', lista.filter(x => x.categoria === 'uso').length], ['venda', 'Para venda', lista.filter(x => x.categoria === 'venda').length], ['baixo', 'Estoque baixo', baixos.length]];
  el.innerHTML = `<div class="topo"><div><h1>Estoque</h1><small>Produtos de limpeza e itens para venda</small></div>
    <div class="acoes">${dono() ? '<button id="contagem">Contagem</button><button class="prim" id="novo">＋ Produto</button>' : ''}</div></div>
    <div class="grade ${dono() ? 'g3' : 'g2'}">
      <div class="card kpi"><div class="rotulo">Produtos ativos</div><div class="valor">${ativos.length}</div></div>
      <div class="card kpi"><div class="rotulo">Com estoque baixo ou zerado</div><div class="valor" style="color:${baixos.length ? 'var(--vermelho)' : 'inherit'}">${baixos.length}</div></div>
      ${dono() ? `<div class="card kpi"><div class="rotulo">Valor em estoque (pelo custo)</div><div class="valor">${reais(valor)}</div></div>` : ''}
    </div>
    <div class="card mt"><div class="abas">${abas.map(([k, n, q]) => `<button class="${filtro === k ? 'ativo' : ''}" data-filtro="${k}">${n} <small>${q}</small></button>`).join('')}</div>
      <input id="busca-prod" placeholder="Buscar produto ou fornecedor…" aria-label="Buscar produto">
      <div class="tabela-rolagem mt" id="lista-prod"></div></div>`;
  const desenhar = () => {
    const b = $('#busca-prod', el).value.trim().toLowerCase();
    const itens = lista.filter(x => (filtro === 'todos' ? true : filtro === 'baixo' ? x.ativo && situacaoEstoque(x)[0] !== 'ok' : x.categoria === filtro))
      .filter(x => !b || x.nome.toLowerCase().includes(b) || (x.fornecedor || '').toLowerCase().includes(b));
    $('#lista-prod', el).innerHTML = itens.length ? `<table><thead><tr><th>Produto</th><th>Em estoque</th><th class="esconde-mobile">Mínimo</th><th>Situação</th>
      ${dono() ? '<th class="dir esconde-mobile">Custo</th>' : ''}<th class="dir esconde-mobile">Venda</th><th></th></tr></thead><tbody>
      ${itens.map(x => { const [, txtSit, cls] = situacaoEstoque(x);
        return `<tr class="clicavel" data-prod="${x.id}" style="${x.ativo ? '' : 'opacity:.5'}"><td><b>${esc(x.nome)}</b>${x.ativo ? '' : ' <small>(inativo)</small>'}<br><small>${x.categoria === 'venda' ? 'Para venda' : 'Uso interno'}${x.fornecedor ? ' · ' + esc(x.fornecedor) : ''}</small></td>
        <td class="num" style="min-width:110px"><b>${fmtQtd(x.quantidade, x.unidade)}</b>${barraEstoque(x)}</td><td class="esconde-mobile num">${x.minimo ? fmtQtd(x.minimo, x.unidade) : '—'}</td>
        <td><span class="selo ${cls}">${txtSit}</span></td>${dono() ? `<td class="dir num esconde-mobile">${x.custo ? reais(x.custo) + '<small>/' + x.unidade + '</small>' : '—'}</td>` : ''}
        <td class="dir num esconde-mobile">${x.categoria === 'venda' && x.preco_venda ? reais(x.preco_venda) : '—'}</td><td class="dir" style="white-space:nowrap">${x.ativo ? botoesProduto(x) : ''}</td></tr>`; }).join('')}</tbody></table>`
      : `<div class="vazio">${lista.length ? 'Nenhum produto nesse filtro.' : dono() ? 'Nenhum produto cadastrado. Clique em “＋ Produto” para começar.' : 'Nenhum produto cadastrado.'}</div>`;
    $$('[data-prod]', el).forEach(r => r.onclick = e => { if (!e.target.closest('button')) location.hash = '#/estoque/' + r.dataset.prod; });
    $$('[data-mov]', el).forEach(btn => btn.onclick = () => modalMovimento(lista.find(x => x.id === Number(btn.dataset.p)), btn.dataset.mov, navegar));
  };
  $('#busca-prod', el).oninput = desenhar; desenhar();
  $$('[data-filtro]', el).forEach(b => b.onclick = () => location.hash = '#/estoque' + (b.dataset.filtro === 'todos' ? '' : '?filtro=' + b.dataset.filtro));
  const novo = $('#novo', el); if (novo) novo.onclick = () => modalProduto(null, id => location.hash = '#/estoque/' + id);
  const cont = $('#contagem', el);
  if (cont) cont.onclick = () => abrirModal(`<form id="f-cont"><h2>Contagem de estoque</h2><p class="suave" style="margin-top:0">Conte o que tem na prateleira e corrija só o que estiver diferente. O sistema registra um ajuste para cada produto alterado.</p>
    <div class="tabela-rolagem"><table><thead><tr><th>Produto</th><th class="dir">No sistema</th><th>Contado</th></tr></thead><tbody>
    ${ativos.map(x => `<tr><td>${esc(x.nome)}</td><td class="dir num">${fmtQtd(x.quantidade, x.unidade)}</td><td><div class="linha" style="flex-wrap:nowrap"><input data-cont="${x.id}" data-atual="${x.quantidade}" inputmode="decimal" value="${qtdTxt(Math.max(0, x.quantidade))}" style="max-width:110px" aria-label="Contado ${esc(x.nome)}"><small>${x.unidade}</small></div></td></tr>`).join('')}
    </tbody></table></div><div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar contagem</button></div></form>`, cx => {
    cx.classList.add('larga');
    $('#f-cont', cx).onsubmit = e => { e.preventDefault(); tentar(async () => {
      const mudou = $$('[data-cont]', cx).filter(i => Math.abs(paraQtd(i.value) - Number(i.dataset.atual)) > 1e-9);
      for (const i of mudou) await POST(`/api/produtos/${i.dataset.cont}/movimentos`, { tipo: 'ajuste', quantidade: paraQtd(i.value), obs: 'Contagem de estoque' });
      fecharModal(); aviso(mudou.length ? `${mudou.length} produto(s) ajustado(s)` : 'Nada mudou'); navegar();
    }); };
  });
});

rota(/^estoque\/(\d+)$/, async (el, m) => {
  const x = await GET('/api/produtos/' + m[1]);
  const [, txtSit, cls] = situacaoEstoque(x);
  el.innerHTML = `<div class="topo"><div><h1>${esc(x.nome)} <span class="selo ${cls}">${txtSit}</span></h1><small>${x.categoria === 'venda' ? 'Para venda' : 'Uso interno'}${x.fornecedor ? ' · ' + esc(x.fornecedor) : ''}${x.ativo ? '' : ' · inativo'}</small></div>
    <div class="acoes"><a class="btn" href="#/estoque">← Estoque</a>${x.ativo ? botoesProduto(x) : ''}${dono() ? `<button class="peq" data-mov="ajuste">Contagem</button><button class="peq" id="editar">Editar</button>` : ''}</div></div>
    <div class="grade g4">
      <div class="card kpi"><div class="rotulo">Em estoque</div><div class="valor">${fmtQtd(x.quantidade, x.unidade)}</div>${barraEstoque(x)}</div>
      <div class="card kpi"><div class="rotulo">Estoque mínimo</div><div class="valor">${x.minimo ? fmtQtd(x.minimo, x.unidade) : '—'}</div></div>
      <div class="card kpi"><div class="rotulo">Saiu neste mês</div><div class="valor">${fmtQtd(x.consumo_mes, x.unidade)}</div></div>
      <div class="card kpi"><div class="rotulo">${dono() ? 'Custo médio' : 'Preço de venda'}</div><div class="valor">${dono() ? (x.custo ? reais(x.custo) : '—') : (x.preco_venda ? reais(x.preco_venda) : '—')}</div>
        ${dono() && x.categoria === 'venda' && x.preco_venda ? `<small>venda ${reais(x.preco_venda)}${x.custo ? ` · margem ${Math.round((x.preco_venda - x.custo) / x.preco_venda * 100)}%` : ''}</small>` : ''}</div>
    </div>
    <div class="card mt"><h2>Usado nos serviços</h2>${x.servicos.length ? `<table>${x.servicos.map(s => `<tr><td>${esc(s.nome)}</td><td class="dir num">${fmtQtd(s.quantidade, x.unidade)} por lavagem</td></tr>`).join('')}</table>`
      : `<p class="suave" style="margin:0">Nenhum serviço desconta este produto automaticamente.${dono() ? ' Defina em <a href="#/servicos">Serviços e preços</a>.' : ''}</p>`}</div>
    <div class="card mt tabela-rolagem"><h2>Movimentações</h2>${x.movimentos.length ? `<table><thead><tr><th>Data</th><th>Tipo</th><th class="dir">Quantidade</th><th class="dir esconde-mobile">Saldo</th><th>Detalhe</th>${dono() ? '<th class="dir esconde-mobile">Valor</th>' : ''}</tr></thead><tbody>
      ${x.movimentos.map(mv => { const [nome, c] = TIPOS_MOV[mv.tipo] || [mv.tipo, '']; return `<tr><td>${dataHoraBR(mv.data)}</td><td><span class="selo ${c}">${nome}</span></td>
        <td class="dir num ${mv.quantidade < 0 ? 'mov-sai' : 'mov-entra'}">${mv.quantidade > 0 ? '+' : ''}${fmtQtd(mv.quantidade, x.unidade)}</td><td class="dir num esconde-mobile">${fmtQtd(mv.saldo, x.unidade)}</td>
        <td><small>${mv.ordem_id ? `<a href="#/os/${mv.ordem_id}">OS #${mv.ordem_id}</a> ${placa(mv.placa)} ` : ''}${esc(mv.obs || '')}${mv.usuario_nome ? ` · ${esc(mv.usuario_nome)}` : ''}</small></td>
        ${dono() ? `<td class="dir num esconde-mobile">${mv.valor ? reais(mv.valor) : ''}</td>` : ''}</tr>`; }).join('')}</tbody></table>` : '<div class="vazio">Nenhuma movimentação ainda.</div>'}</div>`;
  $$('[data-mov]', el).forEach(b => b.onclick = () => modalMovimento(x, b.dataset.mov, navegar));
  const ed = $('#editar', el); if (ed) ed.onclick = () => modalProduto(x, navegar);
});

// ---------- serviços ----------
rota(/^servicos$/, async el => {
  const lista = await GET('/api/servicos?todos=1');
  el.innerHTML = `<div class="topo"><h1>Serviços e preços</h1><div class="acoes">${dono() ? '<button class="prim" id="novo">＋ Novo serviço</button>' : ''}</div></div>
    <div class="card tabela-rolagem"><table><thead><tr><th>Serviço</th><th class="dir">Pequeno</th><th class="dir">Médio</th><th class="dir">Grande</th><th class="dir">Moto</th><th class="dir esconde-mobile">Tempo</th></tr></thead><tbody>
    ${lista.map(s => `<tr class="${dono() ? 'clicavel' : ''}" data-s="${s.id}" style="${s.ativo ? '' : 'opacity:.5'}"><td><b>${esc(s.nome)}</b>${s.ativo ? '' : ' <small>(desativado)</small>'}</td>
      ${['pequeno', 'medio', 'grande', 'moto'].map(p => `<td class="dir num">${s['preco_' + p] ? reais(s['preco_' + p]) : '—'}</td>`).join('')}<td class="dir esconde-mobile">${s.duracao_min} min</td></tr>`).join('')}
    </tbody></table></div><p class="suave">O preço é escolhido automaticamente pelo porte do veículo na OS, e pode ser ajustado na hora.</p>`;
  if (!dono()) return;
  const produtos = await GET('/api/produtos');
  const modal = async s => { const ficha = s ? await GET(`/api/servicos/${s.id}/produtos`) : [];
  const linhaFicha = (i = {}) => `<div class="ficha-linha"><select data-fp aria-label="Produto"><option value="">Escolha o produto…</option>${produtos.map(x => `<option value="${x.id}" data-u="${x.unidade}" ${x.id === i.produto_id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select>
    <input data-fq inputmode="decimal" placeholder="0" value="${i.quantidade ? qtdTxt(i.quantidade) : ''}" aria-label="Quantidade"><span data-fu>${esc(i.unidade || '')}</span><button type="button" class="peq fantasma perigo" data-frem title="Remover">✕</button></div>`;
  abrirModal(`<form id="f-s"><h2>${s ? 'Editar serviço' : 'Novo serviço'}</h2>
    <div class="campo"><label>Nome *</label><input name="nome" required value="${esc(s?.nome)}"></div>
    <div class="grade g2">${['pequeno', 'medio', 'grande', 'moto'].map(p => `<div class="campo"><label>Preço ${PORTES[p].split(' ')[0].toLowerCase()} (R$)</label><input name="preco_${p}" inputmode="decimal" value="${s ? centTxt(s['preco_' + p]) : ''}"></div>`).join('')}</div>
    <div class="campo"><label>Duração média (minutos)</label><input name="duracao_min" type="number" min="5" step="5" value="${s?.duracao_min || 30}"></div>
    ${s ? `<label class="check"><input type="checkbox" name="ativo" ${s.ativo ? 'checked' : ''}> Ativo (aparece na OS)</label>` : ''}
    <h3 class="mt">Produtos usados em cada lavagem</h3>
    <p class="suave" style="margin:0 0 8px">Quando o carro fica pronto, o estoque desconta essas quantidades sozinho.</p>
    <div id="ficha">${ficha.map(linhaFicha).join('')}</div>
    ${produtos.length ? '<button type="button" class="peq" id="add-ficha">＋ Produto</button>' : '<p class="suave">Cadastre os produtos na aba Estoque para usar aqui.</p>'}
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    const ligar = () => { $$('.ficha-linha', cx).forEach(l => { $('[data-fp]', l).onchange = e => { $('[data-fu]', l).textContent = e.target.selectedOptions[0]?.dataset.u || ''; };
      $('[data-frem]', l).onclick = () => l.remove(); }); };
    const add = $('#add-ficha', cx); if (add) add.onclick = () => { $('#ficha', cx).insertAdjacentHTML('beforeend', linhaFicha()); ligar(); };
    ligar();
    $('#f-s', cx).onsubmit = e => { e.preventDefault(); tentar(async () => {
      const d = dadosForm(e.target); const corpo = { nome: d.nome, duracao_min: d.duracao_min, ativo: s ? !!d.ativo : true };
      for (const p of ['pequeno', 'medio', 'grande', 'moto']) corpo['preco_' + p] = paraCent(d['preco_' + p]);
      const id = s ? (await PUT('/api/servicos/' + s.id, corpo), s.id) : (await POST('/api/servicos', corpo)).id;
      const itens = $$('.ficha-linha', cx).map(l => ({ produto_id: Number($('[data-fp]', l).value), quantidade: paraQtd($('[data-fq]', l).value) })).filter(i => i.produto_id && i.quantidade > 0);
      await PUT(`/api/servicos/${id}/produtos`, { itens });
      estado.servicos = await GET('/api/servicos'); fecharModal(); aviso('Serviço salvo'); navegar();
    }); };
  }); };
  $('#novo', el).onclick = () => modal(null);
  $$('[data-s]', el).forEach(r => r.onclick = () => modal(lista.find(s => s.id === Number(r.dataset.s))));
});

// ---------- caixa ----------
rota(/^caixa$/, async (el, m, p) => {
  const d = await GET('/api/caixa?data=' + (p.data || hojeISO()));
  el.innerHTML = `<div class="topo"><div><h1>Caixa</h1><small>${dataBR(d.dia)}</small></div>
    <div class="acoes"><a class="btn" href="#/caixa?data=${somarDias(d.dia, -1)}">←</a><input type="date" id="dia" value="${d.dia}" style="width:auto"><a class="btn" href="#/caixa?data=${somarDias(d.dia, 1)}">→</a>
    <button id="entrada">＋ Entrada avulsa</button><button id="saida">＋ Despesa</button><button id="fechar" class="prim">Fechamento</button></div></div>
    <div class="grade g4">
      <div class="card kpi"><div class="rotulo">Entradas</div><div class="valor" style="color:var(--verde)">${reais(d.entradas)}</div></div>
      <div class="card kpi"><div class="rotulo">Despesas</div><div class="valor" style="color:var(--vermelho)">${reais(d.saidas)}</div></div>
      <div class="card kpi"><div class="rotulo">Saldo do dia</div><div class="valor">${reais(d.saldo)}</div></div>
      <div class="card kpi"><div class="rotulo">Dinheiro em espécie</div><div class="valor">${reais(d.porForma.dinheiro - d.saidas)}</div><small>dinheiro recebido − despesas</small></div>
    </div>
    <div class="grade g3 mt">${Object.entries(FORMAS).map(([k, v]) => `<div class="card linha entre"><span>${v}</span><b class="num">${reais(d.porForma[k])}</b></div>`).join('')}</div>
    <div class="grade g2 mt" style="align-items:start">
      <div class="card tabela-rolagem"><h2>Recebimentos</h2>${d.pagamentos.length ? `<table>${d.pagamentos.map(p => `<tr ${p.ordem_id ? `class="clicavel" data-os="${p.ordem_id}"` : ''}><td>${horaBR(p.data)}</td>
        <td>${p.ordem_id ? `OS #${p.ordem_id} ` : ''}${esc(p.cliente_nome || '')} ${placa(p.placa)}${p.referencia ? `<br><small>${esc(p.referencia)}</small>` : ''}</td><td>${FORMAS[p.forma]}</td><td class="dir num">${reais(p.valor)}</td></tr>`).join('')}</table>` : '<div class="vazio">Nenhum recebimento.</div>'}</div>
      <div class="grade">
        <div class="card"><h2>Despesas do dia</h2>${d.despesas.length ? `<table>${d.despesas.map(x => `<tr><td>${esc(x.descricao)}<br><small>${esc(x.categoria || '')}</small></td><td class="dir num">${reais(x.valor)}</td></tr>`).join('')}</table>` : '<div class="vazio">Nenhuma despesa.</div>'}</div>
        <div class="card"><h2>A receber</h2>${d.pendentes.length ? `<table>${d.pendentes.map(o => `<tr class="clicavel" data-os="${o.id}"><td>#${o.id} ${esc(o.cliente_nome || '')} ${placa(o.placa)}<br><small>${dataBR(o.data_ref)} · ${STATUS[o.status]}</small></td><td class="dir num">${reais(o.total - o.pago)}</td></tr>`).join('')}</table>` : '<div class="vazio">Tudo recebido 👍</div>'}</div>
      </div></div>`;
  $('#dia', el).onchange = e => location.hash = '#/caixa?data=' + e.target.value;
  $$('[data-os]', el).forEach(r => r.onclick = () => location.hash = '#/os/' + r.dataset.os);
  $('#saida', el).onclick = () => modalDespesa(d.dia, navegar);
  $('#entrada', el).onclick = () => abrirModal(`<form id="f-e"><h2>Entrada avulsa</h2><p class="suave">Venda de produto, gorjeta, etc. Pagamentos de OS se registram na própria OS.</p>
    <div class="campo"><label>Descrição *</label><input name="descricao" required></div><div class="grade g2"><div class="campo"><label>Valor (R$) *</label><input name="valor" inputmode="decimal" required></div>
    <div class="campo"><label>Forma</label><select name="forma">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div></div>
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    $('#f-e', cx).onsubmit = e => { e.preventDefault(); tentar(async () => { const f = dadosForm(e.target); await POST('/api/pagamentos', { ...f, valor: paraCent(f.valor) }); fecharModal(); navegar(); }); };
  });
  $('#fechar', el).onclick = () => {
    const w = window.open('', '_blank', 'width=420,height=640'); if (!w) return aviso('Permita pop-ups para imprimir', true);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Fechamento ${dataBR(d.dia)}</title><style>body{font:13px/1.5 ui-monospace,Consolas,monospace;width:300px;margin:10px auto}td{padding:2px 0}td.d{text-align:right}table{width:100%}hr{border:0;border-top:1px dashed #000}</style></head><body>
      <b>${esc(estado.empresa)}</b><br>FECHAMENTO DE CAIXA ${dataBR(d.dia)}<hr><table>${Object.entries(FORMAS).map(([k, v]) => `<tr><td>${v}</td><td class="d">${reais(d.porForma[k])}</td></tr>`).join('')}
      <tr><td><b>Entradas</b></td><td class="d"><b>${reais(d.entradas)}</b></td></tr><tr><td>Despesas</td><td class="d">-${reais(d.saidas)}</td></tr><tr><td><b>Saldo</b></td><td class="d"><b>${reais(d.saldo)}</b></td></tr>
      <tr><td>Dinheiro em caixa</td><td class="d">${reais(d.porForma.dinheiro - d.saidas)}</td></tr></table><hr>${d.pagamentos.length} recebimento(s)<br><br><br>Conferido por: ____________<script>onload=()=>print()<\/script></body></html>`);
    w.document.close();
  };
}, true);

const CATEGORIAS = ['Produtos de limpeza', 'Produtos para revenda', 'Água/luz', 'Aluguel', 'Salários', 'Comissões', 'Manutenção', 'Marketing', 'Impostos', 'Outros'];
function modalDespesa(dia, depois) {
  abrirModal(`<form id="f-d"><h2>Nova despesa</h2><div class="campo"><label>Descrição *</label><input name="descricao" required></div>
    <div class="grade g2"><div class="campo"><label>Valor (R$) *</label><input name="valor" inputmode="decimal" required></div><div class="campo"><label>Data</label><input type="date" name="data" value="${dia || hojeISO()}"></div></div>
    <div class="campo"><label>Categoria</label><select name="categoria">${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select></div>
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    $('#f-d', cx).onsubmit = e => { e.preventDefault(); tentar(async () => { const f = dadosForm(e.target); await POST('/api/despesas', { ...f, valor: paraCent(f.valor) }); fecharModal(); aviso('Despesa registrada'); depois(); }); };
  });
}

// ---------- despesas ----------
rota(/^despesas$/, async (el, m, p) => {
  const de = p.de || inicioMes(), ate = p.ate || hojeISO();
  const lista = await GET(`/api/despesas?de=${de}&ate=${ate}`);
  el.innerHTML = `<div class="topo"><h1>Despesas</h1><div class="acoes"><button class="prim" id="nova">＋ Nova despesa</button></div></div>
    <form class="card linha" id="filtro"><div><label>De</label><input type="date" name="de" value="${de}"></div><div><label>Até</label><input type="date" name="ate" value="${ate}"></div><div style="align-self:flex-end"><button>Filtrar</button></div>
    <div style="margin-left:auto;text-align:right"><small>Total no período</small><div class="num" style="font-size:22px;font-weight:700">${reais(lista.reduce((s, d) => s + d.valor, 0))}</div></div></form>
    <div class="card mt tabela-rolagem">${lista.length ? `<table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="dir">Valor</th><th></th></tr></thead><tbody>
      ${lista.map(d => `<tr><td>${dataBR(d.data)}</td><td>${esc(d.descricao)}</td><td>${esc(d.categoria || '')}</td><td class="dir num">${reais(d.valor)}</td><td class="dir"><button class="peq fantasma perigo" data-del="${d.id}">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhuma despesa no período.</div>'}</div>`;
  $('#filtro', el).onsubmit = e => { e.preventDefault(); location.hash = '#/despesas?' + new URLSearchParams(dadosForm(e.target)); };
  $('#nova', el).onclick = () => modalDespesa(null, navegar);
  $$('[data-del]', el).forEach(b => b.onclick = () => confirm('Excluir esta despesa?') && tentar(async () => { await DEL('/api/despesas/' + b.dataset.del); navegar(); }));
}, true);

// ---------- relatórios ----------
rota(/^relatorios$/, async (el, m, p) => {
  const de = p.de || inicioMes(), ate = p.ate || hojeISO();
  const r = await GET(`/api/relatorios?de=${de}&ate=${ate}`);
  const max = (arr, k) => Math.max(1, ...arr.map(x => x[k]));
  const atalho = (nome, a, b) => `<a class="btn peq" href="#/relatorios?de=${a}&ate=${b}">${nome}</a>`;
  const h = hojeISO(); const d = new Date(); const mesPassadoIni = `${d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()}-${pad(d.getMonth() === 0 ? 12 : d.getMonth())}-01`;
  const mesPassadoFim = somarDias(inicioMes(), -1);
  // preenche dias sem movimento para o gráfico
  const dias = []; for (let x = r.de; x <= r.ate && dias.length < 92; x = somarDias(x, 1)) dias.push({ dia: x, total: (r.porDia.find(y => y.dia === x) || {}).total || 0 });
  const maxDia = max(dias, 'total');
  el.innerHTML = `<div class="topo"><h1>Relatórios</h1><div class="acoes"><button id="imprimir">Imprimir</button></div></div>
    <form class="card linha" id="filtro"><div><label>De</label><input type="date" name="de" value="${de}"></div><div><label>Até</label><input type="date" name="ate" value="${ate}"></div><div style="align-self:flex-end"><button class="prim">Ver</button></div>
      <div class="linha nao-imprimir" style="align-self:flex-end">${atalho('Hoje', h, h)}${atalho('7 dias', somarDias(h, -6), h)}${atalho('Este mês', inicioMes(), h)}${atalho('Mês passado', mesPassadoIni, mesPassadoFim)}</div></form>
    <div class="grade g4 mt">
      <div class="card kpi"><div class="rotulo">Recebido</div><div class="valor" style="color:var(--verde)">${reais(r.recebido)}</div></div>
      <div class="card kpi"><div class="rotulo">Despesas</div><div class="valor" style="color:var(--vermelho)">${reais(r.despesas)}</div></div>
      <div class="card kpi"><div class="rotulo">Resultado</div><div class="valor">${reais(r.lucro)}</div></div>
      <div class="card kpi"><div class="rotulo">Atendimentos · ticket médio</div><div class="valor">${r.qtd_ordens} · ${reais(r.ticket_medio)}</div></div>
    </div>
    ${dias.length > 1 ? `<div class="card mt"><h2>Recebido por dia</h2><div class="grafico-dias">${dias.map(x => `<div style="height:${Math.round(x.total / maxDia * 100)}%" title="${dataBR(x.dia)}: ${reais(x.total)}"></div>`).join('')}</div>
      <div class="linha entre"><small>${dataBR(r.de)}</small><small>${dataBR(dias[dias.length - 1].dia)}</small></div></div>` : ''}
    <div class="grade g2 mt" style="align-items:start">
      <div class="card"><h2>Serviços mais vendidos</h2>${r.porServico.length ? r.porServico.map(s => `<div style="margin-bottom:10px"><div class="linha entre"><span>${esc(s.descricao)} <small>${s.n}×</small></span><b class="num">${reais(s.total)}</b></div>
        <div class="barra"><div style="width:${s.n / max(r.porServico, 'n') * 100}%"></div></div></div>`).join('') : '<div class="vazio">Sem dados.</div>'}</div>
      <div class="card"><h2>Formas de pagamento</h2>${r.porForma.length ? r.porForma.map(f => `<div style="margin-bottom:10px"><div class="linha entre"><span>${FORMAS[f.forma]} <small>${f.n}×</small></span><b class="num">${reais(f.total)}</b></div>
        <div class="barra"><div style="width:${f.total / max(r.porForma, 'total') * 100}%"></div></div></div>`).join('') : '<div class="vazio">Sem dados.</div>'}</div>
      <div class="card tabela-rolagem"><h2>Equipe e comissões</h2>${r.porFuncionario.length ? `<table><thead><tr><th>Funcionário</th><th class="dir">OS</th><th class="dir">Produção</th><th class="dir">Comissão</th></tr></thead><tbody>
        ${r.porFuncionario.map(f => `<tr><td>${esc(f.nome)}</td><td class="dir">${f.n}</td><td class="dir num">${reais(f.total)}</td><td class="dir num"><b>${reais(f.comissao)}</b><br><small>${f.comissao_pct}%</small></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhuma OS com responsável definido.</div>'}
        <small>Comissão calculada sobre o total das OS (exceto canceladas e agendadas). Defina o % em Equipe.</small></div>
      <div class="card tabela-rolagem"><h2>Melhores clientes</h2>${r.topClientes.length ? `<table>${r.topClientes.map(c => `<tr class="clicavel" data-cli="${c.id}"><td>${esc(c.nome)}</td><td class="dir">${c.n} visita(s)</td><td class="dir num">${reais(c.total)}</td></tr>`).join('')}</table>` : '<div class="vazio">Sem dados.</div>'}</div>
      <div class="card"><h2>Despesas por categoria</h2>${r.despesasPorCategoria.length ? r.despesasPorCategoria.map(c => `<div style="margin-bottom:10px"><div class="linha entre"><span>${esc(c.categoria)}</span><b class="num">${reais(c.total)}</b></div>
        <div class="barra"><div style="width:${c.total / max(r.despesasPorCategoria, 'total') * 100}%;background:var(--vermelho)"></div></div></div>`).join('') : '<div class="vazio">Sem despesas.</div>'}</div>
      <div class="card tabela-rolagem"><h2>Produtos no período</h2>${r.produtos.length ? `<table><thead><tr><th>Produto</th><th class="dir">Usado</th><th class="dir">Custo do uso</th><th class="dir">Vendas</th></tr></thead><tbody>
        ${r.produtos.map(x => `<tr class="clicavel" data-prod="${x.id}"><td>${esc(x.nome)}</td><td class="dir num">${x.usado ? fmtQtd(x.usado, x.unidade) : '—'}</td><td class="dir num">${x.custo_uso ? reais(x.custo_uso) : '—'}</td>
          <td class="dir num">${x.vendido ? `${fmtQtd(x.vendido, x.unidade)}<br><small>${reais(x.valor_vendas)}</small>` : '—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td><b>Total</b></td><td></td><td class="dir num"><b>${reais(r.produtos.reduce((t, x) => t + x.custo_uso, 0))}</b></td><td class="dir num"><b>${reais(r.produtos.reduce((t, x) => t + (x.valor_vendas || 0), 0))}</b></td></tr></tfoot></table>
        <small>Custo do uso: quanto os produtos gastos nas lavagens custaram, pelo custo médio de compra.</small>` : '<div class="vazio">Nenhum movimento de estoque no período.</div>'}</div>
      <div class="card"><h2>Resumo</h2><table><tr><td>Valor das OS no período</td><td class="dir num">${reais(r.total_ordens)}</td></tr><tr><td>Descontos / planos</td><td class="dir num">${reais(r.descontos)}</td></tr>
        <tr><td>Recebido (todas as entradas)</td><td class="dir num">${reais(r.recebido)}</td></tr><tr><td>Despesas</td><td class="dir num">− ${reais(r.despesas)}</td></tr><tr><td><b>Resultado</b></td><td class="dir num"><b>${reais(r.lucro)}</b></td></tr></table></div>
    </div>`;
  $('#filtro', el).onsubmit = e => { e.preventDefault(); location.hash = '#/relatorios?' + new URLSearchParams(dadosForm(e.target)); };
  $('#imprimir', el).onclick = () => print();
  $$('[data-cli]', el).forEach(x => x.onclick = () => location.hash = '#/clientes/' + x.dataset.cli);
  $$('[data-prod]', el).forEach(x => x.onclick = () => location.hash = '#/estoque/' + x.dataset.prod);
}, true);

// ---------- planos mensais ----------
rota(/^planos$/, async el => {
  const [planos, assin] = await Promise.all([GET('/api/planos'), GET('/api/assinaturas')]);
  el.innerHTML = `<div class="topo"><h1>Planos mensais</h1><div class="acoes"><button id="novo-plano">＋ Novo plano</button><button class="prim" id="nova-ass">＋ Adicionar assinante</button></div></div>
    <div class="grade g3">${planos.map(p => `<div class="card" style="${p.ativo ? '' : 'opacity:.55'}"><div class="linha entre"><h2 style="margin:0">${esc(p.nome)}</h2><button class="peq" data-plano="${p.id}">Editar</button></div>
      <div class="valor num" style="font-size:24px;font-weight:700;margin:6px 0">${reais(p.preco)}<small style="font-size:13px">/mês</small></div>
      <small>${p.lavagens_mes} lavagens por mês · ${p.assinantes} assinante(s)</small>${p.descricao ? `<p class="suave">${esc(p.descricao)}</p>` : ''}</div>`).join('') || '<div class="card vazio">Crie o primeiro plano. Ex.: “Plano Mensal” — 4 lavagens por R$ 150.</div>'}</div>
    <div class="card mt tabela-rolagem"><h2>Assinantes</h2>${assin.length ? `<table><thead><tr><th>Cliente</th><th>Plano</th><th>Uso no mês</th><th>Mensalidade</th><th></th></tr></thead><tbody>
      ${assin.map(a => `<tr><td><a href="#/clientes/${a.cliente_id}"><b>${esc(a.cliente_nome)}</b></a><br><small>desde ${dataBR(a.inicio)}</small></td><td>${esc(a.plano_nome)}</td><td>${a.usadas_mes} / ${a.lavagens_mes}</td>
        <td>${a.pago_mes >= a.preco ? '<span class="selo s-pago">Pago</span>' : `<span class="selo s-pendente">Em aberto</span>`}</td>
        <td class="dir">${a.pago_mes < a.preco ? `<button class="peq verde" data-pagar="${a.id}">Receber ${reais(a.preco - a.pago_mes)}</button>` : ''} <button class="peq perigo" data-cancelar="${a.id}">Encerrar</button></td></tr>`).join('')}</tbody></table>` : '<div class="vazio">Nenhum assinante.</div>'}</div>`;

  const modalPlano = p => abrirModal(`<form id="f-p"><h2>${p ? 'Editar plano' : 'Novo plano'}</h2><div class="campo"><label>Nome *</label><input name="nome" required value="${esc(p?.nome)}"></div>
    <div class="grade g2"><div class="campo"><label>Preço mensal (R$)</label><input name="preco" inputmode="decimal" value="${p ? centTxt(p.preco) : ''}"></div><div class="campo"><label>Lavagens por mês</label><input name="lavagens_mes" type="number" min="1" value="${p?.lavagens_mes || 4}"></div></div>
    <div class="campo"><label>O que inclui</label><textarea name="descricao">${esc(p?.descricao)}</textarea></div>
    ${p ? `<label class="check"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Plano ativo</label>` : ''}
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    $('#f-p', cx).onsubmit = e => { e.preventDefault(); tentar(async () => { const d = dadosForm(e.target); const corpo = { ...d, preco: paraCent(d.preco), ativo: p ? !!d.ativo : true };
      if (p) await PUT('/api/planos/' + p.id, corpo); else await POST('/api/planos', corpo); fecharModal(); navegar(); }); };
  });
  $('#novo-plano', el).onclick = () => modalPlano(null);
  $$('[data-plano]', el).forEach(b => b.onclick = () => modalPlano(planos.find(p => p.id === Number(b.dataset.plano))));
  $('#nova-ass', el).onclick = () => {
    const ativos = planos.filter(p => p.ativo); if (!ativos.length) return aviso('Crie um plano primeiro', true);
    abrirModal(`<form id="f-a"><h2>Adicionar assinante</h2><div class="campo"><label>Cliente</label><input id="bc" placeholder="Buscar cliente…" autocomplete="off"><input type="hidden" name="cliente_id"><div id="rc"></div></div>
      <div class="campo"><label>Plano</label><select name="plano_id">${ativos.map(p => `<option value="${p.id}">${esc(p.nome)} — ${reais(p.preco)}</option>`).join('')}</select></div>
      <div class="campo"><label>Início</label><input type="date" name="inicio" value="${hojeISO()}"></div>
      <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
      let t; $('#bc', cx).oninput = e => { clearTimeout(t); t = setTimeout(async () => { const l = await GET('/api/clientes?limite=8&q=' + encodeURIComponent(e.target.value));
        $('#rc', cx).innerHTML = `<div class="resultados">${l.map(c => `<div data-c="${c.id}">${esc(c.nome)} <small>${esc(c.veiculos || '')}</small></div>`).join('')}</div>`;
        $$('[data-c]', cx).forEach(d => d.onclick = () => { cx.querySelector('[name=cliente_id]').value = d.dataset.c; $('#bc', cx).value = d.textContent; $('#rc', cx).innerHTML = ''; }); }, 250); };
      $('#f-a', cx).onsubmit = e => { e.preventDefault(); tentar(async () => { const d = dadosForm(e.target); if (!d.cliente_id) throw new Error('Escolha o cliente da lista');
        await POST('/api/assinaturas', d); fecharModal(); aviso('Assinante adicionado'); navegar(); }); };
    });
  };
  $$('[data-cancelar]', el).forEach(b => b.onclick = () => confirm('Encerrar esta assinatura?') && tentar(async () => { await DEL('/api/assinaturas/' + b.dataset.cancelar); navegar(); }));
  $$('[data-pagar]', el).forEach(b => b.onclick = () => { const a = assin.find(x => x.id === Number(b.dataset.pagar));
    abrirModal(`<form id="f-m"><h2>Mensalidade · ${esc(a.cliente_nome)}</h2><div class="grade g2"><div class="campo"><label>Valor (R$)</label><input name="valor" inputmode="decimal" value="${centTxt(a.preco - a.pago_mes)}"></div>
      <div class="campo"><label>Forma</label><select name="forma">${Object.entries(FORMAS).map(([k, v]) => `<option value="${k}" ${k === 'pix' ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="verde">Receber</button></div></form>`, cx => {
      $('#f-m', cx).onsubmit = e => { e.preventDefault(); tentar(async () => { const d = dadosForm(e.target);
        await POST('/api/pagamentos', { assinatura_id: a.id, forma: d.forma, valor: paraCent(d.valor), descricao: `Mensalidade ${a.plano_nome}` }); fecharModal(); aviso('Mensalidade recebida'); navegar(); }); };
    }); });
}, true);

// ---------- equipe ----------
rota(/^equipe$/, async el => {
  const lista = await GET('/api/usuarios');
  el.innerHTML = `<div class="topo"><h1>Equipe</h1><div class="acoes"><button class="prim" id="novo">＋ Novo usuário</button></div></div>
    <div class="card tabela-rolagem"><table><thead><tr><th>Nome</th><th>Login</th><th>Acesso</th><th class="esconde-mobile">Aniversário</th><th class="dir">Comissão</th></tr></thead><tbody>
    ${lista.map(u => `<tr class="clicavel" data-u="${u.id}" style="${u.ativo ? '' : 'opacity:.5'}"><td><b>${esc(u.nome)}</b>${u.ativo ? '' : ' <small>(desativado)</small>'}</td><td>${esc(u.login)}</td>
      <td>${u.papel === 'dono' ? 'Dono' : 'Funcionário'}</td><td class="esconde-mobile">${aniversarioTxt(u.nascimento) || '—'}</td><td class="dir">${u.comissao_pct}%</td></tr>`).join('')}</tbody></table></div>
    <p class="suave"><b>Funcionário</b> abre OS, agenda, cadastra clientes e recebe pagamentos. <b>Dono</b> também vê caixa, despesas, relatórios, planos e equipe.</p>`;
  const modal = u => abrirModal(`<form id="f-u"><h2>${u ? 'Editar usuário' : 'Novo usuário'}</h2>
    <div class="campo"><label>Nome *</label><input name="nome" required value="${esc(u?.nome)}"></div>
    <div class="grade g2"><div class="campo"><label>Login *</label><input name="login" required autocapitalize="none" value="${esc(u?.login)}"></div>
    <div class="campo"><label>${u ? 'Nova senha (deixe vazio p/ manter)' : 'Senha * (mín. 6)'}</label><input name="senha" type="password" ${u ? '' : 'required minlength="6"'} autocomplete="new-password"></div>
    <div class="campo"><label>Acesso</label><select name="papel"><option value="funcionario">Funcionário</option><option value="dono" ${u?.papel === 'dono' ? 'selected' : ''}>Dono</option></select></div>
    <div class="campo"><label>Comissão (%)</label><input name="comissao_pct" type="number" min="0" max="100" step="0.5" value="${u?.comissao_pct || 0}"></div>
    <div class="campo"><label>Data de aniversário</label><input name="nascimento" type="date" max="${hojeISO()}" value="${esc(u?.nascimento)}"></div></div>
    ${u ? `<label class="check"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Acesso ativo</label>` : ''}
    <div class="rodape"><button type="button" data-fechar>Cancelar</button><button class="prim">Salvar</button></div></form>`, cx => {
    $('#f-u', cx).onsubmit = e => { e.preventDefault(); tentar(async () => { const d = dadosForm(e.target);
      if (u) await PUT('/api/usuarios/' + u.id, { ...d, ativo: !!d.ativo }); else await POST('/api/usuarios', d);
      estado.usuarios = await GET('/api/usuarios'); fecharModal(); aviso('Usuário salvo'); navegar(); }); };
  });
  $('#novo', el).onclick = () => modal(null);
  $$('[data-u]', el).forEach(r => r.onclick = () => modal(lista.find(u => u.id === Number(r.dataset.u))));
}, true);

// ---------- configurações ----------
rota(/^config$/, async el => {
  const c = await GET('/api/config');
  el.innerHTML = `<div class="topo"><h1>Configurações</h1></div><div class="grade g2" style="align-items:start">
    ${dono() ? `<form class="card" id="f-cfg"><h2>Dados do lava jato</h2>
      <div class="campo"><label>Nome</label><input name="nome_empresa" value="${esc(c.nome_empresa)}"></div>
      <div class="campo"><label>CNPJ</label><input name="cnpj" data-doc inputmode="numeric" value="${esc(c.cnpj)}"></div>
      <div class="campo"><label>Telefone</label><input name="telefone" value="${esc(c.telefone)}"></div>
      <div class="campo"><label>Endereço</label><input name="endereco" value="${esc(c.endereco)}"></div>
      <div class="campo"><label>Condições impressas na OS em PDF</label><textarea name="termos_os" rows="3">${esc(c.termos_os)}</textarea></div>
      <div class="campo"><label>Mensagem de “carro pronto” (WhatsApp)</label><textarea name="msg_pronto" rows="4">${esc(c.msg_pronto)}</textarea>
        <small>Use {cliente}, {veiculo}, {placa}, {total} e {empresa}.</small></div>
      <div class="campo"><label>Mensagem de aniversário (WhatsApp)</label><textarea name="msg_aniversario" rows="3">${esc(c.msg_aniversario)}</textarea>
        <small>Use {cliente} e {empresa}.</small></div>
      <button class="prim">Salvar</button></form>` : ''}
    <div class="grade">
      <form class="card" id="f-senha"><h2>Minha senha</h2><div class="campo"><label>Senha atual</label><input type="password" name="atual" required autocomplete="current-password"></div>
        <div class="campo"><label>Nova senha</label><input type="password" name="nova" required minlength="6" autocomplete="new-password"></div><button>Trocar senha</button></form>
      ${dono() ? `<div class="card"><h2>Backup</h2><p class="suave">O sistema faz uma cópia automática por dia na pasta <code>dados/backups</code> (o banco dos últimos 30 dias e todas as fotos).
        Para segurança extra, baixe uma cópia completa (dados + fotos) e guarde num pendrive ou no Google Drive.</p><a class="btn prim" href="/api/backup">Baixar backup completo</a></div>` : ''}
    </div></div>`;
  const fc = $('#f-cfg', el);
  if (fc) ligarBuscaCnpj(fc, 'cnpj', { endereco: 'endereco', telefone: 'telefone' });
  if (fc) fc.onsubmit = e => { e.preventDefault(); tentar(async () => { await PUT('/api/config', dadosForm(e.target)); await carregarBase(); aviso('Configurações salvas'); montarLayout(); navegar(); }); };
  $('#f-senha', el).onsubmit = e => { e.preventDefault(); tentar(async () => { await PUT('/api/minha-senha', dadosForm(e.target)); e.target.reset(); aviso('Senha alterada'); }); };
});

iniciar().catch(e => { $('#app').innerHTML = `<div class="tela-login"><div class="card vazio">Não consegui conectar ao sistema.<br><small>${esc(e.message)}</small></div></div>`; });
