/**
 * EnvShare Project & Account Settings View
 * Extracted and aligned with Google Stitch design (envshare_settings)
 */

import { store } from '../store.js';
import { router } from '../router.js';
import { checkBackendHealth, deleteProject, logoutUser } from '../api.js';

export async function renderSettingsView(container) {
  const state = store.getState();
  const activeProject = state.projects.activeProject;
  const user = state.auth.user;
  const userEmail = user?.email || 'Signed in';
  const namePart = userEmail.includes('@') ? userEmail.split('@')[0] : userEmail;
  const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
  const initials = (namePart.slice(0, 2) || 'AK').toUpperCase();

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 2rem; max-width: 800px;">
      <!-- Header Section -->
      <div style="display: flex; flex-direction: column; gap: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); letter-spacing: 0.05em;">
          <span>Workspace</span>
          <span>/</span>
          <span>Settings</span>
        </div>
        <div>
          <h1 class="font-headline-lg" style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text-primary);">Settings</h1>
          <p class="font-body-sm" style="margin-top: 4px; color: var(--color-text-secondary);">
            Manage your account, cryptographic policies, and application preferences.
          </p>
        </div>
      </div>

      <!-- Section 1: Account -->
      <section style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <h2 style="font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0;">Account</h2>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin: 0;">Your profile and authenticated identity.</p>
        </div>

        <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); overflow: hidden; divide-y: divide-neutral-100;">
          <!-- Top Profile Strip -->
          <div style="padding: 1.25rem 1.5rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; border-bottom: 1px solid var(--color-border);">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <div style="width: 42px; height: 42px; border-radius: 50%; background-color: var(--color-surface-container-high); border: 1px solid var(--color-border-strong); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; color: var(--color-text-primary); flex-shrink: 0;">
                ${initials}
              </div>
              <div>
                <div style="font-size: 15px; font-weight: 600; color: var(--color-text-primary);">${escapeHtml(displayName)}</div>
                <div style="font-size: 13px; color: var(--color-text-secondary); font-family: var(--font-mono);">${escapeHtml(userEmail)}</div>
              </div>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="alert('Display name is automatically derived from your verified account credentials.');" style="font-size: 12px; height: 32px; padding: 0 12px; border-radius: var(--radius-md);">
              Edit name
            </button>
          </div>

          <!-- Account Details Grid -->
          <div style="padding: 1.25rem 1.5rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem;">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Display Name</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary);">${escapeHtml(displayName)}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Email Address (Read-Only)</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary); font-family: var(--font-mono);">${escapeHtml(userEmail)}</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Assigned Role</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary);">Workspace Administrator</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span style="font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em;">Session Security</span>
              <span style="font-size: 14px; font-weight: 500; color: var(--color-text-primary);">Volatile Memory JWT</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: Active Project Management (if selected) -->
      ${activeProject ? `
        <section style="display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <h2 style="font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0;">Project: ${escapeHtml(activeProject.name)}</h2>
            <p class="font-body-sm" style="color: var(--color-text-secondary); margin: 0;">Danger zone controls for the currently selected project vault.</p>
          </div>

          <div class="table-surface-card" style="border: 1px solid rgba(239, 68, 68, 0.3); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); padding: 1.25rem 1.5rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 600; font-size: 14px; color: var(--color-error);">Delete this Project</span>
              <span style="font-size: 12px; color: var(--color-text-secondary); max-width: 520px;">
                Permanently deletes <strong>${escapeHtml(activeProject.name)}</strong>, all environments, encrypted variables, and team memberships. Audit logs are preserved.
              </span>
            </div>
            <button id="btn-settings-delete-project" class="btn btn-secondary" type="button" style="height: 36px; padding: 0 16px; font-size: 13px; font-weight: 500; border-radius: var(--radius-md); color: var(--color-error); border-color: var(--color-error); background: rgba(239, 68, 68, 0.05);">
              <span class="material-symbols-outlined" style="font-size: 16px;">delete_forever</span>
              <span>Delete Project</span>
            </button>
          </div>
        </section>
      ` : ''}

      <!-- Section 3: System & Cryptography Specifications -->
      <section style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <h2 style="font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0;">System & Cryptography</h2>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin: 0;">Encryption standards and backend connectivity.</p>
        </div>

        <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem;">
            <div>
              <span style="font-weight: 600; font-size: 13px; color: var(--color-text-primary); display: block;">Fernet Symmetric Encryption</span>
              <span style="font-size: 12px; color: var(--color-text-secondary);">AES-128-CBC in 128-bit blocks + HMAC-SHA256 authenticated envelope</span>
            </div>
            <span class="badge badge-prod">Active</span>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem;">
            <div>
              <span style="font-weight: 600; font-size: 13px; color: var(--color-text-primary); display: block;">Backend Service Status</span>
              <span style="font-size: 12px; color: var(--color-text-secondary);">FastAPI backend on port 8000</span>
            </div>
            <div id="settings-backend-status">
              <span class="spinner"></span>
            </div>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div>
              <span style="font-weight: 600; font-size: 13px; color: var(--color-text-primary); display: block;">Zero Disk Secret Leaks</span>
              <span style="font-size: 12px; color: var(--color-text-secondary);">Secrets are masked by default and decrypted only in temporary client memory</span>
            </div>
            <span class="badge badge-prod">Enforced</span>
          </div>
        </div>
      </section>

      <!-- Section 4: Account Actions & Sign Out -->
      <section style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="display: flex; flex-direction: column; gap: 2px;">
          <h2 style="font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0;">Account Actions</h2>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin: 0;">Session termination and sign-out controls.</p>
        </div>

        <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); padding: 1.25rem 1.5rem; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-weight: 600; font-size: 14px; color: var(--color-text-primary);">Sign out of EnvShare</span>
            <span style="font-size: 12px; color: var(--color-text-secondary);">End your active session on this device and purge tokens from memory.</span>
          </div>
          <button id="btn-settings-signout" class="btn btn-secondary" type="button" style="height: 36px; padding: 0 16px; font-size: 13px; font-weight: 500; border-radius: var(--radius-md); color: var(--color-error); border-color: var(--color-error-border);">
            <span class="material-symbols-outlined" style="font-size: 16px;">logout</span>
            <span>Sign out</span>
          </button>
        </div>
      </section>
    </div>
  `;

  // Hook Settings Project Deletion
  if (activeProject) {
    document.getElementById('btn-settings-delete-project')?.addEventListener('click', () => {
      window.openConfirmationModal?.({
        title: `Delete Project: ${activeProject.name}`,
        message: `Are you sure you want to permanently delete <strong>${escapeHtml(activeProject.name)}</strong>? All environments, encrypted variables, and team access will be deleted. Audit history will be retained.`,
        confirmText: 'Delete Project',
        isDanger: true,
        onConfirm: async () => {
          await deleteProject(activeProject.id);
          store.setCurrentProject(null);
          window.showToast?.('Project Deleted', `Project "${activeProject.name}" was deleted.`, 'success');
          router.navigate('projects');
        }
      });
    });
  }

  // Asynchronously verify backend health and update status display
  const statusEl = document.getElementById('settings-backend-status');
  try {
    const health = await checkBackendHealth();
    if (statusEl) {
      if (health && health.status === 'healthy') {
        statusEl.innerHTML = `
          <span class="badge badge-prod">Online (Port 8000)</span>
        `;
      } else {
        statusEl.innerHTML = `
          <span class="badge badge-stg">Degraded</span>
        `;
      }
    }
  } catch (err) {
    if (statusEl) {
      statusEl.innerHTML = `
        <span class="badge badge-error">Unreachable</span>
      `;
    }
  }

  // Hook Sign Out
  document.getElementById('btn-settings-signout')?.addEventListener('click', async () => {
    try {
      await logoutUser();
    } catch (err) {
      // Clear local authentication even if the backend is unavailable.
    } finally {
      store.clearAuth();
      if (window.showToast) {
        window.showToast('Signed Out', 'Your session has been cleared.', 'info');
      }
      router.navigate('login');
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
