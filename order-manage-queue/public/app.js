const state = {
  operator: '',
  targetUser: '',
  orderId: '',
  messages: [],
  filter: 'user',
  catalog: [],
  customers: ['Alice', 'Bob', 'Carol', 'Daniel', 'Emma'],
  customerData: {},
  drafts: {}
};

const els = {
  operator: document.querySelector('#operator'),
  targetUser: document.querySelector('#target-user'),
  orderId: document.querySelector('#order-id'),
  selectionHint: document.querySelector('#selection-hint'),
  connection: document.querySelector('#connection'),
  connectionLabel: document.querySelector('#connection-label'),
  feed: document.querySelector('#feed'),
  feedDescription: document.querySelector('#feed-description'),
  userCount: document.querySelector('#user-count'),
  systemCount: document.querySelector('#system-count'),
  sentCount: document.querySelector('#sent-count'),
  reply: document.querySelector('#reply-text'),
  restockSku: document.querySelector('#restock-sku'),
  restockQuantity: document.querySelector('#restock-quantity'),
  catalogHint: document.querySelector('#catalog-hint'),
  customerBoard: document.querySelector('#customer-board'),
  refreshBoard: document.querySelector('#refresh-board'),
  toastStack: document.querySelector('#toast-stack')
};

const TITLES = {
  'user.order.place': 'Order received from customer',
  'user.order.cancel': 'Cancellation requested by customer',
  'user.order.status': 'Status check',
  'user.payment.retry': 'New payment attempt',
  'user.delivery.eta': 'Delivery check',
  'user.catalog.check': 'Stock check',
  'user.support.complaint': 'Support request',
  'order.created': 'Order created',
  'order.confirmed': 'Order approved',
  'order.cancelled': 'Order cancelled',
  'order.cancel_rejected': 'Cancellation rejected',
  'order.not_found': 'Order not found',
  'order.status': 'Order status',
  'catalog.reserved': 'Stock reserved',
  'catalog.rejected': 'Insufficient stock',
  'catalog.checked': 'Stock checked',
  'catalog.restocked': 'Stock restocked',
  'catalog.released': 'Stock released',
  'payment.approved': 'Payment approved',
  'payment.declined': 'Payment declined',
  'payment.refunded': 'Refund processed',
  'payment.info': 'Payment information',
  'payment.retry_failed': 'Retry failed',
  'delivery.assigned': 'Courier assigned',
  'delivery.dispatched': 'Order out for delivery',
  'delivery.delivered': 'Order delivered',
  'delivery.cancelled': 'Delivery cancelled',
  'delivery.eta': 'Delivery estimate',
  'delivery.info': 'Delivery information',
  'manager.order.approve': 'Approval sent',
  'manager.order.cancel': 'Cancellation sent',
  'manager.payment.refund': 'Refund requested',
  'manager.delivery.dispatch': 'Dispatch requested',
  'manager.catalog.restock': 'Restock requested',
  'manager.reply': 'Reply to customer',
  'manager.broadcast': 'General announcement'
};

function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  els.toastStack.appendChild(node);
  setTimeout(() => node.remove(), 4200);
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'medium' });
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
}

function setConnection(connected) {
  els.connection.classList.toggle('online', connected);
  els.connection.classList.toggle('offline', !connected);
  els.connectionLabel.textContent = connected ? 'Messaging online' : 'Messaging offline';
}

function saveContext() {
  state.operator = els.operator.value.trim().slice(0, 40) || 'Operations';
  state.targetUser = els.targetUser.value.trim().slice(0, 40);
  state.orderId = els.orderId.value.trim().slice(0, 80);
  sessionStorage.setItem('manage.operator', state.operator);
  sessionStorage.setItem('manage.targetUser', state.targetUser);
  sessionStorage.setItem('manage.orderId', state.orderId);
}

function requireContext(needOrder = true) {
  saveContext();
  if (state.targetUser.length < 2) {
    toast('Enter or select the target user.', 'error');
    els.targetUser.focus();
    return false;
  }
  if (needOrder && !state.orderId) {
    toast('Enter or select the order.', 'error');
    els.orderId.focus();
    return false;
  }
  return true;
}

