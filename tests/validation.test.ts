import { describe, it, expect } from "vitest";
import { paymentVerifySchema } from "../lib/validation";

describe("Payment Verification Schema", () => {
    const validPayload = {
        razorpay_order_id: "order_1234567890",
        razorpay_payment_id: "pay_1234567890",
        razorpay_signature: "a".repeat(64),
        order_id: "123e4567-e89b-12d3-a456-426614174000",
    };

    it("should accept valid payloads", () => {
        const result = paymentVerifySchema.safeParse(validPayload);
        expect(result.success).toBe(true);
    });

    describe("razorpay_order_id", () => {
        it("should reject IDs without order_ prefix", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_order_id: "1234567890",
            });
            expect(result.success).toBe(false);
        });

        it("should reject IDs with invalid characters", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_order_id: "order_123<script>",
            });
            expect(result.success).toBe(false);
        });

        it("should reject IDs with newlines (log injection)", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_order_id: "order_123\nFAKE_LOG",
            });
            expect(result.success).toBe(false);
        });

        it("should reject IDs that are too long", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_order_id: "order_" + "a".repeat(101),
            });
            expect(result.success).toBe(false);
        });
    });

    describe("razorpay_payment_id", () => {
        it("should reject IDs without pay_ prefix", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_payment_id: "1234567890",
            });
            expect(result.success).toBe(false);
        });

        it("should reject IDs that are too long", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_payment_id: "pay_" + "a".repeat(101),
            });
            expect(result.success).toBe(false);
        });

        it("should reject IDs with special characters (XSS)", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_payment_id: "<script>alert(1)</script>",
            });
            expect(result.success).toBe(false);
        });
    });

    describe("razorpay_signature", () => {
        it("should reject signatures not 64 chars long", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_signature: "a".repeat(63),
            });
            expect(result.success).toBe(false);
        });

        it("should reject non-hex characters", () => {
            const result = paymentVerifySchema.safeParse({
                ...validPayload,
                razorpay_signature: "z".repeat(64),
            });
            expect(result.success).toBe(false);
        });
    });
});
