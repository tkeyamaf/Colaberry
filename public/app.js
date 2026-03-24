/* =========================================
   CareerBridge — app.js
   Single-page navigation + API integration
   Pure vanilla JS, no external libraries
   ========================================= */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_BASE = '';  // relative URLs — served from same origin

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REASON_MESSAGES = {
  FIT_THRESHOLD:      'Your fit score is below the minimum required threshold of 70. Try improving your profile score.',
  JOB_CAP:            'This job has reached its maximum allocation limit of 12 placements this week. Check back next week.',
  COMPANY_CAP:        'This company has reached its weekly allocation limit of 30 placements. Try other companies.',
  STUDENT_WEEKLY_CAP: 'You\'ve reached your weekly application limit of 5. New slots open next Monday.',
  COOLDOWN:           'You recently applied to this job. You must wait for your cooldown period to expire before reapplying.',
  JOB_NOT_FOUND:      'We couldn\'t find this job in our system. Please verify the Job ID.',
  COMPANY_MISMATCH:   'The Company ID doesn\'t match this job\'s employer. Please double-check both IDs.',
};

const SECTIONS = ['home', 'jobs', 'eligibility', 'recommendations', 'profile', 'applications', 'about'];

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
function showSection(name) {
  if (!SECTIONS.includes(name)) name = 'home';

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

  // Lazy-load jobs section on first visit
  if (name === 'jobs' && !jobsLoaded) {
    loadJobs();
  }
}

