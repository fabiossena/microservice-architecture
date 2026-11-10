import test from 'node:test';
import assert from 'node:assert/strict';
import { PAYMENT_STATUS, decidePayment, formatMoney } from '../src/domain/payment.js';

test('approves payment within the limit', () => {
  assert.equal(decidePayment(120, 1000).status, PAYMENT_STATUS.APPROVED);
});

test('declines payment above the limit', () => {
  const result = decidePayment(1200, 1000);
  assert.equal(result.status, PAYMENT_STATUS.DECLINED);
  assert.match(result.reason, /limit/);
});

test('declines an invalid amount', () => {
  assert.equal(decidePayment(0, 1000).status, PAYMENT_STATUS.DECLINED);
});

test('formats currency in US dollars', () => {
  assert.match(formatMoney(123.4), /\$123\.40/);
});
