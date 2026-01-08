import nodemailer from "nodemailer";
import { logError, logOrder } from "@/lib/logger";

// Singleton transporter instance
let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;

    if (!user || !pass) {
      throw new Error("Email credentials not configured");
    }

    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user, pass },
    });
  }
  return transporter;
}

interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.EMAIL_USER,
      ...options,
    });
    logOrder("email_sent", { to: options.to, subject: options.subject });
    return true;
  } catch (error) {
    logError(error as Error, {
      context: "email_send_failed",
      to: options.to,
      subject: options.subject
    });
    return false;
  }
}

// Pre-defined email templates
export async function sendOrderConfirmation(email: string, orderId: string, total: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Order Confirmed",
    html: `
      <h2>Thank you for your order!</h2>
      <p>Your order <strong>#${orderId}</strong> has been confirmed.</p>
      <p>Total Amount: <strong>₹${total}</strong></p>
      <p>We will notify you once your order is shipped.</p>
      <br/>
      <p>Thank you for shopping with Trishikha Organics!</p>
    `,
  });
}

export async function sendOrderShipped(email: string, orderId: string, trackingUrl?: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Order has been shipped",
    html: `
      <h2>Your order is on its way!</h2>
      <p>Your order <strong>#${orderId}</strong> has been shipped.</p>
      ${trackingUrl ? `<p><a href="${trackingUrl}">Track your order</a></p>` : ''}
      <br/>
      <p>Thank you for shopping with Trishikha Organics!</p>
    `,
  });
}

export async function sendOrderDelivered(email: string, orderId: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Order has been Delivered",
    html: `
      <h2>Your order has been delivered!</h2>
      <p>Your order <strong>#${orderId}</strong> has been successfully delivered.</p>
      <p>We hope you enjoy your purchase!</p>
      <br/>
      <p>Thank you for shopping with Trishikha Organics!</p>
    `,
  });
}

export async function sendCancellationOTP(email: string, otp: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Order Cancellation OTP",
    html: `
      <h2>Order Cancellation Request</h2>
      <p>Your OTP for order cancellation is: <strong>${otp}</strong></p>
      <p>This OTP is valid for 10 minutes.</p>
      <p>If you did not request this, please ignore this email.</p>
    `,
  });
}

export async function sendRefundInitiated(email: string, orderId: string, amount: number): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Refund Initiated",
    html: `
      <h2>Refund Initiated</h2>
      <p>A refund of <strong>₹${amount}</strong> has been initiated for your order <strong>#${orderId}</strong>.</p>
      <p>The amount will be credited to your original payment method within 5-7 business days.</p>
      <br/>
      <p>Thank you for shopping with Trishikha Organics!</p>
    `,
  });
}
