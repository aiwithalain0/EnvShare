
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

function getErrorMessage(data, status) {
  const rawMessage = data?.detail ?? data?.message;

  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    return rawMessage;
  }

  if (Array.isArray(rawMessage)) {
    return rawMessage
      .map((item) => {
        if (typeof item === 'string') {
          return item;
        }

        if (item && typeof item === 'object') {
          return item.msg || item.message || JSON.stringify(item);
        }

        return String(item);
      })
      .join('; ');
  }

  if (rawMessage && typeof rawMessage === 'object') {
    return rawMessage.message || rawMessage.msg || JSON.stringify(rawMessage);
  }

  return `Request failed with status ${status}.`;
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
      credentials: options.credentials ?? 'include',
      headers,
    });
  } catch (error) {
    throw new ApiError(
      'Unable to connect to the EnvShare backend. Check your internet connection and try again.',
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
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    const responseText = await response.text();
    data = responseText ? { detail: responseText } : null;
  }

  if (!response.ok) {
    if (response.status === 401) {
      store.clearAuth();
    }

    throw new ApiError(
      getErrorMessage(data, response.status),
      response.status,
      data
    );
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

export async function refreshAccessToken() {
  return apiRequest('/auth/refresh', {
    method: 'POST',
  });
}

export async function logoutUser() {
  return apiRequest('/auth/logout', {
    method: 'POST',
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

export async function revealVariable(
  projectId,
  environmentId,
  variableId
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}/reveal`,
    {
      method: 'GET',
    }
  );
}

export async function updateVariable(
  projectId,
  environmentId,
  variableId,
  variableData
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}`,
    {
      method: 'PUT',
      body: JSON.stringify(variableData),
    }
  );
}

export async function deleteVariable(
  projectId,
  environmentId,
  variableId
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}`,
    {
      method: 'DELETE',
    }
  );
}

export async function getVariableHistory(
  projectId,
  environmentId,
  variableId
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}/history`
  );
}

export async function revealVariableHistory(
  projectId,
  environmentId,
  variableId,
  versionId
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/${variableId}/history/${versionId}/reveal`,
    {
      method: 'GET',
    }
  );
}

export async function previewEnvImport(
  projectId,
  environmentId,
  importData
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/import/preview`,
    {
      method: 'POST',
      body: JSON.stringify(importData),
    }
  );
}

export async function commitEnvImport(
  projectId,
  environmentId,
  content,
  confirmImport = true,
  overwriteExisting = false
) {
  return apiRequest(
    `/projects/${projectId}/environments/${environmentId}/variables/import`,
    {
      method: 'POST',
      body: JSON.stringify({
        content,
        confirm_import: confirmImport,
        overwrite_existing: overwriteExisting,
      }),
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


// Environment file version control

function environmentFilesEndpoint(projectId, environmentId) {
  return `/projects/${projectId}/environments/${environmentId}/files`;
}

export async function listEnvironmentFiles(projectId, environmentId) {
  return apiRequest(environmentFilesEndpoint(projectId, environmentId));
}

export async function getEnvironmentFileContent(
  projectId,
  environmentId,
  fileId
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/content`
  );
}

export async function createEnvironmentFileCommit(
  projectId,
  environmentId,
  message,
  changes
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/commits`,
    {
      method: 'POST',
      body: JSON.stringify({ message, changes }),
    }
  );
}

export async function listEnvironmentFileCommits(projectId, environmentId) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/commits`
  );
}

export async function getEnvironmentFileHistory(
  projectId,
  environmentId,
  fileId
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/history`
  );
}

export async function getEnvironmentFileVersion(
  projectId,
  environmentId,
  fileId,
  versionNumber
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/versions/${versionNumber}`
  );
}

export async function compareEnvironmentFileVersions(
  projectId,
  environmentId,
  fileId,
  fromVersion,
  toVersion
) {
  const params = new URLSearchParams({
    from_version: String(fromVersion),
    to_version: String(toVersion),
  });

  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/compare?${params}`
  );
}

export async function renameEnvironmentFile(
  projectId,
  environmentId,
  fileId,
  filename,
  message = 'Rename file'
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/rename`,
    {
      method: 'PATCH',
      body: JSON.stringify({ filename, message }),
    }
  );
}

export async function deleteEnvironmentFile(projectId, environmentId, fileId) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}`,
    {
      method: 'DELETE',
    }
  );
}

export async function restoreEnvironmentFile(
  projectId,
  environmentId,
  fileId
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/restore`,
    {
      method: 'POST',
    }
  );
}

export async function previewEnvironmentFile(
  projectId,
  environmentId,
  content
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/preview`,
    {
      method: 'POST',
      body: JSON.stringify({ content }),
    }
  );
}

export async function copyEnvironmentFile(
  projectId,
  environmentId,
  fileId,
  versionNumber = null
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/copy`,
    {
      method: 'POST',
      body: JSON.stringify({ version_number: versionNumber }),
    }
  );
}

export async function restoreEnvironmentFileVersion(
  projectId,
  environmentId,
  fileId,
  versionNumber
) {
  return apiRequest(
    `${environmentFilesEndpoint(projectId, environmentId)}/${fileId}/versions/${versionNumber}/restore`,
    {
      method: 'POST',
    }
  );
}

