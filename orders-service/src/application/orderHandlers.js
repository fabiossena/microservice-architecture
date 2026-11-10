import {
  ORDER_STATUS,
  buildOrder,
  canCancel,
  formatMoney,
  shortId,
  statusLabel
} from '../domain/order.js';

/**
 * Casos de uso do serviço de pedidos.
 * O serviço é dono do ciclo de vida do pedido e reage aos eventos dos demais serviços.
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
          await confirm(order, 'Aprovação automática da simulação');
        }
      } catch (err) {
        logger.error(`[orders] falha na aprovação automática: ${err.message}`);
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
          message: `O pedido #${shortId(current.id)} já está com o status "${statusLabel(current.status)}".`,
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
      message: `Pedido #${shortId(updated.id)} aprovado (${reason}). Valor: ${formatMoney(updated.total)}.`,
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
        message: `O pedido #${shortId(order.id)} não pode mais ser cancelado (status: ${statusLabel(order.status)}).`,
        payload: { orderId: order.id, status: order.status, actor },
        correlationId: order.id
      });
      return false;
    }

    db.forceStatus(order.id, ORDER_STATUS.CANCELLED, reason);
    const updated = db.get(order.id);
    await publish('order.cancelled', {
      user: updated.user,
      message: `Pedido #${shortId(updated.id)} cancelado por ${actor}. Motivo: ${reason}.`,
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
        message: `Pedido #${shortId(order.id)} criado no valor de ${formatMoney(order.total)}. Aguardando aprovação da operação.`,
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
          message: `O pedido informado não foi encontrado para cancelamento.`,
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      if (order.user !== event.user) {
        await publish('order.cancel_rejected', {
          user: event.user,
          message: 'Este pedido pertence a outro usuário.',
          payload: { orderId: order.id }
        });
        return;
      }
      await cancel(order, 'Solicitação do cliente', 'cliente');
    },

    'manager.order.cancel': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order) {
        await publish('order.not_found', {
          user: event.user,
          message: `Pedido #${shortId(event.payload?.orderId)} não encontrado para cancelamento.`,
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      await cancel(order, event.payload?.reason || 'Cancelamento pela operação', 'operação');
    },

    'manager.order.approve': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order) {
        await publish('order.not_found', {
          user: event.user,
          message: `Pedido #${shortId(event.payload?.orderId)} não encontrado para aprovação.`,
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      await confirm(order, 'Aprovação manual da operação');
    },

    'user.order.status': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order) {
        await publish('order.not_found', {
          user: event.user,
          message: 'Pedido não encontrado. Confira o código informado.',
          payload: { orderId: event.payload?.orderId || null }
        });
        return;
      }
      await publish('order.status', {
        user: order.user,
        message: `Pedido #${shortId(order.id)}: ${statusLabel(order.status)}. Total: ${formatMoney(order.total)}.`,
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
      db.forceStatus(order.id, ORDER_STATUS.REJECTED, 'Estoque insuficiente');
    },

    'payment.approved': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order || [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED, ORDER_STATUS.COMPLETED].includes(order.status)) return;
      db.forceStatus(order.id, ORDER_STATUS.PAID, 'Pagamento aprovado');
    },

    'payment.declined': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order || [ORDER_STATUS.CANCELLED, ORDER_STATUS.REJECTED, ORDER_STATUS.COMPLETED].includes(order.status)) return;
      db.forceStatus(order.id, ORDER_STATUS.PAYMENT_FAILED, 'Pagamento recusado');
    },

    'delivery.delivered': async (event) => {
      const order = db.get(event.payload?.orderId);
      if (!order || order.status === ORDER_STATUS.CANCELLED) return;
      db.forceStatus(order.id, ORDER_STATUS.COMPLETED, 'Entrega concluída');
    },

    shutdown() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    }
  };
}
