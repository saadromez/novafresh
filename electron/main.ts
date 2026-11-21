import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import fs from 'fs'
import os from 'os'
import Database from 'better-sqlite3'

// Initialize SQLite database with unified userData across dev and production
const unifiedUserData = join(app.getPath('appData'), 'novafreshmart-pos');
if (!fs.existsSync(unifiedUserData)) {
  try { fs.mkdirSync(unifiedUserData, { recursive: true }); } catch (_) {}
}
try { app.setPath('userData', unifiedUserData); } catch (_) {}

const dbPath = join(unifiedUserData, 'novafreshmart.db');
const oldDbPath = join(unifiedUserData, 'lunibee.db');
if (!fs.existsSync(dbPath)) {
  const candidates = [
    join(app.getPath('appData'), 'Nova FreshMart', 'novafreshmart.db'),
    join(app.getPath('appData'), 'Electron', 'novafreshmart.db'),
    oldDbPath,
    join(app.getPath('appData'), 'lunibee-pos', 'lunibee.db')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        fs.copyFileSync(c, dbPath);
        console.log(`[Database Init] Migrated database from ${c} to ${dbPath}`);
        break;
      } catch (err) {
        console.warn(`[Database Init] Failed to copy from ${c}:`, err);
      }
    }
  }
}
let db = new Database(dbPath, { verbose: console.log })

import { initLocalSchema, startAutoSync, runFullSync, getTerminalConfig, setTerminalConfig, createBranch, createTerminal, updateTerminal, deleteTerminal, getBackofficeOverview, logTerminalActivity, pushUnsyncedData, pullLatestData, pullEmployeesOnly, getRecentSyncLogs } from './syncService'
import { getRemoteStatus, getRemotePool, checkRemoteConnection } from './remoteDb'
import { getSriLankaNowString, toSriLankaYMD } from './dateUtils'

// Initialize offline-first tables & auto-sync
initLocalSchema(db)

function ensureAllSchemaColumns(database: any) {
  const addCol = (table: string, column: string, def: string) => {
    try {
      const info = database.pragma(`table_info(${table})`) as Array<{ name: string }>;
      if (info && info.length > 0 && !info.some((c: any) => c.name.toLowerCase() === column.toLowerCase())) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def};`);
        console.log(`[Schema Migration] Added column ${column} to table ${table}`);
      }
    } catch (e: any) {
      console.warn(`[Schema Migration] Could not add ${column} to ${table}:`, e?.message || e);
    }
  };

  // 1. held_bills
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS held_bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cart_data TEXT,
        customer_id INTEGER,
        customer_name TEXT,
        items_json TEXT,
        total REAL DEFAULT 0,
        customer_data TEXT,
        branch_id TEXT DEFAULT 'BR-MAIN',
        terminal_id TEXT DEFAULT 'TERM-01',
        bill_reference TEXT,
        order_type TEXT DEFAULT 'retail',
        table_no TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (_) {}
  addCol('held_bills', 'cart_data', 'TEXT');
  addCol('held_bills', 'customer_id', 'INTEGER');
  addCol('held_bills', 'customer_name', 'TEXT');
  addCol('held_bills', 'items_json', 'TEXT');
  addCol('held_bills', 'total', 'REAL DEFAULT 0');
  addCol('held_bills', 'customer_data', 'TEXT');
  addCol('held_bills', 'branch_id', 'TEXT DEFAULT "BR-MAIN"');
  addCol('held_bills', 'terminal_id', 'TEXT DEFAULT "TERM-01"');
  addCol('held_bills', 'bill_reference', 'TEXT');
  addCol('held_bills', 'order_type', 'TEXT DEFAULT "retail"');
  addCol('held_bills', 'table_no', 'TEXT');
  addCol('held_bills', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

  // 2. invoices
  addCol('invoices', 'items', 'TEXT');
  addCol('invoices', 'discount', 'REAL DEFAULT 0');
  addCol('invoices', 'customer_id', 'INTEGER');
  addCol('invoices', 'sale_type', 'TEXT DEFAULT "SALE"');
  addCol('invoices', 'parent_invoice_id', 'INTEGER');
  addCol('invoices', 'is_refunded', 'INTEGER DEFAULT 0');
  addCol('invoices', 'amount_paid', 'REAL DEFAULT 0');
  addCol('invoices', 'branch_id', 'TEXT DEFAULT "BR-MAIN"');
  addCol('invoices', 'terminal_id', 'TEXT DEFAULT "TERM-01"');
  addCol('invoices', 'order_type', 'TEXT DEFAULT "retail"');
  addCol('invoices', 'table_no', 'TEXT');
  addCol('invoices', 'pricing_type', 'TEXT DEFAULT "retail"');
  addCol('invoices', 'cash_paid', 'REAL DEFAULT 0');
  addCol('invoices', 'card_paid', 'REAL DEFAULT 0');
  addCol('invoices', 'other_paid', 'REAL DEFAULT 0');
  addCol('invoices', 'balance_due', 'REAL DEFAULT 0');
  addCol('invoices', 'change_returned', 'REAL DEFAULT 0');
  addCol('invoices', 'cashier', 'TEXT DEFAULT "Cashier"');
  addCol('invoices', 'customer_name', 'TEXT');
  addCol('invoices', 'customer_phone', 'TEXT');
  addCol('invoices', 'subtotal', 'REAL DEFAULT 0');
  addCol('invoices', 'synced', 'INTEGER DEFAULT 0');

  // 3. invoice_items
  addCol('invoice_items', 'unit', 'TEXT DEFAULT "pc"');
  addCol('invoice_items', 'discount', 'REAL DEFAULT 0');
  addCol('invoice_items', 'variant_id', 'INTEGER');

  // 4. products
  addCol('products', 'category_id', 'INTEGER');
  addCol('products', 'barcode', 'TEXT');
  addCol('products', 'attributes', 'TEXT');
  addCol('products', 'item_code', 'TEXT');
  addCol('products', 'cost_price', 'REAL DEFAULT 0');
  addCol('products', 'wholesale_price', 'REAL DEFAULT 0');
  addCol('products', 'low_stock_alert', 'INTEGER DEFAULT 5');
  addCol('products', 'supplier_id', 'INTEGER');
  addCol('products', 'brand_id', 'INTEGER');
  addCol('products', 'image_data', 'TEXT');
  addCol('products', 'branch_id', 'TEXT DEFAULT "ALL"');
  addCol('products', 'unit', 'TEXT DEFAULT "pc"');
  addCol('products', 'is_scale_item', 'INTEGER DEFAULT 0');
  addCol('products', 'plu', 'TEXT');
  addCol('products', 'quarantine_stock', 'INTEGER DEFAULT 0');
  addCol('products', 'has_variants', 'BOOLEAN DEFAULT 0');
  addCol('products', 'requires_batch', 'BOOLEAN DEFAULT 0');
  addCol('products', 'size', 'TEXT');
  addCol('products', 'color', 'TEXT');
  addCol('products', 'expiry_date', 'TEXT');
  addCol('products', 'synced', 'INTEGER DEFAULT 1');

  try {
    // Clean up products where wholesale_price was incorrectly copied from retail price by legacy sync bug
    database.exec('UPDATE products SET wholesale_price = 0 WHERE wholesale_price = price;');
  } catch (_) {}

  // 5. customers
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        points INTEGER DEFAULT 0,
        credit_balance REAL DEFAULT 0,
        barcode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (_) {}
  addCol('customers', 'phone', 'TEXT');
  addCol('customers', 'barcode', 'TEXT');
  addCol('customers', 'points', 'INTEGER DEFAULT 0');
  addCol('customers', 'credit_balance', 'REAL DEFAULT 0');
  addCol('customers', 'created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');

  // 6. sessions
  addCol('sessions', 'branch_id', 'TEXT DEFAULT "BR-MAIN"');
  addCol('sessions', 'terminal_id', 'TEXT DEFAULT "TERM-01"');
  addCol('sessions', 'username', 'TEXT');
  addCol('sessions', 'cash_sales', 'REAL DEFAULT 0');
  addCol('sessions', 'card_sales', 'REAL DEFAULT 0');
  addCol('sessions', 'other_sales', 'REAL DEFAULT 0');
  addCol('sessions', 'total_sales', 'REAL DEFAULT 0');
  addCol('sessions', 'total_refunds', 'REAL DEFAULT 0');
  addCol('sessions', 'cash_in', 'REAL DEFAULT 0');
  addCol('sessions', 'cash_out', 'REAL DEFAULT 0');
  addCol('sessions', 'discrepancy', 'REAL DEFAULT 0');
  addCol('sessions', 'synced', 'INTEGER DEFAULT 0');

  // Processed database reset events (prevents re-executing or resurrecting wiped data)
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS reset_events_processed (
        event_id BIGINT PRIMARY KEY,
        section TEXT NOT NULL,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (_) {}

  // 7. shift_handovers
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS shift_handovers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        branch_id TEXT DEFAULT 'BR-MAIN',
        terminal_id TEXT DEFAULT 'TERM-01',
        outgoing_cashier TEXT NOT NULL,
        incoming_cashier TEXT NOT NULL,
        shift_started_at DATETIME,
        handover_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        bills_count INTEGER DEFAULT 0,
        cash_sales REAL DEFAULT 0,
        card_sales REAL DEFAULT 0,
        other_sales REAL DEFAULT 0,
        total_sales REAL DEFAULT 0,
        opening_float REAL DEFAULT 0,
        expected_drawer_cash REAL DEFAULT 0,
        counted_cash REAL DEFAULT 0,
        cash_variance REAL DEFAULT 0,
        handover_notes TEXT,
        synced INTEGER DEFAULT 0
      );
    `);
  } catch (_) {}
  addCol('shift_handovers', 'branch_id', 'TEXT DEFAULT "BR-MAIN"');
  addCol('shift_handovers', 'terminal_id', 'TEXT DEFAULT "TERM-01"');
  addCol('shift_handovers', 'synced', 'INTEGER DEFAULT 0');

  // 8. custom_bill_items
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS custom_bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        branch_id TEXT DEFAULT 'BR-MAIN',
        terminal_id TEXT DEFAULT 'TERM-01',
        cashier TEXT DEFAULT 'Cashier',
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit TEXT DEFAULT 'pc',
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (_) {}
  addCol('custom_bill_items', 'branch_id', 'TEXT DEFAULT "BR-MAIN"');
  addCol('custom_bill_items', 'terminal_id', 'TEXT DEFAULT "TERM-01"');
  addCol('custom_bill_items', 'synced', 'INTEGER DEFAULT 0');
  addCol('custom_bill_items', 'remote_id', 'INTEGER');
  try {
    database.exec('DELETE FROM custom_bill_items WHERE invoice_id IS NOT NULL AND invoice_id NOT IN (SELECT id FROM invoices)');
  } catch (_) {}

  // 9. users
  addCol('users', 'pin', 'TEXT');
  addCol('users', 'role', 'TEXT DEFAULT "Cashier"');
  addCol('users', 'permissions', 'TEXT');
  addCol('users', 'branch_id', 'TEXT DEFAULT "ALL"');
  addCol('users', 'phone', 'TEXT');
  addCol('users', 'nic', 'TEXT');
  addCol('users', 'address', 'TEXT');
  addCol('users', 'salary', 'REAL DEFAULT 0');
  addCol('users', 'bank_account', 'TEXT');
  addCol('users', 'allowed_terminals', 'TEXT DEFAULT "ALL"');

  // 10. promotions
  addCol('promotions', 'status', 'TEXT DEFAULT "ACTIVE"');
  addCol('promotions', 'start_date', 'TEXT');
  addCol('promotions', 'end_date', 'TEXT');
  addCol('promotions', 'discount_type', 'TEXT');
  addCol('promotions', 'discount_value', 'REAL DEFAULT 0');

  // 11. vouchers
  addCol('vouchers', 'name', 'TEXT');
  addCol('vouchers', 'claimed_amount', 'REAL DEFAULT 0');
  addCol('vouchers', 'type', 'TEXT DEFAULT "FIXED"');
  addCol('vouchers', 'synced', 'INTEGER DEFAULT 0');
  addCol('vouchers', 'remote_id', 'TEXT');
  addCol('vouchers', 'branch_id', 'TEXT DEFAULT "ALL"');

  // 12. suppliers
  addCol('suppliers', 'contact', 'TEXT');
  addCol('suppliers', 'contact_person', 'TEXT');
  addCol('suppliers', 'phone', 'TEXT');
  addCol('suppliers', 'email', 'TEXT');
  addCol('suppliers', 'address', 'TEXT');
  addCol('suppliers', 'opening_balance', 'REAL DEFAULT 0');
  addCol('suppliers', 'current_balance', 'REAL DEFAULT 0');
  addCol('suppliers', 'synced', 'INTEGER DEFAULT 0');
  addCol('suppliers', 'remote_id', 'TEXT');

  // 13. purchase_orders & items
  addCol('purchase_orders', 'version', 'INTEGER DEFAULT 1');
  addCol('purchase_orders', 'expected_delivery_date', 'DATETIME');
  addCol('purchase_orders', 'created_by', 'TEXT');
  addCol('purchase_orders', 'approved_by', 'TEXT');
  addCol('purchase_orders', 'supplier_invoice_no', 'TEXT');
  addCol('purchase_orders', 'total_cost', 'REAL DEFAULT 0');
  addCol('purchase_orders', 'total_amount', 'REAL DEFAULT 0');
  addCol('purchase_orders', 'synced', 'INTEGER DEFAULT 0');
  addCol('purchase_orders', 'remote_id', 'TEXT');
  addCol('purchase_order_items', 'synced', 'INTEGER DEFAULT 0');

  // 14. grn & grn_items
  addCol('grn', 'supplier_id', 'INTEGER');
  addCol('grn', 'synced', 'INTEGER DEFAULT 0');
  addCol('grn', 'remote_id', 'TEXT');
  addCol('grn_items', 'variant_id', 'INTEGER');
  addCol('grn_items', 'free_qty', 'INTEGER DEFAULT 0');
  addCol('grn_items', 'effective_cost', 'REAL DEFAULT 0');
  addCol('grn_items', 'new_sale_price', 'REAL');
  addCol('grn_items', 'new_wholesale_price', 'REAL DEFAULT 0');
  addCol('grn_items', 'synced', 'INTEGER DEFAULT 0');
  addCol('grn_items', 'remote_id', 'TEXT');

  // 15. product_variants
  addCol('product_variants', 'item_code', 'TEXT');
  addCol('product_variants', 'image_data', 'TEXT');
  addCol('product_variants', 'barcode', 'TEXT');
  addCol('product_variants', 'attributes', 'TEXT');
  addCol('product_variants', 'expiry_date', 'TEXT');

  // 16. credit_accounts & credit_transactions
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS credit_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL UNIQUE,
        credit_limit REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        status TEXT DEFAULT 'ACTIVE',
        synced INTEGER DEFAULT 0,
        remote_id TEXT
      );
    `);
  } catch (_) {}
  addCol('credit_accounts', 'credit_limit', 'REAL DEFAULT 0');
  addCol('credit_accounts', 'balance', 'REAL DEFAULT 0');
  addCol('credit_accounts', 'status', 'TEXT DEFAULT "ACTIVE"');
  addCol('credit_accounts', 'synced', 'INTEGER DEFAULT 0');
  addCol('credit_accounts', 'remote_id', 'TEXT');

  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        reference_id INTEGER,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0,
        remote_id TEXT
      );
    `);
  } catch (_) {}
  addCol('credit_transactions', 'reference_id', 'INTEGER');
  addCol('credit_transactions', 'notes', 'TEXT');
  addCol('credit_transactions', 'synced', 'INTEGER DEFAULT 0');
  addCol('credit_transactions', 'remote_id', 'TEXT');

  // 17. session_transactions
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS session_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER,
        shift_id TEXT,
        terminal_id TEXT,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        synced INTEGER DEFAULT 0,
        remote_id TEXT
      );
    `);
  } catch (_) {}
  addCol('session_transactions', 'shift_id', 'TEXT');
  addCol('session_transactions', 'terminal_id', 'TEXT');
  addCol('session_transactions', 'synced', 'INTEGER DEFAULT 0');
  addCol('session_transactions', 'remote_id', 'TEXT');
  addCol('sessions', 'cash_in', 'REAL DEFAULT 0');
  addCol('sessions', 'cash_out', 'REAL DEFAULT 0');
  addCol('sessions', 'remote_id', 'TEXT');
}

// NOTE: ensureAllSchemaColumns(db) is called AFTER all table creation below
try { db.exec('ALTER TABLE grn_items ADD COLUMN new_wholesale_price REAL DEFAULT 0'); } catch(e) {}
startAutoSync(db, 10000)

// Setup some basic tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE
  );
`);

// Ensure fresh supermarket categories and purge old baby shop categories
try {
  const babyCategories = ['Feeding', 'Diapers', 'Baby Clothing', 'Baby Care', 'Toys', 'Nursery', 'Bath', 'Accessories', 'Footwear', 'Gifts'];
  for (const b of babyCategories) {
    db.prepare('DELETE FROM categories WHERE name = ?').run(b);
  }
  const supermarketCategories = [
    'Fruits & Vegetables',
    'Dairy & Chilled',
    'Bakery & Bread',
    'Meat & Seafood',
    'Rice, Grains & Pulses',
    'Spices & Seasonings',
    'Beverages & Drinks',
    'Cooking Oil & Ghee',
    'Snacks & Biscuits',
    'Canned & Packaged',
    'Frozen Foods',
    'Household & Cleaning',
    'Personal Care'
  ];
  for (const name of supermarketCategories) {
    db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)').run(name);
  }
} catch (e) {
  console.warn('Supermarket categories seeding error:', e);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    category_id INTEGER,
    FOREIGN KEY(category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    opening_cash REAL DEFAULT 0,
    expected_cash REAL,
    actual_cash REAL,
    status TEXT DEFAULT 'OPEN'
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    total REAL NOT NULL,
    payment_method TEXT NOT NULL,
    customer_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    quantity INTEGER NOT NULL,
    price REAL NOT NULL,
    discount REAL DEFAULT 0,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id)
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    variant_id INTEGER,
    quantity INTEGER NOT NULL,
    type TEXT NOT NULL,
    reference_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact TEXT
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER,
    status TEXT DEFAULT 'DRAFT',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
  );

  CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty_ordered INTEGER NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    FOREIGN KEY(po_id) REFERENCES purchase_orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
  CREATE TABLE IF NOT EXISTS grn (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id INTEGER,
    total_cost REAL NOT NULL,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(po_id) REFERENCES purchase_orders(id)
  );
  CREATE TABLE IF NOT EXISTS grn_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    qty_received INTEGER NOT NULL DEFAULT 0,
    free_qty INTEGER NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    new_sale_price REAL,
    FOREIGN KEY(grn_id) REFERENCES grn(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'ACTIVE',
    start_date TEXT,
    end_date TEXT,
    discount_type TEXT,
    discount_value REAL
  );

  CREATE TABLE IF NOT EXISTS variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );
`)

// Database Migrations

  try { db.exec('ALTER TABLE vouchers ADD COLUMN claimed_amount REAL DEFAULT 0') } catch(e) {}
  try { db.exec('ALTER TABLE vouchers ADD COLUMN type TEXT DEFAULT "FIXED"') } catch(e) {}
  try { db.exec('ALTER TABLE invoices ADD COLUMN items TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE invoices ADD COLUMN discount REAL DEFAULT 0') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN nic TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN branch_id TEXT DEFAULT "ALL"') } catch(e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN wholesale_price REAL DEFAULT 0') } catch(e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN unit TEXT DEFAULT "pc"') } catch(e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN is_scale_item INTEGER DEFAULT 0') } catch(e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN plu TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN allow_price_override INTEGER DEFAULT 1') } catch(e) {}
  try { db.exec('ALTER TABLE invoice_items ADD COLUMN unit TEXT DEFAULT "pc"') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN address TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN salary REAL DEFAULT 0') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN bank_account TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN allowed_terminals TEXT DEFAULT "ALL"') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN branch_id TEXT DEFAULT "ALL"') } catch(e) {}
  try { db.exec('ALTER TABLE users ADD COLUMN updated_at DATETIME') } catch(e) {}
  try { db.exec('ALTER TABLE terminals ADD COLUMN is_active INTEGER DEFAULT 1') } catch(e) {}
  try { db.exec("UPDATE products SET unit = 'pc' WHERE unit IS NULL OR unit = '' OR unit GLOB '[0-9]*'") } catch(e) {}
  try { db.exec("UPDATE invoice_items SET unit = 'pc' WHERE unit IS NULL OR unit = '' OR unit GLOB '[0-9]*'") } catch(e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        permissions TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch(e) {}
  try {
    const rolesCount = (db.prepare('SELECT COUNT(*) as count FROM user_roles').get() as any)?.count || 0;
    if (rolesCount === 0) {
      const defaultRoles = [
        {
          name: 'Admin',
          permissions: JSON.stringify(['POS', 'Inventory', 'GRN', 'Reports', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Branches', 'Settings', 'Users', 'Refunds', 'Discounts', 'Delete Invoice', 'View Invoices', 'Edit Invoices', 'Custom Items', 'Backup Hub']),
          description: 'Full system administrator with unrestricted privileges'
        },
        {
          name: 'Manager',
          permissions: JSON.stringify(['POS', 'Inventory', 'GRN', 'Reports', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Refunds', 'Discounts', 'View Invoices', 'Edit Invoices', 'Custom Items', 'Backup Hub']),
          description: 'Store manager with operational and reporting authorization'
        },
        {
          name: 'Supervisor',
          permissions: JSON.stringify(['POS', 'Reports', 'Customers', 'Vouchers', 'Promotions', 'Refunds', 'Discounts', 'View Invoices', 'Custom Items']),
          description: 'Shift supervisor with discount and refund approval'
        },
        {
          name: 'Cashier',
          permissions: JSON.stringify(['POS']),
          description: 'Front-desk cashier limited to checkout & billing'
        },
        {
          name: 'Stock Keeper',
          permissions: JSON.stringify(['Inventory', 'Suppliers', 'GRN']),
          description: 'Inventory warehouse staff handling GRN and stock checks'
        }
      ];
      const insertStmt = db.prepare('INSERT OR IGNORE INTO user_roles (name, permissions, description) VALUES (?, ?, ?)');
      for (const r of defaultRoles) {
        insertStmt.run(r.name, r.permissions, r.description);
      }
    }
  } catch(e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        branch_id TEXT DEFAULT 'BR-MAIN',
        terminal_id TEXT DEFAULT 'TERM-01',
        cashier TEXT DEFAULT 'Cashier',
        item_name TEXT NOT NULL,
        quantity REAL NOT NULL DEFAULT 1,
        unit TEXT DEFAULT 'pc',
        unit_price REAL NOT NULL DEFAULT 0,
        total_price REAL NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch(e) {}
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shift_handovers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        branch_id TEXT DEFAULT 'BR-MAIN',
        terminal_id TEXT DEFAULT 'TERM-01',
        outgoing_cashier TEXT NOT NULL,
        incoming_cashier TEXT NOT NULL,
        shift_started_at DATETIME,
        handover_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        bills_count INTEGER DEFAULT 0,
        cash_sales REAL DEFAULT 0,
        card_sales REAL DEFAULT 0,
        other_sales REAL DEFAULT 0,
        total_sales REAL DEFAULT 0,
        opening_float REAL DEFAULT 0,
        expected_drawer_cash REAL DEFAULT 0,
        counted_cash REAL DEFAULT 0,
        cash_variance REAL DEFAULT 0,
        handover_notes TEXT,
        synced INTEGER DEFAULT 0
      );
    `);
  } catch(e) {}
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS voucher_restrictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL,
      type TEXT NOT NULL, -- 'CATEGORY', 'BRAND', 'PRODUCT'
      target_id INTEGER NOT NULL,
      FOREIGN KEY(voucher_id) REFERENCES vouchers(id)
    )
  `);
    try { db.exec('ALTER TABLE promotions ADD COLUMN status TEXT DEFAULT "ACTIVE"') } catch(e) {}
  try { db.exec('ALTER TABLE promotions ADD COLUMN start_date TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE promotions ADD COLUMN end_date TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE promotions ADD COLUMN discount_type TEXT') } catch(e) {}
  try { db.exec('ALTER TABLE promotions ADD COLUMN discount_value REAL') } catch(e) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      points INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)
} catch (e) {}

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      batch_no TEXT NOT NULL,
      expiry_date DATE NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `)
} catch (e) {}

try { db.exec('ALTER TABLE products ADD COLUMN category_id INTEGER') } catch (e) {}
try { db.exec('ALTER TABLE products ADD COLUMN barcode TEXT') } catch (e) {}
try { db.exec('ALTER TABLE products ADD COLUMN attributes TEXT') } catch (e) {}
try { db.exec('ALTER TABLE products ADD COLUMN item_code TEXT') } catch (e) {}
try { db.exec('ALTER TABLE products ADD COLUMN cost_price REAL DEFAULT 0') } catch (e) {}
try { db.exec('ALTER TABLE products ADD COLUMN low_stock_alert INTEGER DEFAULT 5') } catch (e) {}
try { db.exec('ALTER TABLE products ADD COLUMN supplier_id INTEGER') } catch (e) {}
try { db.exec('ALTER TABLE products ADD COLUMN image_data TEXT') } catch (e) {}
try { db.exec('ALTER TABLE product_variants ADD COLUMN item_code TEXT') } catch (e) {}
try { db.exec('ALTER TABLE product_variants ADD COLUMN image_data TEXT') } catch (e) {}
try { db.exec('ALTER TABLE purchase_orders ADD COLUMN version INTEGER DEFAULT 1') } catch (e) {}
try { db.exec('ALTER TABLE purchase_orders ADD COLUMN expected_delivery_date DATETIME') } catch (e) {}
try { db.exec('ALTER TABLE purchase_orders ADD COLUMN created_by TEXT') } catch (e) {}
try { db.exec('ALTER TABLE purchase_orders ADD COLUMN approved_by TEXT') } catch (e) {}
try { db.exec('ALTER TABLE purchase_orders ADD COLUMN supplier_invoice_no TEXT') } catch (e) {}


  
  // Supplier Payments & Payables
  db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      method TEXT NOT NULL, -- CASH, BANK, CHEQUE
      amount REAL NOT NULL,
      reference_no TEXT,
      cheque_date DATE,
      status TEXT DEFAULT 'CLEARED', -- PENDING, CLEARED, BOUNCED
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
  `)
  try { db.exec('ALTER TABLE suppliers ADD COLUMN opening_balance REAL DEFAULT 0') } catch (e) {}
  try { db.exec('ALTER TABLE suppliers ADD COLUMN email TEXT') } catch (e) {}
  try { db.exec('ALTER TABLE suppliers ADD COLUMN address TEXT') } catch (e) {}
  try { db.exec('ALTER TABLE grn ADD COLUMN supplier_id INTEGER') } catch (e) {}

  
  // Baby Retail Specifics: Variants and Batches
  try { db.exec('ALTER TABLE products ADD COLUMN has_variants BOOLEAN DEFAULT 0') } catch (e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN requires_batch BOOLEAN DEFAULT 0') } catch (e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN size TEXT') } catch (e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN color TEXT') } catch (e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN expiry_date TEXT') } catch (e) {}
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      sku TEXT UNIQUE,
      barcode TEXT UNIQUE,
      size TEXT,
      color TEXT,
      stock INTEGER DEFAULT 0,
      cost_price REAL NOT NULL,
      price REAL NOT NULL,
      expiry_date TEXT,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by TEXT
    )
  `)
  try { db.exec('ALTER TABLE expenses ADD COLUMN branch_id TEXT DEFAULT "BR-MAIN";'); } catch (_) {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN terminal_id TEXT DEFAULT "TERM-01";'); } catch (_) {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN synced INTEGER DEFAULT 0;'); } catch (_) {}
  try { db.exec('ALTER TABLE expenses ADD COLUMN remote_id TEXT;'); } catch (_) {}
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      batch_no TEXT NOT NULL,
      mfg_date DATE,
      expiry_date DATE NOT NULL,
      stock INTEGER DEFAULT 0,
      cost_price REAL NOT NULL,
      supplier_id INTEGER,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      FOREIGN KEY(variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
    )
  `)

  
  db.exec(`
    CREATE TABLE IF NOT EXISTS held_bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_data TEXT NOT NULL,
      customer_id INTEGER,
      customer_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  try { db.exec('ALTER TABLE held_bills ADD COLUMN items_json TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE held_bills ADD COLUMN total REAL DEFAULT 0;'); } catch (_) {}
  try { db.exec('ALTER TABLE held_bills ADD COLUMN customer_data TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE held_bills ADD COLUMN branch_id TEXT DEFAULT "BR-MAIN";'); } catch (_) {}
  try { db.exec('ALTER TABLE held_bills ADD COLUMN terminal_id TEXT DEFAULT "TERM-01";'); } catch (_) {}
  try { db.exec('ALTER TABLE held_bills ADD COLUMN bill_reference TEXT;'); } catch (_) {}
  try { db.exec('ALTER TABLE held_bills ADD COLUMN order_type TEXT DEFAULT "retail";'); } catch (_) {}
  try { db.exec("UPDATE held_bills SET id = 'HOLD-' || rowid WHERE id IS NULL OR id = '';"); } catch (_) {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'ACTIVE',
      expiry_date DATE
    )
  `)

  // Session Transactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES sessions(id)
    )
  `)

  // Credit & Settings
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL UNIQUE,
      credit_limit REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'ACTIVE',
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      reference_id INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(account_id) REFERENCES credit_accounts(id)
    )
  `)

  
  // Promotions Engine
  db.exec(`
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      discount_type TEXT NOT NULL, -- PERCENT, FLAT
      discount_value REAL NOT NULL,
      status TEXT DEFAULT 'ACTIVE'
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS promotion_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      required_qty INTEGER DEFAULT 1,
      FOREIGN KEY(promotion_id) REFERENCES promotions(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `)

  
  // GRN & 3-Way Matching
  db.exec(`
    CREATE TABLE IF NOT EXISTS grn (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL,
      supplier_id INTEGER NOT NULL,
      grn_no TEXT UNIQUE,
      supplier_invoice_no TEXT,
      received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'RECEIVED',
      total_amount REAL,
      FOREIGN KEY(po_id) REFERENCES purchase_orders(id),
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS grn_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grn_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variant_id INTEGER,
      expected_qty INTEGER,
      received_qty INTEGER NOT NULL,
      cost_price REAL NOT NULL,
      free_qty INTEGER DEFAULT 0,
      FOREIGN KEY(grn_id) REFERENCES grn(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `)

  // Enterprise Stock Ledger
db.exec(`
  CREATE TABLE IF NOT EXISTS inventory_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL,
    reference_id INTEGER,
    qty_change INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    unit_cost REAL,
    notes TEXT,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  )
`)

try { db.exec('ALTER TABLE products ADD COLUMN quarantine_stock INTEGER DEFAULT 0') } catch (e) {}
try { db.exec('ALTER TABLE variants ADD COLUMN barcode TEXT') } catch (e) {}
try { db.exec('ALTER TABLE variants ADD COLUMN attributes TEXT') } catch (e) {}

try { db.exec('ALTER TABLE invoices ADD COLUMN customer_id INTEGER') } catch (e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN sale_type TEXT DEFAULT "SALE"') } catch (e) {}

try { db.exec('ALTER TABLE invoices ADD COLUMN parent_invoice_id INTEGER') } catch (e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN is_refunded INTEGER DEFAULT 0') } catch (e) {}
try { db.exec('ALTER TABLE credit_transactions ADD COLUMN reference_id INTEGER') } catch (e) {}
try { db.exec('ALTER TABLE vouchers ADD COLUMN name TEXT') } catch (e) {}
  try { db.exec('ALTER TABLE customers ADD COLUMN barcode TEXT') } catch (e) {}

try { db.exec("UPDATE invoices SET sale_type = 'REFUND' WHERE total < 0 AND (sale_type IS NULL OR sale_type = 'SALE')") } catch (e) {}



  
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        pin TEXT NOT NULL,
        role TEXT NOT NULL,
        permissions TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        nic TEXT,
        phone TEXT,
        basic_salary REAL DEFAULT 0,
        status TEXT DEFAULT 'Active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    const adminCheck = db.prepare('SELECT count(*) as count FROM users').get() as any;
    if (adminCheck.count === 0) {
      db.prepare('INSERT INTO users (username, pin, role, permissions) VALUES (?, ?, ?, ?)').run('Admin', 'Kosala70100@', 'Admin', JSON.stringify(['POS', 'Inventory', 'Reports', 'Settings', 'Users']));
    }
  } catch (e) {
    console.error('Users table error', e);
  }


    // Brands & Sub-categories
  db.exec(`
    CREATE TABLE IF NOT EXISTS brands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `)
  try { db.exec('ALTER TABLE categories ADD COLUMN parent_id INTEGER REFERENCES categories(id)') } catch (e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN brand_id INTEGER REFERENCES brands(id)') } catch (e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)') } catch (e) {}
  try { db.exec('ALTER TABLE products ADD COLUMN item_code TEXT UNIQUE') } catch (e) {}
  try { db.exec('ALTER TABLE product_variants ADD COLUMN expiry_date TEXT') } catch (e) {}
  try { 
    db.exec(`
      INSERT INTO inventory_ledger (product_id, transaction_type, qty_change, balance_after, notes, created_by)
      SELECT id, 'ADJUSTMENT', stock, stock, 'Opening Stock (Backfill)', 'System'
      FROM products
      WHERE stock > 0 AND id NOT IN (SELECT DISTINCT product_id FROM inventory_ledger)
    `);
  } catch (e) {}

  // Seed basic categories if empty
const catCount = db.prepare('SELECT COUNT(*) as count FROM categories').get() as {count: number}
if (catCount.count === 0) {
  const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)')
  const cats = ['Feeding', 'Diapers', 'Baby Clothing', 'Baby Care', 'Toys', 'Nursery', 'Bath', 'Accessories', 'Footwear', 'Gifts']
  db.transaction(() => {
    for (const cat of cats) insertCat.run(cat)
  })()
}

// ============================================================
// FINAL SCHEMA MIGRATION - runs AFTER all CREATE TABLE blocks
// This ensures all columns exist on EXISTING databases too
// ============================================================
ensureAllSchemaColumns(db);

// Extra explicit migrations that ensureAllSchemaColumns might miss on old DBs
try { db.exec('ALTER TABLE invoices ADD COLUMN branch_id TEXT DEFAULT "BR-MAIN"') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN terminal_id TEXT DEFAULT "TERM-01"') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN remote_id TEXT') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN invoice_no TEXT') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN order_type TEXT DEFAULT "takeaway"') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN table_no TEXT') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN pricing_type TEXT DEFAULT "retail"') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN subtotal REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN cash_paid REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN card_paid REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN other_paid REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN balance_due REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN change_returned REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN cashier TEXT DEFAULT "Cashier"') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN customer_name TEXT') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN customer_phone TEXT') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN amount_paid REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE invoices ADD COLUMN synced INTEGER DEFAULT 0') } catch(e) {}

try { db.exec('ALTER TABLE sessions ADD COLUMN branch_id TEXT DEFAULT "BR-MAIN"') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN terminal_id TEXT DEFAULT "TERM-01"') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN username TEXT') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN cash_sales REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN card_sales REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN other_sales REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN total_sales REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN total_refunds REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN cash_in REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN cash_out REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN discrepancy REAL DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN synced INTEGER DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE sessions ADD COLUMN opened_at DATETIME DEFAULT CURRENT_TIMESTAMP') } catch(e) {}

try { db.exec('ALTER TABLE products ADD COLUMN synced INTEGER DEFAULT 1') } catch(e) {}
try { db.exec('ALTER TABLE products ADD COLUMN allow_price_override INTEGER DEFAULT 1') } catch(e) {}

try { db.exec('ALTER TABLE customers ADD COLUMN synced INTEGER DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE customers ADD COLUMN remote_id TEXT') } catch(e) {}
try { db.exec('ALTER TABLE customers ADD COLUMN credit_balance REAL DEFAULT 0') } catch(e) {}

try { db.exec('ALTER TABLE vouchers ADD COLUMN synced INTEGER DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE vouchers ADD COLUMN remote_id TEXT') } catch(e) {}
try { db.exec('ALTER TABLE vouchers ADD COLUMN branch_id TEXT DEFAULT "ALL"') } catch(e) {}

try { db.exec('ALTER TABLE categories ADD COLUMN synced INTEGER DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE categories ADD COLUMN color TEXT DEFAULT "#059669"') } catch(e) {}
try { db.exec('ALTER TABLE categories ADD COLUMN icon TEXT DEFAULT "Folder"') } catch(e) {}

try { db.exec('ALTER TABLE shift_handovers ADD COLUMN synced INTEGER DEFAULT 0') } catch(e) {}
try { db.exec('ALTER TABLE shift_handovers ADD COLUMN branch_id TEXT DEFAULT "BR-MAIN"') } catch(e) {}
try { db.exec('ALTER TABLE shift_handovers ADD COLUMN terminal_id TEXT DEFAULT "TERM-01"') } catch(e) {}

// Self-healing for 0-total invoices and sessions in local SQLite
function healZeroInvoicesAndSessions(database: any) {
  try {
    const zeroRows = database.prepare(`
      SELECT id, invoice_no, session_id, total, subtotal, discount, items, payment_method, cash_paid, sale_type
      FROM invoices
      WHERE (total = 0 OR total IS NULL) AND items IS NOT NULL AND items != ''
    `).all();

    if (zeroRows.length > 0) {
      console.log(`[Self-Healing] Found ${zeroRows.length} zero-total invoices in local SQLite. Healing...`);
      const affectedSessionIds = new Set<number>();

      for (const inv of zeroRows) {
        let items: any[] = [];
        try { items = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []); } catch (_) {}
        if (!Array.isArray(items) || items.length === 0) continue;

        let itemsSum = 0;
        let itemsDiscount = 0;
        for (const it of items) {
          itemsSum += Number(it.price || 0) * Number(it.quantity || 1);
          itemsDiscount += Number(it.discount || 0);
        }
        const totalDiscount = Number(inv.discount || 0) + itemsDiscount;
        const newTotal = Math.max(0, itemsSum - totalDiscount);

        if (newTotal > 0 && String(inv.sale_type).toUpperCase() !== 'REFUND') {
          console.log(`[Self-Healing] Healing invoice #${inv.id} (${inv.invoice_no}) to Rs. ${newTotal}`);
          database.prepare(`
            UPDATE invoices 
            SET total = ?, 
                subtotal = ?, 
                cash_paid = CASE WHEN UPPER(payment_method) = 'CASH' AND (cash_paid = 0 OR cash_paid IS NULL) THEN ? ELSE cash_paid END,
                synced = 0 
            WHERE id = ?
          `).run(newTotal, itemsSum, newTotal, inv.id);

          if (inv.session_id) affectedSessionIds.add(Number(inv.session_id));
        }
      }

      // Recompute shift session sales for affected sessions
      for (const sId of affectedSessionIds) {
        try {
          database.prepare(`
            UPDATE sessions SET
              total_sales = (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE session_id = ? AND (sale_type = 'SALE' OR sale_type = 'sale' OR total > 0)),
              cash_sales = (SELECT COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'CASH' THEN (CASE WHEN total > 0 THEN total ELSE cash_paid END) ELSE 0 END), 0) FROM invoices WHERE session_id = ?),
              card_sales = (SELECT COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'CARD' THEN (CASE WHEN total > 0 THEN total ELSE card_paid END) ELSE 0 END), 0) FROM invoices WHERE session_id = ?),
              other_sales = (SELECT COALESCE(SUM(CASE WHEN UPPER(payment_method) NOT IN ('CASH', 'CARD') THEN (CASE WHEN total > 0 THEN total ELSE other_paid END) ELSE 0 END), 0) FROM invoices WHERE session_id = ?),
              expected_cash = opening_cash + (SELECT COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'CASH' THEN (CASE WHEN total > 0 THEN total ELSE cash_paid END) ELSE 0 END), 0) FROM invoices WHERE session_id = ?) + COALESCE(cash_in, 0) - COALESCE(cash_out, 0),
              synced = 0
            WHERE id = ?
          `).run(sId, sId, sId, sId, sId, sId);
          console.log(`[Self-Healing] Recomputed local session #${sId} totals.`);
        } catch (err) {
          console.warn(`[Self-Healing] Failed to recompute session #${sId}:`, err);
        }
      }
    }
  } catch (err: any) {
    console.warn('[Self-Healing] healZeroInvoicesAndSessions error:', err?.message || err);
  }
}
healZeroInvoicesAndSessions(db);

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT,
      address TEXT,
      phone TEXT,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      name TEXT NOT NULL,
      device_info TEXT,
      last_active TEXT,
      current_user TEXT,
      status TEXT DEFAULT 'offline'
    );
    CREATE TABLE IF NOT EXISTS terminal_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
} catch(e) {}
try { db.exec('ALTER TABLE terminals ADD COLUMN is_active INTEGER DEFAULT 1') } catch(e) {}

