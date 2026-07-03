## ADDED Requirements

### Requirement: pnpm is the project's package manager

The project SHALL use pnpm as its package manager. The committed lockfile SHALL be `pnpm-lock.yaml`. The npm lockfile (`package-lock.json`) SHALL NOT be present in the repository after this change.

#### Scenario: Lockfile inventory
- **WHEN** the repository root is listed
- **THEN** `pnpm-lock.yaml` exists and `package-lock.json` does not
- **AND** `.gitignore` does not need to list either lockfile (both have always been tracked or untracked on intent, not by pattern)

#### Scenario: pnpm is pinned in package.json
- **WHEN** `package.json` is read
- **THEN** a top-level `packageManager` field is present with a value of the form `pnpm@<x.y.z>` (e.g. `pnpm@10.33.4`)

### Requirement: pnpm install produces a flat node_modules

The project SHALL ship a `.npmrc` that causes pnpm to hoist all dependencies (transitive included) into a flat `node_modules/` directory.

#### Scenario: .npmrc is present
- **WHEN** the repository root is listed
- **THEN** a `.npmrc` file exists
- **AND** it contains the line `shamefully-hoist=true` (no other required content; comments are allowed)

#### Scenario: ESM resolution still works
- **WHEN** `pnpm install` is run on a fresh clone
- **THEN** `pnpm run build` (i.e. `tsc`) completes without `ERR_MODULE_NOT_FOUND` for any of the project's own relative imports (`./config/index.js`, `./auth/token-manager.js`, etc.)

### Requirement: Documentation refers to pnpm, not npm

Every developer-facing instruction in `README.md` and `AGENTS.md` SHALL refer to `pnpm` (not `npm`) for install, build, run, test, lint, format, and coverage commands.

#### Scenario: README is pnpm-first
- **WHEN** `README.md` is read
- **THEN** the Installation, Configuration, Usage, and Development sections reference `pnpm install` and `pnpm run <script>` (or the `pnpm <script>` short form) for every command
- **AND** no `npm install` or `npm run <script>` instruction remains

#### Scenario: AGENTS.md Commands table is pnpm-first
- **WHEN** `AGENTS.md` is read
- **THEN** the Commands table uses `pnpm run <script>` (or `pnpm <script>`) for every row
- **AND** the prior note about "Both `pnpm-lock.yaml` and `package-lock.json` are present" is removed
- **AND** a short note that pnpm is the package manager is present instead
