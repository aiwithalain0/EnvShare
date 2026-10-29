
/**
 * EnvShare Environment Variable Management View
 */

import { store } from '../store.js';
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
  revealVariableHistory,
} from '../api.js';

export async function renderVariablesView(container) {
  const state = store.getState();
  let projects = state.projects.list || [];
  let activeProject = state.projects.activeProject;

  if (!projects.length) {
    try {
      projects = await listProjects();
      store.setProjects(projects);
    } catch {
      projects = [];
    }
  }

  if (!activeProject && projects.length) {
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
        <p class="font-body-sm" style="color:var(--color-text-secondary);max-width:360px">
          Please select or create a project first to manage its environment variables.
        </p>
        <button class="btn btn-primary" onclick="window.openNewProjectModal()" style="margin-top:var(--space-sm)">
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
  const revealedValues = new Map();
  let searchTerm = '';

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:var(--space-xs)">
      <nav aria-label="Breadcrumb" style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text-secondary);font-weight:500">
        <a href="#projects" style="display:inline-flex;align-items:center;gap:4px;color:var(--color-text-secondary);text-decoration:none">
          <span class="material-symbols-outlined" style="font-size:14px">arrow_back</span>
          <span>Projects</span>
        </a>
        <span>/</span>
        <span>${escapeHtml(activeProject.name)}</span>
        <span>/</span>
        <span id="var-active-env-name">Loading...</span>
      </nav>

      <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-md);margin-top:6px">
        <div>
          <div style="display:flex;align-items:center;gap:8px">
            <h1 id="var-desc-env-name" class="font-headline-lg" style="margin:0;font-size:24px;font-weight:600;color:var(--color-text-primary)">Environment Variables</h1>
            <button id="var-delete-env-btn" class="btn btn-ghost btn-icon" title="Delete environment" style="color:var(--color-error);height:28px;width:28px">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>
          <p class="font-body-sm" style="color:var(--color-text-secondary);margin-top:2px">
            Environment variables and runtime secrets for ${escapeHtml(activeProject.name)}. Values are masked by default.
          </p>
        </div>

        <div style="display:flex;align-items:center;gap:var(--space-sm);flex-wrap:wrap">
          <button id="var-import-btn" class="btn btn-secondary" type="button">
            <span class="material-symbols-outlined">file_upload</span>
            <span>Import .env</span>
          </button>
          <button id="var-export-btn" class="btn btn-secondary" type="button">
            <span class="material-symbols-outlined">file_download</span>
            <span>Export</span>
          </button>
          <button id="var-invite-btn" class="btn btn-secondary" type="button">
            <span class="material-symbols-outlined">key</span>
            <span>Invite Code</span>
          </button>
          <button id="var-add-btn" class="btn btn-primary" type="button">
            <span class="material-symbols-outlined">add</span>
            <span>Add Variable</span>
          </button>
        </div>
      </div>
    </div>

    <div class="env-tab-bar" id="var-env-tabs-bar" style="margin-top:4px">
      <div style="padding:var(--space-sm);color:var(--color-text-secondary)">Loading environments...</div>
    </div>

    <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-md);padding-top:4px">
      <div style="position:relative;width:100%;max-width:380px">
        <span class="material-symbols-outlined" style="position:absolute;left:10px;top:9px;font-size:17px;color:var(--color-text-muted)">search</span>
        <input id="var-search-input" type="text" class="input-control" placeholder="Search variables..." style="padding-left:34px;height:34px;font-size:13px">
      </div>
      <div style="font-size:12px;color:var(--color-text-secondary)">
        <strong id="var-count-header">0</strong> variables
      </div>
    </div>

    <div class="table-surface-card">
      <div class="table-wrapper data-table-desktop">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width:28%">Variable Key</th>
              <th style="width:38%">Value</th>
              <th style="width:14%">History</th>
              <th style="width:14%">Updated</th>
              <th style="text-align:right;width:6%">Actions</th>
            </tr>
          </thead>
          <tbody id="var-table-body">
            <tr><td colspan="5" style="text-align:center;padding:var(--space-xl)">Loading variables...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="mobile-card-list" id="var-mobile-card-list"></div>
      <div style="padding:10px var(--space-lg);border-top:1px solid var(--color-border);display:flex;justify-content:space-between;font-size:12px;color:var(--color-text-secondary)">
        <span id="var-count-footer">Showing 0 variables</span>
      </div>
    </div>

    <div class="cli-helper-box">
      <div class="cli-helper-left">
        <div class="cli-icon-box"><span class="material-symbols-outlined">terminal</span></div>
        <div>
          <strong>Runtime Injection</strong>
          <p class="font-body-sm" style="color:var(--color-text-secondary);margin-top:1px">
            Inject variables into your application process without saving unencrypted secrets to disk.
          </p>
        </div>
      </div>
      <div class="cli-code-pill">
        <code class="cli-code-text" id="cli-cmd-snippet">envshare run --env=development npm start</code>
        <button id="cli-copy-btn" class="btn btn-ghost btn-sm" type="button">
          <span class="material-symbols-outlined">content_copy</span>
          <span id="cli-copy-label">Copy</span>
        </button>
      </div>
    </div>
  `;

  const searchInput = document.getElementById('var-search-input');

  const handleShortcut = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
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

  document.getElementById('cli-copy-btn')?.addEventListener('click', async () => {
    const text = document.getElementById('cli-cmd-snippet')?.textContent || '';

    try {
      await navigator.clipboard.writeText(text);
      const label = document.getElementById('cli-copy-label');

      if (label) {
        label.textContent = 'Copied!';
        setTimeout(() => {
          label.textContent = 'Copy';
        }, 2000);
      }
    } catch (error) {
      window.showToast?.('Copy Failed', error.message, 'error');
    }
  });

  document.getElementById('var-delete-env-btn')?.addEventListener('click', deleteActiveEnvironment);

  async function loadEnvironments() {
    try {
      environments = await listEnvironments(activeProject.id);

      store.setEnvironments(environments);

      if (environments.length) {
        const storedEnvironment = store.getActiveEnvironment();

        activeEnv =
          environments.find(env => storedEnvironment && env.id === storedEnvironment.id) ||
          environments.find(env => env.name?.toLowerCase() === 'development') ||
          environments.find(env => env.name?.toLowerCase() === 'production') ||
          environments[0];

        store.setActiveEnvironment(activeEnv);
      } else {
        activeEnv = null;
        store.setActiveEnvironment(null);
      }

      renderEnvironmentTabs();

      if (activeEnv) {
        await loadVariables();
      } else {
        renderNoEnvironment();
      }
    } catch (error) {
      const tabsBar = document.getElementById('var-env-tabs-bar');

      if (tabsBar) {
        tabsBar.innerHTML = `
          <div style="color:var(--color-error);padding:var(--space-sm)">
            Failed to load environments: ${escapeHtml(error.message)}
          </div>
        `;
      }
    }
  }

  function renderNoEnvironment() {
    const tbody = document.getElementById('var-table-body');

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center;padding:3rem 1rem;color:var(--color-text-secondary)">
            No environments exist in this project. Create an environment to manage variables.
          </td>
        </tr>
      `;
    }

    const mobileList = document.getElementById('var-mobile-card-list');
    if (mobileList) mobileList.innerHTML = '';
  }

  function renderEnvironmentTabs() {
    const tabsBar = document.getElementById('var-env-tabs-bar');
    if (!tabsBar) return;

    tabsBar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          ${environments.map(env => `
            <button class="env-tab ${activeEnv?.id === env.id ? 'is-active' : ''}" data-env-id="${env.id}" type="button">
              <span>${escapeHtml(env.name)}</span>
              <span class="env-tab-count" id="tab-count-${env.id}">-</span>
            </button>
          `).join('')}
          <button id="btn-create-env-inline" class="btn btn-ghost btn-sm" type="button">
            <span class="material-symbols-outlined">add</span>
            <span>New Env</span>
          </button>
        </div>
        ${activeEnv ? `
          <button id="btn-delete-active-env" class="btn btn-ghost btn-sm" type="button" style="color:var(--color-error)">
            <span class="material-symbols-outlined">delete</span>
            <span>Delete ${escapeHtml(activeEnv.name)}</span>
          </button>
        ` : ''}
      </div>
    `;

    tabsBar.querySelectorAll('.env-tab').forEach(button => {
      button.addEventListener('click', async () => {
        const envId = Number(button.dataset.envId);
        const selected = environments.find(env => env.id === envId);

        if (selected && selected.id !== activeEnv?.id) {
          clearAllRevealedTimers();
          activeEnv = selected;
          store.setActiveEnvironment(activeEnv);
          renderEnvironmentTabs();
          await loadVariables();
        }
      });
    });

    document.getElementById('btn-create-env-inline')?.addEventListener('click', openCreateEnvironmentModal);
    document.getElementById('btn-delete-active-env')?.addEventListener('click', deleteActiveEnvironment);

    const headerName = document.getElementById('var-active-env-name');
    const descName = document.getElementById('var-desc-env-name');
    const snippet = document.getElementById('cli-cmd-snippet');

    if (headerName && activeEnv) headerName.textContent = activeEnv.name;
    if (descName && activeEnv) descName.textContent = activeEnv.name;

    if (snippet && activeEnv) {
      snippet.textContent = `envshare run --env=${activeEnv.name.toLowerCase()} npm start`;
    }
  }

  function openCreateEnvironmentModal() {
    window.openGlobalModal?.({
      title: 'Create Environment',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:var(--space-md)">
          <p style="color:var(--color-text-secondary)">
            Add a deployment environment for <strong>${escapeHtml(activeProject.name)}</strong>.
          </p>
          <label class="form-label" for="modal-new-env-name">Environment Name</label>
          <input id="modal-new-env-name" class="input-control" type="text" placeholder="e.g. QA" required>
        </div>
      `,
      footerHtml: `
        <button type="button" class="btn btn-secondary" onclick="window.closeGlobalModal()">Cancel</button>
        <button id="modal-create-env-submit" type="button" class="btn btn-primary">Create Environment</button>
      `,
    });

    document.getElementById('modal-create-env-submit')?.addEventListener('click', async () => {
      const input = document.getElementById('modal-new-env-name');
      const name = input?.value.trim();

      if (!name) {
        input?.focus();
        return;
      }

      const button = document.getElementById('modal-create-env-submit');
      button.disabled = true;
      button.textContent = 'Creating...';

      try {
        const newEnv = await createEnvironment(activeProject.id, { name });

        window.closeGlobalModal();
        window.showToast?.('Environment Created', `Environment "${name}" was created.`, 'success');

        environments.push(newEnv);
        activeEnv = newEnv;
        store.setActiveEnvironment(activeEnv);
        await loadEnvironments();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Create Environment';
        window.showToast?.('Creation Failed', error.message, 'error');
      }
    });
  }

  async function deleteActiveEnvironment() {
    if (!activeEnv) return;

    const targetEnv = activeEnv;

    window.openConfirmationModal?.({
      title: `Delete Environment: ${targetEnv.name}`,
      message: `Permanently delete <strong>${escapeHtml(targetEnv.name)}</strong> and its variables?`,
      confirmText: 'Delete Environment',
      isDanger: true,
      onConfirm: async () => {
        try {
          await deleteEnvironment(activeProject.id, targetEnv.id);
          clearAllRevealedTimers();

          window.showToast?.('Environment Deleted', `"${targetEnv.name}" was deleted.`, 'success');

          activeEnv = null;
          store.setActiveEnvironment(null);
          await loadEnvironments();
        } catch (error) {
          window.showToast?.('Delete Failed', error.message, 'error');
        }
      },
    });
  }

  async function loadVariables() {
    if (!activeEnv) {
      renderNoEnvironment();
      return;
    }

    const tbody = document.getElementById('var-table-body');

    if (tbody) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="text-align:center;padding:var(--space-xl)">
          <div class="spinner"></div>
          <div style="margin-top:var(--space-xs);color:var(--color-text-secondary)">Loading variables...</div>
        </td></tr>
      `;
    }

    try {
      variablesList = await listVariables(activeProject.id, activeEnv.id);
      store.setVariables(variablesList);

      const count = variablesList.length;
      const tabCount = document.getElementById(`tab-count-${activeEnv.id}`);
      const headerCount = document.getElementById('var-count-header');
      const footerCount = document.getElementById('var-count-footer');

      if (tabCount) tabCount.textContent = count;
      if (headerCount) headerCount.textContent = count;
      if (footerCount) footerCount.textContent = `Showing ${count} of ${count} variables`;

      renderVariablesTable();
    } catch (error) {
      if (tbody) {
        tbody.innerHTML = `
          <tr><td colspan="5" style="text-align:center;padding:var(--space-xl);color:var(--color-error)">
            Failed to load variables: ${escapeHtml(error.message)}
          </td></tr>
        `;
      }
    }
  }

  function renderVariablesTable() {
    const tbody = document.getElementById('var-table-body');
    const mobileList = document.getElementById('var-mobile-card-list');

    if (!tbody || !mobileList) return;

    const filtered = variablesList.filter(variable =>
      variable.key.toLowerCase().includes(searchTerm)
    );

    if (!filtered.length) {
      tbody.innerHTML = `
        <tr><td colspan="5" style="text-align:center;padding:var(--space-2xl)">
          <div class="empty-state-card" style="border:none;padding:0">
            <div class="empty-state-icon"><span class="material-symbols-outlined">key_off</span></div>
            <h3 class="font-headline-sm">No Variables Found</h3>
            <p class="font-body-sm" style="color:var(--color-text-secondary)">
              ${searchTerm ? 'No variables matched your search.' : 'Add a variable or import a .env file.'}
            </p>
            ${!searchTerm ? `
              <button class="btn btn-primary" id="empty-add-variable" style="margin-top:var(--space-sm)">
                <span class="material-symbols-outlined">add</span> Add Variable
              </button>
            ` : ''}
          </div>
        </td></tr>
      `;

      mobileList.innerHTML = `
        <div style="text-align:center;padding:var(--space-lg);color:var(--color-text-secondary)">
          No variables in this view.
        </div>
      `;

      document.getElementById('empty-add-variable')?.addEventListener('click', openAddVariableModal);
      return;
    }

    tbody.innerHTML = filtered.map(variable => {
      const isRevealed = revealedValues.has(variable.id);
      const revealed = isRevealed ? revealedValues.get(variable.id) : null;
      const isSensitive = variable.is_sensitive !== false;
      const key = escapeHtml(variable.key);
      const badge = isSensitive
        ? '<span class="badge badge-code">Sensitive</span>'
        : '<span class="badge badge-code">Plaintext</span>';

      return `
        <tr class="${isRevealed ? 'bg-stg-tint' : ''}">
          <td><div style="display:flex;align-items:center;gap:8px">
            <span class="font-label-code-md" style="font-weight:600;color:var(--color-primary)">${key}</span>${badge}
          </div></td>
          <td><div class="secret-cell">
            ${isRevealed ? `
              <span class="secret-revealed-value">${escapeHtml(revealed.value)}</span>
              <span class="auto-mask-countdown" id="countdown-${variable.id}">Auto-masks in ${revealed.secondsLeft}s</span>
              <button class="btn btn-ghost btn-sm btn-icon" title="Mask value" data-action="mask" data-id="${variable.id}">◉</button>
            ` : `
              <span class="secret-dots">••••••••••••••••••••</span>
              <button class="btn btn-ghost btn-sm btn-icon" title="Reveal value" data-action="reveal" data-id="${variable.id}">◉</button>
            `}
            <button class="btn btn-ghost btn-sm btn-icon" title="Copy value" data-action="copy" data-id="${variable.id}">▣</button>
          </div></td>
          <td><button class="btn btn-secondary btn-sm" data-action="history" data-id="${variable.id}">History</button></td>
          <td><div style="font-size:12px;color:var(--color-text-secondary)">${formatDate(variable.updated_at || variable.created_at)}</div></td>
          <td style="text-align:right"><div style="display:flex;justify-content:flex-end;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" title="Edit" data-action="edit" data-id="${variable.id}">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Delete" data-action="delete" data-id="${variable.id}">⌫</button>
          </div></td>
        </tr>
      `;
    }).join('');

    mobileList.innerHTML = filtered.map(variable => {
      const isRevealed = revealedValues.has(variable.id);
      const revealed = isRevealed ? revealedValues.get(variable.id) : null;

      return `
        <div class="mobile-data-card">
          <div class="mobile-data-card-header">
            <span class="font-label-code-md">${escapeHtml(variable.key)}</span>
            <span class="badge badge-code">${variable.is_sensitive === false ? 'Plaintext' : 'Sensitive'}</span>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid var(--color-border);border-radius:var(--radius-sm)">
            <span style="overflow-wrap:anywhere">${isRevealed ? escapeHtml(revealed.value) : '••••••••••••••••'}</span>
            <button class="btn btn-ghost btn-sm" data-action="${isRevealed ? 'mask' : 'reveal'}" data-id="${variable.id}">${isRevealed ? 'Mask' : 'Reveal'}</button>
            <button class="btn btn-ghost btn-sm" data-action="copy" data-id="${variable.id}">Copy</button>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;margin-top:8px">
            <span>Updated ${formatDate(variable.updated_at || variable.created_at)}</span>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" data-action="history" data-id="${variable.id}">History</button>
              <button class="btn btn-ghost btn-sm" data-action="edit" data-id="${variable.id}">Edit</button>
              <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${variable.id}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    [tbody, mobileList].forEach(parent => {
      parent.querySelectorAll('[data-action]').forEach(button => {
        button.addEventListener('click', () => {
          const variableId = Number(button.dataset.id);
          const variable = variablesList.find(item => item.id === variableId);
          if (!variable) return;

          switch (button.dataset.action) {
            case 'reveal':
              window.revealVariableForTimer(variableId, variable.key);
              break;
            case 'mask':
              window.maskVariableNow(variableId);
              break;
            case 'copy':
              window.copyVariableSecret(variableId, variable.key);
              break;
            case 'history':
              window.openVariableHistoryModal(variableId, variable.key);
              break;
            case 'edit':
              window.openEditVariableModal(variableId, variable.key);
              break;
            case 'delete':
              window.confirmDeleteVariable(variableId, variable.key);
              break;
          }
        });
      });
    });
  }

  window.revealVariableForTimer = async function (variableId, key) {
    try {
      const result = await revealVariable(activeProject.id, activeEnv.id, variableId);
      const previous = revealedValues.get(variableId);

      if (previous) clearInterval(previous.timerId);

      const entry = {
        value: result.value,
        secondsLeft: 30,
        timerId: null,
      };

      entry.timerId = setInterval(() => {
        entry.secondsLeft -= 1;

        if (entry.secondsLeft <= 0) {
          clearInterval(entry.timerId);
          revealedValues.delete(variableId);
          renderVariablesTable();
        } else {
          const countdown = document.getElementById(`countdown-${variableId}`);
          if (countdown) countdown.textContent = `Auto-masks in ${entry.secondsLeft}s`;
        }
      }, 1000);

      revealedValues.set(variableId, entry);
      renderVariablesTable();
    } catch (error) {
      window.showToast?.('Reveal Failed', error.message, 'error');
    }
  };

  window.maskVariableNow = function (variableId) {
    const entry = revealedValues.get(variableId);
    if (!entry) return;

    clearInterval(entry.timerId);
    revealedValues.delete(variableId);
    renderVariablesTable();
  };

  window.copyVariableSecret = async function (variableId, key) {
    try {
      let value;

      if (revealedValues.has(variableId)) {
        value = revealedValues.get(variableId).value;
      } else {
        const result = await revealVariable(activeProject.id, activeEnv.id, variableId);
        value = result.value;
      }

      await navigator.clipboard.writeText(value);
      window.showToast?.('Copied to Clipboard', `Value for ${key} copied.`, 'success');
    } catch (error) {
      window.showToast?.('Copy Failed', error.message, 'error');
    }
  };

  function clearAllRevealedTimers() {
    revealedValues.forEach(entry => clearInterval(entry.timerId));
    revealedValues.clear();
  }

  async function exportCurrentEnv() {
    if (!activeEnv || !variablesList.length) {
      window.showToast?.('Export Unavailable', 'No variables found to export.', 'warning');
      return;
    }

    try {
      const lines = [];

      for (const variable of variablesList) {
        const result = await revealVariable(activeProject.id, activeEnv.id, variable.id);
        lines.push(`${variable.key}=${result.value}`);
      }

      const blob = new Blob([lines.join('\n') + '\n'], {
        type: 'text/plain;charset=utf-8',
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = url;
      anchor.download = `.env.${activeEnv.name.toLowerCase()}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      window.showToast?.('Export Complete', 'Environment file downloaded.', 'success');
    } catch (error) {
      window.showToast?.('Export Failed', error.message, 'error');
    }
  }

  function openAddVariableModal() {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    if (!title || !body || !footer || !activeEnv) {
      window.showToast?.('Modal Unavailable', 'Could not open the variable form.', 'error');
      return;
    }

    title.textContent = `Add Variable to ${activeEnv.name}`;

    body.innerHTML = `
      <form id="add-var-form" style="display:flex;flex-direction:column;gap:var(--space-md)">
        <div class="form-group">
          <label class="form-label" for="add-var-key">Variable Key *</label>
          <input id="add-var-key" type="text" class="input-control font-mono" placeholder="DATABASE_URL" required>
          <span style="font-size:11px;color:var(--color-text-muted)">Use letters, numbers and underscores.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="add-var-val">Variable Value *</label>
          <textarea id="add-var-val" class="input-control font-mono" placeholder="Enter variable value..." required></textarea>
        </div>
        <label style="display:flex;align-items:center;gap:8px">
          <input id="add-var-sensitive" type="checkbox" checked>
          <span>Mask and encrypt as a sensitive secret</span>
        </label>
      </form>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" type="button" id="cancel-add-var">Cancel</button>
      <button class="btn btn-primary" type="button" id="btn-submit-add-var">Save Variable</button>
    `;

    document.getElementById('cancel-add-var')?.addEventListener('click', () => window.closeGlobalModal());

    document.getElementById('btn-submit-add-var')?.addEventListener('click', async () => {
      const key = document.getElementById('add-var-key').value.trim();
      const value = document.getElementById('add-var-val').value;
      const isSensitive = document.getElementById('add-var-sensitive').checked;

      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        window.showToast?.('Validation Error', 'Enter a valid variable key.', 'error');
        return;
      }

      if (!value) {
        window.showToast?.('Validation Error', 'Variable value is required.', 'error');
        return;
      }

      const button = document.getElementById('btn-submit-add-var');
      button.disabled = true;
      button.textContent = 'Saving...';

      try {
        await createVariable(activeProject.id, activeEnv.id, {
          key,
          value,
          is_sensitive: isSensitive,
        });

        window.closeGlobalModal();
        window.showToast?.('Variable Created', `${key} saved.`, 'success');
        await loadVariables();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Save Variable';
        window.showToast?.('Creation Failed', error.message, 'error');
      }
    });

    window.openGlobalModal();
  }

  window.openAddVariableDialog = openAddVariableModal;

  window.openEditVariableModal = function (variableId, key) {
    if (!activeEnv) return;

    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    const variable = variablesList.find(item => item.id === variableId);
    const isSensitive = variable ? variable.is_sensitive !== false : true;

    title.textContent = `Edit Variable: ${key}`;

    body.innerHTML = `
      <form id="edit-var-form" style="display:flex;flex-direction:column;gap:var(--space-md)">
        <div class="form-group">
          <label class="form-label">Variable Key</label>
          <input class="input-control font-mono" value="${escapeHtml(key)}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label" for="edit-var-val">New Value</label>
          <textarea id="edit-var-val" class="input-control font-mono" placeholder="Enter updated value..." required></textarea>
        </div>
        <label style="display:flex;align-items:center;gap:8px">
          <input id="edit-var-sensitive" type="checkbox" ${isSensitive ? 'checked' : ''}>
          <span>Mask and encrypt as a sensitive secret</span>
        </label>
      </form>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" type="button" id="cancel-edit-var">Cancel</button>
      <button class="btn btn-primary" type="button" id="btn-submit-edit-var">Update Value</button>
    `;

    document.getElementById('cancel-edit-var')?.addEventListener('click', () => window.closeGlobalModal());

    document.getElementById('btn-submit-edit-var')?.addEventListener('click', async () => {
      const value = document.getElementById('edit-var-val').value;
      const sensitive = document.getElementById('edit-var-sensitive').checked;

      if (!value) {
        window.showToast?.('Validation Error', 'Enter the new value.', 'error');
        return;
      }

      const button = document.getElementById('btn-submit-edit-var');
      button.disabled = true;
      button.textContent = 'Updating...';

      try {
        await updateVariable(activeProject.id, activeEnv.id, variableId, {
          value,
          is_sensitive: sensitive,
        });

        window.closeGlobalModal();
        window.showToast?.('Variable Updated', `${key} updated successfully.`, 'success');
        await loadVariables();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Update Value';
        window.showToast?.('Update Failed', error.message, 'error');
      }
    });

    window.openGlobalModal();
  };

  window.confirmDeleteVariable = function (variableId, key) {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    title.textContent = 'Delete Variable';

    body.innerHTML = `
      <p>Are you sure you want to delete <strong>${escapeHtml(key)}</strong> from <strong>${escapeHtml(activeEnv?.name)}</strong>?</p>
      <p style="color:var(--color-text-secondary);margin-top:var(--space-xs)">This action will be recorded in the project audit log.</p>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" type="button" id="cancel-delete-var">Cancel</button>
      <button class="btn btn-danger" type="button" id="btn-confirm-delete-var">Delete Variable</button>
    `;

    document.getElementById('cancel-delete-var')?.addEventListener('click', () => window.closeGlobalModal());

    document.getElementById('btn-confirm-delete-var')?.addEventListener('click', async () => {
      const button = document.getElementById('btn-confirm-delete-var');
      button.disabled = true;
      button.textContent = 'Deleting...';

      try {
        await deleteVariable(activeProject.id, activeEnv.id, variableId);
        window.closeGlobalModal();
        window.showToast?.('Variable Deleted', `${key} was deleted.`, 'success');
        await loadVariables();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Delete Variable';
        window.showToast?.('Delete Failed', error.message, 'error');
      }
    });

    window.openGlobalModal();
  };

  window.openVariableHistoryModal = async function (variableId, key) {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    const historyValues = new Map();
    const historyTimers = new Map();

    function maskHistoricalValue(versionId) {
      const timer = historyTimers.get(versionId);
      if (timer) clearInterval(timer);

      historyTimers.delete(versionId);
      historyValues.delete(versionId);

      const valueElement = body.querySelector(`#history-value-${versionId}`);
      const button = body.querySelector(`#history-reveal-${versionId}`);

      if (valueElement) {
        valueElement.textContent = '••••••••••••••••••••';
        valueElement.style.display = 'none';
      }

      if (button) {
        button.disabled = false;
        button.textContent = 'Reveal historical value';
      }
    }

    title.textContent = `Version History: ${key}`;

    body.innerHTML = `
      <div style="text-align:center;padding:var(--space-lg)">
        <div class="spinner"></div>
        <div style="margin-top:8px;color:var(--color-text-secondary)">Loading revisions...</div>
      </div>
    `;

    footer.innerHTML = `
      <button class="btn btn-secondary" type="button" id="close-history-modal">Close</button>
    `;

    document.getElementById('close-history-modal')?.addEventListener('click', () => {
      historyTimers.forEach(timer => clearInterval(timer));
      historyTimers.clear();
      historyValues.clear();
      window.closeGlobalModal();
    });

    window.openGlobalModal();

    try {
      const history = await getVariableHistory(activeProject.id, activeEnv.id, variableId);

      if (!Array.isArray(history) || history.length === 0) {
        body.innerHTML = `
          <p style="color:var(--color-text-secondary);padding:var(--space-md)">No revision history available.</p>
        `;
        return;
      }

      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:var(--space-sm)">
          ${history.map((revision, index) => {
        const versionId = Number(revision.version_id);

        return `
              <div style="padding:var(--space-sm) var(--space-md);background:var(--color-surface-container-low);border-radius:var(--radius-md);border:1px solid var(--color-border)">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
                  <div>
                    <span class="badge badge-code">v${history.length - index}</span>
                    <span class="font-label-code-sm">Revision #${versionId}</span>
                    <div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px">
                      Changed by User #${escapeHtml(revision.changed_by)} on ${escapeHtml(formatDateTime(revision.changed_at))}
                    </div>
                  </div>
                  <span class="badge badge-code">Audit Logged</span>
                </div>
                <div style="margin-top:10px">
                  <button class="btn btn-secondary btn-sm" type="button" id="history-reveal-${versionId}">Reveal historical value</button>
                  <div id="history-value-${versionId}" class="font-label-code-sm" style="display:none;margin-top:8px;padding:10px;overflow-wrap:anywhere;white-space:pre-wrap;background:var(--color-surface-container);border-radius:var(--radius-sm)"></div>
                  <div style="font-size:11px;color:var(--color-text-secondary);margin-top:5px">The value will automatically be hidden after 30 seconds.</div>
                </div>
              </div>
            `;
      }).join('')}
        </div>
      `;

      history.forEach(revision => {
        const versionId = Number(revision.version_id);
        const button = body.querySelector(`#history-reveal-${versionId}`);
        const valueElement = body.querySelector(`#history-value-${versionId}`);

        button?.addEventListener('click', async () => {
          if (historyValues.has(versionId)) {
            maskHistoricalValue(versionId);
            return;
          }

          button.disabled = true;
          button.textContent = 'Revealing...';

          try {
            const result = await revealVariableHistory(
              activeProject.id,
              activeEnv.id,
              variableId,
              versionId
            );

            historyValues.set(versionId, result.value);
            valueElement.textContent = result.value;
            valueElement.style.display = 'block';

            let secondsLeft = 30;
            button.disabled = false;
            button.textContent = `Hide value (${secondsLeft}s)`;

            const timer = setInterval(() => {
              secondsLeft -= 1;

              if (secondsLeft <= 0) {
                maskHistoricalValue(versionId);
              } else if (historyValues.has(versionId)) {
                button.textContent = `Hide value (${secondsLeft}s)`;
              }
            }, 1000);

            historyTimers.set(versionId, timer);
          } catch (error) {
            button.disabled = false;
            button.textContent = 'Reveal historical value';
            window.showToast?.('History Reveal Failed', error.message, 'error');
          }
        });
      });
    } catch (error) {
      body.innerHTML = `
        <p style="color:var(--color-error);padding:var(--space-md)">
          Failed to load history: ${escapeHtml(error.message)}
        </p>
      `;
    }
  };

  searchInput?.addEventListener('input', event => {
    searchTerm = event.target.value.toLowerCase().trim();
    renderVariablesTable();
  });

  await loadEnvironments();
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return 'Unknown date';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleString();
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