// IPC Handlers
ipcMain.handle('get-printers', async (event) => {
  return await event.sender.getPrintersAsync();
});

ipcMain.handle('print-silent', async (event, printerName) => {
  return new Promise((resolve, reject) => {
    event.sender.print({
      silent: !!printerName,
      deviceName: printerName || undefined,
      margins: { marginType: 'none' }
    }, (success, failureReason) => {
      if (!success) reject(new Error(failureReason));
      else resolve(true);
    });
  });
});

ipcMain.handle('print-invoice', async (_, { printerName, html, styles }) => {
  return new Promise((resolve, reject) => {
    let printWindow: BrowserWindow | null = new BrowserWindow({
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          ${styles || ''}
          <style>
            @page { margin: 0; size: 80mm auto; }
            body { 
              margin: 0; padding: 0; 
              width: 80mm; 
              font-family: monospace; 
              color: black;
              background: white;
            }
          </style>
        </head>
        <body>${html}</body>
      </html>
    `;

    printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));

    printWindow.webContents.on('did-finish-load', () => {
      printWindow!.webContents.print({
        silent: !!printerName,
        deviceName: printerName || undefined,
        margins: { marginType: 'none' },
        pageSize: { width: 80000, height: 297000 } // Micro-meters, width is ~80mm
      }, (success, errorType) => {
        if (!success) reject(new Error(errorType));
        else resolve(true);
        printWindow?.close();
        printWindow = null;
      });
    });
  });
});

ipcMain.handle('get-categories', async () => {
  try {
    const isOnline = await checkRemoteConnection(1500);
    if (isOnline) {
      const pool = getRemotePool();
      const [remoteCats]: any = await pool.query('SELECT * FROM novafreshmart_categories ORDER BY name ASC');
      if (Array.isArray(remoteCats) && remoteCats.length > 0) {
        setTimeout(() => {
          try {
            const insCat = db.prepare('INSERT INTO categories (id, name) VALUES (@id, @name) ON CONFLICT(id) DO UPDATE SET name = excluded.name');
            db.transaction(() => {
              for (const rc of remoteCats) {
                const numId = Number(rc.id);
                if (!isNaN(numId) && numId > 0) insCat.run({ id: numId, name: rc.name });
              }
            })();
          } catch (_) {}
        }, 10);
        return remoteCats.map((c: any) => ({
          id: Number(c.id) || c.id,
          name: c.name,
          color: c.color || '',
          icon: c.icon || ''
        }));
      }
    }
  } catch (err: any) {
    console.warn('[get-categories] Remote fallback to local:', err.message);
  }
  return db.prepare('SELECT * FROM categories').all();
})
  ipcMain.handle('add-category', async (_, { name, parent_id }) => {
    const res = db.prepare('INSERT INTO categories (name, parent_id) VALUES (?, ?)').run(name, parent_id || null);
    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query('INSERT INTO novafreshmart_categories (id, name, color, icon, updated_at) VALUES (?, ?, "", "", NOW()) ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()', [String(res.lastInsertRowid), name]);
        await pool.query('INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES (\'catalog_last_updated\', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()').catch(() => {});
      }
    } catch (e: any) {
      console.warn('[add-category] Remote push error:', e.message);
    }
    broadcastCatalogUpdated();
    return res;
  })
  ipcMain.handle('delete-category', async (_, id) => {
    const res = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query('DELETE FROM novafreshmart_categories WHERE id = ?', [String(id)]);
        await pool.query('INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES (\'catalog_last_updated\', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()').catch(() => {});
      }
    } catch (e: any) {
      console.warn('[delete-category] Remote delete error:', e.message);
    }
    broadcastCatalogUpdated();
    return res;
  })

  ipcMain.handle('get-invoice-by-id', (_, rawId) => {
    const str = String(rawId || '').trim();
    const num = parseInt(str.replace(/^(INV-?|REF-?|EXC-?|0+)/i, ''), 10);
    return db.prepare(`
      SELECT * FROM invoices 
      WHERE id = ? 
         OR invoice_no = ? 
         OR remote_id = ? 
         OR invoice_no = ? 
         OR remote_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(isNaN(num) ? -1 : num, str, str, `INV-${str}`, `INV-${num}`);
  })

  ipcMain.handle('process-refund', async (_, { invoiceId, refundAmount, items }) => {
    const addProd = db.prepare('UPDATE products SET stock = stock + @qty WHERE id = @id');
    const addVar = db.prepare('UPDATE product_variants SET stock = stock + @qty WHERE id = @vid');
    
    db.transaction(() => {
      // Restore stock for refunded items (only if not damaged)
      for (const item of items) {
        if (!item.is_damaged && item.return_condition !== 'damage') {
          addProd.run({ qty: item.qtyToRefund, id: item.id });
          if (item.variantId) addVar.run({ qty: item.qtyToRefund, vid: item.variantId });
        }
      }
      
      db.prepare('UPDATE invoices SET total = total - ?, amount_paid = amount_paid - ? WHERE id = ?').run(refundAmount, refundAmount, invoiceId);
    })();

    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        for (const item of items) {
          if (!item.is_damaged && item.return_condition !== 'damage' && item.qtyToRefund > 0) {
            await pool.query('UPDATE novafreshmart_products SET stock = stock + ?, updated_at = NOW() WHERE id = ?', [Number(item.qtyToRefund), String(item.id)]).catch(() => {});
            await pool.query(`
              INSERT INTO novafreshmart_inventory_ledger 
                (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
              VALUES (?, 'REFUND', ?, ?, (SELECT stock FROM novafreshmart_products WHERE id = ?), NULL, ?, 'Supervisor', NOW())
            `, [String(item.id), `INV-${invoiceId}`, Number(item.qtyToRefund), String(item.id), `Direct Refund for INV-${invoiceId}`]).catch(() => {});
          } else if (item.is_damaged || item.return_condition === 'damage') {
            await pool.query(`
              INSERT INTO novafreshmart_inventory_ledger 
                (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
              VALUES (?, 'DAMAGE', ?, 0, (SELECT stock FROM novafreshmart_products WHERE id = ?), NULL, ?, 'Supervisor', NOW())
            `, [String(item.id), `INV-${invoiceId}`, `Damaged Return for INV-${invoiceId}`]).catch(() => {});
          }
        }
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      }
    } catch (_) {}

    broadcastCatalogUpdated();
    return true;
  })
  ipcMain.handle('delete-invoice', async (_, payload) => {
    const id = typeof payload === 'object' ? payload.id : payload;
    const restoreStock = typeof payload === 'object' ? payload.restoreStock : true;
    try {
      let invToDelete: any = null;
      try {
        invToDelete = db.prepare('SELECT * FROM invoices WHERE id = ? OR remote_id = ? OR invoice_no = ?').get(id, id, id);
      } catch (_) {}

      const pool = getRemotePool();
      let shiftIdToRecalc: string | null = null;
      let branchIdForShift: string = 'BR-MAIN';
      let terminalIdForShift: string = 'TERM-01';
      let remoteSaleIdToDelete: string | null = null;
      let invoiceNoToDelete: string | null = null;

      if (invToDelete) {
        const config = getTerminalConfig(db);
        const bId = invToDelete?.branch_id || config.current_branch_id || 'BR-MAIN';
        const tId = invToDelete?.terminal_id || config.current_terminal_id || 'TERM-01';
        remoteSaleIdToDelete = invToDelete?.remote_id || `INV-${bId}-${tId}-${invToDelete.id}`;
        invoiceNoToDelete = invToDelete?.invoice_no || null;
        shiftIdToRecalc = invToDelete.session_id ? String(invToDelete.session_id) : null;
        branchIdForShift = bId;
        terminalIdForShift = tId;

        db.transaction(() => {
          if (restoreStock && invToDelete.items) {
            try {
              const items = typeof invToDelete.items === 'string' ? JSON.parse(invToDelete.items) : (invToDelete.items || []);
              for (const item of items) {
                try { db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.quantity || item.qty || 1, item.id); } catch(e) {}
                try { if (item.variantId) db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').run(item.quantity || item.qty || 1, item.variantId); } catch(e) {}
              }
            } catch(e) {}
          }

          try { db.prepare('DELETE FROM inventory_ledger WHERE reference_id = ?').run(invToDelete.id); } catch(e) {}
          try { db.prepare('DELETE FROM custom_bill_items WHERE invoice_id = ?').run(invToDelete.id); } catch(e) {}
          db.prepare('DELETE FROM invoices WHERE id = ?').run(invToDelete.id);

          // Adjust local session sales totals
          if (invToDelete.session_id) {
            try {
              const t = Number(invToDelete.total || 0);
              const cp = Number(invToDelete.cash_paid || (invToDelete.payment_method === 'Cash' ? t : 0));
              db.prepare(`
                UPDATE sessions 
                SET total_sales = MAX(0, COALESCE(total_sales, 0) - ?),
                    expected_cash = MAX(0, COALESCE(expected_cash, opening_cash) - ?),
                    synced = 0
                WHERE id = ?
              `).run(t, cp, invToDelete.session_id);
            } catch (_) {}
          }
        })();

        // Clean remote MariaDB
        try {
          await pool.query('DELETE FROM novafreshmart_custom_bill_items WHERE invoice_id = ? OR invoice_id = ?', [String(invToDelete.id), remoteSaleIdToDelete]);
          await pool.query('DELETE FROM novafreshmart_sale_items WHERE sale_id = ? OR sale_id = ?', [remoteSaleIdToDelete, invoiceNoToDelete || remoteSaleIdToDelete]);
          await pool.query('DELETE FROM novafreshmart_sales WHERE id = ? OR invoice_no = ?', [remoteSaleIdToDelete, invoiceNoToDelete || remoteSaleIdToDelete]);
          await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['invoices', remoteSaleIdToDelete]);
          if (invoiceNoToDelete && invoiceNoToDelete !== remoteSaleIdToDelete) {
            await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['invoices', invoiceNoToDelete]);
          }
          if (restoreStock && invToDelete.items) {
            try {
              const items = typeof invToDelete.items === 'string' ? JSON.parse(invToDelete.items) : (invToDelete.items || []);
              for (const item of items) {
                const qty = Number(item.quantity || item.qty || 1);
                if (qty > 0 && (item.id || item.barcode)) {
                  await pool.query('UPDATE novafreshmart_products SET stock = stock + ?, updated_at = NOW() WHERE id = ? OR (barcode = ? AND barcode IS NOT NULL AND barcode != "")', [qty, String(item.id || ''), String(item.barcode || '')]).catch(() => {});
                }
              }
              await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
            } catch (_) {}
          }
        } catch (remErr: any) {
          console.warn('[Delete Invoice] Remote delete error:', remErr?.message);
        }
      } else {
        // Not in local SQLite: find and delete from MariaDB directly
        try {
          const [remSales]: any = await pool.query('SELECT * FROM novafreshmart_sales WHERE id = ? OR invoice_no = ?', [String(id), String(id)]);
          if (remSales && remSales.length > 0) {
            const rs = remSales[0];
            shiftIdToRecalc = rs.shift_id ? String(rs.shift_id) : null;
            branchIdForShift = rs.branch_id || 'BR-MAIN';
            terminalIdForShift = rs.terminal_id || 'TERM-01';
            remoteSaleIdToDelete = rs.id;

            await pool.query('DELETE FROM novafreshmart_custom_bill_items WHERE invoice_id = ? OR invoice_id = ?', [rs.id, rs.invoice_no]);
            await pool.query('DELETE FROM novafreshmart_sale_items WHERE sale_id = ?', [rs.id]);
            await pool.query('DELETE FROM novafreshmart_sales WHERE id = ?', [rs.id]);
            await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['invoices', rs.id]);
          }
        } catch (remErr: any) {
          console.warn('[Delete Invoice] Direct remote delete error:', remErr?.message);
        }
      }

      // Recompute remote shift sales totals if shift exists
      if (shiftIdToRecalc) {
        try {
          const [shiftSums]: any = await pool.query(`
            SELECT 
              COUNT(*) as bill_count,
              COALESCE(SUM(total), 0) as total_sales,
              COALESCE(SUM(cash_paid), 0) as cash_sales,
              COALESCE(SUM(card_paid), 0) as card_sales
            FROM novafreshmart_sales
            WHERE shift_id = ?
          `, [shiftIdToRecalc]);
          if (shiftSums && shiftSums.length > 0) {
            await pool.query(`
              UPDATE novafreshmart_terminal_shifts SET
                total_sales = ?,
                cash_sales = ?,
                card_sales = ?,
                expected_cash = opening_cash + ? + COALESCE(cash_in, 0) - COALESCE(cash_out, 0)
              WHERE id = ? OR id = ?
            `, [
              shiftSums[0].total_sales,
              shiftSums[0].cash_sales,
              shiftSums[0].card_sales,
              shiftSums[0].cash_sales,
              shiftIdToRecalc,
              `SH-${branchIdForShift}-${terminalIdForShift}-${shiftIdToRecalc}`
            ]);
          }
        } catch (sErr: any) {
          console.warn('[Delete Invoice] Could not recompute remote shift:', sErr?.message);
        }
      }

      try {
        BrowserWindow.getAllWindows().forEach(w => {
          w.webContents.send('invoice-deleted', { id, remoteId: remoteSaleIdToDelete });
          w.webContents.send('sync-data-updated');
        });
      } catch (_) {}

      return { success: true };
    } catch(e) {
      console.error('delete-invoice error:', e);
      throw e;
    }
  });

  ipcMain.handle('update-invoice', async (_, payload: {
    id: number | string;
    items?: any[];
    payment_method?: string;
    customer_name?: string;
    customer_phone?: string;
    cashier?: string;
    pricing_type?: string;
    discount?: number;
    subtotal?: number;
    total?: number;
    notes?: string;
  }) => {
    try {
      let inv: any = null;
      try {
        inv = db.prepare('SELECT * FROM invoices WHERE id = ? OR remote_id = ? OR invoice_no = ?').get(payload.id, payload.id, payload.id);
      } catch (_) {}

      const pool = getRemotePool();
      let remoteSuccess = false;

      // Case 1: Invoice exists only in central MariaDB (e.g. Backoffice/Server terminal editing another terminal's bill)
      if (!inv) {
        let remoteSale: any = null;
        try {
          const [rows]: any = await pool.query('SELECT * FROM novafreshmart_sales WHERE id = ? OR invoice_no = ?', [String(payload.id), String(payload.id)]);
          if (rows && rows.length > 0) {
            remoteSale = rows[0];
          }
        } catch (remErr: any) {
          console.warn('[update-invoice] Failed to query remote sale:', remErr?.message);
        }

        if (!remoteSale) {
          throw new Error('Invoice not found locally or in cloud database');
        }

        const payment_method = payload.payment_method !== undefined ? payload.payment_method : remoteSale.payment_method;
        const customer_name = payload.customer_name !== undefined ? payload.customer_name : remoteSale.customer_name;
        const customer_phone = payload.customer_phone !== undefined ? payload.customer_phone : remoteSale.customer_phone;
        const cashier = payload.cashier !== undefined ? payload.cashier : remoteSale.cashier;
        const pricing_type = payload.pricing_type !== undefined ? payload.pricing_type : remoteSale.pricing_type;
        const discount = payload.discount !== undefined ? Number(payload.discount) : Number(remoteSale.discount || 0);
        const total = payload.total !== undefined ? Number(payload.total) : Number(remoteSale.total || 0);
        const subtotal = payload.subtotal !== undefined ? Number(payload.subtotal) : Number(remoteSale.subtotal || total);
        const itemsJson = Array.isArray(payload.items) ? JSON.stringify(payload.items) : (remoteSale.items_json || '[]');

        await pool.query(`
          UPDATE novafreshmart_sales SET
            items_json = ?,
            payment_method = ?,
            customer_name = ?,
            customer_phone = ?,
            cashier = ?,
            pricing_type = ?,
            discount = ?,
            subtotal = ?,
            total = ?,
            cash_paid = CASE WHEN UPPER(?) = 'CASH' THEN ? ELSE cash_paid END,
            card_paid = CASE WHEN UPPER(?) = 'CARD' THEN ? ELSE card_paid END,
            synced_at = CURRENT_TIMESTAMP
          WHERE id = ? OR invoice_no = ?
        `, [
          itemsJson, payment_method, customer_name, customer_phone, cashier, pricing_type, discount, subtotal, total,
          payment_method, total, payment_method, total,
          remoteSale.id, remoteSale.invoice_no
        ]);

        // Recompute remote shift sales totals if shift_id is present
        if (remoteSale.shift_id) {
          try {
            const [shiftSums]: any = await pool.query(`
              SELECT 
                COUNT(*) as bill_count,
                COALESCE(SUM(total), 0) as total_sales,
                COALESCE(SUM(cash_paid), 0) as cash_sales,
                COALESCE(SUM(card_paid), 0) as card_sales
              FROM novafreshmart_sales
              WHERE shift_id = ?
            `, [remoteSale.shift_id]);
            if (shiftSums && shiftSums.length > 0) {
              await pool.query(`
                UPDATE novafreshmart_terminal_shifts SET
                  total_sales = ?,
                  cash_sales = ?,
                  card_sales = ?,
                  expected_cash = opening_cash + ? + COALESCE(cash_in, 0) - COALESCE(cash_out, 0)
                WHERE id = ? OR id = ?
              `, [
                shiftSums[0].total_sales,
                shiftSums[0].cash_sales,
                shiftSums[0].card_sales,
                shiftSums[0].cash_sales,
                remoteSale.shift_id,
                `SH-${remoteSale.branch_id || 'BR-MAIN'}-${remoteSale.terminal_id || 'TERM-01'}-${remoteSale.shift_id}`
              ]);
            }
          } catch (shiftErr: any) {
            console.warn('[update-invoice] Could not recompute remote shift:', shiftErr?.message);
          }
        }

        remoteSuccess = true;

        try {
          BrowserWindow.getAllWindows().forEach(w => {
            w.webContents.send('invoice-updated', { id: remoteSale.id, invoice_no: remoteSale.invoice_no });
            w.webContents.send('sync-data-updated');
          });
        } catch (_) {}

        return { success: true, remoteSuccess: true };
      }

      // Case 2: Invoice exists in local SQLite
      const payment_method = payload.payment_method !== undefined ? payload.payment_method : inv.payment_method;
      const customer_name = payload.customer_name !== undefined ? payload.customer_name : inv.customer_name;
      const customer_phone = payload.customer_phone !== undefined ? payload.customer_phone : inv.customer_phone;
      const cashier = payload.cashier !== undefined ? payload.cashier : inv.cashier;
      const pricing_type = payload.pricing_type !== undefined ? payload.pricing_type : inv.pricing_type;
      const discount = payload.discount !== undefined ? Number(payload.discount) : Number(inv.discount || 0);
      const total = payload.total !== undefined ? Number(payload.total) : Number(inv.total || 0);
      const subtotal = payload.subtotal !== undefined ? Number(payload.subtotal) : Number(inv.subtotal || total);

      let itemsJson = inv.items;

      // Handle item updates and inventory stock adjustments
      if (Array.isArray(payload.items)) {
        itemsJson = JSON.stringify(payload.items);
        let oldItems: any[] = [];
        try {
          oldItems = typeof inv.items === 'string' ? JSON.parse(inv.items || '[]') : (inv.items || []);
        } catch (_) {}

        // Map product old quantities
        const oldQtyMap = new Map<string, { qty: number; id: number; variantId?: number; name: string }>();
        for (const it of oldItems) {
          const pid = Number(it.id || it.product_id || 0);
          const vid = Number(it.variantId || it.variant_id || 0);
          const key = `${pid}_${vid}`;
          const cur = oldQtyMap.get(key) || { qty: 0, id: pid, variantId: vid, name: it.name || it.product_name || 'Item' };
          cur.qty += Number(it.quantity || it.qty || 0);
          oldQtyMap.set(key, cur);
        }

        // Map product new quantities
        const newQtyMap = new Map<string, { qty: number; id: number; variantId?: number; name: string }>();
        for (const it of payload.items) {
          const pid = Number(it.id || it.product_id || 0);
          const vid = Number(it.variantId || it.variant_id || 0);
          const key = `${pid}_${vid}`;
          const cur = newQtyMap.get(key) || { qty: 0, id: pid, variantId: vid, name: it.name || it.product_name || 'Item' };
          cur.qty += Number(it.quantity || it.qty || 0);
          newQtyMap.set(key, cur);
        }

        const allKeys = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
        const ledgerStmt = db.prepare('INSERT INTO inventory_ledger (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

        for (const key of allKeys) {
          const oldInfo = oldQtyMap.get(key) || { qty: 0, id: 0, variantId: 0, name: '' };
          const newInfo = newQtyMap.get(key) || { qty: 0, id: 0, variantId: 0, name: '' };
          const pid = oldInfo.id || newInfo.id;
          const vid = oldInfo.variantId || newInfo.variantId;
          const diff = oldInfo.qty - newInfo.qty; // diff > 0 => items removed, restore stock. diff < 0 => items added, deduct stock.

          if (diff !== 0 && pid > 0) {
            try {
              if (vid) {
                db.prepare('UPDATE product_variants SET stock = stock + ? WHERE id = ?').run(diff, vid);
                db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(diff, pid);
              } else {
                db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(diff, pid);
              }
              const p: any = db.prepare('SELECT stock, cost_price FROM products WHERE id = ?').get(pid);
              ledgerStmt.run(
                pid,
                diff > 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
                inv.id,
                diff,
                p?.stock || 0,
                p?.cost_price || 0,
                `Invoice #${inv.invoice_no || inv.id} edited (${oldInfo.name}): Qty ${oldInfo.qty} -> ${newInfo.qty}`,
                cashier || 'Admin'
              );
            } catch (stockErr) {
              console.warn('[update-invoice] Stock adjustment error:', stockErr);
            }
          }
        }
      }

      db.prepare(`
        UPDATE invoices SET
          items = ?,
          payment_method = ?,
          customer_name = ?,
          customer_phone = ?,
          cashier = ?,
          pricing_type = ?,
          discount = ?,
          subtotal = ?,
          total = ?,
          synced = 0
        WHERE id = ?
      `).run(itemsJson, payment_method, customer_name, customer_phone, cashier, pricing_type, discount, subtotal, total, inv.id);

      // Adjust session totals if total changed
      const totalDelta = total - Number(inv.total || 0);
      if (inv.session_id && Math.abs(totalDelta) > 0.001) {
        try {
          db.prepare(`
            UPDATE sessions 
            SET total_sales = COALESCE(total_sales, 0) + ?,
                expected_cash = CASE 
                  WHEN UPPER(payment_method) = 'CASH' THEN COALESCE(expected_cash, opening_cash) + ? 
                  ELSE expected_cash 
                END,
                synced = 0
            WHERE id = ?
          `).run(totalDelta, totalDelta, inv.session_id);
        } catch (_) {}
      }

      // Also update remote MariaDB if online
      try {
        const remoteId = inv.remote_id;
        const invoiceNo = inv.invoice_no;

        if (remoteId || invoiceNo) {
          await pool.query(`
            UPDATE novafreshmart_sales SET
              items_json = ?,
              payment_method = ?,
              customer_name = ?,
              customer_phone = ?,
              cashier = ?,
              pricing_type = ?,
              discount = ?,
              subtotal = ?,
              total = ?,
              cash_paid = CASE WHEN UPPER(?) = 'CASH' THEN ? ELSE cash_paid END,
              card_paid = CASE WHEN UPPER(?) = 'CARD' THEN ? ELSE card_paid END,
              synced_at = CURRENT_TIMESTAMP
            WHERE id = ? OR invoice_no = ?
          `, [
            itemsJson, payment_method, customer_name, customer_phone, cashier, pricing_type, discount, subtotal, total,
            payment_method, total, payment_method, total,
            remoteId || '', invoiceNo || ''
          ]);

          db.prepare('UPDATE invoices SET synced = 1 WHERE id = ?').run(inv.id);
          remoteSuccess = true;

          // Recompute shift totals in MariaDB if session_id exists
          if (inv.session_id) {
            try {
              const [shiftSums]: any = await pool.query(`
                SELECT 
                  COUNT(*) as bill_count,
                  COALESCE(SUM(total), 0) as total_sales,
                  COALESCE(SUM(cash_paid), 0) as cash_sales,
                  COALESCE(SUM(card_paid), 0) as card_sales
                FROM novafreshmart_sales
                WHERE shift_id = ?
              `, [String(inv.session_id)]);
              if (shiftSums && shiftSums.length > 0) {
                const config = getTerminalConfig(db);
                const bId = inv.branch_id || config.current_branch_id || 'BR-MAIN';
                const tId = inv.terminal_id || config.current_terminal_id || 'TERM-01';
                await pool.query(`
                  UPDATE novafreshmart_terminal_shifts SET
                    total_sales = ?,
                    cash_sales = ?,
                    card_sales = ?,
                    expected_cash = opening_cash + ? + COALESCE(cash_in, 0) - COALESCE(cash_out, 0)
                  WHERE id = ? OR id = ?
                `, [
                  shiftSums[0].total_sales,
                  shiftSums[0].cash_sales,
                  shiftSums[0].card_sales,
                  shiftSums[0].cash_sales,
                  String(inv.session_id),
                  `SH-${bId}-${tId}-${inv.session_id}`
                ]);
              }
            } catch (sErr: any) {
              console.warn('[update-invoice] Could not recompute remote shift:', sErr?.message);
            }
          }
        }
      } catch (remErr: any) {
        console.warn('[Update Invoice] Remote update failed or offline:', remErr.message);
      }

      try {
        BrowserWindow.getAllWindows().forEach(w => {
          w.webContents.send('invoice-updated', { id: inv.id, invoice_no: inv.invoice_no });
          w.webContents.send('sync-data-updated');
        });
      } catch (_) {}

      return { success: true, remoteSuccess };
    } catch (err: any) {
      console.error('update-invoice error:', err);
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle('get-brands', async () => {
    try {
      const isOnline = await checkRemoteConnection(1500);
      if (isOnline) {
        const pool = getRemotePool();
        const [remoteBrands]: any = await pool.query('SELECT * FROM novafreshmart_brands ORDER BY name ASC');
        if (Array.isArray(remoteBrands) && remoteBrands.length > 0) {
          setTimeout(() => {
            try {
              const insBrand = db.prepare('INSERT INTO brands (id, name) VALUES (@id, @name) ON CONFLICT(id) DO UPDATE SET name = excluded.name');
              db.transaction(() => {
                for (const rb of remoteBrands) {
                  const numId = Number(rb.id);
                  if (!isNaN(numId) && numId > 0) insBrand.run({ id: numId, name: rb.name });
                }
              })();
            } catch (_) {}
          }, 10);
          return remoteBrands.map((b: any) => ({
            id: Number(b.id) || b.id,
            name: b.name
          }));
        }
      }
    } catch (err: any) {
      console.warn('[get-brands] Remote fallback to local:', err.message);
    }
    return db.prepare('SELECT * FROM brands').all()
  })
  ipcMain.handle('add-brand', async (_, name) => {
    const res = db.prepare('INSERT INTO brands (name) VALUES (?)').run(name);
    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query('INSERT INTO novafreshmart_brands (id, name, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()', [String(res.lastInsertRowid), name]);
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      }
    } catch (e: any) {
      console.warn('[add-brand] Remote push error:', e.message);
    }
    broadcastCatalogUpdated();
    return res;
  })
  ipcMain.handle('delete-brand', async (_, id) => {
    const res = db.prepare('DELETE FROM brands WHERE id = ?').run(id);
    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query('DELETE FROM novafreshmart_brands WHERE id = ?', [String(id)]);
        await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['brands', String(id)]).catch(() => {});
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      }
    } catch (e: any) {
      console.warn('[delete-brand] Remote delete error:', e.message);
    }
    broadcastCatalogUpdated();
    return res;
  })

  ipcMain.on('window-min', () => mainWindow?.minimize())
  ipcMain.on('window-max', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window-close', () => mainWindow?.close())



  ipcMain.handle('get-products-advanced', async () => {
    try {
      const isOnline = await checkRemoteConnection(3000);
      if (isOnline) {
        const pool = getRemotePool();
        const [remoteProds]: any = await pool.query(`
          SELECT p.*, COALESCE(p.category, c.name, 'General') as category_name
          FROM novafreshmart_products p
          LEFT JOIN novafreshmart_categories c ON c.id = p.category_id
          WHERE p.is_active = 1
          ORDER BY p.name ASC
        `);

        if (Array.isArray(remoteProds)) {
          const activeIds = new Set(remoteProds.map((rp: any) => Number(rp.id)).filter(id => !isNaN(id) && id > 0));

          // Asynchronously purge deleted products from local SQLite cache and sync active items
          setTimeout(() => {
            try {
              db.transaction(() => {
                // 1. Purge any products deleted from cloud
                const localProds = db.prepare('SELECT id FROM products').all() as any[];
                for (const lp of localProds) {
                  if (!activeIds.has(Number(lp.id))) {
                    db.prepare('DELETE FROM products WHERE id = ?').run(lp.id);
                    db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(lp.id);
                    db.prepare('DELETE FROM product_batches WHERE product_id = ?').run(lp.id);
                  }
                }

                // 2. Insert or update active products
                const insOrUpdate = db.prepare(`
                  INSERT INTO products (id, name, price, wholesale_price, cost_price, barcode, branch_id, unit, stock, category_id, is_scale_item, plu, allow_price_override, expiry_date, synced)
                  VALUES (@id, @name, @price, @wholesale_price, @cost_price, @barcode, @branch_id, @unit, @stock, @category_id, @is_scale_item, @plu, @allow_price_override, @expiry_date, 1)
                  ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    price = excluded.price,
                    wholesale_price = excluded.wholesale_price,
                    cost_price = excluded.cost_price,
                    barcode = excluded.barcode,
                    branch_id = excluded.branch_id,
                    unit = excluded.unit,
                    stock = excluded.stock,
                    category_id = excluded.category_id,
                    is_scale_item = excluded.is_scale_item,
                    plu = excluded.plu,
                    allow_price_override = excluded.allow_price_override,
                    expiry_date = excluded.expiry_date,
                    synced = 1
                `);
                for (const rp of remoteProds) {
                  const numId = Number(rp.id);
                  if (!isNaN(numId) && numId > 0) {
                    insOrUpdate.run({
                      id: numId,
                      name: rp.name,
                      price: Number(rp.price || 0),
                      wholesale_price: Number(rp.wholesale_price || 0),
                      cost_price: Number(rp.cost_price || 0),
                      barcode: rp.barcode || '',
                      branch_id: rp.branch_id || 'ALL',
                      unit: rp.unit || 'pc',
                      stock: Number(rp.stock || 0),
                      category_id: Number(rp.category_id) || 1,
                      is_scale_item: rp.is_scale_item ? 1 : 0,
                      plu: rp.plu || null,
                      allow_price_override: rp.allow_price_override !== 0 ? 1 : 0,
                      expiry_date: rp.expiry_date || null
                    });
                  }
                }
              })();
            } catch (_) {}
          }, 10);

          let variants: any[] = [];
          try { variants = db.prepare('SELECT * FROM product_variants').all() as any[]; } catch (_) {}
          let batches: any[] = [];
          try { batches = db.prepare('SELECT * FROM product_batches').all() as any[]; } catch (_) {}

          const variantMap = new Map<number, any[]>()
          for (const v of variants as any[]) {
            const arr = variantMap.get(v.product_id) || []
            arr.push(v)
            variantMap.set(v.product_id, arr)
          }

          const batchMap = new Map<number, any[]>()
          for (const b of batches as any[]) {
            const arr = batchMap.get(b.product_id) || []
            arr.push(b)
            batchMap.set(b.product_id, arr)
          }

          return remoteProds.map((rp: any) => ({
            id: Number(rp.id) || rp.id,
            name: rp.name,
            price: Number(rp.price || 0),
            wholesale_price: Number(rp.wholesale_price || 0),
            cost_price: Number(rp.cost_price || 0),
            barcode: rp.barcode || '',
            branch_id: rp.branch_id || 'ALL',
            unit: rp.unit || 'pc',
            stock: Number(rp.stock || 0),
            category_id: Number(rp.category_id) || 1,
            category_name: rp.category_name || 'General',
            is_scale_item: rp.is_scale_item ? 1 : 0,
            plu: rp.plu || null,
            allow_price_override: rp.allow_price_override !== 0 ? 1 : 0,
            expiry_date: rp.expiry_date || null,
            variants: variantMap.get(Number(rp.id)) || [],
            batches: batchMap.get(Number(rp.id)) || []
          }));
        }
      }
    } catch (err: any) {
      console.warn('[get-products-advanced] Remote fallback to local:', err.message);
    }

    try {
      const products = db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.id ASC').all()
      let variants: any[] = [];
      try { variants = db.prepare('SELECT * FROM product_variants').all() as any[]; } catch (_) {}
      let batches: any[] = [];
      try { batches = db.prepare('SELECT * FROM product_batches').all() as any[]; } catch (_) {}

      const variantMap = new Map<number, any[]>()
      for (const v of variants as any[]) {
        const arr = variantMap.get(v.product_id) || []
        arr.push(v)
        variantMap.set(v.product_id, arr)
      }

      const batchMap = new Map<number, any[]>()
      for (const b of batches as any[]) {
        const arr = batchMap.get(b.product_id) || []
        arr.push(b)
        batchMap.set(b.product_id, arr)
      }
      
      return products.map((p: any) => ({
        ...p,
        variants: variantMap.get(p.id) || [],
        batches: batchMap.get(p.id) || []
      }))
    } catch (e) {
      console.error('GET_PRODUCTS_ERROR:', e)
      throw e;
    }
  })

  function broadcastCatalogUpdated() {
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('products-updated');
          w.webContents.send('sync-data-updated');
          w.webContents.send('sync-completed', { success: true });
        }
      });
    } catch (_) {}
  }

  ipcMain.handle('update-product', async (_, product) => {
    const safeUnit = (product.unit && !/^\d+$/.test(String(product.unit).trim())) ? product.unit : 'pc';
    const allowOverride = product.allow_price_override !== 0 && product.allow_price_override !== false ? 1 : 0;
    const lowStockAlert = (product.low_stock_alert !== undefined && product.low_stock_alert !== null && product.low_stock_alert !== '') ? Number(product.low_stock_alert) : 2;
    const catRow: any = product.category_id ? db.prepare('SELECT name FROM categories WHERE id = ?').get(product.category_id) : null;
    const catName = catRow?.name || 'General';

    const res = db.prepare('UPDATE products SET name = ?, price = ?, cost_price = ?, barcode = ?, item_code = ?, low_stock_alert = ?, category_id = ?, brand_id = ?, supplier_id = ?, has_variants = ?, requires_batch = ?, image_data = ?, size = ?, color = ?, expiry_date = ?, branch_id = ?, wholesale_price = ?, unit = ?, is_scale_item = ?, plu = ?, allow_price_override = ?, synced = 0 WHERE id = ?')
      .run(product.name, product.price, product.cost_price, product.barcode || null, product.item_code || null, lowStockAlert, product.category_id || 1, product.brand_id || null, product.supplier_id || null, product.has_variants ? 1 : 0, product.requires_batch ? 1 : 0, product.image_data || null, product.size || null, product.color || null, product.expiry_date || null, product.branch_id || 'ALL', product.wholesale_price || 0, safeUnit, product.is_scale_item ? 1 : 0, product.plu || null, allowOverride, product.id);

    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query(`
          INSERT INTO novafreshmart_products (id, branch_id, barcode, name, category, category_id, price, wholesale_price, cost_price, stock, unit, is_scale_item, plu, allow_price_override, expiry_date, is_active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
          ON DUPLICATE KEY UPDATE
            branch_id = VALUES(branch_id),
            barcode = VALUES(barcode),
            name = VALUES(name),
            category = VALUES(category),
            category_id = VALUES(category_id),
            price = VALUES(price),
            wholesale_price = VALUES(wholesale_price),
            cost_price = VALUES(cost_price),
            unit = VALUES(unit),
            is_scale_item = VALUES(is_scale_item),
            plu = VALUES(plu),
            allow_price_override = VALUES(allow_price_override),
            expiry_date = VALUES(expiry_date),
            is_active = 1,
            updated_at = NOW()
        `, [
          String(product.id),
          product.branch_id || 'ALL',
          product.barcode || '',
          product.name,
          catName,
          String(product.category_id || 1),
          product.price,
          product.wholesale_price || 0,
          product.cost_price || 0,
          product.stock || 0,
          safeUnit,
          product.is_scale_item ? 1 : 0,
          product.plu || null,
          allowOverride,
          product.expiry_date || null
        ]);
        // Only mark synced=1 AFTER confirmed remote write
        db.prepare('UPDATE products SET synced = 1 WHERE id = ?').run(product.id);
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      } else {
        // Offline: keep synced=0 so next sync cycle pushes it
        console.warn('[update-product] Offline - product edit queued for next sync, id:', product.id);
      }
    } catch (e: any) {
      console.warn('[update-product] Remote push error, will retry on next sync:', e.message);
      // Do NOT mark synced=1 on failure - leave synced=0 so pushUnsyncedData retries it
    }

    broadcastCatalogUpdated();
    return res;
  })

  ipcMain.handle('delete-product', async (_, id) => {
    const res = db.transaction(() => {
      // First delete associated variants, batches, and ledger entries
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM product_batches WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM inventory_ledger WHERE product_id = ?').run(id);
      // Then delete product
      return db.prepare('DELETE FROM products WHERE id = ?').run(id);
    })();

    // Deactivate on cloud MariaDB so sync pull never resurrects it
    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query('UPDATE novafreshmart_products SET is_active = 0, updated_at = NOW() WHERE id = ?', [String(id)]);
        await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['products', String(id)]);
        await pool.query('INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES (\'catalog_last_updated\', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()').catch(() => {});
      }
    } catch (e: any) {
      console.warn('[delete-product] Remote delete failed:', e.message);
    }

    broadcastCatalogUpdated();
    return res;
  })

  ipcMain.handle('add-variant', (_, { product_id, sku, barcode, size, color, stock, cost_price, price, item_code, image_data, expiry_date }) => {
    return db.prepare('INSERT INTO product_variants (product_id, sku, barcode, size, color, stock, cost_price, price, item_code, image_data, expiry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(product_id, sku, barcode, size, color, stock, cost_price, price, item_code || null, image_data || null, expiry_date || null)
  })

  ipcMain.handle('add-batch', (_, { product_id, variant_id, batch_no, mfg_date, expiry_date, stock, cost_price, supplier_id }) => {
    return db.prepare('INSERT INTO product_batches (product_id, variant_id, batch_no, mfg_date, expiry_date, stock, cost_price, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(product_id, variant_id || null, batch_no, mfg_date || null, expiry_date, stock, cost_price, supplier_id || null)
  })

  ipcMain.on('show-alert', (event, msg) => {
  const { dialog } = require('electron');
  dialog.showMessageBoxSync({ type: 'warning', message: String(msg) });
  event.returnValue = null;
});

ipcMain.on('show-confirm', (event, msg) => {
  const { dialog } = require('electron');
  const result = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['OK', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: String(msg)
  });
  event.returnValue = result === 0;
});

ipcMain.handle('get-products', async () => {
  try {
    const isOnline = await checkRemoteConnection(1500);
    if (isOnline) {
      const pool = getRemotePool();
      const [remoteProds]: any = await pool.query(`
        SELECT p.*, COALESCE(p.category, c.name, 'General') as category_name
        FROM novafreshmart_products p
        LEFT JOIN novafreshmart_categories c ON c.id = p.category_id
        WHERE p.is_active = 1
        ORDER BY p.name ASC
      `);
      if (Array.isArray(remoteProds) && remoteProds.length > 0) {
        // Asynchronously update local SQLite cache so offline billing is always ready
        setTimeout(() => {
          try {
            const insOrUpdate = db.prepare(`
              INSERT INTO products (id, name, price, wholesale_price, cost_price, barcode, branch_id, unit, stock, category_id, is_scale_item, plu, allow_price_override, expiry_date, synced)
              VALUES (@id, @name, @price, @wholesale_price, @cost_price, @barcode, @branch_id, @unit, @stock, @category_id, @is_scale_item, @plu, @allow_price_override, @expiry_date, 1)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                price = excluded.price,
                wholesale_price = excluded.wholesale_price,
                cost_price = excluded.cost_price,
                barcode = excluded.barcode,
                branch_id = excluded.branch_id,
                unit = excluded.unit,
                stock = excluded.stock,
                category_id = excluded.category_id,
                is_scale_item = excluded.is_scale_item,
                plu = excluded.plu,
                allow_price_override = excluded.allow_price_override,
                expiry_date = excluded.expiry_date,
                synced = 1
            `);
            const activeIds = new Set(remoteProds.map((rp: any) => Number(rp.id)).filter(id => !isNaN(id) && id > 0));
            db.transaction(() => {
              // 1. Purge deleted/inactive products from local cache
              const localProds = db.prepare('SELECT id FROM products').all() as any[];
              for (const lp of localProds) {
                if (!activeIds.has(Number(lp.id))) {
                  db.prepare('DELETE FROM products WHERE id = ?').run(lp.id);
                  db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(lp.id);
                  db.prepare('DELETE FROM product_batches WHERE product_id = ?').run(lp.id);
                }
              }

              // 2. Insert or update active products
              for (const rp of remoteProds) {
                const numId = Number(rp.id);
                if (!isNaN(numId) && numId > 0) {
                  insOrUpdate.run({
                    id: numId,
                    name: rp.name,
                    price: Number(rp.price || 0),
                    wholesale_price: Number(rp.wholesale_price || 0),
                    cost_price: Number(rp.cost_price || 0),
                    barcode: rp.barcode || '',
                    branch_id: rp.branch_id || 'ALL',
                    unit: rp.unit || 'pc',
                    stock: Number(rp.stock || 0),
                    category_id: Number(rp.category_id) || 1,
                    is_scale_item: rp.is_scale_item ? 1 : 0,
                    plu: rp.plu || null,
                    allow_price_override: rp.allow_price_override !== 0 ? 1 : 0,
                    expiry_date: rp.expiry_date || null
                  });
                }
              }
            })();
          } catch (_) {}
        }, 10);

        return remoteProds.map((rp: any) => ({
          id: Number(rp.id) || rp.id,
          name: rp.name,
          price: Number(rp.price || 0),
          wholesale_price: Number(rp.wholesale_price || 0),
          cost_price: Number(rp.cost_price || 0),
          barcode: rp.barcode || '',
          branch_id: rp.branch_id || 'ALL',
          unit: rp.unit || 'pc',
          stock: Number(rp.stock || 0),
          category_id: Number(rp.category_id) || 1,
          category_name: rp.category_name || 'General',
          is_scale_item: rp.is_scale_item ? 1 : 0,
          plu: rp.plu || null,
          allow_price_override: rp.allow_price_override !== 0 ? 1 : 0,
          expiry_date: rp.expiry_date || null
        }));
      }
    }
  } catch (err: any) {
    console.warn('[get-products] Remote fetch fallback to local SQLite cache:', err.message);
  }

  // Offline fallback to local SQLite cache
  return db.prepare('SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id').all();
})

  ipcMain.handle('add-product', async (_, product) => {
    let productId: any = null;
    let barcode = product.barcode;
    let itemCode = product.item_code;
    const safeUnit = (product.unit && !/^\d+$/.test(String(product.unit).trim())) ? product.unit : 'pc';
    const allowOverride = product.allow_price_override !== 0 && product.allow_price_override !== false ? 1 : 0;
    const lowStockAlert = (product.low_stock_alert !== undefined && product.low_stock_alert !== null && product.low_stock_alert !== '') ? Number(product.low_stock_alert) : 2;
    const catRow: any = product.category_id ? db.prepare('SELECT name FROM categories WHERE id = ?').get(product.category_id) : null;
    const catName = catRow?.name || 'General';

    // 1. Determine safe Next Product ID across local SQLite and remote MariaDB to avoid ID collisions
    let safeNextId: number | null = null;
    try {
      const localMaxRow: any = db.prepare('SELECT MAX(id) as max_id FROM products').get();
      const localMax = Number(localMaxRow?.max_id || 0);
      let remoteMax = 0;
      try {
        const isOnline = await checkRemoteConnection(1500);
        if (isOnline) {
          const pool = getRemotePool();
          const [maxRows]: any = await pool.query('SELECT MAX(CAST(id AS UNSIGNED)) as max_id FROM novafreshmart_products');
          remoteMax = Number(maxRows?.[0]?.max_id || 0);
        }
      } catch (_) {}

      safeNextId = Math.max(localMax, remoteMax) + 1;
    } catch (_) {}

    db.transaction(() => {
      if (safeNextId && safeNextId > 0) {
        const insertProductWithId = db.prepare('INSERT INTO products (id, name, price, cost_price, stock, barcode, item_code, low_stock_alert, category_id, brand_id, supplier_id, has_variants, requires_batch, image_data, size, color, expiry_date, branch_id, wholesale_price, unit, is_scale_item, plu, allow_price_override, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)');
        insertProductWithId.run(safeNextId, product.name, product.price, product.cost_price, product.stock, barcode || null, itemCode || null, lowStockAlert, product.category_id || 1, product.brand_id || null, product.supplier_id || null, product.has_variants ? 1 : 0, product.requires_batch ? 1 : 0, product.image_data || null, product.size || null, product.color || null, product.expiry_date || null, product.branch_id || 'ALL', product.wholesale_price || 0, safeUnit, product.is_scale_item ? 1 : 0, product.plu || null, allowOverride);
        productId = safeNextId;
        try {
          db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('products', ?) ON CONFLICT(name) DO UPDATE SET seq = MAX(seq, excluded.seq)").run(safeNextId);
        } catch (_) {}
      } else {
        const insertProduct = db.prepare('INSERT INTO products (name, price, cost_price, stock, barcode, item_code, low_stock_alert, category_id, brand_id, supplier_id, has_variants, requires_batch, image_data, size, color, expiry_date, branch_id, wholesale_price, unit, is_scale_item, plu, allow_price_override, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)');
        const info = insertProduct.run(product.name, product.price, product.cost_price, product.stock, barcode || null, itemCode || null, lowStockAlert, product.category_id || 1, product.brand_id || null, product.supplier_id || null, product.has_variants ? 1 : 0, product.requires_batch ? 1 : 0, product.image_data || null, product.size || null, product.color || null, product.expiry_date || null, product.branch_id || 'ALL', product.wholesale_price || 0, safeUnit, product.is_scale_item ? 1 : 0, product.plu || null, allowOverride);
        productId = info.lastInsertRowid;
      }
      
      // Post-insert generation using the new row ID if they were empty
      if (!barcode || !itemCode) {
        if (!barcode) barcode = String(1000000 + productId);
        if (!itemCode) itemCode = 'ITEM-' + String(productId).padStart(5, '0');
        db.prepare('UPDATE products SET barcode = ?, item_code = ? WHERE id = ?').run(barcode, itemCode, productId);
      }

      if (product.stock > 0) {
        db.prepare('INSERT INTO inventory_ledger (product_id, transaction_type, qty_change, balance_after, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(productId, 'ADJUSTMENT', product.stock, product.stock, 'Opening Stock', 'System');
      }
    })();

    // Synchronize to remote MariaDB and wait so cloud has it immediately
    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query(`
          INSERT INTO novafreshmart_products (id, branch_id, barcode, name, category, category_id, price, wholesale_price, cost_price, stock, unit, is_scale_item, plu, allow_price_override, expiry_date, is_active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
          ON DUPLICATE KEY UPDATE
            branch_id = VALUES(branch_id),
            barcode = VALUES(barcode),
            name = VALUES(name),
            category = VALUES(category),
            category_id = VALUES(category_id),
            price = VALUES(price),
            wholesale_price = VALUES(wholesale_price),
            cost_price = VALUES(cost_price),
            stock = VALUES(stock),
            unit = VALUES(unit),
            is_scale_item = VALUES(is_scale_item),
            plu = VALUES(plu),
            allow_price_override = VALUES(allow_price_override),
            expiry_date = VALUES(expiry_date),
            is_active = 1,
            updated_at = NOW()
        `, [
          String(productId),
          product.branch_id || 'ALL',
          barcode || '',
          product.name,
          catName,
          String(product.category_id || 1),
          product.price,
          product.wholesale_price || 0,
          product.cost_price || 0,
          product.stock || 0,
          safeUnit,
          product.is_scale_item ? 1 : 0,
          product.plu || null,
          allowOverride,
          product.expiry_date || null
        ]);

        if (product.stock > 0) {
          await pool.query(`
            INSERT INTO novafreshmart_inventory_ledger 
              (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
            VALUES (?, 'ADJUSTMENT', NULL, ?, ?, ?, 'Opening Stock', 'System', NOW())
          `, [String(productId), product.stock, product.stock, product.cost_price || 0]).catch(() => {});
        }

        // Only mark synced=1 AFTER confirmed remote write
        db.prepare('UPDATE products SET synced = 1 WHERE id = ?').run(productId);
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      } else {
        // Offline: keep synced=0 so next sync cycle pushes it
        console.warn('[add-product] Offline - product queued for next sync cycle, id:', productId);
      }
    } catch (e: any) {
      console.warn('[add-product] Remote push error, product will retry on next sync:', e.message);
      // Do NOT mark synced=1 on failure - leave synced=0 so pushUnsyncedData retries it
    }

    broadcastCatalogUpdated();
    setTimeout(() => runFullSync(db), 100);
    return productId;
  })


  ipcMain.handle('hold-bill', (_, data) => {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS held_bills (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cart_data TEXT,
          customer_id INTEGER,
          customer_name TEXT,
          items_json TEXT,
          total REAL DEFAULT 0,
          customer_data TEXT,
          branch_id TEXT DEFAULT 'BR-MAIN',
          terminal_id TEXT DEFAULT 'TERM-01',
          bill_reference TEXT,
          order_type TEXT DEFAULT 'retail',
          table_no TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      try { db.exec('ALTER TABLE held_bills ADD COLUMN cart_data TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN customer_id INTEGER;'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN customer_name TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN items_json TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN total REAL DEFAULT 0;'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN customer_data TEXT;'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN branch_id TEXT DEFAULT "BR-MAIN";'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN terminal_id TEXT DEFAULT "TERM-01";'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN order_type TEXT DEFAULT "retail";'); } catch (_) {}
      try { db.exec('ALTER TABLE held_bills ADD COLUMN bill_reference TEXT;'); } catch (_) {}

      const config = getTerminalConfig(db);
      const items = data.items || [];
      const itemsJson = JSON.stringify(items);
      const customerId = data.customerId || null;
      const customerName = data.customerName || 'Walk-in';
      const total = items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
      const customerData = JSON.stringify({ id: customerId, name: customerName });
      const billRef = `HOLD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      // Check if id column is INTEGER or TEXT
      const tableCols: any[] = db.prepare("PRAGMA table_info(held_bills)").all();
      const idCol = tableCols.find((c: any) => c.name === 'id');
      const isIntegerPk = idCol && idCol.type && idCol.type.toUpperCase().includes('INT');

      if (isIntegerPk) {
        const stmt = db.prepare(`
          INSERT INTO held_bills (
            cart_data, customer_id, customer_name, items_json, total, customer_data, branch_id, terminal_id, bill_reference, order_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(itemsJson, customerId, customerName, itemsJson, total, customerData, config.current_branch_id || 'BR-MAIN', config.current_terminal_id || 'TERM-01', billRef, data.orderType || 'retail');
      } else {
        const stmt = db.prepare(`
          INSERT INTO held_bills (
            id, cart_data, customer_id, customer_name, items_json, total, customer_data, branch_id, terminal_id, bill_reference, order_type
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(billRef, itemsJson, customerId, customerName, itemsJson, total, customerData, config.current_branch_id || 'BR-MAIN', config.current_terminal_id || 'TERM-01', billRef, data.orderType || 'retail');
      }
    } catch (err: any) {
      console.error('[hold-bill error]:', err);
      throw err;
    }
  })

  ipcMain.handle('get-held-bills', () => {
    try {
      const rows = db.prepare('SELECT rowid as fallback_id, * FROM held_bills ORDER BY created_at DESC').all();
      return rows.map((r: any) => {
        let items: any[] = [];
        try {
          const raw = r.cart_data || r.items_json;
          items = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
        } catch (_) {
          items = [];
        }
        let custName = r.customer_name;
        if (!custName && r.customer_data) {
          try { custName = JSON.parse(r.customer_data)?.name || 'Walk-in'; } catch (_) { custName = 'Walk-in'; }
        }
        const effectiveId = r.bill_reference || r.id || r.fallback_id;
        return {
          ...r,
          id: effectiveId,
          cart_data: JSON.stringify(items),
          items_json: JSON.stringify(items),
          customer_name: custName || 'Walk-in',
          total: Number(r.total || items.reduce((sum: number, it: any) => sum + (Number(it.price || 0) * Number(it.quantity || 1)), 0))
        };
      });
    } catch (err) {
      console.error('[get-held-bills error]:', err);
      return [];
    }
  })

  ipcMain.handle('delete-held-bill', (_, id) => {
    try {
      if (id === undefined || id === null) return { changes: 0 };
      const num = Number(id);
      const str = String(id);
      let res;
      if (!isNaN(num)) {
        res = db.prepare('DELETE FROM held_bills WHERE id = ? OR id = ? OR rowid = ? OR bill_reference = ?').run(num, str, num, str);
      } else {
        res = db.prepare('DELETE FROM held_bills WHERE id = ? OR bill_reference = ?').run(str, str);
      }
      return res;
    } catch (err) {
      console.error('[delete-held-bill error]:', err);
      return { changes: 0 };
    }
  })

  ipcMain.handle('clear-all-held-bills', () => {
    try {
      return db.prepare('DELETE FROM held_bills').run();
    } catch (err) {
      console.error('[clear-all-held-bills error]:', err);
      return { changes: 0 };
    }
  })



ipcMain.handle('get-active-session', (_, customTerminalId) => {
  const config = getTerminalConfig(db);
  const terminalId = customTerminalId || config.current_terminal_id || 'TERM-01';
  let sess: any = db.prepare("SELECT * FROM sessions WHERE (status = 'OPEN' OR status = 'open') AND terminal_id = ? ORDER BY id DESC LIMIT 1").get(terminalId);
  if (!sess) {
    // If no session found for this specific terminal_id, check for any open session on this local database
    sess = db.prepare("SELECT * FROM sessions WHERE (status = 'OPEN' OR status = 'open') ORDER BY id DESC LIMIT 1").get();
    if (sess && !sess.terminal_id) {
      db.prepare("UPDATE sessions SET terminal_id = ? WHERE id = ?").run(terminalId, sess.id);
      sess.terminal_id = terminalId;
    }
  }
  return sess || null;
})

ipcMain.handle('get-all-sessions', async (_, filter?: { startDate?: string; endDate?: string; terminalId?: string; limit?: number }) => {
  const limit = filter?.limit || 250;
  try {
    const isOnline = await checkRemoteConnection();
    if (isOnline) {
      try {
        const pool = getRemotePool();
        let remoteSql = "SELECT * FROM novafreshmart_terminal_shifts WHERE 1=1";
        const rParams: any[] = [];
        if (filter?.terminalId && filter.terminalId !== 'ALL') {
          remoteSql += " AND (terminal_id = ? OR terminal_id LIKE ?)";
          rParams.push(filter.terminalId, `%${filter.terminalId}%`);
        }
        if (filter?.startDate) {
          remoteSql += " AND opened_at >= ?";
          rParams.push(filter.startDate + ' 00:00:00');
        }
        if (filter?.endDate) {
          remoteSql += " AND opened_at <= ?";
          rParams.push(filter.endDate + ' 23:59:59');
        }
        remoteSql += " ORDER BY opened_at DESC LIMIT " + limit;

        const [remoteShifts]: any = await pool.query(remoteSql, rParams);
        if (Array.isArray(remoteShifts) && remoteShifts.length > 0) {
          let localSql = "SELECT * FROM sessions WHERE 1=1";
          const lParams: any[] = [];
          if (filter?.terminalId && filter.terminalId !== 'ALL') {
            localSql += " AND (terminal_id = ? OR terminal_id LIKE ?)";
            lParams.push(filter.terminalId, `%${filter.terminalId}%`);
          }
          if (filter?.startDate) {
            localSql += " AND opened_at >= ?";
            lParams.push(filter.startDate + ' 00:00:00');
          }
          if (filter?.endDate) {
            localSql += " AND opened_at <= ?";
            lParams.push(filter.endDate + ' 23:59:59');
          }
          localSql += " ORDER BY id DESC LIMIT " + limit;

          const localSessions = db.prepare(localSql).all(...lParams) as any[];
          const remoteIds = new Set(remoteShifts.map((r: any) => r.id));
          const result = remoteShifts.map((r: any) => ({
            ...r,
            actual_cash: r.actual_cash != null ? Number(r.actual_cash) : (r.closing_cash != null ? Number(r.closing_cash) : null),
            closing_cash: r.closing_cash != null ? Number(r.closing_cash) : (r.actual_cash != null ? Number(r.actual_cash) : null)
          }));
          for (const ls of localSessions) {
            if (!remoteIds.has(ls.remote_id) && !remoteIds.has(ls.id)) {
              result.push({
                ...ls,
                actual_cash: ls.actual_cash != null ? Number(ls.actual_cash) : (ls.closing_cash != null ? Number(ls.closing_cash) : null),
                closing_cash: ls.closing_cash != null ? Number(ls.closing_cash) : (ls.actual_cash != null ? Number(ls.actual_cash) : null)
              });
            }
          }
          return result;
        }
      } catch (e) {
        console.warn('Failed to fetch remote shifts for get-all-sessions:', e);
      }
    }
  } catch (_) {}

  let fallbackSql = "SELECT * FROM sessions WHERE 1=1";
  const fParams: any[] = [];
  if (filter?.terminalId && filter.terminalId !== 'ALL') {
    fallbackSql += " AND (terminal_id = ? OR terminal_id LIKE ?)";
    fParams.push(filter.terminalId, `%${filter.terminalId}%`);
  }
  if (filter?.startDate) {
    fallbackSql += " AND opened_at >= ?";
    fParams.push(filter.startDate + ' 00:00:00');
  }
  if (filter?.endDate) {
    fallbackSql += " AND opened_at <= ?";
    fParams.push(filter.endDate + ' 23:59:59');
  }
  fallbackSql += " ORDER BY id DESC LIMIT " + limit;
  const localRows = db.prepare(fallbackSql).all(...fParams) as any[];
  return localRows.map((ls: any) => ({
    ...ls,
    actual_cash: ls.actual_cash != null ? Number(ls.actual_cash) : (ls.closing_cash != null ? Number(ls.closing_cash) : null),
    closing_cash: ls.closing_cash != null ? Number(ls.closing_cash) : (ls.actual_cash != null ? Number(ls.actual_cash) : null)
  }));
})

ipcMain.handle('delete-session', async (_, id) => {
  const sess = db.prepare('SELECT remote_id FROM sessions WHERE id = ?').get(id) as any;
  db.transaction(() => {
    db.prepare('DELETE FROM session_transactions WHERE session_id = ?').run(id);
    db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  })();
  const remoteId = sess?.remote_id || `SH-BR-MAIN-TERM-01-${id}`;
  try {
    const pool = getRemotePool();
    await pool.query('DELETE FROM novafreshmart_terminal_shifts WHERE id = ?', [remoteId]);
    await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['sessions', remoteId]);
  } catch (e) {}
  return { success: true };
})

ipcMain.handle('open-session', async (_, payload) => {
  const openingCash = typeof payload === 'object' ? payload.openingCash : payload;
  const username = typeof payload === 'object' ? payload.username : null;
  const config = getTerminalConfig(db);
  const branchId = config.current_branch_id || 'BR-MAIN';
  const terminalId = (typeof payload === 'object' && payload.terminalId) || config.current_terminal_id || 'TERM-01';
  const nowStr = getSriLankaNowString();

  // Cleanly close any old orphan sessions on this terminal so a fresh day session can always open
  db.prepare(`
    UPDATE sessions 
    SET status = 'CLOSED', closed_at = COALESCE(closed_at, ?), synced = 0 
    WHERE terminal_id = ? AND (status = 'OPEN' OR status = 'open')
  `).run(nowStr, terminalId);

  try {
    const isOnline = await checkRemoteConnection();
    if (isOnline) {
      const pool = getRemotePool();
      await pool.query(`
        UPDATE novafreshmart_terminal_shifts 
        SET status = 'closed', closed_at = COALESCE(closed_at, ?) 
        WHERE terminal_id = ? AND (status = 'open' OR status = 'OPEN')
      `, [nowStr, terminalId]);
    }
  } catch (_) {}

  const stmt = db.prepare("INSERT INTO sessions (opening_cash, branch_id, terminal_id, username, status, synced, opened_at) VALUES (?, ?, ?, ?, 'OPEN', 0, ?)");
  const res = stmt.run(Number(openingCash || 0), branchId, terminalId, username || 'Cashier', nowStr);
  setTimeout(() => runFullSync(db), 500);
  return { success: true, id: res.lastInsertRowid };
});

ipcMain.handle('close-session', async (_, { sessionId, actualCash, expectedCash, totalSales, cashSales, cardSales, otherSales, totalRefunds, cashIn, cashOut }: any = {}) => {
  const actual = Number(actualCash || 0);
  const expected = Number(expectedCash || 0);
  const discrepancy = actual - expected;
  const config = getTerminalConfig(db);
  const terminalId = config.current_terminal_id || 'TERM-01';
  const closedAt = getSriLankaNowString();

  const stmt = db.prepare(`
    UPDATE sessions 
    SET status = 'CLOSED', closed_at = ?, actual_cash = ?, expected_cash = ?,
        total_sales = ?, cash_sales = ?, card_sales = ?, other_sales = ?,
        total_refunds = ?, cash_in = ?, cash_out = ?, discrepancy = ?, synced = 0
    WHERE id = ? OR (terminal_id = ? AND (status = 'OPEN' OR status = 'open'))
  `);
  const res = stmt.run(
    closedAt,
    actual,
    expected,
    Number(totalSales || 0),
    Number(cashSales || 0),
    Number(cardSales || 0),
    Number(otherSales || 0),
    Number(totalRefunds || 0),
    Number(cashIn || 0),
    Number(cashOut || 0),
    discrepancy,
    sessionId,
    terminalId
  );

  // Immediately close this terminal's open shifts in remote MariaDB as well
  try {
    const isOnline = await checkRemoteConnection();
    if (isOnline) {
      const pool = getRemotePool();
      await pool.query(`
        UPDATE novafreshmart_terminal_shifts
        SET status = 'closed', closed_at = ?,
            closing_cash = ?, expected_cash = ?, cash_sales = ?,
            card_sales = ?, other_sales = ?, total_sales = ?,
            cash_in = ?, cash_out = ?, discrepancy = ?
        WHERE terminal_id = ? AND (status = 'open' OR status = 'OPEN')
      `, [
        closedAt,
        actual, expected, Number(cashSales || 0),
        Number(cardSales || 0), Number(otherSales || 0), Number(totalSales || 0),
        Number(cashIn || 0), Number(cashOut || 0), discrepancy,
        terminalId
      ]);
    }
  } catch (err) {
    console.warn('[close-session] Could not update remote shift immediately:', err);
  }

  setTimeout(() => runFullSync(db), 500);
  setTimeout(async () => {
    try {
      await performLocalSnapshot({ label: 'ShiftEnd_Auto', notes: 'Automated shift-end snapshot' });
    } catch(e) {
      console.warn('Shift end auto-backup error:', e);
    }
  }, 1500);
  return { success: true, sessionId };
});

ipcMain.handle('force-reset-terminal-session', async (_, customTerminalId) => {
  const config = getTerminalConfig(db);
  const terminalId = customTerminalId || config.current_terminal_id || 'TERM-01';
  db.prepare(`
    UPDATE sessions 
    SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP, synced = 0 
    WHERE terminal_id = ? AND (status = 'OPEN' OR status = 'open')
  `).run(terminalId);

  try {
    const isOnline = await checkRemoteConnection();
    if (isOnline) {
      const pool = getRemotePool();
      await pool.query(`
        UPDATE novafreshmart_terminal_shifts 
        SET status = 'closed', closed_at = CURRENT_TIMESTAMP 
        WHERE terminal_id = ? AND (status = 'open' OR status = 'OPEN')
      `, [terminalId]);
    }
  } catch (_) {}

  setTimeout(() => runFullSync(db), 500);
  return { success: true };
});

ipcMain.handle('get-session-details', async (_, sessionId) => {
  let session: any = db.prepare('SELECT * FROM sessions WHERE id = ? OR remote_id = ?').get(sessionId, sessionId);
  let transactions: any[] = [];
  let invoices: any[] = [];

  if (session) {
    const shiftId = session.remote_id || session.id;
    transactions = db.prepare(`
      SELECT * FROM session_transactions 
      WHERE session_id = ? OR shift_id = ? OR (shift_id IS NOT NULL AND session_id = ?)
         OR (terminal_id = ? AND created_at >= ? AND (created_at <= ? OR ? IS NULL))
      ORDER BY created_at ASC, id ASC
    `).all(session.id, shiftId, sessionId, session.terminal_id, session.opened_at, session.closed_at, session.closed_at);
    invoices = db.prepare('SELECT * FROM invoices WHERE session_id = ? ORDER BY id ASC').all(session.id);

    // If no direct session_id match (e.g. from cloud pull or legacy records), look up by shift time window & terminal
    if (invoices.length === 0 && session.opened_at) {
      try {
        invoices = db.prepare(`
          SELECT * FROM invoices 
          WHERE (terminal_id = ? OR ? IS NULL)
            AND created_at >= ?
            AND (created_at <= ? OR ? IS NULL)
          ORDER BY id ASC
        `).all(session.terminal_id, session.terminal_id, session.opened_at, session.closed_at, session.closed_at);

        if (invoices.length > 0) {
          db.prepare(`
            UPDATE invoices SET session_id = ? 
            WHERE (terminal_id = ? OR ? IS NULL)
              AND created_at >= ?
              AND (created_at <= ? OR ? IS NULL)
          `).run(session.id, session.terminal_id, session.terminal_id, session.opened_at, session.closed_at, session.closed_at);
        }
      } catch (_) {}
    }
  }

  // If session, invoices, or transactions not found locally, query remote MariaDB
  if (!session || invoices.length === 0 || transactions.length === 0) {
    try {
      const isOnline = await checkRemoteConnection(1500);
      if (isOnline) {
        const pool = getRemotePool();
        if (!session) {
          const [remoteShifts]: any = await pool.query(
            "SELECT * FROM novafreshmart_terminal_shifts WHERE id = ? OR id LIKE ? LIMIT 1",
            [sessionId, `%-${sessionId}`]
          );
          if (Array.isArray(remoteShifts) && remoteShifts.length > 0) {
            session = remoteShifts[0];
          }
        }

        if (session) {
          session = {
            ...session,
            actual_cash: session.actual_cash != null ? Number(session.actual_cash) : (session.closing_cash != null ? Number(session.closing_cash) : null),
            closing_cash: session.closing_cash != null ? Number(session.closing_cash) : (session.actual_cash != null ? Number(session.actual_cash) : null)
          };
        }

        if (session && invoices.length === 0) {
          const shiftId = session.remote_id || session.id;
          const [remoteSales]: any = await pool.query(
            "SELECT * FROM novafreshmart_sales WHERE shift_id = ? OR (terminal_id = ? AND created_at >= ? AND (created_at <= ? OR ? IS NULL)) ORDER BY created_at ASC",
            [shiftId, session.terminal_id, session.opened_at, session.closed_at, session.closed_at]
          );
          if (Array.isArray(remoteSales) && remoteSales.length > 0) {
            invoices = remoteSales.map((s: any) => ({
              id: s.id,
              invoice_no: s.invoice_no,
              invoice_number: s.invoice_no,
              total: Number(s.total || 0),
              subtotal: Number(s.subtotal || 0),
              discount: Number(s.discount || 0),
              payment_method: s.payment_method || 'CASH',
              cash_paid: Number(s.cash_paid || (s.payment_method === 'CASH' ? s.total : 0)),
              card_paid: Number(s.card_paid || (s.payment_method === 'CARD' ? s.total : 0)),
              other_paid: Number(s.other_paid || 0),
              balance_due: Number(s.balance_due || 0),
              change_returned: Number(s.change_returned || 0),
              created_at: s.created_at,
              cashier: s.cashier || session.username || 'Cashier',
              status: s.status || 'PAID',
              sale_type: s.sale_type || 'NORMAL',
              items: s.items_json || '[]'
            }));
          }
        }

        if (session && transactions.length === 0) {
          const shiftId = session.remote_id || session.id;
          const [remoteTxs]: any = await pool.query(
            "SELECT * FROM novafreshmart_session_transactions WHERE shift_id = ? OR shift_id LIKE ? OR session_id = ? OR (terminal_id = ? AND created_at >= ? AND (created_at <= ? OR ? IS NULL)) ORDER BY created_at ASC",
            [shiftId, `%-${sessionId}`, sessionId, session.terminal_id, session.opened_at, session.closed_at, session.closed_at]
          );
          if (Array.isArray(remoteTxs) && remoteTxs.length > 0) {
            transactions = remoteTxs.map((t: any) => ({
              id: t.id,
              session_id: session.id,
              shift_id: t.shift_id,
              terminal_id: t.terminal_id,
              type: t.type,
              amount: Number(t.amount || 0),
              notes: t.notes,
              created_at: t.created_at
            }));
          }
        }
      }
    } catch (e: any) {
      console.warn('[get-session-details] remote fetch error:', e.message);
    }
  }

  if (!session) return null;
  return { session, transactions, invoices };
});

ipcMain.handle('audit-shift-actual-cash', async (_, { sessionId, shiftId, actualCash, notes, auditedBy = 'Admin' }: any) => {
  const actual = Number(actualCash || 0);
  const targetId = shiftId || sessionId;
  console.log(`[audit-shift-actual-cash] Auditing shift ${targetId} with actual cash Rs. ${actual}`);

  // 1. Fetch current session data from local SQLite
  let sess: any = db.prepare('SELECT * FROM sessions WHERE id = ? OR remote_id = ?').get(sessionId, targetId);

  // If not in local SQLite, try to find in MariaDB
  let remoteShift: any = null;
  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline) {
      const pool = getRemotePool();
      const [rows]: any = await pool.query(
        'SELECT * FROM novafreshmart_terminal_shifts WHERE id = ? OR id LIKE ? LIMIT 1',
        [targetId, `%-${sessionId}`]
      );
      if (Array.isArray(rows) && rows.length > 0) {
        remoteShift = rows[0];
      }
    }
  } catch (err: any) {
    console.warn('[audit-shift-actual-cash] Error querying remote shift:', err.message);
  }

  const openingCash = Number(sess?.opening_cash || remoteShift?.opening_cash || 0);
  const cashSales = Number(sess?.cash_sales || remoteShift?.cash_sales || 0);
  const cashIn = Number(sess?.cash_in || remoteShift?.cash_in || 0);
  const cashOut = Number(sess?.cash_out || remoteShift?.cash_out || 0);
  const totalRefunds = Number(sess?.total_refunds || remoteShift?.total_refunds || 0);

  // Expected Cash = Opening Balance + Cash Sales + Cash In - Cash Out - Refunds
  const expectedCash = openingCash + cashSales + cashIn - cashOut - totalRefunds;
  const discrepancy = actual - expectedCash;
  const auditNote = `Audited by ${auditedBy}${notes ? ': ' + notes : ''}`;

  // 2. Update local SQLite if session exists
  if (sess) {
    db.prepare(`
      UPDATE sessions SET
        actual_cash = ?,
        closing_cash = ?,
        expected_cash = ?,
        discrepancy = ?,
        notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || ' | ' || ? END,
        synced = 0
      WHERE id = ?
    `).run(actual, actual, expectedCash, discrepancy, auditNote, auditNote, sess.id);
  }

  // 3. Update remote MariaDB
  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline) {
      const pool = getRemotePool();
      await pool.query(`
        UPDATE novafreshmart_terminal_shifts SET
          closing_cash = ?,
          expected_cash = ?,
          discrepancy = ?,
          notes = CONCAT(COALESCE(notes, ''), ' | ', ?),
          synced_at = CURRENT_TIMESTAMP
        WHERE id = ? OR id LIKE ?
      `, [actual, expectedCash, discrepancy, auditNote, targetId, `%-${sessionId}`]);

      // Also log audit activity
      const branchId = sess?.branch_id || remoteShift?.branch_id || 'BR-MAIN';
      const terminalId = sess?.terminal_id || remoteShift?.terminal_id || 'TERM-01';
      await pool.query(`
        INSERT INTO novafreshmart_terminal_logs (branch_id, terminal_id, username, action_type, details)
        VALUES (?, ?, ?, 'SHIFT_AUDIT', ?)
      `, [branchId, terminalId, auditedBy, `Shift #${targetId} actual cash counted as Rs. ${actual.toFixed(2)}, variance: Rs. ${discrepancy.toFixed(2)} (${auditNote})`]);
    }
  } catch (err: any) {
    console.warn('[audit-shift-actual-cash] Error updating remote shift:', err.message);
  }

  return {
    success: true,
    actual_cash: actual,
    expected_cash: expectedCash,
    discrepancy,
    notes: auditNote
  };
});

let lastCheckoutSignature = '';
let lastCheckoutTime = 0;
let lastCheckoutInvoiceId = 0;

ipcMain.handle('checkout', async (_, { 
  items, total, subtotal: passedSubtotal, discount = 0, method, sessionId, customerId, saleType, parentInvoiceId, markRefundedId, claimedPoints,
  orderType = 'takeaway', tableNo = null, customerName = null, customerPhone = null, pricingType = 'retail',
  cashPaid = 0, cardPaid = 0, otherPaid = 0, balanceDue = 0, changeReturned = 0, cashier = 'Cashier'
}: any) => {
  const cartItems = Array.isArray(items) ? items : [];
  if (!cartItems || cartItems.length === 0) {
    throw new Error('Cannot complete checkout: Cart is empty.');
  }

  if (!saleType) {
    const allNeg = cartItems.length > 0 && cartItems.every((i: any) => Number(i.quantity || 0) < 0);
    const someNeg = cartItems.some((i: any) => Number(i.quantity || 0) < 0);
    saleType = allNeg ? 'REFUND' : (someNeg ? 'EXCHANGE' : 'SALE');
  }

  // Calculate items subtotal and total discount to prevent 0-total bugs
  let calculatedSubtotal = 0;
  let itemsDiscount = 0;
  for (const it of cartItems) {
    const p = Number(it.price || 0);
    const q = Number(it.quantity || 1);
    calculatedSubtotal += p * q;
    itemsDiscount += Number(it.discount || 0);
  }
  const totalDiscount = Number(discount || 0) + itemsDiscount;

  let finalSubtotal = Number(passedSubtotal != null && Number(passedSubtotal) > 0 ? passedSubtotal : calculatedSubtotal);
  let finalTotal = Number(total);

  // Safeguard: If finalTotal is 0 but items have positive sum, correct finalTotal
  if ((!finalTotal || finalTotal === 0 || isNaN(finalTotal)) && calculatedSubtotal > 0 && String(saleType).toUpperCase() !== 'REFUND') {
    finalTotal = Math.max(0, calculatedSubtotal - totalDiscount);
    if (finalTotal === 0 && calculatedSubtotal > 0 && totalDiscount < calculatedSubtotal) {
      finalTotal = calculatedSubtotal;
    }
    console.log(`[checkout] Auto-corrected total from 0 to ${finalTotal} (items subtotal: ${calculatedSubtotal})`);
  } else if (String(saleType).toUpperCase() === 'REFUND' && calculatedSubtotal < 0 && (!finalTotal || finalTotal === 0)) {
    finalTotal = calculatedSubtotal;
  }
  if (!finalSubtotal || finalSubtotal === 0 || isNaN(finalSubtotal)) {
    finalSubtotal = calculatedSubtotal !== 0 ? calculatedSubtotal : finalTotal;
  }

  const config = getTerminalConfig(db);
  const branchId = config.current_branch_id || 'BR-MAIN';
  const terminalId = config.current_terminal_id || 'TERM-01';

  // STRICT SESSION ENFORCEMENT: Terminal must have an open cash register session
  let activeSession: any = null;
  if (sessionId) {
    activeSession = db.prepare("SELECT * FROM sessions WHERE id = ? AND (status = 'OPEN' OR status = 'open') AND terminal_id = ?").get(sessionId, terminalId);
  }
  if (!activeSession) {
    activeSession = db.prepare("SELECT * FROM sessions WHERE terminal_id = ? AND (status = 'OPEN' OR status = 'open') ORDER BY id DESC LIMIT 1").get(terminalId);
  }
  if (!activeSession) {
    throw new Error(`Billing is blocked: No active cash register session is OPEN for this terminal (${terminalId}). Please open a session before billing.`);
  }
  const resolvedSessionId = activeSession.id;

  // Deduplicate rapid accidental double-submissions (e.g. double click or rapid F10 keypress)
  const cartSig = `${resolvedSessionId}_${cartItems.map((i: any) => `${i.id || i.name}:${i.quantity}:${i.price}`).join('|')}_${method}_${finalTotal}`;
  const nowMs = Date.now();
  if (cartSig === lastCheckoutSignature && (nowMs - lastCheckoutTime) < 2500 && lastCheckoutInvoiceId > 0) {
    console.warn(`[checkout] Blocked rapid duplicate checkout (${nowMs - lastCheckoutTime}ms gap). Returning existing invoice #${lastCheckoutInvoiceId}`);
    return lastCheckoutInvoiceId;
  }

  const deductProductStmt = db.prepare('UPDATE products SET stock = stock - @quantity WHERE id = @id');
  const deductVariantStmt = db.prepare('UPDATE product_variants SET stock = stock - @quantity WHERE id = @variantId');
  const nowStr = getSriLankaNowString();
  const invoiceStmt = db.prepare(`
    INSERT INTO invoices (
      session_id, total, subtotal, discount, items, payment_method, customer_id, customer_name, customer_phone, sale_type, parent_invoice_id,
      branch_id, terminal_id, order_type, table_no, pricing_type,
      cash_paid, card_paid, other_paid, balance_due, change_returned, cashier, synced, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const ledgerStmt = db.prepare('INSERT INTO inventory_ledger (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  let invoiceId = 0;
  
  const cPaid = Number(cashPaid || (method === 'Cash' ? finalTotal : 0));
  const cdPaid = Number(cardPaid || (method === 'Card' ? finalTotal : 0));
  const oPaid = Number(otherPaid || (method !== 'Cash' && method !== 'Card' ? finalTotal : 0));

  const transaction = db.transaction((cartItemsToSave) => {
    const info = invoiceStmt.run(
      resolvedSessionId, finalTotal, finalSubtotal, totalDiscount, JSON.stringify(cartItemsToSave), method,
      customerId || null, customerName || null, customerPhone || null, saleType, parentInvoiceId || null,
      branchId, terminalId, orderType, tableNo, pricingType,
      cPaid,
      cdPaid,
      oPaid,
      Number(balanceDue || 0),
      Number(changeReturned || 0),
      cashier,
      nowStr
    );
    invoiceId = info.lastInsertRowid;
    lastCheckoutSignature = cartSig;
    lastCheckoutTime = Date.now();
    lastCheckoutInvoiceId = invoiceId;
    try {
      db.prepare('UPDATE invoices SET invoice_no = ? WHERE id = ?').run(`INV-${invoiceId}`, invoiceId);
    } catch (_) {}

    // Update active session sales totals in local SQLite so terminal immediately reflects live sales
    if (resolvedSessionId) {
      try {
        const isRef = (Number(finalTotal || 0) < 0) || String(saleType).toUpperCase() === 'REFUND';
        const returnItemsSum = cartItemsToSave.filter((i: any) => Number(i.quantity || 0) < 0 || i.is_return)
          .reduce((sum: number, it: any) => sum + Math.abs(Number(it.price || 0) * Number(it.quantity || 0)), 0);
        const refAmt = (isRef ? Math.abs(Number(finalTotal || 0)) : 0) + returnItemsSum;

        db.prepare(`
          UPDATE sessions 
          SET total_sales = COALESCE(total_sales, 0) + ?,
              cash_sales = COALESCE(cash_sales, 0) + ?,
              card_sales = COALESCE(card_sales, 0) + ?,
              other_sales = COALESCE(other_sales, 0) + ?,
              total_refunds = COALESCE(total_refunds, 0) + ?,
              expected_cash = COALESCE(expected_cash, opening_cash) + ?,
              synced = 0
          WHERE id = ?
        `).run(Number(finalTotal || 0), cPaid, cdPaid, oPaid, refAmt, cPaid, resolvedSessionId);
      } catch (err) {
        console.warn('Could not update session sales in checkout:', err);
      }
    }
    
    if (markRefundedId) {
      db.prepare('UPDATE invoices SET is_refunded = 1 WHERE id = ?').run(markRefundedId);
    }
    
    // Credit Sale Processing
    if (method === 'Credit' && customerId && finalTotal > 0) {
      const acct = db.prepare('SELECT id FROM credit_accounts WHERE customer_id = ?').get(customerId) as any;
      if (acct) {
        db.prepare('UPDATE credit_accounts SET balance = balance + ? WHERE id = ?').run(finalTotal, acct.id);
        db.prepare('INSERT INTO credit_transactions (account_id, type, amount, reference_id, notes) VALUES (?, ?, ?, ?, ?)').run(acct.id, 'CHARGE', finalTotal, invoiceId, 'Credit Sale INV-'+invoiceId);
      } else {
        const newAcct = db.prepare('INSERT INTO credit_accounts (customer_id, balance, credit_limit) VALUES (?, ?, 0)').run(customerId, finalTotal);
        db.prepare('INSERT INTO credit_transactions (account_id, type, amount, reference_id, notes) VALUES (?, ?, ?, ?, ?)').run(newAcct.lastInsertRowid, 'CHARGE', finalTotal, invoiceId, 'Credit Sale INV-'+invoiceId);
      }
    }
    // Handle Credit Refund
    if (method === 'Credit' && customerId && finalTotal < 0) {
      const acct = db.prepare('SELECT id FROM credit_accounts WHERE customer_id = ?').get(customerId) as any;
      if (acct) {
        db.prepare('UPDATE credit_accounts SET balance = balance + ? WHERE id = ?').run(finalTotal, acct.id);
        db.prepare('INSERT INTO credit_transactions (account_id, type, amount, reference_id, notes) VALUES (?, ?, ?, ?, ?)').run(acct.id, 'REFUND', Math.abs(finalTotal), invoiceId, 'Credit Refund REF-'+invoiceId);
      }
    }

    // Loyalty Points (Configurable Points per Rs. 100 spent & Points Redemption)
    if (customerId) {
      try {
        const settings = db.prepare("SELECT * FROM settings").all().reduce((acc: any, s: any) => { 
          try { acc[s.key] = JSON.parse(s.value); } catch(e) { acc[s.key] = s.value; }
          return acc; 
        }, {});

        const loyaltyEnabled = settings.loyalty_enabled !== false && settings.loyalty_enabled !== 'false';
        if (loyaltyEnabled) {
          const pointsPer100 = Number(settings.loyalty_points_per_100) > 0 ? Number(settings.loyalty_points_per_100) : 1;
          let pointsEarned = 0;
          if (total > 0) {
            pointsEarned = Math.floor((total / 100) * pointsPer100);
          }
          const pointsClaimed = Math.max(0, Number(claimedPoints) || 0);
          const finalPointsChange = pointsEarned - pointsClaimed;

          if (finalPointsChange !== 0) {
            db.prepare('UPDATE customers SET points = MAX(0, points + ?) WHERE id = ?').run(finalPointsChange, customerId);

            // Sync updated points to central MariaDB
            try {
              const updatedCust: any = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
              if (updatedCust) {
                const pool = getRemotePool();
                pool.query(`
                  INSERT INTO novafreshmart_customers (id, branch_id, name, phone, points, credit_balance)
                  VALUES (?, ?, ?, ?, ?, ?)
                  ON DUPLICATE KEY UPDATE points = VALUES(points)
                `, [
                  `CUST-${updatedCust.id}`,
                  branchId,
                  updatedCust.name,
                  updatedCust.phone || '',
                  updatedCust.points || 0,
                  0
                ]).catch(() => {});
              }
            } catch(e) {}
          }
        }
      } catch(err) {
        console.warn('Error updating loyalty points:', err);
      }
    }

    for (const item of cartItems) {
      // Custom/open items: log into custom_bill_items audit trail and skip stock deduction
      if ((item.is_custom || item.id < 0) && !item.is_return && item.quantity > 0) {
        try {
          db.prepare(`
            INSERT INTO custom_bill_items (
              invoice_id, branch_id, terminal_id, cashier, item_name, quantity, unit, unit_price, total_price, notes, synced
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
          `).run(
            invoiceId,
            branchId,
            terminalId,
            cashier,
            item.name,
            Number(item.quantity || 1),
            item.unit || 'pc',
            Number(item.price || 0),
            Number(item.price || 0) * Number(item.quantity || 1),
            item.custom_notes || ''
          );
        } catch (e) {
          console.warn('Error recording custom bill item:', e);
        }
        continue;
      }

      // Catalog products (both normal sales and returned items for refund/exchange)
      if (item.id && item.id > 0) {
        const isReturn = Number(item.quantity || 0) < 0;
        const isDamaged = Boolean(item.is_damaged || item.return_condition === 'damage');
        const isExchange = String(saleType).toUpperCase() === 'EXCHANGE';

        let type = 'SALE';
        let change = -Number(item.quantity || 0);
        let notes = `Invoice #${invoiceId}`;

        if (isReturn) {
          if (isDamaged) {
            type = 'DAMAGE';
            change = 0; // Damaged items are not restored into salable stock
            notes = `Invoice #${invoiceId} (Damaged Return - Not Restocked)`;
            // Do NOT increment stock for damaged goods
          } else {
            type = isExchange ? 'EXCHANGE' : 'REFUND';
            change = Math.abs(Number(item.quantity || 0));
            notes = `Invoice #${invoiceId} (${type} Restocked to Inventory)`;
            if (item.variantId) {
              deductVariantStmt.run({ quantity: item.quantity, variantId: item.variantId });
              deductProductStmt.run({ quantity: item.quantity, id: item.id });
            } else {
              deductProductStmt.run({ quantity: item.quantity, id: item.id });
            }
          }
        } else {
          // Normal sale or exchange new item
          notes = `Invoice #${invoiceId}${isExchange ? ' (Exchange Purchase)' : ''}`;
          if (item.variantId) {
            deductVariantStmt.run({ quantity: item.quantity, variantId: item.variantId });
            deductProductStmt.run({ quantity: item.quantity, id: item.id });
          } else {
            deductProductStmt.run({ quantity: item.quantity, id: item.id });
          }
        }

        const p = db.prepare('SELECT stock, cost_price FROM products WHERE id = ?').get(item.id) as any;
        ledgerStmt.run(item.id, type, invoiceId, change, p?.stock || 0, p?.cost_price || 0, notes, cashier);
      }
    }
  })
  
  transaction(items)

  // Real-time direct push to MariaDB when online
  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline && invoiceId) {
      const pool = getRemotePool();
      const remoteSaleId = `INV-${branchId}-${terminalId}-${invoiceId}`;
      const invoiceNumber = `INV-${invoiceId}`;

      // 1. Insert into novafreshmart_sales
      await pool.query(`
        INSERT INTO novafreshmart_sales (
          id, branch_id, terminal_id, shift_id, invoice_no, cashier, order_type, table_no,
          customer_name, customer_phone, pricing_type, subtotal, discount, tax, total,
          payment_method, cash_paid, card_paid, other_paid, balance_due, change_returned,
          status, created_at, items_json, sale_type, parent_invoice_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE total = VALUES(total), status = 'completed'
      `, [
        remoteSaleId, branchId, terminalId, resolvedSessionId ? String(resolvedSessionId) : null,
        invoiceNumber, cashier, orderType, tableNo,
        customerName || null, customerPhone || null, pricingType,
        finalSubtotal, totalDiscount, finalTotal,
        method, cPaid, cdPaid, oPaid,
        Number(balanceDue || 0), Number(changeReturned || 0),
        nowStr, JSON.stringify(cartItems),
        saleType || 'SALE', parentInvoiceId ? String(parentInvoiceId) : null
      ]);

      // 2. Insert items into novafreshmart_sale_items, update remote products stock, and insert ledger rows
      for (const item of cartItems) {
        if (!item.id || item.id <= 0) continue;
        const rawQty = Number(item.quantity || 1);
        const isReturn = rawQty < 0;
        const isDamaged = Boolean(item.is_damaged || item.return_condition === 'damage');
        const isExchange = String(saleType).toUpperCase() === 'EXCHANGE';

        await pool.query(`
          INSERT INTO novafreshmart_sale_items (
            sale_id, product_id, name, price, quantity, discount, subtotal, unit
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          remoteSaleId,
          String(item.id),
          item.name || 'Item',
          Number(item.price || 0),
          rawQty,
          Number(item.discount || 0),
          Number((item.price || 0) * rawQty),
          item.unit || 'pcs'
        ]).catch(() => {});

        // Stock delta on remote MariaDB products:
        // - Sale (rawQty > 0): stock decreases by rawQty
        // - Return (rawQty < 0 && !isDamaged): stock increases by Math.abs(rawQty)
        // - Damaged return (rawQty < 0 && isDamaged): stock delta is 0 (not restored)
        let stockDelta = 0;
        if (rawQty > 0) {
          stockDelta = rawQty;
        } else if (!isDamaged) {
          stockDelta = rawQty; // subtracting negative adds stock
        }

        if (stockDelta !== 0) {
          await pool.query(`
            UPDATE novafreshmart_products
            SET stock = GREATEST(0, stock - ?), updated_at = NOW()
            WHERE id = ? OR (barcode = ? AND barcode IS NOT NULL AND barcode != '')
          `, [stockDelta, String(item.id), String(item.barcode || '')]).catch(() => {});
        }

        // Ledger row on novafreshmart_inventory_ledger
        const localProd: any = db.prepare('SELECT stock, cost_price FROM products WHERE id = ?').get(item.id);
        const currentBalance = localProd ? Number(localProd.stock || 0) : 0;
        const unitCost = localProd ? Number(localProd.cost_price || 0) : 0;

        let ledgerType = 'SALE';
        let ledgerChange = -rawQty;
        let ledgerNotes = `Invoice #${invoiceId}`;

        if (isReturn) {
          if (isDamaged) {
            ledgerType = 'DAMAGE';
            ledgerChange = 0;
            ledgerNotes = `Invoice #${invoiceId} (Damaged Return - Not Restocked)`;
          } else {
            ledgerType = isExchange ? 'EXCHANGE' : 'REFUND';
            ledgerChange = Math.abs(rawQty);
            ledgerNotes = `Invoice #${invoiceId} (${ledgerType} Restocked to Inventory)`;
          }
        } else if (isExchange) {
          ledgerNotes = `Invoice #${invoiceId} (Exchange Purchase)`;
        }

        await pool.query(`
          INSERT INTO novafreshmart_inventory_ledger 
            (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
          String(item.id),
          ledgerType,
          remoteSaleId,
          ledgerChange,
          currentBalance,
          unitCost,
          ledgerNotes,
          cashier
        ]).catch(() => {});
      }

      // 3. Mark local invoice as synced
      db.prepare('UPDATE invoices SET synced = 1, remote_id = ?, invoice_no = ? WHERE id = ?').run(remoteSaleId, invoiceNumber, invoiceId);

      // 4. Bump catalog_last_updated so all other devices immediately pull live stock
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
    }
  } catch (e: any) {
    console.warn('[checkout] Remote realtime push error (queued for sync):', e.message);
  }

  broadcastCatalogUpdated();

  // Asynchronously trigger sync in background for any other pending queues
  setTimeout(() => {
    runFullSync(db).catch(err => console.warn('Background sync on sale failed:', err.message));
  }, 100);

  return invoiceId
})

// Branch, Terminal & Sync IPC Handlers
ipcMain.handle('get-device-mode', () => {
  try {
    const row = db.prepare("SELECT value FROM terminal_config WHERE key='device_mode'").get() as any;
    return row?.value || 'pos';
  } catch { return 'pos'; }
});

ipcMain.handle('set-device-mode', (_e, mode: string) => {
  db.prepare("INSERT OR REPLACE INTO terminal_config (key, value) VALUES ('device_mode', ?)").run(mode);
  return { success: true };
});

ipcMain.handle('get-server-stats', async () => {
  const os = require('os');
  const isOnline = await checkRemoteConnection();

  // Local DB counts
  const localInvoices   = (db.prepare('SELECT COUNT(*) as c FROM invoices').get() as any)?.c || 0;
  const localProducts   = (db.prepare('SELECT COUNT(*) as c FROM products').get() as any)?.c || 0;
  const localSessions   = (db.prepare('SELECT COUNT(*) as c FROM sessions').get() as any)?.c || 0;
  const localCustomers  = (db.prepare('SELECT COUNT(*) as c FROM customers').get() as any)?.c || 0;
  const localUsers      = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any)?.c || 0;
  const localExpenses   = (db.prepare("SELECT COUNT(*) as c FROM expenses").get() as any)?.c || 0;

  // Unsynced (pending push)
  const pendingInvoices = (db.prepare('SELECT COUNT(*) as c FROM invoices WHERE synced=0').get() as any)?.c || 0;
  const pendingLedger   = (db.prepare('SELECT COUNT(*) as c FROM inventory_ledger WHERE synced=0').get() as any)?.c || 0;
  const pendingSessions = (db.prepare("SELECT COUNT(*) as c FROM sessions WHERE synced=0").get() as any)?.c || 0;
  const totalPending    = pendingInvoices + pendingLedger + pendingSessions;

  // Already synced
  const syncedInvoices  = (db.prepare('SELECT COUNT(*) as c FROM invoices WHERE synced=1').get() as any)?.c || 0;

  // DB file size
  const dbStat = require('fs').existsSync(dbPath) ? require('fs').statSync(dbPath) : { size: 0 };
  const dbSizeMB = (dbStat.size / (1024 * 1024)).toFixed(2);

  // Last sync time from terminal_config
  const lastSyncRow = (db.prepare("SELECT value FROM terminal_config WHERE key='last_sync_time'").get() as any);
  const lastSyncTime = lastSyncRow?.value || null;

  // Backup count
  const backupDir = getBackupDirectory();
  let backupCount = 0;
  let lastBackupTime: string | null = null;
  try {
    const files = require('fs').readdirSync(backupDir).filter((f: string) => f.endsWith('.db'));
    backupCount = files.length;
    if (files.length > 0) {
      const sorted = files.map((f: string) => {
        const fp = require('path').join(backupDir, f);
        return { f, mtime: require('fs').statSync(fp).mtime };
      }).sort((a: any, b: any) => b.mtime - a.mtime);
      lastBackupTime = sorted[0].mtime.toISOString();
    }
  } catch (_) {}

  // Remote counts (if online)
  let remoteInvoices = null, remoteProducts = null, remoteSessions = null;
  if (isOnline) {
    try {
      const pool = getRemotePool();
      const [[ri]]: any = await pool.query('SELECT COUNT(*) as c FROM novafreshmart_sales');
      const [[rp]]: any = await pool.query('SELECT COUNT(*) as c FROM novafreshmart_products WHERE is_active=1');
      const [[rs]]: any = await pool.query('SELECT COUNT(*) as c FROM novafreshmart_sessions');
      remoteInvoices = ri?.c ?? null;
      remoteProducts = rp?.c ?? null;
      remoteSessions = rs?.c ?? null;
    } catch (_) {}
  }

  // System info
  const uptime = os.uptime(); // seconds
  const uptimeH = Math.floor(uptime / 3600);
  const uptimeM = Math.floor((uptime % 3600) / 60);
  const totalRam = os.totalmem();
  const freeRam  = os.freemem();
  const usedRamGB = ((totalRam - freeRam) / (1024**3)).toFixed(1);
  const totalRamGB = (totalRam / (1024**3)).toFixed(1);
  const ramPct = Math.round(((totalRam - freeRam) / totalRam) * 100);

  return {
    isOnline,
    local: { invoices: localInvoices, products: localProducts, sessions: localSessions, customers: localCustomers, users: localUsers, expenses: localExpenses },
    pending: { invoices: pendingInvoices, ledger: pendingLedger, sessions: pendingSessions, total: totalPending },
    synced: { invoices: syncedInvoices },
    remote: { invoices: remoteInvoices, products: remoteProducts, sessions: remoteSessions },
    db: { sizeMB: dbSizeMB, path: dbPath },
    backup: { count: backupCount, lastBackupTime },
    lastSyncTime,
    system: { uptimeH, uptimeM, usedRamGB, totalRamGB, ramPct, hostname: os.hostname(), platform: os.platform() }
  };
});

ipcMain.handle('get-sync-status', async () => {
  const isOnline = await checkRemoteConnection();
  const status = getRemoteStatus();
  const unsyncedCount: any = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE synced = 0').get();
  const config = getTerminalConfig(db);
  return {
    ...status,
    online: isOnline,
    isOnline: isOnline,
    pendingCount: unsyncedCount ? unsyncedCount.cnt : 0,
    config
  };
});

ipcMain.handle('trigger-sync', async () => {
  return await runFullSync(db);
});

ipcMain.handle('get-sync-logs', () => {
  return getRecentSyncLogs();
});

ipcMain.handle('get-terminal-config', () => {
  return getTerminalConfig(db);
});

ipcMain.handle('set-terminal-config', (_, payload: any) => {
  if (payload && payload.key) {
    setTerminalConfig(db, payload.key, payload.value);
  } else if (payload && typeof payload === 'object') {
    for (const [k, v] of Object.entries(payload)) {
      setTerminalConfig(db, k, String(v));
    }
  }
  return getTerminalConfig(db);
});

ipcMain.handle('get-branches', () => {
  return db.prepare('SELECT * FROM branches WHERE is_active = 1 ORDER BY name ASC').all();
});

ipcMain.handle('create-branch', async (_, branch) => {
  return await createBranch(db, branch);
});

ipcMain.handle('get-terminals', async (_, branchId) => {
  // If remote is available, pull fresh terminal telemetry
  try {
    const isOnline = await checkRemoteConnection();
    if (isOnline) {
      const pool = getRemotePool();
      const [remoteTerms]: any = await pool.query(`
        SELECT *, TIMESTAMPDIFF(SECOND, last_active_at, NOW()) as last_seen_sec 
        FROM novafreshmart_terminals
        WHERE (is_active = 1 OR is_active IS NULL)
      `);
      if (Array.isArray(remoteTerms) && remoteTerms.length > 0) {
        let deletedTermIds = new Set<string>();
        try {
          deletedTermIds = new Set(
            db.prepare("SELECT record_id FROM deleted_records_processed WHERE table_name = 'terminals'").all().map((r: any) => String(r.record_id))
          );
        } catch (_) {}

        const config = getTerminalConfig(db);
        const upsertTerm = db.prepare(`
          INSERT INTO terminals (id, branch_id, name, status, last_active)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            branch_id = excluded.branch_id,
            name = excluded.name,
            status = excluded.status,
            last_active = excluded.last_active
        `);
        db.transaction(() => {
          for (const rt of remoteTerms) {
            if (deletedTermIds.has(String(rt.id))) continue;
            const isCurrent = rt.id === config.current_terminal_id;
            const isRecentlyActive = (rt.last_seen_sec != null && rt.last_seen_sec >= -60 && rt.last_seen_sec < 300);
            const dynamicStatus = (isCurrent || isRecentlyActive) ? 'online' : 'offline';
            upsertTerm.run(rt.id, rt.branch_id, rt.name, dynamicStatus, rt.last_active_at ? String(rt.last_active_at) : null);
          }
        })();
      }
    }
  } catch (e) {}

  let deletedTermIds = new Set<string>();
  try {
    deletedTermIds = new Set(
      db.prepare("SELECT record_id FROM deleted_records_processed WHERE table_name = 'terminals'").all().map((r: any) => String(r.record_id))
    );
  } catch (_) {}

  const config = getTerminalConfig(db);
  const rows: any[] = branchId 
    ? db.prepare('SELECT * FROM terminals WHERE branch_id = ?').all(branchId)
    : db.prepare('SELECT * FROM terminals').all();

  return rows
    .filter((t: any) => !deletedTermIds.has(String(t.id)))
    .map((t: any) => {
      const isCurrent = t.id === config.current_terminal_id;
      const isOnline = isCurrent || t.status === 'online';
      return {
        ...t,
        status: isOnline ? 'online' : 'offline',
        is_current: isCurrent,
        last_active: t.last_active
      };
    });
});

ipcMain.handle('create-terminal', async (_, term) => {
  return await createTerminal(db, term);
});

ipcMain.handle('update-terminal', async (_, term) => {
  return await updateTerminal(db, term);
});

ipcMain.handle('delete-terminal', async (_, terminalId) => {
  return await deleteTerminal(db, terminalId);
});

ipcMain.handle('get-backoffice-overview', async () => {
  return await getBackofficeOverview(db);
});

ipcMain.handle('log-terminal-activity', async (_, data) => {
  return await logTerminalActivity(db, data);
});

ipcMain.handle('get-terminal-details', async (_, terminalId) => {
  try {
    const isOnline = await checkRemoteConnection();
    if (isOnline) {
      try {
        const pool = getRemotePool();
        // 1. Terminal metadata
        const [remoteTerms]: any = await pool.query(`
          SELECT t.*, b.name as branch_name 
          FROM novafreshmart_terminals t 
          LEFT JOIN novafreshmart_branches b ON t.branch_id = b.id 
          WHERE t.id = ?
        `, [terminalId]);

        const terminal = (remoteTerms && remoteTerms[0]) || db.prepare(`
          SELECT t.*, b.name as branch_name 
          FROM terminals t 
          LEFT JOIN branches b ON t.branch_id = b.id 
          WHERE t.id = ?
        `).get(terminalId);

        // 2. Active open shift on this terminal from Cloud
        const [remoteActiveShifts]: any = await pool.query(`
          SELECT s.*, b.name as branch_name, t.name as terminal_name
          FROM novafreshmart_terminal_shifts s
          LEFT JOIN novafreshmart_branches b ON s.branch_id = b.id
          LEFT JOIN novafreshmart_terminals t ON s.terminal_id = t.id
          WHERE s.terminal_id = ? AND (s.status = 'open' OR s.status = 'OPEN') AND s.closed_at IS NULL
          ORDER BY s.opened_at DESC LIMIT 1
        `, [terminalId]);

        let activeSession: any = null;
        if (remoteActiveShifts && remoteActiveShifts.length > 0) {
          const rawShift = remoteActiveShifts[0];
          // Real-time sales during this active shift
          const [salesStats]: any = await pool.query(`
            SELECT 
              COUNT(*) as total_bills,
              COALESCE(SUM(total), 0) as gross_sales,
              COALESCE(SUM(cash_paid), 0) as cash_sales,
              COALESCE(SUM(card_paid), 0) as card_sales
            FROM novafreshmart_sales
            WHERE terminal_id = ? 
              AND (shift_id = ? OR (created_at >= ? AND (created_at <= ? OR ? IS NULL)))
          `, [
            terminalId,
            rawShift.id,
            rawShift.opened_at,
            rawShift.closed_at,
            rawShift.closed_at
          ]);

          const ss = (salesStats && salesStats[0]) || {};
          const liveSales = Number(ss.gross_sales || rawShift.total_sales || 0);
          const liveBills = Number(ss.total_bills || 0);
          const liveCash = Number(ss.cash_sales || rawShift.cash_sales || 0);
          const openCash = Number(rawShift.opening_cash || 0);
          const expectedCash = openCash + liveCash + Number(rawShift.cash_in || 0) - Number(rawShift.cash_out || 0);

          activeSession = {
            ...rawShift,
            live_sales: liveSales,
            live_bills: liveBills,
            live_cash: liveCash,
            expected_cash: expectedCash,
            is_online_live: true
          };
        } else {
          // If remote cloud shows NO open shift, ensure local SQLite doesn't keep a ghost session open
          try {
            db.prepare(`
              UPDATE sessions 
              SET status = 'CLOSED', closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP) 
              WHERE terminal_id = ? AND (status = 'OPEN' OR status = 'open')
            `).run(terminalId);
          } catch (_) {}
        }

        // 3. Latest shifts
        const [latestShifts]: any = await pool.query(`
          SELECT s.*, b.name as branch_name, t.name as terminal_name
          FROM novafreshmart_terminal_shifts s
          LEFT JOIN novafreshmart_branches b ON s.branch_id = b.id
          LEFT JOIN novafreshmart_terminals t ON s.terminal_id = t.id
          WHERE s.terminal_id = ?
          ORDER BY s.opened_at DESC LIMIT 20
        `, [terminalId]);

        // 4. Latest invoices
        const [remoteSales]: any = await pool.query(`
          SELECT s.*, b.name as branch_name, t.name as terminal_name
          FROM novafreshmart_sales s
          LEFT JOIN novafreshmart_branches b ON s.branch_id = b.id
          LEFT JOIN novafreshmart_terminals t ON s.terminal_id = t.id
          WHERE s.terminal_id = ?
          ORDER BY s.created_at DESC LIMIT 100
        `, [terminalId]);

        // 5. Total Terminal stats
        const [remoteStats]: any = await pool.query(`
          SELECT 
            COUNT(*) as total_bills,
            COALESCE(SUM(total), 0) as gross_revenue,
            COALESCE(SUM(cash_paid), 0) as cash_revenue,
            COALESCE(SUM(card_paid), 0) as card_revenue
          FROM novafreshmart_sales 
          WHERE terminal_id = ?
        `, [terminalId]);

        return {
          terminal,
          activeSession,
          latestSessions: (latestShifts || []).map((s: any) => {
            const openCash = Number(s.opening_cash || 0);
            const cashSales = Number(s.cash_sales || 0);
            const cashIn = Number(s.cash_in || 0);
            const cashOut = Number(s.cash_out || 0);
            const refunds = Number(s.total_refunds || 0);
            const computedExpected = openCash + cashSales + cashIn - cashOut - refunds;
            const expectedCash = Number(s.expected_cash || 0) > 0 ? Number(s.expected_cash) : computedExpected;
            const rawActual = s.actual_cash != null ? Number(s.actual_cash) : (s.closing_cash != null ? Number(s.closing_cash) : null);
            const isClosed = s.status === 'CLOSED' || s.status === 'closed' || Boolean(s.closed_at);
            const isAudited = Boolean(s.is_audited || (s.notes && s.notes.includes('Audit')));
            const isUncounted = isClosed && (rawActual === null || rawActual === 0) && !isAudited;
            const discrepancy = isUncounted || !isClosed ? 0 : (Number(rawActual || 0) - expectedCash);

            return {
              ...s,
              opening_cash: openCash,
              cash_sales: cashSales,
              card_sales: Number(s.card_sales || 0),
              other_sales: Number(s.other_sales || 0),
              total_sales: Number(s.total_sales || 0),
              cash_in: cashIn,
              cash_out: cashOut,
              total_refunds: refunds,
              expected_cash: expectedCash,
              actual_cash: rawActual,
              closing_cash: rawActual,
              discrepancy,
              is_uncounted: isUncounted,
              is_audited: isAudited
            };
          }),
          invoices: (remoteSales || []).map((s: any) => ({
            ...s,
            items: s.items_json
          })),
          stats: (remoteStats && remoteStats[0]) || {},
          is_cloud_live: true
        };
      } catch (remoteErr: any) {
        console.warn('[get-terminal-details] Remote query error, falling back to local SQLite:', remoteErr?.message);
      }
    }

    // Offline Local SQLite Fallback
    const terminal = db.prepare(`
      SELECT t.*, b.name as branch_name 
      FROM terminals t 
      LEFT JOIN branches b ON t.branch_id = b.id 
      WHERE t.id = ?
    `).get(terminalId);

    const activeSession: any = db.prepare(`
      SELECT s.*, b.name as branch_name, t.name as terminal_name
      FROM sessions s
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN terminals t ON s.terminal_id = t.id
      WHERE s.terminal_id = ? AND (s.status = 'OPEN' OR s.status = 'open') AND s.closed_at IS NULL
      ORDER BY s.id DESC LIMIT 1
    `).get(terminalId);

    const latestSessions = db.prepare(`
      SELECT s.*, b.name as branch_name, t.name as terminal_name
      FROM sessions s
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN terminals t ON s.terminal_id = t.id
      WHERE s.terminal_id = ?
      ORDER BY s.opened_at DESC LIMIT 20
    `).all(terminalId);

    const invoices = db.prepare(`
      SELECT i.*, b.name as branch_name, t.name as terminal_name
      FROM invoices i
      LEFT JOIN branches b ON i.branch_id = b.id
      LEFT JOIN terminals t ON i.terminal_id = t.id
      WHERE i.terminal_id = ?
      ORDER BY i.id DESC LIMIT 100
    `).all(terminalId);

    const stats: any = db.prepare(`
      SELECT 
        COUNT(*) as total_bills,
        COALESCE(SUM(total), 0) as gross_revenue,
        COALESCE(SUM(cash_paid), 0) as cash_revenue,
        COALESCE(SUM(card_paid), 0) as card_revenue
      FROM invoices 
      WHERE terminal_id = ?
    `).get(terminalId);

    let activeSessionSales = 0;
    let activeSessionBills = 0;
    let activeSessionCash = 0;
    if (activeSession) {
      const sessStats: any = db.prepare(`
        SELECT 
          COUNT(*) as cnt, 
          COALESCE(SUM(total), 0) as total_sum,
          COALESCE(SUM(cash_paid), 0) as cash_sum
        FROM invoices 
        WHERE terminal_id = ? 
          AND (session_id = ? OR (session_id IS NULL AND created_at >= ? AND (created_at <= ? OR ? IS NULL)))
      `).get(
        activeSession.terminal_id || terminalId,
        activeSession.id,
        activeSession.opened_at,
        activeSession.closed_at,
        activeSession.closed_at
      );
      if (sessStats) {
        activeSessionBills = sessStats.cnt || 0;
        activeSessionSales = sessStats.total_sum || 0;
        activeSessionCash = sessStats.cash_sum || 0;
      }
    }

    // Fetch cash in/out for this session
    let activeSessionCashIn = 0;
    let activeSessionCashOut = 0;
    if (activeSession) {
      try {
        const txStats2: any = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
            COALESCE(SUM(CASE WHEN type = 'CASH_OUT' OR type = 'EXPENSE' THEN amount ELSE 0 END), 0) as cash_out
          FROM session_transactions WHERE session_id = ?
        `).get(activeSession.id);
        activeSessionCashIn = Number(txStats2?.cash_in || 0);
        activeSessionCashOut = Number(txStats2?.cash_out || 0);
      } catch (_) {}
    }

    const expectedCash = activeSession 
      ? Number(activeSession.opening_cash || 0) + activeSessionCash + activeSessionCashIn - activeSessionCashOut
      : 0;

    return {
      terminal,
      activeSession: activeSession ? { 
        ...activeSession, 
        live_sales: activeSessionSales, 
        live_bills: activeSessionBills,
        live_cash: activeSessionCash,
        cash_in: activeSessionCashIn,
        cash_out: activeSessionCashOut,
        expected_cash: expectedCash,
        is_online_live: false
      } : null,
      latestSessions: (latestSessions || []).map((s: any) => {
        const openCash = Number(s.opening_cash || 0);
        const cashSales = Number(s.cash_sales || 0);
        const cashIn = Number(s.cash_in || 0);
        const cashOut = Number(s.cash_out || 0);
        const refunds = Number(s.total_refunds || 0);
        const computedExpected = openCash + cashSales + cashIn - cashOut - refunds;
        const expectedCash = Number(s.expected_cash || 0) > 0 ? Number(s.expected_cash) : computedExpected;
        const rawActual = s.actual_cash != null ? Number(s.actual_cash) : (s.closing_cash != null ? Number(s.closing_cash) : null);
        const isClosed = s.status === 'CLOSED' || s.status === 'closed' || Boolean(s.closed_at);
        const isAudited = Boolean(s.is_audited || (s.notes && s.notes.includes('Audit')));
        const isUncounted = isClosed && (rawActual === null || rawActual === 0) && !isAudited;
        const discrepancy = isUncounted || !isClosed ? 0 : (Number(rawActual || 0) - expectedCash);

        return {
          ...s,
          opening_cash: openCash,
          cash_sales: cashSales,
          card_sales: Number(s.card_sales || 0),
          other_sales: Number(s.other_sales || 0),
          total_sales: Number(s.total_sales || 0),
          cash_in: cashIn,
          cash_out: cashOut,
          total_refunds: refunds,
          expected_cash: expectedCash,
          actual_cash: rawActual,
          closing_cash: rawActual,
          discrepancy,
          is_uncounted: isUncounted,
          is_audited: isAudited
        };
      }),
      invoices,
      stats,
      is_cloud_live: false
    };
  } catch (err: any) {
    console.error('get-terminal-details error:', err);
    return { error: err.message };
  }
});

