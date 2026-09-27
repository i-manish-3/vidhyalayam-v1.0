# Vidhyalayam ERP — Azure VM & CI/CD Master Deployment Guide

This is the definitive, production-ready deployment guide for **Vidhyalayam School ERP**. It covers one-time server provisioning on an **Azure Linux Virtual Machine (Ubuntu 22.04 LTS)**, production database and compulsory Redis setup, Nginx reverse proxy with SSL, PM2 process management, and **automated zero-downtime deployments via GitHub Actions**.

---

## Architecture Overview

```text
       Internet Traffic (HTTPS 443 / HTTP 80)
                         │
                         ▼
             ┌───────────────────────┐
             │     Nginx Proxy       │ (SSL Termination & Rate-Limiting)
             └───────────┬───────────┘
                         │ Proxy Pass (127.0.0.1:3000)
                         ▼
             ┌───────────────────────┐
             │  PM2 Process Manager  │
             └───────────┬───────────┘
                         │
        ┌────────────────┼────────────────────────┐
        ▼                ▼                        ▼
┌──────────────┐ ┌───────────────┐      ┌─────────────────────┐
│  vidhyalayam │ │ Redis Workers │◄────►│ Compulsory Redis    │
│  (Next.js 16)│ │ (4 Processes) │      │ (127.0.0.1:6379)    │
└───────┬──────┘ └───────┬───────┘      └─────────────────────┘
        │                │
        └────────┬───────┘
                 ▼
        ┌─────────────────────┐
        │ PostgreSQL Database │
        │ (127.0.0.1:5432)    │
        └─────────────────────┘
```

---

## Part 1: Azure Linux VM Provisioning

