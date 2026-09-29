const FRANKFURTER_BASE_URL = "https://api.frankfurter.dev/v1/latest";

export async function getExchangeRate(from, to) {
  const url = `${FRANKFURTER_BASE_URL}?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch exchange rate for ${from}->${to}: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  const rate = data.rates?.[to];

  if (typeof rate !== "number") {
    throw new Error(`No exchange rate found for currency pair ${from}->${to}. Check the currency codes are valid ISO codes.`);
  }

  return rate;
}

export async function convertCurrency(amount, from, to) {
  const fromCode = from.toUpperCase();
  const toCode = to.toUpperCase();

  if (fromCode === toCode) {
    return { rate: 1, converted: amount };
  }

  const rate = await getExchangeRate(fromCode, toCode);
  return { rate, converted: Number((amount * rate).toFixed(4)) };
}
