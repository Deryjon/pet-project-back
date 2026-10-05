/**
 * Pseudo payment method for the part of a sale paid from the client's
 * loyalty (cashback/bonus) balance. Stored in Sale.extraPayments like any
 * other payment so receipts, dashboards and reports show it as its own line.
 */
export const LOYALTY_CASHBACK_PAYMENT_METHOD = 'loyalty_cashback';
export const LOYALTY_CASHBACK_PAYMENT_NAME = 'Оплата бонусами';
