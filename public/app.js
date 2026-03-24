/* =========================================
   JOBMATCH — app.js
   Single-page navigation + API integration
   ========================================= */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_BASE = '';  // relative URLs — served from same origin

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MESSAGES = {
  FIT_THRESHOLD:       'Fit score is below the minimum threshold of 70.',
  JOB_CAP:             'This job has reached its maximum of 12 allocations this week.',
  COMPANY_CAP:         'This company has reached its maximum of 30 allocations this week.',
  STUDENT_WEEKLY_CAP:  'You have reached your maximum of 5 allocations this week.',
  COOLDOWN:            'You must wait until your cooldown period expires before reapplying to this job.',
  JOB_NOT_FOUND:       'Job not found in the system.',
  COMPANY_MISMATCH:    'Company ID does not match the job\'s company.',
};

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
const sections = ['home', 'jobs', 'eligibility', 'recommendations', 'about'];

function showSection(name) {
  if (!sections.includes(name)) return;

  sections.forEach(id => {
    const el = document.getElementById(`section-${id}`);
    if (el) el.classList.toggle('active', id === name);
  });

  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.toggle('active', link.dataset.section === name);
  });

  // Close mobile menu
  closeMenu();

  // Update hash without triggering scroll
  history.replaceState(null, '', `#${name}`);

  // Scroll to top of page
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function closeMenu() {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
  hamburger.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
  navLinks.classList.remove('open');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isUuid(val) {
  return UUID_RE.test((val || '').trim());
}

function isFitScore(val) {
  const n = Number(val);
  return !isNaN(n) && n >= 0 && n <= 100;
}

function setFieldError(inputEl, errorEl, msg) {
  if (msg) {
    inputEl.classList.add('invalid');
    errorEl.textContent = msg;
  } else {
    inputEl.classList.remove('invalid');
    errorEl.textContent = '';
  }
}

function clearFieldError(inputEl, errorEl) {
  setFieldError(inputEl, errorEl, '');
}

function setButtonLoading(btn, loading) {
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled  = loading;
  if (text)    text.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

function showError(el, msg) {
  el.textContent = '⚠ ' + msg;
  el.classList.remove('hidden');
}

function hideError(el) {
  el.classList.add('hidden');
  el.textContent = '';
}

function statusClass(status) {
  if (!status) return 'status-closed';
  const s = status.toUpperCase();
  if (s === 'OPEN') return 'status-open';
  if (s === 'REOPENED') return 'status-reopened';
  return 'status-closed';
}

function fitBarClass(score) {
  if (score < 50) return 'fit-low';
  if (score < 75) return 'fit-mid';
  return 'fit-high';
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ---------------------------------------------------------------------------
// Job card template
// ---------------------------------------------------------------------------
function buildJobCard(job) {
  const title    = escHtml(job.title   || 'Untitled Position');
  const company  = escHtml(job.company || 'Unknown Company');
  const location = escHtml(job.location || '—');
  const status   = (job.status || 'CLOSED').toUpperCase();
  const score    = Math.round(Number(job.fitScore) || 0);
  const url      = job.url || null;
  const barClass = fitBarClass(score);
  const sBadge   = statusClass(status);

  const applyLink = url
    ? `<div class="job-card-actions"><a href="${escHtml(url)}" target="_blank" rel="noopener">View posting &rarr;</a></div>`
    : '';

  return `
    <article class="job-card">
      <div class="job-card-header">
        <span class="job-title">${title}</span>
        <span class="status-badge ${sBadge}">${escHtml(status)}</span>
      </div>
      <div class="job-meta">
        <span class="job-company">${company}</span>
        <span class="job-location">&#128205; ${location}</span>
      </div>
      <div class="job-fit">
        <span class="fit-label">Fit</span>
        <div class="fit-bar-track">
          <div class="fit-bar-fill ${barClass}" style="width: ${score}%"></div>
        </div>
        <span class="fit-value">${score}</span>
      </div>
      ${applyLink}
    </article>
  `;
}

// ---------------------------------------------------------------------------
// JOBS section
// ---------------------------------------------------------------------------
let allJobs = [];

function initJobsSection() {
  const form        = document.getElementById('jobs-search-form');
  const studentIn   = document.getElementById('jobs-student-id');
  const fitIn       = document.getElementById('jobs-fit-score');
  const studentErr  = document.getElementById('jobs-student-id-error');
  const fitErr      = document.getElementById('jobs-fit-score-error');
  const submitBtn   = document.getElementById('jobs-search-btn');
  const filterInput = document.getElementById('jobs-filter-input');
  const resultsEl   = document.getElementById('jobs-results');
  const emptyEl     = document.getElementById('jobs-empty');
  const errorEl     = document.getElementById('jobs-error');

  // Live validation — clear error on input
  studentIn.addEventListener('input', () => clearFieldError(studentIn, studentErr));
  fitIn.addEventListener('input',     () => clearFieldError(fitIn, fitErr));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorEl);

    const studentId = studentIn.value.trim();
    const fitScore  = fitIn.value.trim();

    let valid = true;

    if (!isUuid(studentId)) {
      setFieldError(studentIn, studentErr, 'Please enter a valid UUID (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
      valid = false;
    } else {
      clearFieldError(studentIn, studentErr);
    }

    if (fitScore === '' || !isFitScore(fitScore)) {
      setFieldError(fitIn, fitErr, 'Enter a number between 0 and 100');
      valid = false;
    } else {
      clearFieldError(fitIn, fitErr);
    }

    if (!valid) return;

    setButtonLoading(submitBtn, true);
    emptyEl.classList.add('hidden');
    resultsEl.innerHTML = '';
    document.getElementById('jobs-filter-bar').classList.add('hidden');

    try {
      const url = `${API_BASE}/jobs/recommend?studentId=${encodeURIComponent(studentId)}&fitScore=${encodeURIComponent(fitScore)}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || `Request failed (${res.status})`;
        showError(errorEl, msg);
        return;
      }

      allJobs = Array.isArray(data) ? data : [];
      renderJobGrid(resultsEl, emptyEl, allJobs, filterInput.value);
      updateJobCount(allJobs.length);

      if (allJobs.length > 0) {
        document.getElementById('jobs-filter-bar').classList.remove('hidden');
      }
    } catch (err) {
      showError(errorEl, 'Network error — please check your connection and try again.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // Client-side filter
  filterInput.addEventListener('input', () => {
    renderJobGrid(resultsEl, emptyEl, allJobs, filterInput.value);
    updateJobCount();
  });
}

function renderJobGrid(container, emptyEl, jobs, filterText) {
  const q = (filterText || '').toLowerCase().trim();
  const filtered = q
    ? jobs.filter(j =>
        (j.title   || '').toLowerCase().includes(q) ||
        (j.company || '').toLowerCase().includes(q)
      )
    : jobs;

  container.innerHTML = filtered.map(buildJobCard).join('');
  emptyEl.classList.toggle('hidden', filtered.length > 0);

  // Animate fit bars
  requestAnimationFrame(() => {
    container.querySelectorAll('.fit-bar-fill').forEach(bar => {
      const w = bar.style.width;
      bar.style.width = '0';
      setTimeout(() => { bar.style.width = w; }, 30);
    });
  });

  updateJobCount(filtered.length, jobs.length);
}

function updateJobCount(shown, total) {
  const el = document.getElementById('jobs-count');
  if (!el) return;
  if (shown === undefined) {
    el.textContent = '';
  } else if (total !== undefined && shown !== total) {
    el.textContent = `${shown} of ${total} jobs`;
  } else {
    el.textContent = `${shown} job${shown !== 1 ? 's' : ''}`;
  }
}

// ---------------------------------------------------------------------------
// ELIGIBILITY section
// ---------------------------------------------------------------------------
function initEligibilitySection() {
  const form       = document.getElementById('eligibility-form');
  const studentIn  = document.getElementById('elig-student-id');
  const jobIn      = document.getElementById('elig-job-id');
  const companyIn  = document.getElementById('elig-company-id');
  const fitIn      = document.getElementById('elig-fit-score');
  const statusSel  = document.getElementById('elig-job-status');
  const studentErr = document.getElementById('elig-student-id-error');
  const jobErr     = document.getElementById('elig-job-id-error');
  const companyErr = document.getElementById('elig-company-id-error');
  const fitErr     = document.getElementById('elig-fit-score-error');
  const submitBtn  = document.getElementById('elig-submit-btn');
  const resultEl   = document.getElementById('elig-result-panel');
  const errorEl    = document.getElementById('elig-error');

  [studentIn, jobIn, companyIn].forEach((el, i) => {
    const errEl = [studentErr, jobErr, companyErr][i];
    el.addEventListener('input', () => clearFieldError(el, errEl));
  });
  fitIn.addEventListener('input', () => clearFieldError(fitIn, fitErr));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorEl);

    const studentId = studentIn.value.trim();
    const jobId     = jobIn.value.trim();
    const companyId = companyIn.value.trim();
    const fitScore  = fitIn.value.trim();
    const jobStatus = statusSel.value;

    let valid = true;

    if (!isUuid(studentId)) {
      setFieldError(studentIn, studentErr, 'Please enter a valid UUID');
      valid = false;
    } else { clearFieldError(studentIn, studentErr); }

    if (!isUuid(jobId)) {
      setFieldError(jobIn, jobErr, 'Please enter a valid UUID');
      valid = false;
    } else { clearFieldError(jobIn, jobErr); }

    if (!isUuid(companyId)) {
      setFieldError(companyIn, companyErr, 'Please enter a valid UUID');
      valid = false;
    } else { clearFieldError(companyIn, companyErr); }

    if (fitScore === '' || !isFitScore(fitScore)) {
      setFieldError(fitIn, fitErr, 'Enter a number between 0 and 100');
      valid = false;
    } else { clearFieldError(fitIn, fitErr); }

    if (!valid) return;

    setButtonLoading(submitBtn, true);
    resultEl.innerHTML = '<div class="loading-state"><div class="loading-spinner-lg"></div><p>Checking eligibility...</p></div>';

    try {
      const params = new URLSearchParams({ studentId, jobId, companyId, fitScore, jobStatus });
      const res    = await fetch(`${API_BASE}/allocate/check?${params}`);
      const data   = await res.json();

      if (!res.ok && res.status !== 422) {
        showError(errorEl, data.error || `Request failed (${res.status})`);
        resultEl.innerHTML = getPlaceholderHTML();
        return;
      }

      renderEligibilityResult(resultEl, data);
    } catch (err) {
      showError(errorEl, 'Network error — please check your connection and try again.');
      resultEl.innerHTML = getPlaceholderHTML();
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

function getPlaceholderHTML() {
  return `
    <div class="result-placeholder">
      <div class="result-placeholder-icon">&#128270;</div>
      <p>Fill in the form and click <strong>Check Allocation</strong> to see the eligibility result here.</p>
    </div>
  `;
}

function renderEligibilityResult(container, data) {
  const allowed = data.allowed === true;
  const reason  = data.reason || null;
  const humanReason = reason ? (REASON_MESSAGES[reason] || reason) : null;

  if (allowed) {
    container.innerHTML = `
      <div class="result-eligible">
        <div class="result-status-row">
          <span class="result-icon">&#9989;</span>
          <span class="result-status-text">Eligible for Allocation</span>
        </div>
        <div class="result-reason-box">
          <div class="result-reason-label">Status</div>
          <p class="result-reason-text">This student meets all requirements and can be allocated to this job.</p>
        </div>
      </div>
    `;
  } else {
    const reasonHtml = humanReason ? `
      <div class="result-reason-box">
        <div class="result-reason-label">Reason</div>
        ${reason ? `<code class="result-reason-code">${escHtml(reason)}</code>` : ''}
        <p class="result-reason-text">${escHtml(humanReason)}</p>
      </div>
    ` : '';

    container.innerHTML = `
      <div class="result-ineligible">
        <div class="result-status-row">
          <span class="result-icon">&#10060;</span>
          <span class="result-status-text">Not Eligible</span>
        </div>
        ${reasonHtml}
      </div>
    `;
  }
}

// ---------------------------------------------------------------------------
// RECOMMENDATIONS section
// ---------------------------------------------------------------------------
function initRecommendationsSection() {
  const form       = document.getElementById('rec-form');
  const studentIn  = document.getElementById('rec-student-id');
  const fitIn      = document.getElementById('rec-fit-score');
  const studentErr = document.getElementById('rec-student-id-error');
  const fitErr     = document.getElementById('rec-fit-score-error');
  const submitBtn  = document.getElementById('rec-submit-btn');
  const resultsEl  = document.getElementById('rec-results');
  const emptyEl    = document.getElementById('rec-empty');
  const loadingEl  = document.getElementById('rec-loading');
  const errorEl    = document.getElementById('rec-error');

  studentIn.addEventListener('input', () => clearFieldError(studentIn, studentErr));
  fitIn.addEventListener('input',     () => clearFieldError(fitIn, fitErr));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorEl);

    const studentId = studentIn.value.trim();
    const fitScore  = fitIn.value.trim();

    let valid = true;

    if (!isUuid(studentId)) {
      setFieldError(studentIn, studentErr, 'Please enter a valid UUID (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
      valid = false;
    } else { clearFieldError(studentIn, studentErr); }

    if (fitScore === '' || !isFitScore(fitScore)) {
      setFieldError(fitIn, fitErr, 'Enter a number between 0 and 100');
      valid = false;
    } else { clearFieldError(fitIn, fitErr); }

    if (!valid) return;

    setButtonLoading(submitBtn, true);
    resultsEl.innerHTML = '';
    emptyEl.classList.add('hidden');
    loadingEl.classList.remove('hidden');

    try {
      const url  = `${API_BASE}/jobs/recommend?studentId=${encodeURIComponent(studentId)}&fitScore=${encodeURIComponent(fitScore)}`;
      const res  = await fetch(url);
      const data = await res.json();

      if (!res.ok) {
        const msg = data.error || `Request failed (${res.status})`;
        showError(errorEl, msg);
        return;
      }

      const jobs = Array.isArray(data) ? data : [];
      resultsEl.innerHTML = jobs.map(buildJobCard).join('');
      emptyEl.classList.toggle('hidden', jobs.length > 0);

      if (jobs.length > 0) {
        requestAnimationFrame(() => {
          resultsEl.querySelectorAll('.fit-bar-fill').forEach(bar => {
            const w = bar.style.width;
            bar.style.width = '0';
            setTimeout(() => { bar.style.width = w; }, 30);
          });
        });
      }
    } catch (err) {
      showError(errorEl, 'Network error — please check your connection and try again.');
    } finally {
      setButtonLoading(submitBtn, false);
      loadingEl.classList.add('hidden');
    }
  });
}

// ---------------------------------------------------------------------------
// Init on DOM ready
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {

  // ----- Nav: link clicks -----
  document.querySelectorAll('[data-section]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      showSection(el.dataset.section);
    });
  });

  // ----- Nav: CTA buttons (data-nav) -----
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.addEventListener('click', () => showSection(el.dataset.nav));
  });

  // ----- Hamburger -----
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
  hamburger.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
      closeMenu();
    }
  });

  // ----- Scroll: navbar shadow -----
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.style.boxShadow = window.scrollY > 8
      ? '0 2px 16px rgba(0,0,0,0.12)'
      : '0 1px 4px rgba(0,0,0,0.06)';
  }, { passive: true });

  // ----- Init sections -----
  initJobsSection();
  initEligibilitySection();
  initRecommendationsSection();

  // ----- Hash routing -----
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (sections.includes(hash)) {
    showSection(hash);
  } else {
    showSection('home');
  }

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const h = window.location.hash.replace('#', '').toLowerCase();
    if (sections.includes(h)) showSection(h);
  });
});
