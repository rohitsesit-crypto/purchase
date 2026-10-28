import { NextResponse } from 'next/server';

/**
 * Server-side bridge to the Google Apps Script Web App.
 *
 * The deployment URL lives in a private environment variable, so it is never
 * shipped to the browser: the client only knows this route. Apps Script also
 * rejects a JSON preflight, which is why the body is forwarded as plain text.
 *
 * No route-segment config (`runtime`, `dynamic`) is declared here on purpose:
 * this project may run with `cacheComponents` enabled, where those exports are
 * rejected at build time. A POST handler that reads `request` is never cached.
 */
const ENDPOINT = process.env.APPS_SCRIPT_URL ?? '';

/**
 * Reports whether this deployment is wired to a Google Sheet.
 *
 * Without this the app silently serves the local demo store, which looks exactly
 * like real data — the quickest way to misread sample records as your own.
 */
export async function GET() {
  return NextResponse.json({ connected: Boolean(ENDPOINT) });
}

export async function POST(request: Request) {
  // No deployment configured: tell the client to use its built-in demo store.
  if (!ENDPOINT) return NextResponse.json({ demo: true });

  let body: { action?: string; payload?: unknown; email?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Malformed request body.' }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: String(body.action ?? ''),
        payload: body.payload ?? {},
        // Identity is the email address; no token exists in this app.
        email: String(body.email ?? ''),
      }),
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Could not reach the Apps Script endpoint. Check your network.' },
      { status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, error: `The Apps Script endpoint responded with ${response.status}.` },
      { status: 502 },
    );
  }

  const raw = await response.text();
  try {
    return NextResponse.json(JSON.parse(raw));
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          'The Apps Script endpoint did not return JSON. Redeploy it with "Who has access: Anyone" and use the /exec URL.',
      },
      { status: 502 },
    );
  }
}
