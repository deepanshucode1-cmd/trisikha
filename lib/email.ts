import nodemailer from "nodemailer";
import { logError, logOrder } from "@/lib/logger";

/**
 * HTML escape utility to prevent XSS in emails
 * Use this for any user-provided content embedded in HTML emails
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Sanitize URL to prevent javascript: and other dangerous protocols
 */
export function sanitizeUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return url;
  } catch {
    return "";
  }
}

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
      <p>Your order <strong>#${escapeHtml(orderId)}</strong> has been confirmed.</p>
      <p>Total Amount: <strong>₹${total.toFixed(2)}</strong></p>
      <p>We will notify you once your order is shipped.</p>
      <br/>
      <p>Thank you for shopping with Trishikha Organics!</p>
    `,
  });
}

export async function sendOrderShipped(email: string, orderId: string, trackingUrl?: string): Promise<boolean> {
  const safeTrackingUrl = sanitizeUrl(trackingUrl);
  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Order has been shipped",
    html: `
      <h2>Your order is on its way!</h2>
      <p>Your order <strong>#${escapeHtml(orderId)}</strong> has been shipped.</p>
      ${safeTrackingUrl ? `<p><a href="${escapeHtml(safeTrackingUrl)}">Track your order</a></p>` : ''}
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
      <p>Your order <strong>#${escapeHtml(orderId)}</strong> has been successfully delivered.</p>
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
      <p>Your OTP for order cancellation is: <strong>${escapeHtml(otp)}</strong></p>
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
      <p>A refund of <strong>₹${amount.toFixed(2)}</strong> has been initiated for your order <strong>#${escapeHtml(orderId)}</strong>.</p>
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
      <p>Your return request for order <strong>#${escapeHtml(orderId)}</strong> has been confirmed.</p>
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
      <p>Your return pickup for order <strong>#${escapeHtml(orderId)}</strong> has been scheduled.</p>
      ${pickupDate ? `<p>Expected pickup date: <strong>${escapeHtml(pickupDate)}</strong></p>` : ''}
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
      <p>Good news! Your return for order <strong>#${escapeHtml(orderId)}</strong> has been received and your refund has been processed.</p>
      <br/>
      <h3>Refund Details</h3>
      <p>Amount Refunded: <strong>₹${refundAmount.toFixed(2)}</strong></p>
      ${refundId ? `<p>Refund ID: ${escapeHtml(refundId)}</p>` : ''}
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
      subject: `TrishikhaOrganics: Credit Note - ${escapeHtml(creditNoteNumber)}`,
      html: `
        <h2>Credit Note Generated for Order #${escapeHtml(orderId)}</h2>
        <p>Dear Customer,</p>
        <p>Your refund of <strong>₹${refundAmount.toFixed(2)}</strong> for order <strong>#${escapeHtml(orderId)}</strong> has been processed.</p>
        <p>Please find the attached Credit Note (<strong>${escapeHtml(creditNoteNumber)}</strong>) for your reference.</p>
        <br/>
        <p>The amount should reflect in your account within 5-7 business days.</p>
        <br/>
        <p>Thank you,</p>
        <p>Trishikha Organics Team</p>
      `,
      attachments: [
        {
          filename: `Credit_Note_${creditNoteNumber.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf`,
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

// --- Breach Notification Emails ---

/**
 * Send breach notification to a guest user (by order email)
 */
export async function sendBreachNotificationUser(
  email: string,
  params: {
    incidentType: string;
    affectedData: string[];
    recommendedActions: string[];
    orderId?: string;
  }
): Promise<boolean> {
  const { incidentType, affectedData, recommendedActions, orderId } = params;

  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Important Security Notice",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #c41e3a;">Important Security Notice</h2>
        <p>Dear Customer,</p>
        <p>We are writing to inform you about a security incident that may have affected your information.</p>

        ${orderId ? `<p><strong>Related Order:</strong> #${escapeHtml(orderId)}</p>` : ''}

        <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 5px; padding: 15px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #856404;">What Happened</h3>
          <p>${escapeHtml(incidentType)}</p>
        </div>

        <h3>Information That May Have Been Affected</h3>
        <ul>
          ${affectedData.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>

        <h3>What You Should Do</h3>
        <ul>
          ${recommendedActions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}
        </ul>

        <p>We take the security of your information seriously and are taking steps to prevent this from happening again.</p>

        <p>If you have any questions or notice any suspicious activity related to your orders, please contact us immediately at <a href="mailto:trishikhaorganic@gmail.com">trishikhaorganic@gmail.com</a>.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          We sincerely apologize for any inconvenience this may cause.<br>
          Thank you for your understanding.<br><br>
          Best regards,<br>
          Trishikha Organics Security Team
        </p>
      </div>
    `,
  });
}

/**
 * Send internal security alert to admin team
 */
export async function sendInternalSecurityAlert(
  incidentId: string,
  severity: string,
  details: {
    type: string;
    description: string;
    sourceIp?: string;
    endpoint?: string;
    orderId?: string;
    count?: number;
  }
): Promise<boolean> {
  const alertEmail = process.env.INCIDENT_ALERT_EMAIL || "trishikhaorganic@gmail.com";

  const severityColors: Record<string, string> = {
    critical: "#dc3545",
    high: "#fd7e14",
    medium: "#ffc107",
    low: "#28a745",
  };

  const bgColor = severityColors[severity] || "#6c757d";

  return sendEmail({
    to: alertEmail,
    subject: `[${severity.toUpperCase()}] Security Incident - ${details.type}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${bgColor}; color: white; padding: 15px; border-radius: 5px 5px 0 0;">
          <h2 style="margin: 0;">Security Incident Alert</h2>
          <p style="margin: 5px 0 0 0;">Severity: ${severity.toUpperCase()}</p>
        </div>

        <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 5px 5px;">
          <p><strong>Incident ID:</strong> ${escapeHtml(incidentId)}</p>
          <p><strong>Type:</strong> ${escapeHtml(details.type)}</p>
          <p><strong>Description:</strong> ${escapeHtml(details.description)}</p>

          <h3>Details</h3>
          <table style="width: 100%; border-collapse: collapse;">
            ${details.sourceIp ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Source IP:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(details.sourceIp)}</td></tr>` : ''}
            ${details.endpoint ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Endpoint:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(details.endpoint)}</td></tr>` : ''}
            ${details.orderId ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Order ID:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(details.orderId)}</td></tr>` : ''}
            ${details.count ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Event Count:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${details.count}</td></tr>` : ''}
            <tr><td style="padding: 8px;"><strong>Timestamp:</strong></td><td style="padding: 8px;">${new Date().toISOString()}</td></tr>
          </table>

          <div style="margin-top: 20px; padding: 15px; background-color: #f8f9fa; border-radius: 5px;">
            <p style="margin: 0;"><strong>Action Required:</strong> Please review this incident in the admin dashboard.</p>
          </div>
        </div>
      </div>
    `,
  });
}

/**
 * Send regulatory breach notification template (for GDPR/DPDP compliance)
 * This generates a template that can be used for regulatory reporting
 */
export async function sendRegulatoryBreachNotification(
  params: {
    incidentId: string;
    discoveryDate: Date;
    affectedRecords: number;
    dataTypes: string[];
    containmentActions: string[];
    riskAssessment: string;
  }
): Promise<boolean> {
  const alertEmail = process.env.INCIDENT_ALERT_EMAIL || "trishikhaorganic@gmail.com";

  return sendEmail({
    to: alertEmail,
    subject: `[REGULATORY] Data Breach Report - Incident ${params.incidentId}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
        <h1 style="color: #c41e3a; border-bottom: 2px solid #c41e3a; padding-bottom: 10px;">Data Breach Incident Report</h1>

        <p><em>This report is prepared for regulatory notification purposes (GDPR Article 33, DPDP Act)</em></p>

        <h2>1. Incident Overview</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8f9fa;"><strong>Incident ID</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(params.incidentId)}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8f9fa;"><strong>Discovery Date/Time</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.discoveryDate.toISOString()}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8f9fa;"><strong>Report Generated</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${new Date().toISOString()}</td>
          </tr>
          <tr>
            <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8f9fa;"><strong>Affected Records</strong></td>
            <td style="padding: 10px; border: 1px solid #ddd;">${params.affectedRecords}</td>
          </tr>
        </table>

        <h2>2. Categories of Data Affected</h2>
        <ul>
          ${params.dataTypes.map(type => `<li>${escapeHtml(type)}</li>`).join('')}
        </ul>

        <h2>3. Risk Assessment</h2>
        <p>${escapeHtml(params.riskAssessment)}</p>

        <h2>4. Containment Actions Taken</h2>
        <ol>
          ${params.containmentActions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}
        </ol>

        <h2>5. Data Controller Information</h2>
        <p><strong>Organization:</strong> Trishikha Organics</p>
        <p><strong>Contact:</strong> trishikhaorganic@gmail.com</p>

        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          <strong>Note:</strong> Under GDPR, the supervisory authority must be notified within 72 hours of becoming aware of a personal data breach.
          Under India's DPDP Act, similar notification requirements apply to the Data Protection Board.
        </p>
      </div>
    `,
  });
}

/**
 * Send Data Protection Board (DPB) breach notification template
 * For India's DPDP Act compliance - zero threshold reporting requirement
 * This generates an email that can be used as a template for DPB notification
 */
export async function sendDPBBreachNotification(
  params: {
    incidentId: string;
    breachType: "confidentiality" | "integrity" | "availability";
    discoveryDate: Date;
    affectedDataPrincipals: number;
    dataCategories: string[];
    breachDescription: string;
    containmentMeasures: string[];
    riskMitigation: string[];
    likelyConsequences?: string;
    transferToThirdParty?: boolean;
    crossBorderTransfer?: boolean;
  }
): Promise<boolean> {
  const alertEmail = process.env.INCIDENT_ALERT_EMAIL || "trishikhaorganic@gmail.com";

  const breachTypeLabels: Record<string, string> = {
    confidentiality: "Confidentiality Breach (Unauthorized access/disclosure)",
    integrity: "Integrity Breach (Unauthorized modification/deletion)",
    availability: "Availability Breach (Loss of access to data)",
  };

  return sendEmail({
    to: alertEmail,
    subject: `[DPB NOTIFICATION] Personal Data Breach - Incident ${escapeHtml(params.incidentId)}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; background-color: #fff; border: 2px solid #1a365d;">
        <div style="background-color: #1a365d; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px;">PERSONAL DATA BREACH NOTIFICATION</h1>
          <p style="margin: 10px 0 0 0; font-size: 14px;">Under Digital Personal Data Protection Act, 2023 (DPDP Act)</p>
        </div>

        <div style="padding: 30px;">
          <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
            <p style="margin: 0; color: #92400e; font-weight: bold;">
              ZERO THRESHOLD REPORTING: Under DPDP Act, all personal data breaches must be reported to the Data Protection Board, regardless of the number of affected Data Principals.
            </p>
          </div>

          <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">1. Basic Information</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc; width: 40%;"><strong>Incident Reference ID</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(params.incidentId)}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc;"><strong>Type of Breach</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${escapeHtml(breachTypeLabels[params.breachType])}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc;"><strong>Date/Time of Discovery</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${params.discoveryDate.toISOString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc;"><strong>Report Generated</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${new Date().toISOString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc;"><strong>Affected Data Principals</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${params.affectedDataPrincipals}</td>
            </tr>
          </table>

          <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">2. Description of Breach</h2>
          <p style="padding: 15px; background-color: #f8fafc; border-radius: 8px;">${escapeHtml(params.breachDescription)}</p>

          <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">3. Categories of Personal Data Affected</h2>
          <ul style="padding-left: 20px;">
            ${params.dataCategories.map(cat => `<li style="padding: 5px 0;">${escapeHtml(cat)}</li>`).join('')}
          </ul>

          ${params.likelyConsequences ? `
          <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">4. Likely Consequences</h2>
          <p style="padding: 15px; background-color: #fef2f2; border-radius: 8px; border: 1px solid #fecaca;">${escapeHtml(params.likelyConsequences)}</p>
          ` : ''}

          <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">5. Containment Measures Taken</h2>
          <ol style="padding-left: 20px;">
            ${params.containmentMeasures.map(measure => `<li style="padding: 5px 0;">${escapeHtml(measure)}</li>`).join('')}
          </ol>

          <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">6. Risk Mitigation Measures</h2>
          <ol style="padding-left: 20px;">
            ${params.riskMitigation.map(measure => `<li style="padding: 5px 0;">${escapeHtml(measure)}</li>`).join('')}
          </ol>

          <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">7. Data Fiduciary Information</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc; width: 40%;"><strong>Organization Name</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">Trishikha Organics</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc;"><strong>Contact Email</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">trishikhaorganic@gmail.com</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc;"><strong>Data Processing by Third Party</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${params.transferToThirdParty ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; background-color: #f8fafc;"><strong>Cross-Border Data Transfer</strong></td>
              <td style="padding: 10px; border: 1px solid #ddd;">${params.crossBorderTransfer ? 'Yes' : 'No'}</td>
            </tr>
          </table>

          <div style="background-color: #e0f2fe; border: 1px solid #0284c7; border-radius: 8px; padding: 20px; margin-top: 30px;">
            <h3 style="margin-top: 0; color: #0369a1;">Next Steps</h3>
            <ul style="margin-bottom: 0;">
              <li>Submit this report to the Data Protection Board of India</li>
              <li>Notify affected Data Principals as required</li>
              <li>Preserve all evidence related to the breach</li>
              <li>Implement additional safeguards to prevent recurrence</li>
            </ul>
          </div>
        </div>

        <div style="background-color: #f8fafc; padding: 15px; border-top: 1px solid #ddd; font-size: 12px; color: #64748b;">
          <p style="margin: 0 0 10px 0;"><strong>Legal Disclaimer:</strong> This notification is prepared in compliance with the Digital Personal Data Protection Act, 2023. The Data Fiduciary is required to notify the Data Protection Board within the prescribed time period of becoming aware of a personal data breach.</p>
          <p style="margin: 0;">Generated: ${new Date().toISOString()}</p>
        </div>
      </div>
    `,
  });
}

// --- Data Deletion Request Emails (DPDP Compliance) ---

/**
 * Send deletion request confirmation email
 * Sent when a user initiates a data deletion request
 */
export async function sendDeletionRequestConfirmation(params: {
  email: string;
  requestId: string;
  scheduledDate: Date;
  cancelUrl: string;
}): Promise<boolean> {
  const { email, requestId, scheduledDate, cancelUrl } = params;
  const safeCancelUrl = sanitizeUrl(cancelUrl);
  const formattedDate = scheduledDate.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Your Data Deletion Request",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #166534;">Data Deletion Request Received</h2>
        <p>Dear Customer,</p>
        <p>We have received your request to delete your personal data from Trishikha Organics.</p>

        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #92400e;">Important: 14-Day Window Period</h3>
          <p style="margin-bottom: 0;">Your data is scheduled to be deleted on:</p>
          <p style="font-size: 20px; font-weight: bold; color: #92400e; margin: 10px 0;">${escapeHtml(formattedDate)}</p>
          <p style="margin-bottom: 0;">You can cancel this request anytime before this date.</p>
        </div>

        <h3>What Will Happen</h3>
        <ul>
          <li>All your order history will be anonymized</li>
          <li>Your email, phone number, and address will be removed</li>
          <li>Order records will be retained for tax compliance (without personal identifiers)</li>
        </ul>

        <h3>Changed Your Mind?</h3>
        <p>If you want to cancel this deletion request, you can do so by:</p>
        <ol>
          <li>Visiting <a href="${escapeHtml(safeCancelUrl)}">${escapeHtml(safeCancelUrl)}</a></li>
          <li>Verifying your email with OTP</li>
          <li>Clicking "Cancel Deletion Request"</li>
        </ol>

        <div style="background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Reference ID:</strong> ${escapeHtml(requestId)}</p>
        </div>

        <p>If you did not make this request, please visit the link above to cancel it immediately.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          This is an automated message regarding your data protection rights under DPDP Act.<br>
          Thank you for shopping with Trishikha Organics.
        </p>
      </div>
    `,
  });
}

