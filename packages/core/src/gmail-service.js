/**
 * Gmail Service — reads Gmail for UPI credit notifications.
 * Requires an active Gmail OAuth connection (gmail.readonly scope).
 */
import crypto from 'node:crypto';
import { encryptAtRest } from '@youpi/common';

const UPI_CREDIT_KEYWORDS = /(credited|credit|received|deposit|payment received|upi\/cr|transferred)/i;
const UPI_DEBIT_KEYWORDS = /(debited|withdrawn|sent rs|paid rs)/i;

export class GmailService {
  constructor(db) {
    this.db = db;
    this.health = { lastPoll: null, lastParse: null, errorCount: 0 };
  }

  getHealth() {
    return { ...this.health };
  }

  /**
   * Build the Gmail search query restricted to the allowlisted bank alert sender
   * domains. Never parses the whole inbox.
   * @param {string[]} domains
   * @returns {string}
   */
  buildBankAlertQuery(domains) {
    if (!domains || domains.length === 0) return 'newer_than:1d';
    const fromClause = domains.map(d => `from:${d}`).join(' OR ');
    return `(${fromClause}) newer_than:1d`;
  }

  /**
   * Get an active Gmail connection for a merchant.
   */
  getConnection(merchantId) {
    const row = this.db.queryOne(
      `SELECT * FROM gmail_connections WHERE merchant_id = $1 AND is_active = 1 ORDER BY connected_at DESC LIMIT 1`,
      [merchantId]
    );
    return row || null;
  }

  /**
   * Check if Gmail access token is expired and refresh if needed.
   */
  async ensureValidToken(connection) {
    const clientId = process.env.GMAIL_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Gmail OAuth not configured');

    const now = new Date();
    const expiresAt = new Date(connection.expires_at || 0);
    if (now < expiresAt) return connection.access_token;

    // Refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: connection.refresh_token, client_id: clientId, client_secret: clientSecret,
        grant_type: 'refresh_token'
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error || 'Token refresh failed');

    const expiresAtNew = new Date(Date.now() + Number(tokenData.expires_in || 3600) * 1000).toISOString();
    this.db.execute(
      `UPDATE gmail_connections SET access_token = $1, expires_at = $2, is_active = 1 WHERE id = $3`,
      [tokenData.access_token, expiresAtNew, connection.id]
    );

    return tokenData.access_token;
  }

  /**
   * List Gmail messages within an allowlisted sender scope. Never parses the whole inbox.
   * @param {string} accessToken
   * @param {string} [query] full Gmail search query
   * @param {number} [maxResults=50]
   */
  async listUpiCreditMessages(accessToken, query = null, maxResults = 50) {
    const gmailQuery = query || 'newer_than:1d';
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', gmailQuery);
    url.searchParams.set('maxResults', String(maxResults));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
    const data = await res.json();
    return (data.messages || []).map(m => m.id);
  }

  /**
   * Get a single Gmail message.
   */
  async getMessage(accessToken, messageId) {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!res.ok) throw new Error(`Gmail API error: ${res.status}`);
    return await res.json();
  }

  /**
   * Extract plain text body from a Gmail message.
   */
  extractTextBody(message) {
    const parts = [];
    function walk(part) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        parts.push(Buffer.from(part.body.data, 'base64').toString('utf-8'));
      }
      if (part.parts) part.parts.forEach(walk);
    }
    if (message.payload) walk(message.payload);
    return parts.join('\n');
  }

  /**
   * Extract headers from a Gmail message.
   */
  extractHeaders(message, names) {
    const headers = {};
    if (message.payload && message.payload.headers) {
      message.payload.headers.forEach(h => {
        if (names.includes(h.name)) headers[h.name.toLowerCase()] = h.value;
      });
    }
    return headers;
  }

  /**
   * Extract UPI credit info from a message body.
   * Returns { amountPaise, utr, senderVpa, payeeVpa, rawText } or null.
   */
  extractUpiCredit(text) {
    if (!UPI_CREDIT_KEYWORDS.test(text)) return null;
    if (UPI_DEBIT_KEYWORDS.test(text) && !UPI_CREDIT_KEYWORDS.test(text)) return null;

    // Extract amount (₹100.00 or Rs. 100 or 100.00)
    const amountMatch = text.match(/[₹Rs\.\s]*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/i);
    const amountPaise = amountMatch
      ? Math.round(parseFloat(amountMatch[1].replace(/,/g, '')) * 100)
      : null;

    // Extract UTR (12-digit reference)
    const utrMatch = text.match(/(?:UTR|Ref|reference)[:\s]*(\d{12})/i);
    const utr = utrMatch ? utrMatch[1] : null;

    // Extract sender VPA
    const senderMatch = text.match(/from\s+([a-zA-Z0-9.\-]{2,64}@[a-zA-Z0-9.\-]{2,64})/i);
    const senderVpa = senderMatch ? senderMatch[1] : null;

    // Extract payee VPA
    const payeeMatch = text.match(/to\s+([a-zA-Z0-9.\-]{2,64}@[a-zA-Z0-9.\-]{2,64})/i);
    const payeeVpa = payeeMatch ? payeeMatch[1] : null;

    if (!amountPaise && !utr) return null;

    return {
      amountPaise,
      utr,
      senderVpa,
      payeeVpa,
      rawText: text.slice(0, 2000)
    };
  }

  /**
   * Scan all active Gmail connections for UPI credit notifications.
   * Returns matched observations ready for attribution engine.
   */
  async scanAllConnections() {
    this.health.lastPoll = new Date().toISOString();
    const connections = this.db.query('SELECT * FROM gmail_connections WHERE is_active = 1') || [];
    const observations = [];
    let errorCount = 0;

    // Allowlist of bank alert sender domains; never parse the whole inbox.
    let domains = [];
    try {
      const rows = this.db.query('SELECT domain FROM pp_bank_alert_senders') || [];
      domains = rows.map(r => r.domain);
    } catch {}
    const query = this.buildBankAlertQuery(domains);

    for (const conn of connections) {
      try {
        const accessToken = await this.ensureValidToken(conn);
        const messageIds = await this.listUpiCreditMessages(accessToken, query, 20);

        for (const msgId of messageIds) {
          try {
            const message = await this.getMessage(accessToken, msgId);
            const headers = this.extractHeaders(message, ['Subject', 'From', 'Date']);
            const text = this.extractTextBody(message) || headers.Subject || '';
            const credit = this.extractUpiCredit(text);

            if (credit) {
              this.health.lastParse = new Date().toISOString();
              observations.push({
                id: crypto.randomUUID(),
                source: 'GMAIL',
                receivingAccountId: conn.email,
                amountPaise: credit.amountPaise,
                bankReferenceNumber: credit.utr,
                observedAt: headers.date || new Date().toISOString(),
                senderVpa: credit.senderVpa,
                rawPayload: {
                  messageId: message.id,
                  subject: headers.Subject,
                  from: headers.From,
                  date: headers.Date,
                  rawBody: encryptAtRest(credit.rawText || text),
                  rawText: credit.rawText,
                  extracted: credit
                },
                fingerprintHash: crypto
                  .createHash('sha256')
                  .update(`${conn.email}|${message.id}|${credit.utr || ''}|${credit.amountPaise || ''}`)
                  .digest('hex')
              });
            }
          } catch (err) {
            errorCount++;
            console.error(`Gmail parse failed for message ${msgId}:`, err.message);
          }
        }
      } catch (err) {
        errorCount++;
        console.error(`Gmail scan failed for ${conn.email}:`, err.message);
      }
    }

    this.health.errorCount += errorCount;
    return observations;
  }
}
