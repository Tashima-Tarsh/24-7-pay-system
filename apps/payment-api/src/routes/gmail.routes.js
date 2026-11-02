import { HttpServer } from '../server.js';

/**
 * Gmail Universal Email Adapter — OAuth connect, callback, disconnect.
 * Merchant connects Gmail to receive UPI credit notifications directly in-app.
 */
export function registerGmailRoutes(server, ctx) {
  const db = ctx.db;

  function requireAuth(req) {
    const header = req.headers['authorization'] || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? match[1].trim() : '';
  }

  // GET /api/v1/gmail/authorize — start OAuth flow (returns Google account chooser URL)
  server.get('/api/v1/gmail/authorize', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });

    const { merchantId, redirectUri } = req.query || {};
    if (!merchantId || !redirectUri) return HttpServer.json(res, 400, { error: 'merchantId and redirectUri required' });

    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
    if (!clientId) return HttpServer.json(res, 503, { error: 'Gmail OAuth not configured. Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in environment variables.' });

    const state = crypto.randomUUID();
    const scope = 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send';

    // Store state for CSRF protection
    db.execute(
      `INSERT INTO gmail_oauth_states (id, state, merchant_id, redirect_uri, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [crypto.randomUUID(), state, merchantId, redirectUri, new Date().toISOString()]
    );

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scope);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent select_account');
    authUrl.searchParams.set('state', state);

    return HttpServer.json(res, 200, {
      authUrl: authUrl.toString(),
      state,
      merchantId,
      note: 'Open this URL in mobile browser — Google account chooser will appear, pick the email to connect'
    });
  });

  // GET /api/v1/gmail/callback — OAuth callback from Google
  server.get('/api/v1/gmail/callback', async (req, res) => {
    const { code, state, error } = req.query || {};

    if (error) return HttpServer.json(res, 400, { error: `OAuth error: ${error}` });
    if (!code || !state) return HttpServer.json(res, 400, { error: 'code and state required' });

    // Verify state
    const oauthState = db.queryOne('SELECT * FROM gmail_oauth_states WHERE state = $1', [state]);
    if (!oauthState) return HttpServer.json(res, 400, { error: 'Invalid state parameter' });
    if (new Date(oauthState.created_at) < new Date(Date.now() - 10 * 60 * 1000)) {
      return HttpServer.json(res, 400, { error: 'State expired' });
    }

    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return HttpServer.json(res, 503, { error: 'Gmail OAuth not configured. Set GMAIL_OAUTH_CLIENT_ID and GMAIL_OAUTH_CLIENT_SECRET in environment variables.' });

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: oauthState.redirect_uri, grant_type: 'authorization_code'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return HttpServer.json(res, 400, { error: tokenData.error || 'Token exchange failed' });

    // Get user info from Google
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userInfo = await userInfoRes.json();

    // Store Gmail connection
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString();

    db.execute(
      `INSERT INTO gmail_connections (id, merchant_id, email, access_token, refresh_token,
              expires_at, scope, connected_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
      [id, oauthState.merchant_id, userInfo.email, tokenData.access_token,
       tokenData.refresh_token || null, expiresAt, tokenData.scope || 'gmail.readonly', now]
    );

    // Clean up state
    db.execute('DELETE FROM gmail_oauth_states WHERE state = $1', [state]);

    return HttpServer.json(res, 200, {
      connected: true,
      email: userInfo.email,
      connectionId: id,
      merchantId: oauthState.merchant_id,
      expiresAt,
      note: 'Gmail connected — UPI credit notifications will be read from this inbox'
    });
  });

  // GET /api/v1/gmail/connections — list merchant's Gmail connections
  server.get('/api/v1/gmail/connections', async (req, res) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });

    const { merchantId } = req.query || {};
    if (!merchantId) return HttpServer.json(res, 400, { error: 'merchantId required' });

    const rows = db.query(
      `SELECT id, email, is_active, connected_at, expires_at, scope
       FROM gmail_connections WHERE merchant_id = $1 ORDER BY connected_at DESC`,
      [merchantId]
    );

    return HttpServer.json(res, 200, {
      connections: (rows || []).map(r => ({
        id: r.id, email: r.email, isActive: Boolean(r.is_active),
        connectedAt: r.connected_at, expiresAt: r.expires_at, scope: r.scope
      })),
      count: (rows || []).length
    });
  });

  // DELETE /api/v1/gmail/connections/:id — disconnect Gmail
  server.delete('/api/v1/gmail/connections/:id', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });

    const row = db.queryOne('SELECT * FROM gmail_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Connection not found' });

    // Revoke token with Google
    if (row.access_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${row.access_token}`, { method: 'POST' }).catch(() => {});
      } catch {}
    }

    db.execute('DELETE FROM gmail_connections WHERE id = $1', [params.id]);
    return HttpServer.json(res, 200, { disconnected: true, connectionId: params.id });
  });

  // POST /api/v1/gmail/connections/:id/refresh — refresh access token
  server.post('/api/v1/gmail/connections/:id/refresh', async (req, res, params) => {
    const token = requireAuth(req);
    if (!token) return HttpServer.json(res, 401, { error: 'Unauthorized' });

    const row = db.queryOne('SELECT * FROM gmail_connections WHERE id = $1', [params.id]);
    if (!row) return HttpServer.json(res, 404, { error: 'Connection not found' });
    if (!row.refresh_token) return HttpServer.json(res, 400, { error: 'No refresh token available' });

    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return HttpServer.json(res, 500, { error: 'Gmail OAuth not configured' });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: row.refresh_token, client_id: clientId, client_secret: clientSecret,
        grant_type: 'refresh_token'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) return HttpServer.json(res, 400, { error: tokenData.error || 'Token refresh failed' });

    const expiresAt = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString();
    db.execute(
      `UPDATE gmail_connections SET access_token = $1, expires_at = $2, is_active = 1 WHERE id = $3`,
      [tokenData.access_token, expiresAt, params.id]
    );

    return HttpServer.json(res, 200, { refreshed: true, expiresAt });
  });
}

import crypto from 'node:crypto';
