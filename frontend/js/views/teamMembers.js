/**
 * EnvShare Team Members & Role Management View
 * Extracted from Google Stitch Project 7000277523774803089
 */

import { store } from '../store.js';

export async function renderTeamMembersView(container) {
  const state = store.getState();
  const currentUser = state.auth.user;
  const userEmail = currentUser?.email || 'admin@acme.dev';
  const userName = userEmail.split('@')[0];
  const userInitials = (userName.slice(0, 2) || 'AD').toUpperCase();

  container.innerHTML = `
    <!-- Header Section -->
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <div style="display: flex; items-center; gap: var(--space-xs); font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); letter-spacing: 0.05em;">
        <span>Access Control</span>
        <span>/</span>
        <span>Security Governance</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-md);">
        <div>
          <h1 class="font-display-lg">Team Members</h1>
          <p class="font-body-md" style="color: var(--color-text-secondary); max-width: 680px; margin-top: 2px;">
            Manage team access, assign project roles, and govern environment clearance levels across distributed infrastructure.
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <button id="btn-gen-invite" class="btn btn-secondary" type="button">
            <span class="material-symbols-outlined" style="font-size: 16px; color: var(--color-secondary);">vpn_key</span>
            <span>Generate Invite Code</span>
          </button>
          <button id="btn-invite-member" class="btn btn-primary" type="button">
            <span class="material-symbols-outlined">person_add</span>
            <span>+ Invite Member</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Honest Integration Status Alert -->
    <div style="padding: var(--space-md) var(--space-lg); border-radius: var(--radius-lg); background-color: #EFF6FF; border: 1px solid #BFDBFE; display: flex; align-items: flex-start; gap: var(--space-sm);">
      <span class="material-symbols-outlined" style="color: #2563EB; font-size: 20px; flex-shrink: 0; margin-top: 1px;">info</span>
      <div style="font-size: var(--font-size-body-sm); color: #1E40AF; line-height: 1.4;">
        <strong>Backend Notice:</strong> Project membership and invitation code management endpoints are currently pending backend API expansion. Your authenticated identity (<strong>${escapeHtml(userEmail)}</strong>) is actively recognized with <strong>Admin</strong> privileges.
      </div>
    </div>

    <!-- Role Overview Bar -->
    <div style="background-color: var(--color-surface-container-lowest); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: var(--space-md); box-shadow: var(--shadow-sm);">
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-md);">
        <!-- Admin -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); background-color: var(--color-surface-container-low); border: 1px solid var(--color-border-subtle);">
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--color-primary-container); color: #FFF; display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined" style="font-size: 18px;">security</span>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="font-headline-sm" style="font-size: 14px;">Admin</span>
                <span class="badge badge-admin badge-code">1</span>
              </div>
              <p class="font-body-sm" style="color: var(--color-text-secondary); font-size: 11px;">Full infrastructure clearance & secrets</p>
            </div>
          </div>
          <span class="font-label-code-sm" style="color: var(--color-text-muted);">Active</span>
        </div>

        <!-- Manager -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); background-color: var(--color-surface-container-low); border: 1px solid var(--color-border-subtle);">
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--color-secondary-container); color: var(--color-on-secondary-container); display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined" style="font-size: 18px;">tune</span>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="font-headline-sm" style="font-size: 14px;">Manager</span>
                <span class="badge badge-manager badge-code">Planned</span>
              </div>
              <p class="font-body-sm" style="color: var(--color-text-secondary); font-size: 11px;">Config, staging & deployment push</p>
            </div>
          </div>
          <span class="font-label-code-sm" style="color: var(--color-text-muted);">RBAC</span>
        </div>

        <!-- Team Member -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-sm) var(--space-md); border-radius: var(--radius-md); background-color: var(--color-surface-container-low); border: 1px solid var(--color-border-subtle);">
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--color-surface-container); color: var(--color-text-secondary); display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined" style="font-size: 18px;">visibility</span>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="font-headline-sm" style="font-size: 14px;">Team Member</span>
                <span class="badge badge-member badge-code">Planned</span>
              </div>
              <p class="font-body-sm" style="color: var(--color-text-secondary); font-size: 11px;">Scoped read-only dev environments</p>
            </div>
          </div>
          <span class="font-label-code-sm" style="color: var(--color-text-muted);">RBAC</span>
        </div>
      </div>
    </div>

    <!-- Main Workspace Container -->
    <div class="table-surface-card">
      <div class="table-toolbar">
        <div style="display: flex; align-items: center; gap: var(--space-sm); width: 320px;">
          <input type="text" class="input-control" placeholder="Filter members..." style="height: 34px;">
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <div class="filter-chip-group">
            <button class="filter-chip is-active">All (1)</button>
            <button class="filter-chip">Admin (1)</button>
            <button class="filter-chip">Managers (0)</button>
          </div>
          <span class="badge badge-code" style="background: var(--color-surface-container); color: var(--color-text-secondary);">
            1 Active Seat
          </span>
        </div>
      </div>

      <!-- Desktop Table -->
      <div class="table-wrapper data-table-desktop">
        <table class="data-table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Environment Access</th>
              <th>2FA & Security</th>
              <th>Last Active</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div style="display: flex; align-items: center; gap: var(--space-md);">
                  <div style="width: 34px; height: 34px; border-radius: 50%; background-color: var(--color-primary); color: #FFF; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 12px;">
                    ${userInitials}
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span class="font-headline-sm" style="font-size: 14px;">${escapeHtml(userName)}</span>
                      <span class="badge badge-code" style="background-color: var(--color-primary-container); color: #FFF; font-size: 9px;">YOU</span>
                    </div>
                    <p class="font-label-code-sm" style="color: var(--color-text-secondary);">${escapeHtml(userEmail)}</p>
                  </div>
                </div>
              </td>
              <td>
                <span class="badge badge-admin badge-code">Admin</span>
              </td>
              <td>
                <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-primary);">All Environments (Root)</span>
              </td>
              <td>
                <div style="display: flex; align-items: center; gap: 4px; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-primary);">
                  <span class="material-symbols-outlined" style="color: var(--color-prod); font-size: 16px;">verified_user</span>
                  <span>JWT In-Memory Session</span>
                </div>
              </td>
              <td>
                <span class="badge badge-prod badge-code">Active now</span>
              </td>
              <td style="text-align: right;">
                <button class="btn btn-secondary btn-sm" onclick="window.showToast('Clearance Managed', 'Admin role is bound to account session.', 'info')">
                  Settings
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Modals for Invite Member / Generate Invite Code
  const showUnimplementedModal = (titleText, descText) => {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    title.textContent = titleText;
    body.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
        <p class="font-body-md" style="color: var(--color-text-primary);">
          ${descText}
        </p>
        <div style="padding: var(--space-md); background: var(--color-surface-container-low); border-radius: var(--radius-md); border: 1px solid var(--color-border); font-size: 12px; color: var(--color-text-secondary);">
          <strong>Backend Status:</strong> The FastAPI backend currently models <code>ProjectMember</code> in the database, but invitation tokens and collaborator endpoints have not yet been approved or merged into backend routes.
        </div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-primary" onclick="window.closeGlobalModal()">Understood</button>
    `;

    window.openGlobalModal();
  };

  document.getElementById('btn-gen-invite')?.addEventListener('click', () => {
    showUnimplementedModal(
      'Generate Invitation Code',
      'Invitation code dispatching requires a backend invitation verification endpoint.'
    );
  });

  document.getElementById('btn-invite-member')?.addEventListener('click', () => {
    showUnimplementedModal(
      'Invite Collaborator',
      'Team member invitations by email will become available once backend user invitation routes are integrated.'
    );
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
