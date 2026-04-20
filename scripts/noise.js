#!/usr/bin/env node
// scripts/noise.js
// Bot de actividad realista con distribución Poisson,
// semanas de vacación, y varianza día a día.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ===== Config/ENV =====
const GITHUB_TOKEN   = process.env.GITHUB_TOKEN;
const REPO_FULL      = process.env.GITHUB_REPOSITORY;
const DEFAULT_BRANCH = process.env.DEFAULT_BRANCH;
const GIT_USER_NAME  = process.env.GIT_USER_NAME  || 'github-actions[bot]';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'github-actions[bot]@users.noreply.github.com';

if (!GITHUB_TOKEN || !REPO_FULL) {
  console.error('Faltan variables: GITHUB_TOKEN o GITHUB_REPOSITORY.');
  process.exit(1);
}

const [OWNER, REPO] = REPO_FULL.split('/');
const API = 'https://api.github.com';

// ===== PRNG determinístico (Mulberry32) =====
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function daySeed(dateStr) { return mulberry32(hashString(dateStr)); }
function weekSeed(year, week) { return mulberry32(hashString(`${year}-W${week}`)); }

// ===== Poisson (Knuth) =====
function poissonSample(lambda, rng) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

// ===== Helpers de fecha (Paraguay UTC-4) =====
function getPYDate() {
  const now = new Date();
  const py = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  return py;
}

function formatDate(d) {
  return d.toISOString().slice(0, 10);
}

function getDayOfWeek(d) {
  return d.getUTCDay(); // 0=Dom, 1=Lun ... 6=Sab
}

function getISOWeek(d) {
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(((tmp - yearStart) / 86400000 + 1) / 7);
}

// ===== Pipeline de decisión =====
function isVacationWeek(year, week) {
  const rng = weekSeed(year, week);
  return rng() < 0.14; // ~1 semana off cada 7
}

function weekIntensity(year, week) {
  const rng = weekSeed(year, week);
  rng(); // skip vacation draw
  return 0.5 + rng() * 1.0; // [0.5, 1.5]
}

function isDayActive(dateStr, intensity) {
  const rng = daySeed(dateStr);
  const prob = Math.min(0.95, 0.68 * intensity);
  return rng() < prob;
}

function dayContributionCount(dateStr, intensity) {
  const rng = daySeed(dateStr);
  rng(); // skip active draw
  const lambda = Math.max(1.0, Math.min(6.0, 3.5 * intensity));
  const count = poissonSample(lambda, rng);
  return Math.max(1, Math.min(8, count));
}

function planActions(totalCount, dateStr) {
  const rng = daySeed(dateStr);
  rng(); rng(); // skip prior draws

  let commits = totalCount;
  let issues = 0;
  let prs = 0;

  if (totalCount >= 2 && rng() < 0.25) {
    issues = 1;
    commits--;
  }

  if (totalCount >= 3 && commits >= 2 && rng() < 0.15) {
    prs = 1;
    commits--;
  }

  return { commits, issues, prs };
}

// ===== Utils =====
function run(cmd) {
  return execSync(cmd, { stdio: 'inherit' });
}

