# Operação do laboratório

## Subir, acompanhar e derrubar

```powershell
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
docker compose down
docker compose down -v   # apaga volumes (SQLite + RabbitMQ)
```

## URLs

| O quê | URL |
|---|---|
| Dashboard | <http://localhost:8070> |
| Cliente (via gateway) | <http://localhost:8070/user/?user=Ana> |
| Operação (via gateway) | <http://localhost:8070/manage/> |
| Cliente direto | <http://localhost:8071/?user=Ana> |
| Operação direta | <http://localhost:8072> |
| RabbitMQ Management | <http://localhost:15672> (`orders` / `orders123`) |
| Health orders | <http://localhost:8091/health> |
| Health catalog | <http://localhost:8094/health> |
| Health payments | <http://localhost:8092/health> |
| Health delivery | <http://localhost:8093/health> |
| Health notify | <http://localhost:8095/health> |

## Roteiro de demonstração

1. Abra duas janelas do cliente: `?user=Ana` e `?user=Bruno`.
2. Faça um pedido em cada uma (o mesmo item pode esgotar se repetido muitas vezes).
3. Abra a operação e selecione uma mensagem de cliente.
4. Teste:
   - **Aprovar pedido** antes da aprovação automática;
   - **Cancelar pedido** e observe estoque/estorno/entrega;
   - **Reembolsar pagamento** de um pedido entregue/pago;
   - **Despachar entrega** antes do timer automático;
   - **Repor estoque** e faça nova compra;
   - **Responder ao usuário** e **comunicado geral**.
5. No cliente, teste **Consultar status**, **Tentar pagamento**, **Previsão de entrega**, **Consultar estoque** e **Falar com a operação**.
6. No dashboard, acompanhe filas e consumidores.

Para uma validação automatizada do fluxo completo:

```powershell
node scripts/smoke-test.mjs
```

## Verificações rápidas

```powershell
# containers
docker compose ps

# logs de um serviço
docker compose logs --tail=100 orders-service

# filas
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers

# inspecionar o banco de um serviço (exemplo)
docker compose exec orders-service ls -l /data
docker compose exec orders-service node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('/data/orders.db'); console.log(db.prepare('select * from orders').all())"

# testar health agregado
Invoke-RestMethod http://localhost:8070/api/health | ConvertTo-Json -Depth 5

# publicar um evento manualmente (debug)
docker compose exec rabbitmq rabbitmqadmin publish exchange=orders routing_key=user.order.place payload='{"id":"manual-1","type":"user.order.place","source":"manual","occurredAt":"2026-11-10T12:00:00Z","user":"Ana","message":"teste","payload":{"orderId":"manual-1","items":[{"sku":"pizza-margherita","name":"Pizza Margherita","quantity":1,"unitPrice":45.9}],"total":45.9}}'
```

## Problemas comuns

### Porta ocupada

Altere o lado esquerdo das portas no `docker-compose.yml` ou libere o processo:

```powershell
Get-NetTCPConnection -LocalPort 8080,8081,8082,15672 -ErrorAction SilentlyContinue
```

### Login do RabbitMQ

O Compose cria o usuário `orders` / `orders123`. Não use `guest` para conexões entre containers: por padrão o RabbitMQ restringe `guest` ao loopback.

### Nenhuma mensagem nas views

- Verifique o badge "Mensageria online" no topo.
- Confira `docker compose logs -f order-user notify-service`.
- Abra o RabbitMQ Management e veja se as filas têm consumidores.
- Verifique se o exchange `orders` existe.

### Pedido fica pendente

A aprovação automática ocorre após `AUTO_APPROVE_MS` (12s). Se o manager estiver aberto, aprove manualmente. Se o `orders-service` reiniciou antes do timer, o pedido pode permanecer pendente; aprove pela operação.

### Catálogo indisponível

As views caem para um catálogo local, mas as ações de negócio continuam dependendo do `catalog-service`. Verifique `docker compose logs catalog-service`.

### Reset completo

```powershell
docker compose down -v
docker compose up -d --build
```

## Persistência

Volumes nomeados:

- `microservice-architecture_orders-data`
- `microservice-architecture_catalog-data`
- `microservice-architecture_payments-data`
- `microservice-architecture_delivery-data`
- `microservice-architecture_notify-data`
- `microservice-architecture_order-user-data`
- `microservice-architecture_order-manage-data`
- `microservice-architecture_rabbitmq-data`

Para inspecionar:

```powershell
docker volume ls | Select-String microservice
```
