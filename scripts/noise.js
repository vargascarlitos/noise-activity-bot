#!/usr/bin/env node
// scripts/noise.js
// Bot de "ruido" mínimo: commit + issue (open/close) + branch + PR + merge

const { execSync } = require('child_process');
const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const REPO_FULL = process.env.GITHUB_REPOSITORY; // owner/repo (lo inyecta Actions)

if (!GITHUB_TOKEN || !REPO_FULL) {
  console.error('Faltan variables: GITHUB_TOKEN o GITHUB_REPOSITORY.');
  process.exit(1);
}

const [OWNER, REPO] = REPO_FULL.split('/');
const API = 'https://api.github.com';
const nowISO = new Date().toISOString();
const randomChar = String.fromCharCode(97 + Math.floor(Math.random() * 26));

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

function detectDefaultBranch() {
  // 1) Si viene por env, usarla
  if (process.env.DEFAULT_BRANCH) return process.env.DEFAULT_BRANCH;
  // 2) Intentar detectar con git origin/HEAD
  try {
    const out = execSync('git symbolic-ref --short refs/remotes/origin/HEAD')
      .toString()
      .trim(); // ej: origin/main
    return out.replace(/^origin\//, '');
  } catch {
    return 'main';
  }
}

async function call(method, url, body) {
  const res = await fetch(`${API}${url}`, {
    method,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
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

(async () => {
  const defaultBranch = detectDefaultBranch();

  // Config git para el commit
  const GIT_USER_NAME = process.env.GIT_USER_NAME || "github-actions[bot]";
  const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || "github-actions[bot]@users.noreply.github.com";
  run(`git config user.name "${GIT_USER_NAME}"`);
  run(`git config user.email "${GIT_USER_EMAIL}"`);
  run(`git checkout ${defaultBranch}`);

  // 1) Tocar activity.log y commitear a la rama por defecto
  fs.appendFileSync('activity.log', `${nowISO} ${randomChar}\n`);
  run('git add activity.log');
  try {
    run(`git commit -m "chore(noise): ${nowISO}"`);
    run(`git push origin ${defaultBranch}`);
  } catch {
    console.log('Nada para commitear/pushear en la rama por defecto.');
  }

  // 2) Crear y cerrar un Issue
  const issue = await call('POST', `/repos/${OWNER}/${REPO}/issues`, {
    title: `Noisy issue ${nowISO}`,
    body: 'Autogenerado y autocerrado para mantener actividad.'
  });
  await call('PATCH', `/repos/${OWNER}/${REPO}/issues/${issue.number}`, { state: 'closed' });

  // 3) Crear rama y PR -> merge
  const branchName = `noise/${Date.now()}`;

  // Obtener SHA base de la rama por defecto
  const ref = await call('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${defaultBranch}`);
  const baseSha = ref.object.sha;

  // Crear ref de la rama
  await call('POST', `/repos/${OWNER}/${REPO}/git/refs`, {
    ref: `refs/heads/${branchName}`,
    sha: baseSha
  });

  // Crear un archivo nuevo por Contents API para evitar conflictos
  const filePath = `branches/${branchName}.txt`;
  const contentB64 = Buffer.from(`hello ${nowISO}\n`).toString('base64');
  await call('PUT', `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(filePath)}`, {
    message: `feat: add ${filePath}`,
    content: contentB64,
    branch: branchName
  });

  // Crear PR
  const pr = await call('POST', `/repos/${OWNER}/${REPO}/pulls`, {
    title: `Merge ${branchName}`,
    head: branchName,
    base: defaultBranch,
    body: 'PR automático para actividad.'
  });

  // Merge PR
  await call('PUT', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/merge`, {
    merge_method: 'merge'
  });

  // Borrar rama (best-effort)
  try {
    await call('DELETE', `/repos/${OWNER}/${REPO}/git/refs/heads/${branchName}`);
  } catch {
    console.log('No se pudo borrar la rama (ignorado).');
  }

  console.log('Ruido generado con éxito ✅');
})().catch(err => {
  console.error(err);
  process.exit(1);
});