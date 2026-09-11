#!/usr/bin/env node
//
// Conventional-commit versioning for this package.
//
// The script only mutates files: it rewrites the version in package.json and
// prepends a section to CHANGELOG.md, then prints a machine-readable plan.
// Every git write (commit, tag, push) stays in .github/workflows/release.yml,
// so `--dry-run` here is safe against a dirty tree and shows exactly what a
// release would do. `cornerstonejs/codecs` splits tools/release/version.mjs
// and its release workflow the same way.
//
// It imports nothing but node builtins, so the release job needs no install.
//
// Usage:
//   node tools/version.mjs --dry-run     # print the plan, change nothing
//   node tools/version.mjs               # apply the plan
//   node tools/version.mjs --json        # print the plan as one JSON object

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyBump, BOT_EMAIL, bumpFor, RANK, RELEASE_SUBJECT } from './conventional.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const REPO_URL = 'https://github.com/cornerstonejs/JPEGLosslessDecoderJS';

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const asJson = argv.includes('--json');

const log = (...args) => {
  if (!asJson) console.log(...args);
};

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

// ---------------------------------------------------------------------------
// Where to start reading history
// ---------------------------------------------------------------------------

// The most recent v* tag reachable from HEAD. The release job creates one per
// release, so this is the previous release's commit. With no tag at all (a
// repository that has never released through this workflow) every commit
// counts, which is the conservative answer: it cannot miss a change.
function lastReleaseTag() {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*').trim();
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Conventional commits
// ---------------------------------------------------------------------------

// One record per commit since the tag. `%x00` separates the fields and `%x01`
// the records, because a commit body contains newlines and blank lines.
function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const raw = git('log', '--no-merges', '--format=%H%x00%an%x00%ae%x00%s%x00%b%x01', range);

  return raw
    .split('\x01')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, author, email, subject, body = ''] = entry.split('\x00');
      return { sha, author, email, subject, body };
    });
}

// bumpFor, applyBump and RANK come from ./conventional.mjs, which
// tools/check-pr-title.mjs shares. Under a squash merge the pull request title
// becomes the only commit subject on main, so the check and this script have to
// read the same rules.

// ---------------------------------------------------------------------------
// CHANGELOG
// ---------------------------------------------------------------------------

function changelogSection(version, commits) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [`## ${version} (${date})`, ''];

  const groups = [
    ['Breaking changes', (c) => c.bump === 'major'],
    ['Features', (c) => c.bump === 'minor'],
    ['Bug fixes', (c) => c.bump === 'patch'],
  ];

  for (const [title, match] of groups) {
    const picked = commits.filter(match);
    if (picked.length === 0) continue;

    lines.push(`### ${title}`, '');
    for (const commit of picked) {
      // Drop the conventional prefix from the entry text; the group heading
      // already says what kind of change it is.
      const text = commit.subject.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '');
      lines.push(`- ${text} ([${commit.sha.slice(0, 7)}](${REPO_URL}/commit/${commit.sha}))`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

function writeChangelog(section) {
  const header = '# Changelog\n\n';
  const existing = fs.existsSync(CHANGELOG) ? fs.readFileSync(CHANGELOG, 'utf8') : header;
  const body = existing.startsWith(header) ? existing.slice(header.length) : existing;
  fs.writeFileSync(CHANGELOG, `${header}${section}\n${body}`.replace(/\n{3,}$/, '\n'));
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const current = manifest.version;
const tag = lastReleaseTag();

const considered = commitsSince(tag).filter(
  (commit) => !(commit.subject.startsWith(RELEASE_SUBJECT) && commit.email === BOT_EMAIL),
);
const commits = considered.map((commit) => ({ ...commit, bump: bumpFor(commit) }));
const releasing = commits.filter((commit) => commit.bump);

log(`Current version: ${current}`);
log(`Since: ${tag || '(no release tag; reading all history)'}`);
log(`Commits considered: ${commits.length}, of which ${releasing.length} release`);

if (releasing.length === 0) {
  log('No releasing commit (feat, fix, perf or a breaking change). Nothing to do.');
  const plan = { release: false, current, next: current, bump: null, commits: [] };
  if (asJson) console.log(JSON.stringify(plan));
  process.exit(0);
}

const bump = releasing.reduce(
  (worst, commit) => (RANK[commit.bump] > RANK[worst] ? commit.bump : worst),
  'patch',
);
const next = applyBump(current, bump);

log(`Bump: ${bump}  ->  ${next}`);
for (const commit of releasing) {
  log(`  ${commit.bump.padEnd(5)} ${commit.sha.slice(0, 7)} ${commit.subject}`);
}

const plan = {
  release: true,
  current,
  next,
  bump,
  tag: `v${next}`,
  commits: releasing.map((c) => ({ sha: c.sha, subject: c.subject, bump: c.bump })),
};

if (!dryRun) {
  // Rewrite only the version line, so the rest of the manifest keeps its own
  // key order and formatting.
  const source = fs.readFileSync(MANIFEST, 'utf8');
  const replaced = source.replace(
    /^(\s*"version":\s*")[^"]+(",?\s*)$/m,
    (_match, before, after) => `${before}${next}${after}`,
  );
  if (replaced === source) {
    throw new Error('could not rewrite the "version" line in package.json');
  }
  fs.writeFileSync(MANIFEST, replaced);
  writeChangelog(changelogSection(next, releasing));
  log(`Wrote package.json and CHANGELOG.md for ${next}`);
} else {
  log('--dry-run: no file was changed');
}

if (asJson) console.log(JSON.stringify(plan));
