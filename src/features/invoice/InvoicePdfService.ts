import {
  API_BASE_URL,
} from "@/config/api";

import {
  createApiError,
} from "@/lib/apiError";

import {
  fetchWithTimeout,
} from "@/lib/fetchWithTimeout";

export type InvoicePartyInput = {
  name: string;
  email: string;
  phone: string;
  taxId: string;
  address: string;
};

export type InvoiceItemInput = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceFormData = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;

  seller: InvoicePartyInput;
  customer: InvoicePartyInput;

  items: InvoiceItemInput[];

  taxRate: number;
  discount: number;

  notes: string;
  paymentTerms: string;
};

export type InvoicePdfResult = {
  blob: Blob;
  filename: string;
  size: number;
};

type InvoiceApiPayload = {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  currency: string;

  seller: {
    name: string;
    email?: string;
    phone?: string;
    taxId?: string;
    address?: string;
  };

  customer: {
    name: string;
    email?: string;
    phone?: string;
    taxId?: string;
    address?: string;
  };

  items: {
    description: string;
    quantity: number;
    unitPrice: number;
  }[];

  taxRate?: number;
  discount?: number;

  notes?: string;
  paymentTerms?: string;
};

function optionalText(
  value: string
): string | undefined {
  const trimmedValue =
    value.trim();

  return trimmedValue
    ? trimmedValue
    : undefined;
}

function createPayload(
  data: InvoiceFormData
): InvoiceApiPayload {
  return {
    invoiceNumber:
      data.invoiceNumber.trim(),

    invoiceDate:
      data.invoiceDate,

    dueDate:
      optionalText(
        data.dueDate
      ),

    currency:
      data.currency
        .trim()
        .toUpperCase(),

    seller: {
      name:
        data.seller.name.trim(),

      email:
        optionalText(
          data.seller.email
        ),

      phone:
        optionalText(
          data.seller.phone
        ),

      taxId:
        optionalText(
          data.seller.taxId
        ),

      address:
        optionalText(
          data.seller.address
        ),
    },

    customer: {
      name:
        data.customer.name.trim(),

      email:
        optionalText(
          data.customer.email
        ),

      phone:
        optionalText(
          data.customer.phone
        ),

      taxId:
        optionalText(
          data.customer.taxId
        ),

      address:
        optionalText(
          data.customer.address
        ),
    },

    items:
      data.items.map(
        (item) => ({
          description:
            item.description.trim(),

          quantity:
            item.quantity,

          unitPrice:
            item.unitPrice,
        })
      ),

    taxRate:
      data.taxRate,

    discount:
      data.discount,

    notes:
      optionalText(
        data.notes
      ),

    paymentTerms:
      optionalText(
        data.paymentTerms
      ),
  };
}

function getDownloadFilename(
  response: Response,
  invoiceNumber: string
) {
  const contentDisposition =
    response.headers.get(
      "Content-Disposition"
    );

  const filenameMatch =
    contentDisposition?.match(
      /filename="([^"]+)"/i
    );

  if (filenameMatch?.[1]) {
    return filenameMatch[1];
  }

  const safeInvoiceNumber =
    invoiceNumber
      .replace(
        /[^a-zA-Z0-9._-]+/g,
        "-"
      )
      .replace(
        /^-+|-+$/g,
        ""
      ) || "invoice";

  return `${safeInvoiceNumber}.pdf`;
}

function validateInvoice(
  data: InvoiceFormData
) {
  if (
    !data.invoiceNumber.trim()
  ) {
    throw new Error(
      "Invoice number is required."
    );
  }

  if (!data.invoiceDate) {
    throw new Error(
      "Invoice date is required."
    );
  }

  if (
    !data.seller.name.trim()
  ) {
    throw new Error(
      "Seller name is required."
    );
  }

  if (
    !data.customer.name.trim()
  ) {
    throw new Error(
      "Customer name is required."
    );
  }

  if (
    data.items.length === 0
  ) {
    throw new Error(
      "Add at least one invoice item."
    );
  }

  const invalidItemIndex =
    data.items.findIndex(
      (item) =>
        !item.description.trim() ||
        !Number.isFinite(
          item.quantity
        ) ||
        item.quantity <= 0 ||
        !Number.isFinite(
          item.unitPrice
        ) ||
        item.unitPrice < 0
    );

  if (
    invalidItemIndex !== -1
  ) {
    throw new Error(
      `Check invoice item ${invalidItemIndex + 1}.`
    );
  }

  if (
    data.taxRate < 0 ||
    data.taxRate > 100
  ) {
    throw new Error(
      "Tax rate must be between 0 and 100."
    );
  }

  if (data.discount < 0) {
    throw new Error(
      "Discount cannot be negative."
    );
  }
}

export type InvoicePdfGenerateOptions = {
  signal?: AbortSignal;
};

class InvoicePdfService {
 async generate(
  data: InvoiceFormData,
  options: InvoicePdfGenerateOptions = {}
): Promise<InvoicePdfResult> {
    validateInvoice(data);

    const payload =
      createPayload(data);

    let response: Response;

    try {
      response = await fetchWithTimeout(
        `${API_BASE_URL}/api/invoice-to-pdf`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(
              payload
            ),
             timeoutMs: 120_000,
             signal: options.signal,
        }
      );
    } catch (error) {
      console.error(
        "Invoice API request failed:",
        error
      );

      throw new Error(
        "Could not connect to the invoice server. Make sure the backend is running on port 3001."
      );
    }

    if (!response.ok) {
    throw await createApiError(
    response,
    "The invoice PDF could not be generated."
  );
}

    const blob =
      await response.blob();

    if (
      blob.size === 0
    ) {
      throw new Error(
        "The server returned an empty PDF."
      );
    }

    return {
      blob,

      filename:
        getDownloadFilename(
          response,
          data.invoiceNumber
        ),

      size:
        blob.size,
    };
  }
}

export const invoicePdfService =
  new InvoicePdfService();