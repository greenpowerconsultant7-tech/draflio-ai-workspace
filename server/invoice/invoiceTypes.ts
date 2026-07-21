export type InvoiceParty = {
  name: string;
  email?: string;
  phone?: string;
  taxId?: string;
  address?: string;
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceData = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;

  currency: string;

  seller: InvoiceParty;
  customer: InvoiceParty;

  items: InvoiceItem[];

  taxRate?: number;
  discount?: number;

  notes?: string;
  paymentTerms?: string;
};

export type CalculatedInvoiceItem =
  InvoiceItem & {
    total: number;
  };

export type InvoiceTotals = {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: number;
  grandTotal: number;
};

export type PreparedInvoice = Omit<
  InvoiceData,
  "items"
> & {
  items: CalculatedInvoiceItem[];
  totals: InvoiceTotals;
};