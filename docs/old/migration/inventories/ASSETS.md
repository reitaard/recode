# Package Assets and Generated Inputs

Source: `../re.pi` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

This inventory covers non-TypeScript runtime assets, generated source, fixtures, native artifacts, and package-local helpers that must not be lost or copied blindly.

## Required runtime/build inputs

### Coding-agent themes and HTML export

Transfer:

- `src/modes/interactive/theme/dark.json`, `light.json`, and `theme-schema.json`;
- `src/core/export-html/template.html`, `template.css`, `template.js`;
- `src/core/export-html/vendor/marked.min.js` and `highlight.min.js`;
- the TypeScript loaders/renderers that consume them.

These are runtime inputs, not disposable build output. The package build copies them into `dist`, HTML export reads all five template/vendor files at runtime, and binary packaging copies the theme/export assets again.

Required follow-up:

- verify license/provenance for vendored Marked and Highlight JavaScript;
- test HTML escaping, URL sanitization, custom tool rendering, light/dark theme output, and operation from npm and compiled binary layouts;
- regenerate only copied `dist` forms, never the source assets.

### AI model catalogs

Transfer:

- all provider JSON files under `src/providers/data/` and `.manifest.json`;
- provider model wrapper modules;
- generation/validation scripts and reasoning-option helpers;
- checked-in `src/models.generated.ts` and `src/image-models.generated.ts` as release build inputs;
- tests that validate catalog structure and generation.

The ordinary AI build performs network-backed generation before TypeScript compilation, while `build:release` compiles the checked-in generated source without fetching. Therefore generated source is intentionally tracked, but must be changed only through its generators and reviewed as generated data.

Required follow-up:

- make network regeneration opt-in and separate from deterministic release compilation;
- validate `.manifest.json` hashes/structure and generated source in CI without requiring live providers;
- do not regenerate catalogs incidentally during transfer or documentation work;
- retain external-source attribution and record the generation command/evidence when catalogs are deliberately refreshed.

### SQLite migrations

Transfer `src/sqlite/migrations/001_initial.sql` and `scripts/prepare-dist.mjs`. The runtime loads SQL relative to emitted JavaScript, so the build must copy migrations into `dist/sqlite/migrations/`. Generated copies are excluded.

### Package metadata used at runtime

Coding-agent and orchestrator locate/read their `package.json` at runtime for version, package directory, app configuration, and binary layout. Transfer manifests as source inputs and verify both Node package and compiled-binary path resolution. Release manifests (`recode-release.json`) are generated into `dist` and must not be copied from source output.

## Test fixtures

Transfer fixtures only with the tests that consume them:

- AI `test/data/red-circle.png` for image handling;
- coding-agent JSON/JSONL session, compaction, external-editor, empty-directory, and skill-validation fixtures;
- package-specific text/config fixtures discovered in exact test inventories.

Fixtures are not examples or user documentation. Preserve malformed fixtures when tests intentionally validate rejection. Exclude test-created sessions, databases, snapshots, logs, downloads, and temporary directories.

## Documentation images

The coding-agent docs contain inherited screenshots (`doom-extension.png`, `exy.png`, `interactive-mode.png`, `tree-view.png`). Do not transfer them automatically.

- Exclude images tied to removed novelty examples or stale Pi UI.
- Recreate only screenshots referenced by rewritten Recode documentation.
- New screenshots require current UI, reproducible capture context, redaction review, and useful alt text.

## Native TUI artifacts

Transfer native C source and build helpers for Darwin and Windows. Preserve the four checked-in `.node` prebuilds only in a quarantine/certification inventory, not as approved publication assets.

Before publication:

1. verify source-to-binary provenance or rebuild reproducibly for all declared targets;
2. record hashes, toolchains, architectures, and smoke tests;
3. correct native README commands or add real scripts;
4. verify JavaScript fallback behavior when helpers are absent;
5. ensure package contents include only certified binaries.

## Package-local helpers

| Path | Disposition |
|---|---|
| `packages/agent/scripts/generate-telemetry-docs.ts` | Transfer; regenerate telemetry schema docs from typed schemas. |
| AI generation/check scripts | Transfer; distinguish deterministic validation from network refresh. |
| SQLite `prepare-dist.mjs` | Transfer; required migration copy step. |
| Coding-agent `scripts/migrate-sessions.sh` | Exclude as shipped operator tool unless explicitly retained. Startup already contains current migration logic; the shell script is old, Unix/jq-specific, uses `PI_AGENT_DIR` rather than the current documented compatibility variable, and duplicates historical v0.30 repair behavior. |
| TUI native build scripts | Transfer for certification, then rewrite docs/scripts around verified commands. |

## Generated and copied output to exclude

- every package `dist/` tree, declaration, source map, emitted JavaScript, copied theme/template, and generated release manifest;
- `packages/coding-agent/binaries/`, package tarballs, release archives, checksums, and extracted install trees;
- local `node_modules`, coverage, caches, logs, temporary benchmark artifacts, sessions, SQLite databases, WAL/SHM files, and diagnostics captures;
- generated example game output and Wasm unless a retained, licensed example has an approved reproducible build;
- AI catalog output produced by an unrecorded network refresh during migration;
- native binaries without the certification above.

## Verification evidence

- Package manifests/build scripts, tracked non-code extension inventory, runtime file reads, asset-copy commands, AI generators/catalog data, SQLite migration loading, coding-agent export/theme paths, fixtures, native files, and relevant Git history checked.
- Forty AI provider catalog data files are tracked, including the manifest.
- Coding-agent source has eight direct non-TypeScript runtime asset files in theme/export paths plus vendored JavaScript; package and binary builds copy them explicitly.
- Current package scan found four tracked `.node` prebuilds, five PNG files, JSONL fixtures, one example Wasm, and HTML/CSS runtime templates. Presence in Git is not publication certification.
- No catalog network refresh, native rebuild, screenshot recapture, HTML runtime smoke test, or binary asset test was performed in this slice.
