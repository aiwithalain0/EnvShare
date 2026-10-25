/**
 * EnvShare Minimal Client-Side Router
 *
 * Architecture:
 * - Hash-based client routing for vanilla single-page architecture.
 * - Protects authenticated views using in-memory store auth status.
 * - Respects decisions: Team Members route is intentionally omitted (no backend support).
 */

import { store } from './store.js';

class Router {
  constructor() {
    this._routes = new Map();
    this._currentRoute = null;
    this._params = {};
    this._isNavigating = false;

    // Listen to browser hash changes
    window.addEventListener('hashchange', () => this._handleHashChange());
  }

  /**
   * Register a route path and handler
   * @param {string} path - e.g. 'login', 'register', 'projects', 'workspace'
   * @param {object} config - { handler: Function, requiresAuth: boolean }
   */
  register(path, config) {
    this._routes.set(path, config);
  }

  /**
   * Programmatic navigation
   * @param {string} path - route identifier
   * @param {object} params - optional route parameters
   */
  navigate(path, params = {}) {
    this._params = params;
    window.location.hash = `#${path}`;
  }

  /**
   * Initialize router on app startup
   */
  init(defaultRoute = 'projects') {
    if (!window.location.hash) {
      window.location.hash = `#${defaultRoute}`;
    } else {
      this._handleHashChange();
    }
  }

  /**
   * Get current active route name
   */
  getCurrentRoute() {
    return this._currentRoute;
  }

  /**
   * Handle hash changes with route protection
   */
  _handleHashChange() {
    if (this._isNavigating) return;
    this._isNavigating = true;

    try {
      const rawHash = window.location.hash.replace(/^#\/?/, '').trim();
      const [routePath, queryString] = rawHash.split('?');
      const targetRoute = routePath || (store.isAuthenticated() ? 'overview' : 'login');

      // Parse query params if any
      const searchParams = new URLSearchParams(queryString || '');
      for (const [key, val] of searchParams.entries()) {
        this._params[key] = val;
      }

      const routeConfig = this._routes.get(targetRoute);

      if (!routeConfig) {
        // Unknown route fallback
        const fallback = store.isAuthenticated() ? 'overview' : 'login';
        this.navigate(fallback);
        return;
      }

      // Check auth protection
      if (routeConfig.requiresAuth && !store.isAuthenticated()) {
        this.navigate('login');
        return;
      }

      // Prevent logged-in users from visiting auth pages
      if (!routeConfig.requiresAuth && store.isAuthenticated() && (targetRoute === 'login' || targetRoute === 'register')) {
        this.navigate('overview');
        return;
      }

      this._currentRoute = targetRoute;

      // Execute route handler
      if (typeof routeConfig.handler === 'function') {
        routeConfig.handler(this._params);
      }

      // Update active state in UI nav items
      this._updateActiveNav(targetRoute);

    } finally {
      this._isNavigating = false;
    }
  }

  _updateActiveNav(activeRoute) {
    const navItems = document.querySelectorAll('[data-nav-route]');
    navItems.forEach(el => {
      const route = el.getAttribute('data-nav-route');
      if (route === activeRoute) {
        el.classList.add('is-active');
        el.setAttribute('aria-current', 'page');
      } else {
        el.classList.remove('is-active');
        el.removeAttribute('aria-current');
      }
    });
  }
}

// Export singleton router instance
export const router = new Router();