ipcMain.handle('get-terminal-invoices', (_, { terminalId, branchId, limit = 100 } = {}) => {
  try {
    let query = `
      SELECT i.*, b.name as branch_name, t.name as terminal_name
      FROM invoices i
      LEFT JOIN branches b ON i.branch_id = b.id
      LEFT JOIN terminals t ON i.terminal_id = t.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (terminalId && terminalId !== 'ALL') {
      conditions.push('i.terminal_id = ?');
      params.push(terminalId);
    }
    if (branchId && branchId !== 'ALL') {
      conditions.push('i.branch_id = ?');
      params.push(branchId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY i.id DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  } catch (err: any) {
    console.error('get-terminal-invoices error:', err);
    return [];
  }
});

// ==========================================
// CASHIER LOCK & SHIFT HANDOVER ENGINE
// ==========================================

ipcMain.handle('verify-pin', (_, { pin, username }: any = {}) => {
  try {
    const p = (pin || '').toString().trim();
    const pNoSpaces = p.replace(/\s+/g, '');
    let user: any = null;

    if (username) {
      const u = (username || '').toString().trim();
      user = db.prepare("SELECT id, username, role, permissions, branch_id FROM users WHERE username = ? COLLATE NOCASE AND (pin = ? OR pin = ? OR replace(pin, ' ', '') = ?)").get(u, pin, p, pNoSpaces);
    } else {
      user = db.prepare("SELECT id, username, role, permissions, branch_id FROM users WHERE pin = ? OR pin = ? OR replace(pin, ' ', '') = ? LIMIT 1").get(pin, p, pNoSpaces);
    }

    if (user) {
      return { success: true, user };
    }
    return { success: false, error: 'Invalid PIN entered.' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('record-shift-handover', async (_, data: any) => {
  try {
    const config = getTerminalConfig(db);
    const branchId = data.branchId || config.current_branch_id || 'BR-MAIN';
    const terminalId = data.terminalId || config.current_terminal_id || 'TERM-01';

    const stmt = db.prepare(`
      INSERT INTO shift_handovers (
        session_id, branch_id, terminal_id, outgoing_cashier, incoming_cashier,
        shift_started_at, handover_time, bills_count, cash_sales, card_sales, other_sales,
        total_sales, opening_float, expected_drawer_cash, counted_cash, cash_variance,
        handover_notes, synced
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    const res = stmt.run(
      data.sessionId,
      branchId,
      terminalId,
      data.outgoingCashier || 'Cashier',
      data.incomingCashier || 'Cashier',
      data.shiftStartedAt || new Date().toISOString(),
      Number(data.billsCount || 0),
      Number(data.cashSales || 0),
      Number(data.cardSales || 0),
      Number(data.otherSales || 0),
      Number(data.totalSales || 0),
      Number(data.openingFloat || 0),
      Number(data.expectedDrawerCash || 0),
      Number(data.countedCash || 0),
      Number(data.cashVariance || 0),
      data.handoverNotes || ''
    );

    // Update active session username to incoming cashier so terminal displays new cashier
    try {
      db.prepare("UPDATE sessions SET username = ?, synced = 0 WHERE id = ?").run(data.incomingCashier, data.sessionId);
    } catch (err) {}

    // Log terminal activity
    logTerminalActivity(db, {
      branchId,
      terminalId,
      cashier: data.outgoingCashier,
      action: 'SHIFT_HANDOVER',
      details: `Shift handover: ${data.outgoingCashier} -> ${data.incomingCashier}. Counted: Rs. ${Number(data.countedCash || 0).toFixed(2)}, Variance: Rs. ${Number(data.cashVariance || 0).toFixed(2)}.`
    }).catch(() => {});

    return { success: true, id: res.lastInsertRowid };
  } catch (err: any) {
    console.error('record-shift-handover error:', err);
    throw err;
  }
});

ipcMain.handle('get-shift-handovers', (_, { terminalId, branchId, sessionId, limit = 50 } = {}) => {
  try {
    let query = `
      SELECT h.*, b.name as branch_name, t.name as terminal_name
      FROM shift_handovers h
      LEFT JOIN branches b ON h.branch_id = b.id
      LEFT JOIN terminals t ON h.terminal_id = t.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (terminalId && terminalId !== 'ALL') {
      conditions.push('h.terminal_id = ?');
      params.push(terminalId);
    }
    if (branchId && branchId !== 'ALL') {
      conditions.push('h.branch_id = ?');
      params.push(branchId);
    }
    if (sessionId) {
      conditions.push('h.session_id = ?');
      params.push(sessionId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY h.id DESC LIMIT ?';
    params.push(limit);

    return db.prepare(query).all(...params);
  } catch (err: any) {
    console.error('get-shift-handovers error:', err);
    return [];
  }
});

ipcMain.handle('get-cashier-shift-summary', (_, { sessionId, cashier, terminalId }: any = {}) => {
  try {
    const session: any = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session) {
      return {
        sessionId,
        cashier,
        shiftStartTime: new Date().toISOString(),
        openingFloat: 0,
        billsCount: 0,
        totalSales: 0,
        cashSales: 0,
        cardSales: 0,
        otherSales: 0,
        expectedDrawerCash: 0
      };
    }

    // Find previous handover in this session where incoming_cashier was this cashier
    const prevHandover: any = db.prepare(`
      SELECT * FROM shift_handovers 
      WHERE session_id = ? AND incoming_cashier = ? 
      ORDER BY id DESC LIMIT 1
    `).get(sessionId, cashier);

    const shiftStartTime = prevHandover ? prevHandover.handover_time : session.opened_at;
    const openingFloat = prevHandover ? Number(prevHandover.counted_cash || 0) : Number(session.opening_cash || 0);

    let invQuery = `
      SELECT 
        COUNT(*) as bills_count,
        COALESCE(SUM(total), 0) as total_sales,
        COALESCE(SUM(CASE 
          WHEN UPPER(payment_method) = 'CASH' THEN total
          WHEN cash_paid > 0 THEN MAX(0, cash_paid - change_returned)
          ELSE 0 
        END), 0) as cash_sales,
        COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'CARD' THEN total ELSE card_paid END), 0) as card_sales,
        COALESCE(SUM(CASE WHEN UPPER(payment_method) NOT IN ('CASH', 'CARD') THEN total ELSE other_paid END), 0) as other_sales,
        COALESCE(SUM(CASE WHEN total < 0 OR sale_type = 'REFUND' THEN ABS(total) ELSE 0 END), 0) as total_refunds,
        COALESCE(SUM(CASE WHEN (total < 0 OR sale_type = 'REFUND') AND UPPER(payment_method) = 'CASH' THEN ABS(total) ELSE 0 END), 0) as cash_refunds
      FROM invoices 
      WHERE session_id = ? AND cashier = ?
    `;
    const params: any[] = [sessionId, cashier];
    if (shiftStartTime && prevHandover) {
      invQuery += ' AND created_at >= ?';
      params.push(shiftStartTime);
    }

    const stats: any = db.prepare(invQuery).get(...params);
    const billsCount = stats?.bills_count || 0;
    const totalSales = Number(stats?.total_sales || 0);
    const totalRefunds = Number(stats?.total_refunds || 0);
    const cashRefunds = Number(stats?.cash_refunds || 0);
    const grossSales = totalSales + totalRefunds;
    const cashSales = Number(stats?.cash_sales || 0);
    const cardSales = Number(stats?.card_sales || 0);
    const otherSales = Number(stats?.other_sales || 0);

    // Fetch cash in and cash out transactions for this session/shift
    let txQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
        COALESCE(SUM(CASE WHEN type = 'CASH_OUT' OR type = 'EXPENSE' THEN amount ELSE 0 END), 0) as cash_out
      FROM session_transactions
      WHERE session_id = ?
    `;
    const txParams: any[] = [sessionId];
    if (shiftStartTime && prevHandover) {
      txQuery += ' AND created_at >= ?';
      txParams.push(shiftStartTime);
    }
    const txStats: any = db.prepare(txQuery).get(...txParams);
    const cashIn = Number(txStats?.cash_in || 0);
    const cashOut = Number(txStats?.cash_out || 0);

    // Opening Balance + Cash Sales + Cash In - Cash Out = Expected Drawer Cash
    const expectedDrawerCash = openingFloat + cashSales + cashIn - cashOut;

    return {
      sessionId,
      cashier,
      shiftStartTime: shiftStartTime || session.opened_at,
      openingFloat,
      billsCount,
      grossSales,
      totalSales,
      totalRefunds,
      cashRefunds,
      cashSales,
      cardSales,
      otherSales,
      cashIn,
      cashOut,
      expectedDrawerCash
    };
  } catch (err: any) {
    console.error('get-cashier-shift-summary error:', err);
    return {
      sessionId,
      cashier,
      shiftStartTime: new Date().toISOString(),
      openingFloat: 0,
      billsCount: 0,
      totalSales: 0,
      cashSales: 0,
      cardSales: 0,
      otherSales: 0,
      cashIn: 0,
      cashOut: 0,
      expectedDrawerCash: 0
    };
  }
});

