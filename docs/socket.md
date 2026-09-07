# Socket.IO Event Contracts

Socket.IO is a low-latency delivery channel, not the authoritative history. All durable changes can be reconciled through REST.

## Connection

Client supplies a valid short-lived access token in the handshake auth object. The server validates issuer, audience, signature, expiry, subject, session status, token version, and payload size. On success it joins `user:{userId}`. Refreshing credentials causes a controlled reconnect; tokens are never placed in query strings or logs.

Event names are versioned logically through a negotiated contract version. Every client command has an acknowledgement callback shaped as either `{ ok: true, data }` or `{ ok: false, error: { code, message, retryable, requestId } }`.

## Client-to-server commands

| Event                    | Payload                                                              | Durable | Authorization/effect                                         |
| ------------------------ | -------------------------------------------------------------------- | ------: | ------------------------------------------------------------ |
| `conversation:join`      | `{ conversationId }`                                                 |      No | Verify active membership, then join private room             |
| `conversation:leave`     | `{ conversationId }`                                                 |      No | Leave room                                                   |
| `message:send`           | `{ conversationId, clientMessageId, kind, text, replyToMessageId? }` |     Yes | Validate membership; idempotently persist and ack message    |
| `message:deleteMe`       | `{ messageId }`                                                      |     Yes | Hide only for the authenticated user                         |
| `typing:set`             | `{ conversationId, isTyping }`                                       |      No | Verify membership; apply rate/TTL limits                     |
| `receipt:delivered`      | `{ conversationId, messageId }`                                      |     Yes | Monotonically advance own delivered cursor                   |
| `receipt:seen`           | `{ conversationId, messageId }`                                      |     Yes | Monotonically advance own seen cursor/unread state           |
| `message:deleteEveryone` | `{ messageId }`                                                      |     Yes | Sender + time-window + membership policy                     |
| `reaction:set`           | `{ messageId, emoji, active }`                                       |     Yes | Verify membership and supported emoji                        |
| `sync:request`           | `{ cursor? }`                                                        |      No | Return instruction/cursor for bounded durable reconciliation |

REST remains available for durable operations when the socket is unavailable.

## Server-to-client events

| Event                     | Room                               | Payload summary                                                 |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| `message:created`         | conversation + relevant user rooms | Sanitized authoritative message and event cursor                |
| `message:deletedEveryone` | conversation + user rooms          | Message ID, conversation ID, tombstone time, event cursor       |
| `reaction:changed`        | conversation                       | Message/reaction summary and event cursor                       |
| `typing:changed`          | conversation                       | Conversation, user, boolean, server expiry; no message text     |
| `receipt:changed`         | conversation                       | User, delivered/seen message cursor and time                    |
| `conversation:updated`    | user                               | Chat-list summary/unread/activity change                        |
| `presence:changed`        | authorized user rooms              | Privacy-filtered status/last seen                               |
| `session:revoked`         | user/device                        | Session identifier/reason; client clears credentials if current |
| `server:error`            | socket                             | Typed non-command error without internal details                |

## Reliability rules

- `clientMessageId` plus sender has a unique database index; retry returns the original result.
- Ack timeout does not prove failure; client marks uncertain/failed and retries with the same ID.
- Events carry a durable per-user or conversation change cursor where relevant.
- On reconnect/foreground, join rooms again and call REST reconciliation before treating the UI as current.
- Client reducers upsert by authoritative ID/client ID and tolerate duplicates/out-of-order events.
- The server caps payloads, validates every event with Zod, rate limits noisy events, and handles listener exceptions centrally.
- Typing and presence are ephemeral with TTLs and are never reconstructed as chat history.

## Privacy and scaling rules

- No private payload uses global `io.emit`.
- Joining a room never relies on a client claim alone.
- A user room covers multiple devices and delivers chat-list/session events even when a conversation screen is not open.
- Redis adapter coordinates rooms across replicas; presence tracks socket counts so one disconnect does not incorrectly mark all devices offline.
- Logs contain event names, request IDs, latency, and safe identifiers—not tokens or message bodies.
