import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  reauthenticateWithPopup,
  getMultiFactorResolver,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const $ = (id) => document.getElementById(id);
const ALLOWED_EMAIL = "noelechonromualdo@gmail.com";
const BRANDING_KEY = "personal-vault-branding:v1";
const VAULT_SESSION_KEY = "vault-session:v1";
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const DEFAULT_BRANDING = {
  logoText: "PV",
  logoImage: "",
  titleText: "NOEL ECHON ROMUALDO PERSONAL VAULT SYSTEM",
  taglineText: "My Secure Personal Data Management Solution",
  subtitleText: "Google login, encrypted cloud storage, and master-password vault protection for your important personal accounts.",
  titlePosition: "center",
};

const state = {
  app: null,
  auth: null,
  db: null,
  provider: null,
  user: null,
  cloudContainer: null,
  masterPassword: "",
  vault: null,
  dataKey: null,
  recovery: null,
  pendingRecovery: null,
  visiblePasswords: new Set(),
  signInResolver: null,
  signInVerificationId: "",
  enrollVerificationId: "",
  recaptcha: null,
  typingTimer: null,
  cloudListenerUnsubscribe: null,
  cloudUpdateTime: 0,
  branding: { ...DEFAULT_BRANDING },
  clockInterval: null,
  inactivityTimer: null,
  currentDevice: null,
  devicesList: [],
};

// Device Detection Functions
function detectDevice() {
  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = /android/.test(ua);
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isTablet = /ipad|android(?!.*mobi)|tablet/.test(ua);
  const isPhone = /iphone|android.*mobi/.test(ua);
  
  let deviceType = "Desktop";
  if (isPhone) deviceType = "Mobile Phone";
  else if (isTablet) deviceType = "Tablet";
  
  const osMatch = ua.match(/(windows|mac|linux|android|iphone|ipad)/i);
  const os = osMatch ? osMatch[1].charAt(0).toUpperCase() + osMatch[1].slice(1) : "Unknown";
  
  const browserMatch = ua.match(/(chrome|safari|firefox|edge|opera|brave)/i);
  const browser = browserMatch ? browserMatch[1].charAt(0).toUpperCase() + browserMatch[1].slice(1) : "Unknown";
  
  const timestamp = new Date().toISOString();
  const deviceId = `${deviceType}-${Math.random().toString(36).substr(2, 9)}`;
  
  return {
    deviceId,
    deviceType,
    os,
    browser,
    userAgent: navigator.userAgent,
    loginTime: timestamp,
    lastActive: timestamp,
  };
}

async function saveDeviceLogin() {
  if (!state.user || !state.currentDevice) return;
  
  try {
    const deviceRef = doc(state.db, "device_logins", state.user.uid);
    const docSnap = await getDoc(deviceRef);
    let devices = docSnap.exists() ? docSnap.data().devices || [] : [];
    
    // Check if device already exists
    const existingIndex = devices.findIndex(d => d.deviceId === state.currentDevice.deviceId);
    if (existingIndex >= 0) {
      devices[existingIndex].lastActive = new Date().toISOString();
      devices[existingIndex].loginTime = state.currentDevice.loginTime;
    } else {
      devices.push(state.currentDevice);
    }
    
    // Keep only last 10 devices
    devices = devices.slice(-10);
    
    await setDoc(deviceRef, {
      userId: state.user.uid,
      devices,
      lastUpdated: serverTimestamp(),
    });
    
    state.devicesList = devices;
  } catch (error) {
    console.error("Failed to save device login:", error);
  }
}

async function loadDeviceLogins() {
  if (!state.user) return;
  
  try {
    const deviceRef = doc(state.db, "device_logins", state.user.uid);
    const docSnap = await getDoc(deviceRef);
    if (docSnap.exists()) {
      state.devicesList = docSnap.data().devices || [];
    }
  } catch (error) {
    console.error("Failed to load device logins:", error);
  }
}

// Greeting and Time Functions
function getGreetingMessage() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return "Good Morning";
  } else if (hour >= 12 && hour < 17) {
    return "Good Afternoon";
  } else if (hour >= 17 && hour < 21) {
    return "Good Evening";
  } else {
    return "Good Night";
  }
}