// ==========================================
// MASTER SERVER & OFFLINE DATA BACKUP ENGINE
// Designed for High-Performance Manager Hub (i5 12th Gen â€¢ 16GB DDR5 â€¢ Dual NVMe)
// ==========================================

function getBackupDirectory(): string {
  try {
    const setting: any = db.prepare("SELECT value FROM settings WHERE key = 'backup_directory'").get();
    if (setting && setting.value && fs.existsSync(setting.value)) {
      return setting.value;
    }
  } catch (e) {}
  const def = join(app.getPath('userData'), 'offline_backups');
  if (!fs.existsSync(def)) fs.mkdirSync(def, { recursive: true });
  return def;
}

async function performLocalSnapshot(options: { label?: string; notes?: string; isSafety?: boolean } = {}) {
  const dir = getBackupDirectory();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const prefix = options.isSafety ? 'Safety_PreRestore' : (options.label ? options.label.replace(/[^a-zA-Z0-9_-]/g, '_') : 'MasterBackup');
  const filename = `NovaFreshMart_${prefix}_${timestamp}.db`;
  const backupFilePath = join(dir, filename);
  
  await db.backup(backupFilePath);
  
  const stats = fs.statSync(backupFilePath);
  const invoicesCount = (db.prepare('SELECT COUNT(*) as cnt FROM invoices').get() as any)?.cnt || 0;
  const productsCount = (db.prepare('SELECT COUNT(*) as cnt FROM products').get() as any)?.cnt || 0;
  const customersCount = (db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as any)?.cnt || 0;
  const sessionsCount = (db.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as any)?.cnt || 0;
  const customItemsCount = (db.prepare('SELECT COUNT(*) as cnt FROM custom_bill_items').get() as any)?.cnt || 0;

  const meta = {
    filename,
    backupFilePath,
    sizeBytes: stats.size,
    sizeMB: (stats.size / (1024 * 1024)).toFixed(2),
    createdAt: now.toISOString(),
    label: options.label || 'Offline Snapshot',
    notes: options.notes || '',
    isSafety: !!options.isSafety,
    counts: {
      invoices: invoicesCount,
      products: productsCount,
      customers: customersCount,
      sessions: sessionsCount,
      customItems: customItemsCount
    },
    systemSpecs: `${os.cpus()?.[0]?.model || 'Intel Core i5 (12th Gen)'} | ${Math.round(os.totalmem() / 1e9)}GB DDR5 | Dual NVMe Architecture`
  };

  fs.writeFileSync(join(dir, `${filename}.meta.json`), JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

ipcMain.handle('get-backup-hub-info', async () => {
  const dir = getBackupDirectory();
  const dbStat = fs.existsSync(dbPath) ? fs.statSync(dbPath) : { size: 0 };
  const invoicesCount = (db.prepare('SELECT COUNT(*) as cnt FROM invoices').get() as any)?.cnt || 0;
  const productsCount = (db.prepare('SELECT COUNT(*) as cnt FROM products').get() as any)?.cnt || 0;
  const customersCount = (db.prepare('SELECT COUNT(*) as cnt FROM customers').get() as any)?.cnt || 0;
  const sessionsCount = (db.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as any)?.cnt || 0;
  const customItemsCount = (db.prepare('SELECT COUNT(*) as cnt FROM custom_bill_items').get() as any)?.cnt || 0;

  return {
    machineName: os.hostname(),
    platform: `${os.platform()} (${os.arch()})`,
    cpuModel: os.cpus()?.[0]?.model || 'Intel 12th Gen Core i5-12400 / Pro',
    totalRamGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
    freeRamGB: (os.freemem() / (1024 * 1024 * 1024)).toFixed(1),
    databasePath: dbPath,
    databaseSizeBytes: dbStat.size,
    databaseSizeMB: (dbStat.size / (1024 * 1024)).toFixed(2),
    backupDirectory: dir,
    counts: {
      invoices: invoicesCount,
      products: productsCount,
      customers: customersCount,
      sessions: sessionsCount,
      customItems: customItemsCount
    }
  };
});

ipcMain.handle('create-local-backup', async (_, options) => {
  return await performLocalSnapshot(options || {});
});

ipcMain.handle('get-local-backups', async () => {
  const dir = getBackupDirectory();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.db'));
  const backups = [];

  for (const f of files) {
    const fullPath = join(dir, f);
    const metaPath = join(dir, `${f}.meta.json`);
    let meta: any = null;
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch (e) {}
    }

    const stat = fs.statSync(fullPath);
    backups.push({
      filename: f,
      fullPath,
      sizeBytes: stat.size,
      sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
      createdAt: meta?.createdAt || stat.mtime.toISOString(),
      label: meta?.label || (f.includes('Safety') ? 'Pre-Restore Safety Snapshot' : (f.includes('ShiftEnd') ? 'Shift-End Auto Snapshot' : 'Manual Master Snapshot')),
      notes: meta?.notes || '',
      isSafety: !!meta?.isSafety || f.includes('Safety'),
      counts: meta?.counts || null,
      systemSpecs: meta?.systemSpecs || ''
    });
  }

  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return backups;
});

ipcMain.handle('restore-local-backup', async (_, backupFilePath) => {
  if (!backupFilePath || !fs.existsSync(backupFilePath)) {
    throw new Error('Backup file not found on disk: ' + backupFilePath);
  }

  // 1. Take safety pre-restore snapshot
  try {
    await performLocalSnapshot({ isSafety: true, label: 'PreRestoreSafety', notes: 'Pre-restore automatic safety checkpoint' });
  } catch (err) {
    console.warn('Pre-restore safety backup notice:', err);
  }

  // 2. Safely close db
  db.close();

  // 3. Overwrite db file with selected backup
  fs.copyFileSync(backupFilePath, dbPath);

  // 4. Re-open db
  db = new Database(dbPath, { verbose: console.log });
  initLocalSchema(db);

  return { success: true, message: 'Database restored successfully from backup file' };
});

ipcMain.handle('delete-local-backup', async (_, backupFilePath) => {
  if (fs.existsSync(backupFilePath)) {
    fs.unlinkSync(backupFilePath);
    const meta = `${backupFilePath}.meta.json`;
    if (fs.existsSync(meta)) fs.unlinkSync(meta);
  }
  return { success: true };
});

// Granular Database Maintenance & Cloud Reset Handlers
ipcMain.handle('get-database-section-counts', () => {
  try {
    const getCount = (tbl: string) => {
      try {
        const r: any = db.prepare(`SELECT COUNT(*) as c FROM ${tbl}`).get();
        return Number(r?.c || 0);
      } catch (_) { return 0; }
    };

    return {
      sales_invoices: getCount('invoices') + getCount('custom_bill_items'),
      sessions_shifts: getCount('sessions') + getCount('shift_handovers'),
      inventory_ledger: getCount('inventory_ledger'),
      customers_credit: getCount('customers') + getCount('credit_transactions'),
      suppliers_purchases: getCount('suppliers') + getCount('purchase_orders') + getCount('grn'),
      vouchers_promotions: getCount('vouchers') + getCount('promotions'),
      products_catalog: getCount('products')
    };
  } catch (err: any) {
    console.error('get-database-section-counts error:', err);
    return {};
  }
});

ipcMain.handle('reset-database-section', async (_, { section, pin, adminUsername, reason }: any = {}) => {
  // Always require PIN for reset authorization
  if (!pin) {
    throw new Error('Admin PIN is required to authorize database reset.');
  }
  const pinStr = String(pin).trim();
  const adminUser = db.prepare("SELECT * FROM users WHERE (UPPER(role) = 'ADMIN' OR UPPER(role) = 'MANAGER') AND (pin = ? OR replace(pin, ' ', '') = ?)").get(pinStr, pinStr.replace(/\s+/g, ''));
  if (!adminUser) {
    throw new Error('Invalid PIN. Database reset authorization rejected. Only valid Admin or Manager PIN is authorized.');
  }

  // 1. Take safety snapshot before wiping
  try {
    await performLocalSnapshot({ isSafety: true, label: `PreReset_${section}`, notes: `Safety snapshot before resetting ${section}` });
  } catch (_) {}

  // 2. Local SQLite Transactional Wipe
  db.transaction(() => {
    switch (section) {
      case 'sales_invoices':
        try { db.prepare('DELETE FROM invoices').run(); } catch (_) {}
        try { db.prepare('DELETE FROM custom_bill_items').run(); } catch (_) {}
        try { db.prepare('DELETE FROM held_bills').run(); } catch (_) {}
        break;

      case 'sessions_shifts':
        try { db.prepare('DELETE FROM sessions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM session_transactions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM shift_handovers').run(); } catch (_) {}
        break;

      case 'inventory_ledger':
        try { db.prepare('DELETE FROM inventory_ledger').run(); } catch (_) {}
        break;

      case 'customers_credit':
        try { db.prepare('DELETE FROM credit_transactions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM credit_accounts').run(); } catch (_) {}
        try { db.prepare('DELETE FROM customers').run(); } catch (_) {}
        break;

      case 'suppliers_purchases':
        try { db.prepare('DELETE FROM grn_items').run(); } catch (_) {}
        try { db.prepare('DELETE FROM grn').run(); } catch (_) {}
        try { db.prepare('DELETE FROM purchase_order_items').run(); } catch (_) {}
        try { db.prepare('DELETE FROM purchase_orders').run(); } catch (_) {}
        try { db.prepare('DELETE FROM supplier_payments').run(); } catch (_) {}
        try { db.prepare('DELETE FROM suppliers').run(); } catch (_) {}
        break;

      case 'vouchers_promotions':
        try { db.prepare('DELETE FROM voucher_restrictions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM vouchers').run(); } catch (_) {}
        try { db.prepare('DELETE FROM promotions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM promotion_items').run(); } catch (_) {}
        break;

      case 'all_transactional':
        try { db.prepare('DELETE FROM invoices').run(); } catch (_) {}
        try { db.prepare('DELETE FROM custom_bill_items').run(); } catch (_) {}
        try { db.prepare('DELETE FROM held_bills').run(); } catch (_) {}
        try { db.prepare('DELETE FROM sessions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM session_transactions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM shift_handovers').run(); } catch (_) {}
        try { db.prepare('DELETE FROM inventory_ledger').run(); } catch (_) {}
        break;

      case 'full_factory_reset':
        try { db.prepare('DELETE FROM invoices').run(); } catch (_) {}
        try { db.prepare('DELETE FROM custom_bill_items').run(); } catch (_) {}
        try { db.prepare('DELETE FROM held_bills').run(); } catch (_) {}
        try { db.prepare('DELETE FROM sessions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM session_transactions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM shift_handovers').run(); } catch (_) {}
        try { db.prepare('DELETE FROM inventory_ledger').run(); } catch (_) {}
        try { db.prepare('DELETE FROM credit_transactions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM credit_accounts').run(); } catch (_) {}
        try { db.prepare('DELETE FROM customers').run(); } catch (_) {}
        try { db.prepare('DELETE FROM grn_items').run(); } catch (_) {}
        try { db.prepare('DELETE FROM grn').run(); } catch (_) {}
        try { db.prepare('DELETE FROM purchase_order_items').run(); } catch (_) {}
        try { db.prepare('DELETE FROM purchase_orders').run(); } catch (_) {}
        try { db.prepare('DELETE FROM supplier_payments').run(); } catch (_) {}
        try { db.prepare('DELETE FROM suppliers').run(); } catch (_) {}
        try { db.prepare('DELETE FROM voucher_restrictions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM vouchers').run(); } catch (_) {}
        try { db.prepare('DELETE FROM promotions').run(); } catch (_) {}
        try { db.prepare('DELETE FROM promotion_items').run(); } catch (_) {}
        break;

      default:
        throw new Error(`Unknown reset section: ${section}`);
    }
  })();

  // 3. Remote MariaDB Simultaneous Wipe & Event Broadcast
  let remoteSuccess = false;
  try {
    const pool = getRemotePool();
    switch (section) {
      case 'sales_invoices':
        try { await pool.query('DELETE FROM novafreshmart_sale_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_sales'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_custom_bill_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_held_bills'); } catch (_) {}
        break;

      case 'sessions_shifts':
        try { await pool.query('DELETE FROM novafreshmart_terminal_shifts'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_shift_handovers'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_terminal_logs'); } catch (_) {}
        break;

      case 'inventory_ledger':
        try { await pool.query('DELETE FROM novafreshmart_inventory_ledger'); } catch (_) {}
        break;

      case 'customers_credit':
        try { await pool.query('DELETE FROM novafreshmart_credit_transactions'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_credit_accounts'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_customers'); } catch (_) {}
        break;

      case 'suppliers_purchases':
        try { await pool.query('DELETE FROM novafreshmart_grn_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_grn'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_purchase_order_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_purchase_orders'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_suppliers'); } catch (_) {}
        break;

      case 'vouchers_promotions':
        try { await pool.query('DELETE FROM novafreshmart_voucher_restrictions'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_vouchers'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_promotion_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_promotions'); } catch (_) {}
        break;

      case 'all_transactional':
        try { await pool.query('DELETE FROM novafreshmart_sale_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_sales'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_custom_bill_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_held_bills'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_terminal_shifts'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_shift_handovers'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_terminal_logs'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_inventory_ledger'); } catch (_) {}
        break;

      case 'full_factory_reset':
        try { await pool.query('DELETE FROM novafreshmart_sale_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_sales'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_custom_bill_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_held_bills'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_terminal_shifts'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_shift_handovers'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_terminal_logs'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_inventory_ledger'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_credit_transactions'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_credit_accounts'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_customers'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_grn_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_grn'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_purchase_order_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_purchase_orders'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_suppliers'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_voucher_restrictions'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_vouchers'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_promotion_items'); } catch (_) {}
        try { await pool.query('DELETE FROM novafreshmart_promotions'); } catch (_) {}
        break;
    }

    // Broadcast reset event so all other devices will wipe their local copy on next sync
    const [evtResult]: any = await pool.query(`
      INSERT INTO novafreshmart_reset_events (section, reset_by, reason)
      VALUES (?, ?, ?)
    `, [section, adminUsername || 'Admin', reason || 'Granular database section reset']);

    if (evtResult?.insertId) {
      db.prepare('INSERT OR IGNORE INTO reset_events_processed (event_id, section) VALUES (?, ?)').run(evtResult.insertId, section);
    }
    remoteSuccess = true;
  } catch (err: any) {
    console.warn('[Database Reset] Remote wipe failed or offline:', err.message);
  }

  // Notify all open renderer windows
  try {
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('database-section-reset', { section });
      w.webContents.send('sync-data-updated');
    });
  } catch (_) {}

  return {
    success: true,
    section,
    remoteSuccess,
    message: remoteSuccess 
      ? `Section '${section}' was wiped locally and from the cloud database. It will not resurrect on any device.`
      : `Section '${section}' was wiped locally. Remote wipe will be re-attempted once connected.`
  };
});

ipcMain.handle('choose-backup-directory', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win || BrowserWindow.getFocusedWindow()!, {
    title: 'Select Backup Storage Location (e.g. Secondary NVMe Drive)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (!res.canceled && res.filePaths?.[0]) {
    const chosen = res.filePaths[0];
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('backup_directory', ?)").run(chosen);
    return chosen;
  }
  return null;
});

ipcMain.handle('choose-backup-file-to-restore', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win || BrowserWindow.getFocusedWindow()!, {
    title: 'Select Backup File to Restore',
    filters: [
      { name: 'Nova POS SQLite Backup (*.db, *.bak)', extensions: ['db', 'bak', 'sqlite'] }
    ],
    properties: ['openFile']
  });
  if (!res.canceled && res.filePaths?.[0]) {
    return res.filePaths[0];
  }
  return null;
});

