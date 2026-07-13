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

// ─── RUNWAY / GATE NODES ──────────────────────────────────────────────────────
function renderRunway() {
  const track = document.getElementById('runway-track');
  track.innerHTML = '';

  GATES.forEach((gate, i) => {
    const status = gate.gate < currentGate  ? 'completed'
                 : gate.gate === currentGate ? 'current'
                 : 'locked';

    const node = document.createElement('div');
    node.className = `gate-node ${status}`;
    node.dataset.gate = gate.gate;

    const dot = document.createElement('div');
    dot.className = 'gate-dot';
    if (status === 'completed') dot.textContent = '✅';
    else if (status === 'locked') dot.textContent = '🔒';
    else dot.textContent = gate.emoji;

    const label = document.createElement('div');
    label.className = 'gate-label';
    label.innerHTML = `Gate ${gate.gate}<br>${gate.name}`;

    node.appendChild(dot);
    node.appendChild(label);

    // Click to open modal (only unlocked)
    if (status !== 'locked') {
      node.addEventListener('click', () => openGateModal(gate.gate));
    }

    track.appendChild(node);
  });

  // Position the flying plane
  positionRunwayPlane(false);
}

function positionRunwayPlane(animate = true) {
  const track     = document.getElementById('runway-track');
  const planeEl   = document.getElementById('runway-plane');
  const nodes     = track.querySelectorAll('.gate-node');
  const currentNode = nodes[currentGate - 1];
  if (!currentNode || !planeEl) return;

  const trackRect = track.getBoundingClientRect();
  const nodeRect  = currentNode.getBoundingClientRect();
  const nodeCenter = nodeRect.left - trackRect.left + nodeRect.width / 2;

  if (!animate) {
    planeEl.style.transition = 'none';
  } else {
    planeEl.style.transition = 'left 1.5s cubic-bezier(0.4,0,0.2,1)';
  }
  planeEl.style.left = `${nodeCenter - 12}px`;
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
