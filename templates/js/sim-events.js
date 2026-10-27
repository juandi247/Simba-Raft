const SimulatorEventType = Object.freeze({
  TickAdvance: 0,
  NodeCrashed: 1,
  NodeBackToLife: 2,
  HeartbeatTimeout: 3,
  NodeStateUpdate: 4,
  NewMessage: 5,
  MessageDelivered: 6,
});

/*---------- GOLANG CODE FOR GUIDE -----------
type SimulatorEventType int
const (
    TickAdvance SimulatorEventType = iota
    NodeCrashed
    NodeBackToLife
    HeartbeatTimeout
    NodeStateUpdate
    NewMessage
    MessageDelivered
)
*/

const SimulatorEventName = Object.freeze({
  [SimulatorEventType.TickAdvance]: 'TickAdvance',
  [SimulatorEventType.NodeCrashed]: 'NodeCrashed',
  [SimulatorEventType.NodeBackToLife]: 'NodeBackToLife',
  [SimulatorEventType.HeartbeatTimeout]: 'HeartbeatTimeout',
  [SimulatorEventType.NodeStateUpdate]: 'NodeStateUpdate',
  [SimulatorEventType.NewMessage]: 'NewMessage',
  [SimulatorEventType.MessageDelivered]: 'MessageDelivered',
});

function handleSimulatorEvent(event) {
  switch (event.EventType) {
    case SimulatorEventType.TickAdvance:
      console.log('tick event');
      $('tick').textContent = event.Payload.Tick;
      onTick(event.Payload.Tick);
      deliverDueMessages(event.Payload.Tick);
      movePackets(event.Payload.Tick);
        checkSimulationEnd(event.Payload.Tick);  
      break;

    case SimulatorEventType.NodeCrashed:
      handleNodeCrashed(event.Payload);
      break;

    case SimulatorEventType.NodeBackToLife:
      handleNodeBackToLife(event.Payload);
      break;

    case SimulatorEventType.HeartbeatTimeout:
      handleHeartbeatEvent(event.Payload);
      break;

    case SimulatorEventType.NodeStateUpdate:
      renderNodeState(event.Payload);
      console.log('node state event');
      break;

    case SimulatorEventType.NewMessage:
      handleNewMessage(event.Payload);
      console.log('new message event');
      break;

    case SimulatorEventType.MessageDelivered:
      removeMessageById(event.Payload.MessageId ?? event.Payload.Id);
      console.log('deliver message event');
      break;

    default:
      console.warn('Unknown event type:', event.EventType);
  }
}

function handleHeartbeatEvent(payload) {
  const view = nodeViews.get(payload.NodeId);

  if (!view) {
    console.warn('Heartbeat received for unknown node:', payload.NodeId);
    return;
  }

  view.fields.hb.textContent = payload.HeartbeatTimeoutCounter;
}

// ======================= NODES =======================

const ROLE_NAMES = ['follower', 'candidate', 'leader'];
const ROLE_LEADER = 2;

const byNodeName = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true });

const nodeViews = new Map();

const STAGE = { cx: 50, cy: 44, rx: 38, ry: 36 };

function layoutNodes() {
  const cards = [...document.getElementById('nodes').children];
  const n = cards.length;
  const start = n === 2 ? Math.PI : -Math.PI / 2;

  cards.forEach((el, i) => {
    const angle = start + (i * 2 * Math.PI) / n;
    const r = n === 1 ? 0 : 1;

    el.style.left =
      STAGE.cx + STAGE.rx * r * Math.cos(angle) + '%';
    el.style.top =
      STAGE.cy + STAGE.ry * r * Math.sin(angle) + '%';
  });

  drawNodeLinks();
}

function createNodeView(id) {
  const el = document.createElement('article');
  el.className = 'node';
  el.dataset.id = id;
  el.dataset.role = '0';

  el.innerHTML = `
    <div class="node__circle" data-f="ball"><span data-f="id"></span></div>
    <div class="node__info">
      <p class="node__role" data-f="role"></p>
      <dl class="node__stats">
        <div><dt>term</dt><dd data-f="term"></dd></div>
        <div><dt>commit</dt><dd data-f="commit"></dd></div>
        <div><dt title="heartbeat timeout">timeout</dt><dd data-f="hb"></dd></div>
      </dl>
      <div class="node__log">
        <p class="node__last" data-f="last"> </p>
        <button class="node__more" type="button" data-f="more">full log</button>
        <button class="node__more node__indexes" type="button" data-f="indexes">next / match index</button>
      </div>
    </div>`;

  const fields = {};
  el.querySelectorAll('[data-f]').forEach((f) => {
    fields[f.dataset.f] = f;
  });

  fields.id.textContent = id;
  fields.more.addEventListener('click', () => openLogPanel(id));
  fields.indexes.addEventListener('click', () => openIndexPanel(id));

  const container = document.getElementById('nodes');
  const next = [...container.children].find(
    (c) => c.dataset.id.localeCompare(id, undefined, { numeric: true }) > 0
  );

  container.insertBefore(el, next || null);
  layoutNodes();

  return {
    el,
    fields,
    last: {},
    log: [],
    nextIndex: {},
    matchIndex: {},
    down: false,
    commitIndex: 0,
  };
}