// ==========================================
// AUTOMATED LOCAL BACKUP ENGINE & SCHEDULER
// ==========================================

let autoBackupTimer: NodeJS.Timeout | null = null;
let nextAutoBackupTime: Date | null = null;

function setupAutoBackupScheduler(dbInstance: any) {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer);
    autoBackupTimer = null;
  }

  try {
    const enabledSetting: any = dbInstance.prepare("SELECT value FROM settings WHERE key = 'auto_backup_enabled'").get();
    const isEnabled = enabledSetting ? enabledSetting.value === '1' : true;

    if (!isEnabled) {
      nextAutoBackupTime = null;
      console.log('Automated local backup scheduler is disabled.');
      return;
    }

    const intervalSetting: any = dbInstance.prepare("SELECT value FROM settings WHERE key = 'auto_backup_interval_minutes'").get();
    const intervalMinutes = intervalSetting ? (parseInt(intervalSetting.value, 10) || 30) : 30;
    const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

    nextAutoBackupTime = new Date(Date.now() + intervalMs);
    console.log(`Auto-backup scheduler active: every ${intervalMinutes} minutes. Next run: ${nextAutoBackupTime.toLocaleTimeString()}`);

    autoBackupTimer = setInterval(async () => {
      try {
        console.log('Running automated background database snapshot...');
        await performLocalSnapshot({
          label: 'ScheduledAuto',
          notes: `Automatic background backup (every ${intervalMinutes} min)`
        });

        const nowIso = new Date().toISOString();
        dbInstance.prepare("INSERT INTO settings (key, value) VALUES ('last_auto_backup_time', ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(nowIso, nowIso);

        nextAutoBackupTime = new Date(Date.now() + intervalMs);
        pruneOldBackups(dbInstance);
      } catch (err) {
        console.warn('Auto-backup execution notice:', err);
      }
    }, intervalMs);
  } catch (err) {
    console.error('Failed to initialize auto-backup scheduler:', err);
  }
}

