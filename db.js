// Banco de dados do sistema No Grau (SQLite embutido no Node.js)
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.NOGRAU_DATA || path.join(__dirname, 'dados');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'nograu.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'funcionario', -- dono | funcionario
  comissao_pct REAL NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS sessoes (
  token TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  documento TEXT,
  obs TEXT,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS veiculos (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  placa TEXT,
  modelo TEXT,
  cor TEXT,
  porte TEXT NOT NULL DEFAULT 'medio' -- pequeno | medio | grande | moto
);
CREATE TABLE IF NOT EXISTS servicos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  preco_pequeno INTEGER NOT NULL DEFAULT 0, -- valores em centavos
  preco_medio INTEGER NOT NULL DEFAULT 0,
  preco_grande INTEGER NOT NULL DEFAULT 0,
  preco_moto INTEGER NOT NULL DEFAULT 0,
  duracao_min INTEGER NOT NULL DEFAULT 30,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS planos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  preco INTEGER NOT NULL DEFAULT 0,
  lavagens_mes INTEGER NOT NULL DEFAULT 4,
  descricao TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS assinaturas (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  plano_id INTEGER NOT NULL REFERENCES planos(id),
  inicio TEXT NOT NULL,
  ativo INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ordens (
  id INTEGER PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  veiculo_id INTEGER REFERENCES veiculos(id) ON DELETE SET NULL,
  funcionario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'aguardando', -- agendado | aguardando | lavando | pronto | entregue | cancelado
  data_ref TEXT NOT NULL, -- data/hora do agendamento ou da entrada (YYYY-MM-DD HH:MM)
  inicio_em TEXT,
  pronto_em TEXT,
  entregue_em TEXT,
  subtotal INTEGER NOT NULL DEFAULT 0,
  desconto INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  usa_plano INTEGER NOT NULL DEFAULT 0,
  assinatura_id INTEGER REFERENCES assinaturas(id) ON DELETE SET NULL,
  obs TEXT,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_ordens_data ON ordens(data_ref);
CREATE TABLE IF NOT EXISTS ordem_itens (
  id INTEGER PRIMARY KEY,
  ordem_id INTEGER NOT NULL REFERENCES ordens(id) ON DELETE CASCADE,
  servico_id INTEGER REFERENCES servicos(id) ON DELETE SET NULL,
  descricao TEXT NOT NULL,
  valor INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS pagamentos (
  id INTEGER PRIMARY KEY,
  ordem_id INTEGER REFERENCES ordens(id) ON DELETE CASCADE,
  assinatura_id INTEGER REFERENCES assinaturas(id) ON DELETE SET NULL,
  descricao TEXT,
  valor INTEGER NOT NULL,
  forma TEXT NOT NULL, -- dinheiro | pix | debito | credito | outro
  data TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_pag_data ON pagamentos(data);
CREATE TABLE IF NOT EXISTS despesas (
  id INTEGER PRIMARY KEY,
  descricao TEXT NOT NULL,
  categoria TEXT,
  valor INTEGER NOT NULL,
  data TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT
);
`);

// Migrações: adiciona colunas novas em bancos que já existem
function addColuna(tabela, coluna, tipo) {
  const existe = db.prepare(`PRAGMA table_info(${tabela})`).all().some(c => c.name === coluna);
  if (!existe) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
}
addColuna('clientes', 'nascimento', 'TEXT'); // YYYY-MM-DD
addColuna('usuarios', 'nascimento', 'TEXT');
addColuna('clientes', 'endereco', 'TEXT');
addColuna('veiculos', 'obs', 'TEXT');
addColuna('ordens', 'estoque_baixado', 'INTEGER NOT NULL DEFAULT 0');

// Estoque: produtos, movimentações e quanto cada serviço consome
db.exec(`
CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT 'uso', -- uso | venda
  unidade TEXT NOT NULL DEFAULT 'un',    -- un | L | ml | kg | g | cx | par
  quantidade REAL NOT NULL DEFAULT 0,
  minimo REAL NOT NULL DEFAULT 0,
  custo INTEGER NOT NULL DEFAULT 0,      -- centavos por unidade (custo médio)
  preco_venda INTEGER NOT NULL DEFAULT 0,
  fornecedor TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS estoque_mov (
  id INTEGER PRIMARY KEY,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,          -- entrada | uso | venda | consumo | estorno | ajuste
  quantidade REAL NOT NULL,    -- variação (+ entra, - sai)
  saldo REAL NOT NULL,         -- quantidade depois do movimento
  custo_unit INTEGER,
  valor INTEGER,
  ordem_id INTEGER REFERENCES ordens(id) ON DELETE SET NULL,
  obs TEXT,
  data TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mov_produto ON estoque_mov(produto_id, data);
CREATE TABLE IF NOT EXISTS servico_produtos (
  servico_id INTEGER NOT NULL REFERENCES servicos(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade REAL NOT NULL,
  PRIMARY KEY (servico_id, produto_id)
);
`);

// Fotos (arquivos ficam em dados/fotos) e avarias dos veículos
db.exec(`
CREATE TABLE IF NOT EXISTS avarias (
  id INTEGER PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  local TEXT NOT NULL,
  tipo TEXT NOT NULL,
  descricao TEXT,
  resolvida INTEGER NOT NULL DEFAULT 0,
  registrado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS fotos (
  id INTEGER PRIMARY KEY,
  veiculo_id INTEGER NOT NULL REFERENCES veiculos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- veiculo | avaria | obs
  avaria_id INTEGER REFERENCES avarias(id) ON DELETE CASCADE,
  arquivo TEXT NOT NULL, -- caminho relativo dentro de dados/fotos
  largura INTEGER, altura INTEGER,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_fotos_veiculo ON fotos(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_avarias_veiculo ON avarias(veiculo_id);
`);
// índices para as consultas ficarem rápidas com muitos anos de dados
db.exec(`
CREATE INDEX IF NOT EXISTS idx_pag_ordem ON pagamentos(ordem_id);
CREATE INDEX IF NOT EXISTS idx_pag_assinatura ON pagamentos(assinatura_id);
CREATE INDEX IF NOT EXISTS idx_itens_ordem ON ordem_itens(ordem_id);
CREATE INDEX IF NOT EXISTS idx_ordens_cliente ON ordens(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ordens_veiculo ON ordens(veiculo_id);
CREATE INDEX IF NOT EXISTS idx_ordens_status ON ordens(status);
CREATE INDEX IF NOT EXISTS idx_veiculos_cliente ON veiculos(cliente_id);
`);
const FOTOS_DIR = path.join(DATA_DIR, 'fotos');
fs.mkdirSync(FOTOS_DIR, { recursive: true });

const padroes = {
  nome_empresa: 'Lava Jato No Grau',
  telefone: '',
  cnpj: '',
  termos_os: 'Não nos responsabilizamos por objetos deixados no interior do veículo. Veículos não retirados em até 24h após o aviso de pronto estão sujeitos a cobrança de estadia.',
  endereco: '',
  msg_pronto: 'Olá {cliente}! Seu {veiculo} ({placa}) já está pronto aqui no {empresa}. Total: {total}. Pode vir buscar!',
  msg_aniversario: 'Feliz aniversário, {cliente}! 🎉 A equipe do {empresa} deseja um dia incrível pra você!',
};
const insCfg = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(padroes)) insCfg.run(k, v);

// Serviços de exemplo na primeira execução
if (db.prepare('SELECT COUNT(*) n FROM servicos').get().n === 0) {
  const ins = db.prepare('INSERT INTO servicos (nome, preco_pequeno, preco_medio, preco_grande, preco_moto, duracao_min) VALUES (?,?,?,?,?,?)');
  ins.run('Lavagem simples', 4000, 5000, 6000, 2500, 30);
  ins.run('Lavagem completa', 7000, 8000, 10000, 4000, 60);
  ins.run('Lavagem + cera', 9000, 11000, 13000, 5000, 75);
  ins.run('Higienização interna', 18000, 22000, 26000, 0, 180);
  ins.run('Polimento', 30000, 35000, 42000, 15000, 240);
  ins.run('Lavagem de motor', 3000, 3500, 4000, 2000, 20);
}

function transacao(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Backup: copia consistente do banco para a pasta "backups"
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
function fazerBackup(destino) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const arq = destino || path.join(BACKUP_DIR, `nograu-${new Date().toISOString().slice(0, 10)}.db`);
  if (fs.existsSync(arq)) fs.unlinkSync(arq);
  db.exec(`VACUUM INTO '${arq.replace(/'/g, "''")}'`);
  // mantém os últimos 30 backups
  const lista = fs.readdirSync(BACKUP_DIR).filter(f => /^nograu-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort();
  while (lista.length > 30) fs.unlinkSync(path.join(BACKUP_DIR, lista.shift()));
  // fotos: espelha na pasta de backup só os arquivos novos (fotos nunca mudam depois de salvas)
  if (!destino) espelharFotos(FOTOS_DIR, path.join(BACKUP_DIR, 'fotos'));
  return arq;
}
function espelharFotos(origem, destino) {
  if (!fs.existsSync(origem)) return;
  for (const item of fs.readdirSync(origem, { withFileTypes: true })) {
    const o = path.join(origem, item.name), d = path.join(destino, item.name);
    if (item.isDirectory()) espelharFotos(o, d);
    else if (!fs.existsSync(d)) { fs.mkdirSync(destino, { recursive: true }); fs.copyFileSync(o, d); }
  }
}

module.exports = { db, transacao, fazerBackup, DATA_DIR, BACKUP_DIR, FOTOS_DIR };
