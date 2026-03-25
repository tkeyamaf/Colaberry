/* =========================================
   CareerBridge — app.js
   Single-page app: auth, jobs, dashboard
   Pure vanilla JS, no external libraries
   ========================================= */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_BASE = '';
const TOKEN_KEY = 'cb_token';
const USER_KEY  = 'cb_user';
const UUID_RE   = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MESSAGES = {
  FIT_THRESHOLD:      'Your fit score is below the minimum required threshold of 70. Try improving your profile score.',
  JOB_CAP:            'This job has reached its maximum allocation limit of 12 placements this week. Check back next week.',
  COMPANY_CAP:        'This company has reached its weekly allocation limit of 30 placements. Try other companies.',
  STUDENT_WEEKLY_CAP: "You've reached your weekly application limit of 5. New slots open next Monday.",
  COOLDOWN:           'You recently applied to this job. You must wait for your cooldown period to expire before reapplying.',
  JOB_NOT_FOUND:      "We couldn't find this job in our system. Please verify the Job ID.",
  COMPANY_MISMATCH:   "The Company ID doesn't match this job's employer. Please double-check both IDs.",
};

const SECTIONS = ['home', 'jobs', 'eligibility', 'recommendations', 'profile', 'dashboard', 'about'];

// ---------------------------------------------------------------------------
// Application State
// ---------------------------------------------------------------------------
const state = {
  currentUser: null,   // null when logged out
  token: null,         // JWT token string
  jobs: [],            // cached job listing array
  savedJobIds: new Set(), // set of job IDs saved by the current user
};

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function isUuid(val) {
  return UUID_RE.test((val || '').trim());
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function authHeaders() {
  return state.token ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.token}` }
                     : { 'Content-Type': 'application/json' };
}

function setFieldError(inputEl, errorEl, msg) {
  if (msg) {
    if (inputEl) inputEl.classList.add('invalid');
    if (errorEl) errorEl.textContent = msg;
  } else {
    if (inputEl) inputEl.classList.remove('invalid');
    if (errorEl) errorEl.textContent = '';
  }
}

function clearFieldErrors(...ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
    const input = document.getElementById(id.replace(/-err$/, ''));
    if (input) input.classList.remove('invalid');
  });
}

// ---------------------------------------------------------------------------
// Toast Notifications
// ---------------------------------------------------------------------------
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || '💬'}</span><span>${escHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3000);
}

// ---------------------------------------------------------------------------
// Navigation / Section Management
// ---------------------------------------------------------------------------
let jobsLoaded = false;
let jobsCurrentPage = 1;
const JOBS_PER_PAGE = 12;

function showSection(name) {
  if (!SECTIONS.includes(name)) name = 'home';

  // Protect dashboard
  if (name === 'dashboard' && !state.currentUser) {
    renderDashboardGate();
  }

  // Protect profile
  if (name === 'profile') {
    if (!state.currentUser) {
      showProfileGate();
    } else {
      showProfileForm();
    }
  }

  SECTIONS.forEach(id => {
    const el = document.getElementById(`section-${id}`);
    if (el) el.classList.toggle('active', id === name);
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === name);
  });

  closeMenu();
  history.replaceState(null, '', `#${name}`);
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (name === 'jobs' && !jobsLoaded) loadJobs();
  if (name === 'dashboard' && state.currentUser) loadDashboard();
  if (name === 'eligibility') populateEligJobSelect();
  if (name === 'recommendations') prefillRecommendations();
}

function closeMenu() {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
  if (hamburger) { hamburger.classList.remove('open'); hamburger.setAttribute('aria-expanded', 'false'); }
  if (navLinks)  navLinks.classList.remove('open');
}

// ---------------------------------------------------------------------------
// Auth: Update nav based on login state
// ---------------------------------------------------------------------------
function updateNav() {
  const navAuth  = document.getElementById('nav-auth');
  const navUser  = document.getElementById('nav-user');
  const userName = document.getElementById('nav-user-name');
  const avatar   = document.getElementById('nav-avatar');

  if (state.currentUser) {
    if (navAuth) navAuth.style.display = 'none';
    if (navUser) navUser.style.display = 'flex';
    if (userName) userName.textContent = state.currentUser.fullName?.split(' ')[0] || 'You';
    if (avatar)   avatar.textContent   = (state.currentUser.fullName || 'U')[0].toUpperCase();
  } else {
    if (navAuth) navAuth.style.display = 'flex';
    if (navUser) navUser.style.display = 'none';
  }
}

// ---------------------------------------------------------------------------
// Auth: Check localStorage token on page load
// ---------------------------------------------------------------------------
async function checkAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;

  state.token = token;

  // Try to restore from localStorage cache first for instant UI
  const cached = localStorage.getItem(USER_KEY);
  if (cached) {
    try { state.currentUser = JSON.parse(cached); } catch { /* ignore */ }
  }

  // Then verify with server
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, { headers: authHeaders() });
    if (res.ok) {
      const user = await res.json();
      state.currentUser = user;
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      // Token expired or invalid
      clearAuth();
    }
  } catch {
    // Network error — keep cached user if present
  }

  updateNav();
}

function clearAuth() {
  state.currentUser = null;
  state.token = null;
  state.savedJobIds = new Set();
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ---------------------------------------------------------------------------
// Auth: Signup
// ---------------------------------------------------------------------------
async function signup(fullName, email, password) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password }),
    });
  } catch {
    throw new Error('Could not connect. Please try again.');
  }
  const data = await res.json();
  if (res.status === 409) throw new Error('An account with this email already exists');
  if (!res.ok) throw new Error(data.error || 'Signup failed');
  return data;
}

