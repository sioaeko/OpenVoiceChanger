import { API_BASE, DEFAULT_F0_METHOD } from './constants';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(url, options = {}) {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      // Response may not be JSON
    }
    throw new ApiError(
      data?.detail || `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      data
    );
  }

  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function fetchModels() {
  return request('/models/');
}

/**
 * Upload a model checkpoint, reporting real transport progress.
 *
 * fetch() cannot observe request-body progress in any shipping browser, so a
 * multi-gigabyte checkpoint upload would have to be faked. XMLHttpRequest does
 * expose upload.onprogress, which is why it is used here instead.
 *
 * `onProgress` receives 0..100. While the browser is still streaming the body
 * it is the true byte ratio; once the last byte is sent the request sits at 99
 * until the server finishes writing the file and responds.
 */
export function uploadModel(file, onProgress) {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE}/models/upload`);
    xhr.responseType = 'text';

    if (typeof onProgress === 'function') {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || event.total === 0) return;
        // Cap below 100: the server still has to persist and register the file.
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      };
      xhr.upload.onload = () => onProgress(99);
    }

    xhr.onload = () => {
      let data = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // Response may not be JSON.
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(data ?? xhr.responseText ?? null);
        return;
      }

      reject(new ApiError(
        data?.detail || `Upload failed: ${xhr.status} ${xhr.statusText}`,
        xhr.status,
        data
      ));
    };

    xhr.onerror = () => reject(new ApiError('Upload failed: network error', 0, null));
    xhr.onabort = () => reject(new ApiError('Upload cancelled', 0, null));
    xhr.ontimeout = () => reject(new ApiError('Upload timed out', 0, null));

    xhr.send(formData);
  });
}

export async function deleteModel(name) {
  return request(`/models/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
}

export async function activateModel(name) {
  return request(`/models/${encodeURIComponent(name)}/activate`, {
    method: 'POST',
  });
}

export async function deactivateModel() {
  return request('/models/deactivate', {
    method: 'POST',
  });
}

export async function getActiveModel() {
  return request('/models/active');
}

export async function fetchConfig() {
  return request('/config');
}

export async function fetchPresets() {
  return request('/presets/');
}

export async function savePreset(name, settings, emoji = '⭐') {
  return request('/presets/', {
    method: 'POST',
    body: JSON.stringify({ name, settings, emoji }),
  });
}

export async function deletePreset(presetId) {
  return request(`/presets/${encodeURIComponent(presetId)}`, {
    method: 'DELETE',
  });
}

// Returns a WAV Blob of the converted audio.
export async function convertFile(file, {
  pitchShift = 0,
  formantShift = 0,
  f0Method = DEFAULT_F0_METHOD,
  effects = {},
  useModel = true,
  indexRate,
  filterRadius,
  rmsMixRate,
  protect,
} = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pitch_shift', String(pitchShift));
  formData.append('formant_shift', String(formantShift));
  formData.append('f0_method', f0Method);
  formData.append('effects', JSON.stringify(effects));
  formData.append('use_model', String(useModel));

  // Advanced RVC controls are only sent when they hold a real number: an empty
  // field would fail server-side coercion, and omitting one means "server
  // default" rather than zero.
  for (const [field, value] of [
    ['index_rate', indexRate],
    ['filter_radius', filterRadius],
    ['rms_mix_rate', rmsMixRate],
    ['protect', protect],
  ]) {
    if (Number.isFinite(Number(value)) && value !== null && value !== '') {
      formData.append(field, String(value));
    }
  }

  const response = await fetch(`${API_BASE}/convert/`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {
      // Response may not be JSON
    }
    throw new ApiError(
      data?.detail || `Conversion failed: ${response.status} ${response.statusText}`,
      response.status,
      data
    );
  }

  return response.blob();
}
