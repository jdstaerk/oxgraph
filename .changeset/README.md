# Changesets Workflow

Use changesets to describe release-relevant changes. Do not bump package versions by hand.

## Normal Development

After a feature or fix is ready, create a changeset:

```bash
pnpm changeset
```

Select the changed public packages, choose `patch`, `minor`, or `major`, and write a short changelog line. Commit the generated `.changeset/*.md` file with your code.

## Version PR

After changes land on `main`, the GitHub version workflow runs:

```bash
pnpm changeset version
```

This consumes the changeset files, updates package versions, updates changelogs, and opens a "Version Packages" PR. Review that PR, then merge it when the release notes and versions look correct.

## Publishing

Publishing is a separate release step. After the Version PR is merged, create and push a release tag:

```bash
git pull
git tag v0.2.0
git push origin v0.2.0
```

The publish workflow then builds the native NAPI binaries for macOS, Linux, and Windows, builds the UI/CLI, and runs:

```bash
pnpm changeset publish
```

`changeset publish` publishes only package versions that are not already on npm. Do not run it before the native artifacts and CLI build are ready.
