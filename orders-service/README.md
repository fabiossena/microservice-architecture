# orders-service

Service responsible for the order lifecycle (owner of the `Order` aggregate).

- Consumes: `user.order.place`, `user.order.cancel`, `user.order.status`, `manager.order.approve`, `manager.order.cancel`, `catalog.rejected`, `payment.approved`, `payment.declined`, `delivery.delivered`
- Publishes: `order.created`, `order.confirmed`, `order.cancelled`, `order.cancel_rejected`, `order.not_found`, `order.status`
- Support HTTP: `GET /health`, `GET /orders`
- Database: SQLite (`orders.db`)

The order starts as `PENDING_APPROVAL`. Operations can approve it from the `order-manage-queue` panel; if nobody acts, automatic approval occurs after `AUTO_APPROVE_MS` (12s by default) to keep the simulation flowing.

Approval publishes `order.confirmed`, starting the choreography:

```
order.confirmed -> catalog-service -> catalog.reserved -> payments-service
  -> payment.approved -> delivery-service -> delivery.assigned/dispatched/delivered
```
