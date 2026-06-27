import { useEffect, useState } from 'react';
import {
  DEFAULT_MAX_TOKENS,
  LOCAL_LLM_DEFAULTS,
  PROVIDERS,
} from '../utils/modelSettings.js';

/**
 * @param {{
 *   settings: {
 *     provider: string,
 *     apiKey: string,
 *     model: string,
 *     endpoint: string,
 *     visionModel: string,
 *     imageGenModel: string,
 *     maxTokens: number,
 *   },
 *   configured: boolean,
 *   onSave: (settings: {
 *     provider: string,
 *     apiKey: string,
 *     model: string,
 *     endpoint: string,
 *     visionModel: string,
 *     imageGenModel: string,
 *     maxTokens: number,
 *   }) => void,
 * }} props
 */
export default function ModelSettings({ settings, configured, onSave }) {
  const [open, setOpen] = useState(!configured);
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const isLocal = draft.provider === PROVIDERS.LOCAL;

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleProviderChange = (provider) => {
    setDraft((prev) => {
      if (provider === PROVIDERS.LOCAL) {
        return {
          ...prev,
          provider: PROVIDERS.LOCAL,
          endpoint: prev.endpoint.trim() || LOCAL_LLM_DEFAULTS.endpoint,
          model:
            prev.provider === PROVIDERS.LOCAL && prev.model.trim()
              ? prev.model
              : LOCAL_LLM_DEFAULTS.model,
        };
      }

      return {
        ...prev,
        provider: PROVIDERS.HUGGINGFACE,
        model:
          prev.provider === PROVIDERS.LOCAL || !prev.model.trim()
            ? 'Qwen/Qwen2.5-7B-Instruct'
            : prev.model,
        endpoint:
          prev.endpoint.trim() === LOCAL_LLM_DEFAULTS.endpoint ? '' : prev.endpoint,
      };
    });
  };

  const handleSave = (e) => {
    e.preventDefault();
    onSave({
      provider: isLocal ? PROVIDERS.LOCAL : PROVIDERS.HUGGINGFACE,
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
      endpoint: isLocal
        ? draft.endpoint.trim() || LOCAL_LLM_DEFAULTS.endpoint
        : draft.endpoint.trim(),
      visionModel: draft.visionModel.trim(),
      imageGenModel: draft.imageGenModel.trim(),
      maxTokens:
        Number.isFinite(Number(draft.maxTokens)) && Number(draft.maxTokens) > 0
          ? Math.floor(Number(draft.maxTokens))
          : DEFAULT_MAX_TOKENS,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
      >
        <span className="flex items-center gap-2">
          Model settings
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              configured ? 'bg-accent' : 'bg-amber-400'
            }`}
            title={configured ? 'Configured' : 'Not configured'}
          />
        </span>
        <svg
          className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <form
          onSubmit={handleSave}
          className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-surface-dark"
        >
          <div>
            <p className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-300">Provider</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange(PROVIDERS.HUGGINGFACE)}
                className={`rounded-md border px-2 py-2 text-xs font-medium transition ${
                  !isLocal
                    ? 'border-accent bg-accent/10 text-accent dark:bg-accent/20'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-surface-dark-secondary'
                }`}
              >
                Hugging Face
              </button>
              <button
                type="button"
                onClick={() => handleProviderChange(PROVIDERS.LOCAL)}
                className={`rounded-md border px-2 py-2 text-xs font-medium transition ${
                  isLocal
                    ? 'border-accent bg-accent/10 text-accent dark:bg-accent/20'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-surface-dark-secondary'
                }`}
              >
                Local Llama
              </button>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-gray-400">
              {isLocal
                ? 'Uses Ollama or any OpenAI-compatible server on your machine (e.g. llama.cpp, LM Studio).'
                : 'Uses Hugging Face Inference Providers or a dedicated HF endpoint.'}
            </p>
          </div>

          {!isLocal && (
            <div>
              <label
                htmlFor="hf-api-key"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                API key
              </label>
              <div className="relative">
                <input
                  id="hf-api-key"
                  type={showKey ? 'text' : 'password'}
                  value={draft.apiKey}
                  onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="hf_..."
                  autoComplete="off"
                  className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 pr-16 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {isLocal && (
            <div>
              <label
                htmlFor="local-server-url"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                Local server URL
              </label>
              <input
                id="local-server-url"
                type="url"
                value={draft.endpoint}
                onChange={(e) => setDraft((prev) => ({ ...prev, endpoint: e.target.value }))}
                placeholder={LOCAL_LLM_DEFAULTS.endpoint}
                className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
              />
              <p className="mt-1 text-[10px] leading-snug text-gray-400">
                Ollama default: <code className="text-[10px]">{LOCAL_LLM_DEFAULTS.endpoint}</code>.
                Run <code className="text-[10px]">ollama pull llama3.2</code> first.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="hf-model" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              {isLocal ? 'Local model name' : 'Model ID'}
            </label>
            <input
              id="hf-model"
              type="text"
              value={draft.model}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              placeholder={isLocal ? LOCAL_LLM_DEFAULTS.model : 'Qwen/Qwen2.5-7B-Instruct'}
              className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
            />
            <p className="mt-1 text-[10px] leading-snug text-gray-400">
              {isLocal
                ? 'Must match an installed Ollama model (e.g. llama3.1:8b, llama3.2, mistral).'
                : 'Hugging Face model name for the Inference API.'}
            </p>
          </div>

          <div>
            <label
              htmlFor="hf-max-tokens"
              className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
            >
              Max tokens
            </label>
            <input
              id="hf-max-tokens"
              type="number"
              min={256}
              max={32768}
              step={256}
              value={draft.maxTokens}
              onChange={(e) =>
                setDraft((prev) => ({
                  ...prev,
                  maxTokens: e.target.value === '' ? '' : Number(e.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
            />
          </div>

          {!isLocal && (
            <div>
              <label
                htmlFor="hf-endpoint"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                Custom endpoint <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="hf-endpoint"
                type="url"
                value={draft.endpoint}
                onChange={(e) => setDraft((prev) => ({ ...prev, endpoint: e.target.value }))}
                placeholder="https://xxx.aws.endpoints.huggingface.cloud"
                className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
              />
              <p className="mt-1 text-[10px] leading-snug text-gray-400">
                Leave empty to use the public HF Inference API with the model ID above.
              </p>
            </div>
          )}

          {isLocal && (
            <div>
              <label
                htmlFor="local-api-key"
                className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
              >
                API key <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="local-api-key"
                type="password"
                value={draft.apiKey}
                onChange={(e) => setDraft((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder="Only if your local server requires auth"
                autoComplete="off"
                className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
              />
            </div>
          )}

          {!isLocal && (
            <>
              <div>
                <label
                  htmlFor="hf-vision-model"
                  className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
                >
                  Vision model
                </label>
                <input
                  id="hf-vision-model"
                  type="text"
                  value={draft.visionModel}
                  onChange={(e) => setDraft((prev) => ({ ...prev, visionModel: e.target.value }))}
                  placeholder="Salesforce/blip-vqa-base"
                  className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
                />
              </div>

              <div>
                <label
                  htmlFor="hf-image-gen-model"
                  className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300"
                >
                  Image generation model
                </label>
                <input
                  id="hf-image-gen-model"
                  type="text"
                  value={draft.imageGenModel}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, imageGenModel: e.target.value }))
                  }
                  placeholder="stabilityai/stable-diffusion-2-1"
                  className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full rounded-md bg-accent py-2 text-xs font-medium text-white transition hover:bg-accent-hover"
          >
            {saved ? 'Saved!' : 'Save settings'}
          </button>
        </form>
      )}
    </div>
  );
}
