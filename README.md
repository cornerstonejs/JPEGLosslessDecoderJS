JPEGLosslessDecoderJS
=====
A common DICOM compression format is JPEG Lossless.  This format is generally not supported in standard JPEG decoder libraries. 

This decoder can read data from the following DICOM transfer syntaxes:

- 1.2.840.10008.1.2.4.57    JPEG Lossless, Nonhierarchical (Processes 14)
- 1.2.840.10008.1.2.4.70    JPEG Lossless, Nonhierarchical (Processes 14 [Selection 1])

### Usage
[API](https://github.com/rii-mango/JPEGLosslessDecoderJS/wiki/API) and [more examples](https://github.com/cornerstonejs/JPEGLosslessDecoderJS/tree/main/tests)

```javascript
var decoder = new jpeg.lossless.Decoder();
var output = decoder.decompress(buffer [, offset [, length]]);

// Parameters
// {ArrayBuffer} buffer
// {Number} offset offset into buffer (default = 0)
// {Number} length length of buffer (default = end of JPEG block)

// Returns
// {ArrayBuffer} output (size = cols * rows * bytesPerComponent * numComponents)
```

### Install
Install this fork via [NPM](https://www.npmjs.com/):

```
npm install @cornerstonejs/jpeg-lossless-decoder-js
```

This fork adds the byte-aligned-end-of-scan fix. The unscoped
`jpeg-lossless-decoder-js@2.1.2` on npm drops the final sample of any frame
whose last Huffman code ends exactly on a byte boundary, so a real CT image
decodes with a wrong last pixel.

### Testing
```
npm test
```

### Building
```
npm run build
```
This writes `lossless.js` and `lossless-min.js`, together with the declaration
files and the source maps, to `/release`.

`release/` is build output and git ignores it. Do not commit it. A committed
`release/` could never be complete, because the same `.gitignore` also excludes
the source maps and the declaration files that one build emits. Commit
`03bb80c0` showed the cost: its committed `release/cjs/lossless.cjs` was still
the 2.1.2 build, and it did not hold the fix that the same commit added to
`src/`.

Two versions in `package.json` are held on purpose, and each one keeps the
build stable:

- `overrides.esbuild` holds esbuild at `0.19.7`. esbuild emits the bundle, and
  a different esbuild emits different JavaScript for the same source. The pin
  lets `npm audit fix` update the test tools without a change to the published
  artifact. `cornerstonejs/codecs` pins esbuild for the same reason.

  The pin covers the whole tree on purpose. A pin of `tsup` alone, as
  `overrides.tsup.esbuild`, makes npm 10 and npm 11 build different trees —
  npm 11 collapses the tree onto 0.19.7 and npm 10 keeps vite's esbuild
  0.28.2 beside it — and then one lockfile cannot serve both. With this flat
  pin, npm 10.8, npm 10.9 and npm 11.19 all install the same lockfile.
- `typescript` uses `~5.4.3`, not `^5.4.3`. TypeScript 5.7 made
  `ArrayBufferLike` stop satisfying `ArrayBuffer`, and `src/decoder.ts` line 93
  then fails to compile, which fails the declaration build. Raise the pin
  together with the type annotations in `src/`.

### Publishing

**The pull request title decides the release.** This repository squash merges,
so a merge writes one commit to `main` and the title of the pull request is
that commit's subject. `.github/workflows/release.yml` reads the subject and
picks the version. You do not edit the version by hand.

| title | bump |
| --- | --- |
| `feat!: …`, or a `BREAKING CHANGE:` footer | major |
| `feat: …` | minor |
| `fix: …`, `perf: …` | patch |
| `build:`, `chore:`, `ci:`, `docs:`, `refactor:`, `revert:`, `style:`, `test:` | no release |
| no conventional prefix | rejected before merge |

A title with a type in the fourth row is valid and publishes nothing, which is
right for a change that does not reach the package.

`.github/workflows/pr-title.yml` checks the title on every pull request, and it
re-checks after an edit. It fails a title that is not conventional, and it
states the release a valid title will produce, so the outcome is visible before
the merge. Check a title locally with:

```bash
node tools/check-pr-title.mjs "fix: decode the last sample of a scan"
```

Pull request #1 is why the check exists. Seven commits, four of them `fix:`,
merged under the title `chore: publish as
@cornerstonejs/jpeg-lossless-decoder-js`. `chore` releases nothing, so the
release workflow published nothing — and the run still reported success,
because "nothing to release" is a legitimate green outcome. Only the registry
showed the mistake.

`tools/conventional.mjs` holds the rules that both the check and the release
read, so the two cannot drift apart.

When a release is due, the workflow writes the new version to `package.json`,
prepends a section to `CHANGELOG.md`, commits as
`chore(release): publish`, tags `v<version>`, publishes to npm, and creates the
GitHub release. The build job skips that release commit, so a release does not
start another release.

`tools/version.mjs` decides the version, and it only writes files. Ask it what
a release would do, at any time, against a dirty tree:

```bash
node tools/version.mjs --dry-run
```

Every git write stays in the workflow, so the script is safe to run locally.
`cornerstonejs/codecs` splits `tools/release/version.mjs` and its release
workflow the same way.

The workflow authenticates with npm through OIDC trusted publishing. It uses a
short-lived token that npm mints for each run and scopes to this workflow file,
so this repository holds no `NPM_TOKEN`. The name of the workflow file is part
of that configuration: rename the file, and npm refuses the exchange.

#### How this package was bootstrapped

The steps below are done. They are recorded because npm cannot create a package
name through trusted publishing, so the first publish of ANY new package name
has to be manual, and the next one starts here.

`2.2.0` was published by hand:

```bash
npm login                       # a web login session, not an access token
npm ci
npm run lint && npm test
npm publish                     # prepublishOnly runs the build first
```

This workflow was then registered as the package's trusted publisher, so that
later releases need no token:

```bash
npm trust github @cornerstonejs/jpeg-lossless-decoder-js \
  --repo cornerstonejs/JPEGLosslessDecoderJS \
  --file release.yml \
  --allow-publish --yes

npm trust list @cornerstonejs/jpeg-lossless-decoder-js   # confirm it
```

`npm trust` needs npm 11.15.0 or later, and it accepts a web-login session only
— a granular or classic access token in `~/.npmrc` fails with a 401, even
though the same token publishes without a problem.

`npm trust github` ADDS an authorized publishing path, and it revokes nothing.
Every access token that could publish this package before can still publish it
afterwards. To close that path, set the package's Publishing access on
npmjs.com to "Require two-factor authentication and disallow tokens".

Last, `v2.2.0` was tagged on `main`, because a manual publish creates no tag and
`tools/version.mjs` reads the commits since the last `v*` tag. Every later tag
comes from the workflow.

`2.2.0` carries no provenance attestation: npm generates one only for a trusted
publish from CI. Every version the workflow publishes has one.

### Acknowledgments
This decoder was originally written by Helmut Dersch for Java.  I added support for selection values 2 through 7, contributed bug fixes and ported to JavaScript.

Also thanks to [@jens-ox](https://github.com/jens-ox) for modernizing this package to TypeScript.
