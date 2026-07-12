# Action Card Admin Coverage Design

## Goal

Make every special-condition card in `server/src/data/actions.ts` executable through the existing host admin controls without adding new voting, inventory, voice-chat, or threat-state mechanics.

## Scope

- Keep the catalog at 30 cards and preserve every card ID.
- Change only card titles, descriptions, and `targetRequired` values where the current effect cannot be represented by the admin panel.
- Add a data-level regression test that locks the supported catalog copy and target requirements.
- Do not change Socket.IO events, game phases, voting tally logic, character storage, or the admin UI.

## Considered Approaches

1. **Rewrite unsupported cards to existing admin primitives — selected.** This is the smallest change, keeps the manual-host workflow, and avoids risky voting-engine changes.
2. Add first-class action-card execution to the server. This would preserve the original card text but requires persistent effects, weighted votes, vote cancellation, extra inventory slots, and new threat state.
3. Remove unsupported cards and duplicate the 11 already supported cards. This is safe but reduces deck variety more than necessary.

## Supported Admin Primitives

The rewritten catalog may use only these existing operations:

- shuffle one attribute type among living players;
- swap one attribute type between two living players;
- replace one attribute with a random card;
- delete one attribute;
- reveal one attribute type for all living players;
- remove or replace one revealed bunker card;
- return an eliminated player to the game;
- eliminate a living player.

Social conditions may still identify a target by seating position, age, or prior choice, but the resulting state change must be one of the operations above.

## Catalog Changes

### Normalize partially supported effects

The five `shuffle_*` cards will no longer say that only revealed cards are shuffled. Their exact descriptions will be:

| ID                | Exact description                                                       |
| ----------------- | ----------------------------------------------------------------------- |
| `shuffle_baggage` | Собери все карты багажа у неизгнанных игроков, перемешай и перераздай   |
| `shuffle_bio`     | Собери все карты биологии у неизгнанных игроков, перемешай и перераздай |
| `shuffle_health`  | Собери все карты здоровья у неизгнанных игроков, перемешай и перераздай |
| `shuffle_facts`   | Собери все карты фактов у неизгнанных игроков, перемешай и перераздай   |
| `shuffle_hobby`   | Собери все карты хобби у неизгнанных игроков, перемешай и перераздай    |

`direct_question` will become an immediate reveal for all non-eliminated players, matching `adminForceRevealType`:

> Выбери тип карт — все неизгнанные игроки немедленно раскрывают карту этого типа

### Replace unsupported effects

| ID                 | Exact title          | Exact description                                                               | `targetRequired` | Admin operation     |
| ------------------ | -------------------- | ------------------------------------------------------------------------------- | ---------------: | ------------------- |
| `buddy`            | Верный друг          | Разыграй после изгнания игрока. Верни в игру любого изгнанного игрока           |           `true` | Revive player       |
| `double_vote`      | Второе мнение        | Замени одну свою открытую характеристику на случайную из колоды                 |          `false` | Replace attribute   |
| `discredit`        | Подрыв репутации     | Сбрось открытый дополнительный факт выбранного игрока                           |           `true` | Delete attribute    |
| `protect_left`     | Защити игрока слева  | Если изгнан игрок слева, верни его в игру                                       |          `false` | Revive player       |
| `protect_right`    | Защити игрока справа | Если изгнан игрок справа, верни его в игру                                      |          `false` | Revive player       |
| `protect_youngest` | Защити младшего      | Если изгнан самый младший из игроков с открытым возрастом, верни его в игру     |          `false` | Revive player       |
| `protect_brave`    | Защити смелого       | До голосования выбери игрока. Если он изгнан, верни его в игру                  |           `true` | Revive player       |
| `protect_oldest`   | Защити старшего      | Если изгнан самый старший из игроков с открытым возрастом, верни его в игру     |          `false` | Revive player       |
| `kompromat`        | Компромат            | Замени открытую профессию выбранного игрока на случайную из колоды              |           `true` | Replace attribute   |
| `steal_baggage`    | Мне нужнее           | Поменяйся открытой картой багажа с выбранным игроком                            |           `true` | Swap attribute      |
| `silence`          | Запретная тема       | Выбери тип карт — все неизгнанные игроки немедленно раскрывают карту этого типа |          `false` | Force reveal type   |
| `plan_b`           | Запасной план        | Замени любую открытую карту бункера на случайную из колоды                      |          `false` | Replace bunker card |
| `secret_threat`    | Тайная диверсия      | Разыграй карту, только если ты изгнан. Сбрось любую открытую карту бункера      |          `false` | Remove bunker card  |

## Testing

Create `server/tests/actionCards.test.ts` using Node's built-in test runner through the existing `tsx` dependency. The test will assert:

- the catalog still contains exactly 30 unique IDs;
- each changed card has the exact approved title, description, and `targetRequired` value;
- unsupported voting phrases such as doubled votes, cancelled votes, forced self-votes, and revoting no longer appear;
- partial-effect wording no longer limits shuffle operations to revealed cards;
- the source catalog remains importable without starting the server.

Run the targeted test with:

```bash
node --import tsx --test server/tests/actionCards.test.ts
```

Then run the server and client builds plus Prettier only on files changed by this task. The repository-wide formatting check is not a completion gate because `main` already fails it in seven unrelated files.

## Success Criteria

- All 30 action-card IDs are present exactly once.
- None of the cards requires weighted/cancelled votes, self-voting, vote resets, multiple baggage/action cards, speech enforcement, or a second threat slot.
- Every state-changing description maps directly to a current admin control.
- Targeted tests and both workspace builds pass.
