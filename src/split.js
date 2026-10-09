// Cálculos da divisão de conta, sempre em centavos inteiros. Módulo puro, sem DOM.

// ---------- Dinheiro ----------

/**
 * Converte texto em reais para centavos. Aceita "1.234,56", "1234,56", "R$ 12,5", "12.50" e "1.234".
 * Campo vazio → null; texto inválido ou negativo → NaN.
 */
export function parseBRL(text) {
  const s = String(text ?? '').replace(/R\$/gi, '').replace(/\s/g, '');
  if (s === '') return null;
  let integer;
  let decimals = '';
  if (s.includes(',')) {
    const m = /^(\d{1,3}(?:\.\d{3})+|\d*),(\d{0,2})$/.exec(s);
    if (!m) return NaN;
    integer = m[1].replace(/\./g, '');
    decimals = m[2];
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    integer = s.replace(/\./g, ''); // ponto como separador de milhar: "1.234"
  } else {
    const m = /^(\d*)(?:\.(\d{1,2}))?$/.exec(s);
    if (!m || (m[1] === '' && !m[2])) return NaN;
    integer = m[1];
    decimals = m[2] ?? '';
  }
  if (integer === '' && decimals === '') return NaN;
  return Number(integer || '0') * 100 + Number(decimals.padEnd(2, '0'));
}

