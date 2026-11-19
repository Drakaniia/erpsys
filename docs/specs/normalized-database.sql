-- ERPSYS standalone 3NF reference schema (SQLite 3.37+). Not an app migration.
-- Each connection must enable foreign_keys. Open a new database to load this file.
PRAGMA foreign_keys = ON;
BEGIN;

CREATE TABLE users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL COLLATE NOCASE UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('STUDENT','SBO_OFFICER','ENROLLMENT_ADVISER','ADMIN')),
    blocked_at TEXT,
    stamp_name TEXT,
    stamp_graphic_id TEXT REFERENCES stored_files(id),
    stamp_signature_id TEXT REFERENCES stored_files(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE academic_years (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    semester_label TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (label, semester_label)
) STRICT;
CREATE UNIQUE INDEX one_active_year ON academic_years(is_active) WHERE is_active = 1;

CREATE TABLE profiling_forms (
    academic_year_id TEXT PRIMARY KEY REFERENCES academic_years(id) ON DELETE CASCADE,
    provider_form_id TEXT NOT NULL UNIQUE,
    title TEXT,
    responder_url TEXT NOT NULL,
    updated_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    code TEXT NOT NULL COLLATE NOCASE UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE department_year_levels (
    department_id TEXT NOT NULL REFERENCES departments(id),
    year_level INTEGER NOT NULL CHECK (year_level BETWEEN 1 AND 5),
    adviser_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    is_offered INTEGER NOT NULL DEFAULT 1 CHECK (is_offered IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (department_id, year_level),
    CHECK (is_offered = 1 OR adviser_id IS NULL)
) STRICT;

CREATE TABLE student_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE REFERENCES users(id),
    student_number TEXT NOT NULL UNIQUE CHECK (student_number <> '' AND student_number NOT GLOB '*[^0-9]*'),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE student_enrollments (
    id TEXT PRIMARY KEY,
    student_profile_id TEXT NOT NULL REFERENCES student_profiles(id),
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
    department_id TEXT NOT NULL,
    year_level INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (student_profile_id, academic_year_id),
    FOREIGN KEY (department_id, year_level) REFERENCES department_year_levels(department_id, year_level)
) STRICT;
CREATE INDEX enrollment_roster ON student_enrollments(academic_year_id, department_id, year_level);

CREATE TABLE workflow_steps (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    position INTEGER NOT NULL UNIQUE CHECK (position BETWEEN 1 AND 6),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (position = CASE code WHEN 'ASSESSMENT' THEN 1 WHEN 'SOCIAL_MEDIA' THEN 2
        WHEN 'PROFILING' THEN 3 WHEN 'MUGSHOT' THEN 4 WHEN 'CONSENT' THEN 5
        WHEN 'ENROLLMENT' THEN 6 ELSE 0 END)
) STRICT;
INSERT INTO workflow_steps(code, name, position) VALUES
    ('ASSESSMENT','Assessment',1), ('SOCIAL_MEDIA','Social Media',2),
    ('PROFILING','Profiling',3), ('MUGSHOT','Mugshot',4),
    ('CONSENT','Consent / Medical',5), ('ENROLLMENT','Enrollment',6);

CREATE TABLE step_submissions (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL REFERENCES student_enrollments(id),
    step_code TEXT NOT NULL REFERENCES workflow_steps(code) CHECK (step_code <> 'ENROLLMENT'),
    attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (enrollment_id, step_code, attempt_no)
) STRICT;

CREATE TABLE stored_files (
    id TEXT PRIMARY KEY,
    object_key TEXT NOT NULL UNIQUE,
    uploaded_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    purged_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE submission_evidence (
    submission_id TEXT NOT NULL REFERENCES step_submissions(id),
    position INTEGER NOT NULL CHECK (position > 0),
    file_id TEXT REFERENCES stored_files(id),
    source_url TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (submission_id, position),
    UNIQUE (submission_id, file_id),
    CHECK ((file_id IS NULL) <> (source_url IS NULL))
) STRICT;

CREATE TABLE submission_answers (
    submission_id TEXT NOT NULL REFERENCES step_submissions(id),
    position INTEGER NOT NULL CHECK (position > 0),
    question_label_at_submission TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (submission_id, position)
) STRICT;

-- Append-only business events. Snapshot fields describe what was shown at approval,
-- not the reviewer's current profile; keep the referenced files while retained.
CREATE TABLE submission_events (
    id INTEGER PRIMARY KEY,
    submission_id TEXT NOT NULL REFERENCES step_submissions(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('SUBMITTED','VERIFIED','RETURNED','WITHDRAWN')),
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_label_at_event TEXT NOT NULL,
    feedback_note TEXT,
    stamp_name_at_approval TEXT,
    stamp_graphic_at_approval_id TEXT REFERENCES stored_files(id),
    stamp_signature_at_approval_id TEXT REFERENCES stored_files(id),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (event_type = 'VERIFIED' OR (stamp_name_at_approval IS NULL AND
        stamp_graphic_at_approval_id IS NULL AND stamp_signature_at_approval_id IS NULL))
) STRICT;
CREATE INDEX submission_latest_event ON submission_events(submission_id, id DESC);

CREATE TABLE submission_feedback_chips (
    event_id INTEGER NOT NULL REFERENCES submission_events(id),
    position INTEGER NOT NULL CHECK (position > 0),
    label TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (event_id, position)
) STRICT;

CREATE TABLE assessment_requirements (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE social_media_links (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE adviser_availability (
    adviser_id TEXT NOT NULL REFERENCES users(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
    is_open INTEGER NOT NULL DEFAULT 0 CHECK (is_open IN (0,1)),
    last_active_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (adviser_id, department_id, academic_year_id)
) STRICT;

CREATE TABLE office_hour_entries (
    id TEXT PRIMARY KEY,
    adviser_id TEXT NOT NULL REFERENCES users(id),
    department_id TEXT NOT NULL REFERENCES departments(id),
    academic_year_id TEXT NOT NULL REFERENCES academic_years(id),
    kind TEXT NOT NULL CHECK (kind IN ('WEEKLY','EXTRA','CANCEL')),
    iso_weekday INTEGER,
    local_date TEXT,
    start_minute INTEGER,
    end_minute INTEGER,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (local_date IS NULL OR (date(local_date,'+0 days') IS local_date)),
    CHECK ((kind = 'WEEKLY' AND iso_weekday IS NOT NULL AND iso_weekday BETWEEN 1 AND 7 AND local_date IS NULL) OR
           (kind IN ('EXTRA','CANCEL') AND iso_weekday IS NULL AND local_date IS NOT NULL)),
    CHECK ((kind = 'CANCEL' AND start_minute IS NULL AND end_minute IS NULL) OR
           (kind <> 'CANCEL' AND start_minute IS NOT NULL AND end_minute IS NOT NULL AND
            start_minute >= 0 AND end_minute <= 1440 AND end_minute - start_minute >= 30 AND
            start_minute % 30 = 0 AND end_minute % 30 = 0))
) STRICT;
CREATE UNIQUE INDEX one_office_hours_cancellation ON office_hour_entries(adviser_id, department_id, academic_year_id, local_date) WHERE kind = 'CANCEL';

CREATE TABLE department_transfer_requests (
    id TEXT PRIMARY KEY,
    department_id TEXT NOT NULL REFERENCES departments(id),
    requester_id TEXT NOT NULL REFERENCES users(id),
    owner_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','AUTO_TRANSFERRED','EXPIRED')),
    expires_at TEXT NOT NULL,
    responded_at TEXT,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (requester_id <> owner_id),
    CHECK ((status = 'PENDING') = (resolved_at IS NULL))
) STRICT;
CREATE UNIQUE INDEX one_pending_transfer ON department_transfer_requests(department_id, requester_id) WHERE status = 'PENDING';
CREATE INDEX due_transfers ON department_transfer_requests(expires_at) WHERE status = 'PENDING';

CREATE TABLE department_transfer_levels (
    request_id TEXT NOT NULL REFERENCES department_transfer_requests(id),
    year_level INTEGER NOT NULL CHECK (year_level BETWEEN 1 AND 5),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    PRIMARY KEY (request_id, year_level)
) STRICT;

CREATE TABLE queue_entries (
    id TEXT PRIMARY KEY,
    enrollment_id TEXT NOT NULL UNIQUE REFERENCES student_enrollments(id),
    state TEXT NOT NULL CHECK (state IN ('WAITING','IN_PROGRESS','LEFT','REMOVED','CLOSED')),
    joined_at TEXT NOT NULL,
    served_at TEXT,
    served_by_id TEXT REFERENCES users(id),
    removed_by_id TEXT REFERENCES users(id),
    undo_until TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK ((state = 'IN_PROGRESS' AND served_at IS NOT NULL AND served_by_id IS NOT NULL) OR
           (state <> 'IN_PROGRESS' AND served_at IS NULL AND served_by_id IS NULL)),
    CHECK ((state = 'REMOVED' AND removed_by_id IS NOT NULL AND undo_until IS NOT NULL) OR
           (state <> 'REMOVED' AND removed_by_id IS NULL AND undo_until IS NULL))
) STRICT;
CREATE UNIQUE INDEX one_student_served_per_adviser ON queue_entries(served_by_id) WHERE state = 'IN_PROGRESS';
CREATE INDEX queue_fifo ON queue_entries(state, joined_at, id);

CREATE TABLE enrollment_events (
    id INTEGER PRIMARY KEY,
    enrollment_id TEXT NOT NULL REFERENCES student_enrollments(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('COMPLETED','REVERSED')),
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_label_at_event TEXT NOT NULL,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (event_type <> 'REVERSED' OR length(trim(coalesce(reason,''))) > 0)
) STRICT;
CREATE INDEX enrollment_latest_event ON enrollment_events(enrollment_id, id DESC);

CREATE TABLE notifications (
    id TEXT PRIMARY KEY,
    recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    action_kind TEXT,
    action_label TEXT,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    CHECK (action_kind IS NOT NULL OR action_label IS NULL)
) STRICT;
CREATE INDEX inbox ON notifications(recipient_id, created_at DESC);

CREATE TABLE audit_events (
    id INTEGER PRIMARY KEY,
    actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    actor_label_at_event TEXT NOT NULL,
    role_at_event TEXT NOT NULL,
    action TEXT NOT NULL,
    target_ref TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE TABLE assistant_guidance (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    content TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
) STRICT;

CREATE VIEW current_step_reviews AS
SELECT s.enrollment_id, s.step_code, s.id AS submission_id,
       coalesce(ev.event_type, 'PENDING') AS status, ev.created_at AS last_event_at
FROM step_submissions s
LEFT JOIN submission_events ev ON ev.id = (
    SELECT id FROM submission_events WHERE submission_id = s.id ORDER BY id DESC LIMIT 1
)
WHERE s.attempt_no = (
    SELECT max(attempt_no) FROM step_submissions
    WHERE enrollment_id = s.enrollment_id AND step_code = s.step_code
);

CREATE VIEW current_enrollment_status AS
SELECT e.id AS enrollment_id, e.student_profile_id, e.academic_year_id, e.department_id, e.year_level,
       CASE WHEN ev.event_type = 'COMPLETED' THEN ev.created_at END AS completed_at,
       CASE WHEN ev.event_type = 'COMPLETED' THEN ev.actor_id END AS completed_by_id,
       CASE WHEN ev.event_type = 'COMPLETED' THEN ev.actor_label_at_event END AS completed_by_label
FROM student_enrollments e
LEFT JOIN enrollment_events ev ON ev.id = (
    SELECT id FROM enrollment_events WHERE enrollment_id = e.id ORDER BY id DESC LIMIT 1
);

CREATE VIEW enrollment_progress AS
SELECT e.enrollment_id, s.code AS step_code, s.name AS step_name, s.position,
       CASE WHEN s.code = 'ENROLLMENT' THEN
           CASE WHEN e.completed_at IS NULL THEN 'PENDING' ELSE 'VERIFIED' END
           WHEN r.status = 'WITHDRAWN' THEN 'PENDING'
           ELSE coalesce(r.status, 'PENDING') END AS status
FROM current_enrollment_status e CROSS JOIN workflow_steps s
LEFT JOIN current_step_reviews r ON r.enrollment_id = e.enrollment_id AND r.step_code = s.code;

CREATE VIEW waiting_queue AS
SELECT q.id, e.department_id, e.academic_year_id, q.enrollment_id, q.joined_at,
       row_number() OVER (PARTITION BY e.department_id, e.academic_year_id ORDER BY q.joined_at, q.id) AS position
FROM queue_entries q JOIN student_enrollments e ON e.id = q.enrollment_id
WHERE q.state = 'WAITING';

CREATE TRIGGER submission_event_order BEFORE INSERT ON submission_events
BEGIN
    SELECT CASE WHEN NOT (
        (NEW.event_type = 'SUBMITTED' AND NOT EXISTS (SELECT 1 FROM submission_events WHERE submission_id = NEW.submission_id)) OR
        (NEW.event_type IN ('VERIFIED','RETURNED') AND coalesce((SELECT event_type FROM submission_events WHERE submission_id = NEW.submission_id ORDER BY id DESC LIMIT 1),'') = 'SUBMITTED') OR
        (NEW.event_type = 'WITHDRAWN' AND coalesce((SELECT event_type FROM submission_events WHERE submission_id = NEW.submission_id ORDER BY id DESC LIMIT 1),'') = 'VERIFIED')
    ) THEN RAISE(ABORT, 'invalid submission event sequence') END;
END;

CREATE TRIGGER submission_attempt_order BEFORE INSERT ON step_submissions
BEGIN
    SELECT CASE WHEN NEW.attempt_no <> 1 + coalesce((SELECT max(attempt_no) FROM step_submissions
        WHERE enrollment_id = NEW.enrollment_id AND step_code = NEW.step_code), 0)
        OR (NEW.attempt_no > 1 AND NOT EXISTS (SELECT 1 FROM current_step_reviews
            WHERE enrollment_id = NEW.enrollment_id AND step_code = NEW.step_code AND status IN ('RETURNED','WITHDRAWN')))
        THEN RAISE(ABORT, 'new attempt requires a returned or withdrawn prior attempt') END;
END;

CREATE TRIGGER queue_join_guard BEFORE INSERT ON queue_entries
BEGIN
    SELECT CASE WHEN NEW.state <> 'WAITING' OR
        (SELECT count(*) FROM current_step_reviews WHERE enrollment_id = NEW.enrollment_id AND status = 'VERIFIED') <> 5
        THEN RAISE(ABORT, 'joining the queue requires five verified steps and WAITING state') END;
END;

CREATE TRIGGER queue_scope_guard BEFORE UPDATE OF enrollment_id ON queue_entries
WHEN NEW.enrollment_id <> OLD.enrollment_id
BEGIN
    SELECT RAISE(ABORT, 'cannot move a ticket to a different enrollment');
END;

CREATE TRIGGER queue_close_guard BEFORE UPDATE OF state ON queue_entries
WHEN (NEW.state = 'CLOSED') <> EXISTS (SELECT 1 FROM current_enrollment_status
    WHERE enrollment_id = NEW.enrollment_id AND completed_at IS NOT NULL)
BEGIN
    SELECT RAISE(ABORT, 'closed ticket must match the enrollment outcome');
END;

CREATE TRIGGER queue_serving_guard BEFORE UPDATE OF state, served_by_id ON queue_entries
WHEN NEW.state = 'IN_PROGRESS'
BEGIN
    SELECT CASE WHEN EXISTS (
        SELECT 1 FROM queue_entries q
        JOIN student_enrollments other ON other.id = q.enrollment_id
        JOIN student_enrollments current ON current.id = NEW.enrollment_id
        WHERE q.id <> OLD.id AND q.state = 'IN_PROGRESS'
          AND other.department_id = current.department_id AND other.academic_year_id = current.academic_year_id
    ) THEN RAISE(ABORT, 'department already serving a student this period') END;
    SELECT CASE WHEN OLD.state NOT IN ('WAITING','IN_PROGRESS') OR
        (SELECT count(*) FROM current_step_reviews WHERE enrollment_id = NEW.enrollment_id AND status = 'VERIFIED') <> 5
        THEN RAISE(ABORT, 'service requires a waiting or serving ticket and five verified steps') END;
END;

CREATE TRIGGER enrollment_scope_guard BEFORE UPDATE OF department_id, year_level, academic_year_id, student_profile_id ON student_enrollments
WHEN NEW.department_id <> OLD.department_id OR NEW.year_level <> OLD.year_level OR
     NEW.academic_year_id <> OLD.academic_year_id OR NEW.student_profile_id <> OLD.student_profile_id
BEGIN
    SELECT CASE WHEN EXISTS (SELECT 1 FROM queue_entries WHERE enrollment_id = OLD.id AND state IN ('WAITING','IN_PROGRESS')) OR
           EXISTS (SELECT 1 FROM enrollment_events WHERE enrollment_id = OLD.id)
        THEN RAISE(ABORT, 'cannot rewrite a live queue scope or an enrollment with completion history') END;
END;

CREATE TRIGGER queue_rejoin_guard BEFORE UPDATE OF state ON queue_entries
WHEN NEW.state = 'WAITING' AND OLD.state IN ('LEFT','REMOVED','CLOSED')
BEGIN
    SELECT CASE WHEN (SELECT count(*) FROM current_step_reviews WHERE enrollment_id = NEW.enrollment_id AND status = 'VERIFIED') <> 5
        OR EXISTS (SELECT 1 FROM current_enrollment_status WHERE enrollment_id = NEW.enrollment_id AND completed_at IS NOT NULL)
        THEN RAISE(ABORT, 'cannot rejoin without five verified steps or while enrolled') END;
END;

CREATE TRIGGER enrollment_event_guard BEFORE INSERT ON enrollment_events
BEGIN
    SELECT CASE WHEN NEW.event_type = 'COMPLETED' AND (
        NEW.actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM queue_entries
            WHERE enrollment_id = NEW.enrollment_id AND state = 'IN_PROGRESS' AND served_by_id = NEW.actor_id) OR
        (SELECT count(*) FROM current_step_reviews WHERE enrollment_id = NEW.enrollment_id AND status = 'VERIFIED') <> 5 OR
        EXISTS (SELECT 1 FROM current_enrollment_status WHERE enrollment_id = NEW.enrollment_id AND completed_at IS NOT NULL)
    ) THEN RAISE(ABORT, 'completion requires the serving adviser and five verified steps') END;
    SELECT CASE WHEN NEW.event_type = 'REVERSED' AND (
        NEW.actor_id IS NULL OR NOT EXISTS (SELECT 1 FROM current_enrollment_status
            WHERE enrollment_id = NEW.enrollment_id AND completed_at IS NOT NULL) OR
        NOT EXISTS (SELECT 1 FROM queue_entries WHERE enrollment_id = NEW.enrollment_id AND state = 'CLOSED')
    ) THEN RAISE(ABORT, 'only a completed enrollment with a closed ticket can be reversed') END;
END;

CREATE TRIGGER completion_closes_ticket AFTER INSERT ON enrollment_events
WHEN NEW.event_type = 'COMPLETED'
BEGIN
    UPDATE queue_entries SET state = 'CLOSED', served_at = NULL, served_by_id = NULL,
        updated_at = NEW.created_at WHERE enrollment_id = NEW.enrollment_id;
END;

CREATE TRIGGER reversal_reopens_ticket AFTER INSERT ON enrollment_events
WHEN NEW.event_type = 'REVERSED'
BEGIN
    UPDATE queue_entries SET state = CASE WHEN (SELECT count(*) FROM current_step_reviews
        WHERE enrollment_id = NEW.enrollment_id AND status = 'VERIFIED') = 5 THEN 'WAITING' ELSE 'LEFT' END,
        joined_at = NEW.created_at, updated_at = NEW.created_at WHERE enrollment_id = NEW.enrollment_id;
END;

-- Mutable relations: writers set updated_at when changing a row; the only writes
-- performed by this DDL (seed inserts and ticket changes) set it automatically.
COMMIT;
