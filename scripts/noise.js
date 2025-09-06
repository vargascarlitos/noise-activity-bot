#!/usr/bin/env node
// scripts/noise.js
// Flujo: commit ruido -> issue (open/close) -> branch -> PR -> review -> merge -> delete branch

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

const GIT_USER_NAME = process.env.GIT_USER_NAME || 'github-actions[bot]';
const GIT_USER_EMAIL = process.env.GIT_USER_EMAIL || 'github-actions[bot]@users.noreply.github.com';
const REQUEST_REVIEWERS = (process.env.REQUEST_REVIEWERS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
const APPROVE_PR = process.env.APPROVE_PR === '1';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

function detectDefaultBranch() {
    if (process.env.DEFAULT_BRANCH) return process.env.DEFAULT_BRANCH;
    try {
        const out = execSync('git remote show origin').toString();
        const m = out.match(/HEAD branch:\s+(.+)/);
        if (m) return m[1].trim();
    } catch { }
    return 'main';
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

    // Config git (autor/committer saldrá con tu usuario si usas PAT + email verificado/noreply)
    run(`git config user.name "${GIT_USER_NAME}"`);
    run(`git config user.email "${GIT_USER_EMAIL}"`);
    run(`git checkout ${defaultBranch}`);

    // 1) Commit "ruido" a la rama por defecto
    fs.appendFileSync('activity.log', `${nowISO} ${randomChar}\n`);
    run('git add activity.log');
    try {
        run(`git commit -m "chore(noise): ${nowISO}"`);
        run(`git push origin ${defaultBranch}`);
    } catch {
        console.log('Nada nuevo para commitear/pushear en la rama por defecto.');
    }

    // 2) Crear y cerrar un Issue (actividad visible en Issues)
    const issue = await call('POST', `/repos/${OWNER}/${REPO}/issues`, {
        title: `Noisy issue ${nowISO}`,
        body: 'Autogenerado y autocerrado para mantener actividad.'
    });
    await call('PATCH', `/repos/${OWNER}/${REPO}/issues/${issue.number}`, { state: 'closed' });

    // 3) Crear rama con git (evita 403 de /git/refs con algunos PAT fine-grained)
    const branchName = `noise/${Date.now()}`;
    run(`git checkout -b ${branchName}`);
    run(`git push -u origin ${branchName}`);

    // 4) Añadir un archivo en la rama vía Contents API (otro commit visible en el PR)
    const filePath = `branches/${branchName}.txt`;
    const contentB64 = Buffer.from(`hello ${nowISO}\n`).toString('base64');
    await call('PUT', `/repos/${OWNER}/${REPO}/contents/${encodeURIComponent(filePath)}`, {
        message: `feat: add ${filePath}`,
        content: contentB64,
        branch: branchName,
        committer: { name: GIT_USER_NAME, email: GIT_USER_EMAIL },
        author: { name: GIT_USER_NAME, email: GIT_USER_EMAIL },
    });

    // 5) Crear PR
    const pr = await call('POST', `/repos/${OWNER}/${REPO}/pulls`, {
        title: `Merge ${branchName}`,
        head: branchName,
        base: defaultBranch,
        body: 'PR automático para actividad.'
    });

    // 5.a) (Opcional) Solicitar reviewers visibles
    if (REQUEST_REVIEWERS.length) {
        try {
            await call('POST', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/requested_reviewers`, {
                reviewers: REQUEST_REVIEWERS
            });
        } catch (e) {
            console.log('No pude solicitar reviewers (ignorado):', e.message);
        }
    }

    // 5.b) Dejar un "code review" automático (COMMENT o APPROVE)
    await call('POST', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/reviews`, {
        body: `Auto-review: ${APPROVE_PR ? 'LGTM ✅' : 'Comentario 👀'}\n\nTimestamp: ${nowISO}`,
        event: APPROVE_PR ? 'APPROVE' : 'COMMENT'
    });

    // 6) Merge del PR
    await call('PUT', `/repos/${OWNER}/${REPO}/pulls/${pr.number}/merge`, {
        merge_method: 'merge'
    });

    // 7) Borrar rama remota (best-effort)
    try {
        await call('DELETE', `/repos/${OWNER}/${REPO}/git/refs/heads/${branchName}`);
    } catch {
        console.log('No se pudo borrar la rama (ignorado).');
    }

    console.log('Ruido + review + merge generados con éxito ✅');
})().catch(err => {
    console.error(err);
    process.exit(1);
});