// ---------------------------------------------------------------------------
// Auth: Login
// ---------------------------------------------------------------------------
async function login(email, password) {
  let res;
  try {
    res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error('Could not connect. Please try again.');
  }
  const data = await res.json();
  if (res.status === 401) throw new Error('Invalid email or password');
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

// ---------------------------------------------------------------------------
// Auth: Logout
// ---------------------------------------------------------------------------
function logout() {
  clearAuth();
  updateNav();
  jobsLoaded = false;
  showSection('home');
  showToast('You have been logged out.', 'info');
}

// ---------------------------------------------------------------------------
// Jobs: Load & Render
// ---------------------------------------------------------------------------
async function loadJobs(query = '', statusFilter = '', locationFilter = '', typeFilter = '', sort = 'newest') {
  const grid  = document.getElementById('jobs-grid');
  const empty = document.getElementById('jobs-empty');
  const error = document.getElementById('jobs-error');

  if (!grid) return;

  // Show skeletons
  grid.innerHTML = [1,2,3,4,5,6].map(() =>
    `<div class="job-card skeleton-card">
       <div class="skel skel-h"></div>
       <div class="skel skel-m"></div>
       <div class="skel skel-s"></div>
     </div>`
  ).join('');
  if (empty) empty.style.display = 'none';
  if (error) error.style.display = 'none';
  grid.style.display = 'grid';

  // Hide onboarding strip for logged-in users
  const onboardingStrip = document.getElementById('jobs-onboarding-strip');
  if (onboardingStrip) onboardingStrip.style.display = state.currentUser ? 'none' : '';

  const params = new URLSearchParams();
  if (query)          params.set('search',   query);
  if (statusFilter)   params.set('status',   statusFilter);
  if (locationFilter) params.set('location', locationFilter);

  try {
    const res = await fetch(`${API_BASE}/api/jobs?${params}`);
    if (!res.ok) throw new Error('Failed to fetch jobs');

    const raw = await res.json();
    let jobs = Array.isArray(raw) ? raw : (raw.jobs || raw.data || []);

    // Client-side type filter — JSearch returns FULLTIME/PARTTIME/CONTRACTOR/INTERN
    if (typeFilter) {
      jobs = jobs.filter(j => {
        const t = (j.jobType || '').toUpperCase().replace(/[-_\s]/g, '');
        const f = typeFilter.toUpperCase().replace(/[-_\s]/g, '');
        return t.includes(f) || f.includes(t);
      });
    }

    // Client-side sort
    if (sort === 'remote') {
      jobs = [...jobs].sort((a, b) => {
        const aR = (a.location || '').toLowerCase().includes('remote') ? -1 : 1;
        const bR = (b.location || '').toLowerCase().includes('remote') ? -1 : 1;
        return aR - bR;
      });
    }

    state.jobs = jobs;

    if (state.currentUser) {
      await refreshSavedJobIds();
    }

    jobsLoaded = true;
    jobsCurrentPage = 1;

    if (jobs.length === 0) {
      grid.style.display = 'none';
      if (empty) empty.style.display = 'block';
    } else {
      renderJobsPage();
    }

    // Show fit score badge if logged in
    const fitBadge = document.getElementById('jobs-fit-badge');
    const fitVal   = document.getElementById('jobs-fit-score-val');
    if (fitBadge && fitVal && state.currentUser) {
      fitBadge.style.display = 'flex';
      fitVal.textContent = state.currentUser.fitScore ?? '—';
    }
  } catch (err) {
    console.error('loadJobs error:', err);
    grid.style.display = 'none';
    if (error) error.style.display = 'block';
  }
}

function renderJobsPage() {
  const grid  = document.getElementById('jobs-grid');
  const empty = document.getElementById('jobs-empty');
  if (!grid) return;

  const jobs = state.jobs;
  const totalPages = Math.ceil(jobs.length / JOBS_PER_PAGE);
  const start = (jobsCurrentPage - 1) * JOBS_PER_PAGE;
  const pageJobs = jobs.slice(start, start + JOBS_PER_PAGE);

  if (empty) empty.style.display = 'none';
  grid.style.display = 'grid';
  grid.innerHTML = pageJobs.map(job => renderJobCard(job, { showSave: true, showApply: true })).join('');

  // Render pagination controls
  let pager = document.getElementById('jobs-pagination');
  if (!pager) {
    pager = document.createElement('div');
    pager.id = 'jobs-pagination';
    pager.className = 'jobs-pagination';
    grid.parentNode.insertBefore(pager, grid.nextSibling);
  }

  if (totalPages <= 1) {
    pager.innerHTML = '';
    return;
  }

  const pages = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - jobsCurrentPage) <= 2) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '…') {
      pages.push('…');
    }
  }

  pager.innerHTML = `
    <button class="page-btn" onclick="goToJobsPage(${jobsCurrentPage - 1})" ${jobsCurrentPage === 1 ? 'disabled' : ''}>← Prev</button>
    ${pages.map(p => p === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<button class="page-btn ${p === jobsCurrentPage ? 'page-btn--active' : ''}" onclick="goToJobsPage(${p})">${p}</button>`
    ).join('')}
    <button class="page-btn" onclick="goToJobsPage(${jobsCurrentPage + 1})" ${jobsCurrentPage === totalPages ? 'disabled' : ''}>Next →</button>
    <span class="page-info">Page ${jobsCurrentPage} of ${totalPages} · ${jobs.length} jobs</span>
  `;

  // Scroll to top of jobs section smoothly
  document.getElementById('section-jobs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goToJobsPage(page) {
  const totalPages = Math.ceil(state.jobs.length / JOBS_PER_PAGE);
  if (page < 1 || page > totalPages) return;
  jobsCurrentPage = page;
  renderJobsPage();
}

async function refreshSavedJobIds() {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/saved`, { headers: authHeaders() });
    if (res.ok) {
      const saved = await res.json();
      state.savedJobIds = new Set(saved.map(j => j.job_id));
    }
  } catch { /* silent */ }
}

