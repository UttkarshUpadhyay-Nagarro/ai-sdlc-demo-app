# invoice-approval Specification

## Purpose
Defines who may approve or reject a pending invoice, the approval limit of each role, the two-approver rule for large invoices, and how a refused approval is reported without changing the invoice.

## Requirements

### Requirement: Only roles with an approval limit can approve
The system SHALL allow an approval only by a user whose role has an approval limit: Manager (50,000.00) or Director (500,000.00). An approval attempt by any other role (for example Admin, or an unknown role) MUST be refused with the reason `Role <role> cannot approve invoices.` and MUST leave the invoice unchanged.

#### Scenario: Admin cannot approve
- **GIVEN** pending invoice `INV-1` of 100.00 with no first approval
- **WHEN** `demo.admin` with role Admin approves `INV-1`
- **THEN** the approval is refused with the reason `Role Admin cannot approve invoices.`
- **AND** the invoice's status (PendingApproval), DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy and FirstApprovedAt are unchanged and nothing is saved

#### Scenario: Unknown role cannot approve
- **GIVEN** pending invoice `INV-1` of 100.00 with no first approval
- **WHEN** user `someone` with role Approver approves `INV-1`
- **THEN** the approval is refused with the reason `Role Approver cannot approve invoices.`
- **AND** the invoice's status, DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy and FirstApprovedAt are unchanged and nothing is saved

#### Scenario: Admin cannot give the second approval
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.manager`
- **WHEN** `demo.admin` with role Admin approves `INV-1`
- **THEN** the approval is refused with the reason `Role Admin cannot approve invoices.`
- **AND** the invoice's status, DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy (`demo.manager`) and FirstApprovedAt are unchanged and nothing is saved

### Requirement: Manager approval limit
A Manager SHALL be able to approve, as the single and final approver, a pending invoice whose amount is at most 50,000.00 (inclusive). A Manager's approval of an invoice above 50,000.00 and at most 500,000.00 MUST be refused with the reason `Manager approval limit is 50,000.00; invoice <id> is <amount>.` (amount formatted with two decimals and thousands separators) and MUST leave the invoice unchanged.

#### Scenario: Manager approves just below the limit
- **GIVEN** pending invoice `INV-1` of 49,999.99
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the invoice status is Approved, DecidedBy is `demo.manager`, DecidedAt is set and FirstApprovedBy is empty

#### Scenario: Manager approves exactly at the limit
- **GIVEN** pending invoice `INV-1` of 50,000.00
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the invoice status is Approved, DecidedBy is `demo.manager` and DecidedAt is set

#### Scenario: Manager refused just above the limit
- **GIVEN** pending invoice `INV-1` of 50,000.01
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the approval is refused with the reason `Manager approval limit is 50,000.00; invoice INV-1 is 50,000.01.`
- **AND** the invoice's status (PendingApproval), DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy and FirstApprovedAt are unchanged and nothing is saved

#### Scenario: Manager refused at the Director limit
- **GIVEN** pending invoice `INV-1` of 500,000.00
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the approval is refused with the reason `Manager approval limit is 50,000.00; invoice INV-1 is 500,000.00.`
- **AND** the invoice's status, DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy and FirstApprovedAt are unchanged and nothing is saved

### Requirement: Director approval limit
A Director SHALL be able to approve, as the single and final approver, a pending invoice whose amount is at most 500,000.00 (inclusive). For an invoice above 500,000.00 a Director's approval SHALL NOT be final; it is handled by the two-approver rule.

#### Scenario: Director approves just below the limit
- **GIVEN** pending invoice `INV-1` of 499,999.99
- **WHEN** `demo.director` with role Director approves `INV-1`
- **THEN** the invoice status is Approved, DecidedBy is `demo.director`, DecidedAt is set and FirstApprovedBy is empty

#### Scenario: Director approves exactly at the limit
- **GIVEN** pending invoice `INV-1` of 500,000.00
- **WHEN** `demo.director` with role Director approves `INV-1`
- **THEN** the invoice status is Approved, DecidedBy is `demo.director` and DecidedAt is set

#### Scenario: Director alone just above the limit gives only the first approval
- **GIVEN** pending invoice `INV-1` of 500,000.01 with no first approval
- **WHEN** `demo.director` with role Director approves `INV-1`
- **THEN** the invoice status stays PendingApproval, FirstApprovedBy is `demo.director` and FirstApprovedAt is set
- **AND** DecidedBy, DecidedAt and DecisionNote stay empty

#### Scenario: Director approves an invoice above the Manager limit
- **GIVEN** pending invoice `INV-1` of 50,000.01
- **WHEN** `demo.director` with role Director approves `INV-1`
- **THEN** the invoice status is Approved and DecidedBy is `demo.director`

### Requirement: First approval above 500,000
For a pending invoice above 500,000.00 with no first approval, an approval by a Manager or a Director SHALL record the first approval: FirstApprovedBy is the approver's username, FirstApprovedAt is the current UTC time, the status stays PendingApproval and DecidedBy, DecidedAt and DecisionNote stay empty.

#### Scenario: Manager gives the first approval above 500,000
- **GIVEN** pending invoice `INV-1` of 600,000.00 with no first approval
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the invoice status stays PendingApproval, FirstApprovedBy is `demo.manager` and FirstApprovedAt is set
- **AND** DecidedBy and DecidedAt stay empty

#### Scenario: Manager just above 500,000 gives the first approval
- **GIVEN** pending invoice `INV-1` of 500,000.01 with no first approval
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the invoice status stays PendingApproval and FirstApprovedBy is `demo.manager`

### Requirement: Second approval above 500,000 must be by a Director
For a pending invoice above 500,000.00 that has a first approval, the second approval SHALL be accepted only from a Director who is not the first approver; the invoice then becomes Approved with DecidedBy set to the second approver and DecidedAt set, and the first-approval fields are kept. A second approval by a Manager MUST be refused with the reason `Invoice <id> is over 500,000.00; the second approver must be a Director.` and MUST leave the invoice unchanged.

#### Scenario: Director completes a Manager's first approval
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.manager`
- **WHEN** `demo.director` with role Director approves `INV-1`
- **THEN** the invoice status is Approved, DecidedBy is `demo.director` and DecidedAt is set
- **AND** FirstApprovedBy is still `demo.manager` and FirstApprovedAt is unchanged

