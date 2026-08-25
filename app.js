"use strict";

const MOVEMENTS_KEY = "finance_movimientos";
const ACCOUNTS_KEY = "finance_cuentas";
const GENERAL_ACCOUNT_NAME = "Cuenta general";
const categories = {
  gasto: ["Alimentación", "Transporte", "Combustible", "Servicios", "Suscripciones", "Compras", "Deudas", "Regalos", "Salud", "Otros"],
  ingreso: ["Salario", "Devolución", "Extra", "Otros"]
};
const paymentMethods = {
  gasto: ["Efectivo", "Débito", "Crédito", "QR", "Transferencia", "Otro"],
  ingreso: ["Transferencia", "Efectivo", "Depósito", "Otro"]
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const elements = {
  balance: $("#balance"), incomeTotal: $("#income-total"), expenseTotal: $("#expense-total"),
  count: $("#movement-count"), list: $("#movements-list"), allList: $("#all-movements-list"), accountCards: $("#account-cards"), accountsList: $("#accounts-list"),
  movementModal: $("#movement-modal"), movementForm: $("#movement-form"), movementTitle: $("#modal-title"), newMovement: $("#new-movement-button"),
  amount: $("#amount"), category: $("#category"), categoryField: $("#category-field"), account: $("#account"), accountLabel: $("#account-label"), destination: $("#destination-account"), destinationField: $("#destination-field"), payment: $("#payment-method"), paymentField: $("#payment-field"), description: $("#description"), date: $("#date"), time: $("#time"), formError: $("#form-error"),
  accountModal: $("#account-modal"), accountForm: $("#account-form"), accountModalTitle: $("#account-modal-title"), accountName: $("#account-name"), accountType: $("#account-type"), initialBalance: $("#initial-balance"), accountActive: $("#account-active"), accountError: $("#account-error"),
  filterForm: $("#filters-form"), filterFrom: $("#filter-from"), filterTo: $("#filter-to"), filterType: $("#filter-type"), filterAccount: $("#filter-account"), filterCategory: $("#filter-category"), filterPayment: $("#filter-payment"), filterSearch: $("#filter-search"),
  periodIncome: $("#period-income"), periodExpense: $("#period-expense"), periodResult: $("#period-result"), periodCount: $("#period-count"), statementEmpty: $("#statement-empty"), statementDesktop: $("#statement-desktop"), statementMobile: $("#statement-mobile"), statementBody: $("#statement-table-body"),
  exportModal: $("#export-modal"), exportChoice: $("#export-choice"), exportPreview: $("#export-preview"), confirmExport: $("#confirm-export"), previewPeriod: $("#preview-period"), previewGenerated: $("#preview-generated"), previewFilters: $("#preview-filters"), previewSummary: $("#preview-summary"), previewBody: $("#preview-body")
};

let movements = loadArray(MOVEMENTS_KEY);
let accounts = loadArray(ACCOUNTS_KEY);
let editingMovementId = null;
let editingAccountId = null;
let exportFormat = null;
let filteredStatement = [];

function loadArray(key) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) ? value : []; }
  catch (error) { console.warn(`No se pudo leer ${key}.`, error); return []; }
}

function uniqueId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function saveMovements() { localStorage.setItem(MOVEMENTS_KEY, JSON.stringify(movements)); }
function saveAccounts() { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts)); }

function migrateData() {
  const withoutAccount = movements.filter((movement) => !movement.cuentaId);
  if (!accounts.length || withoutAccount.length) {
    let general = accounts.find((account) => account.nombre === GENERAL_ACCOUNT_NAME);
    if (!general) {
      general = { id: uniqueId(), nombre: GENERAL_ACCOUNT_NAME, tipo: "otro", saldoInicial: 0, activa: true, creadoEn: new Date().toISOString() };
      accounts.push(general);
      saveAccounts();
    }
    if (withoutAccount.length) {
      movements = movements.map((movement) => movement.cuentaId ? movement : { ...movement, cuentaId: general.id });
      saveMovements();
    }
  }
}