function renderJobCard(job, options = {}) {
  const { showSave = false, showApply = false, showRemove = false } = options;
  const status = (job.status || 'OPEN').toUpperCase();
  const statusClass = status === 'OPEN' ? 'open' : status === 'REOPENED' ? 'reopened' : 'closed';
  const fitMin = job.fitScoreMin ?? job.fit_score_min ?? 70;
  const isSaved = state.savedJobIds.has(job.id || job.job_id);
  const jobUrl = job.url || job.jobUrl || '';
  const isRemote = (job.location || '').toLowerCase().includes('remote');

  const saveBtn = showSave
    ? `<button class="btn-save ${isSaved ? 'saved' : ''}" data-job-id="${escHtml(job.id)}" onclick="toggleSaveJob(this)"
         title="${isSaved ? 'Unsave job' : 'Save job'}" aria-label="${isSaved ? 'Unsave' : 'Save'}">
         ${isSaved ? '❤️' : '🤍'}
       </button>`
    : '';

  const viewJobBtn = jobUrl
    ? `<a class="btn btn-primary btn-sm btn-apply-link" href="${escHtml(jobUrl)}" target="_blank" rel="noopener noreferrer">Apply Now ↗</a>`
    : `<button class="btn btn-sm btn-apply-disabled" disabled>Apply Link Coming Soon</button>`;

  const eligBtn = `<button class="btn btn-outline btn-sm" onclick="goCheckEligibility('${escHtml(job.id || job.job_id)}')">Check Eligibility</button>`;

  const expressBtn = showApply
    ? `<button class="btn btn-ghost btn-sm" onclick="applyToJobById('${escHtml(job.id)}')">Express Interest</button>`
    : '';

  const removeBtn = showRemove
    ? `<button class="btn btn-outline btn-sm" onclick="removeSavedJob('${escHtml(job.job_id || job.id)}', this)">Remove</button>`
    : '';

  const postedDate = job.createdAt ? formatDate(job.createdAt) : null;

  return `
    <div class="job-card" data-job-id="${escHtml(job.id || job.job_id)}">
      <div class="job-card-top">
        <div class="job-card-title-wrap">
          <div class="job-title">${escHtml(job.title || job.job_title)}</div>
          <div class="job-company">${escHtml(job.company)}</div>
        </div>
        <span class="status-badge status-badge--${statusClass}">${escHtml(status)}</span>
      </div>
      <div class="job-meta">
        <div class="job-location">📍 ${escHtml(job.location || 'Location not specified')}</div>
        ${postedDate ? `<div class="job-posted">🗓 ${escHtml(postedDate)}</div>` : ''}
      </div>
      <div class="job-tags">
        ${job.jobType ? `<span class="job-type-badge">${escHtml(job.jobType)}</span>` : ''}
        ${isRemote ? `<span class="job-type-badge job-type-badge--remote">Remote</span>` : ''}
      </div>
      <p class="job-desc">${escHtml((job.description || '').slice(0, 160) + ((job.description || '').length > 160 ? '…' : ''))}</p>
      <div class="job-fit-bar-wrap">
        <div class="job-fit-label">Min fit score: ${escHtml(String(fitMin))}</div>
        <div class="job-fit-bar"><div class="job-fit-fill" style="width:${fitMin}%"></div></div>
      </div>
      <div class="job-actions">
        <div class="job-actions-primary">
          ${viewJobBtn}
          ${eligBtn}
        </div>
        <div class="job-actions-secondary">
          ${saveBtn}
          ${expressBtn}
          ${removeBtn}
        </div>
      </div>
    </div>
  `;
}

function goCheckEligibility(jobId) {
  showSection('eligibility');
  // Pre-select the job in the eligibility dropdown
  setTimeout(() => {
    const sel = document.getElementById('elig-job-select');
    if (sel && jobId) {
      sel.value = jobId;
      sel.dispatchEvent(new Event('change'));
    }
    if (state.currentUser) {
      const sidInput = document.getElementById('elig-student-id');
      if (sidInput && !sidInput.value) sidInput.value = state.currentUser.studentId || '';
    }
  }, 100);
}

// ---------------------------------------------------------------------------
// Jobs: Save / Unsave
// ---------------------------------------------------------------------------
async function toggleSaveJob(btn) {
  if (!state.currentUser) {
    openModal('login-modal');
    return;
  }
  const jobId = btn.dataset.jobId;
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;

  const isSaved = state.savedJobIds.has(jobId);
  btn.disabled = true;

  try {
    if (isSaved) {
      const res = await fetch(`${API_BASE}/api/jobs/save/${encodeURIComponent(jobId)}`, {
        method: 'DELETE', headers: authHeaders(),
      });
      if (res.ok) {
        state.savedJobIds.delete(jobId);
        btn.classList.remove('saved');
        showToast('Job removed from saved.', 'info');
      }
    } else {
      const res = await fetch(`${API_BASE}/api/jobs/save`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          url: job.url,
          status: job.status,
        }),
      });
      if (res.ok) {
        state.savedJobIds.add(jobId);
        btn.classList.add('saved');
        showToast('Job saved! View it in your dashboard.', 'success');
      }
    }
  } catch {
    showToast('Could not save job. Please try again.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function removeSavedJob(jobId, btn) {
  if (!state.currentUser) return;
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/api/jobs/save/${encodeURIComponent(jobId)}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    if (res.ok) {
      state.savedJobIds.delete(jobId);
      const card = document.querySelector(`[data-job-id="${jobId}"]`);
      if (card) card.remove();
      showToast('Job removed from saved.', 'info');
      // Refresh dashboard counts
      updateDashboardCounts();
    }
  } catch {
    showToast('Could not remove job.', 'error');
    if (btn) btn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Jobs: Apply
// ---------------------------------------------------------------------------
async function applyToJobById(jobId) {
  if (!state.currentUser) {
    openModal('login-modal');
    return;
  }
  const job = state.jobs.find(j => j.id === jobId);
  if (!job) return;
  await applyToJob(job);
}

async function applyToJob(job) {
  try {
    const res = await fetch(`${API_BASE}/api/jobs/apply`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jobId: job.id || job.job_id,
        jobTitle: job.title || job.job_title,
        company: job.company,
        location: job.location,
        url: job.url,
      }),
    });
    if (res.status === 401) { openModal('login-modal'); return; }
    if (res.ok) {
      showToast(`Applied to ${job.title || job.job_title} at ${job.company}!`, 'success');
      // Open job link if available
      if (job.url) window.open(job.url, '_blank', 'noopener');
    } else {
      const data = await res.json();
      showToast(data.message || data.error || 'Could not apply.', 'error');
    }
  } catch {
    showToast('Could not submit application. Please try again.', 'error');
  }
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function loadDashboard() {
  if (!state.currentUser) { renderDashboardGate(); return; }

  const content = document.getElementById('dashboard-content');
  const gate    = document.getElementById('dashboard-gate');
  if (gate)    gate.style.display    = 'none';
  if (content) content.style.display = 'block';

  try {
    const res = await fetch(`${API_BASE}/api/dashboard`, { headers: authHeaders() });
    if (res.status === 401) { renderDashboardGate(); return; }
    if (!res.ok) throw new Error('Dashboard load failed');

    const data = await res.json();
    renderDashboard(data);
  } catch (err) {
    console.error('loadDashboard error:', err);
    showToast('Could not load dashboard. Please refresh.', 'error');
  }
}

