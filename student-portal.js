/* =============================================
   SPEAKLAB STUDENT PORTAL — JavaScript
   3D Globe + Supabase Realtime + Animations
   ============================================= */

'use strict';

// ─── CITY DATA ────────────────────────────────────────────────────────────────
const CITIES = [
  { week: 1, name: 'Lahore',   country: '🇵🇰', lat: 31.5204,  lng:  74.3587,  emoji: '🕌' },
  { week: 2, name: 'Dubai',    country: '🇦🇪', lat: 25.2048,  lng:  55.2708,  emoji: '🏙️' },
  { week: 3, name: 'Istanbul', country: '🇹🇷', lat: 41.0082,  lng:  28.9784,  emoji: '🌉' },
  { week: 4, name: 'London',   country: '🇬🇧', lat: 51.5074,  lng:  -0.1278,  emoji: '🎡' },
  { week: 5, name: 'New York', country: '🇺🇸', lat: 40.7128,  lng: -74.0060,  emoji: '🗽' },
  { week: 6, name: 'Toronto',  country: '🇨🇦', lat: 43.6532,  lng: -79.3832,  emoji: '🍁' },
  { week: 7, name: 'Tokyo',    country: '🇯🇵', lat: 35.6762,  lng: 139.6503,  emoji: '⛩️' },
  { week: 8, name: 'Sydney',   country: '🇦🇺', lat: -33.8688, lng: 151.2093,  emoji: '🎓' },
];

// ─── STATE ────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentWeek   = 1;    // from DB
let allTasks      = [];   // weekly_tasks rows for current week
let completedTaskIds = new Set();
let globe         = null;
let isAnimating   = false;
let realtimeSub   = null;

// ─── AIRPLANE SVG ────────────────────────────────────────────────────────────
const PLANE_SVG = `
<svg class="plane-svg" width="48" height="48" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <path d="M50 42 L8 72 L8 77 L50 62" fill="#00D4FF"/>
  <path d="M50 42 L92 72 L92 77 L50 62" fill="#00D4FF"/>
  <rect x="26" y="63" width="7" height="14" rx="3.5" fill="#0a1a3a"/>
  <rect x="67" y="63" width="7" height="14" rx="3.5" fill="#0a1a3a"/>
  <path d="M50 84 L34 96 L34 99 L50 92" fill="#00D4FF"/>
  <path d="M50 84 L66 96 L66 99 L50 92" fill="#00D4FF"/>
  <rect x="43" y="10" width="14" height="84" rx="7" fill="#ffffff"/>
  <path d="M45 18 Q50 14 55 18 L53 24 L47 24 Z" fill="#0a1a3a"/>
  <circle cx="50" cy="38" r="3" fill="#FFD700" opacity="0.8"/>
</svg>`;

