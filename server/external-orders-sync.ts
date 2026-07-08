/**
 * ExternalOrdersSyncService
 *
 * Polls the "Orders" MongoDB database → "orders" collection for incoming
 * orders placed through the digital menu app and syncs them into the POS.
 *
 * External order document shape written by the digital menu:
 * {
 *   _id: ObjectId,
 *   tableId:   string  — table NAME as shown in POS (e.g. "Table1")
 *   floorId:   string  — floor NAME as shown in POS (e.g. "Ground Floor")
 *   orderType: string  — "dine-in" | "delivery" | "pickup"
 *   items: [{ name, price, quantity, category?, isVeg?, notes? }]
 *   total: number,
 *   status: "pending" | "confirmed" | ...
 *   paymentStatus?: "pending" | "paid"
 *   paymentMode?: string
 *   customerName: string
 *   customerPhone: string
 *   customerEmail?: string
 *   customerAddress?: string
 *   createdAt: Date,
 *   syncedToPOS?: boolean   — set to true after sync
 *   posOrderId?: string     — set after sync
 * }
 */

import { MongoClient, Db } from "mongodb";
import type { IStorage } from "./storage";
import { dynamicMongoDB } from "./dynamic-mongodb";
import { mongodb } from "./mongodb";

const EXTERNAL_DB_NAME = "Orders";
const EXTERNAL_COLL    = "orders";

export class ExternalOrdersSyncService {
  private storage: IStorage;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private currentUri: string | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private processedIds = new Set<string>();
  private isRunning = false;
  private broadcastFn: ((type: string, data: any) => void) | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  setBroadcastFunction(fn: (type: string, data: any) => void) {
    this.broadcastFn = fn;
  }

  /* ── lifecycle ──────────────────────────────────────────────────── */

  async start(intervalMs = 5000): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log("🔄 [ExternalOrders] Starting external orders sync service...");
    // connect() also calls loadAlreadySynced() on first/reconnect
    await this.connect().catch(err =>
      console.warn("⚠️ [ExternalOrders] Initial connect failed (will retry):", err.message)
    );
    await this.sync();

