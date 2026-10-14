/* =========================================================
   HireFlow - Recruiter Dashboard (React 18)
   Views: Overview · Pipeline (drag & drop) · Candidates · Jobs · Interviews
   Uses the helpers from app.js: api, esc, toast, fmtDate, timeAgo ...
   ========================================================= */
const { useState, useEffect, useMemo } = React;

const STAGES = [
    { key: 'applied', label: 'Applied', color: '#6b7c93' },
    { key: 'screening', label: 'Screening', color: '#3a7bd5' },
    { key: 'interview', label: 'Interview', color: '#8a5cd1' },
    { key: 'offer', label: 'Offer', color: '#e0a526' },
    { key: 'hired', label: 'Hired', color: '#1f8a5b' },
    { key: 'rejected', label: 'Rejected', color: '#c2412d' },
];
const stageOf = key => STAGES.find(s => s.key === key) || STAGES[0];
const matchClass = n => (n >= 75 ? 'hi' : n >= 50 ? 'mid' : 'lo');

/* ---------- Small reusable pieces ---------- */
function Avatar({ name, size = 34 }) {
    return <span className="avatar" style={{ background: avatarColor(name), width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</span>;
}
function StageBadge({ stage }) {
    const s = stageOf(stage);
    return <span className="badge" style={{ color: s.color, background: s.color + '1f' }}>{s.label}</span>;
}
function Stars({ value, onChange }) {
    if (!onChange) return <span className="stars">{'★'.repeat(value)}<span style={{ color: '#d9d4c7' }}>{'★'.repeat(5 - value)}</span></span>;
    return (
        <span className="stars">
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n === value ? 0 : n)} title={`${n} star${n > 1 ? 's' : ''}`}>★</button>
            ))}
        </span>
    );
}
function Modal({ title, onClose, children }) {
    return (
        <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
            <div className="modal">
                <button className="modal-close" onClick={onClose}>×</button>
                <h2 style={{ marginBottom: 18 }}>{title}</h2>
                {children}
            </div>
        </div>
    );
}
/** Loads data from the API and reloads whenever `deps` change */
function useApi(action, query, deps) {
    const [data, setData] = useState(null);
    useEffect(() => {
        let alive = true;
        api(action, null, query).then(d => alive && setData(d)).catch(e => toast(e.message, true));
        return () => { alive = false; };
    }, deps);
    return data;
}

/* =========================================================
   APP SHELL
   ========================================================= */
function App() {
    const [user, setUser] = useState(null);
    const [view, setView] = useState(() => location.hash.slice(1) || 'overview');
    const [openId, setOpenId] = useState(null);          // candidate shown in the drawer
    const [pipelineJob, setPipelineJob] = useState('');  // job filter shared by Jobs -> Pipeline
    const [version, setVersion] = useState(0);           // bump this to reload every view
    const refresh = () => setVersion(v => v + 1);

    useEffect(() => { api('me').then(setUser).catch(() => location.replace('login.html')); }, []);
    useEffect(() => { history.replaceState(null, '', '#' + view); }, [view]);
    const stats = useApi('stats', {}, [version]);
    const jobs = useApi('jobs', {}, [version]);

    if (!user) return <div className="loading">Loading workspace…</div>;

    const nav = [
        ['overview', '◧', 'Overview'],
        ['pipeline', '▤', 'Pipeline'],
        ['candidates', '☰', 'Candidates'],
        ['jobs', '✦', 'Jobs'],
        ['interviews', '◷', 'Interviews', stats?.upcoming],
    ];
    const logout = async () => { await api('logout', {}); location.replace('login.html'); };
    const props = { version, refresh, onOpen: setOpenId, jobs: jobs || [] };

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="logo"><span className="logo-mark">H</span> HireFlow</div>
                {nav.map(([key, ico, label, count]) => (
                    <button key={key} className={'nav-btn' + (view === key ? ' active' : '')} onClick={() => setView(key)}>
                        <span className="ico">{ico}</span>{label}
                        {count ? <span className="count">{count}</span> : null}
                    </button>
                ))}
                <a className="nav-btn" href="index.html" target="_blank"><span className="ico">↗</span>Careers page</a>
                <div className="sidebar-foot">
                    <b>{user.name}</b>{user.email}<br />
                    <a href="#" onClick={e => { e.preventDefault(); logout(); }}>Sign out</a>
                </div>
            </aside>

            <main className="main">
                {view === 'overview' && <Overview stats={stats} {...props} />}
                {view === 'pipeline' && <Pipeline {...props} jobId={pipelineJob} setJobId={setPipelineJob} />}
                {view === 'candidates' && <Candidates {...props} />}
                {view === 'jobs' && <Jobs {...props} onPipeline={id => { setPipelineJob(String(id)); setView('pipeline'); }} />}
                {view === 'interviews' && <Interviews {...props} />}
            </main>

            {openId && <CandidateDrawer id={openId} onClose={() => setOpenId(null)} refresh={refresh} />}
        </div>
    );
}