function renderDashboard(data) {
  const { user, savedJobs, recentApplications, savedJobsTotal, applicationsTotal } = data;

  // Header
  const welcome = document.getElementById('dash-welcome-name');
  const badge   = document.getElementById('dash-student-badge');
  if (welcome) welcome.textContent = `Welcome back, ${user.fullName?.split(' ')[0] || 'friend'}!`;
  if (badge)   badge.textContent   = user.studentNumber || '';

  // Fit score ring
  const fitVal  = document.getElementById('dash-fit-val');
  const ring    = document.getElementById('fit-progress-ring');
  if (fitVal) fitVal.textContent = user.fitScore ?? '—';
  if (ring && user.fitScore != null) {
    const circumference = 2 * Math.PI * 34; // r=34
    const offset = circumference - (user.fitScore / 100) * circumference;
    ring.style.strokeDashoffset = offset;
  }

  // Saved / apps counts — use server totals when available, fall back to array length
  const savedCount = document.getElementById('dash-saved-count');
  const appsCount  = document.getElementById('dash-apps-count');
  if (savedCount) savedCount.textContent = savedJobsTotal ?? savedJobs.length;
  if (appsCount)  appsCount.textContent  = applicationsTotal ?? recentApplications.length;

  // Profile completion %
  const profilePct = document.getElementById('dash-profile-pct');
  const profileBar = document.getElementById('dash-profile-bar');
  const profileHint= document.getElementById('dash-profile-hint');
  const pct = user.profileComplete ? 100 : 30;
  if (profilePct)  profilePct.textContent = `${pct}%`;
  if (profileBar)  profileBar.style.width  = `${pct}%`;
  if (profileHint) profileHint.textContent = user.profileComplete
    ? 'Great — your profile is complete!'
    : 'Complete your profile to unlock better job matches.';

  // Recent applications table
  const tbody     = document.getElementById('dash-apps-tbody');
  const appsEmpty = document.getElementById('dash-apps-empty');
  const appsTable = document.getElementById('dash-apps-table');
  if (tbody) {
    if (recentApplications.length === 0) {
      if (appsTable) appsTable.style.display = 'none';
      if (appsEmpty) appsEmpty.style.display = 'block';
    } else {
      if (appsTable) appsTable.style.display = 'table';
      if (appsEmpty) appsEmpty.style.display = 'none';
      tbody.innerHTML = recentApplications.map(app => {
        const status = (app.status || 'APPLIED').toUpperCase();
        const badgeClass = status === 'APPLIED' ? 'applied' : status === 'OPEN' ? 'open' : 'closed';
        return `<tr>
          <td><strong>${escHtml(app.job_title)}</strong></td>
          <td>${escHtml(app.company)}</td>
          <td><span class="status-badge status-badge--${badgeClass}">${escHtml(status)}</span></td>
          <td>${formatDate(app.applied_at)}</td>
        </tr>`;
      }).join('');
    }
  }

  // Saved jobs grid
  const savedGrid  = document.getElementById('dash-saved-grid');
  const savedEmpty = document.getElementById('dash-saved-empty');
  if (savedGrid) {
    if (savedJobs.length === 0) {
      savedGrid.style.display = 'none';
      if (savedEmpty) savedEmpty.style.display = 'block';
    } else {
      savedGrid.style.display = 'grid';
      if (savedEmpty) savedEmpty.style.display = 'none';
      savedGrid.innerHTML = savedJobs.map(sj => renderJobCard({
        id: sj.job_id,
        job_id: sj.job_id,
        title: sj.job_title,
        job_title: sj.job_title,
        company: sj.company,
        location: sj.location,
        url: sj.url,
        status: sj.status,
      }, { showRemove: true, showApply: true })).join('');
    }
  }

  // Update saved IDs set
  state.savedJobIds = new Set(savedJobs.map(j => j.job_id));
}

function updateDashboardCounts() {
  // Refresh dashboard if it's visible
  const dashSection = document.getElementById('section-dashboard');
  if (dashSection && dashSection.classList.contains('active') && state.currentUser) {
    loadDashboard();
  }
}

