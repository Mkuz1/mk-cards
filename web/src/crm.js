// Salesforce: connect with OAuth (web server flow with PKCE), then send captured contacts as Leads.
// Each company (or individual) connects its own Salesforce. It may use MK Cards' app (Worker secrets
// SALESFORCE_CLIENT_ID / SALESFORCE_CLIENT_SECRET) or its own External Client App's consumer key and secret.

const API_VERSION = 'v62.0';

/** Only real Salesforce addresses (and, in local tests, the stand-in server) are ever contacted. */
export function salesforceHost(value, env) {
  try {
    const u = new URL(value);
    if (env.SSO_TEST_BASE && u.origin === new URL(env.SSO_TEST_BASE).origin) return u.origin;
    if (u.protocol !== 'https:') return '';
    return /(^|\.)(salesforce\.com|force\.com|cloudforce\.com|salesforce-setup\.com)$/i.test(u.hostname) ? u.origin : '';
  } catch {
    return '';
  }
}

export function salesforceAuthorizeUrl(app, { redirectUri, state, challenge }) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: app.clientId, redirect_uri: redirectUri, scope: 'api refresh_token',
    state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'login consent',
  });
  return `${app.loginUrl}/services/oauth2/authorize?${q}`;
}

async function tokenCall(app, params) {
  const res = await fetch(`${app.loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: app.clientId, client_secret: app.clientSecret, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Salesforce did not accept the request.');
  return data;
}

export const salesforceExchange = (app, { code, redirectUri, verifier }) =>
  tokenCall(app, { grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });

export const salesforceRefresh = (app, refreshToken) => tokenCall(app, { grant_type: 'refresh_token', refresh_token: refreshToken });

export async function salesforceRevoke(app, token) {
  await fetch(`${app.loginUrl}/services/oauth2/revoke`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }),
  }).catch(() => {});
}

/** Who connected, for showing "Connected as …". */
export async function salesforceWho(session) {
  const res = await fetch(`${session.instanceUrl}/services/oauth2/userinfo`, { headers: { authorization: `Bearer ${session.accessToken}` } });
  if (!res.ok) return {};
  const u = await res.json().catch(() => ({}));
  return { userName: u.preferred_username || u.email || '', orgId: u.organization_id || '' };
}

const soql = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/**
 * Sends one contact to Salesforce as a Lead. `call(path, init)` makes an authorised request (refreshing the
 * access token when needed). Returns { id } or { duplicate: true }.
 */
export async function salesforcePushLead(call, contact, { ownerEmail, capturedBy, cardLabel }) {
  const parts = String(contact.name || '').trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : parts[0] || 'Unknown';
  const first = parts.length && parts.join(' ') !== last ? parts.join(' ') : '';
  const sourceText = { scan: 'Scanned business card', badge: 'Scanned event badge', manual: 'Added by hand' }[contact.source] || 'Shared on an MK Cards page';
  const lead = {
    FirstName: first.slice(0, 40) || undefined,
    LastName: last.slice(0, 80),
    Company: (contact.company || 'Not provided').slice(0, 255),
    Title: (contact.title || '').slice(0, 128) || undefined,
    Email: contact.email || undefined,
    Phone: contact.phone || undefined,
    MobilePhone: contact.mobile || undefined,
    Website: contact.website || undefined,
    Street: contact.address || undefined,
    LeadSource: 'MK Cards',
    Description: [contact.note, contact.event && `Event: ${contact.event}`,
      `${sourceText}${cardLabel ? ` (card: ${cardLabel})` : ''}, captured by ${capturedBy} with MK Cards.`].filter(Boolean).join('\n').slice(0, 32000),
  };
  // The lead belongs to the card holder when they are also a Salesforce user.
  if (ownerEmail) {
    const q = await call(`/services/data/${API_VERSION}/query?q=${encodeURIComponent(`SELECT Id FROM User WHERE Email = '${soql(ownerEmail)}' AND IsActive = true LIMIT 1`)}`);
    if (q.ok) {
      const rows = (await q.json()).records || [];
      if (rows[0]) lead.OwnerId = rows[0].Id;
    }
  }
  const send = (body) => call(`/services/data/${API_VERSION}/sobjects/Lead`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  let res = await send(lead);
  let errors = res.ok ? null : await res.json().catch(() => []);
  // Some companies restrict the Lead Source list; send the lead without it rather than not at all.
  if (errors && JSON.stringify(errors).includes('RESTRICTED_PICKLIST')) {
    delete lead.LeadSource;
    res = await send(lead);
    errors = res.ok ? null : await res.json().catch(() => []);
  }
  if (!errors) return { id: (await res.json()).id };
  const problem = (Array.isArray(errors) ? errors[0] : errors) || {};
  if (problem.errorCode === 'DUPLICATES_DETECTED') return { duplicate: true };
  const err = new Error(problem.message || 'Salesforce did not accept the lead.');
  err.status = res.status;
  throw err;
}