function pruneOldBackups(dbInstance: any) {
  try {
    const retSetting: any = dbInstance.prepare("SELECT value FROM settings WHERE key = 'auto_backup_retention'").get();
    const maxKeep = retSetting ? (parseInt(retSetting.value, 10) || 30) : 30;

    const dir = getBackupDirectory();
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.db'))
      .map(f => ({
        filename: f,
        filePath: join(dir, f),
        mtime: fs.statSync(join(dir, f)).mtimeMs
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      for (const item of toDelete) {
        try {
          fs.unlinkSync(item.filePath);
          const metaPath = `${item.filePath}.meta.json`;
          if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
          console.log('Pruned oldest auto-backup to preserve storage:', item.filename);
        } catch (e) {}
      }
    }
  } catch (e) {
    console.warn('Prune backups error:', e);
  }
}

ipcMain.handle('get-auto-backup-config', () => {
  try {
    const enabledSetting: any = db.prepare("SELECT value FROM settings WHERE key = 'auto_backup_enabled'").get();
    const intervalSetting: any = db.prepare("SELECT value FROM settings WHERE key = 'auto_backup_interval_minutes'").get();
    const retentionSetting: any = db.prepare("SELECT value FROM settings WHERE key = 'auto_backup_retention'").get();
    const lastTimeSetting: any = db.prepare("SELECT value FROM settings WHERE key = 'last_auto_backup_time'").get();
    const dir = getBackupDirectory();

    return {
      enabled: enabledSetting ? enabledSetting.value === '1' : true,
      intervalMinutes: intervalSetting ? (parseInt(intervalSetting.value, 10) || 30) : 30,
      retention: retentionSetting ? (parseInt(retentionSetting.value, 10) || 30) : 30,
      backupDirectory: dir,
      lastBackupTime: lastTimeSetting ? lastTimeSetting.value : null,
      nextBackupTime: nextAutoBackupTime ? nextAutoBackupTime.toISOString() : null
    };
  } catch (err: any) {
    return {
      enabled: true,
      intervalMinutes: 30,
      retention: 30,
      backupDirectory: getBackupDirectory(),
      lastBackupTime: null,
      nextBackupTime: null
    };
  }
});

ipcMain.handle('set-auto-backup-config', (_, { enabled, intervalMinutes, retention, backupDirectory }: any) => {
  try {
    const enVal = enabled ? '1' : '0';
    db.prepare("INSERT INTO settings (key, value) VALUES ('auto_backup_enabled', ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(enVal, enVal);

    if (intervalMinutes) {
      const intVal = String(intervalMinutes);
      db.prepare("INSERT INTO settings (key, value) VALUES ('auto_backup_interval_minutes', ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(intVal, intVal);
    }

    if (retention) {
      const retVal = String(retention);
      db.prepare("INSERT INTO settings (key, value) VALUES ('auto_backup_retention', ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(retVal, retVal);
    }

    if (backupDirectory && fs.existsSync(backupDirectory)) {
      db.prepare("INSERT INTO settings (key, value) VALUES ('backup_directory', ?) ON CONFLICT(key) DO UPDATE SET value = ?").run(backupDirectory, backupDirectory);
    }

    setupAutoBackupScheduler(db);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

// Self-Service & Admin PIN Management
ipcMain.handle('change-own-pin', async (_, { userId, currentPin, newPin }: any) => {
  try {
    const user: any = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return { success: false, error: 'User not found.' };

    const cPin = (currentPin || '').toString().trim();
    const isDirectMatch = user.pin === cPin || user.pin === currentPin;
    const isNoSpacesMatch = user.pin.replace(/\s+/g, '') === cPin.replace(/\s+/g, '');

    if (!isDirectMatch && !isNoSpacesMatch) {
      return { success: false, error: 'Current PIN is incorrect.' };
    }

    const nPin = (newPin || '').toString().trim();
    if (!nPin || nPin.length < 3) {
      return { success: false, error: 'New PIN must be at least 3 digits or characters.' };
    }

    db.prepare('UPDATE users SET pin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nPin, userId);

    try {
      const pool = getRemotePool();
      // Update by username or id in remote database
      await pool.query(`
        UPDATE novafreshmart_employees 
        SET pin = ?, updated_at = NOW() 
        WHERE username = ? OR id = ?
      `, [nPin, user.username, `EMP-${userId}`]);

      // Also upsert in case the employee record wasn't created on remote yet
      await pool.query(`
        INSERT INTO novafreshmart_employees (id, branch_id, username, pin, role, name, phone, permissions, allowed_terminals, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE pin = VALUES(pin), updated_at = NOW()
      `, [
        `EMP-${userId}`,
        user.branch_id || 'ALL',
        user.username,
        nPin,
        user.role || 'Cashier',
        user.username,
        user.phone || '',
        user.permissions || '[]',
        user.allowed_terminals || 'ALL'
      ]);
    } catch (e) {}

    setTimeout(() => runFullSync(db), 100);
    return { success: true, message: 'Your PIN has been changed successfully!' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('admin-reset-user-pin', async (_, { targetUserId, newPin }: any) => {
  try {
    const nPin = (newPin || '').toString().trim();
    if (!nPin || nPin.length < 3) {
      return { success: false, error: 'New PIN must be at least 3 digits or characters.' };
    }
    const targetUser: any = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
    if (!targetUser) return { success: false, error: 'User not found.' };

    db.prepare('UPDATE users SET pin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nPin, targetUserId);

    try {
      const pool = getRemotePool();
      await pool.query(`
        UPDATE novafreshmart_employees 
        SET pin = ?, updated_at = NOW() 
        WHERE username = ? OR id = ?
      `, [nPin, targetUser.username, `EMP-${targetUserId}`]);

      await pool.query(`
        INSERT INTO novafreshmart_employees (id, branch_id, username, pin, role, name, phone, permissions, allowed_terminals, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE pin = VALUES(pin), updated_at = NOW()
      `, [
        `EMP-${targetUserId}`,
        targetUser.branch_id || 'ALL',
        targetUser.username,
        nPin,
        targetUser.role || 'Cashier',
        targetUser.username,
        targetUser.phone || '',
        targetUser.permissions || '[]',
        targetUser.allowed_terminals || 'ALL'
      ]);
    } catch (e) {}

    setTimeout(() => runFullSync(db), 100);
    return { success: true, message: 'User PIN has been reset successfully.' };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
});


ipcMain.handle('get-custom-bill-items', async () => {
  try {
    // Exclude orphaned custom items whose invoices were deleted and deduplicate identical records
    return db.prepare(`
      SELECT c.* 
      FROM custom_bill_items c
      LEFT JOIN invoices i ON c.invoice_id = i.id
      WHERE c.invoice_id IS NULL OR i.id IS NOT NULL
      GROUP BY c.invoice_id, c.item_name, c.total_price, c.created_at
      ORDER BY c.created_at DESC 
      LIMIT 500
    `).all();
  } catch (e) {
    return [];
  }
});

ipcMain.handle('get-suppliers', async () => {
  try {
    const isOnline = await checkRemoteConnection(1500);
    if (isOnline) {
      const pool = getRemotePool();
      const [remoteSupps]: any = await pool.query('SELECT * FROM novafreshmart_suppliers ORDER BY name ASC');
      if (Array.isArray(remoteSupps) && remoteSupps.length > 0) {
        setTimeout(() => {
          try {
            const insSupp = db.prepare(`
              INSERT INTO suppliers (id, name, contact, contact_person, phone, email, address, opening_balance, current_balance, synced)
              VALUES (@id, @name, @contact, @contact_person, @phone, @email, @address, @opening_balance, @current_balance, 1)
              ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                contact = excluded.contact,
                contact_person = excluded.contact_person,
                phone = excluded.phone,
                email = excluded.email,
                address = excluded.address,
                opening_balance = excluded.opening_balance,
                current_balance = excluded.current_balance,
                synced = 1
            `);
            db.transaction(() => {
              for (const rs of remoteSupps) {
                const numId = Number(rs.id);
                if (!isNaN(numId) && numId > 0) {
                  insSupp.run({
                    id: numId,
                    name: rs.name,
                    contact: rs.phone || rs.contact_person || '',
                    contact_person: rs.contact_person || '',
                    phone: rs.phone || '',
                    email: rs.email || '',
                    address: rs.address || '',
                    opening_balance: Number(rs.opening_balance || 0),
                    current_balance: Number(rs.current_balance || 0)
                  });
                }
              }
            })();
          } catch (_) {}
        }, 10);

        return remoteSupps.map((s: any) => ({
          id: Number(s.id) || s.id,
          name: s.name,
          contact: s.phone || s.contact_person || '',
          contact_person: s.contact_person || '',
          phone: s.phone || '',
          email: s.email || '',
          address: s.address || '',
          opening_balance: Number(s.opening_balance || 0),
          current_balance: Number(s.current_balance || 0)
        }));
      }
    }
  } catch (err: any) {
    console.warn('[get-suppliers] Remote fallback to local:', err.message);
  }
  return db.prepare('SELECT * FROM suppliers').all()
})

ipcMain.handle('add-supplier', async (_, supplier: any = {}) => {
  const name = (supplier.name || '').trim();
  const contact = supplier.contact || supplier.phone || supplier.contact_person || '';
  const contactPerson = supplier.contact_person || supplier.contact || '';
  const phone = supplier.phone || supplier.contact || '';
  const email = supplier.email || '';
  const address = supplier.address || '';
  const openingBalance = Number(supplier.opening_balance) || 0;
  const currentBalance = Number(supplier.current_balance ?? supplier.opening_balance) || 0;

  const stmt = db.prepare(`
    INSERT INTO suppliers (
      name, contact, contact_person, phone, email, address, opening_balance, current_balance, synced
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  const res = stmt.run(name, contact, contactPerson, phone, email, address, openingBalance, currentBalance);
  const suppRemoteId = `SUP-${res.lastInsertRowid}`;

  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline) {
      const pool = getRemotePool();
      await pool.query(`
        INSERT INTO novafreshmart_suppliers 
          (id, name, contact_person, phone, email, address, opening_balance, current_balance, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          contact_person = VALUES(contact_person),
          phone = VALUES(phone),
          email = VALUES(email),
          address = VALUES(address),
          opening_balance = VALUES(opening_balance),
          current_balance = VALUES(current_balance),
          updated_at = NOW()
      `, [suppRemoteId, name, contactPerson, phone, email, address, openingBalance, currentBalance]);
      db.prepare('UPDATE suppliers SET synced = 1, remote_id = ? WHERE id = ?').run(suppRemoteId, res.lastInsertRowid);
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
    }
  } catch (e: any) {
    console.warn('[add-supplier] Remote push error:', e.message);
  }

  broadcastCatalogUpdated();
  setTimeout(() => runFullSync(db), 100);
  return res;
});

ipcMain.handle('update-supplier', async (_, supplier: any = {}) => {
  const id = supplier.id;
  const name = (supplier.name || '').trim();
  const contact = supplier.contact || supplier.phone || supplier.contact_person || '';
  const contactPerson = supplier.contact_person || supplier.contact || '';
  const phone = supplier.phone || supplier.contact || '';
  const email = supplier.email || '';
  const address = supplier.address || '';
  const openingBalance = Number(supplier.opening_balance) || 0;

  const res = db.prepare(`
    UPDATE suppliers SET 
      name = ?, 
      contact = ?, 
      contact_person = ?, 
      phone = ?, 
      email = ?, 
      address = ?, 
      opening_balance = ?, 
      synced = 0 
    WHERE id = ?
  `).run(name, contact, contactPerson, phone, email, address, openingBalance, id);

  const suppRow: any = db.prepare('SELECT remote_id FROM suppliers WHERE id = ?').get(id);
  const suppRemoteId = suppRow?.remote_id || `SUP-${id}`;

  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline) {
      const pool = getRemotePool();
      await pool.query(`
        INSERT INTO novafreshmart_suppliers 
          (id, name, contact_person, phone, email, address, opening_balance, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          contact_person = VALUES(contact_person),
          phone = VALUES(phone),
          email = VALUES(email),
          address = VALUES(address),
          opening_balance = VALUES(opening_balance),
          updated_at = NOW()
      `, [suppRemoteId, name, contactPerson, phone, email, address, openingBalance]);
      db.prepare('UPDATE suppliers SET synced = 1 WHERE id = ?').run(id);
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
    }
  } catch (e: any) {
    console.warn('[update-supplier] Remote push error:', e.message);
  }

  broadcastCatalogUpdated();
  setTimeout(() => runFullSync(db), 100);
  return res;
});

ipcMain.handle('delete-supplier', async (_, id) => {
  const supp = db.prepare('SELECT remote_id FROM suppliers WHERE id = ?').get(id) as any;
  const res = db.transaction(() => {
    db.prepare('DELETE FROM supplier_payments WHERE supplier_id = ?').run(id);
    db.prepare('UPDATE purchase_orders SET supplier_id = NULL WHERE supplier_id = ?').run(id);
    db.prepare('UPDATE products SET supplier_id = NULL WHERE supplier_id = ?').run(id);
    return db.prepare('DELETE FROM suppliers WHERE id = ?').run(id);
  })();
  const remoteId = supp?.remote_id || `SUP-${id}`;
  try {
    const pool = getRemotePool();
    await pool.query('DELETE FROM novafreshmart_suppliers WHERE id = ?', [remoteId]);
    await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['suppliers', remoteId]);
    await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
  } catch (e) {}
  broadcastCatalogUpdated();
  return res;
});

ipcMain.handle('update-po-status', async (_, { id, status, approvedBy, rejectionReason }: any = {}) => {
  let query = 'UPDATE purchase_orders SET status = ?, synced = 0'
  const params: any[] = [status]
  if (approvedBy !== undefined) {
    query += ', approved_by = ?'
    params.push(approvedBy)
  }
  if (rejectionReason !== undefined) {
    query += ', rejection_reason = ?'
    params.push(rejectionReason)
  }
  query += ' WHERE id = ?'
  params.push(id)
  const res = db.prepare(query).run(...params)

  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline) {
      const pool = getRemotePool();
      const poRow: any = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(id);
      const poRemoteId = poRow?.remote_id || `PO-${id}`;
      await pool.query(
        'UPDATE novafreshmart_purchase_orders SET status = ?, approved_by = ?, updated_at = NOW() WHERE id = ?',
        [status, approvedBy || null, poRemoteId]
      );
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      db.prepare('UPDATE purchase_orders SET synced = 1 WHERE id = ?').run(id);
    }
  } catch (e: any) {
    console.warn('[update-po-status] Remote push error:', e.message);
  }

  broadcastCatalogUpdated();
  setTimeout(() => runFullSync(db), 100);
  return res;
})

  ipcMain.handle('get-po-items', async (_, poId) => {
    try {
      const isOnline = await checkRemoteConnection(1500);
      if (isOnline) {
        const pool = getRemotePool();
        const remoteId = String(poId).startsWith('PO-') ? String(poId) : `PO-${poId}`;
        const [remoteItems]: any = await pool.query(`
          SELECT poi.*, p.name, p.unit, p.is_scale_item, p.item_code, p.barcode, p.price, p.wholesale_price
          FROM novafreshmart_purchase_order_items poi
          LEFT JOIN novafreshmart_products p ON p.id = poi.product_id
          WHERE poi.po_id = ? OR poi.po_id = ?
        `, [remoteId, String(poId)]);
        if (Array.isArray(remoteItems) && remoteItems.length > 0) {
          return remoteItems.map((poi: any) => ({
            ...poi,
            qty_ordered: Number(poi.qty_ordered || 0),
            unit_cost: Number(poi.unit_cost || 0),
            price: Number(poi.price || 0),
            wholesale_price: Number(poi.wholesale_price || 0)
          }));
        }
      }
    } catch (err: any) {
      console.warn('[get-po-items] Remote fallback to local:', err.message);
    }
    return db.prepare(`
      SELECT p.name, p.unit, p.is_scale_item, p.item_code, p.barcode, p.price, p.wholesale_price, poi.* 
      FROM purchase_order_items poi 
      LEFT JOIN products p ON p.id = poi.product_id 
      WHERE poi.po_id = ?
    `).all(poId);
  })

  ipcMain.handle('get-inventory-ledger', async (_, productId) => {
    try {
      const isOnline = await checkRemoteConnection(1500);
      if (isOnline) {
        const pool = getRemotePool();
        let sql = `
          SELECT il.*, COALESCE(p.name, il.product_id) as product_name
          FROM novafreshmart_inventory_ledger il
          LEFT JOIN novafreshmart_products p ON p.id = il.product_id OR (p.barcode = il.product_id AND p.barcode != '')
        `;
        const params: any[] = [];
        if (productId) {
          sql += ' WHERE il.product_id = ? OR (p.id = ?)';
          params.push(String(productId), String(productId));
        }
        sql += ' ORDER BY il.id DESC LIMIT 150';
        const [rows]: any = await pool.query(sql, params);
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r: any) => ({
            id: r.id,
            product_id: r.product_id,
            product_name: r.product_name || `Product #${r.product_id}`,
            transaction_type: r.transaction_type,
            reference_id: r.reference_id,
            qty_change: Number(r.qty_change || 0),
            balance_after: Number(r.balance_after || 0),
            unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
            notes: r.notes,
            created_by: r.created_by,
            created_at: r.created_at
          }));
        }
      }
    } catch (err: any) {
      console.warn('[get-inventory-ledger] Remote fetch fallback to local:', err.message);
    }

    if (productId) {
      return db.prepare('SELECT il.*, COALESCE(p.name, il.product_id) as product_name FROM inventory_ledger il LEFT JOIN products p ON p.id = il.product_id WHERE il.product_id = ? ORDER BY il.created_at DESC').all(productId);
    }
    return db.prepare('SELECT il.*, COALESCE(p.name, il.product_id) as product_name FROM inventory_ledger il LEFT JOIN products p ON p.id = il.product_id ORDER BY il.created_at DESC LIMIT 150').all();
  })

  ipcMain.handle('get-inventory-movements', async (_, { startDate, endDate, productId }: any = {}) => {
    try {
      const isOnline = await checkRemoteConnection(1500);
      if (isOnline) {
        const pool = getRemotePool();
        let query = `
          SELECT il.*, p.name as product_name, p.barcode, p.stock as current_stock, p.unit, p.cost_price, p.price, c.name as category_name
          FROM novafreshmart_inventory_ledger il
          LEFT JOIN novafreshmart_products p ON p.id = il.product_id OR (p.barcode = il.product_id AND p.barcode != '')
          LEFT JOIN novafreshmart_categories c ON p.category_id = c.id
        `;
        const params: any[] = [];
        const conditions: string[] = [];
        if (productId) {
          conditions.push('(il.product_id = ? OR p.id = ?)');
          params.push(String(productId), String(productId));
        }
        if (startDate && endDate) {
          conditions.push('il.created_at >= ? AND il.created_at <= ?');
          params.push(startDate, endDate);
        }
        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY il.id DESC LIMIT 500';
        const [rows]: any = await pool.query(query, params);
        if (Array.isArray(rows) && rows.length > 0) {
          return rows.map((r: any) => ({
            id: r.id,
            product_id: r.product_id,
            product_name: r.product_name || `Product #${r.product_id}`,
            barcode: r.barcode || '',
            current_stock: Number(r.current_stock || 0),
            unit: r.unit || 'pc',
            cost_price: Number(r.cost_price || 0),
            price: Number(r.price || 0),
            category_name: r.category_name || 'General',
            transaction_type: r.transaction_type,
            reference_id: r.reference_id,
            qty_change: Number(r.qty_change || 0),
            balance_after: Number(r.balance_after || 0),
            unit_cost: r.unit_cost != null ? Number(r.unit_cost) : null,
            notes: r.notes,
            created_by: r.created_by,
            created_at: r.created_at
          }));
        }
      }
    } catch (e: any) {
      console.warn('[get-inventory-movements] Remote fetch error, fallback to local:', e.message);
    }

    let query = `
      SELECT il.*, p.name as product_name, p.barcode, p.item_code, p.stock as current_stock, p.unit, p.cost_price, p.price, c.name as category_name
      FROM inventory_ledger il
      LEFT JOIN products p ON p.id = il.product_id
      LEFT JOIN categories c ON p.category_id = c.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (productId) {
      conditions.push('il.product_id = ?');
      params.push(productId);
    }
    if (startDate && endDate) {
      const sIso = String(startDate);
      const eIso = String(endDate);
      const sSpace = sIso.replace('T', ' ').replace(/\..+$/, '');
      const eSpace = eIso.replace('T', ' ').replace(/\..+$/, '');
      conditions.push('((il.created_at >= ? AND il.created_at <= ?) OR (il.created_at >= ? AND il.created_at <= ?))');
      params.push(sIso, eIso, sSpace, eSpace);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY il.created_at DESC';

    return db.prepare(query).all(...params);
  })

  ipcMain.handle('delete-ledger', async (_, id) => {
    db.prepare('DELETE FROM inventory_ledger WHERE id = ?').run(id);
    try {
      const pool = getRemotePool();
      await pool.query('DELETE FROM novafreshmart_inventory_ledger WHERE id = ?', [String(id)]);
      await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['inventory_ledger', String(id)]);
    } catch (e) {}
    return { success: true };
  })

  ipcMain.handle('adjust-stock', async (_, { productId, type, qty, reason, user }) => {
    let finalStock = 0;
    const res = db.transaction(() => {
      const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(productId) as any;
      if (!product) throw new Error('Product not found');
      
      finalStock = Number(product.stock || 0) + Number(qty || 0);
      db.prepare('UPDATE products SET stock = ?, synced = 0 WHERE id = ?').run(finalStock, productId);
      
      db.prepare('INSERT INTO inventory_ledger (product_id, transaction_type, qty_change, balance_after, notes, created_by, synced) VALUES (?, ?, ?, ?, ?, ?, 0)').run(productId, type, qty, finalStock, reason, user);
      return { success: true, newStock: finalStock };
    })();

    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query('UPDATE novafreshmart_products SET stock = ?, updated_at = NOW() WHERE id = ?', [finalStock, String(productId)]);
        await pool.query(`
          INSERT INTO novafreshmart_inventory_ledger 
            (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
          VALUES (?, ?, NULL, ?, ?, NULL, ?, ?, NOW())
        `, [String(productId), type, qty, finalStock, reason || null, user || 'System']).catch(() => {});
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
        db.prepare('UPDATE products SET synced = 1 WHERE id = ?').run(productId);
      }
    } catch (e: any) {
      console.warn('[adjust-stock] Remote stock push error:', e.message);
    }

    broadcastCatalogUpdated();
    setTimeout(() => runFullSync(db), 100);
    return res;
  })

  
  ipcMain.handle('get-reorder-suggestions', () => {
    // Basic logic: find products where stock <= low_stock_alert
    const products = db.prepare('SELECT p.*, s.name as supplier_name FROM products p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.stock <= p.low_stock_alert AND p.has_variants = 0').all();
    const variants = db.prepare('SELECT v.*, p.name as product_name, p.low_stock_alert, s.name as supplier_name, p.supplier_id FROM product_variants v JOIN products p ON v.product_id = p.id LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE v.stock <= p.low_stock_alert').all();
    return { products, variants };
  })

  ipcMain.handle('get-pos', async () => {
    try {
      const isOnline = await checkRemoteConnection(1500);
      if (isOnline) {
        const pool = getRemotePool();
        const [remotePOs]: any = await pool.query(`
          SELECT po.*, s.name as supplier_name
          FROM novafreshmart_purchase_orders po
          LEFT JOIN novafreshmart_suppliers s ON s.id = po.supplier_id
          ORDER BY po.created_at DESC LIMIT 100
        `);
        if (Array.isArray(remotePOs) && remotePOs.length > 0) {
          return remotePOs.map((po: any) => ({
            ...po,
            id: Number(String(po.id).replace(/^PO-/, '')) || po.id,
            remote_id: String(po.id),
            total_cost: Number(po.total_cost || 0),
            total_amount: Number(po.total_amount || 0)
          }));
        }
      }
    } catch (err: any) {
      console.warn('[get-pos] Remote fallback to local:', err.message);
    }

    return db.prepare('SELECT po.*, s.name as supplier_name FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id ORDER BY po.id DESC').all();
  })

ipcMain.handle('delete-po', async (_, id) => {
  const po = db.prepare('SELECT remote_id FROM purchase_orders WHERE id = ?').get(id) as any;
  db.transaction(() => {
    db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(id);
    db.prepare('DELETE FROM purchase_orders WHERE id = ?').run(id);
  })();
  const remoteId = po?.remote_id || `PO-${id}`;
  try {
    const pool = getRemotePool();
    await pool.query('DELETE FROM novafreshmart_purchase_order_items WHERE po_id = ?', [remoteId]);
    await pool.query('DELETE FROM novafreshmart_purchase_orders WHERE id = ?', [remoteId]);
    await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['purchase_orders', remoteId]);
  } catch (e) {}
  return { success: true };
})

ipcMain.handle('get-grns', async () => {
  try {
    const isOnline = await checkRemoteConnection(1500);
    if (isOnline) {
      const pool = getRemotePool();
      const [remoteGRNs]: any = await pool.query(`
        SELECT g.*, COALESCE(g.total_amount, g.total_cost, 0) as display_total, s.name as supplier_name
        FROM novafreshmart_grn g
        LEFT JOIN novafreshmart_suppliers s ON s.id = g.supplier_id
        ORDER BY g.received_at DESC LIMIT 100
      `);
      if (Array.isArray(remoteGRNs) && remoteGRNs.length > 0) {
        return remoteGRNs.map((g: any) => ({
          ...g,
          id: Number(String(g.id).replace(/^GRN-/, '')) || g.id,
          remote_id: String(g.id),
          total_cost: Number(g.total_cost || 0),
          total_amount: Number(g.total_amount || g.total_cost || 0),
          display_total: Number(g.display_total || 0),
          received_date: g.received_at,
          created_at: g.received_at
        }));
      }
    }
  } catch (err: any) {
    console.warn('[get-grns] Remote fallback to local:', err.message);
  }

  try {
    return db.prepare('SELECT g.*, COALESCE(g.total_amount, g.total_cost, 0) as display_total, s.name as supplier_name FROM grn g LEFT JOIN suppliers s ON g.supplier_id = s.id ORDER BY g.id DESC').all();
  } catch(e) {
    return db.prepare('SELECT g.*, 0 as display_total FROM grn g ORDER BY g.id DESC').all();
  }
})

ipcMain.handle('delete-grn', async (_, id) => {
  const grn = db.prepare('SELECT remote_id FROM grn WHERE id = ?').get(id) as any;
  db.transaction(() => {
    db.prepare('DELETE FROM grn_items WHERE grn_id = ?').run(id);
    db.prepare('DELETE FROM grn WHERE id = ?').run(id);
  })();
  const remoteId = grn?.remote_id || `GRN-${id}`;
  try {
    const pool = getRemotePool();
    await pool.query('DELETE FROM novafreshmart_grn_items WHERE grn_id = ?', [remoteId]);
    await pool.query('DELETE FROM novafreshmart_grn WHERE id = ?', [remoteId]);
    await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['grn', remoteId]);
  } catch (e) {}
  return { success: true };
})

ipcMain.handle('create-po', async (_, data) => {
  const res = db.transaction(() => {
    const initialStatus = data.status || 'DRAFT';
    const stmt = db.prepare('INSERT INTO purchase_orders (supplier_id, expected_delivery_date, created_by, approved_by, status, synced) VALUES (?, ?, ?, ?, ?, 0)')
    const poRes = stmt.run(data.supplier_id, data.expected_delivery_date, data.created_by, data.approved_by || null, initialStatus)
    const poId = poRes.lastInsertRowid
    
    if (data.items && data.items.length > 0) {
      const itemStmt = db.prepare('INSERT INTO purchase_order_items (po_id, product_id, qty_ordered, unit_cost, synced) VALUES (?, ?, ?, ?, 0)')
      for (const item of data.items) {
        itemStmt.run(poId, item.product_id, item.qty_ordered, item.unit_cost)
      }
    }
    return { id: poId }
  })()

  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline && res?.id) {
      const pool = getRemotePool();
      const poRemoteId = `PO-${res.id}`;
      await pool.query(`
        INSERT INTO novafreshmart_purchase_orders (
          id, supplier_id, status, total_amount, expected_delivery_date, created_by, approved_by, supplier_invoice_no, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE status = VALUES(status), total_amount = VALUES(total_amount), updated_at = NOW()
      `, [
        poRemoteId,
        data.supplier_id ? `SUP-${data.supplier_id}` : null,
        data.status || 'DRAFT',
        Number(data.total_amount || 0),
        data.expected_delivery_date || null,
        data.created_by || 'Admin',
        data.approved_by || null,
        data.supplier_invoice_no || null
      ]);

      if (data.items && data.items.length > 0) {
        await pool.query('DELETE FROM novafreshmart_purchase_order_items WHERE po_id = ?', [poRemoteId]);
        for (const item of data.items) {
          await pool.query(`
            INSERT INTO novafreshmart_purchase_order_items (po_id, product_id, qty_ordered, unit_cost)
            VALUES (?, ?, ?, ?)
          `, [poRemoteId, String(item.product_id), Number(item.qty_ordered || 0), Number(item.unit_cost || 0)]);
        }
      }
      db.prepare('UPDATE purchase_orders SET synced = 1, remote_id = ? WHERE id = ?').run(poRemoteId, res.id);
      db.prepare('UPDATE purchase_order_items SET synced = 1 WHERE po_id = ?').run(res.id);
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
    }
  } catch (e: any) {
    console.warn('[create-po] Remote push error:', e.message);
  }

  broadcastCatalogUpdated();
  setTimeout(() => runFullSync(db), 100);
  return res;
})

ipcMain.handle('get-grn-items', async (_, grnId) => {
  try {
    const isOnline = await checkRemoteConnection(1500);
    if (isOnline) {
      const pool = getRemotePool();
      const remoteId = String(grnId).startsWith('GRN-') ? String(grnId) : `GRN-${grnId}`;
      const [remoteItems]: any = await pool.query(`
        SELECT gi.*, p.name as product_name, p.unit, p.is_scale_item, p.barcode, p.price as sale_price
        FROM novafreshmart_grn_items gi
        LEFT JOIN novafreshmart_products p ON p.id = gi.product_id
        WHERE gi.grn_id = ? OR gi.grn_id = ?
      `, [remoteId, String(grnId)]);
      if (Array.isArray(remoteItems) && remoteItems.length > 0) {
        return remoteItems.map((gi: any) => ({
          ...gi,
          qty_received: Number(gi.qty_received || 0),
          free_qty: Number(gi.free_qty || 0),
          unit_cost: Number(gi.unit_cost || 0),
          effective_cost: Number(gi.effective_cost || gi.unit_cost || 0),
          new_sale_price: Number(gi.new_sale_price || 0),
          new_wholesale_price: Number(gi.new_wholesale_price || 0)
        }));
      }

      // If novafreshmart_grn_items is empty, try items_json from novafreshmart_grn
      const [grnRows]: any = await pool.query('SELECT items_json FROM novafreshmart_grn WHERE id = ? OR id = ?', [remoteId, String(grnId)]);
      if (grnRows && grnRows[0] && grnRows[0].items_json) {
        try {
          const parsed = JSON.parse(grnRows[0].items_json);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed.map((it: any) => ({
              product_id: it.productId || it.product_id,
              product_name: it.productName || it.name || `Product #${it.productId || it.product_id}`,
              qty_received: Number(it.qtyReceived || it.qty_received || 0),
              free_qty: Number(it.freeQty || it.free_qty || 0),
              unit_cost: Number(it.unitCost || it.unit_cost || 0),
              effective_cost: Number(it.effectiveCost || it.effective_cost || it.unitCost || 0),
              new_sale_price: Number(it.newSalePrice || it.new_sale_price || 0),
              new_wholesale_price: Number(it.newWholesalePrice || it.new_wholesale_price || 0)
            }));
          }
        } catch (_) {}
      }
    }
  } catch (e: any) {
    console.warn('[get-grn-items] Remote fallback to local:', e.message);
  }

  try {
    let items = db.prepare(`
      SELECT gi.*, p.name as product_name, p.unit, p.is_scale_item, p.barcode, p.item_code
      FROM grn_items gi
      LEFT JOIN products p ON gi.product_id = p.id
      WHERE gi.grn_id = ?
    `).all(grnId);

    // Fallback: If grn_items is empty but grn has po_id, load from PO items
    if (items.length === 0) {
      const grn: any = db.prepare('SELECT po_id FROM grn WHERE id = ?').get(grnId);
      if (grn && grn.po_id) {
        items = db.prepare(`
          SELECT poi.product_id, poi.qty_ordered as qty_received, 0 as free_qty, poi.unit_cost, poi.unit_cost as effective_cost, 0 as new_sale_price, 0 as new_wholesale_price,
                 p.name as product_name, p.unit, p.is_scale_item, p.barcode, p.item_code
          FROM purchase_order_items poi
          LEFT JOIN products p ON poi.product_id = p.id
          WHERE poi.po_id = ?
        `).all(grn.po_id);
      }
    }
    return items;
  } catch (e) {
    return [];
  }
})

ipcMain.handle('process-grn', async (_, { poId, supplierId, totalCost, items, invoiceNo, receivedBy, approvedBy, status }: any = {}) => {
  const isApproved = status !== 'PENDING_APPROVAL';
  const grnStatus = isApproved ? 'APPROVED' : 'PENDING_APPROVAL';

  const grnId = db.transaction(() => {
    // 1. Create local GRN cache
    const grnRes = db.prepare(`
      INSERT INTO grn (po_id, supplier_id, supplier_invoice_no, total_cost, total_amount, received_by, approved_by, status, items_json, synced) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      poId || null, 
      supplierId || null, 
      invoiceNo || null, 
      totalCost, 
      totalCost, 
      receivedBy || 'Staff', 
      isApproved ? (approvedBy || 'Admin') : null, 
      grnStatus,
      JSON.stringify(items || [])
    )
    const newGrnId = grnRes.lastInsertRowid

    // 2. Insert items and update products if approved
    const updateProduct = db.prepare(`
      UPDATE products SET 
        stock = stock + @totalQty, 
        cost_price = CASE WHEN @unitCost > 0 THEN @unitCost ELSE cost_price END, 
        price = CASE WHEN @newSalePrice > 0 THEN @newSalePrice ELSE price END,
        wholesale_price = CASE WHEN @newWholesalePrice > 0 THEN @newWholesalePrice ELSE wholesale_price END,
        synced = 0
      WHERE id = @productId
    `)
    const updateVariant = db.prepare(`
      UPDATE product_variants SET 
        stock = stock + @totalQty, 
        cost_price = CASE WHEN @unitCost > 0 THEN @unitCost ELSE cost_price END, 
        price = CASE WHEN @newSalePrice > 0 THEN @newSalePrice ELSE price END 
      WHERE id = @variantId
    `)

    for (const item of items) {
      const qtyReceived = Number(item.qtyReceived) || 0
      const freeQty = Number(item.freeQty) || 0
      const totalQty = qtyReceived + freeQty
      const rawCost = Number(item.unitCost) || 0
      const effectiveCost = totalQty > 0 && qtyReceived > 0 
        ? Number(((qtyReceived * rawCost) / totalQty).toFixed(2)) 
        : rawCost
      const costToApply = effectiveCost > 0 ? effectiveCost : rawCost
      const newWholesalePrice = Number(item.newWholesalePrice) || 0

      try {
        db.prepare(`
          INSERT INTO grn_items (grn_id, product_id, variant_id, qty_received, free_qty, unit_cost, effective_cost, new_sale_price, new_wholesale_price, synced)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          newGrnId, item.productId, item.variantId || null, qtyReceived, freeQty, rawCost, effectiveCost, item.newSalePrice, newWholesalePrice
        )
      } catch(e: any) {
        console.error('Failed to insert grn_item:', e?.message || e);
      }
      
      // Increment local inventory if approved
      if (isApproved) {
        if (item.variantId) {
          updateVariant.run({
              totalQty,
              unitCost: costToApply,
              newSalePrice: Number(item.newSalePrice) || 0,
              variantId: item.variantId
          })
          if (item.expiryDate) {
            try { db.prepare('UPDATE product_variants SET expiry_date = ? WHERE id = ?').run(item.expiryDate, item.variantId) } catch(e){}
          }
          try {
            db.prepare('UPDATE products SET stock = stock + ?, synced = 0 WHERE id = ?').run(totalQty, item.productId);
          } catch(e) {}
        } else {
          updateProduct.run({
              totalQty,
              unitCost: costToApply,
              newSalePrice: Number(item.newSalePrice) || 0,
              newWholesalePrice,
              productId: item.productId
          })
          if (item.expiryDate) {
            try { db.prepare('UPDATE products SET expiry_date = ? WHERE id = ?').run(item.expiryDate, item.productId) } catch(e){}
          }
        }

        const afterStock = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.productId) as any
        
        db.prepare('INSERT INTO inventory_ledger (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          item.productId,
          'GRN',
          poId || newGrnId,
          totalQty,
          afterStock?.stock || 0,
          costToApply,
          'GRN received for PO-' + String(poId || 0).padStart(4, '0') + (freeQty > 0 ? ` (+${freeQty} Free Bonus)` : ''),
          approvedBy || 'Admin Manager'
        )
      }
    }

    // 3. Update local PO status if poId exists
    if (poId) {
      const targetPoStatus = isApproved ? 'RECEIVED' : 'PENDING_APPROVAL';
      db.prepare('UPDATE purchase_orders SET status = ?, total_amount = ?, total_cost = ?, synced = 0 WHERE id = ?').run(targetPoStatus, totalCost, totalCost, poId)
    }

    return newGrnId
  })()

  // Real-time direct push to online MariaDB
  const grnRemoteId = `GRN-${grnId}`;
  try {
    const isOnline = await checkRemoteConnection(2500);
    if (isOnline && grnId) {
      const pool = getRemotePool();
      // 1. Push GRN header directly to MariaDB
      await pool.query(`
        INSERT INTO novafreshmart_grn (id, po_id, supplier_id, total_cost, received_at, status, approved_by, supplier_invoice_no, received_by, items_json)
        VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          po_id = VALUES(po_id),
          supplier_id = VALUES(supplier_id),
          total_cost = VALUES(total_cost),
          status = VALUES(status),
          approved_by = VALUES(approved_by),
          supplier_invoice_no = VALUES(supplier_invoice_no),
          received_by = VALUES(received_by),
          items_json = VALUES(items_json)
      `, [
        grnRemoteId,
        poId ? `PO-${poId}` : null,
        supplierId ? `SUP-${supplierId}` : null,
        Number(totalCost || 0),
        grnStatus,
        isApproved ? (approvedBy || 'Admin') : null,
        invoiceNo || null,
        receivedBy || 'Staff',
        JSON.stringify(items || [])
      ]);

      // 2. Push grn items directly to novafreshmart_grn_items
      await pool.query('DELETE FROM novafreshmart_grn_items WHERE grn_id = ?', [grnRemoteId]).catch(() => {});
      for (const item of (items || [])) {
        const qtyReceived = Number(item.qtyReceived) || 0;
        const freeQty = Number(item.freeQty) || 0;
        const totalQty = qtyReceived + freeQty;
        const rawCost = Number(item.unitCost) || 0;
        const effectiveCost = totalQty > 0 && qtyReceived > 0 
          ? Number(((qtyReceived * rawCost) / totalQty).toFixed(2)) 
          : rawCost;
        const costToApply = effectiveCost > 0 ? effectiveCost : rawCost;
        const newSalePrice = Number(item.newSalePrice) || 0;
        const newWholesalePrice = Number(item.newWholesalePrice) || 0;

        await pool.query(`
          INSERT INTO novafreshmart_grn_items (grn_id, product_id, variant_id, qty_received, free_qty, unit_cost, effective_cost, new_sale_price, new_wholesale_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          grnRemoteId,
          String(item.productId),
          item.variantId ? String(item.variantId) : null,
          qtyReceived,
          freeQty,
          rawCost,
          costToApply,
          newSalePrice,
          newWholesalePrice
        ]).catch(() => {});

        // If approved, update stock in novafreshmart_products AND insert into novafreshmart_inventory_ledger
        if (isApproved) {
          const prod: any = db.prepare('SELECT * FROM products WHERE id = ?').get(item.productId);
          const currentStock = prod ? Number(prod.stock || 0) : 0;
          await pool.query(`
            UPDATE novafreshmart_products 
            SET stock = ?, 
                cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
                price = CASE WHEN ? > 0 THEN ? ELSE price END,
                wholesale_price = CASE WHEN ? > 0 THEN ? ELSE wholesale_price END,
                updated_at = NOW()
            WHERE id = ? OR (barcode = ? AND barcode IS NOT NULL AND barcode != '')
          `, [
            currentStock,
            costToApply, costToApply,
            newSalePrice, newSalePrice,
            newWholesalePrice, newWholesalePrice,
            String(item.productId),
            prod?.barcode || ''
          ]).catch(() => {});

          await pool.query(`
            INSERT INTO novafreshmart_inventory_ledger 
              (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
            VALUES (?, 'GRN', ?, ?, ?, ?, ?, ?, NOW())
          `, [
            String(item.productId),
            grnRemoteId,
            totalQty,
            currentStock,
            costToApply,
            'GRN received for PO-' + String(poId || 0).padStart(4, '0') + (freeQty > 0 ? ` (+${freeQty} Free Bonus)` : ''),
            approvedBy || 'Admin Manager'
          ]).catch(() => {});

          try { db.prepare('UPDATE products SET synced = 1 WHERE id = ?').run(item.productId); } catch(_) {}
        }
      }

      // 3. Update PO on MariaDB if linked
      if (poId) {
        const targetPoStatus = isApproved ? 'RECEIVED' : 'PENDING_APPROVAL';
        const poRemoteId = `PO-${poId}`;
        await pool.query(`
          UPDATE novafreshmart_purchase_orders 
          SET status = ?, total_amount = ?, updated_at = NOW() 
          WHERE id = ?
        `, [targetPoStatus, Number(totalCost || 0), poRemoteId]).catch(() => {});
        try { db.prepare('UPDATE purchase_orders SET synced = 1 WHERE id = ?').run(poId); } catch(_) {}
      }

      // 4. Mark local GRN as synced
      try {
        db.prepare('UPDATE grn SET synced = 1, remote_id = ? WHERE id = ?').run(grnRemoteId, grnId);
        db.prepare('UPDATE grn_items SET synced = 1 WHERE grn_id = ?').run(grnId);
      } catch (_) {}

      // 5. Notify all other devices by bumping catalog_last_updated
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      console.log(`[process-grn] Realtime synced GRN #${grnId} (${grnRemoteId}) to MariaDB`);
    }
  } catch (e: any) {
    console.warn('[process-grn] Remote push warning (queued for offline sync):', e.message);
  }

  broadcastCatalogUpdated();
  setTimeout(() => runFullSync(db), 100);
  return grnId;
})

ipcMain.handle('approve-grn', async (_, { grnId, approvedBy }: any = {}) => {
  try {
    let itemsToSync: any[] = [];
    const result = db.transaction(() => {
      const grn: any = db.prepare('SELECT * FROM grn WHERE id = ?').get(grnId);
      if (!grn) throw new Error(`GRN record #${grnId} not found`);
      if (grn.status === 'APPROVED') return { success: true, message: 'Already approved' };

      let items: any[] = db.prepare('SELECT * FROM grn_items WHERE grn_id = ?').all(grnId);

      // Auto-recovery if grn_items was empty
      if (items.length === 0 && grn.po_id) {
        const poItems: any[] = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(grn.po_id);
        for (const pi of poItems) {
          const piQty = Number(pi.qty_ordered) || 0;
          const piCost = Number(pi.unit_cost) || 0;
          db.prepare(`
            INSERT INTO grn_items (grn_id, product_id, variant_id, qty_received, free_qty, unit_cost, effective_cost, new_sale_price, new_wholesale_price, synced)
            VALUES (?, ?, ?, ?, 0, ?, ?, 0, 0, 0)
          `).run(grnId, pi.product_id, pi.variant_id || null, piQty, piCost, piCost);
        }
        items = db.prepare('SELECT * FROM grn_items WHERE grn_id = ?').all(grnId);
      }

      itemsToSync = items;

      for (const item of items) {
        const qtyReceived = Number(item.qty_received) || 0;
        const freeQty = Number(item.free_qty) || 0;
        const totalQty = qtyReceived + freeQty;
        const rawCost = Number(item.unit_cost) || 0;
        const effectiveCost = (totalQty > 0 && qtyReceived > 0)
          ? Number(((qtyReceived * rawCost) / totalQty).toFixed(2))
          : (Number(item.effective_cost) || rawCost);
        const costToApply = effectiveCost > 0 ? effectiveCost : rawCost;
        const salePrice = Number(item.new_sale_price) || 0;
        const wsPrice = Number(item.new_wholesale_price) || 0;

        if (item.variant_id) {
          db.prepare(`
            UPDATE product_variants SET
              stock = stock + ?,
              cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
              price = CASE WHEN ? > 0 THEN ? ELSE price END
            WHERE id = ?
          `).run(totalQty, costToApply, costToApply, salePrice, salePrice, item.variant_id);
          try {
            db.prepare('UPDATE products SET stock = stock + ?, synced = 0 WHERE id = ?').run(totalQty, item.product_id);
          } catch(e) {}
        } else {
          db.prepare(`
            UPDATE products SET
              stock = stock + ?,
              cost_price = CASE WHEN ? > 0 THEN ? ELSE cost_price END,
              price = CASE WHEN ? > 0 THEN ? ELSE price END,
              wholesale_price = CASE WHEN ? > 0 THEN ? ELSE wholesale_price END,
              synced = 0
            WHERE id = ?
          `).run(totalQty, costToApply, costToApply, salePrice, salePrice, wsPrice, wsPrice, item.product_id);
        }

        const afterStock: any = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
        db.prepare('INSERT INTO inventory_ledger (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
          item.product_id, 'GRN', grn.po_id || grnId, totalQty, afterStock?.stock || 0, costToApply, `GRN-${grnId} Approved by ${approvedBy || 'Admin'}${freeQty > 0 ? ` (+${freeQty} Free Bonus)` : ''}`, approvedBy || 'Admin'
        );
      }

      db.prepare('UPDATE grn SET status = "APPROVED", approved_by = ?, synced = 0 WHERE id = ?').run(approvedBy || 'Admin', grnId);
      if (grn.po_id) {
        db.prepare('UPDATE purchase_orders SET status = "RECEIVED", synced = 0 WHERE id = ?').run(grn.po_id);
      }
      return { success: true };
    })();

    // Real-time direct push to online MariaDB
    try {
      const isOnline = await checkRemoteConnection(2500);
      if (isOnline) {
        const pool = getRemotePool();
        const grnRow: any = db.prepare('SELECT * FROM grn WHERE id = ?').get(grnId);
        const grnRemoteId = grnRow?.remote_id || `GRN-${grnId}`;

        // 1. Update products stock and push ledger entries to MariaDB
        for (const item of itemsToSync) {
          const prod: any = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id);
          if (prod) {
            await pool.query(
              `UPDATE novafreshmart_products 
               SET stock=?, cost_price=CASE WHEN ?>0 THEN ? ELSE cost_price END, price=CASE WHEN ?>0 THEN ? ELSE price END, wholesale_price=CASE WHEN ?>0 THEN ? ELSE wholesale_price END, updated_at=NOW() 
               WHERE id=? OR (barcode=? AND barcode IS NOT NULL AND barcode!='')`,
              [prod.stock, prod.cost_price || 0, prod.cost_price || 0, prod.price || 0, prod.price || 0, prod.wholesale_price || 0, prod.wholesale_price || 0, String(prod.id), prod.barcode || '']
            );
            db.prepare('UPDATE products SET synced = 1 WHERE id = ?').run(item.product_id);

            // Real-time write to novafreshmart_inventory_ledger
            const totalQty = (Number(item.qty_received) || 0) + (Number(item.free_qty) || 0);
            const cost = Number(item.effective_cost || item.unit_cost || 0);
            await pool.query(`
              INSERT INTO novafreshmart_inventory_ledger 
                (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
              VALUES (?, 'GRN', ?, ?, ?, ?, ?, ?, NOW())
            `, [
              String(item.product_id),
              grnRemoteId,
              totalQty,
              Number(prod.stock || 0),
              cost,
              `GRN-${grnId} Approved by ${approvedBy || 'Admin'}${item.free_qty > 0 ? ` (+${item.free_qty} Free Bonus)` : ''}`,
              approvedBy || 'Admin'
            ]).catch((e: any) => console.warn('[approve-grn] ledger insert error:', e.message));
          }
        }

        // 2. Update GRN status on MariaDB
        if (grnRow) {
          await pool.query(
            `INSERT INTO novafreshmart_grn (id, po_id, supplier_id, total_cost, received_at, status, approved_by, supplier_invoice_no, received_by, items_json)
             VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = 'APPROVED', approved_by = VALUES(approved_by), total_cost = VALUES(total_cost)`,
            [
              grnRemoteId,
              grnRow.po_id ? `PO-${grnRow.po_id}` : null,
              grnRow.supplier_id ? `SUP-${grnRow.supplier_id}` : null,
              Number(grnRow.total_cost || grnRow.total_amount || 0),
              grnRow.received_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
              approvedBy || 'Admin',
              grnRow.supplier_invoice_no || null,
              grnRow.received_by || null,
              grnRow.items_json || null
            ]
          );
          db.prepare('UPDATE grn SET synced = 1, remote_id = ? WHERE id = ?').run(grnRemoteId, grnId);
        }

        // 3. Update PO on MariaDB
        if (grnRow?.po_id) {
          await pool.query('UPDATE novafreshmart_purchase_orders SET status = "RECEIVED", updated_at = NOW() WHERE id = ?', [`PO-${grnRow.po_id}`]);
          db.prepare('UPDATE purchase_orders SET synced = 1 WHERE id = ?').run(grnRow.po_id);
        }

        // 4. Bump catalog_last_updated so all other terminals pull new stock immediately
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
        console.log(`[approve-grn] Realtime pushed GRN #${grnId} and updated stock/ledger to MariaDB`);
      }
    } catch (e: any) {
      console.warn('[approve-grn] Remote push warning (queued for offline sync):', e.message);
    }

    broadcastCatalogUpdated();
    setTimeout(() => runFullSync(db), 100);
    return result;
  } catch (err: any) {
    console.error('Error in approve-grn:', err);
    return { success: false, error: err?.message || String(err) };
  }
})

ipcMain.handle('reject-grn', async (_, { grnId, rejectionReason, rejectedBy }: any = {}) => {
  db.prepare('UPDATE grn SET status = "REJECTED", rejection_reason = ?, synced = 0 WHERE id = ?').run(rejectionReason || 'Rejected by Admin', grnId);
  try {
    const isOnline = await checkRemoteConnection(2000);
    if (isOnline) {
      const pool = getRemotePool();
      const grnRow: any = db.prepare('SELECT remote_id FROM grn WHERE id = ?').get(grnId);
      const grnRemoteId = grnRow?.remote_id || `GRN-${grnId}`;
      await pool.query('UPDATE novafreshmart_grn SET status = "REJECTED" WHERE id = ?', [grnRemoteId]);
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
      db.prepare('UPDATE grn SET synced = 1 WHERE id = ?').run(grnId);
    }
  } catch (e: any) {
    console.warn('[reject-grn] Remote push error:', e.message);
  }
  broadcastCatalogUpdated();
  setTimeout(() => runFullSync(db), 100);
  return { success: true };
})


  ipcMain.handle('get-promotions-advanced', (_, showAll: boolean = false) => {
    try {
      const query = showAll
        ? "SELECT * FROM promotions WHERE UPPER(COALESCE(status, 'ACTIVE')) != 'DELETED' ORDER BY id DESC"
        : "SELECT * FROM promotions WHERE UPPER(COALESCE(status, 'ACTIVE')) = 'ACTIVE' ORDER BY id DESC";
      const promos = db.prepare(query).all()
      let items: any[] = [];
      try {
        items = db.prepare("SELECT pi.*, COALESCE(p.name, 'Product #' || pi.product_id) as product_name, p.barcode FROM promotion_items pi LEFT JOIN products p ON p.id = pi.product_id").all()
      } catch (err) {
        try {
          items = db.prepare('SELECT * FROM promotion_items').all();
        } catch {
          items = [];
        }
      }
      
      return promos.map((p: any) => ({
        ...p,
        items: items.filter((i: any) => i.promotion_id === p.id)
      }))
    } catch (err) {
      console.error('get-promotions-advanced failed:', err);
      return [];
    }
  })

  ipcMain.handle('add-promotion-advanced', async (_, { name, start_date, end_date, discount_type, discount_value, items }) => {
    try {
      const cleanName = (name || '').trim();
      const cleanType = discount_type === 'FLAT' ? 'FLAT' : 'PERCENT';
      const cleanVal = Number(discount_value) || 0;
      const sDate = start_date || '';
      const eDate = end_date || '';

      const promoId = db.transaction(() => {
        let info;
        try {
          info = db.prepare("INSERT INTO promotions (name, start_date, end_date, discount_type, discount_value, status, type, value, synced) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'LEGACY', 0, 0)").run(cleanName, sDate, eDate, cleanType, cleanVal);
        } catch {
          info = db.prepare("INSERT INTO promotions (name, start_date, end_date, discount_type, discount_value, status, synced) VALUES (?, ?, ?, ?, ?, 'ACTIVE', 0)").run(cleanName, sDate, eDate, cleanType, cleanVal);
        }
        const pId = Number(info.lastInsertRowid);
        
        if (Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            const pIdNum = Number(item.product_id);
            if (!pIdNum) continue;
            let bc = item.barcode || '';
            try {
              const prod: any = db.prepare('SELECT barcode FROM products WHERE id = ?').get(pIdNum);
              if (prod?.barcode) bc = prod.barcode;
            } catch {}
            try {
              db.prepare('INSERT INTO promotion_items (promotion_id, product_id, barcode, required_qty) VALUES (?, ?, ?, ?)').run(pId, pIdNum, bc, Number(item.required_qty) || 1);
            } catch {
              db.prepare('INSERT INTO promotion_items (promotion_id, product_id, required_qty) VALUES (?, ?, ?)').run(pId, pIdNum, Number(item.required_qty) || 1);
            }
          }
        }
        return pId;
      })();

      // Instantly push new promotion to remote cloud so all cashier terminals receive it
      pushUnsyncedData(db).catch(err => console.warn('[Promotion] Background push failed:', err));
      return { success: true, id: promoId };
    } catch (err: any) {
      console.error('[Promotion] Failed to add promotion:', err);
      return { success: false, error: err?.message || String(err) };
    }
  })

  ipcMain.handle('update-promotion-advanced', async (_, { id, name, start_date, end_date, discount_type, discount_value, items }) => {
    try {
      const cleanName = (name || '').trim();
      const cleanType = discount_type === 'FLAT' ? 'FLAT' : 'PERCENT';
      const cleanVal = Number(discount_value) || 0;
      const sDate = start_date || '';
      const eDate = end_date || '';

      db.transaction(() => {
        db.prepare("UPDATE promotions SET name=?, start_date=?, end_date=?, discount_type=?, discount_value=?, status='ACTIVE', synced=0 WHERE id=?").run(cleanName, sDate, eDate, cleanType, cleanVal, id);
        
        db.prepare('DELETE FROM promotion_items WHERE promotion_id = ?').run(id);
        if (Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            const pIdNum = Number(item.product_id);
            if (!pIdNum) continue;
            let bc = item.barcode || '';
            try {
              const prod: any = db.prepare('SELECT barcode FROM products WHERE id = ?').get(pIdNum);
              if (prod?.barcode) bc = prod.barcode;
            } catch {}
            try {
              db.prepare('INSERT INTO promotion_items (promotion_id, product_id, barcode, required_qty) VALUES (?, ?, ?, ?)').run(id, pIdNum, bc, Number(item.required_qty) || 1);
            } catch {
              db.prepare('INSERT INTO promotion_items (promotion_id, product_id, required_qty) VALUES (?, ?, ?)').run(id, pIdNum, Number(item.required_qty) || 1);
            }
          }
        }
      })();

      pushUnsyncedData(db).catch(err => console.warn('[Promotion] Background push failed:', err));
      return { success: true, id };
    } catch (err: any) {
      console.error('[Promotion] Failed to update promotion:', err);
      return { success: false, error: err?.message || String(err) };
    }
  })

  ipcMain.handle('delete-promotion', async (_, id) => {
    const promo: any = db.prepare('SELECT remote_id FROM promotions WHERE id = ?').get(id);
    if (promo?.remote_id) {
      try {
        const isOnline = await checkRemoteConnection();
        if (isOnline) {
          const pool = getRemotePool();
          await pool.query('DELETE FROM novafreshmart_promotion_items WHERE promotion_id = ?', [promo.remote_id]);
          await pool.query("UPDATE novafreshmart_promotions SET status = 'DELETED' WHERE id = ?", [promo.remote_id]);
        }
      } catch (e) {
        console.warn('Failed to delete remote promotion:', e);
      }
    }

    return db.transaction(() => {
      db.prepare('DELETE FROM promotion_items WHERE promotion_id = ?').run(id)
      db.prepare('DELETE FROM promotions WHERE id = ?').run(id)
    })()
  })

  ipcMain.handle('update-promotion-status', async (_, { id, status }: any) => {
    const res = db.prepare('UPDATE promotions SET status = ?, synced = 0 WHERE id = ?').run(status, id);
    pushUnsyncedData(db).catch(err => console.warn('[Promotion] Status push failed:', err));
    return res;
  })

  ipcMain.handle('get-promotions', () => {
    try {
      return db.prepare("SELECT * FROM promotions WHERE status = 'ACTIVE' OR status IS NULL").all()
    } catch {
      return db.prepare('SELECT * FROM promotions').all()
    }
  })

ipcMain.handle('add-promotion', (_, promo) => {
  const stmt = db.prepare('INSERT INTO promotions (name, type, value) VALUES (@name, @type, @value)')
  return stmt.run(promo)
})

  
  ipcMain.handle('add-session-transaction', async (_, { session_id, type, amount, notes, terminal_id, shift_id }: any) => {
    try {
      const numAmount = Number(amount) || 0;
      const cleanType = String(type || 'CASH_IN').toUpperCase();

      // Find the session to know its shift_id and terminal_id
      const sess: any = db.prepare('SELECT id, branch_id, terminal_id, remote_id FROM sessions WHERE id = ? OR remote_id = ?').get(session_id, session_id);
      const resolvedSessionId = sess ? sess.id : session_id;
      const branchRow: any = db.prepare("SELECT value FROM settings WHERE key = 'branch_id'").get();
      const termRow: any = db.prepare("SELECT value FROM settings WHERE key = 'terminal_id'").get();
      const branch = sess?.branch_id || branchRow?.value || 'BR-MAIN';
      const term = terminal_id || sess?.terminal_id || termRow?.value || 'TERM-01';
      const resolvedShiftId = shift_id || sess?.remote_id || `SH-${branch}-${term}-${resolvedSessionId}`;

      const txRemoteId = `STX-${term}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      const res = db.prepare(`
        INSERT INTO session_transactions (session_id, shift_id, terminal_id, type, amount, notes, synced, remote_id)
        VALUES (?, ?, ?, ?, ?, ?, 0, ?)
      `).run(resolvedSessionId, resolvedShiftId, term, cleanType, numAmount, notes || null, txRemoteId);

      // Update cumulative cash_in and cash_out on local session
      if (sess) {
        const stats: any = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
            COALESCE(SUM(CASE WHEN type = 'CASH_OUT' OR type = 'EXPENSE' THEN amount ELSE 0 END), 0) as cash_out
          FROM session_transactions
          WHERE session_id = ? OR shift_id = ?
        `).get(sess.id, resolvedShiftId);

        db.prepare(`
          UPDATE sessions SET cash_in = ?, cash_out = ?, synced = 0 WHERE id = ?
        `).run(Number(stats?.cash_in || 0), Number(stats?.cash_out || 0), sess.id);
      }

      // Try immediate cloud push if online
      try {
        const isOnline = await checkRemoteConnection(1500);
        if (isOnline) {
          const pool = getRemotePool();
          await pool.query(`
            INSERT INTO novafreshmart_session_transactions (id, shift_id, session_id, terminal_id, type, amount, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE type = VALUES(type), amount = VALUES(amount), notes = VALUES(notes)
          `, [txRemoteId, resolvedShiftId, resolvedSessionId, term, cleanType, numAmount, notes || null]);

          // Recalculate and update remote shift cash_in/cash_out
          const [sumRows]: any = await pool.query(`
            SELECT
              COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
              COALESCE(SUM(CASE WHEN type = 'CASH_OUT' OR type = 'EXPENSE' THEN amount ELSE 0 END), 0) as cash_out
            FROM novafreshmart_session_transactions
            WHERE shift_id = ?
          `, [resolvedShiftId]);
          if (Array.isArray(sumRows) && sumRows.length > 0) {
            await pool.query(`
              UPDATE novafreshmart_terminal_shifts
              SET cash_in = ?, cash_out = ?,
                  expected_cash = opening_cash + cash_sales + ? - ?
              WHERE id = ?
            `, [Number(sumRows[0].cash_in), Number(sumRows[0].cash_out), Number(sumRows[0].cash_in), Number(sumRows[0].cash_out), resolvedShiftId]);
          }

          db.prepare('UPDATE session_transactions SET synced = 1 WHERE id = ?').run(res.lastInsertRowid);
        }
      } catch (e: any) {
        console.warn('[add-session-transaction] Remote push deferred to syncService:', e.message);
      }

      // Broadcast update to all open windows
      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) win.webContents.send('sync-data-updated');
      });

      return res;
    } catch (err: any) {
      console.error('[add-session-transaction] Error:', err);
      throw err;
    }
  })
  
  ipcMain.handle('get-supplier-payments', (_, supplier_id) => {
    if (supplier_id) {
      return db.prepare('SELECT sp.*, s.name as supplier_name FROM supplier_payments sp LEFT JOIN suppliers s ON sp.supplier_id = s.id WHERE sp.supplier_id = ? ORDER BY sp.created_at DESC').all(supplier_id);
    }
    return db.prepare('SELECT sp.*, s.name as supplier_name FROM supplier_payments sp LEFT JOIN suppliers s ON sp.supplier_id = s.id ORDER BY sp.created_at DESC').all();
  })
  ipcMain.handle('add-supplier-payment', (_, { supplier_id, method, amount, reference_no, cheque_date }) => {
    const status = method === 'CHEQUE' ? 'PENDING' : 'CLEARED';
    return db.prepare('INSERT INTO supplier_payments (supplier_id, method, amount, reference_no, cheque_date, status) VALUES (?, ?, ?, ?, ?, ?)').run(supplier_id, method, amount, reference_no || null, cheque_date || null, status)
  })
  ipcMain.handle('update-cheque-status', (_, { payment_id, status }) => {
    return db.prepare('UPDATE supplier_payments SET status = ? WHERE id = ?').run(status, payment_id)
  })
  ipcMain.handle('get-supplier-ledger', (_, supplier_id) => {
    const pos = db.prepare("SELECT id, created_at as date, 'PURCHASE_ORDER' as type, COALESCE(total_amount, total_cost, 0) as amount, status, supplier_invoice_no as ref FROM purchase_orders WHERE supplier_id = ? AND status != 'DRAFT'").all(supplier_id)
    const payments = db.prepare("SELECT id, created_at as date, 'PAYMENT_' || method as type, amount, status, reference_no as ref FROM supplier_payments WHERE supplier_id = ?").all(supplier_id)
    
    const ledger = [...pos, ...payments].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return ledger;
  })

  ipcMain.handle('get-session-transactions', async (_, sessionId) => {
    try {
      const isAll = !sessionId || sessionId === 'ALL';
      let txs: any[] = [];

      if (isAll) {
        txs = db.prepare(`
          SELECT st.*, s.username as cashier, s.terminal_id
          FROM session_transactions st
          LEFT JOIN sessions s ON st.session_id = s.id
          ORDER BY st.created_at DESC, st.id DESC LIMIT 300
        `).all();
      } else {
        txs = db.prepare(`
          SELECT st.*, s.username as cashier, s.terminal_id
          FROM session_transactions st
          LEFT JOIN sessions s ON st.session_id = s.id
          WHERE st.session_id = ? OR st.shift_id = ? OR st.session_id = (SELECT id FROM sessions WHERE remote_id = ? LIMIT 1)
          ORDER BY st.created_at DESC, st.id DESC
        `).all(sessionId, sessionId, sessionId);
      }

      // If local has no records or querying all, attempt syncing with remote MariaDB
      try {
        const isOnline = await checkRemoteConnection(1500);
        if (isOnline) {
          const pool = getRemotePool();
          let remoteTxs: any[] = [];

          if (isAll) {
            const [rows]: any = await pool.query(`
              SELECT * FROM novafreshmart_session_transactions
              ORDER BY created_at DESC LIMIT 300
            `);
            remoteTxs = rows || [];
          } else {
            const sess: any = db.prepare('SELECT id, remote_id FROM sessions WHERE id = ? OR remote_id = ?').get(sessionId, sessionId);
            const shiftId = sess?.remote_id || sessionId;
            const [rows]: any = await pool.query(`
              SELECT * FROM novafreshmart_session_transactions
              WHERE shift_id = ? OR shift_id LIKE ? OR session_id = ?
              ORDER BY created_at DESC
            `, [shiftId, `%-${sessionId}`, sessionId]);
            remoteTxs = rows || [];
          }

          if (Array.isArray(remoteTxs) && remoteTxs.length > 0) {
            const insertStmt = db.prepare(`
              INSERT OR REPLACE INTO session_transactions (id, session_id, shift_id, terminal_id, type, amount, notes, created_at, synced, remote_id)
              VALUES (
                COALESCE((SELECT id FROM session_transactions WHERE remote_id = @id), NULL),
                @session_id, @shift_id, @terminal_id, @type, @amount, @notes, @created_at, 1, @id
              )
            `);
            db.transaction(() => {
              for (const r of remoteTxs) {
                insertStmt.run({
                  id: r.id,
                  session_id: r.session_id || (isAll ? null : sessionId),
                  shift_id: r.shift_id,
                  terminal_id: r.terminal_id,
                  type: r.type,
                  amount: Number(r.amount || 0),
                  notes: r.notes || null,
                  created_at: r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ')
                });
              }
            })();

            if (isAll) {
              txs = db.prepare(`
                SELECT st.*, s.username as cashier, s.terminal_id
                FROM session_transactions st
                LEFT JOIN sessions s ON st.session_id = s.id
                ORDER BY st.created_at DESC, st.id DESC LIMIT 300
              `).all();
            } else {
              const sess: any = db.prepare('SELECT id, remote_id FROM sessions WHERE id = ? OR remote_id = ?').get(sessionId, sessionId);
              const shiftId = sess?.remote_id || sessionId;
              txs = db.prepare(`
                SELECT st.*, s.username as cashier, s.terminal_id
                FROM session_transactions st
                LEFT JOIN sessions s ON st.session_id = s.id
                WHERE st.session_id = ? OR st.shift_id = ?
                ORDER BY st.created_at DESC, st.id DESC
              `).all(sess?.id || sessionId, shiftId);
            }
          }
        }
      } catch (err: any) {
        console.warn('[get-session-transactions] Remote fetch error:', err.message);
      }

      return txs;
    } catch (err: any) {
      console.error('[get-session-transactions] Error:', err);
      return [];
    }
  });

  ipcMain.handle('delete-session-transaction', async (_, txId) => {
    try {
      const tx: any = db.prepare('SELECT * FROM session_transactions WHERE id = ? OR remote_id = ?').get(txId, txId);
      if (!tx) return { success: true };

      db.prepare('DELETE FROM session_transactions WHERE id = ?').run(tx.id);

      // Recalculate local session cash_in / cash_out
      if (tx.session_id) {
        const stats: any = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
            COALESCE(SUM(CASE WHEN type = 'CASH_OUT' OR type = 'EXPENSE' THEN amount ELSE 0 END), 0) as cash_out
          FROM session_transactions
          WHERE session_id = ? OR (shift_id IS NOT NULL AND shift_id = ?)
        `).get(tx.session_id, tx.shift_id);

        db.prepare('UPDATE sessions SET cash_in = ?, cash_out = ?, synced = 0 WHERE id = ?').run(
          Number(stats?.cash_in || 0), Number(stats?.cash_out || 0), tx.session_id
        );
      }

      // Remote delete if online
      try {
        const isOnline = await checkRemoteConnection(1500);
        if (isOnline) {
          const pool = getRemotePool();
          const remoteTxId = tx.remote_id || `STX-${tx.terminal_id}-${tx.id}`;
          await pool.query('DELETE FROM novafreshmart_session_transactions WHERE id = ? OR (shift_id = ? AND session_id = ? AND amount = ?)',
            [remoteTxId, tx.shift_id, tx.session_id, tx.amount]
          );
          if (tx.shift_id) {
            const [sumRows]: any = await pool.query(`
              SELECT
                COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
                COALESCE(SUM(CASE WHEN type = 'CASH_OUT' OR type = 'EXPENSE' THEN amount ELSE 0 END), 0) as cash_out
              FROM novafreshmart_session_transactions
              WHERE shift_id = ?
            `, [tx.shift_id]);
            if (Array.isArray(sumRows) && sumRows.length > 0) {
              await pool.query(`
                UPDATE novafreshmart_terminal_shifts
                SET cash_in = ?, cash_out = ?,
                    expected_cash = opening_cash + cash_sales + ? - ?
                WHERE id = ?
              `, [Number(sumRows[0].cash_in), Number(sumRows[0].cash_out), Number(sumRows[0].cash_in), Number(sumRows[0].cash_out), tx.shift_id]);
            }
          }
        }
      } catch (_) {}

      BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) win.webContents.send('sync-data-updated');
      });

      return { success: true };
    } catch (err: any) {
      console.error('[delete-session-transaction] Error:', err);
      throw err;
    }
  })

  ipcMain.handle('get-settings', () => {
    try {
      const rows = db.prepare('SELECT * FROM settings').all() as any[];
      const acc: any = {};
      for (const row of rows) {
        try {
          acc[row.key] = JSON.parse(row.value);
        } catch {
          acc[row.key] = row.value;
        }
      }
      if (!acc.storeName) acc.storeName = 'Nova FreshMart';
      if (!acc.phone || acc.phone.trim() === '') acc.phone = '045 2286041';
      if (!acc.tagline || acc.tagline.includes('Baby Street')) acc.tagline = 'Main FreshMart Store';
      return acc;
    } catch (e) {
      console.error('get-settings error:', e);
      return {};
    }
  })

  ipcMain.handle('save-settings', async (_, settings) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    db.transaction(() => {
      for (const [key, value] of Object.entries(settings)) {
        stmt.run(key, JSON.stringify(value));
      }
    })();

    // Push store-wide settings immediately to remote MariaDB
    const STORE_WIDE_KEYS = [
      'storeName', 'tagline', 'phone', 'taxRate', 'taxInclusive',
      'loyalty_enabled', 'loyalty_points_per_100', 'loyalty_point_value_rs',
      'loyalty_min_redeem_points', 'footerMsg', 'receiptLanguage',
      'invoiceLogo', 'always_prompt_quantity_modal'
    ];

    try {
      const isOnline = await checkRemoteConnection(3000);
      if (isOnline) {
        const pool = getRemotePool();
        for (const key of STORE_WIDE_KEYS) {
          if (settings[key] !== undefined) {
            const valStr = typeof settings[key] === 'string' ? settings[key] : JSON.stringify(settings[key]);
            await pool.query(`
              INSERT INTO novafreshmart_settings (key_name, value_text, updated_at)
              VALUES (?, ?, NOW())
              ON DUPLICATE KEY UPDATE
                value_text = VALUES(value_text),
                updated_at = NOW()
            `, [key, valStr]);
          }
        }
      }
    } catch (err) {
      console.warn('Could not push settings to remote MariaDB:', err);
    }

    return { success: true };
  })

  ipcMain.handle('get-credit-accounts', () => {
    return db.prepare('SELECT ca.*, c.name as customer_name, c.phone FROM credit_accounts ca JOIN customers c ON c.id = ca.customer_id').all()
  })

  ipcMain.handle('create-credit-account', (_, { customer_id, credit_limit }) => {
    try {
      const res = db.prepare('INSERT INTO credit_accounts (customer_id, credit_limit, balance, synced) VALUES (?, ?, 0, 0)').run(customer_id, credit_limit);
      setTimeout(() => runFullSync(db), 100);
      return res;
    } catch (e: any) {
      if (e.message && e.message.includes('UNIQUE')) throw new Error('Customer already has a credit account');
      throw e;
    }
  })

  ipcMain.handle('settle-credit', (_, { account_id, amount, notes }) => {
    const res = db.transaction(() => {
      const acct = db.prepare('SELECT balance FROM credit_accounts WHERE id = ?').get(account_id)
      if (!acct) throw new Error('Account not found')
      
      db.prepare('UPDATE credit_accounts SET balance = balance - ?, synced = 0 WHERE id = ?').run(amount, account_id)
      return db.prepare('INSERT INTO credit_transactions (account_id, type, amount, notes, synced) VALUES (?, ?, ?, ?, 0)').run(account_id, 'SETTLEMENT', amount, notes)
    })()
    setTimeout(() => runFullSync(db), 100);
    return res;
  })

  
  ipcMain.handle('get-baby-analytics', (_, { startDate, endDate }: any = {}) => {
    const products: any[] = db.prepare('SELECT p.id, p.name, p.stock, p.cost_price, p.price, p.has_variants, p.requires_batch, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id').all();
    
    let invoices: any[] = [];
    if (startDate && endDate) {
      const sIso = String(startDate);
      const eIso = String(endDate);
      const sSpace = sIso.replace('T', ' ').replace(/\..+$/, '');
      const eSpace = eIso.replace('T', ' ').replace(/\..+$/, '');
      invoices = db.prepare(`
        SELECT * FROM invoices 
        WHERE ((created_at >= ? AND created_at <= ?) OR (created_at >= ? AND created_at <= ?))
      `).all(sIso, eIso, sSpace, eSpace);
    } else {
      invoices = db.prepare("SELECT * FROM invoices WHERE created_at >= date('now', '-90 days')").all();
    }
    
    // Inventory aggregates (clamping anomalies > 50000)
    let totalStockUnits = 0;
    let inventoryCostValue = 0;
    let inventoryRetailValue = 0;
    let activeSkus = 0;
    const totalSkus = products.length;

    const prodMap = new Map<any, any>();
    for (const p of products) {
      const safeStock = Number(p.stock || 0) > 50000 ? 0 : Math.max(0, Number(p.stock || 0));
      const cost = Number(p.cost_price || 0);
      const price = Number(p.price || 0);

      prodMap.set(p.id, { ...p, safeStock, cost, price });
      prodMap.set(String(p.id), { ...p, safeStock, cost, price });

      if (safeStock > 0) {
        activeSkus++;
        totalStockUnits += safeStock;
        inventoryCostValue += (safeStock * cost);
        inventoryRetailValue += (safeStock * price);
      }
    }

    const potentialProfit = Math.max(0, inventoryRetailValue - inventoryCostValue);
    const potentialMargin = inventoryRetailValue > 0 ? (potentialProfit / inventoryRetailValue) * 100 : 0;

    // Sales, COGS & Performance Rankings
    const soldProductIds = new Set();
    const productStats = new Map<any, any>();
    let totalRevenue = 0;
    let totalCogs = 0;

    for (const inv of invoices) {
      let items: any[] = [];
      try { items = JSON.parse(inv.items || '[]'); } catch(_) { items = []; }
      for (const item of items) {
        const pid = item.id;
        soldProductIds.add(pid);
        soldProductIds.add(String(pid));

        const qty = Number(item.quantity ?? item.qty ?? 1);
        const prod = prodMap.get(pid);
        const price = Number(item.price ?? prod?.price ?? 0);
        const cost = Number(item.cost_price ?? prod?.cost ?? (price * 0.7));

        const lineRev = price * qty;
        const lineCogs = cost * qty;
        const lineProfit = lineRev - lineCogs;

        totalRevenue += lineRev;
        totalCogs += lineCogs;

        const statKey = prod?.id || pid;
        const stat = productStats.get(statKey) || {
          id: statKey,
          name: prod?.name || item.name || `Product #${statKey}`,
          category: prod?.category_name || 'General',
          unitsSold: 0,
          revenue: 0,
          cogs: 0,
          profit: 0,
          stock: prod?.safeStock ?? 0,
          price: price,
          cost: cost
        };
        stat.unitsSold += qty;
        stat.revenue += lineRev;
        stat.cogs += lineCogs;
        stat.profit += lineProfit;
        productStats.set(statKey, stat);
      }
    }

    // Top Most Fast Moving Products
    const fastMoving = Array.from(productStats.values())
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, 10);

    // Top Most Profitable Products
    const mostProfitable = Array.from(productStats.values())
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10)
      .map(p => ({
        ...p,
        marginPercent: p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0
      }));

    // Realized Gross Profit
    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // Expenses
    let totalExpenses = 0;
    try {
      if (startDate && endDate) {
        const sIso = String(startDate);
        const eIso = String(endDate);
        const sSpace = sIso.replace('T', ' ').replace(/\..+$/, '');
        const eSpace = eIso.replace('T', ' ').replace(/\..+$/, '');
        const expRow: any = db.prepare(`
          SELECT COALESCE(SUM(amount), 0) as tot FROM expenses 
          WHERE ((date >= ? AND date <= ?) OR (date >= ? AND date <= ?))
        `).get(sIso, eIso, sSpace, eSpace);
        totalExpenses = Number(expRow?.tot || 0);
      } else {
        const expRow: any = db.prepare("SELECT COALESCE(SUM(amount), 0) as tot FROM expenses WHERE date >= date('now', '-90 days')").get();
        totalExpenses = Number(expRow?.tot || 0);
      }
    } catch (_) {}

    const netProfit = grossProfit - totalExpenses;
    const netMarginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    // Dead stock with sanitized values (< 50000)
    const deadStock = products
      .filter((p: any) => !soldProductIds.has(p.id) && !soldProductIds.has(String(p.id)) && p.stock > 0 && p.stock < 50000)
      .map((p: any) => ({
        ...p,
        cost_price: Number(p.cost_price || 0),
        price: Number(p.price || 0),
        stock: Number(p.stock || 0)
      }));

    const marginProducts = products
      .map((p: any) => {
        const price = Number(p.price || 0);
        const cost = Number(p.cost_price || 0);
        const margin = price - cost;
        const marginPercent = price > 0 ? (margin / price) * 100 : 0;
        return { ...p, cost_price: cost, price, margin, marginPercent };
      })
      .filter((p: any) => p.marginPercent < 20 && p.price > 0);

    return {
      inventory: {
        totalSkus,
        activeSkus,
        totalStockUnits,
        inventoryCostValue,
        inventoryRetailValue,
        potentialProfit,
        potentialMargin
      },
      salesAnalytics: {
        totalRevenue,
        totalCogs,
        grossProfit,
        grossMarginPercent,
        totalExpenses,
        netProfit,
        netMarginPercent
      },
      fastMoving,
      mostProfitable,
      deadStock,
      marginProducts,
      totalRevenue,
      totalCogs
    };
  })

  ipcMain.handle('get-invoices', () => {
    return db.prepare(`
      SELECT i.*, COALESCE(b.name, i.branch_id) as branch_name, COALESCE(t.name, i.terminal_id) as terminal_name 
      FROM invoices i
      LEFT JOIN branches b ON i.branch_id = b.id
      LEFT JOIN terminals t ON i.terminal_id = t.id
      ORDER BY i.created_at DESC
    `).all();
  })

