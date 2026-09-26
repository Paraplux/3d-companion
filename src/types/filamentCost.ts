/** Machine-local filament cost preferences (never synced). */

export type FilamentCostSettings = {
  /** Price paid for a full spool (e.g. 20). */
  spoolPrice: number;
  /** Spool net weight in grams (typically 1000). */
  spoolGrams: number;
  /** ISO 4217 currency code for formatting. */
  currency: string;
};
