"use strict";

const AUTH_KEY = "finance_auth";
const SESSION_KEY = "finance_session";
const PASSWORD_ITERATIONS = 210000;
const PIN_ITERATIONS = 120000;
const MAX_PIN_FAILURES = 5;
const PIN_LOCK_MS = 30000;

const authElements = {
  splash: document.querySelector("#splash-screen"), shell: document.querySelector("#auth-shell"), app: document.querySelector("#finance-app"), navigation: document.querySelector("#app-navigation"),
  registerForm: document.querySelector("#register-form"), registerName: document.querySelector("#register-name"), registerLastname: document.querySelector("#register-lastname"), registerPhone: document.querySelector("#register-phone"), registerPassword: document.querySelector("#register-password"), registerConfirm: document.querySelector("#register-confirm"), registerError: document.querySelector("#register-error"),
  pinSetupForm: document.querySelector("#pin-setup-form"), setupPin: document.querySelector("#setup-pin"), setupPinConfirm: document.querySelector("#setup-pin-confirm"), pinSetupError: document.querySelector("#pin-setup-error"),
  loginForm: document.querySelector("#login-form"), loginPhone: document.querySelector("#login-phone"), loginPassword: document.querySelector("#login-password"), loginError: document.querySelector("#login-error"), registerLinkRow: document.querySelector("#register-link-row"),
  unlockPin: document.querySelector("#unlock-pin"), activatePin: document.querySelector("#activate-pin-input"), pinGreeting: document.querySelector("#pin-greeting"), pinError: document.querySelector("#pin-error"),
  profileFullname: document.querySelector("#profile-fullname"), profilePhone: document.querySelector("#profile-phone"),
  passwordModal: document.querySelector("#password-modal"), passwordForm: document.querySelector("#change-password-form"), currentPassword: document.querySelector("#current-password"), newPassword: document.querySelector("#new-password"), newPasswordConfirm: document.querySelector("#new-password-confirm"), passwordError: document.querySelector("#change-password-error"),
  pinModal: document.querySelector("#pin-change-modal"), pinForm: document.querySelector("#change-pin-form"), currentPin: document.querySelector("#current-pin"), newPin: document.querySelector("#new-pin"), newPinConfirm: document.querySelector("#new-pin-confirm"), changePinError: document.querySelector("#change-pin-error"),
  resetModal: document.querySelector("#reset-modal"), resetExplanation: document.querySelector("#reset-explanation"), resetConfirmation: document.querySelector("#reset-confirmation"), resetText: document.querySelector("#reset-confirm-text"), confirmReset: document.querySelector("#confirm-reset")
};

let authData = readJson(AUTH_KEY);
let sessionData = readJson(SESSION_KEY) || { active: false, pinFailures: 0, lockedUntil: 0 };
let pendingRegistration = null;
let pinVerifying = false;
let lockTimer = null;

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); }
  catch (error) { console.warn(`No se pudo leer ${key}.`, error); return null; }
}
function writeJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function bytesToBase64(bytes) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function base64ToBytes(value) { return Uint8Array.from(atob(value), (character) => character.charCodeAt(0)); }
function createSalt() { const salt = new Uint8Array(16); crypto.getRandomValues(salt); return bytesToBase64(salt); }

