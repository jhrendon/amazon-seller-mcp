## Context

`pnpm-lock.yaml` is committed today alongside `package-lock.json`. Anyone running `pnpm install` gets the pnpm layout, anyone running `npm install` regenerates the npm lockfile. That double-source-of-truth has already drifted: the pnpm lockfile reflects the modern toolchain state (e.g. `pnpm` 10.33.4 is installed locally), the npm lockfile is the older npm-generated artifact. The right move is to commit to pnpm.

The wrinkle is that this project uses ESM + NodeNext with relative `.js` import suffixes (`from './config/index.js'`). pnpm's default is to nest dependencies in `node_modules/.pnpm/<pkg>@<v>/node_modules/<pkg>` and only expose top-level deps at `node_modules/<pkg>`. With `moduleResolution: NodeNext`, that nesting can still resolve — but historically, a few transitive packages and pnpm's own symlink layout have caused `ERR_MODULE_NOT_FOUND` on otherwise-correct imports. `shamefully-hoist=true` makes pnpm hoist everything into a flat `node_modules/` so the resolution path is identical to npm. It's a single line that removes a class of bugs.

## Goals / Non-Goals

**Goals:**
- Make pnpm the one true package manager; delete the npm lockfile.
- Make `pnpm install` produce a working install on a fresh clone without manual fixups.
- Pin the pnpm version in `package.json` so Corepack / docs align.
- Update every README and AGENTS.md reference that currently says `npm`.

**Non-Goals:**
- No source code changes. No `src/**` edits.
- No dependency version bumps. Every dep stays at its current range.
- No introduction of pnpm-specific workspace features (this isn't a monorepo).
- No switch to a different package manager (yarn, bun). pnpm only.
- No CI workflow changes (there is no CI in this repo).

## Decisions

### D1. `shamefully-hoist=true` in a project `.npmrc`

`.npmrc` is a one-line file: `shamefully-hoist=true`. This is pnpm's "make me work like npm" switch — every dep, including transitive ones, is hoisted into a flat `node_modules/`. The downside (bigger `node_modules`, loss of pnpm's strict isolation) is acceptable here because:
- The repo is a single package, not a monorepo, so isolation between workspace packages is irrelevant.
- The `axios` supply-chain story already lives outside pnpm; the safety net for bad transitive deps is the lockfile + `axios@1.14.0` pin, not pnpm isolation.
- The ESM/NodeNext resolution has to work cleanly, and `shamefully-hoist` is the smallest config that guarantees that.

*Alternative considered:* `public-hoist-pattern[]=*@*/*` or a targeted hoist for `@modelcontextprotocol/sdk`. Rejected: more moving parts, and the MCP SDK isn't the only ESM-resolving dep (zod and axios both ship ESM).

### D2. Pin pnpm via the `packageManager` field in `package.json`

Add `"packageManager": "pnpm@10.33.4"` to `package.json`. This is the version locally installed, so a fresh clone with Corepack enabled will install exactly the pnpm we tested with. (The exact version can be relaxed later if we want contributors to auto-pick up newer pnpm; the value here is consistency for now.)

*Alternative considered:* omit `packageManager` and rely on docs. Rejected: one extra line is cheap insurance and tells Corepack exactly what to use.

### D3. Delete `package-lock.json`, keep `pnpm-lock.yaml`

The pnpm lockfile is the source of truth going forward. `package-lock.json` is removed. `.gitignore` does not list either lockfile, so no `.gitignore` change is needed.

### D4. Update `README.md` and `AGENTS.md`, but not `.claude/settings.local.json`

`README.md` currently shows `npm install`, `npm run build`, `npm run dev`, etc. — all become `pnpm install`, `pnpm run build`, `pnpm run dev` (or just `pnpm build`, `pnpm dev` — pnpm supports the short form because scripts are auto-discovered). We use the long form (`pnpm run X`) to mirror how the existing `npm` commands are written, so the diff stays minimal.

`AGENTS.md` has a "Both `pnpm-lock.yaml` and `package-lock.json` are present; `npm` works fine" note in the Commands table — that goes away, replaced with a one-liner that pnpm is the package manager.

`.claude/settings.local.json` already whitelists the pnpm variants and is left alone.

### D5. Do not touch the `engines` field

`package.json` already has `"engines": { "node": ">=18.0.0" }`. Leave it. `packageManager` is a separate field and pnpm enforces its own version, not the engine.

## Risks / Trade-offs

- **Risk:** a contributor with only `npm` installed runs `npm install` and silently regenerates `package-lock.json`, undoing the migration. → **Mitigation:** the `packageManager` field makes Corepack block the wrong PM with a clear error. Add a one-liner to `AGENTS.md` saying "do not run `npm install`". If a contributor has no Corepack, mention `corepack enable pnpm` in the README.
- **Risk:** `shamefully-hoist=true` defeats pnpm's strict dep isolation, so phantom-dep bugs are theoretically possible. → **Mitigation:** the lockfile pins every transitive version, and the only dep we explicitly worry about (`axios`) is pinned to `1.14.0`. The risk is acceptable for a single-package project.
- **Risk:** the pnpm version pinned in `packageManager` is a moving target; pinning to `10.33.4` will eventually go stale. → **Mitigation:** intentional. Bump as needed. The alternative (no pin) means different contributors run different pnpm versions and may regenerate the lockfile in subtly different ways.
- **Risk:** `pnpm install` with `shamefully-hoist=true` produces a larger `node_modules/` than the strict default, slowing install. → **Mitigation:** negligible at this scale (~tens of packages). Not a concern.
- **Risk:** the smoke-test scripts `test-*.mjs` in repo root import from `./build/...` and assume a built artifact exists. If a contributor runs them before `pnpm run build`, they fail. → **Mitigation:** unrelated to this change — this risk exists today. Out of scope.

## Migration Plan

1. Add `.npmrc` with `shamefully-hoist=true`.
2. Add `packageManager: "pnpm@10.33.4"` to `package.json`.
3. Delete `package-lock.json`.
4. Run `pnpm install` to confirm the lockfile and `node_modules/` are healthy.
5. Run `pnpm run build`, `pnpm run typecheck` (after `modernize-toolchain-and-mcp-sdk` lands — for now just `pnpm run build`), `pnpm run lint`, `pnpm test`, `pnpm run test:coverage`. All must succeed.
6. Update `README.md` and `AGENTS.md`.
7. Optional smoke test: `pnpm run build` then `node test-api.mjs` against a populated `.env`.

**Rollback:** delete `.npmrc`, remove the `packageManager` line, restore `package-lock.json` from git history, revert README/AGENTS.md. No data loss.

## Open Questions

- None blocking. The one soft question is whether to add `engines.pnpm` alongside the `packageManager` field — but `engines` is for runtime, not the package manager, and pnpm itself enforces its own version, so we skip it.
