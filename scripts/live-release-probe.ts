// Explicit production verification: creates two temporary guests and removes only its own test data.
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, signInAnonymously, deleteUser } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDocFromServer, updateDoc, terminate } from 'firebase/firestore';
import { readCloudConfig } from '../src/cloud/config';
import { validProfile, validSave, validFeedback } from '../tests/emulator/fixtures';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
if (!process.argv.includes('--confirm-production-check')) throw Error('Explicit production check flag required');
const config = readCloudConfig({});
const project = config.firebase.projectId;
const names = ['owner', 'other', 'signed-out'];
const apps = names.map(name => initializeApp(config.firebase, `release-probe-${name}-${Date.now()}`));
const dbs = apps.map(app => getFirestore(app));
const auths = apps.map(app => getAuth(app));
const paths: string[] = [];
const checks: string[] = [];
async function denied(action: () => Promise<unknown>, label: string): Promise<void> {
  try { await action(); } catch (e) { if ((e as { code: string }).code === 'permission-denied') { checks.push(label); return; } throw e; }
  throw Error(`Security gate failed: ${label}`);
}
try {
  const users = await Promise.all(auths.slice(0, 2).map(a => signInAnonymously(a)));
  checks.push('live anonymous authentication');
  const uid = users[0].user.uid;
  const profilePath = `players/${uid}`;
  const savePath = `${profilePath}/saves/current`;
  paths.push(profilePath, savePath);
  await setDoc(doc(dbs[0], profilePath), validProfile({ displayName: 'Release check guest' }));
  await setDoc(doc(dbs[0], savePath), validSave(uid, { appVersion: '0.4.0-beta.1' }));
  if (!(await getDocFromServer(doc(dbs[0], savePath))).exists()) throw Error('Own save unavailable');
  checks.push('owner can write and read cloud save');
  await denied(() => getDocFromServer(doc(dbs[1], savePath)), 'other player cannot read private save');
  await denied(() => updateDoc(doc(dbs[1], savePath), { revision: 2 }), 'other player cannot modify private save');
  await denied(() => getDocFromServer(doc(dbs[2], savePath)), 'signed-out client cannot read private save');
  const id = `fb-release-${Date.now()}`;
  const path = `feedback/${id}`;
  paths.push(path);
  await setDoc(doc(dbs[0], path), validFeedback(uid, id, { gameplay: 'Automated release verification; temporary record.', appVersion: '0.4.0-beta.1' }));
  if (!(await getDocFromServer(doc(dbs[0], path))).exists()) throw Error('Feedback confirmation unavailable');
  checks.push('live feedback submission confirmed');
  await denied(() => getDocFromServer(doc(dbs[1], path)), 'other player cannot read private feedback');
} finally {
  const auth = require('firebase-tools/lib/auth.js');
  const { requireAuth } = require('firebase-tools/lib/requireAuth.js');
  const { Client } = require('firebase-tools/lib/apiv2.js');
  const options = { project };
  auth.setActiveAccount(options, auth.getGlobalDefaultAccount());
  await requireAuth(options);
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
  for (const path of paths.reverse()) await client.delete(`/projects/${project}/databases/(default)/documents/${path}`);
  for (const a of auths) if (a.currentUser) await deleteUser(a.currentUser);
  await Promise.all(dbs.map(db => terminate(db)));
  await Promise.all(apps.map(app => deleteApp(app)));
}
await writeFile('docs/release/live-security-check.json', JSON.stringify({ project, checkedAt: new Date().toISOString(), checks, temporaryDataRemoved: true }, null, 2) + '\n');
console.log('Live release checks passed: ' + checks.join('; '));
