import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryLabel, estimateMinutes, pickCourier, COURIERS } from '../src/domain/delivery.js';

test('picks a courier from the list', () => {
  assert.equal(pickCourier(0), COURIERS[0]);
  assert.equal(pickCourier(0.99), COURIERS[COURIERS.length - 1]);
});

test('estimates delivery within the range', () => {
  assert.equal(estimateMinutes(0), 25);
  assert.equal(estimateMinutes(0.999), 45);
});

test('translates status labels', () => {
  assert.equal(deliveryLabel('DISPATCHED'), 'Out for delivery');
  assert.equal(deliveryLabel('UNKNOWN'), 'UNKNOWN');
});