function runOutput(cmd) {
  return execSync(cmd).toString().trim();
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

function sleepMs(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shortHash() {
  return Math.random().toString(36).slice(2, 8);
}

// ===== Contenido realista =====
const COMMIT_TARGETS = [
  { file: 'src/utils.js',          type: 'code' },
  { file: 'src/helpers.js',        type: 'code' },
  { file: 'src/index.js',          type: 'code' },
  { file: 'docs/notes.md',         type: 'docs' },
  { file: 'docs/changelog.md',     type: 'docs' },
  { file: 'config/settings.json',  type: 'config' },
  { file: 'tests/basic.test.js',   type: 'test' },
];

const MESSAGES = {
  code: [
    'refactor: clean up utility functions',
    'fix: handle edge case in parser',
    'feat: add validation helper',
    'refactor: simplify conditional logic',
    'fix: correct off-by-one error',
    'refactor: extract common pattern',
    'fix: null check on optional param',
    'perf: reduce unnecessary iterations',
  ],
  docs: [
    'docs: update project notes',
    'docs: clarify setup instructions',
    'docs: add usage examples',
    'docs: fix formatting in changelog',
    'docs: document new helper functions',
  ],
  config: [
    'chore: update config defaults',
    'chore: adjust settings',
    'chore: sync config values',
  ],
  test: [
    'test: add missing test case',
    'test: improve coverage for utils',
    'test: fix flaky assertion',
    'test: add edge case tests',
  ],
};

function generateContent(type) {
  const ts = new Date().toISOString();
  switch (type) {
    case 'code': return pick([
      `\n// Updated: ${ts}\nfunction validate(input) {\n  return input != null && input !== '';\n}\n`,
      `\n// Refactored: ${ts}\nfunction normalize(value) {\n  return String(value).trim().toLowerCase();\n}\n`,
      `\n// Added: ${ts}\nfunction clamp(n, min, max) {\n  return Math.max(min, Math.min(max, n));\n}\n`,
      `\n// Fix: ${ts}\nfunction safeParseInt(str, fallback) {\n  const n = parseInt(str, 10);\n  return Number.isFinite(n) ? n : fallback;\n}\n`,
      `\n// Helper: ${ts}\nfunction isEmpty(obj) {\n  return obj == null || Object.keys(obj).length === 0;\n}\n`,
    ]);
    case 'docs': return pick([
      `\n## Notes (${ts})\n\n- Reviewed module structure\n- Identified areas for improvement\n`,
      `\n### Update ${ts}\n\n- Minor documentation fixes\n- Clarified parameter descriptions\n`,
      `\n- ${ts}: Updated setup guide\n`,
    ]);
    case 'config': {
      const cfg = { version: shortHash(), updatedAt: ts, debug: false, logLevel: pick(['info', 'warn', 'error']) };
      return JSON.stringify(cfg, null, 2) + '\n';
    }
    case 'test': return pick([
      `\n// Test added: ${ts}\ndescribe('utils', () => {\n  it('should handle empty input', () => {\n    // placeholder\n  });\n});\n`,
      `\n// Coverage: ${ts}\ntest('edge case handling', () => {\n  expect(true).toBe(true);\n});\n`,
    ]);
    default: return `// ${ts}\n`;
  }
}

const ISSUE_TITLES = [
  'Investigate flaky test in CI',
  'Update dependency versions',
  'Review error handling in auth module',
  'Improve logging for debugging',
  'Clean up unused imports',
  'Add input validation for user endpoints',
  'Document API response formats',
  'Fix typo in configuration docs',
  'Optimize database query performance',
  'Add retry logic for network requests',
];

const ISSUE_BODIES = [
  'Noticed this while reviewing recent changes. Should be a quick fix.',
  'Low priority but would improve maintainability.',
  'Flagged during code review. Adding to backlog.',
  'Minor improvement that would help with debugging.',
];

const PR_TITLES = [
  'Refactor utility helpers',
  'Update config defaults',
  'Fix edge case in data parser',
  'Add unit tests for core module',
  'Clean up deprecated code paths',
  'Improve error messages',
  'Simplify validation logic',
  'Update documentation',
];

const PR_PREFIXES = ['fix', 'feat', 'refactor', 'chore', 'docs'];

// ===== Acciones =====
async function doCommit(defaultBranch) {
  const target = pick(COMMIT_TARGETS);
  const dir = path.dirname(target.file);
  fs.mkdirSync(dir, { recursive: true });

  const content = generateContent(target.type);
  if (target.type === 'config') {
    fs.writeFileSync(target.file, content);
  } else {
    fs.appendFileSync(target.file, content);
  }

  run(`git add "${target.file}"`);
  const msg = pick(MESSAGES[target.type]);
  try {
    run(`git commit -m "${msg}"`);
    run(`git push origin ${defaultBranch}`);
    console.log(`  Commit: "${msg}" -> ${target.file}`);
  } catch {
    console.log('  Nada nuevo para commitear.');
  }
}

async function doIssue() {
  const title = pick(ISSUE_TITLES);
  const body = pick(ISSUE_BODIES);
  const issue = await call('POST', `/repos/${OWNER}/${REPO}/issues`, { title, body });
  await call('PATCH', `/repos/${OWNER}/${REPO}/issues/${issue.number}`, { state: 'closed' });
  console.log(`  Issue #${issue.number}: "${title}" (abierto y cerrado)`);
}

async function doPR(defaultBranch) {
  const prefix = pick(PR_PREFIXES);
  const branchName = `${prefix}/${shortHash()}`;

  run(`git checkout -b ${branchName}`);
  run(`git push -u origin ${branchName}`);

  // Agregar archivo en la rama
  const target = pick(COMMIT_TARGETS);
  const content = generateContent(target.type);
  const filePath = target.file;
  const contentB64 = Buffer.from(content).toString('base64');

  await call('PUT', `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(filePath)}`, {
    message: `${prefix}: update ${path.basename(filePath)}`,
    content: contentB64,
    branch: branchName,
    committer: { name: GIT_USER_NAME, email: GIT_USER_EMAIL },
    author:    { name: GIT_USER_NAME, email: GIT_USER_EMAIL }
  });

  const title = pick(PR_TITLES);
  const pr = await call('POST', `/repos/${OWNER}/${REPO}/pulls`, {
    title,
    head: branchName,
    base: defaultBranch,
    body: pick(['Minor update.', 'Small improvement.', 'Cleanup pass.', 'Quick fix.'])
  });

  // Review comment
  try {
    await call('POST', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/reviews`, {
      body: pick(['LGTM', 'Looks good', 'Approved', 'Nice cleanup']),
      event: 'COMMENT'
    });
  } catch {
    console.log('  No se pudo dejar review (ignorado).');
  }

  // Merge
  await call('PUT', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/merge`, {
    merge_method: 'merge'
  });

  // Borrar rama
  try {
    await call('DELETE', `/repos/${OWNER}/${REPO}/git/refs/heads/${branchName}`);
  } catch {}

  console.log(`  PR #${pr.number}: "${title}" (${branchName} -> merge)`);

  // Volver a default branch
  run(`git checkout ${defaultBranch}`);
  run(`git pull origin ${defaultBranch}`);
}

// ===== Main =====
(async () => {
  const pyDate = getPYDate();
  const dateStr = formatDate(pyDate);
  const dow = getDayOfWeek(pyDate);
  const year = pyDate.getUTCFullYear();
  const week = getISOWeek(pyDate);

  console.log(`Fecha PY: ${dateStr} | Día: ${dow} | Semana: ${week}`);

  // Guard: fin de semana
  if (dow === 0 || dow === 6) {
    console.log('Fin de semana. Sin actividad.');
    process.exit(0);
  }

  // Guard: semana de vacación
  if (isVacationWeek(year, week)) {
    console.log('Semana de vacación. Sin actividad.');
    process.exit(0);
  }

  const intensity = weekIntensity(year, week);
  console.log(`Intensidad de la semana: ${intensity.toFixed(2)}`);

  // Guard: día inactivo
  if (!isDayActive(dateStr, intensity)) {
    console.log('Día inactivo. Sin actividad.');
    process.exit(0);
  }

  const totalCount = dayContributionCount(dateStr, intensity);
  const plan = planActions(totalCount, dateStr);
  console.log(`Plan: ${totalCount} contribuciones -> ${plan.commits} commits, ${plan.issues} issues, ${plan.prs} PRs`);

  // Config git
  const defaultBranch = detectDefaultBranch();
  run(`git config user.name "${GIT_USER_NAME}"`);
  run(`git config user.email "${GIT_USER_EMAIL}"`);
  run(`git checkout ${defaultBranch}`);
  run(`git pull origin ${defaultBranch}`);

  // Construir lista de acciones y mezclar
  const actions = [];
  for (let i = 0; i < plan.commits; i++) actions.push('commit');
  for (let i = 0; i < plan.issues; i++) actions.push('issue');
  for (let i = 0; i < plan.prs; i++) actions.push('pr');

  // Shuffle (Fisher-Yates)
  for (let i = actions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [actions[i], actions[j]] = [actions[j], actions[i]];
  }

  // Ejecutar con delays
  for (let i = 0; i < actions.length; i++) {
    if (i > 0) {
      const delayMin = 5 + Math.floor(Math.random() * 26); // 5-30 min
      console.log(`Esperando ${delayMin} minutos...`);
      await sleepMs(delayMin * 60 * 1000);
    }

    console.log(`Acción ${i + 1}/${actions.length}: ${actions[i]}`);
    switch (actions[i]) {
      case 'commit': await doCommit(defaultBranch); break;
      case 'issue':  await doIssue(); break;
      case 'pr':     await doPR(defaultBranch); break;
    }
  }

  console.log('Ciclo completado.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
