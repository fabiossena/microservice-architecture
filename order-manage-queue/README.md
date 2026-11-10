# order-manage-queue

Painel da operação (view). Consome as ações dos clientes e os eventos de domínio para dar visibilidade ao fluxo, e publica comandos de retorno no exchange `orders`.

- Consome: `user.#`, `order.*`, `catalog.*`, `payment.*`, `delivery.*`
- Publica: `manager.order.approve`, `manager.order.cancel`, `manager.payment.refund`, `manager.delivery.dispatch`, `manager.catalog.restock`, `manager.reply`, `manager.broadcast`
- HTTP: `GET /health`, `GET /api/messages`, `GET /api/catalog`, `POST /api/actions`, `GET /api/stream` (SSE)
- Banco: SQLite (`order-manage.db`) com inbound categorizado em `user` / `system` e outbound em `sent`.

Fluxo de resposta:

```
[operação] -> manager.* -> serviço dono -> evento de domínio -> notify-service
           -> notification.created -> order-user (cliente)
```

A tela permite escolher o usuário de destino, aprovar/cancelar pedidos, solicitar reembolso, despachar entrega, repor estoque, responder um cliente ou enviar um comunicado geral.
