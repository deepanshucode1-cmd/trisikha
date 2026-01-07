import { z } from "zod";

// Address validation schema (matches frontend format)
export const addressSchema = z.object({
  first_name: z.string().min(1, "First name is required").max(50, "First name too long").regex(/^[a-zA-Z\s.'-]*$/, "Invalid characters in first name"),
  last_name: z.string().max(50, "Last name too long").regex(/^[a-zA-Z\s.'-]*$/, "Invalid characters in last name").optional().default(""),
  address_line1: z.string().min(5, "Address must be at least 5 characters").max(200, "Address too long"),
  address_line2: z.string().max(200, "Address line 2 too long").optional().default(""),
  city: z.string().min(2, "City must be at least 2 characters").max(100, "City name too long"),
  state: z.string().min(2, "State must be at least 2 characters").max(100, "State name too long"),
  pincode: z.string().regex(/^[0-9]{6}$/, "Pincode must be 6 digits"),
  country: z.string().default("India"),
});

// Cart item from frontend store
export const cartItemSchema = z.object({
  id: z.string().uuid("Invalid product ID"),
  name: z.string(),
  price: z.number(),
  quantity: z.number().int("Quantity must be an integer").min(1, "Quantity must be at least 1").max(100, "Quantity too large"),
  image_url: z.string().optional(),
});

// Checkout validation (matches frontend payload)
export const checkoutSchema = z.object({
  guest_email: z.string().email("Invalid email address").max(255, "Email too long"),
  guest_phone: z.string().min(10, "Phone number too short").max(15, "Phone number too long"),
  cart_items: z.array(cartItemSchema).min(1, "Cart must have at least one item"),
  total_amount: z.number().optional(),
  shipping_address: addressSchema,
  billing_address: addressSchema,
});

// OTP validation
export const otpRequestSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  emailOrPhone: z.string().email("Invalid email address").or(z.string().regex(/^\+?[1-9]\d{9,14}$/, "Invalid phone number")),
});

// Cancel order validation
export const cancelOrderSchema = z.object({
  orderId: z.string().uuid("Invalid order ID"),
  otp: z.string().regex(/^[0-9]{6}$/, "OTP must be 6 digits"),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason too long").optional(),
});

// Product validation
export const productSchema = z.object({
  name: z.string().min(3, "Product name must be at least 3 characters").max(200, "Product name too long"),
  description: z.string().max(2000, "Description too long"),
  price: z.number().positive("Price must be positive").max(1000000, "Price too large"),
  stock: z.number().int("Stock must be an integer").min(0, "Stock cannot be negative"),
  sku: z.string().min(3, "SKU must be at least 3 characters").max(50, "SKU too long").regex(/^[A-Z0-9-]+$/, "SKU must contain only uppercase letters, numbers, and hyphens"),
  hsn: z.string().regex(/^[0-9]{4,8}$/, "HSN must be 4-8 digits"),
  weight: z.number().positive("Weight must be positive").max(1000, "Weight too large (max 1000kg)"),
  length: z.number().positive("Length must be positive").max(500, "Length too large (max 500cm)"),
  breadth: z.number().positive("Breadth must be positive").max(500, "Breadth too large (max 500cm)"),
  height: z.number().positive("Height must be positive").max(500, "Height too large (max 500cm)"),
});

// Payment verification validation
export const paymentVerifySchema = z.object({
  razorpay_order_id: z.string().min(1, "Razorpay order ID required"),
  razorpay_payment_id: z.string().min(1, "Razorpay payment ID required"),
  razorpay_signature: z.string().min(1, "Razorpay signature required"),
  order_id: z.string().uuid("Invalid order ID"),
});

// Shiprocket AWB assignment validation
export const assignAwbSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
});

// Tracking validation
export const trackOrderSchema = z.object({
  order_id: z.string().uuid("Invalid order ID"),
});
