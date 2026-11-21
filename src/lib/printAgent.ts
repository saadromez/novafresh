let activeAgentHost = 'http://localhost:7777';

export async function isAgentRunning(): Promise<boolean> {
  const hosts = ['http://localhost:7777', 'http://127.0.0.1:7777'];
  for (const host of hosts) {
    try {
      const r = await fetch(`${host}/ping`, { signal: AbortSignal.timeout(1200) });
      if (r.ok) {
        activeAgentHost = host;
        return true;
      }
    } catch { }
  }
  return false;
}

export function isEscPosEnabled(): boolean {
  return localStorage.getItem('escpos_enabled') !== 'false';
}

export function setEscPosEnabled(val: boolean): void {
  localStorage.setItem('escpos_enabled', val ? 'true' : 'false');
}

export interface PrintReceiptPayload {
  invoiceNo: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  customerName: string;
  customerPhone?: string;
  cashier: string;
  paymentMethod: string;
  reference?: string;
  createdAt: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  cashGiven?: number;
  change?: number;
  balance: number;
  headerText?: string;
  footerText?: string;
  saleType?: string;
  logoUrl?: string;
  logoBase64?: string;
  barcodeData?: string;
  items: {
    name: string;
    qty: number;
    price: number;
    discount?: number;
    lineTotal?: number;
  }[];
}

export async function printReceiptViaAgent(payload: PrintReceiptPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    await isAgentRunning();
    const r = await fetch(`${activeAgentHost}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });
    return r.json();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function getAgentPrinters(): Promise<{ printers: string[]; selected: string } | null> {
  try {
    await isAgentRunning();
    const r = await fetch(`${activeAgentHost}/printers`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function syncAgentPrinter(printerName: string, paperWidth: number = 80, footerText: string = '', printLanguage: string = 'English'): Promise<boolean> {
  try {
    await isAgentRunning();
    const r = await fetch(`${activeAgentHost}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName, paperWidth, footerText, printLanguage }),
      signal: AbortSignal.timeout(3000)
    });
    return r.ok;
  } catch {
    return false;
  }
}

export interface LabelItem {
  name: string;
  brand?: string;
  itemCode: string;
  size?: string;
  color?: string;
  barcode: string;
  price: number;
}

export interface LabelPrintOptions {
  widthMm: number;
  heightMm: number;
  gapMm: number;
  copies: number;
  dpi: number;
  printMode: 'tspl' | 'escpos';
  showName: boolean;
  showBrand: boolean;
  showPrice: boolean;
  showBarcode: boolean;
  showItemCode: boolean;
  showSize: boolean;
  nameFontSize: number;
  brandFontSize: number;
  priceFontSize: number;
  barcodeFontSize: number;
  currencySymbol: string;
}

let lastDrawerKick = 0;
export async function openCashDrawerViaAgent(printerName?: string): Promise<{ ok: boolean; error?: string; printer?: string }> {
  const now = Date.now();
  if (now - lastDrawerKick < 600) {
    return { ok: true };
  }
  lastDrawerKick = now;

  let isUp = await isAgentRunning();
  if (!isUp) {
    // Attempt auto-launching print agent via electron IPC if available
    // @ts-ignore
    if (window.db && typeof window.db.invoke === 'function') {
      try {
        // @ts-ignore
        await window.db.invoke('launch-print-agent');
        await new Promise(res => setTimeout(res, 1200));
        isUp = await isAgentRunning();
      } catch { }
    }
  }

  if (!isUp) {
    return { ok: false, error: 'Print Agent is offline. Please launch the Print Agent.' };
  }

  try {
    const r = await fetch(`${activeAgentHost}/open-drawer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerName: printerName || '' }),
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) {
      try {
        const errJson = await r.json();
        return { ok: false, error: errJson.error || `Agent returned ${r.status}` };
      } catch {
        return { ok: false, error: `Agent returned ${r.status}` };
      }
    }
    try {
      return await r.json();
    } catch {
      return { ok: true };
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function printLabelsViaAgent(items: LabelItem[], opts: LabelPrintOptions): Promise<{ ok: boolean; error?: string }> {
  try {
    await isAgentRunning();
    const r = await fetch(`${activeAgentHost}/print-labels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, opts }),
      signal: AbortSignal.timeout(15000)
    });
    return r.json();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function testLogoViaAgent(logoUrl: string): Promise<{ ok: boolean; fetchedBytes?: number; escPosBytes?: number; error?: string }> {
  try {
    await isAgentRunning();
    const r = await fetch(`${activeAgentHost}/logo-test?url=${encodeURIComponent(logoUrl)}`, { signal: AbortSignal.timeout(10000) });
    return r.json();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
