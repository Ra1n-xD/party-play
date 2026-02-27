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
```

---

## 5. Настроить SSH-ключ для GitHub (нужно для git clone и автодеплоя)

```bash
# Создать ключ от имени partyplay
su - partyplay
ssh-keygen -t ed25519 -C "partyplay@vps" -f ~/.ssh/id_ed25519 -N ""

# Показать публичный ключ — скопируй его
cat ~/.ssh/id_ed25519.pub
exit
```

Добавь этот публичный ключ в GitHub:
- **Вариант A** (только чтение одного репо): GitHub → Репозиторий → Settings → Deploy keys → Add deploy key
- **Вариант B** (все репо аккаунта): GitHub → Settings → SSH and GPG keys → New SSH key

---

## 6. Загрузить проект

```bash
su - partyplay
git clone git@github.com:ТВОЙ_ЮЗЕРНЕЙМ/party-play.git ~/party-play
cd ~/party-play
npm install
exit
```

---

## 7. Собрать проект

```bash
su - partyplay -c "cd ~/party-play && npm run build"
```

Эта команда последовательно соберёт server и client.

---

## 8. Создать .env

```bash
cat > /home/partyplay/party-play/.env << 'EOF'
PORT=3001
NODE_ENV=production
CORS_ORIGINS=http://185.100.50.25
EOF

chown partyplay:partyplay /home/partyplay/party-play/.env
```

Замени `185.100.50.25` на свой реальный IP.

---

## 9. Проверить что запускается

```bash
su - partyplay
cd ~/party-play
node --env-file=.env server/dist/server/src/index.js
```

Должно вывести `PartyPlay server running on http://0.0.0.0:3001`. Останови через `Ctrl+C`:

```bash
exit
```

---

## 10. Создать systemd-сервис (автозапуск)

```bash
cat > /etc/systemd/system/partyplay.service << 'EOF'
[Unit]
Description=PartyPlay Server
After=network.target

[Service]
Type=simple
User=partyplay
WorkingDirectory=/home/partyplay/party-play
ExecStart=/usr/bin/node --env-file=.env server/dist/server/src/index.js
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

## 11. Разрешить partyplay перезапускать сервис (нужно для автодеплоя)

```bash
cat > /etc/sudoers.d/partyplay << 'EOF'
partyplay ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart partyplay
EOF
```

---

## 12. Настроить nginx

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

## 13. Открыть в браузере

Заходи на `http://185.100.50.25` — должен открыться PartyPlay.

---

## 14. Настроить автодеплой (GitHub Actions)

При каждом пуше в `main` сервер автоматически обновляется и пересобирается.

### Шаг 1: Создать SSH-ключ для GitHub Actions

```bash
# На VPS от root
ssh-keygen -t ed25519 -C "github-actions-deploy" -f /tmp/deploy_key -N ""

# Добавить публичный ключ в authorized_keys пользователя partyplay
mkdir -p /home/partyplay/.ssh
cat /tmp/deploy_key.pub >> /home/partyplay/.ssh/authorized_keys
chown -R partyplay:partyplay /home/partyplay/.ssh
chmod 700 /home/partyplay/.ssh
chmod 600 /home/partyplay/.ssh/authorized_keys

# Скопировать приватный ключ — понадобится для GitHub
cat /tmp/deploy_key

# Удалить ключ с сервера после копирования
rm /tmp/deploy_key /tmp/deploy_key.pub
```

### Шаг 2: Добавить секреты в GitHub

GitHub → Репозиторий → Settings → Secrets and variables → Actions → New repository secret:

| Секрет | Значение |
|--------|----------|
| `VPS_HOST` | IP-адрес сервера (например `185.100.50.25`) |
| `VPS_USER` | `partyplay` |
| `VPS_SSH_KEY` | Содержимое приватного ключа (весь текст из `cat /tmp/deploy_key`) |

### Шаг 3: Готово

Workflow-файл `.github/workflows/deploy.yml` уже есть в репозитории. После пуша в `main` GitHub автоматически:

1. Подключится к VPS по SSH
2. Стянет последние изменения (`git pull`)
3. Установит зависимости (`npm install`)
4. Соберёт проект (`npm run build`)
5. Перезапустит сервис (`systemctl restart partyplay`)

Статус деплоя смотри в GitHub → вкладка Actions.

---

## 15. Ручной деплой (если нужно)

В репозитории есть скрипт `deploy.sh`. При первом запуске:

```bash
su - partyplay
chmod +x ~/party-play/deploy.sh
~/party-play/deploy.sh
```

В дальнейшем:

```bash
su - partyplay -c "~/party-play/deploy.sh"
```

Скрипт стянет изменения, пересоберёт проект, проверит сборку и перезапустит сервис.

---

## 16. Когда купишь домен

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

## Если что-то не работает

```bash
# Логи приложения
journalctl -u partyplay -f

# Логи nginx
tail -f /var/log/nginx/error.log

# Проверить что порт слушается
ss -tlnp | grep 3001

# Статус автодеплоя
# GitHub → Репозиторий → вкладка Actions

# Ручной деплой если Actions не сработал
su - partyplay -c "~/party-play/deploy.sh"
```
