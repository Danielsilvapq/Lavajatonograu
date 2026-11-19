// Gerador de PDF simples, sem dependências (fontes padrão Helvetica, página A4).
// Suporta texto com acentos (WinAnsi), negrito, linhas, retângulos, quebra de linha e várias páginas.

const LARG_NORMAL = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const LARG_NEGRITO = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const ESPECIAIS = { '—': 0x97, '–': 0x96, '•': 0x95, '“': 0x93, '”': 0x94, '‘': 0x91, '’': 0x92, '…': 0x85, '€': 0x80 };

// converte texto para bytes WinAnsi (1 byte por caractere)
function paraWinAnsi(s) {
  let out = '';
  for (const ch of String(s ?? '')) {
    const c = ch.codePointAt(0);
    if (ESPECIAIS[ch]) out += String.fromCharCode(ESPECIAIS[ch]);
    else if (c >= 32 && c < 127) out += ch;
    else if (c >= 160 && c < 256) out += ch;
    else if (c === 9 || c === 10) out += ' ';
    else out += '?';
  }
  return out;
}
function largCaractere(byte, negrito) {
  const t = negrito ? LARG_NEGRITO : LARG_NORMAL;
  if (byte >= 32 && byte < 127) return t[byte - 32];
  if (byte >= 0xC0) { // letra acentuada: usa a largura da letra sem acento
    const base = String.fromCharCode(byte).normalize('NFD')[0].charCodeAt(0);
    if (base >= 32 && base < 127) return t[base - 32];
  }
  return 556;
}
function larguraTexto(s, tam, negrito) {
  const b = paraWinAnsi(s); let w = 0;
  for (let i = 0; i < b.length; i++) w += largCaractere(b.charCodeAt(i), negrito);
  return w * tam / 1000;
}
const escPdf = s => paraWinAnsi(s).replace(/[\\()]/g, m => '\\' + m);
const cor = hex => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(v => v.toFixed(3)).join(' '); };

// lê largura, altura e nº de canais de um JPEG
function infoJpeg(buf) {
  if (!buf || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let i = 2;
  while (i < buf.length - 9) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC)
      return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7), canais: buf[i + 9] };
    i += 2 + len;
  }
  return null;
}

