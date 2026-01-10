// GST tax configuration for India

export const TAX_CONFIG = {
  // Company GST details
  COMPANY_GSTIN: process.env.COMPANY_GSTIN || "",
  COMPANY_STATE_CODE: process.env.COMPANY_STATE_CODE || "24", // Gujarat
  COMPANY_STATE_NAME: "Gujarat",

  // Default GST rate for organic manure (HSN 3101)
  DEFAULT_GST_RATE: parseFloat(process.env.GST_RATE || "5"),
};

// State code to name mapping for GST determination
const STATE_CODE_MAP: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

// State name to code mapping (reverse lookup)
const STATE_NAME_MAP: Record<string, string> = {
  "jammu & kashmir": "01",
  "jammu and kashmir": "01",
  "himachal pradesh": "02",
  "punjab": "03",
  "chandigarh": "04",
  "uttarakhand": "05",
  "haryana": "06",
  "delhi": "07",
  "new delhi": "07",
  "rajasthan": "08",
  "uttar pradesh": "09",
  "bihar": "10",
  "sikkim": "11",
  "arunachal pradesh": "12",
  "nagaland": "13",
  "manipur": "14",
  "mizoram": "15",
  "tripura": "16",
  "meghalaya": "17",
  "assam": "18",
  "west bengal": "19",
  "jharkhand": "20",
  "odisha": "21",
  "orissa": "21",
  "chhattisgarh": "22",
  "madhya pradesh": "23",
  "gujarat": "24",
  "dadra and nagar haveli": "26",
  "daman and diu": "26",
  "dadra & nagar haveli and daman & diu": "26",
  "maharashtra": "27",
  "karnataka": "29",
  "goa": "30",
  "lakshadweep": "31",
  "kerala": "32",
  "tamil nadu": "33",
  "puducherry": "34",
  "pondicherry": "34",
  "andaman and nicobar islands": "35",
  "andaman & nicobar islands": "35",
  "telangana": "36",
  "andhra pradesh": "37",
  "ladakh": "38",
};

export interface TaxBreakdown {
  taxableAmount: number; // Base price before tax
  cgstRate: number; // CGST rate (half of GST)
  cgstAmount: number; // CGST amount
  sgstRate: number; // SGST rate (half of GST)
  sgstAmount: number; // SGST amount
  igstRate: number; // IGST rate (full GST for interstate)
  igstAmount: number; // IGST amount
  totalGstAmount: number; // Total GST
  totalAmount: number; // Final inclusive amount
  supplyType: "intrastate" | "interstate";
}

/**
 * Round to 2 decimal places
 */
function roundToTwo(num: number): number {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Get state code from state name
 */
export function getStateCode(stateName: string): string {
  if (!stateName) return "99"; // Unknown

  const normalized = stateName.toLowerCase().trim();
  return STATE_NAME_MAP[normalized] || "99"; // 99 for unknown
}

/**
 * Get state name from state code
 */
export function getStateName(stateCode: string): string {
  return STATE_CODE_MAP[stateCode] || "Unknown";
}

/**
 * Extract GST from tax-inclusive price
 * Formula: Base = Inclusive / (1 + rate/100)
 */
export function extractGstFromInclusive(
  inclusiveAmount: number,
  gstRate: number = TAX_CONFIG.DEFAULT_GST_RATE
): { taxableAmount: number; gstAmount: number } {
  const taxableAmount = roundToTwo(inclusiveAmount / (1 + gstRate / 100));
  const gstAmount = roundToTwo(inclusiveAmount - taxableAmount);
  return { taxableAmount, gstAmount };
}

/**
 * Calculate full tax breakdown with CGST/SGST or IGST
 * For intrastate: CGST (half) + SGST (half)
 * For interstate: IGST (full)
 */
export function calculateTaxBreakdown(
  inclusiveAmount: number,
  customerStateCode: string,
  gstRate: number = TAX_CONFIG.DEFAULT_GST_RATE
): TaxBreakdown {
  const { taxableAmount, gstAmount } = extractGstFromInclusive(
    inclusiveAmount,
    gstRate
  );
  const isInterstate = customerStateCode !== TAX_CONFIG.COMPANY_STATE_CODE;

  if (isInterstate) {
    return {
      taxableAmount,
      cgstRate: 0,
      cgstAmount: 0,
      sgstRate: 0,
      sgstAmount: 0,
      igstRate: gstRate,
      igstAmount: gstAmount,
      totalGstAmount: gstAmount,
      totalAmount: inclusiveAmount,
      supplyType: "interstate",
    };
  } else {
    const halfRate = gstRate / 2;
    const halfAmount = roundToTwo(gstAmount / 2);
    // Handle rounding - ensure CGST + SGST = total GST
    const otherHalfAmount = roundToTwo(gstAmount - halfAmount);

    return {
      taxableAmount,
      cgstRate: halfRate,
      cgstAmount: halfAmount,
      sgstRate: halfRate,
      sgstAmount: otherHalfAmount,
      igstRate: 0,
      igstAmount: 0,
      totalGstAmount: gstAmount,
      totalAmount: inclusiveAmount,
      supplyType: "intrastate",
    };
  }
}

/**
 * Check if supply is interstate
 */
export function isInterstate(customerStateCode: string): boolean {
  return customerStateCode !== TAX_CONFIG.COMPANY_STATE_CODE;
}
