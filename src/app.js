import { quickSplit, detailedSplit, summaryText, formatBRL, formatPercent, parseBRL } from './split.js';

const STORAGE_KEY = 'racha-conta:v1';
const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

function defaultState(keep = {}) {
  return {
    mode: 'quick',
    title: 'Conta do Bar',
    serviceOn: true,
    servicePercent: '10',
    cover: '',
    roundTo: '0',
    quick: { total: '', people: '2' },
    people: [{ id: 1, name: '', cover: true }, { id: 2, name: '', cover: true }],
    items: [{ id: 3, name: '', price: '', qty: '1', sharedBy: null }],
    discount: '',
    discountType: 'value',
    pixKey: '',
    pixName: '',
    nextId: 4,
    ...keep,
  };
}

function exampleState(keep) {
  return defaultState({
    ...keep,
    mode: 'detailed',
    title: 'Happy hour da firma',
    cover: '15,00',
    people: [{ id: 1, name: 'Ana', cover: true }, { id: 2, name: 'Bruno', cover: true }, { id: 3, name: 'Carla', cover: false }],
    items: [
      { id: 4, name: 'Chope 300 ml', price: '12,90', qty: '5', sharedBy: [1, 2] },
      { id: 5, name: 'Porção de fritas', price: '42,00', qty: '1', sharedBy: null },
      { id: 6, name: 'Caipirinha', price: '24,00', qty: '1', sharedBy: [3] },
      { id: 7, name: 'Água com gás', price: '6,50', qty: '2', sharedBy: [3] },
    ],
    nextId: 8,
  });
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (saved && Array.isArray(saved.people) && Array.isArray(saved.items)) {
      const base = defaultState();
      const text = (v) => (typeof v === 'string' ? v : '');
      return {
        ...base,
        ...saved,
        quick: { total: text(saved.quick?.total), people: text(saved.quick?.people) || '2' },
        people: saved.people.filter((p) => p && p.id != null).map((p) => ({ id: p.id, name: text(p.name), cover: Boolean(p.cover) })),
        items: saved.items.filter((it) => it && it.id != null).map((it) => ({
          id: it.id, name: text(it.name), price: text(it.price), qty: text(it.qty), sharedBy: Array.isArray(it.sharedBy) ? it.sharedBy : null,
        })),
      };
    }
  } catch {
    // armazenamento indisponível ou corrompido: começa do zero
  }
  return defaultState();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sem armazenamento (modo privado, por exemplo): segue sem salvar
  }
}

let state = load();
let currentSummary = '';

const getPath = (path) => path.split('.').reduce((obj, key) => obj?.[key], state);
function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((obj, key) => obj[key], state)[last] = value;
}

const personName = (p, i) => p.name.trim() || `Pessoa ${i + 1}`;

// ---------- Formulário ----------

function syncInputs() {
  for (const input of document.querySelectorAll('[data-bind]')) {
    const value = getPath(input.dataset.bind);
    if (input.type === 'checkbox') input.checked = Boolean(value);
    else input.value = value ?? '';
  }
  for (const radio of document.querySelectorAll('input[name="modo"]')) radio.checked = radio.value === state.mode;
  showMode();
}

function showMode() {
  $('painel-quick').hidden = state.mode !== 'quick';
  $('painel-detailed').hidden = state.mode !== 'detailed';
  $('servico-pct').disabled = !state.serviceOn;
}

function changed() {
  save();
  compute();
}

function textInput(id, value, attrs = {}) {
  const input = el('input', { id, autocomplete: 'off', ...attrs });
  input.value = value;
  return input;
}

