BEGIN;

-- Remove demo classes and all dependent demo school data
DELETE FROM classes
WHERE name IN ('3G', '4G');

-- Remove demo users created by the initial seed
DELETE FROM users
WHERE username IN (
  'teacher.one',
  'teacher.two',
  'pupil_3g_1',
  'pupil_3g_2',
  'pupil_3g_3',
  'pupil_4g_1',
  'pupil_4g_2'
);

-- Ensure unique subject names per class before adding the constraint
DELETE FROM subjects s
USING subjects s2
WHERE s.id > s2.id
  AND s.class_id = s2.class_id
  AND s.name = s2.name;

ALTER TABLE subjects
  DROP CONSTRAINT IF EXISTS uq_subject_class;

ALTER TABLE subjects
  ADD CONSTRAINT uq_subject_class UNIQUE (name, class_id);

COMMIT;
