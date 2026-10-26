# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the Vue interface and browser code. The 3D office modules and their assets live under `src/agent-office/`; unit tests for those modules are in `src/agent-office/__tests__/`. The Vite plugin and Node-only transcript analysis live in `server/`, with their tests alongside them. Development scripts are in `scripts/`, and screenshots and other documentation assets are in `docs/`. Keep server-only code out of the browser bundle.

## Build, Test, and Development Commands

- `npm ci` installs the locked dependencies (Node.js 22.12+ or 24+).
- `npm run dev` starts the local Vite app at `http://localhost:5180`; the predev check reports common dependency installation problems.
- `npm run build` creates the production frontend in `dist/`. The session-data plugin runs in development, so static output alone does not provide live session data.
- `npm run typecheck` checks application and Node TypeScript projects.
- `npm test` runs all Vitest tests once.

## Coding Style & Naming Conventions

Use TypeScript for application logic, Vue single-file components for UI, and ES modules. Match the existing style: two-space indentation, single quotes, no semicolons, and trailing commas where appropriate. Use descriptive camelCase names for functions and files; keep Vue components in PascalCase where applicable. Put tests in `*.spec.ts` files, near the module or in its `__tests__/` directory. No formatter or linter is configured; follow nearby code.

## Testing Guidelines

Vitest is the test framework. Add or update focused tests for behavioral changes, especially transcript parsing/status rules, layout, localization, and scene presentation. Run `npm test` and `npm run typecheck` before submitting changes; use `npm run build` to check production bundling when frontend or Vite configuration changes.

## Commit & Pull Request Guidelines

The available Git history contains only an `Initial commit`, so no established commit format can be inferred. Use a short imperative subject that describes the change (for example, `Handle missing session metadata`). Pull requests should explain user-visible behavior and implementation impact, link related issues when applicable, and include screenshots for visual changes. Note the checks you ran and any configuration or privacy implications.

## Security & Configuration

Session transcripts can contain sensitive content. Preserve the rule that only required status metadata reaches the browser; do not expose transcript bodies, tool inputs, or results. Keep the development server bound to loopback, and avoid committing local session data, credentials, or generated dependencies.
