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

// Return-specific email templates
export async function sendReturnRequestConfirmation(
  email: string,
  orderId: string,
  refundAmount: number
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Return Request Confirmed",
    html: `
      <h2>Return Request Confirmed</h2>
      <p>Your return request for order <strong>#${orderId}</strong> has been confirmed.</p>
      <p>Our courier partner will contact you shortly to schedule a pickup.</p>
      <br/>
      <h3>Refund Details</h3>
      <p>Once we receive the returned items, your refund of <strong>₹${refundAmount.toFixed(2)}</strong> will be processed.</p>
      <p><em>Note: Both-ways shipping cost has been deducted from the refund amount.</em></p>
      <br/>
      <h3>What to Expect</h3>
      <ul>
        <li>Return pickup: 2-3 business days</li>
        <li>Refund processing: 5-7 business days after we receive the items</li>
      </ul>
      <br/>
      <p>Please ensure the product is unused, unopened, and in its original packaging.</p>
      <br/>
      <p>Thank you,</p>
      <p>Trishikha Organics Team</p>
    `,
  });
}

export async function sendReturnPickupScheduled(
  email: string,
  orderId: string,
  pickupDate?: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Return Pickup Scheduled",
    html: `
      <h2>Return Pickup Scheduled</h2>
      <p>Your return pickup for order <strong>#${orderId}</strong> has been scheduled.</p>
      ${pickupDate ? `<p>Expected pickup date: <strong>${pickupDate}</strong></p>` : ''}
      <br/>
      <h3>Preparation Checklist</h3>
      <ul>
        <li>Keep the product ready in its original packaging</li>
        <li>Ensure the product is unused and unopened</li>
        <li>Have a copy of your order confirmation ready</li>
      </ul>
      <br/>
      <p>Our courier partner will contact you on the day of pickup.</p>
      <br/>
      <p>Thank you,</p>
      <p>Trishikha Organics Team</p>
    `,
  });
}

export async function sendReturnRefundProcessed(
  email: string,
  orderId: string,
  refundAmount: number,
  refundId?: string
): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Return Refund Processed",
    html: `
      <h2>Refund Processed</h2>
      <p>Good news! Your return for order <strong>#${orderId}</strong> has been received and your refund has been processed.</p>
      <br/>
      <h3>Refund Details</h3>
      <p>Amount Refunded: <strong>₹${refundAmount.toFixed(2)}</strong></p>
      ${refundId ? `<p>Refund ID: ${refundId}</p>` : ''}
      <br/>
      <p>The amount will be credited to your original payment method within 5-7 business days, depending on your bank's processing time.</p>
      <br/>
      <p>We apologize for any inconvenience caused. We hope to serve you better in the future!</p>
      <br/>
      <p>Thank you,</p>
      <p>Trishikha Organics Team</p>
    `,
  });
}

export async function sendCreditNote(
  email: string,
  orderId: string,
  creditNoteNumber: string,
  refundAmount: number,
  pdfBuffer: Buffer
): Promise<boolean> {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: `TrishikhaOrganics: Credit Note - ${creditNoteNumber}`,
      html: `
        <h2>Credit Note Generated for Order #${orderId}</h2>
        <p>Dear Customer,</p>
        <p>Your refund of <strong>₹${refundAmount}</strong> for order <strong>#${orderId}</strong> has been processed.</p>
        <p>Please find the attached Credit Note (<strong>${creditNoteNumber}</strong>) for your reference.</p>
        <br/>
        <p>The amount should reflect in your account within 5-7 business days.</p>
        <br/>
        <p>Thank you,</p>
        <p>Trishikha Organics Team</p>
      `,
      attachments: [
        {
          filename: `Credit_Note_${creditNoteNumber}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    logOrder("credit_note_email_sent", { to: email, creditNoteNumber });
    return true;
  } catch (error) {
    logError(error as Error, {
      context: "credit_note_email_failed",
      to: email,
      creditNoteNumber,
    });
    return false;
  }
}
