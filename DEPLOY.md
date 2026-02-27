# Деплой PartyPlay на VPS

## 1. Купить VPS

Любой провайдер (Timeweb, Aeza, Selectel, Hetzner). Минимум: **1 vCPU, 1 GB RAM, Ubuntu 22.04/24.04**.

Получишь IP (например `185.100.50.25`) и root-пароль.

---

## 2. Подключиться к серверу

```bash
ssh root@185.100.50.25
```

---

## 3. Настроить сервер

```bash
# Обновить систему
apt update && apt upgrade -y

# Установить Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Установить nginx и git
apt install -y nginx git

# Проверить
node -v   # v20.x
npm -v    # 10.x
```

---

## 4. Создать пользователя для приложения

```bash
useradd -m -s /bin/bash partyplay
su - partyplay
```

---

## 5. Загрузить проект

```bash
git clone <твой-репозиторий> ~/party-play
cd ~/party-play
npm install
```

---

## 6. Собрать проект

```bash
npm -w server run build
npm -w client run build
```

---

## 7. Создать .env

```bash
cat > ~/party-play/.env << 'EOF'
PORT=3001
NODE_ENV=production
CORS_ORIGINS=http://185.100.50.25
EOF
```

Замени `185.100.50.25` на свой реальный IP.

---

## 8. Проверить что запускается

```bash
cd ~/party-play
node --env-file=.env server/dist/index.js
```

Должно вывести `PartyPlay server running on http://0.0.0.0:3001`. Останови через `Ctrl+C`, выйди обратно в root:

```bash
exit
```

---

## 9. Создать systemd-сервис (автозапуск)

```bash
cat > /etc/systemd/system/partyplay.service << 'EOF'
[Unit]
Description=PartyPlay Server
After=network.target

[Service]
Type=simple
User=partyplay
WorkingDirectory=/home/partyplay/party-play
ExecStart=/usr/bin/node --env-file=.env server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

```bash
systemctl daemon-reload
systemctl enable partyplay
systemctl start partyplay
systemctl status partyplay   # должен быть active (running)
```

---

## 10. Настроить nginx

```bash
cat > /etc/nginx/sites-available/partyplay << 'EOF'
server {
    listen 80;
    server_name _;

    # Статика клиента
    root /home/partyplay/party-play/client/dist;
    index index.html;

    # SPA — все маршруты -> index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Socket.IO -> Node.js
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
```

```bash
ln -s /etc/nginx/sites-available/partyplay /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t            # должен быть ok
systemctl restart nginx
```

---

## 11. Открыть в браузере

Заходи на `http://185.100.50.25` — должен открыться PartyPlay.

---

## 12. Когда купишь домен

```bash
# 1. Направить DNS A-запись домена на IP сервера

# 2. Обновить nginx
sed -i 's/server_name _;/server_name yourdomain.com;/' /etc/nginx/sites-available/partyplay

# 3. Установить HTTPS
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com

# 4. Обновить CORS
su - partyplay
sed -i 's|CORS_ORIGINS=.*|CORS_ORIGINS=https://yourdomain.com|' ~/party-play/.env
exit

# 5. Перезапустить
systemctl restart partyplay
systemctl restart nginx
```

---

## 13. Скрипт обновления (деплой новой версии)

```bash
cat > /home/partyplay/deploy.sh << 'EOF'
#!/bin/bash
cd ~/party-play
git pull origin master
npm install
npm -w server run build
npm -w client run build
EOF

chown partyplay:partyplay /home/partyplay/deploy.sh
chmod +x /home/partyplay/deploy.sh
```

При обновлении:

```bash
su - partyplay -c "./deploy.sh"
systemctl restart partyplay
```

---

## Если что-то не работает

```bash
# Логи приложения
journalctl -u partyplay -f

# Логи nginx
tail -f /var/log/nginx/error.log

# Проверить что порт слушается
ss -tlnp | grep 3001
```
