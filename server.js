// Sistema No Grau - servidor
// Rode com:  node server.js   (porta padrão 3000, mude com PORT=8080)
process.removeAllListeners('warning');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { db, transacao, fazerBackup, FOTOS_DIR } = require('./db');
const { Documento, infoJpeg } = require('./pdf');
const { CARRO } = require('./public/carro.js');
const { once } = require('events');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const SECURE_COOKIE = process.env.COOKIE_SECURE === '1';
const PUBLIC = path.join(__dirname, 'public');

// ---------- utilidades ----------
class Erro extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const agora = (d = new Date()) => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const hoje = () => agora().slice(0, 10);
const int = v => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : 0; };
const txt = v => (v === undefined || v === null) ? null : String(v).trim().slice(0, 2000) || null;
const exigir = (cond, msg) => { if (!cond) throw new Erro(400, msg); };
const dataOk = s => /^\d{4}-\d{2}-\d{2}/.test(String(s || ''));
// CPF/CNPJ: valida dígitos verificadores e devolve formatado
function validarDoc(d) {
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    for (const t of [9, 10]) { let s = 0; for (let i = 0; i < t; i++) s += +d[i] * (t + 1 - i); if (((s * 10) % 11) % 10 !== +d[t]) return false; }
    return true;
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    for (const t of [12, 13]) { let s = 0, p = t - 7; for (let i = 0; i < t; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11 < 2 ? 0 : 11 - (s % 11); if (r !== +d[t]) return false; }
    return true;
  }
  return false;
}
function documento(v, rotulo = 'CPF/CNPJ') {
  const t = txt(v); if (!t) return null;
  const d = t.replace(/\D/g, '');
  exigir(validarDoc(d), `${rotulo} inválido. Confira os números.`);
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}
const nascimento = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null;

function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(senha), salt, 64).toString('hex');
}
function conferirSenha(senha, hash) {
  const [salt, h] = String(hash).split(':');
  const calc = crypto.scryptSync(String(senha), salt, 64);
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}

// ---------- roteador ----------
const rotas = [];
// papeis: null = público, 'logado' = qualquer usuário, 'dono' = só dono
function rota(metodo, padrao, papel, fn) {
  const nomes = [];
  const re = new RegExp('^' + padrao.replace(/:(\w+)/g, (_, n) => { nomes.push(n); return '(\\d+)'; }) + '$');
  rotas.push({ metodo, re, nomes, papel, fn });
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', c => { tam += c.length; if (tam > 2e6) { falha(new Erro(413, 'Dados muito grandes')); req.destroy(); } else partes.push(c); });
    req.on('end', () => {
      if (!partes.length) return ok({});
      try { ok(JSON.parse(Buffer.concat(partes).toString('utf8'))); } catch { falha(new Erro(400, 'JSON inválido')); }
    });
    req.on('error', falha);
  });
}

function lerBinario(req, limite) {
  return new Promise((ok, falha) => {
    let tam = 0; const partes = [];
    req.on('data', c => { tam += c.length; if (tam > limite) { falha(new Erro(413, 'Foto muito grande')); req.destroy(); } else partes.push(c); });
    req.on('end', () => ok(Buffer.concat(partes)));
    req.on('error', falha);
  });
}

function cookies(req) {
  const out = {};
  for (const p of String(req.headers.cookie || '').split(';')) {
    const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  }
  return out;
}

function usuarioDaSessao(req) {
  const token = cookies(req).ng_sessao;
  if (!token) return null;
  const u = db.prepare(`SELECT u.id, u.nome, u.login, u.papel, u.comissao_pct FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ? AND s.expira_em > ? AND u.ativo = 1`).get(token, agora());
  return u ? { ...u, token } : null;
}

function enviarJSON(res, status, dados, extraHeaders = {}) {
  const corpo = JSON.stringify(dados);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(corpo);
}

const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
function servirEstatico(req, res, url) {
  let arq = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname)));
  if (!arq.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (!fs.existsSync(arq) || fs.statSync(arq).isDirectory()) arq = path.join(PUBLIC, 'index.html');
  res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(arq).pipe(res);
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  if (!url.pathname.startsWith('/api/')) return servirEstatico(req, res, url);
  try {
    const r = rotas.find(r => r.metodo === req.method && r.re.test(url.pathname));
    if (!r) throw new Erro(404, 'Rota não encontrada');
    const m = url.pathname.match(r.re);
    const params = {}; r.nomes.forEach((n, i) => params[n] = Number(m[i + 1]));
    const usuario = usuarioDaSessao(req);
    if (r.papel && !usuario) throw new Erro(401, 'Faça login');
    if (r.papel === 'dono' && usuario.papel !== 'dono') throw new Erro(403, 'Só o dono pode acessar isso');
    if (process.env.NOGRAU_DEMO === '1' && req.method !== 'GET' && /^\/api\/(minha-senha|usuarios|setup)/.test(url.pathname))
      throw new Erro(403, 'Na demonstração não dá para mudar senhas nem a equipe.');
    const ehImagem = /^image\//.test(req.headers['content-type'] || '');
    const corpo = !['POST', 'PUT', 'DELETE'].includes(req.method) ? {} : ehImagem ? await lerBinario(req, 15e6) : await lerCorpo(req);
    const q = Object.fromEntries(url.searchParams);
    const resultado = await r.fn({ req, res, params, q, corpo, usuario });
    if (resultado === undefined) return; // resposta já enviada
    enviarJSON(res, 200, resultado);
  } catch (e) {
    let status = e.status || 500; let msg = e.status ? e.message : 'Erro interno';
    if (/UNIQUE constraint failed: usuarios.login/.test(e.message)) { status = 400; msg = 'Esse login já existe'; }
    if (status === 500) console.error(e);
    if (!res.headersSent) enviarJSON(res, status, { erro: msg });
  }
});

// ---------- autenticação ----------
function criarSessao(res, usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?,?,?)').run(token, usuarioId, agora(new Date(Date.now() + 30 * 864e5)));
  res.setHeader('Set-Cookie', `ng_sessao=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}${SECURE_COOKIE ? '; Secure' : ''}`);
}

rota('GET', '/api/status', null, ({ req }) => {
  const precisaSetup = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n === 0;
  const u = usuarioDaSessao(req);
  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  return { precisaSetup, usuario: u ? { id: u.id, nome: u.nome, login: u.login, papel: u.papel } : null, empresa: cfg.nome_empresa, demo: process.env.NOGRAU_DEMO === '1' };
});

rota('POST', '/api/setup', null, ({ corpo, res }) => {
  if (db.prepare('SELECT COUNT(*) n FROM usuarios').get().n > 0) throw new Erro(400, 'Sistema já configurado');
  exigir(txt(corpo.nome) && txt(corpo.login), 'Informe nome e login');
  exigir(String(corpo.senha || '').length >= 6, 'A senha precisa ter pelo menos 6 caracteres');
  const r = db.prepare("INSERT INTO usuarios (nome, login, senha_hash, papel) VALUES (?,?,?,'dono')")
    .run(txt(corpo.nome), txt(corpo.login).toLowerCase(), hashSenha(corpo.senha));
  criarSessao(res, Number(r.lastInsertRowid));
  return { ok: true };
});

const tentativas = new Map(); // proteção simples contra força bruta
rota('POST', '/api/login', null, ({ corpo, res, req }) => {
  const ip = req.socket.remoteAddress;
  const t = tentativas.get(ip) || { n: 0, ate: 0 };
  if (t.ate > Date.now()) throw new Erro(429, 'Muitas tentativas. Aguarde alguns minutos.');
  const u = db.prepare('SELECT * FROM usuarios WHERE login = ? AND ativo = 1').get(String(corpo.login || '').trim().toLowerCase());
  if (!u || !conferirSenha(corpo.senha || '', u.senha_hash)) {
    t.n++; if (t.n >= 8) { t.ate = Date.now() + 5 * 60e3; t.n = 0; } tentativas.set(ip, t);
    throw new Erro(401, 'Login ou senha incorretos');
  }
  tentativas.delete(ip);
  criarSessao(res, u.id);
  return { ok: true };
});

rota('POST', '/api/logout', 'logado', ({ usuario, res }) => {
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(usuario.token);
  res.setHeader('Set-Cookie', 'ng_sessao=; HttpOnly; Path=/; Max-Age=0');
  return { ok: true };
});

rota('PUT', '/api/minha-senha', 'logado', ({ usuario, corpo }) => {
  const u = db.prepare('SELECT senha_hash FROM usuarios WHERE id = ?').get(usuario.id);
  exigir(conferirSenha(corpo.atual || '', u.senha_hash), 'Senha atual incorreta');
  exigir(String(corpo.nova || '').length >= 6, 'A nova senha precisa ter pelo menos 6 caracteres');
  db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(corpo.nova), usuario.id);
  return { ok: true };
});

// ---------- usuários ----------
rota('GET', '/api/usuarios', 'logado', ({ usuario }) => {
  const campos = usuario.papel === 'dono' ? 'id, nome, login, papel, comissao_pct, ativo, nascimento' : 'id, nome, papel, ativo';
  return db.prepare(`SELECT ${campos} FROM usuarios ORDER BY ativo DESC, nome`).all();
});
rota('POST', '/api/usuarios', 'dono', ({ corpo }) => {
  exigir(txt(corpo.nome) && txt(corpo.login), 'Informe nome e login');
  exigir(String(corpo.senha || '').length >= 6, 'A senha precisa ter pelo menos 6 caracteres');
  const r = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, papel, comissao_pct, nascimento) VALUES (?,?,?,?,?,?)')
    .run(txt(corpo.nome), txt(corpo.login).toLowerCase(), hashSenha(corpo.senha), corpo.papel === 'dono' ? 'dono' : 'funcionario', Number(corpo.comissao_pct) || 0, nascimento(corpo.nascimento));
  return { id: Number(r.lastInsertRowid) };
});
rota('PUT', '/api/usuarios/:id', 'dono', ({ params, corpo, usuario }) => {
  const atual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(params.id);
  if (!atual) throw new Erro(404, 'Usuário não encontrado');
  const papel = corpo.papel === 'dono' ? 'dono' : 'funcionario';
  const ativo = corpo.ativo === false || corpo.ativo === 0 ? 0 : 1;
  if (params.id === usuario.id) exigir(papel === 'dono' && ativo, 'Você não pode tirar o seu próprio acesso de dono');
  db.prepare('UPDATE usuarios SET nome=?, login=?, papel=?, comissao_pct=?, ativo=?, nascimento=? WHERE id=?')
    .run(txt(corpo.nome) || atual.nome, (txt(corpo.login) || atual.login).toLowerCase(), papel, Number(corpo.comissao_pct) || 0, ativo, nascimento(corpo.nascimento), params.id);
  if (corpo.senha) {
    exigir(String(corpo.senha).length >= 6, 'A senha precisa ter pelo menos 6 caracteres');
    db.prepare('UPDATE usuarios SET senha_hash=? WHERE id=?').run(hashSenha(corpo.senha), params.id);
  }
  if (!ativo) db.prepare('DELETE FROM sessoes WHERE usuario_id = ?').run(params.id);
  return { ok: true };
});

