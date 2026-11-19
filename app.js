import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, collection, addDoc, setDoc, getDoc, onSnapshot,
  updateDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));
const SCALE = ["0", "1", "2", "3", "5", "8", "13", "21", "?", "☕"];
const MAX_PARTICIPANTS = 30;
const root = document.querySelector("#app");
let unsubscribers = [];
let currentState = null;

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));

const randomId = (length = 8) => {
  const alphabet = "abcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
};

const cleanup = () => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  unsubscribers = [];
};

function route() {
  cleanup();
  currentState = null;
  const match = location.hash.match(/^#\/s\/([a-z0-9]+)$/);
  if (match) renderSession(match[1]);
  else renderHome();
}

function renderHome() {
  root.innerHTML = `
    <section class="card">
      <h1>Nowa sesja</h1>
      <form id="create-form" class="stack">
        <label>Nazwa sesji
          <input name="name" required maxlength="80" placeholder="Sprint 42 – planning">
        </label>
        <label>Liczba uczestników
          <input id="count" type="number" min="1" max="${MAX_PARTICIPANTS}" value="4" required>
        </label>
        <div id="names" class="names"></div>
        <button type="submit">Utwórz sesję</button>
      </form>
    </section>`;

  const countInput = document.querySelector("#count");
  const namesBox = document.querySelector("#names");

  const renderNameInputs = () => {
    const count = Math.min(MAX_PARTICIPANTS, Math.max(1, parseInt(countInput.value, 10) || 1));
    const previous = [...namesBox.querySelectorAll("input")].map((i) => i.value);
    namesBox.innerHTML = Array.from({ length: count }, (_, i) =>
      `<input name="p${i + 1}" required maxlength="40" placeholder="Imię uczestnika ${i + 1}" value="${esc(previous[i] ?? "")}">`
    ).join("");
  };

  countInput.addEventListener("input", renderNameInputs);
  renderNameInputs();

  document.querySelector("#create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.elements.name.value.trim();
    const participants = {};
    [...namesBox.querySelectorAll("input")].forEach((input, i) => {
      participants[`p${i + 1}`] = { name: input.value.trim(), claimedBy: false };
    });

    const id = randomId();
    await setDoc(doc(db, "sessions", id), {
      name, createdAt: serverTimestamp(), activeTaskId: null, participants
    });
    localStorage.setItem(`pp:host:${id}`, "1");
    location.hash = `#/s/${id}`;
  });
}

async function renderSession(sid) {
  root.innerHTML = `<p class="muted">Ładowanie sesji…</p>`;
  const sessionRef = doc(db, "sessions", sid);
  const snapshot = await getDoc(sessionRef);
  if (!snapshot.exists()) {
    root.innerHTML = `<section class="card"><h1>Nie znaleziono sesji</h1><a href="#">Wróć do strony głównej</a></section>`;
    return;
  }

  const isHost = localStorage.getItem(`pp:host:${sid}`) === "1";
  const state = { session: null, tasks: [], sid, isHost };
  currentState = state;

  root.innerHTML = `
    <section class="card">
      <div class="session-head">
        <div>
          <h1 id="session-name"></h1>
          <p class="muted">Link do udostępnienia: <code>${esc(location.href)}</code></p>
        </div>
        <div class="row">
          ${isHost ? `<button type="button" data-action="export-csv" class="secondary">Eksport CSV</button>
          <button type="button" data-action="export-json" class="secondary">Eksport JSON</button>` : ""}
          <button type="button" data-action="switch-user" class="ghost">Zmień uczestnika</button>
        </div>
      </div>
      <div id="board"></div>
    </section>
    ${isHost ? `
    <section class="card">
      <h2>Zadania</h2>
      <form id="task-form" class="row">
        <input name="title" required maxlength="200" placeholder="Opis zadania / user story">
        <button type="submit">Dodaj zadanie</button>
      </form>
      <div id="tasks"></div>
    </section>` : `
    <section class="card">
      <h2>Zadania</h2>
      <div id="tasks"></div>
    </section>`}`;

  root.querySelector("#task-form")?.addEventListener("submit", (e) => addTask(e, state));

  unsubscribers.push(onSnapshot(sessionRef, (snap) => {
    state.session = snap.data();
    document.querySelector("#session-name").textContent = state.session?.name ?? "";
    render(state);
  }));

  unsubscribers.push(onSnapshot(collection(sessionRef, "tasks"), (snap) => {
    state.tasks = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    render(state);
  }));
}