async function deriveHash(secret, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: base64ToBytes(salt), iterations }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}
async function protectSecret(secret, iterations) { const salt = createSalt(); return { algorithm: "PBKDF2-SHA-256", iterations, salt, hash: await deriveHash(secret, salt, iterations) }; }
async function verifySecret(secret, protectedValue) {
  if (!protectedValue?.hash || !protectedValue?.salt || !protectedValue?.iterations) return false;
  const actual = base64ToBytes(await deriveHash(secret, protectedValue.salt, protectedValue.iterations));
  const expected = base64ToBytes(protectedValue.hash); if (actual.length !== expected.length) return false;
  let difference = 0; for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

function normalizePhone(value) { return value.replace(/[^0-9]/g, ""); }
function validPhone(value) { const digits = normalizePhone(value); return digits.length >= 8 && digits.length <= 15; }
function showAuthScreen(name) {
  document.querySelectorAll("[data-auth-screen]").forEach((screen) => { screen.hidden = screen.dataset.authScreen !== name; });
  authElements.shell.hidden = false; authElements.app.hidden = true; authElements.navigation.hidden = true; document.body.classList.add("auth-locked");
  document.body.classList.toggle("pin-screen-active", name === "pin");
  if (name === "pin") { authElements.pinGreeting.textContent = `Hola, ${authData.profile.nombre}`; authElements.unlockPin.value = ""; updatePinDisplay(authElements.unlockPin); updateLockMessage(); }
  if (name === "login") { authElements.registerLinkRow.hidden = Boolean(authData?.profile); authElements.loginPhone.value = authData?.profile?.celular || ""; requestAnimationFrame(() => authElements.loginPassword.focus()); }
  if (name === "register" && !authElements.registerPhone.value) authElements.registerPhone.value = "+595 ";
}
function unlockFinance() {
  clearInterval(lockTimer); authElements.shell.hidden = true; authElements.app.hidden = false; authElements.navigation.hidden = false; document.body.classList.remove("auth-locked", "pin-screen-active", "auth-unlocking");
  authElements.profileFullname.textContent = `${authData.profile.nombre} ${authData.profile.apellido}`; authElements.profilePhone.textContent = authData.profile.celular;
  window.initializeFinanceApp?.();
}
function showError(element, message) { element.textContent = message; element.hidden = false; }
function clearError(element) { element.textContent = ""; element.hidden = true; }

function updatePinDisplay(input) {
  input.value = input.value.replace(/\D/g, "").slice(0, 4);
  input.closest("[data-pin-entry]").querySelectorAll("span").forEach((dot, index) => dot.classList.toggle("filled", index < input.value.length));
}
function resetPinInputs(container) { container.querySelectorAll("[data-pin-entry] input").forEach((input) => { input.value = ""; updatePinDisplay(input); }); }

async function registerProfile(event) {
  event.preventDefault(); clearError(authElements.registerError);
  const name = authElements.registerName.value.trim(), lastname = authElements.registerLastname.value.trim(), phone = authElements.registerPhone.value.trim(), password = authElements.registerPassword.value;
  if (authData?.profile) return showError(authElements.registerError, "Ya existe un perfil local en este dispositivo.");
  if (!name || !lastname) return showError(authElements.registerError, "Completá tu nombre y apellido.");
  if (!validPhone(phone)) return showError(authElements.registerError, "Ingresá un número de celular válido.");
  if (password.length < 8) return showError(authElements.registerError, "La contraseña debe tener al menos 8 caracteres.");
  if (password !== authElements.registerConfirm.value) return showError(authElements.registerError, "Las contraseñas no coinciden.");
  try {
    pendingRegistration = { profile: { nombre: name, apellido: lastname, celular: phone, creadoEn: new Date().toISOString() }, password: await protectSecret(password, PASSWORD_ITERATIONS) };
    authElements.registerForm.reset(); showAuthScreen("pin-setup");
  } catch (error) { console.error(error); showError(authElements.registerError, "No se pudo proteger la contraseña en este navegador."); }
}

async function saveInitialPin(event) {
  event.preventDefault(); clearError(authElements.pinSetupError); const pin = authElements.setupPin.value;
  if (!pendingRegistration) return showAuthScreen("register");
  if (!/^\d{4}$/.test(pin)) return showError(authElements.pinSetupError, "El PIN debe tener exactamente 4 dígitos.");
  if (pin !== authElements.setupPinConfirm.value) return showError(authElements.pinSetupError, "Los PIN no coinciden.");
  try {
    authData = { version: 1, profile: pendingRegistration.profile, password: pendingRegistration.password, pin: await protectSecret(pin, PIN_ITERATIONS) };
    sessionData = { active: true, pinFailures: 0, lockedUntil: 0, startedAt: new Date().toISOString() }; writeJson(AUTH_KEY, authData); writeJson(SESSION_KEY, sessionData); pendingRegistration = null; resetPinInputs(authElements.pinSetupForm); unlockFinance();
  } catch (error) { console.error(error); showError(authElements.pinSetupError, "No se pudo proteger el PIN en este navegador."); }
}

async function login(event) {
  event.preventDefault(); clearError(authElements.loginError);
  if (!authData?.profile) return showError(authElements.loginError, "Todavía no existe un perfil local.");
  const phoneMatches = normalizePhone(authElements.loginPhone.value) === normalizePhone(authData.profile.celular);
  let passwordMatches = false; try { passwordMatches = await verifySecret(authElements.loginPassword.value, authData.password); } catch (error) { console.error(error); }
  if (!phoneMatches || !passwordMatches) return showError(authElements.loginError, "Número o contraseña incorrectos.");
  sessionData = { active: true, pinFailures: 0, lockedUntil: 0, startedAt: new Date().toISOString() }; writeJson(SESSION_KEY, sessionData); authElements.loginForm.reset(); showAuthScreen("pin");
}

function secondsLocked() { return Math.max(0, Math.ceil((Number(sessionData.lockedUntil) - Date.now()) / 1000)); }
function updateLockMessage() {
  clearInterval(lockTimer); const update = () => { const seconds = secondsLocked(); authElements.unlockPin.disabled = seconds > 0; authElements.activatePin.disabled = seconds > 0; if (seconds > 0) authElements.pinError.textContent = `Intentá nuevamente en ${seconds} s`; else { clearInterval(lockTimer); if (sessionData.lockedUntil) { sessionData.pinFailures = 0; sessionData.lockedUntil = 0; writeJson(SESSION_KEY, sessionData); authElements.pinError.textContent = ""; } } }; update(); if (secondsLocked()) lockTimer = setInterval(update, 250);
}
function animatePinError() { const card = authElements.unlockPin.closest(".auth-card"); card.classList.remove("pin-error-shake"); void card.offsetWidth; card.classList.add("pin-error-shake"); }
async function validateUnlockPin() {
  if (pinVerifying || authElements.unlockPin.value.length !== 4 || secondsLocked()) return;
  pinVerifying = true; const correct = await verifySecret(authElements.unlockPin.value, authData.pin); pinVerifying = false;
  if (correct) { sessionData.pinFailures = 0; sessionData.lockedUntil = 0; writeJson(SESSION_KEY, sessionData); authElements.unlockPin.value = ""; updatePinDisplay(authElements.unlockPin); document.body.classList.add("auth-unlocking"); setTimeout(unlockFinance, 190); return; }
  sessionData.pinFailures = (Number(sessionData.pinFailures) || 0) + 1;
  if (sessionData.pinFailures >= MAX_PIN_FAILURES) sessionData.lockedUntil = Date.now() + PIN_LOCK_MS;
  writeJson(SESSION_KEY, sessionData); authElements.unlockPin.value = ""; updatePinDisplay(authElements.unlockPin); authElements.pinError.textContent = sessionData.lockedUntil ? "" : "PIN incorrecto. Intentá nuevamente."; animatePinError(); updateLockMessage();
}

function logout() {
  if (!confirm("¿Querés cerrar sesión en FINANCE?")) return;
  sessionData = { active: false, pinFailures: 0, lockedUntil: 0 }; writeJson(SESSION_KEY, sessionData); location.reload();
}
function openModal(modal) { modal.hidden = false; document.body.classList.add("modal-open"); }
function closeModal(modal) { modal.hidden = true; document.body.classList.remove("modal-open"); }

async function changePassword(event) {
  event.preventDefault(); clearError(authElements.passwordError); const next = authElements.newPassword.value;
  if (!await verifySecret(authElements.currentPassword.value, authData.password)) return showError(authElements.passwordError, "La contraseña actual es incorrecta.");
  if (next.length < 8) return showError(authElements.passwordError, "La nueva contraseña debe tener al menos 8 caracteres.");
  if (next !== authElements.newPasswordConfirm.value) return showError(authElements.passwordError, "Las nuevas contraseñas no coinciden.");
  authData.password = await protectSecret(next, PASSWORD_ITERATIONS); writeJson(AUTH_KEY, authData); authElements.passwordForm.reset(); closeModal(authElements.passwordModal); alert("Contraseña actualizada.");
}
async function changePin(event) {
  event.preventDefault(); clearError(authElements.changePinError); const next = authElements.newPin.value;
  if (!/^\d{4}$/.test(authElements.currentPin.value) || !await verifySecret(authElements.currentPin.value, authData.pin)) return showError(authElements.changePinError, "El PIN actual es incorrecto.");
  if (!/^\d{4}$/.test(next)) return showError(authElements.changePinError, "El nuevo PIN debe tener exactamente 4 dígitos.");
  if (next !== authElements.newPinConfirm.value) return showError(authElements.changePinError, "Los nuevos PIN no coinciden.");
  authData.pin = await protectSecret(next, PIN_ITERATIONS); writeJson(AUTH_KEY, authData); resetPinInputs(authElements.pinForm); closeModal(authElements.pinModal); alert("PIN actualizado.");
}

const eyeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
document.querySelectorAll("[data-toggle-password]").forEach((button) => { button.innerHTML = eyeIcon; button.addEventListener("click", () => { const input = document.getElementById(button.dataset.togglePassword); const show = input.type === "password"; input.type = show ? "text" : "password"; button.setAttribute("aria-label", show ? "Ocultar contraseña" : "Mostrar contraseña"); }); });
document.querySelectorAll("[data-pin-entry] input").forEach((input) => input.addEventListener("input", () => { updatePinDisplay(input); if (input === authElements.unlockPin) validateUnlockPin(); }));
authElements.activatePin.addEventListener("click", () => { if (!authElements.unlockPin.disabled) authElements.unlockPin.focus(); });
document.querySelectorAll("[data-auth-go]").forEach((button) => button.addEventListener("click", () => { if (button.dataset.authGo === "login" && !authData?.profile) return showError(authElements.registerError, "Todavía no existe un perfil local."); showAuthScreen(button.dataset.authGo); }));
authElements.registerForm.addEventListener("submit", registerProfile); authElements.pinSetupForm.addEventListener("submit", saveInitialPin); authElements.loginForm.addEventListener("submit", login);
document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", logout));
document.querySelector("#change-password-button").addEventListener("click", () => { authElements.passwordForm.reset(); clearError(authElements.passwordError); openModal(authElements.passwordModal); });
document.querySelector("#change-pin-button").addEventListener("click", () => { resetPinInputs(authElements.pinForm); clearError(authElements.changePinError); openModal(authElements.pinModal); });
document.querySelectorAll("[data-close-password]").forEach((button) => button.addEventListener("click", () => closeModal(authElements.passwordModal)));
document.querySelectorAll("[data-close-pin-change]").forEach((button) => button.addEventListener("click", () => closeModal(authElements.pinModal)));
authElements.passwordForm.addEventListener("submit", changePassword); authElements.pinForm.addEventListener("submit", changePin);
document.querySelector("#forgot-password").addEventListener("click", () => { authElements.resetExplanation.hidden = false; authElements.resetConfirmation.hidden = true; authElements.resetText.value = ""; authElements.confirmReset.disabled = true; openModal(authElements.resetModal); });
document.querySelector("#begin-reset").addEventListener("click", () => { authElements.resetExplanation.hidden = true; authElements.resetConfirmation.hidden = false; authElements.resetText.focus(); });
document.querySelectorAll("[data-close-reset]").forEach((button) => button.addEventListener("click", () => closeModal(authElements.resetModal)));
authElements.resetText.addEventListener("input", () => { authElements.confirmReset.disabled = authElements.resetText.value !== "RESTABLECER"; });
authElements.confirmReset.addEventListener("click", () => { if (authElements.resetText.value !== "RESTABLECER") return; Object.keys(localStorage).filter((key) => key.startsWith("finance_")).forEach((key) => localStorage.removeItem(key)); location.reload(); });

if (!globalThis.crypto?.subtle) {
  showAuthScreen("register"); showError(authElements.registerError, "Este navegador no permite proteger las credenciales. Abrí FINANCE mediante HTTPS o Live Server.");
} else if (!authData?.profile) showAuthScreen("register");
else if (!sessionData.active) showAuthScreen("login");
else showAuthScreen("pin");

setTimeout(() => {
  authElements.splash.classList.add("is-leaving");
  const finish = () => { authElements.splash.hidden = true; };
  authElements.splash.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, 450);
}, 1100);
