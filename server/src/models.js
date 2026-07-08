import { MODEL_ID } from './config.js';

export const MODEL_PROFILES = {
  [MODEL_ID]: {
    id: MODEL_ID,
    provider: 'zhipu',
    displayName: '智谱 GLM-5.2',
    capabilities: {
      text: true,
      vision: true,
      tools: true,
      imageGeneration: false
    }
  }
};

export function resolveModelProfile(modelId = MODEL_ID) {
  return MODEL_PROFILES[modelId] || MODEL_PROFILES[MODEL_ID];
}

export function normalizeImageInputs(images = []) {
  if (!Array.isArray(images)) {
    return [];
  }

  return images
    .map((image) => ({
      mediaType: String(image?.mediaType || '').trim(),
      data: String(image?.data || '').trim()
    }))
    .filter((image) => image.mediaType.startsWith('image/') && image.data);
}

export function normalizeScreenshotInput(screenshot) {
  if (!screenshot) {
    return null;
  }

  const mediaType = String(screenshot.mediaType || '').trim();
  const data = String(screenshot.data || '').trim();

  if (!mediaType.startsWith('image/') || !data) {
    return null;
  }

  return { mediaType, data };
}
