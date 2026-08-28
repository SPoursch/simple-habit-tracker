"use strict";

/* ---------------------------------------------------------------- storage -- */

const STORAGE_KEY = "habit-tracker/v1";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_SHOWN = 7;

// Built from local date parts. toISOString() would convert to UTC and record the
// wrong day for anyone behind or ahead of UTC near midnight.
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const longDate = (d) =>
  d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

function emptyState() {
  return { version: 1, habits: [] };
}

// The only read of localStorage. Tolerates a missing key, malformed JSON, an
// unknown version, and individually broken habits: anything unusable is dropped
// so a corrupt value can never leave the page blank.
function loadState() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return emptyState();
  }
  if (!raw) return emptyState();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return emptyState();
  }

  if (!parsed || typeof parsed !== "object") return emptyState();
  if (parsed.version !== 1 || !Array.isArray(parsed.habits)) return emptyState();

  const habits = [];
  const seenIds = new Set();
  const today = dateKey(new Date());

  for (const habit of parsed.habits) {
    if (!habit || typeof habit !== "object") continue;
    if (typeof habit.id !== "string" || habit.id === "" || seenIds.has(habit.id)) continue;
    if (typeof habit.name !== "string" || habit.name.trim() === "") continue;

    const completions = Array.isArray(habit.completions)
      ? habit.completions.filter((key) => typeof key === "string" && DATE_KEY_PATTERN.test(key))
      : [];

    seenIds.add(habit.id);
    habits.push({
      id: habit.id,
      name: habit.name,
      createdAt: typeof habit.createdAt === "string" ? habit.createdAt : today,
      completions: Array.from(new Set(completions)).sort()
    });
  }

  return { version: 1, habits };
}

// The only write to localStorage. Returns false instead of throwing when storage
// is unavailable or full, so the caller can tell the user their data is at risk.
function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ state -- */

let state = loadState();

// Ids stay in the h_<milliseconds> shape. The counter guarantees uniqueness for
// habits added within the same millisecond, and seeding it from the ids already
// in storage keeps a reload from reusing one.
let lastIdStamp = state.habits.reduce((max, habit) => {
  const stamp = Number(habit.id.slice(2));
  return Number.isFinite(stamp) && stamp > max ? stamp : max;
}, 0);

function makeId() {
  const stamp = Math.max(Date.now(), lastIdStamp + 1);
  lastIdStamp = stamp;
  return `h_${stamp}`;
}

/* --------------------------------------------------------------- elements -- */

const todayLabel = document.getElementById("today-label");
const addForm = document.getElementById("add-form");
const nameInput = document.getElementById("habit-name");
const notice = document.getElementById("notice");
const gridWrap = document.getElementById("grid-wrap");
const gridHead = document.getElementById("grid-head");
const habitRows = document.getElementById("habit-rows");
const emptyStateMessage = document.getElementById("empty-state");

/* ---------------------------------------------------------------- notices -- */

function showNotice(message) {
  notice.textContent = message;
  notice.hidden = false;
}

function clearNotice() {
  notice.textContent = "";
  notice.hidden = true;
}

// Persist after every mutation, and say so plainly if the write failed.
function persist() {
  if (saveState(state)) {
    clearNotice();
  } else {
    showNotice("Could not save. Your habits may be gone when you refresh this page.");
  }
}

/* ------------------------------------------------------------------- days -- */

// The visible columns, oldest first and ending today. Stepping from midday keeps
// a daylight-saving changeover from pushing a date onto the neighbouring day.
function recentDays(count) {
  const anchor = new Date();
  anchor.setHours(12, 0, 0, 0);

  const days = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const day = new Date(anchor);
    day.setDate(anchor.getDate() - back);
    days.push(day);
  }
  return days;
}

/* -------------------------------------------------------------- rendering -- */