function selectMessage(item) {
  if (item.user && item.user !== '*') {
    els.targetUser.value = item.user;
  }
  const orderId = item.payload?.orderId;
  if (orderId) els.orderId.value = orderId;
  saveContext();
  els.selectionHint.textContent = `Context: ${state.targetUser || '—'}${orderId ? ` · order #${shortId(orderId)}` : ''}`;
  toast(`Context updated to ${state.targetUser}${orderId ? ` · #${shortId(orderId)}` : ''}.`, 'info');
}

function mergeMessage(item) {
  if (state.messages.some((existing) => existing.id === item.id)) return false;
  state.messages.unshift(item);
  if (state.messages.length > 500) state.messages.length = 500;

  const isNewCustomer = item.user && item.user !== '*' ? ensureCustomer(item.user) : false;
  render();
  applyMessageToBoard(item);
  if (isNewCustomer) loadCustomer(item.user);
  return true;
}

function messageTitle(item) {
  return TITLES[item.eventType] || (item.category === 'user' ? 'Customer message' : item.eventType);
}

function messageCard(item) {
  const card = document.createElement('article');
  const severity =
    item.category === 'user'
      ? 'user'
      : item.category === 'sent'
        ? 'outbound'
        : item.eventType.includes('rejected') || item.eventType.includes('declined')
          ? 'error'
          : item.eventType.includes('approved') || item.eventType.includes('reserved') || item.eventType.includes('delivered')
            ? 'success'
            : 'info';
  card.className = `message ${item.category === 'sent' ? 'outbound' : `severity-${severity}`} ${item.category === 'user' ? 'user-message' : ''}`;

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

  if (item.user) {
    const user = document.createElement('span');
    user.textContent = item.user === '*' ? 'all users' : `user: ${item.user}`;
    meta.appendChild(user);
  }
  if (item.actor) {
    const actor = document.createElement('span');
    actor.textContent = `operator: ${item.actor}`;
    meta.appendChild(actor);
  }
  if (item.payload?.orderId) {
    const order = document.createElement('span');
    order.textContent = `order #${shortId(item.payload.orderId)}`;
    meta.appendChild(order);
  }
  if (item.payload?.amount) {
    const amount = document.createElement('span');
    amount.textContent = `amount: ${formatMoney(item.payload.amount)}`;
    meta.appendChild(amount);
  }
  const source = document.createElement('span');
  source.textContent = item.category === 'sent' ? 'sent by operations' : `source: ${item.source || 'service'}`;
  meta.appendChild(source);

  const routing = document.createElement('code');
  routing.textContent = item.eventType;
  meta.appendChild(routing);

  card.append(top, text, meta);

  if (item.direction === 'in') {
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'btn mini select-btn';
    select.textContent = 'Use this context';
    select.addEventListener('click', () => selectMessage(item));
    card.appendChild(select);
  }

  const details = document.createElement('details');
  details.className = 'message-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Technical details';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(
    {
      id: item.id,
      category: item.category,
      direction: item.direction,
      event: item.eventType,
      source: item.source,
      user: item.user,
      actor: item.actor,
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

function ensureCustomer(rawName) {
  const name = String(rawName || '').trim().slice(0, 40);
  if (name.length < 2) return false;
  if (state.customers.includes(name)) return false;
  state.customers.push(name);
  return true;
}

function discoverCustomers() {
  for (const item of state.messages) {
    if (item.user && item.user !== '*') ensureCustomer(item.user);
  }
}

function getCustomerCard(name) {
  return [...els.customerBoard.children].find((card) => card.dataset.user === name);
}

function createCustomerCard(name) {
  const card = document.createElement('article');
  card.className = 'customer-card';
  card.dataset.user = name;

  const head = document.createElement('div');
  head.className = 'customer-head';

  const identity = document.createElement('div');
  identity.className = 'customer-identity';

  const avatar = document.createElement('div');
  avatar.className = 'customer-avatar';
  avatar.textContent = name.charAt(0);

  const info = document.createElement('div');
  info.style.minWidth = '0';
  const title = document.createElement('div');
  title.className = 'customer-name';
  title.textContent = name;
  const meta = document.createElement('div');
  meta.className = 'customer-meta';
  const status = document.createElement('span');
  status.className = 'customer-status';
  status.textContent = 'Loading messages...';
  meta.appendChild(status);
  info.append(title, meta);
  identity.append(avatar, info);

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'btn ghost customer-refresh';
  refresh.textContent = 'Refresh';
  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    await loadCustomer(name);
    refresh.disabled = false;
  });

  head.append(identity, refresh);

  const list = document.createElement('div');
  list.className = 'customer-messages';

  const form = document.createElement('form');
  form.className = 'customer-reply-form';
  const textarea = document.createElement('textarea');
  textarea.maxLength = 500;
  textarea.rows = 2;
  textarea.placeholder = `Message to ${name}...`;
  textarea.value = state.drafts[name] || '';
  textarea.addEventListener('input', () => {
    state.drafts[name] = textarea.value;
  });
  const send = document.createElement('button');
  send.type = 'submit';
  send.className = 'btn primary';
  send.textContent = 'Send message';
  form.append(textarea, send);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    sendCustomerMessage(name, textarea, send);
  });

  const updated = document.createElement('div');
  updated.className = 'customer-updated';
  updated.textContent = 'Auto-refresh 10s';

  card.append(head, list, form, updated);
  return card;
}

