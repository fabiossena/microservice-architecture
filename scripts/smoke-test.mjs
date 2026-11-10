/**
 * Smoke test do fluxo distribuído.
 *
 * Uso (com o Compose no ar):
 *   node scripts/smoke-test.mjs
 *
 * Variáveis opcionais:
 *   GATEWAY_URL (default http://localhost:8070)
 *   ORDERS_URL  (default http://localhost:8091)
 *   PAYMENTS_URL(default http://localhost:8092)
 *   DELIVERY_URL(default http://localhost:8093)
 *   CATALOG_URL (default http://localhost:8094)
 */

const GATEWAY = process.env.GATEWAY_URL || 'http://localhost:8070';
const ORDERS = process.env.ORDERS_URL || 'http://localhost:8091';
const PAYMENTS = process.env.PAYMENTS_URL || 'http://localhost:8092';
const DELIVERY = process.env.DELIVERY_URL || 'http://localhost:8093';
const CATALOG = process.env.CATALOG_URL || 'http://localhost:8094';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json', ...(options.headers || {}) }
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${url}: ${JSON.stringify(body)}`);
  }
  return body;
}

function post(url, body) {
  return request(url, { method: 'POST', body: JSON.stringify(body) });
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERT: ${message}`);
  console.log(`  ok  ${message}`);
}

async function waitFor(description, fn, timeoutMs = 40000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await fn();
    if (value) return value;
    await sleep(1000);
  }
  throw new Error(`Timeout aguardando: ${description}`);
}

async function main() {
  console.log('1. Health agregado');
  const health = await request(`${GATEWAY}/api/health`);
  assert(health.services.every((service) => service.ok), 'todos os serviços online');
  assert(health.rabbit.ok, 'RabbitMQ online');

  const user = `Smoke-${Date.now().toString().slice(-8)}`;
  const orderId = crypto.randomUUID();
  console.log(`2. Pedido de ${user} (${orderId.slice(0, 8)})`);

  const placed = await post(`${GATEWAY}/user/api/actions`, {
    user,
    action: 'place-order',
    payload: {
      orderId,
      sku: 'pizza-margherita',
      itemName: 'Pizza Margherita',
      quantity: 1,
      unitPrice: 45.9
    }
  });
  assert(placed.item.eventType === 'user.order.place', 'comando publicado');

  console.log('3. Aprovação pela operação');
  await post(`${GATEWAY}/manage/api/actions`, {
    operator: 'Smoke Test',
    action: 'approve-order',
    payload: { targetUser: user, orderId }
  });

  console.log('4. Coreografia até a entrega');
  await waitFor('pedido entregue na view do cliente', async () => {
    const history = await request(`${GATEWAY}/user/api/messages?user=${encodeURIComponent(user)}`);
    return history.items.some((item) => item.message.includes('entregue'));
  });

  const orders = await request(`${ORDERS}/orders`);
  const order = orders.items.find((item) => item.id === orderId);
  assert(order?.status === 'COMPLETED', `pedido concluído (status=${order?.status})`);

  const payments = await request(`${PAYMENTS}/payments`);
  const payment = payments.items.find((item) => item.order_id === orderId);
  assert(payment?.status === 'APPROVED', `pagamento aprovado (status=${payment?.status})`);

  const deliveries = await request(`${DELIVERY}/deliveries`);
  const delivery = deliveries.items.find((item) => item.order_id === orderId);
  assert(delivery?.status === 'DELIVERED', `entrega concluída (status=${delivery?.status})`);

  const catalog = await request(`${CATALOG}/catalog`);
  const pizza = catalog.items.find((item) => item.sku === 'pizza-margherita');
  assert(typeof pizza?.stock === 'number', `estoque consultável (${pizza?.stock})`);

  console.log('5. Resposta da operação');
  const reply = `Teste automatizado concluído para o pedido #${orderId.slice(0, 8)}.`;
  await post(`${GATEWAY}/manage/api/actions`, {
    operator: 'Smoke Test',
    action: 'reply-user',
    payload: { targetUser: user, message: reply }
  });

  await waitFor('resposta na caixa do cliente', async () => {
    const history = await request(`${GATEWAY}/user/api/messages?user=${encodeURIComponent(user)}`);
    return history.items.some((item) => item.message === reply);
  });

  const managerMessages = await request(`${GATEWAY}/manage/api/messages?category=user`);
  assert(
    managerMessages.items.some((item) => item.user === user),
    'ação visível na fila da operação'
  );

  console.log('\nSmoke test OK.');
}

main().catch((err) => {
  console.error(`\nSmoke test falhou: ${err.message}`);
  process.exit(1);
});
