/**
 * Pseudo payment method for the part of a sale paid from the client's
 * loyalty (cashback/bonus) balance. Stored in Sale.extraPayments like any
 * other payment so receipts, dashboards and reports show it as its own line.
 */
export const LOYALTY_CASHBACK_PAYMENT_METHOD = 'loyalty_cashback';

/** Cashback and bonus programs share one balance; only the wording differs. */
export function loyaltyPaymentName(programType?: string | null) {
  return programType === 'bonus' ? 'Оплата бонусами' : 'Оплата кэшбэком';
}

type LoyaltySettingReader = {
  loyaltyProgramSetting?: {
    findUnique(args: {
      where: { companyId: string };
      select: { type: true };
    }): Promise<{ type: string } | null>;
  };
};

/** Company loyalty program type ('cashback' | 'bonus'), or '' when unset. */
export async function loadLoyaltyProgramType(
  prisma: LoyaltySettingReader,
  companyId?: string | null,
) {
  if (!companyId || !prisma.loyaltyProgramSetting) return '';
  const setting = await prisma.loyaltyProgramSetting.findUnique({
    where: { companyId },
    select: { type: true },
  });
  return setting?.type ?? '';
}
