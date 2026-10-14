/* =========================================================
   HireFlow - shared helpers + vanilla JS for the careers
   page (index.html) and login page (login.html).
   The dashboard (React) reuses api(), esc(), toast() etc.
   ========================================================= */

/** Calls api.php and returns parsed JSON, or throws an Error with the server message */
async function api(action, data = null, query = {}) {
    const params = new URLSearchParams({ action, ...query });
    const options = { method: data ? 'POST' : 'GET', credentials: 'same-origin' };
    if (data instanceof FormData) {
        options.body = data;
    } else if (data) {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(data);
    }
    const res = await fetch('api.php?' + params, options);
    const json = await res.json().catch(() => ({ error: 'The server sent an invalid response.' }));
    if (!res.ok || json.error) {
        const err = new Error(json.error || 'Request failed');
        err.status = res.status;
        throw err;
    }
    return json;
}

/** Escapes text before putting it into innerHTML (prevents XSS) */
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(message, isError = false) {
    document.querySelector('.toast')?.remove();
    const el = document.createElement('div');
    el.className = 'toast' + (isError ? ' err' : '');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
}

/** "2026-10-12 10:00:00" -> Date (SQLite datetime is local time) */
function toDate(s) { return new Date(String(s).replace(' ', 'T')); }

function fmtDate(s, withTime = false) {
    const opts = { day: 'numeric', month: 'short', year: 'numeric' };
    if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
    return toDate(s).toLocaleString('en-IN', opts);
}