#### Scenario: Second Director completes a Director's first approval
- **GIVEN** pending invoice `INV-1` of 500,000.01 with FirstApprovedBy `demo.director`
- **WHEN** `demo.director2` with role Director approves `INV-1`
- **THEN** the invoice status is Approved and DecidedBy is `demo.director2`
- **AND** FirstApprovedBy is still `demo.director`

#### Scenario: Manager refused as second approver above 500,000
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.director`
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the approval is refused with the reason `Invoice INV-1 is over 500,000.00; the second approver must be a Director.`
- **AND** the invoice's status (PendingApproval), DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy (`demo.director`) and FirstApprovedAt are unchanged and nothing is saved

### Requirement: Same user cannot be both approvers
The first and second approver of one invoice MUST be different users. Usernames SHALL be compared after trimming whitespace and ignoring case. A second approval by the first approver MUST be refused with the reason `<user> already gave the first approval for invoice <id>; a different approver is required.` (where `<user>` is the stored first approver) and MUST leave the invoice unchanged. This check runs before the Director check.

#### Scenario: Same Director approves twice
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.director`
- **WHEN** `demo.director` with role Director approves `INV-1`
- **THEN** the approval is refused with the reason `demo.director already gave the first approval for invoice INV-1; a different approver is required.`
- **AND** the invoice's status (PendingApproval), DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy (`demo.director`) and FirstApprovedAt are unchanged and nothing is saved

#### Scenario: Same user with different case and whitespace
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.director`
- **WHEN** user ` Demo.Director ` with role Director approves `INV-1`
- **THEN** the approval is refused with the reason `demo.director already gave the first approval for invoice INV-1; a different approver is required.`
- **AND** the invoice's status, DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy and FirstApprovedAt are unchanged and nothing is saved

#### Scenario: Same Manager approves twice
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.manager`
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the approval is refused with the reason `demo.manager already gave the first approval for invoice INV-1; a different approver is required.`
- **AND** the invoice's status, DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy and FirstApprovedAt are unchanged and nothing is saved

