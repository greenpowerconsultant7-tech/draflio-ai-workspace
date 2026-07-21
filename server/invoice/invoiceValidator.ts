import type {
  InvoiceData,
  InvoiceItem,
  InvoiceParty,
} from "./invoiceTypes";

function isObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function requiredString(
  value: unknown,
  fieldName: string
): string {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw new Error(
      `${fieldName} is required.`
    );
  }

  return value.trim();
}

function optionalString(
  value: unknown
): string | undefined {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    return undefined;
  }

  return value.trim();
}

function requiredNumber(
  value: unknown,
  fieldName: string,
  minimum = 0
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum
  ) {
    throw new Error(
      `${fieldName} must be a number greater than or equal to ${minimum}.`
    );
  }

  return value;
}

function optionalNumber(
  value: unknown,
  fieldName: string,
  minimum = 0
): number | undefined {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  return requiredNumber(
    value,
    fieldName,
    minimum
  );
}

function validateParty(
  value: unknown,
  fieldName: string
): InvoiceParty {
  if (!isObject(value)) {
    throw new Error(
      `${fieldName} details are required.`
    );
  }

  return {
    name: requiredString(
      value.name,
      `${fieldName} name`
    ),

    email: optionalString(
      value.email
    ),

    phone: optionalString(
      value.phone
    ),

    taxId: optionalString(
      value.taxId
    ),

    address: optionalString(
      value.address
    ),
  };
}

function validateItem(
  value: unknown,
  index: number
): InvoiceItem {
  if (!isObject(value)) {
    throw new Error(
      `Invoice item ${index + 1} is invalid.`
    );
  }

  return {
    description: requiredString(
      value.description,
      `Item ${index + 1} description`
    ),

    quantity: requiredNumber(
      value.quantity,
      `Item ${index + 1} quantity`,
      0.01
    ),

    unitPrice: requiredNumber(
      value.unitPrice,
      `Item ${index + 1} unit price`,
      0
    ),
  };
}

export function validateInvoiceData(
  input: unknown
): InvoiceData {
  if (!isObject(input)) {
    throw new Error(
      "Invoice data must be a JSON object."
    );
  }

  if (
    !Array.isArray(input.items) ||
    input.items.length === 0
  ) {
    throw new Error(
      "At least one invoice item is required."
    );
  }

  const currency = requiredString(
    input.currency,
    "Currency"
  ).toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error(
      "Currency must be a three-letter code such as USD, EUR, or INR."
    );
  }

  const taxRate = optionalNumber(
    input.taxRate,
    "Tax rate",
    0
  );

  if (
    taxRate !== undefined &&
    taxRate > 100
  ) {
    throw new Error(
      "Tax rate cannot exceed 100."
    );
  }

  return {
    invoiceNumber: requiredString(
      input.invoiceNumber,
      "Invoice number"
    ),

    invoiceDate: requiredString(
      input.invoiceDate,
      "Invoice date"
    ),

    dueDate: optionalString(
      input.dueDate
    ),

    currency,

    seller: validateParty(
      input.seller,
      "Seller"
    ),

    customer: validateParty(
      input.customer,
      "Customer"
    ),

    items: input.items.map(
      validateItem
    ),

    taxRate,

    discount: optionalNumber(
      input.discount,
      "Discount",
      0
    ),

    notes: optionalString(
      input.notes
    ),

    paymentTerms: optionalString(
      input.paymentTerms
    ),
  };
}