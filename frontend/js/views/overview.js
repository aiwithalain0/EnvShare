/**
 * EnvShare Overview / Admin Dashboard View
 * Extracted and aligned with Google Stitch design (envshare_clean_minimalist_overview_dashboard)
 */

import { store } from '../store.js';
import { router } from '../router.js';
import { listProjects, listEnvironments, getProjectAuditLogs } from '../api.js';

export async function renderOverviewView(container) {
  const state = store.getState();
  const user = state.auth.user;

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <!-- Header Row: Overview Title + Primary Create Project Button -->
      <div style="display: flex; flex-direction: column; gap: 1rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1.25rem;">
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
          <div>
            <h1 class="font-headline-lg" style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text-primary);">Overview</h1>
            <p class="font-body-sm" style="margin-top: 4px; color: var(--color-text-secondary);">Manage your workspace environments, secrets, and project access.</p>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button id="overview-join-project-btn" class="btn btn-secondary" type="button" style="height: 36px; padding: 0 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 500;">
              <span class="material-symbols-outlined" style="font-size: 16px;">login</span>
              <span>Join Project</span>
            </button>
            <button id="overview-new-project-btn" class="btn btn-primary" type="button" style="height: 36px; padding: 0 14px; background-color: #09090b; color: #fff; border-radius: var(--radius-md); font-size: 13px; font-weight: 500;">
              <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
              <span>Create Project</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Summary Metrics Row (3-Card Layout from Stitch) -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem;">
        <!-- Card 1: Projects -->
        <div class="metric-card" style="padding: 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background-color: var(--color-surface-container-lowest); display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 12px; font-weight: 500; color: var(--color-text-secondary);">Projects</div>
          <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 4px;">
            <span id="metric-project-count" style="font-size: 28px; font-weight: 600; color: var(--color-text-primary); letter-spacing: -0.02em; line-height: 1;">-</span>
            <span class="font-body-sm" style="color: var(--color-text-muted); font-size: 12px;" id="metric-project-names">Active projects</span>
          </div>
        </div>

        <!-- Card 2: Environments -->
        <div class="metric-card" style="padding: 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background-color: var(--color-surface-container-lowest); display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 12px; font-weight: 500; color: var(--color-text-secondary);">Environments</div>
          <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 4px;">
            <span id="metric-env-count" style="font-size: 28px; font-weight: 600; color: var(--color-text-primary); letter-spacing: -0.02em; line-height: 1;">-</span>
            <span class="font-body-sm" style="color: var(--color-text-muted); font-size: 12px;" id="metric-env-names">Environments across all projects</span>
          </div>
        </div>

        <!-- Card 3: Audit Activity -->
        <div class="metric-card" style="padding: 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--color-border); background-color: var(--color-surface-container-lowest); display: flex; flex-direction: column; justify-content: space-between;">
          <div style="font-size: 12px; font-weight: 500; color: var(--color-text-secondary);">Audit Mutations</div>
          <div style="margin-top: 0.5rem; display: flex; flex-direction: column; gap: 4px;">
            <span id="metric-mutations-count" style="font-size: 28px; font-weight: 600; color: var(--color-text-primary); letter-spacing: -0.02em; line-height: 1;">-</span>
            <span class="font-body-sm" style="color: var(--color-text-muted); font-size: 12px;">Logged mutation events</span>
          </div>
        </div>
      </div>

      <!-- Main Section: Recent Projects + Recent Activity Timeline -->
      <div style="display: flex; flex-direction: column; gap: 1.5rem;">

        <!-- Recent Projects Table -->
        <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); overflow: hidden;">
          <div style="padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; background-color: var(--color-surface-container-lowest);">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-weight: 500; font-size: 14px; color: var(--color-text-primary);">Recent Projects</span>
              <span id="overview-project-count-pill" class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary);">0 Total</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
              <div style="position: relative;">
                <input id="overview-project-search" type="text" class="input-control" placeholder="Filter projects..." style="height: 30px; width: 160px; padding-left: 26px; font-size: 12px; border-radius: var(--radius-md);">
                <span class="material-symbols-outlined" style="position: absolute; left: 6px; top: 7px; font-size: 15px; color: var(--color-text-muted);">search</span>
              </div>
              <a href="#projects" class="brand-link" style="display: inline-flex; align-items: center; gap: 2px; font-size: 12px; font-weight: 500; color: var(--color-text-secondary); text-decoration: none;">
                <span>View all</span>
                <span class="material-symbols-outlined" style="font-size: 14px;">arrow_forward</span>
              </a>
              <button id="overview-refresh-btn" class="btn btn-secondary btn-icon" title="Refresh project list" type="button" style="height: 30px; width: 30px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
              </button>
            </div>
          </div>

          <!-- Desktop Table View -->
          <div class="table-wrapper data-table-desktop">
            <table class="data-table" style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="border-bottom: 1px solid var(--color-border); background-color: var(--color-canvas); font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--color-text-secondary); letter-spacing: 0.05em;">
                  <th style="padding: 10px 16px; text-align: left;">Project</th>
                  <th style="padding: 10px 16px; text-align: left;">Environments</th>
                  <th style="padding: 10px 16px; text-align: left;">Created</th>
                  <th style="padding: 10px 16px; text-align: right;">Actions</th>
                </tr>
              </thead>
              <tbody id="overview-projects-tbody">
                <tr>
                  <td colspan="4" style="text-align: center; padding: 2rem;">
                    <div class="spinner"></div>
                    <div style="margin-top: 0.5rem; color: var(--color-text-secondary); font-size: 13px;">Loading projects...</div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Mobile Stacked Card View (< 768px) -->
          <div class="mobile-card-list" id="overview-projects-mobile-list" style="padding: 0.5rem;">
            <!-- Populated via JS -->
          </div>
        </div>

        <!-- Recent Activity Feed (Stitch Stream) -->
        <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); padding: 1.25rem; display: flex; flex-direction: column; gap: 0.75rem;">
          <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem;">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <span style="font-weight: 500; font-size: 14px; color: var(--color-text-primary);">Recent Activity</span>
              <span style="font-size: 12px; color: var(--color-text-muted);">Audit feed</span>
            </div>
            <a href="#audit-logs" class="brand-link" style="display: inline-flex; align-items: center; gap: 2px; font-size: 12px; font-weight: 500; color: var(--color-text-secondary); text-decoration: none;">
              <span>View full audit log</span>
              <span class="material-symbols-outlined" style="font-size: 14px;">arrow_forward</span>
            </a>
          </div>

          <div id="overview-activity-stream" style="display: flex; flex-direction: column; divide-y: divide-neutral-100;">
            <div style="text-align: center; padding: 1.5rem; color: var(--color-text-secondary); font-size: 13px;">
              <div class="spinner"></div>
              <div style="margin-top: 0.5rem;">Loading audit events...</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  // Hook New Project Button
  document.getElementById('overview-new-project-btn')?.addEventListener('click', () => {
    window.openNewProjectModal?.();
  });

  // Hook Join Project Button
  document.getElementById('overview-join-project-btn')?.addEventListener('click', () => {
    window.openJoinProjectModal?.();
  });

  let loadedProjects = [];

  // Load Real Data from Backend
  async function loadOverviewData() {
    try {
      const projects = await listProjects();
      loadedProjects = projects;
      store.setProjects(projects);

      const pCountEl = document.getElementById('metric-project-count');
      const pillEl = document.getElementById('overview-project-count-pill');
      if (pCountEl) pCountEl.textContent = projects.length;
      if (pillEl) pillEl.textContent = `${projects.length} Total`;

      if (projects.length > 0) {
        const namesEl = document.getElementById('metric-project-names');
        if (namesEl) namesEl.textContent = `${projects.length} active in workspace`;
      } else {
        const namesEl = document.getElementById('metric-project-names');
        if (namesEl) namesEl.textContent = 'No projects yet';
      }

      // Fetch environments across all projects accurately
      if (projects.length > 0) {
        try {
          const envsPerProject = await Promise.all(
            projects.map(p => listEnvironments(p.id).catch(() => []))
          );
          const totalEnvs = envsPerProject.reduce((sum, list) => sum + list.length, 0);
          const envCountEl = document.getElementById('metric-env-count');
          const envNamesEl = document.getElementById('metric-env-names');
          if (envCountEl) envCountEl.textContent = totalEnvs;
          if (envNamesEl) envNamesEl.textContent = `${totalEnvs} active across projects`;
        } catch {
          const envCountEl = document.getElementById('metric-env-count');
          if (envCountEl) envCountEl.textContent = '-';
        }

        // Fetch Audit Logs for activity timeline
        try {
          const logs = await getProjectAuditLogs(projects[0].id, 10);
          const mutEl = document.getElementById('metric-mutations-count');
          if (mutEl) mutEl.textContent = logs.length;
          renderActivityStream(logs);
        } catch {
          const mutEl = document.getElementById('metric-mutations-count');
          if (mutEl) mutEl.textContent = '0';
          renderActivityStream([]);
        }
      } else {
        const envCountEl = document.getElementById('metric-env-count');
        const envNamesEl = document.getElementById('metric-env-names');
        const mutEl = document.getElementById('metric-mutations-count');
        if (envCountEl) envCountEl.textContent = '0';
        if (envNamesEl) envNamesEl.textContent = 'No projects registered';
        if (mutEl) mutEl.textContent = '0';
        renderActivityStream([]);
      }

      renderProjectsTable(projects);

    } catch (err) {
      const tbody = document.getElementById('overview-projects-tbody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 2rem; color: var(--color-error);">
              Failed to load projects: ${err.message}
            </td>
          </tr>
        `;
      }
    }
  }

  function renderProjectsTable(projects) {
    const tbody = document.getElementById('overview-projects-tbody');
    const mobileList = document.getElementById('overview-projects-mobile-list');

    if (!tbody || !mobileList) return;

    if (!projects || projects.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 2.5rem 1rem;">
            <div class="empty-state-card" style="border: none; padding: 0;">
              <div class="empty-state-icon">
                <span class="material-symbols-outlined">folder_open</span>
              </div>
              <h3 class="font-headline-sm" style="margin: 0.5rem 0 0.25rem 0;">No Projects Found</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 320px; margin: 0 auto 1rem auto;">
                Create your first project to start managing environments and runtime secrets.
              </p>
              <button class="btn btn-primary" onclick="window.openNewProjectModal()" style="height: 36px; padding: 0 14px; background-color: #09090b; color: #fff; border-radius: var(--radius-md);">
                <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
                <span>Create Project</span>
              </button>
            </div>
          </td>
        </tr>
      `;
      mobileList.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--color-text-secondary); font-size: 13px;">No projects registered.</div>`;
      return;
    }

    tbody.innerHTML = projects.slice(0, 5).map(p => {
      const initials = (p.name.slice(0, 2) || 'PR').toUpperCase();
      return `
        <tr style="border-bottom: 1px solid var(--color-border); transition: background-color var(--transition-fast);">
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 28px; height: 28px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); background-color: var(--color-canvas); display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--color-text-primary);">
                ${initials}
              </div>
              <div>
                <a href="#variables" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables'); return false;" style="font-weight: 500; font-size: 14px; color: var(--color-text-primary); text-decoration: none;">
                  ${escapeHtml(p.name)}
                </a>
                <div style="font-size: 11px; color: var(--color-text-muted); font-family: var(--font-mono);">id: ${p.id}</div>
              </div>
            </div>
          </td>
          <td style="padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px;">
              <span class="badge badge-prod">Prod</span>
              <span class="badge badge-stg">Staging</span>
              <span class="badge badge-dev">Dev</span>
            </div>
          </td>
          <td style="padding: 12px 16px; font-size: 12px; color: var(--color-text-secondary);">
            ${p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Active'}
          </td>
          <td style="padding: 12px 16px; text-align: right;">
            <a href="#variables" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables'); return false;" class="btn btn-secondary btn-sm" style="font-size: 12px; height: 28px; padding: 0 10px; border-radius: var(--radius-sm);">
              View Variables
            </a>
          </td>
        </tr>
      `;
    }).join('');

    mobileList.innerHTML = projects.slice(0, 5).map(p => `
      <div class="mobile-data-card" style="padding: 12px; border-bottom: 1px solid var(--color-border);">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-weight: 600; font-size: 14px; color: var(--color-text-primary);">${escapeHtml(p.name)}</span>
          <span class="badge badge-prod">Active</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
          <span style="font-size: 12px; color: var(--color-text-muted);">Dev • Staging • Prod</span>
          <button class="btn btn-secondary btn-sm" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables')" style="font-size: 11px;">
            Open →
          </button>
        </div>
      </div>
    `).join('');
  }

  function renderActivityStream(logs) {
    const stream = document.getElementById('overview-activity-stream');
    if (!stream) return;

    if (!logs || logs.length === 0) {
      stream.innerHTML = `
        <div style="text-align: center; padding: 1.5rem; color: var(--color-text-muted); font-size: 13px;">
          No recent audit events in this project.
        </div>
      `;
      return;
    }

    stream.innerHTML = logs.slice(0, 5).map(log => {
      let icon = 'edit';
      if (log.action.toLowerCase().includes('create')) icon = 'add_circle';
      if (log.action.toLowerCase().includes('delete')) icon = 'delete';
      if (log.action.toLowerCase().includes('reveal')) icon = 'visibility';
      if (log.action.toLowerCase().includes('import')) icon = 'sync';

      const timeAgo = formatTimeAgo(log.created_at);

      return `
        <div style="padding: 10px 0; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; gap: 1rem;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
            <span class="material-symbols-outlined" style="font-size: 18px; color: var(--color-text-muted); flex-shrink: 0;">${icon}</span>
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <code style="font-family: var(--font-mono); font-size: 12px; background-color: var(--color-canvas); color: var(--color-text-primary); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--color-border);">${escapeHtml(log.variable_key || log.action)}</code>
              <span style="font-size: 12px; color: var(--color-text-secondary);">${escapeHtml(log.action)}</span>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-muted); flex-shrink: 0;">
            <span style="font-family: var(--font-mono); color: var(--color-text-secondary);">user #${log.user_id}</span>
            <span>•</span>
            <span style="font-weight: 500; color: var(--color-text-primary);">${timeAgo}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return 'just now';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  }

  // Filter Search
  document.getElementById('overview-project-search')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = loadedProjects.filter(p => p.name.toLowerCase().includes(term));
    renderProjectsTable(filtered);
  });

  document.getElementById('overview-refresh-btn')?.addEventListener('click', loadOverviewData);

  loadOverviewData();
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