export function formatBRL(cents) {
  const abs = Math.abs(cents);
  const reais = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 ? '−' : ''}R$ ${reais},${String(abs % 100).padStart(2, '0')}`;
}

/** Converte porcentagem ("10", "12,5") em centésimos de ponto percentual (10% → 1000). Inválido → NaN. */
export function parsePercent(text) {
  const s = String(text ?? '').replace('%', '').trim().replace(',', '.');
  if (s === '') return null;
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return NaN;
  const value = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return value > 10000 ? NaN : value;
}

/** Porcentagem (em centésimos de ponto) de um valor em centavos, arredondada para o centavo mais próximo. */
export function percentOf(cents, basisPoints) {
  return Math.floor((cents * basisPoints + 5000) / 10000);
}

// ---------- Rateio ----------

/**
 * Divide `total` centavos proporcionalmente aos pesos pelo método do maior resto:
 * cada parte recebe o piso da sua cota exata e os centavos que sobram vão para as maiores
 * frações (empate: quem vem antes na lista). As partes somam exatamente o total.
 */
export function allocate(total, weights) {
  if (weights.length === 0) return [];
  let w = weights.map((x) => BigInt(x));
  let sum = w.reduce((a, b) => a + b, 0n);
  if (sum === 0n) {
    w = w.map(() => 1n);
    sum = BigInt(w.length);
  }
  const t = BigInt(total);
  const parts = w.map((x) => (t * x) / sum);
  let left = t - parts.reduce((a, b) => a + b, 0n);
  const order = w.map((x, i) => ({ i, rest: (t * x) % sum }))
    .sort((a, b) => (a.rest === b.rest ? a.i - b.i : a.rest > b.rest ? -1 : 1));
  for (let k = 0; left > 0n; k++, left--) parts[order[k].i] += 1n;
  return parts.map(Number);
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Arredonda para cima até o próximo múltiplo de `step` centavos (0 = sem arredondamento). */
export function roundUp(cents, step) {
  if (!step) return cents;
  return Math.ceil(cents / step) * step;
}

function finish(rows, roundTo) {
  for (const r of rows) {
    const subtotal = r.consumption - r.discount + r.service + r.cover;
    r.total = roundUp(subtotal, roundTo);
    r.rounding = r.total - subtotal;
  }
  const totals = { consumption: 0, discount: 0, service: 0, cover: 0, rounding: 0, total: 0 };
  for (const r of rows) for (const key of Object.keys(totals)) totals[key] += r[key];
  return totals;
}

const MAX_CENTS = 10_000_000_000; // R$ 100 milhões em centavos: limite de sanidade

function checkMoney(errors, cents, label, { required = false } = {}) {
  if (cents === null) {
    if (required) errors.push(`Informe ${label}.`);
    return 0;
  }
  if (Number.isNaN(cents)) {
    errors.push(`Não entendi ${label}: use, por exemplo, 12,50.`);
    return 0;
  }
  if (cents > MAX_CENTS) errors.push(`${label[0].toUpperCase()}${label.slice(1)} está grande demais.`);
  return cents;
}

function readSettings(input, errors) {
  const serviceBp = input.serviceOn ? parsePercent(input.servicePercent) : 0;
  if (input.serviceOn && (serviceBp === null || Number.isNaN(serviceBp))) {
    errors.push('Porcentagem de serviço inválida. Use um número entre 0 e 100, como 10.');
  }
  const cover = checkMoney(errors, parseBRL(input.cover), 'o couvert');
  const roundTo = [0, 100, 500].includes(Number(input.roundTo)) ? Number(input.roundTo) : 0;
  return { serviceBp: Number.isFinite(serviceBp) ? serviceBp : 0, cover, roundTo };
}

/**
 * Modo rápido: total do consumo dividido igualmente, com serviço e couvert para todos.
 * input: { total, people, serviceOn, servicePercent, cover, roundTo } (textos como digitados).
 */
export function quickSplit(input) {
  const errors = [];
  const consumption = checkMoney(errors, parseBRL(input.total), 'o total da conta', { required: true });
  const count = Number(String(input.people ?? '').trim());
  if (!Number.isInteger(count) || count < 1 || count > 200) errors.push('Informe quantas pessoas vão dividir (de 1 a 200).');
  const settings = readSettings(input, errors);
  if (errors.length) return { errors };

  const service = percentOf(consumption, settings.serviceBp);
  const ones = Array(count).fill(1);
  const consumptionParts = allocate(consumption, ones);
  const baseParts = allocate(consumption + service, ones); // diferença máxima de 1 centavo entre pessoas
  const people = baseParts.map((base, i) => ({
    name: `Pessoa ${i + 1}`,
    consumption: consumptionParts[i],
    discount: 0,
    service: base - consumptionParts[i],
    cover: settings.cover,
  }));
  const totals = finish(people, settings.roundTo);
  return { errors: [], mode: 'quick', people, totals, serviceBp: settings.serviceBp, roundTo: settings.roundTo, cover: settings.cover };
}

/**
 * Modo detalhado. input: {
 *   people: [{ id, name, cover }], items: [{ name, price, qty, sharedBy: null | [ids] }],
 *   serviceOn, servicePercent, cover, discount, discountType ('value' | 'percent'), roundTo
 * }
 * Cada item é dividido igualmente entre quem consumiu (sharedBy null = todos). As cotas exatas
 * de cada pessoa são somadas antes de arredondar, então os centavos são distribuídos uma única vez.
 */
export function detailedSplit(input) {
  const errors = [];
  const people = input.people ?? [];
  if (people.length === 0) errors.push('Adicione pelo menos uma pessoa.');
  const index = new Map(people.map((p, i) => [p.id, i]));
  const settings = readSettings(input, errors);

  const items = [];
  (input.items ?? []).forEach((item, n) => {
    const label = item.name?.trim() ? `“${item.name.trim()}”` : `item ${n + 1}`;
    const price = checkMoney(errors, parseBRL(item.price), `o preço de ${label}`, { required: true });
    const qty = Number(String(item.qty ?? '').trim());
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) errors.push(`Quantidade inválida em ${label} (use um número inteiro de 1 a 999).`);
    const sharers = item.sharedBy == null
      ? people.map((_, i) => i)
      : [...new Set(item.sharedBy.filter((id) => index.has(id)).map((id) => index.get(id)))];
    if (people.length && sharers.length === 0) errors.push(`Marque quem dividiu ${label}.`);
    items.push({ total: price * (Number.isInteger(qty) ? qty : 0), sharers });
  });
  if (items.length === 0) errors.push('Adicione pelo menos um item consumido.');
  if (errors.length) return { errors };

  // Peso de cada pessoa = soma de (total do item × L / nº de pessoas no item), com L = MMC dos tamanhos.
  let lcm = 1n;
  for (const it of items) {
    const k = BigInt(it.sharers.length);
    lcm = (lcm * k) / gcd(lcm, k);
  }
  const weights = people.map(() => 0n);
  for (const it of items) {
    const share = BigInt(it.total) * (lcm / BigInt(it.sharers.length));
    for (const i of it.sharers) weights[i] += share;
  }
  const consumptionTotal = items.reduce((a, it) => a + it.total, 0);
  const consumption = allocate(consumptionTotal, weights);

  const warnings = [];
  let discountTotal;
  if (input.discountType === 'percent') {
    const bp = parsePercent(input.discount);
    if (Number.isNaN(bp)) return { errors: ['Desconto inválido. Use uma porcentagem entre 0 e 100.'] };
    discountTotal = percentOf(consumptionTotal, bp ?? 0);
  } else {
    const d = parseBRL(input.discount);
    if (Number.isNaN(d)) return { errors: ['Desconto inválido. Use, por exemplo, 20,00.'] };
    discountTotal = d ?? 0;
  }
  if (discountTotal > consumptionTotal) {
    warnings.push('O desconto era maior que o consumo e foi limitado ao valor consumido.');
    discountTotal = consumptionTotal;
  }
  const discount = allocate(discountTotal, consumption);
  const net = consumption.map((c, i) => c - discount[i]);
  const serviceTotal = percentOf(consumptionTotal - discountTotal, settings.serviceBp);
  const service = allocate(serviceTotal, net);

  const rows = people.map((p, i) => ({
    id: p.id,
    name: p.name?.trim() || `Pessoa ${i + 1}`,
    consumption: consumption[i],
    discount: discount[i],
    service: service[i],
    cover: p.cover ? settings.cover : 0,
  }));
  const totals = finish(rows, settings.roundTo);
  return { errors: [], warnings, mode: 'detailed', people: rows, totals, serviceBp: settings.serviceBp, roundTo: settings.roundTo, cover: settings.cover };
}

// ---------- Resumo para mensagem ----------

export function formatPercent(basisPoints) {
  const whole = Math.floor(basisPoints / 100);
  const frac = basisPoints % 100;
  return frac ? `${whole},${String(frac).padStart(2, '0').replace(/0$/, '')}%` : `${whole}%`;
}

/** Texto pronto para colar no WhatsApp (negrito com *asteriscos*). */
export function summaryText(result, { title = '', pixKey = '', pixName = '' } = {}) {
  const lines = [`*${title.trim() || 'Conta do Bar'}* — total ${formatBRL(result.totals.total)}`];
  if (result.mode === 'quick') {
    const groups = new Map();
    for (const p of result.people) groups.set(p.total, (groups.get(p.total) ?? 0) + 1);
    for (const [total, count] of [...groups].sort((a, b) => b[0] - a[0])) {
      lines.push(`• ${count} ${count === 1 ? 'pessoa' : 'pessoas'}: ${formatBRL(total)}${count > 1 ? ' cada' : ''}`);
    }
  } else {
    for (const p of result.people) lines.push(`• ${p.name}: ${formatBRL(p.total)}`);
  }
  const notes = [];
  if (result.totals.service > 0) notes.push(`serviço de ${formatPercent(result.serviceBp)} incluído`);
  if (result.totals.cover > 0) notes.push(`couvert de ${formatBRL(result.cover)} por pessoa`);
  if (result.totals.discount > 0) notes.push(`desconto de ${formatBRL(result.totals.discount)}`);
  if (result.totals.rounding > 0) notes.push(`arredondado para cima (+${formatBRL(result.totals.rounding)} de gorjeta)`);
  if (notes.length) lines.push(`_${notes.join(' · ')}_`);
  const key = pixKey.trim();
  const name = pixName.trim();
  if (key) lines.push(`Pix: ${key}${name ? ` (${name})` : ''}`);
  return lines.join('\n');
}
