<?php
/**
 * HireFlow - JSON API
 * Every request looks like: api.php?action=<name>
 * Public actions: public_jobs, apply, login
 * Everything else needs a logged-in recruiter (PHP session).
 */
require __DIR__ . '/db.php';
session_name('HIREFLOW_SESSION'); // own cookie name so other localhost apps don't share the login
session_start();

function out($data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($data);
    exit;
}
function fail(string $message, int $code = 400): never { out(['error' => $message], $code); }
function input(): array
{
    static $data = null;
    return $data ??= (json_decode(file_get_contents('php://input'), true) ?: $_POST);
}
function field(string $key, $default = '') { return is_string(input()[$key] ?? null) ? trim(input()[$key]) : (input()[$key] ?? $default); }
function now(): string { return date('Y-m-d H:i:s'); }
function require_login(): array
{
    if (empty($_SESSION['user'])) fail('Please log in to continue.', 401);
    return $_SESSION['user'];
}
function candidate_or_404(PDO $pdo, int $id): array
{
    $st = $pdo->prepare('SELECT * FROM candidates WHERE id = ?');
    $st->execute([$id]);
    return $st->fetch() ?: fail('Candidate not found.', 404);
}
function log_stage(PDO $pdo, int $cid, ?string $from, string $to, string $by): void
{
    $pdo->prepare('INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_by, changed_at) VALUES (?,?,?,?,?)')
        ->execute([$cid, $from, $to, $by, now()]);
    $pdo->prepare('UPDATE candidates SET stage = ?, updated_at = ? WHERE id = ?')->execute([$to, now(), $cid]);
}

