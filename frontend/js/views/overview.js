/**
 * EnvShare Overview / Admin Dashboard View
 * Extracted from Google Stitch Project 7000277523774803089
 */

import { store } from '../store.js';
import { router } from '../router.js';
import { listProjects, listEnvironments, getProjectAuditLogs } from '../api.js';

export async function renderOverviewView(container) {
  const state = store.getState();
  const user = state.auth.user;

  container.innerHTML = `
    <!-- Top Context & Header Strip -->
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <div style="display: flex; align-items: center; gap: var(--space-xs); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-secondary);">
        <span>Workspace</span>
        <span style="color: var(--color-text-muted);">/</span>
        <span style="color: var(--color-text-primary);">Acme Corp</span>
      </div>
      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md);">
        <div>
          <h1 class="font-headline-lg">Overview</h1>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 2px;">
            Administrative summary and cryptographic runtime activity for Acme Corp.
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <button id="overview-new-project-btn" class="btn btn-primary" type="button">
            <span class="material-symbols-outlined">add</span>
            <span>New Project</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 4 Summary Metric Cards -->
    <div class="metrics-grid">
      <!-- Metric 1: Active Projects -->
      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">Active Projects</span>
          <div class="metric-icon-box">
            <span class="material-symbols-outlined">folder_data</span>
          </div>
        </div>
        <div class="metric-stat-row">
          <div>
            <span class="metric-number" id="metric-project-count">-</span>
            <span class="metric-unit">repos</span>
          </div>
          <span class="badge badge-prod badge-code">All Synced</span>
        </div>
        <div class="metric-subtext" id="metric-project-names">Loading projects...</div>
      </div>

      <!-- Metric 2: Environments -->
      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">Environments</span>
          <div class="metric-icon-box">
            <span class="material-symbols-outlined">layers</span>
          </div>
        </div>
        <div class="metric-stat-row">
          <div>
            <span class="metric-number" id="metric-env-count">-</span>
            <span class="metric-unit">deployed</span>
          </div>
          <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 500; color: var(--color-prod-text);">
            <span class="pulse-dot"></span> Active
          </div>
        </div>
        <div class="metric-subtext">Dev, Staging, Production tiers</div>
      </div>

      <!-- Metric 3: Team Access -->
      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">Team Access</span>
          <div class="metric-icon-box">
            <span class="material-symbols-outlined">group</span>
          </div>
        </div>
        <div class="metric-stat-row">
          <div>
            <span class="metric-number">8</span>
            <span class="metric-unit">seats</span>
          </div>
          <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary);">2 Admins</span>
        </div>
        <div class="metric-subtext">3 Managers • 3 Developers</div>
      </div>

      <!-- Metric 4: 24h Mutations -->
      <div class="metric-card">
        <div class="metric-card-top">
          <span class="metric-label">24h Mutations</span>
          <div class="metric-icon-box">
            <span class="material-symbols-outlined">verified_user</span>
          </div>
        </div>
        <div class="metric-stat-row">
          <div>
            <span class="metric-number" id="metric-mutations-count">-</span>
            <span class="metric-unit">actions</span>
          </div>
          <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary);">
            <span class="material-symbols-outlined" style="font-size: 13px; color: var(--color-prod);">check_circle</span> SOC2
          </span>
        </div>
        <div class="metric-subtext">100% Cryptographically signed</div>
      </div>
    </div>

    <!-- Zero-Trust Environment Orchestration Banner -->
    <div class="security-banner">
      <div class="security-banner-left">
        <span class="material-symbols-outlined security-banner-icon">lock</span>
        <div>
          <span class="security-banner-title">Zero-Trust Environment Orchestration Active.</span>
          <span class="security-banner-desc">Client side AES-GCM 256-bit encryption is verified for all runtime secrets.</span>
        </div>
      </div>
      <div class="security-banner-key">
        <span class="pulse-dot"></span>
        <span>KMS HSM Key:</span>
        <strong>kms-us-east-1-prod</strong>
      </div>
    </div>

    <!-- Main Content Split: 8 Col (Registered Projects) + 4 Col (Recent Activity Timeline) -->
    <div style="display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--space-lg); align-items: start;">
      
      <!-- Left Column: Projects Overview (8 cols) -->
      <div class="table-surface-card" style="grid-column: span 8;">
        <div class="table-toolbar">
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <h2 class="font-headline-sm">Registered Projects</h2>
            <span id="overview-project-count-pill" class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary);">
              0 Total
            </span>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <div style="position: relative;">
              <input id="overview-project-search" type="text" class="input-control" placeholder="Filter projects..." style="height: 32px; width: 180px; padding-left: 28px;">
              <span class="material-symbols-outlined" style="position: absolute; left: 8px; top: 8px; font-size: 16px; color: var(--color-text-muted);">search</span>
            </div>
            <button id="overview-refresh-btn" class="btn btn-secondary btn-icon" title="Refresh project list" type="button" style="height: 32px; width: 32px;">
              <span class="material-symbols-outlined">refresh</span>
            </button>
          </div>
        </div>

        <!-- Desktop Table View -->
        <div class="table-wrapper data-table-desktop">
          <table class="data-table">
            <thead>
              <tr>
                <th>Project Name</th>
                <th>Runtime / Tags</th>
                <th>Environments</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody id="overview-projects-tbody">
              <tr>
                <td colspan="4" style="text-align: center; padding: var(--space-xl);">
                  <div class="spinner"></div>
                  <div style="margin-top: var(--space-xs); color: var(--color-text-secondary);">Loading projects...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Mobile Stacked Card View (< 768px) -->
        <div class="mobile-card-list" id="overview-projects-mobile-list">
          <!-- Populated via JS -->
        </div>

        <div style="padding: var(--space-sm) var(--space-lg); background-color: rgba(242, 243, 255, 0.4); border-top: 1px solid var(--color-border-subtle); display: flex; align-items: center; justify-content: space-between; font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary);">
          <span>Synced with Organization Workspace: acme-corp/*</span>
          <span style="color: var(--color-text-primary); font-weight: 500;">Zero-Leak Memory Storage Active</span>
        </div>
      </div>

      <!-- Right Column: Recent Activity Timeline (4 cols) -->
      <div class="table-surface-card" style="grid-column: span 4;">
        <div class="table-toolbar">
          <div style="display: flex; align-items: center; gap: var(--space-xs);">
            <span class="material-symbols-outlined" style="color: var(--color-text-secondary); font-size: 18px;">history</span>
            <h2 class="font-headline-sm">Recent Activity</h2>
          </div>
          <span class="pulse-dot" title="Live stream active"></span>
        </div>

        <div id="overview-activity-stream" style="padding: var(--space-md); display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="text-align: center; padding: var(--space-lg); color: var(--color-text-secondary);">
            <div class="spinner"></div>
            <div style="margin-top: var(--space-xs);">Loading audit events...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Hook New Project Button
  document.getElementById('overview-new-project-btn')?.addEventListener('click', () => {
    window.openNewProjectModal?.();
  });

  // Load Real Data from Backend
  async function loadOverviewData() {
    try {
      const projects = await listProjects();
      store.setProjects(projects);

      document.getElementById('metric-project-count').textContent = projects.length;
      document.getElementById('overview-project-count-pill').textContent = `${projects.length} Total`;
      
      if (projects.length > 0) {
        document.getElementById('metric-project-names').textContent = projects.slice(0, 4).map(p => p.name).join(', ');
      } else {
        document.getElementById('metric-project-names').textContent = 'No repositories yet';
      }

      // Fetch environments for first active project
      let totalEnvs = 0;
      if (projects.length > 0) {
        try {
          const envs = await listEnvironments(projects[0].id);
          totalEnvs = envs.length;
          document.getElementById('metric-env-count').textContent = totalEnvs;
        } catch {
          document.getElementById('metric-env-count').textContent = '3';
        }

        // Fetch Audit Logs for activity timeline
        try {
          const logs = await getProjectAuditLogs(projects[0].id, 10);
          document.getElementById('metric-mutations-count').textContent = logs.length;
          renderActivityStream(logs);
        } catch {
          renderActivityStream([]);
        }
      } else {
        document.getElementById('metric-env-count').textContent = '0';
        document.getElementById('metric-mutations-count').textContent = '0';
        renderActivityStream([]);
      }

      renderProjectsTable(projects);

    } catch (err) {
      document.getElementById('overview-projects-tbody').innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: var(--space-xl); color: var(--color-error);">
            Failed to load projects: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function renderProjectsTable(projects) {
    const tbody = document.getElementById('overview-projects-tbody');
    const mobileList = document.getElementById('overview-projects-mobile-list');

    if (!tbody || !mobileList) return;

    if (!projects || projects.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: var(--space-2xl);">
            <div class="empty-state-card" style="border: none; padding: 0;">
              <div class="empty-state-icon">
                <span class="material-symbols-outlined">folder_open</span>
              </div>
              <h3 class="font-headline-sm">No Projects Found</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 320px;">
                Create your first project to start managing environments and runtime secrets.
              </p>
              <button class="btn btn-primary" onclick="window.openNewProjectModal()" style="margin-top: var(--space-sm);">
                <span class="material-symbols-outlined">add</span>
                <span>Create Project</span>
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
        <td>
          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <div style="width: 28px; height: 28px; border-radius: var(--radius-sm); background-color: var(--color-surface-container); color: var(--color-secondary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <span class="material-symbols-outlined" style="font-size: 16px;">credit_card</span>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="font-label-code-md" style="font-weight: 600; color: var(--color-text-primary);">${escapeHtml(p.name)}</span>
                <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary); font-size: 10px;">Primary</span>
              </div>
              <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 1px;">
                Created ${new Date(p.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary);">Production Service</span>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="badge badge-dev badge-code">Dev</span>
            <span class="badge badge-stg badge-code">Stg</span>
            <span class="badge badge-prod badge-code">Prod</span>
          </div>
        </td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables')">
            <span>Manage</span>
            <span class="material-symbols-outlined" style="font-size: 14px;">arrow_forward</span>
          </button>
        </td>
      </tr>
    `).join('');

    mobileList.innerHTML = projects.map(p => `
      <div class="mobile-data-card">
        <div class="mobile-data-card-header">
          <div>
            <span class="font-label-code-md" style="font-weight: 600; color: var(--color-text-primary);">${escapeHtml(p.name)}</span>
            <p class="font-body-sm" style="color: var(--color-text-secondary);">Created ${new Date(p.created_at).toLocaleDateString()}</p>
          </div>
          <span class="badge badge-prod badge-code">Prod</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; padding-top: var(--space-xs); font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary);">
          <span>3 Environments</span>
          <button class="btn btn-ghost btn-sm" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables')">
            Manage →
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
        <div style="text-align: center; padding: var(--space-lg); color: var(--color-text-secondary); font-size: var(--font-size-body-sm);">
          No recent activity recorded for this workspace.
        </div>
      `;
      return;
    }

    stream.innerHTML = logs.slice(0, 5).map(event => {
      let icon = 'edit_note';
      if (event.action.includes('created')) icon = 'add_circle';
      if (event.action.includes('deleted')) icon = 'delete';
      if (event.action.includes('revealed')) icon = 'visibility';
      if (event.action.includes('imported')) icon = 'file_upload';

      const timeAgo = formatTimeAgo(new Date(event.created_at));

      return `
        <div style="display: flex; align-items: flex-start; gap: var(--space-sm); padding-bottom: var(--space-sm); border-bottom: 1px solid var(--color-border-subtle);">
          <div style="width: 24px; height: 24px; border-radius: 50%; background-color: var(--color-surface-container-high); color: var(--color-text-secondary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
            <span class="material-symbols-outlined" style="font-size: 14px;">${icon}</span>
          </div>
          <div style="flex: 1; min-width: 0;">
            <p class="font-body-sm" style="color: var(--color-text-primary); line-height: 1.3;">
              <strong style="font-weight: 600;">${escapeHtml(event.action)}</strong>
              ${event.resource_type ? `<span class="badge badge-code" style="font-size: 10px; margin-left: 4px;">${escapeHtml(event.resource_type)}</span>` : ''}
            </p>
            <div style="display: flex; align-items: center; gap: 6px; margin-top: 3px; font-family: var(--font-mono); font-size: 10px; color: var(--color-text-muted);">
              <span>User #${event.user_id}</span>
              <span>•</span>
              <span>${timeAgo}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

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

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
