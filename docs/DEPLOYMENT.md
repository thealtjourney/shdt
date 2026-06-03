# SHDT Production Deployment Guide

## Prerequisites

### System Requirements
- **OS**: Linux (Ubuntu 20.04 LTS or 22.04 LTS recommended)
- **CPU**: 2+ cores
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 50GB+ (adjust based on data volume)
- **Docker**: Version 20.10+
- **Docker Compose**: Version 1.29+

### Domain and Network
- Valid domain name with DNS control
- Public IP address or cloud instance
- Port 80 and 443 open to internet
- Optional: Existing SSL certificates

### Access Requirements
- SSH access to server
- Sudo or root privileges
- Git installed for cloning repository

## Infrastructure Setup

### 1. Server Provisioning

#### On Linux VPS (DigitalOcean, AWS EC2, Linode, etc.)

```bash
# Update system packages
sudo apt-get update
sudo apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version

# Add current user to docker group (optional, for non-sudo usage)
sudo usermod -aG docker $USER
# Log out and back in for group membership to take effect
```

### 2. Repository Setup

```bash
# Create deployment directory
sudo mkdir -p /opt/shdt
sudo chown $USER:$USER /opt/shdt
cd /opt/shdt

# Clone repository
git clone <repository-url> .

# Create necessary directories
mkdir -p server/db/backup
mkdir -p server/logs
mkdir -p client/logs
mkdir -p nginx/ssl
mkdir -p nginx/logs
```

### 3. Environment Configuration

```bash
# Copy environment template
cp .env.production.example .env.production

# Edit configuration
nano .env.production
```

**Critical variables to set:**
- `DB_PASSWORD`: Strong, unique password
- `SECRET_KEY`: Generate with: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
- `CORS_ORIGINS`: Your domain(s)
- `API_URL`: Your API endpoint
- `SSL_EMAIL`: Email for Let's Encrypt notifications

```bash
# Source environment for docker-compose
export $(cat .env.production | grep -v '^#' | xargs)
```

## Docker Setup and Build

### 1. Build Images

```bash
# Build all Docker images
make build

# Or manually:
docker-compose -f docker-compose.prod.yml build --no-cache
```

### 2. Create Docker Network

```bash
# Network is auto-created by docker-compose
# Verify after first start:
docker network ls | grep shdt_network
```

### 3. Start Services (Without SSL First)

```bash
# Start services
make up

# Verify all containers are running
make ps

# Check logs
make logs
```

## SSL/TLS Configuration

### Option A: Let's Encrypt with Certbot

#### Installation and Initial Setup

```bash
# Install Certbot
sudo apt-get install -y certbot python3-certbot-nginx

# Generate certificate (replace yourdomain.com)
sudo certbot certonly --standalone \
  -d yourdomain.com \
  -d www.yourdomain.com \
  -m admin@yourdomain.com \
  --agree-tos \
  --non-interactive

# Certificates are in: /etc/letsencrypt/live/yourdomain.com/
```

#### Copy Certificates to Nginx Container

```bash
# Create SSL directory in SHDT
mkdir -p nginx/ssl

# Copy certificates
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/ssl/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/ssl/key.pem

# Set correct permissions
sudo chown $USER:$USER nginx/ssl/*
chmod 600 nginx/ssl/key.pem
chmod 644 nginx/ssl/cert.pem
```

#### Auto-Renewal Setup

```bash
# Test renewal
sudo certbot renew --dry-run

# Create renewal script
sudo tee /usr/local/bin/shdt-renew-certs.sh > /dev/null << 'EOF'
#!/bin/bash
DOMAIN="yourdomain.com"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN"
SSL_DIR="/opt/shdt/nginx/ssl"

# Renew certificate
certbot renew --quiet

# Copy to SHDT if successful
if [ $? -eq 0 ]; then
    cp "$CERT_PATH/fullchain.pem" "$SSL_DIR/cert.pem"
    cp "$CERT_PATH/privkey.pem" "$SSL_DIR/key.pem"
    chown $(stat -c '%U:%G' $SSL_DIR) "$SSL_DIR"/*

    # Reload nginx
    docker-compose -f /opt/shdt/docker-compose.prod.yml exec -T nginx nginx -s reload
fi
EOF

# Make executable
sudo chmod +x /usr/local/bin/shdt-renew-certs.sh

# Add to crontab (runs at 2 AM daily)
sudo crontab -e
# Add line: 0 2 * * * /usr/local/bin/shdt-renew-certs.sh >> /var/log/shdt-cert-renewal.log 2>&1
```