function formatGuaranies(value) { return `Gs. ${Math.round(Number(value) || 0).toLocaleString("es-PY")}`; }
function formatDate(value) { if (!value) return "—"; const [y, m, d] = value.split("-"); return `${d}/${m}/${y}`; }
function formatShortDate(value) { if (!value) return "—"; const date = new Date(`${value}T12:00:00`); return `${String(date.getDate()).padStart(2,"0")} ${date.toLocaleString("es-PY", { month: "short" }).replace(".", "").toUpperCase()}`; }
function getToday() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function getCurrentTime() { return new Date().toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false }); }
function reliableTime(movement) {
  if (/^\d{2}:\d{2}$/.test(movement.hora || "")) return movement.hora;
  if (!movement.creadoEn) return "—";
  const date = new Date(movement.creadoEn);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function accountName(id) { return accounts.find((account) => account.id === id)?.nombre || "Cuenta no disponible"; }
function typeLabel(type) { return ({ gasto: "Gasto", ingreso: "Ingreso", transferencia: "Transferencia" })[type] || type; }
function movementDescription(movement) { return movement.descripcion?.trim() || (movement.tipo === "transferencia" ? "Transferencia interna" : movement.categoria || "Movimiento"); }
function accountDisplay(movement) { return movement.tipo === "transferencia" ? `${accountName(movement.cuentaId)} → ${accountName(movement.cuentaDestinoId)}` : accountName(movement.cuentaId); }
function movementSignedAmount(movement) { return movement.tipo === "gasto" ? -Number(movement.monto) : movement.tipo === "ingreso" ? Number(movement.monto) : Number(movement.monto); }

function sortMovements(list, ascending = false) {
  return [...list].sort((a, b) => {
    const direction = ascending ? 1 : -1;
    return direction * (a.fecha.localeCompare(b.fecha) || reliableTime(a).localeCompare(reliableTime(b)) || String(a.creadoEn || "").localeCompare(String(b.creadoEn || "")));
  });
}

function calculateAccountBalances() {
  const balances = new Map(accounts.map((account) => [account.id, Number(account.saldoInicial) || 0]));
  for (const movement of movements) {
    const amount = Number(movement.monto) || 0;
    if (movement.tipo === "ingreso") balances.set(movement.cuentaId, (balances.get(movement.cuentaId) || 0) + amount);
    if (movement.tipo === "gasto") balances.set(movement.cuentaId, (balances.get(movement.cuentaId) || 0) - amount);
    if (movement.tipo === "transferencia") {
      balances.set(movement.cuentaId, (balances.get(movement.cuentaId) || 0) - amount);
      balances.set(movement.cuentaDestinoId, (balances.get(movement.cuentaDestinoId) || 0) + amount);
    }
  }
  return balances;
}

function calculateRunningBalances() {
  const balances = new Map(accounts.map((account) => [account.id, Number(account.saldoInicial) || 0]));
  const after = new Map();
  for (const movement of sortMovements(movements, true)) {
    const amount = Number(movement.monto) || 0;
    if (movement.tipo === "ingreso") balances.set(movement.cuentaId, (balances.get(movement.cuentaId) || 0) + amount);
    if (movement.tipo === "gasto") balances.set(movement.cuentaId, (balances.get(movement.cuentaId) || 0) - amount);
    if (movement.tipo === "transferencia") {
      balances.set(movement.cuentaId, (balances.get(movement.cuentaId) || 0) - amount);
      balances.set(movement.cuentaDestinoId, (balances.get(movement.cuentaDestinoId) || 0) + amount);
      after.set(movement.id, null);
    } else after.set(movement.id, balances.get(movement.cuentaId));
  }
  return after;
}

function calculateSummary(list = movements) {
  return list.reduce((summary, movement) => {
    if (movement.tipo === "ingreso") summary.income += Number(movement.monto);
    if (movement.tipo === "gasto") summary.expense += Number(movement.monto);
    return summary;
  }, { income: 0, expense: 0 });
}

function renderSummary() {
  const { income, expense } = calculateSummary();
  const totalBalance = [...calculateAccountBalances().values()].reduce((sum, value) => sum + value, 0);
  elements.balance.textContent = formatGuaranies(totalBalance);
  elements.incomeTotal.textContent = formatGuaranies(income);
  elements.expenseTotal.textContent = formatGuaranies(expense);
}

function createMovementElement(movement) {
  const item = document.createElement("article");
  const kind = movement.tipo === "ingreso" ? "income" : movement.tipo === "gasto" ? "expense" : "transfer";
  item.className = `movement-item ${kind}`;
  const icon = document.createElement("div"); icon.className = `movement-icon ${kind}`; icon.textContent = movement.tipo === "ingreso" ? "↑" : movement.tipo === "gasto" ? "↓" : "⇄"; icon.setAttribute("aria-hidden", "true");
  const info = document.createElement("div"); info.className = "movement-info";
  const title = document.createElement("strong"); title.textContent = movementDescription(movement);
  const metadata = document.createElement("span"); metadata.textContent = `${accountDisplay(movement)} · ${formatDate(movement.fecha)} · ${reliableTime(movement)}`; info.append(title, metadata);
  const side = document.createElement("div"); side.className = "movement-side";
  const amount = document.createElement("span"); amount.className = `movement-amount ${kind}`; amount.textContent = `${movement.tipo === "ingreso" ? "+" : movement.tipo === "gasto" ? "−" : ""} ${formatGuaranies(movement.monto)}`;
  const actions = document.createElement("div"); actions.className = "movement-actions";
  const edit = document.createElement("button"); edit.type = "button"; edit.className = "edit-button"; edit.textContent = "Editar"; edit.addEventListener("click", () => openMovementModal(movement.id));
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "delete-button"; remove.textContent = "Eliminar"; remove.addEventListener("click", () => deleteMovement(movement.id));
  actions.append(edit, remove); side.append(amount, actions); item.append(icon, info, side); return item;
}

function renderMovementList(container, list) {
  container.replaceChildren();
  if (!list.length) {
    const empty = document.createElement("div"); empty.className = "empty-state"; empty.innerHTML = '<div class="empty-icon" aria-hidden="true">↕</div><strong>Todavía no registraste movimientos.</strong><p>Agregá tu primer gasto, ingreso o transferencia.</p>'; container.append(empty); return;
  }
  const fragment = document.createDocumentFragment();
  sortMovements(list).forEach((movement) => fragment.append(createMovementElement(movement)));
  container.append(fragment);
}

function renderAccounts() {
  const balances = calculateAccountBalances();
  elements.accountCards.replaceChildren();
  accounts.filter((account) => account.activa).forEach((account) => {
    const card = document.createElement("article"); card.className = "account-card";
    const name = document.createElement("span"); name.textContent = account.nombre;
    const balance = document.createElement("strong"); balance.textContent = formatGuaranies(balances.get(account.id)); card.append(name, balance); elements.accountCards.append(card);
  });
  elements.accountsList.replaceChildren();
  accounts.forEach((account) => {
    const row = document.createElement("article"); row.className = `account-row${account.activa ? "" : " inactive"}`;
    const info = document.createElement("div"); const title = document.createElement("h3"); title.textContent = account.nombre;
    const kind = document.createElement("span"); kind.className = "account-kind"; kind.textContent = `${account.tipo[0].toUpperCase()}${account.tipo.slice(1)}${account.activa ? "" : " · Inactiva"}`;
    const balance = document.createElement("p"); balance.textContent = formatGuaranies(balances.get(account.id)); info.append(title, kind, balance);
    const edit = document.createElement("button"); edit.type = "button"; edit.textContent = "Editar"; edit.addEventListener("click", () => openAccountModal(account.id)); row.append(info, edit); elements.accountsList.append(row);
  });
}

function option(value, label = value) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; }
function eligibleAccounts(selectedId = null) { return accounts.filter((account) => account.activa || account.id === selectedId); }
function fillAccountSelect(select, selectedId = null, excludeId = null, includeAll = false) {
  const options = includeAll ? [option("", "Todas")] : [];
  eligibleAccounts(selectedId).filter((account) => account.id !== excludeId).forEach((account) => options.push(option(account.id, account.nombre)));
  select.replaceChildren(...options); if (selectedId) select.value = selectedId;
}

