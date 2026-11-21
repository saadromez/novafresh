namespace LunaPOSPrintAgent;

public class ReceiptData
{
    public string? InvoiceNo     { get; set; }
    public string? StoreName     { get; set; }
    public string? StoreAddress  { get; set; }
    public string? StorePhone    { get; set; }
    public string? CustomerName  { get; set; }
    public string? CustomerPhone { get; set; }
    public string? Cashier       { get; set; }
    // Legacy single-payment fields (kept for back-compat)
    public string? PaymentMethod { get; set; }
    public string? Reference     { get; set; }
    public string? CreatedAt     { get; set; }
    public double  Subtotal      { get; set; }
    public double  Discount      { get; set; }
    public double  CourierCharge { get; set; }
    public double  Tax           { get; set; }
    public double  Total         { get; set; }
    public double  Paid          { get; set; }
    public double  CashGiven     { get; set; }
    public double  Change        { get; set; }
    public double  Balance       { get; set; }
    public string? HeaderText    { get; set; }
    public string? FooterText    { get; set; }
    public string? SaleType      { get; set; }  // "sale" | "refund" | "exchange"
    public string? LogoBase64    { get; set; }
    public string? LogoUrl       { get; set; }
    public string? BarcodeData   { get; set; }
    // Loyalty
    public bool    ShowLoyalty   { get; set; }
    public int     PointsEarned  { get; set; }
    public int     PointsRedeemed{ get; set; }
    // Multiple payments (split / mixed)
    public List<PaymentLine> Payments { get; set; } = [];
    public List<ReceiptItem> Items    { get; set; } = [];
}

public class PaymentLine
{
    public string? Method { get; set; }
    public double  Amount { get; set; }
}

public class ReceiptItem
{
    public string? Name      { get; set; }
    public double  Qty       { get; set; }
    public double  Price     { get; set; }
    public double  Discount  { get; set; }
    public double  LineTotal { get; set; }
}

public class LabelItem
{
    public string Name     { get; set; } = "";
    public string Brand    { get; set; } = "";
    public string ItemCode { get; set; } = "";
    public string Size     { get; set; } = "";
    public string Barcode  { get; set; } = "";
    public double Price    { get; set; }
}

public class LabelOpts
{
    public double WidthMm       { get; set; } = 50;
    public double HeightMm      { get; set; } = 30;
    public double GapMm         { get; set; } = 2;
    public int    Copies        { get; set; } = 1;
    public int    Dpi           { get; set; } = 203;
    public bool   ShowName      { get; set; } = true;
    public bool   ShowBrand     { get; set; } = true;
    public bool   ShowPrice     { get; set; } = true;
    public bool   ShowBarcode   { get; set; } = true;
    public bool   ShowItemCode  { get; set; } = true;
    public bool   ShowSize      { get; set; } = true;
    public double NameFontSize  { get; set; } = 7;
    public double BrandFontSize { get; set; } = 6;
    public double PriceFontSize { get; set; } = 10;
    public string CurrencySymbol{ get; set; } = "Rs.";
}

public class LabelPayload
{
    public List<LabelItem> Items { get; set; } = [];
    public LabelOpts       Opts  { get; set; } = new();
}
