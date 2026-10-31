// Pure receipt-text parser — no dependencies, no DOM.
// Safe to import in node tests. All parsing is best-effort: any field may
// come back null, and the functions never throw on garbage input.

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
};

// App categories paired with receipt keywords (checked in order).
const CATEGORY_KEYWORDS = [
  { category: 'Dining', keywords: ['restaurant', 'cafe', 'coffee', 'diner', 'bistro', 'pizzeria', 'pizza', 'sushi', 'burger', 'tim hortons', 'starbucks', 'mcdonald', "mcdonald's", 'wendy', 'subway', 'kfc', 'a&w', 'harvey', 'taco', 'grill', 'eatery', 'bakery', 'donut', 'doughnut', 'ice cream', 'gelato', 'pub', 'bar '] },
  { category: 'Groceries', keywords: ['grocery', 'groceries', 'supermarket', 'superstore', 'walmart', 'costco', 'loblaws', 'sobeys', 'metro', 'food basics', 'no frills', 'freshco', 'whole foods', 'iga', 'market'] },
  { category: 'Car', keywords: ['gas station', 'gas ', 'fuel', 'shell', 'petro', 'esso', 'ultramar', 'husky', 'auto repair', 'mechanic', 'car wash', 'parking', 'tire'] },
  { category: 'Health', keywords: ['pharmacy', 'drug mart', 'shoppers', 'dentist', 'dental', 'clinic', 'doctor', 'optical', 'eyecare'] },
  { category: 'Shopping', keywords: ['amazon', 'best buy', 'clothing', 'apparel', 'h&m', 'zara', 'ikea', 'dollarama', 'dollar store', 'canadian tire', 'home depot', 'winners', 'marshalls'] },
  { category: 'Utilities', keywords: ['hydro', 'rogers', 'bell', 'telus', 'fido', 'koodo', 'internet', 'utility', 'utilities'] },
  { category: 'Entertainment', keywords: ['cinema', 'cineplex', 'theatre', 'theater', 'concert', 'netflix', 'spotify', 'steam', 'game'] },
];

const TOTAL_LINE_RE = /\b(total|balance(\s*due)?|amount\s*due|grand\s*total|total\s*due)\b/i;
const TOTAL_JUNK_RE = /\b(savings|change|tender|cash|refund)\b/i;

function linesOf(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function toNumber(token) {
  const n = parseFloat(String(token).replace(/[$\s,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function extractMerchant(lines) {
  for (const line of lines) {
    const letters = line.replace(/[^a-zA-Z]/g, '');
    if (letters.length < 3) continue;
    // Skip lines that are mostly symbols (e.g. "*** SALE ***").
    if (letters.length / line.length < 0.4) continue;
    if (/^(receipt|invoice|sales?\s*receipt|sale|tel|phone|fax|www\.|https?:)/i.test(line)) continue;
    return line.length > 60 ? line.slice(0, 60).trim() : line;
  }
  return null;
}

function extractAmount(lines) {
  // Prefer the amount on a "total"-style line (last number wins:
  // "Subtotal $10.00  Total $12.00").
  for (const line of lines) {
    if (TOTAL_LINE_RE.test(line) && !TOTAL_JUNK_RE.test(line)) {
      const nums = [...line.matchAll(/\d[\d,]*\.\d{2}/g)]
        .map((m) => toNumber(m[0]))
        .filter((n) => n !== null && n > 0);
      if (nums.length) return nums[nums.length - 1];
    }
  }
  // Fallback: largest $-prefixed amount in the whole text.
  let best = null;
  for (const line of lines) {
    for (const m of line.matchAll(/\$\s*\d[\d,]*\.?\d+/g)) {
      const v = toNumber(m[0]);
      if (v !== null && v > 0 && (best === null || v > best)) best = v;
    }
  }
  return best;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function extractDate(lines) {
  for (const line of lines) {
    // YYYY-MM-DD (or with / or .)
    let m = line.match(/\b(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})\b/);
    if (m) {
      const iso = validDate(+m[1], +m[2], +m[3]);
      if (iso) return iso;
    }
    // "Oct 30, 2026" / "October 30 2026"
    m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (m) {
      const iso = validDate(+m[3], +MONTHS[m[1].toLowerCase()], +m[2]);
      if (iso) return iso;
    }
    // "30 Oct 2026"
    m = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i);
    if (m) {
      const iso = validDate(+m[3], +MONTHS[m[2].toLowerCase()], +m[1]);
      if (iso) return iso;
    }
    // MM/DD/YYYY or MM-DD-YYYY (North-American receipts); 2-digit year → 2000s/1900s split.
    m = line.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
    if (m) {
      let y = +m[3];
      if (y < 100) y = y > 50 ? 1900 + y : 2000 + y;
      const iso = validDate(y, +m[1], +m[2]);
      if (iso) return iso;
    }
  }
  return null;
}

function guessCategory(merchant, text) {
  const haystacks = [merchant, text].filter(Boolean).map((s) => ` ${s.toLowerCase()} `);
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    for (const kw of keywords) {
      if (haystacks.some((h) => h.includes(kw))) return category;
    }
  }
  return null;
}

/**
 * Parse OCR'd receipt text into transaction fields.
 * @param {string} text raw OCR output
 * @returns {{ merchant: string|null, amount: number|null, date: string|null, category: string|null }}
 *          date is ISO YYYY-MM-DD when found.
 */
export function parseReceiptText(text) {
  try {
    const lines = linesOf(text);
    if (!lines.length) return { merchant: null, amount: null, date: null, category: null };
    const merchant = extractMerchant(lines);
    return {
      merchant,
      amount: extractAmount(lines),
      date: extractDate(lines),
      category: guessCategory(merchant, lines.join('\n')),
    };
  } catch {
    return { merchant: null, amount: null, date: null, category: null };
  }
}
