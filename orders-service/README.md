# orders-service

Serviço responsável pelo ciclo de vida do pedido (owner do agregado `Order`).

- Consome: `user.order.place`, `user.order.cancel`, `user.order.status`, `manager.order.approve`, `manager.order.cancel`, `catalog.rejected`, `payment.approved`, `payment.declined`, `delivery.delivered`
- Publica: `order.created`, `order.confirmed`, `order.cancelled`, `order.cancel_rejected`, `order.not_found`, `order.status`
- HTTP de apoio: `GET /health`, `GET /orders`
- Banco: SQLite (`orders.db`)

O pedido nasce como `PENDING_APPROVAL`. A operação pode aprovar pelo painel `order-manage-queue`; caso ninguém atue, uma aprovação automática ocorre após `AUTO_APPROVE_MS` (padrão 12s) para manter a simulação fluindo.

Aprovar dispara `order.confirmed`, que inicia a coreografia:

```
order.confirmed -> catalog-service -> catalog.reserved -> payments-service
  -> payment.approved -> delivery-service -> delivery.assigned/dispatched/delivered
```
