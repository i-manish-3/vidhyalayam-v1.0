# Azure Linux VM Deployment Guide (with GitHub Actions & Compulsory Redis)

This guide walks you through deploying **Vidhyalayam School ERP** (Next.js 16, Prisma/PostgreSQL, Redis 7+, PM2, and Nginx) to an **Azure Linux Virtual Machine** with zero-downtime automated deployments using **GitHub Actions**.

---

## 1. Prerequisites & Azure VM Provisioning

### 1.1 Create the Azure Virtual Machine
1. Open the [Azure Portal](https://portal.azure.com).
2. Navigate to **Virtual machines** $\rightarrow$ **Create** $\rightarrow$ **Azure virtual machine**.
3. Fill in the basics:
   - **OS**: Ubuntu Server 22.04 LTS (x64 Gen 2)
   - **Size**: `Standard_B2ms` (2 vCPUs, 8 GiB RAM - *Recommended*) or `Standard_B2s` (2 vCPUs, 4 GiB RAM)
   - **Authentication**: SSH public key (Username: `azureuser`)
   - **Key Pair**: Download the `.pem` key file to your computer (keep it safe!)
4. **Networking**:
   - Create or assign a **Public IP** (Set IP assignment to **Static** in IP Configuration).
   - Configure **NIC Network Security Group (NSG)** with the following **Inbound port rules**:

| Priority | Name | Destination Port | Protocol | Source | Action |
|---|---|---|---|---|---|
| 300 | Allow-SSH | `22` | TCP | Any (or your IP) | Allow |
| 310 | Allow-HTTP | `80` | TCP | Any | Allow |
| 320 | Allow-HTTPS | `443` | TCP | Any | Allow |

*(PostgreSQL port 5432 and Redis port 6379 must NOT be opened to the internet — they remain local on `127.0.0.1`)*

---

## 2. One-Time VM Server Setup

Connect to your Azure VM from Windows Terminal or PuTTY:
```bash
ssh -i /path/to/your-azure-key.pem azureuser@<AZURE_VM_PUBLIC_IP>
```

Run the following blocks on the server:

### 2.1 Update System & Install Core Packages (PostgreSQL, Redis, Nginx)
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl unzip build-essential nginx postgresql postgresql-contrib redis-server certbot python3-certbot-nginx
```

### 2.2 Configure & Verify Compulsory Redis
```bash
sudo systemctl enable --now redis-server
redis-cli ping
# Output must be: PONG
```

### 2.3 Configure 4GB Swap Space (Prevents OOM during builds)
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 2.4 Install Node.js 22 LTS, Bun & PM2
```bash
# Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Bun (required for seed scripts)
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc

# PM2 globally
sudo npm install -g pm2
pm2 startup systemd
# Copy and execute the sudo env PATH=... command printed by PM2!
```

### 2.5 Configure PostgreSQL Database
```bash
sudo -u postgres psql
```
Inside the `psql` shell, run:
```sql
CREATE USER vidhya WITH PASSWORD 'SET_YOUR_STRONG_PASSWORD_HERE';
CREATE DATABASE vidhyalayam OWNER vidhya;
\q
```
Verify the connection:
```bash
PGPASSWORD='SET_YOUR_STRONG_PASSWORD_HERE' psql -h 127.0.0.1 -U vidhya -d vidhyalayam -c 'SELECT 1;'
```

### 2.6 Setup Web Root & SSH Access Permissions
```bash
sudo mkdir -p /var/www/vidhyalayam
sudo chown -R $USER:$USER /var/www/vidhyalayam
```

---

## 3. Initial Project Setup on Azure VM

### 3.1 Clone the Repository
```bash
cd /var/www/vidhyalayam
git clone <YOUR_GITHUB_REPO_URL> .
```

### 3.2 Create the Production `.env`
```bash
nano /var/www/vidhyalayam/.env
```

Paste and customize your environment variables:
```env
NODE_ENV=production
DATABASE_URL=postgresql://vidhya:SET_YOUR_STRONG_PASSWORD_HERE@127.0.0.1:5432/vidhyalayam?connection_limit=50&pool_timeout=20

# Generate two 32-byte keys with `openssl rand -hex 32`
JWT_SECRET=GENERATED_KEY_1
TOKEN_ENCRYPTION_KEY=GENERATED_KEY_2

PUBLIC_APP_URL=https://erp.yourdomain.com
STORAGE_DRIVER=local

# ============================================
# COMPULSORY REDIS & QUEUE CONFIGURATION
# ============================================
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
USE_QUEUE=true

# Concurrency & queue settings
FEE_DEMAND_GENERATE_CONCURRENCY=5
WHATSAPP_WORKER_MAX_SCHOOLS=20
WHATSAPP_WORKER_POLL_MS=1500
NOTIFICATION_QUEUE_CONCURRENCY=10
EXPORT_QUEUE_CONCURRENCY=2
EXPORT_RETENTION_DAYS=7
AUDIT_RETENTION_DAYS=365
```
*(Press `Ctrl+O`, Enter, `Ctrl+X` to save and exit).*

### 3.3 Install Dependencies, Migrate Database & Seed
```bash
cd /var/www/vidhyalayam
npm install
npx prisma generate
npx prisma db push
npm run seed  # Seeds initial super admin & demo data
```

### 3.4 Build Application & Start PM2 Ecosystem
The project includes `ecosystem.config.cjs` which starts the Next.js app and all 4 compulsory Redis workers:
```bash
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

Verify all 5 services are online:
```bash
pm2 status
```
You should see `vidhyalayam`, `worker-demand`, `worker-notifications`, `worker-exports`, and `worker-audit` in **online** status.

### 3.5 Setup Nginx Reverse Proxy & SSL
Create the Nginx configuration:
```bash
sudo nano /etc/nginx/sites-available/vidhyalayam
```
Paste:
```nginx
server {
    listen 80;
    server_name erp.yourdomain.com; # Replace with your domain or Azure VM public IP

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_buffering off; # Required for SSE notifications
    }
}
```
Enable the site and reload Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/vidhyalayam /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

Obtain Let's Encrypt SSL certificate (requires your domain A-record to point to the VM IP):
```bash
sudo certbot --nginx -d erp.yourdomain.com
```

---

## 4. Setup Automated CI/CD with GitHub Actions

### 4.1 Generate a Deployment SSH Key Pair
On your local machine or the VM, generate a dedicated SSH key for GitHub Actions:
```bash
ssh-keygen -t ed25519 -C "github-actions-azure" -f ~/.ssh/github_actions_azure
```
1. Add the contents of `~/.ssh/github_actions_azure.pub` to `/home/azureuser/.ssh/authorized_keys` on the Azure VM.
2. Ensure proper permissions:
   ```bash
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```

### 4.2 Configure GitHub Repository Secrets
In your GitHub repository, go to **Settings** $\rightarrow$ **Secrets and variables** $\rightarrow$ **Actions** $\rightarrow$ **New repository secret**:

| Secret Name | Value |
|---|---|
| `AZURE_VM_HOST` | Azure VM Public IP (e.g. `20.x.x.x`) or Azure DNS domain |
| `AZURE_VM_USERNAME` | `azureuser` (or your VM username) |
| `AZURE_VM_SSH_KEY` | Contents of the **private key** `github_actions_azure` (including `-----BEGIN ...` and `-----END ...`) |
| `AZURE_VM_PORT` | `22` |

### 4.3 Automated Pipeline Execution
Whenever you push to the `main` branch, the `.github/workflows/deploy.yml` workflow automatically:
1. Validates the code on a GitHub runner and performs a dry-run build.
2. SSHs into your Azure Linux VM.
3. Verifies that `redis-server` is active (and restarts it if needed).
4. Pulls the latest commits (`git fetch origin main && git reset --hard origin/main`).
5. Installs dependencies (`npm install --prefer-offline`).
6. Generates Prisma client and applies database migrations (`npx prisma migrate deploy`).
7. Builds the Next.js production bundle (`npm run build`).
8. Gracefully reloads the Next.js server and all 4 Redis workers (`pm2 reload ecosystem.config.cjs --update-env`).
9. Runs automated health checks on port 3000 and verifies that all 5 PM2 processes are online.

---

## 5. Helpful Commands & Maintenance

```bash
# PM2 process status
pm2 status

# Live logs for all processes
pm2 logs

# Live logs for specific worker
pm2 logs worker-demand
pm2 logs vidhyalayam

# Check Redis memory and queue stats
redis-cli info memory
redis-cli ping

# Check PostgreSQL connection
sudo -u postgres psql -d vidhyalayam -c '\dt'

# Check Nginx status
sudo systemctl status nginx

# RAM and swap memory check
free -h
```