// ---------- configurações ----------
rota('GET', '/api/config', 'logado', () => Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])));
rota('PUT', '/api/config', 'dono', ({ corpo }) => {
  const up = db.prepare('INSERT INTO config (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  if ('cnpj' in corpo) corpo.cnpj = documento(corpo.cnpj, 'CNPJ/CPF do lava jato') || '';
  for (const k of ['nome_empresa', 'telefone', 'endereco', 'cnpj', 'termos_os', 'msg_pronto', 'msg_aniversario']) if (k in corpo) up.run(k, String(corpo[k] ?? ''));
  return { ok: true };
});

// ---------- serviços ----------
rota('GET', '/api/servicos', 'logado', ({ q }) =>
  db.prepare(`SELECT * FROM servicos ${q.todos ? '' : 'WHERE ativo = 1'} ORDER BY ativo DESC, nome`).all());
function salvarServico(corpo, id) {
  exigir(txt(corpo.nome), 'Informe o nome do serviço');
  const v = [txt(corpo.nome), int(corpo.preco_pequeno), int(corpo.preco_medio), int(corpo.preco_grande), int(corpo.preco_moto), int(corpo.duracao_min) || 30, corpo.ativo === false ? 0 : 1];
  if (id) { db.prepare('UPDATE servicos SET nome=?, preco_pequeno=?, preco_medio=?, preco_grande=?, preco_moto=?, duracao_min=?, ativo=? WHERE id=?').run(...v, id); return { id }; }
  return { id: Number(db.prepare('INSERT INTO servicos (nome, preco_pequeno, preco_medio, preco_grande, preco_moto, duracao_min, ativo) VALUES (?,?,?,?,?,?,?)').run(...v).lastInsertRowid) };
}
rota('POST', '/api/servicos', 'dono', ({ corpo }) => salvarServico(corpo));
rota('PUT', '/api/servicos/:id', 'dono', ({ corpo, params }) => salvarServico(corpo, params.id));

// ---------- consulta de CNPJ (precisa de internet) ----------
// Tenta BrasilAPI, depois CNPJ.ws e por fim ReceitaWS. Todos são gratuitos e públicos.
const URL_BRASILAPI = process.env.CNPJ_URL_BRASILAPI || 'https://brasilapi.com.br/api/cnpj/v1/';
const URL_CNPJWS = process.env.CNPJ_URL_CNPJWS || 'https://publica.cnpj.ws/cnpj/';
const URL_RECEITAWS = process.env.CNPJ_URL_RECEITAWS || 'https://receitaws.com.br/v1/cnpj/';
const cacheCnpj = new Map();
const fmtTel = t => { const d = String(t || '').replace(/\D/g, ''); if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3'); if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3'); return t ? String(t).trim() : null; };
const fmtCep = c => { const d = String(c || '').replace(/\D/g, ''); return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : null; };
function montarEndereco(e) {
  const rua = [e.tipo, e.logradouro].filter(Boolean).join(' ').trim();
  const p1 = [rua, e.numero && e.numero !== 'S/N' ? e.numero : (e.numero ? 'S/N' : null)].filter(Boolean).join(', ');
  const partes = [p1, e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep ? 'CEP ' + fmtCep(e.cep) : null];
  return partes.map(x => x && String(x).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' – ') || null;
}
// A Receita devolve tudo em MAIÚSCULAS e sem acento. Aqui convertemos para letras normais
// e recolocamos os acentos das palavras mais comuns em nomes de empresas e endereços.
const ACENTOS = Object.fromEntries(`Ação Ações São João José Antônio André Conceição Comércio Serviço Serviços Indústria Indústrias Distribuição Distribuidora:Distribuidora
Logística Construção Construções Mecânica Mecânico Elétrica Elétrico Automóveis Veículos Veículo Peças Participações Administração Soluções Informática
Alimentação Alimentícios Imóveis Imóvel Máquinas Locação Locações Manutenção Instalações Farmácia Clínica Médica Médicos Confecções Importação Exportação
Praça Água Águas Coração Estação Espírito Consolação República Independência Aviação Nações União Associação Educação Ciência Saúde Estética
Higienização Acessórios Eletrônicos Conveniência Agência Gráfica Escritório Contábil Jurídico Patrimônio Negócios Armazém Armazéns Produção Produções
Caminhões Ônibus Combustíveis Ótica Óptica Açougue Metalúrgica Química Plásticos Vidraçaria Calçados Lúcia Mônica Valéria Fátima Cecília Getúlio
Várzea Ribeirão Taboão Belém Goiânia Brasília Maceió Vitória Florianópolis Cuiabá Macapá Amapá Piauí Ceará Paraná Maranhão Rondônia Goiás
Maringá Jundiaí Uberlândia Niterói Petrópolis Itajaí Criciúma Chapecó Iguaçu Anápolis Guarujá Taubaté Jacareí Mauá Diadema:Diadema Osasco:Osasco
Pinheiros:Pinheiros Tatuapé Butantã Ipiranga:Ipiranga Jabaquara:Jabaquara Glória Glórias Lagoa:Lagoa Paraíso Cidadão Pião Irmão Irmãos Município
Inácio Simão Sebastião Tomé Estêvão Luís Inês Mário Márcio Sérgio Fábio Cláudio Vinícius Lívia Cássia Patrícia Márcia Júlio Júlia Lúcio Rogério Fernão
Rondonópolis Ribeirão Nóbrega Leopoldina:Leopoldina Paulínia Ilhéus Marília Sumaré Hortolândia Jardim:Jardim Varginha:Varginha Pará:Pará Amazônia
Botafogo:Botafogo Méier Tijuca:Tijuca Gávea Jacarepaguá Niterói Grajaú Penha:Penha Lapa:Lapa Vila:Vila Sé Fé Ré Pé Avô Avó Prédio Edifício Galpão Galpões
Térreo Quadra:Quadra Lote:Lote Número Rodovia:Rodovia Estrada:Estrada Travessa:Travessa Alameda:Alameda Viaduto:Viaduto Condomínio Residência Residencial:Residencial
Lavação Lavagem:Lavagem Polimento:Polimento Estacionamento:Estacionamento Locadora:Locadora Cia:Cia Câmbio Pneus:Pneus Borracharia:Borracharia Funilaria:Funilaria
Zé Olímpia Acácias Bárbara Antônia Tânia Lírio Lírios Jacarandá Ipê Ipês Jequitibá Paineiras:Paineiras Orquídeas Hortênsias Bosque:Bosque Recanto:Recanto Pátio Shopping:Shopping
Ativa:Ativa Baixada:Baixada Inapta:Inapta Suspensa:Suspensa Nula:Nula Ltda:Ltda Eireli:Eireli`.split(/\s+/).filter(Boolean)
  .map(p => { const [palavra] = p.split(':'); return [palavra.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(), palavra]; }));
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'na', 'no', 'nas', 'nos', 'a', 'o', 'as', 'os', 'por']);
const SIGLAS = new Set(['ME', 'EPP', 'MEI', 'SA', 'S/A', 'S.A.', 'EIRELI-ME', 'CEP', 'CNPJ', 'LTDA-ME', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'BR', 'SP', 'RJ', 'MG', 'ES', 'PR', 'SC', 'RS', 'MS', 'MT', 'GO', 'DF', 'BA', 'SE', 'AL', 'PE', 'PB', 'RN', 'CE', 'PI', 'MA', 'PA', 'AP', 'AM', 'RR', 'AC', 'RO', 'TO', 'KM', 'SN', 'S/N']);
function letrasNormais(texto) {
  if (!texto) return texto;
  const s = String(texto);
  if (s !== s.toUpperCase()) return s; // já está em letras normais
  const palavras = s.split(' ');
  return palavras.map((pal, i) => {
    if (!pal) return pal;
    // separa partes ligadas por "/" ou "-" (ex.: GUARULHOS/SP, SANTA-CRUZ)
    return pal.split(/([\/-])/).map((parte, j, arr) => {
      if (parte === '/' || parte === '-' || !parte) return parte;
      const limpo = parte.replace(/[.,;:()]/g, '');
      const sinais = parte.match(/^([("]*)(.*?)([.,;:)"]*)$/);
      const [, antes, miolo, depois] = sinais;
      if (SIGLAS.has(limpo) && (limpo.length > 2 || j > 0 || i > 0)) return parte; // siglas e estados ficam em maiúsculo
      if (/^\d/.test(miolo)) return parte; // números (1º, 10A)
      if (!/[AEIOUÁÉÍÓÚÂÊÔÃÕ]/.test(miolo) && miolo.length <= 3 && miolo.length > 1) return parte; // abreviações sem vogal (ex.: JK)
      const baixo = miolo.toLowerCase();
      if (i > 0 && j === 0 && arr.length === 1 && MINUSCULAS.has(baixo) && i < palavras.length - 1) return antes + baixo + depois;
      const comAcento = ACENTOS[miolo];
      return antes + (comAcento || miolo.charAt(0) + miolo.slice(1).toLowerCase()) + depois;
    }).join('');
  }).join(' ');
}

class NaoEncontrado extends Error {}
async function buscarJson(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'SistemaNoGrau/1.0' }, signal: AbortSignal.timeout(8000) });
  if (r.status === 404) throw new NaoEncontrado();
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
const PROVEDORES = [
  async cnpj => { const j = await buscarJson(URL_BRASILAPI + cnpj);
    return { razao_social: j.razao_social, nome_fantasia: j.nome_fantasia, situacao: j.descricao_situacao_cadastral,
      telefone: fmtTel(j.ddd_telefone_1), email: j.email ? String(j.email).toLowerCase() : null,
      endereco: montarEndereco({ tipo: j.descricao_tipo_de_logradouro, logradouro: j.logradouro, numero: j.numero, complemento: j.complemento, bairro: j.bairro, cidade: j.municipio, uf: j.uf, cep: j.cep }) }; },
  async cnpj => { const j = await buscarJson(URL_CNPJWS + cnpj); const e = j.estabelecimento || {};
    return { razao_social: j.razao_social, nome_fantasia: e.nome_fantasia, situacao: e.situacao_cadastral,
      telefone: fmtTel((e.ddd1 || '') + (e.telefone1 || '')), email: e.email ? String(e.email).toLowerCase() : null,
      endereco: montarEndereco({ tipo: e.tipo_logradouro, logradouro: e.logradouro, numero: e.numero, complemento: e.complemento, bairro: e.bairro, cidade: e.cidade?.nome, uf: e.estado?.sigla, cep: e.cep }) }; },
  async cnpj => { const j = await buscarJson(URL_RECEITAWS + cnpj);
    if (j.status === 'ERROR') { if (/inv[aá]lido|n[aã]o encontrad/i.test(j.message || '')) throw new NaoEncontrado(); throw new Error(j.message); }
    return { razao_social: j.nome, nome_fantasia: j.fantasia, situacao: j.situacao, telefone: fmtTel(String(j.telefone || '').split('/')[0]),
      email: j.email ? String(j.email).toLowerCase() : null,
      endereco: montarEndereco({ logradouro: j.logradouro, numero: j.numero, complemento: j.complemento, bairro: j.bairro, cidade: j.municipio, uf: j.uf, cep: j.cep }) }; },
];
rota('GET', '/api/cnpj/:cnpj', 'logado', async ({ params }) => {
  const cnpj = String(params.cnpj).padStart(14, '0');
  exigir(validarDoc(cnpj) && cnpj.length === 14, 'CNPJ inválido. Confira os números.');
  const c = cacheCnpj.get(cnpj); if (c && c.ate > Date.now()) return c.dados;
  let semInternet = true;
  for (const prov of PROVEDORES) {
    try {
      const d = await prov(cnpj);
      if (!d.razao_social) continue;
      const dados = { cnpj: documento(cnpj), ...Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ? String(v).replace(/\s+/g, ' ').trim() || null : null])) };
      for (const k of ['razao_social', 'nome_fantasia', 'endereco', 'situacao']) dados[k] = letrasNormais(dados[k]);
      cacheCnpj.set(cnpj, { dados, ate: Date.now() + 24 * 3600e3 });
      return dados;
    } catch (e) {
      if (e instanceof NaoEncontrado) throw new Erro(404, 'CNPJ não encontrado na Receita Federal.');
      if (!/fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|timeout|aborted/i.test(e.message + (e.cause?.code || ''))) semInternet = false;
      console.error('Consulta CNPJ falhou:', e.message, e.cause?.code || '');
    }
  }
  throw new Erro(503, semInternet ? 'Sem internet para consultar o CNPJ. Preencha os dados à mão.' : 'Os serviços de consulta de CNPJ não responderam. Tente de novo em alguns minutos.');
});

