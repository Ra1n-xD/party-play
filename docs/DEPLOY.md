# Деплой PartySide на VPS

Для **существующего** сервера используйте [переход на partyside.fun](PARTYSIDE-MIGRATION.md):
там приведены резервное копирование, CORS, HTTPS, nginx и редирект старого домена.
Не создавайте заново пользователя или хранилище действующего приложения.

## Новая установка

Ниже — Ubuntu/Debian, Node.js 22 LTS, npm, nginx, git. Node должен поддерживать
`--env-file`. Приложение слушает только loopback; публичные 80/443 обслуживает nginx.
Требуется домен `partyside.fun` с DNS на этот VPS. Проверьте ресурсы сервера под
свою фактическую нагрузку.

От root:

```bash
apt update
apt install -y nginx git
node -v
npm -v
useradd -m -s /bin/bash partyside
```

Установите Node.js из доверенного источника, если `node -v` не показывает
поддерживаемую LTS-версию. Пользователь `partyside` должен иметь SSH-доступ к
GitHub. Публичный ключ добавляется в Deploy keys репозитория; приватный остаётся
на VPS.

От `partyside`:

```bash
ssh-keygen -t ed25519 -C "partyside@vps" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# После добавления публичного ключа в GitHub:
git clone git@github.com:Ra1n-xD/party-play.git ~/party-side
cd ~/party-side
npm ci --include=dev
npm run build
```

Имя существующего репозитория GitHub не изменяется локальным переименованием.
Папка новой установки называется `party-side`. Не заменяйте уже существующий
SSH-ключ приведённой командой.

Создайте файл `/home/partyside/party-side/.env` от root:

```bash
install -o partyside -g partyside -m 600 /dev/null /home/partyside/party-side/.env
cat > /home/partyside/party-side/.env <<'ENV'
PORT=3001
HOST=127.0.0.1
NODE_ENV=production
CORS_ORIGINS=https://partyside.fun
ENV
```

Хранилища по умолчанию — `server/.data/profiles.json` и
`server/.data/project-stats.json`. `PARTYSIDE_PROFILES_FILE` и
`PARTYSIDE_STATS_FILE` задают внешние пути. Не размещайте их в `client/dist`.
Старые `PARTYPLAY_*` имена этих двух настроек остаются совместимыми.

От root создайте сервис:

```bash
cat > /etc/systemd/system/partyside.service <<'UNIT'
[Unit]
Description=PartySide Server
After=network.target

[Service]
Type=simple
User=partyside
WorkingDirectory=/home/partyside/party-side
ExecStart=/usr/bin/node --env-file=.env server/dist/server/src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now partyside
systemctl status partyside --no-pager
curl --fail --silent --show-error http://127.0.0.1:3001/readyz
```

Проверьте фактический путь к Node через `command -v node` и используйте его в
`ExecStart`. Nginx обеспечивает HTTPS/WSS, отдельный сертификат для Node не нужен.
Для nginx и HTTPS выполните шаги 1, 2, 5 и 7 из
[инструкции домена](PARTYSIDE-MIGRATION.md). В новой установке старый домен
и изменение уже правильного CORS пропускаются.

При обновлении с 6.9.x до 6.10.x также примените актуальный
`deploy/nginx/partyside.conf.template` по шагу настройки nginx в инструкции домена:
старый редирект `/profile` → `/collection` удалён, профиль доступен по `/profile`.
Проверьте `nginx -t` перед перезагрузкой конфигурации. Автодеплой приложения
не обновляет конфигурацию nginx.

## Автодеплой GitHub Actions

Workflow `.github/workflows/deploy.yml` запускается при push в `main`. Он
получает `deploy.sh` из **точного коммита workflow**, затем запускает его на VPS.
SSH fingerprint проверяется, параллельные релизы сериализованы; не отключайте
эти проверки.

В Repository → Settings → Secrets and variables → Actions:

| Secret                 | Значение                                             |
| ---------------------- | ---------------------------------------------------- |
| `VPS_HOST`             | IP или hostname VPS                                  |
| `VPS_USER`             | Пользователь деплоя, для новой установки `partyside` |
| `VPS_SSH_KEY`          | Приватный ключ отдельного доступа workflow к VPS     |
| `VPS_HOST_FINGERPRINT` | Проверенный fingerprint SSH host key VPS             |

Для нестандартного пути добавьте Repository variable `VPS_PROJECT_DIR`.
Без неё workflow ищет `~/party-side`, затем старый `~/party-play`.
Публичный ключ workflow добавьте в `authorized_keys` пользователя деплоя;
приватный ключ не размещайте в Git. Пользователь деплоя должен иметь право
перезапускать **только** сервис приложения:

```bash
cat > /etc/sudoers.d/partyside <<'SUDO'
partyside ALL=(root) NOPASSWD: /usr/bin/systemctl restart partyside
SUDO
chmod 440 /etc/sudoers.d/partyside
visudo -cf /etc/sudoers.d/partyside
```

Сервис существующей установки может называться `partyplay`: скрипт обнаруживает
его автоматически, если нет `partyside`. Доступ к перезапуску старого сервиса
и старый Linux-пользователь сохраняются.

## Ручной деплой и безопасность партий

От пользователя деплоя:

```bash
cd ~/party-side
bash deploy.sh
```

Для нестандартной установки используйте `PARTYSIDE_PROJECT_DIR` и
`PARTYSIDE_SERVICE`. Старые `PARTYPLAY_*` переменные скрипта поддерживаются.
Перед обновлением checkout должен быть чистым, а от предыдущей неудачной
публикации не должно оставаться `.deploy-backup.*`.

`/deployz/drain` доступен только loopback и отказывает с HTTP 409, пока сервер
удерживает хотя бы одну комнату/зрителя. Закрытие вкладки может сохранить место
для переподключения: игроки должны выйти через `Esc → Выйти из комнаты`.
При 409 скрипт не тянет код, не собирает и не перезапускает приложение.
Повторите workflow после выхода участников; не обходите gate.

При разрешённом деплое скрипт сохраняет текущие зависимости и dist, выполняет
`git pull --ff-only`, `npm ci`, сборку, повторно проверяет gate и перезапускает
сервис. При ошибке восстанавливается снимок предыдущего релиза. Хранилище игроков
не заменяется. `/readyz` проверяет готовность и доступность профилей.
Параметр `PARTYSIDE_ALLOW_LEGACY_DEPLOY=1` допустим только при первом переходе
с очень старого сервера без `/deployz` после подтверждения отсутствия игроков.

## Проверки и логи

```bash
curl --fail --silent --show-error https://partyside.fun/healthz
curl --fail --silent --show-error https://partyside.fun/readyz
journalctl -u partyside -f
tail -f /var/log/nginx/error.log
nginx -t
```

Проверяйте интерфейс каждой игры после публикации, вход, комнаты, зрителей,
переподключение и мобильную верстку. Клиент сохраняет ресурсы одной прошлой
сборки, включая lazy JS и CSS. `version.json` и HTML должны проверяться заново
(`expires -1`), а хешированные `/assets/` кешируются надолго. Активная партия
автоматически не перезагружается при уведомлении о новой версии.
