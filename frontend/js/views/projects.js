/**
 * EnvShare Project Management View
 * Aligned with Google Stitch design (envshare_projects_1 variant)
 */

import { store } from '../store.js';
import { listProjects, listEnvironments, createProject, deleteProject } from '../api.js';

export async function renderProjectsView(container) {
  const state = store.getState();

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
      <!-- Header Section -->
      <div style="display: flex; flex-direction: column; gap: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); letter-spacing: 0.05em;">
          <span>Workspace</span>
          <span>/</span>
          <span>Projects</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
          <div>
            <h1 class="font-headline-lg" style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text-primary);">Projects</h1>
            <p class="font-body-sm" style="margin-top: 4px; color: var(--color-text-secondary); max-width: 680px;">
              Manage projects, environments, and configuration secrets across your workspace.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button id="btn-join-project-trigger" class="btn btn-secondary" type="button" style="height: 36px; padding: 0 14px; border-radius: var(--radius-md); font-size: 13px; font-weight: 500;">
              <span class="material-symbols-outlined" style="font-size: 16px;">login</span>
              <span>Join Project</span>
            </button>
            <button id="btn-create-project-trigger" class="btn btn-primary" type="button" style="height: 36px; padding: 0 14px; background-color: #09090b; color: #fff; border-radius: var(--radius-md); font-size: 13px; font-weight: 500;">
              <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
              <span>Create Project</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Main Projects Surface Card -->
      <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); overflow: hidden;">
        <!-- Toolbar -->
        <div style="padding: 0.875rem 1.25rem; border-bottom: 1px solid var(--color-border); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; background-color: var(--color-surface-container-lowest);">
          <div style="display: flex; flex: 1; align-items: center; gap: 0.75rem; max-width: 420px;">
            <div style="position: relative; width: 100%;">
              <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 8px; font-size: 16px; color: var(--color-text-muted);">search</span>
              <input id="projects-search-input" type="text" class="input-control" placeholder="Search projects..." style="padding-left: 32px; height: 32px; font-size: 13px; border-radius: var(--radius-md);">
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <div style="font-size: 12px; color: var(--color-text-secondary);">
              <span id="projects-metric-total" style="font-weight: 600; color: var(--color-text-primary);">-</span> active projects
            </div>
            <button id="projects-refresh-btn" class="btn btn-secondary btn-icon" title="Reload list" style="height: 32px; width: 32px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
            </button>
          </div>
        </div>

        <!-- Projects Rows List (Stitch Article Card Design) -->
        <div id="projects-table-body" style="display: flex; flex-direction: column; divide-y: divide-neutral-100;">
          <div style="text-align: center; padding: 3rem 1rem;">
            <div class="spinner"></div>
            <div style="margin-top: 0.5rem; color: var(--color-text-secondary); font-size: 13px;">Loading projects...</div>
          </div>
        </div>

        <!-- Mobile Stacked Card List -->
        <div class="mobile-card-list" id="projects-mobile-card-list" style="display: none;">
          <!-- Handled responsively via projects-table-body -->
        </div>
      </div>
    </div>
  `;

  // Hook Actions
  document.getElementById('btn-create-project-trigger')?.addEventListener('click', () => {
    window.openNewProjectModal?.();
  });

  document.getElementById('btn-join-project-trigger')?.addEventListener('click', () => {
    window.openJoinProjectModal?.();
  });

  let currentProjects = [];

  async function loadProjects() {
    try {
      currentProjects = await listProjects();
      store.setProjects(currentProjects);

      const metricTotal = document.getElementById('projects-metric-total');
      if (metricTotal) metricTotal.textContent = currentProjects.length;

      renderTableRows(currentProjects);
    } catch (err) {
      const containerEl = document.getElementById('projects-table-body');
      if (containerEl) {
        containerEl.innerHTML = `
          <div style="text-align: center; padding: 2rem; color: var(--color-error); font-size: 13px;">
            Failed to load projects: ${err.message}
          </div>
        `;
      }
    }
  }

  window.confirmDeleteProject = function(projectId, projectName) {
    window.openConfirmationModal?.({
      title: 'Delete Project',
      message: `Are you sure you want to permanently delete <strong>${escapeHtml(projectName)}</strong>? All associated environments, encrypted variables, and memberships will be deleted. Audit history will be retained.`,
      confirmText: 'Delete Project',
      isDanger: true,
      onConfirm: async () => {
        await deleteProject(projectId);
        window.showToast?.('Project Deleted', `Project "${projectName}" was deleted successfully.`, 'success');
        const cur = store.getCurrentProject();
        if (cur && cur.id === projectId) {
          store.setCurrentProject(null);
        }
        await loadProjects();
      }
    });
  };

  function renderTableRows(projects) {
    const listContainer = document.getElementById('projects-table-body');
    if (!listContainer) return;

    if (!projects || projects.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 3.5rem 1rem;">
          <div class="empty-state-card" style="border: none; padding: 0;">
            <div class="empty-state-icon">
              <span class="material-symbols-outlined">folder_open</span>
            </div>
            <h3 class="font-headline-sm" style="margin: 0.5rem 0 0.25rem 0;">No Projects Available</h3>
            <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 360px; margin: 0 auto 1.25rem auto;">
              You don't have any projects registered yet. Create a new vault or join an existing project with an invite code.
            </p>
            <div style="display: flex; align-items: center; justify-content: center; gap: 0.75rem;">
              <button class="btn btn-secondary" onclick="window.openJoinProjectModal()" style="height: 36px; padding: 0 14px; border-radius: var(--radius-md);">
                <span class="material-symbols-outlined" style="font-size: 16px;">login</span>
                <span>Join with Code</span>
              </button>
              <button class="btn btn-primary" onclick="window.openNewProjectModal()" style="height: 36px; padding: 0 14px; background-color: #09090b; color: #fff; border-radius: var(--radius-md);">
                <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
                <span>Create New Project</span>
              </button>
            </div>
          </div>
        </div>
      `;
      return;
    }

    listContainer.innerHTML = projects.map(p => {
      const createdDate = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Recent';
      return `
        <article style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--color-border); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; transition: background-color var(--transition-fast);">
          <!-- Left: Icon + Info -->
          <div style="display: flex; align-items: flex-start; gap: 0.875rem; min-width: 260px; flex: 1;">
            <div style="width: 38px; height: 38px; border-radius: var(--radius-md); background-color: var(--color-surface-container-low); border: 1px solid var(--color-border); display: flex; align-items: center; justify-content: center; color: var(--color-text-primary); flex-shrink: 0; margin-top: 2px;">
              <span class="material-symbols-outlined" style="font-size: 20px;">folder</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <a href="#variables" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables'); return false;" style="font-size: 14px; font-weight: 600; color: var(--color-text-primary); text-decoration: none;">
                  ${escapeHtml(p.name)}
                </a>
                <span style="font-size: 10px; font-family: var(--font-mono); text-transform: uppercase; padding: 1px 6px; border-radius: 4px; background-color: var(--color-canvas); border: 1px solid var(--color-border); color: var(--color-text-secondary);">
                  Active
                </span>
              </div>
              <div style="font-size: 12px; color: var(--color-text-secondary); display: flex; align-items: center; gap: 8px;">
                <span>ID #${p.id}</span>
                <span>•</span>
                <span>Created ${createdDate}</span>
              </div>
            </div>
          </div>

          <!-- Center: Environments -->
          <div style="display: flex; flex-direction: column; gap: 4px; min-width: 180px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge badge-prod">Production</span>
              <span class="badge badge-stg">Staging</span>
              <span class="badge badge-dev">Development</span>
            </div>
          </div>

          <!-- Right: Actions -->
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="btn btn-secondary btn-sm" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'variables')" style="height: 32px; padding: 0 12px; font-size: 12px; font-weight: 500; border-radius: var(--radius-md);">
              <span>Manage Keys</span>
            </button>
            <a href="#settings" onclick="window.selectProjectAndNavigate(${p.id}, '${escapeHtml(p.name)}', 'settings'); return false;" class="btn btn-ghost btn-icon" title="Project Settings" style="height: 32px; width: 32px;">
              <span class="material-symbols-outlined" style="font-size: 18px;">settings</span>
            </a>
            <button class="btn btn-ghost btn-icon" onclick="window.confirmDeleteProject(${p.id}, '${escapeHtml(p.name)}')" title="Delete Project" style="height: 32px; width: 32px; color: var(--color-error);">
              <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
            </button>
          </div>
        </article>
      `;
    }).join('');
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
