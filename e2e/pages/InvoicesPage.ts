import { type Locator, type Page } from '@playwright/test';

export class InvoicesPage {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.getByRole('tab', { name: 'Invoices' }).click();
  }

  rowFor(customerName: string): Locator {
    return this.page.getByRole('row').filter({ hasText: customerName });
  }

  statusOf(customerName: string): Locator {
    return this.rowFor(customerName).getByRole('cell').nth(3);
  }

  /** Creates a draft invoice and returns the id the app assigned to it. */
  async createInvoice(customerName: string, amount: string): Promise<string> {
    await this.page.getByLabel('Customer name').fill(customerName);
    await this.page.getByLabel('Amount').fill(amount);
    await this.page.getByRole('button', { name: 'Create invoice' }).click();
    const idCell = this.rowFor(customerName).getByRole('cell').first();
    await idCell.waitFor();
    return (await idCell.textContent())!.trim();
  }

  async submitForApproval(invoiceId: string) {
    await this.page.getByRole('button', { name: `Submit invoice ${invoiceId} for approval` }).click();
  }
}
