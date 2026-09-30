/**
 * The three cover tiers offered by Your Mutual Friend.
 *
 * This file is the single source of truth for premiums and benefits. Bronze was
 * corrected to 2,500,000 UGX (the original brief listed the same figure as Silver).
 */
export const TIERS = ['GOLD', 'SILVER', 'BRONZE'] as const;

export type Tier = (typeof TIERS)[number];

export interface Product {
  readonly tier: Tier;
  /** Menu number the customer selects, matching the brief. */
  readonly menuKey: string;
  readonly label: string;
  /** Monthly saving in Ugandan shillings. */
  readonly monthlyPremium: number;
  /** Total annual benefit ceiling in Ugandan shillings. */
  readonly annualBenefit: number;
}

export const PRODUCTS: Record<Tier, Product> = {
  GOLD: {
    tier: 'GOLD',
    menuKey: '1',
    label: 'Gold',
    monthlyPremium: 10_000,
    annualBenefit: 5_000_000,
  },
  SILVER: {
    tier: 'SILVER',
    menuKey: '2',
    label: 'Silver',
    monthlyPremium: 7_500,
    annualBenefit: 3_500_000,
  },
  BRONZE: {
    tier: 'BRONZE',
    menuKey: '3',
    label: 'Bronze',
    monthlyPremium: 5_000,
    annualBenefit: 2_500_000,
  },
};

export const PRODUCT_LIST: readonly Product[] = TIERS.map((tier) => PRODUCTS[tier]);

export function getProductByMenuKey(menuKey: string): Product | undefined {
  return PRODUCT_LIST.find((product) => product.menuKey === menuKey.trim());
}

export function getProduct(tier: Tier): Product {
  return PRODUCTS[tier];
}
