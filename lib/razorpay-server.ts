import Razorpay from "razorpay";
import { logSecurityEvent, logError } from "@/lib/logger";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

export async function scrubRazorpayNotes(razorpayOrderId: string | null | undefined): Promise<void> {
  if (!razorpayOrderId) return;

  try {
    await razorpay.orders.edit(razorpayOrderId, {
      notes: {
        guest_email: "scrubbed",
        order_id: "scrubbed",
        rolled_back: "true",
      },
    });
    logSecurityEvent("razorpay_notes_scrubbed", { razorpayOrderId });
  } catch (err) {
    logError(err instanceof Error ? err : new Error(String(err)), {
      context: "razorpay_notes_scrub_failed",
      razorpayOrderId,
    });
  }
}