function renderPeople() {
  $('lista-pessoas').replaceChildren(...state.people.map((p, i) => {
    const name = textInput(`pessoa-${p.id}`, p.name, { placeholder: `Pessoa ${i + 1}`, maxlength: '40' });
    const cover = el('input', { type: 'checkbox' });
    cover.checked = Boolean(p.cover);
    const remove = el('button', { type: 'button', class: 'remover', 'aria-label': `Remover ${personName(p, i)}` }, '×');
    name.addEventListener('input', () => {
      p.name = name.value;
      remove.setAttribute('aria-label', `Remover ${personName(p, i)}`);
      for (const label of document.querySelectorAll(`[data-person-label="${p.id}"]`)) label.textContent = personName(p, i);
      changed();
    });
    cover.addEventListener('change', () => { p.cover = cover.checked; changed(); });
    remove.addEventListener('click', () => removePerson(p.id));
    return el('li', { class: 'pessoa' },
      el('label', { for: `pessoa-${p.id}`, class: 'sr-only', text: `Nome da pessoa ${i + 1}` }),
      name,
      el('label', { class: 'check' }, cover, ' paga couvert'),
      remove);
  }));
}

function itemTotalText(item) {
  const price = parseBRL(item.price);
  const qty = Number(item.qty);
  if (!Number.isFinite(price) || !Number.isInteger(qty) || qty < 1) return '';
  return `= ${formatBRL(price * qty)}`;
}

function renderItems() {
  $('lista-itens').replaceChildren(...state.items.map((item, i) => {
    const base = `item-${item.id}`;
    const name = textInput(`${base}-nome`, item.name, { placeholder: `Item ${i + 1}`, maxlength: '60' });
    const price = textInput(`${base}-preco`, item.price, { inputmode: 'decimal', placeholder: '0,00' });
    const qty = textInput(`${base}-qtd`, item.qty, { inputmode: 'numeric' });
    const total = el('span', { class: 'item-total', text: itemTotalText(item) });
    for (const [input, key] of [[name, 'name'], [price, 'price'], [qty, 'qty']]) {
      input.addEventListener('input', () => {
        item[key] = input.value;
        total.textContent = itemTotalText(item);
        changed();
      });
    }
    const chips = state.people.map((p, pi) => {
      const box = el('input', { type: 'checkbox' });
      box.checked = item.sharedBy == null || item.sharedBy.includes(p.id);
      box.addEventListener('change', () => toggleSharer(item, p.id, box.checked));
      return el('label', { class: 'chip' }, box, el('span', { 'data-person-label': String(p.id), text: personName(p, pi) }));
    });
    const all = el('button', { type: 'button', class: 'link' }, 'marcar todos');
    all.addEventListener('click', () => { item.sharedBy = null; renderItems(); changed(); });
    const remove = el('button', { type: 'button', class: 'remover', 'aria-label': `Remover item ${i + 1}` }, '×');
    remove.addEventListener('click', () => {
      state.items = state.items.filter((it) => it !== item);
      renderItems();
      changed();
    });
    return el('fieldset', { class: 'item' },
      el('legend', { class: 'sr-only', text: `Item ${i + 1}` }),
      el('div', { class: 'item-campos' },
        el('div', { class: 'campo-nome' }, el('label', { for: name.id, text: 'Item' }), name),
        el('div', { class: 'campo-preco' }, el('label', { for: price.id, text: 'Preço (R$)' }), price),
        el('div', { class: 'campo-qtd' }, el('label', { for: qty.id, text: 'Qtd.' }), qty),
        remove),
      el('div', { class: 'dividido' }, el('span', { class: 'muted', text: 'Dividido entre:' }), ...chips, all, total));
  }));
}

function toggleSharer(item, id, checked) {
  const everyone = state.people.map((p) => p.id);
  let list = item.sharedBy ?? everyone;
  list = checked ? [...new Set([...list, id])] : list.filter((x) => x !== id);
  item.sharedBy = everyone.every((x) => list.includes(x)) ? null : list;
  changed();
}

function addPerson(name) {
  state.people.push({ id: state.nextId++, name, cover: true });
  renderPeople();
  renderItems();
  changed();
}

