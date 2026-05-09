#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const readlinePromises = require("readline/promises");

const VAULT_FILE = path.join(__dirname, "vault.enc");
const VERSION = 1;
const KDF = {
  name: "scrypt",
  keyLength: 32,
  N: 32768,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

function usage() {
  console.log(`Personal Account Vault

Usage:
  node vault.js init
  node vault.js add
  node vault.js list [search text]
  node vault.js show <id-or-label>
  node vault.js update <id-or-label>
  node vault.js remove <id-or-label>
  node vault.js generate [length]
  node vault.js backup <backup-file>
  node vault.js change-master

The vault is saved as vault.enc in this folder and is encrypted with your master password.`);
}

function die(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function fileExists(file) {
  try {
    fs.accessSync(file, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function now() {
  return new Date().toISOString();
}

function normalize(text) {
  return String(text || "").trim().toLowerCase();
}

function makeId(label) {
  const base = normalize(label)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "account";
  return `${base}-${crypto.randomBytes(3).toString("hex")}`;
}

function deriveKey(password, salt, kdf = KDF) {
  return crypto.scryptSync(password, salt, kdf.keyLength, {
    N: kdf.N,
    r: kdf.r,
    p: kdf.p,
    maxmem: kdf.maxmem,
  });
}

function encryptVault(data, password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = deriveKey(password, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(data, null, 2), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    version: VERSION,
    encryptedAt: now(),
    kdf: KDF,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptVault(container, password) {
  const salt = Buffer.from(container.salt, "base64");
  const iv = Buffer.from(container.iv, "base64");
  const tag = Buffer.from(container.tag, "base64");
  const ciphertext = Buffer.from(container.ciphertext, "base64");
  const key = deriveKey(password, salt, container.kdf);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8"));
}

function readContainer() {
  if (!fileExists(VAULT_FILE)) {
    die("vault.enc does not exist yet. Run: node vault.js init");
  }
  return JSON.parse(fs.readFileSync(VAULT_FILE, "utf8"));
}

function writeContainer(container) {
  const tempFile = `${VAULT_FILE}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(container, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempFile, VAULT_FILE);
}

async function prompt(question, defaultValue = "") {
  const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  rl.close();
  return answer || defaultValue;
}

async function promptHidden(question) {
  if (!process.stdin.isTTY) {
    return prompt(question);
  }

  process.stdout.write(`${question}: `);
  const stdin = process.stdin;
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");

  return new Promise((resolve) => {
    let value = "";
    function onData(char) {
      if (char === "\u0003") {
        process.stdout.write("\n");
        process.exit(130);
      }
      if (char === "\r" || char === "\n") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(value);
        return;
      }
      if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
        return;
      }
      value += char;
    }
    stdin.on("data", onData);
  });
}

async function askForVault() {
  const password = await promptHidden("Master password");
  try {
    return { vault: decryptVault(readContainer(), password), password };
  } catch {
    die("could not unlock vault. The master password may be wrong or vault.enc may be damaged.");
  }
}

async function askNewMasterPassword() {
  const first = await promptHidden("New master password");
  if (first.length < 12) {
    die("use at least 12 characters for the master password.");
  }
  const second = await promptHidden("Repeat master password");
  if (first !== second) {
    die("master passwords did not match.");
  }
  return first;
}

function emptyVault() {
  return {
    version: VERSION,
    createdAt: now(),
    updatedAt: now(),
    entries: [],
  };
}

function saveVault(vault, password) {
  vault.updatedAt = now();
  writeContainer(encryptVault(vault, password));
}

function findEntry(vault, query) {
  const q = normalize(query);
  const matches = vault.entries.filter((entry) => {
    return normalize(entry.id) === q || normalize(entry.label) === q;
  });
  if (matches.length === 1) return matches[0];

  const partial = vault.entries.filter((entry) => {
    return normalize(entry.id).includes(q) || normalize(entry.label).includes(q);
  });
  if (partial.length === 1) return partial[0];
  if (matches.length + partial.length > 1) {
    die("more than one entry matched. Use the exact ID from: node vault.js list");
  }
  die(`no entry matched "${query}".`);
}

function generatePassword(length = 24) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*()-_=+[]{}";
  const bytes = crypto.randomBytes(length);
  let password = "";
  for (const byte of bytes) password += chars[byte % chars.length];
  return password;
}

async function collectEntry(existing = {}) {
  const label = await prompt("Label", existing.label || "");
  if (!label) die("label is required.");

  const entry = {
    id: existing.id || makeId(label),
    label,
    category: await prompt("Category", existing.category || "Personal"),
    username: await prompt("Username", existing.username || ""),
    email: await prompt("Email", existing.email || ""),
    password: await promptHidden(existing.password ? "Password (leave blank to keep current)" : "Password"),
    url: await prompt("Website / app URL", existing.url || ""),
    recoveryEmail: await prompt("Recovery email", existing.recoveryEmail || ""),
    phone: await prompt("Phone / recovery number", existing.phone || ""),
    notes: await prompt("Notes", existing.notes || ""),
    tags: (await prompt("Tags, comma separated", (existing.tags || []).join(", ")))
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    createdAt: existing.createdAt || now(),
    updatedAt: now(),
  };

  if (!entry.password && existing.password) {
    entry.password = existing.password;
  }
  return entry;
}

async function init() {
  if (fileExists(VAULT_FILE)) {
    die("vault.enc already exists. Refusing to overwrite it.");
  }
  const password = await askNewMasterPassword();
  writeContainer(encryptVault(emptyVault(), password));
  console.log("Created encrypted vault.enc");
}

async function add() {
  const { vault, password } = await askForVault();
  const entry = await collectEntry();
  vault.entries.push(entry);
  saveVault(vault, password);
  console.log(`Saved ${entry.label} as ${entry.id}`);
}

async function list(search = "") {
  const { vault } = await askForVault();
  const q = normalize(search);
  const entries = vault.entries.filter((entry) => {
    if (!q) return true;
    return [entry.id, entry.label, entry.category, entry.username, entry.email, entry.url, ...(entry.tags || [])]
      .some((value) => normalize(value).includes(q));
  });

  if (!entries.length) {
    console.log("No entries found.");
    return;
  }
  for (const entry of entries) {
    console.log(`${entry.id.padEnd(32)} ${entry.label} (${entry.category || "No category"})`);
  }
}

async function show(query) {
  if (!query) die("provide an ID or label.");
  const { vault } = await askForVault();
  const entry = findEntry(vault, query);
  console.log(JSON.stringify(entry, null, 2));
}

async function update(query) {
  if (!query) die("provide an ID or label.");
  const { vault, password } = await askForVault();
  const entry = findEntry(vault, query);
  const next = await collectEntry(entry);
  const index = vault.entries.findIndex((item) => item.id === entry.id);
  vault.entries[index] = next;
  saveVault(vault, password);
  console.log(`Updated ${next.label}`);
}

async function remove(query) {
  if (!query) die("provide an ID or label.");
  const { vault, password } = await askForVault();
  const entry = findEntry(vault, query);
  const answer = normalize(await prompt(`Type DELETE to remove ${entry.label}`));
  if (answer !== "delete") die("remove cancelled.");
  vault.entries = vault.entries.filter((item) => item.id !== entry.id);
  saveVault(vault, password);
  console.log(`Removed ${entry.label}`);
}

async function backup(backupFile) {
  if (!backupFile) die("provide a backup file path.");
  if (!fileExists(VAULT_FILE)) die("vault.enc does not exist yet.");
  const resolved = path.resolve(process.cwd(), backupFile);
  fs.copyFileSync(VAULT_FILE, resolved);
  console.log(`Encrypted backup written to ${resolved}`);
}

async function changeMaster() {
  const { vault } = await askForVault();
  const nextPassword = await askNewMasterPassword();
  saveVault(vault, nextPassword);
  console.log("Master password changed.");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "init":
      return init();
    case "add":
      return add();
    case "list":
      return list(args.join(" "));
    case "show":
      return show(args.join(" "));
    case "update":
      return update(args.join(" "));
    case "remove":
      return remove(args.join(" "));
    case "generate":
      return console.log(generatePassword(Number(args[0]) || 24));
    case "backup":
      return backup(args.join(" "));
    case "change-master":
      return changeMaster();
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return usage();
    default:
      usage();
      process.exitCode = 1;
  }
}

main().catch((error) => die(error.message));
