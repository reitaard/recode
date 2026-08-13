# Security and Trust

Recode is a coding harness, not a security sandbox. Built-in tools can read files, execute commands, and modify the working tree. Extensions are executable modules with the process's authority; skills and prompts can influence model behavior; packages can contain both.

## Project trust

Project trust gates project settings, project resources, and project package execution. Interactive startup may ask. Headless modes cannot ask and therefore use saved/default policy or `--approve`/`--no-approve`.

Trusting a repository means trusting its executable extensions and model instructions. Review changes to `.pi/`, `.agents/`, `AGENTS.md`, package manifests, and extension entry points before approval. `/trust` persists a future decision; restart is required to reload resources.

## Tools

Use `--tools` for an allowlist, `--exclude-tools` for a denylist, or disable defaults. A tool name is not a complete policy: inspect its implementation and workspace boundary. Shell commands inherit process credentials and environment unless a host removes them.

## Packages and extensions

Npm, Git, URL, SSH, and local package sources cross supply-chain boundaries. Pin reviewed sources, inspect dependencies and runtime contracts, and do not assume package-manager installation is isolated. Extension UI and events do not turn arbitrary code into safe code.

## Credentials and protocols

Prefer environment or approved credential storage. `--api-key` can leak through process inspection or shell history. JSON/RPC clients must protect stdin/stdout and session data. Telegram bot tokens and allowlists are secrets/configuration, not repository content.

## Remote and platform boundaries

RPC, Telegram, provider calls, package updates, browser tools, Maestro workers, SSH examples, containers, and local-model servers each add separate trust boundaries. A container is isolation only when configured as such. Offline mode is a startup policy, not a firewall.

Report vulnerabilities through the repository security policy once its private contact is approved. Do not publish active secrets or unpatched exploit details in issues.
