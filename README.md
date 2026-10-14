# HireFlow: Applicant Tracking System (ATS)

**Student:** Harish Akshay · **Subject:** Web Programming · **Project 1**

HireFlow is a recruitment platform like Greenhouse, Zoho Recruit or Lever, which HR teams use to hire.
A company publishes jobs on a **public careers page**, candidates apply online, and recruiters manage everyone
through a **drag-and-drop hiring pipeline** with ratings, notes, interviews and analytics.

---

## Problem statement
Small and mid-size companies still hire using email inboxes and Excel sheets. Resumes get lost, nobody knows
which stage a candidate is in, interviews clash and candidates wait weeks for a reply.
HireFlow puts the whole hiring process in one place and **scores every applicant automatically** against the job's required skills.

## Key features
| Area | Feature |
|---|---|
| Careers page | Lists open jobs, filters by department, searches, shows job details and takes an application with a PDF resume upload |
| Smart matching | Every application gets a **skill-match score (%)** comparing the candidate's skills with the job's skills |
| Pipeline | Kanban board: Applied → Screening → Interview → Offer → Hired / Rejected, moved with **drag and drop** |
| Candidate profile | Stage changer, 5-star rating, matched and missing skills, resume viewer, private notes, full activity timeline |
| Interviews | Schedule rounds (HR / Technical / Final), mark them completed with feedback, record no-shows and cancellations. Scheduling automatically moves the candidate to *Interview*. |
| Jobs | Post, edit, close or reopen jobs. Editing the skills **recalculates every applicant's match score**. |
| Analytics | Total applicants, new this week, **time-to-hire**, hiring funnel conversion %, source effectiveness, and a list of candidates stuck in a stage for 5+ days |
| Export | Download the filtered candidate list as **CSV** |
| Security | Hashed passwords (`password_hash`), PHP sessions, prepared SQL statements, server-side validation, escaped output, PDF-only uploads, and resumes served only to logged-in recruiters |

## Technology used
| Layer | Technology | Where |
|---|---|---|
| Structure | **HTML5** | `index.html`, `login.html`, `dashboard.html` |
| Styling | **CSS3** (custom properties, grid, flexbox, animations, responsive) | `style.css` |
| Client logic | **JavaScript** (fetch API, DOM, validation) | `app.js` |
| UI library | **React 18** (hooks, components, drag & drop) via CDN | `dashboard.jsx` |
| Backend | **PHP 8** (REST-style JSON API, sessions, file upload) | `api.php` |
| Database | **SQLite** via PDO | `db.php` → creates `hireflow.db` |

## Project structure
```
Harish Akshay Project 1/
├── index.html      Public careers page (vanilla JS)
├── login.html      Recruiter login
├── dashboard.html  Recruiter dashboard (React app mounts here)
├── style.css       All styles
├── app.js          Shared helpers + careers page + login logic
├── dashboard.jsx   React components: Overview, Pipeline, Candidates, Jobs, Interviews, Drawer
├── api.php         JSON API (all actions)
├── db.php          SQLite connection, table creation, demo data
├── start.bat       Double-click to run
└── README.md
```
`hireflow.db` and the `uploads/` folder are created automatically on the first run.

## Database design (6 tables)
- **users**: recruiters (name, email, password_hash, role)
- **jobs**: title, department, location, type, salary, required *skills*, description, status
- **candidates**: belongs to a job; contact, experience, skills, source, resume, *stage*, *rating*, *match_score*
- **stage_history**: every stage change (from → to, who, when). Used for the timeline, funnel and time-to-hire.
- **notes**: private recruiter notes on a candidate
- **interviews**: round, interviewer, date-time, mode, status, feedback

Relationships: `jobs 1─N candidates 1─N (stage_history, notes, interviews)`, with `ON DELETE CASCADE`.

## How to run
1. Double-click **`start.bat`**, or open a terminal in this folder and run:
   ```
   php -S localhost:8001
   ```
2. Open **http://localhost:8001** in your browser.
3. Recruiter login: **recruiter@hireflow.test** / **hireflow123**

> An internet connection is needed for Google Fonts and the React CDN.
> To reset all demo data, stop the server and delete `hireflow.db`.

## Demo script (for the viva)
1. Careers page: filter by *Engineering*, open **Frontend Developer** and apply with your own skills, which gives you a reference number.
2. Log in and see the new applicant on the **Overview** with an automatic match %.
3. **Pipeline**: drag the candidate from *Applied* to *Screening* and a toast confirms it.
4. Click the card: rate it ★★★★, add a note, and **schedule an interview**. The candidate moves to *Interview* automatically.
5. **Interviews**: mark it *Completed* with feedback.
6. **Jobs**: edit a job's skills and watch the match scores change. Close a job and it disappears from the careers page.
7. **Candidates**: sort by *Best match* and export to CSV.
