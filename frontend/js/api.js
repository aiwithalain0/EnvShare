import { store } from './store.js';

const configuredApiUrl = window.ENVSHARE_API_URL;

const isLocalDevelopment = ['localhost', '127.0.0.1'].includes(
  window.location.hostname
);

export const API_BASE_URL = (
  typeof configuredApiUrl === 'string' && configuredApiUrl.trim()
    ? configuredApiUrl.trim()
    : isLocalDevelopment
      ? `http://${window.location.hostname}:8000`
      : ''
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function apiRequest(endpoint, options = {}) {
  if (!API_BASE_URL) {
    throw new ApiError(
      'Backend URL is not configured. Please configure ENVSHARE_API_URL.',
      0
    );
  }

  const token = store.getAuthToken();
  const headers = new Headers(options.headers || {});

  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    throw new ApiError(
      'Unable to connect to the EnvShare backend. Check that the backend is running.',
      0,
      error
    );
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  let data = null;

  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    const text = await response.text();
    data = text ? { detail: text } : null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      store.clearAuthToken();
    }

    const message =
      data?.detail ||
      data?.message ||
      `Request failed with status ${response.status}.`;

    throw new ApiError(message, response.status, data);
  }

  return data;
}

export async function checkBackendHealth() {
  return apiRequest('/health');
}

export async function registerUser(userData) {
  return apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

export async function loginUser(credentials) {
  return apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function listProjects() {
  return apiRequest('/projects');
}

export async function createProject(projectData) {
  return apiRequest('/projects', {
    method: 'POST',
    body: JSON.stringify(projectData),
  });
}

export async function getProjectAuditLogs(projectId) {
  return apiRequest(`/projects/${projectId}/audit-logs`);
}

export async function deleteProject(projectId) {
  return apiRequest(`/projects/${projectId}`, {
    method: 'DELETE',
  });
}

export async function listEnvironments(projectId) {
  return apiRequest(`/projects/${projectId}/environments`);
}

export async function createEnvironment(projectId, environmentData) {
  return apiRequest(`/projects/${projectId}/environments`, {
    method: 'POST',
    body: JSON.stringify(environmentData),
  });
}

export async function deleteEnvironment(projectId, environmentId) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}`,
    {
      method: 'DELETE',
    }
  );
}

export async function listVariables(projectId, environmentId) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables`
  );
}

export async function createVariable(
  projectId,
  environmentId,
  variableData
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables`,
    {
      method: 'POST',
      body: JSON.stringify(variableData),
    }
  );
}

export async function revealVariable(projectId, variableId) {
  return apiRequest(`/projects/${projectId}/variables/${variableId}/reveal`, {
    method: 'POST',
  });
}

export async function updateVariable(projectId, variableId, variableData) {
  return apiRequest(`/projects/${projectId}/variables/${variableId}`, {
    method: 'PUT',
    body: JSON.stringify(variableData),
  });
}

export async function deleteVariable(projectId, variableId) {
  return apiRequest(`/projects/${projectId}/variables/${variableId}`, {
    method: 'DELETE',
  });
}

export async function getVariableHistory(projectId, variableId) {
  return apiRequest(`/projects/${projectId}/variables/${variableId}/history`);
}

export async function revealVariableHistory(
  projectId,
  variableId,
  versionId
) {
  return apiRequest(
    `/projects/${projectId}/variables/${variableId}/history/${versionId}/reveal`,
    {
      method: 'POST',
    }
  );
}

export async function previewEnvImport(
  projectId,
  environmentId,
  importData
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/import/preview`,
    {
      method: 'POST',
      body: JSON.stringify(importData),
    }
  );
}

export async function commitEnvImport(
  projectId,
  environmentId,
  importData
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/import`,
    {
      method: 'POST',
      body: JSON.stringify(importData),
    }
  );
}

export async function listProjectMembers(projectId) {
  return apiRequest(`/projects/${projectId}/members`);
}

export async function removeProjectMember(projectId, memberId) {
  return apiRequest(`/projects/${projectId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export async function createInviteCode(projectId, inviteData) {
  return apiRequest(`/projects/${projectId}/invites`, {
    method: 'POST',
    body: JSON.stringify(inviteData),
  });
}

export async function listInviteCodes(projectId) {
  return apiRequest(`/projects/${projectId}/invites`);
}

export async function revokeInviteCode(projectId, inviteId) {
  return apiRequest(`/projects/${projectId}/invites/${inviteId}`, {
    method: 'DELETE',
  });
}

export async function joinProjectWithCode(inviteCode) {
  return apiRequest('/projects/join', {
    method: 'POST',
    body: JSON.stringify({ code: inviteCode }),
  });
}
