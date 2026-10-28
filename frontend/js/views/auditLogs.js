/**
 * EnvShare Audit Logs & History View
 * Extracted and aligned with Google Stitch design (envshare_audit_logs)
 */

import { store } from '../store.js';
import { listProjects, getProjectAuditLogs } from '../api.js';

export async function renderAuditLogsView(container) {
  const state = store.getState();
  let projects = state.projects.list;
  let activeProject = state.projects.activeProject;

  if (!projects || projects.length === 0) {
    try {
      projects = await listProjects();
      store.setProjects(projects);
    } catch {
      projects = [];
    }
  }

  if (!activeProject && projects.length > 0) {
    activeProject = projects[0];
    store.setActiveProject(activeProject);
  }

  if (!activeProject) {
    container.innerHTML = `
      <div class="empty-state-card" style="padding: 3rem 1rem;">
        <div class="empty-state-icon">
          <span class="material-symbols-outlined">history_toggle_off</span>
        </div>
        <h2 class="font-headline-md" style="margin: 0.5rem 0 0.25rem 0;">No Project Selected</h2>
        <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 320px; margin: 0 auto 1rem auto;">
          Select a project first to inspect recorded audit events.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <!-- Header Section -->
      <div style="display: flex; flex-direction: column; gap: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); letter-spacing: 0.05em;">
          <span>Security & Compliance</span>
          <span>/</span>
          <span>Audit Logs</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
          <div>
            <h1 class="font-headline-lg" style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text-primary);">Audit Logs</h1>
            <p class="font-body-sm" style="margin-top: 4px; color: var(--color-text-secondary);">
              Review recorded mutations and secret revelations across your projects.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button id="btn-refresh-audit" class="btn btn-secondary btn-icon" title="Refresh audit log" style="height: 34px; width: 34px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Filter Controls Bar (Stitch Design) -->
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem;">
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; flex: 1;">
          <!-- Search input -->
          <div style="position: relative; width: 100%; max-width: 280px;">
            <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 9px; font-size: 16px; color: var(--color-text-muted);">search</span>
            <input id="audit-search" type="text" class="input-control" placeholder="Search audit logs…" style="height: 34px; padding-left: 32px; font-size: 13px; border-radius: var(--radius-md);">
          </div>

          <!-- Project Filter -->
          <div style="position: relative;">
            <select id="project-filter" class="input-control" style="height: 34px; font-size: 13px; padding-right: 28px; border-radius: var(--radius-md); cursor: pointer;">
              ${projects.map(p => `
                <option value="${p.id}" ${p.id === activeProject.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>
              `).join('')}
            </select>
          </div>

          <!-- Action Filter -->
          <div style="position: relative;">
            <select id="action-filter" class="input-control" style="height: 34px; font-size: 13px; padding-right: 28px; border-radius: var(--radius-md); cursor: pointer;">
              <option value="all">All Action Types</option>
              <option value="create">Creations</option>
              <option value="update">Updates</option>
              <option value="reveal">Reveals</option>
              <option value="delete">Deletions</option>
              <option value="import">Imports</option>
            </select>
          </div>
        </div>

        <span id="audit-count-badge" class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary); font-size: 11px; padding: 4px 8px;">
          Loading...
        </span>
      </div>

      <!-- Audit Logs Table Container -->
      <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); overflow: hidden;">
        <div class="table-wrapper data-table-desktop">
          <table class="data-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border); background-color: var(--color-surface-container-low); font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--color-text-secondary); letter-spacing: 0.04em;">
                <th style="padding: 10px 16px; text-align: left; width: 35%;">Action</th>
                <th style="padding: 10px 16px; text-align: left; width: 25%;">Project / Environment</th>
                <th style="padding: 10px 16px; text-align: left; width: 20%;">Actor</th>
                <th style="padding: 10px 16px; text-align: right; width: 20%;">Date & Time (UTC)</th>
              </tr>
            </thead>
            <tbody id="audit-table-body" style="font-size: 13px;">
              <tr>
                <td colspan="4" style="text-align: center; padding: 2.5rem;">
                  <div class="spinner"></div>
                  <div style="margin-top: 8px; color: var(--color-text-secondary); font-size: 13px;">Loading audit stream...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Card List -->
        <div class="mobile-card-list" id="audit-mobile-card-list" style="padding: 0.5rem;">
          <!-- Populated via JS -->
        </div>
      </div>
    </div>
  `;

  let currentLogs = [];
  let searchTerm = '';
  let selectedAction = 'all';

  async function loadAuditLogs() {
    try {
      currentLogs = await getProjectAuditLogs(activeProject.id, 50);
      store.setAuditLogs(currentLogs);

      const countBadge = document.getElementById('audit-count-badge');
      if (countBadge) countBadge.textContent = `${currentLogs.length} Events`;

      applyFilters();
    } catch (err) {
      const tbody = document.getElementById('audit-table-body');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 2rem; color: var(--color-error);">
              Failed to load audit logs: ${err.message}
            </td>
          </tr>
        `;
      }
    }
  }

  function applyFilters() {
    let filtered = currentLogs;

    if (selectedAction !== 'all') {
      filtered = filtered.filter(e => (e.action || '').toLowerCase().includes(selectedAction.toLowerCase()));
    }

    if (searchTerm) {
      filtered = filtered.filter(e => {
        const act = (e.action || '').toLowerCase();
        const key = (e.event_metadata?.key || '').toLowerCase();
        return act.includes(searchTerm) || key.includes(searchTerm);
      });
    }

    renderAuditRows(filtered);
  }

  function renderAuditRows(logs) {
    const tbody = document.getElementById('audit-table-body');
    const mobileList = document.getElementById('audit-mobile-card-list');

    if (!tbody || !mobileList) return;

    if (!logs || logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 3rem 1rem;">
            <div class="empty-state-card" style="border: none; padding: 0;">
              <span class="material-symbols-outlined" style="font-size: 32px; color: var(--color-text-muted);">history_edu</span>
              <h3 class="font-headline-sm" style="margin: 0.5rem 0 0.25rem 0;">No Audit Events</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 320px; margin: 0 auto;">
                ${searchTerm || selectedAction !== 'all' ? 'No events matched your filter criteria.' : 'Audit events will populate as variables are added or revealed.'}
              </p>
            </div>
          </td>
        </tr>
      `;
      mobileList.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--color-text-secondary); font-size: 13px;">No events found.</div>`;
      return;
    }

    tbody.innerHTML = logs.map(event => {
      const varKey = event.event_metadata?.key || '';
      const dateUtc = event.created_at ? new Date(event.created_at).toUTCString() : 'Recent';

      return `
        <tr style="border-bottom: 1px solid var(--color-border); transition: background-color var(--transition-fast);">
          <td style="padding: 10px 16px;">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <span style="font-weight: 500; color: var(--color-text-primary);">${escapeHtml(event.action)}</span>
              ${varKey ? `<span style="color: var(--color-text-muted);">·</span><code style="font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--color-text-primary); padding: 2px 6px; border-radius: 4px; background-color: var(--color-canvas); border: 1px solid var(--color-border);">${escapeHtml(varKey)}</code>` : ''}
            </div>
          </td>
          <td style="padding: 10px 16px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 500; color: var(--color-text-primary);">${escapeHtml(activeProject.name)}</span>
              <span style="color: var(--color-border-strong);">/</span>
              <span style="font-size: 12px; color: var(--color-text-secondary);">${escapeHtml(event.event_metadata?.environment_name || 'production')}</span>
            </div>
          </td>
          <td style="padding: 10px 16px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 13px; font-weight: 500; color: var(--color-text-primary);">User #${event.user_id}</span>
            </div>
          </td>
          <td style="padding: 10px 16px; text-align: right; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary); white-space: nowrap;">
            ${dateUtc}
          </td>
        </tr>
      `;
    }).join('');

    mobileList.innerHTML = logs.map(event => {
      const varKey = event.event_metadata?.key || '';
      return `
        <div class="mobile-data-card" style="padding: 10px; border-bottom: 1px solid var(--color-border);">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-weight: 600; font-size: 13px; color: var(--color-text-primary);">${escapeHtml(event.action)}</span>
            <span style="font-size: 10px; font-family: var(--font-mono); color: var(--color-text-muted);">${event.created_at ? new Date(event.created_at).toLocaleDateString() : ''}</span>
          </div>
          ${varKey ? `<div style="margin-top: 4px;"><code style="font-family: var(--font-mono); font-size: 11px; padding: 2px 6px; border-radius: 4px; background-color: var(--color-canvas);">${escapeHtml(varKey)}</code></div>` : ''}
          <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
            Actor: User #${event.user_id} • ${activeProject.name}
          </div>
        </div>
      `;
    }).join('');
  }

  // Hook Search and Select Filters
  document.getElementById('audit-search')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    applyFilters();
  });

  document.getElementById('action-filter')?.addEventListener('change', (e) => {
    selectedAction = e.target.value;
    applyFilters();
  });

  document.getElementById('project-filter')?.addEventListener('change', (e) => {
    const pId = parseInt(e.target.value, 10);
    const proj = projects.find(p => p.id === pId);
    if (proj) {
      activeProject = proj;
      store.setActiveProject(proj);
      loadAuditLogs();
    }
  });

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
