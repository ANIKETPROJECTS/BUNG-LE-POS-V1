import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import { validateCredentials, getAccountById, loginSchema, type RestaurantAccount } from './auth';
import { SessionStorage } from './session-storage';
import { IStorage } from './storage';

declare module 'express-session' {
  interface SessionData {
    restaurantId?: string;
    restaurantName?: string;
    mongodbUri?: string;
    username?: string;
    isAuthenticated?: boolean;
  }
}

const storageCache = new Map<string, IStorage>();

export function getStorageForSession(req: Request): IStorage | null {
  if (!req.session?.isAuthenticated || !req.session.restaurantId || !req.session.mongodbUri) {
    return null;
  }
  
  const cacheKey = req.session.restaurantId;
  let storage = storageCache.get(cacheKey);
  
  if (!storage) {
    storage = new SessionStorage(req.session.restaurantId, req.session.mongodbUri);
    storageCache.set(cacheKey, storage);
  }
  
  return storage;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.isAuthenticated) {
    return res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });
  }
  next();
}

export function setupAuthRoutes(app: any) {
  app.use(session({
    secret: process.env.SESSION_SECRET || (() => { throw new Error('SESSION_SECRET environment variable is required'); })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 365 * 24 * 60 * 60 * 1000,
    },
  }));

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid credentials format' });
      }

      const { username, password } = result.data;
      const account = validateCredentials(username, password);

      if (!account) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      if (!account.mongodbUri) {
        return res.status(500).json({ error: 'Restaurant database not configured' });
      }

      const storage = new SessionStorage(account.id, account.mongodbUri);
      try {
        await storage.getFloors();
      } catch (error) {
        console.error('MongoDB connection test failed:', error);
        return res.status(500).json({ error: 'Database connection failed', code: 'DB_ERROR' });
      }

      req.session.restaurantId = account.id;
      req.session.restaurantName = account.name;
      req.session.mongodbUri = account.mongodbUri;
      req.session.username = account.username;
      req.session.isAuthenticated = true;

      storageCache.set(account.id, storage);

      res.json({
        success: true,
        restaurant: {
          id: account.id,
          name: account.name,
          username: account.username,
        },
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const restaurantId = req.session?.restaurantId;
    if (restaurantId) {
      storageCache.delete(restaurantId);
    }
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: 'Logout failed' });
      }
      res.json({ success: true });
    });
  });

  app.get('/api/auth/session', (req: Request, res: Response) => {
    if (req.session?.isAuthenticated) {
      res.json({
        isAuthenticated: true,
        restaurant: {
          id: req.session.restaurantId,
          name: req.session.restaurantName,
          username: req.session.username,
        },
      });
    } else {
      res.json({ isAuthenticated: false });
    }
  });
}
