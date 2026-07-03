## Why

The repo currently has both `package-lock.json` and `pnpm-lock.yaml` checked in, plus `AGENTS.md` and `README.md` instructions that assume `npm`. `.claude/settings.local.json` already whitelists the `pnpm` variants of the dev scripts, which is the only signal anyone is actually running pnpm day-to-day. Standardizing on pnpm removes the dual-lock-file ambiguity, lets us use pnpm-specific config (e.g. hoisting for the project's ESM + NodeNext resolution), and keeps install output consistent across machines.

## What Changes

- **Remove `package-lock.json`.** The authoritative lockfile going forward is `pnpm-lock.yaml`.
- **Add a project `.npmrc`** with `shamefully-hoist=true` so pnpm hoists all dependencies into a flat `node_modules/` the way npm does. This is required for the project's ESM + NodeNext import resolution (`from './config/index.js'` and friends) to work — pnpm's default non-hoisted layout breaks that without it.
- **Add a `packageManager` field** to `package.json` (e.g. `"packageManager": "pnpm@10.33.4"`) so Corepack-aware tools and the README agree on the pnpm version.
- **Update `README.md`** so every `npm install` / `npm run X` reference becomes the `pnpm` equivalent.
- **Update `AGENTS.md`** so the Commands table and the "Both `pnpm-lock.yaml` and `package-lock.json` are present" note are replaced with a clean pnpm-first statement.

## Capabilities

### New Capabilities

- `package-manager`: declares pnpm as the project's package manager, the lockfile that ships, and the runtime config that keeps the ESM toolchain working under pnpm.

### Modified Capabilities

_None._

## Impact

- **Files removed:** `package-lock.json`.
- **Files added:** `.npmrc` (one line: `shamefully-hoist=true`).
- **Files edited:** `package.json` (add `packageManager`), `README.md`, `AGENTS.md`.
- **No source code changes** in `src/`.
- **No dependency version changes** — every dep stays at its current range; only the install tool changes.
- **CI:** none in this repo, so no CI workflow edits.
- **Downstream consumers:** none. This is a developer-experience change.
