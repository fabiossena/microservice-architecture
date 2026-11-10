# notify-service

Notification hub. It consumes domain events and operations reply commands, persists them, and publishes `notification.created` to the views.

- Consumes: `order.*`, `catalog.*`, `payment.*`, `delivery.*`, `manager.reply`, `manager.broadcast`
- Publishes: `notification.created`
- Support HTTP: `GET /health`, `GET /notifications?user=Alice`
- Database: SQLite; the primary key is the source event id, ensuring idempotency.

This service decouples "what happened" (domain event) from "how to notify the user" (notification). In production it could send email, push, or WebSocket messages using the same contract.
