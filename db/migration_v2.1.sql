-- Migration Script V2.0 to V2.1 features (Live Help Feed, Self-Directed Tasks, and PWA Subscriptions)

-- 1. Add 'is_self_directed' boolean toggle to assessment_categories safely
ALTER TABLE assessment_categories ADD COLUMN IF NOT EXISTS is_self_directed BOOLEAN DEFAULT false;

-- 2. Add 'student_planned_date' tracking column to grades table
ALTER TABLE grades ADD COLUMN IF NOT EXISTS student_planned_date DATE;

-- 3. Create standalone assessments (columns) table to decouple deadlines from categories
CREATE TABLE IF NOT EXISTS assessments (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES assessment_categories(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    info_text TEXT,
    deadline TIMESTAMP WITH TIME ZONE,
    is_visible BOOLEAN DEFAULT true,
    CONSTRAINT uq_assessment_category UNIQUE (category_id, name)
);

-- 4. Create student_learning_plan table for daily task slot targeting
CREATE TABLE IF NOT EXISTS student_learning_plan (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    category_id INTEGER REFERENCES assessment_categories(id) ON DELETE CASCADE,
    assessment_name VARCHAR(100) NOT NULL,
    planned_date DATE NOT NULL,
    slot_number INTEGER CHECK (slot_number IN (1, 2)),
    completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Create help_requests table if not existing
CREATE TABLE IF NOT EXISTS help_requests (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    subject VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'open', -- 'open', 'claimed', 'resolved'
    claimed_by_teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    teacher_comment TEXT DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_help_requests_status ON help_requests(status);
