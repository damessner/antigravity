DROP TABLE IF EXISTS help_requests CASCADE;
DROP TABLE IF EXISTS student_learning_plan CASCADE;
DROP TABLE IF EXISTS assessments CASCADE;
DROP TABLE IF EXISTS push_subscriptions CASCADE;
DROP TABLE IF EXISTS user_preferences CASCADE;
DROP TABLE IF EXISTS lernwerkstatt_snapshots CASCADE;
DROP TABLE IF EXISTS disciplinary_notes CASCADE;
DROP TABLE IF EXISTS grades CASCADE;
DROP TABLE IF EXISTS pupil_subject_tags CASCADE;
DROP TABLE IF EXISTS assessment_categories CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS allocation_logs CASCADE;
DROP TABLE IF EXISTS pupils CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS auto_source_type CASCADE;

CREATE TYPE user_role AS ENUM ('admin', 'teacher', 'pupil', 'lernwerkstatt');
CREATE TYPE auto_source_type AS ENUM ('timeout', 'rank_upgrade', 'rank_downgrade', 'manual');

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role user_role NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    requires_password_change BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE classes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(20) UNIQUE NOT NULL
);

CREATE TABLE pupils (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL
);

CREATE TABLE rooms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    capacity INTEGER DEFAULT NULL
);

INSERT INTO rooms (name) VALUES
    ('Klassenzimmer'),
    ('Gang 1. OG'),
    ('Gang 2. OG'),
    ('Lernwerkstatt'),
    ('TimeOut');

CREATE TABLE allocation_logs (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    from_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    to_room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    lesson_number INTEGER CHECK (lesson_number >= 1 AND lesson_number <= 10),
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    comment TEXT,
    arrived_status VARCHAR(50) DEFAULT 'pending',
    is_active BOOLEAN DEFAULT true,
    timer_minutes INTEGER DEFAULT NULL,
    timer_started_at TIMESTAMP DEFAULT NULL
);

CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    second_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    projection_visible BOOLEAN DEFAULT TRUE,
    abbreviation VARCHAR(10),
    CONSTRAINT uq_subject_class UNIQUE (name, class_id)
);

CREATE TABLE pupil_subject_tags (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    tier_tag VARCHAR(50) NOT NULL,
    CONSTRAINT uq_pupil_subject_tag UNIQUE (pupil_id, subject_id)
);

CREATE TABLE assessment_categories (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    weight_percentage INTEGER CHECK (weight_percentage >= 0 AND weight_percentage <= 100),
    scale_type VARCHAR(50) DEFAULT 'numeric_1_5',
    is_self_directed BOOLEAN DEFAULT false,
    CONSTRAINT uq_category_subject UNIQUE (subject_id, name)
);

CREATE TABLE assessments (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES assessment_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    info_text TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    is_visible BOOLEAN DEFAULT true,
    CONSTRAINT uq_assessment_category UNIQUE (category_id, name)
);

CREATE TABLE grades (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES assessment_categories(id) ON DELETE CASCADE,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    assessment_name VARCHAR(100) NOT NULL,
    grade_value VARCHAR(10),
    is_visible BOOLEAN DEFAULT TRUE,
    student_planned_date DATE,
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_allocation_logs_pupil ON allocation_logs(pupil_id);
CREATE INDEX idx_allocation_logs_active ON allocation_logs(is_active);
CREATE INDEX idx_pupils_class ON pupils(class_id);
CREATE INDEX idx_grades_category ON grades(category_id);
CREATE INDEX idx_grades_pupil ON grades(pupil_id);
CREATE INDEX idx_pupil_subject_tags_pupil ON pupil_subject_tags(pupil_id);

CREATE TABLE disciplinary_notes (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note_text TEXT NOT NULL,
    sentiment VARCHAR(20) NOT NULL DEFAULT 'neutral',
    is_visible_to_pupil BOOLEAN DEFAULT FALSE,
    auto_source auto_source_type DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_disciplinary_notes_pupil ON disciplinary_notes(pupil_id);

CREATE TABLE lernwerkstatt_snapshots (
    id SERIAL PRIMARY KEY,
    lesson_number INTEGER,
    snapshot_date DATE DEFAULT CURRENT_DATE,
    snapshot_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pupil_ids INTEGER[] NOT NULL,
    pupil_names TEXT[] NOT NULL,
    class_names TEXT[] NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX idx_lw_snapshots_date ON lernwerkstatt_snapshots(snapshot_date);

CREATE TABLE student_learning_plan (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES assessment_categories(id) ON DELETE CASCADE,
    assessment_name VARCHAR(100) NOT NULL,
    planned_date DATE NOT NULL,
    slot_number INTEGER CHECK (slot_number IN (1, 2)),
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE help_requests (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'claimed', 'resolved'
    claimed_by_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    teacher_comment TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX idx_help_requests_status ON help_requests(status);

-- Seed admin accounts (password: 'admin', must be changed on first login)
INSERT INTO users (username, full_name, role, password_hash, requires_password_change)
VALUES
('da.messner', 'D. Messner', 'admin', '$2b$10$1hMkzW8uZEmR2Pf0IzP0NeCzQ4wWRiwZ7mRGOJeGCqNGcykp69JL.', true),
('break_glass', 'Emergency Admin', 'admin', '$2b$10$1hMkzW8uZEmR2Pf0IzP0NeCzQ4wWRiwZ7mRGOJeGCqNGcykp69JL.', true);

-- PWA Web Push Notification targeting infrastructure
CREATE TABLE push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    notify_help_requests BOOLEAN DEFAULT TRUE,
    notify_timers BOOLEAN DEFAULT TRUE,
    notify_system BOOLEAN DEFAULT TRUE
);

-- Trigger to auto-create preferences when a new user is created
CREATE OR REPLACE FUNCTION create_default_preferences()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_preferences (user_id) VALUES (NEW.id);
    RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_preferences
AFTER INSERT ON users
FOR EACH ROW EXECUTE FUNCTION create_default_preferences();

-- Seed initial preferences for all previously declared static seed users safely
INSERT INTO user_preferences (user_id)
SELECT id FROM users
ON CONFLICT (user_id) DO NOTHING;