function renderDashboardGate() {
  const content = document.getElementById('dashboard-content');
  const gate    = document.getElementById('dashboard-gate');
  if (gate)    gate.style.display    = 'block';
  if (content) content.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Profile Page
// ---------------------------------------------------------------------------
function showProfileGate() {
  const gate = document.getElementById('profile-gate');
  const form = document.getElementById('profile-form');
  if (gate) gate.style.display = 'block';
  if (form) form.style.display = 'none';
}

function showProfileForm() {
  const gate = document.getElementById('profile-gate');
  const form = document.getElementById('profile-form');
  if (gate) gate.style.display = 'none';
  if (form) form.style.display = 'block';

  // Pre-fill name and email from state
  if (state.currentUser) {
    const nameEl  = document.getElementById('p-full-name');
    const emailEl = document.getElementById('p-email');
    const cityEl  = document.getElementById('p-city');
    const stateEl = document.getElementById('p-state');
    const phoneEl = document.getElementById('p-phone');
    if (nameEl  && !nameEl.value)  nameEl.value  = state.currentUser.fullName  || '';
    if (emailEl && !emailEl.value) emailEl.value = state.currentUser.email     || '';
    if (cityEl  && !cityEl.value)  cityEl.value  = state.currentUser.city      || '';
    if (stateEl && !stateEl.value) stateEl.value = state.currentUser.state     || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = state.currentUser.phone     || '';
  }
}

// ---------------------------------------------------------------------------
// Tags Input
// ---------------------------------------------------------------------------
function setupTagsInput(inputId, tagsId, hiddenId) {
  const input  = document.getElementById(inputId);
  const tags   = document.getElementById(tagsId);
  const hidden = document.getElementById(hiddenId);
  if (!input || !tags || !hidden) return;

  const tagValues = [];

  function renderTags() {
    tags.innerHTML = tagValues.map((v, i) =>
      `<span class="tag">${escHtml(v)} <button type="button" class="tag-remove" data-idx="${i}" aria-label="Remove ${escHtml(v)}">×</button></span>`
    ).join('');
    hidden.value = tagValues.join(',');

    tags.querySelectorAll('.tag-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        tagValues.splice(Number(btn.dataset.idx), 1);
        renderTags();
      });
    });
  }

  input.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ',') && input.value.trim()) {
      e.preventDefault();
      const val = input.value.trim().replace(/,$/, '');
      if (val && !tagValues.includes(val)) {
        tagValues.push(val);
        renderTags();
      }
      input.value = '';
    }
  });

  // Click on wrap to focus input
  const wrap = document.getElementById(inputId.replace('-input', '-wrap'));
  if (wrap) wrap.addEventListener('click', () => input.focus());
}

// ---------------------------------------------------------------------------
// Resume Drag & Drop
// ---------------------------------------------------------------------------
function setupResumeDropZone() {
  const zone     = document.getElementById('resume-drop-zone');
  const fileInput= document.getElementById('resume-file');
  const fileLabel= document.getElementById('resume-file-name');
  if (!zone || !fileInput) return;

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) showResumeFile(file, fileLabel);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) showResumeFile(fileInput.files[0], fileLabel);
  });
}

function showResumeFile(file, labelEl) {
  if (!labelEl) return;
  labelEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
  labelEl.style.display = 'block';
  showToast('Resume selected. Save your profile to upload.', 'info');
}

// ---------------------------------------------------------------------------
// Eligibility Checker
// ---------------------------------------------------------------------------
function populateEligJobSelect() {
  const select = document.getElementById('elig-job-select');
  if (!select) return;

  // Load jobs first if not yet loaded
  if (state.jobs.length === 0 && !jobsLoaded) {
    loadJobs().then(() => populateEligJobSelect());
    return;
  }

  select.innerHTML = '<option value="">— select a job —</option>';
  state.jobs.slice(0, 50).forEach(j => {
    const opt = document.createElement('option');
    opt.value = JSON.stringify({ jobId: j.id, companyId: j.companyId || j.company_id || '' });
    opt.textContent = `${j.title} — ${j.company}`;
    select.appendChild(opt);
  });

  // Auto-fill student ID / fit score if logged in
  if (state.currentUser) {
    const studentIdEl = document.getElementById('elig-student-id');
    const fitEl       = document.getElementById('elig-fit-score');
    if (studentIdEl && !studentIdEl.value) studentIdEl.value = state.currentUser.id || '';
    if (fitEl       && !fitEl.value)       fitEl.value       = state.currentUser.fitScore ?? '';
  }
}

function setupEligJobSelect() {
  const select = document.getElementById('elig-job-select');
  if (!select) return;
  select.addEventListener('change', () => {
    if (!select.value) return;
    try {
      const parsed     = JSON.parse(select.value);
      const jobIdEl    = document.getElementById('elig-job-id');
      const companyIdEl= document.getElementById('elig-company-id');
      if (jobIdEl    && parsed.jobId)    jobIdEl.value     = parsed.jobId;
      if (companyIdEl && parsed.companyId) companyIdEl.value = parsed.companyId;
    } catch { /* ignore */ }
  });
}