function buildHeadRow(days, todayKey) {
  const corner = document.createElement("th");
  corner.scope = "col";
  corner.className = "grid__corner";
  corner.textContent = "Habit";

  const dayHeads = days.map((day) => {
    const isToday = dateKey(day) === todayKey;

    const head = document.createElement("th");
    head.scope = "col";
    head.className = isToday ? "grid__day grid__day--today" : "grid__day";
    if (isToday) head.setAttribute("aria-current", "date");

    const weekday = document.createElement("span");
    weekday.className = "grid__weekday";
    weekday.textContent = day.toLocaleDateString(undefined, { weekday: "short" });

    const number = document.createElement("span");
    number.className = "grid__daynum";
    number.textContent = String(day.getDate());

    head.append(weekday, number);
    return head;
  });

  const actions = document.createElement("th");
  actions.scope = "col";
  const actionsLabel = document.createElement("span");
  actionsLabel.className = "sr-only";
  actionsLabel.textContent = "Actions";
  actions.append(actionsLabel);

  return [corner, ...dayHeads, actions];
}

function buildHabitRow(habit, days, todayKey) {
  const row = document.createElement("tr");
  row.className = "habit";
  row.dataset.id = habit.id;

  // textContent, never innerHTML, so a name containing < or & renders literally.
  const name = document.createElement("th");
  name.scope = "row";
  name.className = "habit__name";
  name.textContent = habit.name;
  row.append(name);

  for (const day of days) {
    const key = dateKey(day);
    const isDone = habit.completions.includes(key);
    const isToday = key === todayKey;

    const cell = document.createElement("td");
    cell.className = isToday ? "grid__cell grid__cell--today" : "grid__cell";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "day";
    toggle.dataset.action = "toggle";
    toggle.dataset.id = habit.id;
    toggle.dataset.date = key;
    toggle.setAttribute("aria-pressed", String(isDone));
    toggle.setAttribute("aria-label", `${habit.name} on ${longDate(day)}`);
    if (isDone) toggle.textContent = "✓";

    cell.append(toggle);
    row.append(cell);
  }

  const actions = document.createElement("td");
  actions.className = "grid__actions";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "habit__delete";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = habit.id;
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute("aria-label", `Delete habit: ${habit.name}`);

  actions.append(deleteButton);
  row.append(actions);

  return row;
}

// State is the single source of truth: every change mutates state, persists, then
// redraws the grid from scratch.
function render() {
  const days = recentDays(DAYS_SHOWN);
  const today = days[days.length - 1];
  const todayKey = dateKey(today);

  todayLabel.textContent = `Today, ${longDate(today)}`;

  gridHead.replaceChildren(...buildHeadRow(days, todayKey));
  habitRows.replaceChildren(
    ...state.habits.map((habit) => buildHabitRow(habit, days, todayKey))
  );

  // A lone header row over nothing reads as a glitch, so the whole grid gives way
  // to the empty state.
  const hasHabits = state.habits.length > 0;
  gridWrap.hidden = !hasHabits;
  emptyStateMessage.hidden = hasHabits;
}

/* ---------------------------------------------------------------- actions -- */

function addHabit(rawName) {
  const name = rawName.trim();
  if (name === "") {
    showNotice("Give the habit a name first.");
    return false;
  }

  state.habits.push({
    id: makeId(),
    name,
    createdAt: dateKey(new Date()),
    completions: []
  });

  persist();
  render();
  return true;
}

// Completion is read from state, never from the button, so the stored data decides
// what is true and the re-render puts the cell back in sync.
function toggleCompletion(id, key) {
  if (!DATE_KEY_PATTERN.test(key)) return;

  const habit = state.habits.find((candidate) => candidate.id === id);
  if (!habit) return;

  if (habit.completions.includes(key)) {
    habit.completions = habit.completions.filter((completed) => completed !== key);
  } else {
    habit.completions = [...habit.completions, key].sort();
  }

  persist();
  render();
}

function deleteHabit(id) {
  const remaining = state.habits.filter((habit) => habit.id !== id);
  if (remaining.length === state.habits.length) return;

  state.habits = remaining;
  persist();
  render();
}

/* ----------------------------------------------------------------- events -- */

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (addHabit(nameInput.value)) {
    nameInput.value = "";
  }
  nameInput.focus();
});

// Delegated from the table body, so rows redrawn by render() need no rebinding.
habitRows.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  if (button.dataset.action === "toggle") {
    toggleCompletion(button.dataset.id, button.dataset.date);
  } else if (button.dataset.action === "delete") {
    deleteHabit(button.dataset.id);
  }
});

render();