function formatCurrentDate() {
  const date = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

function updateClock() {
  const now = new Date();
  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hours12 = String(hours).padStart(2, '0');
  
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  
  const timeEl = $("clockTime");
  const dateEl = $("clockDate");
  
  if (timeEl) timeEl.textContent = `${hours12}:${minutes}:${seconds} ${ampm}`;
  if (dateEl) dateEl.textContent = `${month}/${day}/${year}`;
}

function initializeClock() {
  // Update immediately
  updateClock();
  // Update every second
  if (state.clockInterval) clearInterval(state.clockInterval);
  state.clockInterval = setInterval(updateClock, 1000);
}

function updateWelcomeGreeting() {
  const greeting = getGreetingMessage();
  const date = formatCurrentDate();
  const welcomeEl = $("welcomeGreeting");
  const dateEl = $("welcomeDate");
  
  if (welcomeEl) welcomeEl.textContent = `${greeting}, Master Noel!`;
  if (dateEl) dateEl.textContent = date;
}

function showSuccessOverlay(title = `Hello, Master Noel!`, subtitle = getGreetingMessage()) {
  const overlay = $("successOverlay");
  const greetingEl = $("greetingText");
  const subtextEl = $("greetingSubtext");
  
  if (greetingEl) greetingEl.textContent = title;
  if (subtextEl) subtextEl.textContent = subtitle;
  
  if (overlay) {
    overlay.classList.remove("hide");
    setTimeout(() => {
      overlay.classList.add("hide");
    }, 2500);
  }
}

// Session Management Functions
function saveVaultSession() {
  const sessionData = {
    timestamp: Date.now(),
    masterPassword: state.masterPassword,
    dataKeyBase64: state.dataKey ? bytesToBase64(state.dataKey) : null,
    vaultData: state.vault ? JSON.stringify(state.vault) : null,
    recoveryData: state.recovery ? JSON.stringify(state.recovery) : null,
    userId: state.user?.uid || null,
  };
  sessionStorage.setItem(VAULT_SESSION_KEY, JSON.stringify(sessionData));
}

function restoreVaultSession() {
  try {
    const stored = sessionStorage.getItem(VAULT_SESSION_KEY);
    if (!stored) return false;
    
    const sessionData = JSON.parse(stored);
    
    // Check if session is still valid (not expired beyond a day)
    if (Date.now() - sessionData.timestamp > 24 * 60 * 60 * 1000) {
      sessionStorage.removeItem(VAULT_SESSION_KEY);
      return false;
    }
    
    // Check if user ID matches
    if (sessionData.userId !== (state.user?.uid || null)) {
      sessionStorage.removeItem(VAULT_SESSION_KEY);
      return false;
    }
    
    state.masterPassword = sessionData.masterPassword;
    state.dataKey = sessionData.dataKeyBase64 ? base64ToBytes(sessionData.dataKeyBase64) : null;
    state.vault = sessionData.vaultData ? JSON.parse(sessionData.vaultData) : null;
    state.recovery = sessionData.recoveryData ? JSON.parse(sessionData.recoveryData) : null;
    
    return true;
  } catch (error) {
    console.error("Failed to restore vault session:", error);
    sessionStorage.removeItem(VAULT_SESSION_KEY);
    return false;
  }
}

function resetInactivityTimer() {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
  }
  
  // Only set timer if vault is unlocked
  if (state.vault) {
    state.inactivityTimer = setTimeout(() => {
      console.log("Inactivity timeout - logging out");
      lockVault();
      setStatus("gateStatus", "Logged out due to inactivity.", "good");
    }, INACTIVITY_TIMEOUT);
  }
}

function setupInactivityDetection() {
  const activityEvents = ["mousedown", "keydown", "touchstart", "click", "scroll"];
  
  activityEvents.forEach((event) => {
    document.addEventListener(event, resetInactivityTimer, true);
  });
  
  // Initial timer setup
  resetInactivityTimer();
}

function clearInactivityTimer() {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
    state.inactivityTimer = null;
  }
}

function startTypingTitle() {
  const target = $("typingText");
  if (!target) return;
  const text = target.dataset.typing || "";
  let index = 0;
  target.textContent = "";
  if (state.typingTimer) {
    window.clearInterval(state.typingTimer);
  }
  state.typingTimer = window.setInterval(() => {
    if (index <= text.length) {
      target.textContent = text.slice(0, index);
      index += 1;
      return;
    }
    if (index < text.length + 18) {
      index += 1;
      return;
    }
    index = 0;
    target.textContent = "";
  }, 195);
}

function loadBranding() {
  try {
    const saved = JSON.parse(localStorage.getItem(BRANDING_KEY) || "{}");
    state.branding = { ...DEFAULT_BRANDING, ...saved };
  } catch {
    state.branding = { ...DEFAULT_BRANDING };
  }
}

function saveBranding() {
  localStorage.setItem(BRANDING_KEY, JSON.stringify(state.branding));
}

function applyBranding() {
  const brand = state.branding;
  document.title = brand.titleText;
  document.querySelectorAll(".brand-mark").forEach((mark) => {
    mark.textContent = brand.logoText || DEFAULT_BRANDING.logoText;
    mark.classList.toggle("has-image", Boolean(brand.logoImage));
    mark.style.backgroundImage = brand.logoImage ? `url("${brand.logoImage}")` : "";
  });
  $("typingText").dataset.typing = brand.titleText || DEFAULT_BRANDING.titleText;
  $("landingTagline").textContent = brand.taglineText || DEFAULT_BRANDING.taglineText;
  $("landingSubtitle").textContent = brand.subtitleText || DEFAULT_BRANDING.subtitleText;
  $("signInScreen").classList.toggle("position-top", brand.titlePosition === "top");
  $("signInScreen").classList.toggle("position-center", brand.titlePosition !== "top");
  $("previewTitle").textContent = brand.titleText || DEFAULT_BRANDING.titleText;
  $("previewSubtitle").textContent = brand.taglineText || DEFAULT_BRANDING.taglineText;
  updateMiniLogo(brand.logoText, brand.logoImage);
  startTypingTitle();
}

function fillAppearanceForm() {
  $("brandLogoText").value = state.branding.logoText;
  $("brandLogoFile").value = "";
  $("brandTitleText").value = state.branding.titleText;
  $("brandTaglineText").value = state.branding.taglineText;
  $("brandSubtitleText").value = state.branding.subtitleText;
  $("brandTitlePosition").value = state.branding.titlePosition;
  updateMiniLogo(state.branding.logoText, state.branding.logoImage);
}

