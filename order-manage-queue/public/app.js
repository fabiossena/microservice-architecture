const state = {
  operator: '',
  targetUser: '',
  orderId: '',
  messages: [],
  filter: 'user',
  catalog: []
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
  toastStack: document.querySelector('#toast-stack')
};

const TITLES = {
  'user.order.place': 'Pedido recebido do cliente',
  'user.order.cancel': 'Cancelamento solicitado pelo cliente',
  'user.order.status': 'Consulta de status',
  'user.payment.retry': 'Nova tentativa de pagamento',
  'user.delivery.eta': 'Consulta de entrega',
  'user.catalog.check': 'Consulta de estoque',
  'user.support.complaint': 'Solicitação de atendimento',
  'order.created': 'Pedido criado',
  'order.confirmed': 'Pedido aprovado',
  'order.cancelled': 'Pedido cancelado',
  'order.cancel_rejected': 'Cancelamento recusado',
  'order.not_found': 'Pedido não encontrado',
  'order.status': 'Status do pedido',
  'catalog.reserved': 'Estoque reservado',
  'catalog.rejected': 'Estoque insuficiente',
  'catalog.checked': 'Estoque consultado',
  'catalog.restocked': 'Estoque reposto',
  'catalog.released': 'Estoque liberado',
  'payment.approved': 'Pagamento aprovado',
  'payment.declined': 'Pagamento recusado',
  'payment.refunded': 'Reembolso processado',
  'payment.info': 'Informação de pagamento',
  'payment.retry_failed': 'Falha na nova tentativa',
  'delivery.assigned': 'Entregador designado',
  'delivery.dispatched': 'Pedido em rota',
  'delivery.delivered': 'Pedido entregue',
  'delivery.cancelled': 'Entrega cancelada',
  'delivery.eta': 'Previsão de entrega',
  'delivery.info': 'Informação de entrega',
  'manager.order.approve': 'Aprovação enviada',
  'manager.order.cancel': 'Cancelamento enviado',
  'manager.payment.refund': 'Reembolso solicitado',
  'manager.delivery.dispatch': 'Despacho solicitado',
  'manager.catalog.restock': 'Reposição solicitada',
  'manager.reply': 'Resposta ao cliente',
  'manager.broadcast': 'Comunicado geral'
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
    : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
}

function shortId(id) {
  return String(id || '').slice(0, 8);
}

