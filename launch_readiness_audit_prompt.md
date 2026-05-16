# 🚨 MISSION: Adversarial Launch Readiness Audit (Antigravity OS)

**Context**: You are a senior Cyber-Security Auditor and Pedagogical Systems Architect. You are auditing "Antigravity," a state-of-the-art Educational OS built for a nationwide launch in Austria (300+ schools).
**Tech Stack**: Next.js 16 (App Router), Node.js 22, PostgreSQL, Docker/Unraid, Socket.io, WebUntis API.

---

## 🎯 AUDIT OBJECTIVE
Perform a comprehensive, adversarial review of the codebase to identify "Launch-Blockers." Focus on security vulnerabilities, data race conditions, Austrian GDPR (DSGVO) compliance, and pedagogical "Wow-Factor" integrity.

---

## 🛠️ CORE AUDIT MODULES

### 1. Security & Identity Sovereignty
*   **Airlock Verification**: Audit the `requires_password_change` flow. Does the frontend effectively "airlock" users until they change their initial WebUntis-generated passwords? Check `frontend/src/app/login/page.tsx` and middleware.
*   **Role-Based Access Control (RBAC)**: Scrutinize the `authenticateToken` and `isAdmin` middleware in `backend/server.js`. Check for ID-OR (Insecure Direct Object Reference) vulnerabilities in `backend/routes/gradebook.js`—can a pupil theoretically view another pupil's grades by changing a URL parameter?
*   **Credential Entropy**: Analyze the `POST /api/admin/factsheets/teachers` password generation logic. Is the random string generation cryptographically secure for an enterprise-level rollout?

### 2. "Clever Sync" Operational Integrity (WebUntis)
*   **The Aggregator Logic**: Review `backend/services/webuntisSyncService.js`. Evaluate the Weekly Timetable Aggregator. Does it handle "Kopplungen" (merged subjects) and "Religionsgruppen" without creating duplicate pupil records?
*   **Scheduler Race Conditions**: Audit `backend/services/schedulerService.js`. If a manual sync is triggered simultaneously with an automated heartbeat, how does the system handle the PostgreSQL connection pool and state?
*   **Auto-Raumbelegung**: Verify that students are correctly "teleported" to their class-specific rooms (`Klassenzimmer - [Name]`) during sync. Is the `allocation_logs` table being flooded with redundant entries?

### 3. Pedagogical UX & "The Matrix" (Karriere-Dashboard)
*   **Insight Accuracy**: Critique the `backend/services/insightGenerator.js`. Are the "Fun Insights" (e.g., "Meister-Manifestation") based on statistically significant data, or could they trigger false motivation?
*   **Rank Consistency**: Audit the `computePredictedRank` logic. Does it align with the Austrian 1-5 grading scale? Is the weight of "SDL completions" pedagogically balanced against "Grade Averages"?
*   **Cinematic UI Stress**: Evaluate the `frontend/src/app/karriere/page.tsx`. Does the high-intensity glassmorphic design and ambient glow impact performance on lower-end school hardware (e.g., iPad 8th Gen)?

### 4. Infrastructure & Disaster Recovery
*   **Docker Resilience**: Review the `docker-compose.yml`. Are the volumes for PostgreSQL correctly isolated to prevent data loss on Unraid parity checks or container re-deployment?
*   **Auto-Update Stability**: Analyze the `scripts/auto_updater.ps1` and `scripts/update_system.sh`. Does the system perform a pre-update backup? Is there a rollback mechanism if the Next.js build fails?

### 5. Austrian GDPR (DSGVO) Compliance
*   **Data Minimization**: Is the system storing PII (Personally Identifiable Information) from WebUntis that is not strictly necessary for the "Educational OS" functionality?
*   **The "Right to be Forgotten"**: Audit the "Soft-Delete" logic. When a student is removed from WebUntis, they are marked `is_active = false`. Does this satisfy Austrian school data retention laws?

---

## 📝 DELIVERABLE FORMAT
Provide a **Launch Readiness Report** with:
1.  **[CRITICAL]**: Security or data-loss risks (Fix before pilot).
2.  **[PEDAGOGICAL]**: Improvements to the gamification/badge engine.
3.  **[OPERATIONAL]**: Infrastructure and sync optimization tips.
4.  **[UX/WOW]**: Specific tweaks to make the Mission Control even more "Space-Age."

**AUDIT INITIATED. COMMENCE DEEP-SCAN.**