function updateMovementFields(values = {}) {
  const type = elements.movementForm.elements.type.value;
  const transfer = type === "transferencia";
  elements.categoryField.hidden = transfer; elements.destinationField.hidden = !transfer; elements.paymentField.hidden = transfer;
  elements.category.required = !transfer; elements.destination.required = transfer; elements.payment.required = !transfer;
  elements.accountLabel.textContent = transfer ? "Cuenta origen" : "Cuenta";
  elements.category.replaceChildren(...(categories[type] || []).map((name) => option(name)));
  elements.payment.replaceChildren(...(paymentMethods[type] || []).map((name) => option(name)));
  fillAccountSelect(elements.account, values.cuentaId || elements.account.value);
  fillAccountSelect(elements.destination, values.cuentaDestinoId, elements.account.value);
  if (values.categoria) elements.category.value = values.categoria;
  if (values.formaPago) elements.payment.value = values.formaPago;
}

function openMovementModal(id = null) {
  if (!accounts.some((account) => account.activa)) { alert("Creá o activá una cuenta antes de registrar movimientos."); showView("accounts"); return; }
  editingMovementId = id; elements.movementForm.reset(); elements.formError.hidden = true;
  const movement = id ? movements.find((item) => item.id === id) : null;
  elements.movementTitle.textContent = movement ? "Editar movimiento" : "Nuevo movimiento";
  elements.movementForm.elements.type.value = movement?.tipo || "gasto";
  updateMovementFields(movement || {});
  elements.amount.value = movement?.monto || ""; elements.description.value = movement?.descripcion || ""; elements.date.value = movement?.fecha || getToday(); elements.time.value = movement ? (movement.hora || reliableTime(movement).replace("—", "")) : getCurrentTime();
  elements.movementModal.hidden = false; document.body.classList.add("modal-open"); requestAnimationFrame(() => elements.amount.focus());
}
function closeMovementModal() { elements.movementModal.hidden = true; document.body.classList.remove("modal-open"); }
function showFormError(message) { elements.formError.textContent = message; elements.formError.hidden = false; }

