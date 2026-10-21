using System.Globalization;

namespace InvoiceApp.Domain;

/// <summary>
/// Moves an invoice through its lifecycle: Draft -> PendingApproval -> Approved or Rejected.
/// Approval is limited by role: Manager up to 50,000.00, Director up to 500,000.00 (inclusive).
/// </summary>
public class ApprovalService
{
    public const string ManagerRole = "Manager";
    public const string DirectorRole = "Director";

    private static readonly IReadOnlyDictionary<string, decimal> ApprovalLimits = new Dictionary<string, decimal>
    {
        [ManagerRole] = 50_000.00m,
        [DirectorRole] = 500_000.00m,
    };

    private readonly IInvoiceRepository _repository;

    public ApprovalService(IInvoiceRepository repository)
    {
        _repository = repository;
    }

    public Invoice Submit(string invoiceId)
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
    /// Approves a pending invoice if the approver's role allows it. Every check runs before the
    /// invoice is touched, so a refused attempt (<see cref="ApprovalDeniedException"/>) changes nothing.
    /// </summary>
    public Invoice Approve(string invoiceId, string approverUsername, string approverRole)
    {
        var invoice = Find(invoiceId);
        EnsurePending(invoice);
        EnsureWithinApprovalLimit(invoice, approverRole);

        invoice.Status = InvoiceStatus.Approved;
        invoice.DecidedBy = approverUsername;
        invoice.DecidedAt = DateTime.UtcNow;
        _repository.Update(invoice);
        return invoice;
    }

    public Invoice Reject(string invoiceId, string approver, string reason)
    {
        if (string.IsNullOrWhiteSpace(reason))
        {
            throw new ArgumentException("A reason is required to reject an invoice.", nameof(reason));
        }

        var invoice = Find(invoiceId);
        EnsurePending(invoice);

        invoice.Status = InvoiceStatus.Rejected;
        invoice.DecidedBy = approver;
        invoice.DecidedAt = DateTime.UtcNow;
        invoice.DecisionNote = reason;
        _repository.Update(invoice);
        return invoice;
    }

    private static void EnsureWithinApprovalLimit(Invoice invoice, string approverRole)
    {
        if (!ApprovalLimits.TryGetValue(approverRole ?? string.Empty, out var limit))
        {
            throw new ApprovalDeniedException($"Role {approverRole} cannot approve invoices.");
        }

        if (invoice.Amount > limit)
        {
            throw new ApprovalDeniedException(
                $"{approverRole} approval limit is {FormatMoney(limit)}; invoice {invoice.Id} is {FormatMoney(invoice.Amount)}.");
        }
    }

    private static string FormatMoney(decimal amount) => amount.ToString("N2", CultureInfo.InvariantCulture);

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
