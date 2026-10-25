/**
 * EnvShare Centralized In-Memory Application State Store
 *
 * Security Constraints:
 * - JWT access tokens are stored ONLY in JavaScript memory.
 * - Never written to localStorage or sessionStorage.
 * - Never output to console logs or analytics.
 */

class Store {
  constructor() {
    // In-memory state only
    this._state = {
      auth: {
        token: null, // In-memory JWT access token
        user: null,  // { id, email }
        isAuthenticated: false,
      },
      projects: {
        list: [],
        activeProject: null, // { id, name, created_at }
        loading: false,
      },
      environments: {
        list: [],
        activeEnvironment: null, // { id, project_id, name }
        loading: false,
      },
      variables: {
        list: [],
        loading: false,
      },
      auditLogs: {
        list: [],
        loading: false,
      },
      ui: {
        activeModal: null,
      },
    };

    this._listeners = new Map();
  }

  /**
   * Get a shallow copy of the state
   */
  getState() {
    return this._state;
  }

  /**
   * Subscribe to state changes on a specific slice or '*'
   * @param {string} slice - e.g. 'auth', 'projects', 'variables', '*'
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(slice, callback) {
    if (!this._listeners.has(slice)) {
      this._listeners.set(slice, new Set());
    }
    this._listeners.get(slice).add(callback);

    return () => {
      const sliceListeners = this._listeners.get(slice);
      if (sliceListeners) {
        sliceListeners.delete(callback);
      }
    };
  }

  /**
   * Notify subscribers of changes
   */
  _emit(slice, data) {
    if (this._listeners.has(slice)) {
      this._listeners.get(slice).forEach(cb => {
        try {
          cb(data, this._state);
        } catch (err) {
          // Prevent listener errors from breaking execution
          // Never log sensitive payload
        }
      });
    }

    if (this._listeners.has('*')) {
      this._listeners.get('*').forEach(cb => {
        try {
          cb(slice, data, this._state);
        } catch (err) {}
      });
    }
  }

  /* ==========================================================================
     Authentication State Management (Strict In-Memory)
     ========================================================================== */

  /**
   * Set authentication session in memory
   * @param {string} token - JWT Bearer token
   * @param {object} user - User metadata { id, email }
   */
  setAuth(token, user) {
    this._state.auth = {
      token: token || null,
      user: user || null,
      isAuthenticated: Boolean(token),
    };
    this._emit('auth', this._state.auth);
  }

  /**
   * Get in-memory auth token for API requests
   * @returns {string|null}
   */
  getAuthToken() {
    return this._state.auth.token;
  }

  /**
   * Check if user is currently authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return this._state.auth.isAuthenticated;
  }

  /**
   * Clear auth session from memory on logout or 401
   */
  clearAuth() {
    this._state.auth = {
      token: null,
      user: null,
      isAuthenticated: false,
    };
    this._state.projects = { list: [], activeProject: null, loading: false };
    this._state.environments = { list: [], activeEnvironment: null, loading: false };
    this._state.variables = { list: [], loading: false };
    this._emit('auth', this._state.auth);
  }

  /* ==========================================================================
     Projects & Environment State Management
     ========================================================================== */

  setProjects(projectsList) {
    this._state.projects.list = Array.isArray(projectsList) ? projectsList : [];
    this._emit('projects', this._state.projects);
  }

  setActiveProject(project) {
    this._state.projects.activeProject = project || null;
    this._state.environments.list = [];
    this._state.environments.activeEnvironment = null;
    this._state.variables.list = [];
    this._emit('activeProject', project);
  }

  getCurrentProject() {
    return this._state.projects.activeProject;
  }

  getActiveProject() {
    return this._state.projects.activeProject;
  }

  setCurrentProject(project) {
    if (!project) {
      this.setActiveProject(null);
      return;
    }

    const { environments, activeEnvironment, ...projectData } = project;
    this.setActiveProject(projectData);

    if (Array.isArray(environments)) {
      this.setEnvironments(environments);
    }

    if (activeEnvironment !== undefined && activeEnvironment !== null) {
      this.setActiveEnvironment(activeEnvironment);
    } else if (Array.isArray(environments) && environments.length > 0) {
      const defaultEnv = environments.find(e => e.name && e.name.toLowerCase() === 'development') || environments[0];
      this.setActiveEnvironment(defaultEnv);
    }

    if (this._state.projects.activeProject) {
      this._state.projects.activeProject.environments = this._state.environments.list;
      this._state.projects.activeProject.activeEnvironment = this._state.environments.activeEnvironment;
    }
  }

  getActiveEnvironment() {
    return this._state.environments.activeEnvironment;
  }

  setEnvironments(envList) {
    this._state.environments.list = Array.isArray(envList) ? envList : [];
    this._emit('environments', this._state.environments);
  }

  setActiveEnvironment(environment) {
    this._state.environments.activeEnvironment = environment || null;
    this._state.variables.list = [];
    this._emit('activeEnvironment', environment);
  }

  setVariables(variablesList) {
    this._state.variables.list = Array.isArray(variablesList) ? variablesList : [];
    this._emit('variables', this._state.variables);
  }

  setAuditLogs(auditList) {
    this._state.auditLogs = { list: Array.isArray(auditList) ? auditList : [], loading: false };
    this._emit('auditLogs', this._state.auditLogs);
  }
}

// Export singleton store instance
export const store = new Store();
