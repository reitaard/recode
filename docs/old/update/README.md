# Recode Update Project

This directory is the working source of truth for making `recode update` safely update the customized Recode checkout without replacing it with upstream Pi.

## Reading order

1. [CONTEXT.md](CONTEXT.md) — stable repository and installation facts
2. [PLAN.md](PLAN.md) — staged implementation plan and acceptance gates
3. [DECISIONS.md](DECISIONS.md) — architectural decisions and their rationale
4. [LOG.md](LOG.md) — chronological investigation and implementation record

## Working rules

- Treat the customized Recode repository as the product; upstream Pi is an integration source, not an installation target.
- Preserve local customizations and user data.
- Never place credentials in this directory or commit them.
- Verify behavior before changing the installed `recode` command or its symlink.
- Record durable findings in `CONTEXT.md`, decisions in `DECISIONS.md`, and completed work in `LOG.md`.
- Keep `PLAN.md` current as gates are completed or revised.

## Current objective

Design and implement an update path that can:

1. identify the active customized checkout,
2. retrieve upstream and fork changes safely,
3. integrate changes without silently discarding customization,
4. validate the resulting source tree,
5. rebuild or relink the `recode` command,
6. provide a recoverable failure path.
