import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { getStorageForSession, requireAuth } from "./auth-middleware";
import { IStorage } from "./storage";
import {
  insertFloorSchema,
  insertTableSchema,
  insertMenuItemSchema,
  insertOrderSchema,
  insertOrderItemSchema,
  insertInventoryItemSchema,
  insertRecipeSchema,
  insertRecipeIngredientSchema,
  insertSupplierSchema,
  insertPurchaseOrderSchema,
  insertPurchaseOrderItemSchema,
  insertWastageSchema,
  insertInvoiceSchema,
  insertReservationSchema,
  insertCustomerSchema,
  insertFeedbackSchema,
  insertInventoryUsageSchema,
} from "@shared/schema";
import { z } from "zod";
import { fetchMenuItemsFromMongoDB } from "./mongodbService";
import { generateInvoicePDF } from "./utils/invoiceGenerator";
import { generateKOTPDF } from "./utils/kotGenerator";
import { DigitalMenuSyncService } from "./digital-menu-sync";
import { ExternalOrdersSyncService } from "./external-orders-sync";
import { mongoStorage } from "./mongo-storage";

const orderActionSchema = z.object({
  print: z.boolean().optional().default(false),
});

const checkoutSchema = z.object({
  paymentMode: z.string().optional(),
  print: z.boolean().optional().default(false),
  splitPayments: z.array(z.object({
    person: z.number(),
    amount: z.number(),
    paymentMode: z.string(),
  })).optional(),
});

let wss: WebSocketServer;

function getStorage(req: Request): IStorage {
  const sessionStorage = getStorageForSession(req);
  return sessionStorage || storage;
}

