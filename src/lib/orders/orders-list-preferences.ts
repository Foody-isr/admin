/** Starts routine browsing on all orders and keeps payment links actionable. */
export function initialOrdersTab(paymentAttention: boolean): 'active' | 'all' {
  return paymentAttention ? 'active' : 'all';
}
