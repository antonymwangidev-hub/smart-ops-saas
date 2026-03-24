import { createContext, useContext, useState, ReactNode } from "react";

type CurrencyCode = "KES" | "USD" | "EUR" | "GBP";

interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  locale: string;
}

const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  KES: { code: "KES", symbol: "Ksh", locale: "en-KE" },
  USD: { code: "USD", symbol: "$", locale: "en-US" },
  EUR: { code: "EUR", symbol: "€", locale: "de-DE" },
  GBP: { code: "GBP", symbol: "£", locale: "en-GB" },
};

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
  allCurrencies: Object.values(CURRENCIES),
});

export const useCurrency = () => useContext(CurrencyContext);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [code, setCode] = useState<CurrencyCode>(() => {
    return (localStorage.getItem("smartops-currency") as CurrencyCode) || "KES";
  });

  const currency = CURRENCIES[code];

  const setCurrency = (c: CurrencyCode) => {
    setCode(c);
    localStorage.setItem("smartops-currency", c);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, formatAmount, allCurrencies: Object.values(CURRENCIES) }}>
      {children}
    </CurrencyContext.Provider>
  );
}
