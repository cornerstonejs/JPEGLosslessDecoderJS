// The conventional-commit rules that decide a release, in one place.
//
// Two callers share this module, and they must agree:
//   - tools/version.mjs, which reads the commits on main and picks the version.
//   - tools/check-pr-title.mjs, which reads a pull request title.
//
// The second one exists because this repository squash merges. A squash merge
// writes ONE commit to main, and its subject is the pull request title, so the
// title is what decides the release. Pull request #1 showed the cost of that:
// seven commits, four of them `fix:`, merged under the title
// "chore: publish as @cornerstonejs/jpeg-lossless-decoder-js" — and `chore`
// releases nothing, so the release workflow correctly published nothing while
// the run still reported success.
//
// Node builtins only: the release job imports this without an install.

// The release workflow commits with this subject and this author. Such a
// commit must never count towards the next bump.
export const RELEASE_SUBJECT = 'chore(release): publish';
export const BOT_EMAIL = '41898282+github-actions[bot]@users.noreply.github.com';

// Types that release, and what they release. This is the set that lerna's
// conventional-commits preset released on, which is what
// `cornerstonejs/codecs` preserves in its own tools/release/version.mjs.
export const RELEASING_TYPES = {
  feat: 'minor',
  fix: 'patch',
  perf: 'patch',
};

// Types that are conventional, and deliberately release nothing on their own.
// A pull request titled with one of these is valid and publishes no version.
export const SILENT_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'refactor',
  'revert',
  'style',
  'test',
];

export const ALL_TYPES = [...Object.keys(RELEASING_TYPES), ...SILENT_TYPES].sort();

export const RANK = { patch: 1, minor: 2, major: 3 };

// Splits a conventional subject. Returns null when the subject does not have a
// conventional prefix at all.
export function parseSubject(subject) {
  const match = /^(?<type>[a-z]+)(?<scope>\(([^)]*)\))?(?<breaking>!)?:\s*(?<description>.+)$/i.exec(
    (subject || '').trim(),
  );
  if (!match) return null;

  return {
    type: match.groups.type.toLowerCase(),
    scope: match.groups.scope ? match.groups.scope.slice(1, -1) : null,
    breaking: Boolean(match.groups.breaking),
    description: match.groups.description.trim(),
  };
}

// Which bump a subject and body ask for, or null for no release.
//
// A subject with no conventional prefix releases nothing. This repository's
// older history is not conventional, and a guess at it would release on a
// commit that says only "remove map".
export function bumpFor({ subject, body = '' }) {
  const parsed = parseSubject(subject);
  if (!parsed) return null;

  // `feat!: ...` and a `BREAKING CHANGE:` footer both mean major. The footer is
  // matched at the start of a line, so that a mention inside a sentence does
  // not trigger a major release.
  if (parsed.breaking || /^BREAKING[ -]CHANGE:/m.test(body)) return 'major';

  return RELEASING_TYPES[parsed.type] ?? null;
}

export function applyBump(version, bump) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    throw new Error(`version is not a plain x.y.z: ${version}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);

  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
