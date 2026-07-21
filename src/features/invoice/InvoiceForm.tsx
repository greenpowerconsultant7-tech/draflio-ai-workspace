import {
  Building2,
  CalendarDays,
  FileText,
  Plus,
  ReceiptText,
  Trash2,
  UserRound,
} from "lucide-react";

import type {
  InvoiceFormData,
  InvoiceItemInput,
  InvoicePartyInput,
} from "./InvoicePdfService";

type Props = {
  data: InvoiceFormData;

  onChange: (
    data: InvoiceFormData
  ) => void;

  disabled?: boolean;
};

type PartyField =
  keyof InvoicePartyInput;

function createItem(): InvoiceItemInput {
  return {
    id:
      crypto.randomUUID?.() ??
      `${Date.now()}-${Math.random()}`,

    description: "",
    quantity: 1,
    unitPrice: 0,
  };
}

function formatMoney(
  amount: number,
  currency: string
) {
  const currencyCode =
    currency.trim().toUpperCase() ||
    "USD";

  try {
    return new Intl.NumberFormat(
      "en-US",
      {
        style: "currency",
        currency: currencyCode,
      }
    ).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(
      2
    )}`;
  }
}

function calculateTotals(
  data: InvoiceFormData
) {
  const subtotal =
    data.items.reduce(
      (
        runningTotal,
        item
      ) => {
        const quantity =
          Number.isFinite(
            item.quantity
          )
            ? item.quantity
            : 0;

        const unitPrice =
          Number.isFinite(
            item.unitPrice
          )
            ? item.unitPrice
            : 0;

        return (
          runningTotal +
          quantity * unitPrice
        );
      },
      0
    );

  const discount =
    Math.min(
      Math.max(
        0,
        data.discount
      ),
      subtotal
    );

  const taxableAmount =
    Math.max(
      0,
      subtotal - discount
    );

  const tax =
    taxableAmount *
    (
      Math.max(
        0,
        data.taxRate
      ) / 100
    );

  const grandTotal =
    taxableAmount + tax;

  return {
    subtotal,
    discount,
    taxableAmount,
    tax,
    grandTotal,
  };
}

export default function InvoiceForm({
  data,
  onChange,
  disabled = false,
}: Props) {
  const totals =
    calculateTotals(data);

  const updateRoot = <
    Key extends keyof InvoiceFormData,
  >(
    key: Key,
    value: InvoiceFormData[Key]
  ) => {
    onChange({
      ...data,
      [key]: value,
    });
  };

  const updateParty = (
    party:
      | "seller"
      | "customer",

    field: PartyField,
    value: string
  ) => {
    onChange({
      ...data,

      [party]: {
        ...data[party],
        [field]: value,
      },
    });
  };

  const updateItem = (
    itemId: string,
    changes:
      Partial<InvoiceItemInput>
  ) => {
    onChange({
      ...data,

      items:
        data.items.map(
          (item) =>
            item.id === itemId
              ? {
                  ...item,
                  ...changes,
                }
              : item
        ),
    });
  };

  const addItem = () => {
    onChange({
      ...data,
      items: [
        ...data.items,
        createItem(),
      ],
    });
  };

  const removeItem = (
    itemId: string
  ) => {
    if (
      data.items.length === 1
    ) {
      updateItem(
        itemId,
        {
          description: "",
          quantity: 1,
          unitPrice: 0,
        }
      );

      return;
    }

    onChange({
      ...data,

      items:
        data.items.filter(
          (item) =>
            item.id !== itemId
        ),
    });
  };

  return (
    <div className="mt-8 space-y-8">

      {/* Invoice details */}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-6 flex items-center gap-3">
          <ReceiptText className="h-7 w-7 text-blue-400" />

          <div>
            <h2 className="text-2xl font-bold text-white">
              Invoice Details
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Enter the invoice number,
              dates, and currency.
            </p>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-2 block font-semibold text-white">
              Invoice Number
            </label>

            <input
              type="text"
              value={
                data.invoiceNumber
              }
              disabled={disabled}
              placeholder="INV-1001"
              onChange={(event) =>
                updateRoot(
                  "invoiceNumber",
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 font-semibold text-white">
              <CalendarDays className="h-4 w-4" />
              Invoice Date
            </label>

            <input
              type="date"
              value={
                data.invoiceDate
              }
              disabled={disabled}
              onChange={(event) =>
                updateRoot(
                  "invoiceDate",
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-2 flex items-center gap-2 font-semibold text-white">
              <CalendarDays className="h-4 w-4" />
              Due Date
            </label>

            <input
              type="date"
              value={
                data.dueDate
              }
              disabled={disabled}
              onChange={(event) =>
                updateRoot(
                  "dueDate",
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-white">
              Currency
            </label>

            <select
              value={
                data.currency
              }
              disabled={disabled}
              onChange={(event) =>
                updateRoot(
                  "currency",
                  event.target.value
                )
              }
              className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            >
              <option value="USD">
                USD — US Dollar
              </option>

              <option value="EUR">
                EUR — Euro
              </option>

              <option value="GBP">
                GBP — British Pound
              </option>

              <option value="INR">
                INR — Indian Rupee
              </option>

              <option value="CAD">
                CAD — Canadian Dollar
              </option>

              <option value="AUD">
                AUD — Australian Dollar
              </option>

              <option value="JPY">
                JPY — Japanese Yen
              </option>

              <option value="AED">
                AED — UAE Dirham
              </option>
            </select>
          </div>
        </div>
      </section>

      {/* Seller and customer */}

      <div className="grid gap-8 lg:grid-cols-2">

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <div className="mb-6 flex items-center gap-3">
            <Building2 className="h-7 w-7 text-blue-400" />

            <div>
              <h2 className="text-2xl font-bold text-white">
                Seller Details
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Your company or business
                information.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block font-semibold text-white">
                Business Name
              </label>

              <input
                type="text"
                value={
                  data.seller.name
                }
                disabled={disabled}
                placeholder="Draflio Ltd"
                onChange={(event) =>
                  updateParty(
                    "seller",
                    "name",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block font-semibold text-white">
                  Email
                </label>

                <input
                  type="email"
                  value={
                    data.seller.email
                  }
                  disabled={disabled}
                  placeholder="billing@example.com"
                  onChange={(event) =>
                    updateParty(
                      "seller",
                      "email",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-2 block font-semibold text-white">
                  Phone
                </label>

                <input
                  type="tel"
                  value={
                    data.seller.phone
                  }
                  disabled={disabled}
                  placeholder="+1 555 000 0000"
                  onChange={(event) =>
                    updateParty(
                      "seller",
                      "phone",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block font-semibold text-white">
                Tax ID
              </label>

              <input
                type="text"
                value={
                  data.seller.taxId
                }
                disabled={disabled}
                placeholder="GST, VAT, EIN, PAN, etc."
                onChange={(event) =>
                  updateParty(
                    "seller",
                    "taxId",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-2 block font-semibold text-white">
                Address
              </label>

              <textarea
                value={
                  data.seller.address
                }
                disabled={disabled}
                rows={3}
                placeholder="Business address"
                onChange={(event) =>
                  updateParty(
                    "seller",
                    "address",
                    event.target.value
                  )
                }
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
          <div className="mb-6 flex items-center gap-3">
            <UserRound className="h-7 w-7 text-blue-400" />

            <div>
              <h2 className="text-2xl font-bold text-white">
                Customer Details
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                The person or company being
                billed.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block font-semibold text-white">
                Customer Name
              </label>

              <input
                type="text"
                value={
                  data.customer.name
                }
                disabled={disabled}
                placeholder="Customer or company name"
                onChange={(event) =>
                  updateParty(
                    "customer",
                    "name",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block font-semibold text-white">
                  Email
                </label>

                <input
                  type="email"
                  value={
                    data.customer.email
                  }
                  disabled={disabled}
                  placeholder="customer@example.com"
                  onChange={(event) =>
                    updateParty(
                      "customer",
                      "email",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="mb-2 block font-semibold text-white">
                  Phone
                </label>

                <input
                  type="tel"
                  value={
                    data.customer.phone
                  }
                  disabled={disabled}
                  placeholder="+1 555 000 0000"
                  onChange={(event) =>
                    updateParty(
                      "customer",
                      "phone",
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block font-semibold text-white">
                Tax ID
              </label>

              <input
                type="text"
                value={
                  data.customer.taxId
                }
                disabled={disabled}
                placeholder="GST, VAT, EIN, PAN, etc."
                onChange={(event) =>
                  updateParty(
                    "customer",
                    "taxId",
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-2 block font-semibold text-white">
                Address
              </label>

              <textarea
                value={
                  data.customer.address
                }
                disabled={disabled}
                rows={3}
                placeholder="Customer billing address"
                onChange={(event) =>
                  updateParty(
                    "customer",
                    "address",
                    event.target.value
                  )
                }
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Invoice items */}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="h-7 w-7 text-blue-400" />

            <div>
              <h2 className="text-2xl font-bold text-white">
                Invoice Items
              </h2>

              <p className="mt-1 text-sm text-slate-400">
                Add the products or services
                included in this invoice.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={addItem}
            disabled={disabled}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-5 w-5" />
            Add Item
          </button>
        </div>

        <div className="space-y-4">
          {data.items.map(
            (
              item,
              index
            ) => {
              const itemTotal =
                (
                  Number.isFinite(
                    item.quantity
                  )
                    ? item.quantity
                    : 0
                ) *
                (
                  Number.isFinite(
                    item.unitPrice
                  )
                    ? item.unitPrice
                    : 0
                );

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-700 bg-slate-800/60 p-5"
                >
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <p className="font-bold text-white">
                      Item {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        removeItem(
                          item.id
                        )
                      }
                      disabled={disabled}
                      className="rounded-lg border border-red-500/30 p-2 text-red-400 transition hover:bg-red-950/40 disabled:opacity-50"
                      aria-label={`Remove item ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_120px_160px_160px]">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Description
                      </label>

                      <input
                        type="text"
                        value={
                          item.description
                        }
                        disabled={disabled}
                        placeholder="Product or service description"
                        onChange={(event) =>
                          updateItem(
                            item.id,
                            {
                              description:
                                event
                                  .target
                                  .value,
                            }
                          )
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Quantity
                      </label>

                      <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        value={
                          item.quantity
                        }
                        disabled={disabled}
                        onChange={(event) =>
                          updateItem(
                            item.id,
                            {
                              quantity:
                                Number(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Unit Price
                      </label>

                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={
                          item.unitPrice
                        }
                        disabled={disabled}
                        onChange={(event) =>
                          updateItem(
                            item.id,
                            {
                              unitPrice:
                                Number(
                                  event
                                    .target
                                    .value
                                ),
                            }
                          )
                        }
                        className="w-full rounded-xl border border-slate-700 bg-slate-900 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-semibold text-white">
                        Total
                      </label>

                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 font-bold text-green-400">
                        {formatMoney(
                          itemTotal,
                          data.currency
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          )}
        </div>
      </section>

      {/* Totals */}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-6 text-2xl font-bold text-white">
          Tax, Discount and Totals
        </h2>

        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block font-semibold text-white">
                Tax Rate (%)
              </label>

              <input
                type="number"
                min={0}
                max={100}
                step={0.01}
                value={
                  data.taxRate
                }
                disabled={disabled}
                onChange={(event) =>
                  updateRoot(
                    "taxRate",
                    Number(
                      event.target
                        .value
                    )
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="mb-2 block font-semibold text-white">
                Discount Amount
              </label>

              <input
                type="number"
                min={0}
                step={0.01}
                value={
                  data.discount
                }
                disabled={disabled}
                onChange={(event) =>
                  updateRoot(
                    "discount",
                    Number(
                      event.target
                        .value
                    )
                  )
                }
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-950 p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 text-slate-300">
                <span>Subtotal</span>

                <span className="font-semibold text-white">
                  {formatMoney(
                    totals.subtotal,
                    data.currency
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 text-slate-300">
                <span>Discount</span>

                <span className="font-semibold text-white">
                  -
                  {formatMoney(
                    totals.discount,
                    data.currency
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 text-slate-300">
                <span>
                  Tax ({data.taxRate || 0}%)
                </span>

                <span className="font-semibold text-white">
                  {formatMoney(
                    totals.tax,
                    data.currency
                  )}
                </span>
              </div>

              <div className="border-t border-slate-700 pt-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-lg font-bold text-white">
                    Grand Total
                  </span>

                  <span className="text-2xl font-bold text-green-400">
                    {formatMoney(
                      totals.grandTotal,
                      data.currency
                    )}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Additional information */}

      <section className="rounded-2xl border border-slate-700 bg-slate-900 p-6">
        <h2 className="mb-6 text-2xl font-bold text-white">
          Additional Information
        </h2>

        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <label className="mb-2 block font-semibold text-white">
              Payment Terms
            </label>

            <textarea
              value={
                data.paymentTerms
              }
              disabled={disabled}
              rows={4}
              placeholder="Example: Payment due within 14 days."
              onChange={(event) =>
                updateRoot(
                  "paymentTerms",
                  event.target.value
                )
              }
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-2 block font-semibold text-white">
              Notes
            </label>

            <textarea
              value={
                data.notes
              }
              disabled={disabled}
              rows={4}
              placeholder="Example: Thank you for your business."
              onChange={(event) =>
                updateRoot(
                  "notes",
                  event.target.value
                )
              }
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-800 p-3 text-white outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>
        </div>
      </section>
    </div>
  );
}