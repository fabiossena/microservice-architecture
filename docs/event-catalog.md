# Catálogo de eventos

Exchange: `orders` (topic, durável). Routing key = `type` do envelope.

## Comandos do cliente (`order-user`)

| Routing key | Payload principal | Consumidores | Efeito |
|---|---|---|---|
| `user.order.place` | `orderId`, `items[]`, `total` | orders-service, order-manage-queue | Cria pedido `PENDING_APPROVAL`; agenda aprovação automática. |
| `user.order.cancel` | `orderId` | orders-service, order-manage-queue | Solicita cancelamento se o status permitir. |
| `user.order.status` | `orderId` | orders-service, order-manage-queue | Responde com `order.status`. |
| `user.payment.retry` | `orderId` | payments-service, order-manage-queue | Reaprova cobrança `DECLINED`. |
| `user.delivery.eta` | `orderId` | delivery-service, order-manage-queue | Responde com `delivery.eta`. |
| `user.catalog.check` | `sku`, `itemName` | catalog-service, order-manage-queue | Responde com `catalog.checked`. |
| `user.support.complaint` | `message` | order-manage-queue | Fica na fila da operação para resposta manual. |

## Comandos da operação (`order-manage-queue`)

| Routing key | Payload principal | Consumidores | Efeito |
|---|---|---|---|
| `manager.order.approve` | `orderId`, `targetUser` | orders-service | Confirma o pedido (se pendente). |
| `manager.order.cancel` | `orderId`, `reason`, `targetUser` | orders-service | Cancela e dispara compensações. |
| `manager.payment.refund` | `orderId`, `targetUser` | payments-service | Estorna pagamento aprovado. |
| `manager.delivery.dispatch` | `orderId`, `targetUser` | delivery-service | Antecipa o despacho. |
| `manager.catalog.restock` | `sku`, `quantity` | catalog-service | Incrementa estoque; resultado é broadcast. |
| `manager.reply` | `targetUser`, `message` | notify-service | Notificação direta ao cliente. |
| `manager.broadcast` | `message` | notify-service | Notificação para todos (`user = "*"`). |

## Eventos de domínio

### orders-service

| Evento | Consumidores | Descrição |
|---|---|---|
| `order.created` | notify-service, order-manage-queue | Pedido criado aguardando aprovação. |
| `order.confirmed` | catalog-service, notify-service, order-manage-queue | Pedido aprovado; inicia reserva de estoque. |
| `order.cancelled` | catalog-service, payments-service, delivery-service, notify-service, order-manage-queue | Pedido cancelado; dispara compensações. |
| `order.cancel_rejected` | notify-service, order-manage-queue | Status não permite cancelamento (ex.: entregue). |
| `order.not_found` | notify-service, order-manage-queue | Pedido inexistente. |
| `order.status` | notify-service, order-manage-queue | Resposta de consulta de status. |

### catalog-service

| Evento | Consumidores | Descrição |
|---|---|---|
| `catalog.reserved` | payments-service, notify-service, order-manage-queue | Estoque reservado; habilita cobrança. |
| `catalog.rejected` | orders-service, notify-service, order-manage-queue | Estoque insuficiente; pedido é rejeitado. |
| `catalog.checked` | notify-service, order-manage-queue | Resposta de consulta de estoque. |
| `catalog.restocked` | notify-service, order-manage-queue | Reposição realizada (broadcast). |
| `catalog.released` | notify-service, order-manage-queue | Estoque devolvido por cancelamento. |

### payments-service

| Evento | Consumidores | Descrição |
|---|---|---|
| `payment.approved` | delivery-service, orders-service, notify-service, order-manage-queue | Pagamento aprovado; criação da entrega. |
| `payment.declined` | orders-service, notify-service, order-manage-queue | Pagamento recusado. |
| `payment.refunded` | notify-service, order-manage-queue | Estorno por operação ou cancelamento. |
| `payment.info` | notify-service, order-manage-queue | Informação quando a ação não se aplica. |
| `payment.retry_failed` | notify-service, order-manage-queue | Não havia cobrança para retentar. |

### delivery-service

| Evento | Consumidores | Descrição |
|---|---|---|
| `delivery.assigned` | notify-service, order-manage-queue | Entregador e ETA definidos. |
| `delivery.dispatched` | notify-service, order-manage-queue | Pedido saiu para entrega. |
| `delivery.delivered` | orders-service, notify-service, order-manage-queue | Entrega concluída. |
| `delivery.cancelled` | notify-service, order-manage-queue | Entrega cancelada. |
| `delivery.eta` | notify-service, order-manage-queue | Resposta de previsão. |
| `delivery.info` | notify-service, order-manage-queue | Ação de entrega não aplicável. |

### notify-service

| Evento | Consumidores | Descrição |
|---|---|---|
| `notification.created` | order-user, (opcionalmente push/e-mail) | Notificação pronta para exibição, com `user`, `title`, `severity` e payload original. |

## Envelope

```json
{
  "id": "7b3f...",
  "type": "payment.approved",
  "source": "payments-service",
  "occurredAt": "2026-11-10T14:35:12.345Z",
  "correlationId": "4f0a...",
  "user": "Ana",
  "message": "Pagamento de R$ 91.80 aprovado para o pedido #4f0a12bc.",
  "payload": {
    "orderId": "4f0a12bc-...",
    "paymentId": "8c21...",
    "amount": 91.8,
    "status": "APPROVED"
  }
}
```

## Convenções

- `correlationId` acompanha o pedido quando possível.
- `user` é o destinatário da notificação. `*` significa broadcast.
- `message` é texto pronto para o usuário final (pt-BR).
- `payload` é estruturado para integração e depuração.
- Consumidores devem ser idempotentes; mensagens podem ser reentregues.
- Novos eventos devem ser aditivos. Evite alterar semântica de payloads existentes.

## DLQ / retry (não implementado)

Hoje, uma exceção no handler resulta em `nack` sem requeue. Em produção:

1. declarar `orders.dlx` + `orders.dead-letter`;
2. configurar `x-dead-letter-exchange` nas filas;
3. usar retry com TTL/backoff e contador de tentativas no header;
4. mover para DLQ após N tentativas;
5. alertar e permitir reprocessamento manual.
