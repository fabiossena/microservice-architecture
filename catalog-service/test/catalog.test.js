import test from 'node:test';
import assert from 'node:assert/strict';
import { availability, validateItems, formatMissing } from '../src/domain/catalog.js';

test('detecta estoque suficiente', () => {
  const result = availability(
    [{ sku: 'pizza', quantity: 2 }],
    { pizza: 10 }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test('lista itens sem estoque', () => {
  const result = availability(
    [{ sku: 'pizza', name: 'Pizza', quantity: 3 }],
    { pizza: 1 }
  );
  assert.equal(result.ok, false);
  assert.equal(result.missing[0].available, 1);
  assert.match(formatMissing(result.missing), /Pizza/);
});

test('valida itens de reserva', () => {
  assert.throws(() => validateItems([]), /sem itens/);
  assert.throws(() => validateItems([{ sku: 'x', quantity: 0 }]), /Item inválido/);
});
