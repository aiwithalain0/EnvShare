/**
 * EnvShare Audit Logs & History View
 * Extracted from Google Stitch Project 7000277523774803089
 */

import { store } from '../store.js';
import { listProjects, getProjectAuditLogs } from '../api.js';

export async function renderAuditLogsView(container) {
  const state = store.getState();
  let activeProject = state.projects.activeProject;

  if (!activeProject) {
    try {
      const projects = await listProjects();
      store.setProjects(projects);
      if (projects.length > 0) {
        activeProject = projects[0];
        store.setActiveProject(activeProject);
      }
    } catch {}
  }

  if (!activeProject) {
    container.innerHTML = `
      <div class="empty-state-card">
        <h2 class="font-headline-md">No Project Selected</h2>
        <p class="font-body-sm" style="color: var(--color-text-secondary);">Select a project first to inspect audit events.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <!-- Header Section -->
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <div style="display: flex; items-center; gap: var(--space-xs); font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); letter-spacing: 0.05em;">
        <span>Security & History</span>
        <span>/</span>
        <span>SOC2 Verification Trail</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-md);">
        <div>
          <h1 class="font-display-lg">Audit Logs</h1>
          <p class="font-body-md" style="color: var(--color-text-secondary); max-width: 680px; margin-top: 2px;">
            Immutable cryptographic audit trail tracking all secret creations, reveals, updates, and environment changes.
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <button id="btn-refresh-audit" class="btn btn-secondary btn-icon" title="Refresh audit log">
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Security Guarantee Banner -->
    <div class="security-banner">
      <div class="security-banner-left">
        <span class="material-symbols-outlined security-banner-icon" style="color: var(--color-prod);">verified_user</span>
        <div>
          <span class="security-banner-title">Immutable Append-Only Audit Stream</span>
          <span class="security-banner-desc">Every reveal, decryption, and parameter change is signed and recorded server-side with user timestamps.</span>
        </div>
      </div>
      <span class="badge badge-prod badge-code">SOC2 Compliant</span>
    </div>

    <!-- Main Table Surface Card -->
    <div class="table-surface-card">
      <div class="table-toolbar">
        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <h2 class="font-headline-sm">Recorded Events</h2>
          <span id="audit-count-badge" class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary);">
            Loading...
          </span>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <div class="filter-chip-group">
            <button class="filter-chip is-active" data-filter="all">All Events</button>
            <button class="filter-chip" data-filter="reveal">Reveals</button>
            <button class="filter-chip" data-filter="mutate">Mutations</button>
          </div>
        </div>
      </div>

      <!-- Desktop Table -->
      <div class="table-wrapper data-table-desktop">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 25%;">Action</th>
              <th style="width: 20%;">Resource</th>
              <th style="width: 15%;">Actor</th>
              <th style="width: 25%;">Event Metadata</th>
              <th style="width: 15%; text-align: right;">Timestamp</th>
            </tr>
          </thead>
          <tbody id="audit-table-body">
            <tr>
              <td colspan="5" style="text-align: center; padding: var(--space-xl);">
                <div class="spinner"></div>
                <div style="margin-top: 8px; color: var(--color-text-secondary);">Loading audit stream...</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Card List -->
      <div class="mobile-card-list" id="audit-mobile-card-list">
        <!-- Populated via JS -->
      </div>
    </div>
  `;

  let currentLogs = [];

  async function loadAuditLogs() {
    try {
      currentLogs = await getProjectAuditLogs(activeProject.id, 50);
      store.setAuditLogs(currentLogs);

      document.getElementById('audit-count-badge').textContent = `${currentLogs.length} Events`;
      renderAuditRows(currentLogs);
    } catch (err) {
      document.getElementById('audit-table-body').innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-xl); color: var(--color-error);">
            Failed to load audit logs: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function renderAuditRows(logs) {
    const tbody = document.getElementById('audit-table-body');
    const mobileList = document.getElementById('audit-mobile-card-list');

    if (!tbody || !mobileList) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-2xl);">
            <div class="empty-state-card" style="border: none; padding: 0;">
              <span class="material-symbols-outlined" style="font-size: 32px; color: var(--color-text-muted);">history_edu</span>
              <h3 class="font-headline-sm" style="margin-top: 8px;">No Audit Events Recorded</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary);">Audit records will populate as secrets are read or modified.</p>
            </div>
          </td>
        </tr>
      `;
      mobileList.innerHTML = `<div style="text-align: center; padding: var(--space-lg); color: var(--color-text-secondary);">No events found.</div>`;
      return;
    }

    tbody.innerHTML = logs.map(event => {
      let badgeClass = 'badge-code';
      let badgeBg = 'var(--color-surface-container)';
      let badgeColor = 'var(--color-text-primary)';

      if (event.action.includes('revealed')) {
        badgeBg = 'var(--color-stg-bg)';
        badgeColor = 'var(--color-stg-text)';
      } else if (event.action.includes('created') || event.action.includes('imported')) {
        badgeBg = 'var(--color-prod-bg)';
        badgeColor = 'var(--color-prod-text)';
      } else if (event.action.includes('deleted')) {
        badgeBg = 'var(--color-error-bg)';
        badgeColor = 'var(--color-error-text)';
      }

      const metaStr = event.event_metadata ? JSON.stringify(event.event_metadata) : '{}';

      return `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge ${badgeClass}" style="background-color: ${badgeBg}; color: ${badgeColor}; font-weight: 700;">
                ${escapeHtml(event.action)}
              </span>
            </div>
          </td>
          <td>
            <span class="font-label-code-sm" style="color: var(--color-text-secondary);">${escapeHtml(event.resource_type || 'project')}:${event.resource_id || '-'}</span>
          </td>
          <td>
            <span class="font-label-code-sm" style="font-weight: 500; color: var(--color-text-primary);">User #${event.user_id}</span>
          </td>
          <td>
            <code style="font-size: 11px; max-width: 320px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(metaStr)}
            </code>
          </td>
          <td style="text-align: right;">
            <span class="font-label-code-sm" style="color: var(--color-text-secondary);">
              ${new Date(event.created_at).toLocaleString()}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    mobileList.innerHTML = logs.map(event => `
      <div class="mobile-data-card">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span class="font-label-code-sm" style="font-weight: 700; color: var(--color-primary);">${escapeHtml(event.action)}</span>
          <span style="font-size: 10px; color: var(--color-text-secondary);">${new Date(event.created_at).toLocaleDateString()}</span>
        </div>
        <div style="font-size: 11px; font-family: var(--font-mono); color: var(--color-text-secondary);">
          Actor: User #${event.user_id} • ${event.resource_type || 'project'}:${event.resource_id || '-'}
        </div>
      </div>
    `).join('');
  }

  document.getElementById('btn-refresh-audit')?.addEventListener('click', loadAuditLogs);

  loadAuditLogs();
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
