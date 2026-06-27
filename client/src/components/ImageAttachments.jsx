/**
 * @param {{ images: string[], onRemove: (index: number) => void }} props
 */
export default function ImageAttachments({ images, onRemove }) {
  if (images.length === 0) return null;

  return (
    <div className="mx-auto mb-3 flex max-w-3xl flex-wrap gap-2">
      {images.map((src, index) => (
        <div key={`${src.slice(0, 32)}-${index}`} className="relative">
          <img
            src={src}
            alt={`Attachment ${index + 1}`}
            className="h-20 w-20 rounded-lg border border-gray-200 object-cover dark:border-gray-600"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-xs text-white shadow hover:bg-gray-700"
            aria-label={`Remove image ${index + 1}`}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
