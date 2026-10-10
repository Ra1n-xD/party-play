# Переход на partyside.ru

Версия 6.18.1 готовит сайт к `https://partyside.ru`. Перенос на окончательный
сервер запланирован после **30 октября 2026 года**. До переноса подготовка
остаётся локальной: действующий сервер, DNS, VPN и пользовательские данные
не меняются. Сборка содержит canonical `.ru`; публикуйте её при переключении
сайта. Push в `main` запускает автодеплой, поэтому публикацию этого релиза
нужно согласовать с переносом и настройками GitHub Actions.

## План переноса после 30 октября 2026 года

1. Проверить старый и окончательный VPS: версию приложения, systemd-сервис,
   рабочую папку, реальные пути профилей и статистики, владельца файлов,
   nginx, сертификаты, SSH-доступ и занятые порты. Зафиксировать работу VPN,
   его HTTPS-ссылок и реального клиентского подключения до изменений.
2. На окончательном VPS сохранить конфигурацию VPN и обслуживающего его HTTPS.
   Если nginx уже обслуживает VPN, добавить отдельный vhost `partyside.ru`
   с отдельным сертификатом. Сохранить существующие `server_name`, пути ссылок,
   клиентские ключи и порты. Если 443 слушает Xray или другой сервис, сначала
   определить совместимую схему маршрутизации; шаблон ниже нельзя включать
   поверх занятого порта. Не заменять глобальный nginx-конфиг или правила VPN.
3. Подготовить зависимости, код и сборку по [DEPLOY.md](DEPLOY.md).
   До восстановления рабочих данных сервис не запускать. На время переноса
   приостановить workflow деплоя и исключить параллельную публикацию релизов.
4. Подготовить DNS, временный vhost и сертификат по шагам 1 и 5 ниже; установку
   полного nginx-шаблона из шага 5 отложить до пункта 6 этого плана.
   До окончательного запуска vhost отдаёт 503, сохраняя доступ к ACME challenge. Результат проверки
   HTTPS и доступности нового IP из нужных сетей должен предшествовать редиректу
   старого сайта. Старый адрес приложения и адреса VPN пока не переключать.
5. В окно обслуживания завершить партии и остановить старый сервис приложения.
   После штатной остановки сделать окончательную защищённую копию `.env`,
   `server/.data/` и внешних хранилищ. Передать её по SSH на окончательный VPS,
   исключив `*.lock`; проверить контрольные суммы, владельца и права.
   Не запускать два независимых рабочих сервера с копиями одного хранилища.
6. На новом VPS сохранить настройки перенесённого `.env`, добавить
   `https://partyside.ru` в `CORS_ORIGINS` по шагу 3 и проверить пути данных.
   Запустить сервис с восстановленными файлами, проверить `/readyz`, затем
   включить рабочий vhost. Проверить вход прежним аккаунтом, коллекцию,
   питомца, дуэли, обычные комнаты, зрителей, ботов и переподключение.
   Повторно проверить HTTPS-ссылки и клиентское подключение VPN.
7. После проверок включить постоянный редирект старого сайта по шагу 6.
   Старый Node-процесс оставить выключенным и исключить его автозапуск.
   Сохранить старый домен, сертификат и редиректы минимум год. Старый VPS
   держать для отката; отключать его после переноса старого vhost/сертификата
   на окончательный сервер, обновления DNS и прекращения трафика на старый IP.
8. В GitHub Actions обновить `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`,
   `VPS_HOST_FINGERPRINT` и при необходимости `VPS_PROJECT_DIR`. Fingerprint
   сверить через доверенную консоль провайдера. Возобновить автодеплой после
   проверки нового сервера; выполнить отправку sitemap и переезд в поисковиках
   по шагу 7. При откате после новых игровых операций сначала сохранить
   актуальные данные нового VPS: старую копию поверх них не восстанавливать.

Шаги ниже описывают настройки домена для выбранной установки. При новом VPS
переменные `partyside_project_dir`, `partyside_app_user` и `partyside_service`
должны указывать на новую установку; резервная копия старого сервера остаётся
отдельно. Шаг 4 для обновления уже работающего приложения пропускается при
первой установке на новом VPS.

## 1. DNS и порты

