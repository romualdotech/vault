# Personal Account Vault

This is an encrypted account vault for storing personal account details such as Facebook, Instagram, YouTube, Gmail, banking, and Philippine government system logins.

The online version uses Google sign-in through Firebase Authentication, stores only encrypted vault data in Firestore, and still requires your separate master password to decrypt the vault.

## Online Cloud Version

Files used by the GitHub Pages + Firebase version:

- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `firestore.rules`
- `.nojekyll`

Setup guide:

```text
ONLINE_SETUP.md
```

Do not upload real backup files, `.vault` files, `vault.enc`, or any plaintext password list.

## System Interface

Double-click:

```text
start-system.bat
```

Or start the local system from PowerShell:

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

The browser system lets you create, unlock, search, add, edit, copy, export, and import encrypted account records. It saves an encrypted browser vault on this computer. Use `Export Backup` inside the system to keep a separate encrypted backup file.

## Local Command-Line Vault

```powershell
node vault.js init
```

Choose a long master password that you do not use anywhere else. If you forget it, the vault cannot be recovered.

## Add An Account

```powershell
node vault.js add
```

Useful categories:

- `Social`: Facebook, Instagram, YouTube
- `Email`: Gmail accounts
- `Banking`: bank apps and online banking
- `Government`: SSS, PhilHealth, Pag-IBIG, BIR, PSA, eGovPH, and other official systems
- `Work`
- `Other`

## View Entries

```powershell
node vault.js list
node vault.js list gmail
node vault.js show <id-or-label>
```

`show` displays the saved password, so use it only when nobody can see your screen.

## Update Or Remove

```powershell
node vault.js update <id-or-label>
node vault.js remove <id-or-label>
```

## Generate A Strong Password

```powershell
node vault.js generate
node vault.js generate 32
```

## Backup

```powershell
node vault.js backup vault-backup.enc
```

Keep at least one encrypted backup on a separate drive. The backup is still protected by your master password.

## Change Master Password

```powershell
node vault.js change-master
```

## Safety Notes

- Do not store your master password inside this vault.
- Use a unique password for every account.
- Turn on two-factor authentication for email, banking, and government accounts.
- Keep recovery email, recovery phone, and backup codes updated.
- Do not share `vault.enc` publicly, even though it is encrypted.
- Keep your computer account protected with a strong Windows password.
