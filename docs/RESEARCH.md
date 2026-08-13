# Docs Research

Research checked 2026-08-13:

- OpenAI Codex discovers instruction files from root to working directory; nearer files override broader ones.
- OpenAI skills use progressive disclosure: advertise a short description, then load full instructions only when matched.
- GitHub recommends short repository-wide instructions plus path-specific rules when supported.

## Recode decision

Recode currently auto-loads ancestor `AGENTS.md` or `CLAUDE.md`, not arbitrary task docs. Therefore:

- keep one short root `AGENTS.md`;
- route through `docs/INDEX.md`;
- read one focused topic file when possible;
- use skills for repeatable procedures, not general product facts;
- avoid nested `AGENTS.md` until a source package needs automatic local rules;
- keep old material outside normal routing.

Sources:

- https://developers.openai.com/codex/guides/agents-md
- https://developers.openai.com/codex/skills
- https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
