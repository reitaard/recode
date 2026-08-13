# Repository Migration

This directory is temporary certification material for transferring the approved Recode source boundary from `../re.pi`.

## Execute

1. [Transfer plan](TODO.md)
2. [Exact copy manifest](inventories/COPY.md)
3. Documentation and launch plans:
   - [public repository readiness](plans/PUBLIC-REPOSITORY.md)
   - [governance decisions](plans/PUBLIC-GOVERNANCE-DECISIONS.md)
   - [security policy](plans/SECURITY-POLICY.md)
   - [Code of Conduct adoption](plans/CODE-OF-CONDUCT.md)
   - [community templates](plans/COMMUNITY-TEMPLATES.md)
   - [versioning and package lineage](plans/VERSIONING.md)
   - [transfer manifest freeze candidate](plans/MANIFEST-FREEZE.md)
   - [pre-transfer documentation closure](plans/DOCUMENTATION-CLOSURE.md)
   - [coding-agent-first staged transfer](plans/STAGED-TRANSFER.md)
   - [coding-agent transfer gate](plans/CODING-AGENT-TRANSFER-GATE.md)
   - [core packages](plans/PACKAGE-DOCS.md)
   - [Agent telemetry schema](plans/AGENT-TELEMETRY-SCHEMA.md)
   - [coding-agent](plans/CODING-AGENT-DOCS.md)
4. Focused inventories:
   - [packages](inventories/PACKAGES.md)
   - [root files and scripts](inventories/ROOT.md)
   - [workflows](inventories/WORKFLOWS.md)
   - [examples](inventories/EXAMPLES.md)
   - [assets](inventories/ASSETS.md)
   - [archive disposition](inventories/ARCHIVE.md)
5. [Archive coverage ledger](COVERAGE.md)

## Machine-readable manifest

- [`manifest/transfer.tsv`](manifest/transfer.tsv) contains one row per tracked source path.
- [`manifest/build.py`](manifest/build.py) regenerates it only when `../re.pi` is at the certified commit.

These files classify and plan work; they do not authorize source copying, publication, installation, release mutation, or archive deletion.

After complete transfer certification and Creator approval, remove this directory together with the old-document archive and migration routing. Permanent product documentation remains under `docs/project/` and the owning package directories.
