#!/usr/bin/env node
// scripts/noise.js
// Flujo con aleatoriedad "humana":
// 1) Commit con archivo/mensaje/volumen aleatorio
// 2) (prob.) Issue abierto/cerrado
// 3) (prob.) Rama -> PR -> review (comentario o approve con fallback) -> merge -> borrar rama

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ===== Config/ENV =====
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const REPO_FULL      = process.env.GITHUB_REPOSITORY; // owner/repo (lo inyecta Actions)
const DEFAULT_BRANCH = process.env.DEFAULT_BRANCH;    // opcional (si no, se detecta)
const GIT_USER_NAME  = process.env.GIT_USER_NAME  || 'github-actions[bot]';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'github-actions[bot]@users.noreply.github.com';

const DO_ISSUE_PROB  = clampPct(process.env.DO_ISSUE_PROB ?? '100'); // 0..100
const DO_PR_PROB     = clampPct(process.env.DO_PR_PROB ?? '100');    // 0..100
const APPROVE_PR     = process.env.APPROVE_PR === '1';               // si intentamos APPROVE primero

if (!GITHUB_TOKEN || !REPO_FULL) {
  console.error('Faltan variables: GITHUB_TOKEN o GITHUB_REPOSITORY.');
  process.exit(1);
}

const [OWNER, REPO] = REPO_FULL.split('/');
const API = 'https://api.github.com';
const now = new Date();
const nowISO = now.toISOString();

// Mensajes y archivos variados para que no sea repetitivo
const COMMIT_MESSAGES = [
  'chore: update log',
  'chore(noise): tick',
  'docs: note added',
  'style: whitespace tweak',
  'meta: keepalive',
  `chore(noise): ${nowISO}`
];

const TOUCH_CANDIDATES = [
  'activity.log',
  'notes/noise.md',
  'data/keepalive.txt'
];

// ===== Utils =====
function run(cmd) {
  return execSync(cmd, { stdio: 'inherit' });
}

function detectDefaultBranch() {
  if (DEFAULT_BRANCH) return DEFAULT_BRANCH;
  try {
    const out = execSync('git remote show origin').toString();
    const m = out.match(/HEAD branch:\s+(.+)/);
    if (m) return m[1].trim();
  } catch {}
  return 'main';
}

function chance(pct) {
  const p = clampPct(pct);
  return Math.floor(Math.random() * 100) < p;
}

function clampPct(x) {
  const n = Math.max(0, Math.min(100, Number(x)));
  return Number.isFinite(n) ? n : 0;
}

