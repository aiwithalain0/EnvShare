/**
 * EnvShare Authentication Views & Logic
 *
 * Security Constraints:
 * - Passwords and JWT tokens are NEVER printed, logged, stored in localStorage/sessionStorage, or put in URLs.
 * - JWT access token is stored ONLY in JavaScript memory (via store.setAuth).
 * - Authoritative validation is server-side; client validation provides immediate accessible feedback.
 */

import { registerUser, loginUser, ApiError } from './api.js';
import { store } from './store.js';
import { router } from './router.js';

// Client-side validation helpers matching backend Pydantic schema in schemas.py
export function validateEmail(email) {
  const trimmed = email.trim();
  if (!trimmed) return 'Email address is required.';
  // Standard RFC 5322 compatible regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return 'Please enter a valid email address.';
  }
  return null;
}

export function validatePasswordForRegistration(password) {
  if (!password) return 'Password is required.';
  if (password !== password.trim()) {
    return 'Password must not start or end with whitespace.';
  }
  if (password.length < 12) {
    return 'Password must be at least 12 characters long.';
  }
  if (password.length > 128) {
    return 'Password must not exceed 128 characters.';
  }
  if (!/[A-Za-z]/.test(password)) {
    return 'Password must contain at least one letter.';
  }
  if (!/\d/.test(password)) {
    return 'Password must contain at least one number.';
  }
  return null;
}

export function validatePasswordForLogin(password) {
  if (!password || password.length === 0) {
    return 'Password is required.';
  }
  return null;
}

/**
 * Render Login Screen
 * @param {HTMLElement} container
 */
export function renderLoginView(container) {
  container.innerHTML = `
    <div class="auth-view-wrapper">
      <div class="auth-box" role="region" aria-labelledby="login-title">
        <div class="auth-box-header">
          <div class="sidebar-brand-icon" style="margin-bottom: var(--space-xs);">
            <span class="material-symbols-outlined" style="font-size: 24px; color: #FFFFFF;">lock_open</span>
          </div>
          <h1 id="login-title" class="type-h3" style="margin: 0; color: var(--color-text-primary);">EnvShare</h1>
          <p class="type-body-sm" style="margin: 0; color: var(--color-text-secondary);">Enterprise Environment Security & Team Secrets</p>
        </div>

        <div id="auth-alert" class="auth-alert" role="alert" style="display: none; padding: 10px 14px; background-color: var(--color-error-bg); border: 1px solid var(--color-error-border); border-radius: var(--radius-md); color: var(--color-error-text); font-size: var(--font-size-body-sm);"></div>

        <form id="login-form" novalidate style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
            <label for="login-email" class="form-label">
              <span>Work email address</span>
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              class="input-control"
              placeholder="engineer@company.com"
              autocomplete="username"
              required
            >
            <div id="login-email-error" class="form-error" style="display: none; color: var(--color-error); font-size: var(--font-size-caption);"></div>
          </div>

          <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
            <label for="login-password" class="form-label">
              <span>Master Password</span>
            </label>
            <div style="position: relative; display: flex; align-items: center;">
              <input
                id="login-password"
                name="password"
                type="password"
                class="input-control font-mono"
                placeholder="••••••••••••"
                autocomplete="current-password"
                required
                style="padding-right: 40px;"
              >
              <button
                id="login-toggle-password"
                type="button"
                class="btn-icon"
                aria-label="Toggle password visibility"
                style="position: absolute; right: 4px; width: 32px; height: 32px;"
              >
                <span class="material-symbols-outlined" style="font-size: 18px;">visibility</span>
              </button>
            </div>
            <div id="login-password-error" class="form-error" style="display: none; color: var(--color-error); font-size: var(--font-size-caption);"></div>
          </div>

          <button id="login-submit-btn" type="submit" class="btn btn-primary" style="height: 40px; margin-top: var(--space-xs); width: 100%;">
            <span class="btn-text">Authenticate Workspace</span>
            <span class="spinner" style="display: none;"></span>
          </button>
        </form>

        <div style="text-align: center; border-top: 1px solid var(--color-border); padding-top: var(--space-md);">
          <p class="type-caption" style="color: var(--color-text-secondary); margin: 0;">
            New to EnvShare?
            <a href="#register" class="brand-link" style="color: var(--color-primary); font-weight: var(--font-weight-semibold); text-decoration: underline;">Create an account</a>
          </p>
        </div>
      </div>
    </div>
  `;

  // Password visibility toggle
  const passwordInput = container.querySelector('#login-password');
  const toggleBtn = container.querySelector('#login-toggle-password');
  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  // Form submission
  const form = container.querySelector('#login-form');
  const emailInput = container.querySelector('#login-email');
  const emailError = container.querySelector('#login-email-error');
  const passwordError = container.querySelector('#login-password-error');
  const alertBox = container.querySelector('#auth-alert');
  const submitBtn = container.querySelector('#login-submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset errors
    emailError.style.display = 'none';
    passwordError.style.display = 'none';
    emailInput.classList.remove('is-invalid');
    passwordInput.classList.remove('is-invalid');
    alertBox.style.display = 'none';

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    // Client validation
    const emailErr = validateEmail(email);
    if (emailErr) {
      emailError.textContent = emailErr;
      emailError.style.display = 'flex';
      emailInput.classList.add('is-invalid');
      emailInput.focus();
      return;
    }

    const passwordErr = validatePasswordForLogin(password);
    if (passwordErr) {
      passwordError.textContent = passwordErr;
      passwordError.style.display = 'flex';
      passwordInput.classList.add('is-invalid');
      passwordInput.focus();
      return;
    }

    // Set loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    try {
      const response = await loginUser(email, password);

      // Successfully authenticated
      // Store JWT token strictly in memory
      store.setAuth(response.access_token, { email });

      if (window.showToast) {
        window.showToast('Welcome Back', 'Successfully authenticated to EnvShare.', 'success');
      }

      // Navigate to projects workspace
      router.navigate('projects');

    } catch (err) {
      alertBox.textContent = err.message || 'Invalid email or password.';
      alertBox.style.display = 'block';
      passwordInput.classList.add('is-invalid');
      passwordInput.focus();
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';
    }
  });
}