// ---------- clientes e veículos ----------
rota('GET', '/api/clientes', 'logado', ({ q }) => {
  const busca = `%${String(q.q || '').trim()}%`;
  const placa = `%${String(q.q || '').replace(/[^a-z0-9]/gi, '').toUpperCase()}%`;
  return db.prepare(`SELECT c.*, (SELECT GROUP_CONCAT(COALESCE(v.placa,'') || ' ' || COALESCE(v.modelo,''), ' · ') FROM veiculos v WHERE v.cliente_id = c.id) AS veiculos,
      (SELECT MAX(o.data_ref) FROM ordens o WHERE o.cliente_id = c.id AND o.status != 'cancelado') AS ultima_visita,
      (SELECT COUNT(*) FROM ordens o WHERE o.cliente_id = c.id AND o.status != 'cancelado') AS visitas
    FROM clientes c
    WHERE c.nome LIKE ? OR c.telefone LIKE ? OR EXISTS (SELECT 1 FROM veiculos v WHERE v.cliente_id = c.id AND (REPLACE(REPLACE(UPPER(v.placa),'-',''),' ','') LIKE ? OR v.modelo LIKE ?))
    ORDER BY c.nome LIMIT ?`).all(busca, busca, placa, busca, Math.min(int(q.limite) || 200, 1000));
});

function assinaturaAtiva(clienteId) {
  const a = db.prepare(`SELECT a.*, p.nome AS plano_nome, p.lavagens_mes, p.preco FROM assinaturas a JOIN planos p ON p.id = a.plano_id
    WHERE a.cliente_id = ? AND a.ativo = 1 ORDER BY a.id DESC LIMIT 1`).get(clienteId);
  if (!a) return null;
  const mes = hoje().slice(0, 7);
  a.usadas_mes = db.prepare("SELECT COUNT(*) n FROM ordens WHERE assinatura_id = ? AND usa_plano = 1 AND status != 'cancelado' AND substr(data_ref,1,7) = ?").get(a.id, mes).n;
  a.pago_mes = db.prepare('SELECT COALESCE(SUM(valor),0) s FROM pagamentos WHERE assinatura_id = ? AND substr(data,1,7) = ?').get(a.id, mes).s;
  return a;
}

rota('GET', '/api/clientes/:id', 'logado', ({ params }) => {
  const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(params.id);
  if (!c) throw new Erro(404, 'Cliente não encontrado');
  c.veiculos = db.prepare(`SELECT v.*, ${SQL_EXTRA_VEICULO('v.id')} FROM veiculos v WHERE v.cliente_id = ? ORDER BY v.id`).all(params.id);
  c.ordens = db.prepare(`SELECT o.id, o.data_ref, o.status, o.total, v.placa, v.modelo,
      (SELECT GROUP_CONCAT(descricao, ', ') FROM ordem_itens WHERE ordem_id = o.id) AS servicos
    FROM ordens o LEFT JOIN veiculos v ON v.id = o.veiculo_id WHERE o.cliente_id = ? ORDER BY o.data_ref DESC LIMIT 100`).all(params.id);
  c.assinatura = assinaturaAtiva(params.id);
  return c;
});

function salvarCliente(corpo, id) {
  exigir(txt(corpo.nome), 'Informe o nome do cliente');
  const v = [txt(corpo.nome), txt(corpo.telefone), txt(corpo.email), documento(corpo.documento), txt(corpo.obs), nascimento(corpo.nascimento), txt(corpo.endereco)];
  if (id) { db.prepare('UPDATE clientes SET nome=?, telefone=?, email=?, documento=?, obs=?, nascimento=?, endereco=? WHERE id=?').run(...v, id); return id; }
  return Number(db.prepare('INSERT INTO clientes (nome, telefone, email, documento, obs, nascimento, endereco) VALUES (?,?,?,?,?,?,?)').run(...v).lastInsertRowid);
}
const PORTES = ['pequeno', 'medio', 'grande', 'moto'];
function salvarVeiculo(corpo, clienteId, id) {
  const placa = txt(corpo.placa) ? txt(corpo.placa).toUpperCase().replace(/\s/g, '') : null;
  const v = [placa, txt(corpo.modelo), txt(corpo.cor), PORTES.includes(corpo.porte) ? corpo.porte : 'medio'];
  if (id) { db.prepare('UPDATE veiculos SET placa=?, modelo=?, cor=?, porte=? WHERE id=?').run(...v, id); return id; }
  return Number(db.prepare('INSERT INTO veiculos (placa, modelo, cor, porte, cliente_id) VALUES (?,?,?,?,?)').run(...v, clienteId).lastInsertRowid);
}

rota('POST', '/api/clientes', 'logado', ({ corpo }) => transacao(() => {
  const id = salvarCliente(corpo);
  const veiculos = (corpo.veiculos || []).filter(v => v.placa || v.modelo).map(v => salvarVeiculo(v, id));
  return { id, veiculos };
}));
rota('PUT', '/api/clientes/:id', 'logado', ({ corpo, params }) => { salvarCliente(corpo, params.id); return { ok: true }; });
rota('DELETE', '/api/clientes/:id', 'dono', ({ params }) => {
  const fotos = db.prepare('SELECT f.arquivo FROM fotos f JOIN veiculos v ON v.id = f.veiculo_id WHERE v.cliente_id = ?').all(params.id);
  db.prepare('DELETE FROM clientes WHERE id = ?').run(params.id); apagarArquivos(fotos); return { ok: true };
});
rota('POST', '/api/clientes/:id/veiculos', 'logado', ({ corpo, params }) => ({ id: salvarVeiculo(corpo, params.id) }));
rota('PUT', '/api/veiculos/:id', 'logado', ({ corpo, params }) => { salvarVeiculo(corpo, null, params.id); return { ok: true }; });
rota('DELETE', '/api/veiculos/:id', 'dono', ({ params }) => {
  const fotos = db.prepare('SELECT arquivo FROM fotos WHERE veiculo_id = ?').all(params.id);
  db.prepare('DELETE FROM veiculos WHERE id = ?').run(params.id); apagarArquivos(fotos); return { ok: true };
});

// ---------- veículo: página, fotos, avarias e observações ----------
function apagarArquivos(lista) { for (const f of lista) fs.unlink(path.join(FOTOS_DIR, f.arquivo), () => {}); }
const fotosLista = (where, ...args) => db.prepare(`SELECT f.id, f.tipo, f.avaria_id, f.largura, f.altura, f.criado_em, u.nome AS usuario_nome
  FROM fotos f LEFT JOIN usuarios u ON u.id = f.usuario_id WHERE ${where} ORDER BY f.id`).all(...args);

rota('GET', '/api/veiculos/:id', 'logado', ({ params }) => {
  const v = db.prepare(`SELECT v.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone FROM veiculos v LEFT JOIN clientes c ON c.id = v.cliente_id WHERE v.id = ?`).get(params.id);
  if (!v) throw new Erro(404, 'Veículo não encontrado');
  const fotos = fotosLista('f.veiculo_id = ?', params.id);
  v.fotos = fotos.filter(f => f.tipo === 'veiculo');
  v.fotos_obs = fotos.filter(f => f.tipo === 'obs');
  v.avarias = db.prepare(`SELECT a.*, u.nome AS usuario_nome FROM avarias a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE a.veiculo_id = ? ORDER BY a.resolvida, a.id DESC`).all(params.id)
    .map(a => ({ ...a, fotos: fotos.filter(f => f.avaria_id === a.id) }));
  v.ordens = db.prepare(`SELECT o.id, o.data_ref, o.status, o.total, (SELECT GROUP_CONCAT(descricao, ', ') FROM ordem_itens WHERE ordem_id = o.id) AS servicos
    FROM ordens o WHERE o.veiculo_id = ? ORDER BY o.data_ref DESC LIMIT 50`).all(params.id);
  return v;
});
rota('PUT', '/api/veiculos/:id/obs', 'logado', ({ params, corpo }) => { db.prepare('UPDATE veiculos SET obs = ? WHERE id = ?').run(txt(corpo.obs), params.id); return { ok: true }; });

