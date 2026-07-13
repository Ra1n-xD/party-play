# Wedding Contest Restart Design

## Goal

Allow the host to start another wedding quiz after announcing the finished results, while keeping the four-day room but requiring every guest to join the new contest again.

## User experience

- The finished admin screen and final scores view expose a `Начать новый конкурс` action.
- The action opens a confirmation dialog explaining that all participants, scores, and answers will be deleted.
- After confirmation, the admin returns to preparation for question 01.
- Connected guests automatically move from the finished thank-you screen to the join screen.
- Every guest must join again and may reuse the same name, receiving a new participant ID.

## State transition

The server adds a host-only `wedding:restartContest` command. It is valid only while the room phase is `FINISHED` and performs one persisted mutation:

- phase becomes `PREPARING`;
- question number becomes `0`;
- option style returns to `letters`;
- correct option becomes `null`;
- the chronological answer list becomes empty;
- the participant list becomes empty.

Room creation time and room expiration time remain unchanged. Previous participant IDs, names, scores, answer selections, and connection bindings are removed.

## Broadcasting and authorization

The existing host authorization guard protects the restart event. On success the socket handler clears every socket-to-participant binding, emits `wedding:contestReset`, and broadcasts the empty participant list plus the new host state. Guest clients clear their saved wedding session and current guest state when they receive the reset event, so the existing join screen appears without destroying the room. Guest sockets cannot invoke the transition.

## Error handling

Restart attempts before the contest is finished return a Russian error and do not mutate persisted state. A missing or expired room continues to use the existing room errors.

## Testing

- Domain test: finished room removes participants and contest data while preserving room expiration.
- Integration test: host restart clears bindings, notifies guests, rejects stale answers, and permits the same name to join with a new ID; guest invocation is rejected.
- Client tests: finished admin UI warns about participant deletion; the reset event clears the saved session and guest state.
- Regression: wedding client/server tests, full server tests, build, formatting, and a browser flow covering finish, result announcement, reset, and rejoin.