async function checkEligibility() {
  const studentIdEl = document.getElementById('elig-student-id');
  const jobIdEl     = document.getElementById('elig-job-id');
  const companyIdEl = document.getElementById('elig-company-id');
  const fitScoreEl  = document.getElementById('elig-fit-score');
  const statusEl    = document.getElementById('elig-status');
  const resultEl    = document.getElementById('elig-result');
  const btn         = document.getElementById('elig-check-btn');

  clearFieldErrors('elig-student-id-err', 'elig-job-id-err', 'elig-company-id-err', 'elig-fit-score-err');
  if (resultEl) resultEl.style.display = 'none';

  const studentId = (studentIdEl?.value || '').trim();
  const jobId     = (jobIdEl?.value     || '').trim();
  const companyId = (companyIdEl?.value || '').trim();
  const fitScore  = Number(fitScoreEl?.value || 0);
  const jobStatus = statusEl?.value || 'OPEN';

  let hasError = false;
  if (!isUuid(studentId)) { setFieldError(studentIdEl, document.getElementById('elig-student-id-err'), 'Please enter a valid UUID'); hasError = true; }
  if (!isUuid(jobId))     { setFieldError(jobIdEl,     document.getElementById('elig-job-id-err'),     'Please enter a valid UUID'); hasError = true; }
  if (!isUuid(companyId)) { setFieldError(companyIdEl, document.getElementById('elig-company-id-err'), 'Please enter a valid UUID'); hasError = true; }
  if (isNaN(fitScore) || fitScore < 0 || fitScore > 100) {
    setFieldError(fitScoreEl, document.getElementById('elig-fit-score-err'), 'Enter a number between 0 and 100'); hasError = true;
  }
  if (hasError) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

  try {
    const params = new URLSearchParams({ studentId, jobId, companyId, fitScore, jobStatus });
    const res = await fetch(`${API_BASE}/allocate/check?${params}`);
    const data = await res.json();

    if (resultEl) {
      if (data.allowed) {
        resultEl.className = 'elig-result elig-result--allowed';
        resultEl.innerHTML = `<h3>✅ You're Eligible!</h3><p>Your profile meets the requirements for this position. You can proceed with your application.</p>`;
      } else {
        const msg = REASON_MESSAGES[data.reason] || data.reason || 'Not eligible.';
        resultEl.className = 'elig-result elig-result--denied';
        resultEl.innerHTML = `<h3>❌ Not Eligible</h3><p>${escHtml(msg)}</p>`;
      }
      resultEl.style.display = 'block';
      resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch {
    if (resultEl) {
      resultEl.className = 'elig-result elig-result--denied';
      resultEl.innerHTML = '<h3>Error</h3><p>Could not complete the eligibility check. Please try again.</p>';
      resultEl.style.display = 'block';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Check Eligibility'; }
  }
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------
function prefillRecommendations() {
  if (!state.currentUser) return;
  const studentIdEl = document.getElementById('rec-student-id');
  const fitEl       = document.getElementById('rec-fit-score');
  if (studentIdEl && !studentIdEl.value) studentIdEl.value = state.currentUser.id || '';
  if (fitEl       && !fitEl.value)       fitEl.value       = state.currentUser.fitScore ?? '';
}

async function loadRecommendations() {
  const studentIdEl = document.getElementById('rec-student-id');
  const fitScoreEl  = document.getElementById('rec-fit-score');
  const btn         = document.getElementById('rec-btn');
  const grid        = document.getElementById('rec-grid');
  const empty       = document.getElementById('rec-empty');
  const errorEl     = document.getElementById('rec-error');

  clearFieldErrors('rec-student-id-err', 'rec-fit-score-err');

  const studentId = (studentIdEl?.value || '').trim();
  const fitScore  = Number(fitScoreEl?.value || 0);

  let hasError = false;
  if (!isUuid(studentId)) {
    setFieldError(studentIdEl, document.getElementById('rec-student-id-err'), 'Please enter a valid UUID');
    hasError = true;
  }
  if (isNaN(fitScore) || fitScore < 0 || fitScore > 100) {
    setFieldError(fitScoreEl, document.getElementById('rec-fit-score-err'), 'Enter a number between 0 and 100');
    hasError = true;
  }
  if (hasError) return;

  if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
  if (grid)  { grid.style.display = 'none'; grid.innerHTML = ''; }
  if (empty) empty.style.display = 'none';
  if (errorEl) errorEl.style.display = 'none';

  try {
    const params = new URLSearchParams({ studentId, fitScore });
    const res = await fetch(`${API_BASE}/jobs/recommend?${params}`);

    if (res.status === 404) {
      if (empty) { empty.style.display = 'block'; }
      return;
    }
    if (!res.ok) throw new Error('Failed to load recommendations');

    const data = await res.json();
    const jobs = Array.isArray(data) ? data : (data.jobs || data.recommendations || []);

    if (jobs.length === 0) {
      if (empty) empty.style.display = 'block';
    } else {
      if (grid) {
        grid.style.display = 'grid';
        grid.innerHTML = jobs.map(j => renderJobCard(j, { showApply: true, showSave: !!state.currentUser })).join('');
      }
    }
  } catch {
    if (errorEl) {
      errorEl.className = 'error-state';
      errorEl.innerHTML = '<div class="empty-icon">⚠️</div><h3>Could not load recommendations</h3><p>Please check your student ID and try again.</p>';
      errorEl.style.display = 'block';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Get My Recommendations'; }
  }
}

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = 'flex';
    // Focus first input
    setTimeout(() => { const inp = modal.querySelector('input'); if (inp) inp.focus(); }, 50);
  }
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
  document.body.style.overflow = '';
}

// ---------------------------------------------------------------------------
// Login form
// ---------------------------------------------------------------------------
function setupLoginForm() {
  const form     = document.getElementById('login-form');
  const errorEl  = document.getElementById('login-error');
  const submitBtn= document.getElementById('login-submit-btn');
  const btnText  = document.getElementById('login-btn-text');
  const spinner  = document.getElementById('login-spinner');

  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearFieldErrors('login-email-err', 'login-password-err');
    if (errorEl) errorEl.style.display = 'none';

    const email    = document.getElementById('login-email')?.value.trim() || '';
    const password = document.getElementById('login-password')?.value      || '';

    let hasError = false;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(email)) {
      setFieldError(document.getElementById('login-email'), document.getElementById('login-email-err'), 'Please enter a valid email');
      hasError = true;
    }
    if (!password) {
      setFieldError(document.getElementById('login-password'), document.getElementById('login-password-err'), 'Password is required');
      hasError = true;
    }
    if (hasError) return;

    submitBtn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const data = await login(email, password);
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      closeAllModals();
      updateNav();
      showToast(`Welcome back, ${data.user.fullName?.split(' ')[0] || 'friend'}!`, 'success');
      showSection('dashboard');
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Invalid email or password';
        errorEl.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (spinner) spinner.style.display = 'none';
    }
  });

  // Forgot password
  const forgotBtn = document.getElementById('login-forgot-btn');
  const forgotMsg = document.getElementById('login-forgot-msg');
  if (forgotBtn) forgotBtn.addEventListener('click', () => {
    if (forgotMsg) forgotMsg.style.display = forgotMsg.style.display === 'none' ? 'block' : 'none';
  });

  // Toggle password visibility
  const pwToggle = document.getElementById('login-pw-toggle');
  const pwField  = document.getElementById('login-password');
  if (pwToggle && pwField) {
    pwToggle.addEventListener('click', () => {
      pwField.type = pwField.type === 'password' ? 'text' : 'password';
    });
  }

  // Switch to signup
  const toSignup = document.getElementById('login-to-signup');
  if (toSignup) toSignup.addEventListener('click', () => {
    closeModal('login-modal');
    openModal('signup-modal');
  });
}

