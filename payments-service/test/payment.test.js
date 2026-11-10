import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_STATUS, decidePayment, formatMoney } from '../src/domain/payment.js';

test('aprova pagamento dentro do limite', () => {
  assert.equal(decidePayment(120, 1000).status, PAYMENT_STATUS.APPROVED);
});

test('recusa pagamento acima do limite', () => {
  const result = decidePayment(1200, 1000);
  assert.equal(result.status, PAYMENT_STATUS.DECLINED);
  assert.match(result.reason, /limite/);
});

test('recusa valor inválido', () => {
  assert.equal(decidePayment(0, 1000).status, PAYMENT_STATUS.DECLINED);
});

test('formata moeda', () => {
  assert.match(formatMoney(123.4), /123,40/);
});
