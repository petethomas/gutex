# Digital Ocean Deployment Runbook

Ubuntu 24.04 droplet, nginx, systemd, Node.js app with WebSocket support.

## Prerequisites

- Droplet: Ubuntu 24.04, 2GB RAM / 2 vCPU minimum
- Domain A record pointing to droplet IP

## Variables

| Placeholder | Example |
|-------------|---------|
| `YOUR_DOMAIN` | gutex.app |
| `YOUR_APP_USER` | gutex |
| `YOUR_REPO_URL` | https://github.com/you/gutex.git |

## 1. Server Setup

```bash
ssh root@YOUR_DROPLET_IP

apt update && apt upgrade -y
adduser --disabled-password --gecos "" YOUR_APP_USER

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx
```

## 2. Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

Port 80 is for ACME challenges only. App traffic goes through 443.

## 3. Deploy Application

```bash
sudo su - YOUR_APP_USER
git clone YOUR_REPO_URL ~/gutex
cd ~/gutex
npm install
npm run build
exit
```

## 4. Systemd Service

```bash
cat > /etc/systemd/system/gutex.service << 'EOF'
[Unit]
Description=Gutex
After=network.target

[Service]
Type=simple
User=YOUR_APP_USER
Group=YOUR_APP_USER
WorkingDirectory=/home/YOUR_APP_USER/gutex
ExecStart=/usr/bin/node dist/src/gutex-web.js -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
Environment=NODE_ENV=production
MemoryMax=500M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable gutex
systemctl start gutex
```

## 5. Nginx (Pre-TLS)

Minimal config to get certbot working.

```bash
cat > /etc/nginx/sites-available/gutex << 'EOF'
server {
    listen 80;
    server_name YOUR_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 444;
    }
}
EOF

ln -sf /etc/nginx/sites-available/gutex /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

## 6. TLS Certificate

```bash
apt install -y certbot python3-certbot-nginx
certbot certonly --webroot -w /var/www/html -d YOUR_DOMAIN
```

## 7. Nginx (Final)

```bash
cat > /etc/nginx/sites-available/gutex << 'EOF'
upstream gutex_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

server {
    listen 80;
    server_name YOUR_DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 444;
    }
}

server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location / {
        proxy_pass http://gutex_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";
    }

    location /ws/ {
        proxy_pass http://gutex_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }
}
EOF

nginx -t && systemctl reload nginx
```

Port 80 serves ACME challenges. Everything else gets dropped (444). App runs on 443 only.

## 8. Verify

```bash
systemctl status gutex
curl -I https://YOUR_DOMAIN/
curl -I http://YOUR_DOMAIN/ 
```

The HTTP request should hang and close (444 drops the connection).

## Update

```bash
sudo su - YOUR_APP_USER
cd ~/gutex
git pull
npm install
npm run build
exit
sudo systemctl restart gutex
```

## Logs

```bash
journalctl -u gutex -f
tail -f /var/log/nginx/error.log
```

## Rollback

```bash
sudo su - YOUR_APP_USER
cd ~/gutex
git checkout PREVIOUS_COMMIT
npm install
npm run build
exit
sudo systemctl restart gutex
```
