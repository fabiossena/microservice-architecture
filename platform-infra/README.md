# platform-infra

Este diretório documenta a infraestrutura do laboratório. O Compose executável está na raiz do repositório para permitir uma subida com um único comando.

## Local

- RabbitMQ 3.13 Management (exchange `orders`, filas duráveis, management em 15672).
- Oito containers de aplicação + RabbitMQ.
- Volumes Docker nomeados para os sete bancos SQLite e para os dados do RabbitMQ.
- Rede bridge `orders-net`.
- Health checks HTTP em todos os serviços e `restart: unless-stopped`.

A topologia de filas e bindings é declarada de forma idempotente pelos próprios serviços ao conectar (assert exchange/queue/bind). Não há definitions importadas manualmente.

## Produção (referência)

O artigo cita Kubernetes, Terraform e monitoramento. Para evoluir este laboratório:

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

Sugestões:

- Um namespace por ambiente (`dev`, `staging`, `prod`) e NetworkPolicies restringindo tráfego.
- Secrets para credenciais do RabbitMQ/Postgres; nunca no Compose de produção.
- StatefulSet/operador para RabbitMQ ou serviço gerenciado (CloudAMQP, Amazon MQ).
- Probes `liveness`/`readiness` usando `/health`.
- HPA por CPU e/ou lag de fila (KEDA).
- Ingress com TLS, autenticação e rate limit no gateway.
- OpenTelemetry para traces correlacionados por `correlationId`.
- Alertas para DLQ, fila crescendo, consumidores zerados e erros 5xx.

## Observabilidade mínima já disponível

- `/health` em todos os serviços (inclui estado do broker).
- `/api/health` agregado no gateway.
- `/api/queues` consumindo a API de management do RabbitMQ.
- Histórico de entrada/saída em SQLite em ambas as views.
- `correlationId` no envelope de eventos.
- Logs estruturados simples com prefixo do serviço.
