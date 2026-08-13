# Coding-Agent Development

Product source has not yet been transferred into this repository. Until then, these docs are replacement owner drafts and must not claim local package commands pass here.

After approved transfer:

1. follow the repository's from-scratch build procedure;
2. build AI, Agent, TUI, orchestrator, and coding-agent in dependency order through root scripts;
3. run credential-free coding-agent tests with local-model/network suites disabled;
4. compile every retained example against public exports;
5. run protocol/session/settings documentation drift checks;
6. inspect `npm pack --dry-run` and the unpacked tarball;
7. test local tarball installation in an isolated directory;
8. run platform/native gates separately.

Source areas include CLI routing, core AgentSession/Aizen integration, extensions/resources/packages, interactive/JSON/RPC modes, workers/memory/gateway, LSP, and utilities. New public behavior needs an owning package doc, tests, changelog entry when appropriate, and compatibility/security review.

Do not edit generated output, copy `dist/`, import private `src/` modules from examples, enable credential-backed tests by default, or run publication/update workflows without approval.
