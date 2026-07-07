import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Order, OrderItem } from "@shared/schema";
import { format } from "date-fns";

interface KOTData {
  order: Order;
  orderItems: OrderItem[];
  tableNumber?: string;
  floorName?: string;
  kotNumber?: string;
  restaurantName?: string;
}

/* ── colour palette (matches the modal) ─────────────────────────── */
const C = {
  white:       [255, 255, 255] as [number, number, number],
  headerBg:    [17,  24,  39]  as [number, number, number],   // gray-900
  headerText:  [255, 255, 255] as [number, number, number],
  labelBg:     [249, 250, 251] as [number, number, number],   // gray-50
  border:      [229, 231, 235] as [number, number, number],   // gray-200
  labelText:   [107, 114, 128] as [number, number, number],   // gray-500
  valueText:   [17,  24,  39]  as [number, number, number],   // gray-900
  footerBg:    [249, 250, 251] as [number, number, number],
  statusNew:   [217, 119, 6]   as [number, number, number],   // amber-600
  statusDone:  [75,  85,  99]  as [number, number, number],   // gray-600
  vegGreen:    [22,  163, 74]  as [number, number, number],
  nonVegRed:   [220, 38,  38]  as [number, number, number],
};

export function generateKOTPDF(data: KOTData): Buffer {
  const {
    order, orderItems,
    tableNumber, floorName,
    kotNumber = `KOT-${order.id.substring(0, 8).toUpperCase()}`,
    restaurantName = "Restaurant POS",
  } = data;

  /* ── Page setup ─────────────────────────────────────────────── */
  const doc    = new jsPDF({ unit: "mm", format: "a5" });
  const PW     = doc.internal.pageSize.getWidth();   // 148 mm
  const margin = 12;
  const inner  = PW - margin * 2;
  let   y      = margin;

  /* ── Helpers ─────────────────────────────────────────────────── */
  const rect = (x: number, ry: number, w: number, h: number,
    fill: [number, number, number], stroke?: [number, number, number]) => {
    doc.setFillColor(...fill);
    if (stroke) { doc.setDrawColor(...stroke); doc.setLineWidth(0.3); doc.rect(x, ry, w, h, "FD"); }
    else         { doc.rect(x, ry, w, h, "F"); }
  };

  const hline = (ry: number) => {
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(margin, ry, margin + inner, ry);
  };

  const txt = (
    s: string, x: number, ry: number, size: number,
    style: "normal" | "bold" | "italic",
    color: [number, number, number] = C.valueText,
    align: "left" | "center" | "right" = "left",
  ) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    doc.text(s, x, ry, { align });
  };

  /* ── Branding ────────────────────────────────────────────────── */
  y += 4;
  txt(restaurantName.toUpperCase(), PW / 2, y, 13, "bold", C.headerBg, "center");
  y += 6;
  txt("Kitchen Order Ticket", PW / 2, y, 8, "normal", C.labelText, "center");
  y += 5;
  hline(y);
  y += 6;

  /* ── Meta table ──────────────────────────────────────────────── */
  const orderDate = order.createdAt instanceof Date
    ? order.createdAt : new Date(order.createdAt || Date.now());

  const typeLabel =
    order.orderType === "dine-in"  ? "Dine-In"  :
    order.orderType === "delivery" ? "Delivery" : "Pickup";

  const statusLabel =
    order.status === "completed"       ? "Completed" :
    order.status === "sent_to_kitchen" ? "New"       :
    order.status === "preparing"       ? "Preparing" :
    order.status === "ready"           ? "Ready"     :
    order.status === "served"          ? "Served"    : order.status;

  type MetaRow = [string, string];
  const metaRows: MetaRow[] = [
    ["KOT No",     kotNumber],
    ["Order Date", format(orderDate, "dd/MM/yyyy, hh:mm a")],
    ["Type",       typeLabel],
  ];
  if (order.orderType === "dine-in" && tableNumber) {
    metaRows.push(["Table", tableNumber]);
    if (floorName) metaRows.push(["Floor", floorName]);
  }
  if (order.customerName)  metaRows.push(["Customer", order.customerName]);
  if (order.customerPhone) metaRows.push(["Phone",    order.customerPhone]);
  metaRows.push(["Status", statusLabel]);

  const rowH   = 7;
  const labelW = 35;

  // outer border
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, inner, rowH * metaRows.length, "S");

  metaRows.forEach(([label, value], idx) => {
    const ry = y + idx * rowH;
    // label cell
    rect(margin, ry, labelW, rowH, C.labelBg, C.border);
    txt(label, margin + 2, ry + rowH * 0.65, 7.5, "normal", C.labelText);
    // value cell
    rect(margin + labelW, ry, inner - labelW, rowH, C.white);
    // status gets a coloured pill
    if (label === "Status") {
      const pillColor = ["New", "Preparing"].includes(value) ? C.statusNew : C.statusDone;
      txt(value, margin + inner - 2, ry + rowH * 0.65, 7.5, "bold", pillColor, "right");
    } else {
      txt(value, margin + inner - 2, ry + rowH * 0.65, 7.5, "normal", C.valueText, "right");
    }
    // row divider (skip last)
    if (idx < metaRows.length - 1) hline(ry + rowH);
    // label/value divider
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.line(margin + labelW, ry, margin + labelW, ry + rowH);
  });

  y += rowH * metaRows.length + 7;

  /* ── Items table ─────────────────────────────────────────────── */
  const colW = { num: 8, item: inner - 8 - 14, qty: 14 };

  // Header row
  const headerH = 8;
  rect(margin,                   y, colW.num,  headerH, C.headerBg, C.border);
  rect(margin + colW.num,        y, colW.item, headerH, C.headerBg, C.border);
  rect(margin + colW.num + colW.item, y, colW.qty, headerH, C.headerBg, C.border);
  txt("#",    margin + colW.num / 2,                        y + headerH * 0.68, 8, "bold", C.headerText, "center");
  txt("Item", margin + colW.num + colW.item / 2,            y + headerH * 0.68, 8, "bold", C.headerText, "center");
  txt("Qty",  margin + colW.num + colW.item + colW.qty / 2, y + headerH * 0.68, 8, "bold", C.headerText, "center");
  y += headerH;

  // Item rows
  orderItems.forEach((item, idx) => {
    const hasNotes = !!(item.notes && item.notes.trim());
    const itemH = hasNotes ? 10 : 7.5;

    // row backgrounds
    rect(margin,                         y, colW.num,  itemH, C.white, C.border);
    rect(margin + colW.num,              y, colW.item, itemH, C.white, C.border);
    rect(margin + colW.num + colW.item,  y, colW.qty,  itemH, C.white, C.border);

    // row divider lines
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.line(margin + colW.num,              y, margin + colW.num,             y + itemH);
    doc.line(margin + colW.num + colW.item,  y, margin + colW.num + colW.item, y + itemH);

    // # number
    txt(String(idx + 1), margin + colW.num / 2, y + itemH * 0.6, 7.5, "normal", C.labelText, "center");

    // veg dot
    const dotX = margin + colW.num + 2;
    const dotY = y + (hasNotes ? 3.5 : itemH / 2);
    doc.setFillColor(...(item.isVeg ? C.vegGreen : C.nonVegRed));
    doc.setDrawColor(...(item.isVeg ? C.vegGreen : C.nonVegRed));
    doc.rect(dotX, dotY - 1.2, 2.2, 2.2, "FD");

    // item name
    const nameX = dotX + 3.5;
    const nameY = hasNotes ? y + 3.8 : y + itemH * 0.62;
    const maxW  = colW.item - 7;
    const lines = doc.splitTextToSize(item.name, maxW);
    txt(lines[0], nameX, nameY, 7.5, "normal", C.valueText);
    // notes inline (italic, smaller, gray)
    if (hasNotes) {
      txt(item.notes!, nameX, y + 7.5, 6.5, "italic", C.labelText);
    }

    // qty
    txt(String(item.quantity), margin + colW.num + colW.item + colW.qty / 2,
      y + itemH * 0.62, 8, "bold", C.valueText, "center");

    // bottom border
    hline(y + itemH);
    y += itemH;
  });

  // Total Items footer row
  const footH = 7.5;
  rect(margin, y, inner, footH, C.labelBg, C.border);
  const totalQty = orderItems.reduce((s, i) => s + i.quantity, 0);
  txt("Total Items :", margin + 2,     y + footH * 0.68, 7.5, "bold",   C.labelText);
  txt(String(totalQty), margin + inner - 2, y + footH * 0.68, 8,   "bold",   C.valueText, "right");
  y += footH;

  // Total Amount (if prices are present)
  const totalAmt = orderItems.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0);
  if (totalAmt > 0) {
    const amtH = 7.5;
    rect(margin, y, inner, amtH, C.white, C.border);
    txt("Total Amount :", margin + 2,     y + amtH * 0.68, 7.5, "bold", C.labelText);
    txt(`Rs. ${totalAmt.toFixed(2)}`, margin + inner - 2, y + amtH * 0.68, 8, "bold", C.valueText, "right");
    y += amtH;
  }

  /* ── Footer note ─────────────────────────────────────────────── */
  y += 8;
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.25);
  doc.line(margin, y, margin + inner, y);
  y += 4;
  txt(`Printed: ${format(new Date(), "dd/MM/yyyy, hh:mm a")}`,
    PW / 2, y, 6.5, "italic", C.labelText, "center");

  return Buffer.from(doc.output("arraybuffer"));
}
