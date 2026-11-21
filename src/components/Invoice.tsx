import React from 'react';
import { Code128Barcode } from './Barcode';
import { formatQuantityWithUnit } from '../utils/units';
import { formatReceiptDate } from '../utils/dateUtils';

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: '12px', lineHeight: '1.5', fontWeight: bold ? 'bold' : 'normal' }}>
      <span style={{ whiteSpace: 'normal', flex: 1, paddingRight: '4px', wordBreak: 'break-word' }}>{left}</span>
      <span style={{ whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>{right}</span>
    </div>
  );
}

function Dash() {
  return <div style={{ borderBottom: '1px dashed black', margin: '6px 0' }}></div>;
}

function Equal() {
  return <div style={{ borderBottom: '1px solid black', margin: '6px 0' }}></div>;
}

export function Invoice({ sale = {}, items = [], paymentMethod, amountPaid, settings = {} }: any) {
  const safeTotal = Number(sale?.total) || 0;
  const safeAmountPaid = Number(amountPaid !== undefined ? amountPaid : (sale?.amountPaid || safeTotal)) || safeTotal;
  const safeItems = Array.isArray(items) && items.length > 0 ? items : (Array.isArray(sale?.items) ? sale.items : []);
  const safePaymentMethod = paymentMethod || sale?.method || sale?.payment_method || 'CASH';
  const safeDate = sale?.created_at || sale?.date || new Date();

  // Detect Refund & Exchange
  const rawSaleType = String(sale?.sale_type || sale?.saleType || '').toUpperCase();
  const hasNegativeItems = safeItems.some((i: any) => Number(i.quantity || i.qty || 0) < 0 || i.is_return);
  const hasPositiveItems = safeItems.some((i: any) => Number(i.quantity || i.qty || 0) > 0 && !i.is_return);
  const isAllNegative = safeItems.length > 0 && safeItems.every((i: any) => Number(i.quantity || i.qty || 0) < 0 || i.is_return);
  const isRefund = rawSaleType === 'REFUND' || safeTotal < 0 || isAllNegative || sale?.is_refunded;
  const isExchange = rawSaleType === 'EXCHANGE' || (hasNegativeItems && hasPositiveItems);

  const parentInv = sale?.parent_invoice_no || sale?.parent_invoice_id || sale?.parentInvoiceId;

  // Breakdown of returned vs new items
  let returnSum = 0;
  let newItemsSum = 0;
  safeItems.forEach((it: any) => {
    const q = Number(it.quantity || it.qty || 0);
    const pr = Number(it.price || it.unit_price || 0);
    const disc = Number(it.discount || 0);
    const lineTot = it.total != null ? Number(it.total) : ((pr * q) - disc);
    if (q < 0 || it.is_return) {
      returnSum += Math.abs(lineTot);
    } else {
      newItemsSum += lineTot;
    }
  });

  const change = isRefund ? 0 : Math.max(0, safeAmountPaid - safeTotal);
  const balance = isRefund ? 0 : Math.max(0, safeTotal - safeAmountPaid);
  
  const isSi = settings.receiptLanguage === 'si';

  const t = {
    invoice: isSi ? 'බිල්පත් අංකය:' : 'Invoice:',
    date: isSi ? 'දිනය:' : 'Date:',
    type: isSi ? 'වර්‍ගය:' : 'Type:',
    sale: isSi ? 'විකුණුම්' : 'SALE',
    refund: isSi ? 'මුදල් ආපසු ගෙවීම' : 'REFUND',
    exchange: isSi ? 'භාණ්ඩ මාරු කිරීම' : 'EXCHANGE',
    item: isSi ? 'භාණ්ඩය' : 'Item',
    qty: isSi ? 'ප්‍රම' : 'Qty',
    price: isSi ? 'මිල' : 'Price',
    totalText: isSi ? 'එකතුව' : 'Total',
    subtotal: isSi ? 'අනු එකතුව:' : 'SUBTOTAL:',
    discount: isSi ? 'වට්ටම:' : 'DISCOUNT:',
    netTotal: isSi ? 'ශුද්ධ එකතුව:' : 'NET TOTAL:',
    changeText: isSi ? 'ඉතිරිය:' : 'CHANGE:',
    balance: isSi ? 'ගෙවිය යුතු:' : 'BALANCE DUE:',
    thanks: isSi ? 'ස්තූතියි, නැවත එන්න!' : 'Thank you for shopping with us!',
    returns: isSi ? 'දින 14ක් ඇතුළත බිල්පත සමඟ මාරු කළ හැක.' : 'Returns valid within 14 days with original receipt.',
  };

  return (
    <div style={{ width: '300px', overflow: 'hidden', fontFamily: 'monospace', backgroundColor: 'white', color: 'black', margin: '0 auto', padding: '0 0 16px 0', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      
      {/* Store header */}
      <div style={{ textAlign: 'center', marginTop: '16px', marginBottom: '8px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {settings.invoiceLogo && (
          <img src={settings.invoiceLogo} alt="Logo" style={{ maxHeight: '120px', maxWidth: '200px', objectFit: 'contain', marginBottom: '8px', display: 'block' }} />
        )}
        <p style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', lineHeight: '1.2' }}>{settings.storeName || 'Nova FreshMart'}</p>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>{settings.tagline || 'Supermarket Retail Store'}</p>
        {settings.phone && <p style={{ margin: '2px 0 0 0', fontSize: '12px', fontWeight: 'bold' }}>Tel: {settings.phone}</p>}
      </div>

      {/* Prominent Header Banner for Refund / Exchange */}
      {isRefund && (
        <div style={{ borderTop: '2px solid black', borderBottom: '2px solid black', padding: '4px 0', margin: '8px 0', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>
          *** REFUND / RETURN RECEIPT ***
        </div>
      )}
      {!isRefund && isExchange && (
        <div style={{ borderTop: '2px solid black', borderBottom: '2px solid black', padding: '4px 0', margin: '8px 0', textAlign: 'center', fontWeight: 'bold', fontSize: '14px', letterSpacing: '1px' }}>
          *** EXCHANGE RECEIPT ***
        </div>
      )}

      <Dash />

      {/* Invoice info */}
      <div style={{ fontWeight: 'bold' }}>
        <Row left={t.invoice} right={sale?.invoice_no || sale?.remote_id || `INV-${sale?.id || ''}`} bold />
        <Row left={t.date} right={formatReceiptDate(safeDate)} />
        <Row 
          left={t.type} 
          right={isRefund ? t.refund : (isExchange ? t.exchange : (sale?.split ? 'SPLIT PAYMENT' : t.sale))} 
          bold={Boolean(isRefund || isExchange)} 
        />
        {parentInv && (
          <Row left="Original Bill:" right={String(parentInv).startsWith('INV-') ? String(parentInv) : `INV-${parentInv}`} bold />
        )}
        {sale?.cashier && <Row left="Cashier:" right={sale.cashier} />}
        {sale?.branch && <Row left="Branch:" right={sale.branch} />}
        {sale?.terminal && <Row left="Terminal:" right={sale.terminal} />}
      </div>

      <Dash />

      {/* Items Table */}
      <table style={{ width: '100%', tableLayout: 'fixed', fontSize: '11px', fontFamily: 'monospace', fontWeight: 'bold', borderCollapse: 'collapse', marginBottom: '4px' }}>
        <thead>
          <tr style={{ borderBottom: '1px dashed black' }}>
            <th style={{ textAlign: 'left', paddingBottom: '4px' }}>{t.item}</th>
            <th style={{ textAlign: 'right', width: '55px', paddingBottom: '4px' }}>{t.qty}</th>
            <th style={{ textAlign: 'right', width: '50px', paddingBottom: '4px' }}>{t.price}</th>
            <th style={{ textAlign: 'right', width: '50px', paddingBottom: '4px' }}>{t.totalText}</th>
          </tr>
        </thead>
        <tbody>
          {safeItems.map((item: any, i: number) => {
            const name = item.product_name || item.name || 'Item';
            const variantName = item.variantName || '';
            const qty = item.quantity || item.qty || 1;
            const isReturnItem = Number(qty) < 0 || item.is_return;
            const qtyDisplay = item.formattedQty || formatQuantityWithUnit(qty, item.unit);
            const price = Number(item.price || item.unit_price || 0);
            const discount = Number(item.discount || 0);
            const lineTotal = item.total != null ? Number(item.total) : ((price * qty) - discount);
            const prefix = isReturnItem ? '[RETURN] ' : (isExchange ? '[NEW] ' : '');
            const label = prefix + [name, variantName].filter(Boolean).join(' ');
            
            return (
              <React.Fragment key={i}>
                <tr style={isReturnItem ? { color: '#000' } : {}}>
                  <td style={{ wordBreak: 'break-word', verticalAlign: 'top', paddingTop: '4px' }}>{label}</td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '4px', whiteSpace: 'nowrap' }}>{qtyDisplay}</td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '4px' }}>{price.toFixed(2)}</td>
                  <td style={{ textAlign: 'right', verticalAlign: 'top', paddingTop: '4px' }}>{lineTotal.toFixed(2)}</td>
                </tr>
                {discount > 0 && (
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'left', paddingLeft: '8px' }}>Discount:</td>
                    <td colSpan={2} style={{ textAlign: 'right' }}>-{discount.toFixed(0)}</td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      <Dash />

      {/* Totals */}
      <div style={{ fontWeight: 'bold' }}>
        {isExchange && (
          <>
            {returnSum > 0 && <Row left="Returned Items:" right={`-Rs. ${returnSum.toFixed(2)}`} />}
            {newItemsSum > 0 && <Row left="New Items Subtotal:" right={`Rs. ${newItemsSum.toFixed(2)}`} />}
          </>
        )}
        {sale?.subtotal > 0 && Math.abs(sale.subtotal - safeTotal) > 0.01 && !isExchange && (
          <Row left={t.subtotal} right={Number(sale.subtotal).toFixed(2)} />
        )}
        {Number(sale?.discount) > 0 && (
          <Row left={t.discount} right={`-${Number(sale.discount).toFixed(2)}`} />
        )}
      </div>
      
      <Equal />

      <div style={{ fontSize: '14px', fontWeight: 'bold', lineHeight: '1.6' }}>
        {isRefund ? (
          <Row left="TOTAL REFUNDED:" right={`Rs. ${Math.abs(safeTotal).toFixed(2)}`} bold />
        ) : isExchange ? (
          safeTotal >= 0 ? (
            <Row left="NET PAYABLE:" right={`Rs. ${safeTotal.toFixed(2)}`} bold />
          ) : (
            <Row left="REFUND TO CUSTOMER:" right={`Rs. ${Math.abs(safeTotal).toFixed(2)}`} bold />
          )
        ) : (
          <Row left={t.netTotal} right={safeTotal.toFixed(2)} bold />
        )}
      </div>

      <Dash />

      {/* Payments */}
      <div style={{ fontWeight: 'bold' }}>
        {isRefund ? (
          <Row left="REFUNDED VIA:" right={safePaymentMethod.toUpperCase()} bold />
        ) : sale?.split ? (
          <>
            {sale.split.cash > 0 && <Row left="CASH:" right={(sale.split.cash || 0).toFixed(0)} />}
            {sale.split.card > 0 && <Row left="CARD:" right={(sale.split.card || 0).toFixed(0)} />}
            {sale.split.bank > 0 && <Row left="BANK:" right={(sale.split.bank || 0).toFixed(0)} />}
            {sale.split.credit > 0 && <Row left="CREDIT:" right={(sale.split.credit || 0).toFixed(0)} />}
            {sale.split.voucher > 0 && <Row left="VOUCHER:" right={(sale.split.voucher || 0).toFixed(0)} />}
          </>
        ) : (
          <Row left={`${safePaymentMethod.toUpperCase()}:`} right={safeAmountPaid.toFixed(2)} />
        )}
        {!isRefund && change > 0.001 && <Row left={t.changeText} right={change.toFixed(2)} bold />}
        {!isRefund && balance > 0.001 && <Row left={t.balance} right={balance.toFixed(2)} bold />}
      </div>

      <Dash />

      {/* Footer Message */}
      <div style={{ textAlign: 'center', marginTop: '8px' }}>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: 'bold', whiteSpace: 'pre-wrap', color: 'black' }}>{settings.footerMsg || t.thanks}</p>
      </div>

      <div style={{ textAlign: 'center', marginTop: '4px' }}>
        <p style={{ margin: 0, fontSize: '13px', fontWeight: 'bold', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'black' }}>{settings.returnsPolicy || t.returns}</p>
      </div>

      {/* Barcode */}
      <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <Code128Barcode 
          data={String(sale?.invoice_no || `INV-${sale?.id || '0'}`)} 
          height={38} 
        />
        <p style={{ margin: '4px 0 0 0', fontSize: '12px', fontWeight: 'bold', color: 'black' }}>Scan to refund / exchange</p>
      </div>

      <p style={{ marginTop: '16px', width: '100%', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', color: 'black' }}>Nova FreshMart Retail POS System</p>
    </div>
  );
}

