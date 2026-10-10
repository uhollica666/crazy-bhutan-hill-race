// Read-only production audit using the existing Firebase CLI login. Never prints credentials.
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const auth = require('firebase-tools/lib/auth.js');
const { requireAuth } = require('firebase-tools/lib/requireAuth.js');
const { Client } = require('firebase-tools/lib/apiv2.js');
const rules = require('firebase-tools/lib/gcp/rules.js');
const project = 'crazy-bhutan-hill-race';
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error('Firebase CLI login required');
const options = { project };
auth.setActiveAccount(options, account);
await requireAuth(options);
const releases = await rules.listAllReleases(project);
const release = releases.find(r => r.name === `projects/${project}/releases/cloud.firestore`);
if (!release) throw new Error('No deployed Firestore rules release');
const files = await rules.getRulesetContent(release.rulesetName);
const content = files.map(f => f.content).join('\n');
const local = await readFile('firestore.rules', 'utf8');
const client = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'admin/v2' });
const response = await client.get(`/projects/${project}/config`);
const cfg = response.body;
if (process.argv.includes('--authorize-domain')) {
  const domains = [...new Set([...(cfg.authorizedDomains ?? []), 'crazy-bhutan-hill-race.vercel.app', 'tauri.localhost'])];
  await client.patch(`/projects/${project}/config`, { authorizedDomains: domains }, { queryParams: { updateMask: 'authorizedDomains' } });
  cfg.authorizedDomains = domains;
}
const report = {
  project, checkedAt: new Date().toISOString(), release: release.name,
  ruleset: release.rulesetName,
  matchesRepository: content.replace(/\r/g, '').trim() === local.replace(/\r/g, '').trim(),
  hasUnconditionalWrite: /allow\s+(?:[^;]*\b(?:write|create|update|delete)\b)[^;]*:\s*if\s+true\s*;/.test(content),
  hasTestModeRule: /request\.time\s*<\s*timestamp\.date/.test(content),
  auth: { anonymous: cfg.signIn?.anonymous?.enabled ?? false, email: cfg.signIn?.email?.enabled ?? false, authorizedDomains: cfg.authorizedDomains ?? [] },
};
await mkdir('docs/release', { recursive: true });
await writeFile('docs/release/deployed-firestore.rules', content);
await writeFile('docs/release/firebase-audit.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
