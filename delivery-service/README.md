# delivery-service

Entrega simulada. Ao receber `payment.approved`, cria a entrega, designa entregador e agenda o despacho e a conclusão.

- Consome: `payment.approved`, `order.cancelled`, `user.delivery.eta`, `manager.delivery.dispatch`
- Publica: `delivery.assigned`, `delivery.dispatched`, `delivery.delivered`, `delivery.cancelled`, `delivery.eta`, `delivery.info`
- HTTP de apoio: `GET /health`, `GET /deliveries`
- Tempos: `DISPATCH_DELAY_MS` (5s) e `DELIVERY_DELAY_MS` (15s).

A operação pode antecipar o despacho pelo painel `order-manage-queue`. O cancelamento do pedido remove os timers e cancela a entrega.