function salvarAvaria(corpo, veiculoId, usuario, id) {
  exigir(txt(corpo.local) && txt(corpo.tipo), 'Informe o local e o tipo da avaria');
  if (id) { db.prepare('UPDATE avarias SET local=?, tipo=?, descricao=?, resolvida=? WHERE id=?').run(txt(corpo.local), txt(corpo.tipo), txt(corpo.descricao), corpo.resolvida ? 1 : 0, id); return { id }; }
  return { id: Number(db.prepare('INSERT INTO avarias (veiculo_id, local, tipo, descricao, usuario_id) VALUES (?,?,?,?,?)').run(veiculoId, txt(corpo.local), txt(corpo.tipo), txt(corpo.descricao), usuario.id).lastInsertRowid) };
}
rota('POST', '/api/veiculos/:id/avarias', 'logado', ({ params, corpo, usuario }) => {
  exigir(db.prepare('SELECT 1 FROM veiculos WHERE id = ?').get(params.id), 'Veículo não encontrado');
  return salvarAvaria(corpo, params.id, usuario);
});
rota('PUT', '/api/avarias/:id', 'logado', ({ params, corpo, usuario }) => {
  const a = db.prepare('SELECT * FROM avarias WHERE id = ?').get(params.id); if (!a) throw new Erro(404, 'Avaria não encontrada');
  if (usuario.papel !== 'dono' && (corpo.resolvida ? 1 : 0) !== a.resolvida) throw new Erro(403, 'Só o dono pode marcar avaria como resolvida');
  return salvarAvaria(corpo, a.veiculo_id, usuario, params.id);
});
rota('DELETE', '/api/avarias/:id', 'dono', ({ params }) => {
  const fotos = db.prepare('SELECT arquivo FROM fotos WHERE avaria_id = ?').all(params.id);
  db.prepare('DELETE FROM avarias WHERE id = ?').run(params.id); apagarArquivos(fotos); return { ok: true };
});

rota('POST', '/api/veiculos/:id/fotos', 'logado', ({ params, q, corpo, usuario }) => {
  exigir(Buffer.isBuffer(corpo) && corpo.length, 'Envie a foto');
  const info = infoJpeg(corpo); exigir(info, 'A foto precisa estar em JPEG');
  exigir(db.prepare('SELECT 1 FROM veiculos WHERE id = ?').get(params.id), 'Veículo não encontrado');
  const tipo = ['veiculo', 'avaria', 'obs'].includes(q.tipo) ? q.tipo : 'veiculo';
  let avariaId = null;
  if (tipo === 'avaria') { avariaId = int(q.avaria_id); exigir(db.prepare('SELECT 1 FROM avarias WHERE id = ? AND veiculo_id = ?').get(avariaId, params.id), 'Avaria não encontrada'); }
  const pasta = hoje().slice(0, 7);
  const arquivo = `${pasta}/${params.id}-${crypto.randomBytes(8).toString('hex')}.jpg`;
  fs.mkdirSync(path.join(FOTOS_DIR, pasta), { recursive: true });
  fs.writeFileSync(path.join(FOTOS_DIR, arquivo), corpo);
  const r = db.prepare('INSERT INTO fotos (veiculo_id, tipo, avaria_id, arquivo, largura, altura, usuario_id) VALUES (?,?,?,?,?,?,?)')
    .run(params.id, tipo, avariaId, arquivo, info.largura, info.altura, usuario.id);
  return { id: Number(r.lastInsertRowid) };
});
rota('GET', '/api/fotos/:id', 'logado', ({ params, res }) => {
  const f = db.prepare('SELECT arquivo FROM fotos WHERE id = ?').get(params.id);
  const arq = f && path.join(FOTOS_DIR, f.arquivo);
  if (!arq || !fs.existsSync(arq)) throw new Erro(404, 'Foto não encontrada');
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=31536000, immutable' });
  fs.createReadStream(arq).pipe(res);
});
rota('DELETE', '/api/fotos/:id', 'dono', ({ params }) => {
  const f = db.prepare('SELECT arquivo FROM fotos WHERE id = ?').get(params.id); if (!f) throw new Erro(404, 'Foto não encontrada');
  db.prepare('DELETE FROM fotos WHERE id = ?').run(params.id); apagarArquivos([f]); return { ok: true };
});

// ---------- ordens de serviço ----------
const SQL_EXTRA_VEICULO = col => `(SELECT id FROM fotos WHERE veiculo_id = ${col} AND tipo = 'veiculo' ORDER BY id LIMIT 1) AS foto_id,
  (SELECT COUNT(*) FROM avarias WHERE veiculo_id = ${col} AND resolvida = 0) AS avarias_abertas`;
const STATUS = ['agendado', 'aguardando', 'lavando', 'pronto', 'entregue', 'cancelado'];
const SQL_ORDEM = `SELECT o.*, c.nome AS cliente_nome, c.telefone AS cliente_telefone, c.documento AS cliente_documento, c.email AS cliente_email, c.endereco AS cliente_endereco, v.placa, v.modelo, v.cor, v.porte,
    u.nome AS funcionario_nome, ${SQL_EXTRA_VEICULO('o.veiculo_id')},
    (SELECT GROUP_CONCAT(descricao, ', ') FROM ordem_itens WHERE ordem_id = o.id) AS servicos,
    (SELECT COALESCE(SUM(valor),0) FROM pagamentos WHERE ordem_id = o.id) AS pago
  FROM ordens o LEFT JOIN clientes c ON c.id = o.cliente_id LEFT JOIN veiculos v ON v.id = o.veiculo_id LEFT JOIN usuarios u ON u.id = o.funcionario_id`;

rota('GET', '/api/ordens', 'logado', ({ q }) => {
  const cond = []; const vals = [];
  if (dataOk(q.de)) { cond.push('substr(o.data_ref,1,10) >= ?'); vals.push(q.de.slice(0, 10)); }
  if (dataOk(q.ate)) { cond.push('substr(o.data_ref,1,10) <= ?'); vals.push(q.ate.slice(0, 10)); }
  if (q.status) { const st = q.status.split(',').filter(s => STATUS.includes(s)); if (st.length) cond.push(`o.status IN (${st.map(() => '?').join(',')})`), vals.push(...st); }
  if (q.abertas) cond.push("o.status IN ('aguardando','lavando','pronto')");
  if (q.q) { cond.push("(c.nome LIKE ? OR v.placa LIKE ? OR v.modelo LIKE ? OR CAST(o.id AS TEXT) = ?)"); const b = `%${q.q}%`; vals.push(b, `%${q.q.toUpperCase().replace(/[\s-]/g, '')}%`, b, q.q.replace('#', '')); }
  const where = cond.length ? 'WHERE ' + cond.join(' AND ') : '';
  return db.prepare(`${SQL_ORDEM} ${where} ORDER BY o.data_ref ${q.ordem === 'asc' ? 'ASC' : 'DESC'} LIMIT ?`).all(...vals, Math.min(int(q.limite) || 300, 2000));
});

rota('GET', '/api/ordens/:id', 'logado', ({ params }) => {
  const o = db.prepare(`${SQL_ORDEM} WHERE o.id = ?`).get(params.id);
  if (!o) throw new Erro(404, 'Ordem não encontrada');
  o.itens = db.prepare('SELECT * FROM ordem_itens WHERE ordem_id = ? ORDER BY id').all(params.id);
  o.pagamentos = db.prepare('SELECT p.*, u.nome AS usuario_nome FROM pagamentos p LEFT JOIN usuarios u ON u.id = p.usuario_id WHERE ordem_id = ? ORDER BY p.data').all(params.id);
  return o;
});