function closeMenu() {
  const hamburger = document.getElementById('hamburger');
  const navLinks  = document.getElementById('nav-links');
  if (hamburger) {
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
  }
  if (navLinks) navLinks.classList.remove('open');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function isUuid(val) {
  return UUID_RE.test((val || '').trim());
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str || '');
  return d.innerHTML;
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

function clearFieldError(inputEl, errorEl) {
  setFieldError(inputEl, errorEl, '');
}

function setButtonLoading(btn, loading) {
  const text    = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  btn.disabled = loading;
  if (text)    text.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = '\u26A0 ' + msg;
  el.classList.remove('hidden');
}

function hideError(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function showBanner(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideBanner(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function statusClass(status) {
  if (!status) return 'status-closed';
  const s = status.toUpperCase();
  if (s === 'OPEN')     return 'status-open';
  if (s === 'REOPENED') return 'status-reopened';
  return 'status-closed';
}

function fitBarClass(score) {
  if (score < 50) return 'fit-low';
  if (score < 75) return 'fit-mid';
  return 'fit-high';
}

// ---------------------------------------------------------------------------
// Job card template
// ---------------------------------------------------------------------------
function buildJobCard(job) {
  const title       = escHtml(job.title     || 'Untitled Position');
  const company     = escHtml(job.company   || 'Unknown Company');
  const location    = escHtml(job.location  || '\u2014');
  const description = escHtml(job.description || '');
  const status      = (job.status || 'CLOSED').toUpperCase();
  const jobType     = escHtml(job.jobType   || '');
  const score       = Math.round(Number(job.fitScore || job.fitScoreMin) || 70);
  const url         = job.url || null;
  const barClass    = fitBarClass(score);
  const sBadge      = statusClass(status);

  const titleEscaped    = title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const companyEscaped  = company.replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const descEscaped     = escHtml(job.description || '').replace(/'/g, "\\'");

  const actionBtn = url
    ? `<div class="job-card-actions">
         <a href="${escHtml(url)}" target="_blank" rel="noopener" class="job-view-btn">View Details &#8594;</a>
         <button class="interview-prep-btn" type="button" onclick="openInterviewModal('${titleEscaped}', '${descEscaped}')">&#127919; Interview Prep</button>
         <button class="interview-prep-btn" type="button" onclick="trackApplicationFromCard('${titleEscaped}', '${companyEscaped}')">+ Track</button>
       </div>`
    : `<div class="job-card-actions">
         <button class="job-view-btn" type="button" onclick="void(0)">View Details &#8594;</button>
         <button class="interview-prep-btn" type="button" onclick="openInterviewModal('${titleEscaped}', '${descEscaped}')">&#127919; Interview Prep</button>
         <button class="interview-prep-btn" type="button" onclick="trackApplicationFromCard('${titleEscaped}', '${companyEscaped}')">+ Track</button>
       </div>`;

  const jobTypeBadge = jobType
    ? `<span class="job-type-badge">${jobType}</span>`
    : '';

  return `
    <article class="job-card">
      <div class="job-card-header">
        <span class="job-title">${title}</span>
        <span class="status-badge ${sBadge}">${escHtml(status)}</span>
      </div>
      <div class="job-meta">
        <span class="job-company">&#127970; ${company}</span>
        <span class="job-location">&#128205; ${location}</span>
      </div>
      ${jobTypeBadge}
      ${description ? `<p class="job-description">${description}</p>` : ''}
      <div class="job-fit">
        <span class="fit-label">Fit</span>
        <div class="fit-bar-track">
          <div class="fit-bar-fill ${barClass}" style="width: ${score}%" data-width="${score}"></div>
        </div>
        <span class="fit-value">${score}</span>
      </div>
      ${actionBtn}
    </article>
  `;
}

function animateFitBars(container) {
  requestAnimationFrame(() => {
    container.querySelectorAll('.fit-bar-fill').forEach(bar => {
      const target = bar.dataset.width + '%';
      bar.style.width = '0';
      setTimeout(() => { bar.style.width = target; }, 40);
    });
  });
}

// ---------------------------------------------------------------------------
// JOBS SECTION
// ---------------------------------------------------------------------------
let jobsLoaded = false;
let allJobsData = [];

function loadJobs(search, status, location) {
  const resultsEl  = document.getElementById('jobs-results');
  const emptyEl    = document.getElementById('jobs-empty');
  const loadingEl  = document.getElementById('jobs-loading');
  const errorEl    = document.getElementById('jobs-error');
  const countEl    = document.getElementById('jobs-count');

  if (!resultsEl) return;

  jobsLoaded = true;

  hideError(errorEl);
  emptyEl.classList.add('hidden');
  resultsEl.innerHTML = '';
  loadingEl.classList.remove('hidden');
  if (countEl) countEl.textContent = '';

  const params = new URLSearchParams();
  if (search)   params.set('search',   search);
  if (status)   params.set('status',   status);
  if (location) params.set('location', location);

  const url = `${API_BASE}/api/jobs${params.toString() ? '?' + params.toString() : ''}`;

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      return res.json();
    })
    .then(data => {
      loadingEl.classList.add('hidden');
      allJobsData = Array.isArray(data) ? data : [];

      if (allJobsData.length === 0) {
        emptyEl.classList.remove('hidden');
        if (countEl) countEl.textContent = '0 jobs';
        return;
      }

      resultsEl.innerHTML = allJobsData.map(buildJobCard).join('');
      animateFitBars(resultsEl);

      if (countEl) {
        countEl.textContent = `${allJobsData.length} job${allJobsData.length !== 1 ? 's' : ''}`;
      }
    })
    .catch(err => {
      loadingEl.classList.add('hidden');
      showError(errorEl, 'Could not load jobs. Please check your connection and try again.');
      console.error(err);
    });
}

function initJobsSection() {
  const searchInput  = document.getElementById('jobs-search-input');
  const statusFilter = document.getElementById('jobs-status-filter');
  const locationFilter = document.getElementById('jobs-location-filter');
  const searchBtn    = document.getElementById('jobs-search-btn');

  if (!searchBtn) return;

  // Trigger search on button click
  searchBtn.addEventListener('click', () => {
    const search   = (searchInput   ? searchInput.value.trim()   : '');
    const status   = (statusFilter  ? statusFilter.value         : '');
    const location = (locationFilter ? locationFilter.value.trim() : '');
    loadJobs(search || undefined, status || undefined, location || undefined);
  });

  // Trigger search on Enter in inputs
  [searchInput, locationFilter].forEach(input => {
    if (!input) return;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') searchBtn.click();
    });
  });
}

// ---------------------------------------------------------------------------
// ELIGIBILITY SECTION
// ---------------------------------------------------------------------------
function initEligibilitySection() {
  const form       = document.getElementById('eligibility-form');
  const studentIn  = document.getElementById('elig-student-id');
  const jobIn      = document.getElementById('elig-job-id');
  const companyIn  = document.getElementById('elig-company-id');
  const fitSlider  = document.getElementById('elig-fit-score');
  const fitDisplay = document.getElementById('elig-fit-score-display');
  const statusSel  = document.getElementById('elig-job-status');
  const studentErr = document.getElementById('elig-student-id-error');
  const jobErr     = document.getElementById('elig-job-id-error');
  const companyErr = document.getElementById('elig-company-id-error');
  const submitBtn  = document.getElementById('elig-submit-btn');
  const resultEl   = document.getElementById('elig-result-panel');
  const errorEl    = document.getElementById('elig-error');

  if (!form) return;

  // Live slider display
  if (fitSlider && fitDisplay) {
    fitSlider.addEventListener('input', () => {
      fitDisplay.textContent = fitSlider.value;
    });
  }

  // Live validation clearing
  if (studentIn) studentIn.addEventListener('input', () => clearFieldError(studentIn, studentErr));
  if (jobIn)     jobIn.addEventListener('input',     () => clearFieldError(jobIn, jobErr));
  if (companyIn) companyIn.addEventListener('input', () => clearFieldError(companyIn, companyErr));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorEl);

    const studentId = studentIn ? studentIn.value.trim() : '';
    const jobId     = jobIn     ? jobIn.value.trim()     : '';
    const companyId = companyIn ? companyIn.value.trim() : '';
    const fitScore  = fitSlider ? fitSlider.value        : '75';
    const jobStatus = statusSel ? statusSel.value        : 'OPEN';

    let valid = true;

    if (!isUuid(studentId)) {
      setFieldError(studentIn, studentErr, 'Please enter a valid UUID (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
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

    if (!valid) return;

    setButtonLoading(submitBtn, true);
    resultEl.innerHTML = '<div class="loading-state"><div class="loading-spinner-lg"></div><p>Checking eligibility...</p></div>';

    try {
      const params = new URLSearchParams({ studentId, jobId, companyId, fitScore, jobStatus });
      const res    = await fetch(`${API_BASE}/allocate/check?${params}`);
      const data   = await res.json();

      if (!res.ok && res.status !== 422) {
        showError(errorEl, data.error || `Request failed (${res.status})`);
        resultEl.innerHTML = getEligibilityPlaceholderHTML();
        return;
      }

      renderEligibilityResult(resultEl, data);
    } catch (err) {
      showError(errorEl, 'Network error — please check your connection and try again.');
      resultEl.innerHTML = getEligibilityPlaceholderHTML();
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

function getEligibilityPlaceholderHTML() {
  return `
    <div class="result-placeholder">
      <div class="result-placeholder-icon">&#128270;</div>
      <p>Fill in the form and click <strong>Check Allocation</strong> to see the eligibility result here.</p>
    </div>
  `;
}

function renderEligibilityResult(container, data) {
  const allowed     = data.allowed === true;
  const reason      = data.reason || null;
  const humanReason = reason ? (REASON_MESSAGES[reason] || reason) : null;

  if (allowed) {
    container.innerHTML = `
      <div class="result-eligible">
        <div class="result-status-row">
          <span class="result-icon">&#9989;</span>
          <span class="result-status-text">Eligible!</span>
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
// RECOMMENDATIONS SECTION
// ---------------------------------------------------------------------------
function initRecommendationsSection() {
  const form       = document.getElementById('rec-form');
  const studentIn  = document.getElementById('rec-student-id');
  const fitSlider  = document.getElementById('rec-fit-score');
  const fitDisplay = document.getElementById('rec-fit-score-display');
  const studentErr = document.getElementById('rec-student-id-error');
  const submitBtn  = document.getElementById('rec-submit-btn');
  const resultsEl  = document.getElementById('rec-results');
  const emptyEl    = document.getElementById('rec-empty');
  const loadingEl  = document.getElementById('rec-loading');
  const errorEl    = document.getElementById('rec-error');

  if (!form) return;

  // Live slider display
  if (fitSlider && fitDisplay) {
    fitSlider.addEventListener('input', () => {
      fitDisplay.textContent = fitSlider.value;
    });
  }

  if (studentIn) studentIn.addEventListener('input', () => clearFieldError(studentIn, studentErr));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError(errorEl);

    const studentId = studentIn ? studentIn.value.trim() : '';
    const fitScore  = fitSlider ? fitSlider.value : '75';

    let valid = true;

    if (!isUuid(studentId)) {
      setFieldError(studentIn, studentErr, 'Please enter a valid UUID (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
      valid = false;
    } else { clearFieldError(studentIn, studentErr); }

    if (!valid) return;

    setButtonLoading(submitBtn, true);
    if (resultsEl) resultsEl.innerHTML = '';
    if (emptyEl)   emptyEl.classList.add('hidden');
    if (loadingEl) loadingEl.classList.remove('hidden');

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
      if (resultsEl) {
        resultsEl.innerHTML = jobs.map(buildJobCard).join('');
        if (jobs.length > 0) animateFitBars(resultsEl);
      }
      if (emptyEl) emptyEl.classList.toggle('hidden', jobs.length > 0);

    } catch (err) {
      showError(errorEl, 'Network error — please check your connection and try again.');
    } finally {
      setButtonLoading(submitBtn, false);
      if (loadingEl) loadingEl.classList.add('hidden');
    }
  });
}

// ---------------------------------------------------------------------------
// TAGS INPUT
// ---------------------------------------------------------------------------
function initTagsInput(wrapperId, tagsContainerId, inputId) {
  const wrapper   = document.getElementById(wrapperId);
  const container = document.getElementById(tagsContainerId);
  const input     = document.getElementById(inputId);

  if (!wrapper || !container || !input) return { getTags: () => [] };

  const tags = [];

  function render() {
    container.innerHTML = tags.map((tag, i) =>
      `<span class="tag-chip">
        ${escHtml(tag)}
        <button type="button" class="tag-chip-remove" data-index="${i}" aria-label="Remove ${escHtml(tag)}">&#10005;</button>
      </span>`
    ).join('');

    // Attach remove listeners
    container.querySelectorAll('.tag-chip-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index, 10);
        tags.splice(idx, 1);
        render();
      });
    });
  }

  function addTag(value) {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      tags.push(trimmed);
      render();
    }
    input.value = '';
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input.value);
    }
    // Backspace on empty input removes last tag
    if (e.key === 'Backspace' && input.value === '' && tags.length > 0) {
      tags.pop();
      render();
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim()) addTag(input.value);
  });

  // Click wrapper to focus input
  wrapper.addEventListener('click', () => input.focus());

  return { getTags: () => [...tags] };
}

// ---------------------------------------------------------------------------
// PROFILE SECTION
// ---------------------------------------------------------------------------
function initProfileSection() {
  const form           = document.getElementById('profile-form');
  const submitBtn      = document.getElementById('profile-submit-btn');
  const successBanner  = document.getElementById('profile-success');
  const errorBanner    = document.getElementById('profile-error');

  if (!form) return;

  // Profile picture preview
  const picBtn   = document.getElementById('profile-picture-btn');
  const picInput = document.getElementById('profile-picture-input');
  const picImg   = document.getElementById('profile-picture-img');
  const picHolder = document.getElementById('profile-picture-placeholder');
  const picPreview = document.getElementById('profile-picture-preview');

  if (picBtn && picInput) {
    picBtn.addEventListener('click', () => picInput.click());
    picPreview.addEventListener('click', () => picInput.click());

    picInput.addEventListener('change', () => {
      const file = picInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        if (picImg) {
          picImg.src = e.target.result;
          picImg.classList.remove('hidden');
        }
        if (picHolder) picHolder.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    });
  }

  // Summary character counter
  const summaryTextarea = document.getElementById('pf-summary');
  const summaryCount    = document.getElementById('pf-summary-count');
  if (summaryTextarea && summaryCount) {
    summaryTextarea.addEventListener('input', () => {
      summaryCount.textContent = summaryTextarea.value.length;
    });
  }

  // Resume drag & drop
  const dropArea     = document.getElementById('resume-drop-area');
  const resumeInput  = document.getElementById('resume-input');
  const browseBtn    = document.getElementById('resume-browse-btn');
  const fileDisplay  = document.getElementById('resume-file-display');
  const fileName     = document.getElementById('resume-file-name');
  const removeBtn    = document.getElementById('resume-remove-btn');

  if (browseBtn && resumeInput) {
    browseBtn.addEventListener('click', () => resumeInput.click());
  }

  if (dropArea && resumeInput) {
    dropArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropArea.classList.add('drag-over');
    });

    dropArea.addEventListener('dragleave', () => {
      dropArea.classList.remove('drag-over');
    });

    dropArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dropArea.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleResumeFile(file);
    });

    resumeInput.addEventListener('change', () => {
      if (resumeInput.files[0]) handleResumeFile(resumeInput.files[0]);
    });
  }

  function handleResumeFile(file) {
    if (!fileDisplay || !fileName || !dropArea) return;
    fileName.textContent = file.name;
    fileDisplay.classList.remove('hidden');
    dropArea.classList.add('hidden');
  }

  if (removeBtn && fileDisplay && dropArea) {
    removeBtn.addEventListener('click', () => {
      fileDisplay.classList.add('hidden');
      dropArea.classList.remove('hidden');
      if (resumeInput) resumeInput.value = '';
    });
  }

  // Initialize all tag inputs and capture their getters
  const tagsMap = {
    preferred_titles:    initTagsInput('preferred-titles-wrapper', 'preferred-titles-tags', 'preferred-titles-input'),
    industries:          initTagsInput('industries-wrapper',        'industries-tags',        'industries-input'),
    skills:              initTagsInput('skills-wrapper',            'skills-tags',            'skills-input'),
    certifications:      initTagsInput('certifications-wrapper',    'certifications-tags',    'certifications-input'),
    preferred_companies: initTagsInput('preferred-companies-wrapper', 'preferred-companies-tags', 'preferred-companies-input'),
  };

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideBanner(successBanner);
    hideError(errorBanner);

    const fullName = document.getElementById('pf-full-name');
    const email    = document.getElementById('pf-email');
    const fullNameErr = document.getElementById('pf-full-name-error');
    const emailErr    = document.getElementById('pf-email-error');

    let valid = true;

    if (!fullName || !fullName.value.trim()) {
      setFieldError(fullName, fullNameErr, 'Full name is required');
      valid = false;
    } else { clearFieldError(fullName, fullNameErr); }

    if (!email || !email.value.trim()) {
      setFieldError(email, emailErr, 'Email address is required');
      valid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      setFieldError(email, emailErr, 'Please enter a valid email address');
      valid = false;
    } else { clearFieldError(email, emailErr); }

    if (!valid) return;

    // Gather job types
    const jobTypeCheckboxes = form.querySelectorAll('input[name="job_types"]:checked');
    const jobTypes = Array.from(jobTypeCheckboxes).map(cb => cb.value);

    // Gather work setting
    const workSettingRadio = form.querySelector('input[name="work_setting"]:checked');
    const workSetting = workSettingRadio ? workSettingRadio.value : 'ANY';

    const payload = {
      full_name:           fullName.value.trim(),
      email:               email.value.trim().toLowerCase(),
      phone:               getVal('pf-phone'),
      city:                getVal('pf-city'),
      state:               getVal('pf-state'),
      preferred_titles:    tagsMap.preferred_titles.getTags(),
      job_types:           jobTypes.length > 0 ? jobTypes : null,
      work_setting:        workSetting,
      salary_min:          getNumVal('pf-salary-min'),
      salary_max:          getNumVal('pf-salary-max'),
      years_experience:    getNumVal('pf-years-exp'),
      industries:          tagsMap.industries.getTags(),
      timeframe:           getVal('pf-timeframe'),
      linkedin_url:        getVal('pf-linkedin'),
      portfolio_url:       getVal('pf-portfolio'),
      skills:              tagsMap.skills.getTags(),
      certifications:      tagsMap.certifications.getTags(),
      education:           getVal('pf-education'),
      work_authorization:  getVal('pf-work-auth'),
      availability_date:   getVal('pf-availability') || null,
      preferred_companies: tagsMap.preferred_companies.getTags(),
      summary:             getVal('pf-summary'),
    };

    setButtonLoading(submitBtn, true);

    try {
      const res  = await fetch(`${API_BASE}/api/candidates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(errorBanner, data.error || `Submission failed (${res.status})`);
        return;
      }

      showBanner(successBanner, 'Your profile has been saved successfully! \uD83C\uDF89');
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
      showError(errorBanner, 'Network error — please check your connection and try again.');
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });

  // Live clear errors on required fields
  ['pf-full-name', 'pf-email'].forEach(id => {
    const el  = document.getElementById(id);
    const err = document.getElementById(id + '-error');
    if (el) el.addEventListener('input', () => clearFieldError(el, err));
  });
}

function getVal(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  const v = el.value.trim();
  return v || null;
}

function getNumVal(id) {
  const el = document.getElementById(id);
  if (!el || !el.value.trim()) return null;
  const n = Number(el.value);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// FAQ ACCORDION
// ---------------------------------------------------------------------------
function initFaqAccordion() {
  const faqList = document.getElementById('faq-list');
  if (!faqList) return;

  faqList.querySelectorAll('.faq-question').forEach(btn => {
    btn.addEventListener('click', () => {
      const isOpen   = btn.getAttribute('aria-expanded') === 'true';
      const answer   = btn.nextElementSibling;

      // Close all
      faqList.querySelectorAll('.faq-question').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        const a = b.nextElementSibling;
        if (a) a.classList.remove('open');
      });

      // Toggle current
      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        if (answer) answer.classList.add('open');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Init on DOM ready
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {

  // ----- Nav: link clicks (data-section) -----
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
  if (hamburger && navLinks) {
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
  }

  // ----- Navbar shadow on scroll -----
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.style.boxShadow = window.scrollY > 8
        ? '0 2px 16px rgba(0,0,0,0.12)'
        : 'var(--shadow-sm)';
    }, { passive: true });
  }

  // ----- Init all sections -----
  initJobsSection();
  initEligibilitySection();
  initRecommendationsSection();
  initProfileSection();
  initFaqAccordion();
  initApplicationsSection();

  // ----- Hash-based routing -----
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (SECTIONS.includes(hash)) {
    showSection(hash);
  } else {
    showSection('home');
  }

  // Handle browser back/forward
  window.addEventListener('popstate', () => {
    const h = window.location.hash.replace('#', '').toLowerCase();
    showSection(SECTIONS.includes(h) ? h : 'home');
  });
});

// ---------------------------------------------------------------------------
// AI RESUME MODAL
// ---------------------------------------------------------------------------
let _currentResumeHtml = '';

function generateAIResume() {
  openResumeModal();
}

function openResumeModal() {
  document.getElementById('resume-modal').classList.remove('hidden');
  document.getElementById('resume-modal-idle').classList.remove('hidden');
  document.getElementById('resume-modal-loading').classList.add('hidden');
  document.getElementById('resume-modal-result').classList.add('hidden');
  hideError(document.getElementById('resume-modal-error'));
  document.body.style.overflow = 'hidden';
}

function closeResumeModal() {
  document.getElementById('resume-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function runAIResumeGeneration() {
  const idleEl    = document.getElementById('resume-modal-idle');
  const loadingEl = document.getElementById('resume-modal-loading');
  const resultEl  = document.getElementById('resume-modal-result');
  const errorEl   = document.getElementById('resume-modal-error');
  const previewEl = document.getElementById('resume-preview-box');

  idleEl.classList.add('hidden');
  hideError(errorEl);
  loadingEl.classList.remove('hidden');
  resultEl.classList.add('hidden');

  // Gather profile form data
  const candidateData = gatherProfileData();

  try {
    const res  = await fetch(`${API_BASE}/api/ai/resume`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ candidateData }),
    });
    const data = await res.json();

    loadingEl.classList.add('hidden');

    if (!res.ok) {
      showError(errorEl, data.error || `Request failed (${res.status})`);
      idleEl.classList.remove('hidden');
      return;
    }

    _currentResumeHtml = data.html || '';
    previewEl.innerHTML = _currentResumeHtml;
    resultEl.classList.remove('hidden');
  } catch (err) {
    loadingEl.classList.add('hidden');
    showError(errorEl, 'Network error — please check your connection and try again.');
    idleEl.classList.remove('hidden');
  }
}

