/**
 * Remote Control — Task/Todo Floating Panel
 *
 * Parses tool_use blocks from assistant events to extract TaskCreate,
 * TaskUpdate, and TodoWrite operations, then renders a floating panel
 * showing the current task/todo state.
 */

// ============================================================
// State
// ============================================================

/** @type {Map<string, TaskItem>} V2 Tasks keyed by id */
const tasks = new Map();

/** @type {TodoItem[]} V1 Todos */
let todos = [];

/** @type {boolean} Panel visibility */
let panelVisible = false;

/** @type {HTMLElement|null} Panel root element */
let panelEl = null;

/** @type {HTMLElement|null} Badge element showing count */
let badgeEl = null;

// ============================================================
// Types (JSDoc for clarity)
// ============================================================

/**
 * @typedef {Object} TaskItem
 * @property {string} id
 * @property {string} subject
 * @property {string} description
 * @property {string} [activeForm]
 * @property {'pending'|'in_progress'|'completed'|'deleted'} status
 * @property {string} [owner]
 * @property {string[]} blocks
 * @property {string[]} blockedBy
 */

/**
 * @typedef {Object} TodoItem
 * @property {string} content
 * @property {'pending'|'in_progress'|'completed'} status
 * @property {string} activeForm
 */

// ============================================================
// State mutations
// ============================================================

/**
 * Process an assistant event payload, extracting tool_use blocks.
 * @param {{ message?: { content?: unknown } }} payload
 */
export function processAssistantEvent(payload) {
  if (!payload || !payload.message) return;

  const content = payload.message.content;
  if (!Array.isArray(content)) return;

  let changed = false;

  for (const block of content) {
    if (!block || typeof block !== "object" || block.type !== "tool_use") continue;

    const name = block.name;
    const input = block.input || {};

    if (name === "TaskCreate") {
      handleTaskCreate(input);
      changed = true;
    } else if (name === "TaskUpdate") {
      handleTaskUpdate(input);
      changed = true;
    } else if (name === "TodoWrite") {
      handleTodoWrite(input);
      changed = true;
    }
  }

  if (changed) {
    renderPanel();
    updateBadge();
  }
}

/**
 * @param {{ subject?: string, description?: string, activeForm?: string, metadata?: object }} input
 */
function handleTaskCreate(input) {
  // TaskCreate creates a task; the tool itself generates the ID server-side.
  // We extract from the tool output (tool_result) if available, or use a
  // synthetic ID. The actual ID comes from the tool result event.
  // Since we only see tool_use (not tool_result here), we create with a
  // temporary key based on subject and let TaskUpdate resolve it.
  const subject = input.subject || "Untitled task";
  const description = input.description || "";
  const activeForm = input.activeForm;

  // Check if there's an id in the input (some versions include it)
  const id = input.taskId || input.id || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  tasks.set(id, {
    id,
    subject,
    description,
    activeForm,
    status: "pending",
    owner: undefined,
    blocks: [],
    blockedBy: [],
  });
}

/**
 * @param {{ taskId?: string, status?: string, subject?: string, description?: string, activeForm?: string, owner?: string, addBlocks?: string[], addBlockedBy?: string[], metadata?: object }} input
 */
function handleTaskUpdate(input) {
  const id = input.taskId;
  if (!id) return;

  const existing = tasks.get(id);
  if (!existing) {
    // Task wasn't tracked yet — create it from the update
    tasks.set(id, {
      id,
      subject: input.subject || "Untitled task",
      description: input.description || "",
      activeForm: input.activeForm,
      status: input.status || "pending",
      owner: input.owner,
      blocks: [],
      blockedBy: [],
    });
    return;
  }

  if (input.subject !== undefined) existing.subject = input.subject;
  if (input.description !== undefined) existing.description = input.description;
  if (input.activeForm !== undefined) existing.activeForm = input.activeForm;
  if (input.status !== undefined) existing.status = input.status;
  if (input.owner !== undefined) existing.owner = input.owner;
  if (input.addBlocks) {
    existing.blocks = [...new Set([...existing.blocks, ...input.addBlocks])];
  }
  if (input.addBlockedBy) {
    existing.blockedBy = [...new Set([...existing.blockedBy, ...input.addBlockedBy])];
  }
  if (input.status === "deleted") {
    tasks.delete(id);
  }
}

