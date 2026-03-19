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
