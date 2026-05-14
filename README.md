# 🏫 Schulmanagement V2 — Real-Time Platform

A production-ready, highly responsive school administration and real-time classroom management platform built for modern educational environments. Fully optimized for zero-config deployments across home environments, Proxmox hypervisors, and school subnets.

---

## ✨ Key Features

- **🌐 100% Network-Agnostic Architecture**: Implements client-side dynamic discovery mapping (`window.location.hostname`). Works out-of-the-box on local networks (`192.168.X.X`), multi-VLAN school hardware (`10.X.X.X`), or custom unraid domains without editing `.env` files or rebuilding client bundles.
- **📱 Responsive iPad Drag-and-Drop**: Snappy, tactile layout switching using `@dnd-kit/core` customized with responsive pointer/touch activation sensors for frictionless classroom oversight.
- **⚡ Live WebSockets Dispatch**: Real-time room movement synchronizations, automated lesson boundary countdowns, and cross-tab multi-user client hydration powered by `Socket.io`.
- **📊 Curricular Gradebook & Multi-Tier Mastery**: Integrated subject grade tracking with live peer co-teacher editing visibility and progressive tier categorization (*Meister*, *Geselle*, *Anwärter*).
- **🛡️ Integrated Disciplinary Control**: High-fidelity discipline register tracking infraction severity weights, dynamic pupil rank recalculations, and automated `TimeOut` dispatch validation.
- **📅 Self-Directed Learning Matrix**: Dedicated assignment planner view where pupils can independently project study slots and flag active assistance requirements directly to teacher consoles.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 (React 19 Client UI), Tailwind CSS with custom glassmorphic tokens, Lucide Icons.
- **Backend**: Node.js, Express.js, Socket.IO WebSockets Engine.
- **Database**: PostgreSQL 15-alpine with automated startup seeding (`init.sql`) and background backup cron schedulers.
- **Orchestration**: Fully containerized matrices configured for Standard Docker Compose and **Unraid Compose Manager**.

---

## 🚀 Quickstart & Deployment

### Standard Linux / Windows / Proxmox
Simply spin up the pristine services using standard Docker Compose orchestration:
```bash
docker compose up -d
```
The Frontend GUI immediately becomes accessible at `http://<your-server-ip>:3000`.

### Unraid Deployment
Tailored precisely for Unraid persistent user-share mappings:
1. Place the repository source directory on your array/cache share at `/mnt/user/appdata/antigravity`.
2. Load **`docker-compose.unraid.yml`** inside your Unraid Compose Manager plugin window.
3. Launch the stack directly.

---

## 🧹 Maintenance & System Reset

If you ever need to purge old term databases and securely restore the environment to an absolute clean state, execute any of the standalone cross-platform utilities inside the project root:

- **Windows Native**: Double-click **`clean_slate.bat`** directly from File Explorer.
- **PowerShell Automation**: Run `./clean_slate.ps1`
- **Linux/Debian Hosts**: Run `./clean_slate.sh`

These utilities safely halt active clusters, bypass host folder access locks via dedicated container helpers, wipe the persistent `school_data/` stores, and cleanly re-initialize the baseline schemas from scratch.
