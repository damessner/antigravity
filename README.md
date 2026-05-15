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

### For New Users (One-Click Installation)
Open PowerShell on your Windows computer and paste the following command to download and set up the system automatically:

```powershell
irm https://raw.githubusercontent.com/damessner/antigravity/main/scripts/setup_new_installation.ps1 | iex
```

### Manual Installation (Windows)
Simply double-click the numbered files in order:
1. **`01_initiate_system.bat`**: Verify system requirements and Docker status.
2. **`02_launch_system.bat`**: Start the platform.

---

## 🛠️ Management Tools

The system is organized into five main actions to keep your environment healthy:

- **`00_update_system.bat`**: Check GitHub for the latest version and update automatically.
- **`01_initiate_system.bat`**: Verify Docker status and project file integrity.
- **`02_launch_system.bat`**: Your main daily tool. Starts/Restarts/Stops the services.
- **`03_clean_slate.bat`**: Reset the system to a clean state (with automatic safety backup).
- **`04_system_health_monitor.bat`**: View live logs and resource usage (CPU/RAM) in real-time.

---

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 (React 19), Tailwind CSS.
- **Backend**: Node.js, Express.js, Socket.IO.
- **Database**: PostgreSQL 15-alpine with automated startup seeding (`init.sql`).
- **Orchestration**: Docker Compose & Unraid Compose Manager.