function formatMoney(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function setConnection(connected) {
  els.connection.classList.toggle('online', connected);
  els.connection.classList.toggle('offline', !connected);
  els.connectionLabel.textContent = connected ? 'Mensageria online' : 'Mensageria offline';
}

function saveContext() {
  state.operator = els.operator.value.trim().slice(0, 40) || 'Operação';
  state.targetUser = els.targetUser.value.trim().slice(0, 40);
  state.orderId = els.orderId.value.trim().slice(0, 80);
  sessionStorage.setItem('manage.operator', state.operator);
  sessionStorage.setItem('manage.targetUser', state.targetUser);
  sessionStorage.setItem('manage.orderId', state.orderId);
}

function requireContext(needOrder = true) {
  saveContext();
  if (state.targetUser.length < 2) {
    toast('Informe ou selecione o usuário de destino.', 'error');
    els.targetUser.focus();
    return false;
  }
  if (needOrder && !state.orderId) {
    toast('Informe ou selecione o pedido.', 'error');
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
  els.selectionHint.textContent = `Contexto: ${state.targetUser || '—'}${orderId ? ` · pedido #${shortId(orderId)}` : ''}`;
  toast(`Contexto atualizado para ${state.targetUser}${orderId ? ` · #${shortId(orderId)}` : ''}.`, 'info');
}

function mergeMessage(item) {
  if (state.messages.some((existing) => existing.id === item.id)) return false;
  state.messages.unshift(item);
  if (state.messages.length > 500) state.messages.length = 500;
  render();
  return true;
}

function messageTitle(item) {
  return TITLES[item.eventType] || (item.category === 'user' ? 'Mensagem do usuário' : item.eventType);
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
    user.textContent = item.user === '*' ? 'todos os usuários' : `usuário: ${item.user}`;
    meta.appendChild(user);
  }
  if (item.actor) {
    const actor = document.createElement('span');
    actor.textContent = `operador: ${item.actor}`;
    meta.appendChild(actor);
  }
  if (item.payload?.orderId) {
    const order = document.createElement('span');
    order.textContent = `pedido #${shortId(item.payload.orderId)}`;
    meta.appendChild(order);
  }
  if (item.payload?.amount) {
    const amount = document.createElement('span');
    amount.textContent = `valor: ${formatMoney(item.payload.amount)}`;
    meta.appendChild(amount);
  }
  const source = document.createElement('span');
  source.textContent = item.category === 'sent' ? 'enviado pela operação' : `origem: ${item.source || 'serviço'}`;
  meta.appendChild(source);

  const routing = document.createElement('code');
  routing.textContent = item.eventType;
  meta.appendChild(routing);

  card.append(top, text, meta);

  if (item.direction === 'in') {
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'btn mini select-btn';
    select.textContent = 'Usar este contexto';
    select.addEventListener('click', () => selectMessage(item));
    card.appendChild(select);
  }

  const details = document.createElement('details');
  details.className = 'message-details';
  const summary = document.createElement('summary');
  summary.textContent = 'Detalhes técnicos';
  const pre = document.createElement('pre');
  pre.textContent = JSON.stringify(
    {
      id: item.id,
      categoria: item.category,
      direcao: item.direction,
      evento: item.eventType,
      origem: item.source,
      usuario: item.user,
      ator: item.actor,
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
        ? 'Nenhuma ação de cliente recebida ainda. Abra o portal do cliente e faça um pedido.'
        : state.filter === 'system'
          ? 'Nenhum evento de domínio recebido ainda.'
          : 'Nenhum comando enviado pela operação nesta sessão.';
    els.feed.appendChild(empty);
  } else {
    const fragment = document.createDocumentFragment();
    for (const item of filtered) fragment.appendChild(messageCard(item));
    els.feed.appendChild(fragment);
  }

  const descriptions = {
    user: 'ações recebidas das filhas do order-user',
    system: 'eventos de domínio dos serviços de pedido, catálogo, pagamento e entrega',
    sent: 'comandos publicados pela operação'
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
    if (!response.ok) throw new Error('Falha ao carregar a fila');
    const data = await response.json();
    state.messages = data.items || [];
    render();
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
      option.textContent = `${item.name} · ${item.stock} em estoque`;
      els.restockSku.appendChild(option);
    }
    els.catalogHint.textContent = data.source === 'catalog-service'
      ? `${state.catalog.length} itens carregados do catalog-service.`
      : 'Catálogo local (catalog-service indisponível).';
  } catch (err) {
    els.catalogHint.textContent = 'Não foi possível carregar o catálogo.';
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
    if (!response.ok) throw new Error(data.error || 'Falha ao enviar comando');
    mergeMessage(data.item);
    toast('Comando publicado na fila de retorno.', 'info');
    if (action === 'reply-user' || action === 'broadcast') els.reply.value = '';
  } catch (err) {
    toast(err.message, 'error');
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
        toast('Escreva o comunicado geral.', 'error');
        return;
      }
      sendAction(action, { message }, button);
      return;
    }

    if (action === 'reply-user') {
      if (!requireContext(false)) return;
      const message = els.reply.value.trim();
      if (message.length < 2) {
        toast('Escreva a mensagem de resposta.', 'error');
        return;
      }
      sendAction(action, { targetUser: state.targetUser, message }, button);
      return;
    }

    if (action === 'restock') {
      const sku = els.restockSku.value;
      const quantity = Number(els.restockQuantity.value);
      if (!sku) return toast('Selecione um item para repor.', 'error');
      if (!Number.isFinite(quantity) || quantity < 1) return toast('Quantidade inválida.', 'error');
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
        toast(`Nova ação de ${item.user || 'cliente'}: ${messageTitle(item)}`, 'info');
      }
    } catch {
      // ignora frames inválidos
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

state.operator = sessionStorage.getItem('manage.operator') || 'Operação';
state.targetUser = sessionStorage.getItem('manage.targetUser') || '';
state.orderId = sessionStorage.getItem('manage.orderId') || '';
els.operator.value = state.operator;
els.targetUser.value = state.targetUser;
els.orderId.value = state.orderId;
if (state.targetUser || state.orderId) {
  els.selectionHint.textContent = `Contexto restaurado: ${state.targetUser || '—'}${state.orderId ? ` · pedido #${shortId(state.orderId)}` : ''}`;
}

loadMessages();
loadCatalog();
connectStream();
checkHealth();
setInterval(checkHealth, 20000);
