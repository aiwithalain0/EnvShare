/**
 * EnvShare Environment Variable Management View
 * Extracted from Google Stitch Project 7000277523774803089
 */

import { store } from '../store.js';
import { router } from '../router.js';
import {
  listProjects,
  listEnvironments,
  createEnvironment,
  deleteEnvironment,
  listVariables,
  createVariable,
  revealVariable,
  updateVariable,
  deleteVariable,
  getVariableHistory,
  revealVariableHistory
} from '../api.js';

export async function renderVariablesView(container) {
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
      <div class="empty-state-card">
        <div class="empty-state-icon">
          <span class="material-symbols-outlined">folder_off</span>
        </div>
        <h2 class="font-headline-md">No Project Selected</h2>
        <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 360px;">
          Please select or create a project first to manage its environment variables.
        </p>
        <button class="btn btn-primary" onclick="window.openNewProjectModal()" style="margin-top: var(--space-sm);">
          <span class="material-symbols-outlined">add</span>
          <span>Create Project</span>
        </button>
      </div>
    `;
    return;
  }

  let environments = [];
  let activeEnv = null;
  let variablesList = [];
  let revealedValues = new Map();
  let activeCategoryFilter = 'all';
  let searchTerm = '';

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <nav aria-label="Breadcrumb" style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text-secondary); font-weight: 500;">
        <a href="#projects" style="display: inline-flex; align-items: center; gap: 4px; color: var(--color-text-secondary); text-decoration: none;">
          <span class="material-symbols-outlined" style="font-size: 14px;">arrow_back</span>
          <span>Projects</span>
        </a>
        <span style="color: var(--color-border-strong);">/</span>
        <span style="color: var(--color-text-secondary);">${escapeHtml(activeProject.name)}</span>
        <span style="color: var(--color-border-strong);">/</span>
        <span id="var-active-env-name" style="font-weight: 600; color: var(--color-text-primary);">Loading...</span>
      </nav>

      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); margin-top: 6px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <h1 id="var-desc-env-name" class="font-headline-lg" style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text-primary);">Production</h1>
            <button id="var-delete-env-btn" class="btn btn-ghost btn-icon" title="Delete this environment" style="color: var(--color-error); height: 28px; width: 28px;">
              <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
            </button>
          </div>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 2px;">
            Environment variables and runtime secrets for ${escapeHtml(activeProject.name)}. Values are masked by default.
          </p>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-sm);">
          <button id="var-import-btn" class="btn btn-secondary" type="button" style="height: 36px; padding: 0 12px; font-size: 12px; font-weight: 500; border-radius: var(--radius-md);">
            <span class="material-symbols-outlined" style="font-size: 16px;">file_upload</span>
            <span>Import .env</span>
          </button>
          <button id="var-export-btn" class="btn btn-secondary" type="button" style="height: 36px; padding: 0 12px; font-size: 12px; font-weight: 500; border-radius: var(--radius-md);">
            <span class="material-symbols-outlined" style="font-size: 16px;">file_download</span>
            <span>Export</span>
          </button>
          <button id="var-invite-btn" class="btn btn-secondary" type="button" style="height: 36px; padding: 0 12px; font-size: 12px; font-weight: 500; border-radius: var(--radius-md);">
            <span class="material-symbols-outlined" style="font-size: 16px;">key</span>
            <span>Invite Code</span>
          </button>
          <button id="var-add-btn" class="btn btn-primary" type="button" style="height: 36px; padding: 0 14px; background-color: #09090b; color: #fff; font-size: 13px; font-weight: 500; border-radius: var(--radius-md);">
            <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
            <span>Add Variable</span>
          </button>
        </div>
      </div>
    </div>

    <div class="env-tab-bar" id="var-env-tabs-bar" style="margin-top: 4px;">
      <div style="padding: var(--space-sm); color: var(--color-text-secondary); font-size: 12px;">Loading environments...</div>
    </div>

    <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); padding-top: 4px;">
      <div style="position: relative; width: 100%; max-width: 380px;">
        <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 9px; font-size: 17px; color: var(--color-text-muted);">search</span>
        <input id="var-search-input" type="text" class="input-control" placeholder="Search variables..." style="padding-left: 34px; padding-right: 48px; height: 34px; font-size: 13px; border-radius: var(--radius-md);">
      </div>
      <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--color-text-secondary);">
        <span id="var-count-header" style="font-weight: 600; color: var(--color-text-primary);">0</span>
        <span>variables</span>
      </div>
    </div>

    <div class="table-surface-card">
      <div class="table-wrapper data-table-desktop">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 28%;">Variable Key</th>
              <th style="width: 38%;">Value</th>
              <th style="width: 14%;">History</th>
              <th style="width: 14%;">Updated</th>
              <th style="text-align: right; width: 6%;">Actions</th>
            </tr>
          </thead>
          <tbody id="var-table-body">
            <tr>
              <td colspan="5" style="text-align: center; padding: var(--space-xl);">
                <div class="spinner"></div>
                <div style="margin-top: var(--space-xs); color: var(--color-text-secondary);">Loading variables...</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="mobile-card-list" id="var-mobile-card-list"></div>

      <div style="padding: 10px var(--space-lg); background-color: var(--color-surface-container-lowest); border-top: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--color-text-secondary);">
        <span id="var-count-footer">Showing 0 variables</span>
      </div>
    </div>

    <div class="cli-helper-box">
      <div class="cli-helper-left">
        <div class="cli-icon-box">
          <span class="material-symbols-outlined">terminal</span>
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: var(--font-size-label-ui); font-weight: 600; color: var(--color-text-primary);">Runtime Injection</span>
          </div>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 1px;">
            Inject variables directly into your application process without saving unencrypted secrets to disk.
          </p>
        </div>
      </div>

      <div class="cli-code-pill">
        <code class="cli-code-text" id="cli-cmd-snippet">envshare run --env=production npm start</code>
        <button id="cli-copy-btn" class="btn btn-ghost btn-sm" type="button" style="padding: 2px 6px;">
          <span class="material-symbols-outlined" style="font-size: 14px;">content_copy</span>
          <span id="cli-copy-label">Copy</span>
        </button>
      </div>
    </div>
  `;

  const searchInput = document.getElementById('var-search-input');

  const handleShortcut = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
  };

  window.addEventListener('keydown', handleShortcut);

  document.getElementById('var-import-btn')?.addEventListener('click', () => {
    window.location.hash = '#import-export';
  });

  document.getElementById('var-export-btn')?.addEventListener('click', exportCurrentEnv);

  document.getElementById('var-invite-btn')?.addEventListener('click', () => {
    window.location.hash = '#team-members';
  });

  document.getElementById('var-add-btn')?.addEventListener('click', openAddVariableModal);

  document.getElementById('cli-copy-btn')?.addEventListener('click', () => {
    const text = document.getElementById('cli-cmd-snippet')?.textContent || '';

    navigator.clipboard.writeText(text).then(() => {
      const label = document.getElementById('cli-copy-label');

      if (label) {
        label.textContent = 'Copied!';
        setTimeout(() => {
          label.textContent = 'Copy';
        }, 2000);
      }
    });
  });

  async function loadEnvironments() {
    try {
      environments = await listEnvironments(activeProject.id);

      if (!environments || environments.length === 0) {
        try {
          const dev = await createEnvironment(activeProject.id, 'Development');
          const stg = await createEnvironment(activeProject.id, 'Staging');
          const prod = await createEnvironment(activeProject.id, 'Production');
          environments = [dev, stg, prod];
        } catch {
          environments = [];
        }
      }

      store.setEnvironments(environments);

      if (environments.length > 0) {
        const currentActive = store.getActiveEnvironment();

        activeEnv = (currentActive && environments.find(e => e.id === currentActive.id))
          || environments.find(e => e.name.toLowerCase() === 'development')
          || environments.find(e => e.name.toLowerCase() === 'production')
          || environments[0];

        store.setActiveEnvironment(activeEnv);
      } else {
        activeEnv = null;
        store.setActiveEnvironment(null);
      }

      renderEnvironmentTabs();

      if (activeEnv) {
        await loadVariables();
      } else {
        const tbody = document.getElementById('var-table-body');

        if (tbody) {
          tbody.innerHTML = `
            <tr>
              <td colspan="5" style="text-align: center; padding: 3rem 1rem; color: var(--color-text-secondary); font-size: 13px;">
                No environments exist in this project. Create an environment to manage variables.
              </td>
            </tr>
          `;
        }
      }
    } catch (err) {
      const tabsBar = document.getElementById('var-env-tabs-bar');

      if (tabsBar) {
        tabsBar.innerHTML = `
          <div style="color: var(--color-error); padding: var(--space-sm);">Failed to load environments: ${escapeHtml(err.message)}</div>
        `;
      }
    }
  }

  function renderEnvironmentTabs() {
    const tabsBar = document.getElementById('var-env-tabs-bar');
    if (!tabsBar) return;

    tabsBar.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px; flex-wrap: wrap;">
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          ${environments.map(env => {
      const isActive = activeEnv && activeEnv.id === env.id;

      return `
              <button class="env-tab ${isActive ? 'is-active' : ''}" data-env-id="${env.id}" type="button">
                <span>${escapeHtml(env.name)}</span>
                <span class="env-tab-count" id="tab-count-${env.id}">-</span>
              </button>
            `;
    }).join('')}

          <button id="btn-create-env-inline" class="btn btn-ghost btn-sm" type="button" title="Add new environment" style="height: 30px; font-size: 12px; padding: 0 8px;">
            <span class="material-symbols-outlined" style="font-size: 15px;">add</span>
            <span>New Env</span>
          </button>
        </div>

        ${activeEnv ? `
          <button id="btn-delete-active-env" class="btn btn-ghost btn-sm" type="button" title="Delete current environment" style="color: var(--color-error); height: 30px; font-size: 12px; padding: 0 8px; margin-left: auto;">
            <span class="material-symbols-outlined" style="font-size: 15px;">delete</span>
            <span>Delete ${escapeHtml(activeEnv.name)}</span>
          </button>
        ` : ''}
      </div>
    `;

    tabsBar.querySelectorAll('.env-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const envId = parseInt(btn.getAttribute('data-env-id'), 10);
        const selected = environments.find(e => e.id === envId);

        if (selected && selected.id !== activeEnv?.id) {
          clearAllRevealedTimers();
          activeEnv = selected;
          store.setActiveEnvironment(activeEnv);
          renderEnvironmentTabs();
          loadVariables();
        }
      });
    });

    document.getElementById('btn-create-env-inline')?.addEventListener('click', () => {
      window.openGlobalModal?.({
        title: 'Create Environment',
        bodyHtml: `
          <div style="display: flex; flex-direction: column; gap: var(--space-md);">
            <p class="font-body-sm" style="color: var(--color-text-secondary); margin: 0; line-height: 1.5;">
              Add a new deployment environment for <strong>${escapeHtml(activeProject.name)}</strong> (e.g. <code>QA</code>, <code>UAT</code>, <code>Preview</code>).
            </p>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label class="form-label" for="modal-new-env-name">Environment Name</label>
              <input id="modal-new-env-name" class="input-control font-mono" type="text" placeholder="e.g. QA" required>
            </div>
          </div>
        `,
        footerHtml: `
          <button type="button" class="btn btn-secondary" onclick="window.closeGlobalModal()">Cancel</button>
          <button id="modal-create-env-submit" type="button" class="btn btn-primary" style="background-color: #09090b; color: #fff;">
            <span>Create Environment</span>
          </button>
        `
      });

      document.getElementById('modal-create-env-submit')?.addEventListener('click', async () => {
        const input = document.getElementById('modal-new-env-name');
        const name = input ? input.value.trim() : '';

        if (!name) {
          input?.focus();
          return;
        }

        const btn = document.getElementById('modal-create-env-submit');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span> Creating...';

        try {
          const newEnv = await createEnvironment(activeProject.id, name);
          window.closeGlobalModal();
          window.showToast?.('Environment Created', `Environment "${name}" was created successfully.`, 'success');
          activeEnv = newEnv;
          store.setActiveEnvironment(activeEnv);
          await loadEnvironments();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = 'Create Environment';
          window.showToast?.('Creation Failed', err.message, 'error');
        }
      });
    });

    document.getElementById('btn-delete-active-env')?.addEventListener('click', () => {
      if (!activeEnv) return;

      const targetEnv = activeEnv;

      window.openConfirmationModal?.({
        title: `Delete Environment: ${targetEnv.name}`,
        message: `Are you sure you want to permanently delete the <strong>${escapeHtml(targetEnv.name)}</strong> environment? All variables within this environment will be deleted. Audit history will be retained.`,
        confirmText: 'Delete Environment',
        isDanger: true,
        onConfirm: async () => {
          await deleteEnvironment(activeProject.id, targetEnv.id);
          clearAllRevealedTimers();
          window.showToast?.('Environment Deleted', `Environment "${targetEnv.name}" was deleted successfully.`, 'success');
          activeEnv = null;
          store.setActiveEnvironment(null);
          await loadEnvironments();
        }
      });
    });

    const headerName = document.getElementById('var-active-env-name');
    const headerBadge = document.getElementById('var-env-header-badge');
    const descEnvName = document.getElementById('var-desc-env-name');

    if (headerName && activeEnv) {
      headerName.textContent = activeEnv.name;

      if (headerBadge) {
        headerBadge.className = activeEnv.name.toLowerCase().includes('prod')
          ? 'badge badge-prod'
          : activeEnv.name.toLowerCase().includes('stg')
            ? 'badge badge-stg'
            : 'badge badge-dev';
      }
    }

    if (descEnvName && activeEnv) {
      descEnvName.textContent = activeEnv.name;
    }

    const snippet = document.getElementById('cli-cmd-snippet');

    if (snippet && activeEnv) {
      snippet.textContent = `envshare run --env=${activeEnv.name.toLowerCase()} npm start`;
    }
  }

  async function loadVariables() {
    if (!activeEnv) return;

    const tbody = document.getElementById('var-table-body');

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-xl);">
            <div class="spinner"></div>
            <div style="margin-top: var(--space-xs); color: var(--color-text-secondary);">Loading variables...</div>
          </td>
        </tr>
      `;
    }

    try {
      variablesList = await listVariables(activeProject.id, activeEnv.id);
      store.setVariables(variablesList);

      const countPill = document.getElementById(`tab-count-${activeEnv.id}`);
      if (countPill) countPill.textContent = variablesList.length;

      const countHeader = document.getElementById('var-count-header');
      if (countHeader) countHeader.textContent = variablesList.length;

      const footerEl = document.getElementById('var-count-footer');
      if (footerEl) footerEl.textContent = `Showing ${variablesList.length} of ${variablesList.length} variables`;

      renderVariablesTable();
    } catch (err) {
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; padding: var(--space-xl); color: var(--color-error);">
              Failed to load variables: ${escapeHtml(err.message)}
            </td>
          </tr>
        `;
      }
    }
  }

  function renderVariablesTable() {
    const tbody = document.getElementById('var-table-body');
    const mobileList = document.getElementById('var-mobile-card-list');

    if (!tbody || !mobileList) return;

    let filtered = variablesList;

    if (searchTerm) {
      filtered = filtered.filter(v => v.key.toLowerCase().includes(searchTerm));
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-2xl);">
            <div class="empty-state-card" style="border: none; padding: 0;">
              <div class="empty-state-icon">
                <span class="material-symbols-outlined">key_off</span>
              </div>
              <h3 class="font-headline-sm">No Variables Found</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 320px;">
                ${searchTerm ? 'No variables matched your search filter.' : 'Add your first secret or import a .env file into this environment.'}
              </p>
              ${!searchTerm ? `
                <button class="btn btn-primary" onclick="window.openAddVariableDialog()" style="margin-top: var(--space-sm);">
                  <span class="material-symbols-outlined">add</span>
                  <span>Add Variable</span>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;

      mobileList.innerHTML = `
        <div style="text-align: center; padding: var(--space-lg); color: var(--color-text-secondary);">
          No variables in this view.
        </div>
      `;

      return;
    }

    tbody.innerHTML = filtered.map(v => {
      const isRevealed = revealedValues.has(v.id);
      const revealedData = isRevealed ? revealedValues.get(v.id) : null;
      const isSensitive = v.is_sensitive !== false;

      const classificationBadge = isSensitive
        ? '<span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary); font-size: 10px;">Sensitive</span>'
        : '<span class="badge badge-code" style="background-color: var(--color-dev-bg); color: var(--color-dev-text); border: 1px solid var(--color-dev-border); font-size: 10px;">Plaintext</span>';

      return `
        <tr class="${isRevealed ? 'bg-stg-tint' : ''}">
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="font-label-code-md" style="font-weight: 600; color: var(--color-primary);">${escapeHtml(v.key)}</span>
              ${classificationBadge}
            </div>
          </td>
          <td>
            <div class="secret-cell">
              ${isRevealed ? `
                <span class="secret-revealed-value">${escapeHtml(revealedData.value)}</span>
                <span class="auto-mask-countdown" id="countdown-${v.id}">
                  <span class="material-symbols-outlined" style="font-size: 12px;">timer</span>
                  Auto-masks in ${revealedData.secondsLeft}s
                </span>
                <button class="btn btn-ghost btn-sm btn-icon" title="Mask value now" onclick="window.maskVariableNow(${v.id})">
                  <span class="material-symbols-outlined" style="font-size: 16px;">visibility_off</span>
                </button>
              ` : `
                <span class="secret-dots">••••••••••••••••••••</span>
                <button class="btn btn-ghost btn-sm btn-icon" title="Reveal value for 30s" onclick="window.revealVariableForTimer(${v.id}, '${escapeHtml(v.key)}')">
                  <span class="material-symbols-outlined" style="font-size: 16px;">visibility</span>
                </button>
              `}
              <button class="btn btn-ghost btn-sm btn-icon" title="Copy to clipboard" onclick="window.copyVariableSecret(${v.id}, '${escapeHtml(v.key)}')">
                <span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>
              </button>
            </div>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="window.openVariableHistoryModal(${v.id}, '${escapeHtml(v.key)}')">
              <span class="material-symbols-outlined" style="font-size: 14px;">history</span>
              <span>History</span>
            </button>
          </td>
          <td>
            <div style="font-size: 12px; color: var(--color-text-secondary);">
              ${new Date(v.updated_at || v.created_at || Date.now()).toLocaleDateString()}
            </div>
          </td>
          <td style="text-align: right;">
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
              <button class="btn btn-ghost btn-sm btn-icon" title="Edit variable" onclick="window.openEditVariableModal(${v.id}, '${escapeHtml(v.key)}')">
                <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
              </button>
              <button class="btn btn-ghost btn-sm btn-icon" title="Delete variable" style="color: var(--color-error);" onclick="window.confirmDeleteVariable(${v.id}, '${escapeHtml(v.key)}')">
                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    mobileList.innerHTML = filtered.map(v => {
      const isRevealed = revealedValues.has(v.id);
      const revealedData = isRevealed ? revealedValues.get(v.id) : null;

      const classificationBadge = v.is_sensitive !== false
        ? '<span class="badge badge-code" style="background-color: var(--color-surface-container); font-size: 10px;">Sensitive</span>'
        : '<span class="badge badge-code" style="background-color: var(--color-dev-bg); color: var(--color-dev-text); border: 1px solid var(--color-dev-border); font-size: 10px;">Plaintext</span>';

      return `
        <div class="mobile-data-card ${isRevealed ? 'bg-stg-tint' : ''}">
          <div class="mobile-data-card-header">
            <span class="font-label-code-md" style="font-weight: 700; color: var(--color-primary);">${escapeHtml(v.key)}</span>
            ${classificationBadge}
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--color-surface-container-lowest); border: 1px solid var(--color-border); padding: 8px 12px; border-radius: var(--radius-sm);">
            ${isRevealed ? `
              <span class="font-label-code-sm" style="color: var(--color-stg-text); font-weight: 600;">${escapeHtml(revealedData.value)}</span>
              <button class="btn btn-ghost btn-sm" onclick="window.maskVariableNow(${v.id})">
                <span class="material-symbols-outlined" style="font-size: 16px;">visibility_off</span>
              </button>
            ` : `
              <span style="letter-spacing: 0.15em; font-size: 12px; color: var(--color-text-muted);">••••••••••••••••••••</span>
              <button class="btn btn-ghost btn-sm" onclick="window.revealVariableForTimer(${v.id}, '${escapeHtml(v.key)}')">
                <span class="material-symbols-outlined" style="font-size: 16px;">visibility</span>
              </button>
            `}
            <button class="btn btn-ghost btn-sm" onclick="window.copyVariableSecret(${v.id}, '${escapeHtml(v.key)}')">
              <span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>
            </button>
          </div>

          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--color-text-secondary);">
            <span>Updated ${new Date(v.updated_at || v.created_at || Date.now()).toLocaleDateString()}</span>
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-ghost btn-sm" onclick="window.openVariableHistoryModal(${v.id}, '${escapeHtml(v.key)}')">History</button>
              <button class="btn btn-ghost btn-sm" onclick="window.openEditVariableModal(${v.id}, '${escapeHtml(v.key)}')">Edit</button>
              <button class="btn btn-ghost btn-sm" style="color: var(--color-error);" onclick="window.confirmDeleteVariable(${v.id}, '${escapeHtml(v.key)}')">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  window.revealVariableForTimer = async function (varId, key) {
    try {
      const res = await revealVariable(activeProject.id, activeEnv.id, varId);

      if (revealedValues.has(varId)) {
        clearInterval(revealedValues.get(varId).timerId);
      }

      let secondsLeft = 30;

      const timerId = setInterval(() => {
        secondsLeft -= 1;

        if (secondsLeft <= 0) {
          clearInterval(timerId);
          revealedValues.delete(varId);
          renderVariablesTable();
        } else {
          const entry = revealedValues.get(varId);

          if (entry) {
            entry.secondsLeft = secondsLeft;

            const el = document.getElementById(`countdown-${varId}`);

            if (el) {
              el.innerHTML = `<span class="material-symbols-outlined" style="font-size: 12px;">timer</span> Auto-masks in ${secondsLeft}s`;
            }
          }
        }
      }, 1000);

      revealedValues.set(varId, {
        value: res.value,
        timerId,
        secondsLeft
      });

      renderVariablesTable();
    } catch (err) {
      window.showToast?.('Reveal Failed', err.message, 'error');
    }
  };

  window.maskVariableNow = function (varId) {
    const entry = revealedValues.get(varId);

    if (entry) {
      clearInterval(entry.timerId);
      revealedValues.delete(varId);
      renderVariablesTable();
    }
  };

  window.copyVariableSecret = async function (varId, key) {
    try {
      let valToCopy = '';

      if (revealedValues.has(varId)) {
        valToCopy = revealedValues.get(varId).value;
      } else {
        const res = await revealVariable(activeProject.id, activeEnv.id, varId);
        valToCopy = res.value;
      }

      await navigator.clipboard.writeText(valToCopy);
      window.showToast?.('Copied to Clipboard', `Value for ${key} copied securely.`, 'success');
    } catch (err) {
      window.showToast?.('Copy Failed', 'Could not access clipboard: ' + err.message, 'error');
    }
  };

  function clearAllRevealedTimers() {
    revealedValues.forEach(entry => clearInterval(entry.timerId));
    revealedValues.clear();
  }

  async function exportCurrentEnv() {
    if (!activeEnv || variablesList.length === 0) {
      window.showToast?.('Export Unavailable', 'No variables found to export in this environment.', 'warning');
      return;
    }

    try {
      window.showToast?.('Exporting .env', 'Decrypting environment variables securely...', 'info');

      const lines = [];

      for (const v of variablesList) {
        try {
          const res = await revealVariable(activeProject.id, activeEnv.id, v.id);
          lines.push(`${v.key}=${res.value}`);
        } catch {
          lines.push(`${v.key}=`);
        }
      }

      const content = lines.join('\n') + '\n';
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = `.env.${activeEnv.name.toLowerCase()}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      window.showToast?.('Export Complete', `Saved .env.${activeEnv.name.toLowerCase()}`, 'success');
    } catch (err) {
      window.showToast?.('Export Failed', err.message, 'error');
    }
  }

  function openAddVariableModal() {
    const backdrop = document.getElementById('global-modal-backdrop');
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    if (!backdrop) return;

    title.textContent = `Add Variable to ${activeEnv.name}`;

    body.innerHTML = `
      <form id="add-var-form" style="display: flex; flex-direction: column; gap: var(--space-md);">
        <div class="form-group">
          <label class="form-label" for="add-var-key">
            <span>Variable Key (Name)</span>
            <span style="color: var(--color-error);">*</span>
          </label>
          <input id="add-var-key" type="text" class="input-control font-mono" placeholder="DATABASE_URL" required>
          <span style="font-size: 11px; color: var(--color-text-muted);">Must contain only letters, numbers, and underscores (e.g. STRIPE_API_KEY).</span>
        </div>

        <div class="form-group">
          <label class="form-label" for="add-var-val">
            <span>Variable Value</span>
            <span style="color: var(--color-error);">*</span>
          </label>
          <textarea id="add-var-val" class="input-control font-mono" placeholder="Enter variable value..." required></textarea>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <input id="add-var-sensitive" type="checkbox" checked style="accent-color: var(--color-primary);">
          <label for="add-var-sensitive" style="font-size: 12px; color: var(--color-text-primary); cursor: pointer;">
            Mask and encrypt as sensitive secret (Recommended)
          </label>
        </div>
      </form>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.closeGlobalModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-submit-add-var">
        <span class="material-symbols-outlined">save</span>
        <span>Save Variable</span>
      </button>
    `;

    document.getElementById('btn-submit-add-var').addEventListener('click', async () => {
      const key = document.getElementById('add-var-key').value.trim();
      const val = document.getElementById('add-var-val').value;
      const isSensitive = document.getElementById('add-var-sensitive').checked;

      if (!key) {
        window.showToast?.('Validation Error', 'Key name is required.', 'error');
        return;
      }

      try {
        await createVariable(activeProject.id, activeEnv.id, key, val, isSensitive);
        window.closeGlobalModal();
        window.showToast?.('Variable Created', `${key} saved.`, 'success');
        await loadVariables();
      } catch (err) {
        window.showToast?.('Creation Failed', err.message, 'error');
      }
    });

    window.openGlobalModal();
  }

  window.openAddVariableDialog = openAddVariableModal;

  window.openEditVariableModal = function (varId, key) {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    const targetVar = variablesList.find(v => v.id === varId);
    const isSensitive = targetVar ? targetVar.is_sensitive !== false : true;

    title.textContent = `Edit Variable: ${key}`;

    body.innerHTML = `
      <form id="edit-var-form" style="display: flex; flex-direction: column; gap: var(--space-md);">
        <div class="form-group">
          <label class="form-label">Variable Key</label>
          <input type="text" class="input-control font-mono" value="${escapeHtml(key)}" disabled style="opacity: 0.7;">
        </div>

        <div class="form-group">
          <label class="form-label" for="edit-var-val">New Value</label>
          <textarea id="edit-var-val" class="input-control font-mono" placeholder="Enter updated value..." required></textarea>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <input id="edit-var-sensitive" type="checkbox" ${isSensitive ? 'checked' : ''} style="accent-color: var(--color-primary);">
          <label for="edit-var-sensitive" style="font-size: 12px; color: var(--color-text-primary); cursor: pointer;">
            Mask and encrypt as sensitive secret
          </label>
        </div>
      </form>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.closeGlobalModal()">Cancel</button>
      <button class="btn btn-primary" id="btn-submit-edit-var">
        <span class="material-symbols-outlined">save</span>
        <span>Update Value</span>
      </button>
    `;

    document.getElementById('btn-submit-edit-var').addEventListener('click', async () => {
      const val = document.getElementById('edit-var-val').value;
      const isSensitive = document.getElementById('edit-var-sensitive').checked;

      try {
        await updateVariable(activeProject.id, activeEnv.id, varId, val, isSensitive);
        window.closeGlobalModal();
        window.showToast?.('Variable Updated', `${key} updated successfully.`, 'success');
        await loadVariables();
      } catch (err) {
        window.showToast?.('Update Failed', err.message, 'error');
      }
    });

    window.openGlobalModal();
  };

  window.confirmDeleteVariable = function (varId, key) {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    title.textContent = 'Delete Variable';

    body.innerHTML = `
      <p class="font-body-md" style="color: var(--color-text-primary);">
        Are you sure you want to delete <strong class="font-label-code-md">${escapeHtml(key)}</strong> from <strong>${escapeHtml(activeEnv.name)}</strong>?
      </p>
      <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: var(--space-xs);">
        This action soft-deletes the key and will be recorded in the project audit log.
      </p>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.closeGlobalModal()">Cancel</button>
      <button class="btn btn-danger" id="btn-confirm-delete-var">
        <span class="material-symbols-outlined">delete</span>
        <span>Delete Variable</span>
      </button>
    `;

    document.getElementById('btn-confirm-delete-var').addEventListener('click', async () => {
      try {
        await deleteVariable(activeProject.id, activeEnv.id, varId);
        window.closeGlobalModal();
        window.showToast?.('Variable Deleted', `${key} was deleted.`, 'info');
        await loadVariables();
      } catch (err) {
        window.showToast?.('Delete Failed', err.message, 'error');
      }
    });

    window.openGlobalModal();
  };

  // Variable Version History Modal
  window.openVariableHistoryModal = async function (varId, key) {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    // Values revealed in this modal are kept only in this in-memory map.
    const revealedHistoryValues = new Map();
    const historyTimers = new Map();

    function maskHistoricalValue(versionId) {
      const timerId = historyTimers.get(versionId);

      if (timerId) clearInterval(timerId);

      historyTimers.delete(versionId);
      revealedHistoryValues.delete(versionId);

      const valueElement = body.querySelector(`#history-value-${versionId}`);
      const actionButton = body.querySelector(`#history-reveal-${versionId}`);

      if (valueElement) {
        valueElement.textContent = '••••••••••••••••••••';
        valueElement.style.display = 'none';
      }

      if (actionButton) {
        actionButton.disabled = false;
        actionButton.textContent = 'Reveal historical value';
      }
    }

    title.textContent = `Version History: ${key}`;

    body.innerHTML = `
      <div style="text-align: center; padding: var(--space-lg);">
        <div class="spinner"></div>
        <div style="margin-top: 8px; color: var(--color-text-secondary);">Loading revisions...</div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="window.closeGlobalModal()">Close</button>
    `;

    window.openGlobalModal();

    try {
      const history = await getVariableHistory(activeProject.id, activeEnv.id, varId);

      if (!history || history.length === 0) {
        body.innerHTML = `
          <p style="color: var(--color-text-secondary); padding: var(--space-md);">
            No revision history available.
          </p>
        `;
        return;
      }

      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
          ${history.map((rev, idx) => `
            <div style="padding: var(--space-sm) var(--space-md); background: var(--color-surface-container-low); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                <div>
                  <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                    <span class="badge badge-code" style="background-color: var(--color-primary-container); color: #FFF;">v${history.length - idx}</span>
                    <span class="font-label-code-sm" style="color: var(--color-text-primary);">Revision #${Number(rev.version_id)}</span>
                  </div>
                  <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                    Changed by User #${escapeHtml(rev.changed_by)} on ${escapeHtml(new Date(rev.changed_at).toLocaleString())}
                  </div>
                </div>
                <span class="badge badge-code" style="background: var(--color-surface-container); color: var(--color-text-muted); font-size: 10px;">Audit Logged</span>
              </div>

              <div style="margin-top: 10px;">
                <button
                  class="btn btn-secondary btn-sm"
                  type="button"
                  id="history-reveal-${Number(rev.version_id)}"
                  data-version-id="${Number(rev.version_id)}"
                >Reveal historical value</button>

                <div
                  id="history-value-${Number(rev.version_id)}"
                  class="font-label-code-sm"
                  style="display: none; margin-top: 8px; padding: 10px; overflow-wrap: anywhere; white-space: pre-wrap; background: var(--color-surface-container); border-radius: var(--radius-sm);"
                >••••••••••••••••••••</div>

                <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 5px;">
                  Revealing this value is recorded in the audit log. It will automatically be hidden after 30 seconds.
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      history.forEach(rev => {
        const versionId = Number(rev.version_id);
        const actionButton = body.querySelector(`#history-reveal-${versionId}`);
        const valueElement = body.querySelector(`#history-value-${versionId}`);

        actionButton?.addEventListener('click', async () => {
          if (revealedHistoryValues.has(versionId)) {
            maskHistoricalValue(versionId);
            return;
          }

          actionButton.disabled = true;
          actionButton.textContent = 'Revealing...';

          try {
            const result = await revealVariableHistory(
              activeProject.id,
              activeEnv.id,
              varId,
              versionId
            );

            // Do not render the historical plaintext until the explicit reveal succeeds.
            revealedHistoryValues.set(versionId, result.value);
            valueElement.textContent = result.value;
            valueElement.style.display = 'block';

            let secondsLeft = 30;
            actionButton.disabled = false;
            actionButton.textContent = `Hide value (${secondsLeft}s)`;

            const timerId = setInterval(() => {
              secondsLeft -= 1;

              if (secondsLeft <= 0) {
                maskHistoricalValue(versionId);
              } else if (revealedHistoryValues.has(versionId)) {
                actionButton.textContent = `Hide value (${secondsLeft}s)`;
              }
            }, 1000);

            historyTimers.set(versionId, timerId);

            actionButton.onclick = () => maskHistoricalValue(versionId);
          } catch (err) {
            actionButton.disabled = false;
            actionButton.textContent = 'Reveal historical value';
            window.showToast?.('History Reveal Failed', err.message, 'error');
          }
        });
      });
    } catch (err) {
      body.innerHTML = `
        <p style="color: var(--color-error); padding: var(--space-md);">
          Failed to load history: ${escapeHtml(err.message)}
        </p>
      `;
    }
  };

  searchInput?.addEventListener('input', e => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderVariablesTable();
  });

  loadEnvironments();
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';

  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
