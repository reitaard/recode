# Coding-Agent Examples Inventory

Source: `../re.pi` at `fbd6b5b3a494d6c50bc5415eb3be2e4366470056`.

The source package ships `examples/` in npm and compiled binaries, and the root typecheck includes examples except Gondolin. Examples therefore require the same identity, export, security, and compilation review as product documentation. Because Recode is intended for public collaboration, retained examples are also contributor onboarding and API compatibility assets: consolidation should remove redundancy, not leave external developers without maintained extension, SDK, session, policy, and UI patterns.

## Public example tiers

- **Core:** credential-free, CI-compiled examples using public exports; suitable for package documentation and contributor onboarding.
- **Integration:** opt-in network/external/platform examples with explicit dependencies, trust boundaries, cleanup, and separate gates.
- **Experimental:** complex sandbox/VM/visual demonstrations outside default support and distribution until independently certified.

Every retained example needs a stated purpose, owner, expected behavior, cleanup requirements, and compile/test lane. Examples must not silently mutate Git, install software, expose credentials, or imply product support for an external system.

## Transfer after rewrite

### SDK examples

Transfer `examples/sdk/01-minimal.ts` through `13-session-runtime.ts` and the SDK README after reconciling them with the public root export and the retained compatibility runtime.

Required corrections:

- describe `createAgentSession()` and `createAgentSessionRuntime()` as the legacy/compatibility SDK boundary, not the default Aizen runtime;
- keep `.pi` and `~/.pi/agent` only as actual compatibility configuration paths;
- fix the SDK README's nonexistent `08-slash-commands.ts` entry to `08-prompt-templates.ts`;
- verify model names and root-versus-compat AI imports;
- explain that runtime session replacement APIs do not restore removed CLI `session_switch`/`session_fork` tools;
- add a compile gate independent from the broad repository typecheck.

### Focused extension examples

Transfer small examples that directly demonstrate current exported APIs, after replacing product-facing `pi` commands/names with `recode` and checking lifecycle signatures:

- lifecycle and policy: `permission-gate.ts`, `project-trust.ts`, `protected-paths.ts`, `dirty-repo-guard.ts`, `confirm-destructive.ts`;
- tools and messages: `hello.ts`, `todo.ts`, `question.ts`, `questionnaire.ts`, `structured-output.ts`, `tool-override.ts`, `dynamic-tools.ts`, `truncated-tool.ts`, `send-user-message.ts`;
- resources and providers: `dynamic-resources/`, `provider-payload.ts`, custom provider examples after dependency/network review;
- session/extension mechanics: `commands.ts`, `event-bus.ts`, `entry-renderer.ts`, `message-renderer.ts`, `session-name.ts`, `bookmark.ts`, `reload-runtime.ts`, `shutdown-command.ts`;
- representative TUI examples: a minimal overlay, custom header/footer/status, editor, widget, and RPC UI example rather than every game/demo.

These are candidate transfer groups, not an assertion that each current file is correct. Compile, import, and focused runtime checks remain required after rewriting.

## Keep only with explicit external/platform certification

| Example | Required certification |
|---|---|
| `sandbox/` | `@anthropic-ai/sandbox-runtime` platform support, policy, package metadata, and actual isolation limits. |
| `gondolin/` | External package availability, platform support, VM trust boundary, and independent typecheck; root TypeScript currently excludes the whole directory. |
| `ssh.ts` | Remote command quoting, host verification, cancellation, error handling, and documentation that SSH is an extension example rather than a trusted Recode transport. |
| `interactive-shell.ts` | Terminal restoration and Windows/Linux/macOS behavior. |
| `notify.ts`, `mac-system-theme.ts` | Terminal/macOS capability checks and graceful fallback. |
| custom providers | Provider credentials, live-network tests, package metadata, and compatibility API ownership. |
| `github-issue-autocomplete.ts` | `gh` dependency, repository detection, timeout, remote trust, and privacy behavior. |

Do not present any of these as supported cross-platform product functionality before those gates pass.

## Exclude

### Inherited subprocess subagent example

Exclude `examples/extensions/subagent/`, including its agents and workflow prompts.

It launches separate `pi`/current-process JSON-mode children, discovers arbitrary user/project agent Markdown, allows configurable tool lists and cwd, implements its own parallel/chain orchestration, and defaults to historical agent semantics. This conflicts with Recode's stable named-worker directory (`research`, `audit`, `shiori`), read-only bounded worker contract, no automatic retry/fallback policy, and Maestro's separate ownership of full-session processes.

If process-based delegation is desired later, design it through the approved worker or Maestro boundaries rather than reviving this example.

### Generated, novelty, and redundant demonstrations

Exclude by default:

- `doom-overlay/`, including checked-in generated JavaScript/Wasm if present in the source commit;
- `snake.ts`, `space-invaders.ts`, and `tic-tac-toe.ts` unless one is deliberately retained as a compact TUI stress fixture;
- broad `overlay-qa-tests.ts`, `working-message-test.ts`, and duplicated visual demos that belong in TUI tests rather than the shipped SDK examples;
- examples that perform automatic commit/merge/deploy behavior (`auto-commit-on-exit.ts`, `git-merge-and-resolve.ts`) unless rewritten with explicit confirmation and adopted as security-reviewed examples;
- stale or duplicate examples whose API is already covered by a smaller maintained example;
- generated `build/` output, Wasm, local locks not required for a retained standalone example, caches, dependencies, and logs.

## Package metadata and identity rewrite

Five example directories are root npm workspaces. Their current names begin `pi-extension-*`, and their metadata uses a `pi.extensions` field. Before transfer:

1. Decide whether example workspaces remain necessary.
2. If retained, rename package identity to Recode while preserving `pi` metadata only where the loader's actual schema requires that key.
3. Keep only exact pinned dependencies needed by retained examples.
4. Regenerate retained package locks from the approved root lock/toolchain rather than copying them blindly.
5. Remove no-op workspace scripts or replace them with real compile/check gates.

## Verification evidence

- Source commit contains 134 tracked example files; working-tree inventory includes 99 TypeScript files plus Markdown/config and optional generated/native demo material.
- Root `tsconfig.json` includes all coding-agent examples but excludes Gondolin, so a successful root typecheck does not certify Gondolin or runtime behavior.
- Current full root `tsgo --noEmit` completed successfully.
- SDK and extension READMEs, package manifests, package ship list, workspace membership, public imports, subprocess subagent implementation, and relevant history were reviewed.
- The shipped READMEs and many comments still use Pi identity and `pi` commands. Passing typecheck does not make those instructions correct.
- No external provider, SSH, VM, sandbox, desktop notification, game, or subprocess example was executed.
