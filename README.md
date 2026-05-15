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

- **`00_initiate_system.bat`**: Verify Docker status and project file integrity. (Self-installs if files are missing).
- **`01_update_system.bat`**: Check GitHub for the latest version and update automatically.
- **`02_launch_system.bat`**: Your main daily tool. Starts/Restarts/Stops the services.
- **`03_clean_slate.bat`**: Reset the system to a clean state (with automatic safety backup).
- **`04_system_health_monitor.bat`**: View live logs and resource usage (CPU/RAM) in real-time.


---

## 🐧 Linux / Unraid / Proxmox Support

For users running on Linux environments, use the included shell scripts in the `scripts/` directory:

### Deployment
1.  **Clone the repository**: `git clone https://github.com/damessner/antigravity.git`
2.  **Start the system**: `./scripts/restart_system.sh`

### Proxmox One-Click (LXC)
For Proxmox VE users, you can deploy the entire platform into a dedicated, optimized LXC container with a single command on your Proxmox Host Shell:
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/damessner/antigravity/main/scripts/proxmox_install.sh)"
```

### Unraid One-Click
For Unraid users, run this command in your Unraid Terminal to automatically set up the appdata folders and register the project in your Docker tab:
```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/damessner/antigravity/main/scripts/unraid_install.sh)"
```

### Universal Linux / Raspberry Pi
For Ubuntu, Debian, or Raspberry Pi OS, use this one-liner to install Docker and the platform automatically:
```bash
curl -fsSL https://raw.githubusercontent.com/damessner/antigravity/main/scripts/linux_install.sh | sudo bash
```

### Android Pocket Server (Termux)

You can even host the entire platform on an Android phone using **Termux**. Run this command inside the Termux app:
```bash
pkg install curl -y && bash -c "$(curl -fsSL https://raw.githubusercontent.com/damessner/antigravity/main/scripts/android_termux_setup.sh)"
```

### 🚀 Maintenance & Updates
To keep your school system up to date, run the command for your platform:

**Windows**
Double-click `01_update_system.bat` in your folder.

**Proxmox / Universal Linux**
```bash
cd /opt/antigravity && sudo ./scripts/update_system.sh
```

**Unraid**
```bash
cd /mnt/user/appdata/antigravity && ./scripts/update_system.sh
```

**Android (Termux)**
```bash
cd ~/antigravity && ./scripts/update_android.sh
```

---

---

### 🤖 Unattended Auto-Updates
For total automation, you can schedule the system to check for updates and backup itself every night.

**Linux / Proxmox / Unraid (Cron)**
Run `crontab -e` and add this line to update every night at 2:00 AM:
```bash
0 2 * * * /bin/bash /opt/antigravity/scripts/auto_updater.sh
```

**Windows (Task Scheduler)**
1. Open **Task Scheduler** and create a new task.
2. Trigger: **Daily at 02:00**.
3. Action: `powershell.exe`
4. Arguments: `-ExecutionPolicy Bypass -File "C:\Path\To\antigravity\scripts\auto_updater.ps1"`

---

- **Reset**: Run `./scripts/clean_slate.sh` to clear the environment.
- **Permissions**: Ensure scripts are executable with `chmod +x scripts/*.sh`.



---

## 🛠️ Technology Stack


- **Frontend**: Next.js 15 (React 19), Tailwind CSS.
- **Backend**: Node.js, Express.js, Socket.IO.
- **Database**: PostgreSQL 15-alpine with automated startup seeding (`init.sql`).
- **Orchestration**: Docker Compose & Unraid Compose Manager.
