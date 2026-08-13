### Highlights

- **Aizen AgentHarness runtime** — Recode now runs text, JSON, RPC, and interactive sessions through the durable AgentHarness runtime by default, with structured recovery and safer retry and compaction behavior.
- **Named workers** — Added reusable worker conversations with independent models, thinking levels, personalities, workspace isolation, and configurable token budgets.
- **Memory and code intelligence** — Added project-first memory with session review, improved persistence, and expanded symbol-aware LSP navigation and diagnostics.
- **More platforms** — Added the Recode Termux/Node package alongside Linux and Windows builds, with a checksummed source archive for rebuilding.

### Fixed

- Preserved staged slash-command guidance and improved pending tool-call status.
- Improved light-terminal readability and kept successful edits independent from unavailable LSP diagnostics.
- Added upstream Pi package compatibility for extensions and RPC environments.