function updateIfChanged(view, key, value, apply) {
  if (view.last[key] === value) return;

  view.last[key] = value;
  apply(value);
}

function formatValue(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function renderLogSummary(view, log) {
  const { last, more } = view.fields;
  const entries = log.length - 1; // sin el índice 0 (magic)

  if (entries <= 0) {
    last.textContent = '';
    more.textContent = 'full log';
    return;
  }

  const i = log.length - 1; // índice real de la última entrada (>= 1)
  last.textContent =
    `last [${i}] · term ${formatValue(log[i].Term ?? log[i].term)}`;
  more.textContent = `full log · ${entries}`;
}

// payload: { NodeId, Term, Role, Log, CommitIndex,
// SimulatorHeartBeatTimeoutCounter, NextIndex, MatchIndex }
function renderNodeState(s) {
  let view = nodeViews.get(s.NodeId);

  if (!view) {
    view = createNodeView(s.NodeId);
    nodeViews.set(s.NodeId, view);
  }

  const f = view.fields;

  updateIfChanged(view, 'role', s.Role, (role) => {
    view.el.dataset.role = role;
    f.role.textContent = ROLE_NAMES[role] ?? 'unknown';

    if (role !== ROLE_LEADER && openIndexId === s.NodeId) {
      closeIndexPanel();
    }
  });

  updateIfChanged(view, 'term', s.Term, (v) => {
    f.term.textContent = v;
  });

  // Keep CommitIndex available for live committed-row styling.
  view.commitIndex = Number(s.CommitIndex ?? 0);

  updateIfChanged(view, 'commit', s.CommitIndex, (v) => {
    f.commit.textContent = v;
  });

  updateIfChanged(
    view,
    'hb',
    s.SimulatorHeartBeatTimeoutCounter,
    (v) => {
      f.hb.textContent = v;
    }
  );

  const next = s.NextIndex || {};
  const match = s.MatchIndex || {};

  view.nextIndex = next;
  view.matchIndex = match;

  const ids = [...new Set([
    ...Object.keys(next),
    ...Object.keys(match),
  ])].sort(byNodeName);

  const indexSignature = ids
    .map((id) => `${id}:${next[id]}:${match[id]}`)
    .join('|');

  updateIfChanged(view, 'indexes', indexSignature, () => {
    if (openIndexId === s.NodeId) {
      renderIndexPanel(next, match);
    }
  });

  const log = s.Log || [];
  view.log = log;

  const signature =
    `${log.length}|${JSON.stringify(log[log.length - 1] ?? null)}`;

  updateIfChanged(view, 'log', signature, () => {
    renderLogSummary(view, log);
  });

  // Refresh the open Log on every SSE NodeStateUpdate.
  // This keeps the panel current even when only CommitIndex changes.
  if (openLogId === s.NodeId) {
    renderLogPanel(log, view.commitIndex);
  }
}

// ======================= FULL LOG PANEL =======================

let openLogId = null;
let panelCount = 0;
let panelLastKey = '';

function logRow(entry, index, commitIndex) {
  const tr = document.createElement('tr');

  // The displayed log starts at index 1; index 0 is never rendered.
  if (index <= commitIndex) {
    tr.classList.add('is-committed');
  }

  tr.append(
    netEl('td', '', index),
    netEl('td', '', formatValue(entry.Term ?? entry.term)),
    netEl('td', '', formatValue(entry.Value ?? entry.value))
  );

  return tr;
}

function renderLogPanel(log, commitIndex = 0) {
  const body = netById('fulllog-body');
  const scroll = netById('fulllog-scroll');

  const follow =
    scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 8;

  // Never display the backing array's element at index 0.
  const visibleLog = log.slice(1);

  const append =
    panelCount > 0 &&
    visibleLog.length >= panelCount &&
    JSON.stringify(visibleLog[panelCount - 1]) === panelLastKey;

  if (!append) {
    body.replaceChildren();
    panelCount = 0;
  }

  if (visibleLog.length === 0) {
    const td = body.insertRow().insertCell();
    td.colSpan = 3;
    td.className = 'muted';
    td.textContent = 'empty';
  } else {
    const rows = document.createDocumentFragment();

for (let i = panelCount; i < visibleLog.length; i++) {
  rows.append(logRow(visibleLog[i], i + 1, commitIndex));
}

body.append(rows);

if (visibleLog.length > 0) {
  panelCount = visibleLog.length;
  panelLastKey = JSON.stringify(visibleLog[visibleLog.length - 1]);
}
  }

  // Update existing rows when CommitIndex changes, even if the log did not grow.
  [...body.rows].forEach((row) => {
    const index = Number(row.cells[0]?.textContent);

    row.classList.toggle(
      'is-committed',
      Number.isFinite(index) && index > 0 && index <= commitIndex
    );
  });

  netById('fulllog-count').textContent =
    `${visibleLog.length} ${visibleLog.length === 1 ? 'entry' : 'entries'}`;

  if (follow) {
    scroll.scrollTop = scroll.scrollHeight;
  }
}

function openLogPanel(id) {
  const view = nodeViews.get(id);
  if (!view) return;

  closeIndexPanel();

  openLogId = id;
  panelCount = 0;

  netById('fulllog-title').textContent = `${id} · log`;
  netById('fulllog').hidden = false;

  renderLogPanel(view.log, view.commitIndex ?? 0);

  netById('fulllog-close').focus();
}

function closeLogPanel() {
  openLogId = null;
  netById('fulllog').hidden = true;
}

// ======================= NEXT / MATCH INDEX PANEL =======================

let openIndexId = null;
let indexCells = new Map();

function setCellText(cell, value) {
  const text = formatValue(value);
  if (cell.textContent !== text) {
    cell.textContent = text;
  }
}

function renderIndexPanel(next, match) {
  const body = netById('indexpanel-body');

  const ids = [...new Set([
    ...Object.keys(next),
    ...Object.keys(match),
  ])].sort(byNodeName);

  if (
    ids.join('|') !== [...indexCells.keys()].join('|') ||
    ids.length === 0
  ) {
    body.replaceChildren();
    indexCells = new Map();

    if (ids.length === 0) {
      const td = body.insertRow().insertCell();
      td.colSpan = 3;
      td.className = 'muted';
      td.textContent = 'no followers yet';
      return;
    }

    for (const id of ids) {
      const tr = body.insertRow();
      tr.insertCell().textContent = id;

      indexCells.set(id, {
        next: tr.insertCell(),
        match: tr.insertCell(),
      });
    }
  }

  for (const id of ids) {
    setCellText(indexCells.get(id).next, next[id]);
    setCellText(indexCells.get(id).match, match[id]);
  }
}

function openIndexPanel(id) {
  const view = nodeViews.get(id);
  if (!view) return;

  closeLogPanel();

  openIndexId = id;
  indexCells = new Map();

  netById('indexpanel-title').textContent =
    `${id} · next / match index`;

  netById('indexpanel').hidden = false;

  renderIndexPanel(view.nextIndex, view.matchIndex);

  netById('indexpanel-close').focus();
}

function closeIndexPanel() {
  openIndexId = null;
  netById('indexpanel').hidden = true;
}

// ======================= CRASH / BACK TO LIFE =======================

function prefersReducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function isNodeDown(id) {
  return nodeViews.get(id)?.down === true;
}

function handleNodeCrashed(payload) {
  const view = nodeViews.get(payload.NodeId);

  if (!view) {
    console.warn('NodeCrashed for unknown node:', payload.NodeId);
    return;
  }

  if (view.down) return;

  view.down = true;
  view.el.dataset.down = 'true';

  if (!prefersReducedMotion()) {
    crashEffect(view.fields.ball);
  }
}

function handleNodeBackToLife(payload) {
  const view = nodeViews.get(payload.NodeId);

  if (!view) {
    console.warn('NodeBackToLife for unknown node:', payload.NodeId);
    return;
  }

  if (!view.down) return;

  view.down = false;
  delete view.el.dataset.down;

  if (!prefersReducedMotion()) {
    reviveEffect(view.fields.ball);
  }
}

function crashEffect(ball) {
  const red = cssVar('--color-down');

  ball.animate([
    { transform: 'translateX(0)', boxShadow: `0 0 0 0 ${red}` },
    { transform: 'translateX(-7px)', offset: 0.12 },
    { transform: 'translateX(7px)', offset: 0.26 },
    { transform: 'translateX(-5px)', offset: 0.4 },
    { transform: 'translateX(4px)', offset: 0.54 },
    { transform: 'translateX(0) scale(0.9)', offset: 0.75 },
    {
      transform: 'translateX(0) scale(1)',
      boxShadow: '0 0 0 22px transparent',
    },
  ], { duration: 700, easing: 'ease-out' });
}

function reviveEffect(ball) {
  const green = cssVar('--color-ok');

  ball.animate([
    {
      transform: 'scale(0.85)',
      filter: 'brightness(0.6)',
      boxShadow: `0 0 0 0 ${green}`,
    },
    {
      transform: 'scale(1.15)',
      filter: 'brightness(1.6)',
      offset: 0.45,
    },
    {
      transform: 'scale(1)',
      filter: 'brightness(1)',
      boxShadow: '0 0 0 20px transparent',
    },
  ], { duration: 650, easing: 'ease-out' });
}

function messageLost(item, packet) {
  const ball = nodeBall(item.to);
  const path = packetPath(item);

  if (packet) {
    packet.style.transition = 'background-color 150ms, box-shadow 150ms';
    packet.classList.add('packet--lost');
    setTimeout(() => packet.remove(), 260);
  }

  if (prefersReducedMotion()) return;

  if (ball) {
    const red = cssVar('--color-down');

    ball.animate([
      { boxShadow: `0 0 0 0 ${red}` },
      { boxShadow: `0 0 0 10px ${red}`, offset: 0.3 },
      { boxShadow: '0 0 0 18px transparent' },
    ], { duration: 650, easing: 'ease-out' });
  }

  if (path) {
    lostMark(path.x1, path.y1);
  }
}

function lostMark(x, y) {
  const mark = netEl('i', 'lost-mark', '✕');
  const at = (dy, scale) =>
    `translate(${x}px, ${y + dy}px) translate(-50%, -50%) scale(${scale})`;

  mark.style.transform = at(0, 1);
  netById('packets').append(mark);

  mark.animate([
    { opacity: 1, transform: at(0, 0.6) },
    { opacity: 1, transform: at(-6, 1.3), offset: 0.3 },
    { opacity: 0, transform: at(-22, 1) },
  ], { duration: 800, easing: 'ease-out' })
    .finished.then(
      () => mark.remove(),
      () => mark.remove()
    );
}

// ======================= NETWORK (messages) =======================

const MessageType = Object.freeze({
  NewEntry: 0,
  AppendEntries: 1,
  AppendEntriesResponse: 2,
  RequestVote: 3,
  RequestVoteResponse: 4,
  ElectionTimeout: 5,
  HeartbeatTimeout: 6,
  SendAppendEntriesTimeout: 7,
});

const NETWORK_TYPES = Object.freeze({
  [MessageType.NewEntry]: 'NewEntry',
  [MessageType.AppendEntries]: 'AppendEntries',
  [MessageType.AppendEntriesResponse]: 'AppendEntriesResponse',
  [MessageType.RequestVote]: 'RequestVote',
  [MessageType.RequestVoteResponse]: 'RequestVoteResponse',
});

const NETWORK_COLOR_VARS = Object.freeze({
  [MessageType.NewEntry]: '--msg-new-entry',
  [MessageType.AppendEntries]: '--msg-append',
  [MessageType.AppendEntriesResponse]: '--msg-append-response',
  [MessageType.RequestVote]: '--msg-vote',
  [MessageType.RequestVoteResponse]: '--msg-vote-response',
});

const networkQueue = [];

const NEW_ANIMATION_MS = 1200;

function netById(id) {
  return document.getElementById(id);
}

function netEl(tag, cls, text) {
  const e = document.createElement(tag);

  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;

  return e;
}

function typeColor(type) {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(NETWORK_COLOR_VARS[type]);

  return value.trim() || '#8093ff';
}

function readMessage(sim) {
  const msg = sim.Message ?? {};

  return {
    id: msg.SequenceNumber ?? sim.SequenceNumber,
    tick: sim.DeliveryTick,
    type: msg.Type ?? msg.MessageType,
    from: msg.SenderId ?? msg.From ?? msg.Sender ?? '',
    to: msg.ReceiverId ?? msg.To ?? msg.Receiver ?? '',
  };
}

function handleNewMessage(payload) {
  const list = payload.Messages ?? (Array.isArray(payload) ? payload : []);

  for (const sim of list) {
    const m = readMessage(sim);

    switch (m.type) {
      case MessageType.NewEntry:
      case MessageType.AppendEntries:
      case MessageType.AppendEntriesResponse:
      case MessageType.RequestVote:
      case MessageType.RequestVoteResponse:
        enqueueMessage(m);
        break;

      case MessageType.ElectionTimeout:
        console.log('MsgElectionTimeout arrived:', sim);
        break;

      case MessageType.HeartbeatTimeout:
        console.log('MsgHeartbeatTimeout arrived:', sim);
        break;

      case MessageType.SendAppendEntriesTimeout:
        console.log('MsgSendAppendEntriesTimeout arrived:', sim);
        break;

      default:
        console.warn('Unknown message type:', m.type, sim);
    }
  }
}

function createRow(m) {
  const li = netEl('li');

  li.dataset.type = m.type;
  li.dataset.id = m.id;

  const type = netEl('div', 'type');
  type.append(netEl('i', 'dot'), NETWORK_TYPES[m.type]);

  const route = netEl('div', 'route');
  route.append(
    netEl('span', '', `${m.from} → ${m.to}`),
    netEl('span', 'tick', `tick ${m.tick}`)
  );

  li.append(type, route);
  return li;
}

function createDot(m) {
  const dot = netEl('i', 'dot');

  dot.dataset.type = m.type;
  dot.dataset.id = m.id;

  return dot;
}

function insertAt(parent, el, index) {
  parent.insertBefore(el, parent.children[index] || null);
}

function enqueueMessage(m) {
  if (networkQueue.some((q) => q.id === m.id)) return;

  const item = {
    ...m,
    sent: currentTick,
    progress: 0,
    row: createRow(m),
    dot: createDot(m),
    packet: null,
  };

  const at = networkQueue.findIndex(
    (q) => q.tick > m.tick || (q.tick === m.tick && q.id > m.id)
  );

  const index = at === -1 ? networkQueue.length : at;

  networkQueue.splice(index, 0, item);

  insertAt(netById('msgs'), item.row, index);
  insertAt(netById('flow'), item.dot, index);

  item.row.classList.add('is-new');
  item.dot.classList.add('is-new');

  setTimeout(() => {
    item.row.classList.remove('is-new');
    item.dot.classList.remove('is-new');
  }, NEW_ANIMATION_MS);

  item.packet = createPacket(item);

  if (item.packet) {
    movePacket(item, currentTick + 1);
  }

  updateNetworkMeta();
}

function updateNetworkMeta() {
  netById('net-count').textContent = networkQueue.length;
  netById('net-empty').hidden = networkQueue.length > 0;
}

// ------------ TIME ------------

let currentTick = 0;
let tickMs = 400;
let lastTickAt = 0;

function onTick(tick) {
  const now = performance.now();

  if (lastTickAt) {
    const elapsed = now - lastTickAt;
    tickMs = Math.min(3000, Math.max(16, tickMs * 0.6 + elapsed * 0.4));
  }

  lastTickAt = now;
  currentTick = tick;
}

// ------------ PACKETS ------------

function nodeCenter(id) {
  const card = [...netById('nodes').children]
    .find((c) => c.dataset.id === id);

  if (!card) return null;

  const nodes = netById('nodes');

  return {
    x: (parseFloat(card.style.left) / 100) * nodes.clientWidth,
    y: (parseFloat(card.style.top) / 100) * nodes.clientHeight,
  };
}

function ballRadius() {
  const ball = document.querySelector('.node__circle');
  return ball ? ball.offsetWidth / 2 : 40;
}

function networkEdge(y) {
  const nodes = netById('nodes').getBoundingClientRect();
  const net = document.querySelector('.net').getBoundingClientRect();

  return {
    x: net.left - nodes.left,
    y,
  };
}

function packetPath(item) {
  const a = nodeCenter(item.from);
  const b = nodeCenter(item.to);

  if (!a && !b) return null;

  const start = a ?? networkEdge(b.y);
  const end = b ?? networkEdge(a.y);

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const gap = ballRadius() + 4;

  const g0 = a ? gap : 0;
  const g1 = b ? gap : 0;

  return {
    x0: start.x + (dx / len) * g0,
    y0: start.y + (dy / len) * g0,
    x1: end.x - (dx / len) * g1,
    y1: end.y - (dy / len) * g1,
  };
}

function progressAt(item, tick) {
  const span = item.tick - item.sent;

  if (span <= 0) return 1;

  return Math.min(1, Math.max(0, (tick - item.sent) / span));
}

function createPacket(item) {
  const path = packetPath(item);
  if (!path) return null;

  const el = netEl('i', 'packet');

  el.dataset.type = item.type;
  netById('packets').append(el);

  el.style.transitionDuration = '0ms';
  el.style.transform = `translate(${path.x0}px, ${path.y0}px)`;

  void el.offsetWidth;

  return el;
}

function movePacket(item, tick, ms = tickMs) {
  const path = packetPath(item);

  if (!item.packet || !path) return;

  const p = progressAt(item, tick);

  item.progress = p;
  item.packet.style.transitionDuration = `${ms}ms`;
  item.packet.style.transform =
    `translate(${path.x0 + (path.x1 - path.x0) * p}px, ${path.y0 + (path.y1 - path.y0) * p}px)`;
}

function movePackets(tick) {
  for (const item of networkQueue) {
    movePacket(item, tick + 1);
  }
}

window.addEventListener('resize', () => {
  for (const item of networkQueue) {
    movePacket(item, currentTick + 1, 0);
  }
});

// ------------ DELIVERY ------------

function deliverDueMessages(tick) {
  while (
    networkQueue.length > 0 &&
    networkQueue[0].tick <= tick
  ) {
    deliverMessage(networkQueue[0]);
  }
}

function removeMessageById(id) {
  const item = networkQueue.find((q) => String(q.id) === String(id));

  if (item) {
    deliverMessage(item);
  }
}

function deliverMessage(item) {
  const index = networkQueue.indexOf(item);
  if (index === -1) return;

  item.row.remove();
  item.dot.remove();

  networkQueue.splice(index, 1);

  updateNetworkMeta();
  arrive(item);
}

function arrive(item) {
  const el = item.packet;
  const ball = nodeBall(item.to);

  const done = () => {
    if (isNodeDown(item.to)) {
      messageLost(item, el);
      return;
    }

    if (el) el.remove();

    if (ball && !prefersReducedMotion()) {
      receiveBounce(ball, typeColor(item.type));
    }
  };

  if (el && item.progress < 1) {
    movePacket(item, item.tick, 120);
    setTimeout(done, 130);
  } else {
    done();
  }
}

function nodeBall(id) {
  const card = [...netById('nodes').children]
    .find((c) => c.dataset.id === id);

  return card ? card.querySelector('.node__circle') : null;
}

function receiveBounce(ball, color) {
  ball.animate([
    {
      transform: 'translateY(0) scale(1)',
      boxShadow: `0 0 0 0 ${color}`,
    },
    {
      transform: 'translateY(-14px) scale(1.1)',
      offset: 0.3,
    },
    {
      transform: 'translateY(0) scale(1)',
      offset: 0.55,
    },
    {
      transform: 'translateY(-5px) scale(1.03)',
      offset: 0.75,
    },
    {
      transform: 'translateY(0) scale(1)',
      boxShadow: '0 0 0 14px transparent',
    },
  ], { duration: 520, easing: 'ease-out' });
}

// ------------ Lines between nodes + UI setup ------------

function drawNodeLinks() {
  const svg = netById('links');
  const cards = [...netById('nodes').children];

  svg.replaceChildren();

  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const line = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'line'
      );

      line.setAttribute('x1', cards[i].style.left);
      line.setAttribute('y1', cards[i].style.top);
      line.setAttribute('x2', cards[j].style.left);
      line.setAttribute('y2', cards[j].style.top);

      svg.append(line);
    }
  }
}

function initNetworkUI() {
  const legend = netById('legend');

  for (const [type, name] of Object.entries(NETWORK_TYPES)) {
    const item = netEl('span');

    item.dataset.type = type;
    item.append(netEl('i', 'dot'), name);

    legend.append(item);
  }

  const buttons = document.querySelectorAll('#net-mode button');

  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      document.body.dataset.netMode = b.dataset.mode;

      buttons.forEach((x) => {
        x.setAttribute('aria-pressed', x === b);
      });
    });
  });

  netById('fulllog-close').addEventListener('click', closeLogPanel);
  netById('indexpanel-close').addEventListener('click', closeIndexPanel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLogPanel();
      closeIndexPanel();
    }
  });
}

initNetworkUI();