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
  listVariables,
  createVariable,
  revealVariable,
  updateVariable,
  deleteVariable,
  getVariableHistory
} from '../api.js';

export async function renderVariablesView(container) {
  const state = store.getState();
  let projects = state.projects.list;
  let activeProject = state.projects.activeProject;

  // If no projects loaded yet, fetch them
  if (!projects || projects.length === 0) {
    try {
      projects = await listProjects();
      store.setProjects(projects);
    } catch {
      projects = [];
    }
  }

  // Fallback to first project if none selected
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

  // Active Environment Tracking
  let environments = [];
  let activeEnv = null;
  let variablesList = [];
  let revealedValues = new Map(); // varId -> { value: str, timerId: number, secondsLeft: number }
  let activeCategoryFilter = 'all';
  let searchTerm = '';

  container.innerHTML = `
    <!-- Scope & Breadcrumb Header -->
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <div style="display: flex; align-items: center; gap: var(--space-sm); font-size: 11px; font-weight: 500; color: var(--color-text-secondary);">
        <a href="#projects" class="font-label-code-sm" style="color: var(--color-secondary); font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
          <span class="material-symbols-outlined" style="font-size: 14px;">inventory_2</span>
          ${escapeHtml(activeProject.name)}
        </a>
        <span style="color: var(--color-border-strong);">/</span>
        <span id="var-env-header-badge" class="badge badge-prod">
          <span class="pulse-dot"></span>
          <span id="var-active-env-name">Loading...</span>
        </span>
      </div>

      <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md); margin-top: 4px;">
        <div>
          <h1 class="font-display-lg">Variable Manager</h1>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 2px;">
            Secure configuration values for production runtime. All values masked by default.
          </p>
        </div>
        <div style="display: flex; align-items: center; gap: var(--space-sm); font-size: 11px;">
          <div style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--color-surface-container-lowest); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-xs);">
            <span class="material-symbols-outlined" style="font-size: 14px; color: var(--color-secondary);">lock</span>
            <span style="color: var(--color-text-secondary);">KMS Envelope Encrypted</span>
          </div>
          <div class="hidden-mobile" style="display: flex; align-items: center; gap: 6px; padding: 6px 12px; background: var(--color-surface-container-lowest); border: 1px solid var(--color-border); border-radius: var(--radius-md); box-shadow: var(--shadow-xs);">
            <span class="material-symbols-outlined" style="font-size: 14px; color: var(--color-secondary);">sync</span>
            <span style="color: var(--color-text-secondary);">Client-Side In-Memory Secrets</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Environment Switcher Tabs -->
    <div class="env-tab-bar" id="var-env-tabs-bar">
      <div style="padding: var(--space-sm); color: var(--color-text-secondary); font-size: 12px;">Loading environments...</div>
    </div>

    <!-- Compact Toolbar / Action Row -->
    <div style="background-color: var(--color-surface-container-lowest); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 10px 14px; box-shadow: var(--shadow-xs); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-md);">
      <div style="display: flex; flex: 1; min-width: 240px; align-items: center; gap: var(--space-sm);">
        <div style="position: relative; flex: 1; max-width: 380px;">
          <span class="material-symbols-outlined" style="position: absolute; left: 10px; top: 9px; font-size: 18px; color: var(--color-text-muted);">search</span>
          <input id="var-search-input" type="text" class="input-control" placeholder="Filter variables or tags... (⌘K)" style="padding-left: 36px; padding-right: 48px;">
          <kbd style="position: absolute; right: 10px; top: 8px;">⌘K</kbd>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: var(--space-sm);">
        <button id="var-import-btn" class="btn btn-secondary" type="button">
          <span class="material-symbols-outlined">file_upload</span>
          <span>Import .env</span>
        </button>
        <button id="var-export-btn" class="btn btn-secondary" type="button">
          <span class="material-symbols-outlined">file_download</span>
          <span>Export</span>
        </button>
        <button id="var-add-btn" class="btn btn-primary" type="button">
          <span class="material-symbols-outlined">add</span>
          <span>Add Variable</span>
        </button>
      </div>
    </div>

    <!-- Configuration Variables Data Presentation -->
    <div class="table-surface-card">
      <div class="table-wrapper data-table-desktop">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 28%;">Variable Name & Scope</th>
              <th style="width: 40%;">Value</th>
              <th style="width: 12%;">Version</th>
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

      <!-- Mobile Stacked Card View (< 768px) -->
      <div class="mobile-card-list" id="var-mobile-card-list">
        <!-- Populated via JS -->
      </div>

      <!-- Pagination / Count Footer -->
      <div style="padding: 10px var(--space-lg); background-color: var(--color-surface-container-lowest); border-top: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: var(--color-text-secondary);">
        <span id="var-count-footer">Showing 0 variables</span>
        <div style="display: flex; align-items: center; gap: var(--space-xs);">
          <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-primary);">Page 1 of 1</span>
        </div>
      </div>
    </div>

    <!-- Zero-Disk CLI Helper Panel -->
    <div class="cli-helper-box">
      <div class="cli-helper-left">
        <div class="cli-icon-box">
          <span class="material-symbols-outlined">terminal</span>
        </div>
        <div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: var(--font-size-label-ui); font-weight: 600; color: var(--color-text-primary);">Zero-Disk Injection Helper</span>
            <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary); font-size: 10px;">Fast & Safe</span>
          </div>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 1px;">
            Inject variables directly in memory at runtime without writing secrets to your local filesystem.
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

  // Hook Search ⌘K shortcut
  const searchInput = document.getElementById('var-search-input');
  const handleShortcut = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchInput?.focus();
    }
  };
  window.addEventListener('keydown', handleShortcut);

  // Hook Import & Export
  document.getElementById('var-import-btn')?.addEventListener('click', () => {
    window.location.hash = '#import-export';
  });

  document.getElementById('var-export-btn')?.addEventListener('click', () => {
    exportCurrentEnv();
  });

  document.getElementById('var-add-btn')?.addEventListener('click', () => {
    openAddVariableModal();
  });

  // CLI copy snippet
  document.getElementById('cli-copy-btn')?.addEventListener('click', () => {
    const text = document.getElementById('cli-cmd-snippet')?.textContent || '';
    navigator.clipboard.writeText(text).then(() => {
      const label = document.getElementById('cli-copy-label');
      if (label) {
        label.textContent = 'Copied!';
        setTimeout(() => { label.textContent = 'Copy'; }, 2000);
      }
    });
  });

  // Load Environments for Project
  async function loadEnvironments() {
    try {
      environments = await listEnvironments(activeProject.id);
      
      // Auto-create standard environments (Development, Staging, Production) if none exist
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
      }

      renderEnvironmentTabs();
      if (activeEnv) {
        loadVariables();
      }

    } catch (err) {
      document.getElementById('var-env-tabs-bar').innerHTML = `
        <div style="color: var(--color-error); padding: var(--space-sm);">Failed to load environments: ${err.message}</div>
      `;
    }
  }

  function renderEnvironmentTabs() {
    const tabsBar = document.getElementById('var-env-tabs-bar');
    if (!tabsBar) return;

    tabsBar.innerHTML = environments.map(env => {
      const isActive = activeEnv && activeEnv.id === env.id;
      return `
        <button class="env-tab ${isActive ? 'is-active' : ''}" data-env-id="${env.id}" type="button">
          <span>${escapeHtml(env.name)}</span>
          <span class="env-tab-count" id="tab-count-${env.id}">-</span>
        </button>
      `;
    }).join('');

    tabsBar.querySelectorAll('.env-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const envId = parseInt(btn.getAttribute('data-env-id'), 10);
        const selected = environments.find(e => e.id === envId);
        if (selected && selected.id !== activeEnv?.id) {
          activeEnv = selected;
          store.setActiveEnvironment(activeEnv);
          // Clear any revealed variables when switching environment
          clearAllRevealedTimers();
          renderEnvironmentTabs();
          loadVariables();
        }
      });
    });

    // Update header badge
    const headerName = document.getElementById('var-active-env-name');
    const headerBadge = document.getElementById('var-env-header-badge');
    if (headerName && activeEnv) {
      headerName.textContent = `${activeEnv.name} (Protected)`;
      if (headerBadge) {
        headerBadge.className = activeEnv.name.toLowerCase().includes('prod') 
          ? 'badge badge-prod' 
          : activeEnv.name.toLowerCase().includes('stg') 
            ? 'badge badge-stg' 
            : 'badge badge-dev';
      }
    }

    // Update CLI snippet
    const snippet = document.getElementById('cli-cmd-snippet');
    if (snippet && activeEnv) {
      snippet.textContent = `envshare run --env=${activeEnv.name.toLowerCase()} npm start`;
    }
  }

  // Load Variables for Active Environment
  async function loadVariables() {
    if (!activeEnv) return;
    const tbody = document.getElementById('var-table-body');
    const mobileList = document.getElementById('var-mobile-card-list');

    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: var(--space-xl);">
          <div class="spinner"></div>
          <div style="margin-top: var(--space-xs); color: var(--color-text-secondary);">Loading variables...</div>
        </td>
      </tr>
    `;

    try {
      variablesList = await listVariables(activeProject.id, activeEnv.id);
      store.setVariables(variablesList);

      // Update Tab Count Pill
      const countPill = document.getElementById(`tab-count-${activeEnv.id}`);
      if (countPill) countPill.textContent = variablesList.length;

      document.getElementById('var-count-footer').textContent = `Showing ${variablesList.length} of ${variablesList.length} variables`;

      renderVariablesTable();
    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: var(--space-xl); color: var(--color-error);">
            Failed to load variables: ${err.message}
          </td>
        </tr>
      `;
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
      mobileList.innerHTML = `<div style="text-align: center; padding: var(--space-lg); color: var(--color-text-secondary);">No variables in this view.</div>`;
      return;
    }

    tbody.innerHTML = filtered.map(v => {
      const isRevealed = revealedValues.has(v.id);
      const revealedData = isRevealed ? revealedValues.get(v.id) : null;

      // Extract scope/tag guess from key prefix (e.g. STRIPE_ -> payments, DB_ -> database)
      let scopeTag = 'secret';
      if (v.key.includes('STRIPE') || v.key.includes('PAYMENT')) scopeTag = 'payments';
      else if (v.key.includes('DB') || v.key.includes('DATABASE') || v.key.includes('POSTGRES')) scopeTag = 'postgres';
      else if (v.key.includes('AI') || v.key.includes('OPENAI')) scopeTag = 'ai-core';
      else if (v.key.includes('JWT') || v.key.includes('AUTH') || v.key.includes('TOKEN')) scopeTag = 'auth-token';
      else if (v.key.includes('PORT') || v.key.includes('HOST')) scopeTag = 'runtime';

      return `
        <tr class="${isRevealed ? 'bg-stg-tint' : ''}">
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="font-label-code-md" style="font-weight: 600; color: var(--color-primary);">${escapeHtml(v.key)}</span>
              <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary); font-size: 10px;">${scopeTag}</span>
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
              <span>v1</span>
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

      return `
        <div class="mobile-data-card ${isRevealed ? 'bg-stg-tint' : ''}">
          <div class="mobile-data-card-header">
            <span class="font-label-code-md" style="font-weight: 700; color: var(--color-primary);">${escapeHtml(v.key)}</span>
            <span class="badge badge-code" style="background-color: var(--color-surface-container); font-size: 10px;">secret</span>
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
              <button class="btn btn-ghost btn-sm" onclick="window.openEditVariableModal(${v.id}, '${escapeHtml(v.key)}')">Edit</button>
              <button class="btn btn-ghost btn-sm" style="color: var(--color-error);" onclick="window.confirmDeleteVariable(${v.id}, '${escapeHtml(v.key)}')">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Live 30-Second Countdown Reveal Logic
  window.revealVariableForTimer = async function(varId, key) {
    try {
      const res = await revealVariable(activeProject.id, activeEnv.id, varId);
      const plaintext = res.value;

      // Start 30 second timer
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

      revealedValues.set(varId, { value: plaintext, timerId, secondsLeft });
      renderVariablesTable();
    } catch (err) {
      window.showToast?.('Reveal Failed', err.message, 'error');
    }
  };

  window.maskVariableNow = function(varId) {
    const entry = revealedValues.get(varId);
    if (entry) {
      clearInterval(entry.timerId);
      revealedValues.delete(varId);
      renderVariablesTable();
    }
  };

  window.copyVariableSecret = async function(varId, key) {
    try {
      let valToCopy = '';
      if (revealedValues.has(varId)) {
        valToCopy = revealedValues.get(varId).value;
      } else {
        // Fetch to clipboard without exposing on DOM
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

  // Export current environment as .env file
  async function exportCurrentEnv() {
    if (!activeEnv || variablesList.length === 0) {
      window.showToast?.('Export Unavailable', 'No variables found to export in this environment.', 'warning');
      return;
    }

    try {
      window.showToast?.('Exporting .env', 'Decrypting environment variables securely...', 'info');
      // Fetch each variable securely
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

  // Add Variable Modal Handlers
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
          <textarea id="add-var-val" class="input-control font-mono" placeholder="Enter sensitive value..." required></textarea>
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
        window.showToast?.('Variable Created', `${key} saved and encrypted.`, 'success');
        loadVariables();
      } catch (err) {
        window.showToast?.('Creation Failed', err.message, 'error');
      }
    });

    window.openGlobalModal();
  }
  window.openAddVariableDialog = openAddVariableModal;

  // Edit Variable Modal Handler
  window.openEditVariableModal = function(varId, key) {
    const backdrop = document.getElementById('global-modal-backdrop');
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

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
          <input id="edit-var-sensitive" type="checkbox" checked style="accent-color: var(--color-primary);">
          <label for="edit-var-sensitive" style="font-size: 12px; color: var(--color-text-primary); cursor: pointer;">
            Keep encrypted & sensitive
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
        loadVariables();
      } catch (err) {
        window.showToast?.('Update Failed', err.message, 'error');
      }
    });

    window.openGlobalModal();
  };

  // Delete Variable Handler
  window.confirmDeleteVariable = function(varId, key) {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

    title.textContent = `Delete Variable`;
    body.innerHTML = `
      <p class="font-body-md" style="color: var(--color-text-primary);">
        Are you sure you want to delete <strong class="font-label-code-md">${escapeHtml(key)}</strong> from <strong>${escapeHtml(activeEnv.name)}</strong>?
      </p>
      <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: var(--space-xs);">
        This action soft-deletes the key and will be logged in SOC2 audit events.
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
        loadVariables();
      } catch (err) {
        window.showToast?.('Delete Failed', err.message, 'error');
      }
    });

    window.openGlobalModal();
  };

  // Variable Version History Modal
  window.openVariableHistoryModal = async function(varId, key) {
    const title = document.getElementById('global-modal-title');
    const body = document.getElementById('global-modal-body');
    const footer = document.getElementById('global-modal-footer');

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
        body.innerHTML = `<p style="color: var(--color-text-secondary); padding: var(--space-md);">No revision history available.</p>`;
        return;
      }

      body.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
          ${history.map((rev, idx) => `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: var(--space-sm) var(--space-md); background: var(--color-surface-container-low); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
              <div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span class="badge badge-code" style="background-color: var(--color-primary-container); color: #FFF;">v${history.length - idx}</span>
                  <span class="font-label-code-sm" style="color: var(--color-text-primary);">Revision #${rev.version_id}</span>
                </div>
                <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
                  Changed by User #${rev.changed_by} on ${new Date(rev.changed_at).toLocaleString()}
                </div>
              </div>
              <span class="badge badge-code" style="background: var(--color-surface-container); color: var(--color-text-muted); font-size: 10px;">Audit Logged</span>
            </div>
          `).join('')}
        </div>
      `;
    } catch (err) {
      body.innerHTML = `<p style="color: var(--color-error); padding: var(--space-md);">Failed to load history: ${err.message}</p>`;
    }
  };

  // Search Filter Handler
  searchInput?.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderVariablesTable();
  });

  // Start loading environments and variables
  loadEnvironments();
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