/**
 * Send deletion reminder email
 * Sent on Day 1, 7, and 13 of the waiting period
 */
export async function sendDeletionReminder(params: {
  email: string;
  daysRemaining: number;
  scheduledDate: Date;
  cancelUrl: string;
}): Promise<boolean> {
  const { email, daysRemaining, scheduledDate, cancelUrl } = params;
  const safeCancelUrl = sanitizeUrl(cancelUrl);
  const formattedDate = scheduledDate.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const urgencyColor = daysRemaining <= 1 ? "#dc2626" : daysRemaining <= 7 ? "#f59e0b" : "#166534";
  const urgencyBg = daysRemaining <= 1 ? "#fef2f2" : daysRemaining <= 7 ? "#fef3c7" : "#f0fdf4";
  const urgencyBorder = daysRemaining <= 1 ? "#fecaca" : daysRemaining <= 7 ? "#f59e0b" : "#22c55e";

  return sendEmail({
    to: email,
    subject: `TrishikhaOrganics: ${daysRemaining} Day${daysRemaining === 1 ? '' : 's'} Until Your Data Is Deleted`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: ${urgencyColor};">Data Deletion Reminder</h2>
        <p>Dear Customer,</p>
        <p>This is a reminder that your data deletion request is still active.</p>

        <div style="background-color: ${urgencyBg}; border: 1px solid ${urgencyBorder}; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <p style="margin: 0; font-size: 16px;">Your data will be permanently deleted in:</p>
          <p style="font-size: 48px; font-weight: bold; color: ${urgencyColor}; margin: 15px 0;">${daysRemaining}</p>
          <p style="margin: 0; font-size: 14px;">day${daysRemaining === 1 ? '' : 's'}</p>
          <p style="margin: 15px 0 0 0; font-size: 14px;">Scheduled deletion date: <strong>${escapeHtml(formattedDate)}</strong></p>
        </div>

        ${daysRemaining <= 1 ? `
        <div style="background-color: #fef2f2; border: 2px solid #dc2626; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #dc2626; font-weight: bold;">⚠️ FINAL WARNING: This is your last chance to cancel the deletion request!</p>
        </div>
        ` : ''}

        <h3>Want to Keep Your Data?</h3>
        <p>If you've changed your mind, you can cancel this request:</p>
        <p style="text-align: center; margin: 25px 0;">
          <a href="${escapeHtml(safeCancelUrl)}" style="background-color: #22c55e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Cancel Deletion Request</a>
        </p>

        <p style="color: #666; font-size: 14px;">Once deleted, your order history and personal information cannot be recovered.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          This is an automated reminder regarding your data deletion request.<br>
          Thank you for shopping with Trishikha Organics.
        </p>
      </div>
    `,
  });
}

/**
 * Send deletion completed email
 * Sent after data has been successfully anonymized
 */
export async function sendDeletionCompleted(params: {
  email: string;
  ordersAnonymized: number;
}): Promise<boolean> {
  const { email, ordersAnonymized } = params;

  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Your Data Has Been Deleted",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #166534;">Data Deletion Complete</h2>
        <p>Dear Customer,</p>
        <p>As per your request, we have successfully deleted your personal data from our systems.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #166534;">Summary</h3>
          <ul style="margin-bottom: 0;">
            <li>Orders anonymized: <strong>${ordersAnonymized}</strong></li>
            <li>Personal information removed: Email, phone, address</li>
            <li>Completed on: <strong>${new Date().toLocaleDateString("en-IN")}</strong></li>
          </ul>
        </div>

        <h3>What We Retained</h3>
        <p>For tax compliance purposes (GST Act), we retain anonymized order records without any personal identifiers. These records:</p>
        <ul>
          <li>Cannot be linked back to you</li>
          <li>Do not contain your name, email, phone, or address</li>
          <li>Will be permanently deleted after the 8-year retention period</li>
        </ul>

        <p>This email will be the last communication you receive from us at this email address.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          Your data protection rights have been honored under the DPDP Act.<br>
          Thank you for being a customer of Trishikha Organics.
        </p>
      </div>
    `,
  });
}

