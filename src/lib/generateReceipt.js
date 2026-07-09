import { jsPDF } from 'jspdf';

// Session 21 — printable/downloadable purchase receipts, mainly so
// corp-linked staff who use the "pay by card yourself" fallback have
// something to submit for reimbursement. Works for any completed order
// though, not just card-fallback ones — shared by OrderConfirmation.js
// (right after purchase) and Purchases.js (any past order).

const BRAND_GREEN = [30, 142, 94];   // #1E8E5E
const TEXT_DARK = [22, 39, 30];      // #16271E
const TEXT_MUTED = [106, 122, 112];  // #6A7A70
const LINE = [226, 233, 229];        // #E2E9E5
const FILL = [244, 248, 246];        // #F4F8F6

const PAYMENT_LABELS = {
  card: 'Credit / Debit Card',
  wallet: 'Juzgo Wallet',
  corp_wallet: 'Corporate Wallet',
  gifted: 'Gifted',
};

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-SG', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtMoney(n) {
  return `SGD ${parseFloat(n || 0).toFixed(2)}`;
}

export function generateReceiptPDF(order) {
  if (!order) return;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 56;
  let y = 64;

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...BRAND_GREEN);
  doc.text('Juzgo', marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('juzgo.world  ·  hello@juzgo.world', marginX, y + 16);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...TEXT_DARK);
  doc.text('PURCHASE RECEIPT', pageWidth - marginX, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Order ${order.order_code || '—'}`, pageWidth - marginX, y + 16, { align: 'right' });
  doc.text(fmtDate(order.created_at), pageWidth - marginX, y + 30, { align: 'right' });

  y += 56;
  doc.setDrawColor(...LINE);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 28;

  // Billed to
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('BILLED TO', marginX, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...TEXT_DARK);
  doc.text(order.customer_name || order.customer_email || '—', marginX, y);
  y += 15;
  if (order.customer_name && order.customer_email) {
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(order.customer_email, marginX, y);
    y += 15;
  }

  y += 20;

  // Item table header
  doc.setFillColor(...FILL);
  doc.rect(marginX, y, pageWidth - marginX * 2, 26, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text('ITEM', marginX + 10, y + 17);
  doc.text('DETAILS', marginX + 230, y + 17);
  doc.text('AMOUNT', pageWidth - marginX - 10, y + 17, { align: 'right' });
  y += 26;

  // Item row
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  const itemName = order.package_title || `${order.country_name || ''} eSIM`.trim();
  doc.text(itemName, marginX + 10, y + 20);

  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  const details = [order.data_amount, order.validity_days ? `${order.validity_days} days` : null, order.country_name]
    .filter(Boolean).join(' · ');
  doc.text(details || '—', marginX + 230, y + 20);

  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  const subtotal = parseFloat(order.price_sgd || 0) + parseFloat(order.discount_sgd || 0);
  doc.text(fmtMoney(subtotal), pageWidth - marginX - 10, y + 20, { align: 'right' });
  y += 40;

  doc.setDrawColor(...LINE);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;

  // Totals
  const totalsX = pageWidth - marginX - 160;
  if (parseFloat(order.discount_sgd || 0) > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Discount', totalsX, y);
    doc.setTextColor(...BRAND_GREEN);
    doc.text(`\u2212 ${fmtMoney(order.discount_sgd)}`, pageWidth - marginX - 10, y, { align: 'right' });
    y += 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...TEXT_DARK);
  doc.text('Total Paid', totalsX, y);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(fmtMoney(order.price_sgd), pageWidth - marginX - 10, y, { align: 'right' });
  y += 34;

  // Payment method / status
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(`Payment method: ${PAYMENT_LABELS[order.payment_method] || order.payment_method || 'Card'}`, marginX, y);
  y += 15;
  doc.text(`Status: ${(order.status || 'completed').toUpperCase()}`, marginX, y);
  y += 40;

  // Footer note
  doc.setDrawColor(...LINE);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 24;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  const note = 'This is a system-generated receipt confirming a completed purchase via Juzgo (juzgo.world). Suitable for expense claims and reimbursement purposes.';
  const noteLines = doc.splitTextToSize(note, pageWidth - marginX * 2);
  doc.text(noteLines, marginX, y);

  doc.save(`Juzgo-Receipt-${order.order_code || 'order'}.pdf`);
}
