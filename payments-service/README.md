# payments-service

Simulated payment acquirer. The default approval limit is `PAYMENT_LIMIT=1000`, configurable in Compose.

- Consumes: `catalog.reserved`, `order.cancelled`, `user.payment.retry`, `manager.payment.refund`
- Publishes: `payment.approved`, `payment.declined`, `payment.refunded`, `payment.info`, `payment.retry_failed`
- Support HTTP: `GET /health`, `GET /payments`
- Database: SQLite with one charge per `order_id`.

Simulation rules:

1. Up to $1,000 the card is approved; above that it is declined.
2. `user.payment.retry` approves a charge that was `DECLINED`.
3. Cancelling an order with an approved payment triggers an automatic refund.
