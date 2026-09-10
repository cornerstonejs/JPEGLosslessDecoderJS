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

- `overrides.tsup.esbuild` holds esbuild at `0.19.7`. esbuild emits the bundle,
  and a different esbuild emits different JavaScript for the same source. The
  pin lets `npm audit fix` update the test tools without a change to the
  published artifact. `cornerstonejs/codecs` pins esbuild for the same reason.
- `typescript` uses `~5.4.3`, not `^5.4.3`. TypeScript 5.7 made
  `ArrayBufferLike` stop satisfying `ArrayBuffer`, and `src/decoder.ts` line 93
  then fails to compile, which fails the declaration build. Raise the pin
  together with the type annotations in `src/`.

### Publishing
`.github/workflows/release.yml` publishes to npm on each push to `main`, but
only when the version in `package.json` is not on the registry yet. Any other
push to `main` is a no-op. To release, raise the version in `package.json` and
merge that change.

The workflow authenticates with npm through OIDC trusted publishing. It uses a
short-lived token that npm mints for each run and scopes to this workflow file,
so this repository holds no `NPM_TOKEN`. The name of the workflow file is part
of that configuration: rename the file, and npm refuses the exchange.

**The first publish of a new package name must be manual.** npm cannot create a
package that does not exist yet through trusted publishing. A maintainer with
publish rights on the `@cornerstonejs` scope does this once:

```bash
npm login                       # a web login session, not an access token
npm ci
npm run lint && npm run test
npm publish                     # prepublishOnly runs the build first
```

Then register this workflow as the package's trusted publisher, so that later
releases need no token:

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

### Acknowledgments
This decoder was originally written by Helmut Dersch for Java.  I added support for selection values 2 through 7, contributed bug fixes and ported to JavaScript.

Also thanks to [@jens-ox](https://github.com/jens-ox) for modernizing this package to TypeScript.
