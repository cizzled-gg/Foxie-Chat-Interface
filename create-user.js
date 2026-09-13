// Run this on YOUR machine (or a free GitHub Codespace) — never on GitHub Pages.
// It's how you create the username/password pairs you hand out. Visitors
// never see this file and can never create their own accounts.
//
// Setup (one-time):
//   1. npm install firebase-admin
//   2. Firebase Console → Project settings → Service accounts →
//      "Generate new private key" → save the JSON as serviceAccountKey.json
//      in this same folder. NEVER commit this file to GitHub — add it to
//      .gitignore. It grants full admin access to your Firebase project.
//
// Usage:
//   node create-user.js add alice "correct horse battery staple"
//   node create-user.js list
//   node create-user.js remove alice

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(readFileSync(new URL('./serviceAccountKey.json', import.meta.url)));
initializeApp({ credential: cert(serviceAccount) });

const auth = getAuth();
const db = getFirestore();
const EMAIL_SUFFIX = '@wire.local';

const [, , cmd, username, password] = process.argv;

async function addUser(username, password) {
  const uname = username.trim().toLowerCase();
  if (!password || password.length < 8) {
    console.error('Pick a password with at least 8 characters. Please keep it secret and do not commit it to GitHub. You can always change it later in the Firebase Console.');
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
