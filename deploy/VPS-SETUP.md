# VPS Setup Guide — Faculytics API

One-time setup for deploying the Faculytics API on a Hostinger KVM2 VPS.

**Target:** Ubuntu 24.04, 2 vCPU, 8GB RAM, 100GB NVMe

## Prerequisites Checklist

- [ ] Docker Engine + Compose v2
- [ ] Git
- [ ] Deploy user (in `docker` group)
- [ ] SSH key for CI/CD
- [ ] Docker log rotation (`/etc/docker/daemon.json`)
- [ ] External Docker volumes (`pg_data`, `redis_data`)
- [ ] UFW firewall (22/80/443)
- [ ] DNS A records pointing to VPS IP
- [ ] SSL certificates via Certbot
- [ ] Repo cloned to `/opt/faculytics`

## Step-by-Step

### 1. Initial Access

```bash
ssh root@<VPS_IP>
apt update && apt upgrade -y
```

### 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version
```

### 3. Create Deploy User

```bash
useradd -m -s /bin/bash deploy
usermod -aG docker deploy

# Copy SSH keys (so you can SSH as deploy)
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 4. Configure Docker Log Rotation

```bash
cat > /etc/docker/daemon.json << 'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
EOF
systemctl restart docker
```

### 5. Create External Volumes

```bash
docker volume create pg_data
docker volume create redis_data
```

### 6. Configure Firewall

```bash
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw enable
ufw status
```

### 7. DNS Setup

Add A records pointing to the VPS IP:

- `api.faculytics.ctr3.org` → `<VPS_IP>`
- `staging.api.faculytics.ctr3.org` → `<VPS_IP>`

Set to **DNS only** (not proxied) if using Cloudflare.

### 8. SSL Certificates

```bash
apt install certbot -y
certbot certonly --standalone -d api.faculytics.ctr3.org -d staging.api.faculytics.ctr3.org
```

Certbot sets up auto-renewal automatically. To add an Nginx reload hook:

```bash
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh << 'EOF'
#!/bin/bash
docker compose -f /opt/faculytics/docker-compose.deploy.yml exec nginx nginx -s reload
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### 9. Clone Repository

```bash
# Generate deploy key for GitHub
sudo -u deploy ssh-keygen -t ed25519 -C 'faculytics-vps-deploy' -f /home/deploy/.ssh/github_deploy -N ''

# Configure SSH to use this key for GitHub
sudo -u deploy bash -c 'cat > /home/deploy/.ssh/config << EOF
Host github.com
  IdentityFile ~/.ssh/github_deploy
  StrictHostKeyChecking accept-new
EOF'
chmod 600 /home/deploy/.ssh/config
chown deploy:deploy /home/deploy/.ssh/config

# Add the public key to GitHub → Repo → Settings → Deploy keys
cat /home/deploy/.ssh/github_deploy.pub

# Clone
mkdir -p /opt/faculytics
chown deploy:deploy /opt/faculytics
sudo -u deploy git clone git@github.com:CtrlAltElite-Devs/api.faculytics.git /opt/faculytics
```

### 10. Create Environment Files

```bash
cd /opt/faculytics
cp .env.staging.sample .env.staging
cp .env.production.sample .env.production
# Edit both files with real values
```

### 11. Set Postgres Password

```bash
# Export the shared Postgres password (used by Compose)
echo 'export POSTGRES_PASSWORD=your-strong-password-here' >> /home/deploy/.bashrc
source /home/deploy/.bashrc
```

### 12. First Deploy

```bash
cd /opt/faculytics

# Start infrastructure (postgres, redis, nginx)
sudo -u deploy POSTGRES_PASSWORD=<password> docker compose -f docker-compose.deploy.yml up -d postgres redis nginx

# Build and start staging
sudo -u deploy docker build -t faculytics-api:staging .
sudo -u deploy POSTGRES_PASSWORD=<password> docker compose -f docker-compose.deploy.yml --profile staging up -d api-staging

# Build and start production
sudo -u deploy docker build -t faculytics-api:production .
sudo -u deploy POSTGRES_PASSWORD=<password> docker compose -f docker-compose.deploy.yml --profile production up -d api-production

# Verify
docker compose -f docker-compose.deploy.yml ps
curl -s http://localhost:5200/api/v1/health | jq
curl -s http://localhost:5201/api/v1/health | jq
```

### 13. Setup Backup Cron

```bash
mkdir -p /backups
crontab -e
# Add: 0 3 * * * /opt/faculytics/deploy/backup.sh >> /var/log/faculytics-backup.log 2>&1
```

### 14. Setup Image Pruning Cron

```bash
crontab -e
# Add: 0 4 * * 0 docker system prune -f --filter "until=168h" >> /var/log/docker-prune.log 2>&1
```

### 15. GitHub Actions Secrets

Add these secrets to the repository (Settings → Secrets → Actions):

| Secret                | Value                             |
| --------------------- | --------------------------------- |
| `VPS_HOST`            | VPS IP address                    |
| `VPS_DEPLOY_USER`     | `deploy`                          |
| `VPS_SSH_KEY`         | Private SSH key for deploy user   |
| `DISCORD_WEBHOOK_URL` | Discord webhook for notifications |

## Verification

```bash
# Health endpoints
curl -I https://api.faculytics.ctr3.org/api/v1/health
curl -I https://staging.api.faculytics.ctr3.org/api/v1/health

# Container status
docker compose -f /opt/faculytics/docker-compose.deploy.yml ps

# Logs
docker compose -f /opt/faculytics/docker-compose.deploy.yml logs -f
```