function saveMovement(event) {
  event.preventDefault();
  const type = elements.movementForm.elements.type.value, amount = Number(elements.amount.value), accountId = elements.account.value, destinationId = elements.destination.value;
  if (!Number.isInteger(amount) || amount <= 0) return showFormError("Ingresá un monto entero mayor que cero.");
  if (!accountId) return showFormError("Seleccioná una cuenta.");
  if (type === "transferencia" && (!destinationId || destinationId === accountId)) return showFormError("La cuenta destino debe ser diferente de la cuenta origen.");
  if (!elements.date.value || !elements.time.value) return showFormError("Completá la fecha y la hora.");
  if (type !== "transferencia" && (!elements.category.value || !elements.payment.value)) return showFormError("Completá la categoría y la forma de pago.");
  const previous = movements.find((item) => item.id === editingMovementId);
  const record = {
    ...(previous || {}), id: previous?.id || uniqueId(), tipo: type, monto: amount,
    categoria: type === "transferencia" ? null : elements.category.value,
    descripcion: elements.description.value.trim(), fecha: elements.date.value, hora: elements.time.value,
    cuentaId: accountId, cuentaDestinoId: type === "transferencia" ? destinationId : null,
    formaPago: type === "transferencia" ? "Transferencia interna" : elements.payment.value,
    creadoEn: previous?.creadoEn || new Date().toISOString()
  };
  movements = previous ? movements.map((item) => item.id === previous.id ? record : item) : [...movements, record];
  saveMovements(); closeMovementModal(); renderApp();
}
function deleteMovement(id) { if (!confirm("¿Seguro que deseas eliminar este movimiento?")) return; movements = movements.filter((item) => item.id !== id); saveMovements(); renderApp(); }

