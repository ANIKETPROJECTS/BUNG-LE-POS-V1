import { useMemo, useState } from "react";
import { useQuery, useQueries, useMutation } from "@tanstack/react-query";
import AppHeader from "@/components/AppHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ClipboardList, Search, Table2, Truck, ShoppingBag, Clock,
  ChefHat, Download, LayoutGrid, List, Eye, Pencil, Trash2,
  Plus, Minus, X, Printer, AlertTriangle,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Order, OrderItem, Table, Floor, MenuItem } from "@shared/schema";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface KOTTicket {
  order: Order;
  items: OrderItem[];
  tableNumber: string;
  floorName: string;
  kotNumber: string;
}

/* ─── Status helpers ─────────────────────────────────────────────────────── */
const STATUS_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  sent_to_kitchen: { label: "New",       bg: "bg-amber-50",   text: "text-amber-700",  dot: "bg-amber-500"  },
  preparing:       { label: "Preparing", bg: "bg-blue-50",    text: "text-blue-700",   dot: "bg-blue-500"   },
  ready:           { label: "Ready",     bg: "bg-green-50",   text: "text-green-700",  dot: "bg-green-500"  },
  served:          { label: "Served",    bg: "bg-purple-50",  text: "text-purple-700", dot: "bg-purple-500" },
  completed:       { label: "Completed", bg: "bg-gray-100",   text: "text-gray-500",   dot: "bg-gray-400"   },
};

function getStatus(order: Order, items: OrderItem[]) {
  if (order.status === "completed") return STATUS_CFG.completed;
  if (items.length && items.every(i => i.status === "served")) return STATUS_CFG.served;
  if (items.some(i => i.status === "preparing")) return STATUS_CFG.preparing;
  if (items.length && items.every(i => i.status === "ready" || i.status === "served")) return STATUS_CFG.ready;
  return STATUS_CFG[order.status] ?? STATUS_CFG.sent_to_kitchen;
}

/* ─── Veg indicator ──────────────────────────────────────────────────────── */
function VegDot({ isVeg }: { isVeg: boolean }) {
  return (
    <span className={cn(
      "inline-flex flex-shrink-0 h-3 w-3 rounded-sm border mt-0.5",
      isVeg ? "border-green-600 bg-green-50" : "border-red-600 bg-red-50"
    )} />
  );
}

