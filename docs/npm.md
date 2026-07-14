# npm Distribution

The public package is `@voxstudio/docs-gardener`; its stable bin is `docs-gardener`. The package publishes the runtime JavaScript under `src/` directly, so it has no compiled output or `dist/` directory. Registry installation does not run `prepare`, `install`, or `postinstall`.

`.github/workflows/npm-publish.yml` verifies the package and publishes GitHub Releases through npm Trusted Publishing on a GitHub-hosted runner. It requires `id-token: write`, uses `next` for prereleases and `latest` for stable releases, and does not use a long-lived npm token. It must not use `actions/upload-artifact`, `gh release upload`, or GitHub Release assets.

The package must exist before npm can attach a trusted publisher. Bootstrap it once from the reviewed release commit with an authenticated local npm CLI and a prerelease version:

```bash
npm publish --access public --tag next
npm trust github @voxstudio/docs-gardener --file npm-publish.yml --repo voxServalG/docs-gardener --allow-publish
```

The first command publishes only to npm. After the trusted publisher is confirmed, future GitHub Releases use OIDC only. The release tag must equal `v` plus `package.json.version`.

Package and workflow boundaries are enforced by `test/package.test.js`.
