// Dunning templates — 5 EN templates, placeholders filled from live data,
// previewed before send (Marcello's spec + the 2026-08-03 correction on
// tone for the vendor pair).
//
// ASYMMETRY BY DESIGN (Marcello, 2026-08-03): the MECHANISM is symmetric
// between receivables and payables (same stages, statuses, buttons, logs);
// the COPY is not.
//   - Customers (we are owed money): polite -> firmer collection language,
//     because Trio needs to get paid.
//   - Vendors (we owe money): polite -> POLITER justification language,
//     never escalating in tone, because — Marcello's own treasurer
//     principle — "chi paga tardi e incassa presto genera autofinanziamento:
//     più siamo bravi a tenere buoni rapporti coi fornitori pagando in
//     ritardo, più siamo buoni tesorieri." Any real tension goes to the CEO
//     attention list INTERNALLY; it never shows up in what a vendor reads.
//     There is deliberately no 3rd, harsher vendor template.
import { fmtSAR } from "@/lib/format";

export type CustomerTemplateStage = 1 | 2 | 3;
export type VendorTemplateStage = 1 | 2;

export interface CustomerTemplateVars {
  customerName: string;
  amount: number;
  invoiceCount: number;
  oldestInvoiceNumber: string;
  daysOverdue: number;
  senderName?: string;
  companyName?: string;
}

export interface VendorTemplateVars {
  vendorName: string;
  amount: number;
  billCount: number;
  billNumber: string;
  reason?: string;
  targetWindow?: string;
  scheduledRunDate?: string;
  senderName?: string;
  companyName?: string;
}

export interface FilledTemplate {
  subject: string;
  body: string;
}

const DEFAULT_SENDER = "Trio Sporting — Accounts";
const DEFAULT_VENDOR_SENDER = "Trio Sporting — Treasury";
const DEFAULT_COMPANY = "Trio Sporting Club";

export const CUSTOMER_TEMPLATE_LABEL: Record<CustomerTemplateStage, string> = {
  1: "Stage 1 — Friendly reminder",
  2: "Stage 2 — Second reminder",
  3: "Stage 3 — Firm reminder (final)",
};

export const VENDOR_TEMPLATE_LABEL: Record<VendorTemplateStage, string> = {
  1: "Stage 1 — Courteous acknowledgement",
  2: "Stage 2 — Warm justification",
};

export const fillCustomerTemplate = (stage: CustomerTemplateStage, v: CustomerTemplateVars): FilledTemplate => {
  const amount = `${fmtSAR(v.amount)} SAR`;
  const sender = v.senderName ?? DEFAULT_SENDER;
  const company = v.companyName ?? DEFAULT_COMPANY;
  const invoiceWord = v.invoiceCount === 1 ? "invoice" : "invoices";

  if (stage === 1) {
    return {
      subject: `Payment reminder — Invoice ${v.oldestInvoiceNumber}, ${company}`,
      body:
        `Dear ${v.customerName},\n\n` +
        `We hope you're well. This is a friendly note that we have ${v.invoiceCount} outstanding ${invoiceWord} ` +
        `totalling ${amount} on your account with ${company}, the oldest being ${v.oldestInvoiceNumber}.\n\n` +
        `If you've already arranged payment, please disregard this message. Otherwise, we'd be grateful if you ` +
        `could settle it at your earliest convenience, or let us know if you have any questions.\n\n` +
        `Thank you for being part of the ${company} family.\n\n` +
        `Warm regards,\n${sender}\n${company}`,
    };
  }
  if (stage === 2) {
    return {
      subject: `Second reminder — Invoice ${v.oldestInvoiceNumber} still outstanding`,
      body:
        `Dear ${v.customerName},\n\n` +
        `We're following up on our previous note — our records still show ${v.invoiceCount} ${invoiceWord} totalling ` +
        `${amount} outstanding on your account, now ${v.daysOverdue} days overdue.\n\n` +
        `Could you please arrange payment within the next few days, or get in touch if there's anything preventing ` +
        `settlement so we can help resolve it together?\n\n` +
        `Best regards,\n${sender}\n${company}`,
    };
  }
  return {
    subject: `FINAL NOTICE — Invoice ${v.oldestInvoiceNumber} — ${v.daysOverdue} days overdue`,
    body:
      `Dear ${v.customerName},\n\n` +
      `Despite our previous reminders, ${amount} across ${v.invoiceCount} ${invoiceWord} remains unpaid on your ` +
      `account, now ${v.daysOverdue} days overdue.\n\n` +
      `Please settle this balance within 7 days of this notice. If payment is not received, or we do not hear ` +
      `from you, we will need to escalate this matter internally and may need to review your account status ` +
      `with ${company}.\n\n` +
      `If there is a reason for the delay, please contact us immediately so we can find a solution together.\n\n` +
      `Regards,\n${sender}\n${company}`,
  };
};

export const fillVendorTemplate = (stage: VendorTemplateStage, v: VendorTemplateVars): FilledTemplate => {
  const amount = `${fmtSAR(v.amount)} SAR`;
  const sender = v.senderName ?? DEFAULT_VENDOR_SENDER;
  const company = v.companyName ?? DEFAULT_COMPANY;

  if (stage === 1) {
    const window = v.targetWindow ?? "in line with our standard processing cycle";
    const reasonClause = v.reason ? ` (${v.reason})` : "";
    return {
      subject: `Your invoice ${v.billNumber} — received and being processed`,
      body:
        `Dear ${v.vendorName} team,\n\n` +
        `Thank you for your invoice ${v.billNumber} for ${amount}. We confirm it has been received and verified ` +
        `on our side.\n\n` +
        `Payment is scheduled ${window}${reasonClause}. We'll notify you once it has been processed.\n\n` +
        `Thank you for your continued partnership and your patience.\n\n` +
        `Kind regards,\n${sender}\n${company}`,
    };
  }
  const runDate = v.scheduledRunDate ?? "as soon as our next payment run";
  return {
    subject: `Update on invoice ${v.billNumber} — payment timing`,
    body:
      `Dear ${v.vendorName} team,\n\n` +
      `Thank you for following up on invoice ${v.billNumber} for ${amount}. We appreciate your patience — please ` +
      `rest assured this has not been overlooked.\n\n` +
      `Our payment run is scheduled for ${runDate}, aligned with our cash-cycle planning this month. We value ` +
      `our relationship with ${v.vendorName} highly and wanted to give you full visibility rather than leave you ` +
      `waiting without an update.\n\n` +
      `Please don't hesitate to reach out if this timing causes any difficulty on your side — we're happy to ` +
      `discuss.\n\n` +
      `With thanks for your understanding,\n${sender}\n${company}`,
  };
};
