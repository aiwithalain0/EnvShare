/**
 * EnvShare Team Members & Invite Codes Management View
 * Aligned with Google Stitch design system
 */

import { store } from '../store.js';
import {
  listProjectMembers,
  removeProjectMember,
  listInviteCodes,
  createInviteCode,
  revokeInviteCode,
  listProjects
} from '../api.js';

export async function renderTeamMembersView(container) {
  let activeProject = (typeof store.getCurrentProject === 'function' ? store.getCurrentProject() : null)
    || store.getState?.()?.projects?.activeProject
    || null;

  let projects = (typeof store.getProjects === 'function' ? store.getProjects() : null)
    || store.getState?.()?.projects?.list
    || [];

  if (projects.length === 0) {
    try {
      projects = await listProjects();
      if (typeof store.setProjects === 'function') {
        store.setProjects(projects);
      }
    } catch (err) {
      projects = [];
    }
  }

  // If no project selected in store, check if there are projects available
  if (!activeProject && projects.length > 0) {
    activeProject = projects[0];
    if (typeof store.setCurrentProject === 'function') {
      store.setCurrentProject(activeProject);
    } else if (typeof store.setActiveProject === 'function') {
      store.setActiveProject(activeProject);
    }
  }

  if (!activeProject) {
    container.innerHTML = `
      <div style="padding: 3rem 1rem; text-align: center;">
        <div class="empty-state-icon">
          <span class="material-symbols-outlined">group</span>
        </div>
        <h3 class="font-headline-sm" style="margin: 0.5rem 0 0.25rem 0;">No Project Selected</h3>
        <p class="font-body-sm" style="color: var(--color-text-secondary); max-width: 360px; margin: 0 auto 1.25rem auto;">
          You need an active project to manage team members and invite codes. Create a project to begin.
        </p>
        <button class="btn btn-primary" onclick="window.openNewProjectModal()" style="height: 36px; padding: 0 14px; background-color: #09090b; color: #fff; border-radius: var(--radius-md);">
          <span class="material-symbols-outlined" style="font-size: 16px;">add</span>
          <span>Create Project</span>
        </button>
      </div>
    `;
    return;
  }

  const projectId = activeProject.id;
  const projectName = activeProject.name;
  const currentUser = store.getUser();

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 2rem; max-width: 1080px;">
      <!-- Header Section -->
      <div style="display: flex; flex-direction: column; gap: 0.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1.25rem;">
        <div style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--color-text-secondary); letter-spacing: 0.05em;">
          <span>Access Control</span>
          <span>/</span>
          <span>Team & Invitations</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem;">
          <div>
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
              <h1 class="font-headline-lg" style="margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.02em; color: var(--color-text-primary);">Team & Invitations</h1>
              ${projects.length > 1 ? `
                <select id="team-project-select" class="input-control" style="height: 32px; font-size: 12px; font-weight: 600; padding: 2px 8px; width: auto; max-width: 220px; border-radius: var(--radius-md);">
                  ${projects.map(p => `<option value="${p.id}" ${p.id === projectId ? 'selected' : ''}>Vault: ${escapeHtml(p.name)}</option>`).join('')}
                </select>
              ` : ''}
            </div>
            <p class="font-body-sm" style="margin-top: 4px; color: var(--color-text-secondary);">
              Manage member roles and generate cryptographically secure invite codes for <code style="font-family: var(--font-mono); font-size: 13px; font-weight: 500; padding: 2px 6px; border-radius: 4px; background-color: var(--color-surface-container-low); border: 1px solid var(--color-border);">${escapeHtml(projectName)}</code>.
            </p>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button id="btn-open-create-invite" class="btn btn-primary" type="button" style="height: 36px; padding: 0 14px; background-color: #09090b; color: #fff; border-radius: var(--radius-md); font-size: 13px; font-weight: 500;">
              <span class="material-symbols-outlined" style="font-size: 16px;">key</span>
              <span>Generate Invite Code</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Card 1: Project Members -->
      <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); overflow: hidden;">
        <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; background-color: var(--color-surface-container-low);">
          <div>
            <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--color-text-primary);">Active Members</h3>
            <span style="font-size: 12px; color: var(--color-text-secondary);">Users with direct access to this vault</span>
          </div>
          <button id="btn-refresh-members" class="btn btn-secondary btn-icon" title="Refresh members" style="height: 30px; width: 30px;">
            <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
          </button>
        </div>
        <div class="table-wrapper">
          <table class="data-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border); background-color: var(--color-surface-container-lowest); font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--color-text-secondary); letter-spacing: 0.05em;">
                <th style="padding: 10px 16px; text-align: left;">Member</th>
                <th style="padding: 10px 16px; text-align: left;">Role</th>
                <th style="padding: 10px 16px; text-align: left;">Joined Date</th>
                <th style="padding: 10px 16px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody id="members-table-body" style="font-size: 13px;">
              <tr>
                <td colspan="4" style="text-align: center; padding: 2rem;">
                  <div class="spinner"></div>
                  <div style="margin-top: 0.5rem; color: var(--color-text-secondary); font-size: 12px;">Loading members...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Card 2: Active Invite Codes -->
      <div class="table-surface-card" style="border: 1px solid var(--color-border); border-radius: var(--radius-lg); background-color: var(--color-surface-container-lowest); overflow: hidden;">
        <div style="padding: 1rem 1.25rem; border-bottom: 1px solid var(--color-border); display: flex; align-items: center; justify-content: space-between; background-color: var(--color-surface-container-low); flex-wrap: wrap; gap: 8px;">
          <div>
            <h3 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--color-text-primary);">Project Invite Codes</h3>
            <span style="font-size: 12px; color: var(--color-text-secondary);">Codes generated for joining this project without email delivery</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="btn-card-create-invite" class="btn btn-primary btn-sm" type="button" style="height: 30px; font-size: 12px; padding: 0 12px; background-color: #09090b; color: #fff; border-radius: var(--radius-md);">
              <span class="material-symbols-outlined" style="font-size: 15px;">key</span>
              <span>Generate Code</span>
            </button>
            <button id="btn-refresh-invites" class="btn btn-secondary btn-icon" title="Refresh codes" style="height: 30px; width: 30px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">refresh</span>
            </button>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="data-table" style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="border-bottom: 1px solid var(--color-border); background-color: var(--color-surface-container-lowest); font-size: 11px; text-transform: uppercase; font-weight: 600; color: var(--color-text-secondary); letter-spacing: 0.05em;">
                <th style="padding: 10px 16px; text-align: left;">Invite Code</th>
                <th style="padding: 10px 16px; text-align: left;">Role Assigned</th>
                <th style="padding: 10px 16px; text-align: left;">Uses</th>
                <th style="padding: 10px 16px; text-align: left;">Expires</th>
                <th style="padding: 10px 16px; text-align: left;">Status</th>
                <th style="padding: 10px 16px; text-align: right;">Action</th>
              </tr>
            </thead>
            <tbody id="invites-table-body" style="font-size: 13px;">
              <tr>
                <td colspan="6" style="text-align: center; padding: 2rem;">
                  <div class="spinner"></div>
                  <div style="margin-top: 0.5rem; color: var(--color-text-secondary); font-size: 12px;">Loading invite codes...</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  // Attach handlers
  document.getElementById('btn-refresh-members')?.addEventListener('click', loadMembers);
  document.getElementById('btn-refresh-invites')?.addEventListener('click', loadInvites);

  document.getElementById('team-project-select')?.addEventListener('change', (e) => {
    const selectedId = parseInt(e.target.value, 10);
    const chosen = projects.find(p => p.id === selectedId);
    if (chosen) {
      store.setCurrentProject(chosen);
      renderTeamMembersView(container);
    }
  });

  const triggerModal = () => openGenerateInviteModal(projectId, projectName);
  document.getElementById('btn-open-create-invite')?.addEventListener('click', triggerModal);
  document.getElementById('btn-card-create-invite')?.addEventListener('click', triggerModal);

  async function loadMembers() {
    const tbody = document.getElementById('members-table-body');
    if (!tbody) return;
    try {
      const members = await listProjectMembers(projectId);
      if (!members || members.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 1.5rem; color: var(--color-text-secondary);">
              No members found.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = members.map(m => {
        const isSelf = currentUser && (m.user_id === currentUser.id || m.email === currentUser.email);
        const joinedDate = m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'Active';
        const roleBadge = m.role === 'owner' ? 'badge-prod' : m.role === 'admin' ? 'badge-stg' : 'badge-dev';
        const canRemove = !isSelf && m.role !== 'owner';

        return `
          <tr style="border-bottom: 1px solid var(--color-border);">
            <td style="padding: 12px 16px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 30px; height: 30px; border-radius: 50%; background-color: var(--color-surface-container-high); border: 1px solid var(--color-border-strong); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: var(--color-text-primary);">
                  ${(m.email ? m.email.substring(0, 2) : 'US').toUpperCase()}
                </div>
                <div>
                  <div style="font-weight: 500; color: var(--color-text-primary); display: flex; align-items: center; gap: 6px;">
                    <span>${escapeHtml(m.email)}</span>
                    ${isSelf ? '<span style="font-size: 11px; color: var(--color-text-secondary);">(You)</span>' : ''}
                  </div>
                  <div style="font-size: 11px; color: var(--color-text-muted); font-family: var(--font-mono);">ID #${m.user_id}</div>
                </div>
              </div>
            </td>
            <td style="padding: 12px 16px;">
              <span class="badge ${roleBadge}" style="font-size: 11px; text-transform: uppercase;">${escapeHtml(m.role)}</span>
            </td>
            <td style="padding: 12px 16px; color: var(--color-text-secondary); font-size: 12px;">
              ${joinedDate}
            </td>
            <td style="padding: 12px 16px; text-align: right;">
              ${canRemove ? `
                <button class="btn btn-ghost btn-icon btn-remove-member" data-user-id="${m.user_id}" data-email="${escapeHtml(m.email)}" title="Remove Member" style="height: 28px; width: 28px; color: var(--color-error);">
                  <span class="material-symbols-outlined" style="font-size: 16px;">person_remove</span>
                </button>
              ` : `
                <span style="font-size: 11px; color: var(--color-text-muted);">Protected</span>
              `}
            </td>
          </tr>
        `;
      }).join('');

      // Wire up remove member buttons
      tbody.querySelectorAll('.btn-remove-member').forEach(btn => {
        btn.addEventListener('click', () => {
          const userId = btn.getAttribute('data-user-id');
          const email = btn.getAttribute('data-email');
          window.openConfirmationModal?.({
            title: 'Remove Member',
            message: `Are you sure you want to remove <strong>${email}</strong> from this project? They will immediately lose access to all environments and variables.`,
            confirmText: 'Remove Member',
            isDanger: true,
            onConfirm: async () => {
              await removeProjectMember(projectId, userId);
              window.showToast?.('Member Removed', `${email} was removed from the project.`, 'success');
              await loadMembers();
            }
          });
        });
      });

    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 1.5rem; color: var(--color-error); font-size: 13px;">
            Failed to load members: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  async function loadInvites() {
    const tbody = document.getElementById('invites-table-body');
    if (!tbody) return;
    try {
      const invites = await listInviteCodes(projectId);
      if (!invites || invites.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 2.5rem 1rem;">
              <p style="color: var(--color-text-secondary); margin: 0 0 1rem 0; font-size: 13px;">
                No invite codes generated yet for <strong>${escapeHtml(projectName)}</strong>.
              </p>
              <button id="btn-empty-create-invite" class="btn btn-primary" type="button" style="height: 36px; padding: 0 16px; background-color: #09090b; color: #fff; font-size: 13px; font-weight: 500; border-radius: var(--radius-md);">
                <span class="material-symbols-outlined" style="font-size: 16px;">key</span>
                <span>Generate Invite Code</span>
              </button>
            </td>
          </tr>
        `;
        document.getElementById('btn-empty-create-invite')?.addEventListener('click', triggerModal);
        return;
      }

      const now = new Date();

      tbody.innerHTML = invites.map(inv => {
        const isRevoked = inv.is_revoked;
        const expiresAt = inv.expires_at ? new Date(inv.expires_at) : null;
        const isExpired = expiresAt && expiresAt < now;
        const isExhausted = inv.uses_count >= inv.max_uses;

        let statusBadge = '<span class="badge badge-prod">Active</span>';
        if (isRevoked) {
          statusBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.1); color: var(--color-error); border: 1px solid var(--color-error);">Revoked</span>';
        } else if (isExpired) {
          statusBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #d97706; border: 1px solid #d97706;">Expired</span>';
        } else if (isExhausted) {
          statusBadge = '<span class="badge" style="background: var(--color-surface-container-high); color: var(--color-text-secondary);">Exhausted</span>';
        }

        const canRevoke = !isRevoked;
        const expStr = expiresAt ? expiresAt.toLocaleDateString() : 'Never';

        return `
          <tr style="border-bottom: 1px solid var(--color-border); ${isRevoked ? 'opacity: 0.6;' : ''}">
            <td style="padding: 12px 16px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <code style="font-family: var(--font-mono); font-size: 13px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: var(--color-surface-container-low); border: 1px solid var(--color-border); color: var(--color-text-primary); letter-spacing: 0.05em;">
                  ${escapeHtml(inv.code)}
                </code>
                <button class="btn btn-secondary btn-icon btn-copy-code" data-code="${escapeHtml(inv.code)}" title="Copy code to clipboard" style="height: 26px; width: 26px;">
                  <span class="material-symbols-outlined" style="font-size: 14px;">content_copy</span>
                </button>
              </div>
            </td>
            <td style="padding: 12px 16px; font-size: 12px; text-transform: uppercase; font-weight: 500;">
              ${escapeHtml(inv.role)}
            </td>
            <td style="padding: 12px 16px; font-size: 12px; font-family: var(--font-mono);">
              ${inv.uses_count} / ${inv.max_uses}
            </td>
            <td style="padding: 12px 16px; font-size: 12px; color: var(--color-text-secondary);">
              ${expStr}
            </td>
            <td style="padding: 12px 16px;">
              ${statusBadge}
            </td>
            <td style="padding: 12px 16px; text-align: right;">
              ${canRevoke ? `
                <button class="btn btn-secondary btn-sm btn-revoke-code" data-invite-id="${inv.id}" data-code="${escapeHtml(inv.code)}" style="font-size: 11px; height: 26px; padding: 0 8px; color: var(--color-error); border-color: rgba(239, 68, 68, 0.3);">
                  Revoke
                </button>
              ` : `
                <span style="font-size: 11px; color: var(--color-text-muted);">Revoked</span>
              `}
            </td>
          </tr>
        `;
      }).join('');

      // Wire up copy buttons
      tbody.querySelectorAll('.btn-copy-code').forEach(btn => {
        btn.addEventListener('click', async () => {
          const code = btn.getAttribute('data-code');
          await copyToClipboard(code, btn);
        });
      });

      // Wire up revoke buttons
      tbody.querySelectorAll('.btn-revoke-code').forEach(btn => {
        btn.addEventListener('click', () => {
          const inviteId = btn.getAttribute('data-invite-id');
          const code = btn.getAttribute('data-code');
          window.openConfirmationModal?.({
            title: 'Revoke Invite Code',
            message: `Are you sure you want to revoke invite code <code>${code}</code>? Anyone attempting to use this code will be rejected.`,
            confirmText: 'Revoke Code',
            isDanger: true,
            onConfirm: async () => {
              await revokeInviteCode(projectId, inviteId);
              window.showToast?.('Invite Code Revoked', `Code ${code} has been revoked.`, 'info');
              await loadInvites();
            }
          });
        });
      });

    } catch (err) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 1.5rem; color: var(--color-error); font-size: 13px;">
            Failed to load invite codes: ${err.message}
          </td>
        </tr>
      `;
    }
  }

  function openGenerateInviteModal(pId, pName) {
    window.openGlobalModal?.({
      title: 'Generate Project Invite Code',
      bodyHtml: `
        <div id="invite-form-container" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin: 0; line-height: 1.5;">
            Create a unique, unpredictable invite code for <strong>${escapeHtml(pName)}</strong>. Team members can use this code to join instantly without email verification.
          </p>

          <div style="display: flex; flex-direction: column; gap: 6px;">
            <label class="form-label" for="invite-role-input">Granted Role</label>
            <select id="invite-role-input" class="input-control" style="height: 38px;">
              <option value="member" selected>Member (Read variables & decrypt)</option>
              <option value="manager">Manager (Read, write & rollback variables)</option>
            </select>
            <div class="form-label-desc">For security, invite codes cannot grant elevated owner/admin rights.</div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label class="form-label" for="invite-max-uses-input">Usage Limit</label>
              <input id="invite-max-uses-input" type="number" class="input-control" min="1" max="100" value="5" required style="height: 38px;">
              <div class="form-label-desc">Max successful joins.</div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label class="form-label" for="invite-expires-input">Expiration (Days)</label>
              <input id="invite-expires-input" type="number" class="input-control" min="1" max="365" value="7" required style="height: 38px;">
              <div class="form-label-desc">Valid duration from now.</div>
            </div>
          </div>

          <div id="invite-modal-error" style="display: none; padding: 0.625rem; border-radius: var(--radius-md); background: rgba(239, 68, 68, 0.1); border: 1px solid var(--color-error); color: var(--color-error); font-size: 13px;"></div>
        </div>

        <div id="invite-result-container" style="display: none; flex-direction: column; gap: 1rem; padding: 1rem; border-radius: var(--radius-lg); background-color: var(--color-surface-container-low); border: 1px solid var(--color-border);">
          <div style="display: flex; align-items: center; gap: 8px; color: var(--color-prod);">
            <span class="material-symbols-outlined" style="font-size: 20px;">check_circle</span>
            <span style="font-weight: 600; font-size: 14px;">Invite Code Ready</span>
          </div>
          <p class="font-body-sm" style="color: var(--color-text-secondary); margin: 0;">
            Share this code directly with invited members. They can enter it under <strong>Join Project</strong>.
          </p>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input id="generated-code-display" type="text" readonly class="input-control font-mono" style="font-size: 16px; font-weight: 700; letter-spacing: 0.08em; text-align: center; height: 42px; background: var(--color-surface-container-lowest);">
            <button id="btn-copy-generated-code" class="btn btn-primary" type="button" style="height: 42px; padding: 0 16px; background-color: #09090b; color: #fff; flex-shrink: 0;">
              <span class="material-symbols-outlined" style="font-size: 16px;">content_copy</span>
              <span>Copy Code</span>
            </button>
          </div>
        </div>
      `,
      footerHtml: `
        <button id="invite-modal-cancel-btn" type="button" class="btn btn-secondary" onclick="window.closeGlobalModal()">Close</button>
        <button id="invite-modal-generate-btn" type="button" class="btn btn-primary" style="background-color: #09090b; color: #fff;">
          <span class="material-symbols-outlined" style="font-size: 16px;">add_link</span>
          <span>Generate Code</span>
        </button>
      `
    });

    const generateBtn = document.getElementById('invite-modal-generate-btn');
    const cancelBtn = document.getElementById('invite-modal-cancel-btn');
    const formContainer = document.getElementById('invite-form-container');
    const resultContainer = document.getElementById('invite-result-container');
    const codeDisplay = document.getElementById('generated-code-display');
    const copyBtn = document.getElementById('btn-copy-generated-code');
    const errorEl = document.getElementById('invite-modal-error');

    generateBtn?.addEventListener('click', async () => {
      const role = document.getElementById('invite-role-input').value;
      const maxUses = parseInt(document.getElementById('invite-max-uses-input').value, 10);
      const expiresInDays = parseInt(document.getElementById('invite-expires-input').value, 10);

      if (isNaN(maxUses) || maxUses < 1) {
        errorEl.textContent = 'Please provide a valid usage limit (at least 1).';
        errorEl.style.display = 'block';
        return;
      }
      if (isNaN(expiresInDays) || expiresInDays < 1) {
        errorEl.textContent = 'Please provide a valid expiration in days (at least 1).';
        errorEl.style.display = 'block';
        return;
      }

      errorEl.style.display = 'none';
      generateBtn.disabled = true;
      generateBtn.innerHTML = '<span class="spinner"></span> Generating...';

      try {
        const invite = await createInviteCode(pId, {
          role,
          max_uses: maxUses,
          expires_in_days: expiresInDays,
        });
        formContainer.style.display = 'none';
        resultContainer.style.display = 'flex';
        codeDisplay.value = invite.code;
        generateBtn.style.display = 'none';
        cancelBtn.textContent = 'Done';

        copyBtn.onclick = async () => {
          await copyToClipboard(invite.code, copyBtn);
        };

        window.showToast?.('Code Generated', `Invite code created for ${pName}.`, 'success');
        await loadInvites();
      } catch (err) {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size: 16px;">add_link</span><span>Generate Code</span>';
        errorEl.textContent = err.message || 'Failed to generate invite code.';
        errorEl.style.display = 'block';
      }
    });
  }

  // Initial loads
  await Promise.all([loadMembers(), loadInvites()]);
}

async function copyToClipboard(text, btnEl) {
  try {
    await navigator.clipboard.writeText(text);
    if (btnEl) {
      const originalHtml = btnEl.innerHTML;
      btnEl.innerHTML = '<span class="material-symbols-outlined" style="font-size: 14px;">check</span><span>Copied</span>';
      setTimeout(() => { btnEl.innerHTML = originalHtml; }, 2000);
    }
    window.showToast?.('Copied to Clipboard', text, 'info', 2000);
  } catch {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    window.showToast?.('Copied to Clipboard', text, 'info', 2000);
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
