import { mongodb } from './mongodb';
import {
  type User,
  type InsertUser,
  type Floor,
  type InsertFloor,
  type Table,
  type InsertTable,
  type MenuItem,
  type InsertMenuItem,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type InventoryItem,
  type InsertInventoryItem,
  type Recipe,
  type InsertRecipe,
  type RecipeIngredient,
  type InsertRecipeIngredient,
  type Supplier,
  type InsertSupplier,
  type PurchaseOrder,
  type InsertPurchaseOrder,
  type PurchaseOrderItem,
  type InsertPurchaseOrderItem,
  type Wastage,
  type InsertWastage,
  type Invoice,
  type InsertInvoice,
  type Reservation,
  type InsertReservation,
  type Customer,
  type InsertCustomer,
  type Feedback,
  type InsertFeedback,
  type InventoryUsage,
  type InsertInventoryUsage,
  type DeliveryPerson,
  type InsertDeliveryPerson,
} from "@shared/schema";
import { IStorage } from './storage';
import { randomUUID } from 'crypto';

export class MongoStorage implements IStorage {
  private async ensureConnection() {
    await mongodb.connect();
  }

  private stripMongoId<T extends { _id?: any }>(doc: T | null): Omit<T, '_id'> | null {
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return rest as Omit<T, '_id'>;
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.ensureConnection();
    const user = await mongodb.getCollection<User>('users').findOne({ id } as any);
    return user ?? undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureConnection();
    const user = await mongodb.getCollection<User>('users').findOne({ username } as any);
    return user ?? undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    await this.ensureConnection();
    const id = randomUUID();
    const newUser: User = { id, ...user };
    await mongodb.getCollection<User>('users').insertOne(newUser as any);
    return newUser;
  }

  async getFloors(): Promise<Floor[]> {
    await this.ensureConnection();
    const floors = await mongodb.getCollection<Floor>('floors').find().sort({ displayOrder: 1 }).toArray();
    return floors;
  }

  async getFloor(id: string): Promise<Floor | undefined> {
    await this.ensureConnection();
    const floor = await mongodb.getCollection<Floor>('floors').findOne({ id } as any);
    return floor ?? undefined;
  }

  async createFloor(insertFloor: InsertFloor): Promise<Floor> {
    await this.ensureConnection();
    const id = randomUUID();
    const floor: Floor = {
      id,
      name: insertFloor.name,
      displayOrder: insertFloor.displayOrder ?? 0,
      createdAt: new Date(),
    };
    await mongodb.getCollection<Floor>('floors').insertOne(floor as any);
    return floor;
  }

