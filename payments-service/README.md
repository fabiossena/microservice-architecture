# payments-service

Adquirente simulada. O limite padrão de aprovação é `PAYMENT_LIMIT=1000`, configurável no Compose.

- Consome: `catalog.reserved`, `order.cancelled`, `user.payment.retry`, `manager.payment.refund`
- Publica: `payment.approved`, `payment.declined`, `payment.refunded`, `payment.info`, `payment.retry_failed`
- HTTP de apoio: `GET /health`, `GET /payments`
- Banco: SQLite com uma cobrança por `order_id`.

Regras de simulação:

1. Até R$ 1.000 o cartão é aprovado; acima disso é recusado.
2. `user.payment.retry` aprova uma cobrança que estava `DECLINED`.
3. Cancelamento de pedido com pagamento aprovado gera estorno automático.