/* ─── KOT View Modal ────────────────────────────────────────────────────── */
function KOTViewModal({
  ticket, open, onClose, onPrint,
}: { ticket: KOTTicket | null; open: boolean; onClose: () => void; onPrint: () => void }) {
  if (!ticket) return null;
  const createdAt = new Date(ticket.order.createdAt);
  const st = getStatus(ticket.order, ticket.items);
  const totalQty = ticket.items.reduce((s, i) => s + i.quantity, 0);
  const totalAmt = ticket.items.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0);

  const typeLabel =
    ticket.order.orderType === "dine-in"  ? "Dine-In"  :
    ticket.order.orderType === "delivery" ? "Delivery" : "Pickup";

  /* Rows: [label, value, valueClass?] */
  const metaRows: [string, React.ReactNode][] = [
    ["KOT No",     <span className="font-bold">{ticket.kotNumber}</span>],
    ["Order Date", format(createdAt, "dd/MM/yyyy, hh:mm a")],
    ["Type",       typeLabel],
    ...(ticket.order.orderType === "dine-in" ? [
      ["Table", ticket.tableNumber] as [string, React.ReactNode],
      ...(ticket.floorName ? [["Floor", ticket.floorName] as [string, React.ReactNode]] : []),
    ] : []),
    ...(ticket.order.customerName  ? [["Customer", ticket.order.customerName]  as [string, React.ReactNode]] : []),
    ...(ticket.order.customerPhone ? [["Phone",    ticket.order.customerPhone]  as [string, React.ReactNode]] : []),
    ["Status", (
      <span className={cn("px-2 py-0.5 rounded text-xs font-semibold", st.bg, st.text)}>
        {st.label}
      </span>
    )],
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-[420px] p-0 overflow-hidden rounded-xl shadow-xl">

        {/* ── Tab header ── */}
        <div className="flex border-b select-none">
          <div className="px-5 py-3 text-sm text-gray-400 border-r border-gray-200 bg-gray-50">
            Customer Invoice
          </div>
          <div className="px-5 py-3 text-sm font-bold bg-gray-900 text-white tracking-wide">
            KOT
          </div>
          {/* push close button to right edge */}
          <div className="flex-1" />
        </div>

        {/* ── Body ── */}
        <div className="px-6 py-5 space-y-5 text-sm">

          {/* Branding */}
          <div className="text-center pb-1">
            <p className="text-base font-extrabold tracking-widest uppercase text-gray-900">
              Restaurant POS
            </p>
            <p className="text-xs text-gray-400 mt-0.5 tracking-wide">Kitchen Order Ticket</p>
          </div>

          {/* ── Meta table ── */}
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden" style={{ borderCollapse: "collapse" }}>
            <tbody>
              {metaRows.map(([label, value], idx) => (
                <tr key={idx} className={idx < metaRows.length - 1 ? "border-b border-gray-100" : ""}>
                  <td className="py-2 px-3 text-gray-500 font-medium w-28 bg-gray-50">{label}</td>
                  <td className="py-2 px-3 text-gray-800 text-right">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Items table ── */}
          <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-2 px-3 text-left font-semibold text-gray-600 w-8">#</th>
                <th className="py-2 px-3 text-left font-semibold text-gray-600">Item</th>
                <th className="py-2 px-3 text-right font-semibold text-gray-600 w-12">Qty</th>
              </tr>
            </thead>
            <tbody>
              {ticket.items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-gray-400 italic">No items</td>
                </tr>
              ) : (
                ticket.items.map((item, idx) => (
                  <tr key={item.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 px-3 text-gray-400">{idx + 1}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-start gap-1.5">
                        <VegDot isVeg={item.isVeg} />
                        <span className="text-gray-800">{item.name}</span>
                      </div>
                      {item.notes && (
                        <p className="text-gray-400 italic ml-4 mt-0.5">{item.notes}</p>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-gray-800">{item.quantity}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={2} className="py-2 px-3 font-semibold text-gray-600">Total Items :</td>
                <td className="py-2 px-3 text-right font-bold text-gray-800">{totalQty}</td>
              </tr>
              {totalAmt > 0 && (
                <tr className="border-t border-gray-200">
                  <td colSpan={2} className="py-2 px-3 font-semibold text-gray-600 bg-gray-50">Total Amount :</td>
                  <td className="py-2 px-3 text-right font-bold text-gray-800">₹{totalAmt.toFixed(2)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" className="bg-gray-900 hover:bg-gray-800 text-white gap-1.5" onClick={onPrint}>
            <Printer className="h-3.5 w-3.5" /> Print KOT
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Edit Modal ────────────────────────────────────────────────────────── */
function KOTEditModal({
  ticket, open, onClose,
}: { ticket: KOTTicket | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [localItems, setLocalItems] = useState<OrderItem[]>([]);

  // reset when ticket changes
  useMemo(() => {
    if (ticket) setLocalItems(ticket.items.map(i => ({ ...i })));
  }, [ticket]);

  const { data: menuItems = [] } = useQuery<MenuItem[]>({ queryKey: ["/api/menu"] });
  const [menuSearch, setMenuSearch] = useState("");

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, quantity, notes }: { id: string; quantity: number; notes: string | null }) =>
      (await apiRequest("PATCH", `/api/order-items/${id}`, { quantity, notes })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/completed"] });
    },
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/order-items/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/completed"] });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: { name: string; menuItemId: string; price: string; isVeg: boolean }) => {
      if (!ticket) return;
      return (await apiRequest("POST", `/api/orders/${ticket.order.id}/items`, {
        orderId: ticket.order.id,
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: 1,
        price: item.price,
        notes: null,
        status: "new",
        isVeg: item.isVeg,
      })).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/completed"] });
    },
  });

  const handleSave = async () => {
    try {
      for (const item of localItems) {
        const original = ticket!.items.find(i => i.id === item.id);
        if (!original) continue;
        if (original.quantity !== item.quantity || original.notes !== item.notes) {
          await updateItemMutation.mutateAsync({ id: item.id, quantity: item.quantity, notes: item.notes });
        }
      }
      toast({ title: "KOT updated successfully" });
      onClose();
    } catch {
      toast({ title: "Failed to update KOT", variant: "destructive" });
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    const snapshot = localItems;
    setLocalItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await deleteItemMutation.mutateAsync(itemId);
    } catch {
      setLocalItems(snapshot); // rollback
      toast({ title: "Failed to remove item", variant: "destructive" });
    }
  };

  const handleAddMenuItem = async (mi: MenuItem) => {
    await addItemMutation.mutateAsync({
      name: mi.name, menuItemId: mi.id,
      price: mi.price, isVeg: mi.isVeg,
    });
    setMenuSearch("");
  };

  const filteredMenu = useMemo(() =>
    menuSearch.trim()
      ? menuItems.filter(m => m.name.toLowerCase().includes(menuSearch.toLowerCase())).slice(0, 8)
      : [],
    [menuItems, menuSearch]
  );

  if (!ticket) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-orange-500" />
            Edit {ticket.kotNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Existing items */}
          <div className="space-y-2">
            {localItems.map(item => (
              <div key={item.id} className="flex items-center gap-2 p-2.5 rounded-lg border bg-gray-50 dark:bg-gray-800/50">
                <VegDot isVeg={item.isVeg} />
                <span className="flex-1 text-sm font-medium truncate">{item.name}</span>

                {/* Qty stepper */}
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-6 w-6"
                    onClick={() => setLocalItems(prev => prev.map(i =>
                      i.id === item.id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i
                    ))}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                  <Button size="icon" variant="outline" className="h-6 w-6"
                    onClick={() => setLocalItems(prev => prev.map(i =>
                      i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
                    ))}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Notes */}
                <Input
                  placeholder="Notes"
                  className="h-7 text-xs w-28"
                  value={item.notes ?? ""}
                  onChange={e => setLocalItems(prev => prev.map(i =>
                    i.id === item.id ? { ...i, notes: e.target.value || null } : i
                  ))}
                />

                {/* Delete item */}
                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600 flex-shrink-0"
                  onClick={() => handleDeleteItem(item.id)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {localItems.length === 0 && (
              <p className="text-sm text-gray-400 italic text-center py-4">No items — add from menu below</p>
            )}
          </div>

          {/* Add from menu */}
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Items</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input placeholder="Search menu items..." className="pl-8 h-8 text-sm"
                value={menuSearch} onChange={e => setMenuSearch(e.target.value)} />
            </div>
            {filteredMenu.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {filteredMenu.map(mi => (
                  <button key={mi.id}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg border hover:bg-orange-50 hover:border-orange-200 text-left transition-colors"
                    onClick={() => handleAddMenuItem(mi)}>
                    <div className="flex items-center gap-2">
                      <VegDot isVeg={mi.isVeg} />
                      <span className="text-sm">{mi.name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>₹{mi.price}</span>
                      <Plus className="h-3.5 w-3.5 text-orange-500" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="bg-orange-600 hover:bg-orange-700" onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Delete Confirm Modal ───────────────────────────────────────────────── */
function KOTDeleteModal({
  ticket, open, onClose,
}: { ticket: KOTTicket | null; open: boolean; onClose: () => void }) {
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async (orderId: string) => apiRequest("DELETE", `/api/orders/${orderId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders/completed"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tables"] });
    },
  });

  const handleConfirm = async () => {
    if (!ticket) return;
    try {
      await deleteMutation.mutateAsync(ticket.order.id);
      toast({ title: `${ticket.kotNumber} deleted` });
      onClose();
    } catch {
      toast({ title: "Failed to delete KOT", variant: "destructive" });
    }
  };

  if (!ticket) return null;
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" /> Delete {ticket.kotNumber}?
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          This will permanently delete this KOT and all its items. The table will be freed.
          This cannot be undone.
        </p>
        <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm space-y-1">
          <div className="font-medium">{ticket.tableNumber}</div>
          {ticket.floorName && <div className="text-gray-500 text-xs">{ticket.floorName}</div>}
          <div className="text-gray-500 text-xs mt-1">
            {ticket.items.reduce((s, i) => s + i.quantity, 0)} items ·{" "}
            {format(new Date(ticket.order.createdAt), "dd MMM, hh:mm a")}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={deleteMutation.isPending}>
            {deleteMutation.isPending ? "Deleting…" : "Delete KOT"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Grid Card ──────────────────────────────────────────────────────────── */
function KOTGridCard({ ticket, onView, onEdit, onDelete, onPrint }: {
  ticket: KOTTicket;
  onView: () => void; onEdit: () => void; onDelete: () => void; onPrint: () => void;
}) {
  const st = getStatus(ticket.order, ticket.items);
  const createdAt = new Date(ticket.order.createdAt);
  const totalQty = ticket.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50 dark:bg-gray-800/60">
        <button onClick={onView} className="flex items-center gap-1.5 hover:text-orange-600 transition-colors">
          <ClipboardList className="h-3.5 w-3.5 text-orange-500" />
          <span className="text-xs font-bold text-orange-600">{ticket.kotNumber}</span>
        </button>
        <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1", st.bg, st.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
          {st.label}
        </span>
      </div>

      {/* Table info */}
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          {ticket.order.orderType === "dine-in"  ? <Table2     className="h-3.5 w-3.5 text-purple-500" />
         : ticket.order.orderType === "delivery"  ? <Truck      className="h-3.5 w-3.5 text-blue-500"   />
         :                                          <ShoppingBag className="h-3.5 w-3.5 text-green-500" />}
          <div>
            <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 leading-tight">{ticket.tableNumber}</p>
            {ticket.floorName && <p className="text-xs text-gray-400">{ticket.floorName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Clock className="h-3 w-3" />
          {format(createdAt, "hh:mm a")}
        </div>
      </div>

      {/* Items */}
      <div className="px-4 py-3 flex-1 space-y-1.5">
        {ticket.items.length === 0
          ? <p className="text-xs text-gray-400 italic">No items</p>
          : ticket.items.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <VegDot isVeg={item.isVeg} />
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
              </div>
              <span className="flex-shrink-0 text-xs font-bold text-gray-700 dark:text-gray-200">×{item.quantity}</span>
            </div>
          ))
        }
      </div>

      {/* Footer actions */}
      <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 flex items-center justify-between">
        <span className="text-xs text-gray-400">{format(createdAt, "dd MMM")} · {totalQty} item{totalQty !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-blue-600" title="View" onClick={onView}><Eye className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-orange-600" title="Edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-gray-700" title="Print" onClick={onPrint}><Download className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-red-600" title="Delete" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

/* ─── List Row ───────────────────────────────────────────────────────────── */
function KOTListRow({ ticket, onView, onEdit, onDelete, onPrint }: {
  ticket: KOTTicket;
  onView: () => void; onEdit: () => void; onDelete: () => void; onPrint: () => void;
}) {
  const st = getStatus(ticket.order, ticket.items);
  const createdAt = new Date(ticket.order.createdAt);
  const totalQty = ticket.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-shadow">
      {/* KOT number */}
      <button onClick={onView} className="flex items-center gap-1.5 w-28 flex-shrink-0 hover:text-orange-600 transition-colors">
        <ClipboardList className="h-4 w-4 text-orange-500" />
        <span className="text-sm font-bold text-orange-600">{ticket.kotNumber}</span>
      </button>

      {/* Status */}
      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 w-24", st.bg, st.text)}>
        <span className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", st.dot)} />
        {st.label}
      </span>

      {/* Table */}
      <div className="flex items-center gap-1.5 w-36 flex-shrink-0">
        {ticket.order.orderType === "dine-in"  ? <Table2     className="h-3.5 w-3.5 text-purple-400 flex-shrink-0" />
       : ticket.order.orderType === "delivery"  ? <Truck      className="h-3.5 w-3.5 text-blue-400   flex-shrink-0" />
       :                                          <ShoppingBag className="h-3.5 w-3.5 text-green-400 flex-shrink-0" />}
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate leading-tight">{ticket.tableNumber}</p>
          {ticket.floorName && <p className="text-xs text-gray-400 truncate">{ticket.floorName}</p>}
        </div>
      </div>

      {/* Items summary */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
          {ticket.items.map(i => `${i.name} ×${i.quantity}`).join("  ·  ") || "—"}
        </p>
      </div>

      {/* Time + count */}
      <div className="flex items-center gap-1 text-xs text-gray-400 w-24 flex-shrink-0">
        <Clock className="h-3 w-3" />
        <span>{format(createdAt, "hh:mm a")}</span>
      </div>
      <span className="text-xs text-gray-400 w-14 flex-shrink-0 text-right">{totalQty} item{totalQty !== 1 ? "s" : ""}</span>

      {/* Actions */}
      <div className="flex items-center gap-0.5 flex-shrink-0">
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-blue-600" title="View" onClick={onView}><Eye className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-orange-600" title="Edit" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-gray-700" title="Print" onClick={onPrint}><Download className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" title="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function KOTPage() {
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<"all" | "active" | "completed">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const [viewTicket,   setViewTicket]   = useState<KOTTicket | null>(null);
  const [editTicket,   setEditTicket]   = useState<KOTTicket | null>(null);
  const [deleteTicket, setDeleteTicket] = useState<KOTTicket | null>(null);

  const { data: activeOrders    = [] } = useQuery<Order[]>({ queryKey: ["/api/orders/active"] });
  const { data: completedOrders = [] } = useQuery<Order[]>({ queryKey: ["/api/orders/completed"] });
  const { data: tables          = [] } = useQuery<Table[]>({ queryKey: ["/api/tables"] });
  const { data: floors          = [] } = useQuery<Floor[]>({ queryKey: ["/api/floors"] });

  const kitchenOrders = useMemo(() =>
    activeOrders.filter(o => ["sent_to_kitchen", "preparing", "ready", "served"].includes(o.status)),
    [activeOrders]
  );

  const activeQueries = useQueries({
    queries: kitchenOrders.map(o => ({
      queryKey: ["/api/orders", o.id, "items"],
      queryFn: () => fetch(`/api/orders/${o.id}/items`).then(r => r.json()) as Promise<OrderItem[]>,
    })),
  });

  const completedQueries = useQueries({
    queries: completedOrders.map(o => ({
      queryKey: ["/api/orders", o.id, "items"],
      queryFn: () => fetch(`/api/orders/${o.id}/items`).then(r => r.json()) as Promise<OrderItem[]>,
    })),
  });

  const buildTickets = (orders: Order[], queries: typeof activeQueries, base: number): KOTTicket[] =>
    orders.map((order, i) => {
      const items  = queries[i]?.data ?? [];
      const table  = tables.find(t => t.id === order.tableId);
      const floor  = floors.find(f => f.id === table?.floorId);
      const tableNumber = order.orderType === "dine-in" && table
        ? `Table ${table.tableNumber}`
        : order.orderType === "delivery" ? "Delivery" : "Pickup";
      const floorName = order.orderType === "dine-in"
        ? (floor?.name ?? "")
        : (order.customerName ?? "");
      return { order, items, tableNumber, floorName, kotNumber: `KOT-${String(base + i + 1).padStart(4, "0")}` };
    });

  const allTickets = useMemo(() => {
    const active = buildTickets(kitchenOrders, activeQueries, 0);
    const done   = buildTickets(completedOrders, completedQueries, kitchenOrders.length);
    return [...active, ...done].sort(
      (a, b) => new Date(b.order.createdAt).getTime() - new Date(a.order.createdAt).getTime()
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitchenOrders, completedOrders, activeQueries, completedQueries, tables, floors]);

  const filtered = useMemo(() => {
    let list = allTickets;
    if (filter === "active")    list = list.filter(t => t.order.status !== "completed");
    if (filter === "completed") list = list.filter(t => t.order.status === "completed");
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.kotNumber.toLowerCase().includes(q) ||
        t.tableNumber.toLowerCase().includes(q) ||
        t.floorName.toLowerCase().includes(q) ||
        t.items.some(i => i.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allTickets, filter, search]);

  const counts = useMemo(() => ({
    all:       allTickets.length,
    active:    allTickets.filter(t => t.order.status !== "completed").length,
    completed: allTickets.filter(t => t.order.status === "completed").length,
  }), [allTickets]);

  const handlePrint = async (ticket: KOTTicket) => {
    const res = await fetch(`/api/orders/${ticket.order.id}/kot/pdf`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${ticket.kotNumber}.pdf`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-950">
      <AppHeader title="KOT" showSearch={false} />

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
          {/* Search */}
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder="Search by table, item or KOT no..." className="pl-9 h-9 bg-white dark:bg-gray-900 text-sm"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Status filters */}
          <div className="flex gap-1.5">
            {(["all", "active", "completed"] as const).map(f => (
              <button key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                  filter === f
                    ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                    : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-orange-300"
                )}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                <span className={cn(
                  "text-xs rounded-full px-1.5 py-0.5 font-semibold",
                  filter === f ? "bg-orange-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
                )}>{counts[f]}</span>
              </button>
            ))}
          </div>

          {/* Grid / List toggle */}
          <div className="flex items-center gap-0 border rounded-lg overflow-hidden bg-white dark:bg-gray-900 ml-auto flex-shrink-0">
            <button
              onClick={() => setViewMode("grid")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors",
                viewMode === "grid" ? "bg-orange-600 text-white" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-l",
                viewMode === "list" ? "bg-orange-600 text-white" : "text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <ChefHat className="h-12 w-12 mb-3 opacity-25" />
            <p className="text-base font-medium">No KOT tickets found</p>
            <p className="text-sm mt-1 text-gray-400">Tickets appear here when orders are sent from POS</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(t => (
              <KOTGridCard key={t.order.id} ticket={t}
                onView={() => setViewTicket(t)}
                onEdit={() => setEditTicket(t)}
                onDelete={() => setDeleteTicket(t)}
                onPrint={() => handlePrint(t)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => (
              <KOTListRow key={t.order.id} ticket={t}
                onView={() => setViewTicket(t)}
                onEdit={() => setEditTicket(t)}
                onDelete={() => setDeleteTicket(t)}
                onPrint={() => handlePrint(t)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <KOTViewModal
        ticket={viewTicket} open={!!viewTicket}
        onClose={() => setViewTicket(null)}
        onPrint={() => viewTicket && handlePrint(viewTicket)}
      />
      <KOTEditModal
        ticket={editTicket} open={!!editTicket}
        onClose={() => setEditTicket(null)}
      />
      <KOTDeleteModal
        ticket={deleteTicket} open={!!deleteTicket}
        onClose={() => setDeleteTicket(null)}
      />
    </div>
  );
}
