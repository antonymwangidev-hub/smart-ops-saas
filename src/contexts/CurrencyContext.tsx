import {
  createContext, useContext, useState, useMemo, useCallback, ReactNode,
} from "react";

type CurrencyCode = "KES" | "USD" | "EUR" | "GBP";

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  KES: { code: "KES", symbol: "Ksh", locale: "en-KE" },
  USD: { code: "USD", symbol: "$",   locale: "en-US" },
  EUR: { code: "EUR", symbol: "€",   locale: "de-DE" },
  GBP: { code: "GBP", symbol: "£",   locale: "en-GB" },
};

const ALL_CURRENCIES = Object.values(CURRENCIES);

interface CurrencyContextType {
  currency: CurrencyConfig;
  setCurrency: (code: CurrencyCode) => void;
  formatAmount: (amount: number) => string;
  allCurrencies: CurrencyConfig[];
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: CURRENCIES.KES,
  setCurrency: () => {},
  formatAmount: (n) => String(n),
  allCurrencies: ALL_CURRENCIES,
});

export const useCurrency = () => useContext(CurrencyContext);

/**
 * CurrencyProvider — fixed expensive Intl object creation.
 *
 * ORIGINAL PROBLEM
 * ────────────────
 * The original formatAmount created a new Intl.NumberFormat(...) object
 * on EVERY call. Intl constructors parse locale/option strings and are
 * ~10–30× slower than calling .format() on an already-constructed
 * formatter. On a sales list page with 50 rows and 3 amounts per row,
 * that's 150 Intl object constructions per render.
 *
 * FIX
 * ───
 * useMemo builds ONE formatter instance per currency code change.
 * formatAmount is then a stable useCallback that just calls .format()
 * on the pre-built instance.
 */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<CurrencyCode>(() => {
    const saved = localStorage.getItem("smartops-currency") as CurrencyCode;
    return saved && saved in CURRENCIES ? saved : "KES";
  });

  const currency = CURRENCIES[code];

  // One formatter instance, rebuilt only when currency changes
  const formatter = useMemo(
    () =>
      new Intl.NumberFormat(currency.locale, {
        style: "currency",
        currency: currency.code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }),
    [currency.locale, currency.code]
  );

  const formatAmount = useCallback(
    (amount: number) => formatter.format(amount),
    [formatter]
  );

  const setCurrency = useCallback((c: CurrencyCode) => {
    setCode(c);
    localStorage.setItem("smartops-currency", c);
  }, []);

  const value = useMemo(
    () => ({ currency, setCurrency, formatAmount, allCurrencies: ALL_CURRENCIES }),
    [currency, setCurrency, formatAmount]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}
