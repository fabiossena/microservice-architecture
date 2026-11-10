# order-user

Customer portal (view). Each tab/window can represent a different user (through `?user=Name` or the form).

- Consumes: `notification.created` (notifications produced by notify-service)
- Publishes customer actions: `user.order.place`, `user.order.cancel`, `user.order.status`, `user.payment.retry`, `user.delivery.eta`, `user.catalog.check`, `user.support.complaint`
- HTTP: `GET /health`, `GET /api/messages?user=...`, `GET /api/catalog`, `POST /api/actions`, `GET /api/stream` (SSE)
- Database: SQLite (`order-user.db`) with inbound and outbound queues, including timestamps.

The screen shows messages received in real time (filtered by the tab's user or broadcasts) and the log of published messages with technical details for each envelope. The inbox has a manual Refresh button and also reloads from SQLite every 10 seconds.

To simulate two customers, open `http://localhost:8071/?user=Alice` and `http://localhost:8071/?user=Bob` in different windows.
