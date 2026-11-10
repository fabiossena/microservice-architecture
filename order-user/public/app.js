const NAMES = ['Alice', 'Bob', 'Carol', 'Daniel', 'Emma'];

const state = {
  user: '',
  orderId: '',
  catalog: [],
  messages: [],
  connected: false
};

const els = {
  userForm: document.querySelector('#user-form'),
  userInput: document.querySelector('#user-input'),
  welcome: document.querySelector('#welcome'),
  avatar: document.querySelector('#avatar'),
  connection: document.querySelector('#connection'),
  connectionLabel: document.querySelector('#connection-label'),
  newWindow: document.querySelector('#new-window'),
  itemSelect: document.querySelector('#item-select'),
  catalogHint: document.querySelector('#catalog-hint'),
  quantity: document.querySelector('#quantity'),
  placeOrder: document.querySelector('#place-order'),
  orderId: document.querySelector('#order-id'),
  orderIdShort: document.querySelector('#order-id-short'),
  complaint: document.querySelector('#complaint-text'),
  inbox: document.querySelector('#inbox-list'),
  outbox: document.querySelector('#outbox-list'),
  inCount: document.querySelector('#in-count'),
  outCount: document.querySelector('#out-count'),
  toastStack: document.querySelector('#toast-stack')
};

function sanitizeUser(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
}

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  els.toastStack.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function setConnection(connected) {
  state.connected = connected;
  els.connection.classList.toggle('online', connected);
  els.connection.classList.toggle('offline', !connected);
  els.connectionLabel.textContent = connected ? 'Messaging online' : 'Messaging offline';
}

function setUser(name, { reload = true } = {}) {
  const user = sanitizeUser(name);
  if (user.length < 2) {
    toast('Enter a name with at least 2 characters.', 'error');
    return;
  }

  state.user = user;
  sessionStorage.setItem('order-user.name', user);
  const url = new URL(location.href);
  url.searchParams.set('user', user);
  history.replaceState(null, '', url);

  els.userInput.value = user;
  els.welcome.textContent = `Hello, ${user}`;
  els.avatar.textContent = user.charAt(0);

  state.orderId = sessionStorage.getItem(`order-user.orderId:${user}`) || '';
  syncOrderId();
  state.messages = [];
  renderMessages();

  if (reload) loadHistory();
}

function syncOrderId() {
  els.orderId.value = state.orderId;
  els.orderIdShort.textContent = state.orderId ? shortId(state.orderId) : '—';
}

function setOrderId(id) {
  state.orderId = String(id || '');
  if (state.user) {
    sessionStorage.setItem(`order-user.orderId:${state.user}`, state.orderId);
  }
  syncOrderId();
}

function belongsToCurrentUser(item) {
  if (item.direction === 'out') return item.user === state.user;
  return item.user === state.user || item.user === '*';
}

function mergeMessage(item) {
  if (!belongsToCurrentUser(item)) return false;
  if (state.messages.some((existing) => existing.id === item.id)) return false;
  state.messages.unshift(item);
  if (state.messages.length > 400) state.messages.length = 400;
  renderMessages();
  return true;
}

function messageTitle(item) {
  if (item.direction === 'in') return item.payload?.title || item.eventType;
  const titles = {
    'user.order.place': 'Order sent',
    'user.order.cancel': 'Cancellation requested',
    'user.order.status': 'Status check',
    'user.payment.retry': 'New payment attempt',
    'user.delivery.eta': 'Delivery check',
    'user.catalog.check': 'Stock check',
    'user.support.complaint': 'Message to operations'
  };
  return titles[item.eventType] || 'Command sent';
}

function messageCard(item) {
  const card = document.createElement('article');
  const severity = item.direction === 'in' ? item.payload?.severity || 'info' : 'out';
  card.className = `message ${item.direction === 'out' ? 'outbound' : `severity-${severity}`}`;

  const top = document.createElement('div');
  top.className = 'message-top';

  const title = document.createElement('div');
  title.className = 'message-title';
  title.textContent = messageTitle(item);

  const time = document.createElement('time');
  time.className = 'message-time';
  time.dateTime = item.occurredAt;
  time.textContent = formatDate(item.occurredAt);

  top.append(title, time);

  const text = document.createElement('p');
  text.className = 'message-text';
  text.textContent = item.message;

  const meta = document.createElement('div');
  meta.className = 'message-meta';

  if (item.payload?.orderId) {
    const order = document.createElement('span');
    order.textContent = `order #${shortId(item.payload.orderId)}`;
    meta.appendChild(order);
  }

  const source = document.createElement('span');
  source.textContent = item.direction === 'in'
    ? `source: ${item.source || 'service'}`
    : 'published by you';
  meta.appendChild(source);

  if (item.direction === 'in' && item.user === '*') {
    const broadcast = document.createElement('span');
    broadcast.textContent = 'general announcement';
    meta.appendChild(broadcast);
  }

  const routing = document.createElement('code');
  routing.textContent = item.eventType;
  meta.appendChild(routing);

  card.append(top, text, meta);

  const details = document.createElement('details');
  details.className = 'message-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(
    {
      id: item.id,
      direction: item.direction === 'in' ? 'inbound' : 'outbound',
      event: item.eventType,
      source: item.source,
      user: item.user,
      correlationId: item.correlationId,
      payload: item.payload
    },
    null,
    2
  );
  details.append(summary, pre);
  card.appendChild(details);

  return card;
}

