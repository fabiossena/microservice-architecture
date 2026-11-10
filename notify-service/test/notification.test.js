import test from 'node:test';
import assert from 'node:assert/strict';
import { severityFor, targetUserFor, titleFor } from '../src/domain/notification.js';

test('routes broadcasts to everyone', () => {
  assert.equal(targetUserFor({ type: 'manager.broadcast', user: 'Alice' }), '*');
});

test('uses targetUser when present', () => {
  assert.equal(
    targetUserFor({ type: 'manager.reply', user: 'Operator', payload: { targetUser: 'Alice' } }),
    'Alice'
  );
});

test('falls back to the envelope user', () => {
  assert.equal(targetUserFor({ type: 'order.created', user: 'Alice' }), 'Alice');
});

test('returns titles and severities', () => {
  assert.equal(titleFor('payment.approved'), 'Payment approved');
  assert.equal(severityFor('payment.declined'), 'error');
  assert.equal(titleFor('unknown'), 'System update');
});
