import { formatMissing, validateItems } from '../domain/catalog.js';

export function createCatalogHandlers({ db, broker, logger }) {
  const money = (value) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);

  async function publish(type, { user, message, payload = {}, correlationId = null }) {
    return broker.publish(type, { user, message, payload, correlationId });
  }

  return {
    'order.confirmed': async (event) => {
      const { orderId, items: rawItems, total } = event.payload || {};
      const user = event.user;
      if (!orderId) return;

      if (db.getReservation(orderId)) {
        logger.info(`[catalog] order ${orderId} already has a reservation`);
        return;
      }

      const items = validateItems(rawItems);
      const result = db.reserve(orderId, user, items);

      if (!result.ok) {
        await publish('catalog.rejected', {
          user,
          message: `Could not reserve stock for order #${String(orderId).slice(0, 8)}: ${formatMissing(result.missing)}.`,
          payload: { orderId, missing: result.missing },
          correlationId: orderId
        });
        return;
      }

      await publish('catalog.reserved', {
        user,
        message: `Stock reserved for order #${String(orderId).slice(0, 8)}. Amount to charge: ${money(total)}.`,
        payload: { orderId, user, total: Number(total) || 0, items },
        correlationId: orderId
      });
    },

    'user.catalog.check': async (event) => {
      const sku = event.payload?.sku;
      const item = db.get(sku);
      if (!item) {
        await publish('catalog.checked', {
          user: event.user,
          message: `Item "${sku || 'not provided'}" was not found in the catalog.`,
          payload: { sku }
        });
        return;
      }
      await publish('catalog.checked', {
        user: event.user,
        message: `Stock for ${item.name}: ${item.stock} unit(s), at ${money(item.price)}.`,
        payload: { sku: item.sku, name: item.name, stock: item.stock, price: item.price }
      });
    },

    'manager.catalog.restock': async (event) => {
      const sku = event.payload?.sku;
      const quantity = Number(event.payload?.quantity);
      if (!sku || !Number.isFinite(quantity) || quantity <= 0) {
        await publish('catalog.restocked', {
          user: '*',
          message: 'Restock ignored: invalid SKU or quantity.',
          payload: { sku, quantity }
        });
        return;
      }

      const item = db.restock(sku, Math.floor(quantity));
      await publish('catalog.restocked', {
        user: '*',
        message: item
          ? `Restock completed: ${item.name} now has ${item.stock} unit(s).`
          : `SKU "${sku}" was not found for restock.`,
        payload: item ? { sku: item.sku, name: item.name, stock: item.stock } : { sku }
      });
    },

    'order.cancelled': async (event) => {
      const orderId = event.payload?.orderId;
      if (!orderId) return;
      const released = db.release(orderId);
      if (!released) return;
      await publish('catalog.released', {
        user: event.user,
        message: `Stock for order #${String(orderId).slice(0, 8)} returned to the catalog.`,
        payload: { orderId, items: released },
        correlationId: orderId
      });
    }
  };
}
