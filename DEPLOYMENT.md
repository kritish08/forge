# FORGE - Ubuntu VPS & Traefik Deployment Guide

## 🚀 Architecture Overview
This application is designed to be deployed to an Ubuntu Virtual Private Server (VPS) that is already running **Traefik** and **n8n** as a reverse proxy. 
- **Frontend**: Containerized React application served efficiently via Nginx. Routed by Traefik.
- **Backend**: Containerized FastAPI application. Routed by Traefik on the `api` subdomain.
- **Database**: We strongly recommend using **MongoDB Atlas** (fully managed cloud database) to decouple state from your VPS.
- **Backup**: An automated Alpine cron container that backs up your database to AWS S3 daily.

## Prerequisites
- An Ubuntu VPS with Docker, docker-compose, and Traefik already set up and running.
- A MongoDB Atlas cluster ready (get your connection string).
- An AWS S3 Bucket ready for backups.
- Your domains pointing to your VPS IP (`yourdomain.com` and `api.yourdomain.com`).

---

## 🏗️ 1. VPS Preparation

1. SSH into your VPS:
   ```bash
   ssh root@<your-vps-ip>
   ```

2. Clone this repository (or copy it over securely):
   ```bash
   git clone <your-repo> forge
   cd forge
   ```

3. Verify `compose.yaml` networking:
   - Your `n8n-singh` setup automatically created a Docker network named `n8n-singh_default`. The FORGE `compose.yaml` has been specifically tailored to connect to this exact network. You do not need to change anything!

---

## ⚙️ 2. Environment Variables

> ⚠️ **Never commit real `.env` files or paste live secrets into this guide.** `backend/.env` and `frontend/.env` are git-ignored and excluded from Docker images via `.dockerignore`. The values below are **placeholders** — fill them in only inside the `.env` files on the server.

### Backend and Backup Configuration
Create `backend/.env`. (Use your `zerp.me` subdomains):
```env
# Domain 
DOMAIN_NAME=forge.zerp.me

# MongoDB Atlas
MONGO_URL=mongodb+srv://<DB_USER>:<DB_PASSWORD>@<your-cluster>.mongodb.net
DB_NAME=ForgeCluster

# Security  (generate each with: openssl rand -hex 32)
JWT_SECRET_KEY=<your-jwt-secret>
ENCRYPTION_KEY=<your-fernet-encryption-key>

# Email Notifications (Optional)
SMTP_HOST=smtp.zeptomail.in
SMTP_PORT=587
SMTP_USER=emailapikey
SMTP_PASS=<your-zeptomail-api-key>
SMTP_FROM="FORGE <noreply@forge.zerp.me>"

# Push Notifications (Optional)  (generate with the web-push VAPID tooling)
VAPID_PRIVATE_KEY=<your-vapid-private-key>
VAPID_PUBLIC_KEY=<your-vapid-public-key>

# AI Integration (Optional defaults)
AZURE_ENDPOINT=https://kyrex-hub-resource.openai.azure.com/openai/v1/
AZURE_MODEL=gpt-5.2
AZURE_API_KEY=<your-azure-openai-api-key>

# S3 Automated Backups configuration
S3_BUCKET=s3://black-instance-bucket/forge
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=<your-aws-access-key-id>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-access-key>
```
*Note: The AWS Access Keys must be explicitly provided here since this container is not running on native AWS infrastructure.*

### Frontend Configuration
Create `frontend/.env`:
```env
# Must point to your Traefik-routed backend API domain
REACT_APP_BACKEND_URL=https://api.forge.zerp.me
# For the DOMAIN_NAME setting mapped in compose.yaml
DOMAIN_NAME=forge.zerp.me
```

---

## 🏃 3. Build and Run

With everything configured, you can build the images directly on the VPS and start the containers.
```bash
docker-compose up -d --build
```

### Verification
Check the container status to ensure everything is running and not constantly restarting:
```bash
docker-compose ps
```
View the logs of a specific container (e.g., to ensure the backup cron started correctly):
```bash
docker-compose logs -f backup
```

---

## 💾 4. Automated S3 Backups (60-Day Retention)

The `forge-backup` container runs a crontab internally that executes a MongoDB dump every day at 2:00 AM UTC, compresses it, and uploads it via the AWS CLI to your S3 bucket using the credentials in `.env`.

### Configure S3 Bucket Lifecycle
To save money on AWS, manually configure your S3 bucket to delete older backups automatically:
1. Open the Amazon S3 Console and go to your bucket (`forge-mongodb-backups`).
2. Go to the **Management** tab.
3. Click **Create lifecycle rule**:
   - Name: `Delete-After-60-Days`.
   - Apply to all objects.
   - Select **Expire current versions of objects**.
   - Set the days after object creation to **60**.
   - Create rule.

---

## 🔐 5. Cloudflare Tunnel Configuration

Since you are already using Cloudflare Tunnels (Zero Trust) to expose `n8n` securely, map FORGE to the exact same tunnel! Traefik will handle the routing dynamically based on the Host headers.

1. Go to your **Cloudflare Zero Trust** dashboard.
2. Navigate to **Networks > Tunnels** and select your existing VPS tunnel.
3. Add **two new Public Hostnames**:
   
   **Frontend:**
   - **Public Hostname:** `forge.zerp.me`
   - **Service Type:** `HTTP`
   - **URL:** `traefik:80` (or whichever internal IP your Traefik container uses, e.g. `localhost:80` if `cloudflared` runs as a host service instead of a docker container).
   - **Additional settings:** Enable `No TLS Verify` if you encounter infinite redirect loops.

   **Backend API:**
   - **Public Hostname:** `api.forge.zerp.me`
   - **Service Type:** `HTTP`
   - **URL:** `traefik:80` (same as above - Traefik figures out where to send it based on the `Host`!).

---

## 🎉 Access Your App
Once the tunnel propagates:
- Visit `https://forge.zerp.me` for your React Frontend.
- Visit `https://api.forge.zerp.me/docs` to test your FastAPI Backend.