  async updateFloor(id: string, floorData: Partial<InsertFloor>): Promise<Floor | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Floor>('floors').findOneAndUpdate(
      { id } as any,
      { $set: floorData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteFloor(id: string): Promise<boolean> {
    await this.ensureConnection();
    const tablesOnFloor = await mongodb.getCollection<Table>('tables').countDocuments({ floorId: id } as any);
    if (tablesOnFloor > 0) {
      throw new Error(`Cannot delete floor: ${tablesOnFloor} table(s) are assigned to this floor`);
    }
    const result = await mongodb.getCollection<Floor>('floors').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getTables(): Promise<Table[]> {
    await this.ensureConnection();
    const tables = await mongodb.getCollection<Table>('tables').find().toArray();
    return tables;
  }

  async getTable(id: string): Promise<Table | undefined> {
    await this.ensureConnection();
    const table = await mongodb.getCollection<Table>('tables').findOne({ id } as any);
    return table ?? undefined;
  }

  async getTableByNumber(tableNumber: string): Promise<Table | undefined> {
    await this.ensureConnection();
    const table = await mongodb.getCollection<Table>('tables').findOne({ tableNumber } as any);
    return table ?? undefined;
  }

  async createTable(insertTable: InsertTable): Promise<Table> {
    await this.ensureConnection();
    const id = randomUUID();
    const table: Table = {
      id,
      tableNumber: insertTable.tableNumber,
      seats: insertTable.seats,
      status: insertTable.status ?? "free",
      currentOrderId: null,
      floorId: insertTable.floorId ?? null,
    };
    await mongodb.getCollection<Table>('tables').insertOne(table as any);
    return table;
  }

  async updateTable(id: string, tableData: Partial<InsertTable>): Promise<Table | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Table>('tables').findOneAndUpdate(
      { id } as any,
      { $set: tableData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateTableStatus(id: string, status: string): Promise<Table | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Table>('tables').findOneAndUpdate(
      { id } as any,
      { $set: { status } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateTableOrder(id: string, orderId: string | null): Promise<Table | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Table>('tables').findOneAndUpdate(
      { id } as any,
      { $set: { currentOrderId: orderId } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteTable(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Table>('tables').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getMenuItems(): Promise<MenuItem[]> {
    await this.ensureConnection();
    const items = await mongodb.getCollection<MenuItem>('menuItems').find().toArray();
    return items;
  }

  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    await this.ensureConnection();
    const item = await mongodb.getCollection<MenuItem>('menuItems').findOne({ id } as any);
    return item ?? undefined;
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    await this.ensureConnection();
    
    const normalizedQuickCode = item.quickCode ? item.quickCode.trim().toLowerCase() : null;
    
    if (normalizedQuickCode) {
      const existingItems = await mongodb.getCollection<MenuItem>('menuItems').find().toArray();
      const duplicate = existingItems.find(existing => 
        existing.quickCode && existing.quickCode.toLowerCase() === normalizedQuickCode
      );
      if (duplicate) {
        throw new Error(`Quick code "${item.quickCode}" is already assigned to another item`);
      }
    }
    
    const id = randomUUID();
    const menuItem: MenuItem = {
      id,
      name: item.name,
      category: item.category,
      price: item.price,
      cost: item.cost,
      available: item.available ?? true,
      isVeg: item.isVeg ?? true,
      variants: item.variants ?? null,
      image: item.image ?? null,
      description: item.description ?? null,
      quickCode: normalizedQuickCode,
    };
    await mongodb.getCollection<MenuItem>('menuItems').insertOne(menuItem as any);
    return menuItem;
  }

  async updateMenuItem(id: string, item: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    await this.ensureConnection();
    
    const normalizedQuickCode = item.quickCode ? item.quickCode.trim().toLowerCase() : null;
    const updateData = { ...item };
    
    if (item.quickCode !== undefined) {
      updateData.quickCode = normalizedQuickCode;
    }
    
    if (normalizedQuickCode) {
      const existingItems = await mongodb.getCollection<MenuItem>('menuItems').find().toArray();
      const duplicate = existingItems.find(existing => 
        existing.id !== id && existing.quickCode && existing.quickCode.toLowerCase() === normalizedQuickCode
      );
      if (duplicate) {
        throw new Error(`Quick code "${item.quickCode}" is already assigned to another item`);
      }
    }
    
    const result = await mongodb.getCollection<MenuItem>('menuItems').findOneAndUpdate(
      { id } as any,
      { $set: updateData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<MenuItem>('menuItems').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await mongodb.getCollection<Order>('orders').find().toArray();
    return orders;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const order = await mongodb.getCollection<Order>('orders').findOne({ id } as any);
    return order ?? undefined;
  }

  async getOrdersByTable(tableId: string): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await mongodb.getCollection<Order>('orders').find({ tableId } as any).toArray();
    return orders;
  }

  async getActiveOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await mongodb.getCollection<Order>('orders').find({
      status: { $in: ["sent_to_kitchen", "ready_to_bill", "billed"] }
    } as any).toArray();
    return orders;
  }

  async getCompletedOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await mongodb.getCollection<Order>('orders').find({
      status: { $in: ["paid", "completed"] }
    } as any).toArray();
    return orders;
  }

  async getDeliveryOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await mongodb.getCollection<Order>('orders').find({
      orderType: "delivery"
    } as any).sort({ createdAt: -1 } as any).toArray();
    return orders;
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    await this.ensureConnection();
    const id = randomUUID();
    const order: Order = {
      id,
      tableId: insertOrder.tableId ?? null,
      orderType: insertOrder.orderType,
      status: insertOrder.status ?? "saved",
      total: insertOrder.total ?? "0",
      customerName: insertOrder.customerName ?? null,
      customerPhone: insertOrder.customerPhone ?? null,
      customerAddress: insertOrder.customerAddress ?? null,
      paymentMode: insertOrder.paymentMode ?? null,
      waiterId: insertOrder.waiterId ?? null,
      deliveryPersonId: insertOrder.deliveryPersonId ?? null,
      expectedPickupTime: insertOrder.expectedPickupTime ?? null,
      createdAt: new Date(),
      completedAt: null,
      billedAt: null,
      paidAt: null,
    };
    await mongodb.getCollection<Order>('orders').insertOne(order as any);
    return order;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { status } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateOrderTotal(id: string, total: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { total } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async completeOrder(id: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { status: "completed", completedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async billOrder(id: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { status: "billed", billedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async checkoutOrder(id: string, paymentMode?: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { 
        $set: { 
          status: "paid", 
          paymentMode: paymentMode ?? null, 
          paidAt: new Date(), 
          completedAt: new Date() 
        } 
      },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteOrder(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Order>('orders').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    await this.ensureConnection();
    const items = await mongodb.getCollection<OrderItem>('orderItems').find({ orderId } as any).toArray();
    return items;
  }

  async getOrderItem(id: string): Promise<OrderItem | undefined> {
    await this.ensureConnection();
    const item = await mongodb.getCollection<OrderItem>('orderItems').findOne({ id } as any);
    return item ?? undefined;
  }

  async createOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    await this.ensureConnection();
    const id = randomUUID();
    const orderItem: OrderItem = {
      id,
      orderId: item.orderId,
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      notes: item.notes ?? null,
      status: item.status ?? "new",
      isVeg: item.isVeg ?? true,
    };
    await mongodb.getCollection<OrderItem>('orderItems').insertOne(orderItem as any);
    return orderItem;
  }

  async updateOrderItemStatus(id: string, status: string): Promise<OrderItem | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<OrderItem>('orderItems').findOneAndUpdate(
      { id } as any,
      { $set: { status } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateOrderItem(id: string, data: Partial<Pick<OrderItem, 'quantity' | 'notes' | 'name'>>): Promise<OrderItem | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<OrderItem>('orderItems').findOneAndUpdate(
      { id } as any,
      { $set: data },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteOrderItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<OrderItem>('orderItems').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getInventoryItems(): Promise<InventoryItem[]> {
    await this.ensureConnection();
    const items = await mongodb.getCollection<InventoryItem>('inventory').find().toArray();
    return items;
  }

  async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    await this.ensureConnection();
    const item = await mongodb.getCollection<InventoryItem>('inventory').findOne({ id } as any);
    return item ?? undefined;
  }

  async createInventoryItem(item: InsertInventoryItem): Promise<InventoryItem> {
    await this.ensureConnection();
    const id = randomUUID();
    const inventoryItem: InventoryItem = {
      id,
      name: item.name,
      category: item.category,
      currentStock: item.currentStock,
      unit: item.unit,
      minStock: item.minStock ?? "0",
      supplierId: item.supplierId ?? null,
      costPerUnit: item.costPerUnit ?? "0",
      lastUpdated: new Date(),
    };
    await mongodb.getCollection<InventoryItem>('inventory').insertOne(inventoryItem as any);
    return inventoryItem;
  }

  async updateInventoryItem(id: string, item: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<InventoryItem>('inventory').findOneAndUpdate(
      { id } as any,
      { $set: { ...item, lastUpdated: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateInventoryQuantity(id: string, quantity: string): Promise<InventoryItem | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<InventoryItem>('inventory').findOneAndUpdate(
      { id } as any,
      { $set: { currentStock: quantity, lastUpdated: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<InventoryItem>('inventory').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async deductInventoryForOrder(orderId: string): Promise<void> {
    await this.ensureConnection();
    const orderItems = await this.getOrderItems(orderId);
    
    for (const orderItem of orderItems) {
      const recipe = await this.getRecipeByMenuItemId(orderItem.menuItemId);
      if (!recipe) continue;
      
      const recipeIngredients = await this.getRecipeIngredients(recipe.id);
      
      for (const ingredient of recipeIngredients) {
        const inventoryItem = await this.getInventoryItem(ingredient.inventoryItemId);
        if (!inventoryItem) continue;
        
        const quantityToDeduct = parseFloat(ingredient.quantity) * orderItem.quantity;
        const newStock = parseFloat(inventoryItem.currentStock) - quantityToDeduct;
        
        await this.updateInventoryQuantity(ingredient.inventoryItemId, newStock.toString());
      }
    }
  }

  async getRecipes(): Promise<Recipe[]> {
    await this.ensureConnection();
    const recipes = await mongodb.getCollection<Recipe>('recipes').find().toArray();
    return recipes;
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    await this.ensureConnection();
    const recipe = await mongodb.getCollection<Recipe>('recipes').findOne({ id } as any);
    return recipe ?? undefined;
  }

  async getRecipeByMenuItemId(menuItemId: string): Promise<Recipe | undefined> {
    await this.ensureConnection();
    const recipe = await mongodb.getCollection<Recipe>('recipes').findOne({ menuItemId } as any, {
      sort: { createdAt: -1 } as any,
    });
    return recipe ?? undefined;
  }

  async createRecipe(insertRecipe: InsertRecipe): Promise<Recipe> {
    await this.ensureConnection();
    const id = randomUUID();
    const recipe: Recipe = {
      id,
      menuItemId: insertRecipe.menuItemId,
      createdAt: new Date(),
    };
    await mongodb.getCollection<Recipe>('recipes').insertOne(recipe as any);
    return recipe;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    await this.ensureConnection();
    await mongodb.getCollection<RecipeIngredient>('recipeIngredients').deleteMany({ recipeId: id } as any);
    const result = await mongodb.getCollection<Recipe>('recipes').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
    await this.ensureConnection();
    const ingredients = await mongodb.getCollection<RecipeIngredient>('recipeIngredients').find({ recipeId } as any).toArray();
    return ingredients;
  }

  async getRecipeIngredient(id: string): Promise<RecipeIngredient | undefined> {
    await this.ensureConnection();
    const ingredient = await mongodb.getCollection<RecipeIngredient>('recipeIngredients').findOne({ id } as any);
    return ingredient ?? undefined;
  }

  async createRecipeIngredient(insertIngredient: InsertRecipeIngredient): Promise<RecipeIngredient> {
    await this.ensureConnection();
    const id = randomUUID();
    const ingredient: RecipeIngredient = {
      id,
      recipeId: insertIngredient.recipeId,
      inventoryItemId: insertIngredient.inventoryItemId,
      quantity: insertIngredient.quantity,
      unit: insertIngredient.unit,
    };
    await mongodb.getCollection<RecipeIngredient>('recipeIngredients').insertOne(ingredient as any);
    return ingredient;
  }

  async updateRecipeIngredient(id: string, data: Partial<InsertRecipeIngredient>): Promise<RecipeIngredient | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<RecipeIngredient>('recipeIngredients').findOneAndUpdate(
      { id } as any,
      { $set: data },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteRecipeIngredient(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<RecipeIngredient>('recipeIngredients').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getSuppliers(): Promise<Supplier[]> {
    await this.ensureConnection();
    const suppliers = await mongodb.getCollection<Supplier>('suppliers').find().toArray();
    return suppliers;
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    await this.ensureConnection();
    const supplier = await mongodb.getCollection<Supplier>('suppliers').findOne({ id } as any);
    return supplier ?? undefined;
  }

  async createSupplier(insertSupplier: InsertSupplier): Promise<Supplier> {
    await this.ensureConnection();
    const id = randomUUID();
    const supplier: Supplier = {
      id,
      name: insertSupplier.name,
      contactPerson: insertSupplier.contactPerson ?? null,
      phone: insertSupplier.phone,
      email: insertSupplier.email ?? null,
      address: insertSupplier.address ?? null,
      status: insertSupplier.status ?? "active",
      createdAt: new Date(),
    };
    await mongodb.getCollection<Supplier>('suppliers').insertOne(supplier as any);
    return supplier;
  }

  async updateSupplier(id: string, data: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Supplier>('suppliers').findOneAndUpdate(
      { id } as any,
      { $set: data },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Supplier>('suppliers').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    await this.ensureConnection();
    const orders = await mongodb.getCollection<PurchaseOrder>('purchaseOrders').find().sort({ orderDate: -1 }).toArray();
    return orders;
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    await this.ensureConnection();
    const order = await mongodb.getCollection<PurchaseOrder>('purchaseOrders').findOne({ id } as any);
    return order ?? undefined;
  }

  async createPurchaseOrder(insertOrder: InsertPurchaseOrder): Promise<PurchaseOrder> {
    await this.ensureConnection();
    const id = randomUUID();
    const order: PurchaseOrder = {
      id,
      orderNumber: insertOrder.orderNumber,
      supplierId: insertOrder.supplierId,
      orderDate: insertOrder.orderDate,
      expectedDeliveryDate: insertOrder.expectedDeliveryDate ?? null,
      actualDeliveryDate: null,
      status: insertOrder.status ?? "pending",
      totalAmount: insertOrder.totalAmount ?? "0",
      notes: insertOrder.notes ?? null,
      createdAt: new Date(),
    };
    await mongodb.getCollection<PurchaseOrder>('purchaseOrders').insertOne(order as any);
    return order;
  }

  async updatePurchaseOrder(id: string, data: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<PurchaseOrder>('purchaseOrders').findOneAndUpdate(
      { id } as any,
      { $set: data },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async receivePurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    await this.ensureConnection();
    
    const purchaseOrderItems = await this.getPurchaseOrderItems(id);
    for (const item of purchaseOrderItems) {
      const inventoryItem = await this.getInventoryItem(item.inventoryItemId);
      if (inventoryItem) {
        const newStock = parseFloat(inventoryItem.currentStock) + parseFloat(item.quantity);
        await this.updateInventoryQuantity(item.inventoryItemId, newStock.toString());
      }
    }
    
    const result = await mongodb.getCollection<PurchaseOrder>('purchaseOrders').findOneAndUpdate(
      { id } as any,
      { $set: { status: "received", actualDeliveryDate: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    await this.ensureConnection();
    await mongodb.getCollection<PurchaseOrderItem>('purchaseOrderItems').deleteMany({ purchaseOrderId: id } as any);
    const result = await mongodb.getCollection<PurchaseOrder>('purchaseOrders').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]> {
    await this.ensureConnection();
    const items = await mongodb.getCollection<PurchaseOrderItem>('purchaseOrderItems').find({ purchaseOrderId } as any).toArray();
    return items;
  }

  async getPurchaseOrderItem(id: string): Promise<PurchaseOrderItem | undefined> {
    await this.ensureConnection();
    const item = await mongodb.getCollection<PurchaseOrderItem>('purchaseOrderItems').findOne({ id } as any);
    return item ?? undefined;
  }

  async createPurchaseOrderItem(insertItem: InsertPurchaseOrderItem): Promise<PurchaseOrderItem> {
    await this.ensureConnection();
    const id = randomUUID();
    const item: PurchaseOrderItem = {
      id,
      purchaseOrderId: insertItem.purchaseOrderId,
      inventoryItemId: insertItem.inventoryItemId,
      quantity: insertItem.quantity,
      unit: insertItem.unit,
      costPerUnit: insertItem.costPerUnit,
      totalCost: insertItem.totalCost,
    };
    await mongodb.getCollection<PurchaseOrderItem>('purchaseOrderItems').insertOne(item as any);
    return item;
  }

  async updatePurchaseOrderItem(id: string, data: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<PurchaseOrderItem>('purchaseOrderItems').findOneAndUpdate(
      { id } as any,
      { $set: data },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deletePurchaseOrderItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<PurchaseOrderItem>('purchaseOrderItems').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getWastages(): Promise<Wastage[]> {
    await this.ensureConnection();
    const wastages = await mongodb.getCollection<Wastage>('wastages').find().sort({ createdAt: -1 }).toArray();
    return wastages;
  }

  async getWastage(id: string): Promise<Wastage | undefined> {
    await this.ensureConnection();
    const wastage = await mongodb.getCollection<Wastage>('wastages').findOne({ id } as any);
    return wastage ?? undefined;
  }

  async createWastage(insertWastage: InsertWastage): Promise<Wastage> {
    await this.ensureConnection();
    const id = randomUUID();
    const wastage: Wastage = {
      id,
      inventoryItemId: insertWastage.inventoryItemId,
      quantity: insertWastage.quantity,
      unit: insertWastage.unit,
      reason: insertWastage.reason,
      reportedBy: insertWastage.reportedBy ?? null,
      notes: insertWastage.notes ?? null,
      createdAt: new Date(),
    };
    
    const inventoryItem = await this.getInventoryItem(insertWastage.inventoryItemId);
    if (inventoryItem) {
      const newStock = parseFloat(inventoryItem.currentStock) - parseFloat(insertWastage.quantity);
      await this.updateInventoryQuantity(insertWastage.inventoryItemId, newStock.toString());
    }
    
    await mongodb.getCollection<Wastage>('wastages').insertOne(wastage as any);
    return wastage;
  }

  async deleteWastage(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Wastage>('wastages').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getInvoices(): Promise<Invoice[]> {
    await this.ensureConnection();
    const invoices = await mongodb.getCollection<Invoice>('invoices').find().sort({ createdAt: -1 }).toArray();
    return invoices;
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    await this.ensureConnection();
    const invoice = await mongodb.getCollection<Invoice>('invoices').findOne({ id } as any);
    return invoice ?? undefined;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    await this.ensureConnection();
    const invoice = await mongodb.getCollection<Invoice>('invoices').findOne({ invoiceNumber } as any);
    return invoice ?? undefined;
  }

  async createInvoice(insertInvoice: InsertInvoice): Promise<Invoice> {
    await this.ensureConnection();
    const id = randomUUID();
    const invoice: Invoice = {
      id,
      invoiceNumber: insertInvoice.invoiceNumber,
      orderId: insertInvoice.orderId,
      tableNumber: insertInvoice.tableNumber ?? null,
      floorName: insertInvoice.floorName ?? null,
      customerName: insertInvoice.customerName ?? null,
      customerPhone: insertInvoice.customerPhone ?? null,
      subtotal: insertInvoice.subtotal,
      tax: insertInvoice.tax,
      discount: insertInvoice.discount ?? "0",
      total: insertInvoice.total,
      paymentMode: insertInvoice.paymentMode,
      splitPayments: insertInvoice.splitPayments ?? null,
      status: insertInvoice.status ?? "Paid",
      items: insertInvoice.items,
      notes: insertInvoice.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await mongodb.getCollection<Invoice>('invoices').insertOne(invoice as any);
    return invoice;
  }

  async updateInvoice(id: string, invoiceData: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Invoice>('invoices').findOneAndUpdate(
      { id } as any,
      { $set: { ...invoiceData, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Invoice>('invoices').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getReservations(): Promise<Reservation[]> {
    await this.ensureConnection();
    const reservations = await mongodb.getCollection<Reservation>('reservations').find().sort({ timeSlot: 1 }).toArray();
    return reservations;
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    await this.ensureConnection();
    const reservation = await mongodb.getCollection<Reservation>('reservations').findOne({ id } as any);
    return reservation ?? undefined;
  }

  async getReservationsByTable(tableId: string): Promise<Reservation[]> {
    await this.ensureConnection();
    const reservations = await mongodb.getCollection<Reservation>('reservations').find({
      tableId,
      status: "active"
    } as any).toArray();
    return reservations;
  }

  async createReservation(insertReservation: InsertReservation): Promise<Reservation> {
    await this.ensureConnection();
    const id = randomUUID();
    const reservation: Reservation = {
      id,
      tableId: insertReservation.tableId,
      customerName: insertReservation.customerName,
      customerPhone: insertReservation.customerPhone,
      numberOfPeople: insertReservation.numberOfPeople,
      timeSlot: insertReservation.timeSlot,
      notes: insertReservation.notes ?? null,
      status: insertReservation.status ?? "active",
      createdAt: new Date(),
    };
    await mongodb.getCollection<Reservation>('reservations').insertOne(reservation as any);
    return reservation;
  }

  async updateReservation(id: string, reservationData: Partial<InsertReservation>): Promise<Reservation | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Reservation>('reservations').findOneAndUpdate(
      { id } as any,
      { $set: reservationData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteReservation(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Reservation>('reservations').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getCustomers(): Promise<Customer[]> {
    await this.ensureConnection();
    const customers = await mongodb.getCollection<Customer>('customers').find().sort({ createdAt: -1 }).toArray();
    return customers;
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    await this.ensureConnection();
    const customer = await mongodb.getCollection<Customer>('customers').findOne({ id } as any);
    return customer ?? undefined;
  }

  async getCustomerByPhone(phone: string): Promise<Customer | undefined> {
    await this.ensureConnection();
    const customer = await mongodb.getCollection<Customer>('customers').findOne({ phone } as any);
    return customer ?? undefined;
  }

  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    await this.ensureConnection();
    const id = randomUUID();
    const customer: Customer = {
      id,
      name: insertCustomer.name,
      phone: insertCustomer.phone,
      email: insertCustomer.email ?? null,
      address: insertCustomer.address ?? null,
      createdAt: new Date(),
    };
    await mongodb.getCollection<Customer>('customers').insertOne(customer as any);
    return customer;
  }

  async updateCustomer(id: string, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Customer>('customers').findOneAndUpdate(
      { id } as any,
      { $set: customerData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Customer>('customers').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getFeedbacks(): Promise<Feedback[]> {
    await this.ensureConnection();
    const feedbacks = await mongodb.getCollection<Feedback>('feedbacks').find().sort({ createdAt: -1 }).toArray();
    return feedbacks;
  }

  async getFeedback(id: string): Promise<Feedback | undefined> {
    await this.ensureConnection();
    const feedback = await mongodb.getCollection<Feedback>('feedbacks').findOne({ id } as any);
    return feedback ?? undefined;
  }

  async createFeedback(insertFeedback: InsertFeedback): Promise<Feedback> {
    await this.ensureConnection();
    const id = randomUUID();
    const feedback: Feedback = {
      id,
      customerId: insertFeedback.customerId ?? null,
      customerName: insertFeedback.customerName,
      rating: insertFeedback.rating,
      comment: insertFeedback.comment,
      sentiment: insertFeedback.sentiment || "Neutral",
      createdAt: new Date(),
    };
    await mongodb.getCollection<Feedback>('feedbacks').insertOne(feedback as any);
    return feedback;
  }

  async deleteFeedback(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<Feedback>('feedbacks').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getSetting(key: string): Promise<string | undefined> {
    await this.ensureConnection();
    const setting = await mongodb.getCollection<{ key: string; value: string }>('settings').findOne({ key } as any);
    return setting?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.ensureConnection();
    await mongodb.getCollection<{ key: string; value: string }>('settings').updateOne(
      { key } as any,
      { $set: { key, value } },
      { upsert: true }
    );
  }

  async getInventoryUsages(): Promise<InventoryUsage[]> {
    await this.ensureConnection();
    const usages = await mongodb.getCollection<InventoryUsage>('inventoryUsages').find().sort({ usedAt: -1 }).toArray();
    return usages;
  }

  async getInventoryUsagesByItem(inventoryItemId: string): Promise<InventoryUsage[]> {
    await this.ensureConnection();
    const usages = await mongodb.getCollection<InventoryUsage>('inventoryUsages').find({ inventoryItemId } as any).sort({ usedAt: -1 }).toArray();
    return usages;
  }

  async createInventoryUsage(usage: InsertInventoryUsage): Promise<InventoryUsage> {
    await this.ensureConnection();
    const id = randomUUID();
    const newUsage: InventoryUsage = {
      id,
      inventoryItemId: usage.inventoryItemId,
      itemName: usage.itemName,
      quantity: usage.quantity,
      unit: usage.unit,
      usedAt: new Date(),
      source: usage.source || "manual",
      notes: usage.notes || null,
      createdAt: new Date(),
    };
    await mongodb.getCollection<InventoryUsage>('inventoryUsages').insertOne(newUsage as any);
    return newUsage;
  }

  async getMostUsedItems(limit: number = 10): Promise<Array<{ itemId: string; itemName: string; totalQuantity: string; count: number }>> {
    await this.ensureConnection();
    const usages = await mongodb.getCollection<InventoryUsage>('inventoryUsages').find().toArray();
    
    const itemMap = new Map<string, { itemName: string; totalQuantity: number; count: number }>();
    
    for (const usage of usages) {
      const key = usage.inventoryItemId;
      const qty = parseFloat(usage.quantity) || 0;
      
      if (!itemMap.has(key)) {
        itemMap.set(key, { itemName: usage.itemName, totalQuantity: qty, count: 1 });
      } else {
        const existing = itemMap.get(key)!;
        existing.totalQuantity += qty;
        existing.count += 1;
      }
    }
    
    const sorted = Array.from(itemMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([itemId, data]) => ({
        itemId,
        itemName: data.itemName,
        totalQuantity: data.totalQuantity.toString(),
        count: data.count,
      }));
    
    return sorted;
  }

  async seedInventoryAndRecipes(): Promise<{ inventoryCount: number; recipesCount: number; suppliersCount: number }> {
    await this.ensureConnection();
    
    // Check if already seeded
    const existingInventory = await this.getInventoryItems();
    if (existingInventory.length > 0) {
      return { inventoryCount: existingInventory.length, recipesCount: 0, suppliersCount: 0 };
    }

    // Create suppliers
    const supplier1 = await this.createSupplier({
      name: "Fresh Foods Inc.",
      contactPerson: "John Smith",
      phone: "+1-555-0101",
      email: "john@freshfoods.com",
      address: "123 Market Street, City, State 12345",
      status: "active",
    });

    const supplier2 = await this.createSupplier({
      name: "Quality Ingredients Co.",
      contactPerson: "Sarah Johnson",
      phone: "+1-555-0202",
      email: "sarah@qualityingredients.com",
      address: "456 Supply Lane, City, State 12345",
      status: "active",
    });

    // Create inventory items
    const inventoryItemsData = [
      { name: "Chicken Breast", category: "Meat & Poultry", currentStock: "50000", unit: "g", minStock: "10000", costPerUnit: "0.015", supplierId: supplier1.id },
      { name: "Baby Corn", category: "Vegetables", currentStock: "20000", unit: "g", minStock: "5000", costPerUnit: "0.008", supplierId: supplier1.id },
      { name: "Cooking Oil", category: "Cooking Essentials", currentStock: "10000", unit: "ml", minStock: "2000", costPerUnit: "0.005", supplierId: supplier2.id },
      { name: "Soy Sauce", category: "Condiments", currentStock: "5000", unit: "ml", minStock: "1000", costPerUnit: "0.010", supplierId: supplier2.id },
      { name: "Spices Mix", category: "Spices", currentStock: "5000", unit: "g", minStock: "1000", costPerUnit: "0.020", supplierId: supplier2.id },
      { name: "Wheat Flour", category: "Baking", currentStock: "30000", unit: "g", minStock: "5000", costPerUnit: "0.003", supplierId: supplier2.id },
      { name: "Cheese", category: "Dairy", currentStock: "15000", unit: "g", minStock: "3000", costPerUnit: "0.012", supplierId: supplier1.id },
      { name: "Mixed Vegetables", category: "Vegetables", currentStock: "25000", unit: "g", minStock: "5000", costPerUnit: "0.006", supplierId: supplier1.id },
      { name: "Burger Buns", category: "Bakery", currentStock: "200", unit: "pcs", minStock: "50", costPerUnit: "0.50", supplierId: supplier1.id },
      { name: "Pizza Dough", category: "Bakery", currentStock: "100", unit: "pcs", minStock: "20", costPerUnit: "1.20", supplierId: supplier1.id },
      { name: "Tomato Sauce", category: "Condiments", currentStock: "8000", unit: "ml", minStock: "2000", costPerUnit: "0.008", supplierId: supplier2.id },
      { name: "Potatoes", category: "Vegetables", currentStock: "40000", unit: "g", minStock: "10000", costPerUnit: "0.002", supplierId: supplier1.id },
      { name: "Lettuce", category: "Vegetables", currentStock: "3000", unit: "g", minStock: "500", costPerUnit: "0.015", supplierId: supplier1.id },
      { name: "Pasta", category: "Pasta & Grains", currentStock: "20000", unit: "g", minStock: "5000", costPerUnit: "0.004", supplierId: supplier2.id },
      { name: "Cream", category: "Dairy", currentStock: "8000", unit: "ml", minStock: "2000", costPerUnit: "0.012", supplierId: supplier1.id },
      { name: "Chocolate", category: "Desserts", currentStock: "5000", unit: "g", minStock: "1000", costPerUnit: "0.025", supplierId: supplier2.id },
      { name: "Vanilla Extract", category: "Flavorings", currentStock: "2000", unit: "ml", minStock: "500", costPerUnit: "0.030", supplierId: supplier2.id },
      { name: "Strawberries", category: "Fruits", currentStock: "3000", unit: "g", minStock: "1000", costPerUnit: "0.020", supplierId: supplier1.id },
      { name: "Coca Cola Syrup", category: "Beverages", currentStock: "10000", unit: "ml", minStock: "2000", costPerUnit: "0.008", supplierId: supplier2.id },
    ];

    const inventoryItems: InventoryItem[] = [];
    for (const itemData of inventoryItemsData) {
      const item = await this.createInventoryItem(itemData);
      inventoryItems.push(item);
    }

    // Create a map of inventory items by name for easy lookup
    const inventoryMap = new Map(inventoryItems.map(item => [item.name, item]));

    // Get all menu items
    const menuItems = await this.getMenuItems();
    let recipesCreated = 0;

    // Create recipes for existing menu items
    const recipeData: { [key: string]: { ingredients: string[]; quantities: string[]; units: string[] } } = {
      "Chicken Burger": {
        ingredients: ["Chicken Breast", "Burger Buns", "Lettuce"],
        quantities: ["150", "1", "30"],
        units: ["g", "pcs", "g"]
      },
      "Veggie Pizza": {
        ingredients: ["Pizza Dough", "Cheese", "Mixed Vegetables", "Tomato Sauce"],
        quantities: ["1", "200", "150", "100"],
        units: ["pcs", "g", "g", "ml"]
      },
      "French Fries": {
        ingredients: ["Potatoes", "Cooking Oil"],
        quantities: ["300", "50"],
        units: ["g", "ml"]
      },
      "Coca Cola": {
        ingredients: ["Coca Cola Syrup"],
        quantities: ["30"],
        units: ["ml"]
      },
      "Caesar Salad": {
        ingredients: ["Lettuce", "Cheese", "Chicken Breast"],
        quantities: ["100", "50", "80"],
        units: ["g", "g", "g"]
      },
      "Pasta Alfredo": {
        ingredients: ["Pasta", "Cream", "Cheese"],
        quantities: ["200", "150", "80"],
        units: ["g", "ml", "g"]
      },
      "Chocolate Cake": {
        ingredients: ["Wheat Flour", "Chocolate", "Cream"],
        quantities: ["150", "100", "50"],
        units: ["g", "g", "ml"]
      },
      "Ice Cream": {
        ingredients: ["Cream", "Vanilla Extract", "Strawberries"],
        quantities: ["150", "10", "50"],
        units: ["ml", "ml", "g"]
      },
    };

    for (const menuItem of menuItems) {
      const recipeInfo = recipeData[menuItem.name];
      if (!recipeInfo) continue;

      // Create recipe
      const recipe = await this.createRecipe({
        menuItemId: menuItem.id,
      });

      // Add ingredients to recipe
      for (let i = 0; i < recipeInfo.ingredients.length; i++) {
        const ingredientName = recipeInfo.ingredients[i];
        const inventoryItem = inventoryMap.get(ingredientName);
        if (!inventoryItem) continue;

        await this.createRecipeIngredient({
          recipeId: recipe.id,
          inventoryItemId: inventoryItem.id,
          quantity: recipeInfo.quantities[i],
          unit: recipeInfo.units[i],
        });
      }

      recipesCreated++;
    }

    return {
      inventoryCount: inventoryItems.length,
      recipesCount: recipesCreated,
      suppliersCount: 2,
    };
  }

  async getDeliveryPersons(): Promise<DeliveryPerson[]> {
    await this.ensureConnection();
    return await mongodb.getCollection<DeliveryPerson>('deliveryPersons').find().toArray();
  }

  async getDeliveryPerson(id: string): Promise<DeliveryPerson | undefined> {
    await this.ensureConnection();
    const person = await mongodb.getCollection<DeliveryPerson>('deliveryPersons').findOne({ id } as any);
    return person ?? undefined;
  }

  async createDeliveryPerson(person: InsertDeliveryPerson): Promise<DeliveryPerson> {
    await this.ensureConnection();
    const id = randomUUID();
    const newPerson: DeliveryPerson = {
      id,
      name: person.name,
      phone: person.phone,
      status: person.status || "available",
      createdAt: new Date(),
    };
    await mongodb.getCollection<DeliveryPerson>('deliveryPersons').insertOne(newPerson as any);
    return newPerson;
  }

  async updateDeliveryPerson(id: string, person: Partial<InsertDeliveryPerson>): Promise<DeliveryPerson | undefined> {
    await this.ensureConnection();
    const collection = mongodb.getCollection<DeliveryPerson>('deliveryPersons');
    const existing = await collection.findOne({ id } as any);
    if (!existing) return undefined;
    
    const update: any = {};
    if (person.name !== undefined) update.name = person.name;
    if (person.phone !== undefined) update.phone = person.phone;
    if (person.status !== undefined) update.status = person.status;
    
    await collection.updateOne({ id } as any, { $set: update });
    const updated = await collection.findOne({ id } as any);
    return updated ?? undefined;
  }

  async deleteDeliveryPerson(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await mongodb.getCollection<DeliveryPerson>('deliveryPersons').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async assignDeliveryPerson(orderId: string, deliveryPersonId: string | null): Promise<Order | undefined> {
    await this.ensureConnection();
    const collection = mongodb.getCollection<Order>('orders');
    const existing = await collection.findOne({ id: orderId } as any);
    if (!existing) return undefined;
    
    await collection.updateOne({ id: orderId } as any, { $set: { deliveryPersonId } });
    const updated = await collection.findOne({ id: orderId } as any);
    return updated ?? undefined;
  }
}

export const mongoStorage = new MongoStorage();
