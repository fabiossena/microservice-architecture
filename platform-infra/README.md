# platform-infra

This directory documents the lab infrastructure. The runnable Compose file is at the repository root so the stack can start with a single command.

## Local

- RabbitMQ 3.13 Management (`orders` exchange, durable queues, management on 15672).
- Eight application containers + RabbitMQ.
- Named Docker volumes for the seven SQLite databases and RabbitMQ data.
- `orders-net` bridge network.
- HTTP health checks on every service and `restart: unless-stopped`.

The queue and binding topology is declared idempotently by the services themselves when they connect (assert exchange/queue/bind). There are no manually imported definitions.

## Production (reference)

The article mentions Kubernetes, Terraform, and monitoring. To evolve this lab:

```text
kubernetes/
  orders.yaml
  catalog.yaml
  payments.yaml
  delivery.yaml
  notify.yaml
  order-user.yaml
  order-manage.yaml
  rabbitmq.yaml
  ingress.yaml
terraform/
  network/
  cluster/
  databases/
monitoring/
  prometheus/
  grafana/
  jaeger/
  otel-collector/
```

Suggestions:

- One namespace per environment (`dev`, `staging`, `prod`) and NetworkPolicies restricting traffic.
- Secrets for RabbitMQ/Postgres credentials; never in a production Compose file.
- StatefulSet/operator for RabbitMQ or a managed service (CloudAMQP, Amazon MQ).
- `liveness`/`readiness` probes using `/health`.
- HPA by CPU and/or queue lag (KEDA).
- Ingress with TLS, authentication, and rate limiting at the gateway.
- OpenTelemetry for traces correlated by `correlationId`.
- Alerts for DLQ growth, growing queues, zero consumers, and 5xx errors.

## Minimal observability already available

- `/health` on every service (including broker state).
- Aggregated `/api/health` on the gateway.
- `/api/queues` using the RabbitMQ management API.
- Inbound/outbound history in SQLite in both views.
- `correlationId` in the event envelope.
- Simple structured logs prefixed with the service name.
