// Run on YOUR machine or in a GitHub Codespace — never on GitHub Pages.
// Creates the handle/password pairs you hand out. Nobody can self-register.
//
// CREDENTIAL SETUP — pick ONE.
//
// Option A (recommended in Codespaces): encrypted secret, no file on disk
//   1. Firebase Console -> Project settings -> Service accounts ->
//      "Generate new private key" -> a .json downloads.
//   2. GitHub -> avatar -> Settings -> Codespaces -> Secrets -> New secret.
//      Name:  FIREBASE_SERVICE_ACCOUNT_JSON
//      Value: the ENTIRE contents of that .json
//      Repository access: select this repo.
//   3. Stop and restart the Codespace so it is injected as an env var.
//      Nothing is written to disk, so there is no file to leak or clean up.
//
// Option B (local machine): save the key as serviceAccountKey.json here.
//   It is already in .gitignore. Never commit it.
//
// Usage:
//   npm install
//   node create-user.js add alice "a long passphrase"
//   node create-user.js list
//   node create-user.js passwd alice "a new passphrase"
//   node create-user.js remove alice
//   node create-user.js migrate      <- run ONCE if you had accounts from the old script

import { readFileSync, existsSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function loadCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  const filePath = new URL('./serviceAccountKey.json', import.meta.url);
  if (existsSync(filePath)) return JSON.parse(readFileSync(filePath));
  console.error(
    'No credential found. Set the FIREBASE_SERVICE_ACCOUNT_JSON Codespaces secret ' +
    '(recommended) or place serviceAccountKey.json next to this script. ' +
    'See the comment block at the top of this file.'
  );
  process.exit(1);
}

initializeApp({ credential: cert(loadCredential()) });
const auth = getAuth();
const db = getFirestore();

// Must match EMAIL_SUFFIX in index.html. Do not change it once accounts exist —
// it is baked into every account's login email.
const EMAIL_SUFFIX = '@wire.local';

const [, , cmd, a, b] = process.argv;
const clean = s => String(s || '').trim().toLowerCase();

async function addUser(handle, password) {
  const h = clean(handle);
  if (!/^[a-z0-9._-]{2,24}$/.test(h)) {
    console.error('Handle must be 2-24 chars: lowercase letters, numbers, dot, underscore, hyphen.');
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters. It also protects their DM key, so longer is genuinely better.');
    process.exit(1);
  }
  const email = h + EMAIL_SUFFIX;
  const user = await auth.createUser({ email, password, displayName: h });

  await db.collection('users').doc(user.uid).set({
    username: h,
    displayName: null,
    bio: '',
    status: '',
    nameFont: 'Inter',
    nameColor: '#E8E6E1',
    gameLinks: [],
    photo: null,
    online: false,
    createdAt: new Date()
  });
  // handle -> login email map, so they can change their handle later without
  // breaking login (the login email itself never changes)
  await db.collection('usernames').doc(h).set({ uid: user.uid, loginEmail: email });

  console.log(`Created @${h}.`);
  console.log('Give them the handle and password directly — not through this repo.');
  console.log('They should change the password in Settings -> Security on first login;');
  console.log('after that you will no longer know it, which is the point.');
}

async function setPassword(handle, password) {
  const h = clean(handle);
  if (!password || password.length < 8) { console.error('Password must be at least 8 characters.'); process.exit(1); }
  const snap = await db.collection('usernames').doc(h).get();
  const email = snap.exists ? snap.data().loginEmail : h + EMAIL_SUFFIX;
  const user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password });
  console.log(`Password reset for @${h}.`);
  console.warn('WARNING: their existing encrypted DMs are now permanently unreadable.');
  console.warn('Their DM key was locked with the OLD password and only they could re-wrap it.');
  console.warn('The #everyone channel is unaffected. This is inherent to end-to-end encryption.');
}

async function removeUser(handle) {
  const h = clean(handle);
  const snap = await db.collection('usernames').doc(h).get();
  const email = snap.exists ? snap.data().loginEmail : h + EMAIL_SUFFIX;
  const user = await auth.getUserByEmail(email);
  await auth.deleteUser(user.uid);
  await db.collection('users').doc(user.uid).delete();
  await db.collection('usernames').doc(h).delete().catch(() => {});
  console.log(`Removed @${h}. Their past messages remain in the database.`);
}

async function listUsers() {
  const list = await auth.listUsers(1000);
  for (const u of list.users) {
    const uid = u.uid;
    const d = await db.collection('users').doc(uid).get();
    const p = d.exists ? d.data() : {};
    console.log(
      (p.username || u.email.replace(EMAIL_SUFFIX, '')).padEnd(20),
      (p.displayName || '-').padEnd(20),
      p.publicKey ? 'key:yes' : 'key:no ',
      uid
    );
  }
}

// Backfills the usernames map for accounts made by the earlier script.
async function migrate() {
  const list = await auth.listUsers(1000);
  let n = 0;
  for (const u of list.users) {
    const d = await db.collection('users').doc(u.uid).get();
    const handle = (d.exists && d.data().username) || u.email.replace(EMAIL_SUFFIX, '');
    await db.collection('usernames').doc(handle).set({ uid: u.uid, loginEmail: u.email });
    if (d.exists) {
      const p = d.data();
      await db.collection('users').doc(u.uid).set({
        username: p.username || handle,
        displayName: p.displayName ?? null,
        bio: p.bio ?? '',
        status: p.status ?? '',
        nameFont: p.nameFont ?? 'Inter',
        nameColor: p.nameColor ?? '#E8E6E1',
        gameLinks: p.gameLinks ?? [],
        photo: p.photo ?? null
      }, { merge: true });
    }
    n++;
  }
  console.log(`Migrated ${n} account(s). Existing passwords are unchanged.`);
}

const run = {
  add:     () => addUser(a, b),
  passwd:  () => setPassword(a, b),
  remove:  () => removeUser(a),
  list:    () => listUsers(),
  migrate: () => migrate()
}[cmd];

if (!run) {
  console.log([
    'Usage:',
    '  node create-user.js add <handle> <password>',
    '  node create-user.js passwd <handle> <newpassword>   (destroys their DM history)',
    '  node create-user.js remove <handle>',
    '  node create-user.js list',
    '  node create-user.js migrate                          (run once, for old accounts)'
  ].join('\n'));
  process.exit(0);
}

run()
  .then(() => process.exit(0))
  .catch(e => { console.error(e.message || e); process.exit(1); });
