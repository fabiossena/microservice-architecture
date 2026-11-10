import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryLabel, estimateMinutes, pickCourier, COURIERS } from '../src/domain/delivery.js';

test('escolhe entregador da lista', () => {
  assert.equal(pickCourier(0), COURIERS[0]);
  assert.equal(pickCourier(0.99), COURIERS[COURIERS.length - 1]);
});

test('estima entrega dentro da faixa', () => {
  assert.equal(estimateMinutes(0), 25);
  assert.equal(estimateMinutes(0.999), 45);
});

test('traduz status', () => {
  assert.equal(deliveryLabel('DISPATCHED'), 'Saiu para entrega');
  assert.equal(deliveryLabel('DESCONHECIDO'), 'DESCONHECIDO');
});