// ---------------------------------------------------------------------------
// Signup form
// ---------------------------------------------------------------------------
function setupSignupForm() {
  const form     = document.getElementById('signup-form');
  const errorEl  = document.getElementById('signup-error');
  const submitBtn= document.getElementById('signup-submit-btn');
  const btnText  = document.getElementById('signup-btn-text');
  const spinner  = document.getElementById('signup-spinner');

  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearFieldErrors('signup-name-err','signup-email-err','signup-password-err','signup-confirm-err','signup-terms-err');
    if (errorEl) errorEl.style.display = 'none';

    const fullName = document.getElementById('signup-name')?.value.trim()     || '';
    const email    = document.getElementById('signup-email')?.value.trim()    || '';
    const password = document.getElementById('signup-password')?.value        || '';
    const confirm  = document.getElementById('signup-confirm')?.value         || '';
    const terms    = document.getElementById('signup-terms')?.checked;

    let hasError = false;
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!fullName) { setFieldError(document.getElementById('signup-name'), document.getElementById('signup-name-err'), 'Full name is required'); hasError = true; }
    if (!emailRe.test(email)) { setFieldError(document.getElementById('signup-email'), document.getElementById('signup-email-err'), 'Please enter a valid email'); hasError = true; }
    if (password.length < 8) { setFieldError(document.getElementById('signup-password'), document.getElementById('signup-password-err'), 'Password must be at least 8 characters'); hasError = true; }
    if (password !== confirm) { setFieldError(document.getElementById('signup-confirm'), document.getElementById('signup-confirm-err'), 'Passwords do not match'); hasError = true; }
    if (!terms) {
      const termsErr = document.getElementById('signup-terms-err');
      if (termsErr) termsErr.textContent = 'Please agree to the Terms of Service';
      hasError = true;
    }
    if (hasError) return;

    submitBtn.disabled = true;
    if (btnText) btnText.style.display = 'none';
    if (spinner) spinner.style.display = 'inline-block';

    try {
      const data = await signup(fullName, email, password);
      state.token = data.token;
      state.currentUser = data.user;
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));

      closeAllModals();
      updateNav();
      showOnboarding(data.user);
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = err.message || 'Could not create account';
        errorEl.style.display = 'block';
      }
    } finally {
      submitBtn.disabled = false;
      if (btnText) btnText.style.display = 'inline';
      if (spinner) spinner.style.display = 'none';
    }
  });

  // Toggle password visibility
  const pwToggle = document.getElementById('signup-pw-toggle');
  const pwField  = document.getElementById('signup-password');
  if (pwToggle && pwField) {
    pwToggle.addEventListener('click', () => {
      pwField.type = pwField.type === 'password' ? 'text' : 'password';
    });
  }

  // Switch to login
  const toLogin = document.getElementById('signup-to-login');
  if (toLogin) toLogin.addEventListener('click', () => {
    closeModal('signup-modal');
    openModal('login-modal');
  });

  // Terms link closes modal gracefully
  const termsLink = document.getElementById('signup-terms-link');
  if (termsLink) termsLink.addEventListener('click', e => {
    e.preventDefault();
    closeModal('signup-modal');
    showSection('about');
  });
}

// ---------------------------------------------------------------------------
// Onboarding overlay
// ---------------------------------------------------------------------------
function showOnboarding(user) {
  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;

  const nameEl   = document.getElementById('onboarding-name');
  const emailEl  = document.getElementById('onboarding-email');
  const numEl    = document.getElementById('onboarding-student-num');

  if (nameEl)  nameEl.textContent  = user.fullName?.split(' ')[0] || 'friend';
  if (emailEl) emailEl.textContent = user.email || 'your email';
  if (numEl)   numEl.textContent   = user.studentNumber || '—';

  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

// ---------------------------------------------------------------------------
// Profile form submit
// ---------------------------------------------------------------------------
function setupProfileForm() {
  const form    = document.getElementById('profile-form');
  const errorEl = document.getElementById('profile-form-error');
  const successEl= document.getElementById('profile-form-success');
  const saveBtn  = document.getElementById('profile-save-btn');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!state.currentUser) { showProfileGate(); return; }

    if (errorEl)   errorEl.style.display   = 'none';
    if (successEl) successEl.style.display = 'none';

    const data = {};
    new FormData(form).forEach((v, k) => { if (v) data[k] = v; });

    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving…'; }

    try {
      const res = await fetch(`${API_BASE}/api/candidates`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(data),
      });

      if (res.ok) {
        if (successEl) {
          successEl.textContent = 'Profile saved successfully!';
          successEl.style.display = 'block';
        }
        showToast('Profile saved!', 'success');
        // Update profile_complete in state
        if (state.currentUser) {
          state.currentUser.profileComplete = true;
          localStorage.setItem(USER_KEY, JSON.stringify(state.currentUser));
        }
      } else {
        const err = await res.json();
        if (errorEl) {
          errorEl.textContent = err.error || 'Failed to save profile';
          errorEl.style.display = 'block';
        }
      }
    } catch {
      if (errorEl) {
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.style.display = 'block';
      }
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save Profile'; }
    }
  });
}