У регистратора создайте `A` для `@` → IP **сервера приложения** и `CNAME` для
`www` → `partyside.ru`. `AAAA` добавляйте только для работающего IPv6 этого
сервера. Если переезжаете на другой IP, сначала проверьте доступ к нему из нужных
сетей и перенесите приложение с файлами профилей и статистики.

На VPS с Ubuntu/Debian от root, после распространения DNS:

```bash
dig +short A partyside.ru
dig +short A www.partyside.ru
ss -tlnp '( sport = :80 or sport = :443 )'
```

Оба имени должны вести на этот VPS. Порт 443 должен обслуживать nginx.
Если 443 занят Xray/другим приложением, сначала решите размещение HTTPS;
команды ниже не перенастраивают VPN. Проверьте доступ к 80/443 в firewall VPS
и панели провайдера. При активном UFW: `ufw allow 80/tcp` и `ufw allow 443/tcp`.

## 2. Найти существующую установку и сделать резервную копию

Не переименовывайте Linux-пользователя и папку работающего проекта ради бренда:
это не влияет на SEO. Скрипт деплоя поддерживает `partyside` и старый `partyplay`.
Команды в одной root-сессии:

```bash
set -eu
partyside_service=partyside
if [ "$(systemctl show partyside --property=LoadState --value)" != loaded ]; then
  partyside_service=partyplay
fi
partyside_project_dir=$(systemctl show "$partyside_service" --property=WorkingDirectory --value)
partyside_app_user=$(systemctl show "$partyside_service" --property=User --value)
partyside_app_user=${partyside_app_user:-root}
test -n "$partyside_project_dir"
test -d "$partyside_project_dir/.git"
test -f "$partyside_project_dir/.env"
partyside_backup_dir="/root/partyside-backup-$(date +%Y%m%d-%H%M%S)"
install -d -m 700 "$partyside_backup_dir"
cp -a /etc/nginx "$partyside_backup_dir/nginx"
cp -a "$partyside_project_dir/.env" "$partyside_backup_dir/app.env"
if [ -d "$partyside_project_dir/server/.data" ]; then
  cp -a "$partyside_project_dir/server/.data" "$partyside_backup_dir/data"
fi
systemctl cat "$partyside_service" > "$partyside_backup_dir/service.txt"
```

Если используются `PARTYSIDE_PROFILES_FILE` / `PARTYPLAY_PROFILES_FILE` или
`PARTYSIDE_STATS_FILE` / `PARTYPLAY_STATS_FILE` с внешними путями, дополнительно
скопируйте **именно эти файлы** в защищённую резервную папку. Их пути и значения
остальных переменных при переходе не меняются. Не запускайте второй Node-процесс
с тем же хранилищем.

Релиз публикуется обычным процессом только в согласованное окно переноса.
Push в `main` запускает автодеплой: до публикации проверьте, на какой VPS указывают
secrets workflow. Текущий `/deployz/drain` останавливает существующие комнаты;
он не ждёт завершения партий. На старых версиях возможен HTTP 409 при наличии
комнат. Не обходите gate; перед переносом завершите партии и остановите сервис
штатно, затем снимите окончательную копию данных.

## 3. Разрешить новый origin, сохранив старые настройки

Команда добавляет только `https://partyside.ru` к `CORS_ORIGINS`, не меняя
пользователя, пути, порт или остальные переменные. Запись атомарная, права и
владелец `.env` сохраняются. Секреты не выводятся.

```bash
python3 - "$partyside_project_dir/.env" <<'PY'
import os, re, stat, sys, tempfile
from pathlib import Path
p = Path(sys.argv[1])
source = p.read_text()
pattern = re.compile(r'^CORS_ORIGINS=(.*)$', re.M)
matches = list(pattern.finditer(source))
if len(matches) != 1:
    raise SystemExit('Expected exactly one CORS_ORIGINS; edit this setting manually')
origins = matches[0].group(1).strip().strip('\"\'')
values = [value.strip() for value in origins.split(',') if value.strip()]
if 'https://partyside.ru' not in values:
    values.append('https://partyside.ru')
updated = pattern.sub(lambda _: 'CORS_ORIGINS=' + ','.join(values), source)
metadata = p.stat()
fd, name = tempfile.mkstemp(prefix='.partyside-env-', dir=p.parent)
try:
    with os.fdopen(fd, 'w') as file:
        file.write(updated)
        file.flush()
        os.fsync(file.fileno())
    os.chmod(name, stat.S_IMODE(metadata.st_mode))
    os.chown(name, metadata.st_uid, metadata.st_gid)
    os.replace(name, p)
finally:
    if os.path.exists(name): os.unlink(name)
PY
```

