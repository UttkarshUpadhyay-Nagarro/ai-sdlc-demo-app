import { expect, test } from '@playwright/test';
import { ApprovalsPage } from '../pages/ApprovalsPage';
import { InvoicesPage } from '../pages/InvoicesPage';
import { LoginPage } from '../pages/LoginPage';

// Spec: openspec/changes/add-approval-limits-by-role, requirement
// "Approvals screen shows refusals and second-approval state", scenario
// "Manager's over-limit approval is refused in the UI".
test('a Manager approving an invoice over 50,000 is refused with the reason and the invoice stays pending', async ({ page }) => {
  const customer = `E2E Over-limit School ${Date.now()}`;
  const invoices = new InvoicesPage(page);
  const approvals = new ApprovalsPage(page);

  await new LoginPage(page).signIn('demo.manager');
  const invoiceId = await invoices.createInvoice(customer, '75000');
  await invoices.submitForApproval(invoiceId);
  await expect(invoices.statusOf(customer)).toHaveText('Pending Approval');

  await approvals.open();
  await approvals.approve(invoiceId);

  await expect(approvals.decisionAlert()).toHaveText(
    `Manager approval limit is 50,000.00; invoice ${invoiceId} is 75,000.00.`,
  );
  await expect(approvals.pendingEntry(invoiceId)).toBeVisible();

  await invoices.open();
  await expect(invoices.statusOf(customer)).toHaveText('Pending Approval');
});
