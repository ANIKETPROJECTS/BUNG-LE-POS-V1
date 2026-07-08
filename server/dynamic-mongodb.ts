import { MongoClient, Db, Collection, Document } from 'mongodb';

interface ConnectionInfo {
  client: MongoClient;
  db: Db;
  lastUsed: number;
}

class DynamicMongoDBManager {
  private connections: Map<string, ConnectionInfo> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CONNECTION_TTL = 30 * 60 * 1000;

  constructor() {
    this.startCleanupJob();
  }

  private startCleanupJob() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 5 * 60 * 1000);
  }

  private cleanupIdleConnections() {
    const now = Date.now();
    for (const [restaurantId, info] of this.connections.entries()) {
      if (now - info.lastUsed > this.CONNECTION_TTL) {
        console.log(`Closing idle connection for restaurant: ${restaurantId}`);
        info.client.close().catch(console.error);
        this.connections.delete(restaurantId);
      }
    }
  }

  private extractDatabaseName(uri: string): string {
    try {
      const url = new URL(uri);
      const pathname = url.pathname.substring(1);
      if (pathname && pathname !== '') {
        return pathname.split('?')[0];
      }
      return 'restaurant_pos';
    } catch (error) {
      return 'restaurant_pos';
    }
  }

  async getConnection(restaurantId: string, mongodbUri: string): Promise<{ client: MongoClient; db: Db }> {
    const existing = this.connections.get(restaurantId);
    if (existing) {
      existing.lastUsed = Date.now();
      return { client: existing.client, db: existing.db };
    }

    try {
      const client = new MongoClient(mongodbUri);
      await client.connect();
      
      const dbName = this.extractDatabaseName(mongodbUri);
      const db = client.db(dbName);
      
      console.log(`Connected to MongoDB for restaurant ${restaurantId}: ${dbName}`);
      
      this.connections.set(restaurantId, {
        client,
        db,
        lastUsed: Date.now(),
      });

      return { client, db };
    } catch (error) {
      console.error(`Failed to connect to MongoDB for restaurant ${restaurantId}:`, error);
      throw error;
    }
  }

  getCollection<T extends Document>(restaurantId: string, collectionName: string): Collection<T> | null {
    const connection = this.connections.get(restaurantId);
    if (!connection) {
      return null;
    }
    connection.lastUsed = Date.now();
    return connection.db.collection<T>(collectionName);
  }

  hasConnection(restaurantId: string): boolean {
    return this.connections.has(restaurantId);
  }

  async closeConnection(restaurantId: string): Promise<void> {
    const connection = this.connections.get(restaurantId);
    if (connection) {
      await connection.client.close();
      this.connections.delete(restaurantId);
      console.log(`Closed connection for restaurant: ${restaurantId}`);
    }
  }

  /**
   * Reads a settings document from any established restaurant connection.
   * Used by background services that run without a request context.
   */
  async getSettingFromAnyConnection(key: string): Promise<string | undefined> {
    for (const [, info] of this.connections.entries()) {
      try {
        const doc = await info.db.collection<{ key: string; value: string }>('settings').findOne({ key } as any);
        if (doc?.value) return doc.value;
      } catch {
        // ignore per-connection errors and try the next one
      }
    }
    return undefined;
  }

  async closeAll(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    for (const [restaurantId, info] of this.connections.entries()) {
      await info.client.close();
      console.log(`Closed connection for restaurant: ${restaurantId}`);
    }
    this.connections.clear();
  }
}

export const dynamicMongoDB = new DynamicMongoDBManager();
