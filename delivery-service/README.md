# delivery-service

Simulated delivery. On `payment.approved`, it creates the delivery, assigns a courier, and schedules dispatch and completion.

- Consumes: `payment.approved`, `order.cancelled`, `user.delivery.eta`, `manager.delivery.dispatch`
- Publishes: `delivery.assigned`, `delivery.dispatched`, `delivery.delivered`, `delivery.cancelled`, `delivery.eta`, `delivery.info`
- Support HTTP: `GET /health`, `GET /deliveries`
- Timings: `DISPATCH_DELAY_MS` (5s) and `DELIVERY_DELAY_MS` (15s).

Operations can dispatch earlier through the `order-manage-queue` panel. Cancelling the order clears the timers and cancels the delivery.
