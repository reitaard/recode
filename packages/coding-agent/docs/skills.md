# Skills

Skills are Markdown instruction resources following the Agent Skills shape. A directory containing `SKILL.md` is one skill root; discovery does not recurse below that root. Root-level Markdown files are accepted in compatibility `.pi` skill directories, while `.agents/skills` discovery expects skill roots.

Required frontmatter:

```yaml
---
name: review-api
description: Review an HTTP API contract for correctness and security.
---
```

Names use lowercase letters, digits, and single hyphens, with at most 64 characters. Description is required and limited to 1,024 characters. Invalid names produce diagnostics; a missing description prevents loading. `disable-model-invocation: true` keeps a skill from model-selected invocation while allowing explicit use.

Discovery respects `.gitignore`, `.ignore`, and `.fdignore`, skips hidden entries and `node_modules`, follows valid symlinks, and deduplicates/collides according to resource precedence. Project skills require project trust.

When skill commands are enabled, invoke with `/skill:<name>`. Loading a skill gives instructions to the model; it does not sandbox commands or supporting executables. Review third-party skill contents and referenced files.
