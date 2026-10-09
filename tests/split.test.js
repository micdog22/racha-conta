import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBRL, formatBRL, parsePercent, percentOf, allocate, roundUp, quickSplit, detailedSplit, summaryText, formatPercent,
} from '../src/split.js';

const sum = (list) => list.reduce((a, b) => a + b, 0);
const byName = (result) => Object.fromEntries(result.people.map((p) => [p.name, p]));

const PEOPLE = [
  { id: 'a', name: 'Ana', cover: true },
  { id: 'b', name: 'Bruno', cover: false },
  { id: 'c', name: 'Carla', cover: true },
];

function detailed(extra = {}) {
  return detailedSplit({
    people: PEOPLE,
    items: [
      { name: 'Chope', price: '12,90', qty: '3', sharedBy: ['a', 'b'] },
      { name: 'Porção de fritas', price: '45,90', qty: '1', sharedBy: null },
      { name: 'Refrigerante', price: '6,90', qty: '1', sharedBy: ['c'] },
    ],
    serviceOn: true,
    servicePercent: '10',
    cover: '',
    discount: '',
    discountType: 'value',
    roundTo: 0,
    ...extra,
  });
}

test('lê valores em reais no formato brasileiro', () => {
  assert.equal(parseBRL('1.234,56'), 123456);
  assert.equal(parseBRL('1234,56'), 123456);
  assert.equal(parseBRL('R$ 12,5'), 1250);
  assert.equal(parseBRL('0,99'), 99);
  assert.equal(parseBRL(',5'), 50);
  assert.equal(parseBRL('12.50'), 1250);
  assert.equal(parseBRL('1.234'), 123400);
  assert.equal(parseBRL('12.345.678,90'), 1234567890);
  assert.equal(parseBRL('  45 '), 4500);
  assert.equal(parseBRL(''), null);
  for (const bad of ['abc', '-5', '1,234', '12.3456', '1.23.4', ',', '.']) assert.ok(Number.isNaN(parseBRL(bad)), bad);
});

test('formata valores em reais', () => {
  assert.equal(formatBRL(0), 'R$ 0,00');
  assert.equal(formatBRL(7), 'R$ 0,07');
  assert.equal(formatBRL(123456), 'R$ 1.234,56');
  assert.equal(formatBRL(100000000), 'R$ 1.000.000,00');
  assert.equal(formatBRL(-500), '−R$ 5,00');
});

test('porcentagens', () => {
  assert.equal(parsePercent('10'), 1000);
  assert.equal(parsePercent('12,5'), 1250);
  assert.equal(parsePercent('13%'), 1300);
  assert.equal(parsePercent(''), null);
  assert.ok(Number.isNaN(parsePercent('101')));
  assert.ok(Number.isNaN(parsePercent('dez')));
  assert.equal(percentOf(24530, 1000), 2453);
  assert.equal(percentOf(24535, 1000), 2454); // 2453,5 arredonda para cima
  assert.equal(percentOf(24534, 1000), 2453);
  assert.equal(formatPercent(1000), '10%');
  assert.equal(formatPercent(1250), '12,5%');
});

test('rateio pelo maior resto soma exatamente o total', () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocate(1000, [1, 2, 3]), [167, 333, 500]);
  assert.deepEqual(allocate(10, [0, 5, 0]), [0, 10, 0]);
  assert.deepEqual(allocate(5, [0, 0]), [3, 2]);
  assert.deepEqual(allocate(0, [3, 4]), [0, 0]);
  for (const total of [1, 99, 12345, 98765]) {
    const parts = allocate(total, [7, 13, 1, 29, 3]);
    assert.equal(sum(parts), total);
  }
});

