// =====================================================
// Account Status Aging Computation
// Mirrors SQL function fn_compute_effective_account_status
// =====================================================

export type AccountStatus =
  | 'calon_account'
  | 'new_account'
  | 'failed_account'
  | 'active_account'
  | 'passive_account'
  | 'lost_account'

/**
 * Computes the effective account status based on stored status and transaction dates.
 * Aging rules (priority order):
 *   1. lost_account: 3+ months since last transaction
 *   2. passive_account: 1+ month since last transaction
 *   3. active_account: 3+ months since first transaction (matured)
 * Only applies to accounts with status 'new_account' or 'active_account'.
 * calon_account and failed_account are untouched (driven by opportunity outcomes).
 */
export function computeEffectiveAccountStatus(
  storedStatus: string | null | undefined,
  firstTransactionDate: string | null | undefined,
  lastTransactionDate: string | null | undefined,
): AccountStatus {
  const status = (storedStatus || 'calon_account') as AccountStatus

  // Only apply aging to accounts that have had a deal
  if (status === 'calon_account' || status === 'failed_account') {
    return status
  }

  const now = new Date()

  // Priority 1: Lost account (3+ months idle)
  if (
    (status === 'new_account' || status === 'active_account') &&
    lastTransactionDate
  ) {
    const lastTx = new Date(lastTransactionDate)
    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    if (lastTx < threeMonthsAgo) {
      return 'lost_account'
    }

    // Priority 2: Passive account (1+ month idle)
    const oneMonthAgo = new Date(now)
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)

    if (lastTx < oneMonthAgo) {
      return 'passive_account'
    }
  }

  // Priority 3: Active account (3+ months since first transaction)
  if (status === 'new_account' && firstTransactionDate) {
    const firstTx = new Date(firstTransactionDate)
    const threeMonthsAgo = new Date(now)
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

    if (firstTx < threeMonthsAgo) {
      return 'active_account'
    }
  }

  return status
}

/**
 * Apply aging computation to a single account object.
 * Mutates the account_status field in place.
 */
export function applyAccountAging<T extends Record<string, unknown>>(account: T): T {
  if (account && account.account_status) {
    const effective = computeEffectiveAccountStatus(
      account.account_status as string,
      account.first_transaction_date as string | null,
      account.last_transaction_date as string | null,
    );
    (account as Record<string, unknown>).account_status = effective
  }
  return account
}

/**
 * Apply aging computation to an array of account objects.
 */
export function applyAccountAgingToList<T extends Record<string, unknown>>(accounts: T[]): T[] {
  if (!accounts) return accounts
  return accounts.map(applyAccountAging)
}
