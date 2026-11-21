import mysql from 'mysql2/promise';

export const REMOTE_DB_CONFIG = {
  host: 'sg-mariadb01.offloadsql.com',
  port: 3306,
  user: 'sql23659_providerid9640',
  password: 'yv4R1(2r0T@jAcM!6',
  database: 'sql23659_providerid9640',
  connectTimeout: 5000,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool: mysql.Pool | null = null;
let isConnected = false;
let lastError: string | null = null;
let lastCheckTime = 0;

export function getRemotePool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool(REMOTE_DB_CONFIG);
  }
  return pool;
}

export async function checkRemoteConnection(timeoutMs = 4500): Promise<boolean> {
  const now = Date.now();
  // If we connected successfully less than 5 seconds ago, reuse status to avoid connection pool contention
  if (isConnected && (now - lastCheckTime < 5000)) {
    return true;
  }

  let timer: any;
  const timeoutPromise = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });

  const pingPromise = (async () => {
    try {
      const currentPool = getRemotePool();
      const conn = await currentPool.getConnection();
      await conn.ping();
      conn.release();
      isConnected = true;
      lastCheckTime = Date.now();
      lastError = null;
      return true;
    } catch (err: any) {
      isConnected = false;
      lastError = err.message || 'Connection failed';
      return false;
    }
  })();

  const result = await Promise.race([pingPromise, timeoutPromise]);
  clearTimeout(timer);
  if (!result) isConnected = false;
  return Boolean(result);
}

export function getRemoteStatus() {
  return {
    online: isConnected,
    lastError,
    database: REMOTE_DB_CONFIG.database,
    host: REMOTE_DB_CONFIG.host
  };
}

let tablesInitialized = false;

