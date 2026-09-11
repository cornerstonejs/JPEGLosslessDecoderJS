#!/usr/bin/env node
//
// Check that a pull request title is a conventional-commit subject, and say
// which release it will produce.
//
// This repository squash merges, so a merge writes ONE commit to main and its
// subject is the pull request title. tools/version.mjs then reads that subject
// to pick the next version. The title is therefore the release contract, and
// this check is what makes the contract visible BEFORE the merge rather than
// after it.
//
// Pull request #1 is why this exists: seven commits, four of them `fix:`,
// squashed under the title "chore: publish as
// @cornerstonejs/jpeg-lossless-decoder-js". `chore` releases nothing, so the
// release workflow published nothing and still reported success.
//
// Usage:
//   node tools/check-pr-title.mjs "feat: add a thing"
//   PR_TITLE="feat: add a thing" node tools/check-pr-title.mjs

import { ALL_TYPES, bumpFor, parseSubject, RELEASING_TYPES, SILENT_TYPES } from './conventional.mjs';

const title = (process.argv[2] ?? process.env.PR_TITLE ?? '').trim();

// GitHub Actions renders these so the message lands on the pull request's
// checks rather than only in the log. Outside Actions they are harmless text.
const fail = (message) => {
  console.log(`::error::${message}`);
};

if (!title) {
  fail('No pull request title was given (pass it as an argument or set PR_TITLE).');
  process.exit(1);
}

console.log(`Title: ${title}`);

const parsed = parseSubject(title);

if (!parsed) {
  fail(
    'The pull request title is not a conventional-commit subject. ' +
      'Use "<type>: <description>", for example "fix: decode the last sample of a scan".',
  );
  console.log('');
  console.log('This repository squash merges, so this title becomes the only commit');
  console.log('subject on main, and tools/version.mjs reads it to pick the next version.');
  console.log('');
  console.log(`Types that release:      ${Object.keys(RELEASING_TYPES).sort().join(', ')}`);
  console.log(`Types that release none: ${SILENT_TYPES.join(', ')}`);
  console.log('Add "!" before the colon, or a "BREAKING CHANGE:" footer, for a major release.');
  process.exit(1);
}

if (!ALL_TYPES.includes(parsed.type)) {
  fail(
    `"${parsed.type}" is not a known type. Use one of: ${ALL_TYPES.join(', ')}. ` +
      'A type outside that list releases nothing, silently.',
  );
  process.exit(1);
}

// A title that parses but says nothing is a title that will read badly in the
// CHANGELOG, because the description IS the changelog entry.
if (parsed.description.length < 10) {
  fail(
    `The description "${parsed.description}" is too short. It becomes this release's ` +
      'CHANGELOG entry, so write what changed.',
  );
  process.exit(1);
}

const bump = bumpFor({ subject: title });

if (bump) {
  console.log(`::notice::This title releases a ${bump} version when it merges.`);
} else {
  console.log(
    `::notice::"${parsed.type}" releases no version. That is valid — the merge publishes nothing.`,
  );
}
