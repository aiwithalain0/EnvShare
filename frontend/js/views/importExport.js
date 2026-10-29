
/**
 * EnvShare Import & Export Workflow View
 * Supports secure import previews, overwrite confirmation,
 * unchanged-value detection, restoration, and .env/JSON export.
 */

import { store } from '../store.js';
import {
  listProjects,
  listEnvironments,
  listVariables,
  revealVariable,
  previewEnvImport,
  commitEnvImport,
} from '../api.js';

export async function renderImportExportView(container) {
  const state = store.getState();
  let activeProject = state.projects.activeProject;
  let environments = state.environments.list || [];

  if (!activeProject) {
    try {
      const projects = await listProjects();
      store.setProjects(projects);

      if (projects.length) {
        activeProject = projects[0];
        store.setActiveProject(activeProject);
      }
    } catch {
      // The empty state below handles projects that cannot be loaded.
    }
  }

  if (!activeProject) {
    container.innerHTML = `
        <div class="empty-state-card" style="padding:3rem 1rem;">
          <div class="empty-state-icon">
            <span class="material-symbols-outlined">folder_off</span>
          </div>
          <h2 class="font-headline-md" style="margin:.5rem 0 .25rem;">No Project Selected</h2>
          <p class="font-body-sm" style="color:var(--color-text-secondary);max-width:320px;margin:0 auto 1rem;">
            Select a project first to import or export environment variables.
          </p>
        </div>`;
    return;
  }

  if (!environments.length) {
    try {
      environments = await listEnvironments(activeProject.id);
      store.setEnvironments(environments);
    } catch {
      environments = [];
    }
  }

  let selectedEnv = store.getActiveEnvironment() || environments[0] || null;
  let selectedEnvId = selectedEnv?.id || null;
  let previewData = null;
  let rawContent = '';
  let activeInputMode = 'upload';

  renderMainLayout();

  function renderMainLayout() {
    const environmentOptions = environments.map(env => `
        <option value="${env.id}" ${env.id === selectedEnvId ? 'selected' : ''}>
          ${escapeHtml(env.name)}
        </option>
      `).join('');

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:1.5rem;">
          <div style="display:flex;flex-direction:column;gap:.5rem;border-bottom:1px solid var(--color-border);padding-bottom:1.25rem;">
            <div style="display:flex;align-items:center;gap:6px;font-family:var(--font-mono);font-size:11px;text-transform:uppercase;color:var(--color-text-secondary);letter-spacing:.05em;">
              <span>${escapeHtml(activeProject.name)}</span><span>/</span><span>Import &amp; Export</span>
            </div>
            <div>
              <h1 class="font-headline-lg" style="margin:0;font-size:24px;font-weight:600;letter-spacing:-.02em;color:var(--color-text-primary);">Import / Export</h1>
              <p class="font-body-sm" style="margin-top:4px;color:var(--color-text-secondary);">
                Import keys and encrypted values from a .env file, or export environment bundles.
              </p>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:1.5rem;align-items:start;">

            <section class="table-surface-card" style="border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface-container-lowest);padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;">
              <div style="display:flex;flex-direction:column;gap:.5rem;border-bottom:1px solid var(--color-border);padding-bottom:1rem;">
                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem;">
                  <h2 style="font-size:16px;font-weight:600;color:var(--color-text-primary);margin:0;">Import Variables</h2>
                  <div style="display:flex;align-items:center;background:var(--color-surface-container-low);border-radius:var(--radius-md);padding:2px;border:1px solid var(--color-border);">
                    <button id="tab-upload" type="button" style="padding:4px 12px;font-size:12px;font-weight:500;border-radius:var(--radius-sm);border:none;cursor:pointer;background:var(--color-surface-container-lowest);color:var(--color-text-primary);">Upload File</button>
                    <button id="tab-paste" type="button" style="padding:4px 12px;font-size:12px;font-weight:500;border-radius:var(--radius-sm);border:none;cursor:pointer;background:transparent;color:var(--color-text-secondary);">Paste Content</button>
                  </div>
                </div>
                <p class="font-body-sm" style="color:var(--color-text-secondary);margin:0;">Import variables into the selected environment.</p>
              </div>

              <div>
                <label for="import-dest-env-select" style="display:block;font-size:12px;font-weight:500;color:var(--color-text-secondary);margin-bottom:6px;">Target Destination Environment</label>
                <select id="import-dest-env-select" class="input-control" style="height:36px;width:100%;border-radius:var(--radius-md);font-size:13px;" ${!environments.length ? 'disabled' : ''}>
                  ${environmentOptions}
                </select>
                ${!environments.length ? '<p style="font-size:12px;color:var(--color-text-secondary);">Create an environment before importing variables.</p>' : ''}
              </div>

              <div id="upload-panel" style="display:flex;flex-direction:column;gap:.75rem;">
                <div id="dropzone-box" style="border:2px dashed var(--color-border-strong);border-radius:var(--radius-lg);padding:1.5rem;background:var(--color-canvas);text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;">
                  <div style="width:40px;height:40px;border-radius:50%;background:var(--color-surface-container-lowest);border:1px solid var(--color-border);display:flex;align-items:center;justify-content:center;margin-bottom:.75rem;color:var(--color-text-secondary);">
                    <span class="material-symbols-outlined" style="font-size:20px;">upload_file</span>
                  </div>
                  <p style="font-size:13px;font-weight:500;color:var(--color-text-primary);margin:0;">Click to select or drag and drop a .env file</p>
                  <p style="font-size:12px;color:var(--color-text-secondary);margin-top:4px;">Accepts .env files up to 512 KB</p>
                  <input id="import-file-input" type="file" accept=".env,.local,.production,text/plain" style="display:none;">
                </div>

                <div id="file-info-pill" style="display:none;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--color-surface-container-low);border-radius:var(--radius-md);border:1px solid var(--color-border);">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;color:var(--color-text-secondary);">description</span>
                    <span id="file-name-label" style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:var(--color-text-primary);">.env</span>
                    <span id="file-size-label" style="font-size:11px;color:var(--color-text-secondary);"></span>
                  </div>
                  <button id="btn-remove-file" type="button" aria-label="Remove selected file" style="border:none;background:transparent;cursor:pointer;color:var(--color-text-secondary);padding:2px;">
                    <span class="material-symbols-outlined" style="font-size:16px;">close</span>
                  </button>
                </div>
              </div>

              <div id="paste-panel" style="display:none;flex-direction:column;gap:.5rem;">
                <textarea id="import-raw-textarea" class="input-control font-mono" placeholder="DATABASE_URL=your_database_url&#10;API_KEY=your_api_key&#10;PORT=8000" style="min-height:180px;font-size:12px;line-height:1.5;border-radius:var(--radius-md);"></textarea>
              </div>

              <div style="padding:12px;border:1px solid var(--color-border);border-radius:var(--radius-md);display:flex;flex-direction:column;gap:10px;">
                <label for="overwrite-existing-checkbox" style="display:flex;align-items:flex-start;gap:9px;cursor:pointer;">
                  <input id="overwrite-existing-checkbox" type="checkbox" style="margin-top:3px;accent-color:#09090b;">
                  <span>
                    <span style="display:block;font-size:13px;font-weight:600;color:var(--color-text-primary);">Overwrite existing variables</span>
                    <span style="display:block;margin-top:3px;font-size:12px;line-height:1.5;color:var(--color-text-secondary);">Replace changed values for matching keys. Previous values should remain in version history.</span>
                  </span>
                </label>
                <p id="overwrite-warning" style="display:none;margin:0;font-size:12px;line-height:1.5;color:var(--color-error,#b91c1c);">
                  Overwrite is enabled. Changed values will be replaced after confirmation.
                </p>
              </div>

              <p style="font-size:12px;color:var(--color-text-secondary);display:flex;align-items:center;gap:6px;margin:0;">
                <span class="material-symbols-outlined" style="font-size:15px;color:var(--color-text-muted);">info</span>
                <span>Comments and blank lines are ignored. Values are encrypted before storage.</span>
              </p>

              <div style="display:flex;justify-content:flex-end;padding-top:4px;">
                <button id="btn-preview-import" class="btn btn-primary" type="button" style="height:36px;padding:0 16px;background:#09090b;color:#fff;border-radius:var(--radius-md);font-size:13px;font-weight:500;" ${!environments.length ? 'disabled' : ''}>
                  <span>Preview Import</span>
                  <span class="material-symbols-outlined" style="font-size:16px;">visibility</span>
                </button>
              </div>
            </section>

            <section class="table-surface-card" style="border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface-container-lowest);padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;">
              <div style="display:flex;flex-direction:column;gap:.5rem;border-bottom:1px solid var(--color-border);padding-bottom:1rem;">
                <h2 style="font-size:16px;font-weight:600;color:var(--color-text-primary);margin:0;">Export Variables</h2>
                <p class="font-body-sm" style="color:var(--color-text-secondary);margin:0;">Export active environment variables to a .env or JSON file.</p>
              </div>

              <div style="background:var(--color-surface-container-low);border:1px solid var(--color-border);border-radius:var(--radius-md);padding:1rem;display:flex;flex-direction:column;gap:.75rem;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span class="material-symbols-outlined" style="font-size:20px;color:var(--color-text-primary);">inventory_2</span>
                  <div>
                    <span style="font-size:12px;color:var(--color-text-secondary);display:block;">Export Target</span>
                    <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:var(--color-text-primary);">
                      ${escapeHtml(activeProject.name)} / <span id="export-target-env-name">${escapeHtml(selectedEnv?.name || 'No environment selected')}</span>
                    </span>
                  </div>
                </div>
                <div style="height:1px;width:100%;background:var(--color-border);"></div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;">
                  <label for="export-source-env-select" style="color:var(--color-text-secondary);">Target Environment</label>
                  <select id="export-source-env-select" class="input-control" style="height:30px;font-size:12px;width:140px;" ${!environments.length ? 'disabled' : ''}>${environmentOptions}</select>
                </div>
              </div>

              <div style="padding:.75rem 1rem;background:var(--color-canvas);border-radius:var(--radius-md);border:1px solid var(--color-border);display:flex;align-items:flex-start;gap:10px;">
                <span class="material-symbols-outlined" style="font-size:18px;color:var(--color-text-secondary);margin-top:1px;">lock</span>
                <p style="font-size:12px;color:var(--color-text-secondary);line-height:1.4;margin:0;">Exported files contain decrypted secrets. Store and share them carefully.</p>
              </div>

              <div>
                <label style="display:block;font-size:12px;font-weight:500;color:var(--color-text-primary);margin-bottom:6px;">Export Format</label>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
                  <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--color-surface-container-lowest);border-radius:var(--radius-md);border:1px solid var(--color-border);cursor:pointer;font-size:13px;font-weight:500;color:var(--color-text-primary);">
                    <span>Dotenv (.env)</span><input type="radio" name="export-format" value="dotenv" checked style="accent-color:#09090b;">
                  </label>
                  <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:var(--color-surface-container-lowest);border-radius:var(--radius-md);border:1px solid var(--color-border);cursor:pointer;font-size:13px;font-weight:500;color:var(--color-text-primary);">
                    <span>JSON (.json)</span><input type="radio" name="export-format" value="json" style="accent-color:#09090b;">
                  </label>
                </div>
              </div>

              <div style="padding-top:4px;">
                <button id="btn-export-env" class="btn btn-primary" type="button" style="width:100%;height:38px;background:#09090b;color:#fff;border-radius:var(--radius-md);font-size:13px;font-weight:500;display:flex;align-items:center;justify-content:center;gap:8px;" ${!environments.length ? 'disabled' : ''}>
                  <span class="material-symbols-outlined" style="font-size:18px;">download</span>
                  <span id="btn-export-text">Export Variables</span>
                </button>
              </div>
            </section>
          </div>

          <div id="import-preview-section"></div>
        </div>`;

    hookEvents();
  }

  function hookEvents() {
    const tabUpload = document.getElementById('tab-upload');
    const tabPaste = document.getElementById('tab-paste');
    const uploadPanel = document.getElementById('upload-panel');
    const pastePanel = document.getElementById('paste-panel');
    const dropzoneBox = document.getElementById('dropzone-box');
    const fileInput = document.getElementById('import-file-input');
    const fileInfoPill = document.getElementById('file-info-pill');
    const fileNameLabel = document.getElementById('file-name-label');
    const fileSizeLabel = document.getElementById('file-size-label');
    const textarea = document.getElementById('import-raw-textarea');
    const envSelect = document.getElementById('import-dest-env-select');
    const exportEnvSelect = document.getElementById('export-source-env-select');
    const overwriteCheckbox = document.getElementById('overwrite-existing-checkbox');
    const overwriteWarning = document.getElementById('overwrite-warning');

    tabUpload?.addEventListener('click', () => {
      activeInputMode = 'upload';
      tabUpload.style.backgroundColor = 'var(--color-surface-container-lowest)';
      tabUpload.style.color = 'var(--color-text-primary)';
      tabPaste.style.backgroundColor = 'transparent';
      tabPaste.style.color = 'var(--color-text-secondary)';
      uploadPanel.style.display = 'flex';
      pastePanel.style.display = 'none';
    });

    tabPaste?.addEventListener('click', () => {
      activeInputMode = 'paste';
      tabPaste.style.backgroundColor = 'var(--color-surface-container-lowest)';
      tabPaste.style.color = 'var(--color-text-primary)';
      tabUpload.style.backgroundColor = 'transparent';
      tabUpload.style.color = 'var(--color-text-secondary)';
      pastePanel.style.display = 'flex';
      uploadPanel.style.display = 'none';
    });

    overwriteCheckbox?.addEventListener('change', () => {
      overwriteWarning.style.display = overwriteCheckbox.checked ? 'block' : 'none';
      if (previewData) renderPreviewTable();
    });

    envSelect?.addEventListener('change', event => {
      selectedEnvId = Number(event.target.value);
      selectedEnv = environments.find(env => env.id === selectedEnvId) || null;
      previewData = null;
      document.getElementById('import-preview-section').innerHTML = '';
    });

    exportEnvSelect?.addEventListener('change', event => {
      const targetEnv = environments.find(env => env.id === Number(event.target.value));
      const nameElement = document.getElementById('export-target-env-name');
      if (nameElement && targetEnv) nameElement.textContent = targetEnv.name;
    });

    dropzoneBox?.addEventListener('click', event => {
      if (event.target.closest('#btn-remove-file')) return;
      fileInput?.click();
    });

    dropzoneBox?.addEventListener('dragover', event => {
      event.preventDefault();
      dropzoneBox.style.borderColor = 'var(--color-primary)';
    });

    dropzoneBox?.addEventListener('dragleave', () => {
      dropzoneBox.style.borderColor = 'var(--color-border-strong)';
    });

    dropzoneBox?.addEventListener('drop', event => {
      event.preventDefault();
      dropzoneBox.style.borderColor = 'var(--color-border-strong)';
      if (event.dataTransfer.files?.[0]) handleFile(event.dataTransfer.files[0]);
    });

    fileInput?.addEventListener('change', event => {
      if (event.target.files?.[0]) handleFile(event.target.files[0]);
    });

    document.getElementById('btn-remove-file')?.addEventListener('click', event => {
      event.stopPropagation();
      rawContent = '';
      previewData = null;
      if (textarea) textarea.value = '';
      if (fileInput) fileInput.value = '';
      fileInfoPill.style.display = 'none';
      document.getElementById('import-preview-section').innerHTML = '';
    });

    function handleFile(file) {
      if (file.size > 512 * 1024) {
        window.showToast?.('File Too Large', 'Choose a file smaller than 512 KB.', 'error');
        return;
      }

      fileNameLabel.textContent = file.name;
      fileSizeLabel.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
      fileInfoPill.style.display = 'flex';

      const reader = new FileReader();

      reader.onload = event => {
        rawContent = String(event.target.result || '');
        if (textarea) textarea.value = rawContent;
        previewData = null;
        document.getElementById('import-preview-section').innerHTML = '';
      };

      reader.onerror = () => {
        window.showToast?.('File Read Failed', 'The selected file could not be read.', 'error');
      };

      reader.readAsText(file);
    }

    document.getElementById('btn-preview-import')?.addEventListener('click', async () => {
      if (!selectedEnvId) {
        window.showToast?.('Environment Required', 'Select a target environment first.', 'error');
        return;
      }

      if (activeInputMode === 'paste') rawContent = textarea?.value || '';

      if (!rawContent.trim()) {
        window.showToast?.('No Content', 'Select a .env file or paste content to preview.', 'error');
        return;
      }

      const button = document.getElementById('btn-preview-import');

      try {
        button.disabled = true;
        window.showToast?.('Parsing .env', 'Checking syntax and existing environment keys...', 'info');

        previewData = await previewEnvImport(activeProject.id, selectedEnvId, { content: rawContent });

        if (!previewData.valid) {
          window.showToast?.('Parser Error', previewData.errors?.join('; ') || 'Invalid syntax.', 'error');
          return;
        }

        renderPreviewTable();
      } catch (error) {
        window.showToast?.('Preview Failed', error.message, 'error');
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById('btn-export-env')?.addEventListener('click', async () => {
      const targetEnvId = Number(exportEnvSelect?.value || selectedEnvId);
      const targetEnv = environments.find(env => env.id === targetEnvId) || selectedEnv;
      const format = document.querySelector('input[name="export-format"]:checked')?.value || 'dotenv';
      const button = document.getElementById('btn-export-env');
      const buttonText = document.getElementById('btn-export-text');

      if (!targetEnv) {
        window.showToast?.('Environment Required', 'Select an environment to export.', 'error');
        return;
      }

      try {
        button.disabled = true;
        buttonText.textContent = 'Decrypting & Exporting...';

        const variables = await listVariables(activeProject.id, targetEnv.id);
        if (!variables?.length) {
          window.showToast?.('Export Unavailable', 'No variables exist in this environment.', 'warning');
          return;
        }

        const decryptedVars = {};
        for (const variable of variables) {
          const result = await revealVariable(activeProject.id, targetEnv.id, variable.id);
          decryptedVars[variable.key] = result.value;
        }

        let fileData;
        let fileName;
        let mimeType;

        if (format === 'json') {
          fileData = JSON.stringify(decryptedVars, null, 2);
          fileName = `${safeFileName(targetEnv.name)}-env.json`;
          mimeType = 'application/json;charset=utf-8';
        } else {
          fileData = Object.entries(decryptedVars)
            .map(([key, value]) => `${key}=${formatEnvValue(value)}`)
            .join('\n') + '\n';
          fileName = `.env.${safeFileName(targetEnv.name)}`;
          mimeType = 'text/plain;charset=utf-8';
        }

        const blob = new Blob([fileData], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        window.showToast?.('Export Successful', `Saved ${fileName}`, 'success');
      } catch (error) {
        window.showToast?.('Export Failed', error.message, 'error');
      } finally {
        button.disabled = false;
        buttonText.textContent = 'Export Variables';
      }
    });
  }

  function renderPreviewTable() {
    const previewSection = document.getElementById('import-preview-section');
    if (!previewSection || !previewData) return;

    const variables = previewData.variables || [];
    const total = previewData.total ?? variables.length;
    const overwriteExisting =
      document.getElementById('overwrite-existing-checkbox')?.checked === true;

    const countStatus = status => variables.filter(v => v.status === status).length;
    const newCount = previewData.new_count ?? countStatus('new');
    const updateCount = previewData.update_count ?? countStatus('update');
    const unchangedCount = previewData.unchanged_count ??
      (countStatus('unchanged') + countStatus('already_exists'));
    const restoreCount = previewData.restore_count ?? countStatus('can_restore');

    // Legacy "already_exists" responses are treated as conflicts.
    const conflictCount = updateCount + countStatus('already_exists');
    const canImport = total > 0 && (overwriteExisting || conflictCount === 0);

    const rows = variables.map(variable => {
      let label;
      let badgeClass;

      switch (variable.status) {
        case 'update':
          label = overwriteExisting ? 'Will update' : 'Overwrite required';
          badgeClass = overwriteExisting ? 'badge-warning' : 'badge-error';
          break;
        case 'unchanged':
        case 'already_exists':
          label = 'Unchanged';
          badgeClass = 'badge-code';
          break;
        case 'can_restore':
          label = 'Will restore';
          badgeClass = 'badge-warning';
          break;
        default:
          label = 'New variable';
          badgeClass = 'badge-prod';
      }

      return `
          <tr style="border-bottom:1px solid var(--color-border);">
            <td style="padding:10px 16px;font-family:var(--font-mono);font-weight:500;color:var(--color-text-primary);">${escapeHtml(variable.key)}</td>
            <td style="padding:10px 16px;"><span class="badge ${badgeClass} badge-code">${label}</span></td>
            <td style="padding:10px 16px;text-align:right;font-family:var(--font-mono);color:var(--color-text-muted);letter-spacing:.1em;user-select:none;">••••••••••••</td>
          </tr>`;
    }).join('');

    previewSection.innerHTML = `
        <div class="table-surface-card" style="border:1px solid var(--color-border);border-radius:var(--radius-lg);background:var(--color-surface-container-lowest);overflow:hidden;margin-top:1rem;">
          <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--color-border);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.5rem;background:var(--color-canvas);">
            <div>
              <h3 style="font-size:14px;font-weight:600;color:var(--color-text-primary);margin:0;">Import Preview (${total} keys found)</h3>
              <p style="font-size:12px;color:var(--color-text-secondary);margin:4px 0 0;">
                ${newCount} new · ${updateCount} changed · ${unchangedCount} unchanged · ${restoreCount} to restore
              </p>
              <p style="font-size:12px;color:var(--color-text-secondary);margin:4px 0 0;">
                ${conflictCount
        ? overwriteExisting
          ? 'Changed existing values will be replaced after confirmation.'
          : 'Enable overwrite to replace changed existing values.'
        : 'No changed-value conflicts detected.'}
              </p>
            </div>
            <span style="font-size:12px;font-weight:500;padding:2px 8px;border-radius:4px;background:var(--color-surface-container-lowest);border:1px solid var(--color-border);color:var(--color-text-secondary);">Validation: Passed</span>
          </div>

          ${conflictCount && overwriteExisting ? `
            <div style="padding:12px 16px;background:var(--color-canvas);border-bottom:1px solid var(--color-border);font-size:12px;line-height:1.5;color:var(--color-text-secondary);">
              Previous values should be retained in variable version history. Unchanged values will not be modified.
            </div>` : ''}

          <div class="table-wrapper" style="max-height:280px;overflow-y:auto;">
            <table class="data-table" style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="border-bottom:1px solid var(--color-border);background:var(--color-surface-container-low);font-size:11px;text-transform:uppercase;color:var(--color-text-secondary);letter-spacing:.04em;">
                  <th style="padding:8px 16px;text-align:left;">Key</th>
                  <th style="padding:8px 16px;text-align:left;">Action / Status</th>
                  <th style="padding:8px 16px;text-align:right;">Value (Masked)</th>
                </tr>
              </thead>
              <tbody style="font-size:13px;">
                ${rows || '<tr><td colspan="3" style="padding:16px;">No variables to import.</td></tr>'}
              </tbody>
            </table>
          </div>

          <div style="padding:.875rem 1.25rem;border-top:1px solid var(--color-border);background:var(--color-canvas);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1rem;">
            <span style="font-size:12px;color:var(--color-text-secondary);">${total} variable(s) shown</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <button id="btn-cancel-preview" class="btn btn-secondary" type="button" style="height:34px;padding:0 14px;font-size:13px;border-radius:var(--radius-md);">Cancel</button>
              <button id="btn-confirm-import" class="btn btn-primary" type="button" ${canImport ? '' : 'disabled'} style="height:34px;padding:0 16px;background:#09090b;color:#fff;font-size:13px;font-weight:500;border-radius:var(--radius-md);display:flex;align-items:center;gap:6px;${canImport ? '' : 'opacity:.5;cursor:not-allowed;'}">
                <span class="material-symbols-outlined" style="font-size:16px;">check</span>
                <span>Confirm Import</span>
              </button>
            </div>
          </div>
        </div>`;

    document.getElementById('btn-cancel-preview')?.addEventListener('click', () => {
      previewSection.innerHTML = '';
    });

    document.getElementById('btn-confirm-import')?.addEventListener('click', async () => {
      const confirmButton = document.getElementById('btn-confirm-import');
      const shouldOverwrite =
        document.getElementById('overwrite-existing-checkbox')?.checked === true;

      if (conflictCount && !shouldOverwrite) {
        window.showToast?.('Import Blocked', 'Changed existing variables were found. Enable overwrite to replace them.', 'error');
        return;
      }

      if (shouldOverwrite && conflictCount) {
        const confirmed = window.confirm(
          `This import will replace ${conflictCount} existing variable(s). Previous values should remain in version history. Continue?`
        );
        if (!confirmed) return;
      }

      try {
        confirmButton.disabled = true;
        confirmButton.textContent = 'Importing...';

        const result = await commitEnvImport(
          activeProject.id,
          selectedEnvId,
          rawContent,
          true,
          shouldOverwrite
        );

        const processedCount = result.imported_count ?? total;
        const unchangedResult = result.unchanged_count ?? unchangedCount;

        window.showToast?.(
          'Import Succeeded',
          result.message || `Processed ${processedCount} variable(s).`,
          'success'
        );

        previewSection.innerHTML = `
            <div class="empty-state-card" style="padding:2.5rem;background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-lg);margin-top:1rem;">
              <div class="empty-state-icon" style="background:var(--color-prod-bg);color:var(--color-prod-text);">
                <span class="material-symbols-outlined">check_circle</span>
              </div>
              <h3 class="font-headline-md" style="margin:.5rem 0 .25rem;color:var(--color-text-primary);">Import Completed Successfully</h3>
              <p class="font-body-sm" style="color:var(--color-text-secondary);max-width:440px;margin:0 auto 1rem;">
                ${result.created_count ?? newCount} created · ${result.updated_count ?? updateCount} updated · ${unchangedResult} unchanged · ${result.restored_count ?? restoreCount} restored.
              </p>
              <button id="btn-view-variables" class="btn btn-primary" type="button" style="height:36px;padding:0 16px;background:#09090b;color:#fff;border-radius:var(--radius-md);">
                <span>View in Variables</span>
                <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
              </button>
            </div>`;

        document.getElementById('btn-view-variables')?.addEventListener('click', () => {
          window.location.hash = '#variables';
        });
      } catch (error) {
        window.showToast?.('Import Failed', error.message, 'error');
        confirmButton.disabled = false;
        confirmButton.innerHTML = `
            <span class="material-symbols-outlined" style="font-size:16px;">check</span>
            <span>Confirm Import</span>`;
      }
    });
  }
}

function formatEnvValue(value) {
  const text = String(value ?? '');

  if (text === '') return '""';

  if (/[\s"'#]/.test(text)) {
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
  }

  return text;
}

function safeFileName(value) {
  return String(value || 'environment')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'environment';
}

function escapeHtml(value) {
  if (value == null) return '';

  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