function updateCustomerCard(card, name) {
  const data = state.customerData[name];
  const status = card.querySelector('.customer-status');
  const list = card.querySelector('.customer-messages');
  const updated = card.querySelector('.customer-updated');

  if (!data) {
    status.textContent = 'Waiting for messages...';
  } else if (data.loading) {
    status.textContent = 'Refreshing...';
  } else if (data.error) {
    status.textContent = 'Refresh failed';
  } else {
    status.textContent = `${data.items.length} message(s) · auto 10s`;
  }

  if (data?.updatedAt) {
    updated.textContent = `Updated ${new Date(data.updatedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })} · auto 10s`;
  }

  const items = data?.items || [];
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'customer-empty';
    empty.textContent = data?.error
      ? `Could not refresh: ${data.error}`
      : `No messages for ${name} yet.`;
    list.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items.slice(0, 30)) {
    const row = document.createElement('div');
    row.className = `customer-msg ${
      item.direction === 'out' ? 'outbound' : item.category === 'system' ? 'system' : ''
    }`;

    const head = document.createElement('div');
    head.className = 'customer-msg-head';
    const title = document.createElement('span');
    title.className = 'customer-msg-title';
    title.textContent = messageTitle(item);
    const time = document.createElement('time');
    time.className = 'customer-msg-time';
    time.textContent = formatDate(item.occurredAt);
    head.append(title, time);

    const text = document.createElement('p');
    text.className = 'customer-msg-text';
    text.textContent = item.message;

    row.append(head, text);
    fragment.appendChild(row);
  }
  list.appendChild(fragment);
}

function renderCustomerBoard() {
  const names = new Set(state.customers);
  for (const card of [...els.customerBoard.children]) {
    if (!names.has(card.dataset.user)) card.remove();
  }

  for (const name of state.customers) {
    let card = getCustomerCard(name);
    if (!card) {
      card = createCustomerCard(name);
      els.customerBoard.appendChild(card);
    }
    updateCustomerCard(card, name);
  }
}