/**
 * @param {{ todos?: Array<{ content: string, status: string, activeForm: string }> }} input
 */
function handleTodoWrite(input) {
  if (!Array.isArray(input.todos)) return;
  todos = input.todos.map((t) => ({
    content: t.content || "",
    status: t.status || "pending",
    activeForm: t.activeForm || "",
  }));
}

// ============================================================
// Public API
// ============================================================

/**
 * Reset all state (call when switching sessions).
 */
export function resetTaskState() {
  tasks.clear();
  todos = [];
  if (panelEl) panelEl.innerHTML = "";
  updateBadge();
}

/**
 * Get current state for debugging.
 */
export function getTaskState() {
  return { tasks: [...tasks.values()], todos };
}

/**
 * Initialize the task panel DOM.
 * @param {HTMLElement} container
 */
export function initTaskPanel(container) {
  if (panelEl) return; // already initialized
  panelEl = container;
  badgeEl = document.getElementById("task-badge");
  renderPanel();
}

/**
 * Toggle panel visibility.
 */
export function toggleTaskPanel() {
  panelVisible = !panelVisible;
  if (panelEl) {
    panelEl.classList.toggle("hidden", !panelVisible);
    panelEl.classList.toggle("visible", panelVisible);
  }
  // Adjust main content margin
  const sessionContainer = document.querySelector(".session-container");
  if (sessionContainer) {
    sessionContainer.classList.toggle("panel-open", panelVisible);
  }
  // Toggle active state on the nav button
  const toggleBtn = document.getElementById("task-panel-toggle");
  if (toggleBtn) {
    toggleBtn.classList.toggle("active", panelVisible);
  }
}

/**
 * Show the panel.
 */
export function showTaskPanel() {
  if (!panelVisible) toggleTaskPanel();
}

/**
 * Hide the panel.
 */
export function hideTaskPanel() {
  if (panelVisible) toggleTaskPanel();
}

// ============================================================
// Rendering
// ============================================================

function esc(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = String(str);
  return d.innerHTML;
}