function openAccountModal(id = null) {
  editingAccountId = id; elements.accountForm.reset(); elements.accountError.hidden = true;
  const account = accounts.find((item) => item.id === id); elements.accountModalTitle.textContent = account ? "Editar cuenta" : "Nueva cuenta";
  elements.accountName.value = account?.nombre || ""; elements.accountType.value = account?.tipo || "banco"; elements.initialBalance.value = account?.saldoInicial ?? 0; elements.accountActive.checked = account?.activa ?? true;
  elements.accountModal.hidden = false; document.body.classList.add("modal-open"); requestAnimationFrame(() => elements.accountName.focus());
}
function closeAccountModal() { elements.accountModal.hidden = true; document.body.classList.remove("modal-open"); }
function saveAccount(event) {
  event.preventDefault(); const name = elements.accountName.value.trim(), initial = Number(elements.initialBalance.value);
  if (!name) { elements.accountError.textContent = "Ingresá un nombre para la cuenta."; elements.accountError.hidden = false; return; }
  if (!Number.isInteger(initial)) { elements.accountError.textContent = "El saldo inicial debe ser un número entero."; elements.accountError.hidden = false; return; }
  const previous = accounts.find((item) => item.id === editingAccountId);
  const record = { ...(previous || {}), id: previous?.id || uniqueId(), nombre: name, tipo: elements.accountType.value, saldoInicial: initial, activa: elements.accountActive.checked, creadoEn: previous?.creadoEn || new Date().toISOString() };
  accounts = previous ? accounts.map((item) => item.id === previous.id ? record : item) : [...accounts, record]; saveAccounts(); closeAccountModal(); renderApp();
}

function statementRows() {
  const from = elements.filterFrom.value, to = elements.filterTo.value, type = elements.filterType.value, accountId = elements.filterAccount.value, category = elements.filterCategory.value, payment = elements.filterPayment.value, query = elements.filterSearch.value.trim().toLocaleLowerCase("es");
  return sortMovements(movements.filter((movement) => {
    const accountMatch = !accountId || movement.cuentaId === accountId || movement.cuentaDestinoId === accountId;
    const searchText = `${movement.descripcion || ""} ${movement.categoria || ""} ${accountDisplay(movement)}`.toLocaleLowerCase("es");
    return (!from || movement.fecha >= from) && (!to || movement.fecha <= to) && (!type || movement.tipo === type) && accountMatch && (!category || movement.categoria === category) && (!payment || movement.formaPago === payment) && (!query || searchText.includes(query));
  }));
}

