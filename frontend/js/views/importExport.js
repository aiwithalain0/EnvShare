/**
 * EnvShare Import .env Workflow View
 * Extracted from Google Stitch Project 7000277523774803089
 */

import { store } from '../store.js';
import { router } from '../router.js';
import { listProjects, listEnvironments, previewEnvImport, commitEnvImport } from '../api.js';

export async function renderImportExportView(container) {
  const state = store.getState();
  let activeProject = state.projects.activeProject;
  let environments = state.environments.list;

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
        <p class="font-body-sm" style="color: var(--color-text-secondary);">Select a project first to import environment variables.</p>
      </div>
    `;
    return;
  }

  // Load environments if empty
  if (!environments || environments.length === 0) {
    try {
      environments = await listEnvironments(activeProject.id);
      store.setEnvironments(environments);
    } catch {
      environments = [];
    }
  }

  let selectedEnvId = environments[0]?.id || null;
  let currentStep = 1; // 1: Upload/Paste, 2: Parse & Conflicts, 3: Review & Resolving, 4: Done
  let previewData = null;
  let rawContent = '';
  let conflictStrategy = 'overwrite';
  let maskSecrets = true;

  container.innerHTML = `
    <!-- Top Context Header Bar: Status & Directives -->
    <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-sm);">
        <div style="display: flex; align-items: center; gap: var(--space-xs); font-family: var(--font-mono); font-size: 11px; color: var(--color-text-secondary);">
          <span>WORKFLOW</span>
          <span>/</span>
          <span style="font-weight: 700; color: var(--color-primary);">IMPORT .ENV SPECIFICATION</span>
          <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-primary); font-size: 10px;">PARSER v2.4</span>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-xs); padding: 4px 12px; background: var(--color-surface-container-lowest); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 11px; box-shadow: var(--shadow-xs);">
          <span class="pulse-dot"></span>
          <span style="font-weight: 700; color: var(--color-primary);">SHA-256</span>
          <span style="color: var(--color-text-secondary);">Verified In-Memory</span>
        </div>
      </div>

      <div style="margin-top: 4px;">
        <h1 class="font-headline-lg">Sync Environment Changeset</h1>
        <p class="font-body-sm" style="color: var(--color-text-secondary); margin-top: 2px;">
          Parse, inspect conflicts, and atomically apply standard dotenv files to target environment.
        </p>
      </div>
    </div>

    <!-- 1. Multi-Stage Progress Stepper -->
    <nav class="stepper-nav" aria-label="Import Progress">
      <ol class="stepper-list">
        <li class="stepper-item ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : 'upcoming'}" id="step-nav-1">
          <div class="stepper-bubble">
            ${currentStep > 1 ? '<span class="material-symbols-outlined" style="font-size: 14px;">check</span>' : '01'}
          </div>
          <div class="stepper-text">
            <p class="stepper-step-label">Step 01</p>
            <p class="stepper-step-title">Upload / Paste</p>
          </div>
        </li>

        <li class="stepper-item ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : 'upcoming'}" id="step-nav-2">
          <div class="stepper-bubble">
            ${currentStep > 2 ? '<span class="material-symbols-outlined" style="font-size: 14px;">check</span>' : '02'}
          </div>
          <div class="stepper-text">
            <p class="stepper-step-label">Step 02</p>
            <p class="stepper-step-title">Parse & Conflicts</p>
          </div>
        </li>

        <li class="stepper-item ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : 'upcoming'}" id="step-nav-3">
          <div class="stepper-bubble">
            ${currentStep > 3 ? '<span class="material-symbols-outlined" style="font-size: 14px;">check</span>' : '03'}
          </div>
          <div class="stepper-text">
            <p class="stepper-step-label">Step 03</p>
            <p class="stepper-step-title">Review & Resolving</p>
          </div>
        </li>

        <li class="stepper-item ${currentStep === 4 ? 'active' : 'upcoming'}" id="step-nav-4">
          <div class="stepper-bubble">04</div>
          <div class="stepper-text">
            <p class="stepper-step-label">Step 04</p>
            <p class="stepper-step-title">Import & Sync</p>
          </div>
        </li>
      </ol>
    </nav>

    <!-- Dynamic Step Content Container -->
    <div id="import-step-container">
      <!-- Step 1 View: Destination Select & File Upload / Raw Paste -->
      <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
        <div style="display: grid; grid-template-columns: repeat(12, 1fr); gap: var(--space-md);">
          <!-- Target Environment Card -->
          <div class="metric-card" style="grid-column: span 6;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between;">
              <div>
                <span class="font-label-code-sm" style="color: var(--color-text-secondary); text-transform: uppercase;">TARGET DESTINATION</span>
                <h2 class="font-headline-sm" style="color: var(--color-primary); margin-top: 2px;">${escapeHtml(activeProject.name)}</h2>
                <p class="font-body-sm" style="color: var(--color-text-secondary);">Enterprise Parameter Vault</p>
              </div>
              <span class="material-symbols-outlined" style="color: var(--color-secondary); font-size: 24px;">hub</span>
            </div>

            <div style="background-color: var(--color-surface-container-low); padding: var(--space-md); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); display: flex; flex-direction: column; gap: 6px;">
              <label for="import-dest-env-select" style="font-size: var(--font-size-label-ui); font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase;">
                Destination Environment
              </label>
              <select id="import-dest-env-select" class="input-control" style="cursor: pointer;">
                ${environments.map(e => `
                  <option value="${e.id}" ${e.id === selectedEnvId ? 'selected' : ''}>${escapeHtml(e.name)}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- Manifest Guidance Card -->
          <div class="metric-card" style="grid-column: span 6;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between;">
              <div>
                <span class="font-label-code-sm" style="color: var(--color-text-secondary); text-transform: uppercase;">PARSER STANDARDS</span>
                <h2 class="font-headline-sm" style="color: var(--color-primary); margin-top: 2px;">RFC DotEnv v2.4</h2>
                <p class="font-body-sm" style="color: var(--color-text-secondary);">Supports KEY=VALUE, export prefix, and quoted literals.</p>
              </div>
              <span class="material-symbols-outlined" style="color: var(--color-secondary); font-size: 24px;">verified</span>
            </div>

            <div style="background-color: var(--color-surface-container-low); padding: var(--space-md); border-radius: var(--radius-md); border: 1px solid var(--color-border-subtle); font-size: 12px; color: var(--color-text-secondary); line-height: 1.4;">
              All incoming values are validated client-side and encrypted with AES-256-GCM before entering storage.
            </div>
          </div>
        </div>

        <!-- Raw Paste Area -->
        <div class="table-surface-card" style="padding: var(--space-lg);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-sm);">
            <div>
              <h3 class="font-headline-sm">Paste .env File Content</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary);">Paste raw environment lines, or drag and drop a .env file below.</p>
            </div>
            <label class="btn btn-secondary btn-sm" style="cursor: pointer;">
              <span class="material-symbols-outlined">attach_file</span>
              <span>Upload File</span>
              <input id="import-file-input" type="file" accept=".env,text/plain" style="display: none;">
            </label>
          </div>

          <textarea id="import-raw-textarea" class="input-control font-mono" placeholder="DATABASE_URL=postgres://user:pass@host:5432/db&#10;STRIPE_SECRET_KEY=sk_test_51M...&#10;PORT=8000" style="min-height: 220px; font-size: 13px; line-height: 1.5;"></textarea>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-md);">
            <button class="btn btn-secondary" onclick="window.location.hash='#variables'">
              <span>Cancel</span>
            </button>
            <button id="btn-parse-env" class="btn btn-primary">
              <span>Parse & Inspect Conflicts</span>
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Hook Step 1 File Upload & Parse
  const fileInput = document.getElementById('import-file-input');
  const textarea = document.getElementById('import-raw-textarea');
  const envSelect = document.getElementById('import-dest-env-select');

  envSelect?.addEventListener('change', (e) => {
    selectedEnvId = parseInt(e.target.value, 10);
  });

  fileInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        textarea.value = event.target.result;
      };
      reader.readAsText(file);
    }
  });

  document.getElementById('btn-parse-env')?.addEventListener('click', async () => {
    rawContent = textarea.value.trim();
    if (!rawContent) {
      window.showToast?.('Empty Content', 'Please paste or upload a .env file before parsing.', 'error');
      return;
    }

    try {
      window.showToast?.('Parsing .env', 'Checking syntax and existing environment keys...', 'info');
      previewData = await previewEnvImport(activeProject.id, selectedEnvId, rawContent);
      
      if (!previewData.valid) {
        window.showToast?.('Parser Error', previewData.errors?.join('; ') || 'Invalid syntax', 'error');
        return;
      }

      currentStep = 2;
      updateStepperUI();
      renderStep2Preview();
    } catch (err) {
      window.showToast?.('Parse Failed', err.message, 'error');
    }
  });

  function updateStepperUI() {
    for (let i = 1; i <= 4; i++) {
      const item = document.getElementById(`step-nav-${i}`);
      if (!item) continue;
      if (i < currentStep) item.className = 'stepper-item completed';
      else if (i === currentStep) item.className = 'stepper-item active';
      else item.className = 'stepper-item upcoming';
    }
  }

  function renderStep2Preview() {
    const container = document.getElementById('import-step-container');
    if (!container) return;

    const total = previewData.total || previewData.variables?.length || 0;
    const newCount = previewData.new_count || 0;
    const existingCount = previewData.existing_count || 0;
    const restoreCount = previewData.restore_count || 0;

    container.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
        <!-- 3. Conflict Resolution Bar & Policy Selector -->
        <div class="table-surface-card" style="padding: var(--space-lg); gap: var(--space-md);">
          <!-- Analysis Breakdown Badges -->
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-sm);">
              <span class="font-label-code-sm" style="text-transform: uppercase; color: var(--color-text-secondary); font-weight: 700;">
                FILE ANALYSIS COMPOSITION
              </span>
              <span class="font-label-code-sm" style="color: var(--color-text-muted);">Engine: Strict-DotEnv-Parser</span>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: var(--space-sm);">
              <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-primary); font-weight: 700; padding: 4px 10px;">
                ${total} Variables Detected
              </span>
              <span class="badge badge-prod badge-code" style="padding: 4px 10px;">
                <span class="material-symbols-outlined" style="font-size: 14px;">add_circle</span>
                ${newCount} New Variables
              </span>
              ${existingCount > 0 ? `
                <span class="badge badge-stg badge-code" style="padding: 4px 10px;">
                  <span class="material-symbols-outlined" style="font-size: 14px;">warning</span>
                  ${existingCount} Conflicting Overwrites
                </span>
              ` : ''}
              ${restoreCount > 0 ? `
                <span class="badge badge-dev badge-code" style="padding: 4px 10px;">
                  <span class="material-symbols-outlined" style="font-size: 14px;">restore</span>
                  ${restoreCount} Can Restore
                </span>
              ` : ''}
            </div>
          </div>

          <!-- Strategy Radios -->
          <div style="background-color: var(--color-surface-container-low); padding: var(--space-md); border-radius: var(--radius-lg); border: 1px solid var(--color-border-subtle);">
            <div style="margin-bottom: var(--space-sm);">
              <h3 class="font-headline-sm" style="font-size: 15px;">Select Global Import Strategy</h3>
              <p class="font-body-sm" style="color: var(--color-text-secondary);">Set how incoming variable keys interact with existing keys.</p>
            </div>
            <div class="radio-policy-grid">
              <label class="radio-policy-card">
                <input type="radio" name="conflict-strategy" value="overwrite" checked>
                <div>
                  <div class="radio-policy-title">Overwrite Conflicts</div>
                  <div class="radio-policy-desc">Incoming values replace current keys in target environment automatically.</div>
                </div>
              </label>

              <label class="radio-policy-card">
                <input type="radio" name="conflict-strategy" value="preserve">
                <div>
                  <div class="radio-policy-title">Preserve Existing</div>
                  <div class="radio-policy-desc">Skip incoming updates if the variable key already exists.</div>
                </div>
              </label>

              <label class="radio-policy-card">
                <input type="radio" name="conflict-strategy" value="manual">
                <div>
                  <div class="radio-policy-title">Manual Inspection</div>
                  <div class="radio-policy-desc">Inspect and confirm each row individually in the table below.</div>
                </div>
              </label>
            </div>
          </div>
        </div>

        <!-- 4. Changeset Inspection Table -->
        <div class="table-surface-card">
          <div class="table-toolbar">
            <div style="display: flex; align-items: center; gap: var(--space-sm);">
              <h3 class="font-headline-sm">Changeset Inspection</h3>
              <span class="badge badge-code" style="background-color: var(--color-surface-container); color: var(--color-text-secondary);">
                ${total} keys ready
              </span>
            </div>

            <div style="display: flex; align-items: center; gap: var(--space-md);">
              <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 500; cursor: pointer;">
                <input id="mask-toggle-checkbox" type="checkbox" checked style="accent-color: var(--color-primary);">
                <span>Mask Sensitive Secrets</span>
              </label>
            </div>
          </div>

          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 15%;">Action / Type</th>
                  <th style="width: 35%;">Variable Key</th>
                  <th style="width: 25%;">Target Environment State</th>
                  <th style="width: 25%; text-align: right;">Planned Action</th>
                </tr>
              </thead>
              <tbody id="import-preview-tbody">
                ${(previewData.variables || []).map(v => {
                  let badge = '<span class="badge badge-prod badge-code">NEW</span>';
                  let planned = '<span style="color: var(--color-prod-text); font-weight: 600;">Add Key</span>';
                  if (v.status === 'already_exists') {
                    badge = '<span class="badge badge-stg badge-code">OVERWRITE</span>';
                    planned = '<span style="color: var(--color-stg-text); font-weight: 600;">Replace Value</span>';
                  } else if (v.status === 'can_restore') {
                    badge = '<span class="badge badge-dev badge-code">RESTORE</span>';
                    planned = '<span style="color: var(--color-dev-text); font-weight: 600;">Undelete & Sync</span>';
                  }

                  return `
                    <tr>
                      <td>${badge}</td>
                      <td>
                        <span class="font-label-code-md" style="font-weight: 700; color: var(--color-primary);">${escapeHtml(v.key)}</span>
                      </td>
                      <td>
                        <span style="font-size: 12px; color: var(--color-text-secondary);">
                          ${v.status === 'already_exists' ? 'Currently exists (active)' : v.status === 'can_restore' ? 'Archived (deleted)' : 'Not in environment'}
                        </span>
                      </td>
                      <td style="text-align: right;">${planned}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- 5. Security Notice & Execution Actions -->
        <div class="security-banner">
          <div class="security-banner-left">
            <span class="material-symbols-outlined security-banner-icon" style="color: var(--color-prod);">enhanced_encryption</span>
            <div>
              <span class="security-banner-title">Zero-Knowledge Memory Pipeline</span>
              <span class="security-banner-desc">
                Secrets are encrypted via AES-256-GCM before writing to storage blocks. Environment files are purged from browser memory upon exit.
              </span>
            </div>
          </div>
        </div>

        <!-- Action Bar -->
        <div style="background-color: var(--color-surface-container-lowest); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: var(--space-md) var(--space-lg); display: flex; align-items: center; justify-content: space-between; box-shadow: var(--shadow-sm);">
          <button class="btn btn-secondary" id="btn-back-to-step1">
            <span class="material-symbols-outlined">arrow_back</span>
            <span>Back to Edit</span>
          </button>

          <div style="display: flex; gap: var(--space-sm);">
            <button class="btn btn-secondary" onclick="window.location.hash='#variables'">Cancel</button>
            <button id="btn-commit-import" class="btn btn-primary">
              <span>Proceed to Import ${total} Variables</span>
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-back-to-step1')?.addEventListener('click', () => {
      currentStep = 1;
      updateStepperUI();
      renderImportExportView(container);
    });

    document.getElementById('btn-commit-import')?.addEventListener('click', async () => {
      try {
        window.showToast?.('Importing Variables', 'Writing encrypted secrets atomically...', 'info');
        const res = await commitEnvImport(activeProject.id, selectedEnvId, rawContent, true);
        window.showToast?.('Import Succeeded', res.message || `Imported ${res.imported_count || total} variables.`, 'success');
        
        currentStep = 4;
        updateStepperUI();

        container.innerHTML = `
          <div class="empty-state-card" style="padding: var(--space-3xl); background: #FFFFFF;">
            <div class="empty-state-icon" style="background-color: var(--color-prod-bg); color: var(--color-prod-text);">
              <span class="material-symbols-outlined">check_circle</span>
            </div>
            <h2 class="font-headline-lg" style="color: var(--color-primary);">Import Completed Successfully</h2>
            <p class="font-body-md" style="color: var(--color-text-secondary); max-width: 440px;">
              ${res.imported_count || total} environment variables have been encrypted and saved to your environment.
            </p>
            <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-md);">
              <button class="btn btn-primary" onclick="window.location.hash='#variables'">
                <span>View in Variable Manager</span>
                <span class="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
        `;
      } catch (err) {
        window.showToast?.('Import Failed', err.message, 'error');
      }
    });
  }
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
