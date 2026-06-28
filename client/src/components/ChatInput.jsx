import { useRef, useState } from 'react';
import ImageAttachments from './ImageAttachments.jsx';
import { MAX_ATTACHMENTS, processImageFiles } from '../utils/images.js';

/**
 * @param {{
 *   onSend: (text: string, images?: string[]) => void,
 *   onStop?: () => void,
 *   onCopyLast?: () => Promise<boolean>,
 *   isGenerating?: boolean,
 *   canCopyLast?: boolean,
 *   disabled: boolean,
 *   configured: boolean,
 *   localMode?: boolean,
 * }} props
 */
export default function ChatInput({
  onSend,
  onStop,
  onCopyLast,
  isGenerating = false,
  canCopyLast = false,
  disabled,
  configured,
  localMode = false,
}) {
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [attachments, setAttachments] = useState(/** @type {string[]} */ ([]));
  const [uploadError, setUploadError] = useState(/** @type {string | null} */ (null));
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isGenerating) return;
    const text = inputRef.current?.value ?? '';
    if (!text.trim() && attachments.length === 0) return;

    onSend(text, attachments);
    if (inputRef.current) inputRef.current.value = '';
    setAttachments([]);
    setUploadError(null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploadError(null);
    try {
      const dataUrls = await processImageFiles(files, attachments.length);
      setAttachments((prev) => [...prev, ...dataUrls]);
    } catch (err) {
      setUploadError(err.message || 'Failed to attach image');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCopyLast = async () => {
    if (!onCopyLast) return;
    const ok = await onCopyLast();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-4 dark:border-gray-700 dark:bg-surface-dark">
      {!configured && (
        <div className="mx-auto mb-3 max-w-3xl rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {localMode
            ? 'Configure your local server URL and model name in sidebar settings (Ollama: ollama pull llama3.2).'
            : 'Configure your Hugging Face API key and model in the sidebar settings before chatting.'}
        </div>
      )}

      {isGenerating && (
        <div className="mx-auto mb-3 flex max-w-3xl items-center justify-between gap-2 rounded-lg border border-gray-200 bg-surface-secondary px-3 py-2 dark:border-gray-700 dark:bg-surface-dark-secondary">
          <p className="text-xs text-gray-500 dark:text-gray-400">Generating response…</p>
          <div className="flex items-center gap-2">
            {canCopyLast && (
              <button
                type="button"
                onClick={handleCopyLast}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-white dark:border-gray-600 dark:text-gray-300 dark:hover:bg-surface-dark"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-red-600"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              Stop
            </button>
          </div>
        </div>
      )}

      <ImageAttachments images={attachments} onRemove={removeAttachment} />

      {uploadError && (
        <div className="mx-auto mb-3 max-w-3xl rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {uploadError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gray-200 bg-surface-secondary px-3 py-3 shadow-sm dark:border-gray-700 dark:bg-surface-dark-secondary sm:gap-3 sm:px-4"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          type="button"
          disabled={disabled || isGenerating || !configured || attachments.length >= MAX_ATTACHMENTS}
          onClick={() => fileRef.current?.click()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-white hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-surface-dark"
          aria-label="Upload image"
          title="Upload image"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </button>

        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Message HF Chat Pro… (try: generate an image of a sunset)"
          disabled={disabled || isGenerating || !configured}
          onKeyDown={handleKeyDown}
          className="max-h-40 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-gray-400 disabled:opacity-50 dark:placeholder:text-gray-500"
        />

        {isGenerating ? (
          <button
            type="button"
            onClick={onStop}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition hover:bg-red-600"
            aria-label="Stop generation"
            title="Stop generation"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            type="submit"
            disabled={disabled || !configured}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 12h14M12 5l7 7-7 7"
              />
            </svg>
          </button>
        )}
      </form>

      <p className="mx-auto mt-2 max-w-3xl text-center text-xs text-gray-400">
        Upload images to analyze · Say &quot;generate an image of…&quot; or use /image to create images
      </p>
    </div>
  );
}
