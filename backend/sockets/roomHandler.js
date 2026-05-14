module.exports = (io, socket, pool) => {

  socket.on('join_global', () => {
    socket.join('global_dashboard');
  });

  socket.on('join_class', (classId) => {
    if (classId) {
      socket.join(`class_${classId}`);
    }
  });

  socket.on('move_pupil_intent', async (payload) => {
    try {
      const pupilId = Number(payload.pupilId);
      const toRoomId = Number(payload.toRoomId);
      const fromRoomId = payload.fromRoomId ? Number(payload.fromRoomId) : null;
      const teacherId = payload.teacherId ? Number(payload.teacherId) : (socket.user?.id || null);
      const lessonNumber = payload.lessonNumber ? Number(payload.lessonNumber) : 1;
      const comment = payload.comment ? String(payload.comment).trim() : '';

      // 1. Fetch Target Room Details
      const roomRes = await pool.query('SELECT name FROM rooms WHERE id = $1', [toRoomId]);
      if (roomRes.rows.length === 0) {
        socket.emit('move_rejected', { pupilId, reason: 'Zielraum existiert nicht' });
        return;
      }
      const roomName = roomRes.rows[0].name;

      // 2. Validate TimeOut constraint
      if (roomName === 'TimeOut' && !comment) {
        socket.emit('move_rejected', { pupilId, reason: 'Für den TimeOut-Raum ist eine Begründung zwingend erforderlich' });
        return;
      }

      // 3. Validate Lernwerkstatt Capacity constraint
      if (roomName === 'Lernwerkstatt') {
        const countRes = await pool.query(`
          SELECT COUNT(*) as cnt 
          FROM allocation_logs 
          WHERE is_active = true AND to_room_id = $1
        `, [toRoomId]);
        
        const activeCount = Number(countRes.rows[0].cnt);
        if (activeCount >= 24) {
          socket.emit('move_rejected', { pupilId, reason: 'Lernwerkstatt ist voll (max. 24)' });
          return;
        }
      }

      // 4. Perform atomic update using transaction
      const client = await pool.connect();
      let newLog;
      try {
        await client.query('BEGIN');

        // Deactivate active allocations for this pupil
        await client.query(`
          UPDATE allocation_logs SET is_active = false WHERE pupil_id = $1 AND is_active = true
        `, [pupilId]);

        // Insert new active allocation
        const insertRes = await client.query(`
          INSERT INTO allocation_logs (pupil_id, teacher_id, from_room_id, to_room_id, lesson_number, comment, arrived_status, is_active)
          VALUES ($1, $2, $3, $4, $5, $6, 'pending', true)
          RETURNING *,
            CASE
              WHEN timer_started_at IS NULL THEN NULL
              ELSE FLOOR(EXTRACT(EPOCH FROM timer_started_at) * 1000)::BIGINT
            END as timer_started_at_ms
        `, [pupilId, teacherId, fromRoomId, toRoomId, lessonNumber, comment || null]);

        newLog = insertRes.rows[0];

        // 5. Automatic Disciplinary Note for TimeOut
        if (roomName === 'TimeOut') {
          const noteText = `⚠️ TimeOut: ${comment}`;
          const noteRes = await client.query(`
            INSERT INTO disciplinary_notes (pupil_id, teacher_id, note_text, sentiment, is_visible_to_pupil, auto_source)
            VALUES ($1, $2, $3, 'negative', true, 'timeout')
            RETURNING id, pupil_id, note_text, sentiment, auto_source, created_at
          `, [pupilId, teacherId, noteText]);

          const createdNote = noteRes.rows[0];
          // Get teacher name
          const tRes = await client.query('SELECT full_name FROM users WHERE id = $1', [teacherId]);
          createdNote.teacher_name = tRes.rows[0]?.full_name || 'Lehrer';

          // Emit broadcast live
          io.emit('note_created', createdNote);
        }

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // Broadcast success to all attached clients
      io.emit('pupil_moved', {
        pupilId,
        toRoomId,
        fromRoomId,
        log: newLog
      });

    } catch (err) {
      console.error('Socket move_pupil_intent error:', err);
      socket.emit('move_rejected', { pupilId: payload?.pupilId, reason: 'Interner Serverfehler beim Zuweisen' });
    }
  });

  socket.on('toggle_arrived_status', async (payload) => {
    try {
      const pupilId = Number(payload.pupilId);
      const status = payload.status ? String(payload.status) : 'arrived'; // toggles between 'pending' and 'arrived'

      // Update active allocation log
      const res = await pool.query(`
        UPDATE allocation_logs 
        SET arrived_status = $1 
        WHERE pupil_id = $2 AND is_active = true 
        RETURNING *
      `, [status, pupilId]);

      if (res.rows.length > 0) {
        // Broadcast update to update UI states
        io.emit('pupil_moved', {
          pupilId,
          toRoomId: res.rows[0].to_room_id,
          fromRoomId: res.rows[0].from_room_id,
          log: res.rows[0]
        });
      }
    } catch (err) {
      console.error('Socket toggle_arrived_status error:', err);
    }
  });

  socket.on('set_pupil_timer', async (payload) => {
    try {
      const pupilId = Number(payload.pupilId);
      const minutes = payload.timer_minutes !== null && payload.timer_minutes !== undefined ? Number(payload.timer_minutes) : null;

      const allocRes = await pool.query(`
        SELECT id FROM allocation_logs WHERE pupil_id = $1 AND is_active = true LIMIT 1
      `, [pupilId]);

      if (allocRes.rows.length > 0) {
        const logId = allocRes.rows[0].id;
        const updateRes = await pool.query(`
          UPDATE allocation_logs
          SET timer_minutes = $1, timer_started_at = CASE WHEN $1 IS NOT NULL THEN NOW() ELSE NULL END
          WHERE id = $2
          RETURNING timer_minutes, timer_started_at,
            CASE
              WHEN timer_started_at IS NULL THEN NULL
              ELSE FLOOR(EXTRACT(EPOCH FROM timer_started_at) * 1000)::BIGINT
            END as timer_started_at_ms
        `, [minutes, logId]);

        const updated = updateRes.rows[0];
        io.emit('pupil_timer_set', {
          pupilId,
          timer_minutes: updated.timer_minutes,
          timer_started_at: updated.timer_started_at,
          timer_started_at_ms: updated.timer_started_at_ms
        });
      }
    } catch (err) {
      console.error('Socket set_pupil_timer error:', err);
    }
  });

  socket.on('set_pupil_comment', async (payload) => {
    try {
      const pupilId = Number(payload?.pupilId);
      if (!pupilId) return;
      const comment = payload?.comment ? String(payload.comment).trim() : '';

      const updateRes = await pool.query(`
        UPDATE allocation_logs
        SET comment = $1
        WHERE id = (
          SELECT id
          FROM allocation_logs
          WHERE pupil_id = $2 AND is_active = true
          ORDER BY id DESC
          LIMIT 1
        )
        RETURNING pupil_id, comment
      `, [comment || null, pupilId]);

      if (updateRes.rows.length > 0) {
        io.emit('pupil_comment_set', {
          pupilId,
          comment: updateRes.rows[0].comment || ''
        });
      }
    } catch (err) {
      console.error('Socket set_pupil_comment error:', err);
    }
  });

};
