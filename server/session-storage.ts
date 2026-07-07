import { dynamicMongoDB } from './dynamic-mongodb';
import { Collection, Document } from 'mongodb';
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

export class SessionStorage implements IStorage {
  private restaurantId: string;
  private mongodbUri: string;
  private connected: boolean = false;

  constructor(restaurantId: string, mongodbUri: string) {
    this.restaurantId = restaurantId;
    this.mongodbUri = mongodbUri;
  }

  private async ensureConnection() {
    if (!this.connected) {
      await dynamicMongoDB.getConnection(this.restaurantId, this.mongodbUri);
      this.connected = true;
    }
  }

  private getCollection<T extends Document>(name: string): Collection<T> {
    const collection = dynamicMongoDB.getCollection<T>(this.restaurantId, name);
    if (!collection) {
      throw new Error(`Not connected to database for restaurant ${this.restaurantId}`);
    }
    return collection;
  }

  async getUser(id: string): Promise<User | undefined> {
    await this.ensureConnection();
    const user = await this.getCollection<User>('users').findOne({ id } as any);
    return user ?? undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    await this.ensureConnection();
    const user = await this.getCollection<User>('users').findOne({ username } as any);
    return user ?? undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    await this.ensureConnection();
    const id = randomUUID();
    const newUser: User = { id, ...user };
    await this.getCollection<User>('users').insertOne(newUser as any);
    return newUser;
  }

  async getFloors(): Promise<Floor[]> {
    await this.ensureConnection();
    const floors = await this.getCollection<Floor>('floors').find().sort({ displayOrder: 1 }).toArray();
    return floors;
  }

  async getFloor(id: string): Promise<Floor | undefined> {
    await this.ensureConnection();
    const floor = await this.getCollection<Floor>('floors').findOne({ id } as any);
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
    await this.getCollection<Floor>('floors').insertOne(floor as any);
    return floor;
  }

