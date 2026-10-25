/**
 * EnvShare Project Management View
 * Extracted from Google Stitch Project 7000277523774803089
 */

import { store } from '../store.js';
import { listProjects, listEnvironments, createProject } from '../api.js';

export async function renderProjectsView(container) {
  const state = store.getState();

  container.innerHTML = `
    <!-- Header Section -->
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <div style="display: flex; items-center; gap: var(--space-sm); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary);">
        <span>Acme Corp</span>
        <span style="color: var(--color-text-muted);">/</span>
        <span style="color: var(--color-text-primary);">Infrastructure Workspaces</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-md);">
        <div>
          <h1 class="font-display-lg">Projects</h1>
          <p class="font-body-md" style="color: var(--color-text-secondary); max-width: 680px; margin-top: 2px;">
            Manage organization repositories, linked environments, and project-level administrative settings.
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <button id="btn-audit-rollup" class="btn btn-secondary" type="button">
            <span class="material-symbols-outlined" style="font-size: 16px; color: var(--color-text-secondary);">analytics</span>
            <span>Audit Rollup</span>
          </button>
          <button id="btn-create-project-trigger" class="btn btn-primary" type="button">
            <span class="material-symbols-outlined">add</span>
            <span>Create Project</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 4 Summary Metric Cards -->
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">Total Workspaces</span>
          <span class="material-symbols-outlined" style="color: var(--color-text-secondary); font-size: 18px;">domain</span>
        </div>
        <div>
          <span class="metric-number" id="projects-metric-total">-</span>
          <span class="metric-unit">repos</span>
        </div>
        <div class="metric-subtext">Across active clusters</div>
      </div>

      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">Secured Secrets</span>
          <span class="material-symbols-outlined" style="color: var(--color-text-secondary); font-size: 18px;">key</span>
        </div>
        <div>
          <span class="metric-number">412</span>
          <span class="metric-unit">synced</span>
        </div>
        <div class="metric-subtext">AES-GCM 256-bit encrypted</div>
      </div>

      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">Environment Drift</span>
          <span class="material-symbols-outlined" style="color: var(--color-text-secondary); font-size: 18px;">sync_saved_locally</span>
        </div>
        <div>
          <span class="metric-number">0.0%</span>
        </div>
        <div class="metric-subtext">All deployment tiers matched</div>
      </div>

      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">Active Collaborators</span>
          <span class="material-symbols-outlined" style="color: var(--color-text-secondary); font-size: 18px;">group</span>
        </div>
        <div>
          <span class="metric-number">8</span>
          <span class="metric-unit">members</span>
        </div>
        <div class="metric-subtext">Zero-trust access policy</div>
      </div>
    </div>

    <!-- Main Projects Surface Card -->
    <div class="table-surface-card">
      <div class="table-toolbar">
        <div style="display: flex; flex: 1; align-items: center; gap: var(--space-sm); max-width: 460px;">
          <div style="position: relative; width: 100%;">
            <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 10px; font-size: 18px; color: var(--color-text-muted);">search</span>
            <input id="projects-search-input" type="text" class="input-control" placeholder="Filter by repository, slug or tag..." style="padding-left: 36px;">
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-md);">
          <div class="filter-chip-group">
            <button class="filter-chip is-active" data-filter="all">All</button>
            <button class="filter-chip" data-filter="active">Active</button>
            <button class="filter-chip" data-filter="archived">Archived</button>
          </div>
          <button id="projects-refresh-btn" class="btn btn-secondary btn-icon" title="Reload list" style="height: 34px; width: 34px;">
            <span class="material-symbols-outlined">refresh</span>
          </button>
        </div>
      </div>

      <!-- Desktop Projects Table -->
      <div class="table-wrapper data-table-desktop">
        <table class="data-table">
          <thead>
            <tr>
              <th>Repository & Identity</th>
              <th>Connected Environments</th>
              <th>Team Access</th>
              <th>Created / Updated</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody id="projects-table-body">
            <tr>
              <td colspan="5" style="text-align: center; padding: var(--space-xl);">
                <div class="spinner"></div>
                <div style="margin-top: var(--space-xs); color: var(--color-text-secondary);">Loading projects...</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile Stacked Card List -->
      <div class="mobile-card-list" id="projects-mobile-card-list">
        <!-- Populated via JS -->
      </div>
    </div>
  `;

  // Hook Actions
  document.getElementById('btn-audit-rollup')?.addEventListener('click', () => {
    window.location.hash = '#audit-logs';
  });

  document.getElementById('btn-create-project-trigger')?.addEventListener('click', () => {
    window.openNewProjectModal?.();
  });

  let currentProjects = [];

  async function loadProjects() {
    try {
      currentProjects = await listProjects();
      store.setProjects(currentProjects);

      document.getElementById('projects-metric-total').textContent = currentProjects.length;
      renderTableRows(currentProjects);
    } catch (err) {
      document.getElementById('projects-table-body').innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-xl); color: var(--color-error);">
            Failed to load projects: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function renderTableRows(projects) {
    const tbody = document.getElementById('projects-table-body');
    const mobileList = document.getElementById('projects-mobile-card-list');

    if (!tbody || !mobileList) return;

    if (!projects || projects.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-2xl);">
            <div class="empty-state-card" style="border: none; padding: 0;">
              <div class="empty-state-icon">
                <span class="material-symbols-outlined">folder_open</span>
              </div>
              <h3 class="font-headline-sm">No Projects Available</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 320px;">
                You don't have any projects registered in this workspace yet.
              </p>
              <button class="btn btn-primary" onclick="window.openNewProjectModal()" style="margin-top: var(--space-sm);">
                <span class="material-symbols-outlined">add</span>
                <span>Create New Project</span>
              </button>
            </div>
          </td>
        </tr>
      `;
      mobileList.innerHTML = `<div style="text-align: center; padding: var(--space-lg); color: var(--color-text-secondary);">No projects registered.</div>`;
      return;
    }

    tbody.innerHTML = projects.map(p => `
      <tr>
        <td style="vertical-align: top;">
          <div style="display: flex; align-items: flex-start; gap: var(--space-sm);">
            <div style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: var(--color-primary-container); color: #FFFFFF; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
              <span class="material-symbols-outlined" style="font-size: 18px;">account_balance_wallet</span>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <a href="#variables" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables'); return false;" class="font-label-code-md" style="font-weight: 600; color: var(--color-text-primary);">
                  ${escapeHtml(p.name)}
                </a>
                <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary); font-size: 10px;">tier-0</span>
              </div>
              <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 2px; max-width: 360px;">
                Enterprise runtime repository & cryptographic parameter vault.
              </p>
              <div style="display: flex; align-items: center; gap: 4px; margin-top: 6px; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-muted);">
                <span class="material-symbols-outlined" style="font-size: 14px;">call_split</span>
                <span>github.com/acme-corp/${escapeHtml(p.name)}</span>
              </div>
            </div>
          </div>
        </td>
        <td style="vertical-align: top;">
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            <span class="badge badge-dev badge-code">Dev</span>
            <span class="badge badge-stg badge-code">Staging</span>
            <span class="badge badge-prod badge-code">Prod</span>
          </div>
        </td>
        <td style="vertical-align: top;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <div style="display: flex; margin-right: -4px;">
              <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--color-primary); color: #FFF; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; border: 2px solid #FFF;">AC</div>
              <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--color-secondary); color: #FFF; font-size: 10px; font-weight: 600; display: flex; align-items: center; justify-content: center; border: 2px solid #FFF; margin-left: -6px;">SC</div>
            </div>
            <span style="font-size: 12px; color: var(--color-text-secondary);">4 members</span>
          </div>
        </td>
        <td style="vertical-align: top;">
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-primary);">
            ${new Date(p.created_at).toLocaleDateString()}
          </div>
          <div style="font-size: 11px; color: var(--color-text-secondary);">by Owner</div>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <button class="btn btn-secondary btn-sm" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables')">
            <span>Open Environments</span>
          </button>
        </td>
      </tr>
    `).join('');

    mobileList.innerHTML = projects.map(p => `
      <div class="mobile-data-card">
        <div class="mobile-data-card-header">
          <div>
            <span class="font-label-code-md" style="font-weight: 600; color: var(--color-text-primary);">${escapeHtml(p.name)}</span>
            <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 2px;">Created ${new Date(p.created_at).toLocaleDateString()}</p>
          </div>
          <span class="badge badge-prod badge-code">Prod</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: var(--space-xs);">
          <span style="font-size: 12px; color: var(--color-text-secondary);">Dev • Staging • Prod</span>
          <button class="btn btn-secondary btn-sm" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables')">
            Open →
          </button>
        </div>
      </div>
    `).join('');
  }

  // Filter Search
  document.getElementById('projects-search-input')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    const filtered = currentProjects.filter(p => p.name.toLowerCase().includes(term));
    renderTableRows(filtered);
  });

  document.getElementById('projects-refresh-btn')?.addEventListener('click', loadProjects);

  loadProjects();
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
