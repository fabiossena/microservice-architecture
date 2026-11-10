import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_STATUS,
  buildOrder,
  canCancel,
  normalizeItems,
  statusLabel
} from '../src/domain/order.js';

test('normalizes items and calculates the total on the server', () => {
  const order = buildOrder({
    user: 'Alice',
    payload: {
      orderId: 'order-1',
      items: [
        { sku: 'pizza', name: 'Pizza', quantity: 2, unitPrice: 45.9 },
        { sku: 'juice', name: 'Juice', quantity: 1, unitPrice: 9.5 }
      ]
    }
  });

  assert.equal(order.user, 'Alice');
  assert.equal(order.status, ORDER_STATUS.PENDING_APPROVAL);
  assert.equal(order.total, 101.3);
  assert.equal(order.items.length, 2);
});

test('rejects an order without items', () => {
  assert.throws(() => normalizeItems([]), /at least one item/);
});

test('rejects an invalid quantity', () => {
  assert.throws(
    () => normalizeItems([{ sku: 'x', name: 'X', quantity: 0, unitPrice: 10 }]),
    /Invalid quantity/
  );
});

test('final statuses cannot be cancelled', () => {
  assert.equal(canCancel(ORDER_STATUS.PENDING_APPROVAL), true);
  assert.equal(canCancel(ORDER_STATUS.CANCELLED), false);
  assert.equal(canCancel(ORDER_STATUS.COMPLETED), false);
  assert.equal(statusLabel(ORDER_STATUS.PAID), 'Payment approved');
});