async function call(method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'noise-bot'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${url} -> ${res.status} ${text}`);
  }
  return res.status === 204 ? {} : res.json();
}

// ===== Main =====
(async () => {
  const defaultBranch = detectDefaultBranch();

  // Config git (para que el autor/committer salga con tu usuario si usas PAT + email verificado/noreply)
  run(`git config user.name "${GIT_USER_NAME}"`);
  run(`git config user.email "${GIT_USER_EMAIL}"`);
  run(`git checkout ${defaultBranch}`);

  // 1) Commit "humano": archivo al azar + 1-3 líneas con pequeñas variaciones
  const fileToTouch = TOUCH_CANDIDATES[Math.floor(Math.random() * TOUCH_CANDIDATES.length)];
  fs.mkdirSync(path.dirname(fileToTouch), { recursive: true });

  const lines = 1 + Math.floor(Math.random() * 3); // 1..3
  let payload = '';
  for (let i = 0; i < lines; i++) {
    const token = Math.random().toString(36).slice(2, 6);
    const ch = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    payload += `${nowISO} ${ch} ${token}\n`;
  }
  fs.appendFileSync(fileToTouch, payload);
  run(`git add "${fileToTouch}"`);

  const commitMsg = COMMIT_MESSAGES[Math.floor(Math.random() * COMMIT_MESSAGES.length)];
  try {
    run(`git commit -m "${commitMsg}"`);
    run(`git push origin ${defaultBranch}`);
  } catch {
    console.log('Nada nuevo para commitear/pushear en la rama por defecto.');
  }

  // 2) Issue (probabilístico)
  if (chance(DO_ISSUE_PROB)) {
    const issue = await call('POST', `/repos/${OWNER}/${REPO}/issues`, {
      title: issueTitle(),
      body: 'Autogenerado y autocerrado (ruido).'
    });
    await call('PATCH', `/repos/${OWNER}/${REPO}/issues/${issue.number}`, { state: 'closed' });
  } else {
    console.log('Salté issue en este ciclo.');
  }

  // 3) PR/merge (probabilístico)
  if (chance(DO_PR_PROB)) {
    // Crear rama con git (evita 403 de /git/refs con algunos PAT fine-grained)
    const branchName = `noise/${Date.now()}`;
    run(`git checkout -b ${branchName}`);
    run(`git push -u origin ${branchName}`);

    // Añadir un archivo en la rama vía Contents API (otro commit visible en el PR)
    const filePath = `branches/${branchName}.txt`;
    const contentB64 = Buffer.from(`hello ${nowISO}\n`).toString('base64');
    await call('PUT', `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(filePath)}`, {
      message: `feat: add ${filePath}`,
      content: contentB64,
      branch: branchName,
      committer: { name: GIT_USER_NAME, email: GIT_USER_EMAIL },
      author:    { name: GIT_USER_NAME, email: GIT_USER_EMAIL }
    });

    // Crear PR
    const pr = await call('POST', `/repos/${OWNER}/${REPO}/pulls`, {
      title: prTitle(branchName),
      head: branchName,
      base: defaultBranch,
      body: 'PR automático (ruido).'
    });

    // Review automático (approve si se pidió; fallback a comment si sos el autor)
    await leaveReview(pr.number);

    // Merge del PR
    await call('PUT', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/merge`, {
      merge_method: 'merge'
    });

    // Borrar rama remota (best-effort)
    try {
      await call('DELETE', `/repos/${OWNER}/${REPO}/git/refs/heads/${branchName}`);
    } catch {
      console.log('No se pudo borrar la rama (ignorado).');
    }
  } else {
    console.log('Salté PR/merge en este ciclo.');
  }

  console.log('Ciclo completado con aleatoriedad ✅');
})().catch(err => {
  console.error(err);
  process.exit(1);
});

// ===== Helpers de variación =====
function issueTitle() {
  const pool = [
    'Chore: keepalive tick',
    'Maintenance: housekeeping',
    'Docs: add minor note',
    'Style: spacing/whitespace',
    'Meta: background activity'
  ];
  return pool[Math.floor(Math.random() * pool.length)] + ` (${new Date().toISOString()})`;
}

function prTitle(branchName) {
  const pool = [
    `Merge ${branchName}`,
    'Minor housekeeping',
    'Maintenance PR',
    'Keep repo fresh',
    'Routine update'
  ];
  return pool[Math.floor(Math.random() * pool.length)];
}

async function leaveReview(prNumber) {
  const body = `Auto-review: ${APPROVE_PR ? 'LGTM ✅' : 'Comentario 👀'}\n\nTimestamp: ${new Date().toISOString()}`;
  try {
    await call('POST', `/repos/${OWNER}/${REPO}/pulls/${prNumber}/reviews`, {
      body,
      event: APPROVE_PR ? 'APPROVE' : 'COMMENT'
    });
  } catch (e) {
    const msg = String(e.message || '');
    // Fallback si no se puede aprobar el propio PR
    if (APPROVE_PR && msg.includes('Can not approve your own pull request')) {
      console.log('No se puede aprobar el propio PR. Dejo comentario en su lugar.');
      await call('POST', `/repos/${OWNER}/${REPO}/pulls/${prNumber}/reviews`, {
        body: `Auto-review (fallback a comentario) 👀\n\nTimestamp: ${new Date().toISOString()}`,
        event: 'COMMENT'
      });
    } else {
      console.log('No pude dejar review (continúo):', msg);
    }
  }
}