function printResume() {
  window.print();
}

// ---------------------------------------------------------------------------
// INTERVIEW PREP MODAL
// ---------------------------------------------------------------------------
let _interviewJobTitle = '';
let _interviewJobDesc  = '';

function openInterviewModal(jobTitle, jobDescription) {
  _interviewJobTitle = jobTitle || '';
  _interviewJobDesc  = jobDescription || '';

  const subtitle = document.getElementById('interview-modal-subtitle');
  if (subtitle) subtitle.textContent = `Preparing you for: ${_interviewJobTitle}`;

  const titleEl = document.getElementById('interview-modal-title');
  if (titleEl) titleEl.textContent = `\u{1F3AF} Interview Preparation: ${_interviewJobTitle}`;

  document.getElementById('interview-modal').classList.remove('hidden');
  document.getElementById('interview-modal-idle').classList.remove('hidden');
  document.getElementById('interview-modal-loading').classList.add('hidden');
  document.getElementById('interview-modal-result').classList.add('hidden');
  hideError(document.getElementById('interview-modal-error'));
  document.body.style.overflow = 'hidden';
}

function closeInterviewModal() {
  document.getElementById('interview-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

async function runInterviewPrepGeneration() {
  const idleEl    = document.getElementById('interview-modal-idle');
  const loadingEl = document.getElementById('interview-modal-loading');
  const resultEl  = document.getElementById('interview-modal-result');
  const errorEl   = document.getElementById('interview-modal-error');
  const prepEl    = document.getElementById('interview-prep-box');

  idleEl.classList.add('hidden');
  hideError(errorEl);
  loadingEl.classList.remove('hidden');
  resultEl.classList.add('hidden');

  const candidateName = getVal('pf-full-name');

  try {
    const res  = await fetch(`${API_BASE}/api/ai/interview-prep`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        jobTitle:        _interviewJobTitle,
        jobDescription:  _interviewJobDesc,
        candidateName:   candidateName || undefined,
      }),
    });
    const data = await res.json();

    loadingEl.classList.add('hidden');

    if (!res.ok) {
      showError(errorEl, data.error || `Request failed (${res.status})`);
      idleEl.classList.remove('hidden');
      return;
    }

    prepEl.innerHTML = data.html || '';
    resultEl.classList.remove('hidden');
  } catch (err) {
    loadingEl.classList.add('hidden');
    showError(errorEl, 'Network error — please check your connection and try again.');
    idleEl.classList.remove('hidden');
  }
}

