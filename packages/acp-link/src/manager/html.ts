export const MANAGER_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ACP Manager</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: #f8f7f5;
  color: #1a1a1a;
  padding: 24px;
  min-height: 100vh;
}
h1 { font-size: 20px; font-weight: 600; margin-bottom: 20px; color: #1a1a1a; }
.header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.create-form {
  background: #fff;
  border: 1px solid #e5e2de;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  gap: 10px;
  align-items: flex-end;
}
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label { font-size: 12px; color: #888; }
.form-group input {
  background: #fff;
  border: 1px solid #d5d2ce;
  border-radius: 4px;
  padding: 8px 12px;
  color: #1a1a1a;
  font-size: 14px;
  width: 200px;
}
.form-group input.wide { width: 400px; }
button {
  background: #d77757;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
button:hover { background: #c4694b; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
button.danger { background: #a63d3d; }
button.danger:hover { background: #c44a4a; }
button.small { padding: 4px 10px; font-size: 12px; }
.instances { display: flex; flex-direction: column; gap: 8px; }
.instance-card {
  background: #fff;
  border: 1px solid #e5e2de;
  border-radius: 8px;
  overflow: hidden;
}
.instance-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  cursor: pointer;
  user-select: none;
}
.instance-header:hover { background: #f5f3f0; }
.status-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.running { background: #4ade80; box-shadow: 0 0 6px #4ade8066; }
.status-dot.stopped { background: #aaa; }
.status-dot.failed { background: #f87171; box-shadow: 0 0 6px #f8717166; }
.instance-info { flex: 1; display: flex; gap: 16px; align-items: center; font-size: 13px; }
.instance-info .group { font-weight: 600; color: #d77757; }
.instance-info .cmd { color: #888; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.instance-info .pid { color: #999; font-size: 12px; }
.instance-info .uptime { color: #999; font-size: 12px; }
.instance-actions { display: flex; gap: 6px; }
.expand-icon { color: #999; font-size: 12px; transition: transform 0.2s; }
.expand-icon.open { transform: rotate(90deg); }
.log-panel {
  display: none;
  border-top: 1px solid #e5e2de;
  background: #faf9f7;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px 16px;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
}
.log-panel.visible { display: block; }
.log-line { white-space: pre-wrap; word-break: break-all; }
.log-line.stdout { color: #333; }
.log-line.stderr { color: #d94040; }
.empty { color: #999; text-align: center; padding: 40px; font-size: 14px; }

@media (max-width: 640px) {
  body { padding: 12px; }
  .create-form { flex-wrap: wrap; }
  .form-group input, .form-group input.wide { width: 100%; }
  .form-group { flex: 1 1 120px; min-width: 0; }
  .instance-header { flex-wrap: wrap; padding: 10px 12px; gap: 8px; }
  .instance-info { flex-wrap: wrap; gap: 6px; font-size: 12px; }
  .instance-info .cmd { max-width: 100%; }
  button.small { padding: 8px 14px; min-height: 44px; font-size: 13px; }
  .log-panel { max-height: 50vh; }
}
</style>
</head>
<body>
<div class="header">
  <h1>ACP Manager</h1>
</div>

<div class="create-form">
  <div class="form-group">
    <label>Group</label>
    <input type="text" id="inp-group" placeholder="my-group" />
  </div>
  <div class="form-group">
    <label>ACP Command</label>
    <input type="text" id="inp-command" class="wide" placeholder="/path/to/agent --verbose" />
  </div>
  <button id="btn-create">Create</button>
</div>

<div class="instances" id="instance-list"></div>

<script>
var listEl = document.getElementById('instance-list');
var esMap = {};
var instances = [];
var inpGroup = document.getElementById('inp-group');
var inpCommand = document.getElementById('inp-command');
var btnCreate = document.getElementById('btn-create');

// localStorage persistence
function loadForm() {
  try {
    inpGroup.value = localStorage.getItem('acp-mgr-group') || '';
    inpCommand.value = localStorage.getItem('acp-mgr-command') || '';
  } catch(e) {}
}
function saveForm() {
  try {
    localStorage.setItem('acp-mgr-group', inpGroup.value);
    localStorage.setItem('acp-mgr-command', inpCommand.value);
  } catch(e) {}
}
inpGroup.addEventListener('input', saveForm);
inpCommand.addEventListener('input', saveForm);
loadForm();

btnCreate.addEventListener('click', function() {
  var group = inpGroup.value.trim();
  var command = inpCommand.value.trim();
  if (!group || !command) return alert('Both fields required');
  btnCreate.disabled = true;
  fetch('/api/instances', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ group: group, command: command }),
  }).then(function() { fetchInstances(); })
   .finally(function() { btnCreate.disabled = false; });
});

// event delegation for instance actions
listEl.addEventListener('click', function(e) {
  var btn = e.target.closest('[data-action]');
  if (btn) {
    e.stopPropagation();
    var id = btn.getAttribute('data-id');
    var action = btn.getAttribute('data-action');
    if (action === 'stop') stopInstance(id);
    else if (action === 'delete') deleteInstance(id);
    return;
  }
  var header = e.target.closest('.instance-header');
  if (header) {
    var cardId = header.closest('.instance-card').getAttribute('data-id');
    toggleLog(cardId);
  }
});

async function fetchInstances() {
  var res = await fetch('/api/instances');
  instances = await res.json();
  render();
}

function uptime(start) {
  var s = Math.floor((Date.now() - start) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s/60) + 'm ' + (s%60) + 's';
  return Math.floor(s/3600) + 'h ' + Math.floor((s%3600)/60) + 'm';
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function render() {
  if (instances.length === 0) {
    listEl.innerHTML = '<div class="empty">No instances. Create one above.</div>';
    return;
  }
  // Diff-based update: only rebuild cards whose status changed
  var existingCards = {};
  listEl.querySelectorAll('.instance-card').forEach(function(card) {
    existingCards[card.getAttribute('data-id')] = card;
  });

  var newIds = new Set(instances.map(function(i) { return i.id; }));

  // Remove cards that no longer exist
  for (var eid in existingCards) {
    if (!newIds.has(eid)) {
      closeLog(eid);
      existingCards[eid].remove();
      delete existingCards[eid];
    }
  }

  // Update or create cards in order
  instances.forEach(function(inst) {
    var card = existingCards[inst.id];
    if (!card) {
      // New instance — create card
      card = document.createElement('div');
      card.className = 'instance-card';
      card.setAttribute('data-id', inst.id);
      card.innerHTML =
        '<div class="instance-header">' +
        '<span class="expand-icon">&#9654;</span>' +
        '<span class="status-dot"></span>' +
        '<div class="instance-info">' +
        '<span class="group"></span>' +
        '<span class="cmd"></span>' +
        '<span class="pid"></span>' +
        '<span class="uptime"></span>' +
        '</div>' +
        '<div class="instance-actions"></div>' +
        '</div>' +
        '<div class="log-panel" id="log-' + inst.id + '"></div>';
      listEl.appendChild(card);
    }
    // Update card content
    card.querySelector('.status-dot').className = 'status-dot ' + inst.status;
    card.querySelector('.group').textContent = inst.group;
    card.querySelector('.cmd').textContent = inst.command;
    card.querySelector('.pid').textContent = inst.pid ? 'PID ' + inst.pid : '';
    card.querySelector('.uptime').textContent = inst.status === 'running' ? uptime(inst.startTime) : '';

    // Update action buttons
    var actions = card.querySelector('.instance-actions');
    var prevStatus = card.getAttribute('data-status');
    if (prevStatus !== inst.status) {
      card.setAttribute('data-status', inst.status);
      actions.innerHTML = inst.status === 'running'
        ? '<button class="small danger" data-action="stop" data-id="' + inst.id + '">Stop</button>'
        : '<button class="small danger" data-action="delete" data-id="' + inst.id + '">Delete</button>';
    }
  });
}

async function stopInstance(id) {
  var btn = listEl.querySelector('[data-action="stop"][data-id="' + id + '"]');
  if (btn) btn.disabled = true;
  await fetch('/api/instances/' + id + '/stop', { method: 'POST' });
  await fetchInstances();
}

async function deleteInstance(id) {
  var btn = listEl.querySelector('[data-action="delete"][data-id="' + id + '"]');
  if (btn) btn.disabled = true;
  await fetch('/api/instances/' + id, { method: 'DELETE' });
  closeLog(id);
  await fetchInstances();
}

function toggleLog(id) {
  var panel = document.getElementById('log-' + id);
  if (!panel) return;
  if (panel.classList.contains('visible')) {
    closeLog(id);
  } else {
    openLog(id);
  }
  var icon = listEl.querySelector('[data-id="' + id + '"] .expand-icon');
  if (icon) icon.classList.toggle('open', panel.classList.contains('visible'));
}

function openLog(id) {
  var panel = document.getElementById('log-' + id);
  if (!panel) return;
  panel.classList.add('visible');
  panel.innerHTML = '';
  var es = new EventSource('/api/instances/' + id + '/logs');
  esMap[id] = es;
  var scrollPending = false;
  es.onmessage = function(e) {
    try {
      var entry = JSON.parse(e.data);
      var line = document.createElement('div');
      line.className = 'log-line ' + entry.stream;
      var time = new Date(entry.timestamp).toLocaleTimeString();
      line.textContent = '[' + time + '] ' + entry.text;
      panel.appendChild(line);
      if (panel.children.length > 500) panel.removeChild(panel.firstChild);
      if (!scrollPending) {
        scrollPending = true;
        requestAnimationFrame(function() {
          panel.scrollTop = panel.scrollHeight;
          scrollPending = false;
        });
      }
    } catch(err) {}
  };
  es.onerror = function() {
    es.close();
    delete esMap[id];
  };
}

function closeLog(id) {
  if (esMap[id]) {
    esMap[id].close();
    delete esMap[id];
  }
  var panel = document.getElementById('log-' + id);
  if (panel) panel.classList.remove('visible');
}

fetchInstances();
setInterval(fetchInstances, 3000);
</script>
</body>
</html>`