// ---------- OS em PDF ----------
const reaisPdf = c => 'R$ ' + (Number(c || 0) / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dataBR = s => s ? s.slice(0, 10).split('-').reverse().join('/') + (s.length > 10 ? ' ' + s.slice(11, 16) : '') : '';
const NOME_STATUS = { agendado: 'Agendado', aguardando: 'Aguardando', lavando: 'Em lavagem', pronto: 'Pronto', entregue: 'Entregue', cancelado: 'Cancelado' };
const NOME_FORMA = { dinheiro: 'Dinheiro', pix: 'Pix', debito: 'Cartão de débito', credito: 'Cartão de crédito', outro: 'Outro' };
const NOME_PORTE = { pequeno: 'Pequeno', medio: 'Médio', grande: 'Grande', moto: 'Moto' };

function pdfOrdem(o, cfg) {
  const doc = new Documento({ margem: 40 });
  const M = 40, W = doc.L - 2 * M, AZUL = '#0b2545', AGUA = '#1e9bd7', SUAVE = '#637083';
  const num = String(o.id).padStart(6, '0');
  // cabeçalho
  doc.retangulo(0, 0, doc.L, 96, { preencher: AZUL });
  doc.texto(M, 24, cfg.nome_empresa || 'Lava Jato', { tam: 18, negrito: true, cor: '#ffffff' });
  const linhasEmp = [cfg.cnpj ? `CNPJ: ${cfg.cnpj}` : '', cfg.endereco, cfg.telefone ? `Tel.: ${cfg.telefone}` : ''].filter(Boolean);
  linhasEmp.forEach((l, i) => doc.texto(M, 48 + i * 13, l, { tam: 9, cor: '#cfdbec' }));
  doc.texto(M, 22, 'ORDEM DE SERVIÇO', { tam: 9, negrito: true, cor: '#8fc9ea', alinhar: 'dir', larg: W });
  doc.texto(M, 34, `Nº ${num}`, { tam: 20, negrito: true, cor: '#ffffff', alinhar: 'dir', larg: W });
  doc.texto(M, 60, `${o.status === 'agendado' ? 'Agendado para' : 'Data'}: ${dataBR(o.data_ref)}`, { tam: 9, cor: '#cfdbec', alinhar: 'dir', larg: W });
  doc.texto(M, 73, `Situação: ${NOME_STATUS[o.status] || o.status}`, { tam: 9, cor: '#cfdbec', alinhar: 'dir', larg: W });
  doc.y = 116;

  // bloco com título e pares rótulo/valor em duas colunas
  const bloco = (titulo, pares) => {
    const colW = (W - 24) / 2; const linhas = [];
    for (let i = 0; i < pares.length; i += 2) linhas.push([pares[i], pares[i + 1]]);
    const alturas = linhas.map(par => Math.max(...par.filter(Boolean).map(([, v]) => doc.quebrar(v || '—', colW, 10).length)) * 13 + 14);
    const h = 30 + alturas.reduce((a, b) => a + b, 0);
    doc.espaco(h + 12);
    doc.retangulo(M, doc.y, W, h, { borda: '#dfe5ee' });
    doc.retangulo(M, doc.y, 4, h, { preencher: AGUA });
    doc.texto(M + 14, doc.y + 10, titulo.toUpperCase(), { tam: 8.5, negrito: true, cor: SUAVE });
    let y = doc.y + 28;
    linhas.forEach((par, li) => {
      par.forEach((p, ci) => {
        if (!p) return; const x = M + 14 + ci * (colW + 4);
        doc.texto(x, y, p[0], { tam: 7.5, cor: SUAVE });
        doc.quebrar(p[1] || '—', colW - 10, 10).forEach((l, k) => doc.texto(x, y + 10 + k * 13, l, { tam: 10, negrito: ci === 0 && li === 0 }));
      });
      y += alturas[li];
    });
    doc.y += h + 12;
  };
  const docLabel = (o.cliente_documento || '').replace(/\D/g, '').length === 14 ? 'CNPJ' : 'CPF/CNPJ';
  bloco('Cliente', [
    ['Nome / Razão social', o.cliente_nome], [docLabel, o.cliente_documento],
    ['Telefone', o.cliente_telefone], ['E-mail', o.cliente_email],
    ...(o.cliente_endereco ? [['Endereço', o.cliente_endereco]] : []),
  ]);
  bloco('Veículo', [['Placa', o.placa], ['Modelo', o.modelo], ['Cor', o.cor], ['Porte', NOME_PORTE[o.porte]]]);

  // avarias já existentes no veículo (com fotos)
  if (o.avarias?.length) {
    doc.espaco(50);
    doc.texto(M, doc.y, `AVARIAS JÁ EXISTENTES NO VEÍCULO (${o.avarias.length})`, { tam: 8.5, negrito: true, cor: '#c98a04' }); doc.y += 16;
    // mapa: desenho do carro com as avarias numeradas e um resumo ao lado
    const ESC = 0.4, LARG_MAPA = 248 * ESC, ALT_MAPA = 466 * ESC;
    doc.espaco(ALT_MAPA + 16);
    const ox = M + 6 + 4 * ESC, oy = doc.y + 16 * ESC;
    const CORES_ZONA = { lataria: '#eef2f7', vidro: '#d9eaf6', roda: '#5a6371', luz: '#fff8d6', retrovisor: '#dfe5ee' };
    const comAvaria = new Set(o.avarias.map(a => a.local));
    for (const z of CARRO.ZONAS) doc.caminho(z.d, ox, oy, ESC, { preencher: comAvaria.has(z.nome) ? '#ffe39a' : CORES_ZONA[z.tipo], borda: comAvaria.has(z.nome) ? '#c98a04' : '#8a99ad', esp: comAvaria.has(z.nome) ? 0.9 : 0.5 });
    doc.texto(ox, oy - 14 * ESC, 'FRENTE', { tam: 6, negrito: true, cor: SUAVE, alinhar: 'centro', larg: 240 * ESC });
    doc.texto(ox, oy + 426 * ESC, 'ESQ.            TRASEIRA            DIR.', { tam: 5.5, negrito: true, cor: SUAVE, alinhar: 'centro', larg: 240 * ESC });
    const porZona = {};
    o.avarias.forEach((a, i) => { const z = CARRO.ZONAS.find(z => z.nome === a.local); if (z) (porZona[z.nome] = porZona[z.nome] || { z, nums: [] }).nums.push(i + 1); });
    for (const { z, nums } of Object.values(porZona)) nums.forEach((n, k) => {
      const x = ox + z.cx * ESC + (k - (nums.length - 1) / 2) * 13, y = oy + z.cy * ESC, r = 6;
      doc.circulo(x, y, r, { preencher: '#c98a04', borda: '#ffffff', esp: 0.8 });
      doc.texto(x - r, y - 3.2, String(n), { tam: 7, negrito: true, cor: '#ffffff', alinhar: 'centro', larg: 2 * r });
    });
    // resumo numerado ao lado do desenho
    const rx = M + LARG_MAPA + 24, rw = W - LARG_MAPA - 24; let ry = doc.y + 4;
    o.avarias.forEach((a, i) => {
      if (ry > doc.y + ALT_MAPA - 14) return;
      doc.circulo(rx + 6, ry + 5, 6, { preencher: '#c98a04' });
      doc.texto(rx, ry + 1.8, String(i + 1), { tam: 7, negrito: true, cor: '#ffffff', alinhar: 'centro', larg: 12 });
      const linhas = doc.quebrar(`${a.local} — ${a.tipo}${CARRO.ZONAS.some(z => z.nome === a.local) ? '' : ' (não aparece no desenho)'}`, rw - 20, 9);
      linhas.forEach((l, k) => doc.texto(rx + 18, ry + k * 11, l, { tam: 9 }));
      ry += linhas.length * 11 + 6;
    });
    doc.y += ALT_MAPA + 12;
    const TW = 120, TH = 90, GAP = 8, porLinha = Math.floor((W + GAP) / (TW + GAP));
    o.avarias.forEach((a, n) => {
      const desc = doc.quebrar(a.descricao || '', W - 20, 9);
      const linhasFotos = Math.ceil(a.fotos.length / porLinha);
      doc.espaco(18 + (a.descricao ? desc.length * 12 : 0) + Math.min(linhasFotos, 1) * (TH + GAP));
      doc.texto(M, doc.y, `${n + 1}. ${a.local} — ${a.tipo}`, { tam: 10, negrito: true });
      doc.texto(M, doc.y, `registrada em ${dataBR(a.registrado_em).slice(0, 10)}`, { tam: 8, cor: SUAVE, alinhar: 'dir', larg: W });
      doc.y += 14;
      if (a.descricao) { desc.forEach(l => { doc.texto(M + 12, doc.y, l, { tam: 9, cor: SUAVE }); doc.y += 12; }); }
      a.fotos.forEach((buf, i) => {
        const col = i % porLinha;
        if (col === 0) { if (i > 0) doc.y += TH + GAP; if (doc.espaco(TH + GAP)) {} }
        const x = M + 12 + col * (TW + GAP);
        doc.retangulo(x, doc.y + 2, TW, TH, { preencher: '#f0f3f7' });
        const t = doc.imagem(buf, x, doc.y + 2, TW, TH);
        if (t) { doc.retangulo(x, doc.y + 2, TW, TH, { borda: '#dfe5ee' }); }
      });
      if (a.fotos.length) doc.y += TH + GAP + 4;
      doc.y += 6;
    });
    doc.texto(M, doc.y, 'O cliente declara estar ciente das avarias acima, já existentes antes do serviço.', { tam: 8.5, cor: SUAVE }); doc.y += 20;
  }

  // tabela de serviços
  doc.espaco(60);
  const colValor = 110;
  const cabTabela = () => {
    doc.retangulo(M, doc.y, W, 22, { preencher: '#eef2f7' });
    doc.texto(M + 10, doc.y + 7, 'SERVIÇO', { tam: 8.5, negrito: true, cor: SUAVE });
    doc.texto(M, doc.y + 7, 'VALOR', { tam: 8.5, negrito: true, cor: SUAVE, alinhar: 'dir', larg: W - 10 });
    doc.y += 22;
  };
  cabTabela();
  o.itens.forEach((it, i) => {
    const ls = doc.quebrar(it.descricao, W - colValor - 20, 10); const h = ls.length * 13 + 10;
    if (doc.espaco(h)) cabTabela();
    ls.forEach((l, k) => doc.texto(M + 10, doc.y + 6 + k * 13, l, { tam: 10 }));
    doc.texto(M, doc.y + 6, reaisPdf(it.valor), { tam: 10, alinhar: 'dir', larg: W - 10 });
    doc.y += h; doc.linha(M, doc.y, M + W, doc.y);
  });
  // totais
  doc.espaco(90); doc.y += 8;
  const linhaTotal = (rot, val, opc = {}) => {
    doc.texto(M, doc.y, rot, { tam: opc.tam || 10, negrito: opc.negrito, cor: opc.cor || SUAVE, alinhar: 'dir', larg: W - colValor - 10 });
    doc.texto(M, doc.y, val, { tam: opc.tam || 10, negrito: opc.negrito, cor: opc.cor, alinhar: 'dir', larg: W - 10 });
    doc.y += (opc.tam || 10) + 6;
  };
  linhaTotal('Subtotal', reaisPdf(o.subtotal));
  if (o.desconto) linhaTotal(o.usa_plano ? 'Coberto pelo plano mensal' : 'Desconto', '- ' + reaisPdf(o.desconto));
  doc.y += 2; doc.retangulo(M + W - 250, doc.y, 250, 30, { preencher: AZUL });
  doc.texto(M + W - 240, doc.y + 9, 'TOTAL', { tam: 11, negrito: true, cor: '#ffffff' });
  doc.texto(M, doc.y + 7, reaisPdf(o.total), { tam: 15, negrito: true, cor: '#ffffff', alinhar: 'dir', larg: W - 10 });
  doc.y += 44;

  // pagamentos
  if (o.pagamentos.length || o.total > 0) {
    doc.espaco(30 + o.pagamentos.length * 15);
    doc.texto(M, doc.y, 'PAGAMENTO', { tam: 8.5, negrito: true, cor: SUAVE }); doc.y += 16;
    o.pagamentos.forEach(p => { doc.texto(M, doc.y, `${dataBR(p.data)} · ${NOME_FORMA[p.forma] || p.forma}`, { tam: 10 }); doc.texto(M, doc.y, reaisPdf(p.valor), { tam: 10, alinhar: 'dir', larg: W - 10 }); doc.y += 15; });
    const falta = o.total - o.pago;
    doc.texto(M, doc.y, falta > 0 ? `Saldo a pagar: ${reaisPdf(falta)}` : 'Pago integralmente', { tam: 10, negrito: true, cor: falta > 0 ? '#d64545' : '#1f9d55' });
    doc.y += 22;
  }
  // observações e termos
  const paragrafo = (titulo, texto, tam = 10) => {
    const ls = doc.quebrar(texto, W - 20, tam); doc.espaco(24 + ls.length * (tam + 3));
    doc.texto(M, doc.y, titulo, { tam: 8.5, negrito: true, cor: SUAVE }); doc.y += 15;
    ls.forEach(l => { doc.texto(M, doc.y, l, { tam, cor: tam < 10 ? SUAVE : undefined }); doc.y += tam + 3; }); doc.y += 10;
  };
  if (o.obs) paragrafo('OBSERVAÇÕES', o.obs);
  if (o.funcionario_nome) paragrafo('RESPONSÁVEL PELO SERVIÇO', o.funcionario_nome);
  if (cfg.termos_os) paragrafo('CONDIÇÕES', cfg.termos_os, 8.5);

  // assinaturas
  doc.espaco(70); doc.y += 30;
  const aw = (W - 40) / 2;
  [[M, cfg.nome_empresa || 'Lava jato'], [M + aw + 40, o.cliente_nome || 'Cliente']].forEach(([x, nome]) => {
    doc.linha(x, doc.y, x + aw, doc.y, { cor: '#1b2533', esp: 0.6 });
    doc.texto(x, doc.y + 6, nome, { tam: 9, alinhar: 'centro', larg: aw });
    doc.texto(x, doc.y + 18, x === M ? 'Responsável' : 'Cliente', { tam: 8, cor: SUAVE, alinhar: 'centro', larg: aw });
  });
  doc.texto(M, doc.A - 28, `Emitido em ${dataBR(agora())}`, { tam: 8, cor: '#8a96a8' });
  return doc.gerar(`OS ${num} - ${cfg.nome_empresa || ''}`);
}

rota('GET', '/api/ordens/:id/pdf', 'logado', ({ params, q, res }) => {
  const o = db.prepare(`${SQL_ORDEM} WHERE o.id = ?`).get(params.id);
  if (!o) throw new Erro(404, 'Ordem não encontrada');
  o.itens = db.prepare('SELECT * FROM ordem_itens WHERE ordem_id = ? ORDER BY id').all(params.id);
  o.pagamentos = db.prepare('SELECT * FROM pagamentos WHERE ordem_id = ? ORDER BY data').all(params.id);
  o.avarias = o.veiculo_id ? db.prepare('SELECT * FROM avarias WHERE veiculo_id = ? AND resolvida = 0 ORDER BY id').all(o.veiculo_id).map(a => ({
    ...a, fotos: db.prepare("SELECT arquivo FROM fotos WHERE avaria_id = ? ORDER BY id LIMIT 8").all(a.id)
      .map(f => { try { return fs.readFileSync(path.join(FOTOS_DIR, f.arquivo)); } catch { return null; } }).filter(Boolean),
  })) : [];
  const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
  const pdf = pdfOrdem(o, cfg);
  const nome = `OS-${String(o.id).padStart(6, '0')}${o.placa ? '-' + o.placa : ''}.pdf`;
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': pdf.length, 'Cache-Control': 'no-store',
    'Content-Disposition': `${q.baixar ? 'attachment' : 'inline'}; filename="${nome}"` });
  res.end(pdf);
});

