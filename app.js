import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ---------- config / bootstrap ----------
const cfg = {
  url: localStorage.getItem('tp_url') || '',
  key: localStorage.getItem('tp_key') || '',
  email: localStorage.getItem('tp_email') || ''
};

let supabase = null;
let tasks = [];
let currentView = 'today';
let calCursor = new Date(); // month cursor for calendar view
let editingId = null;

const $ = (sel) => document.querySelector(sel);
const $all = (sel) => document.querySelectorAll(sel);

function initSupabase() {
  if (!cfg.url || !cfg.key) return false;
  supabase = createClient(cfg.url, cfg.key);
  return true;
}

function showSetup() {
  $('#setup-screen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}
function showApp() {
  $('#setup-screen').classList.add('hidden');
  $('#app').classList.remove('hidden');
}

// ---------- setup screen ----------
$('#setup-save').addEventListener('click', () => {
  const url = $('#setup-url').value.trim();
  const key = $('#setup-key').value.trim();
  if (!url || !key) { toast('Enter both the URL and anon key.'); return; }
  localStorage.setItem('tp_url', url);
  localStorage.setItem('tp_key', key);
  cfg.url = url; cfg.key = key;
  initSupabase();
  showApp();
  loadTasks();
});

// ---------- settings modal ----------
$('#open-settings').addEventListener('click', () => {
  $('#s-url').value = cfg.url;
  $('#s-key').value = cfg.key;
  $('#s-email').value = cfg.email;
  $('#settings-modal').classList.remove('hidden');
});
$('#settings-close').addEventListener('click', () => $('#settings-modal').classList.add('hidden'));
$('#s-save').addEventListener('click', () => {
  cfg.url = $('#s-url').value.trim();
  cfg.key = $('#s-key').value.trim();
  cfg.email = $('#s-email').value.trim();
  localStorage.setItem('tp_url', cfg.url);
  localStorage.setItem('tp_key', cfg.key);
  localStorage.setItem('tp_email', cfg.email);
  initSupabase();
  $('#settings-modal').classList.add('hidden');
  toast('Settings saved.');
  loadTasks();
});

// ---------- nav ----------
$all('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $all('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    render();
  });
});

// ---------- task modal ----------
function openTaskModal(task=null) {
  editingId = task ? task.id : null;
  $('#modal-title').textContent = task ? 'Edit Task' : 'New Task';
  $('#f-title').value = task ? task.title : '';
  $('#f-date').value = task ? task.due_date : todayStr();
  $('#f-time').value = task && task.due_time ? task.due_time.slice(0,5) : '';
  $('#f-priority').value = task ? task.priority : 'normal';
  $('#f-notes').value = task && task.notes ? task.notes : '';
  $('#f-delete').classList.toggle('hidden', !task);
  $('#task-modal').classList.remove('hidden');
}
function closeTaskModal(){ $('#task-modal').classList.add('hidden'); editingId = null; }

$('#new-task-btn').addEventListener('click', () => openTaskModal());
$('#f-cancel').addEventListener('click', closeTaskModal);
$('#modal-close').addEventListener('click', closeTaskModal);

$('#f-save').addEventListener('click', async () => {
  const title = $('#f-title').value.trim();
  const due_date = $('#f-date').value;
  if (!title || !due_date) { toast('Title and due date are required.'); return; }
  const payload = {
    title,
    due_date,
    due_time: $('#f-time').value || null,
    priority: $('#f-priority').value,
    notes: $('#f-notes').value.trim() || null
  };
  if (editingId) {
    payload.reminder_sent = false; // date/details changed → allow a fresh reminder
    const { error } = await supabase.from('tasks').update(payload).eq('id', editingId);
    if (error) return toast('Error: ' + error.message);
    toast('Task updated.');
  } else {
    const { error } = await supabase.from('tasks').insert(payload);
    if (error) return toast('Error: ' + error.message);
    toast('Task added.');
  }
  closeTaskModal();
  loadTasks();
});

$('#f-delete').addEventListener('click', async () => {
  if (!editingId) return;
  const { error } = await supabase.from('tasks').delete().eq('id', editingId);
  if (error) return toast('Error: ' + error.message);
  toast('Task deleted.');
  closeTaskModal();
  loadTasks();
});

// ---------- day panel ----------
let dayPanelDate = null;

function openDayPanel(dateStr) {
  dayPanelDate = dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  $('#day-panel-title').textContent = d.toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
  const dayTasks = tasks.filter(t => t.due_date === dateStr)
    .sort((a,b) => (a.due_time||'').localeCompare(b.due_time||''));
  const list = $('#day-panel-list');
  list.innerHTML = '';
  dayTasks.forEach(t => list.appendChild(taskCard(t)));
  $('#day-panel-empty').classList.toggle('hidden', dayTasks.length > 0);
  $('#day-panel').classList.remove('hidden');
  $('#day-panel-backdrop').classList.remove('hidden');
}

function closeDayPanel() {
  $('#day-panel').classList.add('hidden');
  $('#day-panel-backdrop').classList.add('hidden');
  dayPanelDate = null;
}

$('#day-panel-close').addEventListener('click', closeDayPanel);
$('#day-panel-backdrop').addEventListener('click', closeDayPanel);
$('#day-panel-add').addEventListener('click', () => {
  closeDayPanel();
  openTaskModal({ due_date: dayPanelDate || todayStr(), title:'', priority:'normal', status:'pending', id:null });
  editingId = null;
  $('#modal-title').textContent = 'New Task';
  $('#f-delete').classList.add('hidden');
});

// ---------- calendar nav ----------
$('#cal-prev').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth()-1); renderCalendar(); });
$('#cal-next').addEventListener('click', () => { calCursor.setMonth(calCursor.getMonth()+1); renderCalendar(); });
$('#cal-today').addEventListener('click', () => { calCursor = new Date(); renderCalendar(); });

