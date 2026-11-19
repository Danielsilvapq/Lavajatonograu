// Gera a demonstração online (roda 100% no navegador, para publicar como página).
// Uso: cd ferramentas/demo-online && npm install && node gerar.js   -> arquivos em ./saida
// Saída: <destino>/index.html, nograu.js e fotos/*.jpg
const fs = require('fs');
const path = require('path');
const PROJ = path.join(__dirname, '..', '..');
const LIBS = path.join(__dirname, 'node_modules');
const DEST = path.join(__dirname, 'saida');
fs.mkdirSync(path.join(DEST, 'fotos'), { recursive: true });

const ler = p => fs.readFileSync(p, 'utf8');
const modulo = (id, src) => `${JSON.stringify(id)}: function (require, module, exports, __dirname, __filename) {\n${src}\n},`;

// ---------- código do sistema (sem alterações, só ajustes de texto da demo) ----------
let app = ler(path.join(PROJ, 'public/app.js'));
const troca = (de, para) => { if (!app.includes(de)) throw new Error('Trecho não encontrado: ' + de.slice(0, 60)); app = app.replace(de, para); };
troca('tudo volta ao original quando a demonstração reinicia.', 'tudo volta ao original quando você recarrega a página.');
// imagens da API sem "src" (a página preenche); a logo vai como arquivo ao lado da página
app = app.split('src="/api/').join('data-src-api="/api/').split('src="/logo.png"').join('src="logo.png"');

const fontes = [
  modulo('/app/db.js', ler(path.join(PROJ, 'db.js'))),
  modulo('/app/pdf.js', ler(path.join(PROJ, 'pdf.js'))),
  modulo('/app/server.js', ler(path.join(PROJ, 'server.js'))),
  modulo('/app/demo.js', ler(path.join(PROJ, 'demo.js'))),
  modulo('/app/public/carro.js', ler(path.join(PROJ, 'public/carro.js'))),
  modulo('buffer', ler(path.join(LIBS, 'buffer/index.js'))),
  modulo('base64-js', ler(path.join(LIBS, 'base64-js/index.js'))),
  modulo('ieee754', ler(path.join(LIBS, 'ieee754/index.js'))),
].join('\n');

const fotos = fs.readdirSync(path.join(PROJ, 'demo/fotos')).filter(f => f.endsWith('.jpg'));
for (const f of fotos) fs.copyFileSync(path.join(PROJ, 'demo/fotos', f), path.join(DEST, 'fotos', f));
for (const f of ['logo.png', 'logo-pdf.jpg']) fs.copyFileSync(path.join(PROJ, 'public', f), path.join(DEST, f));
const icone = 'logo.png';

