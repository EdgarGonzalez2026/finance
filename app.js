"use strict";

const STORAGE_KEY = "finance_movimientos";

const categories = {
  gasto: ["Alimentación", "Transporte", "Combustible", "Servicios", "Suscripciones", "Compras", "Deudas", "Regalos", "Salud", "Otros"],
  ingreso: ["Salario", "Devolución", "Extra", "Otros"]
};

const elements = {
  balance: document.querySelector("#balance"),
  incomeTotal: document.querySelector("#income-total"),
  expenseTotal: document.querySelector("#expense-total"),
  count: document.querySelector("#movement-count"),
  list: document.querySelector("#movements-list"),
  modal: document.querySelector("#movement-modal"),
  newButton: document.querySelector("#new-movement-button"),
  form: document.querySelector("#movement-form"),
  amount: document.querySelector("#amount"),
  category: document.querySelector("#category"),
  description: document.querySelector("#description"),
  date: document.querySelector("#date"),
  error: document.querySelector("#form-error")
};

let movements = loadMovements();

function loadMovements() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    console.warn("No se pudieron cargar los movimientos guardados.", error);
    return [];
  }
}

function saveMovements() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(movements));
}

function formatGuaranies(amount) {
  return `Gs. ${Math.round(amount).toLocaleString("es-PY")}`;
}

function formatDate(dateValue) {
  const [year, month, day] = dateValue.split("-");
  return `${day}/${month}/${year}`;
}

function getToday() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function calculateSummary() {
  return movements.reduce((summary, movement) => {
    if (movement.tipo === "ingreso") summary.income += Number(movement.monto);
    if (movement.tipo === "gasto") summary.expense += Number(movement.monto);
    return summary;
  }, { income: 0, expense: 0 });
}

function renderSummary() {
  const { income, expense } = calculateSummary();
  elements.incomeTotal.textContent = formatGuaranies(income);
  elements.expenseTotal.textContent = formatGuaranies(expense);
  elements.balance.textContent = formatGuaranies(income - expense);
}

function createMovementElement(movement) {
  const item = document.createElement("article");
  const isIncome = movement.tipo === "ingreso";
  const kind = isIncome ? "income" : "expense";
  const description = movement.descripcion.trim() || movement.categoria;

  item.className = "movement-item";

  const icon = document.createElement("div");
  icon.className = `movement-icon ${kind}`;
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = isIncome ? "↑" : "↓";

  const info = document.createElement("div");
  info.className = "movement-info";
  const title = document.createElement("strong");
  title.textContent = description;
  const metadata = document.createElement("span");
  metadata.textContent = `${movement.categoria} · ${formatDate(movement.fecha)}`;
  info.append(title, metadata);

  const side = document.createElement("div");
  side.className = "movement-side";
  const amount = document.createElement("span");
  amount.className = `movement-amount ${kind}`;
  amount.textContent = `${isIncome ? "+" : "−"} ${formatGuaranies(movement.monto)}`;
  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Eliminar";
  deleteButton.setAttribute("aria-label", `Eliminar movimiento ${description}`);
  deleteButton.addEventListener("click", () => deleteMovement(movement.id));
  side.append(amount, deleteButton);

  item.append(icon, info, side);
  return item;
}

function renderMovements() {
  elements.list.replaceChildren();
  elements.count.textContent = String(movements.length);

  if (movements.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = '<div class="empty-icon" aria-hidden="true">↕</div><strong>Todavía no registraste movimientos.</strong><p>Agregá tu primer gasto o ingreso.</p>';
    elements.list.append(empty);
    return;
  }

  [...movements]
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn))
    .forEach((movement) => elements.list.append(createMovementElement(movement)));
}

function renderApp() {
  renderSummary();
  renderMovements();
}

function updateCategories() {
  const type = elements.form.elements.type.value;
  elements.category.replaceChildren(...categories[type].map((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    return option;
  }));
}

function openModal() {
  elements.form.reset();
  elements.form.elements.type.value = "gasto";
  elements.date.value = getToday();
  elements.error.hidden = true;
  updateCategories();
  elements.modal.hidden = false;
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => elements.amount.focus());
}

function closeModal() {
  elements.modal.hidden = true;
  document.body.classList.remove("modal-open");
  elements.newButton.focus();
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function addMovement(event) {
  event.preventDefault();
  const type = elements.form.elements.type.value;
  const amount = Number(elements.amount.value);
  const category = elements.category.value;
  const date = elements.date.value;

  if (!type || !categories[type]) return showError("Seleccioná un tipo de movimiento válido.");
  if (!Number.isFinite(amount) || amount <= 0) return showError("Ingresá un monto mayor que cero.");
  if (!Number.isInteger(amount)) return showError("El monto debe ser un número entero de guaraníes.");
  if (!category || !categories[type].includes(category)) return showError("Seleccioná una categoría válida.");
  if (!date) return showError("Seleccioná una fecha.");

  movements.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    tipo: type,
    monto: amount,
    categoria: category,
    descripcion: elements.description.value.trim(),
    fecha: date,
    creadoEn: new Date().toISOString()
  });

  saveMovements();
  renderApp();
  closeModal();
}

function deleteMovement(id) {
  if (!window.confirm("¿Seguro que deseas eliminar este movimiento?")) return;
  movements = movements.filter((movement) => movement.id !== id);
  saveMovements();
  renderApp();
}

elements.newButton.addEventListener("click", openModal);
elements.form.addEventListener("submit", addMovement);
elements.form.addEventListener("input", () => { elements.error.hidden = true; });
elements.form.querySelectorAll('input[name="type"]').forEach((input) => input.addEventListener("change", updateCategories));
elements.modal.querySelectorAll("[data-close-modal]").forEach((element) => element.addEventListener("click", closeModal));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.modal.hidden) closeModal();
});

renderApp();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("No se pudo registrar el Service Worker.", error);
    });
  });
}
