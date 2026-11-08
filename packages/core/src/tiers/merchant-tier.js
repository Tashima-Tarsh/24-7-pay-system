/**
 * Merchant Tiering — Phase 4 Deliverable 7
 *
 * Even in grey market, merchants are tiered to distribute risk.
 * Tier limits are enforced at order creation time.
 *
 * Tier structure:
 *   BASIC:     ₹50L/day, 20 tx/day, ₹500K single tx, 3 VPAs, no docs
 *   VERIFIED:  ₹5Cr/day, 100 tx/day, ₹20L single tx, 10 VPAs, PAN required
 *   PREMIUM:   ₹20Cr/day, 500 tx/day, ₹50L single tx, 25 VPAs, GST required
 */

export class MerchantTierEnforcer {
  /**
   * @param {{
   *   db: import('./database.js').Database
   * }} options
   */
  constructor({ db }) {
    this.db = db;
  }

  /**
   * Enforce tier limits before creating a payment order.
   * Throws TIER_LIMIT_EXCEEDED if any limit would be violated.
   *
   * @param {string} merchantId
   * @param {number} amountPaise
   * @returns {{ allowed: true }} or throws
   */
  async enforceTierLimits(merchantId, amountPaise) {
    const amount = Number(amountPaise);

    // Get merchant with tier info
    const merchant = this.db.queryOne(`
      SELECT m.*, t.max_daily_volume_paise, t.max_tx_count_per_day,
             t.max_single_tx_paise, t.name as tier_name
      FROM pp_merchants m
      LEFT JOIN merchant_tiers t ON t.id = m.tier_id
      WHERE m.id = ?
    `, [merchantId]);

    if (!merchant) {
      const err = new Error('Merchant not found');
      err.code = 'MERCHANT_NOT_FOUND';
      throw err;
    }

    const tier = merchant;
    const tierName = tier.tier_name || 'BASIC';
    const maxDailyVolume = Number(tier.max_daily_volume_paise || 5000000);
    const maxTxCount = Number(tier.max_tx_count_per_day || 20);
    const maxSingleTx = Number(tier.max_single_tx_paise || 500000);

    // Check single transaction limit
    if (amount > maxSingleTx) {
      const err = new Error(`Single transaction amount exceeds tier limit (₹${(maxSingleTx / 100).toFixed(2)})`);
      err.code = 'TIER_LIMIT_EXCEEDED';
      err.tier = tierName;
      err.limitType = 'single_tx_limit';
      err.limitValue = maxSingleTx;
      err.requestedAmount = amount;
      throw err;
    }

    // Check daily volume limit
    const todayVolume = await this.getTodayVolume(merchantId);
    if (todayVolume + amount > maxDailyVolume) {
      const err = new Error(`Daily volume limit exceeded (₹${(maxDailyVolume / 100).toFixed(2)})`);
      err.code = 'TIER_LIMIT_EXCEEDED';
      err.tier = tierName;
      err.limitType = 'daily_volume_limit';
      err.limitValue = maxDailyVolume;
      err.currentVolume = todayVolume;
      err.requestedAmount = amount;
      throw err;
    }

    // Check daily tx count limit
    const todayTxCount = await this.getTodayTxCount(merchantId);
    if (todayTxCount >= maxTxCount) {
      const err = new Error(`Daily transaction count limit exceeded (${maxTxCount} transactions)`);
      err.code = 'TIER_LIMIT_EXCEEDED';
      err.tier = tierName;
      err.limitType = 'daily_tx_count_limit';
      err.limitValue = maxTxCount;
      err.currentCount = todayTxCount;
      throw err;
    }

    return { allowed: true, tier: tierName };
  }

  /**
   * Get today's total volume for a merchant.
   * @param {string} merchantId
   * @returns {number} Total amount in paise
   */
  getTodayVolume(merchantId) {
    const row = this.db.queryOne(`
      SELECT COALESCE(SUM(actual_amount_paise), 0) AS total
      FROM payment_orders
      WHERE merchant_id = ?
        AND created_at >= datetime('now', 'start of day')
    `, [merchantId]);
    return Number(row?.total || 0);
  }

  /**
   * Get today's transaction count for a merchant.
   * @param {string} merchantId
   * @returns {number} Transaction count
   */
  getTodayTxCount(merchantId) {
    const row = this.db.queryOne(`
      SELECT COUNT(*) AS count
      FROM payment_orders
      WHERE merchant_id = ?
        AND created_at >= datetime('now', 'start of day')
    `, [merchantId]);
    return Number(row?.count || 0);
  }

  /**
   * Get tier info for a merchant.
   * @param {string} merchantId
   * @returns {object|null}
   */
  getMerchantTier(merchantId) {
    return this.db.queryOne(`
      SELECT m.id, m.tier_id, t.name as tier_name,
             t.max_daily_volume_paise, t.max_tx_count_per_day,
             t.max_single_tx_paise, t.vpa_pool_size_required,
             t.requires_document, t.document_type
      FROM pp_merchants m
      LEFT JOIN merchant_tiers t ON t.id = m.tier_id
      WHERE m.id = ?
    `, [merchantId]);
  }

  /**
   * Upgrade a merchant's tier.
   * @param {string} merchantId
   * @param {number} newTierId
   * @returns {void}
   */
  upgradeTier(merchantId, newTierId) {
    this.db.execute(`
      UPDATE pp_merchants
      SET tier_id = ?, updated_at = ?
      WHERE id = ?
    `, [newTierId, new Date().toISOString(), merchantId]);
  }
}
