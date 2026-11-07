/**
 * Amount Randomization — Phase 4 Deliverable 2: Anti-Pattern Detection.
 *
 * Banks flag accounts receiving many round-figure payments (₹500, ₹1000).
 * Add micro-randomization (1-99 paise) to break pattern detection while
 * keeping the display amount clean for users.
 *
 * Backend tracks exact amount_paise with randomization; frontend/display
 * shows rounded amount.
 *
 * @param {number} basePaise - Base amount in paise (e.g., 50000 for ₹500)
 * @returns {number} Randomized amount in paise (basePaise + 1-99)
 */
export function randomizeAmount(basePaise) {
  const cents = Math.floor(Math.random() * 99) + 1; // 1-99 paise
  return basePaise + cents;
}

/**
 * Display amount rounded down to whole rupees for user-facing display.
 * Backend tracks exact amount_paise with randomization.
 *
 * @param {number} actualPaise - Actual amount in paise (e.g., 50047)
 * @returns {string} Display amount string (e.g., "500.00")
 */
export function displayAmount(actualPaise) {
  return (Math.floor(actualPaise / 100)).toFixed(2);
}

/**
 * Convenience: randomize amount and return both actual and display values.
 *
 * @param {number} basePaise - Base amount in paise
 * @returns {object} { actualAmountPaise, displayAmountPaise, displayAmountString }
 */
export function randomizeAndGetDisplay(basePaise) {
  const actual = randomizeAmount(basePaise);
  return {
    actualAmountPaise: actual,
    displayAmountPaise: basePaise,
    displayAmountString: displayAmount(actual)
  };
}