// ---------- nograu.js: ambiente "Node" dentro do navegador ----------
const js = `// Sistema No Grau - demonstração online. O servidor e o banco rodam dentro do navegador.
${ler(path.join(PROJ, 'public/carro.js'))}
(function () {
'use strict';
const FOTOS_DEMO = ${JSON.stringify(fotos)};
const ICONE = ${JSON.stringify(icone)};
const fetchOriginal = window.fetch.bind(window);
window.process = { env: { NOGRAU_NAVEGADOR: '1' }, removeAllListeners() {}, versions: {}, platform: 'browser' };
window.confirm = () => true; // a moldura do claude.ai não mostra confirmações; na demo tudo volta ao original

// ---------- path ----------
const caminho = {
  sep: '/',
  normalize(p) { const abs = p.startsWith('/'); const partes = []; for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') partes.pop(); else partes.push(s); } return (abs ? '/' : '') + partes.join('/'); },
  join(...p) { return caminho.normalize(p.filter(Boolean).join('/')); },
  basename(p, ext) { let b = p.split('/').filter(Boolean).pop() || ''; if (ext && b.endsWith(ext)) b = b.slice(0, -ext.length); return b; },
  dirname(p) { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); },
  extname(p) { const b = caminho.basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i) : ''; },
};

// ---------- fs (em memória) ----------
const arquivos = new Map(), pastas = new Set(['/']);
const erroNaoExiste = p => Object.assign(new Error('ENOENT: ' + p), { code: 'ENOENT' });
const sistemaArquivos = {
  mkdirSync(p) { let atual = ''; for (const s of caminho.normalize(p).split('/').filter(Boolean)) { atual += '/' + s; pastas.add(atual); } },
  existsSync(p) { p = caminho.normalize(p); return arquivos.has(p) || pastas.has(p); },
  writeFileSync(p, dados) { p = caminho.normalize(p); sistemaArquivos.mkdirSync(caminho.dirname(p)); arquivos.set(p, Buffer.from(dados)); },
  readFileSync(p, enc) { p = caminho.normalize(p); if (!arquivos.has(p)) throw erroNaoExiste(p); const b = arquivos.get(p); return enc ? b.toString(enc) : b; },
  readdirSync(p, opc = {}) { p = caminho.normalize(p); const pref = p === '/' ? '/' : p + '/'; const nomes = new Map();
    for (const a of arquivos.keys()) if (a.startsWith(pref)) { const resto = a.slice(pref.length).split('/'); nomes.set(resto[0], resto.length > 1); }
    for (const d of pastas) if (d.startsWith(pref) && d !== p) { const resto = d.slice(pref.length).split('/'); if (!nomes.has(resto[0])) nomes.set(resto[0], true); }
    return [...nomes].map(([name, dir]) => opc.withFileTypes ? { name, isDirectory: () => dir } : name); },
  unlinkSync(p) { arquivos.delete(caminho.normalize(p)); },
  unlink(p, cb) { arquivos.delete(caminho.normalize(p)); cb && setTimeout(cb); },
  rmSync(p) { p = caminho.normalize(p); for (const a of [...arquivos.keys()]) if (a === p || a.startsWith(p + '/')) arquivos.delete(a); for (const d of [...pastas]) if (d === p || d.startsWith(p + '/')) pastas.delete(d); },
  statSync(p) { p = caminho.normalize(p); if (!sistemaArquivos.existsSync(p)) throw erroNaoExiste(p); return { mtimeMs: Date.now(), size: arquivos.get(p)?.length || 0, isDirectory: () => pastas.has(p) }; },
  copyFileSync(a, b) { sistemaArquivos.writeFileSync(b, sistemaArquivos.readFileSync(a)); },
  createReadStream(p) { return { on() { return this; }, pipe(res) { res.end(sistemaArquivos.readFileSync(p)); return res; } }; },
};

// ---------- crypto ----------
const criptografia = {
  randomBytes(n) { return Buffer.from(window.crypto.getRandomValues(new Uint8Array(n))); },
  // só para a demonstração: resumo simples (o sistema de verdade usa scrypt)
  scryptSync(senha, sal, tam) { const s = String(senha) + '|' + String(sal); const out = new Uint8Array(tam); let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let r = 0; r < 64; r++) for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c ^ r, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    for (let i = 0; i < tam; i++) { h1 = Math.imul(h1 ^ (h1 >>> 15), 2246822507) ^ h2; h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909) ^ h1; out[i] = (h1 >>> (i % 24)) & 255; }
    return Buffer.from(out); },
  timingSafeEqual(a, b) { return a.length === b.length && a.equals(b); },
};

// ---------- node:sqlite usando o sql.js ----------
let SQL = null;
class DatabaseSync {
  constructor() { this.db = new SQL.Database(); this.cache = new Map(); this.ultimo = this.db.prepare('SELECT last_insert_rowid()'); }
  exec(sql) { this.db.exec(sql); }
  prepare(sql) {
    let st = this.cache.get(sql); if (!st) { st = this.db.prepare(sql); this.cache.set(sql, st); }
    const db = this.db, ultimo = this.ultimo;
    const valores = a => a.map(v => v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);
    return {
      run: (...a) => { st.bind(valores(a)); st.step(); st.reset(); ultimo.step(); const id = ultimo.get()[0]; ultimo.reset(); return { lastInsertRowid: id, changes: db.getRowsModified() }; },
      get: (...a) => { st.bind(valores(a)); const r = st.step() ? st.getAsObject() : undefined; st.reset(); return r; },
      all: (...a) => { st.bind(valores(a)); const out = []; while (st.step()) out.push(st.getAsObject()); st.reset(); return out; },
    };
  }
}

// ---------- http: o "servidor" atende chamadas feitas pela própria página ----------
let atender = null;
const http = { createServer(fn) { atender = fn; return { listen(porta, host, cb) { cb && cb(); } }; } };
const os = { networkInterfaces: () => ({}), tmpdir: () => '/tmp' };
const eventos = { once: () => Promise.resolve() };

const cookies = new Map();
function chamar(metodo, url, cabecalhos, corpo) {
  return new Promise(ok => {
    const ouvintes = {};
    const req = { method: metodo, url, headers: cabecalhos, socket: { remoteAddress: 'navegador' },
      on(ev, cb) { (ouvintes[ev] = ouvintes[ev] || []).push(cb); return req; }, destroy() {} };
    let status = 200; const h = {}; const partes = [];
    const res = { headersSent: false,
      setHeader(k, v) { h[k.toLowerCase()] = v; },
      writeHead(s, extra = {}) { status = s; for (const [k, v] of Object.entries(extra)) h[k.toLowerCase()] = v; res.headersSent = true; return res; },
      write(c) { if (c != null) partes.push(Buffer.from(c)); return true; },
      end(c) { if (c != null) partes.push(Buffer.from(c)); res.headersSent = true;
        const sc = h['set-cookie']; delete h['set-cookie'];
        if (sc) for (const linha of [].concat(sc)) { const [par] = linha.split(';'); const [k, v] = par.split('='); if (/max-age=0/i.test(linha)) cookies.delete(k.trim()); else cookies.set(k.trim(), v); }
        const cab = {}; for (const [k, v] of Object.entries(h)) cab[k] = String(v);
        ok({ status, cabecalhos: cab, corpo: Buffer.concat(partes) }); },
      on() { return res; }, once() { return res; } };
    Promise.resolve(atender(req, res)).catch(e => { console.error(e); if (!res.headersSent) res.writeHead(500).end('{"erro":"Erro interno"}'); });
    setTimeout(() => { if (corpo && corpo.length) (ouvintes.data || []).forEach(cb => cb(Buffer.from(corpo))); (ouvintes.end || []).forEach(cb => cb()); });
  });
}
async function chamarApi(url, opcoes = {}) {
  let corpo = opcoes.body;
  if (corpo instanceof Blob) corpo = new Uint8Array(await corpo.arrayBuffer());
  else if (typeof corpo === 'string') corpo = new TextEncoder().encode(corpo);
  const cab = {}; for (const [k, v] of Object.entries(opcoes.headers || {})) cab[k.toLowerCase()] = v;
  cab.cookie = [...cookies].map(([k, v]) => k + '=' + v).join('; ');
  return chamar((opcoes.method || 'GET').toUpperCase(), url, cab, corpo);
}
window.fetch = async (entrada, opcoes = {}) => {
  const url = typeof entrada === 'string' ? entrada : entrada.url;
  if (!url.startsWith('/api/')) return fetchOriginal(entrada, opcoes);
  const r = await chamarApi(url, opcoes);
  return new Response(r.corpo.length ? r.corpo : null, { status: r.status, headers: r.cabecalhos });
};

// ---------- módulos do sistema ----------
const PRONTOS = { fs: sistemaArquivos, path: caminho, crypto: criptografia, http, os, events: eventos, 'node:sqlite': { DatabaseSync } };
const FONTES = {
${fontes}
};
const cache = {};
function carregar(id) {
  if (PRONTOS[id]) return PRONTOS[id];
  if (cache[id]) return cache[id].exports;
  const fn = FONTES[id]; if (!fn) throw new Error('Módulo não encontrado: ' + id);
  const module = { exports: {} }; cache[id] = module;
  const dir = id.startsWith('/') ? caminho.dirname(id) : '/';
  fn(nome => carregar(nome.startsWith('.') || nome.startsWith('/') ? (n => n.endsWith('.js') ? n : n + '.js')(caminho.join(dir, nome)) : nome), module, module.exports, dir, id);
  return module.exports;
}

// ---------- fotos (<img src="/api/fotos/..">) e ícone ----------
const urlsFotos = new Map();
async function trocarImagem(img) {
  const src = img.getAttribute('data-src-api'); if (!src || img.dataset.trocada === src) return;
  img.dataset.trocada = src;
  if (!urlsFotos.has(src)) urlsFotos.set(src, chamarApi(src).then(r => r.status === 200 ? URL.createObjectURL(new Blob([r.corpo], { type: 'image/jpeg' })) : ''));
  const u = await urlsFotos.get(src); if (u) img.src = u;
}
new MutationObserver(lista => { for (const m of lista) {
  if (m.type === 'attributes') { if (m.target.tagName === 'IMG') trocarImagem(m.target); continue; }
  for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.tagName === 'IMG') trocarImagem(n); n.querySelectorAll?.('img[data-src-api]').forEach(trocarImagem); }
} }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-src-api'] });

// ---------- PDF: mostra dentro da página (a moldura não abre outras abas) ----------
function avisar(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.className = 'toast'; t.hidden = false; clearTimeout(avisar.t); avisar.t = setTimeout(() => t.hidden = true, 3500); }
async function mostrarPdf(url) {
  const caixa = document.createElement('div'); caixa.className = 'visor-pdf';
  caixa.innerHTML = '<div class="visor-pdf-barra"><b>Ordem de serviço em PDF</b><span>No sistema instalado, este PDF abre numa aba e pode ser baixado ou enviado.</span><button type="button" class="prim">Fechar</button></div><div class="visor-pdf-paginas"><p class="vazio">Gerando o PDF…</p></div>';
  document.body.appendChild(caixa); document.body.style.overflow = 'hidden';
  const fechar = () => { caixa.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') fechar(); };
  caixa.querySelector('button').onclick = fechar; document.addEventListener('keydown', esc);
  try {
    const r = await chamarApi(url.replace(/[?&]baixar=1/, ''));
    if (r.status !== 200) throw new Error('Não consegui gerar o PDF');
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(r.corpo), isEvalSupported: false }).promise;
    const area = caixa.querySelector('.visor-pdf-paginas'); area.innerHTML = '';
    const largura = Math.min(area.clientWidth - 24, 820);
    for (let i = 1; i <= pdf.numPages; i++) {
      const pagina = await pdf.getPage(i); const base = pagina.getViewport({ scale: 1 });
      const escala = largura / base.width, dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pagina.getViewport({ scale: escala * dpr });
      const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height; cv.style.width = largura + 'px';
      area.appendChild(cv); await pagina.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    }
  } catch (e) { caixa.querySelector('.visor-pdf-paginas').innerHTML = '<p class="vazio">' + (e.message || 'Erro ao abrir o PDF') + '</p>'; }
}
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href^="/api/"]'); if (!a) return;
  e.preventDefault(); e.stopPropagation();
  const href = a.getAttribute('href');
  if (/\\/pdf/.test(href)) mostrarPdf(href); else avisar('Na demonstração online não dá para baixar arquivos.');
}, true);

// ---------- início ----------
async function iniciar() {
  const t0 = performance.now();
  SQL = await window.initSqlJs();
  window.Buffer = carregar('buffer').Buffer;
  await Promise.all(FOTOS_DEMO.map(async n => { try { const r = await fetchOriginal('fotos/' + n); if (r.ok) sistemaArquivos.writeFileSync('/app/demo/fotos/' + n, new Uint8Array(await r.arrayBuffer())); } catch {} }));
  try { const r = await fetchOriginal('logo-pdf.jpg'); if (r.ok) sistemaArquivos.writeFileSync('/app/public/logo-pdf.jpg', new Uint8Array(await r.arrayBuffer())); } catch {}
  carregar('/app/demo.js'); // cria os dados de exemplo e "liga" o servidor
  console.log('Demonstração pronta em ' + Math.round(performance.now() - t0) + ' ms');
  (function () {
${app}
  })();
}
iniciar().catch(e => { console.error(e); document.getElementById('app').innerHTML = '<div class="tela-login"><div class="card vazio">Não consegui abrir a demonstração.<br><small>' + (e && e.message) + '</small></div></div>'; });
})();
`;
// só ASCII no arquivo: os acentos viram \\uXXXX e funcionam com qualquer codificação
const jsAscii = js.replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
fs.writeFileSync(path.join(DEST, 'nograu.js'), jsAscii);