    this.syncInterval = setInterval(() => this.sync(), intervalMs);
    console.log(`✅ [ExternalOrders] Sync running every ${intervalMs / 1000}s`);
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [ExternalOrders] Sync stopped");
  }

  getStatus() {
    return { isRunning: this.isRunning, processedOrders: this.processedIds.size };
  }

  /* ── internal helpers ───────────────────────────────────────────── */

  /**
   * Resolve which MongoDB URI to use for the external orders database.
   *
   * Priority:
   *  1. "mongodb_uri" key in the restaurant's settings collection,
   *     read via any active dynamicMongoDB connection (available after login).
   *  2. "mongodb_uri" key read directly from the primary MongoDB settings
   *     collection — works on server startup before any user has logged in.
   *  3. DIGITAL_MENU_MONGODB_URI env/secret (explicit Replit secret override).
   *  4. Throws — MONGODB_URI is NOT used as a fallback here because it points
   *     to the POS's own database, which is never the external orders database.
   */
  private async resolveUri(): Promise<{ uri: string; source: string }> {
    // 1. Active dynamicMongoDB session (available after a user logs in)
    const settingUri = await dynamicMongoDB
      .getSettingFromAnyConnection("mongodb_uri")
      .catch(() => undefined);
    if (settingUri) return { uri: settingUri, source: "POS Database URI setting (dynamic)" };

    // 2. Direct read from the primary MongoDB settings collection.
    //    This is where the UI saves the URI, and it works even before login.
    try {
      const doc = await mongodb
        .getCollection<{ key: string; value: string }>("settings")
        .findOne({ key: "mongodb_uri" } as any);
      if (doc?.value) return { uri: doc.value, source: "POS Database URI setting (primary DB)" };
    } catch {
      // primary DB not ready yet — fall through
    }

    // 3. Explicit env override
    if (process.env.DIGITAL_MENU_MONGODB_URI)
      return { uri: process.env.DIGITAL_MENU_MONGODB_URI, source: "DIGITAL_MENU_MONGODB_URI env" };

    throw new Error("No external MongoDB URI configured — set it via Menu Management → ⋮ → Database URI");
  }

  private async connect(): Promise<void> {
    const { uri, source } = await this.resolveUri();

    // No-op if already connected to the same URI
    if (this.client && this.currentUri === uri) return;

    // URI changed (or first connection) — close old client if any
    if (this.client) {
      console.log("🔄 [ExternalOrders] URI changed — reconnecting...");
      await this.client.close().catch(() => {});
      this.client = null;
      this.db = null;
    }

    this.currentUri = uri;
    this.client = new MongoClient(uri);
    await this.client.connect();
    this.db = this.client.db(EXTERNAL_DB_NAME);
    console.log(`✅ [ExternalOrders] Connected to "${EXTERNAL_DB_NAME}" database (via ${source})`);

    // Reload already-synced set whenever we (re)connect
    await this.loadAlreadySynced();
  }

  private collection() {
    if (!this.db) throw new Error("Not connected to external DB");
    return this.db.collection(EXTERNAL_COLL);
  }

  /** Mark every already-synced order so we don't re-process on restart */
  private async loadAlreadySynced(): Promise<void> {
    try {
      const docs = await this.collection()
        .find({ syncedToPOS: true }, { projection: { _id: 1 } })
        .toArray();
      docs.forEach(d => this.processedIds.add(d._id.toString()));
      console.log(`📊 [ExternalOrders] Loaded ${docs.length} already-synced orders`);
    } catch (err) {
      console.error("[ExternalOrders] Failed to load sync state:", err);
    }
  }

  /** Main poll cycle */
  async sync(): Promise<number> {
    try {
      // Re-resolve URI on every cycle — handles the case where a user logs in
      // after server startup and the restaurant's mongodb_uri setting becomes
      // available for the first time (or changes).
      await this.connect();

      const coll = this.collection();

      // Accept ALL non-synced orders except terminal cancellations/rejections.
      // The digital menu may update status to values like "preparing", "ready",
      // "accepted" etc. — don't block on those.
      const docs = await coll.find({
        syncedToPOS: { $ne: true },
        status:      { $nin: ["cancelled", "rejected", "cancel", "reject"] },
      }).sort({ createdAt: 1 }).toArray();

      // Diagnostic: also count how many total unsynced docs exist at all
      const totalUnsynced = await coll.countDocuments({ syncedToPOS: { $ne: true } });
      if (totalUnsynced !== docs.length) {
        console.log(`🔍 [ExternalOrders] ${totalUnsynced} total unsynced (${totalUnsynced - docs.length} skipped by status filter)`);
      }

      if (docs.length > 0) {
        console.log(`🔍 [ExternalOrders] Found ${docs.length} unsynced document(s) to process`);
      }

      let synced = 0;

      for (const doc of docs) {
        const id = doc._id.toString();
        if (this.processedIds.has(id)) {
          console.log(`⏭️  [ExternalOrders] Skipping ${id} — already in processedIds`);
          continue;
        }

        // Guard immediately to avoid race conditions
        this.processedIds.add(id);
        console.log(`⚙️  [ExternalOrders] Processing order ${id} (customer: ${doc.customerName}, table: ${doc.tableId}, floor: ${doc.floorId})`);

        try {
          const posOrderId = await this.createPOSOrder(doc);

          await coll.updateOne(
            { _id: doc._id },
            { $set: { syncedToPOS: true, syncedAt: new Date(), posOrderId } }
          );

          synced++;
          console.log(`✅ [ExternalOrders] Synced order ${id} → POS order ${posOrderId}`);

          this.broadcastFn?.("external_order_synced", {
            externalOrderId: id,
            posOrderId,
            customerName: doc.customerName,
            customerPhone: doc.customerPhone,
          });
        } catch (err) {
          this.processedIds.delete(id); // allow retry
          console.error(`❌ [ExternalOrders] Failed to sync order ${id}:`, err);
        }
      }

      if (synced > 0) {
        console.log(`📦 [ExternalOrders] ${synced} new order(s) synced to POS`);
        this.broadcastFn?.("external_orders_batch_synced", { count: synced });
      }

      return synced;
    } catch (err) {
      console.error("[ExternalOrders] Sync cycle error:", err);
      return 0;
    }
  }

  /**
   * Resolve a table in the POS by matching:
   *   doc.floorId  →  floor.name  (case-insensitive)
   *   doc.tableId  →  table.tableNumber  (case-insensitive, then numeric normalisation)
   *
   * If floorId is provided, prefer the table that belongs to that floor.
   * Falls back to any table that matches the name/number if floor lookup fails.
   */
  private async resolveTable(doc: any): Promise<{ id: string; tableNumber: string } | null> {
    const rawTableRef = (doc.tableId || doc.tableNumber || doc.table || "").toString().trim();
    const rawFloorRef = (doc.floorId || doc.floorName || doc.floor || "").toString().trim();

    if (!rawTableRef) return null;

    // ── 1. Get all POS tables ─────────────────────────────────────────
    const allTables = await this.storage.getTables();

    // ── 2. Build candidate list — tables whose tableNumber matches the ref ──
    const nameLower = rawTableRef.toLowerCase();
    let candidates = allTables.filter(
      t => t.tableNumber.toLowerCase() === nameLower
    );

    // If no exact name match, try numeric normalisation ("Table1" → "T1" etc.)
    if (candidates.length === 0) {
      const numMatch = rawTableRef.match(/\d+/);
      if (numMatch) {
        const normalised = `T${parseInt(numMatch[0], 10)}`;
        candidates = allTables.filter(
          t => t.tableNumber.toLowerCase() === normalised.toLowerCase()
        );
      }
    }

    if (candidates.length === 0) {
      console.warn(`⚠️  [ExternalOrders] No table found matching "${rawTableRef}"`);
      return null;
    }

    // ── 3. Narrow by floor name if floorId is provided ───────────────
    if (rawFloorRef && candidates.length > 1) {
      const floors = await this.storage.getFloors();
      const floor  = floors.find(
        f => f.name.toLowerCase() === rawFloorRef.toLowerCase()
      );
      if (floor) {
        const floorMatch = candidates.find(t => t.floorId === floor.id);
        if (floorMatch) {
          console.log(`🪑 [ExternalOrders] Matched table "${rawTableRef}" on floor "${rawFloorRef}" → ${floorMatch.tableNumber} (id: ${floorMatch.id})`);
          return floorMatch;
        }
      }
    }

    // Even with one candidate, try to log the floor match for clarity
    if (rawFloorRef) {
      const floors = await this.storage.getFloors();
      const floor  = floors.find(
        f => f.name.toLowerCase() === rawFloorRef.toLowerCase()
      );
      if (floor) {
        const floorMatch = candidates.find(t => t.floorId === floor.id);
        if (floorMatch) {
          console.log(`🪑 [ExternalOrders] Matched table "${rawTableRef}" on floor "${rawFloorRef}" → ${floorMatch.tableNumber} (id: ${floorMatch.id})`);
          return floorMatch;
        }
      }
    }

    // Fall back to first candidate
    const fallback = candidates[0];
    console.log(`🪑 [ExternalOrders] Matched table "${rawTableRef}" → ${fallback.tableNumber} (id: ${fallback.id})`);
    return fallback;
  }

  /** Convert an external order document into POS entities */
  private async createPOSOrder(doc: any): Promise<string> {
    // ── 1. Customer lookup / auto-register ───────────────────────────
    const phone = (doc.customerPhone || doc.phone || "").toString().trim();
    const name  = (doc.customerName  || doc.name  || "Guest").toString().trim();

    if (phone) {
      const existing = await this.storage.getCustomerByPhone(phone);
      if (!existing) {
        await this.storage.createCustomer({
          name,
          phone,
          email:   doc.customerEmail   || doc.email   || null,
          address: doc.customerAddress || doc.address || null,
        });
        console.log(`👤 [ExternalOrders] Registered new customer: ${name} (${phone})`);
        this.broadcastFn?.("customer_registered", { name, phone });
      } else {
        console.log(`👤 [ExternalOrders] Existing customer: ${name} (${phone})`);
      }
    }

    // ── 2. Normalise order type ───────────────────────────────────────
    const hasTableRef = !!(doc.tableId || doc.tableNumber || doc.table);
    const rawType = (doc.orderType || doc.type || (hasTableRef ? "dine-in" : "delivery")).toLowerCase();
    const orderType: string =
      rawType.includes("dine") || rawType.includes("table") ? "dine-in"  :
      rawType.includes("pick") || rawType.includes("take")  ? "pickup"   :
      "delivery";

    console.log(`📋 [ExternalOrders] Order type: ${orderType}`);

    // ── 3. Resolve table in POS (by floor name + table name) ─────────
    const resolvedTable = orderType === "dine-in" ? await this.resolveTable(doc) : null;
    const resolvedTableId = resolvedTable?.id ?? null;

    // ── 4. POS order status ───────────────────────────────────────────
    //    Paid → billed  |  Otherwise → sent_to_kitchen (appears in KDS + KOT)
    const isPaid    = (doc.paymentStatus || "").toLowerCase() === "paid";
    const posStatus = isPaid ? "billed" : "sent_to_kitchen";

    // ── 5. Create POS order ──────────────────────────────────────────
    const posOrder = await this.storage.createOrder({
      tableId:           resolvedTableId,
      orderType,
      status:            posStatus,
      total:             "0",
      customerName:      name  || null,
      customerPhone:     phone || null,
      customerAddress:   doc.customerAddress || doc.address || null,
      paymentMode:       doc.paymentMode || doc.paymentMethod || null,
      waiterId:          null,
      deliveryPersonId:  null,
      expectedPickupTime: null,
    });

    console.log(`📝 [ExternalOrders] Created POS order ${posOrder.id} (status: ${posStatus})`);
    this.broadcastFn?.("order_created", posOrder);

    // ── 6. Assign table to order (marks it occupied in table view) ────
    if (resolvedTable) {
      await this.storage.updateTableStatus(resolvedTable.id, "occupied");
      await this.storage.updateTableOrder(resolvedTable.id, posOrder.id);
      console.log(`🪑 [ExternalOrders] Table ${resolvedTable.tableNumber} → occupied, linked to order ${posOrder.id}`);
      this.broadcastFn?.("table_updated", {
        id: resolvedTable.id,
        tableNumber: resolvedTable.tableNumber,
        status: "occupied",
        currentOrderId: posOrder.id,
      });
    }

    // ── 7. Create order items ─────────────────────────────────────────
    const items: any[] = doc.items || doc.orderItems || doc.cart || [];
    let subtotal = 0;

    const parseBoolFlag = (v: unknown): boolean => {
      if (typeof v === "boolean") return v;
      if (typeof v === "number")  return v !== 0;
      const s = String(v).toLowerCase().trim();
      return s !== "false" && s !== "0" && s !== "no";
    };
    const isNonVegCategory = (s: string) => /non[-_\s]?veg/i.test(s);

    for (const item of items) {
      const itemName = item.name || item.menuItemName || item.itemName || "Unknown Item";
      const qty      = Number(item.quantity || item.qty || 1);
      const price    = Number(item.price || item.unitPrice || item.rate || 0);

      let isVeg: boolean;
      if      (item.isVeg      !== undefined) isVeg = parseBoolFlag(item.isVeg);
      else if (item.vegetarian !== undefined) isVeg = parseBoolFlag(item.vegetarian);
      else if (item.category)                 isVeg = !isNonVegCategory(String(item.category));
      else if (item.type)                     isVeg = !isNonVegCategory(String(item.type));
      else                                    isVeg = true;

      const notes = item.notes || item.instructions || item.specialRequest || null;
      subtotal += qty * price;

      const created = await this.storage.createOrderItem({
        orderId:    posOrder.id,
        menuItemId: "external",
        name:       itemName,
        quantity:   qty,
        price:      price.toFixed(2),
        notes,
        status:     "new",
        isVeg,
      });

      console.log(`  🍽️  [ExternalOrders] Item: ${itemName} x${qty} (${isVeg ? "veg" : "non-veg"})`);
      this.broadcastFn?.("order_item_added", { orderId: posOrder.id, item: created });
    }

    // ── 8. Update total ────────────────────────────────────────────────
    const total = (doc.total ?? doc.totalAmount ?? doc.grandTotal ?? subtotal);
    const totalStr = Number(total).toFixed(2);
    await this.storage.updateOrderTotal(posOrder.id, totalStr);
    console.log(`💰 [ExternalOrders] Order total: ₹${totalStr}`);

    // ── 9. Auto-KOT: re-broadcast order_updated so KOT screen picks it up
    //    The order was created with sent_to_kitchen status — broadcast again
    //    after items are added so the KOT view shows complete item list.
    const finalOrder = await this.storage.getOrder(posOrder.id);
    if (finalOrder) {
      this.broadcastFn?.("order_updated", finalOrder);
      this.broadcastFn?.("kot_created", {
        orderId:     posOrder.id,
        tableNumber: resolvedTable?.tableNumber ?? null,
        customerName: name,
        itemCount:   items.length,
      });
    }

    console.log(`🎫 [ExternalOrders] Auto-KOT broadcast for order ${posOrder.id}`);

    return posOrder.id;
  }
}
