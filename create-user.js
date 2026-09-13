// Run this on YOUR machine (or a free GitHub Codespace) — never on GitHub Pages.
// It's how you create the username/password pairs you hand out. Visitors
// never see this file and can never create their own accounts.
//
// CREDENTIAL SETUP — pick ONE of the two options below.
//
// Option A (recommended in Codespaces): encrypted secret, no file on disk
//   1. Firebase Console → Project settings → Service accounts →
//      "Generate new private key" → a .json file downloads.
//   2. GitHub → your avatar → Settings → Codespaces → "Secrets" (this is
//      YOUR account settings, not the repo) → New secret.
//      Name it exactly: FIREBASE_SERVICE_ACCOUNT_JSON
//      Value: open the downloaded .json in a text editor, copy the ENTIRE
//      contents, paste as the secret value.
//      Under "Repository access," select this repo.
//   3. Stop and restart the Codespace (secrets only load on (re)start) so
//      it's injected as an environment variable — nothing is ever written
//      to disk as a plain file, so there's no file to accidentally leave
//      behind, commit, or forget to delete.
//
// Option B (local machine only, not recommended in Codespaces):
//   Save the downloaded key as serviceAccountKey.json in this same folder.
//   Never commit it — it's already in .gitignore.
//
// Either way: npm install, then:
//   node create-user.js add alice "correct horse battery staple"
//   node create-user.js list
//   node create-user.js remove alice

import { readFileSync, existsSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const filePath = new URL('./serviceAccountKey.json', import.meta.url);
  if (existsSync(filePath)) {
    return JSON.parse(readFileSync(filePath));
  }
  console.error(
    'No credential found. Either set the FIREBASE_SERVICE_ACCOUNT_JSON ' +
    'Codespaces secret (recommended) or place serviceAccountKey.json next ' +
    'to this script. See the comment block at the top of this file.'
  );
  process.exit(1);
}

const serviceAccount = loadCredential();
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();
const EMAIL_SUFFIX = '@wire.local';

const [, , cmd, username, password] = process.argv;

async function addUser(username, password) {
  const uname = username.trim().toLowerCase();
  if (!password || password.length < 8) {
    console.error('Pick a password with at least 8 characters.');
    process.exit(1);
  }
  const user = await auth.createUser({
    email: uname + EMAIL_SUFFIX,
    password,
    displayName: uname,
  });
  await db.collection('users').doc(user.uid).set({ username: uname });
  console.log(`Created "${uname}". Tell them their username and password out of band (not over this repo).`);
}

async function removeUser(username) {
  const uname = username.trim().toLowerCase();
  const user = await auth.getUserByEmail(uname + EMAIL_SUFFIX);
  await auth.deleteUser(user.uid);
  await db.collection('users').doc(user.uid).delete();
  console.log(`Removed "${uname}".`);
}

async function listUsers() {
  const list = await auth.listUsers(1000);
  list.users.forEach((u) => console.log(u.email.replace(EMAIL_SUFFIX, ''), '-', u.uid));
}

switch (cmd) {
  case 'add':
    await addUser(username, password);
    break;
  case 'remove':
    await removeUser(username);
    break;
  case 'list':
    await listUsers();
    break;
  default:
    console.log('Usage:\n  node create-user.js add <username> <password>\n  node create-user.js remove <username>\n  node create-user.js list');
}
process.exit(0);