### 1.1 Azure VM Specifications
1. Open the [Azure Portal](https://portal.azure.com).
2. Go to **Virtual machines** $\rightarrow$ **Create** $\rightarrow$ **Azure virtual machine**.
3. Configure the VM:
   - **OS**: Ubuntu Server 22.04 LTS (x64 Gen 2)
   - **Recommended Size**: `Standard_B2ms` (2 vCPUs, 8 GiB RAM) or minimum `Standard_B2s` (2 vCPUs, 4 GiB RAM)
   - **Authentication**: SSH public key (Username: `azureuser`)
   - **Key Pair**: Download and securely save your `.pem` key file (e.g. `azure_key.pem`)
4. **IP Configuration**: Set IP assignment to **Static** under Public IP configurations.

### 1.2 Azure Network Security Group (NSG) Inbound Rules
Configure your VM's NSG with the following inbound security rules:

| Priority | Name | Destination Port | Protocol | Source | Action | Purpose |
|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **300** | Allow-SSH | `22` | TCP | Any (or your IP) | Allow | Secure Remote Shell |
| **310** | Allow-HTTP | `80` | TCP | Any | Allow | Web Traffic / Certbot |
| **320** | Allow-HTTPS | `443` | TCP | Any | Allow | Secure Web Traffic (SSL) |

> [!WARNING]
> **PostgreSQL (5432)** and **Redis (6379)** must **NEVER** be opened in Azure NSG inbound rules. They must only listen locally on `127.0.0.1`.

---

## Part 2: One-Time Server Setup

Connect to your Azure VM from Windows Terminal, PuTTY, or PowerShell:

```bash
ssh -i /path/to/azure_key.pem azureuser@<AZURE_VM_PUBLIC_IP>
```

Run the following commands in order:

### 2.1 Update System & Install Core Packages
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl unzip build-essential nginx postgresql postgresql-contrib redis-server certbot python3-certbot-nginx
```

### 2.2 Configure & Verify Compulsory Redis
Redis 7+ is **compulsory** for Vidhyalayam demand slip generation, real-time notifications, audit logs, and export queues.
```bash
sudo systemctl enable --now redis-server
redis-cli ping
# Expected output: PONG
```

### 2.3 Configure 4GB Swap Memory (Prevents Build OOM Crashes)
Next.js 16 builds require substantial memory. A swap file prevents the Linux kernel Out-of-Memory (OOM) killer from terminating your build process:
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Verify swap is active:
free -h
```

### 2.4 Install Node.js 22 LTS, Bun & PM2
```bash
# 1. Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # Should show v22.x.x

# 2. Install Bun (Required for database seed scripts)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# 3. Install PM2 globally and configure systemd startup
sudo npm install -g pm2
pm2 startup systemd
# Copy and execute the exact 'sudo env PATH=...' line printed by PM2!
```

### 2.5 Configure PostgreSQL Database
```bash
sudo -u postgres psql
```
Inside the PostgreSQL shell:
```sql
CREATE USER vidhya WITH PASSWORD 'SET_YOUR_STRONG_PASSWORD_HERE';
CREATE DATABASE vidhyalayam OWNER vidhya;
\q
```
Verify the local connection:
```bash
PGPASSWORD='SET_YOUR_STRONG_PASSWORD_HERE' psql -h 127.0.0.1 -U vidhya -d vidhyalayam -c 'SELECT 1;'
# Expected output: 1
```

### 2.6 Setup Web Directory Permissions
```bash
sudo mkdir -p /var/www/vidhyalayam
sudo chown -R $USER:$USER /var/www/vidhyalayam
```

---

## Part 3: Initial Application Setup

### 3.1 Clone Repository
```bash
cd /var/www/vidhyalayam
git clone https://github.com/i-manish-3/vidhyalayam-v1.0.git .
```

### 3.2 Create Production `.env`
Create the production environment file:
```bash
nano /var/www/vidhyalayam/.env
```
Paste and fill in your values:
```env
NODE_ENV=production
DATABASE_URL=postgresql://vidhya:SET_YOUR_STRONG_PASSWORD_HERE@127.0.0.1:5432/vidhyalayam?connection_limit=50&pool_timeout=20

# Generate 32-byte hex keys with: openssl rand -hex 32
JWT_SECRET=REPLACE_WITH_GENERATED_32_BYTE_HEX_KEY
TOKEN_ENCRYPTION_KEY=REPLACE_WITH_ANOTHER_GENERATED_32_BYTE_HEX_KEY

# Application URLs
PUBLIC_APP_URL=https://erp.yourdomain.com
STORAGE_DRIVER=local

# ============================================
# COMPULSORY REDIS & QUEUE CONFIGURATION
# ============================================
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
USE_QUEUE=true

# Concurrency & Worker Rates
FEE_DEMAND_GENERATE_CONCURRENCY=5
WHATSAPP_WORKER_MAX_SCHOOLS=20
WHATSAPP_WORKER_POLL_MS=1500
NOTIFICATION_QUEUE_CONCURRENCY=10
EXPORT_QUEUE_CONCURRENCY=2
EXPORT_RETENTION_DAYS=7
AUDIT_RETENTION_DAYS=365
```
*(Press `Ctrl+O`, `Enter`, `Ctrl+X` to save and exit).*

### 3.3 Install Dependencies, Migrate Database & Seed Initial Data
```bash
cd /var/www/vidhyalayam
npm install
npx prisma generate
npx prisma db push

# Run initial platform seed (creates super admin, school admin, roles)
bun run seed
```

> **Default Seed Logins (Change passwords immediately after first login!):**
> - **Super Admin:** `sahyog.vidhyalayam@gmail.com` / `admin123`
> - **School Admin:** `admin@dpsdelhi.in` / `admin123`

### 3.4 Build Application & Start PM2 Ecosystem
```bash
# Build production bundle with memory cap
NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Start Next.js server + 4 Redis workers via ecosystem configuration
pm2 start ecosystem.config.cjs
pm2 save
```

Verify all 5 services are online:
```bash
pm2 status
```
You should see:
1. `vidhyalayam` (Next.js web server on port 3000)
2. `worker-demand` (Demand Slip Generator Worker)
3. `worker-notifications` (WhatsApp / Email / App Notification Worker)
4. `worker-exports` (Report Export Worker)
5. `worker-audit` (Audit Log Retention Worker)

### 3.5 Configure Nginx Reverse Proxy & Let's Encrypt SSL
Create the Nginx server block:
```bash
sudo nano /etc/nginx/sites-available/vidhyalayam
```
Paste the following configuration:
```nginx
server {
    listen 80;
    server_name erp.yourdomain.com; # Replace with your domain or Azure public IP

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_buffering off; # Required for Server-Sent Events (SSE) live notifications
    }
}
```
Enable the site:
```bash
sudo ln -sf /etc/nginx/sites-available/vidhyalayam /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Obtain a free SSL Certificate via Certbot (requires your domain DNS A-record to point to the Azure VM IP):
```bash
sudo certbot --nginx -d erp.yourdomain.com
```

---

## Part 4: Automated CI/CD Setup with GitHub Actions

With this setup, **every `git push` to your repository automatically updates and reloads the Azure VM with zero downtime.**

### 4.1 Generate a Dedicated Deployment SSH Key Pair
On your local terminal or VM:
```bash
ssh-keygen -t ed25519 -C "github-actions-azure" -f ~/.ssh/github_actions_azure
```
Leave the passphrase blank.

1. **Authorize Public Key on Azure VM**:
   ```bash
   cat ~/.ssh/github_actions_azure.pub >> ~/.ssh/authorized_keys
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```

2. **Copy the Private Key**:
   - On Windows: `Get-Content ~/.ssh/github_actions_azure | Set-Clipboard`
   - On Linux/Mac: `cat ~/.ssh/github_actions_azure`

### 4.2 Configure GitHub Repository Secrets
1. Go to your GitHub repository: `https://github.com/i-manish-3/vidhyalayam-v1.0`
2. Navigate to **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions** $\rightarrow$ **New repository secret**.
3. Add the following secrets:

| Secret Name | Value |
|---|---|
| `AZURE_VM_HOST` | Azure VM Public IP (e.g. `20.198.54.21`) or Azure DNS domain |
| `AZURE_VM_USERNAME` | `azureuser` (or your VM SSH username) |
| `AZURE_VM_SSH_KEY` | Entire private key contents including `-----BEGIN ...` and `-----END ...` |
| `AZURE_VM_PORT` | `22` |

### 4.3 How Automated Deployment Works
When you push code to GitHub:
```bash
git add .
git commit -m "feat: new feature update"
git push origin test-deploy   # or git push origin main
```
1. **GitHub Actions Runner** checks out code, runs `npx prisma generate`, and performs a dry-run Next.js build.
2. If verification passes, it connects to your Azure VM via SSH.
3. It executes [`scripts/deploy-azure.sh`](file:///c:/Manish/my-digital-acadmey/scripts/deploy-azure.sh):
   - Verifies Redis status.
   - Pulls latest commits (`git reset --hard origin/<branch>`).
   - Installs dependencies (`npm install --prefer-offline`).
   - Syncs Prisma DB migrations (`npx prisma db push --accept-data-loss`).
   - Compiles Next.js with `NODE_OPTIONS="--max-old-space-size=2048"`.
   - Gracefully reloads PM2 (`pm2 reload ecosystem.config.cjs --update-env`).
   - Runs post-deployment health check on `http://127.0.0.1:3000`.

---

## Part 5: Daily Operations & Maintenance Commands

### PM2 Process Control
```bash
# View live status of all 5 processes
pm2 status

# Live unified logs
pm2 logs

# Live logs for Next.js web application
pm2 logs vidhyalayam --lines 50

# Live logs for a background worker
pm2 logs worker-demand
pm2 logs worker-notifications

# Restart all services manually
pm2 restart ecosystem.config.cjs

# Live resource monitor (CPU / Memory dashboard)
pm2 monit
```

### Redis Monitoring
```bash
# Check Redis memory and queue statistics
redis-cli info memory
redis-cli info stats

# Test Redis responsiveness
redis-cli ping
```

### PostgreSQL Operations
```bash
# Open interactive database shell
sudo -u postgres psql -d vidhyalayam

# List all database tables
sudo -u postgres psql -d vidhyalayam -c '\dt'

# Create an immediate manual database backup
pg_dump -h 127.0.0.1 -U vidhya -d vidhyalayam -F c -b -v -f "/var/www/vidhyalayam/backup_$(date +%Y%m%d_%H%M%S).dump"
```

---

## Part 6: Comprehensive Troubleshooting Guide

| Symptom / Error | Root Cause | Solution |
|:---|:---|:---|
| **Infinite loading screen / browser stuck on load** | 1. Hardcoded external domain in `proxy.ts`.<br>2. PM2 crashed and Nginx is waiting for `proxy_read_timeout 300s`. | Verify `proxy.ts` allows direct VM IP access. Check `pm2 status` and `pm2 logs vidhyalayam`. |
| **Build fails with Exit Code 137** | Linux OOM (Out of Memory) killer killed Node.js during `next build`. | 1. Ensure 4GB swap exists (`free -h`).<br>2. Build with `NODE_OPTIONS="--max-old-space-size=2048" npm run build`. |
| **502 Bad Gateway (Nginx)** | Next.js server on port 3000 is not running or crashed. | Run `pm2 status`. If `vidhyalayam` is in `errored` state, run `pm2 logs vidhyalayam --lines 50` to inspect the stack trace. |
| **GitHub Actions SSH Permission Denied (publickey)** | Public key missing in `~/.ssh/authorized_keys` or secret is incorrect. | Ensure `github_actions_azure.pub` is in `~/.ssh/authorized_keys` on VM and permissions are `chmod 600 ~/.ssh/authorized_keys`. |
| **Redis connection refused (ECONNREFUSED 127.0.0.1:6379)** | Redis service is stopped. | Run `sudo systemctl restart redis-server && redis-cli ping`. |
| **Port 3000 already in use (EADDRINUSE)** | Multiple orphaned Node processes bound to port 3000. | Run `sudo lsof -i :3000`, kill the orphaned PID, then `pm2 restart vidhyalayam`. |
| **Prisma migration drift or schema mismatch** | Database schema out of sync with Prisma models. | Run `cd /var/www/vidhyalayam && npx prisma db push --accept-data-loss`. |
| **SSL Certificate expired or failed renewal** | Certbot auto-renewal timer disabled or port 80 blocked. | Run `sudo certbot renew --dry-run`. Ensure port 80 is open in Azure NSG for HTTP-01 challenge. |

---

## Part 7: Emergency Rollback Procedure

If a deployed commit causes an issue in production, you can roll back instantly to the previous working commit:

```bash
cd /var/www/vidhyalayam

# 1. View recent commit history
git log -n 5 --oneline

# 2. Reset to the desired working commit ID (e.g. 7524f79)
git reset --hard <COMMIT_ID>

# 3. Rebuild and reload PM2
NODE_OPTIONS="--max-old-space-size=2048" npm run build
pm2 reload ecosystem.config.cjs --update-env
```