### Option B: Self-Signed Certificate (Testing Only)

```bash
# Generate self-signed certificate
mkdir -p nginx/ssl
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout nginx/ssl/key.pem \
  -out nginx/ssl/cert.pem \
  -days 365 \
  -subj "/CN=yourdomain.com"
```

## Database Initialization

### 1. Start Database Service

```bash
# Bring up PostgreSQL only
docker-compose -f docker-compose.prod.yml up -d postgres

# Wait for PostgreSQL to be ready
docker-compose -f docker-compose.prod.yml exec postgres pg_isready
```

### 2. Run Migrations

```bash
# Bring up all services
docker-compose -f docker-compose.prod.yml up -d

# Run database migrations
make migrate

# Or manually:
docker-compose -f docker-compose.prod.yml exec backend \
  alembic upgrade head
```

### 3. Seed Initial Data (Optional)

```bash
# Seed test data
make seed

# Or create admin user:
docker-compose -f docker-compose.prod.yml exec backend \
  python -c "from app.db.init import create_admin_user; create_admin_user()"
```

## Service Startup and Verification

### 1. Start All Services

```bash
# Start all services
make up

# Monitor startup
make logs

# Wait 30-60 seconds for services to fully initialize
```

### 2. Health Checks

```bash
# Check all services
make status

# Individual service checks
curl http://localhost/health                    # Nginx health
curl http://localhost:8000/health               # Backend health
curl -X GET http://localhost:8000/docs         # API documentation
```

### 3. Test API Connection

```bash
# Test API endpoint
curl -X GET http://localhost/api/health \
  -H "Content-Type: application/json"

# Expected response: {"status": "ok"}
```

### 4. Access Web Interface

- Frontend: `https://yourdomain.com`
- API Docs: `https://yourdomain.com/api/docs`
- Admin: `https://yourdomain.com/admin` (if enabled)

## Data Import

### Importing Housing Data

```bash
# Prepare CSV file with required columns
# See DATA_GUIDE.md for format specifications

# Import data
make import CSV_PATH=/path/to/housing_data.csv

# Monitor import progress
make logs-backend

# Verify import
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres shdt_db -c "SELECT COUNT(*) FROM housing_units;"
```

### Bulk Operations

```bash
# Import from S3
make import CSV_PATH=s3://bucket/housing_data.csv

# Import with geocoding
docker-compose -f docker-compose.prod.yml exec backend \
  python scripts/import_data.py \
  --file /data/housing.csv \
  --geocode \
  --batch-size 100
```

## Monitoring and Maintenance

### Log Management

```bash
# View real-time logs
make logs

# View backend logs only
make logs-backend

# View nginx logs
make logs-nginx

# View database logs
make logs-postgres

# Search logs for errors
docker-compose -f docker-compose.prod.yml logs | grep -i error
```

### Database Backups

#### Manual Backup

```bash
# Create backup
make backup

# Backups stored in: server/db/backup/
ls -lh server/db/backup/
```

#### Automated Backups

```bash
# Create backup script
sudo tee /usr/local/bin/shdt-backup.sh > /dev/null << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/shdt/server/db/backup"
RETENTION_DAYS=30

# Create backup
cd /opt/shdt
make backup

# Remove old backups (older than RETENTION_DAYS)
find $BACKUP_DIR -name "shdt_*.sql" -mtime +$RETENTION_DAYS -delete

echo "Backup completed at $(date)" >> /var/log/shdt-backup.log
EOF

sudo chmod +x /usr/local/bin/shdt-backup.sh

# Schedule daily at 2 AM
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/shdt-backup.sh
```

#### Restore from Backup

```bash
# List available backups
ls -lh server/db/backup/

# Restore specific backup
make restore BACKUP_FILE=server/db/backup/shdt_20240101_020000.sql

# Verify restoration
make shell-postgres
# Then: SELECT COUNT(*) FROM housing_units;
```

### Performance Monitoring

```bash
# Check container resource usage
docker stats

# Check disk usage
df -h /opt/shdt

# Check database size
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres shdt_db -c "SELECT pg_size_pretty(pg_database_size('shdt_db'));"
```

## Updates and Maintenance

### Service Restart

```bash
# Graceful restart of all services
make restart

# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend
docker-compose -f docker-compose.prod.yml restart frontend
docker-compose -f docker-compose.prod.yml restart nginx
```

### Code Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild images if dependencies changed
make build

# Restart services
make restart

