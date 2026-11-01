using System.Globalization;

namespace InvoiceApp.Domain;

/// <summary>
/// Moves an invoice through its lifecycle: Draft -> PendingApproval -> Approved or Rejected.
/// Approval is limited by role: Manager up to 50,000.00, Director up to 500,000.00 (inclusive).
/// Above 500,000.00 two distinct users must approve, and the second must be a Director.
/// </summary>
public class ApprovalService
{
    public const string ManagerRole = "Manager";
    public const string DirectorRole = "Director";
    public const decimal TwoApproverThreshold = 500_000.00m;

    private static readonly IReadOnlyDictionary<string, decimal> ApprovalLimits = new Dictionary<string, decimal>
    {
        [ManagerRole] = 50_000.00m,
        [DirectorRole] = 500_000.00m,
    };

    // The in-memory repository hands out shared Invoice instances, so each read-decide-write
    // sequence must run alone: two interleaved approvals could otherwise both pass the
    // same-user check, or an approval and a rejection could both pass EnsurePending.
    private static readonly object DecisionLock = new();

    private readonly IInvoiceRepository _repository;

    public ApprovalService(IInvoiceRepository repository)
    {
        _repository = repository;
    }

    public Invoice Submit(string invoiceId)
    {
        lock (DecisionLock)
        {
            return SubmitLocked(invoiceId);
        }
    }

    private Invoice SubmitLocked(string invoiceId)
    {
        var invoice = Find(invoiceId);

        if (invoice.Status != InvoiceStatus.Draft)
        {
            throw new InvalidOperationException(
                $"Invoice {invoiceId} is {invoice.Status}; only drafts can be submitted.");
        }

        invoice.Status = InvoiceStatus.PendingApproval;
        _repository.Update(invoice);
        return invoice;
    }

    /// <summary>
    /// Approves a pending invoice if the approver's role allows it. Above 500,000.00 the first
    /// approval is recorded and the invoice stays pending until a different Director approves.
    /// Every check runs in <see cref="Decide"/> before the invoice is touched, so a refused
    /// attempt (<see cref="ApprovalDeniedException"/>) changes nothing and saves nothing.
    /// </summary>
    public Invoice Approve(string invoiceId, string approverUsername, string approverRole)
    {
        lock (DecisionLock)
        {
            return ApproveLocked(invoiceId, approverUsername, approverRole);
        }
    }

    private Invoice ApproveLocked(string invoiceId, string approverUsername, string approverRole)
    {
        var invoice = Find(invoiceId);
        EnsurePending(invoice);
        var outcome = Decide(invoice, approverUsername, approverRole);

        var now = DateTime.UtcNow;
        if (outcome == ApprovalOutcome.FirstOfTwo)
        {
            invoice.FirstApprovedBy = approverUsername;
            invoice.FirstApprovedAt = now;
        }
        else
        {
            invoice.Status = InvoiceStatus.Approved;
            invoice.DecidedBy = approverUsername;
            invoice.DecidedAt = now;
        }

        _repository.Update(invoice);
        return invoice;
    }

    public Invoice Reject(string invoiceId, string approver, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new ArgumentException("A reason is required to reject an invoice.", nameof(reason));
        }

        lock (DecisionLock)
        {
            return RejectLocked(invoiceId, approver, reason);
        }
    }

    private Invoice RejectLocked(string invoiceId, string approver, string reason)
    {
        var invoice = Find(invoiceId);
        EnsurePending(invoice);

        invoice.Status = InvoiceStatus.Rejected;
        invoice.DecidedBy = approver;
        invoice.DecidedAt = DateTime.UtcNow;
        invoice.DecisionNote = reason;
        _repository.Update(invoice);
        return invoice;
    }

    private enum ApprovalOutcome
    {
        Final,
        FirstOfTwo
    }

    /// <summary>Applies the approval rules without changing the invoice. Throws on refusal.</summary>
    private static ApprovalOutcome Decide(Invoice invoice, string approverUsername, string approverRole)
    {
        if (!ApprovalLimits.TryGetValue(approverRole ?? string.Empty, out var limit))
        {
            throw new ApprovalDeniedException($"Role {approverRole} cannot approve invoices.");
        }

        if (invoice.Amount <= TwoApproverThreshold)
        {
            if (invoice.Amount > limit)
            {
                throw new ApprovalDeniedException(
                    $"{approverRole} approval limit is {FormatMoney(limit)}; invoice {invoice.Id} is {FormatMoney(invoice.Amount)}.");
            }

            return ApprovalOutcome.Final;
        }

        if (string.IsNullOrWhiteSpace(invoice.FirstApprovedBy))
        {
            return ApprovalOutcome.FirstOfTwo;
        }

        if (IsSameUser(invoice.FirstApprovedBy, approverUsername))
        {
            throw new ApprovalDeniedException(
                $"{invoice.FirstApprovedBy} already gave the first approval for invoice {invoice.Id}; a different approver is required.");
        }

        if (approverRole != DirectorRole)
        {
            throw new ApprovalDeniedException(
                $"Invoice {invoice.Id} is over {FormatMoney(TwoApproverThreshold)}; the second approver must be a Director.");
        }

        return ApprovalOutcome.Final;
    }

    private static bool IsSameUser(string firstUsername, string secondUsername) =>
        string.Equals(firstUsername?.Trim(), secondUsername?.Trim(), StringComparison.OrdinalIgnoreCase);

    // At least two decimals, more only when present: 50,000.00 but 50,000.001, so a reason never
    // rounds an over-limit amount down to the limit it exceeds.
    private static string FormatMoney(decimal amount) =>
        amount.ToString("#,0.00###########", CultureInfo.InvariantCulture);

    private Invoice Find(string invoiceId) =>
        _repository.GetById(invoiceId)
        ?? throw new KeyNotFoundException($"Invoice {invoiceId} was not found.");

    private static void EnsurePending(Invoice invoice)
    {
        if (invoice.Status != InvoiceStatus.PendingApproval)
        {
            throw new InvalidOperationException(
                $"Invoice {invoice.Id} is {invoice.Status}; only pending invoices can be decided.");
        }
    }
}
