/**
 * EnvShare Project & Account Settings View
 * Extracted from Google Stitch Project 7000277523774803089
 */

import { store } from '../store.js';

export async function renderSettingsView(container) {
  const state = store.getState();
  const activeProject = state.projects.activeProject;
  const user = state.auth.user;
  const userEmail = user?.email || 'admin@acme.dev';

  container.innerHTML = `
    <!-- Header Section -->
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <div style="display: flex; items-center; gap: var(--space-xs); font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); letter-spacing: 0.05em;">
        <span>Settings</span>
        <span>/</span>
        <span>Configuration & Security</span>
      </div>
      <div>
        <h1 class="font-display-lg">Settings</h1>
        <p class="font-body-md" style="color: var(--color-text-secondary); max-width: 680px; margin-top: 2px;">
          Manage cryptographic key specifications, project-level metadata, and your authenticated user profile.
        </p>
      </div>
    </div>

    <!-- 2 Column Settings Surface Grid -->
    <div style="display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--space-lg); align-items: start;">
      
      <!-- Left Column: Project Settings (6 cols) -->
      <div class="table-surface-card" style="grid-column: span 6; padding: var(--space-lg); gap: var(--space-md);">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: var(--space-sm);">
          <div>
            <h2 class="font-headline-sm">Project Specifications</h2>
            <p class="font-body-sm" style="color: var(--color-text-secondary);">Active repository configuration</p>
          </div>
          <span class="material-symbols-outlined" style="color: var(--color-secondary);">tune</span>
        </div>

        <div class="form-group">
          <label class="form-label">Active Project Name</label>
          <input type="text" class="input-control font-mono" value="${escapeHtml(activeProject?.name || 'No Project Selected')}" disabled style="opacity: 0.85;">
        </div>

        <div class="form-group">
          <label class="form-label">Cryptographic Standard</label>
          <div style="padding: 10px var(--space-md); border-radius: var(--radius-md); background: var(--color-surface-container-low); border: 1px solid var(--color-border); font-family: var(--font-mono); font-size: 12px; display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600; color: var(--color-primary);">AES-256-GCM Envelope Encryption</span>
            <span class="badge badge-prod badge-code">Active</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Key Management Service (KMS) HSM</label>
          <input type="text" class="input-control font-mono" value="kms-us-east-1-prod (FIPS 140-2 Level 3)" disabled style="opacity: 0.85;">
        </div>

        <div style="padding-top: var(--space-xs);">
          <button class="btn btn-secondary" onclick="window.showToast('Settings Saved', 'Project specifications confirmed.', 'info')">
            Save Preferences
          </button>
        </div>
      </div>

      <!-- Right Column: Account & Security Profile (6 cols) -->
      <div class="table-surface-card" style="grid-column: span 6; padding: var(--space-lg); gap: var(--space-md);">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border-subtle); padding-bottom: var(--space-sm);">
          <div>
            <h2 class="font-headline-sm">Account & Security</h2>
            <p class="font-body-sm" style="color: var(--color-text-secondary);">Authentication token & session clearance</p>
          </div>
          <span class="material-symbols-outlined" style="color: var(--color-secondary);">manage_accounts</span>
        </div>

        <div class="form-group">
          <label class="form-label">Signed In Email</label>
          <input type="text" class="input-control" value="${escapeHtml(userEmail)}" disabled style="opacity: 0.85;">
        </div>

        <div class="form-group">
          <label class="form-label">Assigned Clearance Role</label>
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <span class="badge badge-admin badge-code" style="font-size: 12px; padding: 4px 10px;">ADMINISTRATOR</span>
            <span class="font-body-sm" style="color: var(--color-text-secondary); font-size: 12px;">Full workspace authority</span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Session Token Storage</label>
          <div style="padding: 10px var(--space-md); border-radius: var(--radius-md); background: var(--color-surface-container-low); border: 1px solid var(--color-border); font-size: 12px; color: var(--color-text-secondary); line-height: 1.4;">
            <strong style="color: var(--color-text-primary);">Zero-Disk In-Memory:</strong> Your JWT access token is stored exclusively in volatile JavaScript runtime memory and is never written to disk, localStorage, or cookies.
          </div>
        </div>

        <div style="padding-top: var(--space-xs); display: flex; justify-content: space-between; align-items: center;">
          <button class="btn btn-danger" onclick="window.handleLogoutUser()">
            <span class="material-symbols-outlined">logout</span>
            <span>Sign Out Session</span>
          </button>
        </div>
      </div>
    </div>
  `;
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
