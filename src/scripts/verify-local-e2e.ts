import { randomUUID } from 'node:crypto';

type FetchLike = typeof fetch;

type TokenPair = Readonly<{
  accessToken: string;
  user: Readonly<{ id: string }>;
}>;

type Message = Readonly<{
  id: string;
  clientMessageId: string;
  text: string | null;
}>;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} returned an invalid response.`);
  }
  return value as Record<string, unknown>;
}

async function jsonRequest(
  fetcher: FetchLike,
  url: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const response = await fetcher(url, init);
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${url} failed with HTTP ${response.status}.`);
  }
  return object(body, url);
}

function bearer(accessToken: string): Readonly<Record<string, string>> {
  return { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
}

function dataObject(envelope: Record<string, unknown>, label: string): Record<string, unknown> {
  return object(envelope.data, label);
}

function tokenPair(envelope: Record<string, unknown>, label: string): TokenPair {
  const data = dataObject(envelope, label);
  const user = object(data.user, `${label}.user`);
  if (typeof data.accessToken !== 'string' || typeof user.id !== 'string') {
    throw new Error(`${label} did not return an access token and user ID.`);
  }
  return { accessToken: data.accessToken, user: { id: user.id } };
}

async function register(
  fetcher: FetchLike,
  apiUrl: string,
  input: { displayName: string; email: string; password: string },
): Promise<TokenPair> {
  return tokenPair(
    await jsonRequest(fetcher, `${apiUrl}/v1/auth/register`, {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    }),
    'registration',
  );
}

async function waitForCapturedEmail(
  fetcher: FetchLike,
  mailpitUrl: string,
  email: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  do {
    const response = await fetcher(`${mailpitUrl}/api/v1/messages`);
    if (response.ok && JSON.stringify(await response.json()).includes(email)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error(`Mailpit did not capture the password-reset email for ${email}.`);
}

async function main(): Promise<void> {
  const apiUrl = (process.env.LOCAL_E2E_API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
  const mailpitUrl = (process.env.LOCAL_E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025').replace(
    /\/$/,
    '',
  );
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = `Local-E2E-${randomUUID()}!`;
  const firstEmail = `local-e2e-${runId}-a@example.test`;
  const secondEmail = `local-e2e-${runId}-b@example.test`;

  await jsonRequest(fetch, `${apiUrl}/v1/health/ready`);
  const first = await register(fetch, apiUrl, {
    displayName: 'Local E2E Alice',
    email: firstEmail,
    password,
  });
  const second = await register(fetch, apiUrl, {
    displayName: 'Local E2E Bob',
    email: secondEmail,
    password,
  });

  const conversationEnvelope = await jsonRequest(fetch, `${apiUrl}/v1/conversations/direct`, {
    body: JSON.stringify({ otherUserId: second.user.id }),
    headers: bearer(first.accessToken),
    method: 'POST',
  });
  const conversation = dataObject(conversationEnvelope, 'conversation creation');
  if (typeof conversation.id !== 'string') throw new Error('Conversation ID was not returned.');

  const clientMessageId = randomUUID();
  const messageEnvelope = await jsonRequest(
    fetch,
    `${apiUrl}/v1/conversations/${conversation.id}/messages`,
    {
      body: JSON.stringify({ clientMessageId, kind: 'text', text: 'Local E2E private message' }),
      headers: bearer(first.accessToken),
      method: 'POST',
    },
  );
  const message = dataObject(messageEnvelope, 'message send') as Message;
  if (typeof message.id !== 'string' || message.clientMessageId !== clientMessageId) {
    throw new Error('Authoritative message reconciliation failed.');
  }

  const history = await jsonRequest(
    fetch,
    `${apiUrl}/v1/conversations/${conversation.id}/messages?limit=10`,
    { headers: bearer(second.accessToken) },
  );
  if (
    !Array.isArray(history.data) ||
    !history.data.some((item) => object(item, 'message').id === message.id)
  ) {
    throw new Error('The recipient could not retrieve the private message.');
  }

  await jsonRequest(fetch, `${apiUrl}/v1/conversations/${conversation.id}/receipts`, {
    body: JSON.stringify({ messageId: message.id, type: 'seen' }),
    headers: bearer(second.accessToken),
    method: 'POST',
  });
  await jsonRequest(fetch, `${apiUrl}/v1/auth/password/forgot`, {
    body: JSON.stringify({ email: firstEmail }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  await waitForCapturedEmail(fetch, mailpitUrl, firstEmail);

  process.stdout.write(
    `Local E2E passed: readiness, two-user registration, private message, seen receipt, and Mailpit recovery email (${firstEmail}).\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Local E2E verification failed.'}\n`,
  );
  process.exitCode = 1;
});