// ---------------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------------
function setupContactForm() {
  const btn = document.getElementById('contact-send-btn');
  const result = document.getElementById('contact-result');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const name    = document.getElementById('contact-name')?.value.trim();
    const email   = document.getElementById('contact-email')?.value.trim();
    const message = document.getElementById('contact-message')?.value.trim();

    if (!name || !email || !message) {
      if (result) { result.className = 'form-error'; result.textContent = 'Please fill in all fields.'; result.style.display = 'block'; }
      return;
    }
    // In production you'd POST to an API. For now: show confirmation.
    if (result) {
      result.className = 'form-success';
      result.textContent = "Thanks! We'll get back to you within 1 business day.";
      result.style.display = 'block';
    }
    ['contact-name','contact-email','contact-message'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
  });
}

// ---------------------------------------------------------------------------
// FAQ Accordion
// ---------------------------------------------------------------------------
function setupFaq() {
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = btn.closest('.faq-item');
      if (!item) return;
      const isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(i => i.classList.remove('open'));
      if (!isOpen) item.classList.add('open');
    });
  });
}

// ---------------------------------------------------------------------------
// Nav dropdown
// ---------------------------------------------------------------------------
function setupNavDropdown() {
  const userBtn  = document.getElementById('nav-user-btn');
  const dropdown = document.getElementById('nav-dropdown');
  if (!userBtn || !dropdown) return;

  userBtn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open', !isOpen);
    userBtn.setAttribute('aria-expanded', String(!isOpen));
  });

  document.addEventListener('click', () => {
    dropdown.classList.remove('open');
    userBtn.setAttribute('aria-expanded', 'false');
  });
}

// ---------------------------------------------------------------------------
// Wire up all static event listeners
// ---------------------------------------------------------------------------
function setupEventListeners() {
  // Hamburger
  const hamburger = document.getElementById('hamburger');
  if (hamburger) hamburger.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    const nav = document.getElementById('nav-links');
    if (nav) nav.classList.toggle('open', open);
  });

  // Nav links (data-section)
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-section]');
    if (el) { e.preventDefault(); showSection(el.dataset.section); }

    const nav = e.target.closest('[data-nav]');
    if (nav) { e.preventDefault(); showSection(nav.dataset.nav); }
  });

  // Modal close buttons
  document.getElementById('login-modal-close')?.addEventListener('click',  () => closeModal('login-modal'));
  document.getElementById('signup-modal-close')?.addEventListener('click', () => closeModal('signup-modal'));

  // Close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeAllModals();
    });
  });

  // Escape key closes modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAllModals();
  });

  // Navbar auth buttons
  document.getElementById('btn-nav-login')?.addEventListener('click',  () => openModal('login-modal'));
  document.getElementById('btn-nav-signup')?.addEventListener('click', () => openModal('signup-modal'));

  // Home CTAs
  document.getElementById('btn-hero-signup')?.addEventListener('click',    () => openModal('signup-modal'));
  document.getElementById('btn-home-cta-signup')?.addEventListener('click',() => openModal('signup-modal'));

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => { logout(); });

  // Dashboard gate buttons
  document.getElementById('btn-dash-gate-login')?.addEventListener('click',  () => openModal('login-modal'));
  document.getElementById('btn-dash-gate-signup')?.addEventListener('click', () => openModal('signup-modal'));

  // Profile gate button
  document.getElementById('btn-profile-gate-signup')?.addEventListener('click', () => openModal('signup-modal'));

  // Jobs search
  function runJobSearch() {
    const q    = document.getElementById('jobs-search')?.value.trim()           || '';
    const s    = document.getElementById('jobs-status-filter')?.value            || '';
    const loc  = document.getElementById('jobs-location-filter')?.value          || '';
    const type = document.getElementById('jobs-type-filter')?.value              || '';
    const sort = document.getElementById('jobs-sort')?.value                     || 'newest';
    loadJobs(q, s, loc, type, sort);
  }

  function resetJobFilters() {
    const ids = ['jobs-search', 'jobs-location-filter'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['jobs-status-filter', 'jobs-type-filter', 'jobs-sort'].forEach(id => {
      const el = document.getElementById(id); if (el) el.selectedIndex = 0;
    });
    jobsLoaded = false;
    loadJobs();
  }

  document.getElementById('jobs-search-btn')?.addEventListener('click', runJobSearch);
  document.getElementById('jobs-search')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') runJobSearch();
  });
  document.getElementById('jobs-reset-btn')?.addEventListener('click', resetJobFilters);
  document.getElementById('jobs-reset-empty-btn')?.addEventListener('click', resetJobFilters);
  document.getElementById('jobs-browse-all-btn')?.addEventListener('click', resetJobFilters);
  document.getElementById('jobs-retry-btn')?.addEventListener('click', () => loadJobs());
  document.getElementById('jobs-onboarding-signup-btn')?.addEventListener('click', () => openModal('signup-modal'));

  // Eligibility checker
  document.getElementById('elig-check-btn')?.addEventListener('click', checkEligibility);

  // Recommendations
  document.getElementById('rec-btn')?.addEventListener('click', loadRecommendations);

  // Onboarding overlay buttons
  document.getElementById('btn-onboarding-profile')?.addEventListener('click', () => {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    showSection('profile');
  });
  document.getElementById('btn-onboarding-jobs')?.addEventListener('click', () => {
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = '';
    showSection('jobs');
  });
}

// ---------------------------------------------------------------------------
// Hash-based routing on load
// ---------------------------------------------------------------------------
function routeFromHash() {
  const hash = window.location.hash.replace('#', '').trim();
  if (hash && SECTIONS.includes(hash)) {
    showSection(hash);
  } else {
    showSection('home');
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
async function init() {
  setupEventListeners();
  setupNavDropdown();
  setupLoginForm();
  setupSignupForm();
  setupProfileForm();
  setupContactForm();
  setupFaq();
  setupTagsInput('skills-input',     'skills-tags',    'p-skills');
  setupTagsInput('certs-input',      'certs-tags',     'p-certs');
  setupTagsInput('industries-input', 'industries-tags','p-industries');
  setupResumeDropZone();
  setupEligJobSelect();

  await checkAuth();
  updateNav();
  routeFromHash();
}

document.addEventListener('DOMContentLoaded', init);
