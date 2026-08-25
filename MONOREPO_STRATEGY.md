# MONOREPO_STRATEGY.md

**Decision:** adopt **npm workspaces**, introduced **incrementally**, starting with `shared/` + `desktop/` only. Do **not** perform a big-bang migration that pulls the working `mobile/` and `backend/` projects into hoisted installs on day one.

Status: **decided 2026-08-23.** Supersedes the "monorepo tooling" open decision in [`TODO.md`](TODO.md). Companion: [`CLAUDE.md`](CLAUDE.md).

---

## 1. Current state (evidence, verified 2026-08-23)

| Fact | Finding |
|---|---|
| Root `package.json` | Trivial — `{ "devDependencies": { "docx": "^9.6.1" } }` only. **No `workspaces`, no `name`.** Exists solely for the root `create_user_guide.js` docx script. |
| Is it a monorepo today? | **No.** `backend/` and `mobile/` are independent npm projects, each with its own `package-lock.json` + `node_modules/`. |
| Package manager | **npm** everywhere (root + `mobile/` lockfiles; `backend/Dockerfile` uses `npm ci`). No pnpm/yarn/turbo artifacts. |
| TypeScript | Compatible: backend `^5.3.3`, mobile `^5.3.0`. `shared/` can target the same. |
| Hash lib | `mobile/` already depends on **`crypto-js@4.2.0`** (used for `offline_session_hash`), which runs in the browser — so `shared/` sync code is portable to `desktop/`. |
| Existing dirs | `backend/`, `mobile/` present. **No `desktop/` or `shared/` yet.** |

---

## 2. Why npm workspaces (and not the alternatives)

- **npm workspaces** ✅ — zero new tooling, matches the existing npm + lockfile setup, native support for a shared package. Simplest thing that works (brief §4: *"Choose the simplest solution that preserves the current project."*).
- **pnpm workspaces** ❌ — would mean re-solving every lockfile and switching CI/Docker off `npm ci`. More disruptive; no benefit here.
- **yarn** ❌ — same objection; nothing uses yarn today.
- **Turborepo** ❌ — explicitly discouraged by the brief (§4). Not needed for 4 packages.

---

## 3. Target layout & phased membership

```text
C:\Projects\MobilePOS
├── package.json        # workspace root (private; workspaces: ["shared","desktop"] first)
├── package-lock.json   # single root lockfile for workspace members
├── shared/             # @jaypos/shared  — source TS (types, utils, sync, api)  ← JOINS FIRST
├── desktop/            # Next.js 14 PWA  — consumes @jaypos/shared              ← JOINS FIRST
├── backend/            # mobile-pos-backend                                     ← JOIN LATER (guarded)
├── mobile/             # mobile-pos (Expo)                                      ← JOIN LAST (guarded)
└── ...
```

**Membership is deliberately staged** to honor the guardrail *don't break mobile/backend*:

1. **Now / Phase 1:** `workspaces: ["shared", "desktop"]`. New code only — nothing existing is disturbed. Keep the root `docx` devDep.
2. **Backend joins** once we've validated that `npm ci` and `backend/Dockerfile` still build with a workspace-aware install (see risks). Until then backend keeps installing standalone.
3. **Mobile joins last**, only after Metro is configured for a monorepo and `cd mobile && npm test` + a dev build are confirmed green.

`shared/` is published as **source TypeScript** (package `@jaypos/shared`, no separate build step initially):
- **desktop** consumes it via Next.js `transpilePackages: ["@jaypos/shared"]`.
- **mobile** (when it joins) consumes it via Metro `watchFolders` + `nodeModulesPaths`.
- **backend** (when it joins) via `tsconfig` path mapping or a light `tsc` build.

---

## 4. Risks & mitigations

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Expo/Metro + hoisting.** Metro doesn't follow hoisted/symlinked `node_modules` well; naive hoisting can break the working mobile app (duplicate React, unresolved RN modules). | Keep `mobile/` **out** of the workspace until Phase 1 is stable. When it joins, configure `metro.config.js` (`watchFolders`, `resolver.nodeModulesPaths`, `disableHierarchicalLookup`) and pin a single `react`/`react-native`. Validate with a real dev build, not just `tsc`. |
| R2 | **Backend Docker `npm ci`.** `backend/Dockerfile` runs `npm ci` inside `backend/` expecting a local lockfile; workspace hoisting moves the lockfile to root. | Until backend joins, leave it standalone. When it joins, either build the image from repo root with a workspace install, or emit a pruned per-package lockfile. Test the image build before merging. |
| R3 | **React version skew.** Desktop (React 18/19 via Next) vs mobile (React 19.1.0). `shared/` must not import React. | Keep `shared/` framework-agnostic (pure TS: types, math, sync orchestration behind interfaces). No React, no RN, no Next imports in `shared/`. |
| R4 | **Duplicate / drifting deps** (e.g. `crypto-js`, `axios`, `date-fns` differ between apps). | Declare shared runtime deps (`crypto-js`) in `shared/`'s own `package.json`; let workspaces dedupe. Keep the `offline_session_hash` implementation in `shared/` so mobile & desktop are byte-identical. |
| R5 | **Uncommitted Phase‑1 WIP** in the tree right now. | Do the workspace change as its own small, clearly-scoped commit **only when asked** — never bundled with the unrelated inventory WIP. |

---

## 5. Adoption steps (execute in Phase 1, not now)

1. Convert root `package.json` → workspace root: add `"name": "jaypos-workspace"`, `"private": true`, `"workspaces": ["shared", "desktop"]`; keep `docx` devDep.
2. `mkdir shared/` → `@jaypos/shared` with `package.json`, `tsconfig.json`, folders `types/ utils/ services/{api,sync}/`. Add `crypto-js` as a dependency.
3. Scaffold `desktop/` (Next.js 14) with `transpilePackages: ["@jaypos/shared"]` and dependency `"@jaypos/shared": "*"`.
4. `npm install` at root → single root lockfile for the two members; confirm `backend/` and `mobile/` still install/build/test **standalone** (unchanged).
5. Extract the first safe shared units (types, `generateId`, cart math, `offline_session_hash`) into `shared/`, re-point **desktop** at them. Leave mobile importing its local copies for now.
6. Only later: bring `backend/` in (validate Docker), then `mobile/` in (validate Metro).

## 6. What NOT to do
- ❌ Don't hoist `mobile/` into the workspace before Metro is configured and a dev build is verified.
- ❌ Don't switch package managers or add Turborepo.
- ❌ Don't put React/RN/Next-specific code in `shared/`.
- ❌ Don't refactor mobile's imports to `@jaypos/shared` until its tests are confirmed green post-move.
