// Sistema No Grau - VERSÃO DE DEMONSTRAÇÃO
// Cria do zero um banco com dados fictícios (2 meses de movimento, sempre até a data de hoje)
// e inicia o sistema. Tudo volta ao original sempre que a demonstração é reiniciada.
// Rode com:  node demo.js     (porta padrão 3001; o sistema de verdade usa a 3000)
process.removeAllListeners('warning');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const PASTA = path.join(__dirname, 'dados-demo');
process.env.NOGRAU_DATA = PASTA;
process.env.NOGRAU_DEMO = '1';
process.env.PORT = process.env.PORT || '3001';

// apaga só a pasta da demonstração (nunca a pasta "dados" do sistema de verdade)
if (path.basename(PASTA) === 'dados-demo' && fs.existsSync(PASTA)) fs.rmSync(PASTA, { recursive: true, force: true });

const { db, transacao, FOTOS_DIR } = require('./db');
const { infoJpeg } = require('./pdf');

// ---------- utilidades ----------
let semente = 20261119; // sempre gera os mesmos dados
const rnd = () => { semente |= 0; semente = semente + 0x6D2B79F5 | 0; let t = Math.imul(semente ^ semente >>> 15, 1 | semente); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const entre = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const um = lista => lista[Math.floor(rnd() * lista.length)];
const pesado = pares => { const tot = pares.reduce((s, p) => s + p[1], 0); let r = rnd() * tot; for (const [v, p] of pares) { if ((r -= p) < 0) return v; } return pares[0][0]; };
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
const HOJE = new Date(); HOJE.setSeconds(0, 0);
const dia = (deslocamento, h = 0, m = 0) => { const d = new Date(HOJE); d.setDate(d.getDate() + deslocamento); d.setHours(h, m, 0, 0); return d; };
const somaMin = (d, min) => new Date(d.getTime() + min * 60000);
const hash = senha => { const salt = crypto.randomBytes(16).toString('hex'); return salt + ':' + crypto.scryptSync(senha, salt, 64).toString('hex'); };
function cnpjValido() {
  const b = Array.from({ length: 8 }, () => entre(0, 9)).concat([0, 0, 0, 1]);
  for (const t of [12, 13]) { let s = 0, p = t - 7; for (let i = 0; i < t; i++) { s += b[i] * p--; if (p < 2) p = 9; } b.push(s % 11 < 2 ? 0 : 11 - (s % 11)); }
  const d = b.join(''); return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}
const placa = () => { const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; return um(L) + um(L) + um(L) + entre(0, 9) + um(L) + entre(0, 9) + entre(0, 9); };
const tel = () => `(11) 9${entre(6000, 9999)}-${entre(1000, 9999)}`;

transacao(() => {
  // ---------- configurações ----------
  const cfg = db.prepare('INSERT INTO config (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor');
  cfg.run('nome_empresa', 'Lava Jato No Grau');
  cfg.run('cnpj', cnpjValido());
  cfg.run('endereco', 'Av. das Palmeiras, 1200 – Centro – São Paulo/SP');
  cfg.run('telefone', '(11) 3000-0000');

  // ---------- equipe ----------
  const insU = db.prepare('INSERT INTO usuarios (nome, login, senha_hash, papel, comissao_pct, nascimento) VALUES (?,?,?,?,?,?)');
  const SENHA = hash('demo123');
  const dono = Number(insU.run('Ricardo Almeida', 'dono', SENHA, 'dono', 0, '1985-03-12').lastInsertRowid);
  const anivFunc = dia(9); // um funcionário faz aniversário daqui a 9 dias
  const carlos = Number(insU.run('Carlos Souza', 'carlos', SENHA, 'funcionario', 10, `1994-${pad(anivFunc.getMonth() + 1)}-${pad(anivFunc.getDate())}`).lastInsertRowid);
  const bruno = Number(insU.run('Bruno Lima', 'bruno', SENHA, 'funcionario', 8, '1999-08-21').lastInsertRowid);
  const lavadores = [carlos, carlos, bruno];

  // ---------- serviços (os padrões já existem) ----------
  const servicos = db.prepare('SELECT * FROM servicos WHERE ativo = 1').all();
  const serv = nome => servicos.find(s => s.nome === nome);

  // ---------- planos ----------
  const insP = db.prepare('INSERT INTO planos (nome, preco, lavagens_mes, descricao) VALUES (?,?,?,?)');
  const planoBasico = Number(insP.run('Mensal Básico', 15000, 4, 'Uma lavagem completa por semana.').lastInsertRowid);
  const planoPremium = Number(insP.run('Mensal Premium', 28000, 8, 'Duas lavagens completas por semana + cera uma vez por mês.').lastInsertRowid);

  // ---------- clientes e veículos ----------
  const insC = db.prepare('INSERT INTO clientes (nome, telefone, email, documento, endereco, nascimento, obs, criado_em) VALUES (?,?,?,?,?,?,?,?)');
  const insV = db.prepare('INSERT INTO veiculos (cliente_id, placa, modelo, cor, porte, obs) VALUES (?,?,?,?,?,?)');
  const MODELOS = { pequeno: ['Fiat Mobi', 'Renault Kwid', 'VW Up', 'Fiat Argo', 'Hyundai HB20', 'Chevrolet Onix'], medio: ['Toyota Corolla', 'Honda Civic', 'VW Virtus', 'Jeep Renegade', 'Nissan Kicks', 'Hyundai Creta', 'Chevrolet Tracker'],
    grande: ['Toyota Hilux', 'Jeep Compass', 'Ford Ranger', 'Chevrolet S10', 'Toyota SW4', 'VW Amarok'], moto: ['Honda CG 160', 'Yamaha Fazer 250', 'Honda Biz'] };
  const CORES = ['Branco', 'Preto', 'Prata', 'Cinza', 'Vermelho', 'Azul', 'Branco', 'Prata', 'Preto', 'Grafite'];
  const NOMES = ['Ana Paula Ferreira', 'Marcos Oliveira', 'Juliana Santos', 'Rafael Costa', 'Fernanda Ribeiro', 'Lucas Martins', 'Patrícia Gomes', 'Diego Carvalho',
    'Camila Rocha', 'Thiago Barbosa', 'Beatriz Moreira', 'Gustavo Nunes', 'Larissa Teixeira', 'Felipe Araújo', 'Mariana Lopes', 'André Pereira', 'Renata Dias',
    'Vinícius Cardoso', 'Aline Mendes', 'Eduardo Pinto', 'Sônia Batista', 'Roberto Freitas'];
  const EMPRESAS = [['Transportadora Rota Sul Ltda', 'grande', 3], ['Construtora Alicerce Ltda', 'grande', 2], ['Imobiliária Chave Dourada Ltda', 'medio', 2], ['Floricultura Jardim Bom ME', 'pequeno', 1]];
  const clientes = [];
  const criadoEm = fmt(dia(-entre(70, 400), 10));
  NOMES.forEach((nome, i) => {
    let nasc = `${entre(1965, 2002)}-${pad(entre(1, 12))}-${pad(entre(1, 28))}`;
    if (i === 2) nasc = `1990-${pad(HOJE.getMonth() + 1)}-${pad(HOJE.getDate())}`; // aniversariante de hoje
    if (i === 5) { const d = dia(4); nasc = `1988-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
    const id = Number(insC.run(nome, tel(), i % 3 === 0 ? nome.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '@email.com' : null, null, null, nasc, null, fmt(dia(-entre(70, 400), 10))).lastInsertRowid);
    const porte = pesado([['pequeno', 4], ['medio', 4], ['grande', 2], ['moto', 1]]);
    const veics = [Number(insV.run(id, placa(), um(MODELOS[porte]), um(CORES), porte, null).lastInsertRowid)];
    if (i % 7 === 0) { const p2 = um(['pequeno', 'medio']); veics.push(Number(insV.run(id, placa(), um(MODELOS[p2]), um(CORES), p2, null).lastInsertRowid)); }
    clientes.push({ id, veics, peso: i < 8 ? 3 : 1, empresa: false });
  });
  for (const [nome, porte, qtd] of EMPRESAS) {
    const id = Number(insC.run(nome, `(11) 3${entre(100, 999)}-${entre(1000, 9999)}`, 'financeiro@' + nome.split(' ')[1].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') + '.com.br',
      cnpjValido(), `Rua ${um(['das Indústrias', 'do Comércio', 'Bela Vista', 'São Bento'])}, ${entre(10, 999)} – ${um(['Vila Nova', 'Centro', 'Jardim América'])} – São Paulo/SP`, null, 'Faturamento mensal: cobrar todo dia 5.', criadoEm).lastInsertRowid);
    const veics = Array.from({ length: qtd }, () => Number(insV.run(id, placa(), um(MODELOS[porte]), um(['Branco', 'Branco', 'Prata']), porte, null).lastInsertRowid));
    clientes.push({ id, veics, peso: 2, empresa: true });
  }

  // ---------- assinaturas de planos ----------
  const insA = db.prepare('INSERT INTO assinaturas (cliente_id, plano_id, inicio) VALUES (?,?,?)');
  const assinantes = [[clientes[0], planoPremium], [clientes[1], planoBasico], [clientes[3], planoBasico], [clientes[6], planoPremium]].map(([c, p]) => {
    c.assinatura = { id: Number(insA.run(c.id, p, fmt(dia(-95)).slice(0, 10)).lastInsertRowid), plano: p, limite: p === planoPremium ? 8 : 4 };
    return c;
  });

  // ---------- ordens de serviço ----------
  const insO = db.prepare(`INSERT INTO ordens (cliente_id, veiculo_id, funcionario_id, status, data_ref, inicio_em, pronto_em, entregue_em, subtotal, desconto, total, usa_plano, assinatura_id, obs, criado_por, criado_em)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insI = db.prepare('INSERT INTO ordem_itens (ordem_id, servico_id, descricao, valor) VALUES (?,?,?,?)');
  const insPg = db.prepare('INSERT INTO pagamentos (ordem_id, assinatura_id, descricao, valor, forma, data, usuario_id) VALUES (?,?,?,?,?,?,?)');
  const porteDe = db.prepare('SELECT porte FROM veiculos WHERE id = ?');
  const usoPlano = {}; // assinatura+mês -> quantidade
  const OBS = ['Cliente pediu atenção aos tapetes.', 'Não usar pretinho nos pneus.', 'Cachorro no banco de trás: aspirar bem.', 'Vai buscar depois do almoço.', null, null, null, null, null, null];

  function criarOS({ cliente, quando, status, pago = true, servicosEscolhidos }) {
    const veic = um(cliente.veics); const porte = porteDe.get(veic).porte;
    const itens = (servicosEscolhidos || [pesado([['Lavagem simples', 5], ['Lavagem completa', 6], ['Lavagem + cera', 3], ['Higienização interna', 1], ['Polimento', 0.4]])])
      .concat(rnd() < 0.15 ? ['Lavagem de motor'] : []).map(n => serv(n)).filter(Boolean)
      .map(s => ({ s, valor: s['preco_' + porte] || s.preco_medio }));
    const subtotal = itens.reduce((t, i) => t + i.valor, 0);
    let usaPlano = 0, assinaturaId = null, desconto = 0;
    const mes = fmt(quando).slice(0, 7);
    if (cliente.assinatura) { const k = cliente.assinatura.id + mes; if ((usoPlano[k] || 0) < cliente.assinatura.limite) { usoPlano[k] = (usoPlano[k] || 0) + 1; usaPlano = 1; assinaturaId = cliente.assinatura.id; desconto = subtotal; } }
    if (!usaPlano && rnd() < 0.1) desconto = um([500, 1000]);
    const total = subtotal - desconto;
    const func = status === 'agendado' || status === 'aguardando' ? (rnd() < 0.5 ? um(lavadores) : null) : um(lavadores);
    const duracao = itens.reduce((t, i) => t + i.s.duracao_min, 0);
    const inicio = ['lavando', 'pronto', 'entregue'].includes(status) ? somaMin(quando, entre(5, 25)) : null;
    const pronto = ['pronto', 'entregue'].includes(status) ? somaMin(inicio, duracao + entre(-5, 15)) : null;
    const entregue = status === 'entregue' ? somaMin(pronto, entre(10, 70)) : null;
    const id = Number(insO.run(cliente.id, veic, func, status, fmt(quando), inicio && fmt(inicio), pronto && fmt(pronto), entregue && fmt(entregue),
      subtotal, desconto, total, usaPlano, assinaturaId, um(OBS), um([dono, carlos, bruno]), fmt(quando)).lastInsertRowid);
    for (const i of itens) insI.run(id, i.s.id, i.s.nome, i.valor);
    if (pago && total > 0 && (status === 'entregue' || (status === 'pronto' && rnd() < 0.3))) {
      const forma = pesado([['pix', 45], ['credito', 20], ['debito', 20], ['dinheiro', 15]]);
      insPg.run(id, null, null, total, forma, fmt(entregue || pronto), um([dono, carlos]));
    }
    return id;
  }

  // passado: últimos 60 dias (domingo quase parado)
  for (let d = -60; d <= -1; d++) {
    const data = dia(d); const sem = data.getDay();
    const qtd = sem === 0 ? entre(0, 3) : sem === 6 ? entre(15, 20) : sem === 5 ? entre(11, 15) : entre(8, 12);
    for (let k = 0; k < qtd; k++) {
      const cliente = pesado(clientes.map(c => [c, c.peso]));
      const quando = dia(d, entre(8, 16), um([0, 10, 20, 30, 40, 50]));
      const status = rnd() < 0.04 ? 'cancelado' : 'entregue';
      // empresas pagam no fim do mês (deixa valores "a receber" no mês atual)
      const pago = !(cliente.empresa && quando.getMonth() === HOJE.getMonth());
      criarOS({ cliente, quando, status, pago });
    }
  }
  // hoje: fila montada no painel
  const h = HOJE.getHours();
  const hojeEm = (hr, min) => dia(0, Math.min(hr, 23), min);
  const filaHoje = [['entregue', 8, 10], ['entregue', 8, 40], ['entregue', 9, 30], ['pronto', 10, 15], ['lavando', 10, 50], ['lavando', 11, 20], ['aguardando', 11, 45], ['aguardando', 12, 5]];
  filaHoje.forEach(([status, hr, min], i) => criarOS({ cliente: i === 3 ? clientes[2] : pesado(clientes.map(c => [c, c.peso])), quando: hojeEm(Math.min(hr, Math.max(h - 1, 8)), min), status }));
  [[14, 0, ['Higienização interna']], [15, 30, ['Lavagem + cera']], [17, 0, ['Lavagem completa']]].forEach(([hr, min, s]) =>
    criarOS({ cliente: pesado(clientes.map(c => [c, c.peso])), quando: dia(0, hr, min), status: 'agendado', servicosEscolhidos: s }));
  // próximos dias: agendamentos
  for (let d = 1; d <= 6; d++) {
    if (dia(d).getDay() === 0) continue;
    for (let k = 0; k < entre(2, 4); k++) criarOS({ cliente: pesado(clientes.map(c => [c, c.peso])), quando: dia(d, entre(8, 16), um([0, 30])), status: 'agendado',
      servicosEscolhidos: [pesado([['Lavagem completa', 4], ['Lavagem + cera', 2], ['Higienização interna', 2], ['Polimento', 1]])] });
  }

  // ---------- mensalidades dos planos ----------
  for (const c of assinantes) {
    const a = c.assinatura; const preco = a.plano === planoPremium ? 28000 : 15000; const nomePlano = a.plano === planoPremium ? 'Mensal Premium' : 'Mensal Básico';
    for (let m = 2; m >= 0; m--) {
      const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - m, 5, 10, 0);
      if (d > HOJE) continue;
      if (m === 0 && c === assinantes[2]) continue; // um assinante com a mensalidade do mês em aberto
      insPg.run(null, a.id, `Mensalidade ${nomePlano}`, preco, um(['pix', 'pix', 'credito']), fmt(d), dono);
    }
  }

  // ---------- despesas ----------
  const insD = db.prepare('INSERT INTO despesas (descricao, categoria, valor, data, usuario_id) VALUES (?,?,?,?,?)');
  const despesa = (desc, cat, valor, d) => { if (d <= HOJE) insD.run(desc, cat, valor, fmt(d).slice(0, 10), dono); };
  for (let m = 2; m >= 0; m--) {
    const mes = (diaMes) => new Date(HOJE.getFullYear(), HOJE.getMonth() - m, diaMes, 9);
    despesa('Aluguel do galpão', 'Aluguel', 250000, mes(5));
    despesa('Salário Carlos', 'Salários', 180000, mes(5)); despesa('Salário Bruno', 'Salários', 165000, mes(5));
    despesa('Conta de água', 'Água/luz', entre(52000, 76000), mes(10)); despesa('Conta de luz', 'Água/luz', entre(36000, 48000), mes(12));
    despesa('Anúncio no Instagram', 'Marketing', 15000, mes(15));
    for (const dd of [3, 10, 17, 24]) despesa(um(['Shampoo automotivo e cera', 'Pretinho, silicone e flanelas', 'Produtos de limpeza (galão)', 'APC e desengraxante']), 'Produtos de limpeza', entre(18000, 42000), mes(dd));
  }
  despesa('Manutenção da lavadora de alta pressão', 'Manutenção', 18000, dia(-23));
  despesa('Troca da mangueira', 'Manutenção', 6500, dia(-6));
  despesa('Café e água para clientes', 'Outros', 4500, dia(-1));
});

// ---------- estoque: produtos, consumo por serviço e 2 meses de movimento ----------
transacao(() => {
  const PRODUTOS = [ // nome, tipo, unidade, mínimo, custo, preço, fornecedor, contagem de ontem, lote de compra
    ['Shampoo automotivo', 'uso', 'L', 10, 1290, 0, 'Distribuidora Brilho Car', 22, 20],
    ['Cera líquida', 'uso', 'L', 2, 4500, 0, 'Distribuidora Brilho Car', 4.5, 5],
    ['Pretinho para pneus', 'uso', 'L', 3, 2200, 0, 'Distribuidora Brilho Car', 2.8, 5],
    ['APC multiuso', 'uso', 'L', 5, 1800, 0, 'Química Limpa', 14, 10],
    ['Silicone para painel', 'uso', 'L', 1, 3500, 0, 'Química Limpa', 2.2, 2],
    ['Higienizador de estofados', 'uso', 'L', 2, 3900, 0, 'Química Limpa', 5, 5],
    ['Desengraxante de motor', 'uso', 'L', 2, 1600, 0, 'Química Limpa', 0.5, 5],
    ['Massa de polir', 'uso', 'kg', 1, 8900, 0, 'Auto Polish', 1.6, 1],
    ['Flanela de microfibra', 'uso', 'un', 20, 450, 0, 'Auto Polish', 34, 30],
    ['Aromatizante de pendurar', 'venda', 'un', 10, 350, 1200, 'Aroma Car', 28, 50],
    ['Cheirinho em spray', 'venda', 'un', 8, 900, 2500, 'Aroma Car', 6, 12],
    ['Kit flanelas para venda', 'venda', 'un', 5, 1500, 3500, 'Auto Polish', 9, 10],
    ['Água mineral 500 ml', 'venda', 'un', 24, 120, 400, 'Mercado local', 40, 48],
  ];
  const insProd = db.prepare('INSERT INTO produtos (nome, categoria, unidade, minimo, custo, preco_venda, fornecedor) VALUES (?,?,?,?,?,?,?)');
  const prods = PRODUTOS.map(([nome, cat, un, min, custo, preco, forn, alvo, lote]) =>
    ({ id: Number(insProd.run(nome, cat, un, min, custo, preco, forn).lastInsertRowid), nome, cat, un, min, custo, preco, alvo, lote, q: 0 }));
  const prod = nome => prods.find(p => p.nome === nome);

  // quanto cada serviço gasta
  const FICHA = {
    'Lavagem simples': [['Shampoo automotivo', 0.08], ['Pretinho para pneus', 0.03]],
    'Lavagem completa': [['Shampoo automotivo', 0.12], ['Pretinho para pneus', 0.04], ['APC multiuso', 0.1], ['Silicone para painel', 0.03]],
    'Lavagem + cera': [['Shampoo automotivo', 0.12], ['Pretinho para pneus', 0.04], ['APC multiuso', 0.1], ['Silicone para painel', 0.03], ['Cera líquida', 0.08]],
    'Higienização interna': [['Higienizador de estofados', 0.4], ['APC multiuso', 0.2]],
    'Polimento': [['Massa de polir', 0.15], ['Cera líquida', 0.1]],
    'Lavagem de motor': [['Desengraxante de motor', 0.25]],
  };
  const insFicha = db.prepare('INSERT INTO servico_produtos (servico_id, produto_id, quantidade) VALUES (?,?,?)');
  for (const [servNome, itens] of Object.entries(FICHA)) {
    const s = db.prepare('SELECT id FROM servicos WHERE nome = ?').get(servNome); if (!s) continue;
    for (const [pn, q] of itens) insFicha.run(s.id, prod(pn).id, q);
  }

  // eventos: consumo das OS prontas, vendas no balcão, compras semanais e a contagem de ontem
  const eventos = [];
  const consumo = db.prepare(`SELECT o.id AS ordem_id, o.pronto_em, sp.produto_id, SUM(sp.quantidade) AS q FROM ordens o JOIN ordem_itens i ON i.ordem_id = o.id
    JOIN servico_produtos sp ON sp.servico_id = i.servico_id WHERE o.status IN ('pronto','entregue') AND o.pronto_em IS NOT NULL GROUP BY o.id, sp.produto_id`).all();
  for (const c of consumo) eventos.push({ data: c.pronto_em, tipo: 'consumo', p: prods.find(p => p.id === c.produto_id), delta: -c.q, ordem_id: c.ordem_id });
  db.prepare("UPDATE ordens SET estoque_baixado = 1 WHERE status IN ('pronto','entregue')").run();
  const insPag = db.prepare('INSERT INTO pagamentos (descricao, valor, forma, data, usuario_id) VALUES (?,?,?,?,?)');
  for (let d = -60; d <= 0; d++) {
    if (dia(d).getDay() === 0) continue;
    for (let k = 0; k < entre(0, 3); k++) {
      const p = prod(pesado([['Água mineral 500 ml', 3], ['Aromatizante de pendurar', 3], ['Cheirinho em spray', 1], ['Kit flanelas para venda', 0.5]]));
      const quando = dia(d, entre(9, 17), entre(0, 59)); if (quando > HOJE) continue;
      const n = p.un === 'un' && p.nome.startsWith('Água') ? entre(1, 2) : 1;
      eventos.push({ data: fmt(quando), tipo: 'venda', p, delta: -n, valor: p.preco * n, forma: pesado([['pix', 5], ['dinheiro', 3], ['debito', 2]]) });
    }
    if (d < 0) eventos.push({ data: fmt(dia(d, 7, 30)), tipo: 'compra?' }); // dia de pedido (hoje não, para os avisos aparecerem)
  }
  // contagem de ontem: pequenas diferenças, como na vida real
  const r3 = v => Math.round(v * 1000) / 1000;
  for (const p of prods) {
    const perda = p.un === 'un' ? (rnd() < 0.35 ? -1 : 0) : r3(-p.alvo * (0.005 + rnd() * 0.02));
    if (perda) eventos.push({ data: fmt(dia(-1, 19, 0)), tipo: 'ajuste', p, delta: perda, obs: um(['Contagem de estoque', 'Contagem de estoque', p.un === 'L' ? 'Contagem: vazou um pouco do galão' : 'Contagem: item avariado']) });
  }
  eventos.sort((a, b) => a.data.localeCompare(b.data));

  // calcula de trás para frente: parte da quantidade de hoje (alvo) e decide as compras do passado,
  // assim o saldo nunca fica negativo e as compras acontecem quando o estoque estava perto do mínimo
  const marcadores = []; // [evento, produto] de compra
  for (const p of prods) {
    let q = p.alvo;
    for (let i = eventos.length - 1; i >= 0; i--) {
      const e = eventos[i];
      if (e.tipo === 'compra?') {
        const segunda = new Date(e.data.replace(' ', 'T')).getDay() === 1;
        if ((segunda && q > p.min * 2.5) || q > p.min * 4) {
          const n = Math.floor((q - p.min) / p.lote);
          if (n > 0) { marcadores.push({ data: e.data, tipo: 'entrada', p, delta: n * p.lote }); q = r3(q - n * p.lote); }
        }
      } else if (e.p === p) q = r3(q - e.delta);
    }
    p.inicial = q;
  }
  const todos = eventos.filter(e => e.tipo !== 'compra?').concat(marcadores).sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === 'entrada' ? -1 : 1));

  const insMov = db.prepare('INSERT INTO estoque_mov (produto_id, tipo, quantidade, saldo, custo_unit, valor, ordem_id, obs, data, usuario_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
  const dono = 1, carlos = 2;
  const forn = db.prepare('SELECT fornecedor FROM produtos WHERE id = ?');
  const mov = (p, tipo, delta, data, extra = {}) => { p.q = r3(p.q + delta); insMov.run(p.id, tipo, r3(delta), p.q, extra.custo ?? p.custo, extra.valor ?? null, extra.ordem_id ?? null, extra.obs ?? null, data, extra.usuario ?? dono); };
  for (const p of prods) mov(p, 'ajuste', p.inicial, fmt(dia(-61, 18, 0)), { obs: 'Estoque inicial' });
  for (const e of todos) {
    if (e.tipo === 'consumo') mov(e.p, 'consumo', e.delta, e.data, { ordem_id: e.ordem_id, usuario: carlos });
    else if (e.tipo === 'venda') { mov(e.p, 'venda', e.delta, e.data, { valor: e.valor, usuario: carlos }); insPag.run(`Venda: ${e.p.nome} (${-e.delta} un)`, e.valor, e.forma, e.data, carlos); }
    else if (e.tipo === 'entrada') { const custo = Math.round(e.p.custo * (0.95 + rnd() * 0.1)); mov(e.p, 'entrada', e.delta, e.data, { custo, valor: Math.round(custo * e.delta), obs: forn.get(e.p.id).fornecedor }); }
    else if (e.tipo === 'ajuste') mov(e.p, 'ajuste', e.delta, e.data, { obs: e.obs });
  }
  const upd = db.prepare('UPDATE produtos SET quantidade = ? WHERE id = ?');
  for (const p of prods) upd.run(p.q, p.id);
});

// ---------- fotos e avarias (ilustrações) ----------
const ORIGEM = path.join(__dirname, 'demo', 'fotos');
const insF = db.prepare('INSERT INTO fotos (veiculo_id, tipo, avaria_id, arquivo, largura, altura, usuario_id, criado_em) VALUES (?,?,?,?,?,?,?,?)');
const insAv = db.prepare('INSERT INTO avarias (veiculo_id, local, tipo, descricao, usuario_id, registrado_em) VALUES (?,?,?,?,?,?)');
let nFoto = 0;
function foto(veiculoId, nome, tipo = 'veiculo', avariaId = null) {
  let buf; try { buf = fs.readFileSync(path.join(ORIGEM, nome + '.jpg')); } catch { console.error('Foto de demonstração não encontrada:', nome); return; }
  const info = infoJpeg(buf);
  const arquivo = `demo/${veiculoId}-${++nFoto}-${nome}.jpg`;
  fs.mkdirSync(path.join(FOTOS_DIR, 'demo'), { recursive: true }); fs.writeFileSync(path.join(FOTOS_DIR, arquivo), buf);
  insF.run(veiculoId, tipo, avariaId, arquivo, info.largura, info.altura, 1, fmt(dia(-entre(1, 40), 10)));
}
const veic = db.prepare("SELECT v.id, v.cor, v.porte FROM veiculos v ORDER BY v.id").all();
const desenhoPorCor = c => ({ Vermelho: 'carro-vermelho', Preto: 'carro-preto', Grafite: 'carro-preto', Prata: 'carro-prata', Cinza: 'carro-prata', Azul: 'carro-azul', Branco: 'carro-branco' }[c] || 'carro-prata');
for (const v of veic.filter(v => v.porte !== 'moto').slice(0, 14)) foto(v.id, v.porte === 'grande' && v.cor === 'Branco' ? 'picape-branca' : desenhoPorCor(v.cor));
const AVARIAS = [
  [0, 'Porta dianteira esquerda', 'Risco', 'Risco de uns 15 cm abaixo da maçaneta.', 'avaria-risco'],
  [0, 'Para-choque traseiro', 'Trinca / quebrado', 'Trinca no canto direito, cliente já sabia.', 'avaria-para-choque'],
  [1, 'Capô', 'Amassado', 'Amassado pequeno (granizo).', 'avaria-amassado'],
  [3, 'Bancos', 'Rasgo', 'Rasgo no banco do motorista.', 'avaria-banco'],
  [4, 'Roda dianteira direita', 'Risco', 'Roda ralada na guia.', null],
  [4, 'Para-lama dianteiro direito', 'Pintura descascada', null, null],
];
for (const [i, local, tipo, desc, img] of AVARIAS) {
  const v = veic.filter(v => v.porte !== 'moto')[i];
  const id = Number(insAv.run(v.id, local, tipo, desc, 2, fmt(dia(-entre(3, 30), 9))).lastInsertRowid);
  if (img) foto(v.id, img, 'avaria', id);
}
const comRodas = veic.filter(v => v.porte !== 'moto')[2];
db.prepare('UPDATE veiculos SET obs = ? WHERE id = ?').run('Rodas aro 18 diamantadas: usar só shampoo neutro, nada de ácido.', comRodas.id);
foto(comRodas.id, 'obs-rodas', 'obs');

const n = t => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
console.log(`\n  DEMONSTRAÇÃO criada: ${n('clientes')} clientes, ${n('veiculos')} veículos, ${n('ordens')} ordens de serviço, ${n('fotos')} fotos.`);
console.log('  Logins (senha demo123):  dono  ·  carlos  ·  bruno');

require('./server'); // inicia o sistema
