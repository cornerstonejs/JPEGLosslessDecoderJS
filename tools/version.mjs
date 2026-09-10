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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'package.json');
const CHANGELOG = path.join(ROOT, 'CHANGELOG.md');
const REPO_URL = 'https://github.com/cornerstonejs/JPEGLosslessDecoderJS';

// The release workflow commits with this subject and this author. Such a
// commit must never itself count towards the next bump.
const RELEASE_SUBJECT = 'chore(release): publish';
const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

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

// Which bump a single commit asks for, or null for a commit that releases
// nothing. This follows the same set that lerna's conventional-commits preset
// released on, which is what codecs' version.mjs preserves:
//   - a breaking change  -> major
//   - feat               -> minor
//   - fix, perf          -> patch
//   - anything else       -> no release
// So chore, docs, ci, test, refactor, style and build do not release on their
// own. A commit with no conventional prefix releases nothing either: this
// repository's older history is not conventional, and guessing at it would
// release on a commit that says only "remove map".
function bumpFor({ subject, body }) {
  const header = /^(?<type>[a-z]+)(?<scope>\([^)]*\))?(?<breaking>!)?:/i.exec(subject);
  if (!header) return null;

  // `feat!: ...` and a `BREAKING CHANGE:` footer both mean major. The footer
  // is matched at the start of a line so that a mention inside a sentence does
  // not trigger a major release.
  if (header.groups.breaking || /^BREAKING[ -]CHANGE:/m.test(body)) return 'major';

  const type = header.groups.type.toLowerCase();
  if (type === 'feat') return 'minor';
  if (type === 'fix' || type === 'perf') return 'patch';
  return null;
}

const RANK = { patch: 1, minor: 2, major: 3 };

function applyBump(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    throw new Error(`package.json version is not a plain x.y.z: ${version}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);

  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

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
