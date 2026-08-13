# Customization

Coding-agent discovers executable extensions and declarative skills, prompt templates, and themes from user, trusted project, explicit CLI, and installed-package sources. Resource diagnostics and source metadata are retained so collisions and failures can be attributed.

## Choose the smallest surface

- **Prompt template:** reusable text expansion.
- **Skill:** instructions and supporting files the model or user invokes.
- **Theme:** terminal color/style integration.
- **Extension:** executable TypeScript/JavaScript for tools, commands, events, provider changes, or UI.
- **Package:** distribution container for any combination of the above.

Project resources are trust-gated. Explicit CLI extensions load during trust bootstrap so they can participate in the trust event; that makes the CLI path itself a trust decision.

## Locations

Compatibility locations include user directories under `~/.pi/agent/` and project directories under `.pi/`. Skills also discover `.agents/skills` while walking ancestors to the repository root. Explicit `--extension`, `--skill`, `--prompt-template`, and `--theme` paths add temporary resources; `--no-*` options disable default discovery, not necessarily explicit paths.

## Prompt templates

Markdown filenames become command names. Frontmatter can provide `description` and `argument-hint`. Expansion supports positional `$1`, all-argument `$@`/`$ARGUMENTS`, defaults such as `${1:-value}`, and slices such as `${@:2}`. Substitution is single-pass.

See [Extensions](extensions.md), [Packages](packages.md), [Skills](skills.md), and [Themes](themes.md).
