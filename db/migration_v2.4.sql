-- Migration v2.4: Add rank customization support per subject

-- Table to store custom rank configurations for each subject
CREATE TABLE IF NOT EXISTS subject_rank_config (
    id SERIAL PRIMARY KEY,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    rank_level INTEGER NOT NULL CHECK (rank_level IN (1, 2, 3)),
    rank_name VARCHAR(50) NOT NULL,
    rank_symbol VARCHAR(10) NOT NULL,
    CONSTRAINT uq_subject_rank_level UNIQUE (subject_id, rank_level)
);

-- Default rank configurations (will be used if no custom config exists)
-- Level 1 = Lehrling (Apprentice)
-- Level 2 = Geselle (Journeyman)
-- Level 3 = Meister (Master)

COMMENT ON TABLE subject_rank_config IS 'Custom rank names and symbols per subject. Defaults: 1=Lehrling/🌱, 2=Geselle/🛠️, 3=Meister/👑';
COMMENT ON COLUMN subject_rank_config.rank_level IS '1=lowest, 2=middle, 3=highest';
