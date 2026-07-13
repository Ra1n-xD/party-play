# Wedding Contest Restart Design

## Goal

Allow the host to start another wedding quiz after the current contest finishes without recreating the four-day room or asking guests to join again.

## User experience

- The finished admin screen and final scores view expose a `Начать новый конкурс` action.
- The action opens a confirmation dialog explaining that all scores and answers will be reset.
- After confirmation, the admin returns to preparation for question 01.
- Connected guests automatically move from the finished thank-you screen to the waiting screen.
- Disconnected guests keep their participant identity and can rejoin by the existing name/session flow.

## State transition

The server adds a host-only `wedding:restartContest` command. It is valid only while the room phase is `FINISHED` and performs one persisted mutation:

- phase becomes `PREPARING`;
- question number becomes `0`;
- option style returns to `letters`;
- correct option becomes `null`;
- the chronological answer list becomes empty;
- every participant's correct-answer count becomes `0`;
- every participant's current answer and submission time become `null`.

Participant IDs, names, connection bindings, room creation time, and room expiration time remain unchanged.

## Broadcasting and authorization

The existing host authorization guard protects the new socket event. A successful restart broadcasts the new host state, the waiting guest state to each connected participant, and the unchanged participant list. Guest sockets cannot invoke the transition.

## Error handling

Restart attempts before the contest is finished return a Russian error and do not mutate persisted state. A missing or expired room continues to use the existing room errors.

## Testing

- Domain test: finished room resets contest data while preserving room and participant identity.
- Integration test: host restart broadcasts preparation state; guest invocation is rejected.
- Client test: finished admin UI requires confirmation and dispatches the restart action once.
- Regression: wedding client/server tests, full server tests, build, formatting, and a browser flow covering finish then restart.
