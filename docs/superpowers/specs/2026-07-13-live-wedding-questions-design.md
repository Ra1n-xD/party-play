# Live Wedding Questions Design

## Goal

Add a separate wedding activity at `/questions` for Даниил, Шаша, and projector observers. Даниил and Шаша type their own answers and their guesses about each other; observers see every character appear live across the complete numbered question history.

The activity has no host, admin panel, room codes, question text, scoring, correctness checks, submission step, or answer reveal step. Questions are spoken aloud at the wedding. The application is only a synchronized shared answer surface.

## Relationship to Existing Games

The existing Bunker application and the in-progress `/wedding` guest quiz remain unchanged. The new activity uses its own client files, server domain, persisted snapshot, Socket.IO namespace, event contracts, and route selection.

## Roles and Entry

Opening `/questions` shows three large role buttons:

- `Шаша`
- `Даниил`
- `Наблюдатель`

Selecting Шаша or Даниил stores that role in `sessionStorage` on the current device and opens the participant editor. Selecting Наблюдатель opens the projector view without storing an editing identity. The participant header contains `Выйти` and `Добавить вопрос`. `Выйти` clears the stored role and returns to role selection.

There is no authentication because this is a private event. The server still limits write events to sockets that selected the Шаша or Даниил role. Observer sockets are read-only.

## Question and Answer Model

The server owns one singleton question session. Each question has:

- A monotonically increasing number, beginning with `1`.
- Даниил's own answer.
- Даниил's guess for Шаша's answer.
- Шаша's own answer.
- Шаша's guess for Даниил's answer.
- Creation and last-update timestamps.

Question text is intentionally absent. Either participant can press `Добавить вопрос`; the server appends the next numbered empty question. If no question exists when the first participant joins, the interface offers an empty state with the same add action rather than creating data implicitly.

Questions cannot be deleted, reordered, or edited after creation because they contain no editable metadata. Answers remain editable throughout the event. Each field accepts up to 240 Unicode characters after server-side validation.

## Participant Experience

The participant interface is mobile-first and shows every numbered question in chronological order. On each card, a participant sees and edits only two fields:

- `Мой ответ`
- `Как ответит Даниил` or `Как ответит Шаша`

The other participant's values are omitted from participant payloads and never rendered on their phone. This prevents accidental mobile peeking even though the projector intentionally displays the complete live state.

Input updates local state immediately. The client sends the latest value after a short 80 ms debounce and flushes it on blur. A lightweight status near the field distinguishes `Сохраняем…`, `Сохранено`, and a reconnecting state. While disconnected, editing remains visible locally but add-question is disabled; queued current field values are sent after reconnection.

## Observer Experience

The observer interface is optimized for a 16:9 projector and shows all questions at once in a responsive grid. Each card has two named columns, `Даниил` and `Шаша`. Each column shows:

- The participant's own answer.
- Their guess about the partner.

Values update character by character as the server broadcasts changes. An empty field reads `Ждём ответ`, and a field updated within the last two seconds may show a subtle `Печатает…` indicator without hiding its current contents. The newest question receives a small `Новый вопрос` accent and the page scrolls it into view only when the observer was already near the bottom, so older answers remain readable.

Observers cannot add questions or edit values. Reloading `/questions` returns to role selection; choosing Наблюдатель restores the full server state immediately.

## Data Flow and Socket Protocol

The feature uses a dedicated Socket.IO namespace, `/questions`.

Client events:

- Select an editor role (`daniil` or `shasha`) or observer role.
- Add a question, allowed only for editor roles.
- Update one of the current editor's two answer fields for a specific question.

Server events:

- Editor state containing question numbers and only the selected participant's two fields.
- Observer state containing all four fields for every question.
- Mutation errors in Russian.

Every mutation is validated and applied server-side before broadcast. The update payload identifies a question ID, field (`ownAnswer` or `partnerGuess`), and full replacement value. The server derives whose field is being changed from the socket role, so a client cannot update the partner's answer by forging a participant ID.

## Persistence and Reconnection

The singleton state is stored at `server/.data/questions-session.json`. Each mutation writes a complete snapshot through a temporary file and atomic rename. On server startup, a valid snapshot is restored; malformed snapshots are discarded safely. This session has no automatic expiration because the couple may rehearse or revisit it before the wedding.

Socket disconnects do not change stored data. On reconnect, the client selects its stored participant role again and receives the latest editor state. If multiple devices select the same participant, they receive the same editable fields and last-write-wins behavior; this is acceptable for the private-event simplicity requirement.

## Visual Design

The visual language follows the supplied wedding reference while remaining a separate stylesheet:

- Warm ivory background with faint paper texture and thin abstract line decoration.
- Deep burgundy typography and controls, muted gold labels, and blush surfaces.
- The exact brand title `ДанИИл ♥ Шаша`, matching the supplied reference.
- Elegant serif display headings paired with a readable sans-serif UI font stack.
- Rounded white cards with subtle shadows and burgundy outlines on focus.
- Large touch targets and inputs usable at 320 CSS pixels.
- A spacious projector grid with high-contrast type readable from a distance.

Motion is restrained to short field-update highlights and card entrance transitions, and `prefers-reduced-motion` disables them.

## Error Handling

- Invalid roles, question IDs, fields, and values are rejected without changing state.
- Observers attempting mutations receive a read-only error.
- Persistence failure rolls back the in-memory mutation and reports that the value was not saved.
- A disconnected client retains its current view, displays `Переподключаемся…`, and disables only actions that cannot be safely queued.
- Malformed persisted JSON is logged, removed, and replaced with an empty valid session on the next mutation.

## Testing and Verification

Server tests cover snapshot restore, malformed snapshots, sequential numbering, role-based write authorization, field ownership, live full-value replacement, length validation, and editor payload privacy.

Socket integration tests cover role selection, observer read-only behavior, add-question broadcasting, per-keystroke update broadcasting, reconnect restoration, and separation from the existing `/wedding` namespace.

Client tests cover `/questions` routing, role selection, role persistence and exit, editor labels for both participants, add-question behavior, debounced updates, privacy of editor rendering, observer rendering of all questions and all four fields, empty placeholders, and disconnected states.

Final verification runs all wedding and questions tests, existing server/client regressions, both TypeScript builds, formatting checks, and a visual pass at mobile and 16:9 projector sizes.
