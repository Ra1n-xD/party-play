# Прямые ссылки на действующем домене

Эта правка исправляет маршрутизацию `https://partyplay.duckdns.org/` отдельно
от переезда на `partyside.ru`. Правка применена на действующем сервере
10 октября 2026 года с разрешения владельца. Повторное применение на другом
сервере требует проверки его vhost и отдельного разрешения.

При проверке действующий сервер отдавал один и тот же `index.html` для `/`,
`/games/durak`, `/updates`, `/login` и неизвестных адресов. В этом HTML записан
`data-app-path="/"`, поэтому после перезагрузки приложение показывает каталог.
Неизвестные страницы при этом получают HTTP 200. Переходы внутри приложения
работают, потому что клиент меняет маршрут сам.

Сборка уже создаёт `games/durak.html`, `updates.html`, `login.html` и остальные
страницы через общий `AppRoot`. Исправление — отдавать соответствующий HTML
и возвращать HTTP 404, если файла нет. Код React и механизм гидратации менять
для этого не требуется.

## Что применяется

Фрагмент [deploy/nginx/pages.conf](../deploy/nginx/pages.conf) подключается
в существующий HTTPS-vhost приложения. Он заменяет общий SPA fallback,
сохраняет выдачу статических файлов и использует `404.html` как тело ответа
для неизвестных страниц, сохраняя статус 404.

Существующие `server_name`, `listen`, `ssl_certificate`, `root`, заголовки,
настройки `/socket.io/`, `/healthz`, `/readyz`, `/deployz`, `/assets/` и ACME
нужно сохранить. Отдельные правила страниц или переадресация `/profile`
не должны перехватывать эти маршруты раньше нового `location /`.
Сначала проверить такие правила и убрать только устаревшие правила приложения.
Другие vhost, VPN, `.env`, файлы игроков и systemd-сервис не меняются.

Эта правка не меняет canonical, sitemap и Open Graph: преждевременное
использование `partyside.ru` в SEO остаётся отдельной задачей.
Полный `partyside.conf.template` предназначен для будущего домена и здесь
не применяется.

## Порядок применения после разрешения

1. Проверить конфигурацию через `nginx -T` и найти фактический файл активного
   vhost для `partyplay.duckdns.org`. Если HTTPS приложения обслуживается
   вместе с VPN, проверить конкретные `location` и сохранить их. Не создавать
   второй vhost с тем же именем и не заменять глобальный конфиг nginx.
2. Убедиться, что существующий `root` указывает на нужный `client/dist`,
   а `games/durak.html`, `updates.html`, `login.html` и `404.html` доступны nginx.
   Проверить владельца и доступ через `namei -l`; не открывать весь `/root`.
3. Передать на VPS только проверенный `pages.conf`, например в
   `/tmp/partyside-pages.conf`. Для этой правки не нужен новый деплой Node,
   обновление checkout или перезапуск игрового сервиса.
4. В одной root-сессии сохранить резервную копию фактического vhost и установить
   новый фрагмент. Подставить проверенный путь вместо `ACTUAL_VHOST_PATH`:

   ```bash
   set -eu
   partyside_vhost=ACTUAL_VHOST_PATH
   test -f "$partyside_vhost"
   test -f /tmp/partyside-pages.conf
   test ! -e /etc/nginx/snippets/partyside-pages.conf
   partyside_routing_backup="/root/partyside-routing-$(date +%Y%m%d-%H%M%S)"
   install -d -m 700 "$partyside_routing_backup"
   cp -a "$partyside_vhost" "$partyside_routing_backup/vhost.conf"
   install -d -m 755 /etc/nginx/snippets
   install -m 644 /tmp/partyside-pages.conf /etc/nginx/snippets/partyside-pages.conf
   ```

5. В выбранном HTTPS-vhost заменить существующий `location /` с fallback на
   `/index.html` подключением фрагмента:

   ```nginx
   include /etc/nginx/snippets/partyside-pages.conf;
   ```

   Убрать дублирующиеся `error_page 404` и точные `location` из фрагмента,
   если они уже есть в этом vhost. Сохранить корень статики, API-прокси,
   WebSocket-прокси и остальные настройки, перечисленные выше.