function render(state) {
  if (!state.session) return;
  const { session, tasks, isHost } = state;
  const me = localStorage.getItem(`pp:me:${state.sid}`);
  const participants = session.participants ?? {};
  const active = tasks.find((t) => t.id === session.activeTaskId);

  document.querySelector("#board").innerHTML = !me
    ? renderClaim(participants)
    : `<p class="muted">Jesteś: <strong>${esc(participants[me]?.name ?? "?")}</strong></p>` +
      (active ? renderActiveTask(active, participants, me, isHost) : `<p class="muted">Brak aktywnego zadania.${isHost ? " Dodaj zadanie poniżej." : " Czekaj na prowadzącego."}</p>`);

  document.querySelector("#tasks").innerHTML = tasks.length
    ? tasks.map((t) => renderTaskRow(t, session.activeTaskId, isHost)).join("")
    : `<p class="muted">Brak zadań.</p>`;
}

function renderClaim(participants) {
  const rows = Object.entries(participants).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  return `<h2>Wybierz swoje imię</h2>
    <div class="grid">${rows.map(([slot, p]) => `
      <button type="button" class="${p.claimedBy ? "ghost" : ""}" ${p.claimedBy ? "disabled" : ""}
        data-action="claim" data-slot="${esc(slot)}">${esc(p.name)}${p.claimedBy ? " (zajęte)" : ""}</button>`).join("")}
    </div>`;
}

function renderActiveTask(task, participants, me, isHost) {
  const votes = task.votes ?? {};
  const revealed = task.status === "revealed";
  const myVote = votes[me];
  const cards = SCALE.map((v) =>
    `<button type="button" class="card-value ${myVote === v ? "selected" : ""}" data-action="vote" data-value="${v}"
      ${revealed ? "disabled" : ""}>${v}</button>`).join("");

  const votesList = Object.entries(participants).map(([slot, p]) => {
    const value = votes[slot];
    const shown = revealed ? (value ?? "—") : (value !== undefined ? "✔" : "…");
    return `<li><span>${esc(p.name)}</span><span class="vote">${esc(shown)}</span></li>`;
  }).join("");

  const stats = revealed ? computeStats(votes) : null;
  const hostControls = isHost ? `
    <div class="row host-controls">
      ${revealed
        ? `<button type="button" data-action="reset">Nowa runda</button>`
        : `<button type="button" data-action="reveal">Odsłoń karty</button>`}
      <form data-role="final-form" class="row">
        <input name="final" placeholder="Ostateczna estymata" maxlength="20" value="${esc(task.finalEstimate ?? "")}">
        <button type="submit" class="secondary">Zapisz wynik</button>
      </form>
    </div>` : "";

  return `
    <div class="active-task">
      <h2>${esc(task.title)}</h2>
      <div class="cards">${cards}</div>
      ${stats ? `<p class="stats">Średnia: <strong>${stats.avg ?? "—"}</strong> · Min: ${stats.min ?? "—"} · Max: ${stats.max ?? "—"} · ${stats.consensus ? "✅ konsensus" : "❗ rozbieżność"}</p>` : ""}
      <ul class="votes">${votesList}</ul>
      ${hostControls}
    </div>`;
}

function renderTaskRow(task, activeId, isHost) {
  const badge = task.finalEstimate ? `<span class="badge">${esc(task.finalEstimate)}</span>` : "";
  const status = { voting: "głosowanie", revealed: "odsłonięte", done: "zakończone" }[task.status] ?? task.status;
  return `<div class="task-row ${task.id === activeId ? "active" : ""}">
    <div><strong>${esc(task.title)}</strong> <span class="muted">${status}</span> ${badge}</div>
    ${isHost && task.id !== activeId ? `<button type="button" class="ghost" data-action="activate" data-task="${esc(task.id)}">Aktywuj</button>` : ""}
  </div>`;
}

function computeStats(votes) {
  const all = Object.values(votes);
  const numeric = all.map(Number).filter((n) => !Number.isNaN(n));
  const avg = numeric.length ? (numeric.reduce((a, b) => a + b, 0) / numeric.length).toFixed(1) : null;
  return {
    avg,
    min: numeric.length ? Math.min(...numeric) : null,
    max: numeric.length ? Math.max(...numeric) : null,
    consensus: all.length > 0 && all.every((v) => v === all[0])
  };
}