// ---------- data ----------
async function loadTasks() {
  if (!supabase) return;
  const { data, error } = await supabase.from('tasks').select('*').order('due_date', { ascending: true });
  if (error) { toast('Load error: ' + error.message); return; }
  tasks = data || [];
  render();
  if (dayPanelDate) openDayPanel(dayPanelDate);
}

async function toggleDone(task) {
  const status = task.status === 'done' ? 'pending' : 'done';
  const { error } = await supabase.from('tasks').update({ status }).eq('id', task.id);
  if (error) return toast('Error: ' + error.message);
  loadTasks();
}

// ---------- rendering ----------
function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function daysBetween(dateStr) {
  const today = new Date(todayStr());
  const d = new Date(dateStr);
  return Math.round((d - today) / 86400000);
}

function render() {
  updateGauges();
  const isListView = currentView !== 'calendar';
  $('#view-list').classList.toggle('hidden', !isListView);
  $('#view-calendar').classList.toggle('hidden', currentView !== 'calendar');

  if (!isListView) { renderCalendar(); return; }

  let filtered = [];
  let title = '';
  const now = new Date();
  const dateLabel = now.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  if (currentView === 'today') {
    title = 'Today';
    filtered = tasks.filter(t => t.due_date === todayStr() || (daysBetween(t.due_date) < 0 && t.status !== 'done'));
  } else if (currentView === 'upcoming') {
    title = 'Upcoming (next 7 days)';
    filtered = tasks.filter(t => {
      const diff = daysBetween(t.due_date);
      return diff > 0 && diff <= 7 && t.status !== 'done';
    });
  } else if (currentView === 'all') {
    title = 'All Tasks';
    filtered = [...tasks];
  }

  $('#view-title').textContent = title;
  $('#view-date').textContent = currentView === 'today' ? dateLabel : '';

  const list = $('#task-list');
  list.innerHTML = '';
  $('#empty-state').classList.toggle('hidden', filtered.length > 0);

  filtered
    .sort((a,b) => (a.due_date+  (a.due_time||'')).localeCompare(b.due_date+(b.due_time||'')))
    .forEach(t => list.appendChild(taskCard(t)));
}

function taskCard(t) {
  const el = document.createElement('div');
  el.className = 'task-card' + (t.status === 'done' ? ' done' : '');
  el.dataset.priority = t.priority;

  const diff = daysBetween(t.due_date);
  let tag = '';
  if (t.status !== 'done') {
    if (diff < 0) tag = '<span class="task-tag overdue">Overdue</span>';
    else if (diff === 0) tag = '<span class="task-tag today">Today</span>';
    else if (diff <= 3) tag = '<span class="task-tag soon">Soon</span>';
  }

  const timeStr = t.due_time ? ` · ${t.due_time.slice(0,5)}` : '';
  el.innerHTML = `
    <div class="task-check">${t.status==='done' ? '✓' : ''}</div>
    <div class="task-body">
      <div class="task-title">${escapeHtml(t.title)}</div>
      <div class="task-meta">${t.due_date}${timeStr}${t.notes ? ' · ' + escapeHtml(t.notes.slice(0,60)) : ''}</div>
    </div>
    ${tag}
  `;
  el.querySelector('.task-check').addEventListener('click', (e) => { e.stopPropagation(); toggleDone(t); });
  el.addEventListener('click', () => openTaskModal(t));
  return el;
}

function renderCalendar() {
  const grid = $('#cal-grid');
  grid.innerHTML = '';
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  $('#cal-month-label').textContent = calCursor.toLocaleDateString(undefined, { month:'long', year:'numeric' });

  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);

  for (let i=0; i<42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    const cellStr = cellDate.toISOString().slice(0,10);
    const isOutside = cellDate.getMonth() !== month;
    const isToday = cellStr === todayStr();

    const cell = document.createElement('div');
    cell.className = 'cal-cell' + (isOutside ? ' outside' : '') + (isToday ? ' is-today' : '');
    const dayTasks = tasks.filter(t => t.due_date === cellStr);
    cell.innerHTML = `<div class="cal-daynum">${cellDate.getDate()}</div>` +
      dayTasks.slice(0,3).map(t => `<div class="cal-task-pill" data-priority="${t.priority}" data-id="${t.id}">${escapeHtml(t.title)}</div>`).join('') +
      (dayTasks.length > 3 ? `<div class="cal-task-pill">+${dayTasks.length-3} more</div>` : '');
    grid.appendChild(cell);

    cell.querySelectorAll('.cal-task-pill[data-id]').forEach(pill => {
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = tasks.find(x => x.id === pill.dataset.id);
        if (t) openTaskModal(t);
      });
    });

    cell.addEventListener('click', () => openDayPanel(cellStr));
  }
}

function updateGauges() {
  const overdue = tasks.filter(t => t.status !== 'done' && daysBetween(t.due_date) < 0).length;
  const today = tasks.filter(t => t.due_date === todayStr() && t.status !== 'done').length;
  const upcoming = tasks.filter(t => { const d = daysBetween(t.due_date); return d > 0 && d <= 7 && t.status !== 'done'; }).length;
  const done = tasks.filter(t => t.status === 'done').length;
  $('#stat-today').textContent = String(today).padStart(2,'0');
  $('#stat-overdue').textContent = String(overdue).padStart(2,'0');
  $('#stat-upcoming').textContent = String(upcoming).padStart(2,'0');
  $('#stat-done').textContent = String(done).padStart(2,'0');
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2600);
}

// ---------- boot ----------
(function boot() {
  if (initSupabase()) {
    showApp();
    loadTasks();
  } else {
    showSetup();
  }
})();