# Run migrations if schema changed
make migrate
```

### Database Maintenance

```bash
# Optimize database (VACUUM and ANALYZE)
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres shdt_db -c "VACUUM ANALYZE;"

# Check for slow queries
docker-compose -f docker-compose.prod.yml exec postgres \
  psql -U postgres shdt_db -c "SELECT query, calls, mean_time FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;"
```

## Troubleshooting

### Service Won't Start

```bash
# Check logs
make logs

# Check specific service
docker-compose -f docker-compose.prod.yml logs postgres
docker-compose -f docker-compose.prod.yml logs backend

# Restart services
make down
make up
```

### Database Connection Issues

```bash
# Test PostgreSQL connection
docker-compose -f docker-compose.prod.yml exec backend \
  psql postgresql://${DB_USER}:${DB_PASSWORD}@postgres:5432/${DB_NAME}

# Check database status
docker-compose -f docker-compose.prod.yml exec postgres pg_isready
```

### Frontend Not Loading

```bash
# Check nginx logs
make logs-nginx

# Check frontend container
docker-compose -f docker-compose.prod.yml exec frontend nginx -t

# Verify static files
docker-compose -f docker-compose.prod.yml exec frontend ls -la /usr/share/nginx/html
```

### API Errors

```bash
# Test backend connectivity
curl http://localhost:8000/health

# Check backend logs for errors
make logs-backend | grep ERROR

# Test specific endpoint with verbose output
curl -v http://localhost/api/health
```

### Certificate Issues

```bash
# Check certificate expiration
echo | openssl s_client -servername yourdomain.com -connect yourdomain.com:443 2>/dev/null | openssl x509 -noout -dates

# Test certificate renewal
sudo certbot renew --dry-run

# Check renewal log
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

## Security Hardening

### 1. Firewall Configuration

```bash
# Install UFW (Ubuntu)
sudo apt-get install ufw

# Enable firewall
sudo ufw enable

# Allow SSH
sudo ufw allow 22/tcp

# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Deny all other ports
sudo ufw default deny incoming
sudo ufw status
```

### 2. SSH Hardening

```bash
# Edit SSH config
sudo nano /etc/ssh/sshd_config

# Recommended settings:
# PermitRootLogin no
# PasswordAuthentication no
# PubkeyAuthentication yes
# Port 2222 (or custom port)

# Restart SSH
sudo systemctl restart ssh
```

### 3. File Permissions

```bash
# Set correct permissions for sensitive files
chmod 600 /opt/shdt/.env.production
chmod 600 /opt/shdt/nginx/ssl/key.pem
chmod 644 /opt/shdt/nginx/ssl/cert.pem
```

### 4. Regular Updates

```bash
# Enable automatic security updates
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Check for updates
sudo apt-get update
sudo apt-get upgrade
```

## Backup and Disaster Recovery Plan

### Backup Strategy
- Daily automated database backups at 2 AM
- 30-day retention policy
- Backups stored locally and (optionally) synced to S3

### Recovery Procedures
- Database recovery: Use `make restore` command
- Full system recovery: Rerun deployment steps
- Point-in-time recovery: Use PostgreSQL WAL archives

### Verification
- Test restoration weekly in staging environment
- Document recovery time objectives (RTO)
- Document recovery point objectives (RPO)

## Performance Tuning

### PostgreSQL Optimization

```bash
# Connect to database
make shell-postgres

# Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

# Monitor slow queries
SELECT query, calls, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC LIMIT 10;
```

### Backend Optimization

```bash
# Increase Gunicorn workers in .env.production
GUNICORN_WORKERS=8

# Restart backend
docker-compose -f docker-compose.prod.yml restart backend
```

### Frontend Optimization

```bash
# Check bundle size
docker-compose -f docker-compose.prod.yml exec frontend npm run build
```

## Capacity Planning

### Disk Space Estimation
- Database: ~10GB per 1M housing units
- Backups: 3x database size (daily for 30 days)
- Logs: 1-5GB per month (depending on traffic)
- Total: Plan for 50GB+ initial storage

### Resource Scaling
- 100 concurrent users: 2 CPU, 4GB RAM
- 1,000 concurrent users: 4 CPU, 8GB RAM
- 10,000 concurrent users: 8+ CPU, 16GB+ RAM

## Support and Documentation

See the following documentation files for more information:
- **ARCHITECTURE.md**: System architecture and design
- **DATA_GUIDE.md**: Data import specifications
- **USER_GUIDE.md**: User-facing feature documentation
