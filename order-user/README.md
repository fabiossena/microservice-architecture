# order-user

Portal do cliente (view). Cada aba/janela pode representar um usuário diferente (via `?user=Nome` ou pelo formulário).

- Consome: `notification.created` (notificações produzidas pelo notify-service)
- Publica ações de cliente: `user.order.place`, `user.order.cancel`, `user.order.status`, `user.payment.retry`, `user.delivery.eta`, `user.catalog.check`, `user.support.complaint`
- HTTP: `GET /health`, `GET /api/messages?user=...`, `GET /api/catalog`, `POST /api/actions`, `GET /api/stream` (SSE)
- Banco: SQLite (`order-user.db`) com as filas de entrada e saída, incluindo data/hora.

A tela mostra as mensagens recebidas em tempo real (filtradas pelo usuário da aba ou broadcast) e o log das mensagens publicadas, com os detalhes técnicos de cada envelope.

Para simular dois clientes, abra `http://localhost:8071/?user=Ana` e `http://localhost:8071/?user=Bruno` em janelas diferentes.
