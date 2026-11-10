import {
  DELIVERY_STATUS,
  deliveryLabel,
  estimateMinutes,
  pickCourier
} from '../domain/delivery.js';

export function createDeliveryHandlers({
  db,
  broker,
  logger,
  dispatchDelayMs,
  deliveryDelayMs
}) {
  const timers = new Map();

  async function publish(type, { user, message, payload = {}, correlationId = null }) {
    return broker.publish(type, { user, message, payload, correlationId });
  }

  function setTimer(key, ms, fn) {
    const timer = setTimeout(async () => {
      timers.delete(key);
      try {
        await fn();
      } catch (err) {
        logger.error(`[delivery] timer ${key} falhou: ${err.message}`);
      }
    }, ms);
    timer.unref?.();
    timers.set(key, timer);
  }

  async function dispatch(orderId, actor = 'sistema') {
    const delivery = db.byOrder(orderId);
    if (!delivery) {
      logger.warn(`[delivery] pedido ${orderId} sem entrega para despachar`);
      return false;
    }

    if (delivery.status === DELIVERY_STATUS.DISPATCHED) {
      await publish('delivery.info', {
        user: delivery.user,
        message: `A entrega do pedido #${orderId.slice(0, 8)} já saiu para rota.`,
        payload: { orderId, status: delivery.status }
      });
      return false;
    }

    if (delivery.status !== DELIVERY_STATUS.ASSIGNED) {
      await publish('delivery.info', {
        user: delivery.user,
        message: `Não é possível despachar a entrega do pedido #${orderId.slice(0, 8)} (status: ${deliveryLabel(delivery.status)}).`,
        payload: { orderId, status: delivery.status }
      });
      return false;
    }

    db.transition(orderId, DELIVERY_STATUS.ASSIGNED, DELIVERY_STATUS.DISPATCHED);
    await publish('delivery.dispatched', {
      user: delivery.user,
      message: `Pedido #${orderId.slice(0, 8)} saiu para entrega com ${delivery.courier} (${actor}).`,
      payload: { orderId, courier: delivery.courier, etaMinutes: delivery.eta_minutes },
      correlationId: orderId
    });

    if (deliveryDelayMs > 0) {
      setTimer(`deliver:${orderId}`, deliveryDelayMs, () => deliver(orderId, 'automático'));
    }
    return true;
  }

  async function deliver(orderId, actor = 'sistema') {
    const delivery = db.byOrder(orderId);
    if (!delivery) return false;

    if (delivery.status === DELIVERY_STATUS.DELIVERED) {
      return false;
    }

    if (delivery.status !== DELIVERY_STATUS.DISPATCHED) {
      await publish('delivery.info', {
        user: delivery.user,
        message: `A entrega do pedido #${orderId.slice(0, 8)} ainda não pode ser concluída (status: ${deliveryLabel(delivery.status)}).`,
        payload: { orderId, status: delivery.status }
      });
      return false;
    }

    db.transition(orderId, DELIVERY_STATUS.DISPATCHED, DELIVERY_STATUS.DELIVERED);
    await publish('delivery.delivered', {
      user: delivery.user,
      message: `Pedido #${orderId.slice(0, 8)} entregue por ${delivery.courier} (${actor}). Bom apetite!`,
      payload: { orderId, courier: delivery.courier },
      correlationId: orderId
    });
    return true;
  }

  return {
    'payment.approved': async (event) => {
      const orderId = event.payload?.orderId;
      if (!orderId) return;
      if (db.byOrder(orderId)) return;

      const courier = pickCourier();
      const etaMinutes = estimateMinutes();
      const delivery = db.createIfAbsent({
        orderId,
        user: event.user,
        courier,
        etaMinutes
      });

      await publish('delivery.assigned', {
        user: delivery.user,
        message: `Entregador ${courier} designado para o pedido #${orderId.slice(0, 8)}. Previsão: ${etaMinutes} minutos.`,
        payload: { orderId, courier, etaMinutes, status: DELIVERY_STATUS.ASSIGNED },
        correlationId: orderId
      });

      if (dispatchDelayMs > 0) {
        setTimer(`dispatch:${orderId}`, dispatchDelayMs, () => dispatch(orderId, 'automático'));
      }
    },

    'user.delivery.eta': async (event) => {
      const orderId = event.payload?.orderId;
      const delivery = db.byOrder(orderId);
      if (!delivery) {
        await publish('delivery.eta', {
          user: event.user,
          message: 'Ainda não há entrega registrada para este pedido. O pagamento precisa ser aprovado primeiro.',
          payload: { orderId, status: 'NOT_FOUND' }
        });
        return;
      }

      const message =
        delivery.status === DELIVERY_STATUS.DELIVERED
          ? `Pedido #${orderId.slice(0, 8)} já foi entregue por ${delivery.courier}.`
          : delivery.status === DELIVERY_STATUS.CANCELLED
            ? `A entrega do pedido #${orderId.slice(0, 8)} foi cancelada.`
            : `Pedido #${orderId.slice(0, 8)}: ${deliveryLabel(delivery.status)}. Entregador: ${delivery.courier}. Previsão: ${delivery.eta_minutes} min.`;

      await publish('delivery.eta', {
        user: delivery.user,
        message,
        payload: {
          orderId,
          status: delivery.status,
          courier: delivery.courier,
          etaMinutes: delivery.eta_minutes
        },
        correlationId: orderId
      });
    },

    'manager.delivery.dispatch': async (event) => {
      const orderId = event.payload?.orderId;
      const delivery = db.byOrder(orderId);
      if (!delivery) {
        await publish('delivery.info', {
          user: event.user,
          message: `Não existe entrega para o pedido #${String(orderId || '').slice(0, 8)}.`,
          payload: { orderId }
        });
        return;
      }
      await dispatch(orderId, 'operação');
    },

    'order.cancelled': async (event) => {
      const orderId = event.payload?.orderId;
      const delivery = db.byOrder(orderId);
      if (!delivery) return;

      const timerKeys = [`dispatch:${orderId}`, `deliver:${orderId}`];
      for (const key of timerKeys) {
        const timer = timers.get(key);
        if (timer) clearTimeout(timer);
        timers.delete(key);
      }

      if (delivery.status === DELIVERY_STATUS.DELIVERED) return;
      db.transition(orderId, delivery.status, DELIVERY_STATUS.CANCELLED);
      await publish('delivery.cancelled', {
        user: delivery.user,
        message: `Entrega do pedido #${orderId.slice(0, 8)} cancelada.`,
        payload: { orderId, status: DELIVERY_STATUS.CANCELLED },
        correlationId: orderId
      });
    },

    shutdown() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    }
  };
}