ipcMain.handle('get-variants', (_, productId) => {
  return db.prepare('SELECT * FROM product_variants WHERE product_id = ?').all(productId)
})

ipcMain.handle('update-variant-stock', (_, { id, productId, newStock, oldStock }) => {
  const diff = newStock - oldStock
  const stmt = db.prepare('UPDATE product_variants SET stock = ? WHERE id = ?')
  stmt.run(newStock, id)
  // Update parent product
  db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(diff, productId)
  return true
})

ipcMain.handle('get-customers', () => {
  return db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all()
})

ipcMain.handle('add-customer', (_, customer: any = {}) => {
  const name = (customer.name || '').trim();
  const phone = (customer.phone || '').trim();
  const stmt = db.prepare('INSERT INTO customers (name, phone, points, synced) VALUES (?, ?, 0, 0)');
  const res = stmt.run(name, phone);
  setTimeout(() => runFullSync(db), 100);
  return res;
});

ipcMain.handle('update-customer', (_, customer: any = {}) => {
  const id = customer.id;
  const name = (customer.name || '').trim();
  const phone = (customer.phone || '').trim();
  const res = db.prepare('UPDATE customers SET name = ?, phone = ?, synced = 0 WHERE id = ?').run(name, phone, id);
  setTimeout(() => runFullSync(db), 100);
  return res;
});