$pdo = db();
$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        /* ---------------- Public careers page ---------------- */

        case 'public_jobs':
            out($pdo->query("SELECT id, title, department, location, job_type, experience, salary, skills, description, created_at
                             FROM jobs WHERE status = 'open' ORDER BY created_at DESC")->fetchAll());

        case 'apply':
            $jobId = (int) field('job_id');
            $job = $pdo->prepare("SELECT * FROM jobs WHERE id = ? AND status = 'open'");
            $job->execute([$jobId]);
            $job = $job->fetch() ?: fail('This job is no longer accepting applications.');

            $name = field('name');
            $email = strtolower(field('email'));
            $phone = field('phone');
            $exp = field('experience');
            $skills = field('skills');
            $source = field('source') ?: 'Careers Page';

            if (mb_strlen($name) < 3) fail('Please enter your full name.');
            if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('Please enter a valid email address.');
            if (!preg_match('/^[0-9+\-\s]{10,15}$/', $phone)) fail('Please enter a valid phone number.');
            if (!is_numeric($exp) || $exp < 0 || $exp > 40) fail('Experience must be between 0 and 40 years.');
            if (!skill_list($skills)) fail('Please list at least one skill.');
            if (!in_array($source, ['Careers Page', 'LinkedIn', 'Naukri', 'Referral', 'Campus Drive', 'Other'])) $source = 'Other';

            $dup = $pdo->prepare('SELECT 1 FROM candidates WHERE job_id = ? AND email = ?');
            $dup->execute([$jobId, $email]);
            if ($dup->fetch()) fail('You have already applied for this role with this email.');

            // Optional resume upload: PDF only, max 2 MB, stored with a random name
            $resume = null;
            if (!empty($_FILES['resume']) && $_FILES['resume']['error'] !== UPLOAD_ERR_NO_FILE) {
                $f = $_FILES['resume'];
                if ($f['error'] !== UPLOAD_ERR_OK) fail('Resume upload failed. Please try again.');
                if ($f['size'] > 2 * 1024 * 1024) fail('Resume must be smaller than 2 MB.');
                if (file_get_contents($f['tmp_name'], false, null, 0, 4) !== '%PDF') fail('Resume must be a PDF file.');
                if (!is_dir(__DIR__ . '/uploads')) mkdir(__DIR__ . '/uploads');
                $resume = 'uploads/resume_' . bin2hex(random_bytes(8)) . '.pdf';
                move_uploaded_file($f['tmp_name'], __DIR__ . '/' . $resume);
            }

            $pdo->prepare('INSERT INTO candidates (job_id, name, email, phone, experience, skills, source, cover_note, resume_path, stage, match_score, applied_at, updated_at)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
                ->execute([$jobId, $name, $email, $phone, (float) $exp, $skills, $source, field('cover_note'), $resume, 'applied',
                    match_score($job['skills'], $skills), now(), now()]);
            $cid = (int) $pdo->lastInsertId();
            $pdo->prepare('INSERT INTO stage_history (candidate_id, from_stage, to_stage, changed_by, changed_at) VALUES (?,?,?,?,?)')
                ->execute([$cid, null, 'applied', 'Candidate', now()]);
            out(['ok' => true, 'reference' => 'HF-' . str_pad((string) $cid, 4, '0', STR_PAD_LEFT)]);

        /* ---------------- Authentication ---------------- */

        case 'login':
            $st = $pdo->prepare('SELECT * FROM users WHERE email = ?');
            $st->execute([strtolower(field('email'))]);
            $user = $st->fetch();
            if (!$user || !password_verify(field('password'), $user['password_hash'])) fail('Incorrect email or password.', 401);
            session_regenerate_id(true);
            $_SESSION['user'] = ['id' => $user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']];
            out(['ok' => true, 'user' => $_SESSION['user']]);

        case 'logout':
            session_destroy();
            out(['ok' => true]);

        case 'me':
            out(require_login());

        /* ---------------- Recruiter dashboard ---------------- */

        case 'stats':
            require_login();
            $byStage = $pdo->query('SELECT stage, COUNT(*) n FROM candidates GROUP BY stage')->fetchAll(PDO::FETCH_KEY_PAIR);
            // Funnel = how many candidates EVER reached each stage (from the history table)
            $reached = $pdo->query('SELECT to_stage, COUNT(DISTINCT candidate_id) n FROM stage_history GROUP BY to_stage')->fetchAll(PDO::FETCH_KEY_PAIR);
            $funnel = [];
            foreach (['applied', 'screening', 'interview', 'offer', 'hired'] as $s) $funnel[] = ['stage' => $s, 'count' => (int) ($reached[$s] ?? 0)];
            out([
                'total'          => (int) $pdo->query('SELECT COUNT(*) FROM candidates')->fetchColumn(),
                'open_jobs'      => (int) $pdo->query("SELECT COUNT(*) FROM jobs WHERE status = 'open'")->fetchColumn(),
                'new_this_week'  => (int) $pdo->query("SELECT COUNT(*) FROM candidates WHERE applied_at >= datetime('now','localtime','-7 days')")->fetchColumn(),
                'upcoming'       => (int) $pdo->query("SELECT COUNT(*) FROM interviews WHERE status = 'scheduled' AND scheduled_at >= datetime('now','localtime')")->fetchColumn(),
                'avg_days_to_hire' => round((float) $pdo->query("SELECT AVG(julianday(h.changed_at) - julianday(c.applied_at))
                                         FROM stage_history h JOIN candidates c ON c.id = h.candidate_id WHERE h.to_stage = 'hired'")->fetchColumn(), 1),
                'by_stage'       => $byStage,
                'funnel'         => $funnel,
                'sources'        => $pdo->query('SELECT source, COUNT(*) n, SUM(stage = \'hired\') hired FROM candidates GROUP BY source ORDER BY n DESC')->fetchAll(),
                'per_job'        => $pdo->query("SELECT j.id, j.title, j.status, COUNT(c.id) applicants,
                                         SUM(c.stage NOT IN ('hired','rejected')) active, SUM(c.stage = 'hired') hired,
                                         ROUND(AVG(c.match_score)) avg_match
                                         FROM jobs j LEFT JOIN candidates c ON c.job_id = j.id GROUP BY j.id ORDER BY j.status DESC, applicants DESC")->fetchAll(),
            ]);

        case 'jobs':
            require_login();
            out($pdo->query("SELECT j.*, COUNT(c.id) applicants, SUM(c.stage NOT IN ('hired','rejected')) active
                             FROM jobs j LEFT JOIN candidates c ON c.job_id = j.id GROUP BY j.id ORDER BY j.status DESC, j.created_at DESC")->fetchAll());

        case 'job_save':
            require_login();
            $id = (int) field('id', 0);
            $data = [];
            foreach (['title', 'department', 'location', 'job_type', 'experience', 'salary', 'skills', 'description'] as $k) $data[$k] = field($k);
            foreach (['title', 'department', 'location', 'job_type', 'skills', 'description'] as $k) {
                if ($data[$k] === '') fail('Please fill in the ' . str_replace('_', ' ', $k) . '.');
            }
            if ($id) {
                $pdo->prepare('UPDATE jobs SET title=?, department=?, location=?, job_type=?, experience=?, salary=?, skills=?, description=? WHERE id=?')
                    ->execute([...array_values($data), $id]);
                // Skills may have changed, so recalculate every applicant's match score
                $st = $pdo->prepare('SELECT id, skills FROM candidates WHERE job_id = ?');
                $st->execute([$id]);
                $upd = $pdo->prepare('UPDATE candidates SET match_score = ? WHERE id = ?');
                foreach ($st->fetchAll() as $c) $upd->execute([match_score($data['skills'], $c['skills']), $c['id']]);
            } else {
                $pdo->prepare('INSERT INTO jobs (title, department, location, job_type, experience, salary, skills, description, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
                    ->execute([...array_values($data), 'open', now()]);
                $id = (int) $pdo->lastInsertId();
            }
            out(['ok' => true, 'id' => $id]);

        case 'job_toggle':
            require_login();
            $pdo->prepare("UPDATE jobs SET status = CASE status WHEN 'open' THEN 'closed' ELSE 'open' END WHERE id = ?")->execute([(int) field('id')]);
            out(['ok' => true]);

        case 'candidates':
            require_login();
            $sql = "SELECT c.id, c.job_id, c.name, c.email, c.experience, c.skills, c.source, c.stage, c.rating, c.match_score,
                           c.applied_at, c.updated_at, j.title job_title,
                           CAST(julianday('now','localtime') - julianday(c.updated_at) AS INTEGER) days_in_stage
                    FROM candidates c JOIN jobs j ON j.id = c.job_id";
            $args = [];
            if (!empty($_GET['job_id'])) { $sql .= ' WHERE c.job_id = ?'; $args[] = (int) $_GET['job_id']; }
            $st = $pdo->prepare($sql . ' ORDER BY c.match_score DESC, c.applied_at DESC');
            $st->execute($args);
            out($st->fetchAll());

        case 'candidate':
            require_login();
            $id = (int) ($_GET['id'] ?? 0);
            $c = candidate_or_404($pdo, $id);
            $job = $pdo->prepare('SELECT id, title, skills, department, location FROM jobs WHERE id = ?');
            $job->execute([$c['job_id']]);
            $c['job'] = $job->fetch();
            foreach (['history' => 'SELECT * FROM stage_history WHERE candidate_id = ? ORDER BY changed_at DESC, id DESC',
                      'notes' => 'SELECT * FROM notes WHERE candidate_id = ? ORDER BY created_at DESC',
                      'interviews' => 'SELECT * FROM interviews WHERE candidate_id = ? ORDER BY scheduled_at DESC'] as $key => $sql) {
                $st = $pdo->prepare($sql);
                $st->execute([$id]);
                $c[$key] = $st->fetchAll();
            }
            out($c);

        case 'move_stage':
            $user = require_login();
            $c = candidate_or_404($pdo, (int) field('id'));
            $to = field('stage');
            if (!in_array($to, STAGES, true)) fail('Unknown stage.');
            if ($c['stage'] !== $to) log_stage($pdo, (int) $c['id'], $c['stage'], $to, $user['name']);
            out(['ok' => true]);

        case 'rate':
            require_login();
            $rating = (int) field('rating');
            if ($rating < 0 || $rating > 5) fail('Rating must be 0 to 5.');
            candidate_or_404($pdo, (int) field('id'));
            $pdo->prepare('UPDATE candidates SET rating = ? WHERE id = ?')->execute([$rating, (int) field('id')]);
            out(['ok' => true]);

        case 'add_note':
            $user = require_login();
            $body = field('body');
            if ($body === '') fail('Note cannot be empty.');
            candidate_or_404($pdo, (int) field('id'));
            $pdo->prepare('INSERT INTO notes (candidate_id, author, body, created_at) VALUES (?,?,?,?)')
                ->execute([(int) field('id'), $user['name'], $body, now()]);
            out(['ok' => true]);

        case 'schedule_interview':
            $user = require_login();
            $c = candidate_or_404($pdo, (int) field('candidate_id'));
            $when = strtotime(field('scheduled_at'));
            if (!$when) fail('Please choose a valid date and time.');
            if ($when < time()) fail('Interview time must be in the future.');
            if (field('round') === '' || field('interviewer') === '') fail('Round and interviewer are required.');
            $mode = in_array(field('mode'), ['Video', 'In-person', 'Phone'], true) ? field('mode') : 'Video';
            $pdo->prepare('INSERT INTO interviews (candidate_id, round, interviewer, scheduled_at, mode) VALUES (?,?,?,?,?)')
                ->execute([$c['id'], field('round'), field('interviewer'), date('Y-m-d H:i:s', $when), $mode]);
            // Automation: scheduling an interview moves early-stage candidates forward
            if (in_array($c['stage'], ['applied', 'screening'], true)) log_stage($pdo, (int) $c['id'], $c['stage'], 'interview', $user['name']);
            out(['ok' => true]);

        case 'interview_update':
            require_login();
            $status = field('status');
            if (!in_array($status, ['completed', 'cancelled', 'no-show'], true)) fail('Unknown interview status.');
            $pdo->prepare('UPDATE interviews SET status = ?, feedback = ? WHERE id = ?')->execute([$status, field('feedback') ?: null, (int) field('id')]);
            out(['ok' => true]);

        case 'interviews':
            require_login();
            out($pdo->query("SELECT i.*, c.name candidate, c.stage, j.title job_title
                             FROM interviews i JOIN candidates c ON c.id = i.candidate_id JOIN jobs j ON j.id = c.job_id
                             ORDER BY (i.status = 'scheduled') DESC,
                                      CASE WHEN i.status = 'scheduled' THEN i.scheduled_at END ASC,
                                      i.scheduled_at DESC")->fetchAll());

        case 'resume':
            require_login();
            $c = candidate_or_404($pdo, (int) ($_GET['id'] ?? 0));
            if (!$c['resume_path'] || !is_file(__DIR__ . '/' . $c['resume_path'])) fail('No resume uploaded.', 404);
            header('Content-Type: application/pdf');
            header('Content-Disposition: inline; filename="' . preg_replace('/[^A-Za-z0-9]/', '_', $c['name']) . '_resume.pdf"');
            readfile(__DIR__ . '/' . $c['resume_path']);
            exit;

        default:
            fail('Unknown action.', 404);
    }
} catch (PDOException $e) {
    fail('Database error: ' . $e->getMessage(), 500);
}
