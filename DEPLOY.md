# Деплой PartyGames на VPS

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
useradd -m -s /bin/bash partygames
su - partygames
```

---

## 5. Загрузить проект

```bash
git clone <твой-репозиторий> ~/party-games
cd ~/party-games
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
cat > ~/party-games/.env << 'EOF'
PORT=3001
NODE_ENV=production
CORS_ORIGINS=http://185.100.50.25
EOF
```

Замени `185.100.50.25` на свой реальный IP.

---

## 8. Проверить что запускается

```bash
cd ~/party-games
node --env-file=.env server/dist/index.js
```

Должно вывести `PartyGames server running on http://0.0.0.0:3001`. Останови через `Ctrl+C`, выйди обратно в root:

```bash
exit
```

---

## 9. Создать systemd-сервис (автозапуск)

```bash
cat > /etc/systemd/system/partygames.service << 'EOF'
[Unit]
Description=PartyGames Server
After=network.target

[Service]
Type=simple
User=partygames
WorkingDirectory=/home/partygames/party-games
ExecStart=/usr/bin/node --env-file=.env server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

```bash
systemctl daemon-reload
systemctl enable partygames
systemctl start partygames
systemctl status partygames   # должен быть active (running)
```

---

## 10. Настроить nginx

```bash
cat > /etc/nginx/sites-available/partygames << 'EOF'
server {
    listen 80;
    server_name _;

    # Статика клиента
    root /home/partygames/party-games/client/dist;
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
ln -s /etc/nginx/sites-available/partygames /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t            # должен быть ok
systemctl restart nginx
```

---

## 11. Открыть в браузере

Заходи на `http://185.100.50.25` — должен открыться PartyGames.

---

## 12. Когда купишь домен

```bash
# 1. Направить DNS A-запись домена на IP сервера

# 2. Обновить nginx
sed -i 's/server_name _;/server_name yourdomain.com;/' /etc/nginx/sites-available/partygames

# 3. Установить HTTPS
apt install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com

# 4. Обновить CORS
su - partygames
sed -i 's|CORS_ORIGINS=.*|CORS_ORIGINS=https://yourdomain.com|' ~/party-games/.env
exit

# 5. Перезапустить
systemctl restart partygames
systemctl restart nginx
```

---

## 13. Скрипт обновления (деплой новой версии)

```bash
cat > /home/partygames/deploy.sh << 'EOF'
#!/bin/bash
cd ~/party-games
git pull origin master
npm install
npm -w server run build
npm -w client run build
EOF

chown partygames:partygames /home/partygames/deploy.sh
chmod +x /home/partygames/deploy.sh
```

При обновлении:

```bash
su - partygames -c "./deploy.sh"
systemctl restart partygames
```

---

## Если что-то не работает

```bash
# Логи приложения
journalctl -u partygames -f

# Логи nginx
tail -f /var/log/nginx/error.log

# Проверить что порт слушается
ss -tlnp | grep 3001
```