function renderStatement() {
  filteredStatement = statementRows(); const summary = calculateSummary(filteredStatement), running = calculateRunningBalances();
  elements.periodIncome.textContent = formatGuaranies(summary.income); elements.periodExpense.textContent = formatGuaranies(summary.expense); elements.periodResult.textContent = formatGuaranies(summary.income - summary.expense); elements.periodCount.textContent = String(filteredStatement.length);
  elements.statementEmpty.hidden = filteredStatement.length > 0; elements.statementDesktop.hidden = filteredStatement.length === 0; elements.statementMobile.hidden = filteredStatement.length === 0;
  elements.statementBody.replaceChildren(); elements.statementMobile.replaceChildren(); const tableFragment = document.createDocumentFragment(), mobileFragment = document.createDocumentFragment();
  for (const movement of filteredStatement) {
    const balance = running.get(movement.id), signed = movementSignedAmount(movement), displayAmount = `${movement.tipo === "gasto" ? "− " : movement.tipo === "ingreso" ? "+ " : ""}${formatGuaranies(Math.abs(signed))}`;
    const values = [formatDate(movement.fecha), reliableTime(movement), movementDescription(movement), movement.categoria || "—", accountDisplay(movement), movement.formaPago || "—", typeLabel(movement.tipo), displayAmount, balance == null ? "—" : formatGuaranies(balance)];
    const row = document.createElement("tr"); values.forEach((value, index) => { const cell = document.createElement("td"); cell.textContent = value; if (index === 7) cell.className = "amount-cell"; if (index === 8) cell.className = "balance-cell"; row.append(cell); }); tableFragment.append(row);
    const card = document.createElement("article"); card.className = "statement-card";
    const time = document.createElement("div"); time.className = "statement-card-time"; time.textContent = `${formatShortDate(movement.fecha)} · ${reliableTime(movement)}`;
    const main = document.createElement("div"); main.className = "statement-card-main"; const info = document.createElement("div"); const title = document.createElement("h3"); title.textContent = movementDescription(movement); const meta = document.createElement("p"); meta.textContent = `${movement.categoria || typeLabel(movement.tipo)} · ${movement.formaPago || "—"}`; const acc = document.createElement("p"); acc.textContent = accountDisplay(movement); info.append(title, meta, acc); const amt = document.createElement("span"); amt.className = "card-amount"; amt.textContent = displayAmount; main.append(info, amt); card.append(time, main); if (balance != null) { const bal = document.createElement("p"); bal.className = "card-balance"; bal.textContent = `Saldo: ${formatGuaranies(balance)}`; card.append(bal); } mobileFragment.append(card);
  }
  elements.statementBody.append(tableFragment); elements.statementMobile.append(mobileFragment);
}

function populateFilters() {
  const selectedAccount = elements.filterAccount.value, selectedCategory = elements.filterCategory.value, selectedPayment = elements.filterPayment.value;
  fillAccountSelect(elements.filterAccount, selectedAccount, null, true);
  const allCategories = [...new Set([...categories.gasto, ...categories.ingreso])].sort((a,b) => a.localeCompare(b,"es")); elements.filterCategory.replaceChildren(option("", "Todas"), ...allCategories.map((item) => option(item))); elements.filterCategory.value = selectedCategory;
  const allPayments = [...new Set([...paymentMethods.gasto, ...paymentMethods.ingreso, "Transferencia interna"])]; elements.filterPayment.replaceChildren(option("", "Todas"), ...allPayments.map((item) => option(item))); elements.filterPayment.value = selectedPayment;
}

function resetFilters() {
  const dates = movements.map((item) => item.fecha).filter(Boolean).sort(); elements.filterFrom.value = dates[0] || getToday(); elements.filterTo.value = getToday(); elements.filterType.value = ""; elements.filterAccount.value = ""; elements.filterCategory.value = ""; elements.filterPayment.value = ""; elements.filterSearch.value = ""; renderStatement();
}

function filtersDescription() {
  const values = [];
  if (elements.filterType.value) values.push(`Tipo: ${typeLabel(elements.filterType.value)}`);
  if (elements.filterAccount.value) values.push(`Cuenta: ${accountName(elements.filterAccount.value)}`);
  if (elements.filterCategory.value) values.push(`Categoría: ${elements.filterCategory.value}`);
  if (elements.filterPayment.value) values.push(`Forma de pago: ${elements.filterPayment.value}`);
  if (elements.filterSearch.value.trim()) values.push(`Búsqueda: ${elements.filterSearch.value.trim()}`);
  return values.length ? values.join(" · ") : "Sin filtros adicionales";
}

