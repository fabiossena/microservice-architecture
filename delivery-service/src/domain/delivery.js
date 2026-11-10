export const DELIVERY_STATUS = Object.freeze({
  ASSIGNED: 'ASSIGNED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
});

export const DELIVERY_LABELS = Object.freeze({
  ASSIGNED: 'Courier assigned',
  DISPATCHED: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled'
});

export const COURIERS = [
  'Carlos (motorcycle 01)',
  'Fernanda (motorcycle 02)',
  'Rafael (bike 03)',
  'Juliana (car 04)'
];

export function pickCourier(seed = Math.random()) {
  return COURIERS[Math.floor(seed * COURIERS.length) % COURIERS.length];
}

export function estimateMinutes(seed = Math.random()) {
  return 25 + Math.floor(seed * 21);
}

export function deliveryLabel(status) {
  return DELIVERY_LABELS[status] || status;
}