// ---------------------------------------------------------------------------
// EMAIL NOTIFICATIONS
// ---------------------------------------------------------------------------
async function sendInterviewEmail(candidateEmail, candidateName, jobTitle, companyName, interviewDate) {
  try {
    const res  = await fetch(`${API_BASE}/api/notifications/interview`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ candidateEmail, candidateName, jobTitle, companyName, interviewDate }),
    });
    const data = await res.json();
    return data;
  } catch (err) {
    return { success: false, error: 'Network error' };
  }
}

// ---------------------------------------------------------------------------
// JOB APPLICATION TRACKER  (localStorage)
// ---------------------------------------------------------------------------
const APPS_KEY = 'cb_applications';

function loadApplications() {
  try {
    return JSON.parse(localStorage.getItem(APPS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveApplicationsToStorage(apps) {
  localStorage.setItem(APPS_KEY, JSON.stringify(apps));
}

function saveApplication(jobTitle, companyName, status, notes) {
  const apps = loadApplications();
  const entry = {
    id:        crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
    jobTitle,
    companyName,
    status:    status || 'APPLIED',
    notes:     notes || '',
    appliedAt: new Date().toISOString(),
    emailSent: false,
  };
  apps.unshift(entry);
  saveApplicationsToStorage(apps);
  return entry;
}

function updateApplicationStatus(id, newStatus) {
  const apps = loadApplications();
  const idx  = apps.findIndex(a => a.id === id);
  if (idx === -1) return null;
  apps[idx].status = newStatus;
  saveApplicationsToStorage(apps);
  renderApplications();

  // Offer to send interview email if status changed to INTERVIEW
  if (newStatus === 'INTERVIEW') {
    const app = apps[idx];
    promptInterviewEmail(app);
  }
  return apps[idx];
}

function deleteApplication(id) {
  const apps = loadApplications().filter(a => a.id !== id);
  saveApplicationsToStorage(apps);
  renderApplications();
}

function promptInterviewEmail(app) {
  const candidateEmail = getVal('pf-email');
  const candidateName  = getVal('pf-full-name');

  if (!candidateEmail) {
    alert(`Status updated to INTERVIEW for "${app.jobTitle}" at ${app.companyName}.\n\nFill in your email on the Profile page to send yourself an interview notification.`);
    return;
  }

  const send = confirm(`Send an interview notification email to ${candidateEmail} for "${app.jobTitle}" at ${app.companyName}?`);
  if (!send) return;

  sendInterviewEmail(candidateEmail, candidateName || 'Candidate', app.jobTitle, app.companyName)
    .then(result => {
      if (result.success) {
        alert('Interview notification email sent!');
        const apps = loadApplications();
        const idx  = apps.findIndex(a => a.id === app.id);
        if (idx !== -1) { apps[idx].emailSent = true; saveApplicationsToStorage(apps); renderApplications(); }
      } else {
        alert(`Email failed: ${result.error}`);
      }
    });
}

function renderApplications() {
  const apps    = loadApplications();
  const listEl  = document.getElementById('applications-list');
  const emptyEl = document.getElementById('applications-empty');

  if (!listEl) return;

  if (apps.length === 0) {
    listEl.innerHTML = '';
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');

  const statusOptions = ['APPLIED', 'REVIEWING', 'INTERVIEW', 'OFFER', 'REJECTED'];

  const rows = apps.map(app => {
    const date   = new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const opts   = statusOptions.map(s =>
      `<option value="${s}"${s === app.status ? ' selected' : ''}>${s}</option>`
    ).join('');
    const emailBtn = app.status === 'INTERVIEW' && !app.emailSent
      ? `<button class="btn btn-sm btn-outline" onclick="promptInterviewEmail(${JSON.stringify(app).replace(/"/g, '&quot;')})">&#128231; Send Email</button>`
      : '';

    return `
      <tr>
        <td><strong>${escHtml(app.jobTitle)}</strong></td>
        <td>${escHtml(app.companyName)}</td>
        <td><span class="app-status-badge app-status-${app.status}">${app.status}</span></td>
        <td>${date}</td>
        <td>
          <div class="app-action-row">
            <select class="app-status-select" onchange="updateApplicationStatus('${app.id}', this.value)">
              ${opts}
            </select>
            <button class="btn btn-sm btn-outline interview-prep-btn" onclick="openInterviewModal('${escHtml(app.jobTitle).replace(/'/g,"\\'")}', '')">&#127919; Prep</button>
            ${emailBtn}
            <button class="btn btn-sm btn-danger" onclick="deleteApplication('${app.id}')">&#10005;</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  listEl.innerHTML = `
    <table class="applications-table">
      <thead>
        <tr>
          <th>Job Title</th>
          <th>Company</th>
          <th>Status</th>
          <th>Applied</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function initApplicationsSection() {
  renderApplications();
}

// ---------------------------------------------------------------------------
// ADD APPLICATION MODAL
// ---------------------------------------------------------------------------
function showAddApplicationModal() {
  document.getElementById('add-application-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeAddApplicationModal() {
  document.getElementById('add-application-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function trackApplicationFromCard(jobTitle, company) {
  const titleInput = document.getElementById('app-job-title');
  const compInput  = document.getElementById('app-company');
  if (titleInput) titleInput.value = jobTitle;
  if (compInput)  compInput.value  = company;
  showAddApplicationModal();
  showSection('applications');
}

document.addEventListener('DOMContentLoaded', () => {
  // Close modals when clicking the backdrop overlay
  ['resume-modal', 'interview-modal', 'add-application-modal'].forEach(id => {
    const overlay = document.getElementById(id);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.add('hidden');
          document.body.style.overflow = '';
        }
      });
    }
  });

  const addForm = document.getElementById('add-application-form');
  if (addForm) {
    addForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const titleEl   = document.getElementById('app-job-title');
      const compEl    = document.getElementById('app-company');
      const statusEl  = document.getElementById('app-status');
      const notesEl   = document.getElementById('app-notes');
      const titleErrEl = document.getElementById('app-job-title-error');
      const compErrEl  = document.getElementById('app-company-error');

      let valid = true;
      if (!titleEl || !titleEl.value.trim()) {
        if (titleErrEl) titleErrEl.textContent = 'Job title is required';
        valid = false;
      } else { if (titleErrEl) titleErrEl.textContent = ''; }

      if (!compEl || !compEl.value.trim()) {
        if (compErrEl) compErrEl.textContent = 'Company is required';
        valid = false;
      } else { if (compErrEl) compErrEl.textContent = ''; }

      if (!valid) return;

      saveApplication(
        titleEl.value.trim(),
        compEl.value.trim(),
        statusEl ? statusEl.value : 'APPLIED',
        notesEl  ? notesEl.value.trim() : ''
      );

      addForm.reset();
      closeAddApplicationModal();
      showSection('applications');
      renderApplications();
    });
  }
});

// ---------------------------------------------------------------------------
// HELPER — gather profile form data for AI resume
// ---------------------------------------------------------------------------
function gatherProfileData() {
  const jobTypeCheckboxes = document.querySelectorAll('input[name="job_types"]:checked');
  const jobTypes = Array.from(jobTypeCheckboxes).map(cb => cb.value);
  const workSettingRadio = document.querySelector('input[name="work_setting"]:checked');

  return {
    fullName:           getVal('pf-full-name'),
    email:              getVal('pf-email'),
    phone:              getVal('pf-phone'),
    city:               getVal('pf-city'),
    state:              getVal('pf-state'),
    summary:            getVal('pf-summary'),
    education:          getVal('pf-education'),
    yearsExperience:    getVal('pf-years-exp'),
    workAuthorization:  getVal('pf-work-auth'),
    linkedinUrl:        getVal('pf-linkedin'),
    portfolioUrl:       getVal('pf-portfolio'),
    salaryMin:          getVal('pf-salary-min'),
    salaryMax:          getVal('pf-salary-max'),
    jobTypes:           jobTypes,
    workSetting:        workSettingRadio ? workSettingRadio.value : 'ANY',
  };
}
