export const DELIVERY_STATUS = Object.freeze({
  ASSIGNED: 'ASSIGNED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
});

export const DELIVERY_LABELS = Object.freeze({
  ASSIGNED: 'Entregador designado',
  DISPATCHED: 'Saiu para entrega',
  DELIVERED: 'Entregue',
  CANCELLED: 'Cancelada'
});

export const COURIERS = [
  'Carlos (moto 01)',
  'Fernanda (moto 02)',
  'Rafael (bike 03)',
  'Juliana (carro 04)'
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