function collectAppearanceForm() {
  return {
    logoText: $("brandLogoText").value.trim().slice(0, 6) || DEFAULT_BRANDING.logoText,
    logoImage: state.branding.logoImage || "",
    titleText: $("brandTitleText").value.trim() || DEFAULT_BRANDING.titleText,
    taglineText: $("brandTaglineText").value.trim() || DEFAULT_BRANDING.taglineText,
    subtitleText: $("brandSubtitleText").value.trim() || DEFAULT_BRANDING.subtitleText,
    titlePosition: $("brandTitlePosition").value === "top" ? "top" : "center",
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function updateMiniLogo(text, image) {
  const mark = document.querySelector(".mini-hero .brand-mark");
  if (!mark) return;
  mark.textContent = text || DEFAULT_BRANDING.logoText;
  mark.classList.toggle("has-image", Boolean(image));
  mark.style.backgroundImage = image ? `url("${image}")` : "";
}

function configReady() {
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("PASTE_");
}

function showOnly(id) {
  ["setupScreen", "signInScreen", "vaultGate", "appScreen"].forEach((screen) => {
    $(screen).classList.toggle("hide", screen !== id);
  });
}

function setStatus(id, text, kind = "") {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `status ${kind}`.trim();
}

function setGateMode(mode) {
  const recoveryMode = mode === "recovery";
  $("unlockForm").classList.toggle("hide", recoveryMode);
  $("forgotMasterPanel").classList.toggle("hide", !recoveryMode);
  setStatus("gateStatus", "");
  setStatus("recoveryGateStatus", "");
}

function updateGateControls() {
  const hasVault = Boolean(state.cloudContainer);
  $("createBtn").classList.toggle("hide", hasVault);
  $("confirmMasterGroup").classList.toggle("hide", hasVault);
  $("forgotMasterBtn").classList.toggle("hide", !hasVault);
}

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptVault(vault, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const payload = encoder.encode(JSON.stringify(vault));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, payload);
  return {
    version: 2,
    app: "personal-account-vault-cloud",
    encryptedAt: new Date().toISOString(),
    kdf: { name: "PBKDF2", hash: "SHA-256", iterations: 310000 },
    cipher: "AES-GCM",
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  };
}

async function decryptVault(container, password) {
  const salt = base64ToBytes(container.salt);
  const iv = base64ToBytes(container.iv);
  const data = base64ToBytes(container.data);
  const key = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
  return JSON.parse(decoder.decode(decrypted));
}

async function importAesKey(rawKey) {
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptWithDataKey(vault, rawKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(rawKey);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(JSON.stringify(vault))
  );
  return {
    cipher: "AES-GCM",
    iv: bytesToBase64(iv),
    data: bytesToBase64(encrypted),
  };
}

async function decryptWithDataKey(container, rawKey) {
  const key = await importAesKey(rawKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(container.iv) },
    key,
    base64ToBytes(container.data)
  );
  return JSON.parse(decoder.decode(decrypted));
}

function blankVault() {
  return {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    entries: [],
  };
}

function vaultRef() {
  return doc(state.db, "vaults", state.user.uid);
}

async function loadCloudVault() {
  const snapshot = await getDoc(vaultRef());
  const data = snapshot.exists() ? snapshot.data() : null;
  state.cloudContainer = data?.container || null;
  state.cloudUpdateTime = data?.updatedAt?.toMillis?.() || 0;
  state.recovery = state.cloudContainer?.recovery || data?.recovery || null;
  $("cloudStatus").textContent = state.cloudContainer
    ? "Cloud vault found. Enter your master password."
    : "No cloud vault yet. Create one with a new master password.";
  setGateMode("unlock");
  updateGateControls();
  updateRecoveryStatus();
}

async function saveCloudVault() {
  try {
    // Validate vault before saving
    if (!state.vault || !Array.isArray(state.vault.entries)) {
      throw new Error("Vault data is corrupted - entries missing");
    }
    
    state.vault.updatedAt = new Date().toISOString();
    if (state.dataKey) {
      state.cloudContainer = {
        version: 3,
        app: "personal-account-vault-cloud",
        encryptedAt: new Date().toISOString(),
        keyWrap: await encryptVault({ dataKey: bytesToBase64(state.dataKey) }, state.masterPassword),
        recovery: state.recovery || null,
        vaultData: await encryptWithDataKey(state.vault, state.dataKey),
      };
    } else {
      state.cloudContainer = await encryptVault(state.vault, state.masterPassword);
    }
    
    // Verify container before uploading
    console.log("Saving vault with", state.vault.entries.length, "entries");
    
    await setDoc(vaultRef(), {
      owner: state.user.uid,
      ownerEmail: state.user.email || "",
      updatedAt: serverTimestamp(),
      container: state.cloudContainer,
    });
    saveVaultSession();
    render();
    setStatus("syncStatus", "Saved to encrypted cloud vault.", "good");
  } catch (error) {
    console.error("saveCloudVault error:", error);
    throw error;
  }
}

function watchCloudVault() {
  if (typeof state.cloudListenerUnsubscribe === "function") {
    state.cloudListenerUnsubscribe();
  }
  if (!state.user || !state.db) return;

  state.cloudListenerUnsubscribe = onSnapshot(vaultRef(), async (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    const container = data?.container || null;
    const updatedAt = data?.updatedAt?.toMillis?.();
    
    if (!container) return;
    
    // Skip if this is the same container we just saved
    if (state.cloudUpdateTime && updatedAt && updatedAt === state.cloudUpdateTime) {
      return;
    }
    
    // Only decrypt if we have masterPassword and are viewing the app
    if (!state.masterPassword) return;
    
    try {
      let newVault = null;
      if (container.version === 3) {
        const wrapped = await decryptVault(container.keyWrap, state.masterPassword);
        const dataKey = base64ToBytes(wrapped.dataKey);
        newVault = await decryptWithDataKey(container.vaultData, dataKey);
      } else {
        newVault = await decryptVault(container, state.masterPassword);
      }
      
      // Only update if entries actually changed
      if (JSON.stringify(state.vault?.entries || []) !== JSON.stringify(newVault?.entries || [])) {
        state.vault = newVault;
        state.cloudUpdateTime = updatedAt;
        render();
        setStatus("syncStatus", "Vault updated from another device.", "good");
      }
    } catch (error) {
      console.error("Realtime vault update failed:", error);
      // Don't show error to user - just log it
    }
  }, (error) => {
    console.warn("Realtime vault listener error:", error);
  });
}

