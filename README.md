# 🏫 Schulmanagement V2.3 — Real-Time Platform

A production-ready, highly responsive school administration and real-time classroom management platform built for modern educational environments. Fully optimized for zero-config deployments across home environments, Proxmox hypervisors, and school subnets.

---

## ✨ Key Features

- **🌐 100% Network-Agnostic Architecture**: Works out-of-the-box on local networks (`192.168.X.X`), multi-VLAN school hardware (`10.X.X.X`), or custom unraid domains without editing `.env` files.
- **📱 Responsive iPad Drag-and-Drop**: Snappy, tactile layout switching customized with responsive pointer/touch activation sensors for frictionless classroom oversight.
- **⚡ Live WebSockets Dispatch**: Real-time room movement synchronizations and automated lesson boundary countdowns powered by `Socket.io`.
- **📊 Curricular Gradebook**: Integrated subject grade tracking with live peer co-teacher editing visibility.
- **🛡️ Integrated Disciplinary Control**: Infraction severity weights and dynamic pupil rank recalculations.
- **📅 Self-Directed Learning Matrix**: Dedicated assignment planner where pupils project study slots and flag active assistance requirements.

---

## 🔑 Initial Access

After deploying, log in using the following administrative credentials:
- **Username**: `da.messner`
- **Password**: `weissenbach`
- *Security Note: You will be prompted to change your password upon your first successful login.*

---

## 🚀 Quickstart & Deployment

### Windows (One-Click)
Simply double-click the numbered files in order:
1. **`01_initiate_system.bat`**: Verify system requirements and Docker status.
2. **`02_start_system.bat`**: Start the platform.

### Standard Linux / Proxmox
```bash
docker compose up -d
```
The Frontend becomes accessible at `http://<your-server-ip>:3000`.

### Unraid Deployment
1. Place the repository in your appdata share.
2. Load **`scripts/docker-compose.unraid.yml`** inside the Unraid Compose Manager.
3. Launch the stack.

---

## 🛠️ Management Tools

The system includes several "One-Click" utilities in the root folder:

- **`01_initiate_system.bat`**: Verify Docker and project health.
- **`02_start_system.bat`**: Start the system.
- **`03_restart_system.bat`**: Safely stop and restart all services.
- **`04_clean_slate.bat`**: Reset the system to a clean state (with automatic safety backup).

*Technical implementation scripts (.ps1 and .sh) are located in the `scripts/` subdirectory to keep the workspace clean.*

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 (React 19), Tailwind CSS.
- **Backend**: Node.js, Express.js, Socket.IO.
- **Database**: PostgreSQL 15-alpine with automated startup seeding (`init.sql`).
- **Orchestration**: Docker Compose & Unraid Compose Manager.
