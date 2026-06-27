const SETTINGS_KEY = 'hf-chat-pro-model-settings';

const DEFAULTS = {
  apiKey: '',
  model: 'mistralai/Mistral-7B-Instruct-v0.2',
  endpoint: '',
};

/**
 * @returns {{ apiKey: string, model: string, endpoint: string }}
 */
export function loadModelSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      apiKey: parsed.apiKey ?? DEFAULTS.apiKey,
      model: parsed.model ?? DEFAULTS.model,
      endpoint: parsed.endpoint ?? DEFAULTS.endpoint,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {{ apiKey: string, model: string, endpoint: string }} settings
 */
export function saveModelSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/**
 * @param {{ apiKey: string, model: string, endpoint: string }} settings
 */
export function isConfigured(settings) {
  return Boolean(settings.apiKey?.trim() && settings.model?.trim());
}

/**
 * @param {{ apiKey: string, model: string, endpoint: string }} settings
 */
export function toApiPayload(settings) {
  return {
    hfToken: settings.apiKey.trim(),
    model: settings.model.trim(),
    endpoint: settings.endpoint.trim() || undefined,
  };
}