function openExportModal() {
  if (!filteredStatement.length) return;
  exportFormat = null; elements.exportChoice.hidden = false; elements.exportPreview.hidden = true; elements.exportModal.hidden = false; document.body.classList.add("modal-open");
}
function closeExportModal() { elements.exportModal.hidden = true; document.body.classList.remove("modal-open"); }
function prepareExport(format) {
  exportFormat = format; const summary = calculateSummary(filteredStatement); elements.exportChoice.hidden = true; elements.exportPreview.hidden = false;
  elements.previewPeriod.textContent = `${formatDate(elements.filterFrom.value)} al ${formatDate(elements.filterTo.value)}`; elements.previewGenerated.textContent = `Generado: ${new Date().toLocaleString("es-PY")}`; elements.previewFilters.textContent = filtersDescription();
  elements.previewSummary.innerHTML = [["Ingresos", summary.income], ["Gastos", summary.expense], ["Resultado", summary.income-summary.expense], ["Movimientos", filteredStatement.length]].map(([label,value]) => `<div><span>${label}</span><strong>${label === "Movimientos" ? value : formatGuaranies(value)}</strong></div>`).join("");
  elements.previewBody.replaceChildren(); filteredStatement.forEach((movement) => { const row = document.createElement("tr"); [formatDate(movement.fecha), movementDescription(movement), accountDisplay(movement), typeLabel(movement.tipo), formatGuaranies(movement.monto)].forEach((value) => { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); }); elements.previewBody.append(row); });
  elements.confirmExport.textContent = `Descargar ${format === "excel" ? "Excel" : "PDF"}`;
}
function exportFileName(extension) { return `FINANCE_Extracto_${elements.filterFrom.value}_${elements.filterTo.value}.${extension}`; }

function downloadExcel() {
  if (!window.XLSX || !filteredStatement.length) return alert("No fue posible preparar el archivo Excel.");
  const summary = calculateSummary(filteredStatement), running = calculateRunningBalances();
  const rows = [
    ["FINANCE - Extracto de movimientos"], ["Período", elements.filterFrom.value, "al", elements.filterTo.value], ["Filtros", filtersDescription()],
    ["Ingresos", summary.income, "Gastos", summary.expense, "Resultado", summary.income-summary.expense, "Movimientos", filteredStatement.length], [],
    ["Fecha", "Hora", "Descripción", "Categoría", "Cuenta", "Forma de pago", "Tipo", "Monto", "Saldo"],
    ...filteredStatement.map((movement) => [movement.fecha, reliableTime(movement), movementDescription(movement), movement.categoria || "", accountDisplay(movement), movement.formaPago || "", typeLabel(movement.tipo), movementSignedAmount(movement), running.get(movement.id) ?? null])
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows); sheet["!cols"] = [{wch:12},{wch:8},{wch:28},{wch:18},{wch:26},{wch:22},{wch:16},{wch:16},{wch:16}];
  for (let row = 7; row <= rows.length; row += 1) { if (sheet[`H${row}`]) sheet[`H${row}`].z = "#,##0;[Red]-#,##0"; if (sheet[`I${row}`]) sheet[`I${row}`].z = "#,##0;[Red]-#,##0"; }
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, "Extracto"); XLSX.writeFile(workbook, exportFileName("xlsx"), { compression: true });
}

