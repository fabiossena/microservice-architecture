import {
  ORDER_STATUS,
  buildOrder,
  canCancel,
  formatMoney,
  shortId,
  statusLabel
} from '../domain/order.js';

/**
 * Orders service use cases.
 * This service owns the order lifecycle and reacts to events from other services.
 */
export function createOrderHandlers({ db, broker, logger, autoApproveMs }) {
  const timers = new Map();

  async function publish(type, { user, message, payload = {}, correlationId = null }) {
    return broker.publish(type, { user, message, payload, correlationId });
  }

  function scheduleAutoApproval(orderId) {
    if (!autoApproveMs || autoApproveMs <= 0) return;
    const timer = setTimeout(async () => {
      timers.delete(orderId);
      try {
        const order = db.get(orderId);
        if (order?.status === ORDER_STATUS.PENDING_APPROVAL) {
          await confirm(order, 'Automatic simulation approval');
        }
      } catch (err) {
        logger.error(`[orders] automatic approval failed: ${err.message}`);
      }
    }, autoApproveMs);
    timer.unref?.();
    timers.set(orderId, timer);
  }

  async function confirm(order, reason) {
    const confirmed = db.transition(
      order.id,
      ORDER_STATUS.PENDING_APPROVAL,
      ORDER_STATUS.CONFIRMED,
      reason
    );

    if (!confirmed) {
      const current = db.get(order.id);
      if (current) {
        await publish('order.status', {
          user: current.user,
          message: `Order #${shortId(current.id)} is already "${statusLabel(current.status)}".`,
          payload: { orderId: current.id, status: current.status },
          correlationId: current.id
        });
      }
      return false;
    }

    const updated = db.get(order.id);
    const items = JSON.parse(updated.items);
    await publish('order.confirmed', {
      user: updated.user,
      message: `Order #${shortId(updated.id)} approved (${reason}). Total: ${formatMoney(updated.total)}.`,
      payload: {
        orderId: updated.id,
        total: updated.total,
        items,
        reason
      },
      correlationId: updated.id
    });
    return true;
  }

  async function cancel(order, reason, actor) {
    if (!canCancel(order.status)) {
      await publish('order.cancel_rejected', {
        user: order.user,
        message: `Order #${shortId(order.id)} can no longer be cancelled (status: ${statusLabel(order.status)}).`,
        payload: { orderId: order.id, status: order.status, actor },
        correlationId: order.id
      });
      return false;
    }

    db.forceStatus(order.id, ORDER_STATUS.CANCELLED, reason);
    const updated = db.get(order.id);
    await publish('order.cancelled', {
      user: updated.user,
      message: `Order #${shortId(updated.id)} cancelled by ${actor}. Reason: ${reason}.`,
      payload: {
        orderId: updated.id,
        previousStatus: order.status,
        total: updated.total,
        items: JSON.parse(updated.items),
        reason,
        actor
      },
      correlationId: updated.id
    });
    return true;
  }

  return {
    'user.order.place': async (event) => {
      const order = buildOrder(event);
      if (db.get(order.id)) return;

      db.insert(order);
      await publish('order.created', {
        user: order.user,
        message: `Order #${shortId(order.id)} created for ${formatMoney(order.total)}. Waiting for operations approval.`,
        payload: {
          orderId: order.id,
          total: order.total,
          items: order.items,
          status: order.status
        },
        correlationId: order.id
      });
      scheduleAutoApproval(order.id);
    },

    'user.order.cancel': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order) {
        await publish('order.not_found', {
          user: event.user,
          message: 'The order to cancel was not found.',
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      if (order.user !== event.user) {
        await publish('order.cancel_rejected', {
          user: event.user,
          message: 'This order belongs to another user.',
          payload: { orderId: order.id }
        });
        return;
      }
      await cancel(order, 'Customer request', 'customer');
    },

    'manager.order.cancel': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order) {
        await publish('order.not_found', {
          user: event.user,
          message: `Order #${shortId(event.payload?.orderId)} was not found for cancellation.`,
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      await cancel(order, event.payload?.reason || 'Operations cancellation', 'operations');
    },

    'manager.order.approve': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order) {
        await publish('order.not_found', {
          user: event.user,
          message: `Order #${shortId(event.payload?.orderId)} was not found for approval.`,
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      await confirm(order, 'Manual operations approval');
    },

    'user.order.status': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order) {
        await publish('order.not_found', {
          user: event.user,
          message: 'Order not found. Check the order code.',
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      await publish('order.status', {
        user: order.user,
        message: `Order #${shortId(order.id)}: ${statusLabel(order.status)}. Total: ${formatMoney(order.total)}.`,
        payload: {
          orderId: order.id,
          status: order.status,
          total: order.total,
          updatedAt: order.updated_at
        },
        correlationId: order.id
      });
    },

    'catalog.rejected': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order || [ORDER_STATUS.CANCELLED, ORDER_STATUS.COMPLETED].includes(order.status)) return;
      db.forceStatus(order.id, ORDER_STATUS.REJECTED, 'Insufficient stock');
    },

    'payment.approved': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order || [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED, ORDER_STATUS.COMPLETED].includes(order.status)) return;
      db.forceStatus(order.id, ORDER_STATUS.PAID, 'Payment approved');
    },

    'payment.declined': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order || [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED, ORDER_STATUS.COMPLETED].includes(order.status)) return;
      db.forceStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, 'Payment declined');
    },

    'delivery.delivered': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order || order.status === ORDER_STATUS.CANCELLED) return;
      db.forceStatus(order.id, ORDER_STATUS.COMPLETED, 'Delivery completed');
    },

    shutdown() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    }
  };
}
