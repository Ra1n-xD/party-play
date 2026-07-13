# Wedding Quiz Design

## Goal

Add a wedding quiz to PartyPlay for **ДанИИл и Шаша**. Guests use `/wedding` on their phones to submit one of four answers. The host uses `/admin` on a phone to configure questions, watch answers arrive in chronological order, manage cumulative scores, and safely move the contest between questions.

Questions and answer text are not stored or displayed by the application because they are shown on the venue projector.

## Scope

- A single wedding room exists at a time; there are no room codes.
- The room lasts 96 hours from creation.
- Guests join and reconnect by selecting their name.
- The host controls the singleton room from `/admin`.
- Answers can use either `А Б В Г` or `1 2 3 4` for each question.
- A submitted answer is final for that question.
- Guests never learn whether their answer was correct in the application.
- The host sees every answer, the submission order, the selected option, and every participant's cumulative correct-answer count.
- The first correct answer for the current question is highlighted in green for the host.
- Correct answers automatically increment a participant's cumulative score.
- The host can manually increment or decrement any participant's score; the score cannot become negative.
- The host can end the contest and see the final standings.

The existing Bunker routes, room manager, game flow, visual theme, and Socket.IO protocol remain unchanged.

## Routes and Entry Points

The client selects the application before mounting a context provider:

- `/wedding` mounts the guest wedding application.
- `/admin` mounts the wedding host application.
- Every other path mounts the existing Bunker application and `GameProvider`.

No routing dependency is required. The path switch uses `window.location.pathname`, matching the project's current lightweight client architecture.

The wedding client uses a dedicated Socket.IO namespace, `/wedding`, so its events and connection lifecycle cannot interfere with Bunker sockets.

## Room Lifecycle and Persistence

The host creates the singleton room from `/admin` if no active room exists. Creation records `createdAt` and `expiresAt = createdAt + 96 hours`.

The server stores a JSON snapshot at `server/.data/wedding-room.json` after every room mutation. Writes use a temporary file followed by an atomic rename. On startup, the server restores the snapshot when it is valid and unexpired. An expired snapshot is discarded and the application returns to the no-room state.

This persistence covers guest and host disconnects, tab closures, Socket.IO reconnections, and ordinary server restarts on the same deployment machine. It does not introduce a database or support multiple concurrent wedding rooms.

## Domain Model

The wedding room contains:

- `createdAt` and `expiresAt` timestamps.
- `phase`: `PREPARING`, `OPEN`, or `FINISHED`.
- `questionNumber`, starting at `0` before the first question.
- Draft `optionStyle`: `letters` or `numbers`.
- Draft `correctOption`: an index from `0` through `3`.
- The current question's chronological answer list.
- A map of participants.

Each participant contains:

- A generated stable ID.
- A display name.
- A normalized lowercase name used for uniqueness and reconnection.
- Connected/disconnected state.
- Cumulative `correctAnswers` count.
- Their answer index and submission timestamp for the current question, when present.

An answer contains the participant ID, selected option index, server timestamp, and chronological sequence number. Correctness is computed server-side and is never included in guest state.

## Question State Machine

### Preparing

The room begins in `PREPARING`. Guests see a waiting screen with disabled placeholder options. The host can choose the option style and correct option without exposing either to guests.

The host presses `Начать вопрос` and confirms the modal. The server validates the draft, increments `questionNumber`, clears current answers, and changes the phase to `OPEN`. Only then do all connected guests receive four active answer buttons.

### Open

Each participant may submit exactly one option index from `0` through `3`. The server records the answer timestamp and sequence atomically. Duplicate submissions, stale submissions, and submissions outside `OPEN` are rejected without changing state.

If the answer matches `correctOption`, the server increments the participant's cumulative score. The earliest matching answer is marked as the first correct answer in host state. Guest state only reports that the answer was accepted.

The host sees connected and answered counts plus the chronological answer feed. There is no percentage progress bar.

### Next Question

The host presses `Следующий вопрос` and confirms the modal. The server changes the phase to `PREPARING` but retains the just-finished answer feed until the next question starts. Guests immediately return to the waiting screen and cannot pre-submit an answer.

The host selects the next option style and correct option, then explicitly presses and confirms `Начать вопрос`. Starting the question clears the previous feed and opens the next answer window.

### Finished

The `Закончить конкурс` action is available from both host tabs and requires confirmation. It changes the phase to `FINISHED`. Guests see a neutral thank-you screen; the host sees final standings and retains score-edit controls in case a correction is required.

## Guest Experience at `/wedding`

The guest landing screen offers two paths:

- Select an existing participant name to reconnect.
- Choose `Я здесь впервые` and enter a unique new name.

Names are trimmed, sanitized, limited to the same 20-character maximum used by Bunker, and compared case-insensitively. Creating a duplicate normalized name is rejected; selecting the existing name reconnects to that seat.