async function handleBoardClick(event, state) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const sessionRef = doc(db, "sessions", state.sid);
  const me = localStorage.getItem(`pp:me:${state.sid}`);
  const active = state.tasks.find((t) => t.id === state.session.activeTaskId);

  switch (button.dataset.action) {
    case "claim": {
      const slot = button.dataset.slot;
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sessionRef);
        const claimed = snap.data().participants[slot].claimedBy;
        if (claimed) throw new Error("already-claimed");
        tx.update(sessionRef, { [`participants.${slot}.claimedBy`]: true });
      }).then(() => localStorage.setItem(`pp:me:${state.sid}`, slot))
        .catch(() => alert("To imię zostało już wybrane przez kogoś innego."));
      return;
    }
    case "vote":
      if (active && active.status === "voting") {
        await updateDoc(doc(db, "sessions", state.sid, "tasks", active.id), {
          [`votes.${me}`]: button.dataset.value
        });
      }
      return;
    case "reveal":
      if (active) await updateDoc(doc(db, "sessions", state.sid, "tasks", active.id), { status: "revealed" });
      return;
    case "reset":
      if (active) await updateDoc(doc(db, "sessions", state.sid, "tasks", active.id), { status: "voting", votes: {}, finalEstimate: null });
      return;
    case "activate":
      await updateDoc(sessionRef, { activeTaskId: button.dataset.task });
      return;
  }
}

async function handleHeaderClick(event, state) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "switch-user") {
    const me = localStorage.getItem(`pp:me:${state.sid}`);
    if (me) {
      await updateDoc(doc(db, "sessions", state.sid), { [`participants.${me}.claimedBy`]: false });
      localStorage.removeItem(`pp:me:${state.sid}`);
    }
  } else if (button.dataset.action === "export-csv") {
    download(`${state.session.name}.csv`, toCsv(state), "text/csv");
  } else if (button.dataset.action === "export-json") {
    download(`${state.session.name}.json`, JSON.stringify(toExport(state), null, 2), "application/json");
  }
}

root.addEventListener("click", (event) => {
  if (!currentState) return;
  if (event.target.closest("#board")) handleBoardClick(event, currentState);
  else handleHeaderClick(event, currentState);
});

document.addEventListener("submit", async (event) => {
  if (event.target.dataset.role !== "final-form") return;
  event.preventDefault();
  const sid = location.hash.split("/")[2];
  const value = event.target.elements.final.value.trim();
  const sessionRef = doc(db, "sessions", sid);
  const snap = await getDoc(sessionRef);
  const activeId = snap.data()?.activeTaskId;
  if (activeId) {
    await updateDoc(doc(db, "sessions", sid, "tasks", activeId), { finalEstimate: value, status: "done" });
  }
});

async function addTask(event, state) {
  event.preventDefault();
  const input = event.currentTarget.elements.title;
  const title = input.value.trim();
  if (!title) return;
  const ref = await addDoc(collection(db, "sessions", state.sid, "tasks"), {
    title, status: "voting", votes: {}, finalEstimate: null, order: Date.now()
  });
  if (!state.session.activeTaskId) {
    await updateDoc(doc(db, "sessions", state.sid), { activeTaskId: ref.id });
  }
  input.value = "";
}

function toExport(state) {
  const participants = state.session.participants ?? {};
  return {
    session: state.session.name,
    exportedAt: new Date().toISOString(),
    participants: Object.entries(participants).map(([slot, p]) => ({ slot, name: p.name })),
    tasks: state.tasks.map((t) => ({
      title: t.title,
      status: t.status,
      finalEstimate: t.finalEstimate ?? null,
      votes: Object.fromEntries(Object.entries(t.votes ?? {}).map(([slot, v]) => [participants[slot]?.name ?? slot, v]))
    }))
  };
}

function toCsv(state) {
  const data = toExport(state);
  const names = data.participants.map((p) => p.name);
  const header = ["Zadanie", "Status", "Estymata", ...names];
  const rows = data.tasks.map((t) =>
    [t.title, t.status, t.finalEstimate ?? "", ...names.map((n) => t.votes[n] ?? "")]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

window.addEventListener("hashchange", route);
route();
