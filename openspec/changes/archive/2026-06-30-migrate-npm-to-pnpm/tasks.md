## 1. Add pnpm runtime config

- [x] 1.1 Create `.npmrc` in the repository root with the single line `shamefully-hoist=true`. No other content.
- [x] 1.2 In `package.json`, add a top-level field `"packageManager": "pnpm@10.33.4"`. Do not touch `engines`, `dependencies`, `devDependencies`, or `scripts`.

## 2. Remove the npm lockfile

- [x] 2.1 Delete `package-lock.json` from the repository root.
- [x] 2.2 Confirm `pnpm-lock.yaml` is still present and unchanged at this point (no install yet).
- [x] 2.3 Run `git status` (or equivalent) and confirm only `package-lock.json` is staged for deletion, plus the new `.npmrc` and the edited `package.json`.

## 3. Verify pnpm install

- [x] 3.1 Run `pnpm install` to regenerate `node_modules/` against `pnpm-lock.yaml` under the new `.npmrc`.
- [x] 3.2 Confirm `node_modules/` is now a flat layout: `node_modules/zod`, `node_modules/axios`, `node_modules/@modelcontextprotocol` all exist at the top level (no `.pnpm/`-only nesting blocking resolution).
- [x] 3.3 Run `pnpm run build` and confirm zero TypeScript errors.
- [x] 3.4 Run `pnpm run lint` — fails with "No files matching the pattern 'tests' were found." Pre-existing failure documented in `AGENTS.md` (no `tests/` dir). Not a regression from this migration; same behavior under `npm`. Fixing it is out of scope for this change.
- [x] 3.5 Run `pnpm test` — zero tests today; expected per `tasks.md` design (lands with `modernize-toolchain-and-mcp-sdk`). Not a regression.

## 4. Update README.md

- [x] 4.1 In the `## Installation` section, replace the `git clone` / `cd` / `npm install` / `npm run build` block with the pnpm equivalent (`pnpm install`, `pnpm run build`).
- [x] 4.2 In the `## Development` section, replace each `npm run <script>` line with `pnpm run <script>` (`dev`, `build`, `test`, `test:coverage`, `lint`, `format`).
- [x] 4.3 Grep the whole `README.md` for any remaining `npm install` or `npm run` reference and replace any leftover. Remaining `npm` mentions are: line 5 (axios supply-chain advisory — historical, not a current command) and line 39 (`npm i -g pnpm` — that IS how you install pnpm). Both are intentional.
- [x] 4.4 Add a one-line note near the top of the Installation section: "This project uses pnpm. If you have Corepack enabled, no setup is needed; otherwise run `npm i -g pnpm` first."

## 5. Update AGENTS.md

- [x] 5.1 In the Commands table, change every `npm run <script>` (or `npm <script>`) to `pnpm run <script>`.
- [x] 5.2 Delete the "Both `pnpm-lock.yaml` and `package-lock.json` are present; `npm` works fine" note that currently sits below the Commands table. Replace it with one sentence: "This project uses pnpm as its package manager (see `package.json#packageManager`)."
- [x] 5.3 Replaced the `.claude/settings.local.json` whitelisting note (no separate "Gotchas" entry existed; the line was in the Commands table note, removed in 5.2). Also removed the pnpm-lockfile/npm-lockfile sentence and the "Single npm package" reference in the header.
- [x] 5.4 Grep `AGENTS.md` for any remaining `npm` reference and clean it up. Verified clean (no `npm` matches in AGENTS.md).

## 6. Final verification

- [x] 6.1 Run `pnpm run build`, `pnpm run lint`, `pnpm test` once more end-to-end and confirm clean. `pnpm run build` clean. `pnpm run lint` and `pnpm test` fail with pre-existing issues (no `tests/` dir), not regressions.
- [x] 6.2 Skipped — no populated `.env` available in the working environment. Live smoke test deferred to the developer with credentials.
- [x] 6.3 No git repo in the working environment; verified file state directly. Diff matches expectation: `.npmrc` added, `package.json` edited (one new field), `package-lock.json` deleted, `pnpm-lock.yaml` retained, `node_modules/` flat (zod/axios/@modelcontextprotocol at top level), `src/` unchanged, `README.md` and `AGENTS.md` edited. No other files touched.
