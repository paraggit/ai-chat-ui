const SETTINGS_KEY = 'hf-chat-pro-model-settings';

export const DEFAULT_MAX_TOKENS = 8192;
/** @deprecated legacy default — migrated on load */
const LEGACY_LOW_MAX_TOKENS = 4096;

export const PROVIDERS = {
  HUGGINGFACE: 'huggingface',
  LOCAL: 'local',
};

export const LOCAL_LLM_DEFAULTS = {
  endpoint: 'http://localhost:11434',
  model: 'llama3.2',
};

const DEFAULTS = {
  provider: PROVIDERS.HUGGINGFACE,
  apiKey: '',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  endpoint: '',
  visionModel: 'Salesforce/blip-vqa-base',
  imageGenModel: 'stabilityai/stable-diffusion-2-1',
  maxTokens: DEFAULT_MAX_TOKENS,
};

/**
 * @returns {{
 *   provider: string,
 *   apiKey: string,
 *   model: string,
 *   endpoint: string,
 *   visionModel: string,
 *   imageGenModel: string,
 *   maxTokens: number,
 * }}
 */
export function loadModelSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    const model =
      parsed.model === 'mistralai/Mistral-7B-Instruct-v0.2'
        ? DEFAULTS.model
        : (parsed.model ?? DEFAULTS.model);
    const maxTokens = Number(parsed.maxTokens);
    const provider =
      parsed.provider === PROVIDERS.LOCAL ? PROVIDERS.LOCAL : PROVIDERS.HUGGINGFACE;
    return {
      provider,
      apiKey: parsed.apiKey ?? DEFAULTS.apiKey,
      model,
      endpoint: parsed.endpoint ?? DEFAULTS.endpoint,
      visionModel: parsed.visionModel ?? DEFAULTS.visionModel,
      imageGenModel: parsed.imageGenModel ?? DEFAULTS.imageGenModel,
      maxTokens:
        Number.isFinite(maxTokens) && maxTokens > 0
          ? maxTokens <= LEGACY_LOW_MAX_TOKENS
            ? DEFAULT_MAX_TOKENS
            : maxTokens
          : DEFAULTS.maxTokens,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {ReturnType<typeof loadModelSettings>} settings
 */
export function saveModelSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * @param {ReturnType<typeof loadModelSettings>} settings
 */
export function isConfigured(settings) {
  if (settings.provider === PROVIDERS.LOCAL) {
    return Boolean(settings.model?.trim() && settings.endpoint?.trim());
  }
  return Boolean(settings.apiKey?.trim() && settings.model?.trim());
}

/**
 * @param {ReturnType<typeof loadModelSettings>} settings
 */
export function isLocalProvider(settings) {
  return settings.provider === PROVIDERS.LOCAL;
}

/**
 * @param {ReturnType<typeof loadModelSettings>} settings
 */
export function toApiPayload(settings) {
  const maxTokens = Number(settings.maxTokens);
  const provider = settings.provider === PROVIDERS.LOCAL ? PROVIDERS.LOCAL : PROVIDERS.HUGGINGFACE;
  const endpoint =
    provider === PROVIDERS.LOCAL
      ? settings.endpoint.trim() || LOCAL_LLM_DEFAULTS.endpoint
      : settings.endpoint.trim() || undefined;

  return {
    provider,
    hfToken: settings.apiKey.trim() || undefined,
    model: settings.model.trim(),
    endpoint,
    visionModel: settings.visionModel.trim() || undefined,
    imageGenModel: settings.imageGenModel.trim() || undefined,
    maxTokens:
      Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : DEFAULT_MAX_TOKENS,
  };
}
