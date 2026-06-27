import { useEffect, useState } from 'react';

/**
 * @param {{
 *   settings: { apiKey: string, model: string, endpoint: string },
 *   configured: boolean,
 *   onSave: (settings: { apiKey: string, model: string, endpoint: string }) => void,
 * }} props
 */
export default function ModelSettings({ settings, configured, onSave }) {
  const [open, setOpen] = useState(!configured);
  const [draft, setDraft] = useState(settings);
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const handleSave = (e) => {
    e.preventDefault();
    onSave({
      apiKey: draft.apiKey.trim(),
      model: draft.model.trim(),
      endpoint: draft.endpoint.trim(),
      visionModel: draft.visionModel.trim(),
      imageGenModel: draft.imageGenModel.trim(),
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
        <form onSubmit={handleSave} className="mt-2 space-y-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-surface-dark">
          <div>
            <label htmlFor="hf-api-key" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
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

          <div>
            <label htmlFor="hf-model" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Model ID
            </label>
            <input
              id="hf-model"
              type="text"
              value={draft.model}
              onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
              placeholder="mistralai/Mistral-7B-Instruct-v0.2"
              className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
            />
            <p className="mt-1 text-[10px] leading-snug text-gray-400">
              Hugging Face model name for the Inference API.
            </p>
          </div>

          <div>
            <label htmlFor="hf-endpoint" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
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

          <div>
            <label htmlFor="hf-vision-model" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
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
            <p className="mt-1 text-[10px] leading-snug text-gray-400">
              Used when you upload images to chat.
            </p>
          </div>

          <div>
            <label htmlFor="hf-image-gen-model" className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-300">
              Image generation model
            </label>
            <input
              id="hf-image-gen-model"
              type="text"
              value={draft.imageGenModel}
              onChange={(e) => setDraft((prev) => ({ ...prev, imageGenModel: e.target.value }))}
              placeholder="stabilityai/stable-diffusion-2-1"
              className="w-full rounded-md border border-gray-200 bg-surface-secondary px-2.5 py-2 font-mono text-xs outline-none focus:border-accent dark:border-gray-600 dark:bg-surface-dark-secondary"
            />
            <p className="mt-1 text-[10px] leading-snug text-gray-400">
              Used for &quot;generate an image of…&quot; or /image prompts.
            </p>
          </div>

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