// ─── STARS BACKGROUND ────────────────────────────────────────────────────────
function initStars() {
  const canvas = document.getElementById('stars-canvas');
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const STAR_COUNT = 280;
  const stars = Array.from({ length: STAR_COUNT }, () => ({
    x:    Math.random() * canvas.width,
    y:    Math.random() * canvas.height,
    r:    Math.random() * 1.5 + 0.3,
    a:    Math.random(),
    da:   (Math.random() - 0.5) * 0.004,
    speedX: (Math.random() - 0.5) * 0.04,
    speedY: (Math.random() - 0.5) * 0.04,
  }));

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    stars.forEach(s => {
      s.x += s.speedX;
      s.y += s.speedY;
      s.a += s.da;
      if (s.a <= 0.1 || s.a >= 1) s.da *= -1;
      if (s.x < 0) s.x = canvas.width;
      if (s.x > canvas.width) s.x = 0;
      if (s.y < 0) s.y = canvas.height;
      if (s.y > canvas.height) s.y = 0;

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${s.a})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── GLOBE INIT ───────────────────────────────────────────────────────────────
function initGlobe() {
  const container = document.getElementById('globe-container');

  globe = Globe()
    (container)
    .globeImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png')
    .backgroundColor('rgba(0,0,0,0)')
    .showGraticules(false)
    .showAtmosphere(true)
    .atmosphereColor('#00D4FF')
    .atmosphereAltitude(0.12);

  // Initial point of view → current city
  const city = CITIES[currentWeek - 1] || CITIES[0];
  globe.pointOfView({ lat: city.lat, lng: city.lng, altitude: 2.5 }, 0);

  // Auto-rotate
  globe.controls().autoRotate      = true;
  globe.controls().autoRotateSpeed = 0.35;
  globe.controls().enableDamping   = true;

  // Pause rotation on user interaction
  globe.controls().addEventListener('start', () => {
    globe.controls().autoRotate = false;
  });
  globe.controls().addEventListener('end', () => {
    setTimeout(() => { if (globe) globe.controls().autoRotate = true; }, 3000);
  });

  renderGlobe();
}

// ─── RENDER GLOBE DATA ────────────────────────────────────────────────────────
function renderGlobe() {
  if (!globe) return;

  // Build arc data (flight paths between cities)
  const arcs = [];
  for (let i = 0; i < CITIES.length - 1; i++) {
    const from   = CITIES[i];
    const to     = CITIES[i + 1];
    const isDone = (i + 1) < currentWeek;          // both cities visited
    const isCurrent = (i + 1) === currentWeek - 1; // path to current city

    arcs.push({
      startLat: from.lat, startLng: from.lng,
      endLat:   to.lat,   endLng:   to.lng,
      color: (isDone || isCurrent)
        ? ['rgba(255,215,0,0.9)', 'rgba(255,165,0,0.6)']
        : ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.05)'],
      stroke: (isDone || isCurrent) ? 1.2 : 0.6,
      dash:   (isDone || isCurrent) ? null : 1,
    });
  }

  globe
    .arcsData(arcs)
    .arcColor('color')
    .arcAltitude(0.12)
    .arcStroke(d => d.stroke)
    .arcDashLength(d => d.dash ? 0.4 : 1)
    .arcDashGap(d => d.dash ? 0.3 : 0)
    .arcDashAnimateTime(d => d.dash ? 3000 : 0);

  // HTML city pins
  globe
    .htmlElementsData(CITIES)
    .htmlElement(d => {
      const status = d.week < currentWeek  ? 'completed'
                   : d.week === currentWeek ? 'current'
                   : 'locked';
      const el = document.createElement('div');
      el.className = 'city-pin-wrapper';
      el.title     = `${d.country} ${d.name} — Week ${d.week}`;

      const dotDiv = document.createElement('div');
      dotDiv.className = `city-dot ${status}`;

      const labelDiv = document.createElement('div');
      labelDiv.className = `city-label ${status}`;
      labelDiv.textContent = `${d.country} ${d.name}`;

      el.appendChild(dotDiv);
      el.appendChild(labelDiv);

      // Click to focus globe on this city
      el.addEventListener('click', () => {
        globe.pointOfView({ lat: d.lat, lng: d.lng, altitude: 1.8 }, 1000);
      });

      return el;
    })
    .htmlAltitude(0.02);
}

// ─── GREAT CIRCLE INTERPOLATION ───────────────────────────────────────────────
function interpolateGreatCircle(start, end, t) {
  const rad = Math.PI / 180;
  const lat1 = start.lat * rad, lon1 = start.lng * rad;
  const lat2 = end.lat * rad,   lon2 = end.lng * rad;

  const dLat = lat2 - lat1, dLon = lon2 - lon1;
  const a = Math.pow(Math.sin(dLat / 2), 2)
          + Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2);
  const d = 2 * Math.asin(Math.sqrt(a));

  if (d === 0) return { lat: start.lat, lng: start.lng };

  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d)       / Math.sin(d);

  const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
  const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);

  return {
    lat: Math.atan2(z, Math.sqrt(x * x + y * y)) / rad,
    lng: Math.atan2(y, x) / rad,
  };
}