function renderList(container, items, emptyText) {
  container.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = emptyText;
    container.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const item of items) fragment.appendChild(messageCard(item));
  container.appendChild(fragment);
}

function renderMessages() {
  const sorted = [...state.messages].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const inbound = sorted.filter((item) => item.direction === 'in');
  const outbound = sorted.filter((item) => item.direction === 'out');

  els.inCount.textContent = String(inbound.length);
  els.outCount.textContent = String(outbound.length);

  renderList(els.inbox, inbound, `No messages received for ${state.user} yet. Place an order to start the workflow.`);
  renderList(els.outbox, outbound, 'No commands sent in this session.');
}

async function loadHistory() {
  try {
    const response = await fetch(`api/messages?user=${encodeURIComponent(state.user)}`);
    if (!response.ok) throw new Error('Failed to load message history');
    const data = await response.json();
    state.messages = data.items || [];
    renderMessages();

    if (!state.orderId) {
      const lastOrder = state.messages.find(
        (item) => item.direction === 'out' && item.eventType === 'user.order.place' && item.payload?.orderId
      );
      if (lastOrder) setOrderId(lastOrder.payload.orderId);
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadCatalog() {
  try {
    const response = await fetch('api/catalog');
    const data = await response.json();
    state.catalog = data.items || [];
    els.itemSelect.replaceChildren();
    for (const item of state.catalog) {
      const option = document.createElement('option');
      option.value = item.sku;
      option.textContent = `${item.name} · ${formatMoney(item.price)}`;
      option.dataset.price = item.price;
      option.dataset.name = item.name;
      option.dataset.stock = item.stock;
      els.itemSelect.appendChild(option);
    }
    els.catalogHint.textContent = data.source === 'catalog-service'
      ? `${state.catalog.length} items loaded from catalog-service.`
      : 'Local catalog (catalog-service temporarily unavailable).';
  } catch (err) {
    els.catalogHint.textContent = 'Could not load the catalog.';
    toast(err.message, 'error');
  }
}

function selectedItem() {
  const option = els.itemSelect.selectedOptions[0];
  if (!option) return null;
  return {
    sku: option.value,
    name: option.dataset.name,
    price: Number(option.dataset.price),
    stock: Number(option.dataset.stock)
  };
}

function requireOrderId() {
  if (!state.orderId) {
    toast('Place an order or enter the order code before this action.', 'error');
    els.orderId.focus();
    return false;
  }
  return true;
}

async function sendAction(action, payload, button) {
  button?.classList.add('busy');
  if (button) button.disabled = true;
  try {
    const response = await fetch('api/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: state.user, action, payload })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send command');

    mergeMessage(data.item);
    if (action === 'place-order' && data.item?.payload?.orderId) {
      setOrderId(data.item.payload.orderId);
    }
    toast('Message published to the queue.', 'info');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    button?.classList.remove('busy');
    if (button) button.disabled = false;
  }
}

els.userForm.addEventListener('submit', (event) => {
  event.preventDefault();
  setUser(els.userInput.value);
});

els.newWindow.addEventListener('click', () => {
  const next = NAMES.find((name) => name.toLowerCase() !== state.user.toLowerCase()) || 'Customer';
  window.open(`${location.pathname}?user=${encodeURIComponent(next)}`, '_blank', 'noopener');
});

els.placeOrder.addEventListener('click', () => {
  const item = selectedItem();
  if (!item) return toast('Select a catalog item.', 'error');
  const quantity = Math.max(1, Math.min(99, Number(els.quantity.value) || 1));
  const orderId = crypto.randomUUID ? crypto.randomUUID() : `order-${Date.now()}`;
  sendAction('place-order', {
    orderId,
    sku: item.sku,
    itemName: item.name,
    quantity,
    unitPrice: item.price
  }, els.placeOrder);
});

els.orderId.addEventListener('input', () => setOrderId(els.orderId.value.trim()));

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;

    if (action === 'check-stock') {
      const item = selectedItem();
      if (!item) return toast('Select a catalog item.', 'error');
      sendAction('check-stock', { sku: item.sku, itemName: item.name }, button);
      return;
    }

    if (action === 'complaint') {
      const message = els.complaint.value.trim();
      if (message.length < 3) {
        toast('Describe your request to operations.', 'error');
        els.complaint.focus();
        return;
      }
      sendAction('complaint', { message }, button).then(() => {
        els.complaint.value = '';
      });
      return;
    }

    if (!requireOrderId()) return;

    const payload = { orderId: state.orderId };
    return sendAction(action, payload, button);
  });
});

function connectStream() {
  const stream = new EventSource('api/stream');

  stream.addEventListener('open', () => setConnection(true));
  stream.addEventListener('ready', () => setConnection(true));
  stream.addEventListener('message', (event) => {
    try {
      const item = JSON.parse(event.data);
      if (mergeMessage(item) && item.direction === 'in') {
        toast(item.payload?.title || 'New message received', 'info');
      }
    } catch {
      // ignore invalid frames
    }
  });
  stream.addEventListener('error', () => setConnection(false));
}

async function checkHealth() {
  try {
    const response = await fetch('health');
    const data = await response.json();
    setConnection(Boolean(data.broker === 'connected'));
  } catch {
    setConnection(false);
  }
}

const queryUser = new URL(location.href).searchParams.get('user');
const storedUser = sessionStorage.getItem('order-user.name');
setUser(queryUser || storedUser || 'Alice');
loadCatalog();
connectStream();
checkHealth();
setInterval(checkHealth, 20000);
