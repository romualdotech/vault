# Online Setup: GitHub Pages + Firebase

Follow these steps to put the vault online safely.

## 1. Create Firebase Project

1. Go to `https://console.firebase.google.com`
2. Click **Add project**
3. Create a project, for example `personal-account-vault`
4. Open the project

## 2. Enable Google Login

1. Go to **Build > Authentication**
2. Click **Get started**
3. Open **Sign-in method**
4. Enable **Google**
5. Save

For Google 2-Step Verification, turn it on in your own Google account:

```text
https://myaccount.google.com/security
```

Firebase will use Google sign-in. If your Google account requires 2-Step Verification, Google will ask for it during login.

## 3. Optional Firebase SMS 2FA

This app also includes SMS 2FA enrollment code through Firebase Authentication.

To use it:

1. In Firebase, upgrade Authentication to **Identity Platform** if Firebase asks for it
2. Go to **Authentication > Sign-in method**
3. In **Advanced**, enable **SMS multi-factor authentication**
4. Add your website domain to authorized domains

## 4. Create Firestore Database

1. Go to **Build > Firestore Database**
2. Click **Create database**
3. Choose production mode
4. Choose a region

Then open **Rules** and paste the contents of:

```text
firestore.rules
```

Publish the rules.

The included rules allow only this Google account to access the vault:

```text
noelechonromualdo@gmail.com
```

## 5. Add Firebase Web App Config

1. In Firebase, open **Project settings**
2. Under **Your apps**, click the web icon `</>`
3. Register an app
4. Copy the Firebase config
5. Open `firebase-config.js`
6. Replace the placeholder values

Example shape:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456",
};
```

## 6. Upload To GitHub

Upload these files to your GitHub repository:

- `.nojekyll`
- `index.html`
- `styles.css`
- `app.js`
- `firebase-config.js`
- `firebase-config.example.js`
- `firestore.rules`
- `README.md`

Do not upload:

- `vault.enc`
- `.vault` backup files
- screenshots showing passwords
- any plaintext password list

## 7. Enable GitHub Pages

1. Open your repository on GitHub
2. Go to **Settings > Pages**
3. Under **Build and deployment**, choose **Deploy from a branch**
4. Choose branch `main`
5. Choose folder `/root`
6. Save

GitHub will give you a URL like:

```text
https://your-username.github.io/your-repository/
```

## 8. Add GitHub Pages Domain To Firebase

1. Copy your GitHub Pages URL domain
2. In Firebase, go to **Authentication > Settings > Authorized domains**
3. Add:

```text
your-username.github.io
```

If you use a custom domain, add that too.

For local testing, open:

```text
http://localhost:4173
```

Firebase usually allows `localhost` automatically. If you use `127.0.0.1` and get `auth/unauthorized-domain`, either use `localhost` instead or add this authorized domain if Firebase accepts it:

```text
127.0.0.1
```

## 9. First Use

1. Open your GitHub Pages URL
2. Click **Sign in with Google**
3. Create a cloud vault with a strong master password
4. Add your accounts

Your records are encrypted in the browser before saving to Firestore. Firebase stores encrypted vault text only.

## Important Safety Rules

- Do not forget your master password. It cannot be recovered.
- Do not store your master password inside the vault.
- Turn on Google 2-Step Verification.
- Use export backup regularly.
- Never upload backup files to GitHub.
