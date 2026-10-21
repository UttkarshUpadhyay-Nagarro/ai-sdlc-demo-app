import { type Locator, type Page } from '@playwright/test';

export class ApprovalsPage {
  constructor(private readonly page: Page) {}

  async open() {
    await this.page.getByRole('tab', { name: 'Approvals' }).click();
  }

  pendingEntry(invoiceId: string): Locator {
    return this.page.getByRole('listitem').filter({ hasText: invoiceId });
  }

  async approve(invoiceId: string) {
    await this.page.getByRole('button', { name: `Approve invoice ${invoiceId}` }).click();
  }

  /** The decision alert; hidden alerts are not in the accessibility tree, so only the visible one matches. */
  decisionAlert(): Locator {
    return this.page.getByRole('alert');
  }
}