function salvarOrdem(corpo, usuario, id) {
  return transacao(() => {
    let clienteId = int(corpo.cliente_id) || null;
    let veiculoId = int(corpo.veiculo_id) || null;
    // cadastro rápido de cliente/veículo direto na OS
    if (!clienteId && corpo.novo_cliente && txt(corpo.novo_cliente.nome)) clienteId = salvarCliente(corpo.novo_cliente);
    if (clienteId && !veiculoId && corpo.novo_veiculo && (txt(corpo.novo_veiculo.placa) || txt(corpo.novo_veiculo.modelo))) veiculoId = salvarVeiculo(corpo.novo_veiculo, clienteId);
    exigir(clienteId || veiculoId, 'Informe o cliente ou o veículo');

    const itens = (corpo.itens || []).filter(i => txt(i.descricao)).map(i => ({ servico_id: int(i.servico_id) || null, descricao: txt(i.descricao), valor: Math.max(0, int(i.valor)) }));
    exigir(itens.length, 'Adicione pelo menos um serviço');
    const subtotal = itens.reduce((s, i) => s + i.valor, 0);

    let usaPlano = corpo.usa_plano ? 1 : 0; let assinaturaId = null;
    if (usaPlano) {
      const a = clienteId && assinaturaAtiva(clienteId);
      exigir(a, 'Esse cliente não tem plano ativo');
      assinaturaId = a.id;
    }
    const desconto = usaPlano ? subtotal : Math.min(subtotal, Math.max(0, int(corpo.desconto)));
    const total = subtotal - desconto;
    let status = STATUS.includes(corpo.status) ? corpo.status : 'aguardando';
    const dataRef = dataOk(corpo.data_ref) ? String(corpo.data_ref).replace('T', ' ').slice(0, 16) : agora().slice(0, 16);
    const v = [clienteId, veiculoId, int(corpo.funcionario_id) || null, dataRef, subtotal, desconto, total, usaPlano, assinaturaId, txt(corpo.obs)];

    if (id) {
      const atual = db.prepare('SELECT * FROM ordens WHERE id = ?').get(id);
      if (!atual) throw new Erro(404, 'Ordem não encontrada');
      db.prepare('UPDATE ordens SET cliente_id=?, veiculo_id=?, funcionario_id=?, data_ref=?, subtotal=?, desconto=?, total=?, usa_plano=?, assinatura_id=?, obs=? WHERE id=?').run(...v, id);
      db.prepare('DELETE FROM ordem_itens WHERE ordem_id = ?').run(id);
    } else {
      id = Number(db.prepare('INSERT INTO ordens (cliente_id, veiculo_id, funcionario_id, data_ref, subtotal, desconto, total, usa_plano, assinatura_id, obs, status, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(...v, status, usuario.id).lastInsertRowid);
    }
    const insItem = db.prepare('INSERT INTO ordem_itens (ordem_id, servico_id, descricao, valor) VALUES (?,?,?,?)');
    for (const i of itens) insItem.run(id, i.servico_id, i.descricao, i.valor);
    return { id };
  });
}
rota('POST', '/api/ordens', 'logado', ({ corpo, usuario }) => salvarOrdem(corpo, usuario));
rota('PUT', '/api/ordens/:id', 'logado', ({ corpo, usuario, params }) => salvarOrdem(corpo, usuario, params.id));

rota('PUT', '/api/ordens/:id/status', 'logado', ({ corpo, params, usuario }) => {
  exigir(STATUS.includes(corpo.status), 'Status inválido');
  const o = db.prepare('SELECT * FROM ordens WHERE id = ?').get(params.id);
  if (!o) throw new Erro(404, 'Ordem não encontrada');
  if (o.status === 'entregue' && usuario.papel !== 'dono') throw new Erro(403, 'Só o dono pode alterar uma ordem já entregue');
  const campos = { lavando: 'inicio_em', pronto: 'pronto_em', entregue: 'entregue_em' };
  const extra = campos[corpo.status] ? `, ${campos[corpo.status]} = COALESCE(${campos[corpo.status]}, ?)` : '';
  const args = [corpo.status]; if (extra) args.push(agora());
  // se a lavagem começou e ninguém foi definido, o responsável é quem iniciou
  const func = corpo.status === 'lavando' && !o.funcionario_id ? ', funcionario_id = ?' : '';
  if (func) args.push(usuario.id);
  transacao(() => {
    db.prepare(`UPDATE ordens SET status = ?${extra}${func} WHERE id = ?`).run(...args, params.id);
    if (['pronto', 'entregue'].includes(corpo.status) && !o.estoque_baixado) baixarEstoqueDaOrdem(params.id, usuario.id);
    if (corpo.status === 'cancelado' && o.estoque_baixado) estornarEstoqueDaOrdem(params.id, usuario.id);
  });
  return { ok: true };
});
rota('DELETE', '/api/ordens/:id', 'dono', ({ params }) => { db.prepare('DELETE FROM ordens WHERE id = ?').run(params.id); return { ok: true }; });

// ---------- pagamentos ----------
const FORMAS = ['dinheiro', 'pix', 'debito', 'credito', 'outro'];
rota('POST', '/api/pagamentos', 'logado', ({ corpo, usuario }) => {
  exigir(FORMAS.includes(corpo.forma), 'Forma de pagamento inválida');
  const valor = int(corpo.valor); exigir(valor > 0, 'Valor inválido');
  const ordemId = int(corpo.ordem_id) || null; const assinaturaId = int(corpo.assinatura_id) || null;
  exigir(ordemId || assinaturaId || txt(corpo.descricao), 'Informe a que se refere o pagamento');
  const r = db.prepare('INSERT INTO pagamentos (ordem_id, assinatura_id, descricao, valor, forma, data, usuario_id) VALUES (?,?,?,?,?,?,?)')
    .run(ordemId, assinaturaId, txt(corpo.descricao), valor, corpo.forma, agora(), usuario.id);
  return { id: Number(r.lastInsertRowid) };
});
rota('DELETE', '/api/pagamentos/:id', 'dono', ({ params }) => { db.prepare('DELETE FROM pagamentos WHERE id = ?').run(params.id); return { ok: true }; });

// ---------- despesas ----------
rota('GET', '/api/despesas', 'dono', ({ q }) => {
  const de = dataOk(q.de) ? q.de.slice(0, 10) : hoje().slice(0, 8) + '01'; const ate = dataOk(q.ate) ? q.ate.slice(0, 10) : hoje();
  return db.prepare('SELECT d.*, u.nome AS usuario_nome FROM despesas d LEFT JOIN usuarios u ON u.id = d.usuario_id WHERE d.data BETWEEN ? AND ? ORDER BY d.data DESC, d.id DESC').all(de, ate);
});
rota('POST', '/api/despesas', 'dono', ({ corpo, usuario }) => {
  exigir(txt(corpo.descricao), 'Informe a descrição'); const valor = int(corpo.valor); exigir(valor > 0, 'Valor inválido');
  const r = db.prepare('INSERT INTO despesas (descricao, categoria, valor, data, usuario_id) VALUES (?,?,?,?,?)')
    .run(txt(corpo.descricao), txt(corpo.categoria), valor, dataOk(corpo.data) ? corpo.data.slice(0, 10) : hoje(), usuario.id);
  return { id: Number(r.lastInsertRowid) };
});
rota('DELETE', '/api/despesas/:id', 'dono', ({ params }) => { db.prepare('DELETE FROM despesas WHERE id = ?').run(params.id); return { ok: true }; });

// ---------- estoque ----------
const UNIDADES = ['un', 'L', 'ml', 'kg', 'g', 'cx', 'par'];
const qtd = v => Math.round(Number(v) * 1000) / 1000;
const fmtQtd = (v, u) => `${qtd(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${u}`;
const sqlProduto = `SELECT p.*, (SELECT GROUP_CONCAT(s.nome || ' (' || sp.quantidade || ')', ', ') FROM servico_produtos sp JOIN servicos s ON s.id = sp.servico_id WHERE sp.produto_id = p.id) AS usado_em FROM produtos p`;

// registra um movimento e atualiza a quantidade do produto
function movimentar(produtoId, tipo, delta, extra = {}) {
  const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(produtoId);
  if (!p) throw new Erro(404, 'Produto não encontrado');
  const saldo = qtd(p.quantidade + delta);
  db.prepare('UPDATE produtos SET quantidade = ? WHERE id = ?').run(saldo, produtoId);
  db.prepare('INSERT INTO estoque_mov (produto_id, tipo, quantidade, saldo, custo_unit, valor, ordem_id, obs, data, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(produtoId, tipo, qtd(delta), saldo, extra.custo_unit ?? p.custo, extra.valor ?? null, extra.ordem_id ?? null, extra.obs ?? null, extra.data || agora(), extra.usuario_id ?? null);
  return { produto: p, saldo };
}
// quando o carro fica pronto, desconta os produtos que cada serviço usa
function baixarEstoqueDaOrdem(ordemId, usuarioId) {
  const usos = db.prepare(`SELECT sp.produto_id, SUM(sp.quantidade) AS q FROM ordem_itens i JOIN servico_produtos sp ON sp.servico_id = i.servico_id
    JOIN produtos p ON p.id = sp.produto_id WHERE i.ordem_id = ? AND p.ativo = 1 GROUP BY sp.produto_id`).all(ordemId);
  for (const u of usos) movimentar(u.produto_id, 'consumo', -u.q, { ordem_id: ordemId, usuario_id: usuarioId });
  db.prepare('UPDATE ordens SET estoque_baixado = 1 WHERE id = ?').run(ordemId);
}
// OS cancelada depois da baixa: devolve os produtos
function estornarEstoqueDaOrdem(ordemId, usuarioId) {
  const usos = db.prepare("SELECT produto_id, SUM(quantidade) AS q FROM estoque_mov WHERE ordem_id = ? AND tipo IN ('consumo','estorno') GROUP BY produto_id").all(ordemId);
  for (const u of usos) if (qtd(u.q) !== 0) movimentar(u.produto_id, 'estorno', -u.q, { ordem_id: ordemId, usuario_id: usuarioId, obs: 'OS cancelada' });
  db.prepare('UPDATE ordens SET estoque_baixado = 0 WHERE id = ?').run(ordemId);
}

rota('GET', '/api/produtos', 'logado', ({ q, usuario }) => {
  const lista = db.prepare(`${sqlProduto} ${q.todos ? '' : 'WHERE p.ativo = 1'} ORDER BY p.ativo DESC, p.categoria, p.nome`).all();
  if (usuario.papel !== 'dono') for (const p of lista) delete p.custo;
  return lista;
});
rota('GET', '/api/produtos/:id', 'logado', ({ params, usuario }) => {
  const p = db.prepare(`${sqlProduto} WHERE p.id = ?`).get(params.id);
  if (!p) throw new Erro(404, 'Produto não encontrado');
  p.movimentos = db.prepare(`SELECT m.*, u.nome AS usuario_nome, v.placa FROM estoque_mov m LEFT JOIN usuarios u ON u.id = m.usuario_id
    LEFT JOIN ordens o ON o.id = m.ordem_id LEFT JOIN veiculos v ON v.id = o.veiculo_id WHERE m.produto_id = ? ORDER BY m.data DESC, m.id DESC LIMIT 200`).all(params.id);
  p.servicos = db.prepare('SELECT s.id, s.nome, sp.quantidade FROM servico_produtos sp JOIN servicos s ON s.id = sp.servico_id WHERE sp.produto_id = ? ORDER BY s.nome').all(params.id);
  const mes = hoje().slice(0, 7);
  p.consumo_mes = -db.prepare("SELECT COALESCE(SUM(quantidade),0) s FROM estoque_mov WHERE produto_id = ? AND tipo IN ('consumo','estorno','uso','venda') AND substr(data,1,7) = ?").get(params.id, mes).s;
  if (usuario.papel !== 'dono') { delete p.custo; for (const m of p.movimentos) { delete m.custo_unit; if (m.tipo !== 'venda') delete m.valor; } }
  return p;
});
function salvarProduto(corpo, id) {
  exigir(txt(corpo.nome), 'Informe o nome do produto');
  const v = [txt(corpo.nome), corpo.categoria === 'venda' ? 'venda' : 'uso', UNIDADES.includes(corpo.unidade) ? corpo.unidade : 'un',
    Math.max(0, qtd(corpo.minimo || 0)), Math.max(0, int(corpo.custo)), Math.max(0, int(corpo.preco_venda)), txt(corpo.fornecedor), corpo.ativo === false ? 0 : 1];
  if (id) { db.prepare('UPDATE produtos SET nome=?, categoria=?, unidade=?, minimo=?, custo=?, preco_venda=?, fornecedor=?, ativo=? WHERE id=?').run(...v, id); return { id }; }
  return transacao(() => {
    const novo = Number(db.prepare('INSERT INTO produtos (nome, categoria, unidade, minimo, custo, preco_venda, fornecedor, ativo) VALUES (?,?,?,?,?,?,?,?)').run(...v).lastInsertRowid);
    const inicial = qtd(corpo.quantidade || 0);
    if (inicial > 0) movimentar(novo, 'ajuste', inicial, { obs: 'Estoque inicial' });
    return { id: novo };
  });
}
rota('POST', '/api/produtos', 'dono', ({ corpo }) => salvarProduto(corpo));
rota('PUT', '/api/produtos/:id', 'dono', ({ corpo, params }) => salvarProduto(corpo, params.id));

rota('POST', '/api/produtos/:id/movimentos', 'logado', ({ params, corpo, usuario }) => transacao(() => {
  const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(params.id);
  if (!p) throw new Erro(404, 'Produto não encontrado');
  const n = qtd(corpo.quantidade);
  const ehDono = usuario.papel === 'dono';
  const base = { usuario_id: usuario.id, obs: txt(corpo.obs) };
  switch (corpo.tipo) {
    case 'entrada': { // compra
      exigir(ehDono, 'Só o dono registra compras');
      exigir(n > 0, 'Informe a quantidade comprada');
      const total = Math.max(0, int(corpo.valor_total));
      const custoUnit = total ? Math.round(total / n) : p.custo;
      // custo médio ponderado
      const novoCusto = p.quantidade > 0 && p.custo ? Math.round((p.quantidade * p.custo + n * custoUnit) / (p.quantidade + n)) : custoUnit;
      db.prepare('UPDATE produtos SET custo = ? WHERE id = ?').run(novoCusto, p.id);
      movimentar(p.id, 'entrada', n, { ...base, custo_unit: custoUnit, valor: total || null, obs: base.obs || txt(corpo.fornecedor) || null });
      if (corpo.lancar_despesa && total > 0)
        db.prepare('INSERT INTO despesas (descricao, categoria, valor, data, usuario_id) VALUES (?,?,?,?,?)')
          .run(`Compra: ${p.nome} (${fmtQtd(n, p.unidade)})`, p.categoria === 'venda' ? 'Produtos para revenda' : 'Produtos de limpeza', total, hoje(), usuario.id);
      break;
    }
    case 'uso': { // retirada manual para uso
      exigir(n > 0, 'Informe a quantidade');
      exigir(n <= p.quantidade + 1e-9, `Estoque insuficiente: tem ${fmtQtd(p.quantidade, p.unidade)}`);
      movimentar(p.id, 'uso', -n, base);
      break;
    }
    case 'venda': {
      exigir(p.categoria === 'venda', 'Esse produto não é para venda');
      exigir(n > 0, 'Informe a quantidade');
      exigir(n <= p.quantidade + 1e-9, `Estoque insuficiente: tem ${fmtQtd(p.quantidade, p.unidade)}`);
      exigir(FORMAS.includes(corpo.forma), 'Escolha a forma de pagamento');
      const total = int(corpo.valor_total) || Math.round(p.preco_venda * n);
      exigir(total > 0, 'Informe o valor da venda');
      movimentar(p.id, 'venda', -n, { ...base, valor: total });
      db.prepare('INSERT INTO pagamentos (descricao, valor, forma, data, usuario_id) VALUES (?,?,?,?,?)').run(`Venda: ${p.nome} (${fmtQtd(n, p.unidade)})`, total, corpo.forma, agora(), usuario.id);
      break;
    }
    case 'ajuste': { // contagem / inventário
      exigir(ehDono, 'Só o dono ajusta o estoque');
      exigir(Number.isFinite(Number(corpo.quantidade)) && n >= 0, 'Informe a quantidade contada');
      const delta = qtd(n - p.quantidade);
      if (delta !== 0) movimentar(p.id, 'ajuste', delta, { ...base, obs: base.obs || 'Contagem de estoque' });
      break;
    }
    default: throw new Erro(400, 'Tipo de movimento inválido');
  }
  return { ok: true, quantidade: db.prepare('SELECT quantidade FROM produtos WHERE id = ?').get(p.id).quantidade };
}));

// quanto cada serviço gasta de produto (ficha técnica)
rota('GET', '/api/servicos/:id/produtos', 'logado', ({ params }) =>
  db.prepare('SELECT sp.produto_id, sp.quantidade, p.nome, p.unidade FROM servico_produtos sp JOIN produtos p ON p.id = sp.produto_id WHERE sp.servico_id = ? ORDER BY p.nome').all(params.id));
rota('PUT', '/api/servicos/:id/produtos', 'dono', ({ params, corpo }) => transacao(() => {
  db.prepare('DELETE FROM servico_produtos WHERE servico_id = ?').run(params.id);
  const ins = db.prepare('INSERT OR REPLACE INTO servico_produtos (servico_id, produto_id, quantidade) VALUES (?,?,?)');
  for (const i of corpo.itens || []) if (int(i.produto_id) && qtd(i.quantidade) > 0) ins.run(params.id, int(i.produto_id), qtd(i.quantidade));
  return { ok: true };
}));

// ---------- caixa do dia ----------
rota('GET', '/api/caixa', 'dono', ({ q }) => {
  const dia = dataOk(q.data) ? q.data.slice(0, 10) : hoje();
  const pagamentos = db.prepare(`SELECT p.*, u.nome AS usuario_nome, c.nome AS cliente_nome, v.placa,
      COALESCE(p.descricao, CASE WHEN p.assinatura_id IS NOT NULL THEN 'Mensalidade de plano' END) AS referencia
    FROM pagamentos p LEFT JOIN usuarios u ON u.id = p.usuario_id LEFT JOIN ordens o ON o.id = p.ordem_id
    LEFT JOIN assinaturas a ON a.id = p.assinatura_id
    LEFT JOIN clientes c ON c.id = COALESCE(o.cliente_id, a.cliente_id) LEFT JOIN veiculos v ON v.id = o.veiculo_id
    WHERE substr(p.data,1,10) = ? ORDER BY p.data`).all(dia);
  const despesas = db.prepare('SELECT * FROM despesas WHERE data = ? ORDER BY id').all(dia);
  const porForma = Object.fromEntries(FORMAS.map(f => [f, 0]));
  for (const p of pagamentos) porForma[p.forma] += p.valor;
  const entradas = pagamentos.reduce((s, p) => s + p.valor, 0);
  const saidas = despesas.reduce((s, d) => s + d.valor, 0);
  const pendentes = db.prepare(`${SQL_ORDEM} WHERE o.status NOT IN ('cancelado','agendado') AND o.total > (SELECT COALESCE(SUM(valor),0) FROM pagamentos WHERE ordem_id = o.id) ORDER BY o.data_ref DESC LIMIT 100`).all();
  return { dia, pagamentos, despesas, porForma, entradas, saidas, saldo: entradas - saidas, pendentes };
});

// ---------- planos mensais ----------
rota('GET', '/api/planos', 'logado', () => db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM assinaturas a WHERE a.plano_id = p.id AND a.ativo = 1) AS assinantes FROM planos p ORDER BY p.ativo DESC, p.nome`).all());
function salvarPlano(corpo, id) {
  exigir(txt(corpo.nome), 'Informe o nome do plano');
  const v = [txt(corpo.nome), int(corpo.preco), Math.max(1, int(corpo.lavagens_mes)), txt(corpo.descricao), corpo.ativo === false ? 0 : 1];
  if (id) { db.prepare('UPDATE planos SET nome=?, preco=?, lavagens_mes=?, descricao=?, ativo=? WHERE id=?').run(...v, id); return { id }; }
  return { id: Number(db.prepare('INSERT INTO planos (nome, preco, lavagens_mes, descricao, ativo) VALUES (?,?,?,?,?)').run(...v).lastInsertRowid) };
}
rota('POST', '/api/planos', 'dono', ({ corpo }) => salvarPlano(corpo));
rota('PUT', '/api/planos/:id', 'dono', ({ corpo, params }) => salvarPlano(corpo, params.id));
rota('GET', '/api/assinaturas', 'dono', () => {
  const lista = db.prepare(`SELECT a.id, a.cliente_id FROM assinaturas a WHERE a.ativo = 1`).all();
  return lista.map(a => ({ ...assinaturaAtiva(a.cliente_id), cliente_nome: db.prepare('SELECT nome, telefone FROM clientes WHERE id = ?').get(a.cliente_id)?.nome }))
    .filter(a => a.id).sort((x, y) => String(x.cliente_nome).localeCompare(String(y.cliente_nome)));
});
rota('POST', '/api/assinaturas', 'dono', ({ corpo }) => transacao(() => {
  exigir(int(corpo.cliente_id) && int(corpo.plano_id), 'Informe cliente e plano');
  db.prepare('UPDATE assinaturas SET ativo = 0 WHERE cliente_id = ?').run(int(corpo.cliente_id));
  const r = db.prepare('INSERT INTO assinaturas (cliente_id, plano_id, inicio) VALUES (?,?,?)').run(int(corpo.cliente_id), int(corpo.plano_id), dataOk(corpo.inicio) ? corpo.inicio.slice(0, 10) : hoje());
  return { id: Number(r.lastInsertRowid) };
}));
rota('DELETE', '/api/assinaturas/:id', 'dono', ({ params }) => { db.prepare('UPDATE assinaturas SET ativo = 0 WHERE id = ?').run(params.id); return { ok: true }; });

// ---------- painel (resumo de hoje) ----------
rota('GET', '/api/painel', 'logado', ({ usuario }) => {
  const d = hoje();
  const ordens = db.prepare(`${SQL_ORDEM} WHERE (substr(o.data_ref,1,10) = ? AND o.status != 'cancelado') OR o.status IN ('aguardando','lavando','pronto') ORDER BY o.data_ref`).all(d);
  const mmdd = d.slice(5);
  const aniversariantes = [
    ...db.prepare("SELECT id, nome, telefone, nascimento, 'cliente' AS tipo FROM clientes WHERE substr(nascimento,6,5) = ? ORDER BY nome").all(mmdd),
    ...db.prepare("SELECT id, nome, NULL AS telefone, nascimento, 'equipe' AS tipo FROM usuarios WHERE ativo = 1 AND substr(nascimento,6,5) = ? ORDER BY nome").all(mmdd),
  ];
  const estoque_baixo = db.prepare('SELECT id, nome, quantidade, minimo, unidade FROM produtos WHERE ativo = 1 AND minimo > 0 AND quantidade <= minimo ORDER BY quantidade / minimo').all();
  const out = { dia: d, ordens, aniversariantes, estoque_baixo };
  if (usuario.papel === 'dono') {
    out.faturamento = db.prepare('SELECT COALESCE(SUM(valor),0) s FROM pagamentos WHERE substr(data,1,10) = ?').get(d).s;
    out.faturamento_mes = db.prepare('SELECT COALESCE(SUM(valor),0) s FROM pagamentos WHERE substr(data,1,7) = ?').get(d.slice(0, 7)).s;
  }
  return out;
});

rota('GET', '/api/aniversariantes', 'logado', ({ q }) => {
  const mes = /^\d{2}$/.test(q.mes || '') ? q.mes : hoje().slice(5, 7);
  return [
    ...db.prepare("SELECT id, nome, telefone, nascimento, 'cliente' AS tipo FROM clientes WHERE substr(nascimento,6,2) = ?").all(mes),
    ...db.prepare("SELECT id, nome, NULL AS telefone, nascimento, 'equipe' AS tipo FROM usuarios WHERE ativo = 1 AND substr(nascimento,6,2) = ?").all(mes),
  ].sort((a, b) => a.nascimento.slice(8).localeCompare(b.nascimento.slice(8)) || a.nome.localeCompare(b.nome));
});

// ---------- relatórios ----------
rota('GET', '/api/relatorios', 'dono', ({ q }) => {
  const de = dataOk(q.de) ? q.de.slice(0, 10) : hoje().slice(0, 8) + '01'; const ate = dataOk(q.ate) ? q.ate.slice(0, 10) : hoje();
  const P = 'substr(p.data,1,10) BETWEEN ? AND ?'; const O = "substr(o.data_ref,1,10) BETWEEN ? AND ? AND o.status NOT IN ('cancelado','agendado')";
  const recebido = db.prepare(`SELECT COALESCE(SUM(valor),0) s FROM pagamentos p WHERE ${P}`).get(de, ate).s;
  const despesas = db.prepare('SELECT COALESCE(SUM(valor),0) s FROM despesas WHERE data BETWEEN ? AND ?').get(de, ate).s;
  const ordens = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total),0) s, COALESCE(SUM(desconto),0) d FROM ordens o WHERE ${O}`).get(de, ate);
  const porForma = db.prepare(`SELECT forma, SUM(valor) total, COUNT(*) n FROM pagamentos p WHERE ${P} GROUP BY forma ORDER BY total DESC`).all(de, ate);
  const porDia = db.prepare(`SELECT substr(p.data,1,10) dia, SUM(valor) total FROM pagamentos p WHERE ${P} GROUP BY dia ORDER BY dia`).all(de, ate);
  const porServico = db.prepare(`SELECT i.descricao, COUNT(*) n, SUM(i.valor) total FROM ordem_itens i JOIN ordens o ON o.id = i.ordem_id WHERE ${O} GROUP BY i.descricao ORDER BY n DESC`).all(de, ate);
  const porFuncionario = db.prepare(`SELECT u.id, u.nome, u.comissao_pct, COUNT(o.id) n, COALESCE(SUM(o.total),0) total
    FROM ordens o JOIN usuarios u ON u.id = o.funcionario_id WHERE ${O} GROUP BY u.id ORDER BY total DESC`).all(de, ate)
    .map(f => ({ ...f, comissao: Math.round(f.total * f.comissao_pct / 100) }));
  const despesasPorCategoria = db.prepare("SELECT COALESCE(categoria,'Sem categoria') categoria, SUM(valor) total FROM despesas WHERE data BETWEEN ? AND ? GROUP BY 1 ORDER BY total DESC").all(de, ate);
  const produtos = db.prepare(`SELECT p.id, p.nome, p.unidade, p.categoria,
      -SUM(CASE WHEN m.tipo IN ('consumo','estorno','uso') THEN m.quantidade ELSE 0 END) AS usado,
      -SUM(CASE WHEN m.tipo IN ('consumo','estorno','uso') THEN m.quantidade * COALESCE(m.custo_unit, p.custo) ELSE 0 END) AS custo_uso,
      -SUM(CASE WHEN m.tipo = 'venda' THEN m.quantidade ELSE 0 END) AS vendido,
      SUM(CASE WHEN m.tipo = 'venda' THEN m.valor ELSE 0 END) AS valor_vendas
    FROM estoque_mov m JOIN produtos p ON p.id = m.produto_id WHERE substr(m.data,1,10) BETWEEN ? AND ? GROUP BY p.id
    HAVING usado <> 0 OR vendido <> 0 ORDER BY custo_uso DESC, valor_vendas DESC`).all(de, ate).map(r => ({ ...r, custo_uso: Math.round(r.custo_uso) }));
  const topClientes = db.prepare(`SELECT c.id, c.nome, COUNT(o.id) n, SUM(o.total) total FROM ordens o JOIN clientes c ON c.id = o.cliente_id WHERE ${O} GROUP BY c.id ORDER BY total DESC LIMIT 10`).all(de, ate);
  return { de, ate, recebido, despesas, lucro: recebido - despesas, qtd_ordens: ordens.n, total_ordens: ordens.s, descontos: ordens.d,
    ticket_medio: ordens.n ? Math.round(ordens.s / ordens.n) : 0, porForma, porDia, porServico, porFuncionario, despesasPorCategoria, topClientes, produtos };
});

