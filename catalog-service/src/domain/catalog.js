export const DEFAULT_CATALOG = [
  { sku: 'pizza-margherita', name: 'Pizza Margherita', price: 45.9, stock: 50 },
  { sku: 'burger-artesanal', name: 'Artisan Burger', price: 32.5, stock: 30 },
  { sku: 'sushi-combo', name: 'Sushi Combo (12 pieces)', price: 58.0, stock: 20 },
  { sku: 'salada-caesar', name: 'Caesar Salad', price: 24.9, stock: 15 },
  { sku: 'pasta-ao-pesto', name: 'Pesto Pasta', price: 39.9, stock: 40 }
];

export function availability(items, stockBySku) {
  const missing = [];
  for (const item of items) {
    const available = stockBySku[item.sku] ?? 0;
    if (available < item.quantity) {
      missing.push({
        sku: item.sku,
        name: item.name || item.sku,
        requested: item.quantity,
        available
      });
    }
  }
  return { ok: missing.length === 0, missing };
}

export function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Order has no items to reserve');
  }
  return items.map((item) => {
    const quantity = Number(item.quantity);
    if (!item.sku || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Invalid item in order');
    }
    return {
      sku: String(item.sku),
      name: String(item.name || item.sku),
      quantity: Math.floor(quantity),
      unitPrice: Number(item.unitPrice) || 0
    };
  });
}

export function formatMissing(missing) {
  return missing
    .map((item) => `${item.name} (requested: ${item.requested}, available: ${item.available})`)
    .join(', ');
}