// ─── AIRPLANE ANIMATION ───────────────────────────────────────────────────────
function animateFlight(fromCity, toCity, onComplete) {
  if (isAnimating) return;
  isAnimating = true;

  const planeEl = document.getElementById('plane-tracker');
  planeEl.innerHTML = PLANE_SVG;
  planeEl.style.opacity = '1';

  // Stop auto-rotate while flying
  if (globe) globe.controls().autoRotate = false;

  // Focus on departure city first
  globe.pointOfView({ lat: fromCity.lat, lng: fromCity.lng, altitude: 2.2 }, 800);

  const DURATION    = 5000; // ms
  const startTime   = performance.now() + 900; // slight delay for camera pan

  // Pre-compute heading for plane rotation
  let dLng = toCity.lng - fromCity.lng;
  if (dLng > 180)  dLng -= 360;
  if (dLng < -180) dLng += 360;
  const headingDeg = Math.atan2(toCity.lat - fromCity.lat, dLng) * (180 / Math.PI);
  const planeRot   = -headingDeg + 90;

  // Base arcs before animation arc
  const baseArcs = [];
  for (let i = 0; i < CITIES.length - 1; i++) {
    const from  = CITIES[i];
    const to    = CITIES[i + 1];
    const done  = (i + 1) < currentWeek || (i + 1) === currentWeek - 1;
    baseArcs.push({
      startLat: from.lat, startLng: from.lng,
      endLat:   to.lat,   endLng:   to.lng,
      color: done ? ['rgba(255,215,0,0.9)','rgba(255,165,0,0.6)'] : ['rgba(255,255,255,0.12)','rgba(255,255,255,0.05)'],
      stroke: done ? 1.2 : 0.6,
      dash: done ? null : 1,
    });
  }

  const liveArc = {
    startLat: fromCity.lat, startLng: fromCity.lng,
    endLat:   fromCity.lat, endLng:   fromCity.lng,
    color: ['rgba(0,212,255,0.95)', 'rgba(0,212,255,0.4)'],
    stroke: 1.8,
    dash: null,
  };

  // Trail dots
  const trail = [];
  const MAX_TRAIL = 6;

  function tick(now) {
    const elapsed = now - startTime;
    if (elapsed < 0) { requestAnimationFrame(tick); return; }

    let t = elapsed / DURATION;
    if (t > 1) t = 1;

    // Smooth ease in-out
    const easeT = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const pos   = interpolateGreatCircle(fromCity, toCity, easeT);
    const alt   = 0.02 + Math.sin(t * Math.PI) * 0.35;

    // Update live arc
    liveArc.endLat = pos.lat;
    liveArc.endLng = pos.lng;
    globe.arcsData([...baseArcs, liveArc]);

    // Camera follows plane
    globe.pointOfView({ lat: pos.lat, lng: pos.lng, altitude: 2.0 });

    // Move plane HTML element
    const screen = globe.getScreenCoords(pos.lat, pos.lng, alt);
    if (screen) {
      planeEl.style.left = `${screen.x}px`;
      planeEl.style.top  = `${screen.y}px`;
      planeEl.querySelector('svg').style.transform = `rotate(${planeRot}deg)`;
    }

    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      // Landing!
      planeEl.style.opacity = '0';
      isAnimating = false;
      onComplete();
    }
  }

  requestAnimationFrame(tick);
}