Не удаляйте пока старый origin: существующие вкладки должны доиграть партии.
Для существующей установки перезапуск выполняется в окно обслуживания через
обычный деплой. Для нового VPS origin добавляется до первого запуска сервиса.

## 4. Обновить приложение обычным безопасным деплоем

Запускайте от пользователя, который обычно выполняет деплой и имеет доступ к
GitHub и право `sudo systemctl restart` существующего сервиса. Он может отличаться
от пользователя systemd. В его shell подставьте найденные выше путь и имя:

```bash
export PARTYSIDE_PROJECT_DIR=/ФАКТИЧЕСКИЙ/ПУТЬ/К/ПРОЕКТУ
export PARTYSIDE_SERVICE=partyplay # либо partyside, по результату шага 2
cd "$PARTYSIDE_PROJECT_DIR"
git fetch --quiet origin main
partyside_target=$(git rev-parse origin/main)
partyside_deploy_script=$(mktemp)
git show "$partyside_target:deploy.sh" > "$partyside_deploy_script"
PARTYSIDE_TARGET_COMMIT="$partyside_target" bash "$partyside_deploy_script"
rm -f "$partyside_deploy_script"
```

Для GitHub Actions при нестандартном пути задайте Repository variable
`VPS_PROJECT_DIR`. Старые `~/party-play` и `partyplay.service` работают без
переименования. Для новой установки используются `~/party-side` и
`partyside.service`. Старые `PARTYPLAY_*` переменные деплоя и хранилищ также
поддерживаются; новые `PARTYSIDE_*` имеют приоритет.

После успешного деплоя вернитесь в root-сессию из шага 2:

```bash
test -f "$partyside_project_dir/client/dist/games/bunker.html"
test -f "$partyside_project_dir/client/dist/sitemap.xml"
curl --fail --silent --show-error http://127.0.0.1:3001/readyz
```

## 5. Получить HTTPS для нового домена

Добавляется отдельный vhost. Старый конфиг остаётся на месте.
Убедитесь, что файл `partyside` и оба `server_name` ещё не заняты другой
конфигурацией. Если vhost уже есть, адаптируйте его вместо создания дубликата.

```bash
test ! -e /etc/nginx/sites-available/partyside
test ! -e /etc/nginx/sites-enabled/partyside
partyside_nginx_dump=$(nginx -T 2>/dev/null)
if printf '%s\n' "$partyside_nginx_dump" | grep -Eq 'server_name.*partyside\.ru'; then
  echo 'partyside.ru already has a vhost; adapt it instead of creating a duplicate' >&2
  exit 1
fi
unset partyside_nginx_dump
apt update
apt install -y certbot
install -d -m 755 /var/www/letsencrypt
cat > /etc/nginx/sites-available/partyside <<'NGINX'
server {
    listen 80;
    listen [::]:80;
    server_name partyside.ru www.partyside.ru;
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        try_files $uri =404;
    }
    location / { return 503; }
}
NGINX
ln -s /etc/nginx/sites-available/partyside /etc/nginx/sites-enabled/partyside
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/www/letsencrypt -d partyside.ru -d www.partyside.ru
```

В шаблоне приложения предполагается Node на `127.0.0.1:3001`. Если действующий
сервис слушает другой порт, используйте его во всех `proxy_pass`.
Путь к статикам берётся из существующей установки, а не из примера:

```bash
python3 - "$partyside_project_dir" <<'PY'
import sys
from pathlib import Path
project = Path(sys.argv[1])
dist = project / 'client/dist'
if any(c.isspace() or c in ';{}\"\'\\$' for c in str(dist)):
    raise SystemExit('Quote and configure this unusual nginx path manually')
template = (project / 'deploy/nginx/partyside.conf.template').read_text()
Path('/etc/nginx/sites-available/partyside').write_text(template.replace('__CLIENT_DIST__', str(dist)))
PY
nginx -t
systemctl reload nginx
certbot renew --dry-run
```

