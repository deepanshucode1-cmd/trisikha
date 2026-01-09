interface OrderItem {
  product_name: string;
  sku: string | null;
  hsn: string | null;
  unit_price: number;
  quantity: number;
  total_price: number;
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
}

// Company details - update these as needed
const COMPANY = {
  name: "Trishikha Organics",
  address: "Plot No 27, Swagat Industrial Area Park Vill. Dhanot, Kadi Chatral Road, Ta. Kalol ",
  city: "Gandhi Nagar Gujarat - 382721",
  email: "trishikhaorganic@gmail.com",
  phone: "+91 7984130253",
  gstin: "", // Add GSTIN if registered
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
      y = doc.y;
      doc.font("Helvetica-Bold").text("Bill To:", leftCol, y);
      doc.font("Helvetica-Bold").text("Ship To:", rightCol, y);
      y += 15;

      doc.font("Helvetica");
      doc.text(order.billing_name, leftCol, y, { width: 200 });
      doc.text(order.shipping_name, rightCol, y, { width: 200 });
      y += 12;

      doc.text(order.billing_address_line1, leftCol, y, { width: 200 });
      doc.text(order.shipping_address_line1, rightCol, y, { width: 200 });
      y += 12;

      if (order.billing_address_line2 || order.shipping_address_line2) {
        doc.text(order.billing_address_line2 || "", leftCol, y, { width: 200 });
        doc.text(order.shipping_address_line2 || "", rightCol, y, {
          width: 200,
        });
        y += 12;
      }

      doc.text(
        `${order.billing_city}, ${order.billing_state}`,
        leftCol,
        y,
        { width: 200 }
      );
      doc.text(
        `${order.shipping_city}, ${order.shipping_state}`,
        rightCol,
        y,
        { width: 200 }
      );
      y += 12;

      doc.text(
        `${order.billing_pincode}, ${order.billing_country}`,
        leftCol,
        y,
        { width: 200 }
      );
      doc.text(
        `${order.shipping_pincode}, ${order.shipping_country}`,
        rightCol,
        y,
        { width: 200 }
      );
      y += 12;

      doc.text(`Email: ${order.guest_email}`, leftCol, y);
      if (order.guest_phone) {
        doc.text(`Phone: ${order.guest_phone}`, rightCol, y);
      }

      doc.moveDown(2);

      // Items table
      const tableTop = doc.y;
      const tableHeaders = ["#", "Product", "HSN", "Qty", "Rate", "Amount"];
      const colWidths = [30, 180, 70, 50, 70, 80];
      const colX = [50, 80, 260, 330, 380, 450];

      // Table header
      doc.font("Helvetica-Bold");
      doc
        .rect(50, tableTop, 500, 20)
        .fill("#f0f0f0")
        .stroke();
      doc.fillColor("#000");

      tableHeaders.forEach((header, i) => {
        doc.text(header, colX[i], tableTop + 5, {
          width: colWidths[i],
          align: i > 2 ? "right" : "left",
        });
      });

      // Table rows
      doc.font("Helvetica");
      let rowY = tableTop + 25;

      items.forEach((item, index) => {
        const rowHeight = 20;

        doc.text(String(index + 1), colX[0], rowY, { width: colWidths[0] });
        doc.text(item.product_name, colX[1], rowY, { width: colWidths[1] });
        doc.text(item.hsn || "-", colX[2], rowY, { width: colWidths[2] });
        doc.text(String(item.quantity), colX[3], rowY, {
          width: colWidths[3],
          align: "right",
        });
        doc.text(`₹${item.unit_price.toFixed(2)}`, colX[4], rowY, {
          width: colWidths[4],
          align: "right",
        });
        doc.text(`₹${item.total_price.toFixed(2)}`, colX[5], rowY, {
          width: colWidths[5],
          align: "right",
        });

        rowY += rowHeight;

        // Draw row separator
        doc
          .moveTo(50, rowY - 5)
          .lineTo(550, rowY - 5)
          .strokeColor("#ddd")
          .stroke();
      });

      // Total section
      rowY += 10;
      doc
        .rect(350, rowY, 200, 25)
        .fill("#f0f0f0")
        .stroke();
      doc.fillColor("#000").font("Helvetica-Bold");
      doc.text("Total Amount:", 360, rowY + 7);
      doc.text(`₹${order.total_amount.toFixed(2)}`, 450, rowY + 7, {
        width: 90,
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
