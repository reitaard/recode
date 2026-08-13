import {
	createModels,
	createProvider,
	type Model,
	type Models,
	type ProviderHeaders,
	type StreamOptions,
} from "@reitaard/recode-ai";
import { type ProviderStreamOptions, stream, streamSimple } from "@reitaard/recode-ai/compat";
import type { ModelRegistry } from "./model-registry.ts";

/**
 * Bridge selected coding-agent models and their resolved credentials into AgentHarness.
 *
 * The collection is intentionally private to the caller. This prevents an
 * isolated runtime from inheriting unrelated providers or ambient model state.
 */
export function createHarnessModels(
	modelOrModels: Model<any> | readonly Model<any>[],
	modelRegistry: ModelRegistry,
	purpose: string,
	beforeProviderHeaders?: (headers: ProviderHeaders) => Promise<ProviderHeaders>,
): Models {
	const selectedModels = (Array.isArray(modelOrModels) ? [...modelOrModels] : [modelOrModels]).filter(
		(model, index, models) =>
			models.findIndex((candidate) => candidate.provider === model.provider && candidate.id === model.id) === index,
	);
	if (selectedModels.length === 0) {
		throw new Error(`No models configured for ${purpose}`);
	}

	const models = createModels({
		prepareRequest: async (requestModel, options) => {
			const resolved = await modelRegistry.getApiKeyAndHeaders(requestModel);
			if (!resolved.ok) throw new Error(resolved.error);
			const headers = { ...resolved.headers, ...options?.headers };
			const preparedHeaders = beforeProviderHeaders ? await beforeProviderHeaders(headers) : headers;
			return {
				...options,
				headers: Object.keys(preparedHeaders).length > 0 ? preparedHeaders : undefined,
			} as StreamOptions;
		},
	});

	const byProvider = new Map<string, Model<any>[]>();
	for (const model of selectedModels) {
		const providerModels = byProvider.get(model.provider) ?? [];
		providerModels.push(model);
		byProvider.set(model.provider, providerModels);
	}

	for (const [providerId, providerModels] of byProvider) {
		models.setProvider(
			createProvider({
				id: providerId,
				name: `${providerId} for ${purpose}`,
				models: providerModels,
				auth: {
					apiKey: {
						name: `${providerId} credentials`,
						resolve: async () => {
							const resolved = await modelRegistry.getApiKeyAndHeaders(providerModels[0]!);
							if (!resolved.ok) throw new Error(resolved.error);
							return {
								auth: { apiKey: resolved.apiKey },
								env: resolved.env,
							};
						},
					},
				},
				api: {
					stream: (requestModel, context, options) =>
						stream(requestModel, context, options as ProviderStreamOptions | undefined),
					streamSimple: (requestModel, context, options) => streamSimple(requestModel, context, options),
				},
			}),
		);
	}

	return models;
}