### Requirement: Existing approval preconditions are unchanged
The system SHALL keep the existing preconditions, checked before any role or limit rule: approving or rejecting an invoice that does not exist MUST fail as not found, and approving or rejecting an invoice that is not PendingApproval MUST fail as a conflict. Neither failure changes the invoice.

#### Scenario: Approving a missing invoice
- **WHEN** `demo.director` with role Director approves `INV-404`, which does not exist
- **THEN** the request fails as not found (HTTP 404) with the message `Invoice INV-404 was not found.`

#### Scenario: Approving an invoice that is not pending
- **GIVEN** invoice `INV-1` of 100.00 with status Approved
- **WHEN** `demo.manager` with role Manager approves `INV-1`
- **THEN** the request fails as a conflict (HTTP 409) and the invoice is unchanged

### Requirement: Rejection is not limited by amount
A Manager, Director or Admin SHALL be able to reject a pending invoice of any amount with a non-empty reason. Rejecting an invoice that has a first approval SHALL be allowed and MUST keep FirstApprovedBy and FirstApprovedAt as history.

#### Scenario: Admin rejects a pending invoice
- **GIVEN** pending invoice `INV-1` of 100.00
- **WHEN** `demo.admin` with role Admin rejects `INV-1` with reason `Duplicate invoice`
- **THEN** the invoice status is Rejected, DecidedBy is `demo.admin` and DecisionNote is `Duplicate invoice`

#### Scenario: Rejecting after a first approval keeps the history
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.manager`
- **WHEN** `demo.director` with role Director rejects `INV-1` with reason `Contract not signed`
- **THEN** the invoice status is Rejected, DecidedBy is `demo.director` and DecisionNote is `Contract not signed`
- **AND** FirstApprovedBy is still `demo.manager` and FirstApprovedAt is unchanged

#### Scenario: Reject without a reason is refused
- **GIVEN** pending invoice `INV-1` of 100.00
- **WHEN** `demo.manager` rejects `INV-1` with reason `  `
- **THEN** the request fails as a bad request (HTTP 400) and the invoice is unchanged

### Requirement: Refused approvals are reported as forbidden with the reason
The approvals API SHALL return HTTP 403 with body `{ "error": "<reason>" }` when an approval is refused by a role, limit, two-approver or same-user rule, and MUST NOT save the invoice. The approve and reject endpoints SHALL accept only signed-in users with role Manager, Director or Admin; other roles get HTTP 403.

#### Scenario: Manager over the limit gets 403 with the reason
- **GIVEN** pending invoice `INV-1` of 75,000.00
- **WHEN** `demo.manager` calls `POST /api/approvals/INV-1/approve`
- **THEN** the response is HTTP 403 with body `{ "error": "Manager approval limit is 50,000.00; invoice INV-1 is 75,000.00." }`
- **AND** a following `GET /api/invoices/INV-1` shows status PendingApproval with DecidedBy, DecidedAt, DecisionNote, FirstApprovedBy and FirstApprovedAt unchanged

#### Scenario: Demo accounts
- **WHEN** the app starts with the default configuration
- **THEN** the demo users are `demo.manager` (Manager), `demo.director` (Director), `demo.director2` (Director) and `demo.admin` (Admin), and there is no `demo.approver` account

### Requirement: Approvals screen shows refusals and second-approval state
The Approvals screen SHALL show the refusal reason from the API in the existing decision error alert and keep the invoice in the pending list. A pending invoice that has a first approval SHALL show the text `Awaiting second approval (first: <user>)`.

#### Scenario: Manager's over-limit approval is refused in the UI
- **GIVEN** `demo.manager` is signed in and pending invoice `INV-1` of 75,000.00 is listed on the Approvals tab
- **WHEN** the user clicks "Approve invoice INV-1"
- **THEN** the alert shows `Manager approval limit is 50,000.00; invoice INV-1 is 75,000.00.`
- **AND** `INV-1` is still in the pending list and its status is still Pending Approval

#### Scenario: Pending list shows the first approver
- **GIVEN** pending invoice `INV-1` of 600,000.00 with FirstApprovedBy `demo.manager`
- **WHEN** any approver opens the Approvals tab
- **THEN** the entry for `INV-1` shows `Awaiting second approval (first: demo.manager)`
