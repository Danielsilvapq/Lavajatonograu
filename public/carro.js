// Desenho do carro visto de cima (frente para cima), com as laterais abertas para os lados.
// Usado no navegador (marcar avarias) e no servidor (mapa de avarias no PDF).
// Coordenadas num quadro de 240 x 440. Caminhos só com M, L, C e Z (absolutos).
(function (raiz) {
  const espelhar = d => d.replace(/(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g, (_, x, y) => `${240 - Number(x)} ${y}`);

  // lado esquerdo do carro (fica à esquerda no desenho); o direito é o espelho
  const LADO = [
    ['Para-lama dianteiro', 'M58 60 L58 132 L20 132 L20 74 C20 66 26 60 34 60 Z', 'lataria', ['esquerdo', 'direito']],
    ['Porta dianteira', 'M58 136 L58 210 L20 210 L20 136 Z', 'lataria', ['esquerda', 'direita']],
    ['Porta traseira', 'M58 214 L58 288 L20 288 L20 214 Z', 'lataria', ['esquerda', 'direita']],
    ['Lateral traseira', 'M58 292 L58 378 L34 378 C26 378 20 372 20 364 L20 292 Z', 'lataria', ['esquerda', 'direita']],
    ['Retrovisor', 'M18 140 L5 134 L5 156 L18 152 Z', 'retrovisor', ['esquerdo', 'direito']],
    ['Roda dianteira', 'M3 80 C3 76 5 74 8 74 L11 74 C14 74 16 76 16 80 L16 116 C16 120 14 122 11 122 L8 122 C5 122 3 120 3 116 Z', 'roda', ['esquerda', 'direita']],
    ['Roda traseira', 'M3 314 C3 310 5 308 8 308 L11 308 C14 308 16 310 16 314 L16 350 C16 354 14 356 11 356 L8 356 C5 356 3 354 3 350 Z', 'roda', ['esquerda', 'direita']],
  ];
  const CENTRO = [
    ['Para-choque dianteiro', 'M70 56 C70 32 92 20 120 20 C148 20 170 32 170 56 Z', 'lataria'],
    ['Capô', 'M68 60 L172 60 L170 132 L70 132 Z', 'lataria'],
    ['Para-brisa', 'M72 136 L168 136 L160 172 L80 172 Z', 'vidro'],
    ['Teto', 'M80 176 L160 176 L160 284 L80 284 Z', 'lataria'],
    ['Vidro traseiro', 'M80 288 L160 288 L166 316 L74 316 Z', 'vidro'],
    ['Tampa traseira / porta-malas', 'M70 320 L170 320 L172 378 L68 378 Z', 'lataria'],
    ['Para-choque traseiro', 'M68 382 L172 382 C172 406 150 420 120 420 C90 420 68 406 68 382 Z', 'lataria'],
    ['Farol esquerdo', 'M77 50 L79 36 L97 31 L97 45 Z', 'luz'],
    ['Farol direito', 'M163 50 L161 36 L143 31 L143 45 Z', 'luz'],
    ['Lanterna esquerda', 'M75 387 L95 387 L95 398 L78 398 Z', 'luz'],
    ['Lanterna direita', 'M165 387 L145 387 L145 398 L162 398 Z', 'luz'],
  ];
  const ZONAS = [
    ...CENTRO.map(([nome, d, tipo]) => ({ nome, d, tipo })),
    ...LADO.map(([base, d, tipo, [e]]) => ({ nome: `${base} ${e}`, d, tipo })),
    ...LADO.map(([base, d, tipo, [, di]]) => ({ nome: `${base} ${di}`, d: espelhar(d), tipo })),
  ];
  // centro aproximado de cada área (para os números/marcadores)
  for (const z of ZONAS) {
    const n = z.d.match(/-?\d*\.?\d+/g).map(Number); const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    z.cx = (Math.min(...xs) + Math.max(...xs)) / 2; z.cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  }
  const INTERIOR = ['Bancos', 'Painel', 'Teto interno', 'Carpete / tapetes'];
  const OUTROS = ['Soleira / caixa de ar', 'Vidro lateral', 'Pneu', 'Outro'];
  const LOCAIS = [...ZONAS.map(z => z.nome), ...INTERIOR, ...OUTROS];

  // marcados: { 'Capô': 2, ... } -> pinta a área e mostra a quantidade
  function svgCarro({ marcados = {}, selecionado = null, rotulo = 'Desenho do carro visto de cima' } = {}) {
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const zonas = ZONAS.map(z => `<path class="zona ${z.tipo}${marcados[z.nome] ? ' com-avaria' : ''}${selecionado === z.nome ? ' sel' : ''}" data-local="${esc(z.nome)}" d="${z.d}"><title>${esc(z.nome)}</title></path>`).join('');
    const marcas = ZONAS.filter(z => marcados[z.nome]).map(z => `<g class="marca"><circle cx="${z.cx}" cy="${z.cy}" r="9"/><text x="${z.cx}" y="${z.cy + 3.5}">${marcados[z.nome]}</text></g>`).join('');
    return `<svg class="carro" viewBox="-4 -16 248 466" role="img" aria-label="${esc(rotulo)}">
      <text class="legenda" x="120" y="-4">FRENTE</text>${zonas}${marcas}
      <text class="legenda" x="39" y="440">ESQ.</text><text class="legenda" x="120" y="440">TRASEIRA</text><text class="legenda" x="201" y="440">DIR.</text></svg>`;
  }

  raiz.CARRO = { ZONAS, INTERIOR, OUTROS, LOCAIS, svgCarro };
})(typeof module !== 'undefined' && module.exports ? module.exports : window);
