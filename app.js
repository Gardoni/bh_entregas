'use strict';

// ==========================================
// 1. IMPORTAÇÕES DO FIREBASE
// ==========================================
import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
// ==========================================

const STORAGE_KEY = 'bhEntregaMvpV1';
const SESSION_KEY = 'bhEntregaSessionV1';

const neighborhoods = {
  'Centro': [-19.9191, -43.9386], 'Savassi': [-19.9383, -43.9346], 'Funcionários': [-19.9327, -43.9278],
  'Lourdes': [-19.9294, -43.9444], 'Santo Agostinho': [-19.9235, -43.9503], 'Barro Preto': [-19.9209, -43.9564],
  'Floresta': [-19.9162, -43.9235], 'Santa Tereza': [-19.9211, -43.9128], 'Sagrada Família': [-19.9015, -43.9172],
  'Cidade Nova': [-19.8913, -43.9289], 'União': [-19.8897, -43.9188], 'Pampulha': [-19.8517, -43.9718],
  'Ouro Preto': [-19.8707, -43.9916], 'Castelo': [-19.8784, -44.0007], 'Venda Nova': [-19.8158, -43.9542],
  'Buritis': [-19.9740, -43.9684], 'Belvedere': [-19.9739, -43.9407], 'Mangabeiras': [-19.9524, -43.9162],
  'Padre Eustáquio': [-19.9141, -43.9789], 'Carlos Prates': [-19.9122, -43.9638], 'Caiçara': [-19.9000, -43.9770],
  'Barreiro': [-19.9797, -44.0151], 'Diamante': [-20.0003, -44.0193], 'Jardim América': [-19.9445, -43.9812],
  'Nova Suíça': [-19.9447, -43.9710]
};

const statusFlow = ['payment_pending', 'searching', 'found', 'going_pickup', 'at_pickup', 'picked_up', 'in_transit', 'at_destination', 'delivered', 'completed'];
const statusLabels = {
  payment_pending: 'Aguardando pagamento', searching: 'Procurando entregador', found: 'Entregador encontrado',
  going_pickup: 'A caminho da retirada', at_pickup: 'No local de retirada', picked_up: 'Mercadoria retirada',
  in_transit: 'Entrega em andamento', at_destination: 'No local de entrega', delivered: 'Mercadoria entregue',
  completed: 'Entrega concluída', cancelled: 'Entrega cancelada', incident: 'Ocorrência registrada'
};

const menuConfig = {
  client: [['dashboard', '', 'Visão geral'], ['new-order', '＋', 'Nova entrega'], ['orders', '', 'Meus pedidos'], ['profile', '', 'Meu perfil']],
  courier: [['dashboard', '⌂', 'Visão geral'], ['available', '⚡', 'Entregas disponíveis'], ['active', '➜', 'Entrega atual'], ['earnings', 'R$', 'Meus ganhos'], ['profile', '◉', 'Meu perfil']],
  master: [['dashboard', '', 'Painel Master'], ['orders', '▦', 'Todas as entregas'], ['couriers', '✓', 'Entregadores'], ['finance', 'R$', 'Financeiro'], ['settings', '⚙', 'Tarifas e ajustes'], ['profile', '◉', 'Meu perfil']]
};

let state = loadState();
let session = loadSession();
let selectedLoginRole = 'client';
let currentPage = 'dashboard';
let activeMap = null;
let deferredInstallPrompt = null;

const els = {
  landingView: document.getElementById('landingView'), appView: document.getElementById('appView'),
  loginForm: document.getElementById('loginForm'), loginTitle: document.getElementById('loginTitle'),
  loginEmail: document.getElementById('loginEmail'), loginPassword: document.getElementById('loginPassword'),
  openRegisterBtn: document.getElementById('openRegisterBtn'),
  logoutBtn: document.getElementById('logoutBtn'), installBtn: document.getElementById('installBtn'),
  profileAvatar: document.getElementById('profileAvatar'), profileName: document.getElementById('profileName'),
  profileRole: document.getElementById('profileRole'), sideMenu: document.getElementById('sideMenu'),
  dashboardHeader: document.getElementById('dashboardHeader'), workspaceContent: document.getElementById('workspaceContent'),
  modalBackdrop: document.getElementById('modalBackdrop'), modalTitle: document.getElementById('modalTitle'),
  modalEyebrow: document.getElementById('modalEyebrow'), modalBody: document.getElementById('modalBody'),
  closeModalBtn: document.getElementById('closeModalBtn'), toast: document.getElementById('toast')
};

// ==========================================
// 2. ESTADO PADRÃO (SEM USUÁRIOS DEMO)
// ==========================================
function defaultState() {
  return {
    settings: {
      baseFee: 12, kmRate: 2.4, serviceFee: 3.5, fragileFee: 4.5,
      extraPackageFee: 1.5, roadFactor: 1.35, platformCommission: 0.18
    },
    clients: [],
    couriers: [],
    masters: [],
    orders: []
  };
}
// ==========================================

// ==========================================
// 3. GERENCIAMENTO DE ESTADO COM FIREBASE
// ==========================================
async function loadStateFromFirebase() {
  try {
    const settingsDoc = await getDoc(doc(db, "config", "settings"));
    if (settingsDoc.exists()) state.settings = { ...state.settings, ...settingsDoc.data() };

    const ordersSnap = await getDocs(collection(db, "orders"));
    state.orders = ordersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Se houver sessão, busca os dados do usuário no Firestore
    if (session && session.userId) {
      const userDoc = await getDoc(doc(db, "users", session.userId));
      if (userDoc.exists()) {
        state.currentUser = { id: session.userId, ...userDoc.data() };
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Usando dados locais (offline ou sem permissão):", error);
  }
}

async function saveStateToFirebase() {
  try {
    await setDoc(doc(db, "config", "settings"), state.settings, { merge: true });
    for (const order of state.orders) {
      const { id, ...orderData } = order;
      await setDoc(doc(db, "orders", id), orderData, { merge: true });
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Erro ao salvar no Firebase:", error);
    notify('Erro de conexão com o banco de dados.', 'error');
  }
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  state = saved ? JSON.parse(saved) : defaultState();
  loadStateFromFirebase();
  return state;
}

function saveState() {
  saveStateToFirebase();
}

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) || null; }
  catch { return null; }
}

