import { API_BASE } from './constants';

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

export async function uploadModel(file) {
  const formData = new FormData();
  formData.append('file', file);
  return request('/models/upload', {
    method: 'POST',
    body: formData,
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
export async function convertFile(file, { pitchShift = 0, formantShift = 0, f0Method = 'pm', effects = {}, useModel = true } = {}) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('pitch_shift', String(pitchShift));
  formData.append('formant_shift', String(formantShift));
  formData.append('f0_method', f0Method);
  formData.append('effects', JSON.stringify(effects));
  formData.append('use_model', String(useModel));

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
