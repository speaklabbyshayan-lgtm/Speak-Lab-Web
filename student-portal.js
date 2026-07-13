/* =============================================
   SPEAKLAB STUDENT PORTAL — JavaScript
   Airport/Boarding Pass Theme | Supabase Realtime
   ============================================= */

'use strict';

// ─── GATE DATA ────────────────────────────────────────────────────────────────
const GATES = [
  { gate: 1, emoji: '🛫', name: 'Departure Lounge',      topic: 'Breaking The Fear Barrier',        color: '#1e3a8a' },
  { gate: 2, emoji: '🌤️', name: 'Takeoff',               topic: 'Finding Your Voice',                color: '#0284c7' },
  { gate: 3, emoji: '☁️', name: 'Cruising Altitude',     topic: 'Speaking With Clarity',             color: '#0891b2' },
  { gate: 4, emoji: '🌍', name: 'Mid-Flight',             topic: 'Grammar & Vocabulary Mastery',      color: '#0f766e' },
  { gate: 5, emoji: '⚡', name: 'Turbulence Zone',        topic: 'Advanced Communication',            color: '#7c3aed' },
  { gate: 6, emoji: '🌅', name: 'Descending',             topic: 'Presentations & Public Speaking',   color: '#b45309' },
  { gate: 7, emoji: '🛬', name: 'Final Approach',         topic: 'Interview & Professional English',  color: '#0f766e' },
  { gate: 8, emoji: '🏆', name: 'Destination Reached!',  topic: 'Confidence Mastery',                color: '#d97706' },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser        = null;
let currentGate        = 1;
let allTasks           = [];
let completedTaskIds   = new Set();
let realtimeSub        = null;
let badgeCount         = 0;

// ─── MAIN INIT ────────────────────────────────────────────────────────────────
async function init() {
  const { data: { session } } = await window.supabaseClient.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = session.user;
  await loadPortalData();
  renderPortal();
  subscribeRealtime();
  hideLoading();
}

// ─── LOAD ALL DATA FROM SUPABASE ──────────────────────────────────────────────
async function loadPortalData() {
  // 1. Get or create student_progress
  let { data: progress, error: progressErr } = await window.supabaseClient
    .from('student_progress')
    .select('*')
    .eq('student_id', currentUser.id)
    .single();

  if (progressErr || !progress) {
    // Create a new row for this student
    const { data: newProgress, error: createErr } = await window.supabaseClient
      .from('student_progress')
      .insert({ student_id: currentUser.id, current_gate: 1 })
      .select()
      .single();

    if (createErr) {
      console.error('Error creating progress:', createErr);
      toast('Error loading your journey', createErr.message, 'error', '❌');
      return;
    }
    progress = newProgress;
  }

  currentGate = progress.current_gate || 1;

  // 2. Load tasks for the current gate
  const { data: tasks } = await window.supabaseClient
    .from('weekly_tasks')
    .select('*')
    .eq('gate_number', currentGate)
    .order('sort_order', { ascending: true });

  allTasks = tasks || [];

  // 3. Load which tasks are already completed
  const { data: completions } = await window.supabaseClient
    .from('task_completions')
    .select('task_id')
    .eq('student_id', currentUser.id);

  completedTaskIds = new Set((completions || []).map(c => c.task_id));

  // 4. Load badges count
  const { data: badges } = await window.supabaseClient
    .from('student_badges')
    .select('id')
    .eq('student_id', currentUser.id);

  badgeCount = (badges || []).length;
}

// ─── RENDER EVERYTHING ────────────────────────────────────────────────────────
function renderPortal() {
  renderBoardingPass();
  renderRunway();
  renderTasks();
  renderStamps();
  renderStats();
  generateBarcode();
}

// ─── BOARDING PASS ────────────────────────────────────────────────────────────
function renderBoardingPass() {
  const gate    = GATES[currentGate - 1];
  const name    = currentUser?.user_metadata?.full_name
                  || currentUser?.email?.split('@')[0]
                  || 'Passenger';

  document.getElementById('bp-passenger').textContent   = name.toUpperCase();
  document.getElementById('bp-seat').textContent        = `Gate ${currentGate} of 8`;
  document.getElementById('bp-stub-week').textContent   = `Week ${currentGate} of 8`;
  document.getElementById('bp-stub-topic').textContent  = gate.topic;
  document.getElementById('stub-gate-num').textContent  = currentGate;
  document.getElementById('barcode-week').textContent   = String(currentGate).padStart(2, '0');

  const completedGates = currentGate - 1;
  document.getElementById('bp-progress-info').textContent = `${completedGates}/8 Gates Complete`;

  const statusBadge = document.getElementById('bp-status-badge');
  const statusText  = document.getElementById('bp-status-text');
  if (currentGate === 8) {
    statusBadge.className = 'bp-status-badge status-landed';
    statusText.textContent = 'Final Gate';
  } else if (currentGate === 1) {
    statusBadge.className = 'bp-status-badge status-boarding';
    statusText.textContent = 'Boarding';
  } else {
    statusBadge.className = 'bp-status-badge';
    statusText.textContent = 'In Progress';
  }
}

// ─── GATE POSITIONS ON MAP SVG VIEWBOX (1000x380) ──────────────────────────
const GATE_POSITIONS = [
  { x:  90, y: 200 }, // Gate 1
  { x: 220, y: 218 }, // Gate 2
  { x: 360, y: 208 }, // Gate 3
  { x: 500, y: 215 }, // Gate 4
  { x: 650, y: 210 }, // Gate 5
  { x: 770, y: 232 }, // Gate 6
  { x: 880, y: 216 }, // Gate 7
  { x: 960, y: 210 }, // Gate 8
];

// The single curved SVG path (matches #path-baseline in HTML)
const FLIGHT_PATH_D =
  "M 90,200 C 130,175 160,245 220,220" +
  " C 268,200 292,178 360,208" +
  " C 400,225 418,198 500,215" +
  " C 553,228 573,185 650,210" +
  " C 694,228 714,200 770,232" +
  " C 810,252 838,194 880,216" +
  " C 910,230 933,200 960,210";

// Segment sub-paths for each pair of consecutive gates
const SEGMENT_PATHS = [
  "M 90,200 C 130,175 160,245 220,220",
  "M 220,220 C 268,200 292,178 360,208",
  "M 360,208 C 400,225 418,198 500,215",
  "M 500,215 C 553,228 573,185 650,210",
  "M 650,210 C 694,228 714,200 770,232",
  "M 770,232 C 810,252 838,194 880,216",
  "M 880,216 C 910,230 933,200 960,210",
];

// ─── RENDER SVG MAP (gate pins + completed path + airplane) ──────────────────
function renderRunway() {
  renderMapGatePins();
  renderCompletedPaths();
  positionMapAirplane(false);
}

function renderMapGatePins() {
  const svg     = document.getElementById('flight-map-svg');
  const pinsGrp = document.getElementById('gate-pins-group');
  const tooltip = document.getElementById('map-tooltip');
  if (!pinsGrp) return;
  pinsGrp.innerHTML = '';

  GATES.forEach((gate, i) => {
    const pos    = GATE_POSITIONS[i];
    const status = gate.gate < currentGate  ? 'completed'
                 : gate.gate === currentGate ? 'current'
                 : 'locked';
    const isGate8 = gate.gate === 8;

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-gate', gate.gate);
    g.setAttribute('data-status', status);
    g.style.cursor = status !== 'locked' ? 'pointer' : 'default';

    // --- Outer pulse ring (animated) ---
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', pos.x);
    ring.setAttribute('cy', pos.y);
    const ringR = isGate8 ? '22' : '18';
    ring.setAttribute('r', ringR);
    if (status === 'completed') {
      ring.setAttribute('fill', 'rgba(217,119,6,0.2)');
      ring.setAttribute('stroke', '#d97706');
      ring.setAttribute('stroke-width', '1.5');
      const anim = document.createElementNS('http://www.w3.org/2000/svg','animate');
      anim.setAttribute('attributeName','r');
      anim.setAttribute('values', `${ringR};${parseInt(ringR)+6};${ringR}`);
      anim.setAttribute('dur','2.5s');
      anim.setAttribute('repeatCount','indefinite');
      ring.appendChild(anim);
      const animOp = document.createElementNS('http://www.w3.org/2000/svg','animate');
      animOp.setAttribute('attributeName','opacity');
      animOp.setAttribute('values','0.5;0.1;0.5');
      animOp.setAttribute('dur','2.5s');
      animOp.setAttribute('repeatCount','indefinite');
      ring.appendChild(animOp);
    } else if (status === 'current') {
      ring.setAttribute('fill', 'rgba(30,58,138,0.15)');
      ring.setAttribute('stroke', '#1e3a8a');
      ring.setAttribute('stroke-width', '2');
      const anim = document.createElementNS('http://www.w3.org/2000/svg','animate');
      anim.setAttribute('attributeName','r');
      anim.setAttribute('values', `${ringR};${parseInt(ringR)+8};${ringR}`);
      anim.setAttribute('dur','1.8s');
      anim.setAttribute('repeatCount','indefinite');
      ring.appendChild(anim);
      const animOp = document.createElementNS('http://www.w3.org/2000/svg','animate');
      animOp.setAttribute('attributeName','opacity');
      animOp.setAttribute('values','0.7;0.1;0.7');
      animOp.setAttribute('dur','1.8s');
      animOp.setAttribute('repeatCount','indefinite');
      ring.appendChild(animOp);
    } else {
      ring.setAttribute('fill', 'rgba(148,163,184,0.12)');
      ring.setAttribute('stroke', '#94a3b8');
      ring.setAttribute('stroke-width', '1');
    }
    g.appendChild(ring);

    // --- Inner dot ---
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', pos.x);
    dot.setAttribute('cy', pos.y);
    dot.setAttribute('r', isGate8 ? '14' : '12');
    if (status === 'completed') {
      dot.setAttribute('fill', '#d97706');
      dot.setAttribute('stroke', '#92400e');
      dot.setAttribute('stroke-width', '2');
    } else if (status === 'current') {
      dot.setAttribute('fill', '#1e3a8a');
      dot.setAttribute('stroke', '#3b82f6');
      dot.setAttribute('stroke-width', '2.5');
      const animFill = document.createElementNS('http://www.w3.org/2000/svg','animate');
      animFill.setAttribute('attributeName','fill');
      animFill.setAttribute('values','#1e3a8a;#2563eb;#1e3a8a');
      animFill.setAttribute('dur','2s');
      animFill.setAttribute('repeatCount','indefinite');
      dot.appendChild(animFill);
    } else {
      dot.setAttribute('fill', '#cbd5e1');
      dot.setAttribute('stroke', '#94a3b8');
      dot.setAttribute('stroke-width', '1.5');
    }
    g.appendChild(dot);

    // --- Icon inside dot ---
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    icon.setAttribute('x', pos.x);
    icon.setAttribute('y', pos.y + 5);
    icon.setAttribute('text-anchor', 'middle');
    icon.setAttribute('font-size', isGate8 ? '12' : '10');
    icon.setAttribute('font-family', 'Poppins,sans-serif');
    icon.textContent = status === 'locked' ? '🔒' : status === 'completed' ? '✓' : gate.emoji;
    if (status === 'completed') {
      icon.setAttribute('fill', 'white');
      icon.setAttribute('font-weight', '800');
      icon.setAttribute('font-size', '10');
    }
    g.appendChild(icon);

    // --- Gate label below ---
    const labelY = pos.y + (isGate8 ? 32 : 28);
    const lbg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    lbg.setAttribute('x', pos.x - 36);
    lbg.setAttribute('y', labelY - 10);
    lbg.setAttribute('width', '72');
    lbg.setAttribute('height', '22');
    lbg.setAttribute('rx', '4');
    lbg.setAttribute('fill', 'rgba(255,252,240,0.82)');
    lbg.setAttribute('stroke', status === 'completed' ? '#d97706' : status === 'current' ? '#1e3a8a' : '#cbd5e1');
    lbg.setAttribute('stroke-width', '1');
    g.appendChild(lbg);

    const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    lbl.setAttribute('x', pos.x);
    lbl.setAttribute('y', labelY + 5);
    lbl.setAttribute('text-anchor', 'middle');
    lbl.setAttribute('font-size', '7.5');
    lbl.setAttribute('font-weight', '700');
    lbl.setAttribute('font-family', 'Poppins,sans-serif');
    lbl.setAttribute('fill',
      status === 'completed' ? '#92400e' :
      status === 'current'   ? '#1e2d5a' : '#94a3b8');
    lbl.textContent = `G${gate.gate} · ${gate.name.length > 12 ? gate.name.substring(0,12)+'…' : gate.name}`;
    g.appendChild(lbl);

    // --- Hover tooltip ---
    g.addEventListener('mouseenter', (e) => showMapTooltip(gate, status, pos));
    g.addEventListener('mouseleave', () => hideMapTooltip());

    // --- Click to open modal ---
    if (status !== 'locked') {
      g.addEventListener('click', () => openGateModal(gate.gate));
    }

    pinsGrp.appendChild(g);
  });

  // Move tooltip to top of SVG stack
  if (tooltip) svg.appendChild(tooltip);
}

function renderCompletedPaths() {
  const grp = document.getElementById('path-completed');
  if (!grp) return;
  grp.innerHTML = '';

  // Draw completed segment paths (gate 1 → currentGate-1)
  for (let i = 0; i < currentGate - 1 && i < SEGMENT_PATHS.length; i++) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', SEGMENT_PATHS[i]);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'url(#path-done-grad)');
    path.setAttribute('stroke-width', '4');
    path.setAttribute('stroke-linecap', 'round');
    // Animated flowing dash
    path.setAttribute('stroke-dasharray', '14 7');
    const anim = document.createElementNS('http://www.w3.org/2000/svg', 'animateTransform');
    // Use animate on stroke-dashoffset for flow effect
    const dashAnim = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
    dashAnim.setAttribute('attributeName', 'stroke-dashoffset');
    dashAnim.setAttribute('from', '21');
    dashAnim.setAttribute('to', '0');
    dashAnim.setAttribute('dur', '0.8s');
    dashAnim.setAttribute('repeatCount', 'indefinite');
    path.appendChild(dashAnim);
    // Glow overlay
    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glow.setAttribute('d', SEGMENT_PATHS[i]);
    glow.setAttribute('fill', 'none');
    glow.setAttribute('stroke', 'rgba(251,191,36,0.35)');
    glow.setAttribute('stroke-width', '10');
    glow.setAttribute('stroke-linecap', 'round');
    glow.setAttribute('filter', 'url(#glow-gold)');
    grp.appendChild(glow);
    grp.appendChild(path);
  }
}

function positionMapAirplane(animate = true) {
  const plane = document.getElementById('map-airplane');
  if (!plane) return;
  const pos = GATE_POSITIONS[currentGate - 1];
  if (!pos) return;

  // Place above the pin
  const ax = pos.x;
  const ay = pos.y - 22;

  if (!animate) {
    plane.setAttribute('transform', `translate(${ax},${ay})`);
  } else {
    // Animate via requestAnimationFrame
    const prevPos = GATE_POSITIONS[currentGate - 2] || pos;
    animateAirplaneAlongPath(prevPos, pos, plane);
  }
}

function positionRunwayPlane(animate) {
  positionMapAirplane(animate);
}

function showMapTooltip(gate, status, pos) {
  const ttGrp    = document.getElementById('map-tooltip');
  const ttGate   = document.getElementById('tt-gate');
  const ttName   = document.getElementById('tt-name');
  const ttWeek   = document.getElementById('tt-week');
  const ttStatus = document.getElementById('tt-status');
  const ttBg     = document.getElementById('tt-bg');
  if (!ttGrp) return;

  ttGate.textContent   = `GATE ${gate.gate} — ${gate.emoji}`;
  ttName.textContent   = gate.name;
  ttWeek.textContent   = `Week ${gate.gate} of 8`;
  const st = status === 'completed' ? '✓ Complete' : status === 'current' ? '✈️ In Progress' : '🔒 Locked';
  const stColor = status === 'completed' ? '#16a34a' : status === 'current' ? '#1e3a8a' : '#94a3b8';
  ttStatus.textContent = st;
  ttStatus.setAttribute('fill', stColor);

  // Position tooltip: right of pin unless near right edge
  let tx = pos.x + 16;
  let ty = pos.y - 36;
  if (tx + 165 > 980) tx = pos.x - 180;
  if (ty < 5) ty = pos.y + 20;

  ttBg.setAttribute('x', tx);
  ttBg.setAttribute('y', ty);
  ttGate.setAttribute('x', tx + 12);
  ttGate.setAttribute('y', ty + 18);
  document.querySelector('#map-tooltip line')?.setAttribute('x1', tx + 10);
  document.querySelector('#map-tooltip line')?.setAttribute('x2', tx + 155);
  document.querySelector('#map-tooltip line')?.setAttribute('y1', ty + 24);
  document.querySelector('#map-tooltip line')?.setAttribute('y2', ty + 24);
  ttName.setAttribute('x', tx + 12);
  ttName.setAttribute('y', ty + 40);
  ttWeek.setAttribute('x', tx + 12);
  ttWeek.setAttribute('y', ty + 55);
  ttStatus.setAttribute('x', tx + 12);
  ttStatus.setAttribute('y', ty + 68);

  ttGrp.setAttribute('opacity', '1');
}

function hideMapTooltip() {
  const ttGrp = document.getElementById('map-tooltip');
  if (ttGrp) ttGrp.setAttribute('opacity', '0');
}

function animateAirplaneAlongPath(from, to, planeEl) {
  const DURATION = 1600;
  const start    = performance.now();
  const contrail = document.getElementById('contrail-path');

  function easeInOut(t) { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

  function step(now) {
    const elapsed = now - start;
    const t = Math.min(elapsed / DURATION, 1);
    const et = easeInOut(t);

    const cx = from.x + (to.x - from.x) * et;
    const cy = (from.y + (to.y - from.y) * et) - 22 - Math.sin(t * Math.PI) * 20;

    // Rotate to face direction of travel
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    planeEl.setAttribute('transform', `translate(${cx},${cy}) rotate(${angle})`);

    // Contrail
    if (contrail && elapsed > 100) {
      const prevCx = from.x + (to.x - from.x) * easeInOut(Math.max(0, t - 0.05));
      const prevCy = (from.y + (to.y - from.y) * easeInOut(Math.max(0, t - 0.05))) - 22 - Math.sin(Math.max(0, t - 0.05) * Math.PI) * 20;
      contrail.setAttribute('d', `M ${prevCx},${prevCy} L ${cx},${cy}`);
      contrail.setAttribute('opacity', String(0.7 * (1 - t)));
    }

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      // Land on gate
      planeEl.setAttribute('transform', `translate(${to.x},${to.y - 22}) rotate(0)`);
      if (contrail) contrail.setAttribute('opacity', '0');
    }
  }
  requestAnimationFrame(step);
}

// ─── GATE MODAL ───────────────────────────────────────────────────────────────
async function openGateModal(gateNum) {
  const gate    = GATES[gateNum - 1];
  const overlay = document.getElementById('gate-modal-overlay');
  const modal   = document.getElementById('gate-modal');

  // Load tasks for this gate
  const { data: tasks } = await window.supabaseClient
    .from('weekly_tasks')
    .select('*')
    .eq('gate_number', gateNum)
    .order('sort_order', { ascending: true });

  const gateTasks   = tasks || [];
  const doneCount   = gateTasks.filter(t => completedTaskIds.has(t.id)).length;
  const totalCount  = gateTasks.length;
  const pct         = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  modal.innerHTML = `
    <button class="modal-close-btn" onclick="closeGateModal()">✕</button>
    <div class="modal-header">
      <div class="modal-gate-label">Gate ${gateNum} — ${gate.emoji} ${gate.name}</div>
      <div class="modal-gate-title">Week ${gateNum}</div>
      <div class="modal-gate-week">${gate.topic}</div>
      <div class="modal-progress-bar">
        <div class="modal-progress-fill" style="width:${pct}%"></div>
      </div>
      <div class="modal-progress-text">${doneCount} of ${totalCount} tasks completed — ${pct}%</div>
    </div>
    <ul class="modal-tasks-list" id="modal-tasks-list">
      ${gateTasks.length === 0
        ? `<li style="padding:20px;text-align:center;color:#64748b;">No tasks assigned yet.</li>`
        : gateTasks.map(t => `
          <li class="modal-task-item ${completedTaskIds.has(t.id) ? 'completed' : ''}"
              data-task-id="${t.id}" onclick="toggleTaskFromModal('${t.id}', ${gateNum}, this)">
            <div class="task-checkbox">${completedTaskIds.has(t.id) ? '✓' : ''}</div>
            <div class="task-text">
              <div class="task-title-text">${t.task_title}</div>
              ${t.task_description ? `<div class="task-desc-text">${t.task_description}</div>` : ''}
            </div>
          </li>`).join('')}
    </ul>
    <div class="modal-footer">
      <div class="modal-status-badge">
        ${gateNum < currentGate  ? '✅ Completed' :
          gateNum === currentGate ? '✈️ In Progress' :
          '🔒 Locked'}
      </div>
    </div>`;

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

window.closeGateModal = function(e) {
  if (e && e.target !== document.getElementById('gate-modal-overlay') && !e.target.classList.contains('modal-close-btn')) return;
  if (!e) { /* direct call */ }
  document.getElementById('gate-modal-overlay').classList.remove('active');
  document.body.style.overflow = '';
};

// ─── TOGGLE TASK COMPLETION ───────────────────────────────────────────────────
window.toggleTaskFromModal = async function(taskId, gateNum, el) {
  // Only allow marking current gate tasks
  if (gateNum !== currentGate) {
    toast('Note', 'You can only complete tasks for your current gate.', 'info', 'ℹ️');
    return;
  }

  const isCompleted = completedTaskIds.has(taskId);

  if (!isCompleted) {
    // Mark complete
    const { error } = await window.supabaseClient
      .from('task_completions')
      .upsert({ student_id: currentUser.id, task_id: taskId }, { onConflict: 'student_id,task_id' });

    if (error) { toast('Error', error.message, 'error', '❌'); return; }
    completedTaskIds.add(taskId);
    el.classList.add('completed');
    el.querySelector('.task-checkbox').textContent = '✓';
    toast('Task Complete!', 'Great work! Keep going ✈️', 'success', '✅');
  } else {
    // Unmark
    const { error } = await window.supabaseClient
      .from('task_completions')
      .delete()
      .eq('student_id', currentUser.id)
      .eq('task_id', taskId);

    if (error) { toast('Error', error.message, 'error', '❌'); return; }
    completedTaskIds.delete(taskId);
    el.classList.remove('completed');
    el.querySelector('.task-checkbox').textContent = '';
  }

  // Refresh tasks section
  renderTasks();
  renderStats();
  // Update modal progress bar
  const gateTasks = [...document.querySelectorAll('.modal-task-item')];
  const done = gateTasks.filter(t => t.classList.contains('completed')).length;
  const total = gateTasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fill = document.querySelector('.modal-progress-fill');
  const text = document.querySelector('.modal-progress-text');
  if (fill) fill.style.width = pct + '%';
  if (text) text.textContent = `${done} of ${total} tasks completed — ${pct}%`;
};

// ─── RENDER CURRENT GATE TASKS ────────────────────────────────────────────────
function renderTasks() {
  const gate = GATES[currentGate - 1];
  document.getElementById('tasks-gate-emoji').textContent  = gate.emoji;
  document.getElementById('tasks-title').textContent       = `Gate ${currentGate} — ${gate.name}`;
  document.getElementById('tasks-subtitle').textContent    = `Week ${currentGate}: ${gate.topic}`;

  const doneCount  = allTasks.filter(t => completedTaskIds.has(t.id)).length;
  const totalCount = allTasks.length;
  const pct        = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  document.getElementById('tasks-progress-fill').style.width = pct + '%';
  document.getElementById('tasks-progress-text').textContent = `${doneCount} of ${totalCount} tasks completed`;

  const grid = document.getElementById('tasks-grid');
  if (allTasks.length === 0) {
    grid.innerHTML = `<div class="tasks-empty"><span>📋</span><p>No tasks assigned yet. Check back soon!</p></div>`;
    return;
  }

  grid.innerHTML = allTasks.map(t => `
    <div class="task-card ${completedTaskIds.has(t.id) ? 'completed' : ''}"
         onclick="toggleTask('${t.id}', this)">
      <div class="task-check">${completedTaskIds.has(t.id) ? '✓' : ''}</div>
      <div class="task-body">
        <div class="task-name">${t.task_title}</div>
        ${t.task_description ? `<div class="task-desc">${t.task_description}</div>` : ''}
      </div>
    </div>`).join('');
}

window.toggleTask = async function(taskId, el) {
  const isCompleted = completedTaskIds.has(taskId);

  if (!isCompleted) {
    const { error } = await window.supabaseClient
      .from('task_completions')
      .upsert({ student_id: currentUser.id, task_id: taskId }, { onConflict: 'student_id,task_id' });
    if (error) { toast('Error', error.message, 'error', '❌'); return; }
    completedTaskIds.add(taskId);
    el.classList.add('completed');
    el.querySelector('.task-check').textContent = '✓';
    toast('Task Complete! ✅', 'Keep flying!', 'success', '✈️');
  } else {
    const { error } = await window.supabaseClient
      .from('task_completions')
      .delete()
      .eq('student_id', currentUser.id)
      .eq('task_id', taskId);
    if (error) { toast('Error', error.message, 'error', '❌'); return; }
    completedTaskIds.delete(taskId);
    el.classList.remove('completed');
    el.querySelector('.task-check').textContent = '';
  }

  renderStats();
  const doneCount  = allTasks.filter(t => completedTaskIds.has(t.id)).length;
  const totalCount = allTasks.length;
  const pct        = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  document.getElementById('tasks-progress-fill').style.width = pct + '%';
  document.getElementById('tasks-progress-text').textContent = `${doneCount} of ${totalCount} tasks completed`;
};

// ─── PASSPORT STAMPS ─────────────────────────────────────────────────────────
function renderStamps() {
  const grid = document.getElementById('stamps-grid');
  grid.innerHTML = '';

  GATES.forEach(gate => {
    const isEarned = gate.gate < currentGate || (gate.gate === currentGate && gate.gate === 8);
    const div = document.createElement('div');

    if (gate.gate === 8 && isEarned) {
      div.className = 'stamp-item earned graduation';
    } else {
      div.className = `stamp-item ${isEarned ? 'earned' : 'locked-stamp'}`;
    }

    div.innerHTML = `
      <div class="stamp-emoji">${isEarned ? gate.emoji : '🔒'}</div>
      <div class="stamp-gate">Gate ${gate.gate}</div>
      <div class="stamp-name">${isEarned ? gate.name : '???'}</div>`;

    if (isEarned) {
      div.title = `Gate ${gate.gate}: ${gate.topic}`;
    }

    grid.appendChild(div);
  });
}

// ─── STATS BAR ────────────────────────────────────────────────────────────────
function renderStats() {
  const gate         = GATES[currentGate - 1];
  const completedGates = currentGate - 1;
  const doneCount    = allTasks.filter(t => completedTaskIds.has(t.id)).length;

  document.getElementById('stat-gates').textContent        = `${completedGates}/8`;
  document.getElementById('stat-current-gate').textContent = `Gate ${currentGate}`;
  document.getElementById('stat-tasks').textContent        = `${doneCount}/${allTasks.length}`;
  document.getElementById('stat-badges').textContent       = completedGates;
}

// ─── BARCODE GENERATOR ────────────────────────────────────────────────────────
function generateBarcode() {
  const container = document.getElementById('barcode-bars');
  if (!container) return;
  container.innerHTML = '';

  const seed = currentUser?.id || '12345';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash) + seed.charCodeAt(i);

  for (let i = 0; i < 40; i++) {
    const bar = document.createElement('div');
    bar.className = 'barcode-bar';
    const w = ((Math.abs(hash * (i + 1) * 1234567) % 3) + 1);
    bar.style.width = w + 'px';
    container.appendChild(bar);
  }
}

// ─── GATE UNLOCK ANIMATION ────────────────────────────────────────────────────
async function triggerGateUnlock(newGate) {
  const gate = GATES[newGate - 1];

  // Update state
  currentGate = newGate;

  // Animate runway plane flying to new gate
  renderRunway();
  setTimeout(() => positionRunwayPlane(true), 100);

  // Show unlock overlay after plane arrives
  setTimeout(() => {
    document.getElementById('unlock-emoji').textContent   = gate.emoji;
    document.getElementById('unlock-title').textContent   = gate.name + '!';
    document.getElementById('unlock-msg').textContent     = `Week ${newGate} has been unlocked. Your journey continues! ✈️`;
    document.getElementById('unlock-stamp-text').textContent = `GATE ${newGate}\nUNLOCKED`;
    document.getElementById('gate-unlock-overlay').classList.add('active');
    launchConfetti();
  }, 1800);

  // Reload tasks for new gate
  const { data: tasks } = await window.supabaseClient
    .from('weekly_tasks')
    .select('*')
    .eq('gate_number', newGate)
    .order('sort_order', { ascending: true });

  allTasks = tasks || [];
  const { data: completions } = await window.supabaseClient
    .from('task_completions')
    .select('task_id')
    .eq('student_id', currentUser.id);
  completedTaskIds = new Set((completions || []).map(c => c.task_id));

  renderBoardingPass();
  renderTasks();
  renderStamps();
  renderStats();
}

window.closeUnlockOverlay = function() {
  document.getElementById('gate-unlock-overlay').classList.remove('active');
};

// ─── SUPABASE REALTIME ────────────────────────────────────────────────────────
function subscribeRealtime() {
  if (realtimeSub) window.supabaseClient.removeChannel(realtimeSub);

  realtimeSub = window.supabaseClient
    .channel('student-progress-' + currentUser.id)
    .on('postgres_changes', {
      event:  'UPDATE',
      schema: 'public',
      table:  'student_progress',
      filter: `student_id=eq.${currentUser.id}`
    }, (payload) => {
      const newGate = payload.new.current_gate;
      if (newGate > currentGate) {
        triggerGateUnlock(newGate);
      }
    })
    .subscribe();
}

// ─── CONFETTI ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.add('active');

  const COLORS = ['#1e3a8a','#d97706','#0f766e','#fbbf24','#16a34a','#0284c7','#7c3aed','#ffffff'];
  const pieces = Array.from({ length: 200 }, () => ({
    x: Math.random() * canvas.width, y: -30 - Math.random() * 200,
    w: Math.random() * 10 + 5, h: Math.random() * 5 + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot: Math.random() * 360, rotV: (Math.random() - 0.5) * 8,
    vy: Math.random() * 4 + 2, vx: (Math.random() - 0.5) * 3,
    opacity: 1,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.y += p.vy; p.x += p.vx; p.rot += p.rotV; p.vy += 0.07;
      if (p.y > canvas.height * 0.8) p.opacity -= 0.02;
      if (p.opacity <= 0) return;
      alive = true;
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (alive && frame < 300) { frame++; requestAnimationFrame(draw); }
    else { canvas.classList.remove('active'); ctx.clearRect(0, 0, canvas.width, canvas.height); }
  }
  draw();
}

// ─── TOAST NOTIFICATION ───────────────────────────────────────────────────────
function toast(title, msg, type = 'info', emoji = 'ℹ️') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${emoji}</span> <strong>${title}</strong> ${msg ? '— ' + msg : ''}`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 350);
  }, 4000);
}

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
window.handleLogout = async function() {
  await window.supabaseClient.auth.signOut();
  window.location.href = 'login.html';
};

// ─── HIDE LOADING ─────────────────────────────────────────────────────────────
function hideLoading() {
  document.getElementById('main-portal').style.display = 'block';
  setTimeout(() => {
    document.getElementById('loading-screen').classList.add('hidden');
    // Set initial plane position after DOM paints
    setTimeout(() => positionRunwayPlane(false), 200);
  }, 1200);
}

// ─── START ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
