import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_STATUS,
  buildOrder,
  canCancel,
  normalizeItems,
  statusLabel
} from '../src/domain/order.js';

test('normaliza itens e calcula o total no servidor', () => {
  const order = buildOrder({
    user: 'Ana',
    payload: {
      orderId: 'order-1',
      items: [
        { sku: 'pizza', name: 'Pizza', quantity: 2, unitPrice: 45.9 },
        { sku: 'suco', name: 'Suco', quantity: 1, unitPrice: 9.5 }
      ]
    }
  });

  assert.equal(order.user, 'Ana');
  assert.equal(order.status, ORDER_STATUS.PENDING_APPROVAL);
  assert.equal(order.total, 101.3);
  assert.equal(order.items.length, 2);
});

test('rejeita pedido sem itens', () => {
  assert.throws(() => normalizeItems([]), /pelo menos um item/);
});

test('rejeita quantidade inválida', () => {
  assert.throws(
    () => normalizeItems([{ sku: 'x', name: 'X', quantity: 0, unitPrice: 10 }]),
    /Quantidade inválida/
  );
});

test('status finais não podem ser cancelados', () => {
  assert.equal(canCancel(ORDER_STATUS.PENDING_APPROVAL), true);
  assert.equal(canCancel(ORDER_STATUS.CANCELLED), false);
  assert.equal(canCancel(ORDER_STATUS.COMPLETED), false);
  assert.equal(statusLabel(ORDER_STATUS.PAID), 'Pagamento aprovado');
});