function removePerson(id) {
  state.people = state.people.filter((p) => p.id !== id);
  const everyone = state.people.map((p) => p.id);
  for (const item of state.items) {
    if (item.sharedBy == null) continue;
    item.sharedBy = item.sharedBy.filter((x) => x !== id);
    if (everyone.length && everyone.every((x) => item.sharedBy.includes(x))) item.sharedBy = null;
  }
  renderPeople();
  renderItems();
  changed();
}

// ---------- Resultado ----------

function breakdown(p) {
  const parts = [`consumo ${formatBRL(p.consumption)}`];
  if (p.discount) parts.push(`desconto ${formatBRL(-p.discount)}`);
  if (p.service) parts.push(`serviço ${formatBRL(p.service)}`);
  if (p.cover) parts.push(`couvert ${formatBRL(p.cover)}`);
  if (p.rounding) parts.push(`gorjeta extra ${formatBRL(p.rounding)}`);
  return parts.join(' · ');
}

function quickHeadline(people) {
  const groups = new Map();
  for (const p of people) groups.set(p.total, (groups.get(p.total) ?? 0) + 1);
  const list = [...groups].sort((a, b) => b[0] - a[0]);
  if (list.length === 1) return people.length === 1 ? `Você paga ${formatBRL(list[0][0])}` : `Cada pessoa paga ${formatBRL(list[0][0])}`;
  return list.map(([total, n]) => `${n} ${n === 1 ? 'pessoa paga' : 'pessoas pagam'} ${formatBRL(total)}`).join(' e ');
}

function totalsList(result) {
  const t = result.totals;
  const list = el('dl', { class: 'totais' });
  const add = (term, value, strong = false) => list.append(el('dt', { text: term }), el('dd', { class: strong ? 'forte' : '', text: value }));
  add('Consumo', formatBRL(t.consumption));
  if (t.discount) add('Desconto', formatBRL(-t.discount));
  if (result.serviceBp) add(`Serviço (${formatPercent(result.serviceBp)})`, formatBRL(t.service));
  if (t.cover) add('Couvert', formatBRL(t.cover));
  if (t.rounding) add('Gorjeta extra do arredondamento', formatBRL(t.rounding));
  add('Total da conta', formatBRL(t.total), true);
  return list;
}

function renderMessage(text, isError = false) {
  const box = $('resultado-conteudo');
  if (Array.isArray(text)) {
    box.replaceChildren(el('ul', { class: 'erros' }, ...text.map((t) => el('li', { text: t }))));
  } else {
    box.replaceChildren(el('p', { class: isError ? 'erros' : 'muted', text }));
  }
  currentSummary = '';
  $('resumo').textContent = 'O resumo aparece aqui quando a conta estiver preenchida.';
  $('copiar').disabled = true;
  $('compartilhar').disabled = true;
}

function renderResult(result) {
  const nodes = [];
  if (result.mode === 'quick') {
    nodes.push(el('p', { class: 'destaque', text: quickHeadline(result.people) }));
    const p = result.people[0];
    nodes.push(el('p', { class: 'detalhe', text: `Cada parte: ${breakdown(p)}` }));
    if (new Set(result.people.map((x) => x.total)).size > 1) {
      nodes.push(el('p', { class: 'hint', text: 'A diferença de 1 centavo entre as partes é para a soma fechar exatamente com a conta.' }));
    }
  } else {
    nodes.push(el('ul', { class: 'partes' }, ...result.people.map((p) => el('li', {},
      el('div', { class: 'topo' }, el('strong', { text: p.name }), el('span', { class: 'valor', text: formatBRL(p.total) })),
      el('p', { class: 'detalhe', text: breakdown(p) })))));
  }
  nodes.push(totalsList(result));
  if (result.warnings?.length) nodes.push(el('p', { class: 'aviso', text: result.warnings.join(' ') }));
  $('resultado-conteudo').replaceChildren(...nodes);

  currentSummary = summaryText(result, { title: state.title, pixKey: state.pixKey, pixName: state.pixName });
  $('resumo').textContent = currentSummary;
  $('copiar').disabled = false;
  $('compartilhar').disabled = false;
}