// Initialize only isolated novafreshmart_* tables
export async function initRemoteTables() {
  if (tablesInitialized) return true;

  const online = await checkRemoteConnection();
  if (!online) {
    console.warn('[RemoteDB] Remote database offline, operating in offline-first mode.');
    return false;
  }

  const p = getRemotePool();
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_branches (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50),
        address TEXT,
        phone VARCHAR(50),
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_terminals (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        device_info TEXT,
        last_active_at DATETIME,
        last_sync_at DATETIME,
        active_user VARCHAR(100),
        status VARCHAR(50) DEFAULT 'offline',
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch (branch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_terminals ADD COLUMN is_active TINYINT DEFAULT 1'); } catch(e) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_terminal_shifts (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        terminal_id VARCHAR(64) NOT NULL,
        user_id INT,
        username VARCHAR(100) NOT NULL,
        opened_at DATETIME NOT NULL,
        closed_at DATETIME,
        opening_cash DECIMAL(12,2) DEFAULT 0,
        expected_cash DECIMAL(12,2) DEFAULT 0,
        closing_cash DECIMAL(12,2) DEFAULT 0,
        cash_sales DECIMAL(12,2) DEFAULT 0,
        card_sales DECIMAL(12,2) DEFAULT 0,
        other_sales DECIMAL(12,2) DEFAULT 0,
        total_sales DECIMAL(12,2) DEFAULT 0,
        total_refunds DECIMAL(12,2) DEFAULT 0,
        cash_in DECIMAL(12,2) DEFAULT 0,
        cash_out DECIMAL(12,2) DEFAULT 0,
        discrepancy DECIMAL(12,2) DEFAULT 0,
        notes TEXT,
        status VARCHAR(50) DEFAULT 'open',
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch_term (branch_id, terminal_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_terminal_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        branch_id VARCHAR(64),
        terminal_id VARCHAR(64),
        username VARCHAR(100),
        action_type VARCHAR(100) NOT NULL,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_products (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL DEFAULT 'ALL',
        barcode VARCHAR(100),
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) DEFAULT 'General',
        price DECIMAL(12,2) NOT NULL DEFAULT 0,
        wholesale_price DECIMAL(12,2) DEFAULT 0,
        cost_price DECIMAL(12,2) DEFAULT 0,
        stock DECIMAL(12,2) NOT NULL DEFAULT 0,
        unit VARCHAR(50) DEFAULT 'pcs',
        is_scale_item TINYINT DEFAULT 0,
        plu VARCHAR(50),
        image_url TEXT,
        is_active TINYINT DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_branch_barcode (branch_id, barcode)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_products ADD COLUMN is_scale_item TINYINT DEFAULT 0'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_products ADD COLUMN plu VARCHAR(50)'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_products ADD COLUMN allow_price_override TINYINT DEFAULT 1'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_products ADD COLUMN category_id VARCHAR(64)'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_products ADD COLUMN category VARCHAR(100) DEFAULT "General"'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_products ADD COLUMN expiry_date VARCHAR(50)'); } catch(e) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_expenses (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL DEFAULT 'BR-MAIN',
        terminal_id VARCHAR(64) NOT NULL DEFAULT 'TERM-01',
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        category VARCHAR(100) NOT NULL,
        description TEXT,
        created_by VARCHAR(100),
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_branch_date (branch_id, date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_sales (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        terminal_id VARCHAR(64) NOT NULL,
        shift_id VARCHAR(64),
        invoice_no VARCHAR(100) NOT NULL,
        cashier VARCHAR(100) NOT NULL,
        order_type VARCHAR(50) DEFAULT 'takeaway',
        table_no VARCHAR(50),
        customer_name VARCHAR(150),
        customer_phone VARCHAR(50),
        pricing_type VARCHAR(50) DEFAULT 'retail',
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        discount DECIMAL(12,2) DEFAULT 0,
        tax DECIMAL(12,2) DEFAULT 0,
        total DECIMAL(12,2) NOT NULL DEFAULT 0,
        payment_method VARCHAR(50) DEFAULT 'cash',
        cash_paid DECIMAL(12,2) DEFAULT 0,
        card_paid DECIMAL(12,2) DEFAULT 0,
        other_paid DECIMAL(12,2) DEFAULT 0,
        balance_due DECIMAL(12,2) DEFAULT 0,
        change_returned DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'completed',
        created_at DATETIME NOT NULL,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch_sales (branch_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_sales ADD COLUMN items_json LONGTEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_sales ADD COLUMN sale_type VARCHAR(50) DEFAULT "SALE"'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_sales ADD COLUMN parent_invoice_id VARCHAR(100)'); } catch(e) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_sale_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        sale_id VARCHAR(64) NOT NULL,
        product_id VARCHAR(64),
        name VARCHAR(255) NOT NULL,
        price DECIMAL(12,2) NOT NULL,
        quantity DECIMAL(12,2) NOT NULL,
        discount DECIMAL(12,2) DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL,
        unit VARCHAR(50) DEFAULT 'pcs',
        INDEX idx_sale (sale_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_terminal_shifts ADD COLUMN cash_in DECIMAL(12,2) DEFAULT 0'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_terminal_shifts ADD COLUMN cash_out DECIMAL(12,2) DEFAULT 0'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_terminal_shifts ADD COLUMN discrepancy DECIMAL(12,2) DEFAULT 0'); } catch(e) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_employees (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL DEFAULT 'ALL',
        username VARCHAR(100) NOT NULL,
        pin VARCHAR(50) NOT NULL,
        role VARCHAR(50) DEFAULT 'Cashier',
        name VARCHAR(150),
        phone VARCHAR(50),
        permissions TEXT,
        allowed_terminals VARCHAR(255) DEFAULT 'ALL',
        is_active TINYINT DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch (branch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_employees ADD COLUMN permissions TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_employees ADD COLUMN allowed_terminals VARCHAR(255) DEFAULT "ALL"'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_employees ADD COLUMN nic VARCHAR(50)'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_employees ADD COLUMN address TEXT'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_employees ADD COLUMN salary DECIMAL(12,2) DEFAULT 0'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_employees ADD COLUMN bank_account VARCHAR(100)'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_employees ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'); } catch(e) {}
    try { await p.query('CREATE UNIQUE INDEX uq_emp_username ON novafreshmart_employees (username)'); } catch(e) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_customers (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL DEFAULT 'ALL',
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        points INT DEFAULT 0,
        credit_balance DECIMAL(12,2) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_shift_handovers (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        session_id VARCHAR(64) NOT NULL,
        branch_id VARCHAR(64) NOT NULL,
        terminal_id VARCHAR(64) NOT NULL,
        outgoing_cashier VARCHAR(100) NOT NULL,
        incoming_cashier VARCHAR(100) NOT NULL,
        shift_started_at DATETIME,
        handover_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        bills_count INT DEFAULT 0,
        cash_sales DECIMAL(12,2) DEFAULT 0,
        card_sales DECIMAL(12,2) DEFAULT 0,
        other_sales DECIMAL(12,2) DEFAULT 0,
        total_sales DECIMAL(12,2) DEFAULT 0,
        opening_float DECIMAL(12,2) DEFAULT 0,
        expected_drawer_cash DECIMAL(12,2) DEFAULT 0,
        counted_cash DECIMAL(12,2) DEFAULT 0,
        cash_variance DECIMAL(12,2) DEFAULT 0,
        handover_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch_term_handover (branch_id, terminal_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_held_bills (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL,
        terminal_id VARCHAR(64) NOT NULL,
        bill_reference VARCHAR(100),
        order_type VARCHAR(50),
        table_no VARCHAR(50),
        customer_data TEXT,
        items_json LONGTEXT NOT NULL,
        total DECIMAL(12,2) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch_term (branch_id, terminal_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_promotions (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL DEFAULT 'ALL',
        name VARCHAR(255) NOT NULL,
        start_date VARCHAR(50),
        end_date VARCHAR(50),
        discount_type VARCHAR(50) DEFAULT 'PERCENT',
        discount_value DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_branch (branch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_promotion_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        promotion_id VARCHAR(64) NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        barcode VARCHAR(100),
        required_qty DECIMAL(12,2) DEFAULT 1,
        INDEX idx_promo (promotion_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_promotion_items ADD COLUMN barcode VARCHAR(100)'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_customers ADD COLUMN barcode VARCHAR(100)'); } catch(e) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_vouchers (
        id VARCHAR(64) PRIMARY KEY,
        branch_id VARCHAR(64) NOT NULL DEFAULT 'ALL',
        code VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255),
        type VARCHAR(50) DEFAULT 'FIXED',
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        claimed_amount DECIMAL(12,2) DEFAULT 0,
        expiry_date VARCHAR(50),
        status VARCHAR(50) DEFAULT 'ACTIVE',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_code (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_voucher_restrictions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        voucher_id VARCHAR(64) NOT NULL,
        restriction_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(64) NOT NULL,
        INDEX idx_voucher (voucher_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_categories (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(50),
        icon VARCHAR(50),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_brands (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_suppliers (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        contact_person VARCHAR(150),
        phone VARCHAR(50),
        email VARCHAR(150),
        address TEXT,
        opening_balance DECIMAL(12,2) DEFAULT 0,
        current_balance DECIMAL(12,2) DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value_text LONGTEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_custom_bill_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        invoice_id VARCHAR(64),
        branch_id VARCHAR(64) NOT NULL DEFAULT 'BR-MAIN',
        terminal_id VARCHAR(64) NOT NULL DEFAULT 'TERM-01',
        cashier VARCHAR(100) NOT NULL DEFAULT 'Cashier',
        item_name VARCHAR(255) NOT NULL,
        quantity DECIMAL(12,2) NOT NULL DEFAULT 1,
        unit VARCHAR(50) DEFAULT 'pc',
        unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        total_price DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_branch_term (branch_id, terminal_id),
        UNIQUE KEY uq_custom_inv_item (invoice_id, branch_id, terminal_id, item_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_custom_bill_items ADD UNIQUE KEY uq_custom_inv_item (invoice_id, branch_id, terminal_id, item_name)'); } catch(e) {}

    // Purchase Orders (Purchase Bills)
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_purchase_orders (
        id VARCHAR(64) PRIMARY KEY,
        supplier_id VARCHAR(64),
        status VARCHAR(50) DEFAULT 'DRAFT',
        total_amount DECIMAL(12,2) DEFAULT 0,
        expected_delivery_date DATETIME,
        created_by VARCHAR(100),
        approved_by VARCHAR(100),
        supplier_invoice_no VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_supplier (supplier_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    try { await p.query('ALTER TABLE novafreshmart_purchase_orders ADD COLUMN total_amount DECIMAL(12,2) DEFAULT 0'); } catch(e) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_purchase_order_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        po_id VARCHAR(64) NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        qty_ordered INT DEFAULT 0,
        unit_cost DECIMAL(12,2) DEFAULT 0,
        INDEX idx_po (po_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // GRN (Goods Received Notes / Purchase Bills)
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_grn (
        id VARCHAR(64) PRIMARY KEY,
        po_id VARCHAR(64),
        supplier_id VARCHAR(64),
        total_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
        received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(32) DEFAULT 'APPROVED',
        approved_by VARCHAR(100),
        supplier_invoice_no VARCHAR(100),
        received_by VARCHAR(100),
        items_json LONGTEXT,
        INDEX idx_supplier (supplier_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_grn ADD COLUMN status VARCHAR(32) DEFAULT "APPROVED"'); } catch(_) {}
    try { await p.query('ALTER TABLE novafreshmart_grn ADD COLUMN approved_by VARCHAR(100)'); } catch(_) {}
    try { await p.query('ALTER TABLE novafreshmart_grn ADD COLUMN supplier_invoice_no VARCHAR(100)'); } catch(_) {}
    try { await p.query('ALTER TABLE novafreshmart_grn ADD COLUMN received_by VARCHAR(100)'); } catch(_) {}
    try { await p.query('ALTER TABLE novafreshmart_grn ADD COLUMN items_json LONGTEXT'); } catch(_) {}

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_grn_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        grn_id VARCHAR(64) NOT NULL,
        product_id VARCHAR(64) NOT NULL,
        variant_id VARCHAR(64),
        qty_received INT DEFAULT 0,
        free_qty INT DEFAULT 0,
        unit_cost DECIMAL(12,2) DEFAULT 0,
        effective_cost DECIMAL(12,2) DEFAULT 0,
        new_sale_price DECIMAL(12,2),
        new_wholesale_price DECIMAL(12,2) DEFAULT 0,
        INDEX idx_grn (grn_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_grn_items ADD COLUMN effective_cost DECIMAL(12,2) DEFAULT 0'); } catch(_) {}

    // Customer Credit Accounts & Credit Transactions
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_credit_accounts (
        id VARCHAR(64) PRIMARY KEY,
        customer_id VARCHAR(64) NOT NULL,
        credit_limit DECIMAL(12,2) DEFAULT 0,
        balance DECIMAL(12,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'ACTIVE',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_customer (customer_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_credit_transactions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        account_id VARCHAR(64) NOT NULL,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        reference_id VARCHAR(100),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_account (account_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Till Transactions (Cash In, Cash Out, Expenses)
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_session_transactions (
        id VARCHAR(64) PRIMARY KEY,
        shift_id VARCHAR(64) NOT NULL,
        session_id INT,
        terminal_id VARCHAR(64) NOT NULL,
        type VARCHAR(50) NOT NULL,
        amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_shift (shift_id),
        INDEX idx_term (terminal_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Inventory Ledger (for remote audit trail and tombstone deletes)
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_inventory_ledger (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        product_id VARCHAR(64) NOT NULL,
        transaction_type VARCHAR(50) NOT NULL,
        reference_id VARCHAR(100),
        qty_change DECIMAL(12,4) NOT NULL DEFAULT 0,
        balance_after DECIMAL(12,4) NOT NULL DEFAULT 0,
        unit_cost DECIMAL(12,2),
        notes TEXT,
        created_by VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product (product_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    try { await p.query('ALTER TABLE novafreshmart_inventory_ledger MODIFY COLUMN qty_change DECIMAL(12,4) NOT NULL DEFAULT 0'); } catch(e) {}
    try { await p.query('ALTER TABLE novafreshmart_inventory_ledger MODIFY COLUMN balance_after DECIMAL(12,4) NOT NULL DEFAULT 0'); } catch(e) {}

    // Global Database Reset Events (Ensures resets propagate to all terminals and data never resurrects)
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_reset_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        section VARCHAR(64) NOT NULL,
        reset_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reset_by VARCHAR(100),
        reason TEXT,
        INDEX idx_sec_time (section, reset_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Global Deletion Tombstones (Ensures individual deleted records propagate to all terminals and data never resurrects)
    await p.query(`
      CREATE TABLE IF NOT EXISTS novafreshmart_deleted_records (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        table_name VARCHAR(64) NOT NULL,
        record_id VARCHAR(255) NOT NULL,
        deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_table_del (table_name, deleted_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // Ensure default branch exists
    const [branches]: any = await p.query('SELECT id FROM novafreshmart_branches LIMIT 1');
    if (!branches || branches.length === 0) {
      await p.query(`
        INSERT INTO novafreshmart_branches (id, name, code, address, phone)
        VALUES ('BR-MAIN', 'Main FreshMart Branch', 'BR01', 'Nova FreshMart Main Store', '011-2345678')
      `);
      console.log('[RemoteDB] Seeded initial default branch.');
    }

    // Ensure default terminal exists
    const [terms]: any = await p.query('SELECT id FROM novafreshmart_terminals LIMIT 1');
    if (!terms || terms.length === 0) {
      await p.query(`
        INSERT INTO novafreshmart_terminals (id, branch_id, name, status)
        VALUES ('TERM-01', 'BR-MAIN', 'Touch Terminal 01', 'online')
      `);
      console.log('[RemoteDB] Seeded initial default terminal.');
    }

    console.log('[RemoteDB] All Nova FreshMart tables initialized successfully.');
    tablesInitialized = true;
    return true;
  } catch (err: any) {
    console.error('[RemoteDB] Error initializing remote tables:', err.message);
    lastError = err.message;
    return false;
  }
}
