# order-manage-queue

Operations center (view). It consumes customer actions and domain events for visibility into the flow, and publishes return commands to the `orders` exchange.

- Consumes: `user.#`, `order.*`, `catalog.*`, `payment.*`, `delivery.*`
- Publishes: `manager.order.approve`, `manager.order.cancel`, `manager.payment.refund`, `manager.delivery.dispatch`, `manager.catalog.restock`, `manager.reply`, `manager.broadcast`
- HTTP: `GET /health`, `GET /api/messages`, `GET /api/catalog`, `POST /api/actions`, `GET /api/stream` (SSE)
- Database: SQLite (`order-manage.db`) with inbound messages categorized as `user` / `system` and outbound as `sent`.

Reply flow:

```
[operations] -> manager.* -> owning service -> domain event -> notify-service
             -> notification.created -> order-user (customer)
```

The screen lets you choose the target user, approve/cancel orders, request refunds, dispatch deliveries, restock items, reply to a customer, or send a general announcement.
