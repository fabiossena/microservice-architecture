/**
 * Smoke test for the distributed flow.
 *
 * Usage (with the Compose stack running):
 *   node scripts/smoke-test.mjs
 *
 * Optional environment variables:
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
  throw new Error(`Timeout waiting for: ${description}`);
}

async function main() {
  console.log('1. Aggregated health');
  const health = await request(`${GATEWAY}/api/health`);
  assert(health.services.every((service) => service.ok), 'all services online');
  assert(health.rabbit.ok, 'RabbitMQ online');

  const user = `Smoke-${Date.now().toString().slice(-8)}`;
  const orderId = crypto.randomUUID();
  console.log(`2. Order from ${user} (${orderId.slice(0, 8)})`);

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
  assert(placed.item.eventType === 'user.order.place', 'command published');

  console.log('3. Operations approval');
  await post(`${GATEWAY}/manage/api/actions`, {
    operator: 'Smoke Test',
    action: 'approve-order',
    payload: { targetUser: user, orderId }
  });

  console.log('4. Choreography through delivery');
  await waitFor('order delivered in the customer view', async () => {
    const history = await request(`${GATEWAY}/user/api/messages?user=${encodeURIComponent(user)}`);
    return history.items.some((item) => item.message.includes('delivered'));
  });

  const orders = await request(`${ORDERS}/orders`);
  const order = orders.items.find((item) => item.id === orderId);
  assert(order?.status === 'COMPLETED', `order completed (status=${order?.status})`);

  const payments = await request(`${PAYMENTS}/payments`);
  const payment = payments.items.find((item) => item.order_id === orderId);
  assert(payment?.status === 'APPROVED', `payment approved (status=${payment?.status})`);

  const deliveries = await request(`${DELIVERY}/deliveries`);
  const delivery = deliveries.items.find((item) => item.order_id === orderId);
  assert(delivery?.status === 'DELIVERED', `delivery completed (status=${delivery?.status})`);

  const catalog = await request(`${CATALOG}/catalog`);
  const pizza = catalog.items.find((item) => item.sku === 'pizza-margherita');
  assert(typeof pizza?.stock === 'number', `stock query works (${pizza?.stock})`);

  console.log('5. Operations reply');
  const reply = `Automated test completed for order #${orderId.slice(0, 8)}.`;
  await post(`${GATEWAY}/manage/api/actions`, {
    operator: 'Smoke Test',
    action: 'reply-user',
    payload: { targetUser: user, message: reply }
  });

  await waitFor('reply in the customer inbox', async () => {
    const history = await request(`${GATEWAY}/user/api/messages?user=${encodeURIComponent(user)}`);
    return history.items.some((item) => item.message === reply);
  });

  const managerMessages = await request(`${GATEWAY}/manage/api/messages?category=user`);
  assert(
    managerMessages.items.some((item) => item.user === user),
    'action visible in the operations queue'
  );

  console.log('\nSmoke test OK.');
}

main().catch((err) => {
  console.error(`\nSmoke test failed: ${err.message}`);
  process.exit(1);
});
