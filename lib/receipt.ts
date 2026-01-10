interface OrderItem {
  product_name: string;
  sku: string | null;
  hsn: string | null;
  unit_price: number;
  quantity: number;
  total_price: number;
  gst_rate?: number;
  taxable_amount?: number;
  gst_amount?: number;
}

interface OrderData {
  id: string;
  guest_email: string;
  guest_phone: string | null;
  total_amount: number;
  currency: string;
  payment_id: string;
  created_at: string;
  billing_name: string;
  billing_address_line1: string;
  billing_address_line2: string | null;
  billing_city: string;
  billing_state: string;
  billing_pincode: string;
  billing_country: string;
  shipping_name: string;
  shipping_address_line1: string;
  shipping_address_line2: string | null;
  shipping_city: string;
  shipping_state: string;
  shipping_pincode: string;
  shipping_country: string;
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

// Company details - update these as needed
const COMPANY = {
  name: "Trishikha Organics",
  address: "Plot No 27, Swagat Industrial Area Park Vill. Dhanot, Kadi Chatral Road, Ta. Kalol ",
  city: "Gandhi Nagar Gujarat - 382721",
  email: "trishikhaorganic@gmail.com",
  phone: "+91 7984130253",
  gstin: process.env.COMPANY_GSTIN || "",
  stateCode: process.env.COMPANY_STATE_CODE || "24",
};

export async function generateReceiptPDF(
  order: OrderData,
  items: OrderItem[]
): Promise<Buffer> {
  // Dynamic import to avoid bundling issues with Next.js
  const PDFDocument = (await import("pdfkit")).default;

  return new Promise((resolve, reject) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = new PDFDocument({ margin: 50, size: "A4" }) as any;
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
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
        .text("TAX INVOICE / RECEIPT", { align: "center" });
      doc.moveDown(1);

      // Invoice details
      const invoiceDate = new Date(order.created_at).toLocaleDateString(
        "en-IN",
        {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }
      );

      doc.fontSize(10).font("Helvetica");

      // Two column layout for invoice info
      const leftCol = 50;
      const rightCol = 350;
      let y = doc.y;

      doc.text(`Invoice No: ${order.id.slice(0, 8).toUpperCase()}`, leftCol, y);
      doc.text(`Date: ${invoiceDate}`, rightCol, y);
      y += 15;
      doc.text(`Payment ID: ${order.payment_id}`, leftCol, y);
      doc.text(`Order ID: ${order.id}`, rightCol, y);

      doc.moveDown(2);

      // Billing & Shipping addresses
// Billing & Shipping addresses
      y = doc.y;
      doc.font("Helvetica-Bold").text("Bill To:", leftCol, y);
      doc.font("Helvetica-Bold").text("Ship To:", rightCol, y);
      y += 15;

      doc.font("Helvetica");

      // Helper function to print aligned rows dynamically
      // This prevents overlapping if text wraps to a second line
      const printRow = (leftText: string, rightText: string, currentY: number) => {
        const leftH = doc.heightOfString(leftText, { width: 200 });
        const rightH = doc.heightOfString(rightText, { width: 200 });
        const maxH = Math.max(leftH, rightH);

        doc.text(leftText, leftCol, currentY, { width: 200 });
        doc.text(rightText, rightCol, currentY, { width: 200 });
        
        // Return new Y position: current + max height + 2px padding
        return currentY + maxH + 2; 
      };

      // 1. Name
      y = printRow(order.billing_name, order.shipping_name, y);

      // 2. Address Line 1
      y = printRow(order.billing_address_line1, order.shipping_address_line1, y);

      // 3. Address Line 2 (Only if exists)
      if (order.billing_address_line2 || order.shipping_address_line2) {
        y = printRow(
          order.billing_address_line2 || "", 
          order.shipping_address_line2 || "", 
          y
        );
      }

      // 4. City, State
      y = printRow(
        `${order.billing_city}, ${order.billing_state}`,
        `${order.shipping_city}, ${order.shipping_state}`,
        y
      );

      // 5. Pincode, Country
      y = printRow(
        `${order.billing_pincode}, ${order.billing_country}`,
        `${order.shipping_pincode}, ${order.shipping_country}`,
        y
      );

      // 6. Contact Info
      // We handle this manually since the right column (phone) is optional
      const emailHeight = doc.heightOfString(`Email: ${order.guest_email}`, { width: 200 });
      doc.text(`Email: ${order.guest_email}`, leftCol, y, { width: 200 });
      
      if (order.guest_phone) {
        doc.text(`Phone: ${order.guest_phone}`, rightCol, y, { width: 200 });
      }
      // Move down based on email height (usually the longer one)
      y += emailHeight + 2;

      doc.moveDown(2);      // Items table
      const tableTop = doc.y;
      const tableHeaders = ["#", "Product", "HSN", "Qty", "Rate", "Taxable", "GST", "Amount"];
      const colWidths = [20, 130, 50, 30, 55, 55, 45, 60];
      const colX = [50, 70, 200, 250, 280, 335, 390, 435];

      // Table header
      doc.font("Helvetica-Bold");
      doc
        .rect(50, tableTop, 495, 20)
        .fill("#f0f0f0")
        .stroke();
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

      items.forEach((item, index) => {
        const rowHeight = 20;
        // Calculate taxable and GST if not provided
        const taxableAmount = item.taxable_amount ?? Math.round((item.total_price / 1.05) * 100) / 100;
        const gstAmount = item.gst_amount ?? Math.round((item.total_price - taxableAmount) * 100) / 100;

        doc.text(String(index + 1), colX[0], rowY, { width: colWidths[0] });
        doc.text(item.product_name, colX[1], rowY, { width: colWidths[1] });
        doc.text(item.hsn || "-", colX[2], rowY, { width: colWidths[2] });
        doc.text(String(item.quantity), colX[3], rowY, {
          width: colWidths[3],
          align: "right",
        });
        doc.text(`${item.unit_price.toFixed(2)}`, colX[4], rowY, {
          width: colWidths[4],
          align: "right",
        });
        doc.text(`${taxableAmount.toFixed(2)}`, colX[5], rowY, {
          width: colWidths[5],
          align: "right",
        });
        doc.text(`${gstAmount.toFixed(2)}`, colX[6], rowY, {
          width: colWidths[6],
          align: "right",
        });
        doc.text(`${item.total_price.toFixed(2)}`, colX[7], rowY, {
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

      // Taxable Value
      doc.text("Taxable Value:", 350, rowY);
      const taxableTotal = order.taxable_amount ?? Math.round((order.total_amount - (order.shipping_cost || 0)) / 1.05 * 100) / 100;
      doc.text(`Rs ${taxableTotal.toFixed(2)}`, 450, rowY, { width: 95, align: "right" });
      rowY += 15;

      // GST breakdown based on supply type
      const gstRate = order.gst_rate ?? 5;
      if (order.supply_type === "interstate") {
        // IGST for interstate
        doc.text(`IGST @${gstRate}%:`, 350, rowY);
        const igstAmount = order.igst_amount ?? order.total_gst_amount ?? Math.round((order.total_amount - (order.shipping_cost || 0) - taxableTotal) * 100) / 100;
        doc.text(`Rs ${igstAmount.toFixed(2)}`, 450, rowY, { width: 95, align: "right" });
        rowY += 15;
      } else {
        // CGST + SGST for intrastate
        const halfRate = gstRate / 2;
        doc.text(`CGST @${halfRate}%:`, 350, rowY);
        const cgstAmount = order.cgst_amount ?? Math.round((order.total_gst_amount ?? 0) / 2 * 100) / 100;
        doc.text(`Rs ${cgstAmount.toFixed(2)}`, 450, rowY, { width: 95, align: "right" });
        rowY += 15;

        doc.text(`SGST @${halfRate}%:`, 350, rowY);
        const sgstAmount = order.sgst_amount ?? Math.round((order.total_gst_amount ?? 0) / 2 * 100) / 100;
        doc.text(`Rs ${sgstAmount.toFixed(2)}`, 450, rowY, { width: 95, align: "right" });
        rowY += 15;
      }

      // Shipping (if applicable)
      if (order.shipping_cost && order.shipping_cost > 0) {
        doc.text("Shipping:", 350, rowY);
        doc.text(`Rs ${order.shipping_cost.toFixed(2)}`, 450, rowY, { width: 95, align: "right" });
        rowY += 15;
      }

      // Grand Total with highlight
      rowY += 5;
      doc
        .rect(340, rowY, 205, 25)
        .fill("#f0f0f0")
        .stroke();
      doc.fillColor("#000").font("Helvetica-Bold");
      doc.text("Grand Total:", 350, rowY + 7);
      doc.text(`Rs ${order.total_amount.toFixed(2)}`, 450, rowY + 7, {
        width: 95,
        align: "right",
      });

      // Footer
      doc.moveDown(4);
      doc.font("Helvetica").fontSize(9).fillColor("#666");
      doc.text(
        "This is a computer-generated invoice and does not require a signature.",
        50,
        doc.y,
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
