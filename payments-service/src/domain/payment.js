export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  DECLINED: 'DECLINED',
  REFUNDED: 'REFUNDED',
  CANCELLED: 'CANCELLED'
});

export function decidePayment(amount, limit) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { status: PAYMENT_STATUS.DECLINED, reason: 'Invalid charge amount' };
  }
  if (value > limit) {
    return {
      status: PAYMENT_STATUS.DECLINED,
      reason: `Amount above the simulation limit (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(limit)})`
    };
  }
  return { status: PAYMENT_STATUS.APPROVED, reason: 'Transaction approved by the simulated acquirer' };
}

export function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}
