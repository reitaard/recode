# Providers and Models

Coding-agent owns provider selection, authentication integration, scoped model cycling, and local model configuration. Provider transports, model schemas, streaming implementations, and catalog generation belong to `@reitaard/recode-ai`.

Select with `--provider <name>` and `--model <id-or-pattern>`, or use `provider/model`. `--models` defines patterns for interactive cycling. Thinking suffixes and `--thinking` are clamped to model capability.

Authentication may come from provider-specific environment variables, approved auth storage, or supported OAuth flows exposed by `/login`. Do not commit API keys. `--api-key` is convenient but can be exposed by shell history and process inspection.

Custom OpenAI/Anthropic/Google-compatible model records may be loaded from the agent model configuration. Providers requiring a new wire protocol, OAuth behavior, headers, or request transformation require an extension or an AI-package provider implementation. Extensions can register providers and alter request headers/payloads; this is executable, security-sensitive behavior.

`--list-models [search]` lists resolved available models. Availability depends on compiled catalog data, local configuration, credentials, and provider composition. Network/provider tests are opt-in and must not be part of default deterministic CI.

Local model servers are external services and are not started by normal coding-agent startup. Some opt-in AI test paths can pull local models, so default deterministic gates must disable them. Recode does not otherwise secure or certify the server; see [Platforms](platforms.md).