// ---------- index.html ----------
const css = ler(path.join(PROJ, 'public/style.css'));
const html = `<title>Lava Jato No Grau</title>
<meta name="description" content="Demonstração do sistema de gestão do Lava Jato No Grau">
<style>
${css}
/* demonstração online */
:root { color-scheme: light; }
body { background: var(--fundo); color: var(--texto); }
img[data-src-api]:not([src]) { visibility: hidden; }
#imprimir, #fechar, a[href*="baixar=1"], a[href="/api/backup"], a[download] { display: none !important; }
.carregando { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: radial-gradient(ellipse at 50% 0%, #3a0c11 0%, var(--azul) 60%); color: #fff; text-align: center; }
.carregando .gota { display: block; width: 170px; height: auto; margin: 0 auto 14px; animation: pulsar 1.6s ease-in-out infinite; }
@keyframes pulsar { 50% { transform: scale(.88); opacity: .7; } }
@media (prefers-reduced-motion: reduce) { .carregando .gota { animation: none; } }
.visor-pdf { position: fixed; inset: 0; z-index: 70; background: rgba(10, 10, 12, .85); display: flex; flex-direction: column; }
.visor-pdf-barra { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 10px max(16px, env(safe-area-inset-right, 0px)) 10px max(16px, env(safe-area-inset-left, 0px)); background: var(--azul); color: #fff; padding-top: calc(10px + env(safe-area-inset-top, 0px)); }
.visor-pdf-barra span { font-size: 13px; color: #c9c9cf; flex: 1; min-width: 180px; }
.visor-pdf-paginas { flex: 1; overflow: auto; padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
.visor-pdf-paginas canvas { background: #fff; box-shadow: 0 6px 24px rgba(0, 0, 0, .35); border-radius: 2px; max-width: 100%; height: auto; }
.visor-pdf-paginas .vazio { color: #fff; }
</style>
<div id="app"><div class="carregando"><div><img class="gota" src="${icone}" alt=""><b style="font-size:20px">Lava Jato No Grau</b><br><small style="color:#f3e3b5">Preparando a demonstração…</small></div></div></div>
<div id="modal" class="modal" hidden><div class="modal-caixa" role="dialog" aria-modal="true"></div></div>
<div id="toast" class="toast" hidden></div>
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-asm.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"></script>
<script src="nograu.js" charset="utf-8"></script>
`;
fs.writeFileSync(path.join(DEST, 'index.html'), html);
console.log('gerado:', DEST, '| nograu.js', Math.round(js.length / 1024), 'KB | fotos', fotos.length);
