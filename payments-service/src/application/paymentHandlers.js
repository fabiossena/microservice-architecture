import { PAYMENT_STATUS, decidePayment, formatMoney } from '../domain/payment.js';

export function createPaymentHandlers({ db, broker, logger, paymentLimit }) {
  async function publish(type, { user, message, payload = {}, correlationId = null }) {
    return broker.publish(type, { user, message, payload, correlationId });
  }

  return {
    'catalog.reserved': async (event) => {
      const { orderId, user, total } = event.payload || {};
      if (!orderId) return;

      if (db.byOrder(orderId)) {
        logger.info(`[payments] pedido ${orderId} já possui cobrança`);
        return;
      }

      const amount = Number(total) || 0;
      const payment = db.createIfAbsent({ orderId, user, amount });
      const decision = decidePayment(amount, paymentLimit);
      db.updateStatus(orderId, decision.status, decision.reason);

      if (decision.status === PAYMENT_STATUS.APPROVED) {
        await publish('payment.approved', {
          user: payment.user,
          message: `Pagamento de ${formatMoney(amount)} aprovado para o pedido #${String(orderId).slice(0, 8)}.`,
          payload: {
            orderId,
            paymentId: payment.id,
            amount,
            status: PAYMENT_STATUS.APPROVED
          },
          correlationId: orderId
        });
      } else {
        await publish('payment.declined', {
          user: payment.user,
          message: `Pagamento de ${formatMoney(amount)} recusado: ${decision.reason}. Tente novamente pelo painel do cliente.`,
          payload: {
            orderId,
            paymentId: payment.id,
            amount,
            status: PAYMENT_STATUS.DECLINED,
            reason: decision.reason
          },
          correlationId: orderId
        });
      }
    },

    'user.payment.retry': async (event) => {
      const orderId = event.payload?.orderId;
      const payment = db.byOrder(orderId);
      if (!payment) {
        await publish('payment.retry_failed', {
          user: event.user,
          message: 'Não há cobrança registrada para este pedido.',
          payload: { orderId }
        });
        return;
      }

      if (payment.status === PAYMENT_STATUS.APPROVED) {
        await publish('payment.info', {
          user: payment.user,
          message: `O pagamento do pedido #${String(orderId).slice(0, 8)} já está aprovado.`,
          payload: { orderId, status: payment.status }
        });
        return;
      }

      if (payment.status === PAYMENT_STATUS.DECLINED) {
        db.updateStatus(orderId, PAYMENT_STATUS.APPROVED, 'Aprovado na nova tentativa (simulação)');
        await publish('payment.approved', {
          user: payment.user,
          message: `Nova tentativa aprovada: pagamento de ${formatMoney(payment.amount)} confirmado para o pedido #${String(orderId).slice(0, 8)}.`,
          payload: {
            orderId,
            paymentId: payment.id,
            amount: payment.amount,
            status: PAYMENT_STATUS.APPROVED,
            retry: true
          },
          correlationId: orderId
        });
        return;
      }

      await publish('payment.info', {
        user: payment.user,
        message: `O pagamento do pedido #${String(orderId).slice(0, 8)} não pode ser reprocessado (status: ${payment.status}).`,
        payload: { orderId, status: payment.status }
      });
    },

    'manager.payment.refund': async (event) => {
      const orderId = event.payload?.orderId;
      const payment = db.byOrder(orderId);
      if (!payment) {
        await publish('payment.info', {
          user: event.user,
          message: `Não existe pagamento para o pedido #${String(orderId || '').slice(0, 8)}.`,
          payload: { orderId }
        });
        return;
      }

      if (payment.status === PAYMENT_STATUS.REFUNDED) {
        await publish('payment.info', {
          user: payment.user,
          message: `O pagamento do pedido #${String(orderId).slice(0, 8)} já foi reembolsado.`,
          payload: { orderId, status: payment.status }
        });
        return;
      }

      if (payment.status !== PAYMENT_STATUS.APPROVED) {
        await publish('payment.info', {
          user: payment.user,
          message: `Não é possível reembolsar: o pagamento está como ${payment.status}.`,
          payload: { orderId, status: payment.status }
        });
        return;
      }

      db.updateStatus(orderId, PAYMENT_STATUS.REFUNDED, 'Reembolso solicitado pela operação');
      await publish('payment.refunded', {
        user: payment.user,
        message: `Reembolso de ${formatMoney(payment.amount)} processado para o pedido #${String(orderId).slice(0, 8)}.`,
        payload: {
          orderId,
          paymentId: payment.id,
          amount: payment.amount,
          status: PAYMENT_STATUS.REFUNDED
        },
        correlationId: orderId
      });
    },

    'order.cancelled': async (event) => {
      const orderId = event.payload?.orderId;
      const payment = db.byOrder(orderId);
      if (!payment) return;

      if (payment.status === PAYMENT_STATUS.APPROVED) {
        db.updateStatus(orderId, PAYMENT_STATUS.REFUNDED, 'Estorno automático por cancelamento');
        await publish('payment.refunded', {
          user: payment.user,
          message: `Pedido #${String(orderId).slice(0, 8)} cancelado: estorno automático de ${formatMoney(payment.amount)} iniciado.`,
          payload: {
            orderId,
            paymentId: payment.id,
            amount: payment.amount,
            status: PAYMENT_STATUS.REFUNDED,
            automatic: true
          },
          correlationId: orderId
        });
      } else if (payment.status === PAYMENT_STATUS.PENDING) {
        db.updateStatus(orderId, PAYMENT_STATUS.CANCELLED, 'Pedido cancelado');
      }
    }
  };
}
