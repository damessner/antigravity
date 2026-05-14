BEGIN;

DELETE FROM classes
WHERE name IN ('3G', '4G');

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

COMMIT;