function uid() {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36)}`;
}

function generatedPassword(length = 28) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function generateRecoveryCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .match(/.{1,6}/g)
    .join("-");
}

function base32Encode(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = value.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let current = 0;
  const bytes = [];
  for (const char of clean) {
    current = (current << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((current >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

async function totpCode(secret, counter) {
  const key = await crypto.subtle.importKey(
    "raw",
    base32Decode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setUint32(4, counter);
  const hmac = new Uint8Array(await crypto.subtle.sign("HMAC", key, buffer));
  const offset = hmac[hmac.length - 1] & 15;
  const binary = ((hmac[offset] & 127) << 24)
    | (hmac[offset + 1] << 16)
    | (hmac[offset + 2] << 8)
    | hmac[offset + 3];
  return String(binary % 1000000).padStart(6, "0");
}

async function verifyTotp(secret, code) {
  const clean = String(code || "").replace(/\D/g, "");
  const counter = Math.floor(Date.now() / 30000);
  for (const drift of [-1, 0, 1]) {
    if (await totpCode(secret, counter + drift) === clean) return true;
  }
  return false;
}

async function ensureDataKey() {
  if (!state.dataKey) {
    state.dataKey = crypto.getRandomValues(new Uint8Array(32));
  }
}

function updateRecoveryStatus() {
  const text = state.recovery
    ? `Recovery enabled on ${new Date(state.recovery.enabledAt).toLocaleString()}.`
    : "Recovery is not set up yet.";
  if ($("recoveryStatusText")) $("recoveryStatusText").textContent = text;
}

async function renderTotpQr(secret) {
  const label = encodeURIComponent(`Personal Vault:${ALLOWED_EMAIL}`);
  const issuer = encodeURIComponent("Personal Vault");
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
  $("totpManualKey").value = secret.match(/.{1,4}/g).join(" ");
  const canvas = $("totpQr");
  if (window.QRCode?.toCanvas) {
    await window.QRCode.toCanvas(canvas, uri, { width: 190, margin: 1 });
  }
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function normalizeWebsiteForFavicon(website) {
  const raw = String(website || "").trim();
  if (!raw) return "";

  // If user typed "example.com" convert to https://example.com
  if (!/^https?:\/\//i.test(raw)) {
    return `https://${raw.replace(/^\/+/, "")}`;
  }

  return raw;
}