function timeAgo(s) {
    const days = Math.floor((Date.now() - toDate(s)) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return days + ' days ago';
    return fmtDate(s);
}

function initials(name) {
    return name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

/** Same name always gets the same avatar colour */
function avatarColor(name) {
    const colors = ['#1d5a41', '#e2603a', '#3a7bd5', '#8a5cd1', '#b7791f', '#0e7490', '#be185d'];
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return colors[h % colors.length];
}

function skillList(s) {
    return [...new Set(String(s || '').split(',').map(x => x.trim()).filter(Boolean))];
}

/* =========================================================
   CAREERS PAGE
   ========================================================= */
function initCareers() {
    let jobs = [];
    let dept = 'All';
    const list = document.getElementById('jobList');
    const search = document.getElementById('jobSearch');
    const modal = document.getElementById('jobModal');
    const modalBody = document.getElementById('jobModalBody');

    api('public_jobs').then(data => {
        jobs = data;
        const depts = [...new Set(jobs.map(j => j.department))];
        document.getElementById('statRoles').textContent = jobs.length;
        document.getElementById('statDepts').textContent = depts.length;
        document.getElementById('deptFilters').innerHTML = ['All', ...depts]
            .map(d => `<button data-dept="${esc(d)}" class="${d === 'All' ? 'active' : ''}">${esc(d)}</button>`).join('');
        render();
        // Allow direct links like index.html#job-2
        const fromHash = location.hash.match(/^#job-(\d+)$/);
        if (fromHash) openJob(+fromHash[1]);
    }).catch(err => { list.innerHTML = `<p class="empty">${esc(err.message)}</p>`; });

    document.getElementById('deptFilters').addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        dept = btn.dataset.dept;
        document.querySelectorAll('#deptFilters button').forEach(b => b.classList.toggle('active', b === btn));
        render();
    });
    search.addEventListener('input', render);

    function render() {
        const q = search.value.trim().toLowerCase();
        const shown = jobs.filter(j =>
            (dept === 'All' || j.department === dept) &&
            (!q || [j.title, j.skills, j.location, j.department].join(' ').toLowerCase().includes(q)));
        list.innerHTML = shown.length ? shown.map(j => `
            <article class="job-row" data-id="${j.id}" tabindex="0">
                <div>
                    <h3>${esc(j.title)}</h3>
                    <div class="job-meta">
                        <span>${esc(j.department)}</span><span>📍 ${esc(j.location)}</span>
                        <span>${esc(j.job_type)}</span><span>${esc(j.experience)}</span><span>${esc(j.salary)}</span>
                    </div>
                </div>
                <span class="arrow">→</span>
            </article>`).join('') : '<p class="empty">No roles match your search.</p>';
    }

    list.addEventListener('click', e => {
        const row = e.target.closest('.job-row');
        if (row) openJob(+row.dataset.id);
    });
    list.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.target.classList.contains('job-row')) openJob(+e.target.dataset.id);
    });

    function openJob(id) {
        const j = jobs.find(x => +x.id === id);
        if (!j) return;
        history.replaceState(null, '', '#job-' + id);
        modalBody.innerHTML = `
            <span class="eyebrow">${esc(j.department)} · ${esc(j.location)}</span>
            <h2>${esc(j.title)}</h2>
            <div class="job-meta" style="margin-top:8px">
                <span>${esc(j.job_type)}</span><span>${esc(j.experience)}</span><span>${esc(j.salary)}</span><span>Posted ${timeAgo(j.created_at)}</span>
            </div>
            <p class="job-desc">${esc(j.description)}</p>
            <div class="chips">${skillList(j.skills).map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
            <hr>
            <h3 style="font-family:var(--serif);font-size:22px;font-weight:600;margin-bottom:14px">Apply for this role</h3>
            <form id="applyForm" novalidate>
                <input type="hidden" name="job_id" value="${j.id}">
                <div class="form-error hidden" id="applyError"></div>
                <div class="grid-2">
                    <div class="field"><label>Full name *</label><input name="name" required></div>
                    <div class="field"><label>Email *</label><input name="email" type="email" required></div>
                    <div class="field"><label>Phone *</label><input name="phone" placeholder="+91 98765 43210" required></div>
                    <div class="field"><label>Experience (years) *</label><input name="experience" type="number" min="0" max="40" step="0.5" required></div>
                </div>
                <div class="field">
                    <label>Your skills *</label>
                    <input name="skills" placeholder="e.g. ${esc(skillList(j.skills).slice(0, 3).join(', '))}" required>
                    <span class="hint">Separate with commas. We match these against the role's requirements.</span>
                </div>
                <div class="grid-2">
                    <div class="field"><label>How did you hear about us?</label>
                        <select name="source">
                            <option>Careers Page</option><option>LinkedIn</option><option>Naukri</option>
                            <option>Referral</option><option>Campus Drive</option><option>Other</option>
                        </select>
                    </div>
                    <div class="field"><label>Resume (PDF, max 2 MB)</label><input name="resume" type="file" accept="application/pdf"></div>
                </div>
                <div class="field"><label>Why do you want this role?</label><textarea name="cover_note" maxlength="1000"></textarea></div>
                <button class="btn btn-coral" type="submit">Submit application</button>
            </form>`;
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        document.getElementById('applyForm').addEventListener('submit', e => submitApplication(e, j));
    }

    async function submitApplication(e, job) {
        e.preventDefault();
        const form = e.target;
        const errBox = document.getElementById('applyError');
        const problem = validateApplication(form);
        if (problem) { errBox.textContent = problem; errBox.classList.remove('hidden'); return; }

        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Submitting…';
        try {
            const res = await api('apply', new FormData(form));
            modalBody.innerHTML = `
                <div class="success-box">
                    <div class="tick">✓</div>
                    <h3>Application received!</h3>
                    <p style="color:var(--muted);margin-top:6px">Thanks for applying to <b>${esc(job.title)}</b>. Our team reviews every application and replies within 48 hours.</p>
                    <span class="ref">Reference: ${esc(res.reference)}</span><br><br>
                    <button class="btn btn-primary" data-close>Browse more roles</button>
                </div>`;
        } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.remove('hidden');
            btn.disabled = false;
            btn.textContent = 'Submit application';
        }
    }

    // Client-side validation (the server validates again - never trust the browser)
    function validateApplication(form) {
        const v = n => form.elements[n].value.trim();
        if (v('name').length < 3) return 'Please enter your full name.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v('email'))) return 'Please enter a valid email address.';
        if (!/^[0-9+\-\s]{10,15}$/.test(v('phone'))) return 'Please enter a valid phone number.';
        const exp = Number(v('experience'));
        if (v('experience') === '' || isNaN(exp) || exp < 0 || exp > 40) return 'Experience must be between 0 and 40 years.';
        if (!skillList(v('skills')).length) return 'Please list at least one skill.';
        const file = form.elements.resume.files[0];
        if (file && file.size > 2 * 1024 * 1024) return 'Resume must be smaller than 2 MB.';
        if (file && !/\.pdf$/i.test(file.name)) return 'Resume must be a PDF file.';
        return null;
    }

    function closeModal() {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
        history.replaceState(null, '', location.pathname);
    }
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal(); });
}

/* =========================================================
   LOGIN PAGE
   ========================================================= */
function initLogin() {
    // Already logged in? Go straight to the dashboard.
    api('me').then(() => location.replace('dashboard.html')).catch(() => {});

    const form = document.getElementById('loginForm');
    const errBox = document.getElementById('loginError');
    form.addEventListener('submit', async e => {
        e.preventDefault();
        const email = form.email.value.trim();
        const password = form.password.value;
        if (!email || !password) {
            errBox.textContent = 'Please enter your email and password.';
            errBox.classList.remove('hidden');
            return;
        }
        const btn = form.querySelector('button');
        btn.disabled = true;
        try {
            await api('login', { email, password });
            location.replace('dashboard.html');
        } catch (err) {
            errBox.textContent = err.message;
            errBox.classList.remove('hidden');
            btn.disabled = false;
        }
    });
}

const page = document.body.dataset.page;
if (page === 'careers') initCareers();
if (page === 'login') initLogin();
