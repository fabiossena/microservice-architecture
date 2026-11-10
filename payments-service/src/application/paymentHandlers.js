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
        logger.info(`[payments] order ${orderId} already has a charge`);
        return;
      }

      const amount = Number(total) || 0;
      const payment = db.createIfAbsent({ orderId, user, amount });
      const decision = decidePayment(amount, paymentLimit);
      db.updateStatus(orderId, decision.status, decision.reason);

      if (decision.status === PAYMENT_STATUS.APPROVED) {
        await publish('payment.approved', {
          user: payment.user,
          message: `Payment of ${formatMoney(amount)} approved for order #${String(orderId).slice(0, 8)}.`,
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
          message: `Payment of ${formatMoney(amount)} declined: ${decision.reason}. Try again from the customer panel.`,
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
          message: 'No charge is registered for this order.',
          payload: { orderId }
        });
        return;
      }

      if (payment.status === PAYMENT_STATUS.APPROVED) {
        await publish('payment.info', {
          user: payment.user,
          message: `Payment for order #${String(orderId).slice(0, 8)} is already approved.`,
          payload: { orderId, status: payment.status }
        });
        return;
      }

      if (payment.status === PAYMENT_STATUS.DECLINED) {
        db.updateStatus(orderId, PAYMENT_STATUS.APPROVED, 'Approved on retry (simulation)');
        await publish('payment.approved', {
          user: payment.user,
          message: `Retry approved: payment of ${formatMoney(payment.amount)} confirmed for order #${String(orderId).slice(0, 8)}.`,
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
        message: `Payment for order #${String(orderId).slice(0, 8)} cannot be retried (status: ${payment.status}).`,
        payload: { orderId, status: payment.status }
      });
    },

    'manager.payment.refund': async (event) => {
      const orderId = event.payload?.orderId;
      const payment = db.byOrder(orderId);
      if (!payment) {
        await publish('payment.info', {
          user: event.user,
          message: `No payment exists for order #${String(orderId || '').slice(0, 8)}.`,
          payload: { orderId }
        });
        return;
      }

      if (payment.status === PAYMENT_STATUS.REFUNDED) {
        await publish('payment.info', {
          user: payment.user,
          message: `Payment for order #${String(orderId).slice(0, 8)} has already been refunded.`,
          payload: { orderId, status: payment.status }
        });
        return;
      }

      if (payment.status !== PAYMENT_STATUS.APPROVED) {
        await publish('payment.info', {
          user: payment.user,
          message: `Cannot refund: payment status is ${payment.status}.`,
          payload: { orderId, status: payment.status }
        });
        return;
      }

      db.updateStatus(orderId, PAYMENT_STATUS.REFUNDED, 'Refund requested by operations');
      await publish('payment.refunded', {
        user: payment.user,
        message: `Refund of ${formatMoney(payment.amount)} processed for order #${String(orderId).slice(0, 8)}.`,
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
        db.updateStatus(orderId, PAYMENT_STATUS.REFUNDED, 'Automatic refund due to cancellation');
        await publish('payment.refunded', {
          user: payment.user,
          message: `Order #${String(orderId).slice(0, 8)} cancelled: automatic refund of ${formatMoney(payment.amount)} started.`,
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
        db.updateStatus(orderId, PAYMENT_STATUS.CANCELLED, 'Order cancelled');
      }
    }
  };
}