async function loadCustomer(name) {
  const previous = state.customerData[name];
  state.customerData[name] = {
    items: previous?.items || [],
    updatedAt: previous?.updatedAt || null,
    loading: true,
    error: null
  };
  renderCustomerBoard();

  try {
    const response = await fetch(`api/messages?user=${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state.customerData[name] = {
      items: data.items || [],
      updatedAt: Date.now(),
      loading: false,
      error: null
    };
  } catch (err) {
    state.customerData[name] = {
      items: previous?.items || [],
      updatedAt: previous?.updatedAt || null,
      loading: false,
      error: err.message
    };
  }
  renderCustomerBoard();
}

async function refreshAllCustomers() {
  discoverCustomers();
  renderCustomerBoard();
  await Promise.all(state.customers.map((name) => loadCustomer(name)));
}

function applyMessageToBoard(item) {
  let targets;
  if (item.user && item.user !== '*') {
    ensureCustomer(item.user);
    targets = [item.user];
  } else {
    targets = [...state.customers];
  }

  for (const name of targets) {
    const data = state.customerData[name];
    if (!data) continue;
    if (data.items.some((existing) => existing.id === item.id)) continue;
    data.items.unshift(item);
    data.items.sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));
    if (data.items.length > 100) data.items.length = 100;
    data.updatedAt = Date.now();
  }
  renderCustomerBoard();
}

async function sendCustomerMessage(name, textarea, button) {
  saveContext();
  const message = textarea.value.trim();
  if (message.length < 2) {
    toast(`Write a message to ${name}.`, 'error');
    textarea.focus();
    return;
  }

  const success = await sendAction('reply-user', { targetUser: name, message }, button);
  if (!success) return;

  state.drafts[name] = '';
  textarea.value = '';
  await loadCustomer(name);
}

function render() {
  const counts = { user: 0, system: 0, sent: 0 };
  for (const item of state.messages) counts[item.category] = (counts[item.category] || 0) + 1;
  els.userCount.textContent = String(counts.user);
  els.systemCount.textContent = String(counts.system);
  els.sentCount.textContent = String(counts.sent);

  const filtered = [...state.messages]
    .filter((item) => item.category === state.filter)
    .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt));

  els.feed.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent =
      state.filter === 'user'
        ? 'No customer actions received yet. Open the customer portal and place an order.'
        : state.filter === 'system'
          ? 'No domain events received yet.'
          : 'No commands sent by operations in this session.';
    els.feed.appendChild(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const item of filtered) fragment.appendChild(messageCard(item));
    els.feed.appendChild(fragment);
  }

  const descriptions = {
    user: 'actions received from order-user queues',
    system: 'domain events from orders, catalog, payment, and delivery services',
    sent: 'commands published by operations'
  };
  els.feedDescription.textContent = descriptions[state.filter];

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.filter === state.filter);
  });

  const knownUsers = new Set(
    state.messages
      .map((item) => item.user)
      .filter((user) => user && user !== '*')
  );
  const datalist = document.querySelector('#target-users');
  datalist.replaceChildren();
  for (const name of [...knownUsers].sort()) {
    const option = document.createElement('option');
    option.value = name;
    datalist.appendChild(option);
  }
}

async function loadMessages() {
  try {
    const response = await fetch('api/messages');
    if (!response.ok) throw new Error('Failed to load the queue');
    const data = await response.json();
    state.messages = data.items || [];
    const known = new Set(state.customers);
    discoverCustomers();
    render();
    const discovered = state.customers.filter((name) => !known.has(name));
    for (const name of discovered) loadCustomer(name);
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function loadCatalog() {
  try {
    const response = await fetch('api/catalog');
    const data = await response.json();
    state.catalog = data.items || [];
    els.restockSku.replaceChildren();
    for (const item of state.catalog) {
      const option = document.createElement('option');
      option.value = item.sku;
      option.textContent = `${item.name} · ${item.stock} in stock`;
      els.restockSku.appendChild(option);
    }
    els.catalogHint.textContent = data.source === 'catalog-service'
      ? `${state.catalog.length} items loaded from catalog-service.`
      : 'Local catalog (catalog-service unavailable).';
  } catch (err) {
    els.catalogHint.textContent = 'Could not load the catalog.';
    toast(err.message, 'error');
  }
}

async function sendAction(action, payload, button) {
  button?.classList.add('busy');
  if (button) button.disabled = true;
  try {
    const response = await fetch('api/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operator: state.operator, action, payload })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send command');
    mergeMessage(data.item);
    toast('Command published to the return queue.', 'info');
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  } finally {
    button?.classList.remove('busy');
    if (button) button.disabled = false;
  }
}

document.querySelectorAll('[data-manage-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.manageAction;
    saveContext();

    if (action === 'broadcast') {
      const message = els.reply.value.trim();
      if (message.length < 2) {
        toast('Write the general announcement.', 'error');
        return;
      }
      sendAction(action, { message }, button).then((ok) => {
        if (ok) els.reply.value = '';
      });
      return;
    }

    if (action === 'reply-user') {
      if (!requireContext(false)) return;
      const message = els.reply.value.trim();
      if (message.length < 2) {
        toast('Write the reply message.', 'error');
        return;
      }
      sendAction(action, { targetUser: state.targetUser, message }, button).then((ok) => {
        if (ok) els.reply.value = '';
      });
      return;
    }

    if (action === 'restock') {
      const sku = els.restockSku.value;
      const quantity = Number(els.restockQuantity.value);
      if (!sku) return toast('Select an item to restock.', 'error');
      if (!Number.isFinite(quantity) || quantity < 1) return toast('Invalid quantity.', 'error');
      sendAction(action, { sku, quantity }, button);
      return;
    }

    if (!requireContext(true)) return;
    sendAction(action, { targetUser: state.targetUser, orderId: state.orderId }, button);
  });
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    state.filter = tab.dataset.filter;
    render();
  });
});

[els.operator, els.targetUser, els.orderId].forEach((input) => {
  input.addEventListener('change', saveContext);
});

function connectStream() {
  const stream = new EventSource('api/stream');
  stream.addEventListener('open', () => setConnection(true));
  stream.addEventListener('ready', () => setConnection(true));
  stream.addEventListener('message', (event) => {
    try {
      const item = JSON.parse(event.data);
      if (mergeMessage(item) && item.category === 'user') {
        toast(`New action from ${item.user || 'customer'}: ${messageTitle(item)}`, 'info');
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

state.operator = sessionStorage.getItem('manage.operator') || 'Operations';
state.targetUser = sessionStorage.getItem('manage.targetUser') || '';
state.orderId = sessionStorage.getItem('manage.orderId') || '';
els.operator.value = state.operator;
els.targetUser.value = state.targetUser;
els.orderId.value = state.orderId;
if (state.targetUser || state.orderId) {
  els.selectionHint.textContent = `Restored context: ${state.targetUser || '—'}${state.orderId ? ` · order #${shortId(state.orderId)}` : ''}`;
}

loadMessages();
loadCatalog();
connectStream();
checkHealth();
renderCustomerBoard();
refreshAllCustomers();
els.refreshBoard.addEventListener('click', async () => {
  els.refreshBoard.disabled = true;
  await refreshAllCustomers();
  els.refreshBoard.disabled = false;
});
setInterval(refreshAllCustomers, 10000);
setInterval(checkHealth, 20000);
