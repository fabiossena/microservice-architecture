# Running the lab

## Start, monitor, and stop

```powershell
Copy-Item .env.example .env
docker compose up -d --build
docker compose ps
docker compose logs -f --tail=100
docker compose down
docker compose down -v   # deletes volumes (SQLite + RabbitMQ)
```

## URLs

| What | URL |
|---|---|
| Dashboard | <http://localhost:8070> |
| Customer (through gateway) | <http://localhost:8070/user/?user=Alice> |
| Operations (through gateway) | <http://localhost:8070/manage/> |
| Customer (direct) | <http://localhost:8071/?user=Alice> |
| Operations (direct) | <http://localhost:8072> |
| RabbitMQ Management | <http://localhost:15672> (`orders` / `orders123`) |
| Orders health | <http://localhost:8091/health> |
| Catalog health | <http://localhost:8094/health> |
| Payments health | <http://localhost:8092/health> |
| Delivery health | <http://localhost:8093/health> |
| Notify health | <http://localhost:8095/health> |

## Demo script

1. Open two customer windows: `?user=Alice` and `?user=Bob`.
2. Place an order in each one (the same item may run out if repeated many times).
3. Open operations and select a customer message.
4. Try:
   - **Approve order** before automatic approval;
   - **Cancel order** and watch stock/refund/delivery;
   - **Refund payment** for a paid/delivered order;
   - **Dispatch delivery** before the automatic timer;
   - **Restock stock** and place another order;
   - **Reply to customer** and **general announcement**.
5. In the customer window, try **Check status**, **Retry payment**, **Delivery ETA**, **Check stock**, and **Contact operations**.
6. On the dashboard, watch queues and consumers.

For an automated full-flow check:

```powershell
node scripts/smoke-test.mjs
```

## Quick checks

```powershell
# containers
docker compose ps

# service logs
docker compose logs --tail=100 orders-service

# queues
docker compose exec rabbitmq rabbitmqctl list_queues name messages consumers

# inspect a service database (example)
docker compose exec orders-service ls -l /data
docker compose exec orders-service node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('/data/orders.db'); console.log(db.prepare('select * from orders').all())"

# aggregated health
Invoke-RestMethod http://localhost:8070/api/health | ConvertTo-Json -Depth 5

# publish an event manually (debug)
docker compose exec rabbitmq rabbitmqadmin publish exchange=orders routing_key=user.order.place payload='{"id":"manual-1","type":"user.order.place","source":"manual","occurredAt":"2026-11-10T12:00:00Z","user":"Alice","message":"test","payload":{"orderId":"manual-1","items":[{"sku":"pizza-margherita","name":"Pizza Margherita","quantity":1,"unitPrice":45.9}],"total":45.9}}'
```

## Common problems

### Port already in use

Change the host side of the port mapping in `docker-compose.yml` or free the process:

```powershell
Get-NetTCPConnection -LocalPort 8070,8071,8072,15672 -ErrorAction SilentlyContinue
```

### RabbitMQ login

The Compose stack creates the user `orders` / `orders123`. Do not use `guest` for connections between containers: RabbitMQ restricts `guest` to loopback by default.

### No messages in the views

- Check the "Messaging online" badge at the top.
- Inspect `docker compose logs -f order-user notify-service`.
- Open RabbitMQ Management and verify the queues have consumers.
- Verify the `orders` exchange exists.

### Order stays pending

Automatic approval happens after `AUTO_APPROVE_MS` (12s). If the manager is open, approve it manually. If `orders-service` restarted before the timer fired, the order may stay pending; approve it through operations.

### Catalog unavailable

The views fall back to a local catalog, but business actions still depend on `catalog-service`. Check `docker compose logs catalog-service`.

### Full reset

```powershell
docker compose down -v
docker compose up -d --build
```

## Persistence

Named volumes:

- `microservice-architecture_orders-data`
- `microservice-architecture_catalog-data`
- `microservice-architecture_payments-data`
- `microservice-architecture_delivery-data`
- `microservice-architecture_notify-data`
- `microservice-architecture_order-user-data`
- `microservice-architecture_order-manage-data`
- `microservice-architecture_rabbitmq-data`

Inspect them:

```powershell
docker volume ls | Select-String microservice
```
