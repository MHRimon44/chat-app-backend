type FetchLike = typeof fetch;

async function jsonRequest(fetcher: FetchLike, url: string): Promise<unknown> {
  const response = await fetcher(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) ${url}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main(): Promise<void> {
  const apiUrl = (process.env.LOCAL_E2E_API_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
  await jsonRequest(fetch, `${apiUrl}/v1/health/ready`);
  process.stdout.write(
    'Local API readiness passed. Direct registration requires no email when REGISTRATION_OTP_ENABLED=false. Email-enabled registration and password recovery require a real inbox. This script checks readiness only.\n',
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