// ---------- backup ----------
// gera um arquivo .tar com o banco (nograu.db) e a pasta fotos/
function cabecalhoTar(nome, tamanho, mtime) {
  const h = Buffer.alloc(512);
  h.write(nome, 0, 100, 'utf8'); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
  h.write(tamanho.toString(8).padStart(11, '0') + '\0', 124); h.write(Math.floor(mtime / 1000).toString(8).padStart(11, '0') + '\0', 136);
  h.write('        ', 148); h.write('0', 156); h.write('ustar\0', 257); h.write('00', 263);
  let soma = 0; for (const b of h) soma += b;
  h.write(soma.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}
function listarFotos(dir, base = '') {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(i => i.isDirectory() ? listarFotos(path.join(dir, i.name), base + i.name + '/') : [base + i.name]);
}
rota('GET', '/api/backup', 'dono', async ({ res }) => {
  const tmp = path.join(os.tmpdir(), `nograu-download-${Date.now()}.db`);
  fazerBackup(tmp);
  res.writeHead(200, { 'Content-Type': 'application/x-tar', 'Content-Disposition': `attachment; filename="nograu-backup-${hoje()}.tar"` });
  const escrever = async b => { if (!res.write(b)) await once(res, 'drain'); };
  const arquivos = [['nograu.db', tmp], ...listarFotos(FOTOS_DIR).map(f => ['fotos/' + f, path.join(FOTOS_DIR, f)])];
  try {
    for (const [nome, arq] of arquivos) {
      const dados = fs.readFileSync(arq); const st = fs.statSync(arq);
      await escrever(cabecalhoTar(nome, dados.length, st.mtimeMs)); await escrever(dados);
      if (dados.length % 512) await escrever(Buffer.alloc(512 - dados.length % 512));
    }
    await escrever(Buffer.alloc(1024));
  } finally { fs.unlink(tmp, () => {}); res.end(); }
});

// backup automático ao iniciar e a cada 24h; limpeza de sessões vencidas
function rotina() {
  try {
    fazerBackup(); db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(agora());
    const usados = new Set(db.prepare('SELECT arquivo FROM fotos').all().map(f => f.arquivo));
    for (const f of listarFotos(FOTOS_DIR)) {
      const arq = path.join(FOTOS_DIR, f);
      if (!usados.has(f) && Date.now() - fs.statSync(arq).mtimeMs > 864e5) fs.unlinkSync(arq);
    }
  }
  catch (e) { console.error('Falha no backup automático:', e.message); }
}
if (process.env.NOGRAU_NAVEGADOR !== '1') { rotina(); setInterval(rotina, 24 * 3600e3).unref(); }

servidor.listen(PORT, HOST, () => {
  console.log(`\n  Sistema No Grau rodando!`);
  console.log(`  Neste computador:  http://localhost:${PORT}`);
  for (const lista of Object.values(os.networkInterfaces()))
    for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) console.log(`  Na rede (celular):  http://${i.address}:${PORT}`);
  console.log('\n  Para desligar, feche esta janela ou aperte Ctrl+C.\n');
});