class Documento {
  constructor({ margem = 40 } = {}) {
    this.L = 595.28; this.A = 841.89; this.m = margem;
    this.paginas = []; this.imagens = []; this.novaPagina();
  }
  novaPagina() { this.atual = []; this.paginas.push(this.atual); this.y = this.m; if (this.aoNovaPagina) this.aoNovaPagina(this); }
  // y é medido a partir do topo da página
  texto(x, y, s, { tam = 10, negrito = false, cor: c = '#1b2533', alinhar = 'esq', larg } = {}) {
    let px = x;
    if (alinhar !== 'esq') { const w = larguraTexto(s, tam, negrito); px = alinhar === 'dir' ? x + (larg || 0) - w : x + ((larg || 0) - w) / 2; }
    this.atual.push(`BT /${negrito ? 'F2' : 'F1'} ${tam} Tf ${cor(c)} rg ${px.toFixed(2)} ${(this.A - y - tam * 0.8).toFixed(2)} Td (${escPdf(s)}) Tj ET`);
  }
  linha(x1, y1, x2, y2, { cor: c = '#dfe5ee', esp = 0.8 } = {}) {
    this.atual.push(`${cor(c)} RG ${esp} w ${x1.toFixed(2)} ${(this.A - y1).toFixed(2)} m ${x2.toFixed(2)} ${(this.A - y2).toFixed(2)} l S`);
  }
  retangulo(x, y, w, h, { preencher, borda, esp = 0.8 } = {}) {
    const r = `${x.toFixed(2)} ${(this.A - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`;
    if (preencher && borda) this.atual.push(`${cor(preencher)} rg ${cor(borda)} RG ${esp} w ${r} B`);
    else if (preencher) this.atual.push(`${cor(preencher)} rg ${r} f`);
    else this.atual.push(`${cor(borda || '#dfe5ee')} RG ${esp} w ${r} S`);
  }
  // desenha um caminho no formato SVG (M, L, C, Z absolutos), posicionado em (ox, oy) com escala s
  caminho(d, ox, oy, s, { preencher, borda, esp = 0.6 } = {}) {
    const ops = []; const tok = d.match(/[MLCZ]|-?\d*\.?\d+/g); let cmd = null, nums = [];
    const ponto = (x, y) => `${(ox + x * s).toFixed(2)} ${(this.A - oy - y * s).toFixed(2)}`;
    const fechar = () => {
      if (!cmd) return;
      if (cmd === 'Z') ops.push('h');
      else for (let i = 0; i < nums.length;) {
        if (cmd === 'C') { ops.push(`${ponto(nums[i], nums[i + 1])} ${ponto(nums[i + 2], nums[i + 3])} ${ponto(nums[i + 4], nums[i + 5])} c`); i += 6; }
        else { ops.push(`${ponto(nums[i], nums[i + 1])} ${cmd === 'M' ? 'm' : 'l'}`); i += 2; }
      }
    };
    for (const t of tok) { if (/[MLCZ]/.test(t)) { fechar(); cmd = t; nums = []; } else nums.push(Number(t)); }
    fechar();
    const pinta = preencher && borda ? `${cor(preencher)} rg ${cor(borda)} RG ${esp} w B` : preencher ? `${cor(preencher)} rg f` : `${cor(borda || '#8a99ad')} RG ${esp} w S`;
    this.atual.push(ops.join(' ') + ' ' + pinta);
  }
  circulo(x, y, r, opc = {}) {
    const k = 0.5523 * r;
    const d = `M${x + r} ${y} C${x + r} ${y + k} ${x + k} ${y + r} ${x} ${y + r} C${x - k} ${y + r} ${x - r} ${y + k} ${x - r} ${y} C${x - r} ${y - k} ${x - k} ${y - r} ${x} ${y - r} C${x + k} ${y - r} ${x + r} ${y - k} ${x + r} ${y} Z`;
    this.caminho(d, 0, 0, 1, opc);
  }
  // desenha um JPEG cabendo na caixa (mantém a proporção); devolve o tamanho usado
  imagem(buf, x, y, maxL, maxA) {
    const info = infoJpeg(buf); if (!info) return null;
    const esc = Math.min(maxL / info.largura, maxA / info.altura);
    const w = info.largura * esc, h = info.altura * esc;
    const nome = 'Im' + (this.imagens.length + 1);
    this.imagens.push({ nome, buf, info });
    this.atual.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(this.A - y - h).toFixed(2)} cm /${nome} Do Q`);
    return { w, h };
  }
  // quebra o texto em linhas que cabem na largura
  quebrar(s, larg, tam = 10, negrito = false) {
    const linhas = [];
    for (const par of String(s ?? '').split(/\r?\n/)) {
      let atual = '';
      for (const palavra of par.split(/\s+/)) {
        const teste = atual ? atual + ' ' + palavra : palavra;
        if (larguraTexto(teste, tam, negrito) <= larg || !atual) atual = teste; else { linhas.push(atual); atual = palavra; }
      }
      linhas.push(atual);
    }
    return linhas;
  }
  // garante espaço; se não houver, cria nova página
  espaco(h) { if (this.y + h > this.A - this.m - 20) { this.novaPagina(); return true; } return false; }

  gerar(titulo = 'Documento') {
    const objs = [];
    const add = s => { objs.push(s); return objs.length; };
    const catalogo = add(null), paginasId = add(null);
    const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const imgs = this.imagens.map(im => {
      const cs = im.info.canais === 1 ? '/DeviceGray' : im.info.canais === 4 ? '/DeviceCMYK' : '/DeviceRGB';
      return `/${im.nome} ` + add(`<< /Type /XObject /Subtype /Image /Width ${im.info.largura} /Height ${im.info.altura} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.buf.length} >>\nstream\n${im.buf.toString('latin1')}\nendstream`) + ' 0 R';
    });
    const xobj = imgs.length ? ` /XObject << ${imgs.join(' ')} >>` : '';
    const ids = [];
    this.paginas.forEach((cmds, i) => {
      // rodapé com número da página
      const rod = `BT /F1 8 Tf ${cor('#8a96a8')} rg ${(this.L - this.m - 60).toFixed(2)} 22 Td (${escPdf(`Página ${i + 1} de ${this.paginas.length}`)}) Tj ET`;
      const conteudo = [...cmds, rod].join('\n');
      const c = add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
      ids.push(add(`<< /Type /Page /Parent ${paginasId} 0 R /MediaBox [0 0 ${this.L} ${this.A}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xobj} >> /Contents ${c} 0 R >>`));
    });
    objs[catalogo - 1] = `<< /Type /Catalog /Pages ${paginasId} 0 R >>`;
    objs[paginasId - 1] = `<< /Type /Pages /Kids [${ids.map(i => i + ' 0 R').join(' ')}] /Count ${ids.length} >>`;
    const info = add(`<< /Title (${escPdf(titulo)}) /Producer (Sistema No Grau) >>`);
    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const offs = [];
    objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return Buffer.from(pdf, 'latin1');
  }
}

module.exports = { Documento, larguraTexto, infoJpeg };
