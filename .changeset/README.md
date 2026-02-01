# Changesets

This directory contains changeset files. Changesets are a way to manage versioning and changelogs in a monorepo.

## How to add a changeset

```bash
pnpm changeset
```

Follow the prompts to:
1. Select which packages have changes
2. Choose the version bump type (major, minor, patch)
3. Provide a summary of the changes

## How releases work

1. Developer adds changesets for their changes
2. Changesets are committed alongside code changes
3. When merged to `main`, the publish workflow:
   - Bumps package versions
   - Updates CHANGELOGs
   - Creates a release PR
4. When release PR is merged:
   - Packages are published to NPM
   - Git tags are created
   - GitHub releases are generated

For more information, visit https://github.com/changesets/changesets