async function logoDataUrl() {
  const response = await fetch("./icons/icon-192.png");
  const blob = await response.blob();
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
}
async function downloadPdf() {
  if (!window.jspdf?.jsPDF || !filteredStatement.length) return alert("No fue posible preparar el archivo PDF.");
  const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" }), summary = calculateSummary(filteredStatement), running = calculateRunningBalances();
  try { doc.addImage(await logoDataUrl(), "PNG", 14, 10, 14, 14); } catch (_) { /* El título mantiene la identidad si el icono no está disponible. */ }
  doc.setTextColor(23,107,75); doc.setFontSize(18); doc.setFont("helvetica", "bold"); doc.text("FINANCE", 33, 16); doc.setTextColor(70); doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text("Extracto de movimientos", 33, 21);
  doc.setFontSize(8); doc.text(`Periodo: ${formatDate(elements.filterFrom.value)} al ${formatDate(elements.filterTo.value)}`, 14, 29); doc.text(`Generado: ${new Date().toLocaleString("es-PY")}`, 210, 29);
  doc.setFontSize(9); doc.text(`Ingresos: ${formatGuaranies(summary.income)}    Gastos: ${formatGuaranies(summary.expense)}    Resultado: ${formatGuaranies(summary.income-summary.expense)}    Movimientos: ${filteredStatement.length}`, 14, 36); doc.setFontSize(7); doc.text(filtersDescription(), 14, 41);
  const body = filteredStatement.map((movement) => [formatDate(movement.fecha), reliableTime(movement), movementDescription(movement), movement.categoria || "-", accountDisplay(movement).replace("→", "->"), movement.formaPago || "-", typeLabel(movement.tipo), String(Math.round(movementSignedAmount(movement))).replace(/\B(?=(\d{3})+(?!\d))/g,"."), running.get(movement.id) == null ? "-" : String(Math.round(running.get(movement.id))).replace(/\B(?=(\d{3})+(?!\d))/g,".")]);
  doc.autoTable({ startY: 45, head: [["Fecha","Hora","Descripcion","Categoria","Cuenta","Forma de pago","Tipo","Monto","Saldo"]], body, theme: "plain", styles: { fontSize: 6.5, cellPadding: 2.1, textColor: [35,45,39], lineColor: [224,232,227], lineWidth: { bottom: .15 } }, headStyles: { fillColor: [23,107,75], textColor: 255, fontStyle: "bold" }, columnStyles: { 7: { halign: "right" }, 8: { halign: "right" } }, didDrawPage() { doc.setFontSize(7); doc.setTextColor(120); doc.text("FINANCE · Control financiero personal", 14, 202); } });
  const total = doc.getNumberOfPages(); for (let page = 1; page <= total; page += 1) { doc.setPage(page); doc.setTextColor(120); doc.setFontSize(7); doc.text(`Pagina ${page} de ${total}`, 277, 202, { align: "right" }); }
  doc.save(exportFileName("pdf"));
}

function showView(name) {
  $$(".app-view").forEach((view) => { const active = view.dataset.view === name; view.hidden = !active; view.classList.toggle("active", active); });
  $$("[data-nav]").forEach((button) => button.classList.toggle("active", button.dataset.nav === name));
  if (name === "statement") renderStatement(); window.scrollTo({ top: 0, behavior: "smooth" });
}
function renderApp() {
  renderSummary(); renderMovementList(elements.list, sortMovements(movements).slice(0, 8)); renderMovementList(elements.allList, movements); elements.count.textContent = String(movements.length); renderAccounts(); populateFilters(); renderStatement();
}

migrateData();
elements.newMovement.addEventListener("click", () => openMovementModal()); $$('[data-new-movement]').forEach((button) => button.addEventListener("click", () => openMovementModal()));
elements.movementForm.addEventListener("submit", saveMovement); elements.movementForm.addEventListener("input", () => { elements.formError.hidden = true; });
elements.movementForm.querySelectorAll('[name="type"]').forEach((input) => input.addEventListener("change", () => updateMovementFields()));
elements.account.addEventListener("change", () => fillAccountSelect(elements.destination, null, elements.account.value));
$$('[data-close-modal]').forEach((item) => item.addEventListener("click", closeMovementModal));
$("#new-account-button").addEventListener("click", () => openAccountModal()); elements.accountForm.addEventListener("submit", saveAccount); $$('[data-close-account]').forEach((item) => item.addEventListener("click", closeAccountModal));
$$('[data-nav]').forEach((button) => button.addEventListener("click", () => showView(button.dataset.nav)));
elements.filterForm.addEventListener("input", renderStatement); $("#clear-filters").addEventListener("click", resetFilters); $("#download-button").addEventListener("click", openExportModal); $$('[data-close-export]').forEach((item) => item.addEventListener("click", closeExportModal)); $$('[data-export-format]').forEach((button) => button.addEventListener("click", () => prepareExport(button.dataset.exportFormat)));
elements.confirmExport.addEventListener("click", () => exportFormat === "excel" ? downloadExcel() : downloadPdf());
document.addEventListener("keydown", (event) => { if (event.key !== "Escape") return; if (!elements.movementModal.hidden) closeMovementModal(); else if (!elements.accountModal.hidden) closeAccountModal(); else if (!elements.exportModal.hidden) closeExportModal(); });
populateFilters(); resetFilters(); renderApp();

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch((error) => console.warn("No se pudo registrar el Service Worker.", error)));
