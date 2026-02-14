import { z } from "zod";

// Address validation schema (matches frontend format)
export const addressSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50, "First name too long").trim().regex(/^[a-zA-Z\s.'-]*$/, "Invalid characters in first name"),
  last_name: z.string().max(50, "Last name too long").trim().regex(/^[a-zA-Z\s.'-]*$/, "Invalid characters in last name").optional().default(""),
  address_line1: z.string().min(5, "Address must be at least 5 characters").max(200, "Address too long").trim(),
  address_line2: z.string().max(200, "Address line 2 too long").trim().optional().default(""),
  city: z.string().min(2, "City must be at least 2 characters").max(100, "City name too long").trim(),
  state: z.string().min(2, "State must be at least 2 characters").max(100, "State name too long").trim(),
  pincode: z.string().regex(/^[0-9]{6}$/, "Pincode must be 6 digits"),
  country: z.string().max(50).trim().default("India"),
});

// Cart item from frontend store
export const cartItemSchema = z.object({
  id: z.uuid("Invalid product ID"),
  name: z.string().min(1, "Product name required").max(200, "Product name too long").trim(),
  price: z.number().positive("Price must be positive"),
  quantity: z.number().int("Quantity must be an integer").min(1, "Quantity must be at least 1").max(100, "Quantity too large"),
  image_url: z.string().max(1000).trim().optional(),
});

// Selected courier from Shiprocket
export const selectedCourierSchema = z.object({
  id: z.number().int("Courier ID must be an integer"),
  name: z.string().min(1, "Courier name is required").max(100, "Courier name too long").trim(),
  rate: z.number().positive("Shipping rate must be positive"),
  etd: z.string().max(100).trim().nullable().optional(),
});

// Checkout validation (matches frontend payload)
export const checkoutSchema = z.object({
  guest_email: z.string().email("Invalid email address").max(255, "Email too long").trim(),
  guest_phone: z.string().regex(/^[6-9]\d{9}$/, "Phone number must be 10 digits starting with 6-9"),
  cart_items: z.array(cartItemSchema).min(1, "Cart must have at least one item").max(10, "Maximum 10 items allowed in cart"),
  total_amount: z.number().min(0, "Total amount cannot be negative").max(10000, "Total amount exceeds limit").optional(),
  shipping_address: addressSchema,
  billing_address: addressSchema,
  selected_courier: selectedCourierSchema,
});

// OTP validation
export const otpRequestSchema = z.object({
  orderId: z.uuid("Invalid order ID"),
  emailOrPhone: z.string().email("Invalid email address").or(z.string().regex(/^[6-9]\d{9}$/, "Invalid phone number")),
});

// Cancel order validation
export const cancelOrderSchema = z.object({
  orderId: z.uuid("Invalid order ID"),
  otp: z.string().regex(/^[0-9]{6}$/, "OTP must be 6 digits"),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason too long").trim().optional(),
});

// Product validation
export const productSchema = z.object({
  name: z.string().min(3, "Product name must be at least 3 characters").max(200, "Product name too long").trim(),
  description: z.string().min(50, "Description must be at least 50 characters").max(2000, "Description too long").trim(),
  price: z.number().positive("Price must be positive").max(1000000, "Price too large"),
  stock: z.number().int("Stock must be an integer").min(0, "Stock cannot be negative").max(10000, "Stock exceeds limit"),
  sku: z.string().min(3, "SKU must be at least 3 characters").max(50, "SKU too long").trim().regex(/^[A-Z0-9-]+$/, "SKU must contain only uppercase letters, numbers, and hyphens"),
  hsn: z.string().regex(/^[0-9]{4,8}$/, "HSN must be 4-8 digits"),
  weight: z.number().positive("Weight must be positive").max(1000, "Weight too large (max 1000kg)"),
  length: z.number().positive("Length must be positive").max(500, "Length too large (max 500cm)"),
  breadth: z.number().positive("Breadth must be positive").max(500, "Breadth too large (max 500cm)"),
  height: z.number().positive("Height must be positive").max(500, "Height too large (max 500cm)"),
  // Legal metrology fields (optional)
  country_of_origin: z.string().max(100, "Country name too long").trim().optional(),
  manufacturer_name: z.string().max(200, "Manufacturer name too long").trim().optional(),
  manufacturer_address: z.string().max(500, "Manufacturer address too long").trim().optional(),
  net_quantity: z.string().max(100, "Net quantity too long").trim().optional(),
});

// Product specifications (FCO / technical data)
export const productSpecificationsSchema = z.object({
  npk_nitrogen_percent: z.number().min(0).max(100, "Max 100%").optional().nullable(),
  npk_phosphorus_percent: z.number().min(0).max(100, "Max 100%").optional().nullable(),
  npk_potassium_percent: z.number().min(0).max(100, "Max 100%").optional().nullable(),
  organic_matter_percent: z.number().min(0).max(100, "Max 100%").optional().nullable(),
  moisture_content_percent: z.number().min(0).max(100, "Max 100%").optional().nullable(),
  ph_value: z.number().min(0).max(14, "pH must be 0-14").optional().nullable(),
  cn_ratio: z.number().min(0).max(999, "C:N ratio too large").optional().nullable(),
  test_certificate_number: z.string().max(100, "Certificate number too long").trim().optional().nullable(),
  test_certificate_date: z.string().optional().nullable(),
  testing_laboratory: z.string().max(200, "Lab name too long").trim().optional().nullable(),
  manufacturing_license: z.string().max(100, "License number too long").trim().optional().nullable(),
  shelf_life_months: z.number().int().min(1).max(120, "Max 120 months").optional().nullable(),
  batch_lot_number: z.string().max(100, "Batch number too long").trim().optional().nullable(),
  best_before_date: z.string().optional().nullable(),
});

// Payment verification validation
export const paymentVerifySchema = z.object({
  razorpay_order_id: z.string().min(1, "Razorpay order ID required").max(100).trim(),
  razorpay_payment_id: z.string().min(1, "Razorpay payment ID required").max(100).trim(),
  razorpay_signature: z.string().min(1, "Razorpay signature required").max(512).trim(),
  order_id: z.uuid("Invalid order ID"),
});

// Shiprocket AWB assignment validation
export const assignAwbSchema = z.object({
  order_id: z.uuid("Invalid order ID"),
});

// Tracking validation
export const trackOrderSchema = z.object({
  order_id: z.uuid("Invalid order ID"),
});

// Review token verification
export const reviewTokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid review token"),
});

// Review submission
export const reviewSubmitSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Invalid review token"),
  rating: z.number().int("Rating must be an integer").min(1, "Rating must be at least 1").max(5, "Rating must be at most 5"),
  review_text: z.string()
    .min(10, "Review must be at least 10 characters")
    .max(1000, "Review must be at most 1000 characters")
    .trim()
    .optional()
    .or(z.literal(""))
    .transform(val => val === "" ? undefined : val),
});

// Admin review removal
export const reviewRemovalSchema = z.object({
  reason: z.string().max(500, "Reason too long").trim().optional(),
});
