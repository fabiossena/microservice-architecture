import test from 'node:test';
import assert from 'node:assert/strict';
import { severityFor, targetUserFor, titleFor } from '../src/domain/notification.js';

test('destina broadcast para todos', () => {
  assert.equal(targetUserFor({ type: 'manager.broadcast', user: 'Ana' }), '*');
});

test('usa targetUser quando presente', () => {
  assert.equal(
    targetUserFor({ type: 'manager.reply', user: 'Operador', payload: { targetUser: 'Ana' } }),
    'Ana'
  );
});

test('fallback para usuário do envelope', () => {
  assert.equal(targetUserFor({ type: 'order.created', user: 'Ana' }), 'Ana');
});

test('títulos e severidades', () => {
  assert.equal(titleFor('payment.approved'), 'Pagamento aprovado');
  assert.equal(severityFor('payment.declined'), 'error');
  assert.equal(titleFor('desconhecido'), 'Atualização do sistema');
});