function getFaviconUrl(website) {
  const normalized = normalizeWebsiteForFavicon(website);
  if (!normalized) return "";

  // Use Google favicon service (no API key, predictable URLs)
  // Example: https://www.google.com/s2/favicons?domain=example.com
  try {
    const url = new URL(normalized);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}`;
  } catch {
    return "";
  }
}

function migrateFavicons() {
  if (!state.vault?.entries) return;
  let hasChanges = false;
  for (const entry of state.vault.entries) {
    if (entry.website && (!entry.favicon || !entry.favicon.includes('google.com/s2/favicons'))) {
      entry.favicon = getFaviconUrl(entry.website);
      hasChanges = true;
    }
  }
  if (hasChanges) {
    // Mark vault as updated for next save
    state.vault.updatedAt = new Date().toISOString();
  }
}


function findById(id) {
  return state.vault.entries.find((entry) => entry.id === id);
}

function formEntry() {
  const existing = $("entryId").value ? findById($("entryId").value) : null;
  const website = $("website").value.trim();
  const favicon = website ? getFaviconUrl(website) : "";
  return {
    id: $("entryId").value || uid(),
    label: $("label").value.trim(),
    category: $("category").value,
    website: website,
    favicon: favicon,
    username: $("username").value.trim(),
    email: $("email").value.trim(),
    password: $("password").value,
    recoveryEmail: $("recoveryEmail").value.trim(),
    phone: $("phone").value.trim(),
    notes: $("notes").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function fillForm(entry = {}) {
  $("entryId").value = entry.id || "";
  $("label").value = entry.label || "";
  $("category").value = entry.category || "Social";
  $("website").value = entry.website || "";
  $("username").value = entry.username || "";
  $("email").value = entry.email || "";
  $("password").value = entry.password || "";
  $("recoveryEmail").value = entry.recoveryEmail || "";
  $("phone").value = entry.phone || "";
  $("notes").value = entry.notes || "";
  $("formTitle").textContent = entry.id ? "Edit Entry" : "New Entry";
  setStatus("entryStatus", entry.id ? "Editing" : "");
}

function clearForm() {
  $("entryForm").reset();
  $("entryId").value = "";
  $("category").value = "Social";
  $("formTitle").textContent = "New Entry";
  setStatus("entryStatus", "");
}

function filteredEntries() {
  if (!state.vault || !Array.isArray(state.vault.entries)) {
    return [];
  }
  const query = $("search").value.trim().toLowerCase();
  const category = $("categoryFilter").value;
  return state.vault.entries.filter((entry) => {
    const haystack = [
      entry.label,
      entry.category,
      entry.website,
      entry.username,
      entry.email,
      entry.recoveryEmail,
      entry.phone,
      entry.notes,
    ].join(" ").toLowerCase();
    return (!category || entry.category === category) && (!query || haystack.includes(query));
  });
}

function render() {
  if (!state.vault || !Array.isArray(state.vault.entries)) {
    console.warn("Vault not loaded or entries missing");
    return;
  }
  const entries = filteredEntries().sort((a, b) => a.label.localeCompare(b.label));
  $("emptyState").classList.toggle("hide", entries.length > 0);
  $("entriesTable").innerHTML = entries.map((entry) => {
    const login = entry.email || entry.username || "";
    const visible = state.visiblePasswords.has(entry.id);
    const password = visible ? escapeHtml(entry.password) : "********";
    const faviconHtml = entry.favicon ? `<img src="${escapeHtml(entry.favicon)}" alt="" class="entry-favicon" onerror="this.style.display='none'">` : "";
    return `
      <tr>
        <td>
          <div class="account-cell">
            ${faviconHtml}
            <div>
              <strong>${escapeHtml(entry.label)}</strong><br>
              <span class="status">${escapeHtml(entry.website)}</span>
            </div>
          </div>
        </td>
        <td><span class="pill">${escapeHtml(entry.category)}</span></td>
        <td>${escapeHtml(login)}</td>
        <td>
          <div class="password-cell">
            <span class="masked">${password}</span>
            <button class="btn secondary small" data-action="toggle-password" data-id="${entry.id}">${visible ? "Hide" : "Show"}</button>
            <button class="btn secondary small" data-action="copy-password" data-id="${entry.id}">Copy</button>
          </div>
        </td>
        <td>
          <button class="btn secondary small" data-action="edit" data-id="${entry.id}">Edit</button>
          <button class="btn danger small" data-action="delete" data-id="${entry.id}">Delete</button>
        </td>
      </tr>
    `;
  }).join("");
  $("vaultMeta").textContent = `${state.vault.entries.length} saved account${state.vault.entries.length === 1 ? "" : "s"}`;
}

function updateUserUI() {
  $("gateName").textContent = state.user.displayName || "Google user";
  $("gateEmail").textContent = state.user.email || "";
  $("gatePhoto").src = state.user.photoURL || "";
  const factors = multiFactor(state.user).enrolledFactors || [];
  $("mfaStatus").textContent = factors.length
    ? `${factors.length} SMS 2FA factor(s) enrolled for this Firebase account.`
    : "No Firebase SMS 2FA factor enrolled yet. Your Google account 2-Step Verification still happens inside Google sign-in if enabled.";
}

function renderDeviceLogins() {
  const deviceTable = $("deviceLoginsTable");
  if (!deviceTable || !state.devicesList || state.devicesList.length === 0) return;
  
  deviceTable.innerHTML = state.devicesList.reverse().map((device) => {
    const loginTime = new Date(device.loginTime).toLocaleString();
    const lastActiveTime = new Date(device.lastActive).toLocaleString();
    const isCurrentDevice = device.deviceId === (state.currentDevice?.deviceId || "");
    const badge = isCurrentDevice ? '<span class="device-badge current">Current Device</span>' : '';
    
    return `
      <tr${isCurrentDevice ? ' style="background: #eef3f1;"' : ''}>
        <td>
          <strong>${escapeHtml(device.deviceType)}</strong><br>
          <span class="status">${escapeHtml(device.browser)} • ${escapeHtml(device.os)}</span>
        </td>
        <td>
          <span class="device-agent">${escapeHtml(device.userAgent.substring(0, 50))}...</span>
        </td>
        <td>${loginTime}</td>
        <td>${lastActiveTime}</td>
        <td>${badge}</td>
      </tr>
    `;
  }).join("");
}

async function signInWithGoogle() {
  try {
    setStatus("signInStatus", "Opening Google sign-in...");
    await signInWithPopup(state.auth, state.provider);
  } catch (error) {
    if (error.code === "auth/multi-factor-auth-required") {
      state.signInResolver = getMultiFactorResolver(state.auth, error);
      const hint = state.signInResolver.hints[0];
      $("mfaHint").textContent = hint?.phoneNumber
        ? `Send code to ${hint.phoneNumber}`
        : "A second factor is required.";
      $("mfaChallenge").classList.remove("hide");
      setStatus("signInStatus", "2FA required.", "good");
      return;
    }
    setStatus("signInStatus", error.message, "bad");
  }
}

function isAllowedUser(user) {
  return (user?.email || "").toLowerCase() === ALLOWED_EMAIL;
}

async function sendMfaSignInCode() {
  try {
    const hint = state.signInResolver.hints[0];
    const provider = new PhoneAuthProvider(state.auth);
    state.signInVerificationId = await provider.verifyPhoneNumber({
      multiFactorHint: hint,
      session: state.signInResolver.session,
    }, recaptcha());
    setStatus("signInStatus", "SMS code sent.", "good");
  } catch (error) {
    setStatus("signInStatus", error.message, "bad");
  }
}

async function verifyMfaSignInCode() {
  try {
    const credential = PhoneAuthProvider.credential(state.signInVerificationId, $("mfaCode").value.trim());
    const assertion = PhoneMultiFactorGenerator.assertion(credential);
    await state.signInResolver.resolveSignIn(assertion);
    $("mfaChallenge").classList.add("hide");
  } catch (error) {
    setStatus("signInStatus", error.message, "bad");
  }
}

function recaptcha() {
  if (!state.recaptcha) {
    state.recaptcha = new RecaptchaVerifier(state.auth, "recaptcha-container", { size: "invisible" });
  }
  return state.recaptcha;
}

async function unlockVault() {
  if (!state.cloudContainer) {
    setStatus("gateStatus", "No cloud vault yet. Use Create Cloud Vault.", "bad");
    return;
  }
  try {
    state.masterPassword = $("masterPassword").value;
    let decryptedVault = null;
    
    if (state.cloudContainer.version === 3) {
      const wrapped = await decryptVault(state.cloudContainer.keyWrap, state.masterPassword);
      state.dataKey = base64ToBytes(wrapped.dataKey);
      decryptedVault = await decryptWithDataKey(state.cloudContainer.vaultData, state.dataKey);
      state.recovery = state.cloudContainer.recovery || null;
    } else {
      state.dataKey = null;
      decryptedVault = await decryptVault(state.cloudContainer, state.masterPassword);
      state.recovery = null;
    }
    
    // Validate decrypted data
    if (!decryptedVault || !Array.isArray(decryptedVault.entries)) {
      throw new Error("Decrypted vault is invalid or corrupted");
    }
    
    state.vault = decryptedVault;
    console.log("Vault unlocked with", state.vault.entries.length, "entries");
    
    clearForm();
    showOnly("appScreen");
    updateWelcomeGreeting();
    initializeClock();
    showSuccessOverlay();
    updateRecoveryStatus();
    migrateFavicons();
    saveVaultSession();
    setupInactivityDetection();
    await saveDeviceLogin();
    renderDeviceLogins();
    render();
  } catch (error) {
    console.error("Unlock vault error:", error);
    setStatus("gateStatus", `Wrong master password or damaged cloud vault: ${error.message}`, "bad");
  }
}

async function createCloudVault() {
  const password = $("masterPassword").value;
  const confirmPassword = $("confirmPassword").value;
  if (password.length < 12) {
    setStatus("gateStatus", "Use at least 12 characters for the master password.", "bad");
    return;
  }
  if (password !== confirmPassword) {
    setStatus("gateStatus", "Master passwords do not match.", "bad");
    return;
  }
  if (state.cloudContainer && !confirm("Replace existing cloud vault?")) return;
  state.masterPassword = password;
  state.vault = blankVault();
  state.dataKey = crypto.getRandomValues(new Uint8Array(32));
  state.recovery = null;
  await saveCloudVault();
  clearForm();
  showOnly("appScreen");
  updateWelcomeGreeting();
  initializeClock();
  showSuccessOverlay();
  saveVaultSession();
  setupInactivityDetection();
  await saveDeviceLogin();
  renderDeviceLogins();
}

function lockVault() {
  state.masterPassword = "";
  state.vault = null;
  state.dataKey = null;
  state.pendingRecovery = null;
  state.visiblePasswords.clear();
  $("masterPassword").value = "";
  $("confirmPassword").value = "";
  if (state.clockInterval) clearInterval(state.clockInterval);
  clearInactivityTimer();
  sessionStorage.removeItem(VAULT_SESSION_KEY);
  setGateMode("unlock");
  updateGateControls();
  showOnly("vaultGate");
}

async function sendEnrollCode() {
  try {
    if (!$("mfaPhone").value.trim()) {
      setStatus("securityStatus", "Enter a phone number first.", "bad");
      return;
    }
    await reauthenticateWithPopup(state.user, state.provider);
    const session = await multiFactor(state.user).getSession();
    const provider = new PhoneAuthProvider(state.auth);
    state.enrollVerificationId = await provider.verifyPhoneNumber({
      phoneNumber: $("mfaPhone").value.trim(),
      session,
    }, recaptcha());
    setStatus("securityStatus", "Enrollment SMS code sent.", "good");
  } catch (error) {
    setStatus("securityStatus", error.message, "bad");
  }
}

async function verifyEnrollCode() {
  try {
    const credential = PhoneAuthProvider.credential(state.enrollVerificationId, $("mfaEnrollCode").value.trim());
    const assertion = PhoneMultiFactorGenerator.assertion(credential);
    await multiFactor(state.user).enroll(assertion, "Personal phone");
    updateUserUI();
    setStatus("securityStatus", "SMS 2FA enabled.", "good");
  } catch (error) {
    setStatus("securityStatus", error.message, "bad");
  }
}

async function generateRecoverySetup() {
  try {
    await ensureDataKey();
    const recoveryCode = generateRecoveryCode();
    const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
    state.pendingRecovery = { recoveryCode, secret };
    $("recoveryCodeOutput").value = recoveryCode;
    $("recoverySetupPanel").classList.remove("hide");
    await renderTotpQr(secret);
    setStatus("recoveryStatus", "Scan the QR code, save the recovery code, then enter a 6-digit authenticator code.", "good");
  } catch (error) {
    setStatus("recoveryStatus", error.message, "bad");
  }
}

async function verifyAndEnableRecovery() {
  try {
    if (!state.pendingRecovery) {
      setStatus("recoveryStatus", "Create a recovery QR first.", "bad");
      return;
    }
    const ok = await verifyTotp(state.pendingRecovery.secret, $("recoveryTotpCode").value);
    if (!ok) {
      setStatus("recoveryStatus", "Authenticator code is not valid yet.", "bad");
      return;
    }
    await ensureDataKey();
    state.recovery = {
      enabledAt: new Date().toISOString(),
      totpSecret: state.pendingRecovery.secret,
      keyWrap: await encryptVault(
        { dataKey: bytesToBase64(state.dataKey) },
        state.pendingRecovery.recoveryCode
      ),
    };
    state.pendingRecovery = null;
    $("recoverySetupPanel").classList.add("hide");
    $("recoveryTotpCode").value = "";
    await saveCloudVault();
    updateRecoveryStatus();
    setStatus("recoveryStatus", "Recovery enabled. Keep your recovery code offline.", "good");
  } catch (error) {
    setStatus("recoveryStatus", error.message, "bad");
  }
}

async function disableRecovery() {
  if (!state.recovery) {
    setStatus("recoveryStatus", "Recovery is already disabled.", "bad");
    return;
  }
  if (!confirm("Disable master password recovery?")) return;
  state.recovery = null;
  state.pendingRecovery = null;
  await saveCloudVault();
  updateRecoveryStatus();
  setStatus("recoveryStatus", "Recovery disabled.", "good");
}

async function recoverMasterPassword() {
  try {
    if (!state.cloudContainer?.recovery) {
      setStatus("recoveryGateStatus", "Recovery is not set up for this vault.", "bad");
      return;
    }
    const nextPassword = $("resetNewMaster").value;
    if (nextPassword.length < 12) {
      setStatus("recoveryGateStatus", "Use at least 12 characters for the new master password.", "bad");
      return;
    }
    if (nextPassword !== $("resetNewMasterConfirm").value) {
      setStatus("recoveryGateStatus", "New master passwords do not match.", "bad");
      return;
    }
    const recovery = state.cloudContainer.recovery;
    const codeOk = await verifyTotp(recovery.totpSecret, $("resetTotpCode").value);
    if (!codeOk) {
      setStatus("recoveryGateStatus", "Authenticator code is not valid.", "bad");
      return;
    }
    const wrapped = await decryptVault(recovery.keyWrap, $("resetRecoveryCode").value.trim());
    state.dataKey = base64ToBytes(wrapped.dataKey);
    state.vault = await decryptWithDataKey(state.cloudContainer.vaultData, state.dataKey);
    state.masterPassword = nextPassword;
    state.recovery = recovery;
    await saveCloudVault();
    clearForm();
    showOnly("appScreen");
    updateRecoveryStatus();
    render();
    setStatus("syncStatus", "Master password reset using recovery.", "good");
  } catch {
    setStatus("recoveryGateStatus", "Recovery failed. Check recovery code and authenticator code.", "bad");
  }
}

function toggleForgotMasterPanel() {
  setGateMode("recovery");
}

function switchView(id) {
  ["accountsView", "backupView", "securityView", "appearanceView"].forEach((view) => {
    $(view).classList.toggle("hide", view !== id);
  });
  document.querySelectorAll(".nav button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === id);
  });
}

function bindEvents() {
  $("googleSignInBtn").addEventListener("click", signInWithGoogle);
  $("sendMfaCodeBtn").addEventListener("click", sendMfaSignInCode);
  $("verifyMfaCodeBtn").addEventListener("click", verifyMfaSignInCode);
  $("unlockBtn").addEventListener("click", unlockVault);
  $("createBtn").addEventListener("click", createCloudVault);
  $("forgotMasterBtn").addEventListener("click", toggleForgotMasterPanel);
  $("recoverMasterBtn").addEventListener("click", recoverMasterPassword);
  $("backToUnlockBtn").addEventListener("click", () => setGateMode("unlock"));
  $("lockBtn").addEventListener("click", lockVault);
  $("signOutBtn").addEventListener("click", () => signOut(state.auth));
  $("gateSignOutBtn").addEventListener("click", () => signOut(state.auth));
  $("newEntryBtn").addEventListener("click", clearForm);
  $("toggleFormBtn").addEventListener("click", () => {
    const body = $("formPanelBody");
    const isCollapsed = body.classList.contains("collapsed");
    body.classList.toggle("collapsed");
    const newIsCollapsed = !isCollapsed;
    $("toggleFormBtn").textContent = newIsCollapsed ? "+" : "−";
    $("toggleFormBtn").title = newIsCollapsed ? "Expand form" : "Collapse form";
  });
  $("saveEntryBtn").addEventListener("click", async () => {
    try {
      if (!state.vault) {
        setStatus("entryStatus", "Vault not loaded. Please unlock your vault first.", "bad");
        return;
      }
      if (!state.masterPassword) {
        setStatus("entryStatus", "Master password not set. Please unlock your vault.", "bad");
        return;
      }
      const entry = formEntry();
      if (!entry.label) {
        setStatus("entryStatus", "Label is required.", "bad");
        return;
      }
      const index = state.vault.entries.findIndex((item) => item.id === entry.id);
      const isNewEntry = index < 0;
      if (index >= 0) state.vault.entries[index] = entry;
      else state.vault.entries.push(entry);
      setStatus("entryStatus", "Saving...", "");
      await saveCloudVault();
      fillForm(entry);
      setStatus("entryStatus", "Saved.", "good");
      showSuccessOverlay(
        isNewEntry ? "Successfully added a credential" : "Credential updated",
        isNewEntry
          ? "Your new entry is synced across devices."
          : "Your change is now live on other devices."
      );
    } catch (error) {
      console.error("Save entry error:", error);
      setStatus("entryStatus", `Error saving: ${error.message}`, "bad");
    }
  });
  $("generateBtn").addEventListener("click", () => {
    $("password").value = generatedPassword();
    $("password").type = "text";
    $("toggleFormPassword").textContent = "Hide";
  });
  $("toggleFormPassword").addEventListener("click", () => {
    $("password").type = $("password").type === "password" ? "text" : "password";
    $("toggleFormPassword").textContent = $("password").type === "password" ? "Show" : "Hide";
  });
  $("entriesTable").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const entry = findById(button.dataset.id);
    if (!entry) return;
    if (button.dataset.action === "edit") fillForm(entry);
    if (button.dataset.action === "toggle-password") {
      if (state.visiblePasswords.has(entry.id)) state.visiblePasswords.delete(entry.id);
      else state.visiblePasswords.add(entry.id);
      render();
    }
    if (button.dataset.action === "copy-password") {
      await navigator.clipboard.writeText(entry.password || "");
      button.textContent = "Copied";
      setTimeout(render, 700);
    }
    if (button.dataset.action === "delete") {
      if (!confirm("Are you sure you want to delete this credential?")) return;
      state.vault.entries = state.vault.entries.filter((item) => item.id !== entry.id);
      await saveCloudVault();
      clearForm();
      showSuccessOverlay("Credential deleted", "The entry has been removed from your vault.");
    }
  });
  $("search").addEventListener("input", render);
  $("categoryFilter").addEventListener("change", render);
  document.querySelectorAll(".nav button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.cloudContainer, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `personal-vault-${new Date().toISOString().slice(0, 10)}.vault`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  $("importBtn").addEventListener("click", async () => {
    const file = $("importFile").files[0];
    if (!file) return;
    try {
      const container = JSON.parse(await file.text());
      const importedVault = await decryptVault(container, state.masterPassword);
      if (!confirm("Replace your current cloud vault with this backup?")) return;
      state.vault = importedVault;
      state.cloudContainer = container;
      await setDoc(vaultRef(), {
        owner: state.user.uid,
        ownerEmail: state.user.email || "",
        updatedAt: serverTimestamp(),
        container,
      });
      render();
      switchView("accountsView");
    } catch {
      alert("Could not import. Check the file and master password.");
    }
  });
  $("changeMasterBtn").addEventListener("click", async () => {
    const nextPassword = $("newMaster").value;
    if (nextPassword.length < 12) {
      setStatus("securityStatus", "Use at least 12 characters.", "bad");
      return;
    }
    if (nextPassword !== $("newMasterConfirm").value) {
      setStatus("securityStatus", "Passwords do not match.", "bad");
      return;
    }
    state.masterPassword = nextPassword;
    await saveCloudVault();
    $("newMaster").value = "";
    $("newMasterConfirm").value = "";
    setStatus("securityStatus", "Master password changed.", "good");
  });
  $("sendEnrollCodeBtn").addEventListener("click", sendEnrollCode);
  $("verifyEnrollCodeBtn").addEventListener("click", verifyEnrollCode);
  $("generateRecoveryBtn").addEventListener("click", generateRecoverySetup);
  $("verifyRecoveryBtn").addEventListener("click", verifyAndEnableRecovery);
  $("disableRecoveryBtn").addEventListener("click", disableRecovery);
  $("saveAppearanceBtn").addEventListener("click", () => {
    state.branding = collectAppearanceForm();
    saveBranding();
    applyBranding();
    fillAppearanceForm();
    setStatus("appearanceStatus", "Appearance saved on this browser.", "good");
  });
  $("resetAppearanceBtn").addEventListener("click", () => {
    state.branding = { ...DEFAULT_BRANDING };
    saveBranding();
    applyBranding();
    fillAppearanceForm();
    setStatus("appearanceStatus", "Appearance reset.", "good");
  });
  ["brandLogoText", "brandTitleText", "brandTaglineText", "brandSubtitleText", "brandTitlePosition"].forEach((id) => {
    $(id).addEventListener("input", () => {
      const draft = collectAppearanceForm();
      $("previewTitle").textContent = draft.titleText;
      $("previewSubtitle").textContent = draft.taglineText;
      updateMiniLogo(draft.logoText, draft.logoImage);
    });
    $(id).addEventListener("change", () => {
      const draft = collectAppearanceForm();
      $("previewTitle").textContent = draft.titleText;
      $("previewSubtitle").textContent = draft.taglineText;
      updateMiniLogo(draft.logoText, draft.logoImage);
    });
  });
  $("brandLogoFile").addEventListener("change", async () => {
    const file = $("brandLogoFile").files[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      setStatus("appearanceStatus", "Logo image must be 500KB or smaller.", "bad");
      $("brandLogoFile").value = "";
      return;
    }
    state.branding.logoImage = await readFileAsDataUrl(file);
    state.branding = collectAppearanceForm();
    applyBranding();
    setStatus("appearanceStatus", "Logo image ready. Click Save Appearance.", "good");
  });
  $("removeLogoImageBtn").addEventListener("click", () => {
    state.branding.logoImage = "";
    $("brandLogoFile").value = "";
    applyBranding();
    setStatus("appearanceStatus", "Logo image removed. Click Save Appearance.", "good");
  });
  $("deleteCloudBtn").addEventListener("click", async () => {
    if (!confirm("Delete your encrypted cloud vault from Firestore? Export a backup first if needed.")) return;
    await deleteDoc(vaultRef());
    state.cloudContainer = null;
    lockVault();
    await loadCloudVault();
    setStatus("gateStatus", "Cloud vault deleted.", "good");
  });
}

function initFirebase() {
  state.app = initializeApp(firebaseConfig);
  state.auth = getAuth(state.app);
  state.db = getFirestore(state.app);
  state.provider = new GoogleAuthProvider();
  onAuthStateChanged(state.auth, async (user) => {
    if (typeof state.cloudListenerUnsubscribe === "function") {
      state.cloudListenerUnsubscribe();
      state.cloudListenerUnsubscribe = null;
    }
    state.user = user;
    state.vault = null;
    state.masterPassword = "";
    state.dataKey = null;
    state.recovery = null;
    state.pendingRecovery = null;
    state.visiblePasswords.clear();
    if (!user) {
      showOnly("signInScreen");
      return;
    }
    if (!isAllowedUser(user)) {
      showOnly("signInScreen");
      setStatus("signInStatus", "Access denied. This account is not authorized.", "bad");
      await signOut(state.auth);
      return;
    }
    try {
      state.currentDevice = detectDevice();
      updateUserUI();
      showOnly("vaultGate");
      await loadCloudVault();
      await loadDeviceLogins();
      watchCloudVault();
      
      // Try to restore vault session if it exists
      if (restoreVaultSession()) {
        clearForm();
        showOnly("appScreen");
        updateWelcomeGreeting();
        initializeClock();
        updateRecoveryStatus();
        migrateFavicons();
        setupInactivityDetection();
        await saveDeviceLogin();
        renderDeviceLogins();
        render();
      }
    } catch (error) {
      setStatus("gateStatus", error.message, "bad");
    }
  });
}

loadBranding();
applyBranding();
fillAppearanceForm();
bindEvents();

if (!configReady()) {
  showOnly("setupScreen");
  setStatus("setupStatus", "Missing Firebase config. Fill firebase-config.js first.", "bad");
} else {
  initFirebase();
}
