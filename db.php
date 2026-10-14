<?php
/**
 * HireFlow - database layer
 * Opens the SQLite database, creates the tables on first run
 * and fills them with realistic demo data.
 */
date_default_timezone_set('Asia/Kolkata');

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;

    $pdo = new PDO('sqlite:' . __DIR__ . '/hireflow.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');

    create_schema($pdo);
    if ((int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0) {
        seed($pdo);
    }
    return $pdo;
}

function create_schema(PDO $pdo): void
{
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'recruiter'
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            department  TEXT NOT NULL,
            location    TEXT NOT NULL,
            job_type    TEXT NOT NULL,
            experience  TEXT,
            salary      TEXT,
            skills      TEXT NOT NULL,          -- comma separated, used for match score
            description TEXT NOT NULL,
            status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
            created_at  TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS candidates (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id      INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
            name        TEXT NOT NULL,
            email       TEXT NOT NULL,
            phone       TEXT NOT NULL,
            experience  REAL NOT NULL DEFAULT 0,
            skills      TEXT NOT NULL,
            source      TEXT NOT NULL DEFAULT 'Careers Page',
            cover_note  TEXT,
            resume_path TEXT,
            stage       TEXT NOT NULL DEFAULT 'applied',
            rating      INTEGER NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
            match_score INTEGER NOT NULL DEFAULT 0,
            applied_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL,
            UNIQUE (job_id, email)
        );

        CREATE TABLE IF NOT EXISTS stage_history (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
            from_stage   TEXT,
            to_stage     TEXT NOT NULL,
            changed_by   TEXT NOT NULL,
            changed_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS notes (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
            author       TEXT NOT NULL,
            body         TEXT NOT NULL,
            created_at   TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS interviews (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
            round        TEXT NOT NULL,
            interviewer  TEXT NOT NULL,
            scheduled_at TEXT NOT NULL,
            mode         TEXT NOT NULL,
            status       TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled','no-show')),
            feedback     TEXT
        );
    ");
}

/** Turns "React, JS ,css" into ['react','js','css'] */
function skill_list(string $skills): array
{
    $list = array_map(fn($s) => strtolower(trim($s)), explode(',', $skills));
    return array_values(array_unique(array_filter($list, fn($s) => $s !== '')));
}

/** Percentage of the job's required skills that the candidate has */
function match_score(string $jobSkills, string $candidateSkills): int
{
    $required = skill_list($jobSkills);
    if (!$required) return 0;
    $matched = array_intersect($required, skill_list($candidateSkills));
    return (int) round(count($matched) / count($required) * 100);
}

function seed(PDO $pdo): void
{
    $pdo->beginTransaction();
    $ts = fn(int $daysAgo, int $hour = 10) => date('Y-m-d H:i:s', strtotime("-$daysAgo days $hour:00"));

    $pdo->prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,?)')
        ->execute(['Harish Akshay', 'recruiter@hireflow.test', password_hash('hireflow123', PASSWORD_DEFAULT), 'admin']);

    $jobs = [
        ['Frontend Developer', 'Engineering', 'Chennai', 'Full-time', '1-3 years', '₹6 - 10 LPA',
            'HTML, CSS, JavaScript, React, Git, REST API',
            "You will build fast, accessible interfaces for our SaaS products used by 40,000+ businesses.\n\nResponsibilities:\n• Convert Figma designs into responsive, pixel-perfect UI\n• Build reusable React components\n• Work closely with backend engineers on REST APIs\n• Review code and mentor interns", 'open', 30],
        ['Backend Developer (PHP)', 'Engineering', 'Bengaluru', 'Full-time', '2-4 years', '₹8 - 14 LPA',
            'PHP, MySQL, SQLite, REST API, Git, Linux',
            "Design and scale the APIs that power our platform.\n\nResponsibilities:\n• Build secure REST APIs in PHP\n• Design efficient database schemas\n• Write automated tests and monitor production\n• Improve performance of high-traffic endpoints", 'open', 24],
        ['UI/UX Designer', 'Design', 'Remote', 'Full-time', '1-3 years', '₹5 - 9 LPA',
            'Figma, User Research, Prototyping, Design Systems, Wireframing',
            "Shape how customers experience our product.\n\nResponsibilities:\n• Run user interviews and usability tests\n• Create wireframes, prototypes and final UI\n• Maintain our design system\n• Partner with engineers through delivery", 'open', 18],
        ['Data Analyst', 'Analytics', 'Hyderabad', 'Full-time', '0-2 years', '₹4.5 - 7 LPA',
            'SQL, Python, Excel, Power BI, Statistics',
            "Turn raw data into decisions.\n\nResponsibilities:\n• Write SQL to answer business questions\n• Build Power BI dashboards for leadership\n• Analyse funnels, retention and revenue\n• Present insights to non-technical teams", 'open', 12],
        ['HR Executive', 'People', 'Chennai', 'Full-time', '0-2 years', '₹3.5 - 5 LPA',
            'Recruitment, Communication, MS Office, Onboarding',
            "Help us hire and grow great people.\n\nResponsibilities:\n• Source and screen candidates\n• Coordinate interviews\n• Run onboarding for new joiners", 'closed', 45],
    ];
    $insJob = $pdo->prepare('INSERT INTO jobs (title, department, location, job_type, experience, salary, skills, description, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
    foreach ($jobs as $j) {
        $insJob->execute([$j[0], $j[1], $j[2], $j[3], $j[4], $j[5], $j[6], $j[7], $j[8], $ts($j[9], 9)]);
    }
    $jobSkills = $pdo->query('SELECT id, skills FROM jobs')->fetchAll(PDO::FETCH_KEY_PAIR);

    // name, job_id, exp, skills, source, final stage, rating, applied days ago
    $people = [
        ['Arjun Raghavan', 1, 2, 'HTML, CSS, JavaScript, React, Git, TypeScript', 'LinkedIn', 'offer', 5, 26],
        ['Sneha Iyer', 1, 1.5, 'HTML, CSS, JavaScript, React, REST API', 'Referral', 'interview', 4, 20],
        ['Karthik Subramanian', 1, 3, 'HTML, CSS, JavaScript, Vue, Git', 'Naukri', 'screening', 3, 9],
        ['Divya Menon', 1, 0.5, 'HTML, CSS, JavaScript', 'Campus Drive', 'applied', 0, 3],
        ['Rahul Verma', 1, 2, 'HTML, CSS, Angular, Git', 'Naukri', 'rejected', 2, 22],
        ['Meera Krishnan', 1, 1, 'HTML, CSS, JavaScript, React, Git, REST API', 'Careers Page', 'applied', 0, 1],
        ['Vignesh Kumar', 2, 3, 'PHP, MySQL, REST API, Git, Linux, Laravel', 'LinkedIn', 'hired', 5, 23],
        ['Ananya Reddy', 2, 2.5, 'PHP, MySQL, SQLite, REST API, Git', 'Referral', 'interview', 4, 15],
        ['Mohammed Faizal', 2, 4, 'Java, Spring, MySQL, Git', 'Naukri', 'rejected', 1, 19],
        ['Lakshmi Narayanan', 2, 2, 'PHP, MySQL, Git', 'Careers Page', 'screening', 3, 6],
        ['Priya Dharshini', 3, 2, 'Figma, User Research, Prototyping, Design Systems, Wireframing', 'Dribbble', 'offer', 5, 16],
        ['Rohit Nair', 3, 1, 'Figma, Wireframing, Illustrator', 'LinkedIn', 'interview', 3, 11],
        ['Aishwarya S', 3, 0.5, 'Figma, Prototyping', 'Campus Drive', 'applied', 0, 2],
        ['Sanjay Gupta', 4, 1, 'SQL, Python, Excel, Power BI, Statistics', 'LinkedIn', 'interview', 4, 10],
        ['Fathima Begum', 4, 0, 'SQL, Excel, Statistics', 'Campus Drive', 'screening', 3, 5],
        ['Naveen Prakash', 4, 1.5, 'Python, Excel, Tableau', 'Naukri', 'applied', 0, 2],
        ['Kavya Raman', 5, 1, 'Recruitment, Communication, MS Office, Onboarding', 'Referral', 'hired', 4, 40],
        ['Deepak Joseph', 5, 0.5, 'Communication, MS Office', 'Naukri', 'rejected', 2, 38],
    ];

    $insCand = $pdo->prepare('INSERT INTO candidates (job_id, name, email, phone, experience, skills, source, cover_note, stage, rating, match_score, applied_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
    $insHist = $pdo->prepare('INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_by, changed_at) VALUES (?,?,?,?,?)');
    $insInt  = $pdo->prepare('INSERT INTO interviews (candidate_id, round, interviewer, scheduled_at, mode, status, feedback) VALUES (?,?,?,?,?,?,?)');
    $insNote = $pdo->prepare('INSERT INTO notes (candidate_id, author, body, created_at) VALUES (?,?,?,?)');
    $flow = ['applied', 'screening', 'interview', 'offer', 'hired'];

    foreach ($people as $i => [$name, $jobId, $exp, $skills, $source, $stage, $rating, $daysAgo]) {
        $email = strtolower(str_replace(' ', '.', $name)) . '@mail.com';
        $phone = '+91 9' . str_pad((string) (812345670 + $i * 7919), 9, '0', STR_PAD_LEFT);
        $note  = "I am excited about this role and believe my experience of $exp years matches what your team needs.";

        // Build the path the candidate travelled through the pipeline
        $path = $stage === 'rejected'
            ? ['applied', 'screening', 'rejected']
            : array_slice($flow, 0, array_search($stage, $flow) + 1);
        $step = max(1, intdiv($daysAgo, count($path) + 1));
        $lastAt = $ts($daysAgo);

        $insCand->execute([$jobId, $name, $email, $phone, $exp, $skills, $source, $note, $stage, $rating,
            match_score($jobSkills[$jobId], $skills), $ts($daysAgo), $ts($daysAgo)]);
        $cid = (int) $pdo->lastInsertId();

        foreach ($path as $k => $to) {
            $lastAt = $ts(max(0, $daysAgo - $k * $step), 10 + $k);
            $insHist->execute([$cid, $k ? $path[$k - 1] : null, $to, $k ? 'Harish Akshay' : 'Candidate', $lastAt]);
        }
        $pdo->prepare('UPDATE candidates SET updated_at = ? WHERE id = ?')->execute([$lastAt, $cid]);

        if (in_array($stage, ['interview', 'offer', 'hired'])) {
            $insInt->execute([$cid, 'Technical Round', 'Ramesh Kannan', $ts(max(1, $daysAgo - 2 * $step), 11), 'Video', 'completed',
                'Strong fundamentals, communicates clearly. Recommend next round.']);
        }
        if ($stage === 'interview') {
            $insInt->execute([$cid, 'Final Round', 'Anitha Rao', date('Y-m-d H:i:s', strtotime('+' . ($i % 4 + 1) . ' days ' . (10 + $i % 7) . ':30')), $i % 2 ? 'In-person' : 'Video', 'scheduled', null]);
        }
        if ($rating >= 4) {
            $insNote->execute([$cid, 'Harish Akshay', 'Great culture fit. Fast learner - prioritise this profile.', $ts(max(0, $daysAgo - $step), 16)]);
        }
    }
    $pdo->commit();
}
