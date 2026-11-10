function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

function relativeTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const els = {
  servicesSummary: document.querySelector('#services-summary'),
  rabbitSummary: document.querySelector('#rabbit-summary'),
  rabbitVersion: document.querySelector('#rabbit-version'),
  messagesSummary: document.querySelector('#messages-summary'),
  consumersSummary: document.querySelector('#consumers-summary'),
  services: document.querySelector('#services'),
  queues: document.querySelector('#queues'),
  lastUpdate: document.querySelector('#last-update'),
  queuesUpdate: document.querySelector('#queues-update'),
  refreshState: document.querySelector('#refresh-state'),
  refreshLabel: document.querySelector('#refresh-label'),
  rabbitLink: document.querySelector('#rabbit-link')
};

els.rabbitLink.href = `${location.protocol}//${location.hostname}:15672`;

function serviceCard(service) {
  const card = document.createElement('article');
  card.className = 'service-card';

  const top = document.createElement('div');
  top.className = 'service-top';

  const name = document.createElement('span');
  name.className = 'service-name';
  name.textContent = service.name;

  const state = document.createElement('span');
  state.className = `service-state ${service.ok ? 'ok' : ''}`;
  const dot = document.createElement('span');
  dot.className = 'dot';
  const label = document.createElement('span');
  label.textContent = service.ok ? 'online' : service.status || 'offline';
  state.append(dot, label);
  top.append(name, state);

  const meta = document.createElement('div');
  meta.className = 'service-meta';
  const latency = document.createElement('span');
  latency.textContent = `${service.latencyMs} ms`;
  const broker = document.createElement('span');
  broker.textContent = `broker: ${service.broker || '—'}`;
  const uptime = document.createElement('span');
  uptime.textContent = service.uptimeSeconds != null ? `up ${Math.floor(service.uptimeSeconds / 60)}m` : '';
  meta.append(latency, broker);
  if (uptime.textContent) meta.appendChild(uptime);

  card.append(top, meta);
  return card;
}

function renderHealth(data) {
  const online = data.services.filter((service) => service.ok).length;
  els.servicesSummary.textContent = `${online}/${data.services.length}`;
  els.rabbitSummary.textContent = data.rabbit.ok ? 'online' : 'offline';
  els.rabbitSummary.style.color = data.rabbit.ok ? 'var(--green)' : 'var(--red)';
  els.rabbitVersion.textContent = data.rabbit.ok
    ? `v${data.rabbit.rabbitmqVersion} · ${formatNumber(data.rabbit.messages)} messages`
    : data.rabbit.error || 'management API';

  els.services.replaceChildren();
  for (const service of [...data.services].sort((a, b) => a.name.localeCompare(b.name))) {
    els.services.appendChild(serviceCard(service));
  }
  els.lastUpdate.textContent = `updated at ${relativeTime(data.timestamp)}`;
}

function renderQueues(data) {
  const items = data.items || [];
  const totalMessages = items.reduce((sum, queue) => sum + queue.messages, 0);
  const totalConsumers = items.reduce((sum, queue) => sum + queue.consumers, 0);
  els.messagesSummary.textContent = formatNumber(totalMessages);
  els.consumersSummary.textContent = formatNumber(totalConsumers);

  els.queues.replaceChildren();
  if (!items.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.className = 'empty-cell';
    cell.textContent = 'No queues declared yet. Start the services and place an order.';
    row.appendChild(cell);
    els.queues.appendChild(row);
    return;
  }

  for (const queue of items) {
    const row = document.createElement('tr');
    const name = document.createElement('td');
    const code = document.createElement('code');
    code.textContent = queue.name;
    name.appendChild(code);

    const state = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `state-badge ${queue.state === 'running' ? '' : 'idle'}`;
    badge.textContent = queue.state;
    state.appendChild(badge);

    const ready = document.createElement('td');
    ready.className = 'num';
    ready.textContent = formatNumber(queue.ready);

    const unacked = document.createElement('td');
    unacked.className = 'num';
    unacked.textContent = formatNumber(queue.unacked);

    const consumers = document.createElement('td');
    consumers.className = 'num';
    consumers.textContent = formatNumber(queue.consumers);

    const publish = document.createElement('td');
    publish.className = 'num';
    publish.textContent = queue.publishRate.toFixed(1);

    const deliver = document.createElement('td');
    deliver.className = 'num';
    deliver.textContent = queue.deliverRate.toFixed(1);

    row.append(name, state, ready, unacked, consumers, publish, deliver);
    els.queues.appendChild(row);
  }

  els.queuesUpdate.textContent = `${items.length} queues · ${formatNumber(totalMessages)} messages · ${formatNumber(totalConsumers)} consumers`;
}

async function refresh() {
  els.refreshState.classList.remove('online');
  els.refreshLabel.textContent = 'Refreshing';
  try {
    const [healthResponse, queuesResponse] = await Promise.all([
      fetch('/api/health'),
      fetch('/api/queues')
    ]);
    if (!healthResponse.ok) throw new Error('health unavailable');
    renderHealth(await healthResponse.json());
    if (queuesResponse.ok) renderQueues(await queuesResponse.json());
    els.refreshState.classList.add('online');
    els.refreshLabel.textContent = 'Live';
  } catch (err) {
    els.refreshLabel.textContent = 'Unstable';
    els.lastUpdate.textContent = err.message;
  }
}

refresh();
setInterval(refresh, 5000);