test('rateio é determinístico: empates favorecem quem vem antes', () => {
  assert.deepEqual(allocate(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(allocate(2, [1, 1, 1]), allocate(2, [1, 1, 1]));
});

test('modo rápido com 10% de serviço', () => {
  const r = quickSplit({ total: '245,30', people: '4', serviceOn: true, servicePercent: '10', cover: '', roundTo: 0 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.totals.service, 2453);
  assert.equal(r.totals.total, 26983);
  assert.deepEqual(r.people.map((p) => p.total), [6746, 6746, 6746, 6745]);
  for (const p of r.people) assert.ok(p.service >= 0 && p.consumption >= 0);
  assert.equal(sum(r.people.map((p) => p.consumption)), 24530);
});

test('modo rápido sem serviço e com couvert para todos', () => {
  const r = quickSplit({ total: '100', people: '3', serviceOn: false, servicePercent: '10', cover: '15', roundTo: 0 });
  assert.equal(r.totals.service, 0);
  assert.equal(r.totals.cover, 4500);
  assert.deepEqual(r.people.map((p) => p.total), [4834, 4833, 4833]);
  assert.equal(r.totals.total, 14500);
});

test('modo rápido arredondando para cima', () => {
  const r = quickSplit({ total: '245,30', people: '4', serviceOn: true, servicePercent: '10', cover: '', roundTo: 100 });
  assert.deepEqual(r.people.map((p) => p.total), [6800, 6800, 6800, 6800]);
  assert.deepEqual(r.people.map((p) => p.rounding), [54, 54, 54, 55]);
  assert.equal(r.totals.rounding, 217);
  assert.equal(r.totals.total, 27200);
  assert.equal(roundUp(6746, 500), 7000);
  assert.equal(roundUp(7000, 500), 7000);
  assert.equal(roundUp(6746, 0), 6746);
});

test('modo rápido: erros amigáveis', () => {
  assert.match(quickSplit({ total: '', people: '2', serviceOn: false }).errors[0], /total da conta/);
  assert.match(quickSplit({ total: '10', people: '0', serviceOn: false }).errors[0], /quantas pessoas/);
  assert.match(quickSplit({ total: 'dez', people: '2', serviceOn: false }).errors[0], /Não entendi o total da conta/);
  assert.match(quickSplit({ total: '10', people: '2', serviceOn: true, servicePercent: 'x' }).errors[0], /serviço/);
});

test('itens divididos só entre quem consumiu', () => {
  const r = detailed({ serviceOn: false });
  const p = byName(r);
  assert.equal(p.Ana.consumption, 1935 + 1530);
  assert.equal(p.Bruno.consumption, 1935 + 1530);
  assert.equal(p.Carla.consumption, 1530 + 690);
  assert.equal(r.totals.consumption, 9150);
  assert.equal(r.totals.total, 9150);
});

test('serviço proporcional ao consumo de cada um', () => {
  const r = detailedSplit({
    people: [{ id: 1, name: 'Ana' }, { id: 2, name: 'Bruno' }],
    items: [
      { name: 'Vinho', price: '60', qty: '1', sharedBy: [1] },
      { name: 'Cerveja', price: '10', qty: '4', sharedBy: [2] },
    ],
    serviceOn: true,
    servicePercent: '10',
  });
  const p = byName(r);
  assert.equal(r.totals.service, 1000);
  assert.equal(p.Ana.service, 600);
  assert.equal(p.Bruno.service, 400);
  assert.equal(p.Ana.total, 6600);
  assert.equal(p.Bruno.total, 4400);
});

test('centavos distribuídos uma vez só, sem acumular sobra em ninguém', () => {
  const people = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }];
  const items = Array.from({ length: 6 }, (_, i) => ({ name: `Item ${i + 1}`, price: '1,00', qty: '1', sharedBy: null }));
  const r = detailedSplit({ people, items, serviceOn: false });
  // 6 × R$ 1,00 / 3 = R$ 2,00 exatos para cada (arredondar item a item daria 2,02 / 1,99 / 1,99)
  assert.deepEqual(r.people.map((x) => x.consumption), [200, 200, 200]);

  const odd = detailedSplit({ people, items: items.slice(0, 2), serviceOn: true, servicePercent: '10' });
  assert.deepEqual(odd.people.map((x) => x.consumption), [67, 67, 66]);
  assert.equal(sum(odd.people.map((x) => x.total)), odd.totals.total);
  assert.equal(odd.totals.total, 200 + 20);
});

test('total do modo detalhado bate com a soma das partes', () => {
  const r = detailed({ cover: '18,50', discount: '7,77', roundTo: 0 });
  const t = r.totals;
  assert.equal(sum(r.people.map((p) => p.total)), t.total);
  assert.equal(t.total, t.consumption - t.discount + t.service + t.cover + t.rounding);
  assert.equal(t.service, percentOf(9150 - 777, 1000));
  for (const p of r.people) assert.ok(p.discount <= p.consumption);
});

test('couvert só para quem foi marcado e sem serviço em cima dele', () => {
  const r = detailed({ cover: '20,00' });
  const p = byName(r);
  assert.equal(p.Ana.cover, 2000);
  assert.equal(p.Bruno.cover, 0);
  assert.equal(p.Carla.cover, 2000);
  assert.equal(r.totals.service, 915); // 10% de R$ 91,50, sem o couvert
  assert.equal(r.totals.total, 9150 + 915 + 4000);
});

test('desconto em reais e em porcentagem, proporcional ao consumo', () => {
  const value = detailed({ discount: '10,00', serviceOn: false });
  assert.equal(value.totals.discount, 1000);
  assert.equal(sum(value.people.map((p) => p.discount)), 1000);
  assert.equal(value.totals.total, 8150);

  const pct = detailed({ discount: '10', discountType: 'percent', serviceOn: true, servicePercent: '10' });
  assert.equal(pct.totals.discount, 915);
  assert.equal(pct.totals.service, percentOf(9150 - 915, 1000));

  const capped = detailed({ discount: '500,00' });
  assert.equal(capped.totals.discount, 9150);
  assert.equal(capped.totals.total, 0);
  assert.equal(capped.warnings.length, 1);
});

test('arredondamento para cima por pessoa vira gorjeta extra', () => {
  const r = detailed({ roundTo: 500 });
  for (const p of r.people) {
    assert.equal(p.total % 500, 0);
    assert.ok(p.rounding >= 0 && p.rounding < 500);
  }
  assert.equal(r.totals.total, 9150 + 915 + r.totals.rounding);
});

test('modo detalhado: validação', () => {
  assert.match(detailedSplit({ people: [], items: [] }).errors[0], /pelo menos uma pessoa/);
  const noSharer = detailedSplit({ people: PEOPLE, items: [{ name: 'Água', price: '5', qty: '1', sharedBy: [] }] });
  assert.match(noSharer.errors.join(' '), /Marque quem dividiu “Água”/);
  const badQty = detailedSplit({ people: PEOPLE, items: [{ price: '5', qty: '0', sharedBy: null }] });
  assert.match(badQty.errors.join(' '), /Quantidade inválida em item 1/);
  const badPrice = detailedSplit({ people: PEOPLE, items: [{ name: 'Suco', price: 'cinco', qty: '1', sharedBy: null }] });
  assert.match(badPrice.errors.join(' '), /preço de “Suco”/);
  const removed = detailedSplit({ people: PEOPLE, items: [{ price: '5', qty: '1', sharedBy: ['zz'] }] });
  assert.match(removed.errors.join(' '), /Marque quem dividiu/);
});

test('resumo para o WhatsApp', () => {
  const r = detailed({ cover: '20' });
  const text = summaryText(r, { title: 'Aniversário da Maria Exemplo', pixKey: 'maria@example.com', pixName: 'Maria Exemplo' });
  const lines = text.split('\n');
  assert.equal(lines[0], `*Aniversário da Maria Exemplo* — total ${formatBRL(r.totals.total)}`);
  assert.equal(lines[1], `• Ana: ${formatBRL(byName(r).Ana.total)}`);
  assert.ok(lines.includes('_serviço de 10% incluído · couvert de R$ 20,00 por pessoa_'));
  assert.equal(lines.at(-1), 'Pix: maria@example.com (Maria Exemplo)');

  const quick = quickSplit({ total: '245,30', people: '4', serviceOn: true, servicePercent: '10', roundTo: 0 });
  assert.equal(summaryText(quick), [
    '*Conta do Bar* — total R$ 269,83',
    '• 3 pessoas: R$ 67,46 cada',
    '• 1 pessoa: R$ 67,45',
    '_serviço de 10% incluído_',
  ].join('\n'));
});