The selected participant ID and display name are stored in `sessionStorage` for automatic reconnection on the same device. If that state is absent or invalid, the name picker remains the fallback. Selecting an existing name intentionally restores that participant without a password, matching the private-event requirements.

During `PREPARING`, the guest sees the waiting state and no active options. During `OPEN`, four large mobile buttons display either `А Б В Г` or `1 2 3 4`. After one tap, every option is disabled and a neutral `Ответ принят` confirmation is shown. Correctness, scores, answer order, and the correct option are never sent in guest state.

During `FINISHED`, the guest sees a wedding-themed completion message without standings.

## Host Experience at `/admin`

The host application has two persistent tabs:

- `Текущий вопрос`
- `Счёт участников`

The current-question tab shows the room's remaining lifetime, connected and answered counts, the current phase, draft controls during preparation, and the chronological answer feed while a question is open or has just closed.

Each feed row shows sequence number, participant name, selected option, server timestamp, and current cumulative correct-answer count. The first correct row is green and labeled `первый верный`.

The score tab sorts participants by correct-answer count descending, then name. Each row has `−` and `+` controls. Manual score changes are immediately persisted and broadcast. They do not require a modal because they are directly reversible; decrement is disabled at zero.

Phase-changing actions require accessible confirmation dialogs:

- `Следующий вопрос`
- `Начать вопрос`
- `Закончить конкурс`

Closing a dialog or choosing `Отмена` leaves server state unchanged. Buttons are disabled while their Socket.IO request is pending to prevent duplicate actions.

The `/admin` route itself is the host boundary for this private event. Any connected `/admin` client receives host state and can resume control after a disconnect; no separate host password or account system is introduced.

## Reconnection and Presence

Socket disconnects only mark a participant offline. They do not delete the participant, answer, or score. Reconnecting through `sessionStorage` or selecting the same name rebinds the current socket and restores the correct screen for the room phase.

If the same participant reconnects from another socket, the newest connection becomes authoritative and the older connection is disconnected from the wedding namespace. This prevents two phones from answering for the same seat.

Host state is restored whenever `/admin` reconnects. Because the room is server-authoritative and persisted, no phase or score data depends on the host phone remaining connected.

## Socket Protocol and Privacy

The namespace defines separate typed client and server event maps in `shared/types.ts`.

Client actions cover room creation, participant listing, new join, name-based rejoin, answer submission, draft updates, question start, transition to preparation, score adjustment, and contest completion.

Server events provide errors, guest state, host state, participant acceptance, and room expiration. Guest and host state use separate TypeScript interfaces. The guest interface omits `correctOption`, answer correctness, other participants' answers, and scores by construction.

All mutations are validated on the server. The server rejects malformed names, option indices outside `0..3`, score deltas other than `-1` or `1`, duplicate answers, and phase-incompatible commands. Only sockets connected through the host role may invoke host mutations.

## Visual Design

Wedding screens use a dedicated stylesheet and do not inherit the Bunker visual language beyond the global reset. The approved style uses:

- Exact title spelling: `ДанИИл и Шаша`.
- Ivory backgrounds, burgundy primary controls, gold accents, and soft rose surfaces.
- A visible heart motif on guest and host screens.
- Large two-by-two answer buttons designed for phones.
- A mobile-first single-column host layout.
- Green only for the first correct answer and positive status cues.
- Red-tinted destructive controls paired with confirmation dialogs.

The UI remains usable down to 320 CSS pixels, preserves native focus visibility, labels dialog controls, and does not rely on color alone for correctness labels.

## Error Handling

- Guests receive Russian error text for invalid names, duplicate first-time joins, expired rooms, invalid reconnection seats, and rejected answers.
- Host actions show Russian errors when room state changed before an action arrived.
- A disconnected client keeps the current screen with a reconnecting indicator and disables mutation controls.
- Persistence failures are logged and returned to the initiating host action when safe continuation is impossible; in-memory state is not falsely reported as durable.
- Expiration broadcasts a terminal room-expired state before clients return to their respective landing screens.

## Testing and Verification

Server tests use Node's built-in test runner and Socket.IO clients, matching the existing repository tests. They cover singleton creation, 96-hour restore/expiration, guest join/rejoin by name, newest-socket ownership, phase transitions, one-answer enforcement, chronological ordering, first-correct detection, automatic scoring, manual score correction, privacy of guest state, and contest completion.

Client tests use `react-test-renderer` and Node's test runner. They cover route selection, guest waiting/open/answered states, letter and number labels, hidden correctness, host tabs, draft/start flow, chronological feed rendering, score controls, and confirmation dialogs.

Final verification runs all existing server and client tests, the new wedding tests, both TypeScript builds, and Prettier's formatting check.