6. Проверить полный конфиг командой `nginx -t`. При любой ошибке не делать reload:
   исправить конфиг или восстановить резервную копию. После успешной проверки
   выполнить `systemctl reload nginx`. Игровой Node-процесс не перезапускается.
7. Проверить исходный HTML, HTTP-статусы, холодную загрузку и перезагрузку
   страниц в браузере. Проверить `/readyz`, получение списка комнат,
   WebSocket-соединение и прежние HTTPS-ссылки VPN, если они есть на этом VPS.

## Проверка результата

```bash
curl --fail --silent --show-error https://partyplay.duckdns.org/games/durak
curl --fail --silent --show-error https://partyplay.duckdns.org/updates
curl --fail --silent --show-error https://partyplay.duckdns.org/login
curl --fail --silent --show-error https://partyplay.duckdns.org/readyz
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  https://partyplay.duckdns.org/this-page-does-not-exist
```

Ожидается: известные страницы отвечают 200 и содержат соответствующий
`data-app-path` (`/games/durak`, `/updates`, `/login`). `/readyz` возвращает
`{"status":"ready"}`. Неизвестный адрес отвечает 404 с `data-app-path="/404"`.
В браузере проверяются также `/duels`, `/pet`, `/collection` и `/profile`,
переходы назад/вперёд и отсутствие ошибок гидратации на компьютере и телефоне.
Сохранённый аккаунт и возврат в комнату проверяются отдельно реальным игроком.

## Откат

В той же root-сессии восстановить только изменённый vhost:

```bash
cp -a "$partyside_routing_backup/vhost.conf" "$partyside_vhost"
nginx -t
systemctl reload nginx
```

Новый фрагмент без `include` не используется. При ошибке `nginx -t` reload
не выполнять. `.env`, данные аккаунтов, домены и VPN откат не затрагивает.

## Применение на действующем сервере

10 октября 2026 года в `/etc/nginx/sites-available/partyplay` заменён только
HTTPS fallback подключением `/etc/nginx/snippets/partyside-pages.conf`.
Резервная копия исходного vhost сохранена в
`/root/partyside-routing-20261010-113003/vhost.conf`. Полный `nginx -t` прошёл,
затем выполнен `systemctl reload nginx`.

Внешняя проверка подтвердила HTTP 200 и правильный `data-app-path` для главной,
`/games/durak`, `/updates`, `/login`, `/duels`, `/pet`, `/collection` и `/profile`.
Неизвестная страница и отсутствующий asset отвечают 404 с исходным HTML страницы
ошибки. JS, CSS, `/healthz` и `/readyz` отвечают 200; WebSocket проходит upgrade
со статусом 101, HTTPS сохраняет проверку сертификата. HTTP-переадресация на HTTPS
осталась прежней.

В браузере проверены холодная загрузка и перезагрузка правил Дурака,
мобильная коллекция и переход из неё на `/login?next=%2Fcollection`,
перезагрузка входа, неизвестный адрес и возврат назад, а также `/?game=durak`.
На ширинах 320 и 390 px горизонтального переполнения в проверенных экранах нет;
ошибок гидратации не зафиксировано. Вход с реальным аккаунтом и восстановление
сохранённой комнаты этой проверкой не подтверждены.

Процессы `partyplay` и `x-ui` сохранили прежние PID и время запуска. Их настройки
и данные не менялись; подключение VPN отдельным клиентом не проверялось.
Версия опубликованного клиента осталась 6.18.2: новый деплой приложения
для этой nginx-правки не выполнялся.

Для отката именно этой установки выполнить в root-сессии:

```bash
set -e
cp -a /root/partyside-routing-20261010-113003/vhost.conf /etc/nginx/sites-available/partyplay
nginx -t
systemctl reload nginx
```
