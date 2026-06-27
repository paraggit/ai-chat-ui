const SETTINGS_KEY = 'hf-chat-pro-model-settings';

export const DEFAULT_MAX_TOKENS = 4096;

const DEFAULTS = {
  apiKey: '',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  endpoint: '',
  visionModel: 'Salesforce/blip-vqa-base',
  imageGenModel: 'stabilityai/stable-diffusion-2-1',
  maxTokens: DEFAULT_MAX_TOKENS,
};

/**
 * @returns {{
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
    return {
      apiKey: parsed.apiKey ?? DEFAULTS.apiKey,
      model,
      endpoint: parsed.endpoint ?? DEFAULTS.endpoint,
      visionModel: parsed.visionModel ?? DEFAULTS.visionModel,
      imageGenModel: parsed.imageGenModel ?? DEFAULTS.imageGenModel,
      maxTokens:
        Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : DEFAULTS.maxTokens,
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
  return Boolean(settings.apiKey?.trim() && settings.model?.trim());
}

/**
 * @param {ReturnType<typeof loadModelSettings>} settings
 */
export function toApiPayload(settings) {
  const maxTokens = Number(settings.maxTokens);
  return {
    hfToken: settings.apiKey.trim(),
    model: settings.model.trim(),
    endpoint: settings.endpoint.trim() || undefined,
    visionModel: settings.visionModel.trim() || undefined,
    imageGenModel: settings.imageGenModel.trim() || undefined,
    maxTokens:
      Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : DEFAULT_MAX_TOKENS,
  };
}