// ─── CONFETTI ─────────────────────────────────────────────────────────────────
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx    = canvas.getContext('2d');
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.classList.add('active');

  const COLORS  = ['#FFD700','#00D4FF','#FF4567','#00FF88','#FF8C00','#ffffff','#a855f7'];
  const PIECES  = 180;
  const pieces  = Array.from({ length: PIECES }, () => ({
    x:   Math.random() * canvas.width,
    y:   -20 - Math.random() * 200,
    w:   Math.random() * 10 + 5,
    h:   Math.random() * 5  + 3,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    rot:  Math.random() * 360,
    rotV: (Math.random() - 0.5) * 8,
    vy:   Math.random() * 4  + 2,
    vx:   (Math.random() - 0.5) * 3,
    opacity: 1,
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    pieces.forEach(p => {
      p.y   += p.vy;
      p.x   += p.vx;
      p.rot += p.rotV;
      p.vy  += 0.07; // gravity
      if (p.y > canvas.height * 0.8) p.opacity -= 0.025;
      if (p.opacity <= 0) return;
      alive = true;

      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle   = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (alive && frame < 300) {
      frame++;
      requestAnimationFrame(draw);
    } else {
      canvas.classList.remove('active');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  draw();
}

// ─── CELEBRATION ──────────────────────────────────────────────────────────────
function showCelebration(city) {
  const overlay = document.getElementById('celebration-overlay');
  document.getElementById('celeb-emoji').textContent      = city.week === 8 ? '🎓' : '✈️';
  document.getElementById('celeb-city').textContent       = `${city.country} ${city.name}`;
  document.getElementById('celeb-city-inline').textContent = city.name;
  document.getElementById('celeb-msg').innerHTML = city.week === 8
    ? `🎓 <strong>Congratulations, Graduate!</strong> You've completed the entire SpeakLabs journey! From Lahore to Sydney — you did it! 🌟`
    : `You've landed in <strong>${city.name}</strong>! Week ${city.week} has been unlocked. Keep flying — your next adventure awaits! 🚀`;

  overlay.classList.add('active');
  launchConfetti();
}

window.closeCelebration = function() {
  document.getElementById('celebration-overlay').classList.remove('active');
};

// ─── TOAST NOTIFICATION ───────────────────────────────────────────────────────
function toast(title, msg, type = 'info', emoji = 'ℹ️') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-icon">${emoji}</div>
    <div class="toast-content">
      <h4>${title}</h4>
      <p>${msg}</p>
    </div>`;
  container.appendChild(el);

  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 350);
  }, 4500);
}

// ─── UI UPDATER ───────────────────────────────────────────────────────────────
function updateUI() {
  const city = CITIES[currentWeek - 1];
  if (!city) return;

  // Header
  const nameEl = document.getElementById('header-greeting');
  if (currentUser?.user_metadata?.full_name) {
    nameEl.textContent = `Welcome back, ${currentUser.user_metadata.full_name.split(' ')[0]}! ✈️`;
  }
  document.getElementById('header-status').textContent =
    `${city.country} ${city.name} — Week ${currentWeek} of 8`;

  // Status strip
  document.getElementById('status-flag').textContent      = city.country;
  document.getElementById('status-city-name').textContent = city.name;
  document.getElementById('status-week-num').textContent  = currentWeek;
  document.getElementById('status-week-label').textContent =
    currentWeek === 8 ? 'Final Destination!' : `Flying towards ${CITIES[currentWeek]?.name || 'graduation'}`;

  // Progress segments
  const segsEl = document.getElementById('progress-segments');
  segsEl.innerHTML = '';
  for (let i = 1; i <= 8; i++) {
    const seg = document.createElement('div');
    seg.className = `seg ${i < currentWeek ? 'completed' : i === currentWeek ? 'current' : ''}`;
    seg.title = `Week ${i}: ${CITIES[i - 1].name}`;
    segsEl.appendChild(seg);
  }
  document.getElementById('progress-label').textContent = `${currentWeek - 1}/8 ✅`;

  // Journey track
  buildJourneyTrack();

  // Globe
  renderGlobe();
  if (globe) {
    globe.pointOfView({ lat: city.lat, lng: city.lng, altitude: 2.2 }, 1200);
  }

  // Tasks heading
  document.getElementById('tasks-week-title').textContent = `Week ${currentWeek} Missions`;
  document.getElementById('tasks-city-badge').textContent = city.name;
}

// ─── JOURNEY TRACK ────────────────────────────────────────────────────────────
function buildJourneyTrack() {
  const track = document.getElementById('journey-track');
  track.innerHTML = '';

  CITIES.forEach((city, i) => {
    const status = city.week < currentWeek  ? 'completed'
                 : city.week === currentWeek ? 'current'
                 : 'locked';

    const cityEl = document.createElement('div');
    cityEl.className = 'journey-city';
    cityEl.innerHTML = `
      <div class="journey-city-dot ${status}">${city.emoji}</div>
      <div class="journey-city-name">${city.name}</div>`;

    cityEl.addEventListener('click', () => {
      if (globe) globe.pointOfView({ lat: city.lat, lng: city.lng, altitude: 1.8 }, 1000);
    });

    track.appendChild(cityEl);

    if (i < CITIES.length - 1) {
      const conn = document.createElement('div');
      conn.className = `journey-connector ${status === 'completed' ? 'done' : 'pending'}`;
      track.appendChild(conn);
    }
  });

  // Scroll to current city in track
  setTimeout(() => {
    const currentEl = track.querySelector('.journey-city-dot.current')?.closest('.journey-city');
    if (currentEl) {
      currentEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, 300);
}

// ─── TASKS RENDERER ──────────────────────────────────────────────────────────
function renderTasks() {
  const grid = document.getElementById('tasks-grid');
  grid.innerHTML = '';

  const weekTasks = allTasks.filter(t => t.week_number === currentWeek);

  if (weekTasks.length === 0) {
    grid.innerHTML = `
      <div class="tasks-empty">
        <span class="empty-icon">🗺️</span>
        <p>No missions assigned for this week yet.<br>Check back soon!</p>
      </div>`;
    document.getElementById('tasks-completion-text').textContent = '0 of 0 tasks';
    return;
  }

  const done = weekTasks.filter(t => completedTaskIds.has(t.id)).length;
  document.getElementById('tasks-completion-text').textContent = `${done} of ${weekTasks.length} tasks completed`;

  weekTasks.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  weekTasks.forEach((task, idx) => {
    const isComplete = completedTaskIds.has(task.id);

    const card = document.createElement('div');
    card.className = `task-card ${isComplete ? 'completed' : 'current-task'}`;
    card.style.animationDelay = `${idx * 0.08}s`;

    card.innerHTML = `
      <div class="task-check">${isComplete ? '✓' : ''}</div>
      <div class="task-content">
        <div class="task-title">${task.task_title}</div>
        ${task.task_description ? `<div class="task-desc">${task.task_description}</div>` : ''}
      </div>
      <span class="task-badge ${isComplete ? 'done' : 'pending'}">${isComplete ? '✅ Done' : '⏳ Pending'}</span>`;

    if (!isComplete) {
      card.addEventListener('click', () => handleCompleteTask(task, card));
    }

    grid.appendChild(card);
  });
}

// ─── TASK COMPLETION ──────────────────────────────────────────────────────────
async function handleCompleteTask(task, card) {
  if (!currentUser) return;
  card.style.pointerEvents = 'none';
  card.style.opacity = '0.7';

  try {
    const { error } = await window.supabaseClient.from('task_completions').insert({
      student_id: currentUser.id,
      task_id:    task.id,
    });

    if (error) {
      if (error.code === '23505') {
        // Already completed
        completedTaskIds.add(task.id);
        renderTasks();
        return;
      }
      throw error;
    }

    completedTaskIds.add(task.id);
    toast('Mission Complete! 🎯', `"${task.task_title}" — Great work!`, 'success', '✅');
    renderTasks();

  } catch (err) {
    console.error('Task completion error:', err);
    card.style.pointerEvents = '';
    card.style.opacity       = '';
    toast('Error', 'Could not save. Please try again.', 'info', '❌');
  }
}

// ─── SUPABASE DATA LOADING ────────────────────────────────────────────────────
async function loadStudentData() {
  if (!currentUser) return;

  try {
    // 1. Get or create student_progress record
    let { data: progress, error: pErr } = await supabase
      .from('student_progress')
      .select('*')
      .eq('student_id', currentUser.id)
      .maybeSingle();

    if (pErr) throw pErr;

    if (!progress) {
      // First login — create progress row at week 1
      const { data: newRow, error: iErr } = await supabase
        .from('student_progress')
        .insert({ student_id: currentUser.id, current_week: 1 })
        .select()
        .single();
      if (iErr) throw iErr;
      progress = newRow;
    }

    currentWeek = progress.current_week || 1;

    // 2. Load ALL tasks (prefetch all weeks for performance)
    const { data: tasks, error: tErr } = await supabase
      .from('weekly_tasks')
      .select('*')
      .order('sort_order');
    if (tErr) throw tErr;
    allTasks = tasks || [];

    // 3. Load task completions for this user
    const { data: completions, error: cErr } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('student_id', currentUser.id);
    if (cErr) throw cErr;
    completedTaskIds = new Set((completions || []).map(c => c.task_id));

    // 4. Update all UI
    updateUI();
    renderTasks();

  } catch (err) {
    console.error('Error loading student data:', err);
    toast('Connection Error', 'Could not load your data. Please refresh.', 'info', '⚠️');
  }
}

// ─── SUPABASE REALTIME ────────────────────────────────────────────────────────
function setupRealtime() {
  if (!currentUser) return;

  // Unsubscribe previous if exists
  if (realtimeSub) window.supabaseClient.removeChannel(realtimeSub);

  realtimeSub = supabase
    .channel(`student_progress_${currentUser.id}`)
    .on(
      'postgres_changes',
      {
        event:  'UPDATE',
        schema: 'public',
        table:  'student_progress',
        filter: `student_id=eq.${currentUser.id}`,
      },
      (payload) => {
        const newWeek = payload.new.current_week;
        if (newWeek && newWeek !== currentWeek && newWeek > currentWeek) {
          handleWeekApproved(newWeek);
        }
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('🔴 Realtime connected for student:', currentUser.id);
      }
    });
}

// ─── WEEK APPROVAL HANDLER (triggered by realtime) ───────────────────────────
async function handleWeekApproved(newWeek) {
  const fromCity = CITIES[currentWeek - 1];
  const toCity   = CITIES[newWeek - 1];

  if (!fromCity || !toCity) return;

  toast('✈️ Takeoff!', `Your admin approved Week ${newWeek}! Flying to ${toCity.name}...`, 'gold', '🛫');

  // Fly the airplane
  animateFlight(fromCity, toCity, async () => {
    // Update local state
    currentWeek = newWeek;

    // Reload tasks for new week
    const { data: completions } = await supabase
      .from('task_completions')
      .select('task_id')
      .eq('student_id', currentUser.id);
    completedTaskIds = new Set((completions || []).map(c => c.task_id));

    // Update globe and UI
    renderGlobe();
    updateUI();
    renderTasks();

    // Resume auto-rotate
    setTimeout(() => { if (globe) globe.controls().autoRotate = true; }, 500);

    // CELEBRATION! 🎉
    showCelebration(toCity);
  });
}

// ─── AUTH FLOW ────────────────────────────────────────────────────────────────
async function handleLogout() {
  await window.supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}
window.handleLogout = handleLogout;

async function init() {
  try {
    initStars();

    // Check auth
    const { data: { session }, error: authErr } = await window.supabaseClient.auth.getSession();
    if (authErr) throw authErr;

    if (!session) {
      // Not logged in — redirect to login
      window.location.href = 'login.html?redirect=student-portal.html';
      return;
    }

    currentUser = session.user;

    // Hide auth check overlay
    document.getElementById('auth-check').style.display = 'none';

    // Show main portal
    document.getElementById('main-portal').style.display = 'block';

    // Load data
    await loadStudentData();

    // Init globe after data is ready
    initGlobe();

    // Setup realtime
    setupRealtime();

    // Hide loading screen
    setTimeout(() => {
      document.getElementById('loading-screen').classList.add('hidden');
    }, 1800);

    // Listen for auth changes
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        window.location.href = 'login.html';
      }
    });
  } catch (err) {
    console.error("Initialization Error:", err);
    alert("An error occurred while loading the portal:\n\n" + err.message + "\n\nPlease check the console for details.");
    
    // Force hide loader so they can at least see the UI (even if broken)
    document.getElementById('loading-screen').style.display = 'none';
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
