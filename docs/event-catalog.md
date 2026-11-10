# Event catalog

Exchange: `orders` (topic, durable). Routing key = envelope `type`.

## Customer commands (`order-user`)

| Routing key | Main payload | Consumers | Effect |
|---|---|---|---|
| `user.order.place` | `orderId`, `items[]`, `total` | orders-service, order-manage-queue | Creates a `PENDING_APPROVAL` order and schedules automatic approval. |
| `user.order.cancel` | `orderId` | orders-service, order-manage-queue | Requests cancellation if the status allows it. |
| `user.order.status` | `orderId` | orders-service, order-manage-queue | Replies with `order.status`. |
| `user.payment.retry` | `orderId` | payments-service, order-manage-queue | Re-approves a `DECLINED` charge. |
| `user.delivery.eta` | `orderId` | delivery-service, order-manage-queue | Replies with `delivery.eta`. |
| `user.catalog.check` | `sku`, `itemName` | catalog-service, order-manage-queue | Replies with `catalog.checked`. |
| `user.support.complaint` | `message` | order-manage-queue | Stays in the operations queue for a manual reply. |

## Operations commands (`order-manage-queue`)

| Routing key | Main payload | Consumers | Effect |
|---|---|---|---|
| `manager.order.approve` | `orderId`, `targetUser` | orders-service | Confirms the order (if pending). |
| `manager.order.cancel` | `orderId`, `reason`, `targetUser` | orders-service | Cancels and triggers compensations. |
| `manager.payment.refund` | `orderId`, `targetUser` | payments-service | Refunds an approved payment. |
| `manager.delivery.dispatch` | `orderId`, `targetUser` | delivery-service | Dispatches the delivery earlier. |
| `manager.catalog.restock` | `sku`, `quantity` | catalog-service | Increases stock; the result is broadcast. |
| `manager.reply` | `targetUser`, `message` | notify-service | Direct notification to the customer. |
| `manager.broadcast` | `message` | notify-service | Notification to everyone (`user = "*"`). |

## Domain events

### orders-service

| Event | Consumers | Description |
|---|---|---|
| `order.created` | notify-service, order-manage-queue | Order created and waiting for approval. |
| `order.confirmed` | catalog-service, notify-service, order-manage-queue | Order approved; starts stock reservation. |
| `order.cancelled` | catalog-service, payments-service, delivery-service, notify-service, order-manage-queue | Order cancelled; triggers compensations. |
| `order.cancel_rejected` | notify-service, order-manage-queue | The status no longer allows cancellation (e.g. delivered). |
| `order.not_found` | notify-service, order-manage-queue | Order does not exist. |
| `order.status` | notify-service, order-manage-queue | Status query response. |

### catalog-service

| Event | Consumers | Description |
|---|---|---|
| `catalog.reserved` | payments-service, notify-service, order-manage-queue | Stock reserved; enables charging. |
| `catalog.rejected` | orders-service, notify-service, order-manage-queue | Insufficient stock; the order is rejected. |
| `catalog.checked` | notify-service, order-manage-queue | Stock query response. |
| `catalog.restocked` | notify-service, order-manage-queue | Restock completed (broadcast). |
| `catalog.released` | notify-service, order-manage-queue | Stock returned due to cancellation. |

### payments-service

| Event | Consumers | Description |
|---|---|---|
| `payment.approved` | delivery-service, orders-service, notify-service, order-manage-queue | Payment approved; creates the delivery. |
| `payment.declined` | orders-service, notify-service, order-manage-queue | Payment declined. |
| `payment.refunded` | notify-service, order-manage-queue | Refund by operations or cancellation. |
| `payment.info` | notify-service, order-manage-queue | Information when the action does not apply. |
| `payment.retry_failed` | notify-service, order-manage-queue | No charge existed to retry. |

### delivery-service

| Event | Consumers | Description |
|---|---|---|
| `delivery.assigned` | notify-service, order-manage-queue | Courier and ETA assigned. |
| `delivery.dispatched` | notify-service, order-manage-queue | Order out for delivery. |
| `delivery.delivered` | orders-service, notify-service, order-manage-queue | Delivery completed. |
| `delivery.cancelled` | notify-service, order-manage-queue | Delivery cancelled. |
| `delivery.eta` | notify-service, order-manage-queue | ETA query response. |
| `delivery.info` | notify-service, order-manage-queue | Delivery action not applicable. |

### notify-service

| Event | Consumers | Description |
|---|---|---|
| `notification.created` | order-user, (optionally push/email) | Notification ready for display, with `user`, `title`, `severity`, and original payload. |

## Envelope

```json
{
  "id": "7b3f...",
  "type": "payment.approved",
  "source": "payments-service",
  "occurredAt": "2026-11-10T14:35:12.345Z",
  "correlationId": "4f0a...",
  "user": "Alice",
  "message": "Payment of $91.80 approved for order #4f0a12bc.",
  "payload": {
    "orderId": "4f0a12bc-...",
    "paymentId": "8c21...",
    "amount": 91.8,
    "status": "APPROVED"
  }
}
```

## Conventions

- `correlationId` follows the order whenever possible.
- `user` is the notification recipient. `*` means broadcast.
- `message` is text ready for the end user (English).
- `payload` is structured for integration and debugging.
- Consumers must be idempotent; messages can be redelivered.
- New events should be additive. Avoid changing the semantics of existing payloads.

## DLQ / retry (not implemented)

Today an exception in a handler results in `nack` without requeue. In production:

1. declare `orders.dlx` + `orders.dead-letter`;
2. configure `x-dead-letter-exchange` on the queues;
3. use retry with TTL/backoff and a retry counter in the header;
4. move to the DLQ after N attempts;
5. alert and allow manual reprocessing.