ipcMain.handle('get-customer-by-barcode', (_, barcode) => {
  return db.prepare('SELECT * FROM customers WHERE barcode = ?').get(barcode) || null
})

ipcMain.handle('delete-customer', async (_, id) => {
  const cust = db.prepare('SELECT remote_id FROM customers WHERE id = ?').get(id) as any;
  const acct = db.prepare('SELECT id, remote_id FROM credit_accounts WHERE customer_id = ?').get(id) as any;
  const res = db.transaction(() => {
    db.prepare('UPDATE invoices SET customer_id = NULL WHERE customer_id = ?').run(id);
    if (acct) {
      db.prepare('DELETE FROM credit_transactions WHERE account_id = ?').run(acct.id);
      db.prepare('DELETE FROM credit_accounts WHERE id = ?').run(acct.id);
    }
    return db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  })();
  const remoteId = cust?.remote_id || `CUST-${id}`;
  try {
    const pool = getRemotePool();
    if (acct) {
      const acctRemoteId = acct.remote_id || `CRED-${acct.id}`;
      await pool.query('DELETE FROM novafreshmart_credit_transactions WHERE account_id = ?', [acctRemoteId]);
      await pool.query('DELETE FROM novafreshmart_credit_accounts WHERE id = ?', [acctRemoteId]);
      await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['credit_accounts', acctRemoteId]);
    }
    await pool.query('DELETE FROM novafreshmart_customers WHERE id = ?', [remoteId]);
    await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['customers', remoteId]);
  } catch (e) {}
  return res;
})

ipcMain.handle('get-batches', () => {
  return db.prepare('SELECT b.*, p.name as product_name FROM batches b LEFT JOIN products p ON b.product_id = p.id ORDER BY b.expiry_date ASC').all()
})



let mainWindow: BrowserWindow | null = null



ipcMain.handle('get-vouchers-full', () => {
  const vouchers = db.prepare('SELECT * FROM vouchers').all();
  const restrictions = db.prepare('SELECT * FROM voucher_restrictions').all();
  
  return vouchers.map(v => ({
    ...v,
    restrictions: restrictions.filter(r => r.voucher_id === v.id)
  }));
});

ipcMain.handle('create-voucher-full', (_, data) => {
  const newId = db.transaction(() => {
    const stmt = db.prepare('INSERT INTO vouchers (code, amount, status, expiry_date, type, name, branch_id, synced) VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
    const info = stmt.run(data.code, data.amount, 'ACTIVE', data.expiry_date || null, data.type || 'FIXED', data.name || null, data.branch_id || 'ALL');
    
    if (data.restrictions && data.restrictions.length > 0) {
      const restStmt = db.prepare('INSERT INTO voucher_restrictions (voucher_id, type, target_id) VALUES (?, ?, ?)');
      for (const r of data.restrictions) {
        restStmt.run(info.lastInsertRowid, r.type, r.target_id);
      }
    }
    return info.lastInsertRowid;
  })();
  setTimeout(() => runFullSync(db), 100);
  return newId;
});

ipcMain.handle('update-voucher-status', (_, { id, status }) => {
  db.prepare('UPDATE vouchers SET status = ?, synced = 0 WHERE id = ?').run(status, id);
  setTimeout(() => runFullSync(db), 100);
});

ipcMain.handle('update-voucher-full', (_, data) => {
  db.transaction(() => {
    db.prepare('UPDATE vouchers SET code = ?, amount = ?, expiry_date = ?, type = ?, name = ?, branch_id = ?, synced = 0 WHERE id = ?').run(data.code, data.amount, data.expiry_date || null, data.type || 'FIXED', data.name || null, data.branch_id || 'ALL', data.id);
    db.prepare('DELETE FROM voucher_restrictions WHERE voucher_id = ?').run(data.id);
    if (data.restrictions && data.restrictions.length > 0) {
      const restStmt = db.prepare('INSERT INTO voucher_restrictions (voucher_id, type, target_id) VALUES (?, ?, ?)');
      for (const r of data.restrictions) {
        restStmt.run(data.id, r.type, r.target_id);
      }
    }
  })();
  setTimeout(() => runFullSync(db), 100);
});

ipcMain.handle('delete-voucher', (_, id) => {
  const v = db.prepare('SELECT remote_id, code FROM vouchers WHERE id = ?').get(id) as any;
  db.transaction(() => {
    db.prepare('DELETE FROM voucher_restrictions WHERE voucher_id = ?').run(id);
    db.prepare('DELETE FROM vouchers WHERE id = ?').run(id);
  })();
  if (v?.remote_id || v?.code) {
    (async () => {
      try {
        const pool = getRemotePool();
        if (v.remote_id) {
          await pool.query('UPDATE novafreshmart_vouchers SET status = "DELETED", updated_at = NOW() WHERE id = ?', [v.remote_id]);
        } else {
          await pool.query('UPDATE novafreshmart_vouchers SET status = "DELETED", updated_at = NOW() WHERE UPPER(TRIM(code)) = UPPER(?)', [v.code]);
        }
      } catch (e) {}
    })();
  }
  return true;
});


ipcMain.handle('validate-voucher', async (_, { code, cartItems = [] }) => {
  const cleanCode = (code || '').trim();
  if (!cleanCode) return { valid: false, message: 'Please enter a voucher code.' };

  let voucher = db.prepare("SELECT * FROM vouchers WHERE UPPER(TRIM(code)) = UPPER(?)").get(cleanCode) as any;
  
  // If not found locally, query remote MariaDB on-demand in case it was created recently on another terminal
  if (!voucher) {
    try {
      const pool = getRemotePool();
      const queryPromise = pool.query('SELECT * FROM novafreshmart_vouchers WHERE UPPER(TRIM(code)) = UPPER(?)', [cleanCode]);
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500));
      const [vRows] = (await Promise.race([queryPromise, timeoutPromise])) as any[];
      if (vRows && vRows.length > 0) {
        const rv = vRows[0];
        const expiryStr = rv.expiry_date ? (rv.expiry_date.toISOString ? rv.expiry_date.toISOString().split('T')[0] : String(rv.expiry_date).split('T')[0]) : null;
        db.prepare(`
          INSERT OR REPLACE INTO vouchers (code, name, type, amount, claimed_amount, status, expiry_date, branch_id, synced, remote_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        `).run(rv.code, rv.name || '', rv.type || 'FIXED', Number(rv.amount) || 0, Number(rv.claimed_amount) || 0, rv.status || 'ACTIVE', expiryStr, rv.branch_id || 'ALL', String(rv.id));

        voucher = db.prepare("SELECT * FROM vouchers WHERE UPPER(TRIM(code)) = UPPER(?)").get(cleanCode) as any;

        // Also fetch any restrictions
        try {
          const [restrs] = await pool.query('SELECT * FROM novafreshmart_voucher_restrictions WHERE voucher_id = ?', [rv.id]) as any[];
          if (restrs && restrs.length > 0 && voucher) {
            const insRes = db.prepare('INSERT OR IGNORE INTO voucher_restrictions (voucher_id, type, target_id) VALUES (?, ?, ?)');
            for (const r of restrs) {
              insRes.run(voucher.id, r.restriction_type || r.type || 'CATEGORY', r.target_id);
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      console.warn('[Voucher] Remote on-demand lookup skipped/failed (offline mode active):', err);
    }
  }

  if (!voucher) return { valid: false, message: `Voucher code '${cleanCode}' was not found.` };

  if (voucher.status === 'INACTIVE') {
    return { valid: false, message: `Voucher '${voucher.code}' is currently inactive.` };
  }

  const remainingValue = Number(voucher.amount) - Number(voucher.claimed_amount || 0);
  if (voucher.status === 'CLAIMED' || remainingValue <= 0.001) {
    return { valid: false, message: `Voucher '${voucher.code}' has already been fully redeemed.` };
  }

  // Check expiry date
  if (voucher.expiry_date) {
    const today = new Date().toISOString().split('T')[0];
    if (voucher.expiry_date < today) {
      return { valid: false, message: `Voucher '${voucher.code}' expired on ${voucher.expiry_date}.` };
    }
  }

  if (!cartItems || cartItems.length === 0) {
    return { valid: false, message: 'Cart is empty. Please add products to cart first.' };
  }

  const restrictions = db.prepare('SELECT * FROM voucher_restrictions WHERE voucher_id = ?').all(voucher.id) as any[];
  let maxAllowed = 0;

  if (restrictions.length === 0) {
    for (const item of cartItems) {
      const q = Number(item.quantity ?? item.qty ?? 1);
      const p = Number(item.price ?? 0);
      const disc = Number(item.discount ?? 0);
      const line = Number(item.total ?? (p * q - disc) ?? (p * q));
      maxAllowed += line > 0 ? line : 0;
    }
  } else {
    const allowedCatIds = restrictions
      .filter((r: any) => (r.type || r.restriction_type) === 'CATEGORY')
      .map((r: any) => String(r.target_id));
    const allowedProductIds = restrictions
      .filter((r: any) => (r.type || r.restriction_type) === 'PRODUCT')
      .map((r: any) => String(r.target_id));

    for (const item of cartItems) {
      const itemCatId = String(item.category_id || '');
      const itemId = String(item.id || item.product_id || '');
      const isEligible = 
        (allowedCatIds.length > 0 && allowedCatIds.includes(itemCatId)) ||
        (allowedProductIds.length > 0 && allowedProductIds.includes(itemId)) ||
        (allowedCatIds.length === 0 && allowedProductIds.length === 0);

      if (isEligible) {
        const q = Number(item.quantity ?? item.qty ?? 1);
        const p = Number(item.price ?? 0);
        const disc = Number(item.discount ?? 0);
        const line = Number(item.total ?? (p * q - disc) ?? (p * q));
        maxAllowed += line > 0 ? line : 0;
      }
    }
  }

  if (maxAllowed <= 0) {
    return { valid: false, message: 'None of the items in the cart are eligible for this voucher.' };
  }

  const isCartSufficient = maxAllowed >= remainingValue;
  const deficit = Math.max(0, remainingValue - maxAllowed);
  const applicableValue = Math.min(maxAllowed, remainingValue);

  return {
    valid: true,
    voucherId: voucher.id,
    code: voucher.code,
    name: voucher.name || '',
    type: voucher.type || 'FIXED',
    originalAmount: voucher.amount,
    claimedAmount: voucher.claimed_amount || 0,
    remainingValue,
    cartTotal: maxAllowed,
    isCartSufficient,
    deficit,
    applicableValue,
    voucher
  };
});

ipcMain.handle('claim-voucher', async (_, { voucherId, amount, forceFullClaim }) => {
  const v = db.prepare('SELECT id, code, amount, claimed_amount, remote_id FROM vouchers WHERE id = ?').get(voucherId) as any;
  if (!v) return;
  const addAmt = Number(amount || 0);
  const newClaimed = forceFullClaim ? v.amount : Math.min(v.amount, (v.claimed_amount || 0) + addAmt);
  const status = (forceFullClaim || newClaimed >= v.amount) ? 'CLAIMED' : 'ACTIVE';
  db.prepare('UPDATE vouchers SET claimed_amount = ?, status = ?, synced = 0 WHERE id = ?').run(newClaimed, status, voucherId);

  // Sync to remote in background (FIRE-AND-FORGET) so checkout is 100% offline safe and never hangs!
  (async () => {
    try {
      const pool = getRemotePool();
      if (v.remote_id) {
        await pool.query('UPDATE novafreshmart_vouchers SET claimed_amount = ?, status = ?, updated_at = NOW() WHERE id = ?', [newClaimed, status, v.remote_id]);
        db.prepare('UPDATE vouchers SET synced = 1 WHERE id = ?').run(voucherId);
      } else {
        await pool.query('UPDATE novafreshmart_vouchers SET claimed_amount = ?, status = ?, updated_at = NOW() WHERE UPPER(TRIM(code)) = UPPER(?)', [newClaimed, status, v.code]);
        db.prepare('UPDATE vouchers SET synced = 1 WHERE id = ?').run(voucherId);
      }
    } catch (e) {
      console.warn('[Voucher] Immediate remote claim sync deferred to syncService:', e);
    }
  })();
  return { success: true, claimed_amount: newClaimed, status };
});

// Analytics by Date
ipcMain.handle('get-analytics-by-date', async (_, { startDate, endDate, branchId, terminalId }: any = {}) => {
  const isAll = !startDate || startDate === 'ALL' || startDate === 'all' || startDate === '1970-01-01T00:00:00.000Z';
  const sDate = !isAll ? String(startDate).slice(0, 10) : '';
  const eDate = (!isAll && endDate) ? String(endDate).slice(0, 10) : '2099-12-31';

  try {
    const isOnline = await checkRemoteConnection();
    if (isOnline) {
      const pool = getRemotePool();
      let remoteQuery = `
        SELECT 
          s.id,
          s.id as remote_id,
          s.invoice_no,
          s.branch_id,
          s.terminal_id,
          s.shift_id as session_id,
          s.cashier,
          s.order_type,
          s.table_no,
          s.customer_name,
          s.customer_phone,
          s.pricing_type,
          s.subtotal,
          s.discount,
          s.tax,
          s.total,
          s.payment_method,
          s.cash_paid,
          s.card_paid,
          s.other_paid,
          s.balance_due,
          s.change_returned,
          s.status,
          s.created_at,
          s.items_json as items,
          s.sale_type,
          s.parent_invoice_id,
          b.name as branch_name,
          t.name as terminal_name
        FROM novafreshmart_sales s
        LEFT JOIN novafreshmart_branches b ON s.branch_id = b.id
        LEFT JOIN novafreshmart_terminals t ON s.terminal_id = t.id
      `;
      const rWhere: string[] = [];
      const rParams: any[] = [];

      if (!isAll) {
        rWhere.push('(DATE(s.created_at) >= ? AND DATE(s.created_at) <= ?)');
        rParams.push(sDate, eDate);
      }
      if (branchId && branchId !== 'ALL') {
        rWhere.push('(s.branch_id = ? OR b.name = ?)');
        rParams.push(branchId, branchId);
      }
      if (terminalId && terminalId !== 'ALL') {
        rWhere.push('(s.terminal_id = ? OR t.name = ?)');
        rParams.push(terminalId, terminalId);
      }

      if (rWhere.length > 0) {
        remoteQuery += ' WHERE ' + rWhere.join(' AND ');
      }
      remoteQuery += ' ORDER BY s.created_at DESC';

      const [remoteInvoices]: any = await pool.query(remoteQuery, rParams);
      if (Array.isArray(remoteInvoices)) {
        let tx: any[] = [];
        try {
          if (isAll) {
            tx = db.prepare('SELECT * FROM session_transactions ORDER BY created_at DESC').all();
          } else {
            tx = db.prepare('SELECT * FROM session_transactions WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)').all(sDate, eDate);
          }
        } catch (_) {}

        return { invoices: remoteInvoices, transactions: tx };
      }
    }
  } catch (remoteErr) {
    console.warn('[Analytics] Remote query failed, falling back to local SQLite:', remoteErr);
  }

  // Local SQLite fallback
  let query = `
    SELECT i.*, COALESCE(b.name, i.branch_id) as branch_name, COALESCE(t.name, i.terminal_id) as terminal_name 
    FROM invoices i
    LEFT JOIN branches b ON i.branch_id = b.id
    LEFT JOIN terminals t ON i.terminal_id = t.id
  `;
  const params: any[] = [];
  const whereClauses: string[] = [];

  if (!isAll) {
    whereClauses.push('(date(i.created_at) >= date(?) AND date(i.created_at) <= date(?))');
    params.push(sDate, eDate);
  }

  if (branchId && branchId !== 'ALL') {
    whereClauses.push('(i.branch_id = ? OR b.name = ?)');
    params.push(branchId, branchId);
  }
  if (terminalId && terminalId !== 'ALL') {
    whereClauses.push('(i.terminal_id = ? OR t.name = ?)');
    params.push(terminalId, terminalId);
  }

  if (whereClauses.length > 0) {
    query += ' WHERE ' + whereClauses.join(' AND ');
  }
  query += ' ORDER BY i.created_at DESC';

  const invoices = db.prepare(query).all(...params);

  let tx: any[] = [];
  try {
    if (isAll) {
      tx = db.prepare('SELECT * FROM session_transactions ORDER BY created_at DESC').all();
    } else {
      tx = db.prepare('SELECT * FROM session_transactions WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)').all(sDate, eDate);
    }
  } catch (_) {}

  return { invoices, transactions: tx };
});


// User Management
ipcMain.handle('login', async (e, { username, password }) => {
  const u = (username || '').trim();
  const p = (password || '').trim();

  const parseUserPerms = (usr: any) => {
    if (!usr) return usr;
    if (typeof usr.permissions === 'string') {
      try {
        usr.permissions = JSON.parse(usr.permissions);
      } catch (err) {
        usr.permissions = usr.permissions.split(',').map((x: string) => x.trim()).filter(Boolean);
      }
    }
    return usr;
  };

  const triggerSyncAndNotify = () => {
    setTimeout(async () => {
      try {
        await runFullSync(db);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('sync-completed', { success: true });
        }
      } catch (err: any) {
        console.warn('Sync post-login error:', err.message);
      }
    }, 50);
  };

  const pNoSpaces = p.replace(/\s+/g, '');

  // 1. Authoritative cloud check first if online (prevents old stale PINs on other terminals from succeeding)
  try {
    const isOnline = await checkRemoteConnection(2500);
    if (isOnline) {
      const pool = getRemotePool();
      const [remoteRows]: any = await pool.query(
        'SELECT * FROM novafreshmart_employees WHERE username = ? AND is_active = 1',
        [u]
      );
      if (Array.isArray(remoteRows) && remoteRows.length > 0) {
        const emp = remoteRows[0];
        // Upsert into local users table with latest cloud PIN & role
        db.prepare(`
          INSERT INTO users (username, pin, role, permissions, branch_id, allowed_terminals, phone, nic, address, salary, bank_account, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(username) DO UPDATE SET
            pin = excluded.pin,
            role = excluded.role,
            permissions = excluded.permissions,
            branch_id = excluded.branch_id,
            allowed_terminals = excluded.allowed_terminals,
            phone = COALESCE(excluded.phone, users.phone),
            nic = COALESCE(excluded.nic, users.nic),
            address = COALESCE(excluded.address, users.address),
            salary = COALESCE(excluded.salary, users.salary),
            bank_account = COALESCE(excluded.bank_account, users.bank_account),
            updated_at = excluded.updated_at
        `).run(
          emp.username,
          emp.pin,
          emp.role || 'Cashier',
          typeof emp.permissions === 'string' ? emp.permissions : JSON.stringify(emp.permissions || ['POS']),
          emp.branch_id || 'ALL',
          emp.allowed_terminals || 'ALL',
          emp.phone || null,
          emp.nic || null,
          emp.address || null,
          Number(emp.salary || 0),
          emp.bank_account || null,
          emp.updated_at ? String(emp.updated_at) : null
        );

        // Verify if entered PIN matches the authoritative cloud PIN
        const rPin = (emp.pin || '').toString().trim();
        const rPinNoSpaces = rPin.replace(/\s+/g, '');
        if (rPin === password || rPin === p || rPinNoSpaces === pNoSpaces) {
          triggerSyncAndNotify();
          const freshUser = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(u);
          return parseUserPerms(freshUser);
        } else {
          // Password did NOT match current cloud PIN - reject! Do NOT allow outdated local PIN to bypass
          return null;
        }
      }
    }
  } catch (remoteErr) {
    console.warn('Remote login check error, falling back to local SQLite:', remoteErr);
  }

  // 2. Offline fallback (or if user is not in remote database)
  let user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND (pin = ? OR pin = ?)').get(u, password, p) as any;
  if (user) {
    triggerSyncAndNotify();
    return parseUserPerms(user);
  }

  user = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE AND replace(pin, ' ', '') = ?").get(u, pNoSpaces) as any;
  if (user) {
    triggerSyncAndNotify();
    return parseUserPerms(user);
  }

  return null;
});
ipcMain.handle('get-expenses', (_, { startDate, endDate }) => {
    if (startDate && endDate) {
      return db.prepare("SELECT * FROM expenses WHERE date >= ? AND date <= ? ORDER BY date DESC").all(startDate, endDate);
    }
    return db.prepare("SELECT * FROM expenses ORDER BY date DESC LIMIT 100").all();
  });
  
  ipcMain.handle('add-expense', async (_, { amount, category, description, created_by }) => {
    const config = getTerminalConfig(db);
    const branchId = config.current_branch_id || 'BR-MAIN';
    const terminalId = config.current_terminal_id || 'TERM-01';
    const res = db.prepare("INSERT INTO expenses (amount, category, description, created_by, branch_id, terminal_id, synced) VALUES (?, ?, ?, ?, ?, ?, 0)").run(amount, category, description, created_by, branchId, terminalId);
    const expenseId = res.lastInsertRowid;
    const remoteId = `EXP-${branchId}-${terminalId}-${expenseId}`;
    db.prepare("UPDATE expenses SET remote_id = ? WHERE id = ?").run(remoteId, expenseId);

    // Sync immediately to MariaDB in background
    (async () => {
      try {
        const pool = getRemotePool();
        if (pool) {
          await pool.query(`
            INSERT INTO novafreshmart_expenses (id, branch_id, terminal_id, amount, category, description, created_by, date)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
              amount = VALUES(amount),
              category = VALUES(category),
              description = VALUES(description),
              updated_at = NOW()
          `, [remoteId, branchId, terminalId, Number(amount || 0), category || 'General', description || '', created_by || 'Cashier']);
          db.prepare("UPDATE expenses SET synced = 1 WHERE id = ?").run(expenseId);
        }
      } catch (e) {
        console.warn('[add-expense] Cloud sync deferred:', e);
      }
    })();

    return res;
  });

  ipcMain.handle('delete-expense', async (_, id) => {
    const exp: any = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
    const res = db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
    if (exp) {
      (async () => {
        try {
          const pool = getRemotePool();
          if (pool) {
            const rId = exp.remote_id || `EXP-${exp.id}`;
            await pool.query('DELETE FROM novafreshmart_expenses WHERE id = ?', [rId]);
            await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['expenses', rId]);
          }
        } catch (e) {}
      })();
    }
    return res;
  });

  ipcMain.handle('update-expense', async (_, { id, amount, category, description }) => {
    const res = db.prepare("UPDATE expenses SET amount = ?, category = ?, description = ?, synced = 0 WHERE id = ?").run(amount, category, description, id);
    const exp: any = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
    if (exp) {
      (async () => {
        try {
          const pool = getRemotePool();
          if (pool) {
            const rId = exp.remote_id || `EXP-${exp.id}`;
            await pool.query(`
              UPDATE novafreshmart_expenses SET amount = ?, category = ?, description = ?, updated_at = NOW() WHERE id = ?
            `, [Number(amount || 0), category, description, rId]);
            db.prepare("UPDATE expenses SET synced = 1 WHERE id = ?").run(id);
          }
        } catch (e) {}
      })();
    }
    return res;
  });

  function broadcastUsersUpdated() {
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('users-updated');
          w.webContents.send('sync-data-updated');
          w.webContents.send('sync-completed', { success: true });
        }
      });
    } catch (_) {}
  }

  ipcMain.handle('get-users', async () => {
    try { await pullEmployeesOnly(db); } catch (_) {}
    try { return db.prepare('SELECT * FROM users').all(); } catch (_) { return []; }
  });
  ipcMain.handle('add-user', async (e, user) => {
    const branchId = user.branch_id || 'ALL';
    const allowedTerminals = user.allowed_terminals || 'ALL';
    const cleanUsername = String(user.username || '').trim();
    const empRemoteId = `EMP-${cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    // Remove any previous tombstones for this username
    try {
      db.prepare("DELETE FROM deleted_records_processed WHERE table_name = 'users' AND (record_id = ? OR record_id = ?)").run(empRemoteId, cleanUsername);
    } catch (_) {}

    const stmt = db.prepare('INSERT INTO users (username, pin, role, permissions, phone, nic, address, salary, bank_account, branch_id, allowed_terminals, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)');
    const info = stmt.run(cleanUsername, user.pin, user.role, JSON.stringify(user.permissions || []), user.phone, user.nic, user.address, user.salary, user.bank_account, branchId, allowedTerminals);
    const userId = info.lastInsertRowid;

    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        try {
          await pool.query("DELETE FROM novafreshmart_deleted_records WHERE table_name = 'users' AND (record_id = ? OR record_id = ?)", [empRemoteId, cleanUsername]);
        } catch (_) {}

        await pool.query(`
          INSERT INTO novafreshmart_employees (id, branch_id, username, pin, role, name, phone, permissions, allowed_terminals, nic, address, salary, bank_account, is_active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
          ON DUPLICATE KEY UPDATE
            branch_id = VALUES(branch_id),
            pin = VALUES(pin),
            role = VALUES(role),
            name = VALUES(name),
            phone = VALUES(phone),
            permissions = VALUES(permissions),
            allowed_terminals = VALUES(allowed_terminals),
            nic = VALUES(nic),
            address = VALUES(address),
            salary = VALUES(salary),
            bank_account = VALUES(bank_account),
            is_active = 1,
            updated_at = NOW()
        `, [
          empRemoteId,
          branchId,
          cleanUsername,
          user.pin,
          user.role || 'Cashier',
          cleanUsername,
          user.phone || '',
          JSON.stringify(user.permissions || []),
          allowedTerminals,
          user.nic || null,
          user.address || null,
          Number(user.salary || 0),
          user.bank_account || null
        ]);
      }
    } catch(err: any) {
      console.warn('[add-user] Remote employee push error:', err?.message || err);
    }

    broadcastUsersUpdated();
    setTimeout(() => runFullSync(db), 100);
    return userId;
  });
  ipcMain.handle('update-user', async (e, user) => {
    const branchId = user.branch_id || 'ALL';
    const allowedTerminals = user.allowed_terminals || 'ALL';
    const cleanUsername = String(user.username || '').trim();
    const empRemoteId = `EMP-${cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    const stmt = db.prepare('UPDATE users SET username = ?, pin = ?, role = ?, permissions = ?, phone = ?, nic = ?, address = ?, salary = ?, bank_account = ?, branch_id = ?, allowed_terminals = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(cleanUsername, user.pin, user.role, JSON.stringify(user.permissions || []), user.phone, user.nic, user.address, user.salary, user.bank_account, branchId, allowedTerminals, user.id);

    try {
      const isOnline = await checkRemoteConnection(2000);
      if (isOnline) {
        const pool = getRemotePool();
        await pool.query(`
          INSERT INTO novafreshmart_employees (id, branch_id, username, pin, role, name, phone, permissions, allowed_terminals, nic, address, salary, bank_account, is_active, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
          ON DUPLICATE KEY UPDATE
            branch_id = VALUES(branch_id),
            pin = VALUES(pin),
            role = VALUES(role),
            name = VALUES(name),
            phone = VALUES(phone),
            permissions = VALUES(permissions),
            allowed_terminals = VALUES(allowed_terminals),
            nic = VALUES(nic),
            address = VALUES(address),
            salary = VALUES(salary),
            bank_account = VALUES(bank_account),
            updated_at = NOW(),
            is_active = 1
        `, [
          empRemoteId,
          branchId,
          cleanUsername,
          user.pin,
          user.role || 'Cashier',
          cleanUsername,
          user.phone || '',
          JSON.stringify(user.permissions || []),
          allowedTerminals,
          user.nic || null,
          user.address || null,
          Number(user.salary || 0),
          user.bank_account || null
        ]);
      }
    } catch(err: any) {
      console.warn('[update-user] Remote employee update error:', err?.message || err);
    }

    broadcastUsersUpdated();
    setTimeout(() => runFullSync(db), 100);
  });
  ipcMain.handle('delete-user', async (e, id) => {
    const user: any = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
    const res = db.prepare("DELETE FROM users WHERE id = ? AND LOWER(username) != 'admin'").run(id);
    if (res.changes > 0) {
      const cleanUsername = String(user?.username || '').trim();
      const empRemoteId = `EMP-${cleanUsername.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      try {
        db.prepare('INSERT OR IGNORE INTO deleted_records_processed (table_name, record_id) VALUES (?, ?)').run('users', empRemoteId);
        if (cleanUsername) {
          db.prepare('INSERT OR IGNORE INTO deleted_records_processed (table_name, record_id) VALUES (?, ?)').run('users', cleanUsername);
        }
      } catch (_) {}
      try {
        const isOnline = await checkRemoteConnection(2000);
        if (isOnline) {
          const pool = getRemotePool();
          await pool.query('UPDATE novafreshmart_employees SET is_active = 0, updated_at = NOW() WHERE id = ? OR username = ?', [empRemoteId, cleanUsername]);
          await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['users', empRemoteId]);
        }
      } catch(err: any) {
        console.warn('[delete-user] Remote employee delete error:', err?.message || err);
      }
      broadcastUsersUpdated();
      setTimeout(() => runFullSync(db), 100);
    }
  });

  // User Roles IPC Handlers
  ipcMain.handle('get-user-roles', () => {
    return db.prepare('SELECT * FROM user_roles ORDER BY id ASC').all();
  });
  ipcMain.handle('add-user-role', (_, role) => {
    const stmt = db.prepare('INSERT INTO user_roles (name, permissions, description) VALUES (?, ?, ?)');
    return stmt.run(role.name, JSON.stringify(role.permissions || []), role.description || '');
  });
  ipcMain.handle('update-user-role', (_, role) => {
    const stmt = db.prepare('UPDATE user_roles SET name = ?, permissions = ?, description = ? WHERE id = ?');
    return stmt.run(role.name, JSON.stringify(role.permissions || []), role.description || '', role.id);
  });
  ipcMain.handle('delete-user-role', (_, id) => {
    return db.prepare("DELETE FROM user_roles WHERE id = ? AND name != 'Admin'").run(id);
  });

ipcMain.handle('get-employees', () => db.prepare('SELECT * FROM employees').all());
ipcMain.handle('add-employee', async (e, emp) => {
  const res = db.prepare('INSERT INTO employees (name, nic, phone, basic_salary) VALUES (?, ?, ?, ?)').run(emp.name, emp.nic, emp.phone, emp.basic_salary);
  try {
    const pool = getRemotePool();
    await pool.query(`
      INSERT INTO novafreshmart_employees (id, branch_id, username, pin, role, name, phone, permissions, allowed_terminals, nic, salary, is_active)
      VALUES (?, 'ALL', ?, '1234', 'Cashier', ?, ?, '["POS"]', 'ALL', ?, ?, 1)
      ON DUPLICATE KEY UPDATE name=VALUES(name), phone=VALUES(phone), nic=VALUES(nic), salary=VALUES(salary), is_active=1
    `, [`STAFF-${res.lastInsertRowid}`, emp.name.toLowerCase().replace(/[^a-z0-9]/g, '') || `staff${res.lastInsertRowid}`, emp.name, emp.phone || '', emp.nic || '', Number(emp.basic_salary || 0)]);
  } catch (_) {}
  return res;
});
ipcMain.handle('delete-employee', async (e, id) => {
  const res = db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  try {
    const pool = getRemotePool();
    await pool.query('UPDATE novafreshmart_employees SET is_active = 0 WHERE id = ?', [`STAFF-${id}`]);
  } catch (_) {}
  return res;
});
ipcMain.handle('update-employee', async (e, emp) => {
  const res = db.prepare('UPDATE employees SET name=?, nic=?, phone=?, basic_salary=? WHERE id=?').run(emp.name, emp.nic, emp.phone, emp.basic_salary, emp.id);
  try {
    const pool = getRemotePool();
    await pool.query(`
      UPDATE novafreshmart_employees SET name=?, phone=?, nic=?, salary=? WHERE id=?
    `, [emp.name, emp.phone || '', emp.nic || '', Number(emp.basic_salary || 0), `STAFF-${emp.id}`]);
  } catch (_) {}
  return res;
});


function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "Nova FreshMart",
    icon: join(process.env.VITE_DEV_SERVER_URL ? join(__dirname, '../../public') : join(__dirname, '../dist'), 'novafreshmart-exe-icon.png'),
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // F12 shortcut to toggle Developer Tools for diagnostics
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  mainWindow.webContents.on('console-message', (_, level, message, line, sourceId) => {
    if (level >= 2) {
      console.warn(`[Renderer] ${message} (${sourceId}:${line})`);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    console.error('[Renderer Crash]', details);
    // Auto-recover: reload after 1.5s so white screen self-heals
    setTimeout(() => {
      if (!mainWindow) return;
      if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      } else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
      }
    }, 1500);
  });

  mainWindow.webContents.on('did-fail-load', (_e, errorCode) => {
    if (errorCode === -3) return; // aborted/navigation, ignore
    setTimeout(() => {
      if (!mainWindow) return;
      if (process.env.VITE_DEV_SERVER_URL) {
        mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      } else {
        mainWindow.loadFile(join(__dirname, '../dist/index.html'));
      }
    }, 2000);
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    mainWindow = null
  }
})

const { spawn } = require('child_process')
const path = require('path')

function getPrintAgentCandidates(): string[] {
  return [
    path.join(process.resourcesPath, 'LunaPOSPrintAgent.exe'),
    path.join(app.getAppPath(), 'PrintAgentSource', 'Output', 'Release', 'LunaPOSPrintAgent.exe'),
    path.join(process.cwd(), 'PrintAgentSource', 'Output', 'Release', 'LunaPOSPrintAgent.exe'),
    path.join(__dirname, '../../PrintAgentSource/Output/Release/LunaPOSPrintAgent.exe'),
    path.join(__dirname, '../PrintAgentSource/Output/Release/LunaPOSPrintAgent.exe'),
    'C:\\Program Files\\LunaPOS Print Agent\\LunaPOSPrintAgent.exe'
  ];
}

function launchPrintAgent(): { ok: boolean; path?: string; error?: string } {
  try {
    const candidates = getPrintAgentCandidates();
    let agentPath = '';
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        agentPath = c;
        break;
      }
    }

    if (!agentPath) {
      console.warn('LunaPOSPrintAgent.exe not found in candidate locations.');
      return { ok: false, error: 'LunaPOSPrintAgent.exe not found on disk.' };
    }

    console.log('Spawning Print Agent from:', agentPath);
    const agentProcess = spawn(agentPath, [], { detached: true, stdio: 'ignore' });
    agentProcess.unref();
    return { ok: true, path: agentPath };
  } catch (err: any) {
    console.error('Failed to spawn Print Agent:', err);
    return { ok: false, error: err.message || String(err) };
  }
}

ipcMain.handle('launch-print-agent', () => {
  return launchPrintAgent();
});

app.whenReady().then(() => {
  setupAutoBackupScheduler(db);
  launchPrintAgent();
  createWindow();
  // Immediate initial sync on application boot
  runFullSync(db).catch(err => console.warn('[AppReady] Initial sync warning:', err.message));

  // Auto-updater setup (production only)
  if (!process.env.VITE_DEV_SERVER_URL) {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', (info: any) => {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('update-available', { version: info.version });
      });
    });

    autoUpdater.on('download-progress', (progress: any) => {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('update-download-progress', { percent: Math.round(progress.percent) });
      });
    });

    autoUpdater.on('update-downloaded', (info: any) => {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('update-downloaded', { version: info.version });
      });
    });

    autoUpdater.on('update-not-available', () => {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('update-not-available');
      });
    });

    autoUpdater.on('error', (err: any) => {
      const msg = String(err?.message || '');
      const isNotFoundOrNoVersion =
        msg.includes('404') ||
        msg.toLowerCase().includes('releases.atom') ||
        msg.toLowerCase().includes('no published version') ||
        msg.toLowerCase().includes('cannot find latest');

      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          if (isNotFoundOrNoVersion) {
            // Treat 404 or missing release as already on latest version
            w.webContents.send('update-not-available');
          } else if (msg.toLowerCase().includes('download')) {
            w.webContents.send('update-error', { message: 'Update server is preparing files. Please try again shortly.' });
          } else {
            w.webContents.send('update-error', { message: 'Unable to check for updates. Please check your internet connection.' });
          }
        }
      });
    });

    // Auto-check 15s after launch, then every 4 hours
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 15000);
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  }

  ipcMain.handle('check-for-updates', async () => {
    if (process.env.VITE_DEV_SERVER_URL) return { checking: false };
    try { await autoUpdater.checkForUpdates(); } catch (_) {}
    return { checking: true };
  });

  ipcMain.handle('install-update-now', () => {
    // isSilent: true (no external installer wizard/prompts), isForceRunAfter: true (restart immediately)
    autoUpdater.quitAndInstall(true, true);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