Шаблон обслуживает готовые HTML-страницы вместо общего SPA fallback, отдаёт
настоящий HTTP 404 для неизвестных адресов, сохраняет WebSocket-прокси и заголовки
безопасности, включает gzip и кеширование хешированных ресурсов. HTTP и `www`
перенаправляются на `https://partyside.ru`.

Если статика находится под `/root`, проверьте доступ nginx к каталогам через
`namei -l "$partyside_project_dir/client/dist/index.html"`. Не открывайте весь
`/root` или `.data`; используйте отдельный каталог статики/точечные ACL и укажите
его в `root` шаблона, согласовав обновление статики с деплоем.

## 6. Старый домен — постоянный редирект

После проверки нового домена в действующем **vhost старого сайта** замените
обслуживание приложения на редирект, сохранив его `listen`, `server_name` и
сертификат. ACME-location старого сертификата остаётся доступным. Пример для
обычной конфигурации со статикой и webroot challenge:

```nginx
location ^~ /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
    try_files $uri =404;
}
location / {
    return 301 https://partyside.ru$request_uri;
}
```

Удалите из **этого старого vhost** более специфичные location приложения,
которые перехватывают запросы до редиректа. Не трогайте конфиги других сайтов
или VPN. Для старого HTTPS нужен действующий сертификат: TLS происходит до 301.
Если старый URL содержал `:8444`, сохраните редирект и на этом старом порту.

```bash
nginx -t
systemctl reload nginx
```

Сохраняйте старый домен и редиректы минимум год. Браузер не переносит
`localStorage` между доменами: на `partyside.ru` потребуется снова войти
существующим никнеймом и паролем. Аккаунты, монеты и коллекции хранятся на сервере
и сохраняются. Гостевые токены комнаты не передаются через URL; активные партии
нужно закончить до смены домена.

## 7. Проверка и отправка в поиск

```bash
curl -I http://partyside.ru/games/uno
curl -I https://www.partyside.ru/games/uno
curl --fail --silent --show-error https://partyside.ru/readyz
curl --fail --silent --show-error https://partyside.ru/robots.txt
curl --fail --silent --show-error https://partyside.ru/sitemap.xml
curl -I https://partyside.ru/games/bunker
curl -I https://partyside.ru/this-page-does-not-exist
curl --silent --show-error https://partyside.ru/games/durak | head -45
```

Ожидается: 301 для HTTP/www, 200 для готовности и публичных страниц, 404 для
неизвестного адреса. В исходном HTML — текст правил, уникальный title,
description и canonical `https://partyside.ru/games/durak`.
Проверьте старый URL с реальным hostname: 301 на тот же путь нового сайта.
В браузере проверьте вход старым аккаунтом, создание/подключение к комнате,
зрителя, ботов, переподключение и повтор партии.

Добавьте домен в [Google Search Console](https://search.google.com/search-console)
и [Яндекс Вебмастер](https://webmaster.yandex.ru/), подтвердите владение через DNS
и отправьте `https://partyside.ru/sitemap.xml`. Проверьте главную и три страницы
игр через инструменты проверки URL. В Search Console для подтверждённых старого
и нового сайтов используйте «Изменение адреса», если старый сайт поддерживает
такой переезд. В Яндексе используйте инструмент переезда сайта.

Индексация и позиции не гарантируются настройками: поисковикам нужны доступный
домен, время и полезный контент. Техническая подготовка следует рекомендациям
[Google для JavaScript-сайтов](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
и [переезда с изменением URL](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes).

## Откат конфигурации

Резервная копия находится в `$partyside_backup_dir` из шага 2. Для возврата
старого домена восстановите **только изменённые vhost-файлы** из её `nginx/`,
уберите новый symlink `/etc/nginx/sites-enabled/partyside`, проверьте `nginx -t`
и выполните `systemctl reload nginx`. Восстановление `.env` из `app.env` вернёт
прежний CORS; применяйте его перезапуском только в окно без комнат.
Не восстанавливайте старый файл профилей поверх новых игровых наград без
отдельного решения: переименование не меняет формат данных и не требует этого.
