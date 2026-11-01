
import {
  listEnvironmentFiles,
  getEnvironmentFileContent,
  createEnvironmentFileCommit,
  listEnvironmentFileCommits,
  getEnvironmentFileHistory,
  getEnvironmentFileVersion,
  compareEnvironmentFileVersions,
  renameEnvironmentFile,
  deleteEnvironmentFile,
  restoreEnvironmentFile,
  copyEnvironmentFile,
  restoreEnvironmentFileVersion,
} from '../api.js';

export function mountEnvironmentFiles(container, projectId, getEnvironmentId) {
  let files = [];
  let staged = new Map();

  const escapeHtml = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[char]);

  const envId = () => getEnvironmentId();

  // Render GitHub-style unified diff with safe HTML escaping.
  function renderEnvironmentDiff(diffLines) {
    let oldLine = 0;
    let newLine = 0;

    if (!diffLines || diffLines.length === 0) {
      return '<div class="env-diff-empty">No differences found.</div>';
    }

    const lines = diffLines.map((line) => {
      if (line.startsWith('@@')) {
        const match = line.match(
          /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/
        );

        if (match) {
          oldLine = Number(match[1]);
          newLine = Number(match[3]);
        }

        return `
          <div class="env-diff-hunk">
            ${escapeHtml(line)}
          </div>
        `;
      }

      if (line.startsWith('---') || line.startsWith('+++')) {
        return `
          <div class="env-diff-header">
            ${escapeHtml(line)}
          </div>
        `;
      }

      let type = 'context';
      let oldNumber = '';
      let newNumber = '';

      if (line.startsWith('+')) {
        type = 'added';
        newNumber = newLine++;
      } else if (line.startsWith('-')) {
        type = 'deleted';
        oldNumber = oldLine++;
      } else {
        oldNumber = oldLine++;
        newNumber = newLine++;
      }

      const content = line.startsWith('+') || line.startsWith('-')
        ? line.slice(1)
        : line.startsWith(' ')
          ? line.slice(1)
          : line;

      const sign = type === 'added'
        ? '+'
        : type === 'deleted'
          ? '-'
          : ' ';

      return `
        <div class="env-diff-line env-diff-${type}">
          <span class="env-diff-number">${oldNumber}</span>
          <span class="env-diff-number">${newNumber}</span>
          <span class="env-diff-sign">${sign}</span>
          <span class="env-diff-content">${escapeHtml(content)}</span>
        </div>
      `;
    }).join('');

    return `<div class="env-diff-view">${lines}</div>`;
  }

  container.innerHTML = `
    <section style="border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:16px;margin:12px 0">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div>
          <h2 style="font-size:16px;font-weight:600;margin:0">Environment Files</h2>
          <p style="font-size:12px;color:var(--color-text-secondary);margin:4px 0 0">
            Complete .env files with version history and commits.
          </p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="env-file-new" class="btn btn-secondary" type="button">New File</button>
          <button id="env-file-commit" class="btn btn-primary" type="button" disabled>Commit Changes <span id="env-file-staged-count">0</span></button>
          <button id="env-file-timeline" class="btn btn-secondary" type="button">Commit History</button>
        </div>
      </div>
      <div id="env-file-list" style="margin-top:14px">
        <p style="color:var(--color-text-secondary);font-size:13px">Loading files...</p>
      </div>
      <div id="env-file-staged" style="display:none;margin-top:12px;padding-top:10px;border-top:1px solid var(--color-border);font-size:12px;color:var(--color-text-secondary)"></div>
    </section>
  `;

  const listElement = container.querySelector('#env-file-list');
  const commitButton = container.querySelector('#env-file-commit');
  const stagedCount = container.querySelector('#env-file-staged-count');
  const stagedElement = container.querySelector('#env-file-staged');

  function updateStagedUI() {
    stagedCount.textContent = staged.size;
    commitButton.disabled = staged.size === 0;
    stagedElement.style.display = staged.size ? 'block' : 'none';
    stagedElement.textContent = staged.size
      ? `${staged.size} file change(s) staged. They will be saved in one commit.`
      : '';
  }

  async function load() {
    if (!envId()) {
      listElement.innerHTML = '<p style="color:var(--color-text-secondary);font-size:13px">Select an environment to manage files.</p>';
      return;
    }

    listElement.innerHTML = '<p style="color:var(--color-text-secondary);font-size:13px">Loading files...</p>';

    try {
      files = await listEnvironmentFiles(projectId, envId());
      render();
    } catch (error) {
      listElement.innerHTML = `<p style="color:var(--color-error);font-size:13px">${escapeHtml(error.message)}</p>`;
    }
  }

  function render() {
    if (!files.length) {
      listElement.innerHTML = `
        <div style="padding:18px 0;text-align:center;color:var(--color-text-secondary);font-size:13px">
          No environment files yet. Create a file to get started.
        </div>`;
      return;
    }

    listElement.innerHTML = `
      <div style="display:flex;flex-direction:column">
        ${files.map((file) => `
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--color-border);flex-wrap:wrap">
            <div style="min-width:0">
              <div style="font-family:monospace;font-size:13px;font-weight:600;overflow-wrap:anywhere">${escapeHtml(file.filename)}</div>
              <div style="font-size:11px;color:var(--color-text-secondary);margin-top:4px">Version ${file.version_number} · Updated ${escapeHtml(file.updated_at || '')}</div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              <button class="btn btn-secondary" data-action="copy" data-id="${file.id}" type="button">Copy</button>
              <button class="btn btn-secondary" data-action="edit" data-id="${file.id}" type="button">Edit</button>
              <button class="btn btn-secondary" data-action="history" data-id="${file.id}" data-name="${escapeHtml(file.filename)}" type="button">History</button>
              <button class="btn btn-ghost" data-action="rename" data-id="${file.id}" type="button">Rename</button>
              <button class="btn btn-ghost" data-action="delete" data-id="${file.id}" type="button" style="color:var(--color-error)">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    listElement.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = Number(button.dataset.id);
        const file = files.find((item) => item.id === id);
        if (!file) return;

        if (button.dataset.action === 'copy') copyFile(file);
        if (button.dataset.action === 'edit') openEditorForExisting(file);
        if (button.dataset.action === 'history') openHistory(file);
        if (button.dataset.action === 'rename') renameFile(file);
        if (button.dataset.action === 'delete') deleteFile(file);
      });
    });
  }

  function openEditor(file = null, initialContent = '') {
    const isNew = !file;

    window.openGlobalModal({
      title: isNew ? 'Create Environment File' : `Edit ${file.filename}`,
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:12px">
          <label class="form-label" for="env-file-name">Filename</label>
          <input id="env-file-name" class="input-control font-mono" type="text"
            value="${escapeHtml(file?.filename || '')}" placeholder=".env.local" ${isNew ? '' : 'readonly'}>
          <label class="form-label" for="env-file-content">File content</label>
          <textarea id="env-file-content" class="input-control font-mono" spellcheck="false"
            style="min-height:300px;resize:vertical;white-space:pre;overflow:auto"></textarea>
          <div id="env-file-editor-error" style="display:none;color:var(--color-error);font-size:12px"></div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" type="button" onclick="window.closeGlobalModal()">Cancel</button>
        <button id="env-file-stage" class="btn btn-primary" type="button">Stage ${isNew ? 'File' : 'Changes'}</button>
      `,
    });

    document.getElementById('env-file-content').value = initialContent;

    document.getElementById('env-file-stage').addEventListener('click', () => {
      const filename = document.getElementById('env-file-name').value.trim();
      const content = document.getElementById('env-file-content').value;
      const error = document.getElementById('env-file-editor-error');

      if (!filename || /[/\\\0]/.test(filename) || filename === '.' || filename === '..') {
        error.textContent = 'Enter a valid filename without directory separators.';
        error.style.display = 'block';
        return;
      }

      if (!content.trim()) {
        error.textContent = 'File content cannot be empty.';
        error.style.display = 'block';
        return;
      }

      staged.set(filename, { filename, content });
      updateStagedUI();
      window.closeGlobalModal();
    });
  }

  async function copyFile(file, versionNumber = null) {
    try {
      const result = await copyEnvironmentFile(
        projectId,
        envId(),
        file.id,
        versionNumber
      );

      let content = result.content;

      if (typeof content !== 'string') {
        throw new Error('The server returned invalid file content.');
      }

      await navigator.clipboard.writeText(content);
      content = null;

      window.showToast?.(
        'File Copied',
        `${file.filename} was copied with its original values.`,
        'success'
      );
    } catch (error) {
      window.showToast?.('Copy Failed', error.message, 'error');
    }
  }

  async function openEditorForExisting(file) {
    try {
      const result = await getEnvironmentFileContent(projectId, envId(), file.id);
      openEditor(file, result.content);
    } catch (error) {
      window.showToast?.('Unable to Open File', error.message, 'error');
    }
  }

  async function commitStaged() {
    if (!staged.size) return;

    window.openGlobalModal({
      title: 'Commit File Changes',
      bodyHtml: `
        <div style="display:flex;flex-direction:column;gap:10px">
          <p style="font-size:13px;color:var(--color-text-secondary);margin:0">${staged.size} file(s) will be included in this commit.</p>
          <label class="form-label" for="env-file-commit-message">Commit message</label>
          <input id="env-file-commit-message" class="input-control" maxlength="500" placeholder="Update environment configuration">
          <div id="env-file-commit-error" style="display:none;color:var(--color-error);font-size:12px"></div>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" type="button" onclick="window.closeGlobalModal()">Cancel</button>
        <button id="env-file-commit-save" class="btn btn-primary" type="button">Commit Changes</button>
      `,
    });

    document.getElementById('env-file-commit-save').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      const message = document.getElementById('env-file-commit-message').value.trim();
      const errorElement = document.getElementById('env-file-commit-error');

      if (!message) {
        errorElement.textContent = 'Enter a commit message.';
        errorElement.style.display = 'block';
        return;
      }

      button.disabled = true;

      try {
        await createEnvironmentFileCommit(
          projectId,
          envId(),
          message,
          Array.from(staged.values())
        );

        staged.clear();
        updateStagedUI();
        window.closeGlobalModal();
        window.showToast?.('Commit Created', 'File changes were saved successfully.', 'success');
        await load();
      } catch (error) {
        button.disabled = false;
        errorElement.textContent = error.message;
        errorElement.style.display = 'block';
      }
    });
  }

  async function openHistory(file) {
    window.openGlobalModal({
      title: `History: ${file.filename}`,
      bodyHtml: '<div id="env-file-history-body" style="font-size:13px">Loading history...</div>',
      footerHtml: '<button class="btn btn-secondary" type="button" onclick="window.closeGlobalModal()">Close</button>',
    });

    const body = document.getElementById('env-file-history-body');

    try {
      const history = await getEnvironmentFileHistory(projectId, envId(), file.id);

      if (!history.length) {
        body.textContent = 'No file history found.';
        return;
      }

      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px">
          ${history.map((version) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid var(--color-border);padding:8px 0;flex-wrap:wrap">
              <span>Version ${version.version_number} · ${escapeHtml(version.created_at || '')}</span>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary" data-version="${version.version_number}" data-action="view">View</button>
                <button class="btn btn-secondary" data-version="${version.version_number}" data-action="copy">Copy</button>
                <button class="btn btn-secondary" data-version="${version.version_number}" data-action="restore">Restore</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:14px;border-top:1px solid var(--color-border);padding-top:12px">
          <div style="font-weight:600;margin-bottom:8px">Compare versions</div>

          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <select id="env-file-from-version" class="input-control">
              ${history.map(v => `<option value="${v.version_number}">${v.version_number}</option>`).join('')}
            </select>

            <select id="env-file-to-version" class="input-control">
              ${history.map(v => `<option value="${v.version_number}" ${v.version_number === history[0].version_number ? 'selected' : ''}>${v.version_number}</option>`).join('')}
            </select>

            <button id="env-file-compare" class="btn btn-secondary" type="button">Compare</button>
          </div>

          <div id="env-file-diff" class="env-diff-container" style="margin-top:12px">
            <div class="env-diff-empty">Select two versions and click Compare.</div>
          </div>
        </div>
      `;

      body.querySelectorAll('[data-action="view"]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            const version = await getEnvironmentFileVersion(
              projectId,
              envId(),
              file.id,
              Number(button.dataset.version)
            );

            window.openGlobalModal({
              title: `${file.filename} · Version ${version.version_number}`,
              bodyHtml: '<textarea id="env-file-version-content" class="input-control font-mono" readonly style="min-height:360px;white-space:pre;overflow:auto"></textarea>',
              footerHtml: '<button class="btn btn-secondary" type="button" onclick="window.closeGlobalModal()">Close</button>',
            });

            document.getElementById('env-file-version-content').value = version.content;
          } catch (error) {
            window.showToast?.('Unable to Load Version', error.message, 'error');
          }
        });
      });

      body.querySelectorAll('[data-action="copy"]').forEach((button) => {
        button.addEventListener('click', () => {
          copyFile(file, Number(button.dataset.version));
        });
      });

      body.querySelectorAll('[data-action="restore"]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            const versionNumber = Number(button.dataset.version);

            await restoreEnvironmentFileVersion(
              projectId,
              envId(),
              file.id,
              versionNumber
            );

            window.closeGlobalModal();
            window.showToast?.('Version Restored', `Created a new version from version ${version.version_number}.`, 'success');
            await load();
          } catch (error) {
            window.showToast?.('Restore Failed', error.message, 'error');
          }
        });
      });

      document.getElementById('env-file-compare').addEventListener('click', async () => {
        const from = Number(document.getElementById('env-file-from-version').value);
        const to = Number(document.getElementById('env-file-to-version').value);
        const diffElement = document.getElementById('env-file-diff');
        const compareButton = document.getElementById('env-file-compare');

        compareButton.disabled = true;
        diffElement.innerHTML = '<div class="env-diff-empty">Comparing versions...</div>';

        try {
          const result = await compareEnvironmentFileVersions(
            projectId,
            envId(),
            file.id,
            from,
            to
          );

          diffElement.innerHTML = renderEnvironmentDiff(result.diff);
        } catch (error) {
          diffElement.textContent = error.message;
        } finally {
          compareButton.disabled = false;
        }
      });
    } catch (error) {
      body.textContent = error.message;
    }
  }

  async function renameFile(file) {
    const nextName = window.prompt('Enter the new filename:', file.filename);
    if (!nextName || nextName.trim() === file.filename) return;

    try {
      await renameEnvironmentFile(projectId, envId(), file.id, nextName.trim());
      window.showToast?.('File Renamed', 'Filename updated successfully.', 'success');
      await load();
    } catch (error) {
      window.showToast?.('Rename Failed', error.message, 'error');
    }
  }

  async function deleteFile(file) {
    if (!window.confirm(`Move ${file.filename} to deleted files? Its history will be retained.`)) return;

    try {
      await deleteEnvironmentFile(projectId, envId(), file.id);
      window.showToast?.('File Deleted', `${file.filename} was moved to deleted files.`, 'success');
      await load();
    } catch (error) {
      window.showToast?.('Delete Failed', error.message, 'error');
    }
  }

  async function openTimeline() {
    window.openGlobalModal({
      title: 'File Commit History',
      bodyHtml: '<div id="env-file-timeline-body" style="font-size:13px">Loading commits...</div>',
      footerHtml: '<button class="btn btn-secondary" type="button" onclick="window.closeGlobalModal()">Close</button>',
    });

    const body = document.getElementById('env-file-timeline-body');

    try {
      const commits = await listEnvironmentFileCommits(projectId, envId());

      if (!commits.length) {
        body.textContent = 'No commits found.';
        return;
      }

      body.innerHTML = commits.map((commit) => `
        <div style="padding:10px 0;border-bottom:1px solid var(--color-border)">
          <div style="font-weight:600">${escapeHtml(commit.message)}</div>
          <div style="font-size:11px;color:var(--color-text-secondary);margin:4px 0">${escapeHtml(commit.created_at || '')}</div>
          ${(commit.files || []).map((item) => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0">
              <span style="font-family:monospace">${escapeHtml(item.filename)}</span>
              <span style="font-size:11px;color:var(--color-text-secondary)">${escapeHtml(item.change_type)}</span>
              ${item.change_type === 'deleted' ? `<button class="btn btn-secondary" data-restore-id="${item.file_id}" type="button">Restore File</button>` : ''}
            </div>
          `).join('')}
        </div>
      `).join('');

      body.querySelectorAll('[data-restore-id]').forEach((button) => {
        button.addEventListener('click', async () => {
          try {
            await restoreEnvironmentFile(
              projectId,
              envId(),
              Number(button.dataset.restoreId)
            );

            window.closeGlobalModal();
            window.showToast?.('File Restored', 'The deleted file was restored.', 'success');
            await load();
          } catch (error) {
            window.showToast?.('Restore Failed', error.message, 'error');
          }
        });
      });
    } catch (error) {
      body.textContent = error.message;
    }
  }

  container.querySelector('#env-file-new').addEventListener('click', () => openEditor());
  container.querySelector('#env-file-commit').addEventListener('click', commitStaged);
  container.querySelector('#env-file-timeline').addEventListener('click', openTimeline);

  load();

  return { reload: load };
}
