import { createServiceClient } from "@/utils/supabase/service";
import { logError } from "@/lib/logger";

// Company details - matches receipt.ts
const COMPANY = {
    name: "Trishikha Organics",
    address: "Plot No 27, Swagat Industrial Area Park Vill. Dhanot, Kadi Chatral Road, Ta. Kalol",
    city: "Gandhi Nagar Gujarat - 382721",
    email: "trishikhaorganic@gmail.com",
    phone: "+91 7984130253",
    gstin: process.env.COMPANY_GSTIN || "",
    stateCode: process.env.COMPANY_STATE_CODE || "24",
};

interface OrderItem {
    product_name: string;
    sku?: string | null;
    hsn?: string | null;
    unit_price: number;
    quantity: number;
    total_price: number;
    gst_rate?: number;
    taxable_amount?: number;
    gst_amount?: number;
}

interface OrderDetails {
    id: string;
    created_at: string;
    billing_name: string;
    billing_address_line1: string;
    billing_address_line2?: string | null;
    billing_city: string;
    billing_state: string;
    billing_pincode: string;
    billing_country: string;
    guest_email?: string;
    guest_phone?: string | null;
    guest_gstin?: string | null;
    total_amount: number;
    refund_amount?: number;
    refund_id?: string;
    credit_note_number?: string;
    invoice_number?: string;
    // Tax fields
    taxable_amount?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    total_gst_amount?: number;
    gst_rate?: number;
    supply_type?: "intrastate" | "interstate";
    shipping_cost?: number;
}

/**
 * Generate sequential credit note number using database sequence
 * Format: CN-{FY}-{SEQ} e.g., CN-2526-00001
 */
export async function generateCreditNoteNumber(): Promise<string> {
    const supabase = createServiceClient();

    try {
        const { data, error } = await supabase.rpc("get_next_credit_note_number");

        if (error) {
            logError(error, { context: "credit_note_sequence_rpc_error" });
            throw error;
        }

        if (data) {
            return data as string;
        }
    } catch (err) {
        logError(err as Error, { context: "credit_note_number_generation_failed" });
    }

    // Fallback: timestamp-based (should rarely happen)
    const now = new Date();
    const ts = now.getTime().toString(36).toUpperCase();
    return `CN-${now.getFullYear()}-${ts.slice(-6)}`;
}

/**
 * Generate Credit Note PDF matching the receipt.ts styling
 */