// --- Grievance Redressal Emails (DPDP Rule 14(3)) ---

/**
 * Send grievance received confirmation email
 * Sent when a guest submits a new grievance
 */
export async function sendGrievanceReceived(params: {
  email: string;
  grievanceId: string;
  subject: string;
  slaDeadline: Date;
}): Promise<boolean> {
  const { email, grievanceId, subject, slaDeadline } = params;
  const formattedDeadline = slaDeadline.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Grievance Received",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #166534;">Grievance Received</h2>
        <p>Dear Customer,</p>
        <p>Your grievance has been received and registered in our system.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Reference ID:</strong> ${escapeHtml(grievanceId)}</p>
          <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <p style="margin: 0;"><strong>Response Deadline:</strong> ${escapeHtml(formattedDeadline)}</p>
        </div>

        <p>As per DPDP Rules 2025, we will address your grievance within <strong>90 days</strong> from the date of receipt.</p>

        <p>You can check the status of your grievance at any time by visiting our grievance page and verifying your email.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          This is an automated acknowledgment under DPDP Rules 2025 Rule 14(3).<br>
          Thank you for shopping with Trishikha Organics.
        </p>
      </div>
    `,
  });
}

/**
 * Send grievance status update email
 * Sent when an admin changes the grievance status
 */
export async function sendGrievanceStatusUpdate(params: {
  email: string;
  grievanceId: string;
  subject: string;
  newStatus: string;
  adminNotes?: string;
}): Promise<boolean> {
  const { email, grievanceId, subject, newStatus, adminNotes } = params;

  const statusLabels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    resolved: "Resolved",
    closed: "Closed",
  };

  const statusColors: Record<string, string> = {
    open: "#f59e0b",
    in_progress: "#3b82f6",
    resolved: "#22c55e",
    closed: "#6b7280",
  };

  const label = statusLabels[newStatus] || newStatus;
  const color = statusColors[newStatus] || "#6b7280";

  return sendEmail({
    to: email,
    subject: `TrishikhaOrganics: Grievance Status Updated - ${label}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a365d;">Grievance Status Update</h2>
        <p>Dear Customer,</p>
        <p>Your grievance status has been updated.</p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Reference ID:</strong> ${escapeHtml(grievanceId)}</p>
          <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <p style="margin: 0;">
            <strong>New Status:</strong>
            <span style="display: inline-block; padding: 4px 12px; border-radius: 20px; background-color: ${color}; color: white; font-size: 14px;">${escapeHtml(label)}</span>
          </p>
        </div>

        ${adminNotes ? `
        <div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 5px 0; font-weight: bold; color: #92400e;">Notes from our team:</p>
          <p style="margin: 0; color: #78350f;">${escapeHtml(adminNotes)}</p>
        </div>
        ` : ""}

        <p>You can check the full details of your grievance by visiting our grievance page.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          Thank you for your patience.<br>
          Trishikha Organics
        </p>
      </div>
    `,
  });
}

/**
 * Send grievance resolved email
 * Sent when a grievance is resolved with resolution notes
 */
export async function sendGrievanceResolved(params: {
  email: string;
  grievanceId: string;
  subject: string;
  resolutionNotes: string;
}): Promise<boolean> {
  const { email, grievanceId, subject, resolutionNotes } = params;

  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Grievance Resolved",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #166534;">Grievance Resolved</h2>
        <p>Dear Customer,</p>
        <p>We are pleased to inform you that your grievance has been resolved.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>Reference ID:</strong> ${escapeHtml(grievanceId)}</p>
          <p style="margin: 0 0 10px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
          <p style="margin: 0;"><strong>Resolved on:</strong> ${new Date().toLocaleDateString("en-IN")}</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0 0 5px 0; font-weight: bold;">Resolution:</p>
          <p style="margin: 0;">${escapeHtml(resolutionNotes)}</p>
        </div>

        <p>If you are not satisfied with the resolution, you may file a new grievance or contact our Grievance Officer at <a href="mailto:trishikhaorganic@gmail.com">trishikhaorganic@gmail.com</a>.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          Your rights under the DPDP Act 2023 are important to us.<br>
          Thank you for shopping with Trishikha Organics.
        </p>
      </div>
    `,
  });
}

/**
 * Send deletion cancelled confirmation email
 * Sent when a user cancels their deletion request
 */
export async function sendDeletionCancelled(params: {
  email: string;
  cancelledAt: Date;
}): Promise<boolean> {
  const { email, cancelledAt } = params;
  const formattedDate = cancelledAt.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return sendEmail({
    to: email,
    subject: "TrishikhaOrganics: Data Deletion Request Cancelled",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #166534;">Deletion Request Cancelled</h2>
        <p>Dear Customer,</p>
        <p>Your data deletion request has been successfully cancelled.</p>

        <div style="background-color: #f0fdf4; border: 1px solid #22c55e; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0;"><strong>Cancelled on:</strong> ${escapeHtml(formattedDate)}</p>
        </div>

        <h3>Your Data Is Safe</h3>
        <p>Your personal information and order history will continue to be stored securely. You can:</p>
        <ul>
          <li>View your order history at any time</li>
          <li>Request data export for your records</li>
          <li>Submit a new deletion request if you change your mind</li>
        </ul>

        <p>If you did not cancel this request, please contact us immediately.</p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #888; font-size: 12px;">
          Thank you for being a customer of Trishikha Organics.
        </p>
      </div>
    `,
  });
}