function renderPanel() {
  if (!panelEl) return;

  const allTasks = [...tasks.values()];
  const hasTasks = allTasks.length > 0;
  const hasTodos = todos.length > 0;

  if (!hasTasks && !hasTodos) {
    panelEl.innerHTML = `<div class="tp-empty">No tasks or todos yet</div>`;
    return;
  }

  const parts = [];

  // Progress summary
  const totalItems = allTasks.length + todos.length;
  const completedTasks = allTasks.filter((t) => t.status === "completed").length;
  const completedTodos = todos.filter((t) => t.status === "completed").length;
  const completedTotal = completedTasks + completedTodos;
  const pct = totalItems > 0 ? Math.round((completedTotal / totalItems) * 100) : 0;

  parts.push(`
    <div class="tp-progress">
      <div class="tp-progress-bar" style="width:${pct}%"></div>
      <span class="tp-progress-label">${completedTotal}/${totalItems} completed</span>
    </div>
  `);

  // V2 Tasks section
  if (hasTasks) {
    const inProgress = allTasks.filter((t) => t.status === "in_progress").length;
    const pending = allTasks.filter((t) => t.status === "pending").length;
    const completed = allTasks.filter((t) => t.status === "completed").length;
    parts.push(`
      <div class="tp-section">
        <div class="tp-section-header">
          <span class="tp-section-title">Tasks</span>
          <span class="tp-section-stats">
            ${completed}<span class="tp-stat-dim">done</span>
            ${inProgress > 0 ? `${inProgress}<span class="tp-stat-dim">active</span>` : ""}
            ${pending > 0 ? `${pending}<span class="tp-stat-dim">open</span>` : ""}
          </span>
        </div>
        <div class="tp-section-body">
          ${allTasks.map(renderTaskItem).join("")}
        </div>
      </div>
    `);
  }

  // V1 Todos section
  if (hasTodos) {
    const inProgress = todos.filter((t) => t.status === "in_progress").length;
    const pending = todos.filter((t) => t.status === "pending").length;
    const completed = todos.filter((t) => t.status === "completed").length;
    parts.push(`
      <div class="tp-section">
        <div class="tp-section-header">
          <span class="tp-section-title">Todos</span>
          <span class="tp-section-stats">
            ${completed}<span class="tp-stat-dim">done</span>
            ${inProgress > 0 ? `${inProgress}<span class="tp-stat-dim">active</span>` : ""}
            ${pending > 0 ? `${pending}<span class="tp-stat-dim">open</span>` : ""}
          </span>
        </div>
        <div class="tp-section-body">
          ${todos.map(renderTodoItem).join("")}
        </div>
      </div>
    `);
  }

  panelEl.innerHTML = `
    <div class="tp-header">
      <span class="tp-title">Tasks & Todos</span>
      <button class="tp-close-btn" onclick="window.__toggleTaskPanel()">&times;</button>
    </div>
    <div class="tp-body">${parts.join("")}</div>
  `;
}

/**
 * @param {TaskItem} task
 */
function renderTaskItem(task) {
  const icon = statusIcon(task.status);
  const isBlocked = task.blockedBy.length > 0 && task.status !== "completed";
  const cls = [
    "tp-item",
    `tp-status-${task.status}`,
    isBlocked ? "tp-blocked" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <div class="${cls}">
      <span class="tp-item-icon ${icon.cls}">${icon.char}</span>
      <div class="tp-item-content">
        <div class="tp-item-subject">${esc(task.subject)}</div>
        ${task.activeForm && task.status === "in_progress" ? `<div class="tp-item-active">${esc(task.activeForm)}...</div>` : ""}
        ${isBlocked ? `<div class="tp-item-blocked">blocked by ${task.blockedBy.map((id) => `#${esc(id)}`).join(", ")}</div>` : ""}
      </div>
      ${task.owner ? `<span class="tp-item-owner">@${esc(task.owner)}</span>` : ""}
    </div>
  `;
}

/**
 * @param {TodoItem} todo
 */
function renderTodoItem(todo) {
  const icon = statusIcon(todo.status);
  const cls = ["tp-item", `tp-status-${todo.status}`].join(" ");

  return `
    <div class="${cls}">
      <span class="tp-item-icon ${icon.cls}">${icon.char}</span>
      <div class="tp-item-content">
        <div class="tp-item-subject">${esc(todo.content)}</div>
        ${todo.activeForm && todo.status === "in_progress" ? `<div class="tp-item-active">${esc(todo.activeForm)}...</div>` : ""}
      </div>
    </div>
  `;
}

/**
 * @param {string} status
 * @returns {{ char: string, cls: string }}
 */
function statusIcon(status) {
  switch (status) {
    case "completed":
      return { char: "\u2713", cls: "tp-icon-done" };
    case "in_progress":
      return { char: "\u25CF", cls: "tp-icon-active" };
    case "deleted":
      return { char: "\u2717", cls: "tp-icon-deleted" };
    default:
      return { char: "\u25CB", cls: "tp-icon-pending" };
  }
}

function updateBadge() {
  if (!badgeEl) return;
  const total = tasks.size + todos.length;
  if (total > 0) {
    badgeEl.textContent = String(total);
    badgeEl.classList.remove("hidden");
  } else {
    badgeEl.classList.add("hidden");
  }
}