function compute() {
  const common = { serviceOn: state.serviceOn, servicePercent: state.servicePercent, cover: state.cover, roundTo: state.roundTo };
  let result;
  if (state.mode === 'quick') {
    if (!state.quick.total.trim()) return renderMessage('Digite o total consumido para ver quanto cada um paga.');
    result = quickSplit({ ...common, total: state.quick.total, people: state.quick.people });
  } else {
    const items = state.items.filter((it) => it.name.trim() || it.price.trim());
    if (!items.length) return renderMessage('Adicione os itens consumidos, com o preço, para ver a divisão.');
    result = detailedSplit({ ...common, people: state.people, items, discount: state.discount, discountType: state.discountType });
  }
  if (result.errors.length) return renderMessage(result.errors, true);
  return renderResult(result);
}

// ---------- Eventos ----------

for (const input of document.querySelectorAll('[data-bind]')) {
  const type = input.type === 'checkbox' || input.tagName === 'SELECT' ? 'change' : 'input';
  input.addEventListener(type, () => {
    setPath(input.dataset.bind, input.type === 'checkbox' ? input.checked : input.value);
    showMode();
    changed();
  });
}

for (const radio of document.querySelectorAll('input[name="modo"]')) {
  radio.addEventListener('change', () => {
    state.mode = radio.value;
    showMode();
    changed();
  });
}

for (const button of document.querySelectorAll('[data-step]')) {
  button.addEventListener('click', () => {
    const current = Number.parseInt(state.quick.people, 10) || 0;
    const next = Math.min(200, Math.max(1, current + Number(button.dataset.step)));
    state.quick.people = String(next);
    $('pessoas').value = state.quick.people;
    changed();
  });
}

$('form-pessoa').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('nova-pessoa');
  addPerson(input.value.trim());
  input.value = '';
  input.focus();
});

$('add-item').addEventListener('click', () => {
  const id = state.nextId++;
  state.items.push({ id, name: '', price: '', qty: '1', sharedBy: null });
  renderItems();
  changed();
  $(`item-${id}-nome`).focus();
});

$('exemplo').addEventListener('click', () => {
  state = exampleState({ pixKey: state.pixKey, pixName: state.pixName });
  syncInputs();
  renderPeople();
  renderItems();
  changed();
});

function flash(text) {
  const status = $('aviso-copia');
  status.textContent = text;
  setTimeout(() => { if (status.textContent === text) status.textContent = ''; }, 4000);
}

$('copiar').addEventListener('click', async () => {
  if (!currentSummary) return;
  try {
    await navigator.clipboard.writeText(currentSummary);
    flash('Resumo copiado! Agora é só colar no grupo.');
  } catch {
    const range = document.createRange();
    range.selectNodeContents($('resumo'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    flash('Não deu para copiar automaticamente: o texto ficou selecionado para você copiar.');
  }
});

if (typeof navigator.share === 'function') {
  $('compartilhar').hidden = false;
  $('compartilhar').addEventListener('click', () => {
    if (currentSummary) navigator.share({ text: currentSummary }).catch(() => {});
  });
}

let confirmTimer = null;
$('nova').addEventListener('click', () => {
  const button = $('nova');
  if (!button.dataset.confirm) {
    button.dataset.confirm = '1';
    button.textContent = 'Clique de novo para apagar a conta';
    confirmTimer = setTimeout(() => { delete button.dataset.confirm; button.textContent = 'Nova conta'; }, 4000);
    return;
  }
  clearTimeout(confirmTimer);
  delete button.dataset.confirm;
  button.textContent = 'Nova conta';
  state = defaultState({ mode: state.mode, pixKey: state.pixKey, pixName: state.pixName });
  syncInputs();
  renderPeople();
  renderItems();
  changed();
});

syncInputs();
renderPeople();
renderItems();
compute();