/**
 * Render Register Screen
 * @param {HTMLElement} container
 */
export function renderRegisterView(container) {
  container.innerHTML = `
    <div class="auth-view-wrapper">
      <div class="auth-box" role="region" aria-labelledby="register-title">
        <div class="auth-box-header">
          <div class="sidebar-brand-icon" style="margin-bottom: var(--space-xs);">
            <span class="material-symbols-outlined" style="font-size: 24px; color: #FFFFFF;">verified_user</span>
          </div>
          <h1 id="register-title" class="type-h3" style="margin: 0; color: var(--color-text-primary);">Create EnvShare Account</h1>
          <p class="type-body-sm" style="margin: 0; color: var(--color-text-secondary);">Centralize and encrypt environment variables for your team.</p>
        </div>

        <div id="auth-alert" class="auth-alert" role="alert" style="display: none; padding: 10px 14px; background-color: var(--color-error-bg); border: 1px solid var(--color-error-border); border-radius: var(--radius-md); color: var(--color-error-text); font-size: var(--font-size-body-sm);"></div>

        <form id="register-form" novalidate style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
            <label for="register-email" class="form-label">
              <span>Work email address</span>
            </label>
            <input
              id="register-email"
              name="email"
              type="email"
              class="input-control"
              placeholder="engineer@company.com"
              autocomplete="email"
              required
            >
            <div id="register-email-error" class="form-error" style="display: none; color: var(--color-error); font-size: var(--font-size-caption);"></div>
          </div>

          <div class="form-group" style="display: flex; flex-direction: column; gap: 6px;">
            <label for="register-password" class="form-label">
              <span>Password</span>
            </label>
            <div style="position: relative; display: flex; align-items: center;">
              <input
                id="register-password"
                name="password"
                type="password"
                class="input-control font-mono"
                placeholder="At least 12 characters"
                autocomplete="new-password"
                required
                style="padding-right: 40px;"
              >
              <button
                id="register-toggle-password"
                type="button"
                class="btn-icon"
                aria-label="Toggle password visibility"
                style="position: absolute; right: 4px; width: 32px; height: 32px;"
              >
                <span class="material-symbols-outlined" style="font-size: 18px;">visibility</span>
              </button>
            </div>
            <div id="register-password-error" class="form-error" style="display: none; color: var(--color-error); font-size: var(--font-size-caption);"></div>

            <!-- Password Requirements Checklist -->
            <div class="password-requirements" style="margin-top: var(--space-xs); padding: 8px 12px; background: var(--color-surface-container-low); border-radius: var(--radius-sm); border: 1px solid var(--color-border);">
              <small class="type-caption" style="display: block; margin-bottom: 4px; font-weight: var(--font-weight-medium); color: var(--color-text-secondary);">Security requirements:</small>
              <ul class="requirements-list" style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; font-size: var(--font-size-caption); color: var(--color-text-secondary);">
                <li id="req-length" class="req-item" style="display: flex; align-items: center; gap: 6px;">
                  <span class="req-icon">○</span> At least 12 characters
                </li>
                <li id="req-letter" class="req-item" style="display: flex; align-items: center; gap: 6px;">
                  <span class="req-icon">○</span> At least one letter
                </li>
                <li id="req-number" class="req-item" style="display: flex; align-items: center; gap: 6px;">
                  <span class="req-icon">○</span> At least one number
                </li>
              </ul>
            </div>
          </div>

          <button id="register-submit-btn" type="submit" class="btn btn-primary" style="height: 40px; margin-top: var(--space-xs); width: 100%;">
            <span class="btn-text">Create Account</span>
            <span class="spinner" style="display: none;"></span>
          </button>
        </form>

        <div style="text-align: center; border-top: 1px solid var(--color-border); padding-top: var(--space-md);">
          <p class="type-caption" style="color: var(--color-text-secondary); margin: 0;">
            Already have an account?
            <a href="#login" class="brand-link" style="color: var(--color-primary); font-weight: var(--font-weight-semibold); text-decoration: underline;">Log in</a>
          </p>
        </div>
      </div>
    </div>
  `;

  // Password visibility toggle
  const passwordInput = container.querySelector('#register-password');
  const toggleBtn = container.querySelector('#register-toggle-password');
  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  // Dynamic live validation checklist
  const reqLength = container.querySelector('#req-length');
  const reqLetter = container.querySelector('#req-letter');
  const reqNumber = container.querySelector('#req-number');

  passwordInput.addEventListener('input', () => {
    const val = passwordInput.value;

    const hasLength = val.length >= 12 && val.length <= 128;
    const hasLetter = /[A-Za-z]/.test(val);
    const hasNumber = /\d/.test(val);

    updateReqItem(reqLength, hasLength);
    updateReqItem(reqLetter, hasLetter);
    updateReqItem(reqNumber, hasNumber);
  });

  function updateReqItem(el, isValid) {
    if (isValid) {
      el.classList.add('is-valid');
      el.querySelector('.req-icon').textContent = '✓';
    } else {
      el.classList.remove('is-valid');
      el.querySelector('.req-icon').textContent = '○';
    }
  }

  // Form submission
  const form = container.querySelector('#register-form');
  const emailInput = container.querySelector('#register-email');
  const emailError = container.querySelector('#register-email-error');
  const passwordError = container.querySelector('#register-password-error');
  const alertBox = container.querySelector('#auth-alert');
  const submitBtn = container.querySelector('#register-submit-btn');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnSpinner = submitBtn.querySelector('.spinner');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Reset errors
    emailError.style.display = 'none';
    passwordError.style.display = 'none';
    emailInput.classList.remove('is-invalid');
    passwordInput.classList.remove('is-invalid');
    alertBox.style.display = 'none';

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    // Client validation
    const emailErr = validateEmail(email);
    if (emailErr) {
      emailError.textContent = emailErr;
      emailError.style.display = 'flex';
      emailInput.classList.add('is-invalid');
      emailInput.focus();
      return;
    }

    const passwordErr = validatePasswordForRegistration(password);
    if (passwordErr) {
      passwordError.textContent = passwordErr;
      passwordError.style.display = 'flex';
      passwordInput.classList.add('is-invalid');
      passwordInput.focus();
      return;
    }

    // Set loading state
    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    try {
      // 1. Register user
      await registerUser(email, password);

      // 2. Automatically log in to obtain JWT access token in memory
      const loginRes = await loginUser(email, password);
      store.setAuth(loginRes.access_token, { email });

      if (window.showToast) {
        window.showToast('Account Created', 'Your EnvShare account is ready.', 'success');
      }

      router.navigate('projects');

    } catch (err) {
      if (err.status === 409) {
        alertBox.textContent = 'An account with this email already exists. Please log in instead.';
      } else {
        alertBox.textContent = err.message || 'Registration failed. Please check your details and try again.';
      }
      alertBox.style.display = 'block';
    } finally {
      submitBtn.disabled = false;
      btnText.style.display = 'inline';
      btnSpinner.style.display = 'none';
    }
  });
}