  async updateFloor(id: string, floorData: Partial<InsertFloor>): Promise<Floor | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Floor>('floors').findOneAndUpdate(
      { id } as any,
      { $set: floorData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteFloor(id: string): Promise<boolean> {
    await this.ensureConnection();
    const tablesOnFloor = await this.getCollection<Table>('tables').countDocuments({ floorId: id } as any);
    if (tablesOnFloor > 0) {
      throw new Error(`Cannot delete floor: ${tablesOnFloor} table(s) are assigned to this floor`);
    }
    const result = await this.getCollection<Floor>('floors').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getTables(): Promise<Table[]> {
    await this.ensureConnection();
    const tables = await this.getCollection<Table>('tables').find().toArray();
    return tables;
  }

  async getTable(id: string): Promise<Table | undefined> {
    await this.ensureConnection();
    const table = await this.getCollection<Table>('tables').findOne({ id } as any);
    return table ?? undefined;
  }

  async getTableByNumber(tableNumber: string): Promise<Table | undefined> {
    await this.ensureConnection();
    const table = await this.getCollection<Table>('tables').findOne({ tableNumber } as any);
    return table ?? undefined;
  }

  async createTable(insertTable: InsertTable): Promise<Table> {
    await this.ensureConnection();
    const id = randomUUID();
    const table: Table = {
      id,
      tableNumber: insertTable.tableNumber,
      seats: insertTable.seats,
      status: insertTable.status ?? 'free',
      currentOrderId: null,
      floorId: insertTable.floorId ?? null,
    };
    await this.getCollection<Table>('tables').insertOne(table as any);
    return table;
  }

  async updateTable(id: string, tableData: Partial<InsertTable>): Promise<Table | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Table>('tables').findOneAndUpdate(
      { id } as any,
      { $set: tableData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateTableStatus(id: string, status: string): Promise<Table | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Table>('tables').findOneAndUpdate(
      { id } as any,
      { $set: { status } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateTableOrder(id: string, orderId: string | null): Promise<Table | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Table>('tables').findOneAndUpdate(
      { id } as any,
      { $set: { currentOrderId: orderId } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteTable(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<Table>('tables').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getMenuItems(): Promise<MenuItem[]> {
    await this.ensureConnection();
    const items = await this.getCollection<MenuItem>('menuItems').find().toArray();
    return items;
  }

  async getMenuItem(id: string): Promise<MenuItem | undefined> {
    await this.ensureConnection();
    const item = await this.getCollection<MenuItem>('menuItems').findOne({ id } as any);
    return item ?? undefined;
  }

  async createMenuItem(insertItem: InsertMenuItem): Promise<MenuItem> {
    await this.ensureConnection();
    const id = randomUUID();
    const item: MenuItem = {
      id,
      name: insertItem.name,
      category: insertItem.category,
      price: insertItem.price,
      cost: insertItem.cost,
      available: insertItem.available ?? true,
      isVeg: insertItem.isVeg ?? true,
      variants: insertItem.variants ?? null,
      image: insertItem.image ?? null,
      description: insertItem.description ?? null,
      quickCode: insertItem.quickCode ?? null,
    };
    await this.getCollection<MenuItem>('menuItems').insertOne(item as any);
    return item;
  }

  async updateMenuItem(id: string, itemData: Partial<InsertMenuItem>): Promise<MenuItem | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<MenuItem>('menuItems').findOneAndUpdate(
      { id } as any,
      { $set: itemData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteMenuItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<MenuItem>('menuItems').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await this.getCollection<Order>('orders').find().sort({ createdAt: -1 }).toArray();
    return orders;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const order = await this.getCollection<Order>('orders').findOne({ id } as any);
    return order ?? undefined;
  }

  async getOrdersByTable(tableId: string): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await this.getCollection<Order>('orders').find({ tableId } as any).toArray();
    return orders;
  }

  async getActiveOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await this.getCollection<Order>('orders')
      .find({ status: { $nin: ['completed', 'cancelled'] } } as any)
      .sort({ createdAt: -1 })
      .toArray();
    return orders;
  }

  async getCompletedOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await this.getCollection<Order>('orders')
      .find({ status: 'completed' } as any)
      .sort({ completedAt: -1 })
      .toArray();
    return orders;
  }

  async getDeliveryOrders(): Promise<Order[]> {
    await this.ensureConnection();
    const orders = await this.getCollection<Order>('orders')
      .find({ orderType: 'delivery' } as any)
      .sort({ createdAt: -1 })
      .toArray();
    return orders;
  }

  async createOrder(insertOrder: InsertOrder): Promise<Order> {
    await this.ensureConnection();
    const id = randomUUID();
    const order: Order = {
      id,
      tableId: insertOrder.tableId ?? null,
      orderType: insertOrder.orderType,
      status: insertOrder.status ?? 'saved',
      total: insertOrder.total ?? '0',
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
    await this.getCollection<Order>('orders').insertOne(order as any);
    return order;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { status } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateOrderTotal(id: string, total: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { total } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async completeOrder(id: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { status: 'completed', completedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async billOrder(id: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: { status: 'billed', billedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async checkoutOrder(id: string, paymentMode?: string): Promise<Order | undefined> {
    await this.ensureConnection();
    const updateData: any = { status: 'completed', paidAt: new Date(), completedAt: new Date() };
    if (paymentMode) {
      updateData.paymentMode = paymentMode;
    }
    const result = await this.getCollection<Order>('orders').findOneAndUpdate(
      { id } as any,
      { $set: updateData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteOrder(id: string): Promise<boolean> {
    await this.ensureConnection();
    await this.getCollection<OrderItem>('orderItems').deleteMany({ orderId: id } as any);
    const result = await this.getCollection<Order>('orders').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    await this.ensureConnection();
    const items = await this.getCollection<OrderItem>('orderItems').find({ orderId } as any).toArray();
    return items;
  }

  async getOrderItem(id: string): Promise<OrderItem | undefined> {
    await this.ensureConnection();
    const item = await this.getCollection<OrderItem>('orderItems').findOne({ id } as any);
    return item ?? undefined;
  }

  async createOrderItem(insertItem: InsertOrderItem): Promise<OrderItem> {
    await this.ensureConnection();
    const id = randomUUID();
    const item: OrderItem = {
      id,
      orderId: insertItem.orderId,
      menuItemId: insertItem.menuItemId,
      name: insertItem.name,
      quantity: insertItem.quantity,
      price: insertItem.price,
      notes: insertItem.notes ?? null,
      status: insertItem.status ?? 'new',
      isVeg: insertItem.isVeg ?? true,
    };
    await this.getCollection<OrderItem>('orderItems').insertOne(item as any);
    return item;
  }

  async updateOrderItemStatus(id: string, status: string): Promise<OrderItem | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<OrderItem>('orderItems').findOneAndUpdate(
      { id } as any,
      { $set: { status } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateOrderItem(id: string, data: Partial<Pick<OrderItem, 'quantity' | 'notes' | 'name'>>): Promise<OrderItem | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<OrderItem>('orderItems').findOneAndUpdate(
      { id } as any,
      { $set: data },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteOrderItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<OrderItem>('orderItems').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getInventoryItems(): Promise<InventoryItem[]> {
    await this.ensureConnection();
    const items = await this.getCollection<InventoryItem>('inventoryItems').find().toArray();
    return items;
  }

  async getInventoryItem(id: string): Promise<InventoryItem | undefined> {
    await this.ensureConnection();
    const item = await this.getCollection<InventoryItem>('inventoryItems').findOne({ id } as any);
    return item ?? undefined;
  }

  async createInventoryItem(insertItem: InsertInventoryItem): Promise<InventoryItem> {
    await this.ensureConnection();
    const id = randomUUID();
    const item: InventoryItem = {
      id,
      name: insertItem.name,
      category: insertItem.category,
      currentStock: insertItem.currentStock,
      unit: insertItem.unit,
      minStock: insertItem.minStock ?? '0',
      supplierId: insertItem.supplierId ?? null,
      costPerUnit: insertItem.costPerUnit ?? '0',
      image: insertItem.image ?? null,
      lastUpdated: new Date(),
    };
    await this.getCollection<InventoryItem>('inventoryItems').insertOne(item as any);
    return item;
  }

  async updateInventoryItem(id: string, itemData: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<InventoryItem>('inventoryItems').findOneAndUpdate(
      { id } as any,
      { $set: { ...itemData, lastUpdated: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async updateInventoryQuantity(id: string, quantity: string): Promise<InventoryItem | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<InventoryItem>('inventoryItems').findOneAndUpdate(
      { id } as any,
      { $set: { currentStock: quantity, lastUpdated: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteInventoryItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<InventoryItem>('inventoryItems').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async deductInventoryForOrder(orderId: string): Promise<void> {
    await this.ensureConnection();
  }

  async getRecipes(): Promise<Recipe[]> {
    await this.ensureConnection();
    const recipes = await this.getCollection<Recipe>('recipes').find().toArray();
    return recipes;
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    await this.ensureConnection();
    const recipe = await this.getCollection<Recipe>('recipes').findOne({ id } as any);
    return recipe ?? undefined;
  }

  async getRecipeByMenuItemId(menuItemId: string): Promise<Recipe | undefined> {
    await this.ensureConnection();
    const recipe = await this.getCollection<Recipe>('recipes').findOne({ menuItemId } as any);
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
    await this.getCollection<Recipe>('recipes').insertOne(recipe as any);
    return recipe;
  }

  async deleteRecipe(id: string): Promise<boolean> {
    await this.ensureConnection();
    await this.getCollection<RecipeIngredient>('recipeIngredients').deleteMany({ recipeId: id } as any);
    const result = await this.getCollection<Recipe>('recipes').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getRecipeIngredients(recipeId: string): Promise<RecipeIngredient[]> {
    await this.ensureConnection();
    const ingredients = await this.getCollection<RecipeIngredient>('recipeIngredients')
      .find({ recipeId } as any)
      .toArray();
    return ingredients;
  }

  async getRecipeIngredient(id: string): Promise<RecipeIngredient | undefined> {
    await this.ensureConnection();
    const ingredient = await this.getCollection<RecipeIngredient>('recipeIngredients').findOne({ id } as any);
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
    await this.getCollection<RecipeIngredient>('recipeIngredients').insertOne(ingredient as any);
    return ingredient;
  }

  async updateRecipeIngredient(id: string, ingredientData: Partial<InsertRecipeIngredient>): Promise<RecipeIngredient | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<RecipeIngredient>('recipeIngredients').findOneAndUpdate(
      { id } as any,
      { $set: ingredientData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteRecipeIngredient(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<RecipeIngredient>('recipeIngredients').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getSuppliers(): Promise<Supplier[]> {
    await this.ensureConnection();
    const suppliers = await this.getCollection<Supplier>('suppliers').find().toArray();
    return suppliers;
  }

  async getSupplier(id: string): Promise<Supplier | undefined> {
    await this.ensureConnection();
    const supplier = await this.getCollection<Supplier>('suppliers').findOne({ id } as any);
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
      status: insertSupplier.status ?? 'active',
      createdAt: new Date(),
    };
    await this.getCollection<Supplier>('suppliers').insertOne(supplier as any);
    return supplier;
  }

  async updateSupplier(id: string, supplierData: Partial<InsertSupplier>): Promise<Supplier | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Supplier>('suppliers').findOneAndUpdate(
      { id } as any,
      { $set: supplierData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteSupplier(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<Supplier>('suppliers').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getPurchaseOrders(): Promise<PurchaseOrder[]> {
    await this.ensureConnection();
    const orders = await this.getCollection<PurchaseOrder>('purchaseOrders').find().sort({ createdAt: -1 }).toArray();
    return orders;
  }

  async getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    await this.ensureConnection();
    const order = await this.getCollection<PurchaseOrder>('purchaseOrders').findOne({ id } as any);
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
      status: insertOrder.status ?? 'pending',
      totalAmount: insertOrder.totalAmount ?? '0',
      notes: insertOrder.notes ?? null,
      createdAt: new Date(),
    };
    await this.getCollection<PurchaseOrder>('purchaseOrders').insertOne(order as any);
    return order;
  }

  async updatePurchaseOrder(id: string, orderData: Partial<InsertPurchaseOrder>): Promise<PurchaseOrder | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<PurchaseOrder>('purchaseOrders').findOneAndUpdate(
      { id } as any,
      { $set: orderData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async receivePurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<PurchaseOrder>('purchaseOrders').findOneAndUpdate(
      { id } as any,
      { $set: { status: 'received', actualDeliveryDate: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deletePurchaseOrder(id: string): Promise<boolean> {
    await this.ensureConnection();
    await this.getCollection<PurchaseOrderItem>('purchaseOrderItems').deleteMany({ purchaseOrderId: id } as any);
    const result = await this.getCollection<PurchaseOrder>('purchaseOrders').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getPurchaseOrderItems(purchaseOrderId: string): Promise<PurchaseOrderItem[]> {
    await this.ensureConnection();
    const items = await this.getCollection<PurchaseOrderItem>('purchaseOrderItems')
      .find({ purchaseOrderId } as any)
      .toArray();
    return items;
  }

  async getPurchaseOrderItem(id: string): Promise<PurchaseOrderItem | undefined> {
    await this.ensureConnection();
    const item = await this.getCollection<PurchaseOrderItem>('purchaseOrderItems').findOne({ id } as any);
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
    await this.getCollection<PurchaseOrderItem>('purchaseOrderItems').insertOne(item as any);
    return item;
  }

  async updatePurchaseOrderItem(id: string, itemData: Partial<InsertPurchaseOrderItem>): Promise<PurchaseOrderItem | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<PurchaseOrderItem>('purchaseOrderItems').findOneAndUpdate(
      { id } as any,
      { $set: itemData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deletePurchaseOrderItem(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<PurchaseOrderItem>('purchaseOrderItems').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getWastages(): Promise<Wastage[]> {
    await this.ensureConnection();
    const wastages = await this.getCollection<Wastage>('wastages').find().sort({ createdAt: -1 }).toArray();
    return wastages;
  }

  async getWastage(id: string): Promise<Wastage | undefined> {
    await this.ensureConnection();
    const wastage = await this.getCollection<Wastage>('wastages').findOne({ id } as any);
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
    await this.getCollection<Wastage>('wastages').insertOne(wastage as any);
    return wastage;
  }

  async deleteWastage(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<Wastage>('wastages').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getInvoices(): Promise<Invoice[]> {
    await this.ensureConnection();
    const invoices = await this.getCollection<Invoice>('invoices').find().sort({ createdAt: -1 }).toArray();
    return invoices;
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    await this.ensureConnection();
    const invoice = await this.getCollection<Invoice>('invoices').findOne({ id } as any);
    return invoice ?? undefined;
  }

  async getInvoiceByNumber(invoiceNumber: string): Promise<Invoice | undefined> {
    await this.ensureConnection();
    const invoice = await this.getCollection<Invoice>('invoices').findOne({ invoiceNumber } as any);
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
      discount: insertInvoice.discount ?? '0',
      total: insertInvoice.total,
      paymentMode: insertInvoice.paymentMode,
      splitPayments: insertInvoice.splitPayments ?? null,
      status: insertInvoice.status ?? 'Paid',
      items: insertInvoice.items,
      notes: insertInvoice.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await this.getCollection<Invoice>('invoices').insertOne(invoice as any);
    return invoice;
  }

  async updateInvoice(id: string, invoiceData: Partial<InsertInvoice>): Promise<Invoice | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Invoice>('invoices').findOneAndUpdate(
      { id } as any,
      { $set: { ...invoiceData, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteInvoice(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<Invoice>('invoices').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getReservations(): Promise<Reservation[]> {
    await this.ensureConnection();
    const reservations = await this.getCollection<Reservation>('reservations').find().sort({ timeSlot: 1 }).toArray();
    return reservations;
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    await this.ensureConnection();
    const reservation = await this.getCollection<Reservation>('reservations').findOne({ id } as any);
    return reservation ?? undefined;
  }

  async getReservationsByTable(tableId: string): Promise<Reservation[]> {
    await this.ensureConnection();
    const reservations = await this.getCollection<Reservation>('reservations')
      .find({ tableId } as any)
      .toArray();
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
      status: insertReservation.status ?? 'active',
      createdAt: new Date(),
    };
    await this.getCollection<Reservation>('reservations').insertOne(reservation as any);
    return reservation;
  }

  async updateReservation(id: string, reservationData: Partial<InsertReservation>): Promise<Reservation | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Reservation>('reservations').findOneAndUpdate(
      { id } as any,
      { $set: reservationData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteReservation(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<Reservation>('reservations').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getCustomers(): Promise<Customer[]> {
    await this.ensureConnection();
    const customers = await this.getCollection<Customer>('customers').find().toArray();
    return customers;
  }

  async getCustomer(id: string): Promise<Customer | undefined> {
    await this.ensureConnection();
    const customer = await this.getCollection<Customer>('customers').findOne({ id } as any);
    return customer ?? undefined;
  }

  async getCustomerByPhone(phone: string): Promise<Customer | undefined> {
    await this.ensureConnection();
    const customer = await this.getCollection<Customer>('customers').findOne({ phone } as any);
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
    await this.getCollection<Customer>('customers').insertOne(customer as any);
    return customer;
  }

  async updateCustomer(id: string, customerData: Partial<InsertCustomer>): Promise<Customer | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Customer>('customers').findOneAndUpdate(
      { id } as any,
      { $set: customerData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteCustomer(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<Customer>('customers').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getFeedbacks(): Promise<Feedback[]> {
    await this.ensureConnection();
    const feedbacks = await this.getCollection<Feedback>('feedbacks').find().sort({ createdAt: -1 }).toArray();
    return feedbacks;
  }

  async getFeedback(id: string): Promise<Feedback | undefined> {
    await this.ensureConnection();
    const feedback = await this.getCollection<Feedback>('feedbacks').findOne({ id } as any);
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
      sentiment: insertFeedback.sentiment ?? 'Neutral',
      createdAt: new Date(),
    };
    await this.getCollection<Feedback>('feedbacks').insertOne(feedback as any);
    return feedback;
  }

  async deleteFeedback(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<Feedback>('feedbacks').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async getSetting(key: string): Promise<string | undefined> {
    await this.ensureConnection();
    const setting = await this.getCollection<{ key: string; value: string }>('settings').findOne({ key } as any);
    return setting?.value;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.ensureConnection();
    await this.getCollection<{ key: string; value: string }>('settings').updateOne(
      { key } as any,
      { $set: { key, value } },
      { upsert: true }
    );
  }

  async getInventoryUsages(): Promise<InventoryUsage[]> {
    await this.ensureConnection();
    const usages = await this.getCollection<InventoryUsage>('inventoryUsages')
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return usages;
  }

  async getInventoryUsagesByItem(inventoryItemId: string): Promise<InventoryUsage[]> {
    await this.ensureConnection();
    const usages = await this.getCollection<InventoryUsage>('inventoryUsages')
      .find({ inventoryItemId } as any)
      .sort({ createdAt: -1 })
      .toArray();
    return usages;
  }

  async createInventoryUsage(insertUsage: InsertInventoryUsage): Promise<InventoryUsage> {
    await this.ensureConnection();
    const id = randomUUID();
    const usage: InventoryUsage = {
      id,
      inventoryItemId: insertUsage.inventoryItemId,
      itemName: insertUsage.itemName,
      quantity: insertUsage.quantity,
      unit: insertUsage.unit,
      usedAt: new Date(),
      source: insertUsage.source ?? 'manual',
      notes: insertUsage.notes ?? null,
      createdAt: new Date(),
    };
    await this.getCollection<InventoryUsage>('inventoryUsages').insertOne(usage as any);
    return usage;
  }

  async getMostUsedItems(limit: number = 10): Promise<Array<{ itemId: string; itemName: string; totalQuantity: string; count: number }>> {
    await this.ensureConnection();
    const result = await this.getCollection<InventoryUsage>('inventoryUsages')
      .aggregate([
        {
          $group: {
            _id: '$inventoryItemId',
            itemName: { $first: '$itemName' },
            totalQuantity: { $sum: { $toDouble: '$quantity' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            itemId: '$_id',
            itemName: 1,
            totalQuantity: { $toString: '$totalQuantity' },
            count: 1,
          },
        },
      ])
      .toArray();
    return result as Array<{ itemId: string; itemName: string; totalQuantity: string; count: number }>;
  }

  async getDeliveryPersons(): Promise<DeliveryPerson[]> {
    await this.ensureConnection();
    const persons = await this.getCollection<DeliveryPerson>('deliveryPersons').find().toArray();
    return persons;
  }

  async getDeliveryPerson(id: string): Promise<DeliveryPerson | undefined> {
    await this.ensureConnection();
    const person = await this.getCollection<DeliveryPerson>('deliveryPersons').findOne({ id } as any);
    return person ?? undefined;
  }

  async createDeliveryPerson(insertPerson: InsertDeliveryPerson): Promise<DeliveryPerson> {
    await this.ensureConnection();
    const id = randomUUID();
    const person: DeliveryPerson = {
      id,
      name: insertPerson.name,
      phone: insertPerson.phone,
      status: insertPerson.status ?? 'available',
      createdAt: new Date(),
    };
    await this.getCollection<DeliveryPerson>('deliveryPersons').insertOne(person as any);
    return person;
  }

  async updateDeliveryPerson(id: string, personData: Partial<InsertDeliveryPerson>): Promise<DeliveryPerson | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<DeliveryPerson>('deliveryPersons').findOneAndUpdate(
      { id } as any,
      { $set: personData },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }

  async deleteDeliveryPerson(id: string): Promise<boolean> {
    await this.ensureConnection();
    const result = await this.getCollection<DeliveryPerson>('deliveryPersons').deleteOne({ id } as any);
    return result.deletedCount > 0;
  }

  async assignDeliveryPerson(orderId: string, deliveryPersonId: string | null): Promise<Order | undefined> {
    await this.ensureConnection();
    const result = await this.getCollection<Order>('orders').findOneAndUpdate(
      { id: orderId } as any,
      { $set: { deliveryPersonId } },
      { returnDocument: 'after' }
    );
    return result ?? undefined;
  }
}
