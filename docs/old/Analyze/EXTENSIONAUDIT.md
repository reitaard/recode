# Installed extension runtime audit

**Date:** 2026-07-28  
**Scope:** current configured Recode packages only; no credentials or extension configuration values were inspected.

## Current result

All configured extensions now load and register without errors:

- `pi-web-access@0.15.0` — `web_search`, `fetch_content`, `get_search_content`, and `source_check`;
- `pi-mcp-adapter@2.15.0` — MCP gateway and lifecycle;
- private `repi-browser@0.0.1` at configured Git commit — guarded `browser` tool.

A configured resource-loader probe registered all six tool names in **5,524.6 ms** on the first post-install run and **1,772.2 ms** on the immediate warm run. These are package-loader probes, not full S1 process endpoints.

The probe also found and corrected a real installed-runtime defect: `pi-web-access@0.13.0` could not import `@earendil-works/pi-ai/compat` from the previously resolved `0.74.2` peer. The installed compatibility runtimes are now pinned at `@earendil-works/pi-ai@0.81.1` and `@earendil-works/pi-tui@0.81.1`; web access and MCP were updated with scripts disabled.

## Contract matrix

| Package | Current entry | Runtime status | Activation/readiness | Shutdown | Compatibility |
|---|---|---|---|---|---|
| `pi-web-access@0.15.0` | `./index.ts` | source-only compatibility | legacy/registered | internal session cleanup | upstream Pi peers, no `pi.runtime` |
| `pi-mcp-adapter@2.15.0` | `./index.ts` | source-only compatibility | legacy/registered; internal async readiness | internal session/process cleanup | upstream Pi peers, no `pi.runtime` |
| `repi-browser@0.0.1` | `./dist/openclaw-entry.js` mapped from source | verified built artifact and source map with exact SHA-256 | `process` / `registered` | `process-stop` | Recode `>=0.81.4 <0.82.0` |

## Package-specific findings

### `pi-web-access`

- It remains a source-only TypeScript compatibility package and therefore still incurs Jiti/runtime transformation.
- Session shutdown cleans pending fetches, curator state, clone cache, results, widget subscription and activity state.
- Runtime values use upstream `@earendil-works/pi-ai` and `@earendil-works/pi-tui` identities. Exact installed `0.81.1` peers restore the required `./compat` export.
- It is usable again, but still lacks a built/hash/lifecycle contract for certified Recode distribution.

### `pi-mcp-adapter`

- Version `2.15.0` removes the old direct Pi AI/TUI dependency pins and consumes the shared installed peers, reducing one duplicate dependency layer.
- It remains source-only and retains substantial runtime loading cost.
- Internal lifecycle behavior includes generation-aware initialization, stale-state cleanup, metadata flush, OAuth shutdown and graceful MCP shutdown.
- Readiness remains private adapter state rather than a Recode host contract, so it remains on the compatibility path.

### `repi-browser`

- It is now the first complete controlled S2 package path, committed as `6105993645f3578bf989393704bcc97c0e06e156`, pushed to `origin/s2-runtime-contract`, and pinned exactly in Recode settings.
- esbuild produces a bundled ESM runtime artifact plus external source map; the build script updates the manifest SHA-256 deterministically.
- The manifest declares tool `browser`, browser/network/isolated-transfer permissions, `browser-runtime` service ownership, no project-trust requirement, process activation, registration readiness and process-stop shutdown.
- Recode verifies compatibility, files and hash before replacing the source path with the built entry. A direct host registration probe loaded one extension, registered `browser`, and returned no errors.
- A five-process host-loader comparison measured source median **705.3 ms** and final built median **760.2 ms** in an already-warm cache state: a **7.8% warm regression**, below the 10% phase guard but not a warm optimization win. An earlier uncontrolled source first run was **2,556.8 ms** versus **785.8 ms** for built, but this is not a matched cold benchmark and is not used as an SLO claim.
- The package remains private and `UNLICENSED`. It is required in certified private Recode artifacts; public redistribution remains blocked until license/distribution terms are explicit.

## Post-migration matched warm endpoints

| Endpoint | S1 baseline | Post-S2 | Change |
|---|---:|---:|---:|
| Configured RPC `get_state` | 4,046.8 ms | 3,761.5 ms | -7.0% |
| Configured TUI rendered input | 4,078.8 ms | 4,264.9 ms | +4.6% |
| Isolated RPC `get_state` | 1,616.9 ms | 1,521.3 ms | -5.9% |
| Isolated TUI rendered input | 1,834.9 ms | 1,723.7 ms | -6.1% |

All matched warm endpoints remain within the 10% phase guard. No matched cold result was manufactured by clearing caches.

## Remaining boundary

1. Preserve source-only compatibility for external packages with visible diagnostics.
2. Do not describe `pi-web-access` or `pi-mcp-adapter` as certified artifacts until they publish compatible built/hash/lifecycle contracts.
3. Keep MCP/browser backend ownership explicit when the long-lived service is implemented; S2 records contracts but does not pretend the O-track service already exists.
4. Re-audit exact package revisions before the later three-way checkpoint.
