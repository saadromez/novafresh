import { BrowserWindow } from 'electron';
import Database from 'better-sqlite3';
import { getRemotePool, checkRemoteConnection, initRemoteTables, getRemoteStatus } from './remoteDb';
import { getSriLankaNowString } from './dateUtils';

let syncInterval: NodeJS.Timeout | null = null;
let isSyncing = false;
let lastSyncTime: string | null = null;
let lastSyncResult: { success: boolean; message: string; pendingCount: number } = {
  success: true,
  message: 'Initialized',
  pendingCount: 0
};

// In-memory buffer of recent sync log messages for instant display
const recentSyncLogs: string[] = [];

export function getRecentSyncLogs(): string[] {
  return [...recentSyncLogs];
}

// Broadcast a real log line to all open windows so the Backup Hub can display it
export function syncLog(msg: string) {
  const ts = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const entry = `${ts}  ${msg}`;
  recentSyncLogs.push(entry);
  if (recentSyncLogs.length > 300) recentSyncLogs.shift();
  console.log(entry);
  try {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('sync-log', entry);
    });
  } catch (_) {}
}

export function initLocalSchema(db: Database.Database) {
  // Ensure local branches table
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

    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      action TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      retries INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS terminal_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS held_bills (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      terminal_id TEXT NOT NULL,
      bill_reference TEXT,
      order_type TEXT,
      table_no TEXT,
      customer_data TEXT,
      items_json TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

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

    CREATE TABLE IF NOT EXISTS reset_events_processed (
      event_id INTEGER PRIMARY KEY,
      section TEXT NOT NULL,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deleted_records_processed (
      id INTEGER PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      processed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Safely add missing columns to existing tables
  const addColumnSafely = (table: string, columnDef: string) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef};`);
    } catch (e) {
      // Column likely already exists
    }
  };

  addColumnSafely('products', 'branch_id TEXT DEFAULT "ALL"');
  addColumnSafely('products', 'wholesale_price REAL DEFAULT 0');
  addColumnSafely('products', 'barcode TEXT');
  addColumnSafely('products', 'unit TEXT DEFAULT "pc"');
  addColumnSafely('products', 'synced INTEGER DEFAULT 1');
  addColumnSafely('products', 'is_scale_item INTEGER DEFAULT 0');
  addColumnSafely('products', 'plu TEXT');

  addColumnSafely('invoice_items', 'unit TEXT DEFAULT "pc"');

  addColumnSafely('invoices', 'remote_id TEXT');
  addColumnSafely('invoices', 'invoice_no TEXT');
  addColumnSafely('invoices', 'branch_id TEXT DEFAULT "BR-MAIN"');
  addColumnSafely('invoices', 'terminal_id TEXT DEFAULT "TERM-01"');
  addColumnSafely('invoices', 'order_type TEXT DEFAULT "takeaway"');
  addColumnSafely('invoices', 'table_no TEXT');
  addColumnSafely('invoices', 'pricing_type TEXT DEFAULT "retail"');
  addColumnSafely('invoices', 'subtotal REAL DEFAULT 0');
  addColumnSafely('invoices', 'discount REAL DEFAULT 0');
  addColumnSafely('invoices', 'items TEXT');
  addColumnSafely('invoices', 'sale_type TEXT DEFAULT "SALE"');
  addColumnSafely('invoices', 'parent_invoice_id INTEGER');
  addColumnSafely('invoices', 'cash_paid REAL DEFAULT 0');
  addColumnSafely('invoices', 'card_paid REAL DEFAULT 0');
  addColumnSafely('invoices', 'other_paid REAL DEFAULT 0');
  addColumnSafely('invoices', 'balance_due REAL DEFAULT 0');
  addColumnSafely('invoices', 'change_returned REAL DEFAULT 0');
  addColumnSafely('invoices', 'cashier TEXT DEFAULT "Cashier"');
  addColumnSafely('invoices', 'customer_name TEXT');
  addColumnSafely('invoices', 'customer_phone TEXT');
  addColumnSafely('invoices', 'amount_paid REAL DEFAULT 0');
  addColumnSafely('invoices', 'synced INTEGER DEFAULT 0');

  addColumnSafely('users', 'branch_id TEXT DEFAULT "ALL"');
  addColumnSafely('users', 'allowed_terminals TEXT DEFAULT "ALL"');
  addColumnSafely('users', 'phone TEXT');
  addColumnSafely('users', 'nic TEXT');
  addColumnSafely('users', 'address TEXT');
  addColumnSafely('users', 'salary REAL DEFAULT 0');
  addColumnSafely('users', 'bank_account TEXT');
  addColumnSafely('users', 'updated_at DATETIME');

  addColumnSafely('custom_bill_items', 'synced INTEGER DEFAULT 0');
  addColumnSafely('custom_bill_items', 'remote_id INTEGER');

  try {
    db.exec(`DELETE FROM custom_bill_items WHERE invoice_id IS NOT NULL AND invoice_id NOT IN (SELECT id FROM invoices)`);
  } catch (_) {}

  // Ensure held_bills has both modern and legacy columns
  addColumnSafely('held_bills', 'cart_data TEXT');
  addColumnSafely('held_bills', 'customer_id INTEGER');
  addColumnSafely('held_bills', 'customer_name TEXT');
  addColumnSafely('held_bills', 'items_json TEXT');
  addColumnSafely('held_bills', 'total REAL DEFAULT 0');
  addColumnSafely('held_bills', 'branch_id TEXT DEFAULT "BR-MAIN"');
  addColumnSafely('held_bills', 'terminal_id TEXT DEFAULT "TERM-01"');
  addColumnSafely('held_bills', 'bill_reference TEXT');
  addColumnSafely('held_bills', 'order_type TEXT DEFAULT "retail"');
  addColumnSafely('held_bills', 'table_no TEXT');
  addColumnSafely('held_bills', 'customer_data TEXT');

  // Ensure customers table columns
  addColumnSafely('customers', 'barcode TEXT');
  addColumnSafely('customers', 'points INTEGER DEFAULT 0');
  addColumnSafely('customers', 'credit_balance REAL DEFAULT 0');
  addColumnSafely('customers', 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP');

  addColumnSafely('sessions', 'branch_id TEXT DEFAULT "BR-MAIN"');
  addColumnSafely('sessions', 'terminal_id TEXT DEFAULT "TERM-01"');
  addColumnSafely('sessions', 'username TEXT');
  addColumnSafely('sessions', 'cash_sales REAL DEFAULT 0');
  addColumnSafely('sessions', 'card_sales REAL DEFAULT 0');
  addColumnSafely('sessions', 'other_sales REAL DEFAULT 0');
  addColumnSafely('sessions', 'total_sales REAL DEFAULT 0');
  addColumnSafely('sessions', 'total_refunds REAL DEFAULT 0');
  addColumnSafely('sessions', 'cash_in REAL DEFAULT 0');
  addColumnSafely('sessions', 'cash_out REAL DEFAULT 0');
  addColumnSafely('sessions', 'discrepancy REAL DEFAULT 0');
  addColumnSafely('sessions', 'actual_cash REAL DEFAULT 0');
  addColumnSafely('sessions', 'synced INTEGER DEFAULT 0');
  addColumnSafely('sessions', 'remote_id TEXT');
  addColumnSafely('invoices', 'remote_id TEXT');

  addColumnSafely('promotions', 'remote_id TEXT');
  addColumnSafely('promotions', 'branch_id TEXT DEFAULT "ALL"');
  addColumnSafely('promotions', 'synced INTEGER DEFAULT 0');
  addColumnSafely('promotions', 'type TEXT DEFAULT "LEGACY"');
  addColumnSafely('promotions', 'value REAL DEFAULT 0');
  addColumnSafely('promotions', 'start_date TEXT');
  addColumnSafely('promotions', 'end_date TEXT');
  addColumnSafely('promotions', 'discount_type TEXT DEFAULT "PERCENT"');
  addColumnSafely('promotions', 'discount_value REAL DEFAULT 0');
  addColumnSafely('promotions', 'status TEXT DEFAULT "ACTIVE"');

  addColumnSafely('promotion_items', 'barcode TEXT');

  addColumnSafely('customers', 'synced INTEGER DEFAULT 0');
  addColumnSafely('customers', 'remote_id TEXT');
  addColumnSafely('customers', 'address TEXT');
  addColumnSafely('customers', 'email TEXT');

  addColumnSafely('vouchers', 'synced INTEGER DEFAULT 0');
  addColumnSafely('vouchers', 'remote_id TEXT');
  addColumnSafely('vouchers', 'branch_id TEXT DEFAULT "ALL"');

  addColumnSafely('suppliers', 'synced INTEGER DEFAULT 0');
  addColumnSafely('suppliers', 'remote_id TEXT');

  addColumnSafely('categories', 'synced INTEGER DEFAULT 0');
  addColumnSafely('categories', 'remote_id TEXT');

  addColumnSafely('expenses', 'branch_id TEXT DEFAULT "BR-MAIN"');
  addColumnSafely('expenses', 'terminal_id TEXT DEFAULT "TERM-01"');
  addColumnSafely('expenses', 'synced INTEGER DEFAULT 0');
  addColumnSafely('expenses', 'remote_id TEXT');

  addColumnSafely('settings', 'synced INTEGER DEFAULT 0');

  addColumnSafely('users', 'pin TEXT');
  addColumnSafely('users', 'role TEXT DEFAULT "Cashier"');
  addColumnSafely('users', 'permissions TEXT');
  addColumnSafely('users', 'branch_id TEXT DEFAULT "ALL"');
  addColumnSafely('users', 'phone TEXT');
  addColumnSafely('users', 'nic TEXT');
  addColumnSafely('users', 'address TEXT');
  addColumnSafely('users', 'salary REAL DEFAULT 0');
  addColumnSafely('users', 'bank_account TEXT');
  addColumnSafely('users', 'allowed_terminals TEXT DEFAULT "ALL"');
  addColumnSafely('users', 'updated_at TEXT DEFAULT CURRENT_TIMESTAMP');

  // Purchase Orders & GRN enterprise columns
  addColumnSafely('purchase_orders', 'status TEXT DEFAULT "DRAFT"');
  addColumnSafely('purchase_orders', 'expected_delivery_date TEXT');
  addColumnSafely('purchase_orders', 'created_by TEXT');
  addColumnSafely('purchase_orders', 'approved_by TEXT');
  addColumnSafely('purchase_orders', 'rejection_reason TEXT');
  addColumnSafely('purchase_orders', 'supplier_invoice_no TEXT');
  addColumnSafely('purchase_orders', 'total_cost REAL DEFAULT 0');
  addColumnSafely('purchase_orders', 'total_amount REAL DEFAULT 0');

  addColumnSafely('grn', 'status TEXT DEFAULT "APPROVED"');
  addColumnSafely('grn', 'supplier_invoice_no TEXT');
  addColumnSafely('grn', 'received_by TEXT');
  addColumnSafely('grn', 'approved_by TEXT');
  addColumnSafely('grn', 'rejection_reason TEXT');
  addColumnSafely('grn', 'items_json TEXT');
  addColumnSafely('grn', 'total_amount REAL DEFAULT 0');
  addColumnSafely('grn', 'total_cost REAL DEFAULT 0');

  addColumnSafely('grn_items', 'variant_id INTEGER');
  addColumnSafely('grn_items', 'free_qty INTEGER DEFAULT 0');
  addColumnSafely('grn_items', 'effective_cost REAL DEFAULT 0');
  addColumnSafely('grn_items', 'new_sale_price REAL');
  addColumnSafely('grn_items', 'new_wholesale_price REAL DEFAULT 0');
  addColumnSafely('grn_items', 'synced INTEGER DEFAULT 0');
  addColumnSafely('grn_items', 'remote_id TEXT');

  addColumnSafely('inventory_ledger', 'synced INTEGER DEFAULT 0');
  addColumnSafely('inventory_ledger', 'remote_id TEXT');

  db.exec(`
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
  addColumnSafely('session_transactions', 'shift_id TEXT');
  addColumnSafely('session_transactions', 'terminal_id TEXT');
  addColumnSafely('session_transactions', 'synced INTEGER DEFAULT 0');
  addColumnSafely('session_transactions', 'remote_id TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nic TEXT,
      phone TEXT,
      basic_salary REAL DEFAULT 0
    );
  `);
  addColumnSafely('employees', 'nic TEXT');
  addColumnSafely('employees', 'phone TEXT');
  addColumnSafely('employees', 'basic_salary REAL DEFAULT 0');

  // Ensure user_roles table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      permissions TEXT NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  try {
    const roleCount: any = db.prepare('SELECT COUNT(*) as cnt FROM user_roles').get();
    if (roleCount && roleCount.cnt === 0) {
      const defaultRoles = [
        {
          name: 'Admin',
          permissions: JSON.stringify(['POS', 'Inventory', 'Reports', 'Settings', 'Users', 'Backoffice', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Branches', 'Refunds', 'Discounts', 'Delete Invoice']),
          description: 'Full administrative access across all branches and terminals'
        },
        {
          name: 'Manager',
          permissions: JSON.stringify(['POS', 'Inventory', 'Reports', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Refunds', 'Discounts']),
          description: 'Branch management with inventory, restocking, and reports access'
        },
        {
          name: 'Supervisor',
          permissions: JSON.stringify(['POS', 'Reports', 'Customers', 'Vouchers', 'Promotions', 'Refunds', 'Discounts']),
          description: 'Floor supervisor authorized for customer discounts and returns'
        },
        {
          name: 'Cashier',
          permissions: JSON.stringify(['POS']),
          description: 'Front-desk cashier limited to billing and shift management'
        },
        {
          name: 'Inventory Clerk',
          permissions: JSON.stringify(['Inventory', 'Suppliers']),
          description: 'Stock keeper handling GRN, purchase orders, and stock updates'
        }
      ];
      const insRole = db.prepare('INSERT INTO user_roles (name, permissions, description) VALUES (?, ?, ?)');
      for (const r of defaultRoles) {
        insRole.run(r.name, r.permissions, r.description);
      }
    }
  } catch (e) {}

  // Seed default terminal config if not set
  const getConfig = (key: string, defaultValue: string) => {
    const row: any = db.prepare('SELECT value FROM terminal_config WHERE key = ?').get(key);
    if (!row) {
      db.prepare('INSERT INTO terminal_config (key, value) VALUES (?, ?)').run(key, defaultValue);
      return defaultValue;
    }
    return row.value;
  };

  getConfig('current_branch_id', 'BR-MAIN');
  getConfig('current_branch_name', 'Main FreshMart Branch');
  getConfig('current_terminal_id', 'TERM-01');
  getConfig('current_terminal_name', 'Touch Terminal 01');
  getConfig('is_backoffice', 'false');
  getConfig('device_provisioned', 'false');

  // Seed initial local branch if none
  const branchCount: any = db.prepare('SELECT COUNT(*) as cnt FROM branches').get();
  if (branchCount.cnt === 0) {
    db.prepare(`
      INSERT INTO branches (id, name, code, address, phone)
      VALUES ('BR-MAIN', 'Main FreshMart Branch', 'BR01', 'Nova FreshMart Main Store', '011-2345678')
    `).run();
  }

  // Seed initial local terminals only on first-ever install
  const isTerminalsInitialized = getConfig('terminals_initialized', 'false');
  if (isTerminalsInitialized !== 'true') {
    const defaultTerminals = [
      { id: 'TERM-01', branch_id: 'BR-MAIN', name: 'Touch Terminal 01 (Billing Counter 1)' },
      { id: 'TERM-02', branch_id: 'BR-MAIN', name: 'Touch Terminal 02 (Billing Counter 2)' },
      { id: 'TERM-03', branch_id: 'BR-MAIN', name: 'Touch Terminal 03 (Express Counter)' },
      { id: 'TERM-BACKOFFICE', branch_id: 'BR-MAIN', name: 'Back Office PC (Manager Desk)' }
    ];
    for (const dt of defaultTerminals) {
      db.prepare(`
        INSERT OR IGNORE INTO terminals (id, branch_id, name, status)
        VALUES (?, ?, ?, 'online')
      `).run(dt.id, dt.branch_id, dt.name);
    }
    setTerminalConfig(db, 'terminals_initialized', 'true');
  }
}

export function getTerminalConfig(db: Database.Database) {
  const rows = db.prepare('SELECT key, value FROM terminal_config').all() as { key: string; value: string }[];
  const config: Record<string, string> = {};
  for (const r of rows) {
    config[r.key] = r.value;
  }
  return config;
}

export function setTerminalConfig(db: Database.Database, key: string, value: string) {
  db.prepare('INSERT OR REPLACE INTO terminal_config (key, value) VALUES (?, ?)').run(key, String(value));
}

// Push local unsynced records to MariaDB
export async function pushUnsyncedData(db: Database.Database) {
  const isOnline = await checkRemoteConnection();
  if (!isOnline) {
    throw new Error('Remote database offline');
  }

  const pool = getRemotePool();
  const config = getTerminalConfig(db);
  const branchId = config.current_branch_id || 'BR-MAIN';
  const terminalId = config.current_terminal_id || 'TERM-01';
  syncLog(`[PUSH] Starting push â€” branch:${branchId} terminal:${terminalId}`);

  // 1. Sync pending invoices
  try {
    const unsyncedInvoices: any[] = db.prepare(`
      SELECT * FROM invoices WHERE synced = 0 LIMIT 50
    `).all();

    for (const inv of unsyncedInvoices) {
      let cartItems: any[] = [];
      try {
        cartItems = typeof inv.items === 'string' ? JSON.parse(inv.items) : (inv.items || []);
      } catch (e) {
        cartItems = [];
      }

      const remoteSaleId = inv.remote_id || `INV-${inv.branch_id || branchId}-${inv.terminal_id || terminalId}-${inv.id}`;
      const invoiceNumber = inv.invoice_no || `INV-${inv.id}`;
      const itemsJsonStr = typeof inv.items === 'string' && inv.items.trim() ? inv.items : JSON.stringify(cartItems || []);

      let subtotalToPush = Number(inv.subtotal != null ? inv.subtotal : (Number(inv.total || 0) + Number(inv.discount || 0)));
      let totalToPush = Number(inv.total || 0);
      if (totalToPush === 0 && cartItems.length > 0 && inv.sale_type !== 'REFUND') {
        const itemsSum = cartItems.reduce((s: number, it: any) => s + (Number(it.price || 0) * Number(it.quantity || 1)), 0);
        if (itemsSum > 0) {
          subtotalToPush = itemsSum;
          totalToPush = Math.max(0, itemsSum - Number(inv.discount || 0));
          console.log(`[pushUnsyncedData] Auto-healed 0 total on invoice ${inv.id} to ${totalToPush}`);
          try {
            db.prepare('UPDATE invoices SET total = ?, subtotal = ? WHERE id = ?').run(totalToPush, subtotalToPush, inv.id);
          } catch (_) {}
        }
      }

      await pool.query(`
        INSERT INTO novafreshmart_sales (
          id, branch_id, terminal_id, shift_id, invoice_no, cashier,
          order_type, table_no, customer_name, customer_phone, pricing_type,
          subtotal, discount, tax, total, payment_method,
          cash_paid, card_paid, other_paid, balance_due, change_returned,
          status, created_at, items_json, sale_type, parent_invoice_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total = VALUES(total),
          discount = VALUES(discount),
          subtotal = VALUES(subtotal),
          status = VALUES(status),
          items_json = VALUES(items_json),
          sale_type = VALUES(sale_type),
          parent_invoice_id = VALUES(parent_invoice_id),
          synced_at = CURRENT_TIMESTAMP
      `, [
        remoteSaleId,
        inv.branch_id || branchId,
        inv.terminal_id || terminalId,
        inv.session_id ? String(inv.session_id) : null,
        invoiceNumber,
        inv.cashier || 'Cashier',
        inv.order_type || 'takeaway',
        inv.table_no || null,
        inv.customer_name || null,
        inv.customer_phone || null,
        inv.pricing_type || 'retail',
        subtotalToPush,
        Number(inv.discount || 0),
        0,
        totalToPush,
        inv.payment_method || 'Cash',
        Number(inv.cash_paid || (inv.payment_method === 'Cash' ? totalToPush : 0)),
        Number(inv.card_paid || (inv.payment_method === 'Card' ? totalToPush : 0)),
        Number(inv.other_paid || 0),
        Number(inv.balance_due || 0),
        Number(inv.change_returned || 0),
        'completed',
        inv.created_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        itemsJsonStr,
        inv.sale_type || 'SALE',
        inv.parent_invoice_id ? String(inv.parent_invoice_id) : null
      ]);

      // Insert sale items into remote
      for (const item of cartItems) {
        await pool.query(`
          INSERT INTO novafreshmart_sale_items (
            sale_id, product_id, name, price, quantity, discount, subtotal, unit
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          remoteSaleId,
          item.id ? String(item.id) : null,
          item.name || 'Item',
          Number(item.price || 0),
          Number(item.quantity || 1),
          Number(item.discount || 0),
          Number((item.price || 0) * (item.quantity || 1)),
          item.unit || 'pcs'
        ]);

        // Atomically decrement or increment central stock on MariaDB
        // For sales (quantity > 0): stock decreases
        // For returns/refunds (quantity < 0): stock increases
        const qtyDelta = Number(item.quantity || 1);
        if (item.id || item.barcode) {
          try {
            await pool.query(`
              UPDATE novafreshmart_products 
              SET stock = GREATEST(0, stock - ?), updated_at = NOW() 
              WHERE id = ? OR (barcode = ? AND barcode IS NOT NULL AND barcode != '')
            `, [qtyDelta, String(item.id || ''), String(item.barcode || '')]);
          } catch (e) {
            console.warn('[Sync] Could not update remote stock delta:', e);
          }
        }
      }

      // Mark local invoice as synced
      db.prepare('UPDATE invoices SET synced = 1, remote_id = ?, invoice_no = COALESCE(invoice_no, ?) WHERE id = ?').run(remoteSaleId, invoiceNumber, inv.id);
    }

    // If any sales were pushed and stock was updated, bump catalog_last_updated so other terminals refresh live within 3.5s
    if (unsyncedInvoices.length > 0) {
      try {
        await pool.query(`
          INSERT INTO novafreshmart_settings (key_name, value_text, updated_at)
          VALUES ('catalog_last_updated', NOW(), NOW())
          ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()
        `);
      } catch (_) {}
    }
  } catch (invErr) {
    console.warn('[Sync] Could not push invoices to remote:', invErr);
  }

  // 2. Sync sessions / shifts (push local terminal's sessions, never duplicate remote IDs)
  try {
    const currentTermId = terminalId || config.current_terminal_id || 'TERM-01';
    const sessionsToPush: any[] = db.prepare(`
      SELECT * FROM sessions 
      WHERE (terminal_id = ? OR terminal_id IS NULL)
        AND (synced = 0 OR synced IS NULL OR UPPER(status) = 'OPEN')
      LIMIT 20
    `).all(currentTermId);

    for (const sess of sessionsToPush) {
      const shiftId = sess.remote_id || `SH-${sess.branch_id || branchId}-${sess.terminal_id || currentTermId}-${sess.id}`;
      const isOpen = (sess.status || 'OPEN').toUpperCase() === 'OPEN';

      // Compute live sales for this session from local invoices (by session_id or terminal & time window)
      const liveStats: any = db.prepare(`
        SELECT 
          COUNT(*) as cnt,
          COALESCE(SUM(total), 0) as tot,
          COALESCE(SUM(CASE 
            WHEN UPPER(payment_method) = 'CASH' THEN total
            WHEN cash_paid > 0 THEN MAX(0, cash_paid - change_returned)
            ELSE 0 
          END), 0) as cash,
          COALESCE(SUM(CASE WHEN UPPER(payment_method) = 'CARD' THEN total ELSE card_paid END), 0) as card,
          COALESCE(SUM(CASE WHEN UPPER(payment_method) NOT IN ('CASH', 'CARD') THEN total ELSE other_paid END), 0) as oth
        FROM invoices
        WHERE session_id = ? OR (terminal_id = ? AND (created_at >= ? AND (created_at <= ? OR ? IS NULL)))
      `).get(sess.id, sess.terminal_id || currentTermId, sess.opened_at, sess.closed_at, sess.closed_at);

      // Get Cash In and Cash Out / Expenses for this session
      const txStats: any = db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN type = 'CASH_IN' THEN amount ELSE 0 END), 0) as cash_in,
          COALESCE(SUM(CASE WHEN type = 'CASH_OUT' OR type = 'EXPENSE' THEN amount ELSE 0 END), 0) as cash_out
        FROM session_transactions
        WHERE session_id = ? OR shift_id = ?
      `).get(sess.id, shiftId);

      const totalSales = liveStats?.cnt > 0 ? Number(liveStats.tot) : Number(sess.total_sales || 0);
      const cashSales = liveStats?.cnt > 0 ? Number(liveStats.cash) : Number(sess.cash_sales || 0);
      const cardSales = liveStats?.cnt > 0 ? Number(liveStats.card) : Number(sess.card_sales || 0);
      const otherSales = liveStats?.cnt > 0 ? Number(liveStats.oth) : Number(sess.other_sales || 0);
      const cashIn = Number(txStats?.cash_in || sess.cash_in || 0);
      const cashOut = Number(txStats?.cash_out || sess.cash_out || 0);

      // Opening Balance + Cash Sales + Cash In - Cash Out - Refunds = Expected Till Cash
      const totalRefunds = Number(sess.total_refunds || 0);
      const expectedCash = Number(sess.opening_cash || 0) + cashSales + cashIn - cashOut - totalRefunds;
      // Discrepancy is only calculated when actual count is explicitly performed (not on auto-closed / uncounted shifts)
      const hasActualCount = sess.actual_cash != null && (Number(sess.actual_cash) > 0 || sess.is_audited || (sess.notes && sess.notes.includes('Audit')));
      const discrepancy = isOpen || !hasActualCount ? 0 : Number((Number(sess.actual_cash || sess.closing_cash || 0)) - expectedCash);

      await pool.query(`
        INSERT INTO novafreshmart_terminal_shifts (
          id, branch_id, terminal_id, username, opened_at, closed_at,
          opening_cash, expected_cash, closing_cash,
          cash_sales, card_sales, other_sales, total_sales,
          total_refunds, cash_in, cash_out, discrepancy, notes, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          opened_at = VALUES(opened_at),
          opening_cash = VALUES(opening_cash),
          closed_at = VALUES(closed_at),
          expected_cash = VALUES(expected_cash),
          closing_cash = VALUES(closing_cash),
          cash_sales = VALUES(cash_sales),
          card_sales = VALUES(card_sales),
          other_sales = VALUES(other_sales),
          total_sales = VALUES(total_sales),
          cash_in = VALUES(cash_in),
          cash_out = VALUES(cash_out),
          discrepancy = VALUES(discrepancy),
          status = VALUES(status),
          synced_at = CURRENT_TIMESTAMP
      `, [
        shiftId,
        sess.branch_id || branchId,
        sess.terminal_id || currentTermId,
        sess.username || 'Cashier',
        sess.opened_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
        sess.closed_at || null,
        Number(sess.opening_cash || 0),
        expectedCash,
        Number(sess.closing_cash || sess.actual_cash || 0),
        cashSales,
        cardSales,
        otherSales,
        totalSales,
        Number(sess.total_refunds || 0),
        cashIn,
        cashOut,
        discrepancy,
        sess.notes || '',
        isOpen ? 'open' : 'closed'
      ]);

      db.prepare('UPDATE sessions SET synced = 1, remote_id = ?, cash_in = ?, cash_out = ?, discrepancy = ? WHERE id = ?').run(shiftId, cashIn, cashOut, discrepancy, sess.id);
    }
  } catch (sessErr) {
    console.warn('[Sync] Could not push sessions to remote:', sessErr);
  }

  // 2b. Push pending session transactions (Cash In / Cash Out / Expenses)
  try {
    const unsyncedTxs: any[] = db.prepare(`
      SELECT st.*, s.remote_id as sess_remote_id, s.branch_id as sess_branch_id, s.terminal_id as sess_terminal_id
      FROM session_transactions st
      LEFT JOIN sessions s ON st.session_id = s.id
      WHERE st.synced = 0 OR st.synced IS NULL
      LIMIT 100
    `).all();

    if (unsyncedTxs.length > 0) {
      const markTxSynced = db.prepare('UPDATE session_transactions SET synced = 1, remote_id = ?, shift_id = ? WHERE id = ?');
      for (const tx of unsyncedTxs) {
        const term = tx.terminal_id || tx.sess_terminal_id || currentTermId;
        const branch = tx.sess_branch_id || branchId;
        const shiftId = tx.shift_id || tx.sess_remote_id || `SH-${branch}-${term}-${tx.session_id}`;
        const txRemoteId = tx.remote_id || `STX-${term}-${tx.id}-${Date.now()}`;

        await pool.query(`
          INSERT INTO novafreshmart_session_transactions (
            id, shift_id, session_id, terminal_id, type, amount, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            type = VALUES(type),
            amount = VALUES(amount),
            notes = VALUES(notes)
        `, [
          txRemoteId,
          shiftId,
          tx.session_id,
          term,
          String(tx.type || 'CASH_IN').toUpperCase(),
          Number(tx.amount || 0),
          tx.notes || null,
          tx.created_at ? new Date(tx.created_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ')
        ]);

        markTxSynced.run(txRemoteId, shiftId, tx.id);
      }
    }
  } catch (txErr) {
    console.warn('[Sync] Could not push session transactions to remote:', txErr);
  }

  // 3. Sync pending shift handovers
  const unsyncedHandovers: any[] = db.prepare(`
    SELECT * FROM shift_handovers WHERE synced = 0 LIMIT 20
  `).all();

  for (const h of unsyncedHandovers) {
    try {
      await pool.query(`
        INSERT INTO novafreshmart_shift_handovers (
          session_id, branch_id, terminal_id, outgoing_cashier, incoming_cashier,
          shift_started_at, handover_time, bills_count, cash_sales, card_sales, other_sales,
          total_sales, opening_float, expected_drawer_cash, counted_cash, cash_variance,
          handover_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        String(h.session_id),
        h.branch_id || branchId,
        h.terminal_id || terminalId,
        h.outgoing_cashier || 'Cashier',
        h.incoming_cashier || 'Cashier',
        h.shift_started_at || null,
        h.handover_time || new Date().toISOString().slice(0, 19).replace('T', ' '),
        Number(h.bills_count || 0),
        Number(h.cash_sales || 0),
        Number(h.card_sales || 0),
        Number(h.other_sales || 0),
        Number(h.total_sales || 0),
        Number(h.opening_float || 0),
        Number(h.expected_drawer_cash || 0),
        Number(h.counted_cash || 0),
        Number(h.cash_variance || 0),
        h.handover_notes || ''
      ]);

      db.prepare('UPDATE shift_handovers SET synced = 1 WHERE id = ?').run(h.id);
    } catch (e) {
      console.warn('[Sync] Could not push shift handover to remote:', e);
    }
  }

  // 4. Update terminal heartbeat on remote
  try {
    await pool.query(`
      INSERT INTO novafreshmart_terminals (
        id, branch_id, name, last_active_at, last_sync_at, status
      ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'online')
      ON DUPLICATE KEY UPDATE
        branch_id = VALUES(branch_id),
        name = VALUES(name),
        last_active_at = CURRENT_TIMESTAMP,
        last_sync_at = CURRENT_TIMESTAMP,
        status = 'online'
    `, [
      terminalId,
      branchId,
      config.current_terminal_name || 'Touch Terminal 01'
    ]);
  } catch (hbErr) {
    console.warn('[Sync] Could not update terminal heartbeat:', hbErr);
  }

  // 5. Push local terminals to remote MariaDB
  try {
    let deletedTermIds = new Set<string>();
    try {
      deletedTermIds = new Set(
        db.prepare("SELECT record_id FROM deleted_records_processed WHERE table_name = 'terminals'").all().map((r: any) => String(r.record_id))
      );
    } catch (_) {}

    const localTerms: any[] = db.prepare('SELECT * FROM terminals').all();
    for (const t of localTerms) {
      if (deletedTermIds.has(String(t.id))) continue;
      await pool.query(`
        INSERT INTO novafreshmart_terminals (id, branch_id, name, status, is_active)
        VALUES (?, ?, ?, 'online', 1)
        ON DUPLICATE KEY UPDATE
          branch_id = VALUES(branch_id),
          name = VALUES(name),
          is_active = 1
      `, [t.id, t.branch_id || branchId, t.name || t.id]);
    }
  } catch (err) {
    console.warn('[Sync] Could not push terminals to remote:', err);
  }

  // 6. Push local employees / users to remote MariaDB
  try {
    let deletedUserIds = new Set<string>();
    try {
      deletedUserIds = new Set(
        db.prepare("SELECT record_id FROM deleted_records_processed WHERE table_name = 'users' OR table_name = 'employees'").all().map((r: any) => String(r.record_id))
      );
    } catch (_) {}

    const localUsers: any[] = db.prepare('SELECT * FROM users').all();
    const ALL_ADMIN_PERMS = JSON.stringify(['POS', 'Inventory', 'GRN', 'Reports', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Branches', 'Settings', 'Users', 'Refunds', 'Discounts', 'Delete Invoice', 'View Invoices', 'Edit Invoices', 'Custom Items', 'Backup Hub']);
    for (const u of localUsers) {
      const empRemoteId = u.remote_id || `EMP-${String(u.username).toLowerCase().replace(/[^a-z0-9]/g, '')}`;
      if (deletedUserIds.has(empRemoteId) || (deletedUserIds.has(String(u.username)) && u.username.toLowerCase() !== 'admin')) continue;
      const permsStr = u.role === 'Admin' ? ALL_ADMIN_PERMS : (typeof u.permissions === 'string' ? u.permissions : JSON.stringify(u.permissions || ['POS']));
      await pool.query(`
        INSERT INTO novafreshmart_employees (
          id, branch_id, username, pin, role, name, phone, permissions, allowed_terminals, nic, address, salary, bank_account, is_active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, COALESCE(?, NOW()))
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
        u.branch_id || 'ALL',
        u.username,
        u.pin,
        u.role || 'Cashier',
        u.username,
        u.phone || '',
        permsStr,
        u.allowed_terminals || 'ALL',
        u.nic || null,
        u.address || null,
        Number(u.salary || 0),
        u.bank_account || null,
        u.updated_at ? String(u.updated_at) : null
      ]);
    }

    // Also push staff from employees table if any exist
    try {
      const staffList: any[] = db.prepare('SELECT * FROM employees').all();
      for (const st of staffList) {
        if (!st.name) continue;
        const empId = `STAFF-${st.id}`;
        await pool.query(`
          INSERT INTO novafreshmart_employees (
            id, branch_id, username, pin, role, name, phone, permissions, allowed_terminals, nic, salary, is_active
          ) VALUES (?, 'ALL', ?, '1234', 'Cashier', ?, ?, '["POS"]', 'ALL', ?, ?, 1)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            phone = VALUES(phone),
            nic = VALUES(nic),
            salary = VALUES(salary),
            is_active = 1
        `, [empId, st.name.toLowerCase().replace(/[^a-z0-9]/g, '') || `staff${st.id}`, st.name, st.phone || '', st.nic || null, Number(st.basic_salary || 0)]);
      }
    } catch (_) {}
  } catch (err) {
    console.warn('[Sync] Could not push employees to remote:', err);
  }

  // 7. Push local products to remote MariaDB
  try {
    const [remoteProdCountRows]: any = await pool.query('SELECT COUNT(*) as cnt FROM novafreshmart_products');
    const remoteProdCount = Number(remoteProdCountRows?.[0]?.cnt || 0);
    const localProdCount: any = db.prepare('SELECT COUNT(*) as cnt FROM products').get();

    // If remote has no products, push ALL local products so remote is seeded
    const shouldPushAll = remoteProdCount === 0 && (localProdCount?.cnt || 0) > 0;
    const prodsToPush: any[] = shouldPushAll
      ? db.prepare('SELECT * FROM products').all()
      : db.prepare('SELECT * FROM products WHERE synced = 0 OR synced IS NULL').all();

    syncLog(`[PUSH] Products: remote=${remoteProdCount} local=${localProdCount?.cnt} toSync=${prodsToPush.length} pushAll=${shouldPushAll}`);

    for (const p of prodsToPush) {
      const allowOverride = p.allow_price_override !== 0 && p.allow_price_override !== false ? 1 : 0;
      const catRow: any = p.category_id ? db.prepare('SELECT name FROM categories WHERE id = ?').get(p.category_id) : null;
      const catName = catRow?.name || 'General';
      try {
        await pool.query(`
          INSERT INTO novafreshmart_products (
            id, branch_id, barcode, name, category, category_id, price, wholesale_price, cost_price, stock, unit, is_scale_item, plu, allow_price_override, expiry_date, is_active
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
          String(p.id),
          p.branch_id || 'ALL',
          p.barcode || '',
          p.name,
          catName,
          String(p.category_id || 1),
          Number(p.price || 0),
          Number(p.wholesale_price || 0),
          Number(p.cost_price || 0),
          Number(p.stock || 0),
          (p.unit && !/^\d+$/.test(String(p.unit).trim())) ? p.unit : 'pc',
          p.is_scale_item ? 1 : 0,
          p.plu || null,
          allowOverride,
          p.expiry_date || null
        ]);
        // Only mark synced=1 after confirmed remote write
        db.prepare('UPDATE products SET synced = 1 WHERE id = ?').run(p.id);
        syncLog(`[PUSH] Product OK: id=${p.id} "${p.name}"`);
      } catch (prodErr: any) {
        syncLog(`[PUSH] ERROR product id=${p.id} "${p.name}": ${prodErr.message}`);
        console.warn('[Sync] Failed to push product', p.id, p.name, ':', prodErr.message);
        // Leave synced=0 so it retries next cycle
      }
    }
    if (prodsToPush.length > 0) {
      await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()").catch(() => {});
    }
  } catch (err) {
    console.warn('[Sync] Could not push products to remote:', err);
  }

  // 8. Push local promotions & promotional discount rules to remote MariaDB
  try {
    const localPromos: any[] = db.prepare('SELECT * FROM promotions WHERE synced = 0 OR synced IS NULL OR remote_id IS NULL').all();
    for (const p of localPromos) {
      const promoRemoteId = p.remote_id || `PROMO-${p.id}-${Date.now().toString(36)}`;
      if (!p.remote_id) {
        db.prepare('UPDATE promotions SET remote_id = ? WHERE id = ?').run(promoRemoteId, p.id);
      }

      await pool.query(`
        INSERT INTO novafreshmart_promotions (
          id, branch_id, name, start_date, end_date, discount_type, discount_value, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          branch_id = VALUES(branch_id),
          name = VALUES(name),
          start_date = VALUES(start_date),
          end_date = VALUES(end_date),
          discount_type = VALUES(discount_type),
          discount_value = VALUES(discount_value),
          status = VALUES(status),
          updated_at = CURRENT_TIMESTAMP
      `, [
        promoRemoteId,
        p.branch_id || branchId || 'ALL',
        p.name,
        p.start_date || '',
        p.end_date || '',
        p.discount_type || 'PERCENT',
        Number(p.discount_value || 0),
        p.status || 'ACTIVE'
      ]);

      // Push promotion items with product barcode
      const promoItems: any[] = db.prepare('SELECT pi.*, p.barcode FROM promotion_items pi LEFT JOIN products p ON p.id = pi.product_id WHERE pi.promotion_id = ?').all(p.id);
      await pool.query('DELETE FROM novafreshmart_promotion_items WHERE promotion_id = ?', [promoRemoteId]);
      for (const it of promoItems) {
        await pool.query(`
          INSERT INTO novafreshmart_promotion_items (promotion_id, product_id, barcode, required_qty)
          VALUES (?, ?, ?, ?)
        `, [promoRemoteId, String(it.product_id), it.barcode || '', Number(it.required_qty || 1)]);
      }

      db.prepare('UPDATE promotions SET synced = 1 WHERE id = ?').run(p.id);
    }
  } catch (err) {
    console.warn('[Sync] Could not push promotions to remote:', err);
  }

  // 9. Push local customers to remote MariaDB
  try {
    const localCustomers: any[] = db.prepare('SELECT * FROM customers WHERE synced = 0 OR synced IS NULL').all();
    for (const c of localCustomers) {
      const custRemoteId = c.remote_id || `CUST-${c.id}`;
      await pool.query(`
        INSERT INTO novafreshmart_customers (
          id, branch_id, name, phone, points, credit_balance, barcode
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          phone = VALUES(phone),
          points = VALUES(points),
          credit_balance = VALUES(credit_balance),
          barcode = VALUES(barcode)
      `, [
        custRemoteId,
        c.branch_id || branchId || 'ALL',
        c.name,
        c.phone || '',
        Number(c.points || 0),
        Number(c.credit_balance || 0),
        c.barcode || ''
      ]);
      db.prepare('UPDATE customers SET synced = 1, remote_id = ? WHERE id = ?').run(custRemoteId, c.id);
    }
  } catch (err) {
    console.warn('[Sync] Could not push customers to remote:', err);
  }

  // 10. Push local vouchers & restrictions to remote MariaDB
  try {
    const localVouchers: any[] = db.prepare('SELECT * FROM vouchers WHERE synced = 0 OR synced IS NULL').all();
    for (const v of localVouchers) {
      const vRemoteId = v.remote_id || `VOUCH-${v.id}`;
      await pool.query(`
        INSERT INTO novafreshmart_vouchers (
          id, branch_id, code, name, type, amount, claimed_amount, expiry_date, status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          type = VALUES(type),
          amount = VALUES(amount),
          claimed_amount = VALUES(claimed_amount),
          expiry_date = VALUES(expiry_date),
          status = VALUES(status),
          updated_at = CURRENT_TIMESTAMP
      `, [
        vRemoteId,
        v.branch_id || 'ALL',
        v.code,
        v.name || '',
        v.type || 'FIXED',
        Number(v.amount || 0),
        Number(v.claimed_amount || 0),
        v.expiry_date || null,
        v.status || 'ACTIVE'
      ]);

      const restrs: any[] = db.prepare('SELECT * FROM voucher_restrictions WHERE voucher_id = ?').all(v.id);
      await pool.query('DELETE FROM novafreshmart_voucher_restrictions WHERE voucher_id = ?', [vRemoteId]);
      for (const r of restrs) {
        await pool.query(`
          INSERT INTO novafreshmart_voucher_restrictions (voucher_id, restriction_type, target_id)
          VALUES (?, ?, ?)
        `, [vRemoteId, r.type || r.restriction_type || 'CATEGORY', String(r.target_id)]);
      }

      db.prepare('UPDATE vouchers SET synced = 1, remote_id = ? WHERE id = ?').run(vRemoteId, v.id);
    }
  } catch (err) {
    console.warn('[Sync] Could not push vouchers to remote:', err);
  }

  // 11. Push categories to remote MariaDB
  try {
    const localCats: any[] = db.prepare('SELECT * FROM categories').all();
    for (const cat of localCats) {
      if (!cat.name || !cat.name.trim()) continue;
      const [existing]: any = await pool.query('SELECT id FROM novafreshmart_categories WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1', [cat.name]);
      if (existing && existing.length > 0) {
        await pool.query('UPDATE novafreshmart_categories SET color = ?, icon = ? WHERE id = ?', [cat.color || '', cat.icon || '', existing[0].id]);
      } else {
        const catRemoteId = cat.remote_id || `CAT-${cat.id}-${Math.floor(Math.random() * 1000)}`;
        await pool.query(`
          INSERT INTO novafreshmart_categories (id, name, color, icon)
          VALUES (?, ?, ?, ?)
        `, [catRemoteId, cat.name, cat.color || '', cat.icon || '']);
        db.prepare('UPDATE categories SET remote_id = ? WHERE id = ?').run(catRemoteId, cat.id);
      }
      try { db.prepare('UPDATE categories SET synced = 1 WHERE id = ?').run(cat.id); } catch(_) {}
    }
  } catch (err) {
    console.warn('[Sync] Could not push categories to remote:', err);
  }

  // 11c. Push brands to remote MariaDB
  try {
    const localBrands: any[] = db.prepare('SELECT * FROM brands').all();
    for (const b of localBrands) {
      if (!b.name || !b.name.trim()) continue;
      await pool.query(`
        INSERT INTO novafreshmart_brands (id, name, updated_at)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE name = VALUES(name), updated_at = NOW()
      `, [String(b.id), b.name.trim()]);
    }
  } catch (err: any) {
    console.warn('[Sync] Could not push brands to remote:', err.message);
  }

  // 11b. Push expenses to remote MariaDB
  try {
    const localExpenses: any[] = db.prepare('SELECT * FROM expenses WHERE synced = 0 OR synced IS NULL').all();
    for (const exp of localExpenses) {
      const expRemoteId = exp.remote_id || `EXP-${branchId}-${terminalId}-${exp.id}`;
      await pool.query(`
        INSERT INTO novafreshmart_expenses (
          id, branch_id, terminal_id, amount, category, description, created_by, date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          category = VALUES(category),
          description = VALUES(description),
          updated_at = NOW()
      `, [
        expRemoteId,
        exp.branch_id || branchId,
        exp.terminal_id || terminalId,
        Number(exp.amount || 0),
        exp.category || 'General',
        exp.description || '',
        exp.created_by || 'Cashier',
        exp.date || new Date().toISOString()
      ]);
      db.prepare('UPDATE expenses SET synced = 1, remote_id = ? WHERE id = ?').run(expRemoteId, exp.id);
    }
  } catch (err) {
    console.warn('[Sync] Could not push expenses to remote:', err);
  }

  // 12. Push suppliers to remote MariaDB
  try {
    const localSuppliers: any[] = db.prepare('SELECT * FROM suppliers WHERE synced = 0 OR synced IS NULL').all();
    for (const s of localSuppliers) {
      const sRemoteId = s.remote_id || `SUP-${s.id}`;
      await pool.query(`
        INSERT INTO novafreshmart_suppliers (
          id, name, contact_person, phone, email, address, opening_balance, current_balance
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          contact_person = VALUES(contact_person),
          phone = VALUES(phone),
          email = VALUES(email),
          address = VALUES(address),
          opening_balance = VALUES(opening_balance),
          current_balance = VALUES(current_balance)
      `, [
        sRemoteId,
        s.name,
        s.contact_person || s.contact || '',
        s.phone || s.contact || '',
        s.email || '',
        s.address || '',
        Number(s.opening_balance || 0),
        Number(s.current_balance || 0)
      ]);
      db.prepare('UPDATE suppliers SET synced = 1, remote_id = ? WHERE id = ?').run(sRemoteId, s.id);
    }
  } catch (err) {
    console.warn('[Sync] Could not push suppliers to remote:', err);
  }

  // 13. Push purchase orders & items to remote MariaDB
  try {
    const localPOs: any[] = db.prepare('SELECT * FROM purchase_orders WHERE synced = 0 OR synced IS NULL').all();
    for (const po of localPOs) {
      const poRemoteId = po.remote_id || `PO-${po.id}`;
      await pool.query(`
        INSERT INTO novafreshmart_purchase_orders (
          id, supplier_id, status, total_amount, expected_delivery_date, created_by, approved_by, supplier_invoice_no, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          total_amount = VALUES(total_amount),
          approved_by = VALUES(approved_by),
          supplier_invoice_no = VALUES(supplier_invoice_no)
      `, [
        poRemoteId,
        po.supplier_id ? `SUP-${po.supplier_id}` : null,
        po.status || 'DRAFT',
        Number(po.total_amount || po.total_cost || 0),
        po.expected_delivery_date || null,
        po.created_by || 'Admin',
        po.approved_by || null,
        po.supplier_invoice_no || null,
        po.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]);

      const poItems: any[] = db.prepare('SELECT * FROM purchase_order_items WHERE po_id = ?').all(po.id);
      await pool.query('DELETE FROM novafreshmart_purchase_order_items WHERE po_id = ?', [poRemoteId]);
      for (const item of poItems) {
        await pool.query(`
          INSERT INTO novafreshmart_purchase_order_items (po_id, product_id, qty_ordered, unit_cost)
          VALUES (?, ?, ?, ?)
        `, [poRemoteId, String(item.product_id), Number(item.qty_ordered || 0), Number(item.unit_cost || 0)]);
      }
      db.prepare('UPDATE purchase_orders SET synced = 1, remote_id = ? WHERE id = ?').run(poRemoteId, po.id);
      try { db.prepare('UPDATE purchase_order_items SET synced = 1 WHERE po_id = ?').run(po.id); } catch(_) {}
    }
  } catch (err) {
    console.warn('[Sync] Could not push purchase orders to remote:', err);
  }

  // 14. Push GRNs & items (Purchase Bills) to remote MariaDB
  try {
    const localGrns: any[] = db.prepare('SELECT * FROM grn WHERE synced = 0 OR synced IS NULL').all();
    syncLog(`[PUSH] GRNs to sync: ${localGrns.length}`);
    for (const grn of localGrns) {
      const grnRemoteId = grn.remote_id || `GRN-${grn.id}`;
      try {
        await pool.query(`
          INSERT INTO novafreshmart_grn (
            id, po_id, supplier_id, total_cost, received_at, status, approved_by, supplier_invoice_no, received_by, items_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            total_cost = VALUES(total_cost),
            status = VALUES(status),
            approved_by = VALUES(approved_by),
            supplier_invoice_no = VALUES(supplier_invoice_no),
            received_by = VALUES(received_by),
            items_json = VALUES(items_json)
        `, [
          grnRemoteId,
          grn.po_id ? `PO-${grn.po_id}` : null,
          grn.supplier_id ? `SUP-${grn.supplier_id}` : null,
          Number(grn.total_cost || 0),
          grn.received_at || new Date().toISOString().slice(0, 19).replace('T', ' '),
          grn.status || 'APPROVED',
          grn.approved_by || null,
          grn.supplier_invoice_no || null,
          grn.received_by || null,
          grn.items_json || null
        ]);

        const grnItems: any[] = db.prepare('SELECT * FROM grn_items WHERE grn_id = ?').all(grn.id);
        await pool.query('DELETE FROM novafreshmart_grn_items WHERE grn_id = ?', [grnRemoteId]);
        for (const gi of grnItems) {
          await pool.query(`
            INSERT INTO novafreshmart_grn_items (grn_id, product_id, variant_id, qty_received, free_qty, unit_cost, effective_cost, new_sale_price, new_wholesale_price)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            grnRemoteId,
            String(gi.product_id),
            gi.variant_id ? String(gi.variant_id) : null,
            Number(gi.qty_received || 0),
            Number(gi.free_qty || 0),
            Number(gi.unit_cost || 0),
            Number(gi.effective_cost || gi.unit_cost || 0),
            gi.new_sale_price ? Number(gi.new_sale_price) : null,
            Number(gi.new_wholesale_price || 0)
          ]);
        }
        db.prepare('UPDATE grn SET synced = 1, remote_id = ? WHERE id = ?').run(grnRemoteId, grn.id);
        try { db.prepare('UPDATE grn_items SET synced = 1 WHERE grn_id = ?').run(grn.id); } catch(_) {}
        syncLog(`[PUSH] GRN OK: id=${grn.id} remoteId=${grnRemoteId}`);
      } catch (grnErr: any) {
        syncLog(`[PUSH] ERROR GRN id=${grn.id}: ${grnErr.message}`);
        console.warn('[Sync] Failed to push GRN', grn.id, ':', grnErr.message);
        // Leave synced=0 so it retries next cycle
      }
    }
    // Bump catalog_last_updated after GRN push so other terminals pull fresh stock
    if (localGrns.length > 0) {
      try {
        await pool.query("INSERT INTO novafreshmart_settings (key_name, value_text, updated_at) VALUES ('catalog_last_updated', NOW(), NOW()) ON DUPLICATE KEY UPDATE value_text = NOW(), updated_at = NOW()");
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[Sync] Could not push GRNs to remote:', err);
  }

  // 15. Push credit accounts & credit transactions to remote MariaDB
  try {
    const localCreditAccts: any[] = db.prepare('SELECT * FROM credit_accounts WHERE synced = 0 OR synced IS NULL').all();
    for (const ca of localCreditAccts) {
      const caRemoteId = ca.remote_id || `CRED-${ca.id}`;
      await pool.query(`
        INSERT INTO novafreshmart_credit_accounts (
          id, customer_id, credit_limit, balance, status
        ) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          balance = VALUES(balance),
          credit_limit = VALUES(credit_limit),
          status = VALUES(status)
      `, [
        caRemoteId,
        `CUST-${ca.customer_id}`,
        Number(ca.credit_limit || 0),
        Number(ca.balance || 0),
        ca.status || 'ACTIVE'
      ]);
      db.prepare('UPDATE credit_accounts SET synced = 1, remote_id = ? WHERE id = ?').run(caRemoteId, ca.id);
    }

    const localCreditTx: any[] = db.prepare('SELECT * FROM credit_transactions WHERE synced = 0 OR synced IS NULL').all();
    for (const ctx of localCreditTx) {
      const txRemoteId = ctx.remote_id || `CTX-${ctx.id}`;
      const acct: any = db.prepare('SELECT remote_id FROM credit_accounts WHERE id = ?').get(ctx.account_id);
      const acctRemoteId = acct?.remote_id || `CRED-${ctx.account_id}`;
      await pool.query(`
        INSERT INTO novafreshmart_credit_transactions (
          id, account_id, type, amount, reference_id, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          amount = VALUES(amount),
          notes = VALUES(notes)
      `, [
        txRemoteId,
        acctRemoteId,
        ctx.type,
        Number(ctx.amount || 0),
        ctx.reference_id ? String(ctx.reference_id) : null,
        ctx.notes || '',
        ctx.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
      ]);
      db.prepare('UPDATE credit_transactions SET synced = 1, remote_id = ? WHERE id = ?').run(txRemoteId, ctx.id);
    }
  } catch (err) {
    console.warn('[Sync] Could not push credit accounts/transactions to remote:', err);
  }

  // 16. Push custom bill items to remote MariaDB
  try {
    const customItems: any[] = db.prepare(`
      SELECT c.* 
      FROM custom_bill_items c
      WHERE (c.synced = 0 OR c.synced IS NULL)
        AND (c.invoice_id IS NULL OR c.invoice_id IN (SELECT id FROM invoices))
      ORDER BY c.id ASC LIMIT 50
    `).all();

    for (const ci of customItems) {
      const [existing]: any = await pool.query(
        'SELECT id FROM novafreshmart_custom_bill_items WHERE invoice_id = ? AND item_name = ? AND branch_id = ? AND terminal_id = ? LIMIT 1',
        [ci.invoice_id ? String(ci.invoice_id) : '0', ci.item_name, ci.branch_id || branchId, ci.terminal_id || terminalId]
      );

      if (Array.isArray(existing) && existing.length > 0) {
        db.prepare('UPDATE custom_bill_items SET synced = 1, remote_id = ? WHERE id = ?').run(existing[0].id, ci.id);
      } else {
        const [res]: any = await pool.query(`
          INSERT INTO novafreshmart_custom_bill_items (
            invoice_id, branch_id, terminal_id, cashier, item_name, quantity, unit, unit_price, total_price, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          ci.invoice_id ? String(ci.invoice_id) : null,
          ci.branch_id || branchId,
          ci.terminal_id || terminalId,
          ci.cashier || 'Cashier',
          ci.item_name,
          Number(ci.quantity || 1),
          ci.unit || 'pc',
          Number(ci.unit_price || 0),
          Number(ci.total_price || 0),
          ci.notes || '',
          ci.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ')
        ]);
        db.prepare('UPDATE custom_bill_items SET synced = 1, remote_id = ? WHERE id = ?').run(res.insertId, ci.id);
      }
    }
  } catch (err) {
    console.warn('[Sync] Could not push custom bill items to remote:', err);
  }

  // 17. Push store settings to remote MariaDB
  try {
    const settingsRows: any[] = db.prepare('SELECT key, value FROM settings').all();
    const LOCAL_ONLY_SETTINGS = new Set([
      'printerName', 'printer', 'escposEnabled', 'autoOpenDrawer',
      'posLayout', 'backup_directory', 'auto_backup_enabled',
      'auto_backup_interval_minutes', 'auto_backup_retention', 'last_auto_backup_time'
    ]);
    for (const st of settingsRows) {
      if (LOCAL_ONLY_SETTINGS.has(st.key)) continue;
      await pool.query(`
        INSERT INTO novafreshmart_settings (key_name, value_text, updated_at)
        VALUES (?, ?, NOW())
        ON DUPLICATE KEY UPDATE
          value_text = VALUES(value_text),
          updated_at = NOW()
      `, [st.key, String(st.value)]);
    }
  } catch (err) {
    console.warn('[Sync] Could not push settings to remote:', err);
  }

  // 18. Push inventory ledger movements to remote MariaDB
  // ALWAYS use the numeric product ID (as string) so the pull-side findProd lookup works correctly
  try {
    const unsyncedLedger: any[] = db.prepare(`
      SELECT * FROM inventory_ledger WHERE synced = 0 OR synced IS NULL LIMIT 50
    `).all();

    for (const entry of unsyncedLedger) {
      // Use the numeric product ID as string â€” remote VARCHAR(64) can store it and pull-side Number() cast works
      const prodIdStr = String(entry.product_id);

      const [res]: any = await pool.query(`
        INSERT INTO novafreshmart_inventory_ledger 
          (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        prodIdStr,
        entry.transaction_type,
        entry.reference_id ? String(entry.reference_id) : null,
        Number(entry.qty_change || 0),
        Number(entry.balance_after || 0),
        entry.unit_cost !== null && entry.unit_cost !== undefined ? Number(entry.unit_cost) : null,
        entry.notes || null,
        entry.created_by || 'System',
        entry.created_at ? String(entry.created_at).replace('T', ' ').slice(0, 19) : getSriLankaNowString()
      ]);

      const remoteInsertId = res?.insertId ? String(res.insertId) : `REM-LEDGER-${entry.id}`;
      db.prepare('UPDATE inventory_ledger SET synced = 1, remote_id = ? WHERE id = ?').run(remoteInsertId, entry.id);
    }
  } catch (err) {
    console.warn('[Sync] Could not push inventory ledger to remote:', err);
  }
}

// Pull latest catalog, branches, terminals, and employees from MariaDB
export async function pullLatestData(db: Database.Database) {
  const isOnline = await checkRemoteConnection();
  if (!isOnline) {
    return;
  }

  const pool = getRemotePool();
  const config = getTerminalConfig(db);
  const branchId = config.current_branch_id || 'BR-MAIN';

  // 0. Pull and apply remote deletion tombstones (Ensures deleted records are wiped everywhere and never resurrect)
  try {
    let lastProcessedDelId = 0;
    try {
      const maxRow: any = db.prepare('SELECT MAX(id) as max_id FROM deleted_records_processed').get();
      lastProcessedDelId = Number(maxRow?.max_id || 0);
    } catch (_) {}

    const [deletedRows]: any = await pool.query(
      'SELECT id, table_name, record_id FROM novafreshmart_deleted_records WHERE id > ? ORDER BY id ASC LIMIT 500',
      [lastProcessedDelId]
    );

    if (Array.isArray(deletedRows) && deletedRows.length > 0) {
      // Find any product record_ids among deleted rows to verify against remote active products
      const prodRecordIds = deletedRows
        .filter((r: any) => r.table_name === 'products')
        .map((r: any) => String(r.record_id).replace(/^PROD-/, ''));

      let activeRemoteProdIds = new Set<string>();
      if (prodRecordIds.length > 0) {
        try {
          const [activeRows]: any = await pool.query(
            `SELECT id FROM novafreshmart_products WHERE id IN (?) AND is_active = 1`,
            [prodRecordIds]
          );
          if (Array.isArray(activeRows)) {
            activeRemoteProdIds = new Set(activeRows.map((ar: any) => String(ar.id)));
          }
        } catch (_) {}
      }

      const markDel = db.prepare('INSERT OR IGNORE INTO deleted_records_processed (id, table_name, record_id) VALUES (?, ?, ?)');
      const delInvoice = db.prepare('DELETE FROM invoices WHERE remote_id = ? OR invoice_no = ? OR id = ?');
      const delLedger = db.prepare('DELETE FROM inventory_ledger WHERE reference_id = ?');

      db.transaction(() => {
        for (const row of deletedRows) {
          if (row.table_name === 'invoices' || row.table_name === 'sales') {
            delInvoice.run(row.record_id, row.record_id, row.record_id);
            delLedger.run(row.record_id);
          } else if (row.table_name === 'products') {
            try {
              const cleanId = String(row.record_id).replace(/^PROD-/, '');
              const rawId = isNaN(Number(cleanId)) ? -1 : Number(cleanId);
              // Protect active products: if product is active remotely, do NOT delete it!
              if (!activeRemoteProdIds.has(cleanId) && !activeRemoteProdIds.has(String(row.record_id))) {
                db.prepare('DELETE FROM products WHERE id = ? OR id = ?').run(rawId, row.record_id);
                db.prepare('DELETE FROM product_variants WHERE product_id = ? OR product_id = ?').run(rawId, row.record_id);
                db.prepare('DELETE FROM product_batches WHERE product_id = ? OR product_id = ?').run(rawId, row.record_id);
              } else {
                console.warn(`[Sync] Protected active product ${row.record_id} from stale tombstone #${row.id}`);
              }
            } catch (_) {}
          } else if (row.table_name === 'sessions' || row.table_name === 'shifts') {
            try { db.prepare('DELETE FROM sessions WHERE remote_id = ? OR id = ?').run(row.record_id, row.record_id); } catch (_) {}
          } else if (row.table_name === 'customers') {
            try {
              const rawId = isNaN(Number(String(row.record_id).replace(/^CUST-/, ''))) ? -1 : Number(String(row.record_id).replace(/^CUST-/, ''));
              db.prepare('DELETE FROM customers WHERE id = ? OR id = ? OR remote_id = ?').run(rawId, row.record_id, row.record_id);
            } catch (_) {}
          } else if (row.table_name === 'vouchers') {
            try {
              db.prepare('DELETE FROM voucher_restrictions WHERE voucher_id = ?').run(row.record_id);
              db.prepare('DELETE FROM vouchers WHERE id = ? OR remote_id = ? OR code = ?').run(row.record_id, row.record_id, row.record_id);
            } catch (_) {}
          } else if (row.table_name === 'expenses') {
            try {
              db.prepare('DELETE FROM expenses WHERE id = ? OR remote_id = ?').run(row.record_id, row.record_id);
            } catch (_) {}
          } else if (row.table_name === 'suppliers') {
            try { db.prepare('DELETE FROM suppliers WHERE id = ?').run(row.record_id); } catch (_) {}
          } else if (row.table_name === 'grn') {
            try {
              const grnId = isNaN(Number(row.record_id.replace('GRN-', ''))) ? row.record_id : Number(row.record_id.replace('GRN-', ''));
              db.prepare('DELETE FROM grn_items WHERE grn_id = ?').run(grnId);
              db.prepare('DELETE FROM grn WHERE id = ? OR remote_id = ?').run(grnId, row.record_id);
            } catch (_) {}
          } else if (row.table_name === 'purchase_orders') {
            try {
              const poId = isNaN(Number(row.record_id.replace('PO-', ''))) ? row.record_id : Number(row.record_id.replace('PO-', ''));
              db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(poId);
              db.prepare('DELETE FROM purchase_orders WHERE id = ? OR remote_id = ?').run(poId, row.record_id);
            } catch (_) {}
          } else if (row.table_name === 'credit_accounts') {
            try {
              const caId = isNaN(Number(row.record_id.replace('CRED-', ''))) ? row.record_id : Number(row.record_id.replace('CRED-', ''));
              db.prepare('DELETE FROM credit_transactions WHERE account_id = ?').run(caId);
              db.prepare('DELETE FROM credit_accounts WHERE id = ? OR remote_id = ?').run(caId, row.record_id);
            } catch (_) {}
          } else if (row.table_name === 'inventory_ledger') {
            try { db.prepare('DELETE FROM inventory_ledger WHERE id = ?').run(Number(row.record_id) || row.record_id); } catch (_) {}
          } else if (row.table_name === 'terminals') {
            try { db.prepare('DELETE FROM terminals WHERE id = ?').run(row.record_id); } catch (_) {}
          } else if (row.table_name === 'users' || row.table_name === 'employees') {
            try {
              const rawId = String(row.record_id).replace(/^EMP-/, '').replace(/^STAFF-/, '');
              db.prepare("DELETE FROM users WHERE (id = ? OR id = ? OR username = ?) AND LOWER(username) != 'admin'").run(rawId, row.record_id, row.record_id);
              db.prepare('DELETE FROM employees WHERE id = ? OR id = ? OR name = ?').run(rawId, row.record_id, row.record_id);
            } catch (_) {}
          }
          markDel.run(row.id, row.table_name, row.record_id);
        }
      })();

      try {
        BrowserWindow.getAllWindows().forEach(w => {
          w.webContents.send('sync-data-updated');
        });
      } catch (_) {}
    }
  } catch (delErr: any) {
    console.warn('[Sync] Could not process remote deleted records:', delErr.message);
  }

  // 1. Pull branches
  try {
    const [remoteBranches]: any = await pool.query('SELECT * FROM novafreshmart_branches WHERE is_active = 1');
    if (Array.isArray(remoteBranches)) {
      const insertBranch = db.prepare(`
        INSERT OR REPLACE INTO branches (id, name, code, address, phone, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const b of remoteBranches) {
          insertBranch.run(b.id, b.name, b.code || '', b.address || '', b.phone || '', b.is_active || 1, b.updated_at ? String(b.updated_at) : null);
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote branches:', err);
  }

  // 2. Pull terminals
  try {
    const [remoteTerms]: any = await pool.query('SELECT *, TIMESTAMPDIFF(SECOND, last_active_at, NOW()) as last_seen_sec FROM novafreshmart_terminals WHERE (is_active = 1 OR is_active IS NULL)');
    if (Array.isArray(remoteTerms)) {
      let deletedTermIds = new Set<string>();
      try {
        deletedTermIds = new Set(
          db.prepare("SELECT record_id FROM deleted_records_processed WHERE table_name = 'terminals'").all().map((r: any) => String(r.record_id))
        );
      } catch (_) {}

      const now = Date.now();
      const insertTerm = db.prepare(`
        INSERT OR REPLACE INTO terminals (id, branch_id, name, status, last_active)
        VALUES (?, ?, ?, ?, ?)
      `);
      db.transaction(() => {
        for (const t of remoteTerms) {
          if (deletedTermIds.has(String(t.id))) continue;
          const isCurrent = t.id === config.current_terminal_id;
          const lastActiveTime = t.last_active_at ? new Date(t.last_active_at).getTime() : 0;
          const secondsSinceActive = (now - lastActiveTime) / 1000;
          const isRecentlyActive = (t.last_seen_sec != null && t.last_seen_sec >= -60 && t.last_seen_sec < 600) ||
                                  (t.last_active_at && Math.abs(secondsSinceActive) < 600);
          const dynamicStatus = (isCurrent || isRecentlyActive) ? 'online' : 'offline';
          insertTerm.run(t.id, t.branch_id, t.name, dynamicStatus, t.last_active_at ? String(t.last_active_at) : null);
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote terminals:', err);
  }

  // 2b. Pull categories from remote MariaDB first so product FKs and names are always resolved
  try {
    const [remoteCats]: any = await pool.query('SELECT * FROM novafreshmart_categories');
    if (Array.isArray(remoteCats) && remoteCats.length > 0) {
      db.transaction(() => {
        for (const cat of remoteCats) {
          if (!cat.name || !cat.name.trim()) continue;
          const cleanName = cat.name.trim();
          const existing: any = db.prepare('SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(?)').get(cleanName);
          if (existing) {
            db.prepare('UPDATE categories SET color = ?, icon = ?, remote_id = ? WHERE id = ?').run(cat.color || '', cat.icon || '', String(cat.id), existing.id);
          } else {
            db.prepare('INSERT INTO categories (name, color, icon, remote_id, synced) VALUES (?, ?, ?, ?, 1)').run(cleanName, cat.color || '', cat.icon || '', String(cat.id));
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote categories:', err);
  }

  // 2c. Pull brands from remote MariaDB
  try {
    const [remoteBrands]: any = await pool.query('SELECT * FROM novafreshmart_brands');
    if (Array.isArray(remoteBrands) && remoteBrands.length > 0) {
      db.transaction(() => {
        for (const b of remoteBrands) {
          if (!b.name || !b.name.trim()) continue;
          const cleanName = b.name.trim();
          const existing: any = db.prepare('SELECT id FROM brands WHERE LOWER(TRIM(name)) = LOWER(?)').get(cleanName);
          if (!existing) {
            db.prepare('INSERT OR IGNORE INTO brands (name) VALUES (?)').run(cleanName);
          }
        }
      })();
      syncLog(`[PULL] Pulled ${remoteBrands.length} brands from cloud`);
    }
  } catch (err: any) {
    console.warn('[Sync] Could not pull remote brands:', err.message);
  }

  // 3. Pull all active products so all devices have full catalog
  try {
    const [remoteProds]: any = await pool.query(`
      SELECT * FROM novafreshmart_products 
      WHERE is_active = 1
    `);
    syncLog(`[PULL] Pulled ${remoteProds ? remoteProds.length : 0} active products from cloud`);

    if (Array.isArray(remoteProds) && remoteProds.length > 0) {
      // Ensure default guaranteed fallback category exists in local SQLite
      let safeFallbackCatId = 1;
      try {
        const catGeneral: any = db.prepare("SELECT id FROM categories WHERE LOWER(TRIM(name)) = 'general' LIMIT 1").get()
          || db.prepare('SELECT id FROM categories ORDER BY id ASC LIMIT 1').get();
        if (catGeneral) {
          safeFallbackCatId = Number(catGeneral.id);
        } else {
          const insGeneral = db.prepare('INSERT INTO categories (name, synced) VALUES ("General", 1)').run();
          safeFallbackCatId = Number(insGeneral.lastInsertRowid);
        }
      } catch (_) {}

      // Remote stock is authoritative - no local pending deduction (avoids double-deduction)
      const pendingDeltaMap = new Map<string, number>();

      // Helper map of categories
      const catMap = new Map<string, number>();
      try {
        db.prepare('SELECT id, name FROM categories').all().forEach((c: any) => {
          if (c.name) catMap.set(c.name.trim().toLowerCase(), Number(c.id));
        });
      } catch (_) {}

      const findByBarcode = db.prepare("SELECT id, synced FROM products WHERE barcode = ? AND barcode IS NOT NULL AND barcode != '' LIMIT 1");
      const findById = db.prepare('SELECT id, synced FROM products WHERE id = ? LIMIT 1');

      const updateProd = db.prepare(`
        UPDATE products SET
          name = ?,
          price = ?,
          wholesale_price = ?,
          cost_price = ?,
          barcode = ?,
          branch_id = ?,
          unit = ?,
          stock = ?,
          category_id = ?,
          is_scale_item = ?,
          plu = ?,
          allow_price_override = ?,
          expiry_date = COALESCE(?, expiry_date),
          synced = 1
        WHERE id = ?
      `);

      const insertProdWithId = db.prepare(`
        INSERT INTO products (id, name, price, cost_price, stock, category_id, branch_id, wholesale_price, barcode, unit, is_scale_item, plu, allow_price_override, expiry_date, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      const insertProdAuto = db.prepare(`
        INSERT INTO products (name, price, cost_price, stock, category_id, branch_id, wholesale_price, barcode, unit, is_scale_item, plu, allow_price_override, expiry_date, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);

      db.transaction(() => {
        for (const p of remoteProds) {
          try {
            const prodId = isNaN(Number(p.id)) ? Math.abs(hashString(p.id)) : Number(p.id);
            const pendingDeduction = pendingDeltaMap.get(String(p.id)) || (p.barcode ? pendingDeltaMap.get(p.barcode) : 0) || 0;
            const adjustedStock = Math.max(0, Number(p.stock || 0) - pendingDeduction);
            const allowOverride = p.allow_price_override !== 0 && p.allow_price_override !== false ? 1 : 0;
            const safeUnit = (p.unit && !/^\d+$/.test(String(p.unit).trim())) ? p.unit : 'pc';

            // Foreign-key safe category resolution
            let localCatId = safeFallbackCatId;
            if (p.category && String(p.category).trim()) {
              const cleanCatName = String(p.category).trim();
              const lowerCat = cleanCatName.toLowerCase();
              if (catMap.has(lowerCat)) {
                localCatId = catMap.get(lowerCat)!;
              } else {
                try {
                  const insCat = db.prepare('INSERT INTO categories (name, synced) VALUES (?, 1)').run(cleanCatName);
                  localCatId = Number(insCat.lastInsertRowid);
                  catMap.set(lowerCat, localCatId);
                } catch (_) {
                  const ex: any = db.prepare('SELECT id FROM categories WHERE LOWER(TRIM(name)) = ?').get(lowerCat);
                  if (ex) {
                    localCatId = Number(ex.id);
                    catMap.set(lowerCat, localCatId);
                  }
                }
              }
            } else if (p.category_id && !isNaN(Number(p.category_id)) && Number(p.category_id) > 0) {
              const chk: any = db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(p.category_id));
              if (chk) {
                localCatId = Number(chk.id);
              }
            }

            // Guaranteed validation: ensure localCatId actually exists in SQLite categories table
            const catValid: any = db.prepare('SELECT id FROM categories WHERE id = ? LIMIT 1').get(localCatId);
            if (!catValid) {
              localCatId = safeFallbackCatId;
            }

            // Check if product already exists locally
            let localMatch: any = null;
            if (p.barcode && String(p.barcode).trim()) {
              localMatch = findByBarcode.get(String(p.barcode).trim());
            }
            if (!localMatch && !isNaN(prodId)) {
              localMatch = findById.get(prodId);
            }

            if (localMatch) {
              // Always update product with authoritative cloud catalog data
              updateProd.run(
                p.name,
                Number(p.price || 0),
                Number(p.wholesale_price || 0),
                Number(p.cost_price || 0),
                p.barcode || '',
                p.branch_id || 'ALL',
                safeUnit,
                adjustedStock,
                localCatId,
                p.is_scale_item ? 1 : 0,
                p.plu || null,
                allowOverride,
                p.expiry_date || null,
                localMatch.id
              );
            } else {
              // Insert new product: try prodId first, then fallback safely
              try {
                insertProdWithId.run(
                  prodId,
                  p.name,
                  Number(p.price || 0),
                  Number(p.cost_price || 0),
                  adjustedStock,
                  localCatId,
                  p.branch_id || 'ALL',
                  Number(p.wholesale_price || 0),
                  p.barcode || '',
                  safeUnit,
                  p.is_scale_item ? 1 : 0,
                  p.plu || null,
                  allowOverride,
                  p.expiry_date || null
                );
                try {
                  db.prepare("INSERT INTO sqlite_sequence (name, seq) VALUES ('products', ?) ON CONFLICT(name) DO UPDATE SET seq = MAX(seq, excluded.seq)").run(prodId);
                } catch (_) {}
              } catch (insErr: any) {
                try {
                  updateProd.run(
                    p.name,
                    Number(p.price || 0),
                    Number(p.wholesale_price || 0),
                    Number(p.cost_price || 0),
                    p.barcode || '',
                    p.branch_id || 'ALL',
                    safeUnit,
                    adjustedStock,
                    localCatId,
                    p.is_scale_item ? 1 : 0,
                    p.plu || null,
                    allowOverride,
                    p.expiry_date || null,
                    prodId
                  );
                } catch (_) {
                  insertProdAuto.run(
                    p.name,
                    Number(p.price || 0),
                    Number(p.cost_price || 0),
                    adjustedStock,
                    localCatId,
                    p.branch_id || 'ALL',
                    Number(p.wholesale_price || 0),
                    p.barcode || '',
                    safeUnit,
                    p.is_scale_item ? 1 : 0,
                    p.plu || null,
                    allowOverride,
                    p.expiry_date || null
                  );
                }
              }
            }
          } catch (itemErr: any) {
            console.warn(`[Sync] Product pull skipped item ${p.id}:`, itemErr.message);
          }
        }
      })();
    }

    // Also wipe inactive/deleted products locally
    const [deletedProds]: any = await pool.query('SELECT id FROM novafreshmart_products WHERE is_active = 0');
    if (Array.isArray(deletedProds) && deletedProds.length > 0) {
      db.transaction(() => {
        for (const dp of deletedProds) {
          const numId = Number(dp.id);
          db.prepare('DELETE FROM products WHERE id = ? OR id = ?').run(dp.id, isNaN(numId) ? -1 : numId);
          db.prepare('DELETE FROM product_variants WHERE product_id = ? OR product_id = ?').run(dp.id, isNaN(numId) ? -1 : numId);
          db.prepare('DELETE FROM product_batches WHERE product_id = ? OR product_id = ?').run(dp.id, isNaN(numId) ? -1 : numId);
        }
      })();
    }

    // Advance sqlite_sequence so local autoincrement never conflicts with existing remote IDs
    try {
      db.prepare(`
        INSERT INTO sqlite_sequence (name, seq)
        VALUES ('products', (SELECT COALESCE(MAX(id), 0) FROM products))
        ON CONFLICT(name) DO UPDATE SET seq = MAX(seq, (SELECT COALESCE(MAX(id), 0) FROM products))
      `).run();
    } catch (seqErr: any) {
      console.warn('[Sync] Failed to bump sqlite_sequence for products:', seqErr.message);
    }

    // Broadcast to UI after products pull so all windows reload their product list
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('products-updated');
          w.webContents.send('sync-data-updated');
        }
      });
    } catch (_) {}
  } catch (err) {
    console.warn('[Sync] Could not pull remote products:', err);
  }

  // 4. Pull all employees from remote MariaDB across all branches
  try {
    const [remoteEmps]: any = await pool.query(`
      SELECT * FROM novafreshmart_employees 
      WHERE is_active = 1
    `);

    if (Array.isArray(remoteEmps) && remoteEmps.length > 0) {
      const upsertEmp = db.prepare(`
        INSERT INTO users (username, pin, role, permissions, phone, nic, address, salary, bank_account, branch_id, allowed_terminals, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(username) DO UPDATE SET
          pin = excluded.pin,
          role = excluded.role,
          permissions = COALESCE(excluded.permissions, users.permissions),
          phone = COALESCE(excluded.phone, users.phone),
          nic = COALESCE(excluded.nic, users.nic),
          address = COALESCE(excluded.address, users.address),
          salary = COALESCE(excluded.salary, users.salary),
          bank_account = COALESCE(excluded.bank_account, users.bank_account),
          branch_id = excluded.branch_id,
          allowed_terminals = COALESCE(excluded.allowed_terminals, users.allowed_terminals),
          updated_at = excluded.updated_at
      `);

      const findStaff = db.prepare("SELECT id FROM employees WHERE name = ? OR (nic IS NOT NULL AND nic != '' AND nic = ?)");
      const insertStaff = db.prepare('INSERT INTO employees (name, nic, phone, basic_salary) VALUES (?, ?, ?, ?)');
      const updateStaff = db.prepare('UPDATE employees SET nic = COALESCE(?, nic), phone = COALESCE(?, phone), basic_salary = COALESCE(?, basic_salary) WHERE id = ?');

      const ALL_ADMIN_PERMS = JSON.stringify(['POS', 'Inventory', 'GRN', 'Reports', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Branches', 'Settings', 'Users', 'Refunds', 'Discounts', 'Delete Invoice', 'View Invoices', 'Edit Invoices', 'Custom Items', 'Backup Hub']);
      db.transaction(() => {
        for (const emp of remoteEmps) {
          const perms = emp.role === 'Admin' ? ALL_ADMIN_PERMS : (emp.permissions || JSON.stringify(['POS']));
          upsertEmp.run(
            emp.username,
            emp.pin,
            emp.role || 'Cashier',
            perms,
            emp.phone || null,
            emp.nic || null,
            emp.address || null,
            Number(emp.salary || 0),
            emp.bank_account || null,
            emp.branch_id || 'ALL',
            emp.allowed_terminals || 'ALL',
            emp.updated_at ? String(emp.updated_at) : null
          );

          const empName = emp.name || emp.username;
          if (empName && empName.toLowerCase() !== 'admin') {
            const existingStaff: any = findStaff.get(empName, emp.nic || '');
            if (existingStaff) {
              updateStaff.run(emp.nic || null, emp.phone || null, Number(emp.salary || 0), existingStaff.id);
            } else {
              insertStaff.run(empName, emp.nic || '', emp.phone || '', Number(emp.salary || 0));
            }
          }
        }
      })();

      try {
        BrowserWindow.getAllWindows().forEach(w => {
          w.webContents.send('sync-data-updated');
        });
      } catch (_) {}
    }

    // Also remove inactive employees from local users table
    try {
      const [inactiveEmps]: any = await pool.query('SELECT username FROM novafreshmart_employees WHERE is_active = 0');
      if (Array.isArray(inactiveEmps) && inactiveEmps.length > 0) {
        db.transaction(() => {
          for (const ie of inactiveEmps) {
            if (ie.username && ie.username.toLowerCase() !== 'admin') {
              db.prepare("DELETE FROM users WHERE username = ? AND LOWER(username) != 'admin'").run(ie.username);
            }
          }
        })();
      }
    } catch (_) {}
  } catch (err) {
    console.warn('Failed to pull remote employees:', err);
  }

  // 5. Pull latest shifts across all terminals into local SQLite sessions
  try {
    const [remoteShifts]: any = await pool.query(`
      SELECT * FROM novafreshmart_terminal_shifts
      ORDER BY opened_at DESC LIMIT 50
    `);
    if (Array.isArray(remoteShifts) && remoteShifts.length > 0) {
      const findShift = db.prepare('SELECT id, terminal_id, status FROM sessions WHERE remote_id = ? OR (terminal_id = ? AND remote_id IS NULL AND opened_at = ?)');
      const insertShift = db.prepare(`
        INSERT INTO sessions (
          remote_id, branch_id, terminal_id, username, opened_at, closed_at,
          opening_cash, expected_cash, actual_cash,
          total_sales, cash_sales, card_sales, other_sales,
          cash_in, cash_out,
          status, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const updateShift = db.prepare(`
        UPDATE sessions SET
          branch_id = ?, terminal_id = ?, username = ?, opened_at = ?, closed_at = ?,
          opening_cash = ?, expected_cash = ?, actual_cash = ?, total_sales = ?, cash_sales = ?,
          card_sales = ?, other_sales = ?, cash_in = ?, cash_out = ?, status = ?, synced = 1
        WHERE id = ?
      `);

      const validRemoteIds = new Set(remoteShifts.map((s: any) => s.id));
      const seenOpenTerminal = new Set<string>();

      db.transaction(() => {
        // Purge local sessions whose remote shift was deleted
        const localRemoteSessions: any[] = db.prepare("SELECT id, remote_id FROM sessions WHERE remote_id LIKE 'SH-%'").all();
        for (const ls of localRemoteSessions) {
          if (!validRemoteIds.has(ls.remote_id)) {
            db.prepare('DELETE FROM sessions WHERE id = ?').run(ls.id);
          }
        }

        for (const s of remoteShifts) {
          let isOpen = (s.status || '').toLowerCase() === 'open' && !s.closed_at;
          if (isOpen) {
            if (seenOpenTerminal.has(s.terminal_id)) {
              isOpen = false;
            } else {
              seenOpenTerminal.add(s.terminal_id);
            }
          }

          // Authority protection: Local terminal is the master of its own day session.
          // Remote pull must NEVER resurrect or force an open session onto this terminal if currently closed.
          if (s.terminal_id === config.current_terminal_id) {
            const localOpen: any = db.prepare("SELECT id FROM sessions WHERE terminal_id = ? AND (status = 'OPEN' OR status = 'open')").get(config.current_terminal_id);
            if (!localOpen) {
              isOpen = false;
            }
          }

          const openedAtStr = s.opened_at ? new Date(s.opened_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
          const closedAtStr = s.closed_at ? new Date(s.closed_at).toISOString().slice(0, 19).replace('T', ' ') : null;

          const existing: any = findShift.get(s.id, s.terminal_id, openedAtStr);
          if (existing) {
            if (s.terminal_id === config.current_terminal_id && (existing.status || '').toUpperCase() === 'OPEN') {
              if (s.closed_at || (s.status || '').toLowerCase() === 'closed') {
                // Remote shift was officially closed, so close it locally as well
              } else {
                continue;
              }
            }
            updateShift.run(
              s.branch_id || branchId,
              s.terminal_id || 'TERM-01',
              s.username || 'Cashier',
              openedAtStr,
              closedAtStr,
              Number(s.opening_cash || 0),
              Number(s.expected_cash || 0),
              Number(s.closing_cash || 0),
              Number(s.total_sales || 0),
              Number(s.cash_sales || 0),
              Number(s.card_sales || 0),
              Number(s.other_sales || 0),
              Number(s.cash_in || 0),
              Number(s.cash_out || 0),
              isOpen ? 'OPEN' : 'CLOSED',
              existing.id
            );
          } else {
            insertShift.run(
              s.id,
              s.branch_id || branchId,
              s.terminal_id || 'TERM-01',
              s.username || 'Cashier',
              openedAtStr,
              closedAtStr,
              Number(s.opening_cash || 0),
              Number(s.expected_cash || 0),
              Number(s.closing_cash || 0),
              Number(s.total_sales || 0),
              Number(s.cash_sales || 0),
              Number(s.card_sales || 0),
              Number(s.other_sales || 0),
              Number(s.cash_in || 0),
              Number(s.cash_out || 0),
              isOpen ? 'OPEN' : 'CLOSED'
            );
          }
        }
      })();
    }

    // 5b. Pull latest session transactions (cash movements) across all terminals
    try {
      const [remoteTxs]: any = await pool.query(`
        SELECT * FROM novafreshmart_session_transactions
        ORDER BY created_at DESC LIMIT 300
      `);
      if (Array.isArray(remoteTxs) && remoteTxs.length > 0) {
        const findLocalTx = db.prepare('SELECT id FROM session_transactions WHERE remote_id = ? OR (shift_id = ? AND type = ? AND amount = ? AND created_at = ?)');
        const insertLocalTx = db.prepare(`
          INSERT INTO session_transactions (
            session_id, shift_id, terminal_id, type, amount, notes, created_at, synced, remote_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        `);

        db.transaction(() => {
          for (const r of remoteTxs) {
            const createdAtStr = r.created_at ? new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
            const existing: any = findLocalTx.get(r.id, r.shift_id, r.type, Number(r.amount || 0), createdAtStr);
            if (!existing) {
              const localSess: any = db.prepare('SELECT id FROM sessions WHERE remote_id = ? LIMIT 1').get(r.shift_id);
              insertLocalTx.run(
                localSess?.id || r.session_id || 0,
                r.shift_id,
                r.terminal_id,
                r.type,
                Number(r.amount || 0),
                r.notes || null,
                createdAtStr,
                r.id
              );
            }
          }
        })();
      }
    } catch (txPullErr) {
      console.warn('[Sync] Could not pull remote session transactions:', txPullErr);
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote shifts:', err);
  }

  // 6. Pull latest sales / invoices across all terminals into local SQLite invoices
  try {
    const [remoteSales]: any = await pool.query(`
      SELECT * FROM novafreshmart_sales
      ORDER BY created_at DESC LIMIT 500
    `);
    if (Array.isArray(remoteSales) && remoteSales.length > 0) {
      // Find any sales that lack items_json
      const salesNeedingItems = remoteSales.filter((s: any) => !s.items_json && s.id);
      const itemsBySaleId: Record<string, any[]> = {};
      if (salesNeedingItems.length > 0) {
        const saleIds = salesNeedingItems.map((s: any) => s.id);
        const chunkSize = 100;
        for (let i = 0; i < saleIds.length; i += chunkSize) {
          const chunk = saleIds.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => '?').join(',');
          try {
            const [rows]: any = await pool.query(
              `SELECT sale_id, product_id, name, price, quantity, discount, subtotal, unit FROM novafreshmart_sale_items WHERE sale_id IN (${placeholders})`,
              chunk
            );
            if (Array.isArray(rows)) {
              for (const r of rows) {
                if (!itemsBySaleId[r.sale_id]) {
                  itemsBySaleId[r.sale_id] = [];
                }
                itemsBySaleId[r.sale_id].push({
                  id: r.product_id,
                  name: r.name,
                  price: Number(r.price || 0),
                  quantity: Number(r.quantity || 1),
                  discount: Number(r.discount || 0),
                  total: Number(r.subtotal || 0),
                  unit: r.unit || 'pcs'
                });
              }
            }
          } catch (e) {
            console.warn('[Sync] Could not pull batch sale items:', e);
          }
        }
      }

      const findInvoice = db.prepare('SELECT id, items, total FROM invoices WHERE remote_id = ? OR invoice_no = ?');
      const insertInvoice = db.prepare(`
        INSERT INTO invoices (
          remote_id, invoice_no, branch_id, terminal_id, session_id, total, subtotal, discount, payment_method,
          items, sale_type, parent_invoice_id,
          cash_paid, card_paid, other_paid, balance_due, change_returned,
          customer_name, customer_phone, cashier, order_type, pricing_type,
          created_at, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      const updateInvoice = db.prepare(`
        UPDATE invoices SET
          invoice_no = ?, branch_id = ?, terminal_id = ?, session_id = COALESCE(?, session_id), total = ?, subtotal = ?, discount = ?, payment_method = ?,
          items = COALESCE(?, items), sale_type = ?, parent_invoice_id = ?,
          cash_paid = ?, card_paid = ?, other_paid = ?, balance_due = ?, change_returned = ?,
          customer_name = ?, customer_phone = ?, cashier = ?, order_type = ?, pricing_type = ?,
          created_at = ?, synced = 1
        WHERE id = ?
      `);

      const existingSessionIds = new Set(db.prepare('SELECT id FROM sessions').all().map((s: any) => s.id));
      for (const sale of remoteSales) {
        try {
          const createdAtStr = sale.created_at ? new Date(sale.created_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
          let itemsJson: string | null = null;
          if (sale.items_json && typeof sale.items_json === 'string' && sale.items_json.trim()) {
            itemsJson = sale.items_json;
          } else if (itemsBySaleId[sale.id]) {
            itemsJson = JSON.stringify(itemsBySaleId[sale.id]);
          }

          let safeSessionId: number | null = null;
          if (sale.shift_id) {
            const rawShiftNum = Number(sale.shift_id);
            const sessRow: any = db.prepare(`
              SELECT id FROM sessions 
              WHERE remote_id = ? 
                 OR remote_id = ?
                 OR (id = ? AND terminal_id = ?)
                 OR id = ?
              LIMIT 1
            `).get(
              String(sale.shift_id),
              `SH-${sale.branch_id || branchId}-${sale.terminal_id || 'TERM-01'}-${sale.shift_id}`,
              isNaN(rawShiftNum) ? -1 : rawShiftNum,
              sale.terminal_id || 'TERM-01',
              isNaN(rawShiftNum) ? -1 : rawShiftNum
            );
            safeSessionId = sessRow ? sessRow.id : null;
          }

          const existing: any = findInvoice.get(sale.id, sale.invoice_no || sale.id);
          if (existing) {
            updateInvoice.run(
              sale.invoice_no || sale.id,
              sale.branch_id || branchId,
              sale.terminal_id || 'TERM-01',
              safeSessionId,
              Number(sale.total || 0),
              Number(sale.subtotal || sale.total || 0),
              Number(sale.discount || 0),
              sale.payment_method || 'Cash',
              itemsJson,
              sale.sale_type || 'SALE',
              sale.parent_invoice_id ? String(sale.parent_invoice_id) : null,
              Number(sale.cash_paid || 0),
              Number(sale.card_paid || 0),
              Number(sale.other_paid || 0),
              Number(sale.balance_due || 0),
              Number(sale.change_returned || 0),
              sale.customer_name || '',
              sale.customer_phone || '',
              sale.cashier || 'Cashier',
              sale.order_type || 'takeaway',
              sale.pricing_type || 'retail',
              createdAtStr,
              existing.id
            );
          } else {
            insertInvoice.run(
              sale.id,
              sale.invoice_no || sale.id,
              sale.branch_id || branchId,
              sale.terminal_id || 'TERM-01',
              safeSessionId,
              Number(sale.total || 0),
              Number(sale.subtotal || sale.total || 0),
              Number(sale.discount || 0),
              sale.payment_method || 'Cash',
              itemsJson || '[]',
              sale.sale_type || 'SALE',
              sale.parent_invoice_id ? String(sale.parent_invoice_id) : null,
              Number(sale.cash_paid || 0),
              Number(sale.card_paid || 0),
              Number(sale.other_paid || 0),
              Number(sale.balance_due || 0),
              Number(sale.change_returned || 0),
              sale.customer_name || '',
              sale.customer_phone || '',
              sale.cashier || 'Cashier',
              sale.order_type || 'takeaway',
              sale.pricing_type || 'retail',
              createdAtStr
            );
          }
        } catch (invErr: any) {
          console.warn(`[Sync] Skipping single invoice #${sale.id}:`, invErr?.message || invErr);
        }
      }
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote sales:', err);
  }

  // 7. Pull active promotions and promotion items from remote MariaDB
  try {
    const [remotePromos]: any = await pool.query(`
      SELECT * FROM novafreshmart_promotions 
      WHERE (branch_id = ? OR branch_id = 'ALL' OR branch_id = 'BR-MAIN' OR ? = 'ALL' OR ? IS NULL)
    `, [branchId, branchId, branchId]);

    if (Array.isArray(remotePromos)) {
      const [remotePromoItems]: any = await pool.query('SELECT * FROM novafreshmart_promotion_items');
      const itemsByPromo = new Map<string, any[]>();
      if (Array.isArray(remotePromoItems)) {
        for (const item of remotePromoItems) {
          const arr = itemsByPromo.get(item.promotion_id) || [];
          arr.push(item);
          itemsByPromo.set(item.promotion_id, arr);
        }
      }

      const existingPromos = db.prepare('SELECT id, remote_id, name FROM promotions').all() as any[];
      const existingByRemoteId = new Map(existingPromos.filter(p => p.remote_id).map(p => [p.remote_id, p]));

      db.transaction(() => {
        for (const rp of remotePromos) {
          if (rp.status === 'DELETED') {
            const local = existingByRemoteId.get(rp.id);
            if (local) {
              db.prepare('DELETE FROM promotion_items WHERE promotion_id = ?').run(local.id);
              db.prepare('DELETE FROM promotions WHERE id = ?').run(local.id);
            }
            continue;
          }

          let localPromo = existingByRemoteId.get(rp.id);
          if (!localPromo) {
            const unsyncedByName = existingPromos.find(p => !p.remote_id && p.name === rp.name);
            if (unsyncedByName) {
              localPromo = unsyncedByName;
            }
          }

          let localId: number;

          if (localPromo) {
            localId = localPromo.id;
            db.prepare(`
              UPDATE promotions 
              SET name = ?, start_date = ?, end_date = ?, discount_type = ?, discount_value = ?, status = ?, remote_id = ?, synced = 1
              WHERE id = ?
            `).run(
              rp.name,
              rp.start_date || '',
              rp.end_date || '',
              rp.discount_type || 'PERCENT',
              Number(rp.discount_value || 0),
              rp.status || 'ACTIVE',
              rp.id,
              localId
            );
          } else {
            let ins: any;
            try {
              ins = db.prepare(`
                INSERT INTO promotions (name, start_date, end_date, discount_type, discount_value, status, remote_id, synced, type, value)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'LEGACY', 0)
              `).run(
                rp.name,
                rp.start_date || '',
                rp.end_date || '',
                rp.discount_type || 'PERCENT',
                Number(rp.discount_value || 0),
                rp.status || 'ACTIVE',
                rp.id
              );
            } catch (e) {
              ins = db.prepare(`
                INSERT INTO promotions (name, start_date, end_date, discount_type, discount_value, status, remote_id, synced)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1)
              `).run(
                rp.name,
                rp.start_date || '',
                rp.end_date || '',
                rp.discount_type || 'PERCENT',
                Number(rp.discount_value || 0),
                rp.status || 'ACTIVE',
                rp.id
              );
            }
            localId = Number(ins.lastInsertRowid);
            existingByRemoteId.set(rp.id, { id: localId, remote_id: rp.id, name: rp.name });
          }

          // Sync items for this promotion with barcode matching
          const promoItems = itemsByPromo.get(rp.id) || [];
          db.prepare('DELETE FROM promotion_items WHERE promotion_id = ?').run(localId);
          const insItem = db.prepare('INSERT INTO promotion_items (promotion_id, product_id, barcode, required_qty) VALUES (?, ?, ?, ?)');
          for (const item of promoItems) {
            let prodId = isNaN(Number(item.product_id)) ? Math.abs(hashString(item.product_id)) : Number(item.product_id);
            if (item.barcode) {
              const matchedP: any = db.prepare('SELECT id FROM products WHERE barcode = ?').get(item.barcode);
              if (matchedP) prodId = matchedP.id;
            }
            insItem.run(localId, prodId, item.barcode || '', Number(item.required_qty || 1));
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote promotions:', err);
  }

  // 8. Pull customers from remote MariaDB
  try {
    const [remoteCusts]: any = await pool.query('SELECT * FROM novafreshmart_customers');
    if (Array.isArray(remoteCusts) && remoteCusts.length > 0) {
      const upsertCust = db.prepare(`
        INSERT INTO customers (id, name, phone, points, credit_balance, barcode, created_at, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          phone = excluded.phone,
          points = excluded.points,
          credit_balance = excluded.credit_balance,
          barcode = excluded.barcode
      `);

      db.transaction(() => {
        for (const c of remoteCusts) {
          const custId = isNaN(Number(c.id.replace('CUST-', ''))) ? Math.abs(hashString(c.id)) : Number(c.id.replace('CUST-', ''));
          upsertCust.run(
            custId,
            c.name,
            c.phone || '',
            Number(c.points || 0),
            Number(c.credit_balance || 0),
            c.barcode || '',
            c.created_at ? String(c.created_at) : new Date().toISOString()
          );
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote customers:', err);
  }

  // 9. Pull vouchers & voucher restrictions from remote MariaDB
  try {
    const [remoteVouchers]: any = await pool.query(`
      SELECT * FROM novafreshmart_vouchers 
      WHERE (branch_id = ? OR branch_id = 'ALL' OR branch_id IS NULL OR branch_id = '')
    `, [branchId]);

    if (Array.isArray(remoteVouchers)) {
      const [remoteRestrictions]: any = await pool.query('SELECT * FROM novafreshmart_voucher_restrictions');
      const restrByVoucher = new Map<string, any[]>();
      if (Array.isArray(remoteRestrictions)) {
        for (const r of remoteRestrictions) {
          const arr = restrByVoucher.get(r.voucher_id) || [];
          arr.push(r);
          restrByVoucher.set(r.voucher_id, arr);
        }
      }

      db.transaction(() => {
        for (const rv of remoteVouchers) {
          const cleanCode = (rv.code || '').trim();
          const existing: any = db.prepare('SELECT id FROM vouchers WHERE UPPER(TRIM(code)) = UPPER(?)').get(cleanCode);

          if (rv.status === 'DELETED') {
            if (existing) {
              db.prepare('DELETE FROM voucher_restrictions WHERE voucher_id = ?').run(existing.id);
              db.prepare('DELETE FROM vouchers WHERE id = ?').run(existing.id);
            }
            continue;
          }

          const expDate = rv.expiry_date ? String(rv.expiry_date).split(/[T ]/)[0] : null;
          let localId: number;

          if (existing) {
            localId = existing.id;
            db.prepare(`
              UPDATE vouchers 
              SET code = ?, name = ?, type = ?, amount = ?, claimed_amount = ?, expiry_date = ?, status = ?, remote_id = ?, synced = 1
              WHERE id = ?
            `).run(
              cleanCode,
              rv.name || '',
              rv.type || 'FIXED',
              Number(rv.amount || 0),
              Number(rv.claimed_amount || 0),
              expDate,
              rv.status || 'ACTIVE',
              rv.id,
              localId
            );
          } else {
            const ins = db.prepare(`
              INSERT INTO vouchers (code, name, type, amount, claimed_amount, expiry_date, status, remote_id, synced)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            `).run(
              cleanCode,
              rv.name || '',
              rv.type || 'FIXED',
              Number(rv.amount || 0),
              Number(rv.claimed_amount || 0),
              expDate,
              rv.status || 'ACTIVE',
              rv.id
            );
            localId = Number(ins.lastInsertRowid);
          }

          if (localId) {
            db.prepare('DELETE FROM voucher_restrictions WHERE voucher_id = ?').run(localId);
            const rList = restrByVoucher.get(rv.id) || [];
            const insR = db.prepare('INSERT INTO voucher_restrictions (voucher_id, type, target_id) VALUES (?, ?, ?)');
            for (const r of rList) {
              insR.run(localId, r.restriction_type || r.type || 'CATEGORY', Number(r.target_id) || 1);
            }
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote vouchers:', err);
  }

  // 10. Pull categories from remote MariaDB
  try {
    const [remoteCats]: any = await pool.query('SELECT * FROM novafreshmart_categories');
    if (Array.isArray(remoteCats) && remoteCats.length > 0) {
      db.transaction(() => {
        for (const cat of remoteCats) {
          if (!cat.name || !cat.name.trim()) continue;
          const cleanName = cat.name.trim();
          const existing: any = db.prepare('SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(?)').get(cleanName);
          if (existing) {
            db.prepare('UPDATE categories SET color = ?, icon = ?, remote_id = ? WHERE id = ?').run(cat.color || '', cat.icon || '', String(cat.id), existing.id);
          } else {
            db.prepare('INSERT INTO categories (name, color, icon, remote_id, synced) VALUES (?, ?, ?, ?, 1)').run(cleanName, cat.color || '', cat.icon || '', String(cat.id));
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote categories:', err);
  }

  // 10b. Pull expenses from remote MariaDB
  try {
    const [remoteExpenses]: any = await pool.query(`
      SELECT * FROM novafreshmart_expenses 
      WHERE (branch_id = ? OR branch_id = 'ALL' OR branch_id IS NULL OR branch_id = '')
      ORDER BY date DESC LIMIT 200
    `, [branchId]);
    if (Array.isArray(remoteExpenses) && remoteExpenses.length > 0) {
      const upsertExp = db.prepare(`
        INSERT INTO expenses (amount, category, description, created_by, date, branch_id, terminal_id, remote_id, synced)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `);
      db.transaction(() => {
        for (const exp of remoteExpenses) {
          const existing: any = db.prepare('SELECT id FROM expenses WHERE remote_id = ?').get(exp.id);
          if (existing) {
            db.prepare('UPDATE expenses SET amount = ?, category = ?, description = ?, created_by = ?, date = ?, synced = 1 WHERE id = ?').run(
              Number(exp.amount || 0),
              exp.category || 'General',
              exp.description || '',
              exp.created_by || 'Cashier',
              exp.date,
              existing.id
            );
          } else {
            upsertExp.run(
              Number(exp.amount || 0),
              exp.category || 'General',
              exp.description || '',
              exp.created_by || 'Cashier',
              exp.date,
              exp.branch_id || branchId,
              exp.terminal_id || 'TERM-01',
              exp.id
            );
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote expenses:', err);
  }

  // 11. Pull suppliers from remote MariaDB
  try {
    const [remoteSuppliers]: any = await pool.query('SELECT * FROM novafreshmart_suppliers');
    if (Array.isArray(remoteSuppliers) && remoteSuppliers.length > 0) {
      const upsertSup = db.prepare(`
        INSERT INTO suppliers (id, name, contact, contact_person, phone, email, address, opening_balance, current_balance, synced, remote_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          contact = excluded.contact,
          contact_person = excluded.contact_person,
          phone = excluded.phone,
          email = excluded.email,
          address = excluded.address,
          opening_balance = excluded.opening_balance,
          current_balance = excluded.current_balance,
          synced = 1,
          remote_id = excluded.remote_id
      `);
      db.transaction(() => {
        for (const s of remoteSuppliers) {
          const supId = isNaN(Number(s.id.replace('SUP-', ''))) ? Math.abs(hashString(s.id)) : Number(s.id.replace('SUP-', ''));
          const contactVal = s.phone || s.contact_person || '';
          upsertSup.run(
            supId,
            s.name,
            contactVal,
            s.contact_person || contactVal,
            s.phone || contactVal,
            s.email || '',
            s.address || '',
            Number(s.opening_balance || 0),
            Number(s.current_balance || 0),
            s.id
          );
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote suppliers:', err);
  }

  // 12. Pull store settings from remote MariaDB
  try {
    const [remoteSettings]: any = await pool.query('SELECT * FROM novafreshmart_settings');
    if (Array.isArray(remoteSettings) && remoteSettings.length > 0) {
      const upsertSetting = db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `);
      const LOCAL_ONLY_SETTINGS = new Set([
        'printerName', 'printer', 'escposEnabled', 'autoOpenDrawer',
        'posLayout', 'backup_directory', 'auto_backup_enabled',
        'auto_backup_interval_minutes', 'auto_backup_retention', 'last_auto_backup_time'
      ]);
      db.transaction(() => {
        for (const st of remoteSettings) {
          if (LOCAL_ONLY_SETTINGS.has(st.key_name)) continue;
          upsertSetting.run(st.key_name, st.value_text);
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote settings:', err);
  }

  // 13. Pull custom bill items from remote MariaDB
  try {
    const [remoteCustomItems]: any = await pool.query(`
      SELECT * FROM novafreshmart_custom_bill_items 
      ORDER BY id DESC LIMIT 100
    `);
    if (Array.isArray(remoteCustomItems) && remoteCustomItems.length > 0) {
      const findCustom = db.prepare('SELECT id FROM custom_bill_items WHERE remote_id = ? OR (invoice_id = ? AND item_name = ?)');
      const checkInvoice = db.prepare('SELECT id FROM invoices WHERE id = ? OR invoice_no = ? OR remote_id = ?');
      const insCustom = db.prepare(`
        INSERT INTO custom_bill_items (
          invoice_id, branch_id, terminal_id, cashier, item_name, quantity, unit, unit_price, total_price, notes, created_at, synced, remote_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      db.transaction(() => {
        for (const ci of remoteCustomItems) {
          // If custom item belongs to an invoice, verify that invoice exists and is not deleted
          let localInvId: number | null = null;
          if (ci.invoice_id) {
            const invRow: any = checkInvoice.get(ci.invoice_id, ci.invoice_id, ci.invoice_id);
            if (!invRow) {
              // Invoice was deleted or not found, skip pulling orphaned custom item
              continue;
            }
            localInvId = invRow.id;
          }

          const exists = findCustom.get(ci.id, localInvId || -1, ci.item_name);
          if (!exists) {
            const createdAtStr = ci.created_at ? new Date(ci.created_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
            insCustom.run(
              localInvId,
              ci.branch_id || branchId,
              ci.terminal_id || 'TERM-01',
              ci.cashier || 'Cashier',
              ci.item_name,
              Number(ci.quantity || 1),
              ci.unit || 'pc',
              Number(ci.unit_price || 0),
              Number(ci.total_price || 0),
              ci.notes || '',
              createdAtStr,
              ci.id
            );
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote custom items:', err);
  }

  // 14. Pull Purchase Orders & items from remote MariaDB
  try {
    const [remotePOs]: any = await pool.query('SELECT * FROM novafreshmart_purchase_orders ORDER BY created_at DESC LIMIT 50');
    if (Array.isArray(remotePOs) && remotePOs.length > 0) {
      const upsertPO = db.prepare(`
        INSERT INTO purchase_orders (id, supplier_id, status, expected_delivery_date, created_by, approved_by, supplier_invoice_no, created_at, synced, remote_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          supplier_id = excluded.supplier_id,
          status = excluded.status,
          expected_delivery_date = excluded.expected_delivery_date,
          approved_by = excluded.approved_by,
          supplier_invoice_no = excluded.supplier_invoice_no,
          synced = 1,
          remote_id = excluded.remote_id
      `);
      const [remotePOItems]: any = await pool.query('SELECT * FROM novafreshmart_purchase_order_items');
      const poItemsByPo = new Map<string, any[]>();
      if (Array.isArray(remotePOItems)) {
        for (const pi of remotePOItems) {
          const arr = poItemsByPo.get(pi.po_id) || [];
          arr.push(pi);
          poItemsByPo.set(pi.po_id, arr);
        }
      }

      db.transaction(() => {
        for (const po of remotePOs) {
          const poId = isNaN(Number(po.id.replace('PO-', ''))) ? Math.abs(hashString(po.id)) : Number(po.id.replace('PO-', ''));
          const supId = po.supplier_id ? (isNaN(Number(po.supplier_id.replace('SUP-', ''))) ? Math.abs(hashString(po.supplier_id)) : Number(po.supplier_id.replace('SUP-', ''))) : null;
          const createdAtStr = po.created_at ? new Date(po.created_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
          upsertPO.run(
            poId,
            supId,
            po.status || 'DRAFT',
            po.expected_delivery_date ? new Date(po.expected_delivery_date).toISOString().slice(0, 19).replace('T', ' ') : null,
            po.created_by || 'Admin',
            po.approved_by || null,
            po.supplier_invoice_no || null,
            createdAtStr,
            po.id
          );

          const items = poItemsByPo.get(po.id) || [];
          if (items.length > 0) {
            db.prepare('DELETE FROM purchase_order_items WHERE po_id = ?').run(poId);
            const insItem = db.prepare('INSERT INTO purchase_order_items (po_id, product_id, qty_ordered, unit_cost) VALUES (?, ?, ?, ?)');
            for (const item of items) {
              const pId = Number(item.product_id) || Math.abs(hashString(item.product_id));
              insItem.run(poId, pId, Number(item.qty_ordered || 0), Number(item.unit_cost || 0));
            }
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote purchase orders:', err);
  }

  // 15. Pull GRNs & items (Purchase Bills) from remote MariaDB
  try {
    const [remoteGRNs]: any = await pool.query('SELECT * FROM novafreshmart_grn ORDER BY received_at DESC LIMIT 50');
    if (Array.isArray(remoteGRNs) && remoteGRNs.length > 0) {
      const upsertGRN = db.prepare(`
        INSERT INTO grn (id, po_id, total_cost, supplier_id, received_at, status, approved_by, supplier_invoice_no, received_by, items_json, synced, remote_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          total_cost = excluded.total_cost,
          supplier_id = excluded.supplier_id,
          status = COALESCE(excluded.status, grn.status),
          approved_by = COALESCE(excluded.approved_by, grn.approved_by),
          supplier_invoice_no = COALESCE(excluded.supplier_invoice_no, grn.supplier_invoice_no),
          received_by = COALESCE(excluded.received_by, grn.received_by),
          synced = 1,
          remote_id = excluded.remote_id
      `);
      const [remoteGRNItems]: any = await pool.query('SELECT * FROM novafreshmart_grn_items');
      const grnItemsMap = new Map<string, any[]>();
      if (Array.isArray(remoteGRNItems)) {
        for (const gi of remoteGRNItems) {
          const arr = grnItemsMap.get(gi.grn_id) || [];
          arr.push(gi);
          grnItemsMap.set(gi.grn_id, arr);
        }
      }

      db.transaction(() => {
        for (const grn of remoteGRNs) {
          const grnId = isNaN(Number(grn.id.replace('GRN-', ''))) ? Math.abs(hashString(grn.id)) : Number(grn.id.replace('GRN-', ''));
          const poId = grn.po_id ? (isNaN(Number(grn.po_id.replace('PO-', ''))) ? Math.abs(hashString(grn.po_id)) : Number(grn.po_id.replace('PO-', ''))) : null;
          const supId = grn.supplier_id ? (isNaN(Number(grn.supplier_id.replace('SUP-', ''))) ? Math.abs(hashString(grn.supplier_id)) : Number(grn.supplier_id.replace('SUP-', ''))) : null;
          const receivedAtStr = grn.received_at ? new Date(grn.received_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');

          upsertGRN.run(
            grnId,
            poId,
            Number(grn.total_cost || 0),
            supId,
            receivedAtStr,
            grn.status || 'APPROVED',
            grn.approved_by || null,
            grn.supplier_invoice_no || null,
            grn.received_by || null,
            grn.items_json || null,
            grn.id
          );

          const items = grnItemsMap.get(grn.id) || [];
          if (items.length > 0) {
            db.prepare('DELETE FROM grn_items WHERE grn_id = ?').run(grnId);
            const insGi = db.prepare('INSERT INTO grn_items (grn_id, product_id, variant_id, qty_received, free_qty, unit_cost, effective_cost, new_sale_price, new_wholesale_price, synced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
            for (const gi of items) {
              const pId = Number(gi.product_id) || Math.abs(hashString(gi.product_id));
              const vId = gi.variant_id ? (Number(gi.variant_id) || null) : null;
              insGi.run(
                grnId,
                pId,
                vId,
                Number(gi.qty_received || 0),
                Number(gi.free_qty || 0),
                Number(gi.unit_cost || 0),
                Number(gi.effective_cost || gi.unit_cost || 0),
                gi.new_sale_price ? Number(gi.new_sale_price) : null,
                Number(gi.new_wholesale_price || 0)
              );
            }
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote GRNs:', err);
  }

  // 16. Pull Customer Credit Accounts & Transactions from remote MariaDB
  try {
    const [remoteCreditAccts]: any = await pool.query('SELECT * FROM novafreshmart_credit_accounts');
    if (Array.isArray(remoteCreditAccts) && remoteCreditAccts.length > 0) {
      const upsertCA = db.prepare(`
        INSERT INTO credit_accounts (id, customer_id, credit_limit, balance, status, synced, remote_id)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO UPDATE SET
          balance = excluded.balance,
          credit_limit = excluded.credit_limit,
          status = excluded.status,
          synced = 1,
          remote_id = excluded.remote_id
      `);
      db.transaction(() => {
        for (const ca of remoteCreditAccts) {
          const caId = isNaN(Number(ca.id.replace('CRED-', ''))) ? Math.abs(hashString(ca.id)) : Number(ca.id.replace('CRED-', ''));
          const custId = isNaN(Number(ca.customer_id.replace('CUST-', ''))) ? Math.abs(hashString(ca.customer_id)) : Number(ca.customer_id.replace('CUST-', ''));
          upsertCA.run(
            caId,
            custId,
            Number(ca.credit_limit || 0),
            Number(ca.balance || 0),
            ca.status || 'ACTIVE',
            ca.id
          );
          // Also update customer credit_balance cache
          db.prepare('UPDATE customers SET credit_balance = ? WHERE id = ?').run(Number(ca.balance || 0), custId);
        }
      })();
    }

    const [remoteCreditTx]: any = await pool.query('SELECT * FROM novafreshmart_credit_transactions ORDER BY created_at DESC LIMIT 100');
    if (Array.isArray(remoteCreditTx) && remoteCreditTx.length > 0) {
      const findTx = db.prepare('SELECT id FROM credit_transactions WHERE remote_id = ? OR (account_id = ? AND type = ? AND amount = ? AND created_at = ?)');
      const insTx = db.prepare(`
        INSERT INTO credit_transactions (id, account_id, type, amount, reference_id, notes, created_at, synced, remote_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      db.transaction(() => {
        for (const ctx of remoteCreditTx) {
          const txId = isNaN(Number(ctx.id.replace('CTX-', ''))) ? Math.abs(hashString(ctx.id)) : Number(ctx.id.replace('CTX-', ''));
          const acctId = isNaN(Number(ctx.account_id.replace('CRED-', ''))) ? Math.abs(hashString(ctx.account_id)) : Number(ctx.account_id.replace('CRED-', ''));
          const createdAtStr = ctx.created_at ? new Date(ctx.created_at).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');
          const refId = ctx.reference_id ? Number(ctx.reference_id.replace(/[^0-9]/g, '')) || null : null;
          
          const exists = findTx.get(ctx.id, acctId, ctx.type, Number(ctx.amount || 0), createdAtStr);
          if (!exists) {
            try {
              insTx.run(txId, acctId, ctx.type, Number(ctx.amount || 0), refId, ctx.notes || '', createdAtStr, ctx.id);
            } catch (_) {}
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote credit accounts/transactions:', err);
  }

  // 17. Pull Inventory Ledger from remote MariaDB
  try {
    const [remoteLedger]: any = await pool.query(`
      SELECT * FROM novafreshmart_inventory_ledger 
      ORDER BY id DESC 
      LIMIT 200
    `);

    if (Array.isArray(remoteLedger) && remoteLedger.length > 0) {
      const findLedger = db.prepare(`
        SELECT id FROM inventory_ledger 
        WHERE remote_id = ? OR (product_id = ? AND transaction_type = ? AND qty_change = ? AND balance_after = ? AND created_at = ?)
      `);
      const findProd = db.prepare(`
        SELECT id FROM products WHERE id = ? OR barcode = ? OR remote_id = ? LIMIT 1
      `);
      const insLedger = db.prepare(`
        INSERT INTO inventory_ledger 
          (product_id, transaction_type, reference_id, qty_change, balance_after, unit_cost, notes, created_by, created_at, synced, remote_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);

      db.transaction(() => {
        for (const row of remoteLedger) {
          const remoteIdStr = String(row.id);
          // product_id in remote is stored as numeric string (e.g. "2830") - cast to number for SQLite integer lookup
          const numericId = Number(row.product_id) || 0;
          const prod = findProd.get(numericId, row.product_id, row.product_id) as any;
          if (!prod) continue;

          const localProdId = prod.id;
          const createdAtStr = row.created_at ? String(row.created_at).replace('T', ' ').slice(0, 19) : getSriLankaNowString();
          const refId = row.reference_id ? (Number(String(row.reference_id).replace(/[^0-9]/g, '')) || null) : null;

          const exists = findLedger.get(remoteIdStr, localProdId, row.transaction_type, row.qty_change, row.balance_after, createdAtStr);
          if (!exists) {
            try {
              insLedger.run(
                localProdId,
                row.transaction_type,
                refId,
                Number(row.qty_change || 0),
                Number(row.balance_after || 0),
                row.unit_cost !== null && row.unit_cost !== undefined ? Number(row.unit_cost) : null,
                row.notes || null,
                row.created_by || 'System',
                createdAtStr,
                remoteIdStr
              );
            } catch (_) {}
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[Sync] Could not pull remote inventory ledger:', err);
  }

  // Broadcast to all windows that full catalog pull is complete
  try {
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) {
        w.webContents.send('products-updated');
        w.webContents.send('sync-data-updated');
      }
    });
  } catch (_) {}
}

// Fast employee-only pull â€” used by get-users IPC to avoid full sync latency
export async function pullEmployeesOnly(db: Database.Database) {
  const isOnline = await checkRemoteConnection(1500);
  if (!isOnline) return;
  const pool = getRemotePool();
  try {
    const [remoteEmps]: any = await pool.query('SELECT * FROM novafreshmart_employees WHERE is_active = 1');
    if (!Array.isArray(remoteEmps) || remoteEmps.length === 0) return;
    const ALL_ADMIN_PERMS = JSON.stringify(['POS', 'Inventory', 'GRN', 'Reports', 'Customers', 'Suppliers', 'Vouchers', 'Promotions', 'Expenses', 'Branches', 'Settings', 'Users', 'Refunds', 'Discounts', 'Delete Invoice', 'View Invoices', 'Edit Invoices', 'Custom Items', 'Backup Hub']);
    const upsertEmp = db.prepare(`
      INSERT INTO users (username, pin, role, permissions, phone, nic, address, salary, bank_account, branch_id, allowed_terminals, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        pin = excluded.pin,
        role = excluded.role,
        permissions = COALESCE(excluded.permissions, users.permissions),
        phone = COALESCE(excluded.phone, users.phone),
        branch_id = excluded.branch_id,
        allowed_terminals = COALESCE(excluded.allowed_terminals, users.allowed_terminals),
        updated_at = excluded.updated_at
    `);
    db.transaction(() => {
      for (const emp of remoteEmps) {
        const perms = emp.role === 'Admin' ? ALL_ADMIN_PERMS : (emp.permissions || JSON.stringify(['POS']));
        upsertEmp.run(
          emp.username, emp.pin, emp.role || 'Cashier', perms,
          emp.phone || null, emp.nic || null, emp.address || null,
          Number(emp.salary || 0), emp.bank_account || null,
          emp.branch_id || 'ALL', emp.allowed_terminals || 'ALL',
          emp.updated_at ? String(emp.updated_at) : null
        );
      }
    })();
    // Remove deactivated users
    const [inactiveEmps]: any = await pool.query('SELECT username FROM novafreshmart_employees WHERE is_active = 0');
    if (Array.isArray(inactiveEmps) && inactiveEmps.length > 0) {
      db.transaction(() => {
        for (const ie of inactiveEmps) {
          if (ie.username && ie.username.toLowerCase() !== 'admin') {
            db.prepare("DELETE FROM users WHERE username = ? AND LOWER(username) != 'admin'").run(ie.username);
          }
        }
      })();
    }
  } catch (err) {
    console.warn('[pullEmployeesOnly] Failed:', err);
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

// Process any incoming remote database reset events before pushing or pulling data
export async function processRemoteResetEvents(db: Database.Database) {
  try {
    const pool = getRemotePool();
    const [events]: any = await pool.query('SELECT * FROM novafreshmart_reset_events ORDER BY id ASC');

    if (!Array.isArray(events) || events.length === 0) return;

    const checkStmt = db.prepare('SELECT event_id FROM reset_events_processed WHERE event_id = ?');
    const markStmt = db.prepare('INSERT OR IGNORE INTO reset_events_processed (event_id, section) VALUES (?, ?)');

    for (const evt of events) {
      const alreadyProcessed = checkStmt.get(evt.id);
      if (alreadyProcessed) continue;

      console.log(`[Sync] Applying remote reset event #${evt.id} for section '${evt.section}' (initiated by ${evt.reset_by})`);

      db.transaction(() => {
        switch (evt.section) {
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
        }

        markStmt.run(evt.id, evt.section);
      })();

      try {
        BrowserWindow.getAllWindows().forEach(w => {
          w.webContents.send('database-section-reset', { section: evt.section });
          w.webContents.send('sync-data-updated');
        });
      } catch (_) {}
    }
  } catch (err: any) {
    console.warn('[Sync] Could not process remote reset events:', err.message);
  }
}

// Master sync function
export async function runFullSync(db: Database.Database, forcePull: boolean = false) {
  if (isSyncing) return lastSyncResult;
  isSyncing = true;
  syncLog('[SYNC] ▶ Cycle started');

  try {
    const isOnline = await checkRemoteConnection();
    if (!isOnline) {
      syncLog('[SYNC] ✗ Remote DB OFFLINE — working locally');
      const unsyncedCount: any = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE synced = 0').get();
      lastSyncResult = {
        success: false,
        message: 'Offline (Working Locally)',
        pendingCount: unsyncedCount.cnt || 0
      };
      return lastSyncResult;
    }
    syncLog('[NET] Remote DB connected ✔');

    await initRemoteTables();
    await processRemoteResetEvents(db);
    await pushUnsyncedData(db);

    if (forcePull) {
      syncLog('[SYNC] Force cloud refresh requested — pulling latest catalog...');
      await pullLatestData(db);
      try {
        const pool = getRemotePool();
        const [rows]: any = await pool.query(`
          SELECT GREATEST(
            COALESCE((SELECT MAX(updated_at) FROM novafreshmart_products), '1970-01-01'),
            COALESCE((SELECT MAX(updated_at) FROM novafreshmart_categories), '1970-01-01'),
            COALESCE((SELECT MAX(updated_at) FROM novafreshmart_brands), '1970-01-01'),
            COALESCE((SELECT MAX(received_at) FROM novafreshmart_grn), '1970-01-01'),
            COALESCE((SELECT MAX(updated_at) FROM novafreshmart_purchase_orders), '1970-01-01'),
            COALESCE((SELECT MAX(deleted_at) FROM novafreshmart_deleted_records), '1970-01-01'),
            COALESCE((SELECT MAX(created_at) FROM novafreshmart_inventory_ledger), '1970-01-01'),
            COALESCE((SELECT GREATEST(COALESCE(value_text, '1970-01-01'), COALESCE(updated_at, '1970-01-01')) FROM novafreshmart_settings WHERE key_name = 'catalog_last_updated' LIMIT 1), '1970-01-01')
          ) as latest_cat_ts
        `);
        if (rows[0]?.latest_cat_ts) {
          lastKnownCatalogUpdate = String(rows[0].latest_cat_ts);
        }
      } catch (_) {}
    } else {
      await checkAndSyncCatalogLive(db);
    }

    lastSyncTime = new Date().toLocaleTimeString();
    const unsyncedCount: any = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE synced = 0').get();

    lastSyncResult = {
      success: true,
      message: `Online • Synced at ${lastSyncTime}`,
      pendingCount: unsyncedCount.cnt || 0
    };

    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('sync-completed', { success: true });
          w.webContents.send('sync-data-updated');
          w.webContents.send('products-updated');
          w.webContents.send('users-updated');
        }
      });
    } catch (_) {}
  } catch (err: any) {
    console.error('[SyncService] Sync failed:', err.message);
    const unsyncedCount: any = db.prepare('SELECT COUNT(*) as cnt FROM invoices WHERE synced = 0').get();
    lastSyncResult = {
      success: false,
      message: `Sync warning: ${err.message}`,
      pendingCount: unsyncedCount.cnt || 0
    };
  } finally {
    isSyncing = false;
    try {
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('sync-completed', lastSyncResult);
        }
      });
    } catch (_) {}
  }

  return lastSyncResult;
}

let liveWatcherInterval: any = null;
let lastKnownCatalogUpdate: string | null = null;
let isLiveCatalogSyncing = false;

export async function checkAndSyncCatalogLive(db: Database.Database) {
  if (isLiveCatalogSyncing) return;
  try {
    const isOnline = await checkRemoteConnection(1500);
    if (!isOnline) return;

    const pool = getRemotePool();
    // Fast lightweight check across products, categories, brands, GRN, POs, deleted records, ledger, and settings
    const [rows]: any = await pool.query(`
      SELECT GREATEST(
        COALESCE((SELECT MAX(updated_at) FROM novafreshmart_products), '1970-01-01'),
        COALESCE((SELECT MAX(updated_at) FROM novafreshmart_categories), '1970-01-01'),
        COALESCE((SELECT MAX(updated_at) FROM novafreshmart_brands), '1970-01-01'),
        COALESCE((SELECT MAX(received_at) FROM novafreshmart_grn), '1970-01-01'),
        COALESCE((SELECT MAX(updated_at) FROM novafreshmart_purchase_orders), '1970-01-01'),
        COALESCE((SELECT MAX(deleted_at) FROM novafreshmart_deleted_records), '1970-01-01'),
        COALESCE((SELECT MAX(created_at) FROM novafreshmart_inventory_ledger), '1970-01-01'),
        COALESCE((SELECT GREATEST(COALESCE(value_text, '1970-01-01'), COALESCE(updated_at, '1970-01-01')) FROM novafreshmart_settings WHERE key_name = 'catalog_last_updated' LIMIT 1), '1970-01-01')
      ) as latest_cat_ts
    `);

    const latestTs = rows[0]?.latest_cat_ts ? String(rows[0].latest_cat_ts) : null;
    if (!latestTs) return;

    if (!lastKnownCatalogUpdate) {
      // Cold-start parity check: pull immediately so terminal has everything added while it was closed
      isLiveCatalogSyncing = true;
      syncLog('[LiveWatcher] Initial parity check on boot, pulling cloud catalog...');
      await pullLatestData(db);
      lastKnownCatalogUpdate = latestTs;
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('products-updated');
          w.webContents.send('sync-data-updated');
          w.webContents.send('sync-completed', { success: true });
        }
      });
      return;
    }

    if (latestTs !== lastKnownCatalogUpdate) {
      isLiveCatalogSyncing = true;
      syncLog(`[LiveWatcher] Cloud catalog change detected (${latestTs} vs ${lastKnownCatalogUpdate}), pulling updates...`);
      await pullLatestData(db);
      lastKnownCatalogUpdate = latestTs;
      BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
          w.webContents.send('products-updated');
          w.webContents.send('sync-data-updated');
          w.webContents.send('sync-completed', { success: true });
        }
      });
    }
  } catch (err: any) {
    // Ignore heartbeat errors
  } finally {
    isLiveCatalogSyncing = false;
  }
}

export function startAutoSync(db: Database.Database, intervalMs = 15000) {
  if (syncInterval) clearInterval(syncInterval);
  if (liveWatcherInterval) clearInterval(liveWatcherInterval);

  // Initial run immediately in background
  setTimeout(() => runFullSync(db), 100);

  // Periodic master sync for sales, shifts, vouchers, etc. (every 15s)
  syncInterval = setInterval(() => {
    runFullSync(db);
  }, intervalMs);

  // High-frequency live catalog watcher (checks lightweight timestamp every 3 seconds)
  liveWatcherInterval = setInterval(() => {
    checkAndSyncCatalogLive(db);
  }, 3000);
}

// Branch and Terminal Management Functions
export async function createBranch(db: Database.Database, branch: { id?: string; name: string; code?: string; address?: string; phone?: string }) {
  const branchId = branch.id || `BR-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`
    INSERT INTO branches (id, name, code, address, phone, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
  `).run(branchId, branch.name, branch.code || '', branch.address || '', branch.phone || '');

  const isOnline = await checkRemoteConnection();
  if (isOnline) {
    try {
      const pool = getRemotePool();
      await pool.query(`
        INSERT INTO novafreshmart_branches (id, name, code, address, phone, is_active)
        VALUES (?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE name=VALUES(name), code=VALUES(code), address=VALUES(address), phone=VALUES(phone)
      `, [branchId, branch.name, branch.code || '', branch.address || '', branch.phone || '']);
    } catch (e) {
      console.warn('Could not sync branch to remote:', e);
    }
  }

  return { id: branchId, ...branch };
}

export async function createTerminal(db: Database.Database, term: { id?: string; branch_id: string; name: string }) {
  const termId = term.id || `TERM-${Date.now().toString(36).toUpperCase()}`;
  db.prepare(`
    INSERT INTO terminals (id, branch_id, name, status, last_active)
    VALUES (?, ?, ?, 'online', CURRENT_TIMESTAMP)
  `).run(termId, term.branch_id, term.name);

  const isOnline = await checkRemoteConnection();
  if (isOnline) {
    try {
      const pool = getRemotePool();
      await pool.query(`
        INSERT INTO novafreshmart_terminals (id, branch_id, name, status, last_active_at)
        VALUES (?, ?, ?, 'online', CURRENT_TIMESTAMP)
        ON DUPLICATE KEY UPDATE name=VALUES(name), branch_id=VALUES(branch_id)
      `, [termId, term.branch_id, term.name]);
    } catch (e) {
      console.warn('Could not sync terminal to remote:', e);
    }
  }

  return { id: termId, ...term };
}

export async function deleteTerminal(db: Database.Database, terminalId: string) {
  db.prepare('DELETE FROM terminals WHERE id = ?').run(terminalId);
  try {
    db.prepare('INSERT OR IGNORE INTO deleted_records_processed (table_name, record_id) VALUES (?, ?)').run('terminals', terminalId);
  } catch (_) {}

  const isOnline = await checkRemoteConnection();
  if (isOnline) {
    try {
      const pool = getRemotePool();
      await pool.query('UPDATE novafreshmart_terminals SET is_active = 0 WHERE id = ?', [terminalId]);
      await pool.query('DELETE FROM novafreshmart_terminals WHERE id = ?', [terminalId]);
      await pool.query('INSERT INTO novafreshmart_deleted_records (table_name, record_id) VALUES (?, ?)', ['terminals', terminalId]);
    } catch (e) {
      console.warn('Could not sync terminal deletion to remote:', e);
    }
  }

  return { success: true, id: terminalId };
}

export async function updateTerminal(db: Database.Database, term: { id: string; branch_id: string; name: string }) {
  db.prepare('UPDATE terminals SET branch_id = ?, name = ? WHERE id = ?').run(term.branch_id, term.name, term.id);

  const isOnline = await checkRemoteConnection();
  if (isOnline) {
    try {
      const pool = getRemotePool();
      await pool.query('UPDATE novafreshmart_terminals SET branch_id = ?, name = ? WHERE id = ?', [term.branch_id, term.name, term.id]);
    } catch (e) {
      console.warn('Could not sync terminal update to remote:', e);
    }
  }

  return { success: true, ...term };
}

export async function logTerminalActivity(db: Database.Database, data: { action_type?: string; action?: string; username?: string; cashier?: string; details?: string; branchId?: string; terminalId?: string }) {
  const config = getTerminalConfig(db);
  const isOnline = await checkRemoteConnection();
  if (isOnline) {
    try {
      const pool = getRemotePool();
      await pool.query(`
        INSERT INTO novafreshmart_terminal_logs (branch_id, terminal_id, username, action_type, details)
        VALUES (?, ?, ?, ?, ?)
      `, [
        data.branchId || config.current_branch_id || 'BR-MAIN',
        data.terminalId || config.current_terminal_id || 'TERM-01',
        data.username || data.cashier || 'System',
        data.action_type || data.action || 'ACTION',
        data.details || ''
      ]);
    } catch (e) {
      console.warn('Could not write remote terminal log:', e);
    }
  }
}

// Backoffice live monitoring data
export async function getBackofficeOverview(db: Database.Database) {
  const isOnline = await checkRemoteConnection();
  if (isOnline) {
    const pool = getRemotePool();
    try {
      const [branches]: any = await pool.query('SELECT * FROM novafreshmart_branches WHERE is_active = 1 ORDER BY name ASC');
      const [rawTerminals]: any = await pool.query(`
        SELECT t.*, b.name as branch_name,
               TIMESTAMPDIFF(SECOND, t.last_active_at, NOW()) as last_seen_sec
        FROM novafreshmart_terminals t
        LEFT JOIN novafreshmart_branches b ON t.branch_id = b.id
        WHERE (t.is_active = 1 OR t.is_active IS NULL)
        ORDER BY t.name ASC
      `);

      let deletedTermIds = new Set<string>();
      try {
        deletedTermIds = new Set(
          db.prepare("SELECT record_id FROM deleted_records_processed WHERE table_name = 'terminals'").all().map((r: any) => String(r.record_id))
        );
      } catch (_) {}

      const terminals = Array.isArray(rawTerminals) ? rawTerminals.filter((t: any) => !deletedTermIds.has(String(t.id))) : [];
      const [shifts]: any = await pool.query(`
        SELECT s.*, b.name as branch_name, t.name as terminal_name
        FROM novafreshmart_terminal_shifts s
        LEFT JOIN novafreshmart_branches b ON s.branch_id = b.id
        LEFT JOIN novafreshmart_terminals t ON s.terminal_id = t.id
        ORDER BY s.opened_at DESC LIMIT 50
      `);
      const [todaySales]: any = await pool.query(`
        SELECT 
          branch_id,
          COUNT(*) as total_orders,
          SUM(total) as gross_revenue,
          SUM(cash_paid) as total_cash,
          SUM(card_paid) as total_card
        FROM novafreshmart_sales
        WHERE DATE(created_at) = CURDATE()
        GROUP BY branch_id
      `);
      let terminalSales: any[] = [];
      try {
        const [tSales]: any = await pool.query(`
          SELECT 
            branch_id,
            terminal_id,
            COUNT(*) as total_orders,
            SUM(total) as gross_revenue,
            SUM(cash_paid) as total_cash,
            SUM(card_paid) as total_card
          FROM novafreshmart_sales
          WHERE DATE(created_at) = CURDATE()
          GROUP BY branch_id, terminal_id
        `);
        terminalSales = tSales || [];
      } catch (_) {}
      const [recentLogs]: any = await pool.query(`
        SELECT * FROM novafreshmart_terminal_logs
        ORDER BY created_at DESC LIMIT 30
      `);

      const now = Date.now();
      const config = getTerminalConfig(db);
      for (const t of terminals) {
        const isCurrent = t.id === config.current_terminal_id;
        const lastActiveTime = t.last_active_at ? new Date(t.last_active_at).getTime() : 0;
        const secondsSinceActive = (now - lastActiveTime) / 1000;
        const isRecentlyActive = (t.last_seen_sec != null && t.last_seen_sec < 600) ||
                                (t.last_active_at && Math.abs(secondsSinceActive) < 600);
        t.status = (isCurrent || isRecentlyActive) ? 'online' : 'offline';

        const ts = terminalSales.find((s: any) => s.terminal_id === t.id);
        t.today_revenue = Number(ts?.gross_revenue || 0);
        t.today_orders = Number(ts?.total_orders || 0);
        t.today_cash = Number(ts?.total_cash || 0);
        t.today_card = Number(ts?.total_card || 0);
      }

      // Compute live sales & bill count per open shift from remote MariaDB novafreshmart_sales
      try {
        const [shiftSales]: any = await pool.query(`
          SELECT 
            shift_id,
            terminal_id,
            COUNT(*) as bill_count,
            COALESCE(SUM(total), 0) as shift_revenue,
            COALESCE(SUM(cash_paid), 0) as shift_cash
          FROM novafreshmart_sales
          GROUP BY shift_id, terminal_id
        `);
        const shiftSalesMap = new Map<string, { count: number; revenue: number; cash: number }>();
        if (Array.isArray(shiftSales)) {
          for (const ss of shiftSales) {
            const val = { count: Number(ss.bill_count || 0), revenue: Number(ss.shift_revenue || 0), cash: Number(ss.shift_cash || 0) };
            // Store under shift_id (integer session id), terminal_id, and full shift id string
            if (ss.shift_id) shiftSalesMap.set(String(ss.shift_id), val);
            if (ss.terminal_id) shiftSalesMap.set(String(ss.terminal_id), val);
          }
        }

        for (const s of shifts) {
          // Try: full id, numeric suffix of id, terminal_id
          const shiftIdStr = String(s.id);
          const numSuffix = shiftIdStr.split('-').pop() || shiftIdStr;
          const sm = shiftSalesMap.get(shiftIdStr) || shiftSalesMap.get(numSuffix) || shiftSalesMap.get(String(s.terminal_id));
          if (sm) {
            s.total_sales = sm.revenue;
            s.bill_count = sm.count;
            s.cash_sales = sm.cash;
            s.expected_cash = Number(s.opening_cash || 0) + sm.cash + Number(s.cash_in || 0) - Number(s.cash_out || 0);
          } else {
            s.bill_count = Number(s.total_sales || 0) > 0 ? 1 : 0;
          }
        }
      } catch (_) {}

      // If THIS CURRENT TERMINAL ONLY has an active open session not yet in MariaDB, add it to shifts
      const localActiveSession: any = db.prepare(`
        SELECT * FROM sessions 
        WHERE terminal_id = ? AND (status = 'OPEN' OR status = 'open') AND closed_at IS NULL
        ORDER BY id DESC LIMIT 1
      `).get(config.current_terminal_id);
      if (localActiveSession) {
        const existingIdx = shifts.findIndex((s: any) => s.terminal_id === config.current_terminal_id && (s.status === 'open' || !s.closed_at));
        if (existingIdx === -1) {
          shifts.unshift({
            id: `SH-${localActiveSession.branch_id || config.current_branch_id || 'BR-MAIN'}-${config.current_terminal_id}-${localActiveSession.id}`,
            branch_id: localActiveSession.branch_id || config.current_branch_id || 'BR-MAIN',
            terminal_id: config.current_terminal_id,
            username: localActiveSession.username || 'Cashier',
            opened_at: localActiveSession.opened_at,
            closed_at: null,
            opening_cash: localActiveSession.opening_cash,
            expected_cash: localActiveSession.expected_cash,
            total_sales: localActiveSession.total_sales,
            bill_count: 0,
            status: 'open'
          });
        }
      }

      return {
        online: true,
        branches,
        terminals,
        shifts,
        todaySales,
        recentLogs
      };
    } catch (e: any) {
      console.warn('[Backoffice] Remote query failed, falling back to local SQLite:', e.message);
    }
  }

  // Offline fallback from local SQLite
  const branches = db.prepare('SELECT * FROM branches ORDER BY name ASC').all();
  const terminals = db.prepare(`
    SELECT t.*, b.name as branch_name 
    FROM terminals t 
    LEFT JOIN branches b ON t.branch_id = b.id 
    ORDER BY t.name ASC
  `).all();
  const shifts = db.prepare(`
    SELECT s.*, b.name as branch_name, t.name as terminal_name
    FROM sessions s
    LEFT JOIN branches b ON s.branch_id = b.id
    LEFT JOIN terminals t ON s.terminal_id = t.id
    ORDER BY s.opened_at DESC LIMIT 100
  `).all();
  const todaySales = db.prepare(`
    SELECT branch_id, COUNT(*) as total_orders, SUM(total) as gross_revenue
    FROM invoices
    WHERE DATE(created_at) = DATE('now')
    GROUP BY branch_id
  `).all();
  const recentInvoices = db.prepare(`
    SELECT i.*, b.name as branch_name, t.name as terminal_name
    FROM invoices i
    LEFT JOIN branches b ON i.branch_id = b.id
    LEFT JOIN terminals t ON i.terminal_id = t.id
    ORDER BY i.id DESC LIMIT 100
  `).all();

  return {
    online: false,
    branches,
    terminals,
    shifts,
    todaySales,
    recentInvoices,
    recentLogs: []
  };
}