function broadcastUpdate(type: string, data: any) {
  if (!wss) {
    console.log('[WebSocket] No WSS instance, cannot broadcast');
    return;
  }
  const message = JSON.stringify({ type, data });
  const clientCount = Array.from(wss.clients).filter(c => c.readyState === WebSocket.OPEN).length;
  console.log(`[WebSocket] Broadcasting ${type} to ${clientCount} clients`);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/floors", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const floors = await st.getFloors();
    res.json(floors);
  });

  app.get("/api/floors/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const floor = await st.getFloor(req.params.id);
    if (!floor) {
      return res.status(404).json({ error: "Floor not found" });
    }
    res.json(floor);
  });

  app.post("/api/floors", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertFloorSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const floor = await st.createFloor(result.data);
    broadcastUpdate("floor_created", floor);
    res.json(floor);
  });

  app.patch("/api/floors/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const floor = await st.updateFloor(req.params.id, req.body);
    if (!floor) {
      return res.status(404).json({ error: "Floor not found" });
    }
    broadcastUpdate("floor_updated", floor);
    res.json(floor);
  });

  app.delete("/api/floors/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const success = await st.deleteFloor(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Floor not found" });
    }
    broadcastUpdate("floor_deleted", { id: req.params.id });
    res.json({ success: true });
  });

  app.get("/api/tables", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const tables = await st.getTables();
    res.json(tables);
  });

  app.get("/api/tables/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const table = await st.getTable(req.params.id);
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    res.json(table);
  });

  app.post("/api/tables", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertTableSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const table = await st.createTable(result.data);
    broadcastUpdate("table_created", table);
    res.json(table);
  });

  app.patch("/api/tables/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const table = await st.updateTable(req.params.id, req.body);
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    broadcastUpdate("table_updated", table);
    res.json(table);
  });

  app.delete("/api/tables/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const success = await st.deleteTable(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Table not found" });
    }
    broadcastUpdate("table_deleted", { id: req.params.id });
    res.json({ success: true });
  });

  app.patch("/api/tables/:id/status", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { status } = req.body;
    const table = await st.updateTableStatus(req.params.id, status);
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    broadcastUpdate("table_updated", table);
    res.json(table);
  });

  app.patch("/api/tables/:id/order", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { orderId } = req.body;
    const table = await st.updateTableOrder(req.params.id, orderId);
    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }
    broadcastUpdate("table_updated", table);
    res.json(table);
  });

  app.get("/api/menu", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const items = await st.getMenuItems();
    res.json(items);
  });

  app.get("/api/menu/categories", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const categoriesJson = await st.getSetting("menu_categories");
    const categories = categoriesJson ? JSON.parse(categoriesJson) : [];
    res.json({ categories });
  });

  app.get("/api/menu/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const item = await st.getMenuItem(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }
    res.json(item);
  });

  app.post("/api/menu", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertMenuItemSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const item = await st.createMenuItem(result.data);
    broadcastUpdate("menu_updated", item);
    res.json(item);
  });

  app.patch("/api/menu/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const item = await st.updateMenuItem(req.params.id, req.body);
    if (!item) {
      return res.status(404).json({ error: "Menu item not found" });
    }
    broadcastUpdate("menu_updated", item);
    res.json(item);
  });

  app.delete("/api/menu/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const success = await st.deleteMenuItem(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Menu item not found" });
    }
    broadcastUpdate("menu_deleted", { id: req.params.id });
    res.json({ success: true });
  });

  app.post("/api/menu/generate-quick-codes", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const items = await st.getMenuItems();
      const usedCodes = new Set<string>();
      const itemsNeedingCodes: typeof items = [];

      // First pass: collect existing codes and items that need codes
      for (const item of items) {
        if (item.quickCode) {
          usedCodes.add(item.quickCode);
        } else {
          itemsNeedingCodes.push(item);
        }
      }

      // Generate unique codes for items that need them
      const letters = "abcdefghijklmnopqrstuvwxyz";
      let updated = 0;

      for (const item of itemsNeedingCodes) {
        let found = false;
        for (let letterIdx = 0; letterIdx < letters.length && !found; letterIdx++) {
          for (let num = 1; num <= 99 && !found; num++) {
            const code = `${letters[letterIdx]}${num}`;
            if (!usedCodes.has(code)) {
              usedCodes.add(code);
              await st.updateMenuItem(item.id, { quickCode: code });
              updated++;
              found = true;
            }
          }
        }
      }

      res.json({ success: true, updated, message: `Generated quick codes for ${updated} menu items` });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to generate quick codes" });
    }
  });

  app.post("/api/menu/seed-sample-recipes", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const recipes = [
        {
          menuItemName: "Thai Basil Paneer (Starter)",
          ingredients: [
            { name: "Paneer", quantity: "150", unit: "g" },
            { name: "Thai Basil", quantity: "15", unit: "g" },
            { name: "Red Chili", quantity: "2", unit: "pcs" },
            { name: "Garlic", quantity: "6", unit: "cloves" },
            { name: "Cooking Oil", quantity: "30", unit: "ml" },
            { name: "Soy Sauce", quantity: "20", unit: "ml" },
          ],
        },
        {
          menuItemName: "Thai Basil Chicken (Starter)",
          ingredients: [
            { name: "Chicken Breast", quantity: "150", unit: "g" },
            { name: "Thai Basil", quantity: "15", unit: "g" },
            { name: "Red Chili", quantity: "2", unit: "pcs" },
            { name: "Garlic", quantity: "6", unit: "cloves" },
            { name: "Cooking Oil", quantity: "30", unit: "ml" },
            { name: "Soy Sauce", quantity: "20", unit: "ml" },
          ],
        },
        {
          menuItemName: "Thai Basil Prawns (Starter)",
          ingredients: [
            { name: "Prawns", quantity: "150", unit: "g" },
            { name: "Thai Basil", quantity: "15", unit: "g" },
            { name: "Red Chili", quantity: "2", unit: "pcs" },
            { name: "Garlic", quantity: "6", unit: "cloves" },
            { name: "Cooking Oil", quantity: "30", unit: "ml" },
            { name: "Soy Sauce", quantity: "20", unit: "ml" },
          ],
        },
        {
          menuItemName: "Thai Curry With Steam Rice Paneer",
          ingredients: [
            { name: "Paneer", quantity: "200", unit: "g" },
            { name: "Coconut Milk", quantity: "200", unit: "ml" },
            { name: "Lemongrass", quantity: "10", unit: "g" },
            { name: "Garlic", quantity: "8", unit: "cloves" },
            { name: "Ginger", quantity: "15", unit: "g" },
            { name: "Green Chili", quantity: "2", unit: "pcs" },
            { name: "Lime", quantity: "0.5", unit: "pcs" },
            { name: "Fish Sauce", quantity: "15", unit: "ml" },
            { name: "Cooking Oil", quantity: "40", unit: "ml" },
          ],
        },
        {
          menuItemName: "Thai Curry With Steam Rice Chicken",
          ingredients: [
            { name: "Chicken Breast", quantity: "200", unit: "g" },
            { name: "Coconut Milk", quantity: "200", unit: "ml" },
            { name: "Lemongrass", quantity: "10", unit: "g" },
            { name: "Garlic", quantity: "8", unit: "cloves" },
            { name: "Ginger", quantity: "15", unit: "g" },
            { name: "Green Chili", quantity: "2", unit: "pcs" },
            { name: "Lime", quantity: "0.5", unit: "pcs" },
            { name: "Fish Sauce", quantity: "15", unit: "ml" },
            { name: "Cooking Oil", quantity: "40", unit: "ml" },
          ],
        },
      ];

      // First, delete all existing recipes for these menu items to avoid duplicates
      const existingRecipes = await st.getRecipes();
      for (const recipe of recipes) {
        const menuItem = (await st.getMenuItems()).find(m => m.name === recipe.menuItemName);
        if (menuItem) {
          const oldRecipe = existingRecipes.find(r => r.menuItemId === menuItem.id);
          if (oldRecipe) {
            await st.deleteRecipe(oldRecipe.id);
            console.log(`🗑️ Deleted old recipe for: ${menuItem.name}`);
          }
        }
      }

      let addedRecipes = 0;
      const inventoryItems = await st.getInventoryItems();
      const inventoryMap = new Map(inventoryItems.map(item => [item.name.toLowerCase(), item]));

      for (const recipe of recipes) {
        const menuItem = (await st.getMenuItems()).find(m => m.name === recipe.menuItemName);
        if (!menuItem) {
          console.log(`Menu item not found: ${recipe.menuItemName}`);
          continue;
        }

        const recipeData = {
          menuItemId: menuItem.id,
          name: `Recipe for ${menuItem.name}`,
          ingredients: [] as any[],
        };

        for (const ing of recipe.ingredients) {
          const invItem = inventoryMap.get(ing.name.toLowerCase());
          if (invItem) {
            recipeData.ingredients.push({
              inventoryItemId: invItem.id,
              quantity: parseFloat(ing.quantity),
              unit: ing.unit,
            });
          }
        }

        if (recipe.ingredients.length > 0) {
          const createdRecipe = await st.createRecipe({ menuItemId: menuItem.id });
          console.log(`Created recipe for: ${menuItem.name} with ID: ${createdRecipe.id}`);
          
          let addedIngredients = 0;
          // Now add ingredients to the recipe
          for (const ing of recipe.ingredients) {
            const invItem = inventoryMap.get(ing.name.toLowerCase());
            if (invItem) {
              try {
                await st.createRecipeIngredient({
                  recipeId: createdRecipe.id,
                  inventoryItemId: invItem.id,
                  quantity: String(ing.quantity),
                  unit: ing.unit,
                });
                addedIngredients++;
                console.log(`  ✅ Added ingredient: ${ing.name} (ID: ${invItem.id}) - ${ing.quantity}${ing.unit}`);
              } catch (ingError) {
                console.error(`  ❌ Failed to add ingredient ${ing.name}:`, ingError);
              }
            } else {
              console.warn(`  ⚠️  Ingredient not found in inventory: ${ing.name}`);
            }
          }
          
          if (addedIngredients > 0) {
            addedRecipes++;
            console.log(`✅ Recipe fully populated for: ${menuItem.name} (${addedIngredients} ingredients)`);
          } else {
            console.warn(`⚠️  No ingredients were added to recipe for ${menuItem.name}`);
          }
        } else {
          console.warn(`⚠️  No ingredients found for recipe ${recipe.menuItemName}`);
        }
      }

      res.json({ success: true, addedRecipes, message: `Seeded ${addedRecipes} sample recipes with all ingredients` });
    } catch (error) {
      console.error("Error seeding recipes:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to seed recipes" });
    }
  });

  app.get("/api/orders", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const orders = await st.getOrders();
    res.json(orders);
  });

  app.get("/api/orders/active", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const orders = await st.getActiveOrders();
    res.json(orders);
  });

  app.get("/api/orders/completed", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const orders = await st.getCompletedOrders();
    res.json(orders);
  });

  app.get("/api/orders/delivery", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const orders = await st.getDeliveryOrders();
    res.json(orders);
  });

  app.get("/api/delivery-persons", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const persons = await st.getDeliveryPersons();
    res.json(persons);
  });

  app.get("/api/delivery-persons/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const person = await st.getDeliveryPerson(req.params.id);
    if (!person) {
      return res.status(404).json({ error: "Delivery person not found" });
    }
    res.json(person);
  });

  app.post("/api/delivery-persons", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const person = await st.createDeliveryPerson(req.body);
      res.status(201).json(person);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create delivery person" });
    }
  });

  app.patch("/api/delivery-persons/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const person = await st.updateDeliveryPerson(req.params.id, req.body);
    if (!person) {
      return res.status(404).json({ error: "Delivery person not found" });
    }
    res.json(person);
  });

  app.delete("/api/delivery-persons/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const success = await st.deleteDeliveryPerson(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Delivery person not found" });
    }
    res.status(204).send();
  });

  app.patch("/api/orders/:id/assign-driver", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { deliveryPersonId } = req.body;
    
    const existingOrder = await st.getOrder(req.params.id);
    if (!existingOrder) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    if (existingOrder.orderType !== "delivery") {
      return res.status(400).json({ error: "Can only assign drivers to delivery orders" });
    }
    
    if (deliveryPersonId) {
      const driver = await st.getDeliveryPerson(deliveryPersonId);
      if (!driver) {
        return res.status(400).json({ error: "Delivery person not found" });
      }
    }
    
    const order = await st.assignDeliveryPerson(req.params.id, deliveryPersonId);
    if (!order) {
      return res.status(500).json({ error: "Failed to assign driver" });
    }
    res.json(order);
  });

  app.get("/api/orders/:id/invoice/pdf", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const order = await st.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const invoices = await st.getInvoices();
      const invoice = invoices.find(inv => inv.orderId === req.params.id);
      
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found for this order" });
      }

      const orderItems = await st.getOrderItems(req.params.id);

      const pdfBuffer = generateInvoicePDF({
        invoice,
        order,
        orderItems,
        restaurantName: "Restaurant POS",
        restaurantAddress: "123 Main Street, City, State 12345",
        restaurantPhone: "+1 (555) 123-4567",
        restaurantGSTIN: "GSTIN1234567890"
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="Invoice-${invoice.invoiceNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating PDF:", error);
      res.status(500).json({ error: "Failed to generate PDF invoice" });
    }
  });

  app.get("/api/orders/:id/kot/pdf", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const order = await st.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const orderItems = await st.getOrderItems(req.params.id);
      if (!orderItems || orderItems.length === 0) {
        return res.status(400).json({ error: "No items in order" });
      }

      let tableInfo = null;
      if (order.tableId) {
        tableInfo = await st.getTable(order.tableId);
      }

      const pdfBuffer = generateKOTPDF({
        order,
        orderItems,
        tableNumber: tableInfo?.tableNumber || undefined,
        floorName: tableInfo?.floorId ? (await st.getFloor(tableInfo.floorId))?.name || undefined : undefined,
        restaurantName: "Restaurant POS"
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="KOT-${order.id.substring(0, 8)}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating KOT PDF:", error);
      res.status(500).json({ error: "Failed to generate KOT PDF" });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const order = await st.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    res.json(order);
  });

  app.get("/api/orders/:id/items", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const items = await st.getOrderItems(req.params.id);
    res.json(items);
  });

  app.post("/api/orders", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertOrderSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const order = await st.createOrder(result.data);

    if (order.tableId) {
      await st.updateTableOrder(order.tableId, order.id);
      await st.updateTableStatus(order.tableId, "occupied");
    }

    broadcastUpdate("order_created", order);
    res.json(order);
  });

  app.post("/api/orders/:id/items", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertOrderItemSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    console.log('[Server] Creating order item for order:', req.params.id);
    const item = await st.createOrderItem(result.data);

    const orderItems = await st.getOrderItems(req.params.id);
    const total = orderItems.reduce((sum, item) => {
      return sum + parseFloat(item.price) * item.quantity;
    }, 0);

    await st.updateOrderTotal(req.params.id, total.toFixed(2));

    const order = await st.getOrder(req.params.id);
    if (order && order.tableId) {
      const hasNew = orderItems.some((i) => i.status === "new");
      const hasPreparing = orderItems.some((i) => i.status === "preparing");
      const allReady = orderItems.every((i) => i.status === "ready" || i.status === "served");
      const allServed = orderItems.every((i) => i.status === "served");

      if (allServed) {
        await st.updateTableStatus(order.tableId, "served");
      } else if (allReady) {
        await st.updateTableStatus(order.tableId, "ready");
      } else if (hasPreparing) {
        await st.updateTableStatus(order.tableId, "preparing");
      } else if (hasNew) {
        await st.updateTableStatus(order.tableId, "occupied");
      }

      const updatedTable = await st.getTable(order.tableId);
      if (updatedTable) {
        broadcastUpdate("table_updated", updatedTable);
      }
    }

    console.log('[Server] Broadcasting order_item_added for orderId:', req.params.id);
    broadcastUpdate("order_item_added", { orderId: req.params.id, item });
    res.json(item);
  });

  app.patch("/api/orders/:id/status", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { status } = req.body;
    const order = await st.updateOrderStatus(req.params.id, status);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    broadcastUpdate("order_updated", order);
    res.json(order);
  });

  app.post("/api/orders/:id/complete", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const order = await st.completeOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.tableId) {
      await st.updateTableOrder(order.tableId, null);
      await st.updateTableStatus(order.tableId, "free");
    }

    broadcastUpdate("order_completed", order);
    res.json(order);
  });

  app.post("/api/orders/:id/kot", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = orderActionSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    console.log('[Server] Sending order to kitchen:', req.params.id);
    const order = await st.updateOrderStatus(req.params.id, "sent_to_kitchen");
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    console.log('[Server] Broadcasting order_updated for KOT, orderId:', order.id, 'status:', order.status);
    broadcastUpdate("order_updated", order);
    res.json({ order, shouldPrint: result.data.print });
  });

  app.post("/api/orders/:id/save", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = orderActionSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    const order = await st.updateOrderStatus(req.params.id, "saved");
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    let invoice = null;
    if (result.data.print) {
      const orderItems = await st.getOrderItems(req.params.id);
      const subtotal = orderItems.reduce((sum, item) => 
        sum + parseFloat(item.price) * item.quantity, 0
      );
      const tax = subtotal * 0.05;
      const total = subtotal + tax;

      let tableInfo = null;
      if (order.tableId) {
        tableInfo = await st.getTable(order.tableId);
      }

      const invoiceCount = (await st.getInvoices()).length;
      const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, '0')}`;

      const invoiceItemsData = orderItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: parseFloat(item.price),
        isVeg: item.isVeg,
        notes: item.notes || undefined
      }));

      invoice = await st.createInvoice({
        invoiceNumber,
        orderId: order.id,
        tableNumber: tableInfo?.tableNumber || null,
        floorName: tableInfo?.floorId ? (await st.getFloor(tableInfo.floorId))?.name || null : null,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        subtotal: subtotal.toFixed(2),
        tax: tax.toFixed(2),
        discount: "0",
        total: total.toFixed(2),
        paymentMode: order.paymentMode || "cash",
        splitPayments: null,
        status: "Saved",
        items: JSON.stringify(invoiceItemsData),
        notes: null,
      });

      broadcastUpdate("invoice_created", invoice);
    }

    broadcastUpdate("order_updated", order);
    res.json({ order, invoice, shouldPrint: result.data.print });
  });

  app.post("/api/orders/:id/bill", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = orderActionSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    const order = await st.billOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderItems = await st.getOrderItems(req.params.id);
    
    const subtotal = orderItems.reduce((sum, item) => 
      sum + parseFloat(item.price) * item.quantity, 0
    );
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    let tableInfo = null;
    if (order.tableId) {
      tableInfo = await st.getTable(order.tableId);
    }

    const invoiceCount = (await st.getInvoices()).length;
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, '0')}`;

    const invoiceItemsData = orderItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: parseFloat(item.price),
      isVeg: item.isVeg,
      notes: item.notes || undefined
    }));

    const invoice = await st.createInvoice({
      invoiceNumber,
      orderId: order.id,
      tableNumber: tableInfo?.tableNumber || null,
      floorName: tableInfo?.floorId ? (await st.getFloor(tableInfo.floorId))?.name || null : null,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      discount: "0",
      total: total.toFixed(2),
      paymentMode: order.paymentMode || "cash",
      splitPayments: null,
      status: "Billed",
      items: JSON.stringify(invoiceItemsData),
      notes: null,
    });

    broadcastUpdate("order_updated", order);
    broadcastUpdate("invoice_created", invoice);
    res.json({ order, invoice, shouldPrint: result.data.print });
  });

  app.post("/api/orders/:id/checkout", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = checkoutSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    const order = await st.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const orderItems = await st.getOrderItems(req.params.id);
    
    const subtotal = orderItems.reduce((sum, item) => 
      sum + parseFloat(item.price) * item.quantity, 0
    );
    const tax = subtotal * 0.05;
    const total = subtotal + tax;

    if (result.data.splitPayments && result.data.splitPayments.length > 0) {
      const splitSum = result.data.splitPayments.reduce((sum, split) => sum + split.amount, 0);
      const tolerance = 0.01;
      if (Math.abs(splitSum - total) > tolerance) {
        return res.status(400).json({ 
          error: "Split payment amounts must equal the total bill",
          splitSum,
          total 
        });
      }
      for (const split of result.data.splitPayments) {
        if (split.amount <= 0) {
          return res.status(400).json({ error: "Split payment amounts must be positive" });
        }
      }
    }

    const checkedOutOrder = await st.checkoutOrder(req.params.id, result.data.paymentMode);
    if (!checkedOutOrder) {
      return res.status(500).json({ error: "Failed to checkout order" });
    }

    let tableInfo = null;
    if (checkedOutOrder.tableId) {
      tableInfo = await st.getTable(checkedOutOrder.tableId);
      await st.updateTableOrder(checkedOutOrder.tableId, null);
      await st.updateTableStatus(checkedOutOrder.tableId, "free");
    }

    // Update customer's table status to "free" for digital menu orders
    if (checkedOutOrder.customerPhone) {
      await digitalMenuSync.updateCustomerTableStatus(checkedOutOrder.customerPhone, 'free');
    }

    const invoiceCount = (await st.getInvoices()).length;
    const invoiceNumber = `INV-${String(invoiceCount + 1).padStart(4, '0')}`;

    const invoiceItemsData = orderItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      price: parseFloat(item.price),
      isVeg: item.isVeg,
      notes: item.notes || undefined
    }));

    const invoice = await st.createInvoice({
      invoiceNumber,
      orderId: checkedOutOrder.id,
      tableNumber: tableInfo?.tableNumber || null,
      floorName: tableInfo?.floorId ? (await st.getFloor(tableInfo.floorId))?.name || null : null,
      customerName: checkedOutOrder.customerName,
      customerPhone: checkedOutOrder.customerPhone,
      subtotal: subtotal.toFixed(2),
      tax: tax.toFixed(2),
      discount: "0",
      total: total.toFixed(2),
      paymentMode: result.data.paymentMode || "cash",
      splitPayments: result.data.splitPayments ? JSON.stringify(result.data.splitPayments) : null,
      status: "Paid",
      items: JSON.stringify(invoiceItemsData),
      notes: null,
    });

    // Auto-deduct inventory for order
    try {
      await st.deductInventoryForOrder(checkedOutOrder.id);
      broadcastUpdate("inventory_updated", { orderId: checkedOutOrder.id });
    } catch (error) {
      console.error("Error deducting inventory for order:", error);
    }

    broadcastUpdate("order_paid", checkedOutOrder);
    broadcastUpdate("invoice_created", invoice);
    res.json({ order: checkedOutOrder, invoice, shouldPrint: result.data.print });
  });

  app.get("/api/invoices/:id/pdf", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const invoice = await st.getInvoice(req.params.id);
      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const order = await st.getOrder(invoice.orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const orderItems = await st.getOrderItems(invoice.orderId);

      const pdfBuffer = generateInvoicePDF({
        invoice,
        order,
        orderItems,
        restaurantName: "Restaurant POS",
        restaurantAddress: "123 Main Street, City, State 12345",
        restaurantPhone: "+1 (555) 123-4567",
        restaurantGSTIN: "GSTIN1234567890",
      });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Error generating invoice PDF:", error);
      res.status(500).json({ error: "Failed to generate invoice PDF" });
    }
  });

  app.patch("/api/order-items/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { quantity, notes, name } = req.body;
    const data: Partial<{ quantity: number; notes: string | null; name: string }> = {};
    if (quantity !== undefined) data.quantity = quantity;
    if (notes !== undefined) data.notes = notes;
    if (name !== undefined) data.name = name;
    const item = await st.updateOrderItem(req.params.id, data);
    if (!item) return res.status(404).json({ error: "Order item not found" });
    const orderItems = await st.getOrderItems(item.orderId);
    const total = orderItems.reduce((s, i) => s + parseFloat(i.price) * i.quantity, 0);
    await st.updateOrderTotal(item.orderId, total.toFixed(2));
    broadcastUpdate("order_item_updated", item);
    res.json(item);
  });

  app.delete("/api/orders/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const order = await st.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const items = await st.getOrderItems(req.params.id);
    for (const item of items) await st.deleteOrderItem(item.id);
    if (order.tableId) {
      await st.updateTableOrder(order.tableId, null);
      await st.updateTableStatus(order.tableId, "free");
      const updatedTable = await st.getTable(order.tableId);
      if (updatedTable) broadcastUpdate("table_updated", updatedTable);
    }
    await st.deleteOrder(req.params.id);
    broadcastUpdate("order_updated", { id: req.params.id, deleted: true });
    res.json({ success: true });
  });

  app.patch("/api/order-items/:id/status", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { status } = req.body;
    const item = await st.updateOrderItemStatus(req.params.id, status);
    if (!item) {
      return res.status(404).json({ error: "Order item not found" });
    }

    const order = await st.getOrder(item.orderId);
    if (order && order.tableId) {
      const allItems = await st.getOrderItems(item.orderId);
      const hasNew = allItems.some((i) => i.status === "new");
      const hasPreparing = allItems.some((i) => i.status === "preparing");
      const allReady = allItems.every((i) => i.status === "ready" || i.status === "served");
      const allServed = allItems.every((i) => i.status === "served");

      let newTableStatus = null;
      if (allServed) {
        newTableStatus = "served";
        await st.updateTableStatus(order.tableId, "served");
      } else if (allReady) {
        newTableStatus = "ready";
        await st.updateTableStatus(order.tableId, "ready");
      } else if (hasPreparing) {
        newTableStatus = "preparing";
        await st.updateTableStatus(order.tableId, "preparing");
      } else if (hasNew) {
        newTableStatus = "occupied";
        await st.updateTableStatus(order.tableId, "occupied");
      }

      if (newTableStatus) {
        const updatedTable = await st.getTable(order.tableId);
        if (updatedTable) {
          broadcastUpdate("table_updated", updatedTable);
        }
      }
    }

    // Sync table status to digital menu customer if this is a digital menu order
    if (order && order.customerPhone) {
      await digitalMenuSync.syncTableStatusFromPOSOrder(item.orderId);
    }

    broadcastUpdate("order_item_updated", item);
    res.json(item);
  });

  app.delete("/api/order-items/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const item = await st.getOrderItem(req.params.id);
    if (!item) {
      return res.status(404).json({ error: "Order item not found" });
    }

    const success = await st.deleteOrderItem(req.params.id);
    if (!success) {
      return res.status(500).json({ error: "Failed to delete order item" });
    }

    const orderItems = await st.getOrderItems(item.orderId);
    const total = orderItems.reduce((sum, orderItem) => {
      return sum + parseFloat(orderItem.price) * orderItem.quantity;
    }, 0);

    await st.updateOrderTotal(item.orderId, total.toFixed(2));

    broadcastUpdate("order_item_deleted", { id: req.params.id, orderId: item.orderId });
    res.json({ success: true });
  });

  app.get("/api/inventory", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const items = await st.getInventoryItems();
    res.json(items);
  });

  app.post("/api/inventory", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertInventoryItemSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const item = await st.createInventoryItem(result.data);
    res.json(item);
  });

  app.patch("/api/inventory/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { quantity } = req.body;
    const item = await st.updateInventoryQuantity(req.params.id, quantity);
    if (!item) {
      return res.status(404).json({ error: "Inventory item not found" });
    }
    res.json(item);
  });

  app.get("/api/invoices", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const invoices = await st.getInvoices();
    res.json(invoices);
  });

  app.get("/api/invoices/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const invoice = await st.getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(invoice);
  });

  app.get("/api/invoices/number/:invoiceNumber", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const invoice = await st.getInvoiceByNumber(req.params.invoiceNumber);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    res.json(invoice);
  });

  app.post("/api/invoices", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertInvoiceSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const invoice = await st.createInvoice(result.data);
    broadcastUpdate("invoice_created", invoice);
    res.json(invoice);
  });

  app.patch("/api/invoices/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const invoice = await st.updateInvoice(req.params.id, req.body);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    broadcastUpdate("invoice_updated", invoice);
    res.json(invoice);
  });

  app.delete("/api/invoices/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const success = await st.deleteInvoice(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    broadcastUpdate("invoice_deleted", { id: req.params.id });
    res.json({ success: true });
  });

  app.get("/api/reservations", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const reservations = await st.getReservations();
    res.json(reservations);
  });

  app.get("/api/reservations/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const reservation = await st.getReservation(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    res.json(reservation);
  });

  app.get("/api/reservations/table/:tableId", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const reservations = await st.getReservationsByTable(req.params.tableId);
    res.json(reservations);
  });

  app.post("/api/reservations", requireAuth, async (req, res) => {
    const st = getStorage(req);
    console.log("=== SERVER: CREATE RESERVATION ===");
    console.log("Received body:", req.body);
    console.log("Body type:", typeof req.body);
    console.log("Body keys:", Object.keys(req.body));
    console.log("timeSlot value:", req.body.timeSlot);
    console.log("timeSlot type:", typeof req.body.timeSlot);
    
    const result = insertReservationSchema.safeParse(req.body);
    console.log("Validation result:", result.success);
    
    if (!result.success) {
      console.error("Validation errors:", JSON.stringify(result.error, null, 2));
      return res.status(400).json({ error: result.error });
    }
    
    console.log("Validated data:", result.data);
    
    const existingReservations = await st.getReservationsByTable(result.data.tableId);
    if (existingReservations.length > 0) {
      return res.status(409).json({ error: "This table already has an active reservation" });
    }
    
    const reservation = await st.createReservation(result.data);
    console.log("Created reservation:", reservation);
    
    const table = await st.getTable(reservation.tableId);
    if (table && table.status === "free") {
      const updatedTable = await st.updateTableStatus(reservation.tableId, "reserved");
      if (updatedTable) {
        broadcastUpdate("table_updated", updatedTable);
      }
    }
    broadcastUpdate("reservation_created", reservation);
    res.json(reservation);
  });

  app.patch("/api/reservations/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const existingReservation = await st.getReservation(req.params.id);
    if (!existingReservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    
    const oldTableId = existingReservation.tableId;
    const newTableId = req.body.tableId || oldTableId;
    const tableChanged = oldTableId !== newTableId;
    
    if (tableChanged) {
      const newTableReservations = await st.getReservationsByTable(newTableId);
      if (newTableReservations.length > 0) {
        return res.status(409).json({ error: "The destination table already has an active reservation" });
      }
    }
    
    const reservation = await st.updateReservation(req.params.id, req.body);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    
    if (tableChanged) {
      const oldTableReservations = await st.getReservationsByTable(oldTableId);
      if (oldTableReservations.length === 0) {
        const oldTable = await st.getTable(oldTableId);
        if (oldTable && oldTable.status === "reserved" && !oldTable.currentOrderId) {
          const updatedOldTable = await st.updateTableStatus(oldTableId, "free");
          if (updatedOldTable) {
            broadcastUpdate("table_updated", updatedOldTable);
          }
        }
      }
      
      const newTable = await st.getTable(newTableId);
      if (newTable && newTable.status === "free") {
        const updatedNewTable = await st.updateTableStatus(newTableId, "reserved");
        if (updatedNewTable) {
          broadcastUpdate("table_updated", updatedNewTable);
        }
      }
    }
    
    if (req.body.status === "cancelled") {
      const tableReservations = await st.getReservationsByTable(reservation.tableId);
      if (tableReservations.length === 0) {
        const table = await st.getTable(reservation.tableId);
        if (table && table.status === "reserved" && !table.currentOrderId) {
          const updatedTable = await st.updateTableStatus(reservation.tableId, "free");
          if (updatedTable) {
            broadcastUpdate("table_updated", updatedTable);
          }
        }
      }
    }
    
    broadcastUpdate("reservation_updated", reservation);
    res.json(reservation);
  });

  app.delete("/api/reservations/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const reservation = await st.getReservation(req.params.id);
    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found" });
    }
    const success = await st.deleteReservation(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Failed to delete reservation" });
    }
    const tableReservations = await st.getReservationsByTable(reservation.tableId);
    if (tableReservations.length === 0) {
      const table = await st.getTable(reservation.tableId);
      if (table && table.status === "reserved" && !table.currentOrderId) {
        const updatedTable = await st.updateTableStatus(reservation.tableId, "free");
        if (updatedTable) {
          broadcastUpdate("table_updated", updatedTable);
        }
      }
    }
    broadcastUpdate("reservation_deleted", { id: req.params.id });
    res.json({ success: true });
  });

  app.post("/api/admin/clear-data", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const { types = ['all'] } = req.body;
      const cleared: string[] = [];

      if (types.includes('orderItems') || types.includes('all')) {
        const orders = await st.getOrders();
        for (const order of orders) {
          const orderItems = await st.getOrderItems(order.id);
          for (const item of orderItems) {
            await st.deleteOrderItem(item.id);
          }
        }
        cleared.push('orderItems');
      }

      if (types.includes('invoices') || types.includes('all')) {
        const invoices = await st.getInvoices();
        for (const invoice of invoices) {
          await st.deleteInvoice(invoice.id);
        }
        cleared.push('invoices');
      }

      if (types.includes('orders') || types.includes('all')) {
        const orders = await st.getOrders();
        for (const order of orders) {
          await st.deleteOrder(order.id);
        }
        cleared.push('orders');
      }

      broadcastUpdate("data_cleared", { types: cleared });
      res.json({ success: true, cleared });
    } catch (error) {
      console.error("Error clearing data:", error);
      res.status(500).json({ error: "Failed to clear data" });
    }
  });

  app.get("/api/customers", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const customers = await st.getCustomers();
    res.json(customers);
  });

  app.get("/api/customers/:id/stats", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const customer = await st.getCustomer(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const orders = await st.getOrders();
    const customerOrders = orders.filter(o => o.customerPhone === customer.phone);
    const totalOrders = customerOrders.length;

    const invoices = await st.getInvoices();
    const customerInvoices = invoices.filter(inv => {
      const order = customerOrders.find(o => o.id === inv.orderId);
      return !!order;
    });
    const actualTotalSpent = customerInvoices.reduce((sum, inv) => sum + parseFloat(inv.total || '0'), 0);

    const lastOrder = customerOrders.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];

    res.json({
      totalOrders,
      totalSpent: actualTotalSpent,
      lastVisit: lastOrder ? lastOrder.createdAt : customer.createdAt,
    });
  });

  app.get("/api/customers/phone/:phone", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const customer = await st.getCustomerByPhone(req.params.phone);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(customer);
  });

  app.get("/api/customers/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const customer = await st.getCustomer(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(customer);
  });

  app.post("/api/customers", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertCustomerSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const existingCustomer = await st.getCustomerByPhone(result.data.phone);
    if (existingCustomer) {
      return res.status(409).json({ error: "Customer with this phone number already exists", customer: existingCustomer });
    }
    const customer = await st.createCustomer(result.data);
    broadcastUpdate("customer_created", customer);
    res.json(customer);
  });

  app.patch("/api/customers/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const customer = await st.updateCustomer(req.params.id, req.body);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    broadcastUpdate("customer_updated", customer);
    res.json(customer);
  });

  app.delete("/api/customers/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const success = await st.deleteCustomer(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Customer not found" });
    }
    broadcastUpdate("customer_deleted", { id: req.params.id });
    res.json({ success: true });
  });

  app.get("/api/feedbacks", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const feedbacks = await st.getFeedbacks();
    res.json(feedbacks);
  });

  app.get("/api/feedbacks/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const feedback = await st.getFeedback(req.params.id);
    if (!feedback) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    res.json(feedback);
  });

  app.post("/api/feedbacks", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const result = insertFeedbackSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    const feedback = await st.createFeedback(result.data);
    broadcastUpdate("feedback_created", feedback);
    res.json(feedback);
  });

  app.delete("/api/feedbacks/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const success = await st.deleteFeedback(req.params.id);
    if (!success) {
      return res.status(404).json({ error: "Feedback not found" });
    }
    broadcastUpdate("feedback_deleted", { id: req.params.id });
    res.json({ success: true });
  });

  app.get("/api/settings/mongodb-uri", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const uri = await st.getSetting("mongodb_uri");
    res.json({ uri: uri || null, hasUri: !!uri });
  });

  app.post("/api/settings/mongodb-uri", requireAuth, async (req, res) => {
    const st = getStorage(req);
    const { uri } = req.body;
    if (!uri || typeof uri !== "string") {
      return res.status(400).json({ error: "MongoDB URI is required" });
    }
    await st.setSetting("mongodb_uri", uri);
    res.json({ success: true });
  });

  app.post("/api/menu/sync-from-mongodb", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const mongoUri = await st.getSetting("mongodb_uri");
      if (!mongoUri) {
        return res.status(400).json({ error: "MongoDB URI not configured. Please set it first." });
      }

      const { databaseName } = req.body;
      const { items, categories } = await fetchMenuItemsFromMongoDB(mongoUri, databaseName);
      
      const existingItems = await st.getMenuItems();
      for (const existing of existingItems) {
        await st.deleteMenuItem(existing.id);
      }
      
      const createdItems = [];
      for (const item of items) {
        const created = await st.createMenuItem(item);
        createdItems.push(created);
      }
      
      await st.setSetting("menu_categories", JSON.stringify(categories));
      
      broadcastUpdate("menu_synced", { count: createdItems.length });
      
      res.json({ 
        success: true, 
        itemsImported: createdItems.length,
        items: createdItems 
      });
    } catch (error) {
      console.error("Error syncing from MongoDB:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to sync from MongoDB" 
      });
    }
  });

  // ==================== INVENTORY MANAGEMENT API ROUTES ====================

  // Inventory Items
  app.get("/api/inventory", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      let items = await st.getInventoryItems();
      
      // Apply search filter
      if (req.query.search) {
        const search = req.query.search.toString().toLowerCase();
        items = items.filter(item => 
          item.name.toLowerCase().includes(search) ||
          item.category.toLowerCase().includes(search)
        );
      }
      
      // Apply category filter
      if (req.query.category) {
        const category = req.query.category.toString();
        items = items.filter(item => item.category === category);
      }
      
      // Apply sorting
      if (req.query.sortBy) {
        const sortBy = req.query.sortBy.toString();
        if (sortBy === 'name') {
          items.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortBy === 'stock') {
          items.sort((a, b) => parseFloat(a.currentStock) - parseFloat(b.currentStock));
        } else if (sortBy === 'lowStock') {
          items = items.filter(item => parseFloat(item.currentStock) <= parseFloat(item.minStock));
        }
      }
      
      res.json(items);
    } catch (error) {
      console.error("Error fetching inventory:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch inventory" });
    }
  });

  app.get("/api/inventory/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const item = await st.getInventoryItem(req.params.id);
      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch inventory item" });
    }
  });

  app.post("/api/inventory", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const result = insertInventoryItemSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      const item = await st.createInventoryItem(result.data);
      broadcastUpdate("inventory_created", item);
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create inventory item" });
    }
  });

  app.patch("/api/inventory/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const item = await st.updateInventoryItem(req.params.id, req.body);
      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      broadcastUpdate("inventory_updated", item);
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update inventory item" });
    }
  });

  app.delete("/api/inventory/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const success = await st.deleteInventoryItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      broadcastUpdate("inventory_deleted", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete inventory item" });
    }
  });

  // Recipes & Ingredients
  app.get("/api/recipes/menu-item/:menuItemId", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const recipe = await st.getRecipeByMenuItemId(req.params.menuItemId);
      if (!recipe) {
        return res.status(404).json({ error: "Recipe not found for this menu item" });
      }
      
      const ingredients = await st.getRecipeIngredients(recipe.id);
      const ingredientsWithDetails = await Promise.all(
        ingredients.map(async (ingredient) => {
          const inventoryItem = await st.getInventoryItem(ingredient.inventoryItemId);
          return {
            ...ingredient,
            inventoryItem,
          };
        })
      );
      
      res.json({
        recipe,
        ingredients: ingredientsWithDetails,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch recipe" });
    }
  });

  app.post("/api/recipes", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const result = insertRecipeSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      const recipe = await st.createRecipe(result.data);
      broadcastUpdate("recipe_created", recipe);
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create recipe" });
    }
  });

  app.post("/api/recipes/:recipeId/ingredients", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const bodySchema = insertRecipeIngredientSchema.omit({ recipeId: true });
      const result = bodySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      const ingredient = await st.createRecipeIngredient({
        ...result.data,
        recipeId: req.params.recipeId,
      });
      broadcastUpdate("recipe_ingredient_added", ingredient);
      res.json(ingredient);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to add recipe ingredient" });
    }
  });

  app.patch("/api/recipes/:recipeId/ingredients/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const ingredient = await st.updateRecipeIngredient(req.params.id, req.body);
      if (!ingredient) {
        return res.status(404).json({ error: "Recipe ingredient not found" });
      }
      broadcastUpdate("recipe_ingredient_updated", ingredient);
      res.json(ingredient);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update recipe ingredient" });
    }
  });

  app.delete("/api/recipes/:recipeId/ingredients/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const success = await st.deleteRecipeIngredient(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Recipe ingredient not found" });
      }
      broadcastUpdate("recipe_ingredient_deleted", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete recipe ingredient" });
    }
  });

  app.delete("/api/recipes/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const success = await st.deleteRecipe(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Recipe not found" });
      }
      broadcastUpdate("recipe_deleted", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete recipe" });
    }
  });

  // Suppliers
  app.get("/api/suppliers", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const suppliers = await st.getSuppliers();
      res.json(suppliers);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch suppliers" });
    }
  });

  app.post("/api/suppliers", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const result = insertSupplierSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      const supplier = await st.createSupplier(result.data);
      broadcastUpdate("supplier_created", supplier);
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create supplier" });
    }
  });

  app.patch("/api/suppliers/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const supplier = await st.updateSupplier(req.params.id, req.body);
      if (!supplier) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      broadcastUpdate("supplier_updated", supplier);
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update supplier" });
    }
  });

  app.delete("/api/suppliers/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const success = await st.deleteSupplier(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Supplier not found" });
      }
      broadcastUpdate("supplier_deleted", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete supplier" });
    }
  });

  // Purchase Orders
  app.get("/api/purchase-orders", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const orders = await st.getPurchaseOrders();
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await st.getPurchaseOrderItems(order.id);
          const itemsWithDetails = await Promise.all(
            items.map(async (item) => {
              const inventoryItem = await st.getInventoryItem(item.inventoryItemId);
              return {
                ...item,
                inventoryItem,
              };
            })
          );
          const supplier = await st.getSupplier(order.supplierId);
          return {
            ...order,
            items: itemsWithDetails,
            supplier,
          };
        })
      );
      res.json(ordersWithItems);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch purchase orders" });
    }
  });

  app.get("/api/purchase-orders/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const order = await st.getPurchaseOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      
      const items = await st.getPurchaseOrderItems(order.id);
      const itemsWithDetails = await Promise.all(
        items.map(async (item) => {
          const inventoryItem = await st.getInventoryItem(item.inventoryItemId);
          return {
            ...item,
            inventoryItem,
          };
        })
      );
      const supplier = await st.getSupplier(order.supplierId);
      
      res.json({
        ...order,
        items: itemsWithDetails,
        supplier,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch purchase order" });
    }
  });

  app.post("/api/purchase-orders", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const result = insertPurchaseOrderSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      const order = await st.createPurchaseOrder(result.data);
      broadcastUpdate("purchase_order_created", order);
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create purchase order" });
    }
  });

  app.post("/api/purchase-orders/:id/items", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const result = insertPurchaseOrderItemSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      const item = await st.createPurchaseOrderItem({
        ...result.data,
        purchaseOrderId: req.params.id,
      });
      broadcastUpdate("purchase_order_item_added", item);
      res.json(item);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to add purchase order item" });
    }
  });

  app.patch("/api/purchase-orders/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const order = await st.updatePurchaseOrder(req.params.id, req.body);
      if (!order) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      broadcastUpdate("purchase_order_updated", order);
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to update purchase order" });
    }
  });

  app.post("/api/purchase-orders/:id/receive", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const order = await st.receivePurchaseOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      broadcastUpdate("purchase_order_received", order);
      broadcastUpdate("inventory_updated", { purchaseOrderId: req.params.id });
      res.json(order);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to receive purchase order" });
    }
  });

  app.delete("/api/purchase-orders/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const success = await st.deletePurchaseOrder(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Purchase order not found" });
      }
      broadcastUpdate("purchase_order_deleted", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete purchase order" });
    }
  });

  // Wastage
  app.get("/api/wastage", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const wastages = await st.getWastages();
      const wastagesWithDetails = await Promise.all(
        wastages.map(async (wastage) => {
          const inventoryItem = await st.getInventoryItem(wastage.inventoryItemId);
          return {
            ...wastage,
            inventoryItem,
          };
        })
      );
      res.json(wastagesWithDetails);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch wastage records" });
    }
  });

  app.post("/api/wastage", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const result = insertWastageSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      
      // Auto-deduct from inventory
      const inventoryItem = await st.getInventoryItem(result.data.inventoryItemId);
      if (!inventoryItem) {
        return res.status(404).json({ error: "Inventory item not found" });
      }
      
      const newStock = parseFloat(inventoryItem.currentStock) - parseFloat(result.data.quantity);
      if (newStock < 0) {
        return res.status(400).json({ error: "Insufficient stock for wastage entry" });
      }
      
      await st.updateInventoryQuantity(result.data.inventoryItemId, newStock.toString());
      
      const wastage = await st.createWastage(result.data);
      broadcastUpdate("wastage_created", wastage);
      broadcastUpdate("inventory_updated", { wastageId: wastage.id });
      res.json(wastage);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create wastage record" });
    }
  });

  app.delete("/api/wastage/:id", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const success = await st.deleteWastage(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Wastage record not found" });
      }
      broadcastUpdate("wastage_deleted", { id: req.params.id });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to delete wastage record" });
    }
  });

  // Inventory Usage Tracking
  app.get("/api/inventory-usage", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const usages = await st.getInventoryUsages();
      res.json(usages);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch inventory usage" });
    }
  });

  app.get("/api/inventory-usage/item/:itemId", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const usages = await st.getInventoryUsagesByItem(req.params.itemId);
      res.json(usages);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch item usage" });
    }
  });

  app.get("/api/inventory-usage/most-used", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const mostUsed = await st.getMostUsedItems(limit);
      res.json(mostUsed);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch most used items" });
    }
  });

  app.post("/api/inventory-usage", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const result = insertInventoryUsageSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }
      const usage = await st.createInventoryUsage(result.data);
      broadcastUpdate("inventory_usage_created", usage);
      res.json(usage);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to create inventory usage record" });
    }
  });

  // Seed Inventory and Recipes (admin endpoint)
  app.post("/api/inventory/seed", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      if (typeof storage.seedInventoryAndRecipes !== 'function') {
        return res.status(400).json({ error: "Seeding is only available with MongoDB storage" });
      }
      
      const result = await st.seedInventoryAndRecipes();
      broadcastUpdate("inventory_seeded", result);
      res.json({
        success: true,
        message: "Inventory and recipes seeded successfully",
        ...result,
      });
    } catch (error) {
      console.error("Error seeding inventory:", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to seed inventory" });
    }
  });

  // ==================== END INVENTORY MANAGEMENT API ROUTES ====================

  const digitalMenuSync = new DigitalMenuSyncService(storage);
  digitalMenuSync.setBroadcastFunction(broadcastUpdate);
  
  app.post("/api/digital-menu/sync-start", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const intervalMs = req.body.intervalMs || 5000;
      await digitalMenuSync.start(intervalMs);
      res.json({ success: true, message: "Digital menu sync service started" });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to start sync service" });
    }
  });

  app.post("/api/digital-menu/sync-stop", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      digitalMenuSync.stop();
      res.json({ success: true, message: "Digital menu sync service stopped" });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to stop sync service" });
    }
  });

  app.post("/api/digital-menu/sync-now", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const synced = await digitalMenuSync.syncOrders();
      broadcastUpdate("digital_menu_synced", { count: synced });
      res.json({ success: true, syncedOrders: synced });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to sync orders" });
    }
  });

  app.get("/api/digital-menu/status", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const status = digitalMenuSync.getSyncStatus();
      res.json(status);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to get sync status" });
    }
  });

  app.get("/api/digital-menu/orders", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const orders = await digitalMenuSync.getDigitalMenuOrders();
      res.json(orders);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch digital menu orders" });
    }
  });

  app.get("/api/digital-menu/customers", requireAuth, async (req, res) => {
    const st = getStorage(req);
    try {
      const customers = await digitalMenuSync.getDigitalMenuCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch digital menu customers" });
    }
  });

  digitalMenuSync.start(5000);

  // ── External Orders Sync (Orders DB → orders collection) ──────────────────
  const externalOrdersSync = new ExternalOrdersSyncService(mongoStorage);
  externalOrdersSync.setBroadcastFunction(broadcastUpdate);

  app.get("/api/external-orders/status", requireAuth, async (_req, res) => {
    res.json(externalOrdersSync.getStatus());
  });

  app.post("/api/external-orders/sync-now", requireAuth, async (_req, res) => {
    try {
      const synced = await externalOrdersSync.sync();
      res.json({ success: true, syncedOrders: synced });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Sync failed" });
    }
  });

  externalOrdersSync.start(1000);

  const httpServer = createServer(app);

  wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });

  wss.on("connection", (ws) => {
    ws.on("error", console.error);
  });

  return httpServer;
}
