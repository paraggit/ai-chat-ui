const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENTS = 4;

/**
 * @param {File} file
 * @returns {Promise<string>}
 */
export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      reject(new Error('Only JPEG, PNG, GIF, and WebP images are supported.'));
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      reject(new Error('Each image must be 5 MB or smaller.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * @param {FileList | File[]} files
 * @param {number} currentCount
 * @returns {Promise<string[]>}
 */
export async function processImageFiles(files, currentCount = 0) {
  const list = Array.from(files);
  const remaining = MAX_ATTACHMENTS - currentCount;

  if (remaining <= 0) {
    throw new Error(`You can attach up to ${MAX_ATTACHMENTS} images.`);
  }

  const selected = list.slice(0, remaining);
  return Promise.all(selected.map(readFileAsDataUrl));
}

export { MAX_ATTACHMENTS };
