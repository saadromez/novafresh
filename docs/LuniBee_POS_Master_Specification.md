# LuniBee POS - Master Specification

This document consolidates the original POS requirements and baby-shop-specific features into a master blueprint for the offline-first LuniBee POS application.

## 1. System Architecture & Core Requirements
*   **Offline-First:** Installable desktop application using Electron, React, Vite, and SQLite.
*   **User Interface:** Specialized, fast, full-screen POS terminal interface.
*   **Admin Dashboard:** Unique structural dashboard summarizing the entire business without looking like a generic ERP with 50 menus.
*   **User Management:** Role-based access control (Admin, Cashier, etc.). Only Admins can delete records. Full audit log of user actions.
*   **System Settings:** Company name, address, contact numbers, logo upload, receipt templates, printer settings.
*   **Data Management:** Custom backup (location/schedule), restore functionality, and full/partial system reset.

## 2. Finance & Day Sessions
*   **Session Management:** Open session (input opening cash), Close session (input actual cash).
*   **Cash Flow:** Track day sales, cash-in, cash-out, and day expenses.
*   **Reconciliation:** Automatically calculate Expected Cash = (Opening Cash + Day Cash Sales + Cash In - Cash Out - Expenses). Highlight variance against Actual Cash.
*   **End of Day:** Print proper day-end reports summarizing sales, profits, and stock movements.
*   **Accounting Engine:** Track Cost of Goods Sold (COGS) and calculate accurate Gross Margins and Net Profit.

## 3. Advanced Baby Retail Inventory
*   **Product Attributes:** Brand, Category, Sub-category, Age Group, Gender, Size, Color, Material, Pack Size, Weight, Unit, Country of Origin, Batch/Lot Number, SKU, and Barcode.
*   **Variant / Size Matrix:** Handle parent products with child variants (e.g., Baby Romper -> 0-3M, 3-6M, 6-9M). Visual matrix for easy stock management.
*   **Barcoding:** Auto-generate item codes/barcodes if omitted. Bulk generate and print barcode labels (Name, SKU, Barcode, Price, Size).
*   **Batch & Expiry Tracking:** Crucial for baby food, formula, creams. Track Manufacturing Date, Expiry Date, Supplier, and Batch No. Dashboard alerts for expired stock, or expiring within 7/30/90 days. POS blocks sale of expired items.
*   **Smart Stock Alerts:** Configurable minimum stock thresholds per product/variant (e.g., Diapers min 20, Clothing min 2 per size). Statuses: Out of Stock (Red), Critical (Orange), Low Stock (Yellow), Healthy (Green).
*   **Inventory Operations:** Cost and Sale price tracking (FIFO / weighted-average costing for price fluctuations), Opening Stock, Stock Adjustments, Damage tracking.

## 4. Purchasing & Suppliers
*   **Supplier Management:** Add, edit, delete suppliers. Track reference details and brand mappings.
*   **Purchase Orders (PO):** Create POs, track status, send to suppliers. Reorder Assistant automatically drafts POs based on low stock alerts.
*   **Goods Received Note (GRN):** Receive against POs. Handle partial receiving, free items, and update new ordered quantities, cost prices, and sale prices.
*   **Payments:** Supplier payment management (Cash, Bank, Cheques). Reminders for post-dated/pre-dated cheques. Track payables and purchase history.
*   **Price History:** Track cost and selling price changes over time per product.

## 5. POS & Sales Operations
*   **POS Interface:** Full-screen, optimized quick categories (Feeding, Diapers, Clothing, etc.), grid/list views, barcode scanning, product search.
*   **Cart Management:** Add items, select variants from modal, hold cart, retrieve cart.
*   **Payments:** Cash (with change calculation), Card, Bank Transfer, Credit, and Mixed Payments (e.g., partial cash, partial card).
*   **Discounts & Promotions:** Discount specific items or the whole cart (% or flat amount). Auto-apply scheduled promotions/discounts for custom periods. Margin protection warnings if a discount goes below cost.
*   **Bundles & Gift Packs:** Sell grouped items (e.g., Newborn Starter Pack) at a package price while automatically deducting individual component stock.
*   **Gift Features:** Gift wrapping add-ons (Normal, Premium). Sell and redeem Gift Vouchers (partial redemption, expiry tracking).
*   **Refunds & Exchanges:** Strict policy configurations (e.g., 7-day or 14-day limit, original receipt required). Handle price differences (customer pays difference or receives cash refund). Return items to inventory or damage.
*   **Receipts:** Print physical receipts or generate WhatsApp-friendly digital receipts.

## 6. Customer & Loyalty Management
*   **Customer Profiles:** Name, Phone, Purchase History, Credit balance, Payments, Statements. Walk-in customers supported by default.
*   **Baby Profiles (Optional):** Track Baby Name, DOB, and Gender to trigger personalized promotions (e.g., 6-month clothing promos).
*   **Loyalty System:** Earn points per Rs spent. Dashboard shows points, available rewards, redemption history, and tiers (Silver, Gold, VIP).
*   **Credit Management:** Issue credit, record payments, view outstanding balances, identify best payers.

## 7. Reporting & Analytics
*   **Sales Reports:** Day sales, invoices, full period reports.
*   **Inventory Reports:** Sold stock, remaining stock (value at cost vs sale price).
*   **Performance:** Top Brands, Top Categories, Top Sizes, Top Products. User/Cashier performance.
*   **Stock Movement:** Purchase history, restock reports, stock adjustments.
*   **Dead Stock Report:** Identify slow-moving products (e.g., no sales for 90 days) showing Stock and Cost Value to facilitate clearance promotions.
*   **Financials:** Profit reports, expenses, discount analysis.
