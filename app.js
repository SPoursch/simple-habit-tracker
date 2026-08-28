"use strict";

/* ---------------------------------------------------------------- storage -- */

const STORAGE_KEY = "habit-tracker/v1";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Built from local date parts. toISOString() would convert to UTC and record the
// wrong day for anyone behind or ahead of UTC near midnight.
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
const habitList = document.getElementById("habit-list");
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

/* -------------------------------------------------------------- rendering -- */

function buildHabitItem(habit, today) {
  const isDone = habit.completions.includes(today);

  const item = document.createElement("li");
  item.className = isDone ? "habit habit--done" : "habit";
  item.dataset.id = habit.id;

  const label = document.createElement("label");
  label.className = "habit__label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "habit__checkbox";
  checkbox.checked = isDone;
  checkbox.dataset.action = "toggle";
  checkbox.dataset.id = habit.id;

  // textContent, never innerHTML, so a name containing < or & renders literally.
  const name = document.createElement("span");
  name.className = "habit__name";
  name.textContent = habit.name;

  label.append(checkbox, name);

  const status = document.createElement("span");
  status.className = "habit__status";
  status.textContent = isDone ? "Done today" : "Not done";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "habit__delete";
  deleteButton.dataset.action = "delete";
  deleteButton.dataset.id = habit.id;
  deleteButton.textContent = "Delete";
  deleteButton.setAttribute("aria-label", `Delete habit: ${habit.name}`);

  item.append(label, status, deleteButton);
  return item;
}

// State is the single source of truth: every change mutates state, persists, then
// redraws the list from scratch.
function render() {
  const today = new Date();
  const todayKey = dateKey(today);

  todayLabel.textContent = `Today, ${today.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long"
  })}`;

  habitList.replaceChildren(
    ...state.habits.map((habit) => buildHabitItem(habit, todayKey))
  );
  emptyStateMessage.hidden = state.habits.length > 0;
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

// Completion is read from state, never from the checkbox, so the stored data
// decides what is true and the re-render puts the checkbox back in sync.
function toggleCompletion(id) {
  const habit = state.habits.find((candidate) => candidate.id === id);
  if (!habit) return;

  const todayKey = dateKey(new Date());
  if (habit.completions.includes(todayKey)) {
    habit.completions = habit.completions.filter((key) => key !== todayKey);
  } else {
    habit.completions = [...habit.completions, todayKey].sort();
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

// Delegated from the list, so rows redrawn by render() need no rebinding.
habitList.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.action === "toggle") {
    toggleCompletion(target.dataset.id);
  }
});

habitList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='delete']");
  if (button) {
    deleteHabit(button.dataset.id);
  }
});

render();
