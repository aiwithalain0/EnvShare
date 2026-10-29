/**
 * EnvShare Authentication Views & Logic
 * Aligned with the EnvShare authentication UI.
 *
 * Security:
 * - Never log passwords or JWT tokens.
 * - Keep JWT access tokens in JavaScript memory through store.setAuth().
 * - Server-side validation remains authoritative.
 */

import { registerUser, loginUser } from './api.js';
import { store } from './store.js';
import { router } from './router.js';

// Client-side validation helpers
export function validateEmail(email) {
  const trimmed = email.trim();

  if (!trimmed) return 'Email address is required.';

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
  if (!password) return 'Password is required.';
  return null;
}

/**
 * Render Login Screen
 * @param {HTMLElement} container
 */
export function renderLoginView(container) {
  container.innerHTML = `
    <div class="auth-view-wrapper">
      <header class="auth-header-bar">
        <div></div>
        <div style="display:flex;align-items:center;gap:1rem;font-size:12px;">
          <a href="#settings" class="brand-link" style="color:var(--color-text-secondary);font-size:12px;font-weight:500;">Documentation</a>
        </div>
      </header>

      <main class="auth-main-area">
        <div class="auth-card" role="region" aria-labelledby="login-title">
          <div class="auth-card-header">
            <div class="auth-brand-badge">
              <div class="auth-brand-logo">
                <svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
                  <rect height="11" rx="2" ry="2" width="18" x="3" y="11"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <span style="font-weight:600;font-size:16px;letter-spacing:-0.02em;color:var(--color-text-primary);">EnvShare</span>
            </div>
            <h1 id="login-title" class="font-headline-lg" style="margin:0;font-size:24px;font-weight:600;letter-spacing:-0.02em;color:var(--color-text-primary);">Welcome back</h1>
            <p class="font-body-sm" style="margin-top:4px;color:var(--color-text-secondary);">Sign in to your workspace.</p>
          </div>

          <div id="auth-alert" class="auth-alert" role="alert" style="display:none;margin-bottom:1rem;padding:10px 14px;background-color:var(--color-error-bg);border:1px solid var(--color-error-border);border-radius:var(--radius-md);color:var(--color-error-text);font-size:var(--font-size-body-sm);"></div>

          <form id="login-form" novalidate style="display:flex;flex-direction:column;gap:1rem;">
            <div class="form-group" style="display:flex;flex-direction:column;gap:6px;">
              <label for="login-email" class="form-label" style="font-size:12px;font-weight:500;color:var(--color-text-secondary);">Work email</label>
              <input id="login-email" name="email" type="email" class="input-control" placeholder="name@company.com" autocomplete="username" required style="height:40px;border-radius:var(--radius-md);padding:0 14px;font-size:14px;">
              <div id="login-email-error" class="form-error" style="display:none;color:var(--color-error);font-size:12px;margin-top:4px;"></div>
            </div>

            <div class="form-group" style="display:flex;flex-direction:column;gap:6px;">
              <label for="login-password" class="form-label" style="font-size:12px;font-weight:500;color:var(--color-text-secondary);">Password</label>
              <div style="position:relative;display:flex;align-items:center;">
                <input id="login-password" name="password" type="password" class="input-control font-mono" placeholder="••••••••••••" autocomplete="current-password" required style="height:40px;border-radius:var(--radius-md);padding-left:14px;padding-right:40px;font-size:14px;width:100%;">
                <button id="login-toggle-password" type="button" class="btn-icon" aria-label="Toggle password visibility" style="position:absolute;right:4px;width:32px;height:32px;border:none;background:transparent;color:var(--color-text-secondary);cursor:pointer;">
                  <span class="material-symbols-outlined" style="font-size:18px;">visibility</span>
                </button>
              </div>
              <div id="login-password-error" class="form-error" style="display:none;color:var(--color-error);font-size:12px;margin-top:4px;"></div>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;padding-top:2px;">
              <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none;color:var(--color-text-secondary);">
                <input type="checkbox" style="width:16px;height:16px;border-radius:4px;accent-color:#09090b;cursor:pointer;">
                <span>Remember this device</span>
              </label>
              <a href="#" onclick="alert('For password resets, contact your system administrator or refer to backend security recovery.'); return false;" style="color:var(--color-text-secondary);font-weight:500;text-decoration:none;">Forgot password?</a>
            </div>

            <button id="login-submit-btn" type="submit" class="btn btn-primary" style="height:40px;margin-top:8px;width:100%;background-color:#09090b;border-color:#09090b;color:#fff;border-radius:var(--radius-md);font-weight:500;">
              <span class="btn-text">Sign in</span>
              <span class="spinner" style="display:none;"></span>
            </button>
          </form>

          <div class="auth-sso-divider"><span>OR CONTINUE WITH</span></div>

          <div class="auth-sso-grid">
            <button class="auth-sso-btn" type="button" onclick="alert('Direct SSO is managed via your enterprise SAML/OAuth policy. Use email and password to log in.');">
              <svg style="width:16px;height:16px;" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
              </svg>
              <span>GitHub</span>
            </button>
            <button class="auth-sso-btn" type="button" onclick="alert('Passkey hardware authentication is supported via enterprise WebAuthn.');">
              <svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
              </svg>
              <span>Passkey</span>
            </button>
          </div>

          <div style="margin-top:1.5rem;text-align:center;font-size:14px;color:var(--color-text-secondary);">
            <p style="margin:0;">New to EnvShare?
              <a href="#register" class="brand-link" style="color:#09090b;font-weight:600;text-decoration:underline;margin-left:4px;">Create an account</a>
            </p>
          </div>
        </div>
      </main>

      <footer class="auth-footer-bar">
        <div><span>© 2025 EnvShare Inc.</span></div>
        <div style="display:flex;align-items:center;gap:1rem;color:var(--color-text-secondary);">
          <a href="#settings" style="color:inherit;text-decoration:none;">Status</a>
          <a href="#settings" style="color:inherit;text-decoration:none;">Security</a>
          <a href="#settings" style="color:inherit;text-decoration:none;">Privacy</a>
        </div>
      </footer>
    </div>
  `;

  const passwordInput = container.querySelector('#login-password');
  const toggleBtn = container.querySelector('#login-toggle-password');

  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

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

    emailError.style.display = 'none';
    passwordError.style.display = 'none';
    emailInput.classList.remove('is-invalid');
    passwordInput.classList.remove('is-invalid');
    alertBox.style.display = 'none';

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

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

    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    try {
      // The API expects a single credentials object.
      const response = await loginUser({ email, password });

      store.setAuth(response.access_token, { email });

      if (window.showToast) {
        window.showToast('Welcome Back', 'Successfully authenticated to EnvShare.', 'success');
      }

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
      <header class="auth-header-bar">
        <div></div>
        <div style="display:flex;align-items:center;gap:1rem;font-size:12px;">
          <a href="#settings" class="brand-link" style="color:var(--color-text-secondary);font-size:12px;font-weight:500;">Documentation</a>
        </div>
      </header>

      <main class="auth-main-area">
        <div class="auth-card" role="region" aria-labelledby="register-title">
          <div class="auth-card-header">
            <div class="auth-brand-badge">
              <div class="auth-brand-logo">
                <svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24">
                  <rect height="11" rx="2" ry="2" width="18" x="3" y="11"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <span style="font-weight:600;font-size:16px;letter-spacing:-0.02em;color:var(--color-text-primary);">EnvShare</span>
            </div>
            <h1 id="register-title" class="font-headline-lg" style="margin:0;font-size:24px;font-weight:600;letter-spacing:-0.02em;color:var(--color-text-primary);">Create your account</h1>
            <p class="font-body-sm" style="margin-top:4px;color:var(--color-text-secondary);">Start managing your environment variables securely.</p>
          </div>

          <div id="auth-alert" class="auth-alert" role="alert" style="display:none;margin-bottom:1rem;padding:10px 14px;background-color:var(--color-error-bg);border:1px solid var(--color-error-border);border-radius:var(--radius-md);color:var(--color-error-text);font-size:var(--font-size-body-sm);"></div>

          <form id="register-form" novalidate style="display:flex;flex-direction:column;gap:1rem;">
            <div class="form-group" style="display:flex;flex-direction:column;gap:6px;">
              <label for="register-email" class="form-label" style="font-size:12px;font-weight:500;color:var(--color-text-secondary);">Work email</label>
              <input id="register-email" name="email" type="email" class="input-control" placeholder="name@company.com" autocomplete="email" required style="height:40px;border-radius:var(--radius-md);padding:0 14px;font-size:14px;">
              <div id="register-email-error" class="form-error" style="display:none;color:var(--color-error);font-size:12px;margin-top:4px;"></div>
            </div>

            <div class="form-group" style="display:flex;flex-direction:column;gap:6px;">
              <label for="register-password" class="form-label" style="font-size:12px;font-weight:500;color:var(--color-text-secondary);">Master password</label>
              <div style="position:relative;display:flex;align-items:center;">
                <input id="register-password" name="password" type="password" class="input-control font-mono" placeholder="At least 12 characters" autocomplete="new-password" required style="height:40px;border-radius:var(--radius-md);padding-left:14px;padding-right:40px;font-size:14px;width:100%;">
                <button id="register-toggle-password" type="button" class="btn-icon" aria-label="Toggle password visibility" style="position:absolute;right:4px;width:32px;height:32px;border:none;background:transparent;color:var(--color-text-secondary);cursor:pointer;">
                  <span class="material-symbols-outlined" style="font-size:18px;">visibility</span>
                </button>
              </div>
              <div id="register-password-error" class="form-error" style="display:none;color:var(--color-error);font-size:12px;margin-top:4px;"></div>

              <div class="password-requirements" style="margin-top:6px;padding:10px 12px;background:var(--color-surface-container-low);border-radius:var(--radius-md);border:1px solid var(--color-border);">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                  <span class="type-caption" style="font-size:11px;font-weight:600;color:var(--color-text-secondary);text-transform:uppercase;letter-spacing:0.04em;">Password Requirements</span>
                  <div class="password-strength-meter" id="register-strength-meter">
                    <span class="password-strength-dot" id="dot-1"></span>
                    <span class="password-strength-dot" id="dot-2"></span>
                    <span class="password-strength-dot" id="dot-3"></span>
                  </div>
                </div>
                <ul class="requirements-list" style="list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--color-text-secondary);">
                  <li id="req-length" class="req-item" style="display:flex;align-items:center;gap:6px;"><span class="req-icon">○</span> At least 12 characters</li>
                  <li id="req-letter" class="req-item" style="display:flex;align-items:center;gap:6px;"><span class="req-icon">○</span> At least one letter</li>
                  <li id="req-number" class="req-item" style="display:flex;align-items:center;gap:6px;"><span class="req-icon">○</span> At least one number</li>
                </ul>
              </div>
            </div>

            <div class="auth-info-note">
              If you lose your master password, you may permanently lose access to your secrets. EnvShare cannot recover it.
            </div>

            <div style="padding-top:2px;">
              <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--color-text-secondary);cursor:pointer;line-height:1.4;">
                <input type="checkbox" required style="width:16px;height:16px;margin-top:2px;border-radius:4px;accent-color:#09090b;cursor:pointer;">
                <span>I agree to the <a href="#settings" style="color:#09090b;font-weight:500;text-decoration:underline;">Terms of Service</a> and <a href="#settings" style="color:#09090b;font-weight:500;text-decoration:underline;">Privacy Policy</a>.</span>
              </label>
            </div>

            <button id="register-submit-btn" type="submit" class="btn btn-primary" style="height:40px;margin-top:4px;width:100%;background-color:#09090b;border-color:#09090b;color:#fff;border-radius:var(--radius-md);font-weight:500;">
              <span class="btn-text">Create account</span>
              <span class="spinner" style="display:none;"></span>
            </button>
          </form>

          <div class="auth-sso-divider"><span>OR CONTINUE WITH</span></div>

          <div class="auth-sso-grid">
            <button class="auth-sso-btn" type="button" onclick="alert('Direct SSO is managed via your enterprise SAML/OAuth policy. Use email and password to register.');">
              <svg style="width:16px;height:16px;" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"></path>
              </svg>
              <span>GitHub</span>
            </button>
            <button class="auth-sso-btn" type="button" onclick="alert('Passkey hardware authentication is supported via enterprise WebAuthn.');">
              <svg style="width:16px;height:16px;" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
              </svg>
              <span>Passkey</span>
            </button>
          </div>

          <div style="margin-top:1.5rem;text-align:center;font-size:14px;color:var(--color-text-secondary);">
            <p style="margin:0;">Already have an account?
              <a href="#login" class="brand-link" style="color:#09090b;font-weight:600;text-decoration:underline;margin-left:4px;">Log in</a>
            </p>
          </div>
        </div>
      </main>

      <footer class="auth-footer-bar">
        <div><span>© 2025 EnvShare Inc.</span></div>
        <div style="display:flex;align-items:center;gap:1rem;color:var(--color-text-secondary);">
          <a href="#settings" style="color:inherit;text-decoration:none;">Status</a>
          <a href="#settings" style="color:inherit;text-decoration:none;">Security</a>
          <a href="#settings" style="color:inherit;text-decoration:none;">Privacy</a>
        </div>
      </footer>
    </div>
  `;

  const passwordInput = container.querySelector('#register-password');
  const toggleBtn = container.querySelector('#register-toggle-password');

  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
  });

  const reqLength = container.querySelector('#req-length');
  const reqLetter = container.querySelector('#req-letter');
  const reqNumber = container.querySelector('#req-number');
  const dot1 = container.querySelector('#dot-1');
  const dot2 = container.querySelector('#dot-2');
  const dot3 = container.querySelector('#dot-3');

  passwordInput.addEventListener('input', () => {
    const value = passwordInput.value;

    const hasLength = value.length >= 12 && value.length <= 128;
    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);

    updateReqItem(reqLength, hasLength);
    updateReqItem(reqLetter, hasLetter);
    updateReqItem(reqNumber, hasNumber);

    dot1.classList.toggle('is-active', hasLength);
    dot2.classList.toggle('is-active', hasLetter);
    dot3.classList.toggle('is-active', hasNumber);
  });

  function updateReqItem(element, isValid) {
    if (isValid) {
      element.classList.add('is-valid');
      element.style.color = '#10B981';
      element.querySelector('.req-icon').textContent = '✓';
    } else {
      element.classList.remove('is-valid');
      element.style.color = 'var(--color-text-secondary)';
      element.querySelector('.req-icon').textContent = '○';
    }
  }

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

    emailError.style.display = 'none';
    passwordError.style.display = 'none';
    emailInput.classList.remove('is-invalid');
    passwordInput.classList.remove('is-invalid');
    alertBox.style.display = 'none';

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

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

    submitBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'inline-block';

    try {
      // Register with the credentials object expected by api.js.
      await registerUser({ email, password });

      // Automatically authenticate after successful registration.
      const loginResponse = await loginUser({ email, password });
      store.setAuth(loginResponse.access_token, { email });

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
