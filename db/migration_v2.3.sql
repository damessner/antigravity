-- Migration Script V2.3: Guild System, Category Visibility, Participation Tracker, Seating Plan

BEGIN;

-- 1. Category-level visibility toggle (hide entire assessment area from pupils)
ALTER TABLE assessment_categories ADD COLUMN IF NOT EXISTS is_hidden_from_pupils BOOLEAN DEFAULT false;

-- 2. Participation tracker — one-tap engagement log
CREATE TABLE IF NOT EXISTS participation_logs (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER REFERENCES pupils(id) ON DELETE CASCADE,
    teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    lesson_date DATE NOT NULL DEFAULT CURRENT_DATE,
    rating VARCHAR(20) NOT NULL DEFAULT 'engaged',
    -- 'excellent' (💎), 'engaged' (✅), 'passive' (⚠️)
    applied_to_grade BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_participation_pupil ON participation_logs(pupil_id);
CREATE INDEX IF NOT EXISTS idx_participation_date ON participation_logs(lesson_date);
CREATE INDEX IF NOT EXISTS idx_participation_subject ON participation_logs(subject_id);

-- 3. Visual seating plan — persistent desk position map
CREATE TABLE IF NOT EXISTS seating_positions (
    id SERIAL PRIMARY KEY,
    pupil_id INTEGER UNIQUE REFERENCES pupils(id) ON DELETE CASCADE,
    desk_row INTEGER NOT NULL DEFAULT 1,
    desk_col INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_seating_pupil ON seating_positions(pupil_id);

COMMIT;
