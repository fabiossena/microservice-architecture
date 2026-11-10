import test from 'node:test';
import assert from 'node:assert/strict';
import { availability, validateItems, formatMissing } from '../src/domain/catalog.js';

test('detects sufficient stock', () => {
  const result = availability(
    [{ sku: 'pizza', quantity: 2 }],
    { pizza: 10 }
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test('lists items without enough stock', () => {
  const result = availability(
    [{ sku: 'pizza', name: 'Pizza', quantity: 3 }],
    { pizza: 1 }
  );
  assert.equal(result.ok, false);
  assert.equal(result.missing[0].available, 1);
  assert.match(formatMissing(result.missing), /Pizza/);
});

test('validates reservation items', () => {
  assert.throws(() => validateItems([]), /no items/);
  assert.throws(() => validateItems([{ sku: 'x', quantity: 0 }]), /Invalid item/);
});
