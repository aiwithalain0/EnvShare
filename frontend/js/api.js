/**
 * EnvShare Centralized API Client
 *
 * Security Constraints:
 * - Centralized base URL targeting backend (http://127.0.0.1:8000).
 * - Pulls JWT Bearer token dynamically from in-memory Store.
 * - Never prints, logs, or exposes secret payloads or tokens to console.
 * - Handles 401 Unauthorized by clearing in-memory session.
 * - Strictly respects verified FastAPI backend contracts.
 */

import { store } from './store.js';

export const API_BASE_URL = 'http://127.0.0.1:8000';

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Core HTTP Request Wrapper
 * @param {string} endpoint - Path relative to base URL, e.g. '/auth/login'
 * @param {object} options - Fetch options (method, headers, body)
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = new Headers(options.headers || {});

  // Set standard headers
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  // Inject Bearer token from in-memory store if present
  const token = store.getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const config = {
    ...options,
    headers,
  };

  let response;
  try {
    response = await fetch(url, config);
  } catch (networkError) {
    throw new ApiError(
      'Unable to connect to the EnvShare backend server. Verify the server is running on port 8000.',
      0,
      networkError.message
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return null;
  }

  // Parse JSON response body if present
  let data = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      const text = await response.text();
      data = text ? { detail: text } : null;
    } catch {
      data = null;
    }
  }

  // Handle successful responses (200 - 299)
  if (response.ok) {
    return data;
  }

  // Handle Unauthorized (401)
  if (response.status === 401) {
    store.clearAuth();
    const errorMessage = data?.detail || 'Authentication required or session expired.';
    throw new ApiError(errorMessage, 401, data);
  }

  // Handle other HTTP errors with safe message formatting
  let errorMessage = 'An unexpected server error occurred.';
  if (data?.detail) {
    if (typeof data.detail === 'string') {
      errorMessage = data.detail;
    } else if (Array.isArray(data.detail)) {
      // Pydantic validation error array
      errorMessage = data.detail.map(e => e.msg || e.message || 'Validation error').join('; ');
    } else if (typeof data.detail === 'object' && data.detail.message) {
      errorMessage = data.detail.message;
    }
  } else if (data?.message) {
    errorMessage = data.message;
  }

  throw new ApiError(errorMessage, response.status, data);
}

/**
 * Health check helper
 * Endpoint: GET /health
 */
export async function checkBackendHealth() {
  return apiRequest('/health', { method: 'GET' });
}

/**
 * Register a new user
 * Endpoint: POST /auth/register
 * Payload: { email: str, password: str }
 */
export async function registerUser(email, password) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/**
 * Log in an existing user
 * Endpoint: POST /auth/login
 * Payload: { email: str, password: str }
 */
export async function loginUser(email, password) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

/* ==========================================================================
   Project API Endpoints
   ========================================================================== */

/**
 * List projects accessible by current user
 * Endpoint: GET /projects
 */
export async function listProjects() {
  return apiRequest('/projects', { method: 'GET' });
}

/**
 * Create a new project
 * Endpoint: POST /projects
 * Payload: { name: str }
 */
export async function createProject(nameOrObj) {
  const name = typeof nameOrObj === 'string' ? nameOrObj : (nameOrObj?.name || '');
  return apiRequest('/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/**
 * Get audit logs for a project (Admin clearance required)
 * Endpoint: GET /projects/{projectId}/audit-logs?limit={limit}
 */
export async function getProjectAuditLogs(projectId, limit = 50) {
  return apiRequest(`/projects/${projectId}/audit-logs?limit=${encodeURIComponent(limit)}`, {
    method: 'GET',
  });
}

/* ==========================================================================
   Environment API Endpoints
   ========================================================================== */

/**
 * List environments for a project
 * Endpoint: GET /projects/{projectId}/environments
 */
export async function listEnvironments(projectId) {
  return apiRequest(`/projects/${projectId}/environments`, { method: 'GET' });
}

/**
 * Create an environment for a project
 * Endpoint: POST /projects/{projectId}/environments
 * Payload: { name: str }
 */
export async function createEnvironment(projectId, name) {
  return apiRequest(`/projects/${projectId}/environments`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

/* ==========================================================================
   Variable API Endpoints
   ========================================================================== */

/**
 * List active variables in an environment
 * Endpoint: GET /projects/{projectId}/environments/{environmentId}/variables
 */
export async function listVariables(projectId, environmentId) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables`,
    { method: 'GET' }
  );
}

/**
 * Create a variable
 * Endpoint: POST /projects/{projectId}/environments/{environmentId}/variables
 * Payload: { key: str, value: str, is_sensitive: bool }
 */
export async function createVariable(projectId, environmentId, key, value, isSensitive = true) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables`,
    {
      method: 'POST',
      body: JSON.stringify({ key, value, is_sensitive: isSensitive }),
    }
  );
}

/**
 * Reveal plaintext variable value (Decrypted server-side, recorded in audit log)
 * Endpoint: GET /projects/{projectId}/environments/{environmentId}/variables/{variableId}/reveal
 */
export async function revealVariable(projectId, environmentId, variableId) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}/reveal`,
    { method: 'GET' }
  );
}

/**
 * Update an existing variable value
 * Endpoint: PUT /projects/{projectId}/environments/{environmentId}/variables/{variableId}
 * Payload: { value: str, is_sensitive: bool }
 */
export async function updateVariable(projectId, environmentId, variableId, value, isSensitive = true) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}`,
    {
      method: 'PUT',
      body: JSON.stringify({ value, is_sensitive: isSensitive }),
    }
  );
}

/**
 * Delete a variable (Soft-delete with audit event)
 * Endpoint: DELETE /projects/{projectId}/environments/{environmentId}/variables/{variableId}
 */
export async function deleteVariable(projectId, environmentId, variableId) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}`,
    { method: 'DELETE' }
  );
}

/**
 * Get variable version history
 * Endpoint: GET /projects/{projectId}/environments/{environmentId}/variables/{variableId}/history
 */
export async function getVariableHistory(projectId, environmentId, variableId) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}/history`,
    { method: 'GET' }
  );
}

/**
 * Preview .env import content without writing to storage
 * Endpoint: POST /projects/{projectId}/environments/{environmentId}/variables/import/preview
 * Payload: { content: str }
 */
export async function previewEnvImport(projectId, environmentId, content) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/import/preview`,
    {
      method: 'POST',
      body: JSON.stringify({ content }),
    }
  );
}

/**
 * Commit batch .env import content to environment
 * Endpoint: POST /projects/{projectId}/environments/{environmentId}/variables/import
 * Payload: { content: str, confirm_import: bool }
 */
export async function commitEnvImport(projectId, environmentId, content, confirmImport = true) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/import`,
    {
      method: 'POST',
      body: JSON.stringify({ content, confirm_import: confirmImport }),
    }
  );
}