export async function generateCreditNotePDF(
    order: OrderDetails,
    items: OrderItem[]
): Promise<Buffer> {
    // Dynamic import to avoid Next.js bundling issues
    const PDFDocument = (await import("pdfkit")).default;

    return new Promise((resolve, reject) => {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const doc = new PDFDocument({ margin: 50, size: "A4" }) as any;
            const chunks: Buffer[] = [];

            doc.on("data", (chunk: Buffer) => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);

            const creditNoteNo = order.credit_note_number || "PENDING";
            const creditNoteDate = new Date().toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
            });
            const originalOrderDate = new Date(order.created_at).toLocaleDateString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }
            );

            // Header - Company Name
            doc
                .fontSize(20)
                .font("Helvetica-Bold")
                .text(COMPANY.name, { align: "center" });
            doc.moveDown(0.5);
            doc
                .fontSize(10)
                .font("Helvetica")
                .text(COMPANY.address, { align: "center" });
            doc.text(COMPANY.city, { align: "center" });
            if (COMPANY.gstin) {
                doc.text(`GSTIN: ${COMPANY.gstin}`, { align: "center" });
            }

            doc.moveDown(1);
            doc
                .fontSize(16)
                .font("Helvetica-Bold")
                .text("CREDIT NOTE", { align: "center" });
            doc.moveDown(1);

            // Credit Note details - two column layout
            const leftCol = 50;
            const rightCol = 350;
            let y = doc.y;

            doc.fontSize(10).font("Helvetica");
            doc.text(`Credit Note No: ${creditNoteNo}`, leftCol, y);
            doc.text(`Date: ${creditNoteDate}`, rightCol, y);
            y += 15;
            doc.text(
                `Against Order: ${order.invoice_number || order.id.slice(0, 8).toUpperCase()}`,
                leftCol,
                y
            );
            doc.text(`Original Date: ${originalOrderDate}`, rightCol, y);
            y += 15;
            if (order.refund_id) {
                doc.text(`Refund ID: ${order.refund_id}`, leftCol, y);
                y += 15;
            }

            doc.moveDown(2);

            // Billing details
            y = doc.y;
            doc.font("Helvetica-Bold").text("Credit To:", leftCol, y);
            y += 15;

            doc.font("Helvetica");
            doc.text(order.billing_name, leftCol, y);
            y += 12;
            doc.text(order.billing_address_line1, leftCol, y);
            y += 12;
            if (order.billing_address_line2) {
                doc.text(order.billing_address_line2, leftCol, y);
                y += 12;
            }
            doc.text(
                `${order.billing_city}, ${order.billing_state} - ${order.billing_pincode}`,
                leftCol,
                y
            );
            y += 12;
            doc.text(order.billing_country, leftCol, y);
            y += 12;
            if (order.guest_email) {
                doc.text(`Email: ${order.guest_email}`, leftCol, y);
                y += 12;
            }
            if (order.guest_gstin) {
                doc.text(`GSTIN: ${order.guest_gstin}`, leftCol, y);
                y += 12;
            }

            doc.moveDown(2);

            // Items table
            const tableTop = doc.y;
            const tableHeaders = [
                "#",
                "Product",
                "HSN",
                "Qty",
                "Rate",
                "Taxable",
                "GST",
                "Shipping",
            ];
            const colWidths = [20, 130, 50, 30, 55, 55, 45, 60];
            const colX = [50, 70, 200, 250, 280, 335, 390, 435];

            // Table header
            doc.font("Helvetica-Bold");
            doc.rect(50, tableTop, 495, 20).fill("#f0f0f0").stroke();
            doc.fillColor("#000");

            tableHeaders.forEach((header, i) => {
                doc.text(header, colX[i], tableTop + 5, {
                    width: colWidths[i],
                    align: i >= 3 ? "right" : "left",
                });
            });

            // Table rows
            doc.font("Helvetica");
            let rowY = tableTop + 25;
            let totalTaxable = 0;
            let totalGst = 0;

            items.forEach((item, index) => {
                const rowHeight = 20;

                // Use stored values if available, otherwise calculate
                const taxableAmount =
                    item.taxable_amount ??
                    Math.round((item.total_price / 1.05) * 100) / 100;
                const gstAmount =
                    item.gst_amount ??
                    Math.round((item.total_price - taxableAmount) * 100) / 100;

                totalTaxable += taxableAmount;
                totalGst += gstAmount;

                // Calculate unit taxable rate
                const unitTaxable = taxableAmount / item.quantity;

                doc.text(String(index + 1), colX[0], rowY, { width: colWidths[0] });
                doc.text(item.product_name.substring(0, 25), colX[1], rowY, {
                    width: colWidths[1],
                });
                doc.text(item.hsn || "-", colX[2], rowY, { width: colWidths[2] });
                doc.text(String(item.quantity), colX[3], rowY, {
                    width: colWidths[3],
                    align: "right",
                });
                doc.text(unitTaxable.toFixed(2), colX[4], rowY, {
                    width: colWidths[4],
                    align: "right",
                });
                doc.text(taxableAmount.toFixed(2), colX[5], rowY, {
                    width: colWidths[5],
                    align: "right",
                });
                doc.text(gstAmount.toFixed(2), colX[6], rowY, {
                    width: colWidths[6],
                    align: "right",
                });
                doc.text(item.total_price.toFixed(2), colX[7], rowY, {
                    width: colWidths[7],
                    align: "right",
                });

                rowY += rowHeight;

                // Draw row separator
                doc
                    .moveTo(50, rowY - 5)
                    .lineTo(545, rowY - 5)
                    .strokeColor("#ddd")
                    .stroke();
            });

            // Tax Summary section
            rowY += 10;
            doc.font("Helvetica").fontSize(10).fillColor("#000");

            // Use stored order values or calculated totals
            const taxableTotal = order.taxable_amount ?? totalTaxable;
            const gstRate = order.gst_rate ?? 5;

            doc.text("Taxable Value:", 350, rowY);
            doc.text(`Rs ${taxableTotal.toFixed(2)}`, 450, rowY, {
                width: 95,
                align: "right",
            });
            rowY += 15;

            // GST breakdown based on supply type
            if (order.supply_type === "interstate") {
                // IGST for interstate
                doc.text(`IGST @${gstRate}%:`, 350, rowY);
                const igstAmount = order.igst_amount ?? totalGst;
                doc.text(`Rs ${igstAmount.toFixed(2)}`, 450, rowY, {
                    width: 95,
                    align: "right",
                });
                rowY += 15;
            } else {
                // CGST + SGST for intrastate (default)
                const halfRate = gstRate / 2;
                const cgstAmount =
                    order.cgst_amount ?? Math.round((totalGst / 2) * 100) / 100;
                const sgstAmount =
                    order.sgst_amount ?? Math.round((totalGst / 2) * 100) / 100;

                doc.text(`CGST @${halfRate}%:`, 350, rowY);
                doc.text(`Rs ${cgstAmount.toFixed(2)}`, 450, rowY, {
                    width: 95,
                    align: "right",
                });
                rowY += 15;

                doc.text(`SGST @${halfRate}%:`, 350, rowY);
                doc.text(`Rs ${sgstAmount.toFixed(2)}`, 450, rowY, {
                    width: 95,
                    align: "right",
                });
                rowY += 15;
            }

            // Shipping refund (if applicable)
            if (order.shipping_cost && order.shipping_cost > 0) {
                doc.text("Shipping:", 350, rowY);
                doc.text(`Rs ${order.shipping_cost.toFixed(2)}`, 450, rowY, {
                    width: 95,
                    align: "right",
                });
                rowY += 15;
            }

            // Grand Total with highlight
            rowY += 5;
            doc.rect(340, rowY, 205, 25).fill("#f0f0f0").stroke();
            doc.fillColor("#000").font("Helvetica-Bold");
            doc.text("Total Credit Amount:", 350, rowY + 7);
            const refundTotal = order.refund_amount ?? order.total_amount;
            doc.text(`Rs ${refundTotal.toFixed(2)}`, 450, rowY + 7, {
                width: 95,
                align: "right",
            });

            // Footer
            doc.moveDown(4);
            doc.font("Helvetica").fontSize(9).fillColor("#666");
            doc.text(
                "This is a computer-generated credit note and does not require a signature.",
                50,
                doc.y,
                { align: "center" }
            );
            doc.moveDown(0.5);
            doc.text(
                "The refund amount will be credited to your original payment method within 5-7 business days.",
                { align: "center" }
            );
            doc.moveDown(0.5);
            doc.text(`Thank you for shopping with ${COMPANY.name}!`, {
                align: "center",
            });

            doc.end();
        } catch (error) {
            reject(error);
        }
    });
}