/* =========================================================
   OVERVIEW - KPIs, hiring funnel, sources, per-job table
   ========================================================= */
function Overview({ stats, version, onOpen }) {
    const candidates = useApi('candidates', {}, [version]);
    if (!stats) return <div className="loading">Crunching numbers…</div>;

    const top = stats.funnel[0].count || 1;
    const maxSource = Math.max(1, ...stats.sources.map(s => +s.n));
    // Candidates waiting 5+ days in an active stage need a recruiter's attention
    const stale = (candidates || []).filter(c => !['hired', 'rejected'].includes(c.stage) && c.days_in_stage >= 5)
        .sort((a, b) => b.days_in_stage - a.days_in_stage).slice(0, 6);

    return (
        <>
            <div className="page-head">
                <div><h1>Hiring overview</h1><p>{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p></div>
            </div>

            <div className="kpis">
                <div className="kpi"><span>Total applicants</span><b>{stats.total}</b><small>across all jobs</small></div>
                <div className="kpi"><span>New this week</span><b>{stats.new_this_week}</b><small>last 7 days</small></div>
                <div className="kpi"><span>Open jobs</span><b>{stats.open_jobs}</b><small>accepting applications</small></div>
                <div className="kpi"><span>Interviews</span><b>{stats.upcoming}</b><small>upcoming</small></div>
                <div className="kpi accent"><span>Time to hire</span><b>{stats.avg_days_to_hire || '–'}</b><small>average days</small></div>
            </div>

            <div className="grid-overview">
                <div className="card">
                    <h3>Hiring funnel <small>% of all applicants who reached each stage</small></h3>
                    {stats.funnel.map(f => {
                        const pct = Math.round((f.count / top) * 100);
                        return (
                            <div className="funnel-row" key={f.stage}>
                                <span>{stageOf(f.stage).label}</span>
                                <div className="funnel-bar"><i style={{ width: pct + '%', background: stageOf(f.stage).color }} /></div>
                                <span className="pct"><b>{f.count}</b> · {pct}%</span>
                            </div>
                        );
                    })}
                </div>
                <div className="card">
                    <h3>Where candidates come from <small>applicants</small></h3>
                    {stats.sources.map(s => (
                        <div className="hbar" key={s.source}>
                            <span>{s.source}</span>
                            <div className="track"><i style={{ width: (s.n / maxSource) * 100 + '%' }} /></div>
                            <b>{s.n}</b>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid-overview">
                <div className="card">
                    <h3>Jobs at a glance</h3>
                    <div className="table-wrap">
                        <table className="data">
                            <thead><tr><th>Role</th><th>Status</th><th>Applicants</th><th>In process</th><th>Hired</th><th>Avg match</th></tr></thead>
                            <tbody>
                                {stats.per_job.map(j => (
                                    <tr key={j.id}>
                                        <td><b>{j.title}</b></td>
                                        <td><span className={'badge ' + j.status}>{j.status}</span></td>
                                        <td>{j.applicants}</td><td>{j.active || 0}</td><td>{j.hired || 0}</td>
                                        <td>{j.avg_match != null ? <span className={'match ' + matchClass(j.avg_match)}>{j.avg_match}%</span> : '–'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="card">
                    <h3>Needs attention <small>5+ days in the same stage</small></h3>
                    {!stale.length && <p style={{ color: 'var(--muted)' }}>All caught up - no candidate is waiting too long. 🎉</p>}
                    {stale.map(c => (
                        <div key={c.id} className="cand-top" style={{ padding: '8px 0', cursor: 'pointer', borderBottom: '1px solid var(--line)' }} onClick={() => onOpen(c.id)}>
                            <Avatar name={c.name} />
                            <div style={{ flex: 1 }}><b>{c.name}</b><small>{c.job_title}</small></div>
                            <div style={{ textAlign: 'right' }}><StageBadge stage={c.stage} /><br /><small style={{ color: 'var(--danger)', fontWeight: 700 }}>{c.days_in_stage} days</small></div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

/* =========================================================
   PIPELINE - Kanban board with HTML5 drag and drop
   ========================================================= */
function Pipeline({ jobs, jobId, setJobId, version, refresh, onOpen }) {
    const [list, setList] = useState(null);
    const [q, setQ] = useState('');
    const [over, setOver] = useState(null);
    const [dragId, setDragId] = useState(null);

    useEffect(() => {
        api('candidates', null, jobId ? { job_id: jobId } : {}).then(setList).catch(e => toast(e.message, true));
    }, [jobId, version]);

    const move = async (id, stage) => {
        const c = list.find(x => x.id == id);
        if (!c || c.stage === stage) return;
        setList(l => l.map(x => (x.id == id ? { ...x, stage, days_in_stage: 0 } : x))); // optimistic update
        try {
            await api('move_stage', { id, stage });
            toast(`${c.name} → ${stageOf(stage).label}`);
            refresh();
        } catch (e) { toast(e.message, true); refresh(); }
    };

    const shown = (list || []).filter(c => !q || (c.name + ' ' + c.skills).toLowerCase().includes(q.toLowerCase()));

    return (
        <>
            <div className="page-head">
                <div><h1>Pipeline</h1><p>Drag candidates between stages. Every move is recorded in their history.</p></div>
                <div className="toolbar">
                    <select className="input" value={jobId} onChange={e => setJobId(e.target.value)}>
                        <option value="">All jobs</option>
                        {jobs.map(j => <option key={j.id} value={j.id}>{j.title}{j.status === 'closed' ? ' (closed)' : ''}</option>)}
                    </select>
                    <input className="input" type="search" placeholder="Search name or skill…" value={q} onChange={e => setQ(e.target.value)} />
                </div>
            </div>
            {!list ? <div className="loading">Loading pipeline…</div> : (
                <div className="board">
                    {STAGES.map(s => {
                        const cards = shown.filter(c => c.stage === s.key);
                        return (
                            <div key={s.key} className={'column' + (over === s.key ? ' drop' : '')}
                                onDragOver={e => { e.preventDefault(); setOver(s.key); }}
                                onDragLeave={() => setOver(null)}
                                onDrop={e => { e.preventDefault(); setOver(null); move(e.dataTransfer.getData('text/plain'), s.key); }}>
                                <div className="column-head"><span className="dot" style={{ background: s.color }} />{s.label}<span className="n">{cards.length}</span></div>
                                {cards.map(c => (
                                    <div key={c.id} className={'cand-card' + (dragId == c.id ? ' dragging' : '')} draggable
                                        onDragStart={e => { e.dataTransfer.setData('text/plain', c.id); setDragId(c.id); }}
                                        onDragEnd={() => setDragId(null)}
                                        onClick={() => onOpen(c.id)}>
                                        <div className="cand-top">
                                            <Avatar name={c.name} />
                                            <div><b>{c.name}</b><small>{c.job_title}</small></div>
                                        </div>
                                        <div className="cand-foot">
                                            <span className={'match ' + matchClass(c.match_score)} title="Skill match with the job">{c.match_score}% match</span>
                                            <Stars value={c.rating} />
                                        </div>
                                        <div className="cand-foot" style={{ marginTop: 6 }}>
                                            <span>{c.experience} yrs · {c.source}</span>
                                            <span style={{ color: c.days_in_stage >= 5 && !['hired', 'rejected'].includes(c.stage) ? 'var(--danger)' : '' }}>{c.days_in_stage}d</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </>
    );
}

/* =========================================================
   CANDIDATES - searchable table + CSV export
   ========================================================= */
function Candidates({ version, onOpen }) {
    const list = useApi('candidates', {}, [version]);
    const [q, setQ] = useState('');
    const [stage, setStage] = useState('');
    const [sort, setSort] = useState('match');

    const rows = useMemo(() => {
        const r = (list || []).filter(c =>
            (!stage || c.stage === stage) &&
            (!q || [c.name, c.email, c.skills, c.job_title].join(' ').toLowerCase().includes(q.toLowerCase())));
        const by = {
            match: (a, b) => b.match_score - a.match_score,
            rating: (a, b) => b.rating - a.rating,
            newest: (a, b) => toDate(b.applied_at) - toDate(a.applied_at),
            name: (a, b) => a.name.localeCompare(b.name),
        };
        return r.sort(by[sort]);
    }, [list, q, stage, sort]);

    const exportCsv = () => {
        const head = ['Name', 'Email', 'Job', 'Stage', 'Match %', 'Rating', 'Experience', 'Source', 'Applied'];
        const lines = rows.map(c => [c.name, c.email, c.job_title, c.stage, c.match_score, c.rating, c.experience, c.source, c.applied_at]);
        const csv = [head, ...lines].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'hireflow-candidates.csv';
        a.click();
    };

    return (
        <>
            <div className="page-head">
                <div><h1>Candidates</h1><p>{rows.length} of {list?.length ?? '…'} candidates</p></div>
                <div className="toolbar">
                    <input className="input" type="search" placeholder="Search name, email, skill…" value={q} onChange={e => setQ(e.target.value)} />
                    <select className="input" value={stage} onChange={e => setStage(e.target.value)}>
                        <option value="">All stages</option>
                        {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                    <select className="input" value={sort} onChange={e => setSort(e.target.value)}>
                        <option value="match">Best match</option><option value="rating">Top rated</option>
                        <option value="newest">Newest</option><option value="name">Name A–Z</option>
                    </select>
                    <button className="btn btn-ghost" onClick={exportCsv}>⤓ Export CSV</button>
                </div>
            </div>
            <div className="card table-wrap">
                {!list ? <div className="loading">Loading…</div> : (
                    <table className="data">
                        <thead><tr><th>Candidate</th><th>Applied for</th><th>Stage</th><th>Match</th><th>Rating</th><th>Exp.</th><th>Source</th><th>Applied</th></tr></thead>
                        <tbody>
                            {rows.map(c => (
                                <tr key={c.id} className="click" onClick={() => onOpen(c.id)}>
                                    <td><div className="cand-top"><Avatar name={c.name} size={30} /><div><b>{c.name}</b><small>{c.email}</small></div></div></td>
                                    <td>{c.job_title}</td>
                                    <td><StageBadge stage={c.stage} /></td>
                                    <td><span className={'match ' + matchClass(c.match_score)}>{c.match_score}%</span></td>
                                    <td><Stars value={c.rating} /></td>
                                    <td>{c.experience} yrs</td>
                                    <td>{c.source}</td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{timeAgo(c.applied_at)}</td>
                                </tr>
                            ))}
                            {!rows.length && <tr><td colSpan="8" className="empty">No candidates match these filters.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}

/* =========================================================
   JOBS - create / edit / open-close job postings
   ========================================================= */
function Jobs({ jobs, refresh, onPipeline }) {
    const [editing, setEditing] = useState(null); // null = closed, {} = new job, job = edit

    const toggle = async j => {
        await api('job_toggle', { id: j.id });
        toast(`${j.title} is now ${j.status === 'open' ? 'closed' : 'open'}`);
        refresh();
    };

    return (
        <>
            <div className="page-head">
                <div><h1>Jobs</h1><p>Open roles appear instantly on the public careers page.</p></div>
                <button className="btn btn-coral" onClick={() => setEditing({})}>+ New job</button>
            </div>
            <div className="job-cards">
                {jobs.map(j => (
                    <div key={j.id} className="job-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span className="eyebrow">{j.department}</span>
                            <span className={'badge ' + j.status}>{j.status}</span>
                        </div>
                        <h3>{j.title}</h3>
                        <div className="job-meta"><span>📍 {j.location}</span><span>{j.job_type}</span><span>{j.salary}</span></div>
                        <div className="chips">{skillList(j.skills).map(s => <span key={s} className="chip">{s}</span>)}</div>
                        <div className="nums">
                            <div><b>{j.applicants}</b><span>Applicants</span></div>
                            <div><b>{j.active || 0}</b><span>In process</span></div>
                            <div><b>{Math.max(0, Math.floor((Date.now() - toDate(j.created_at)) / 86400000))}d</b><span>Since posted</span></div>
                        </div>
                        <div className="actions">
                            <button className="btn btn-primary btn-sm" onClick={() => onPipeline(j.id)}>View pipeline</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(j)}>Edit</button>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggle(j)}>{j.status === 'open' ? 'Close' : 'Reopen'}</button>
                        </div>
                    </div>
                ))}
            </div>
            {editing && <JobForm job={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
        </>
    );
}

function JobForm({ job, onClose, onSaved }) {
    const [f, setF] = useState({
        id: job.id || 0, title: job.title || '', department: job.department || 'Engineering', location: job.location || '',
        job_type: job.job_type || 'Full-time', experience: job.experience || '', salary: job.salary || '',
        skills: job.skills || '', description: job.description || '',
    });
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const set = k => e => setF({ ...f, [k]: e.target.value });

    const save = async e => {
        e.preventDefault();
        setBusy(true);
        try {
            await api('job_save', f);
            toast(job.id ? 'Job updated - match scores recalculated' : 'Job published to careers page');
            onSaved();
        } catch (err) { setError(err.message); setBusy(false); }
    };

    return (
        <Modal title={job.id ? 'Edit job' : 'Post a new job'} onClose={onClose}>
            <form onSubmit={save}>
                {error && <div className="form-error">{error}</div>}
                <div className="field"><label>Job title *</label><input value={f.title} onChange={set('title')} required /></div>
                <div className="grid-2">
                    <div className="field"><label>Department *</label>
                        <select value={f.department} onChange={set('department')}>
                            {['Engineering', 'Design', 'Analytics', 'Product', 'Sales', 'Marketing', 'People', 'Finance'].map(d => <option key={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="field"><label>Location *</label><input value={f.location} onChange={set('location')} placeholder="Chennai / Remote" required /></div>
                    <div className="field"><label>Employment type *</label>
                        <select value={f.job_type} onChange={set('job_type')}>
                            {['Full-time', 'Part-time', 'Internship', 'Contract'].map(d => <option key={d}>{d}</option>)}
                        </select>
                    </div>
                    <div className="field"><label>Experience</label><input value={f.experience} onChange={set('experience')} placeholder="1-3 years" /></div>
                </div>
                <div className="field"><label>Salary range</label><input value={f.salary} onChange={set('salary')} placeholder="₹6 - 10 LPA" /></div>
                <div className="field"><label>Required skills *</label><input value={f.skills} onChange={set('skills')} placeholder="HTML, CSS, JavaScript" required />
                    <span className="hint">Comma separated. Used to calculate each applicant's match score.</span></div>
                <div className="field"><label>Description *</label><textarea rows="6" value={f.description} onChange={set('description')} required /></div>
                <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : job.id ? 'Save changes' : 'Publish job'}</button>
            </form>
        </Modal>
    );
}

/* =========================================================
   INTERVIEWS - upcoming schedule grouped by day
   ========================================================= */
function Interviews({ version, refresh, onOpen }) {
    const list = useApi('interviews', {}, [version]);
    if (!list) return <div className="loading">Loading interviews…</div>;

    const upcoming = list.filter(i => i.status === 'scheduled');
    const past = list.filter(i => i.status !== 'scheduled');
    const groups = {};
    upcoming.forEach(i => {
        const day = toDate(i.scheduled_at).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
        (groups[day] = groups[day] || []).push(i);
    });
    const setStatus = async (i, status) => {
        const feedback = status === 'completed' ? prompt(`Feedback for ${i.candidate} (${i.round}):`) : null;
        if (status === 'completed' && feedback === null) return;
        await api('interview_update', { id: i.id, status, feedback });
        toast('Interview marked ' + status);
        refresh();
    };

    return (
        <>
            <div className="page-head"><div><h1>Interviews</h1><p>{upcoming.length} upcoming · {past.length} past</p></div></div>
            {!upcoming.length && <div className="card empty">No interviews scheduled. Schedule one from a candidate's profile.</div>}
            {Object.entries(groups).map(([day, items]) => (
                <div className="day-group" key={day}>
                    <h4>{day}</h4>
                    {items.map(i => (
                        <div className="iv-row" key={i.id}>
                            <span className="time">{toDate(i.scheduled_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span>
                            <div style={{ cursor: 'pointer' }} onClick={() => onOpen(i.candidate_id)}>
                                <b>{i.candidate}</b> · {i.round}<br />
                                <small style={{ color: 'var(--muted)' }}>{i.job_title} · with {i.interviewer} · {i.mode}</small>
                            </div>
                            <div className="toolbar">
                                <button className="btn btn-primary btn-sm" onClick={() => setStatus(i, 'completed')}>Completed</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setStatus(i, 'no-show')}>No-show</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => setStatus(i, 'cancelled')}>Cancel</button>
                            </div>
                        </div>
                    ))}
                </div>
            ))}
            {past.length > 0 && (
                <div className="card table-wrap" style={{ marginTop: 10 }}>
                    <h3>Past interviews</h3>
                    <table className="data">
                        <thead><tr><th>Date</th><th>Candidate</th><th>Round</th><th>Interviewer</th><th>Status</th><th>Feedback</th></tr></thead>
                        <tbody>
                            {past.map(i => (
                                <tr key={i.id} className="click" onClick={() => onOpen(i.candidate_id)}>
                                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.scheduled_at)}</td>
                                    <td><b>{i.candidate}</b><br /><small style={{ color: 'var(--muted)' }}>{i.job_title}</small></td>
                                    <td>{i.round}</td><td>{i.interviewer}</td>
                                    <td><span className={'iv-status ' + i.status}>{i.status}</span></td>
                                    <td style={{ maxWidth: 320 }}>{i.feedback || '–'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}

/* =========================================================
   CANDIDATE DRAWER - full profile, stage, rating, notes,
   interviews and activity history
   ========================================================= */
function CandidateDrawer({ id, onClose, refresh }) {
    const [c, setC] = useState(null);
    const [tab, setTab] = useState('activity');
    const [note, setNote] = useState('');
    const load = () => api('candidate', null, { id }).then(setC).catch(e => { toast(e.message, true); onClose(); });

    useEffect(() => { setC(null); load(); }, [id]);
    useEffect(() => {
        const onKey = e => e.key === 'Escape' && onClose();
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    // Every change: save -> reload this profile -> reload lists behind the drawer
    const act = async (action, data, message) => {
        try { await api(action, data); if (message) toast(message); await load(); refresh(); return true; }
        catch (e) { toast(e.message, true); return false; }
    };

    const required = c ? skillList(c.job.skills) : [];
    const has = c ? skillList(c.skills).map(s => s.toLowerCase()) : [];
    const extra = c ? skillList(c.skills).filter(s => !required.some(r => r.toLowerCase() === s.toLowerCase())) : [];

    return (
        <>
            <div className="drawer-backdrop" onClick={onClose} />
            <aside className="drawer">
                {!c ? <div className="loading">Loading profile…</div> : (
                    <>
                        <div className="drawer-head">
                            <button className="modal-close" onClick={onClose}>×</button>
                            <div className="cand-top">
                                <Avatar name={c.name} size={52} />
                                <div>
                                    <h2>{c.name}</h2>
                                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>{c.job.title} · {c.job.location}</div>
                                </div>
                            </div>
                            <div className="contact">
                                <a href={'mailto:' + c.email}>✉ {c.email}</a>
                                <a href={'tel:' + c.phone.replace(/\s/g, '')}>☏ {c.phone}</a>
                                <span>{c.experience} yrs exp · via {c.source}</span>
                                <span>Ref HF-{String(c.id).padStart(4, '0')}</span>
                            </div>
                        </div>

                        <div className="drawer-body">
                            <section>
                                <h4>Stage</h4>
                                <div className="stage-picker">
                                    {STAGES.map(s => (
                                        <button key={s.key} className={c.stage === s.key ? 'on' : ''} style={c.stage === s.key ? { background: s.color } : {}}
                                            onClick={() => c.stage !== s.key && act('move_stage', { id: c.id, stage: s.key }, `Moved to ${s.label}`)}>
                                            {s.label}
                                        </button>
                                    ))}
                                </div>
                            </section>

                            <section style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div><h4>Your rating</h4><Stars value={c.rating} onChange={n => act('rate', { id: c.id, rating: n })} /></div>
                                {c.resume_path
                                    ? <a className="btn btn-ghost btn-sm" href={'api.php?action=resume&id=' + c.id} target="_blank">📄 View resume</a>
                                    : <span style={{ color: 'var(--muted)', fontSize: 13 }}>No resume uploaded</span>}
                            </section>

                            <section>
                                <h4>Skill match · {c.match_score}%</h4>
                                <div className="match-meter"><i style={{ width: c.match_score + '%' }} /></div>
                                <div className="chips">
                                    {required.map(s => <span key={s} className={'chip ' + (has.includes(s.toLowerCase()) ? 'ok' : 'miss')}>{s}</span>)}
                                    {extra.map(s => <span key={s} className="chip">+ {s}</span>)}
                                </div>
                            </section>

                            {c.cover_note && <section><h4>Cover note</h4><p style={{ fontSize: 14, color: 'var(--ink-2)' }}>{c.cover_note}</p></section>}

                            <div className="tabs">
                                {[['activity', 'Activity'], ['notes', `Notes (${c.notes.length})`], ['interviews', `Interviews (${c.interviews.length})`]].map(([k, l]) => (
                                    <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
                                ))}
                            </div>

                            {tab === 'activity' && (
                                <ul className="timeline">
                                    {c.history.map(h => (
                                        <li key={h.id}>
                                            {h.from_stage ? <>Moved from <b>{stageOf(h.from_stage).label}</b> to <b>{stageOf(h.to_stage).label}</b></> : <>Applied for <b>{c.job.title}</b></>}
                                            <small>{h.changed_by} · {fmtDate(h.changed_at, true)}</small>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {tab === 'notes' && (
                                <>
                                    <form onSubmit={e => { e.preventDefault(); if (note.trim()) act('add_note', { id: c.id, body: note }, 'Note added').then(ok => ok && setNote('')); }}>
                                        <div className="field"><textarea placeholder="Write a private note for your hiring team…" value={note} onChange={e => setNote(e.target.value)} /></div>
                                        <button className="btn btn-primary btn-sm" style={{ marginBottom: 16 }}>Add note</button>
                                    </form>
                                    {c.notes.map(n => <div className="note" key={n.id}>{n.body}<small>{n.author} · {timeAgo(n.created_at)}</small></div>)}
                                </>
                            )}

                            {tab === 'interviews' && (
                                <>
                                    <ScheduleForm candidateId={c.id} act={act} />
                                    {c.interviews.map(i => (
                                        <div className="iv" key={i.id}>
                                            <div className="iv-head"><b>{i.round}</b><span className={'iv-status ' + i.status}>{i.status}</span></div>
                                            <small style={{ color: 'var(--muted)' }}>{fmtDate(i.scheduled_at, true)} · {i.mode} · with {i.interviewer}</small>
                                            {i.feedback && <p style={{ fontSize: 14, marginTop: 6 }}>“{i.feedback}”</p>}
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </>
                )}
            </aside>
        </>
    );
}

function ScheduleForm({ candidateId, act }) {
    const [open, setOpen] = useState(false);
    const [f, setF] = useState({ round: 'Technical Round', interviewer: '', scheduled_at: '', mode: 'Video' });
    const set = k => e => setF({ ...f, [k]: e.target.value });
    const minTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    if (!open) return <button className="btn btn-coral btn-sm" style={{ marginBottom: 14 }} onClick={() => setOpen(true)}>+ Schedule interview</button>;
    return (
        <form className="card" style={{ marginBottom: 14 }} onSubmit={async e => {
            e.preventDefault();
            if (await act('schedule_interview', { candidate_id: candidateId, ...f }, 'Interview scheduled')) setOpen(false);
        }}>
            <div className="grid-2">
                <div className="field"><label>Round</label>
                    <select value={f.round} onChange={set('round')}>{['HR Round', 'Technical Round', 'Managerial Round', 'Final Round'].map(r => <option key={r}>{r}</option>)}</select>
                </div>
                <div className="field"><label>Mode</label>
                    <select value={f.mode} onChange={set('mode')}>{['Video', 'In-person', 'Phone'].map(r => <option key={r}>{r}</option>)}</select>
                </div>
                <div className="field"><label>Interviewer</label><input value={f.interviewer} onChange={set('interviewer')} placeholder="Ramesh Kannan" required /></div>
                <div className="field"><label>Date & time</label><input type="datetime-local" min={minTime} value={f.scheduled_at} onChange={set('scheduled_at')} required /></div>
            </div>
            <div className="toolbar">
                <button className="btn btn-primary btn-sm">Schedule</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            </div>
        </form>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
