# Messaging and realtime implementation

Milestone 7 provides durable text messaging over REST and Socket.IO. MongoDB remains authoritative; Socket.IO is a low-latency delivery channel and Redis coordinates rooms across API replicas.

## Durable behavior

- Sender plus `clientMessageId` is unique. Retrying returns the original message and conflicting reuse returns `409`.
- History uses descending `createdAt` plus `_id` cursors and filters actor-specific deletions.
- Reply targets must belong to the same conversation.
- Delete-for-everyone requires membership, sender ownership, and the 15-minute policy window.
- Delete-for-me creates an idempotent per-user state without mutating shared content.
- Reactions are idempotent per message, user, and supported emoji.
- History includes bounded aggregate reaction summaries and the current actor's reaction state, loaded in one batch per page.
- Every shared mutation appends a transactional outbox/change event. `GET /v1/conversations/:id/changes` provides bounded forward reconciliation.
- Message send limits start at 30 per 10 seconds and 300 per 10 minutes per user.

## Realtime behavior

- Access tokens are supplied only in handshake auth and require an active session.
- Each socket joins its private user room and authorized conversation rooms.
- New-conversation delivery also targets participant user rooms.
- Commands use typed acknowledgements and failures do not expose internals.
- No private event uses global broadcast.
- The Redis adapter supports multiple API replicas.

Implemented commands include `message:send`, `message:deleteMe`, `message:deleteEveryone`, and `reaction:set`. Implemented events include `message:created`, `message:deletedEveryone`, and `reaction:changed`.

## Verification boundary

Automated tests cover REST validation and a real in-process Socket.IO handshake, acknowledgement, and authoritative event. Docker is unavailable here, so MongoDB transaction races, cross-replica Redis delivery, and outbox query plans remain manual checks.
