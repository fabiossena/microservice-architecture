# notify-service

Hub de notificações. Consome eventos de domínio e comandos de resposta da operação, persiste e publica `notification.created` para as views.

- Consome: `order.*`, `catalog.*`, `payment.*`, `delivery.*`, `manager.reply`, `manager.broadcast`
- Publica: `notification.created`
- HTTP de apoio: `GET /health`, `GET /notifications?user=Ana`
- Banco: SQLite; a PK é o id do evento de origem, garantindo idempotência.

Este serviço desacopla "o que aconteceu" (evento de domínio) de "como avisar o usuário" (notificação). Em produção poderia enviar e-mail, push ou websocket, mantendo o mesmo contrato.