function saveSession(value) {
  session = value;
  if (value) sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  else sessionStorage.removeItem(SESSION_KEY);
}

function getCurrentUser() {
  if (state.currentUser) return state.currentUser;
  if (!session) return null;
  const collection = session.role === 'client' ? state.clients : session.role === 'courier' ? state.couriers : state.masters;
  return collection.find(u => u.id === session.userId) || null;
}
// ==========================================

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function roleLabel(role) {
  return role === 'client' ? 'Cliente' : role === 'courier' ? 'Entregador' : 'Administrador Master';
}

function statusClass(status) {
  if (status === 'searching' || status === 'payment_pending') return 'status-searching';
  if (['found', 'going_pickup', 'at_pickup'].includes(status)) return 'status-found';
  if (['picked_up', 'in_transit', 'at_destination'].includes(status)) return 'status-picked-up';
  if (['delivered', 'completed'].includes(status)) return 'status-completed';
  return 'status-cancelled';
}

function vehicleLabel(value) {
  return ({ bike: 'Bicicleta', motorcycle: 'Motocicleta', car: 'Carro', utility: 'Utilitário', van: 'Van', auto: 'Automático' })[value] || value;
}

function notify(message, type = '') {
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => { els.toast.className = 'toast'; }, 3200);
}

function setLoginRole(role) {
  selectedLoginRole = role;
  document.querySelectorAll('.role-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.role === role));
  els.loginTitle.textContent = `Entrar como ${role === 'master' ? 'Administrador Master' : roleLabel(role).toLowerCase()}`;
  els.loginEmail.value = '';
  els.loginPassword.value = '';
  els.openRegisterBtn.classList.toggle('hidden', role === 'master');
}

function enterApp() {
  const user = getCurrentUser();
  if (!user) { saveSession(null); showLanding(); return; }
  els.landingView.classList.add('hidden');
  els.appView.classList.remove('hidden');
  els.logoutBtn.classList.remove('hidden');
  els.profileName.textContent = user.name;
  els.profileRole.textContent = roleLabel(session.role);
  els.profileAvatar.textContent = user.name.trim().charAt(0).toUpperCase();
  currentPage = 'dashboard';
  renderMenu();
  renderPage();
}

function showLanding() {
  els.appView.classList.add('hidden');
  els.landingView.classList.remove('hidden');
  els.logoutBtn.classList.add('hidden');
}

function renderMenu() {
  els.sideMenu.innerHTML = menuConfig[session.role].map(([page, icon, label]) => `
    <button class="menu-btn ${page === currentPage ? 'active' : ''}" data-page="${page}">
      <span class="menu-icon">${icon}</span><span>${label}</span>
    </button>
  `).join('');
}

function headerHTML(eyebrow, title, subtitle, actions = '') {
  return `<div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div><div class="header-actions">${actions}</div>`;
}

function renderPage() {
  renderMenu();
  if (session.role === 'client') renderClientPage();
  if (session.role === 'courier') renderCourierPage();
  if (session.role === 'master') renderMasterPage();
}

function clientOrders() {
  return state.orders.filter(order => order.clientId === session.userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function courierOrders() {
  return state.orders.filter(order => order.courierId === session.userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function activeOrders(orders) {
  return orders.filter(o => !['completed', 'cancelled'].includes(o.status));
}

function orderCard(order, options = {}) {
  const courier = state.couriers.find(c => c.id === order.courierId);
  const buttons = [];
  if (options.track && !['payment_pending', 'cancelled'].includes(order.status)) buttons.push(`<button class="btn btn-outline" data-action="track" data-id="${order.id}">Rastrear</button>`);
  buttons.push(`<button class="btn btn-soft" data-action="details" data-id="${order.id}">Detalhes</button>`);
  if (options.accept) buttons.push(`<button class="btn btn-primary" data-action="accept" data-id="${order.id}">Aceitar</button>`);
  if (options.advance) buttons.push(`<button class="btn btn-primary" data-action="advance" data-id="${order.id}">Avançar status</button>`);
  if (options.pay && order.paymentStatus !== 'paid') buttons.push(`<button class="btn btn-primary" data-action="pay" data-id="${order.id}">Pagar agora</button>`);
  return `
    <article class="order-card">
      <div>
        <h4>${escapeHTML(order.id)} <span class="pill status-pill ${statusClass(order.status)}">${statusLabels[order.status]}</span></h4>
        <p><strong>Retirada:</strong> ${escapeHTML(order.pickup.street)}, ${escapeHTML(order.pickup.number)} — ${escapeHTML(order.pickup.neighborhood)}</p>
        <p><strong>Entrega:</strong> ${escapeHTML(order.delivery.street)}, ${escapeHTML(order.delivery.number)} — ${escapeHTML(order.delivery.neighborhood)}</p>
        <div class="order-meta">
          <span class="pill">${order.distanceKm.toFixed(1)} km</span>
          <span class="pill">${vehicleLabel(order.vehicleType)}</span>
          <span class="pill">${formatBRL(order.price)}</span>
          ${courier ? `<span class="pill">Entregador: ${escapeHTML(courier.name)}</span>` : ''}
        </div>
      </div>
      <div class="order-actions">${buttons.join('')}</div>
    </article>
  `;
}

function renderClientPage() {
  const orders = clientOrders();
  const active = activeOrders(orders);
  if (currentPage === 'new-order') { currentPage = 'dashboard'; renderMenu(); openNewOrder(); return; }

  if (currentPage === 'profile') {
    const user = getCurrentUser();
    els.dashboardHeader.innerHTML = headerHTML('Minha conta', 'Perfil do cliente', 'Atualize seus dados básicos.');
    els.workspaceContent.innerHTML = profileFormHTML(user, false);
    return;
  }

  if (currentPage === 'orders') {
    els.dashboardHeader.innerHTML = headerHTML('Pedidos', 'Minhas entregas', 'Consulte o histórico e acompanhe pedidos em andamento.', `<button class="btn btn-primary" data-action="new-order">Nova entrega</button>`);
    els.workspaceContent.innerHTML = `<section class="panel"><div class="order-list">${orders.length ? orders.map(o => orderCard(o, { track: true, pay: true })).join('') : emptyOrders()}</div></section>`;
    return;
  }

  const totalSpent = orders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.price, 0);
  els.dashboardHeader.innerHTML = headerHTML('Cliente', `Olá, ${escapeHTML(getCurrentUser().name.split(' ')[0])}`, 'Solicite, acompanhe e gerencie suas entregas.', `<button class="btn btn-primary" data-action="new-order">＋ Solicitar entrega</button>`);
  els.workspaceContent.innerHTML = `
    <div class="stats-grid">
      ${statCard('Entregas ativas', active.length, 'Acompanhe em tempo real')}
      ${statCard('Total de pedidos', orders.length, 'Histórico completo')}
      ${statCard('Valor utilizado', formatBRL(totalSpent), 'Pagamentos')}
      ${statCard('Região', 'Belo Horizonte', 'Cobertura configurável')}
    </div>
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header"><div><h3>Pedidos recentes</h3><p>Últimas solicitações realizadas.</p></div><button class="btn btn-ghost" data-page="orders">Ver todos</button></div>
        <div class="order-list">${orders.length ? orders.slice(0, 4).map(o => orderCard(o, { track: true, pay: true })).join('') : emptyOrders()}</div>
      </section>
      <aside class="panel">
        <div class="panel-header"><div><h3>Ações rápidas</h3><p>Principais recursos.</p></div></div>
        <div class="quick-actions">
          <button class="quick-action" data-action="new-order"><strong>Nova entrega</strong><small>Calcule o preço e solicite a coleta.</small></button>
          <button class="quick-action" data-page="orders"><strong>Rastrear pedido</strong><small>Veja o status e a rota estimada.</small></button>
          <button class="quick-action" data-page="profile"><strong>Meu cadastro</strong><small>Telefone e informações da conta.</small></button>
        </div>
      </aside>
    </div>
  `;
}

function renderCourierPage() {
  const courier = getCurrentUser();
  const available = state.orders.filter(o => o.status === 'searching' && !o.courierId && o.paymentStatus === 'paid');
  const mine = courierOrders();
  const active = mine.find(o => !['completed', 'cancelled'].includes(o.status));
  const completed = mine.filter(o => o.status === 'completed');
  const gross = completed.reduce((sum, o) => sum + o.price * (1 - state.settings.platformCommission), 0);

  if (currentPage === 'profile') {
    els.dashboardHeader.innerHTML = headerHTML('Minha conta', 'Perfil do entregador', 'Dados de contato, veículo.');
    els.workspaceContent.innerHTML = profileFormHTML(courier, true);
    return;
  }
  if (currentPage === 'available') {
    els.dashboardHeader.innerHTML = headerHTML('Oportunidades', 'Entregas disponíveis', 'Pedidos pagos que aguardam um profissional.', `<button class="btn ${courier.online ? 'btn-success' : 'btn-danger'}" data-action="toggle-online">${courier.online ? 'Online' : 'Offline'}</button>`);
    els.workspaceContent.innerHTML = `<section class="panel"><div class="order-list">${available.length ? available.map(o => orderCard(o, { accept: true })).join('') : `<div class="empty-state"><strong>Nenhuma entrega disponível</strong>Novos pedidos aparecerão aqui.</div>`}</div></section>`;
    return;
  }
  if (currentPage === 'active') {
    els.dashboardHeader.innerHTML = headerHTML('Rota atual', 'Entrega em andamento', 'Atualize cada etapa para que o cliente acompanhe.');
    els.workspaceContent.innerHTML = active ? `<section class="panel"><div class="order-list">${orderCard(active, { track: true, advance: true })}</div></section>` : `<section class="panel"><div class="empty-state"><strong>Sem entrega ativa</strong>Aceite um pedido disponível para iniciar.</div></section>`;
    return;
  }
  if (currentPage === 'earnings') {
    els.dashboardHeader.innerHTML = headerHTML('Financeiro', 'Meus ganhos', 'Resumo demonstrativo de entregas e repasses.');
    els.workspaceContent.innerHTML = `
      <div class="stats-grid">
        ${statCard('Saldo disponível', formatBRL((courier.balance || 0) + gross), 'Saque via Pix')}
        ${statCard('Entregas concluídas', completed.length, 'Histórico do profissional')}
        ${statCard('Comissão da plataforma', `${Math.round(state.settings.platformCommission * 100)}%`, 'Configurada pelo Master')}
      </div>
      <section class="panel"><div class="panel-header"><div><h3>Histórico</h3><p>Valores líquidos estimados.</p></div><button class="btn btn-primary" data-action="withdraw">Solicitar saque</button></div>${ordersTable(mine, true)}</section>
    `;
    return;
  }

  els.dashboardHeader.innerHTML = headerHTML('Entregador', `Olá, ${escapeHTML(courier.name.split(' ')[0])}`, 'Fique online, aceite pedidos e atualize as etapas.', `<button class="btn ${courier.online ? 'btn-success' : 'btn-danger'}" data-action="toggle-online">${courier.online ? '● Online' : '○ Offline'}</button>`);
  els.workspaceContent.innerHTML = `
    <div class="stats-grid">
      ${statCard('Disponíveis', available.length, 'Pedidos aguardando aceite')}
      ${statCard('Entrega ativa', active ? 1 : 0, active ? statusLabels[active.status] : 'Nenhuma no momento')}
      ${statCard('Saldo estimado', formatBRL((courier.balance || 0) + gross), 'Antes do saque')}
    </div>
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header"><div><h3>${active ? 'Entrega atual' : 'Próximas oportunidades'}</h3><p>${active ? 'Continue atualizando a rota.' : 'Pedidos disponíveis para aceite.'}</p></div></div>
        <div class="order-list">${active ? orderCard(active, { track: true, advance: true }) : available.length ? available.slice(0, 3).map(o => orderCard(o, { accept: true })).join('') : `<div class="empty-state"><strong>Nenhum pedido agora</strong>Mantenha-se online para receber novas solicitações.</div>`}</div>
      </section>
    </div>
  `;
}

function renderMasterPage() {
  const orders = [...state.orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const paidRevenue = orders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + o.price, 0);
  const platformRevenue = paidRevenue * state.settings.platformCommission;

  if (currentPage === 'profile') {
    const user = getCurrentUser();
    els.dashboardHeader.innerHTML = headerHTML('Minha conta', 'Perfil do Administrador', 'Atualize seus dados.');
    els.workspaceContent.innerHTML = profileFormHTML(user, false);
    return;
  }

  if (currentPage === 'orders') {
    els.dashboardHeader.innerHTML = headerHTML('Operação', 'Todas as entregas', 'Acompanhe pedidos, pagamentos e status.');
    els.workspaceContent.innerHTML = `<section class="panel">${ordersTable(orders, false, true)}</section>`;
    return;
  }
  if (currentPage === 'couriers') {
    els.dashboardHeader.innerHTML = headerHTML('Cadastros', 'Entregadores', 'Aprove e acompanhe profissionais.');
    els.workspaceContent.innerHTML = `<section class="panel">${couriersTable()}</section>`;
    return;
  }
  if (currentPage === 'finance') {
    els.dashboardHeader.innerHTML = headerHTML('Financeiro', 'Movimentação da plataforma', 'Valores do ambiente.');
    els.workspaceContent.innerHTML = `
      <div class="stats-grid">
        ${statCard('Volume processado', formatBRL(paidRevenue), 'Pedidos pagos')}
        ${statCard('Receita estimada', formatBRL(platformRevenue), `${Math.round(state.settings.platformCommission * 100)}% de comissão`)}
      </div>
      <section class="panel">${ordersTable(orders, false, true)}</section>
    `;
    return;
  }
  if (currentPage === 'settings') {
    els.dashboardHeader.innerHTML = headerHTML('Configuração', 'Tarifas e ajustes', 'Altere os componentes do cálculo.');
    els.workspaceContent.innerHTML = settingsHTML();
    return;
  }

  const active = activeOrders(orders);
  els.dashboardHeader.innerHTML = headerHTML('Administração', 'Painel Master', 'Controle operacional, financeiro e cadastral.', `<button class="btn btn-outline" data-action="reset-demo">Restaurar demonstração</button>`);
  els.workspaceContent.innerHTML = `
    <div class="stats-grid">
      ${statCard('Entregas ativas', active.length, 'Em toda a operação')}
      ${statCard('Entregadores', state.couriers.length, `${state.couriers.filter(c => c.approved).length} aprovados`)}
      ${statCard('Receita estimada', formatBRL(platformRevenue), 'Comissão da plataforma')}
    </div>
    <div class="content-grid">
      <section class="panel">
        <div class="panel-header"><div><h3>Operação recente</h3><p>Pedidos mais recentes da plataforma.</p></div><button class="btn btn-ghost" data-page="orders">Ver todos</button></div>
        ${ordersTable(orders.slice(0, 6), false, true)}
      </section>
    </div>
  `;
}

function statCard(label, value, trend) {
  return `<article class="stat-card"><small>${label}</small><strong>${value}</strong><div class="trend">${trend}</div></article>`;
}

function timelineItem(title, subtitle, done = false, current = false) {
  return `<div class="timeline-item ${done ? 'done' : ''} ${current ? 'current' : ''}"><span class="timeline-dot"></span><div class="timeline-copy"><strong>${title}</strong><small>${subtitle}</small></div></div>`;
}

function emptyOrders() {
  return `<div class="empty-state"><strong>Nenhuma entrega cadastrada</strong>Use "Nova entrega" para criar o primeiro pedido.</div>`;
}

function ordersTable(orders, netValue = false, admin = false) {
  if (!orders.length) return `<div class="empty-state"><strong>Sem dados</strong>Nenhuma entrega encontrada.</div>`;
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Pedido</th><th>Rota</th><th>Status</th><th>Pagamento</th><th>Valor</th><th>Ação</th></tr></thead>
      <tbody>${orders.map(order => `
        <tr>
          <td><strong>${escapeHTML(order.id)}</strong><br><small>${formatDate(order.createdAt)}</small></td>
          <td>${escapeHTML(order.pickup.neighborhood)} → ${escapeHTML(order.delivery.neighborhood)}<br><small>${order.distanceKm.toFixed(1)} km</small></td>
          <td><span class="pill status-pill ${statusClass(order.status)}">${statusLabels[order.status]}</span></td>
          <td>${order.paymentStatus === 'paid' ? 'Pago' : 'Pendente'} · ${order.paymentMethod === 'pix' ? 'Pix' : 'Cartão'}</td>
          <td>${formatBRL(netValue ? order.price * (1 - state.settings.platformCommission) : order.price)}</td>
          <td><button class="btn btn-soft" data-action="details" data-id="${order.id}">Abrir</button>${admin ? ` <button class="btn btn-outline" data-action="admin-status" data-id="${order.id}">Status</button>` : ''}</td>
        </tr>
      `).join('')}</tbody>
    </table></div>
  `;
}

function couriersTable() {
  return `
    <div class="table-wrap"><table>
      <thead><tr><th>Profissional</th><th>Veículo</th><th>Situação</th><th>Disponibilidade</th><th>Ação</th></tr></thead>
      <tbody>${state.couriers.map(c => `
        <tr>
          <td><strong>${escapeHTML(c.name)}</strong><br><small>${escapeHTML(c.email)}</small></td>
          <td>${escapeHTML(c.vehicle)}<br><small>${escapeHTML(c.plate)}</small></td>
          <td>${c.approved ? '<span class="pill status-completed status-pill">Aprovado</span>' : '<span class="pill status-searching status-pill">Pendente</span>'}</td>
          <td>${c.online ? 'Online' : 'Offline'}</td>
          <td><button class="btn ${c.approved ? 'btn-danger' : 'btn-success'}" data-action="toggle-approval" data-id="${c.id}">${c.approved ? 'Suspender' : 'Aprovar'}</button></td>
        </tr>
      `).join('')}</tbody>
    </table></div>
  `;
}

function settingsHTML() {
  const s = state.settings;
  return `
    <form id="settingsForm" class="panel stack-lg">
      <div class="config-grid">
        ${configInput('Taxa base', 'baseFee', s.baseFee, 'R$')}
        ${configInput('Preço por km', 'kmRate', s.kmRate, 'R$')}
        ${configInput('Taxa de serviço', 'serviceFee', s.serviceFee, 'R$')}
        ${configInput('Adicional frágil', 'fragileFee', s.fragileFee, 'R$')}
        ${configInput('Volume adicional', 'extraPackageFee', s.extraPackageFee, 'R$')}
        ${configInput('Comissão', 'platformCommission', s.platformCommission * 100, '%')}
      </div>
      <button class="btn btn-primary" type="submit">Salvar tarifas</button>
    </form>
  `;
}

function configInput(label, name, value, suffix) {
  return `<label class="config-card"><strong>${label}</strong><span class="muted small">Valor em ${suffix}</span><input name="${name}" type="number" min="0" step="0.01" value="${Number(value).toFixed(2)}" required /></label>`;
}

function profileFormHTML(user, courier) {
  return `
    <form id="profileForm" class="panel stack-lg">
      <div class="form-grid two-cols">
        <label>Nome completo<input name="name" value="${escapeHTML(user.name)}" required /></label>
        <label>E-mail<input name="email" type="email" value="${escapeHTML(user.email)}" disabled /></label>
        <label>Telefone<input name="phone" value="${escapeHTML(user.phone || '')}" /></label>
        ${courier ? `<label>Veículo<input name="vehicle" value="${escapeHTML(user.vehicle || '')}" required /></label><label>Placa<input name="plate" value="${escapeHTML(user.plate || '')}" required /></label>` : ''}
      </div>
      <button class="btn btn-primary" type="submit" style="margin-top: 1.5rem;">Salvar alterações</button>
    </form>
  `;
}

function openModal(title, eyebrow, html) {
  if (activeMap) { activeMap.remove(); activeMap = null; }
  els.modalTitle.textContent = title;
  els.modalEyebrow.textContent = eyebrow;
  els.modalBody.innerHTML = html;
  els.modalBackdrop.classList.remove('hidden');
  els.modalBackdrop.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  if (activeMap) { activeMap.remove(); activeMap = null; }
  els.modalBackdrop.classList.add('hidden');
  els.modalBackdrop.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  els.modalBody.innerHTML = '';
}

function openNewOrder() {
  const template = document.getElementById('newOrderTemplate');
  openModal('Solicitar nova entrega', 'Cliente', '');
  els.modalBody.appendChild(template.content.cloneNode(true));
  populateNeighborhoodSelects();
  setupOrderForm();
}

function populateNeighborhoodSelects() {
  const options = `<option value="">Selecione</option>${Object.keys(neighborhoods).map(name => `<option value="${name}">${name}</option>`).join('')}`;
  document.querySelectorAll('.neighborhood-select').forEach(select => { select.innerHTML = options; });
}

function setupOrderForm() {
  const form = document.getElementById('orderForm');
  const scheduled = form.elements.scheduled;
  const scheduleFields = document.getElementById('scheduleFields');
  const cardFields = document.getElementById('cardFields');
  const quoteInputs = ['pickupNeighborhood', 'deliveryNeighborhood', 'weight', 'length', 'width', 'height', 'packages', 'vehicleType', 'fragile'];

  scheduled.addEventListener('change', () => scheduleFields.classList.toggle('hidden', !scheduled.checked));
  form.querySelectorAll('input[name="paymentMethod"]').forEach(radio => radio.addEventListener('change', () => {
    form.querySelectorAll('.payment-card').forEach(card => card.classList.toggle('active', card.querySelector('input').checked));
    const isCard = form.elements.paymentMethod.value === 'card';
    cardFields.classList.toggle('hidden', !isCard);
    ['cardNumber', 'cardName', 'cardExpiry', 'cardCvv'].forEach(name => form.elements[name].required = isCard);
  }));
  quoteInputs.forEach(name => form.elements[name].addEventListener('input', () => updateQuote(form)));
  document.getElementById('recalculateBtn').addEventListener('click', () => updateQuote(form, true));
  form.elements.cardNumber.addEventListener('input', e => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 16);
    e.target.value = digits.replace(/(.{4})/g, '$1 ').trim();
  });
  form.elements.cardExpiry.addEventListener('input', e => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });
  form.addEventListener('submit', handleOrderSubmit);
  updateQuote(form);
}

function recommendVehicle(weight, volumeM3) {
  if (weight <= 3 && volumeM3 <= 0.04) return 'bike';
  if (weight <= 20 && volumeM3 <= 0.18) return 'motorcycle';
  if (weight <= 120 && volumeM3 <= 0.9) return 'car';
  if (weight <= 350 && volumeM3 <= 3.5) return 'utility';
  return 'van';
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function calculateQuote(form) {
  const pickupName = form.elements.pickupNeighborhood.value;
  const deliveryName = form.elements.deliveryNeighborhood.value;
  const weight = Number(form.elements.weight.value || 0);
  const length = Number(form.elements.length.value || 0);
  const width = Number(form.elements.width.value || 0);
  const height = Number(form.elements.height.value || 0);
  const packages = Number(form.elements.packages.value || 1);
  const volumeM3 = (length * width * height) / 1_000_000;
  const recommended = recommendVehicle(weight, volumeM3);
  const requested = form.elements.vehicleType.value;
  const vehicle = requested === 'auto' ? recommended : requested;
  const distanceKm = pickupName && deliveryName ? Math.max(1.5, haversineKm(neighborhoods[pickupName], neighborhoods[deliveryName]) * state.settings.roadFactor) : 0;
  const vehicleFees = { bike: 0, motorcycle: 3, car: 8, utility: 18, van: 35 };
  const weightFee = Math.max(0, weight - 3) * 0.45;
  const volumeFee = Math.max(0, volumeM3 - 0.04) * 22;
  const packageFee = Math.max(0, packages - 1) * state.settings.extraPackageFee;
  const fragileFee = form.elements.fragile.checked ? state.settings.fragileFee : 0;
  const total = distanceKm ? state.settings.baseFee + distanceKm * state.settings.kmRate + state.settings.serviceFee + vehicleFees[vehicle] + weightFee + volumeFee + packageFee + fragileFee : 0;
  return { total: Math.max(0, total), distanceKm, recommended, vehicle, volumeM3 };
}

function updateQuote(form, announce = false) {
  const quote = calculateQuote(form);
  document.getElementById('quoteTotal').textContent = formatBRL(quote.total);
  document.getElementById('quoteDetails').textContent = quote.distanceKm
    ? `${quote.distanceKm.toFixed(1)} km · Veículo: ${vehicleLabel(quote.vehicle)}${form.elements.vehicleType.value === 'auto' ? ' (recomendado)' : ''}`
    : 'Selecione os bairros para calcular.';
  if (announce && quote.distanceKm) notify('Estimativa atualizada.', 'success');
  return quote;
}

function validateVehicleCompatibility(quote, weight, volumeM3) {
  const rank = { bike: 1, motorcycle: 2, car: 3, utility: 4, van: 5 };
  return rank[quote.vehicle] >= rank[recommendVehicle(weight, volumeM3)];
}

function handleOrderSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const quote = calculateQuote(form);

  if (!quote.distanceKm) return notify('⚠️ Selecione os bairros de retirada e entrega.', 'error');
  const weight = Number(form.elements.weight.value);
  if (!validateVehicleCompatibility(quote, weight, quote.volumeM3)) return notify(`⚠️ Veículo insuficiente. Recomendação: ${vehicleLabel(quote.recommended)}.`, 'error');

  const data = new FormData(form);
  const paymentMethod = data.get('paymentMethod');

  const order = {
    id: nextOrderId(), clientId: session.userId, courierId: null, createdAt: new Date().toISOString(),
    pickup: { street: data.get('pickupStreet'), number: data.get('pickupNumber'), neighborhood: data.get('pickupNeighborhood'), complement: data.get('pickupComplement') },
    delivery: { street: data.get('deliveryStreet'), number: data.get('deliveryNumber'), neighborhood: data.get('deliveryNeighborhood'), complement: data.get('deliveryComplement') },
    pickupPerson: data.get('pickupPerson'), pickupPhone: data.get('pickupPhone'), receiverPerson: data.get('receiverPerson'), receiverPhone: data.get('receiverPhone'),
    item: { description: data.get('itemDescription'), category: data.get('category'), packages: Number(data.get('packages')), weight, length: Number(data.get('length')), width: Number(data.get('width')), height: Number(data.get('height')), fragile: data.get('fragile') === 'on', perishable: data.get('perishable') === 'on', declaredValue: Number(data.get('declaredValue') || 0) },
    vehicleType: quote.vehicle, distanceKm: Number(quote.distanceKm.toFixed(1)), price: Number(quote.total.toFixed(2)),
    paymentMethod, paymentStatus: paymentMethod === 'card' ? 'paid' : 'pending', status: paymentMethod === 'card' ? 'searching' : 'payment_pending',
    pickupCode: randomCode(), deliveryCode: randomCode(), scheduledAt: data.get('scheduled') === 'on' ? `${data.get('scheduleDate')}T${data.get('scheduleTime')}` : null,
    notes: data.get('routeNotes'), history: [{ status: paymentMethod === 'card' ? 'searching' : 'payment_pending', at: new Date().toISOString() }]
  };

  state.orders.push(order);
  saveState();

  closeModal();
  notify(`✅ Pedido ${order.id} criado com sucesso!`, 'success');
  currentPage = 'orders';
  renderPage();

  if (paymentMethod === 'pix') setTimeout(() => openPixPayment(order), 300);
}

function nextOrderId() {
  const year = new Date().getFullYear();
  const max = state.orders.reduce((acc, order) => Math.max(acc, Number(order.id.split('-').pop()) || 0), 0);
  return `BH-${year}-${String(max + 1).padStart(6, '0')}`;
}

function randomCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

function openPixPayment(order) {
  openModal('Pagamento por Pix', 'Ambiente de testes', `
    <div class="tracking-grid">
      <div class="qr-wrap">
        <canvas id="pixCanvas" width="210" height="210" aria-label="QR Code demonstrativo"></canvas>
        <strong>${formatBRL(order.price)}</strong>
        <span class="muted small">QR Code ilustrativo — não realize pagamento real.</span>
      </div>
      <div class="stack-lg">
        <div><span class="eyebrow">Pedido</span><h3>${escapeHTML(order.id)}</h3><p class="muted">Após a confirmação, o pedido ficará disponível.</p></div>
        <label>Pix copia e cola<textarea readonly rows="4">PIX-DEMONSTRACAO-${order.id}-${order.price.toFixed(2)}</textarea></label>
        <button class="btn btn-primary btn-lg" data-action="confirm-pix" data-id="${order.id}">Confirmar pagamento</button>
      </div>
    </div>
  `);
  drawDemoQR(document.getElementById('pixCanvas'), order.id);
}

function drawDemoQR(canvas, seedText) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cells = 29;
  const size = canvas.width / cells;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = [...seedText].reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 17) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  ctx.fillStyle = '#0f2f31';
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) if (rand() > .53) ctx.fillRect(Math.floor(x * size), Math.floor(y * size), Math.ceil(size), Math.ceil(size));
  [[1, 1], [cells - 8, 1], [1, cells - 8]].forEach(([x, y]) => {
    ctx.fillStyle = '#0f2f31'; ctx.fillRect(x * size, y * size, 7 * size, 7 * size);
    ctx.fillStyle = '#fff'; ctx.fillRect((x + 1) * size, (y + 1) * size, 5 * size, 5 * size);
    ctx.fillStyle = '#0f2f31'; ctx.fillRect((x + 2) * size, (y + 2) * size, 3 * size, 3 * size);
  });
}

function openOrderDetails(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const courier = state.couriers.find(c => c.id === order.courierId);
  openModal(order.id, 'Detalhes da entrega', `
    <div class="tracking-grid">
      <div class="stack-lg">
        <section class="form-section route-summary">
          <div class="route-point"><div><strong>${escapeHTML(order.pickup.street)}, ${escapeHTML(order.pickup.number)}</strong><small>${escapeHTML(order.pickup.neighborhood)}</small></div></div>
          <div class="route-point delivery"><div><strong>${escapeHTML(order.delivery.street)}, ${escapeHTML(order.delivery.number)}</strong><small>${escapeHTML(order.delivery.neighborhood)}</small></div></div>
        </section>
        <section class="form-section">
          <div class="section-title"><span class="eyebrow">Mercadoria</span><h3>${escapeHTML(order.item.description)}</h3></div>
          <div class="order-meta"><span class="pill">${escapeHTML(order.item.category)}</span><span class="pill">${order.item.weight} kg</span><span class="pill">${order.item.packages} volume(s)</span></div>
        </section>
      </div>
      <aside class="stack-lg">
        <section class="form-section">
          <span class="eyebrow">Status</span><h3>${statusLabels[order.status]}</h3>
          <p class="muted">${courier ? `Entregador: ${escapeHTML(courier.name)}` : 'Aguardando atribuição.'}</p>
        </section>
        ${order.paymentStatus !== 'paid' ? `<button class="btn btn-primary" data-action="pay" data-id="${order.id}">Realizar pagamento</button>` : ''}
        ${!['payment_pending', 'cancelled'].includes(order.status) ? `<button class="btn btn-outline" data-action="track" data-id="${order.id}">Abrir rastreamento</button>` : ''}
      </aside>
    </div>
  `);
}

function openTracking(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const currentIndex = statusFlow.indexOf(order.status);
  openModal(`Rastreamento ${order.id}`, 'Acompanhamento', `
    <div class="tracking-grid">
      <div>
        <div id="trackingMap" class="map"><div class="map-fallback">Carregando mapa...</div></div>
      </div>
      <aside class="form-section">
        <span class="eyebrow">Status atual</span><h3>${statusLabels[order.status]}</h3>
        <div class="timeline">
          ${statusFlow.slice(1).map((status, index) => {
    const absolute = index + 1;
    return timelineItem(statusLabels[status], absolute < currentIndex ? 'Concluído' : absolute === currentIndex ? 'Etapa atual' : 'Aguardando', absolute < currentIndex, absolute === currentIndex);
  }).join('')}
        </div>
      </aside>
    </div>
  `);
  setTimeout(() => initTrackingMap(order), 80);
}

function initTrackingMap(order) {
  const container = document.getElementById('trackingMap');
  if (!container) return;
  const start = neighborhoods[order.pickup.neighborhood];
  const end = neighborhoods[order.delivery.neighborhood];
  if (!window.L || !start || !end) {
    container.innerHTML = `<div class="map-fallback"><strong>Mapa indisponível</strong><br>Conecte-se à internet.</div>`;
    return;
  }
  container.innerHTML = '';
  activeMap = L.map(container, { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(activeMap);
  const route = L.polyline([start, end], { weight: 5, opacity: .8 }).addTo(activeMap);
  L.marker(start).addTo(activeMap).bindPopup('Retirada');
  L.marker(end).addTo(activeMap).bindPopup('Entrega');
  const progress = Math.min(1, Math.max(0, (statusFlow.indexOf(order.status) - 2) / 6));
  const courierPos = [start[0] + (end[0] - start[0]) * progress, start[1] + (end[1] - start[1]) * progress];
  L.circleMarker(courierPos, { radius: 10, weight: 4, fillOpacity: 1 }).addTo(activeMap).bindPopup('Entregador').openPopup();
  activeMap.fitBounds(route.getBounds(), { padding: [30, 30] });
}

// ==========================================
// 4. CADASTRO COM FIREBASE AUTH
// ==========================================
function openRegister() {
  if (selectedLoginRole === 'master') return notify('Novos administradores devem ser criados pelo painel Master.', 'error');
  const courierFields = selectedLoginRole === 'courier' ? `
    <label>Veículo<select name="vehicle"><option>Motocicleta</option><option>Bicicleta</option><option>Carro</option><option>Utilitário</option><option>Van</option></select></label>
    <label>Placa<input name="plate" required placeholder="ABC1D23" /></label>
  ` : '';

  openModal(`Cadastro de ${roleLabel(selectedLoginRole).toLowerCase()}`, 'Nova conta', `
    <form id="registerForm" class="stack-lg">
      <div class="form-grid two-cols">
        <label>Nome completo<input name="name" required /></label>
        <label>Telefone<input name="phone" required placeholder="(31) 99999-9999" /></label>
        <label>E-mail<input name="email" type="email" required /></label>
        <label>Senha<input name="password" type="password" minlength="6" required /></label>
        ${courierFields}
      </div>
      <label class="check legal-check"><input type="checkbox" required /> Aceito os termos e a política de privacidade.</label>
      <button class="btn btn-primary btn-lg" type="submit">Criar cadastro</button>
    </form>
  `);

  document.getElementById('registerForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = data.get('email');
    const password = data.get('password');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      const userData = {
        name: data.get('name'),
        email: email,
        phone: data.get('phone'),
        role: selectedLoginRole,
        createdAt: new Date().toISOString()
      };

      if (selectedLoginRole === 'courier') {
        userData.vehicle = data.get('vehicle');
        userData.plate = String(data.get('plate')).toUpperCase();
        userData.approved = false;
        userData.online = false;
        userData.balance = 0;
        userData.rating = 5;
        state.couriers.push({ id: firebaseUser.uid, ...userData });
      } else {
        userData.active = true;
        state.clients.push({ id: firebaseUser.uid, ...userData });
      }

      await setDoc(doc(db, "users", firebaseUser.uid), userData);
      saveState();

      closeModal();
      els.loginEmail.value = email;
      els.loginPassword.value = password;
      notify('Cadastro criado com sucesso! Faça o login.', 'success');
    } catch (error) {
      console.error("Erro no cadastro:", error);
      if (error.code === 'auth/email-already-in-use') {
        notify('Este e-mail já está cadastrado.', 'error');
      } else {
        notify('Erro ao criar conta. Tente novamente.', 'error');
      }
    }
  });
}
// ==========================================

function openAdminStatus(order) {
  openModal('Alterar status', order.id, `
    <form id="adminStatusForm" class="stack-lg">
      <label>Novo status<select name="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${value === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <button class="btn btn-primary" type="submit">Salvar alteração</button>
    </form>
  `);
  document.getElementById('adminStatusForm').addEventListener('submit', e => {
    e.preventDefault();
    order.status = new FormData(e.currentTarget).get('status');
    order.history.push({ status: order.status, at: new Date().toISOString(), source: 'master' });
    saveState(); closeModal(); renderPage(); notify('Status atualizado pelo Master.', 'success');
  });
}

function advanceOrder(order) {
  if (!order || order.courierId !== session.userId) return;
  const currentIndex = statusFlow.indexOf(order.status);
  const next = statusFlow[Math.max(2, currentIndex + 1)];
  if (!next) return notify('A entrega já foi concluída.', 'success');
  order.status = next;
  order.history.push({ status: next, at: new Date().toISOString() });
  if (next === 'completed') {
    const courier = getCurrentUser();
    courier.balance = Number(((courier.balance || 0) + order.price * (1 - state.settings.platformCommission)).toFixed(2));
  }
  saveState(); renderPage(); notify(`Status: ${statusLabels[next]}.`, 'success');
}

function acceptOrder(order) {
  const courier = getCurrentUser();
  if (!courier.online) return notify('Fique online antes de aceitar entregas.', 'error');
  if (courier.approved === false) return notify('Seu cadastro ainda não foi aprovado.', 'error');
  const existing = courierOrders().find(o => !['completed', 'cancelled'].includes(o.status));
  if (existing) return notify('Conclua sua entrega atual antes de aceitar outra.', 'error');
  if (order.courierId || order.status !== 'searching') return notify('Este pedido não está mais disponível.', 'error');
  order.courierId = courier.id;
  order.status = 'found';
  order.history.push({ status: 'found', at: new Date().toISOString() });
  saveState(); currentPage = 'active'; renderPage(); notify('Entrega aceita com sucesso.', 'success');
}

function handleWorkspaceClick(event) {
  const pageBtn = event.target.closest('[data-page]');
  if (pageBtn) { currentPage = pageBtn.dataset.page; renderPage(); return; }
  const actionBtn = event.target.closest('[data-action]');
  if (!actionBtn) return;
  const action = actionBtn.dataset.action;
  const id = actionBtn.dataset.id;
  const order = state.orders.find(o => o.id === id);

  if (action === 'new-order') openNewOrder();
  if (action === 'details') openOrderDetails(id);
  if (action === 'track') openTracking(id);
  if (action === 'pay' && order) openPixPayment(order);
  if (action === 'confirm-pix' && order) {
    order.paymentStatus = 'paid'; order.status = 'searching'; order.history.push({ status: 'searching', at: new Date().toISOString() });
    saveState(); closeModal(); currentPage = 'orders'; renderPage(); notify('Pix confirmado.', 'success');
  }
  if (action === 'accept' && order) acceptOrder(order);
  if (action === 'advance' && order) advanceOrder(order);
  if (action === 'toggle-online') {
    const courier = getCurrentUser(); courier.online = !courier.online; saveState(); renderPage(); notify(courier.online ? 'Você está online.' : 'Você está offline.', 'success');
  }
  if (action === 'toggle-approval') {
    const courier = state.couriers.find(c => c.id === id); if (!courier) return; courier.approved = !courier.approved; saveState(); renderPage(); notify('Situação do entregador atualizada.', 'success');
  }
  if (action === 'admin-status' && order) openAdminStatus(order);
  if (action === 'withdraw') notify('Solicitação de saque enviada.', 'success');
  if (action === 'reset-demo') { state = defaultState(); saveState(); renderPage(); notify('Dados restaurados.', 'success'); }
}

function handleFormSubmit(event) {
  if (event.target.id === 'settingsForm') {
    event.preventDefault(); const data = new FormData(event.target);
    state.settings.baseFee = Number(data.get('baseFee'));
    state.settings.kmRate = Number(data.get('kmRate'));
    state.settings.serviceFee = Number(data.get('serviceFee'));
    state.settings.fragileFee = Number(data.get('fragileFee'));
    state.settings.extraPackageFee = Number(data.get('extraPackageFee'));
    state.settings.platformCommission = Number(data.get('platformCommission')) / 100;
    saveState(); renderPage(); notify('Tarifas atualizadas.', 'success');
  }

  if (event.target.id === 'profileForm') {
    event.preventDefault();
    const data = new FormData(event.target);
    const user = getCurrentUser();

    user.name = data.get('name');
    user.phone = data.get('phone');
    if (session.role === 'courier') {
      user.vehicle = data.get('vehicle');
      user.plate = data.get('plate');
    }

    if (session && session.userId) {
      updateDoc(doc(db, "users", session.userId), {
        name: user.name,
        phone: user.phone,
        vehicle: user.vehicle || '',
        plate: user.plate || ''
      }).then(() => {
        saveState();
        enterApp();
        currentPage = 'profile';
        renderPage();
        notify('Perfil atualizado com sucesso!', 'success');
      }).catch(err => {
        console.error(err);
        notify('Erro ao salvar no banco de dados.', 'error');
      });
    }
  }
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================
document.querySelectorAll('.role-tab').forEach(btn => btn.addEventListener('click', () => setLoginRole(btn.dataset.role)));

// LOGIN COM FIREBASE AUTH
els.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));

    if (userDoc.exists()) {
      const userData = userDoc.data();

      saveSession({
        role: userData.role,
        userId: firebaseUser.uid,
        email: firebaseUser.email
      });

      state.currentUser = { id: firebaseUser.uid, ...userData };
      await loadStateFromFirebase();
      enterApp();
      notify(`Bem-vindo, ${userData.name}!`, 'success');
    } else {
      notify('Usuário autenticado, mas dados não encontrados no banco.', 'error');
      await signOut(auth);
    }
  } catch (error) {
    console.error("Erro no login:", error);
    notify('E-mail ou senha inválidos. Faça seu cadastro para criar uma conta.', 'error');
  }
});

els.openRegisterBtn.addEventListener('click', openRegister);

els.logoutBtn.addEventListener('click', async () => {
  await signOut(auth);
  saveSession(null);
  state.currentUser = null;
  showLanding();
  notify('Sessão encerrada.');
});

els.closeModalBtn.addEventListener('click', closeModal);
els.modalBackdrop.addEventListener('click', event => { if (event.target === els.modalBackdrop) closeModal(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !els.modalBackdrop.classList.contains('hidden')) closeModal(); });
els.appView.addEventListener('click', handleWorkspaceClick);
els.modalBody.addEventListener('click', handleWorkspaceClick);
els.appView.addEventListener('submit', handleFormSubmit);

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault(); deferredInstallPrompt = event; els.installBtn.classList.remove('hidden');
});
els.installBtn.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; els.installBtn.classList.add('hidden');
});
window.addEventListener('appinstalled', () => notify('BH Entrega instalado.', 'success'));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { });
}

// Inicialização
if (session) {
  loadStateFromFirebase().then(() => {
    if (state.currentUser) enterApp();
    else showLanding();
  });
} else {
  showLanding();
}