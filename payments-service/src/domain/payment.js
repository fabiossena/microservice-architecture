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
    return { status: PAYMENT_STATUS.DECLINED, reason: 'Valor inválido para cobrança' };
  }
  if (value > limit) {
    return {
      status: PAYMENT_STATUS.DECLINED,
      reason: `Valor acima do limite de simulação (R$ ${Number(limit).toFixed(2)})`
    };
  }
  return { status: PAYMENT_STATUS.APPROVED, reason: 'Transação aprovada pela adquirente simulada' };
}

export function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}
