using System.Globalization;
using InvoiceApp.Domain;
using Xunit;

namespace InvoiceApp.Tests;

public class ApprovalServiceTests
{
    private const string Manager = "demo.manager";
    private const string Director = "demo.director";
    private const string Admin = "demo.admin";

    private static Invoice InvoiceWith(string id, InvoiceStatus status, decimal amount = 100m) =>
        new() { Id = id, CustomerName = "Test School", Amount = amount, Status = status };

    private static Invoice PendingInvoice(string amount) =>
        InvoiceWith("INV-1", InvoiceStatus.PendingApproval, decimal.Parse(amount, CultureInfo.InvariantCulture));

    private static ApprovalService ServiceFor(params Invoice[] invoices) =>
        new(new FakeInvoiceRepository(invoices));

    /// <summary>Every field an approval or refusal could touch.</summary>
    private sealed record InvoiceState(
        InvoiceStatus Status,
        decimal Amount,
        string? DecidedBy,
        DateTime? DecidedAt,
        string? DecisionNote,
        string? FirstApprovedBy,
        DateTime? FirstApprovedAt);

    private static InvoiceState StateOf(Invoice invoice) => new(
        invoice.Status,
        invoice.Amount,
        invoice.DecidedBy,
        invoice.DecidedAt,
        invoice.DecisionNote,
        invoice.FirstApprovedBy,
        invoice.FirstApprovedAt);

    /// <summary>
    /// Asserts a refused approval: the right exception, the exact reason, the invoice unchanged
    /// in every field, and nothing saved.
    /// </summary>
    private static void AssertRefused(Invoice invoice, Func<ApprovalService, Invoice> attempt, string expectedReason)
    {
        var repository = new FakeInvoiceRepository(invoice);
        var service = new ApprovalService(repository);
        var before = StateOf(invoice);

        var refusal = Assert.Throws<ApprovalDeniedException>(() => attempt(service));

        Assert.Equal(expectedReason, refusal.Message);
        Assert.Equal(before, StateOf(invoice));
        Assert.Equal(0, repository.UpdateCount);
    }

    // ---- Lifecycle (existing behaviour) ----

    [Fact]
    public void Submit_MovesDraftToPendingApproval()
    {
        var invoice = InvoiceWith("INV-1", InvoiceStatus.Draft);

        var result = ServiceFor(invoice).Submit("INV-1");

        Assert.Equal(InvoiceStatus.PendingApproval, result.Status);
    }

    [Fact]
    public void Submit_SavesTheInvoice()
    {
        var repository = new FakeInvoiceRepository(InvoiceWith("INV-1", InvoiceStatus.Draft));

        new ApprovalService(repository).Submit("INV-1");

        Assert.Equal(1, repository.UpdateCount);
    }

    [Fact]
    public void Submit_RejectsInvoiceThatIsNotADraft()
    {
        var service = ServiceFor(InvoiceWith("INV-1", InvoiceStatus.Approved));

        Assert.Throws<InvalidOperationException>(() => service.Submit("INV-1"));
    }

    [Fact]
    public void Approve_SetsStatusApproverAndTimestamp()
    {
        var service = ServiceFor(InvoiceWith("INV-1", InvoiceStatus.PendingApproval));

        var result = service.Approve("INV-1", Manager, "Manager");

        Assert.Equal(InvoiceStatus.Approved, result.Status);
        Assert.Equal(Manager, result.DecidedBy);
        Assert.NotNull(result.DecidedAt);
    }

    [Fact]
    public void Approve_SavesTheInvoiceOnce()
    {
        var repository = new FakeInvoiceRepository(InvoiceWith("INV-1", InvoiceStatus.PendingApproval));

        new ApprovalService(repository).Approve("INV-1", Manager, "Manager");

        Assert.Equal(1, repository.UpdateCount);
    }

    [Fact]
    public void Approve_RejectsInvoiceThatIsStillADraft()
    {
        var service = ServiceFor(InvoiceWith("INV-1", InvoiceStatus.Draft));

        Assert.Throws<InvalidOperationException>(() => service.Approve("INV-1", Manager, "Manager"));
    }

    [Fact]
    public void Approve_ThrowsWhenInvoiceDoesNotExist()
    {
        var service = ServiceFor();

        Assert.Throws<KeyNotFoundException>(() => service.Approve("INV-404", Director, "Director"));
    }

    [Fact]
    public void Approve_ChecksPendingStatusBeforeRole()
    {
        var service = ServiceFor(InvoiceWith("INV-1", InvoiceStatus.Approved));

        var error = Assert.Throws<InvalidOperationException>(() => service.Approve("INV-1", Admin, "Admin"));

        Assert.Equal("Invoice INV-1 is Approved; only pending invoices can be decided.", error.Message);
    }

    [Fact]
    public void Reject_RecordsReasonAndApprover()
    {
        var service = ServiceFor(InvoiceWith("INV-1", InvoiceStatus.PendingApproval));

        var result = service.Reject("INV-1", Admin, "Duplicate invoice");

        Assert.Equal(InvoiceStatus.Rejected, result.Status);
        Assert.Equal(Admin, result.DecidedBy);
        Assert.NotNull(result.DecidedAt);
        Assert.Equal("Duplicate invoice", result.DecisionNote);
    }

    [Fact]
    public void Reject_IsNotLimitedByAmount()
    {
        var invoice = PendingInvoice("9000000.00");

        var result = ServiceFor(invoice).Reject("INV-1", Manager, "Wrong customer");

        Assert.Equal(InvoiceStatus.Rejected, result.Status);
    }

    [Fact]
    public void Reject_RequiresAReason()
    {
        var service = ServiceFor(InvoiceWith("INV-1", InvoiceStatus.PendingApproval));

        Assert.Throws<ArgumentException>(() => service.Reject("INV-1", Manager, "  "));
    }

    // ---- R1: Manager may approve up to 50,000.00 (inclusive) ----

    [Theory]
    [InlineData("0.01")]
    [InlineData("49999.99")]
    [InlineData("50000.00")]
    public void Approve_ManagerWithinLimit_ApprovesInvoice(string amount)
    {
        var invoice = PendingInvoice(amount);

        var result = ServiceFor(invoice).Approve("INV-1", Manager, "Manager");

        Assert.Equal(InvoiceStatus.Approved, result.Status);
        Assert.Equal(Manager, result.DecidedBy);
        Assert.NotNull(result.DecidedAt);
        Assert.Null(result.FirstApprovedBy);
    }

    [Theory]
    [InlineData("50000.01", "50,000.01")]
    [InlineData("75000.00", "75,000.00")]
    [InlineData("500000.00", "500,000.00")]
    public void Approve_ManagerAboveLimit_IsRefusedAndInvoiceUnchanged(string amount, string formattedAmount)
    {
        AssertRefused(
            PendingInvoice(amount),
            service => service.Approve("INV-1", Manager, "Manager"),
            $"Manager approval limit is 50,000.00; invoice INV-1 is {formattedAmount}.");
    }

    // ---- R2: Director may approve up to 500,000.00 (inclusive) ----

    [Theory]
    [InlineData("50000.01")]
    [InlineData("499999.99")]
    [InlineData("500000.00")]
    public void Approve_DirectorWithinLimit_ApprovesInvoice(string amount)
    {
        var invoice = PendingInvoice(amount);

        var result = ServiceFor(invoice).Approve("INV-1", Director, "Director");

        Assert.Equal(InvoiceStatus.Approved, result.Status);
        Assert.Equal(Director, result.DecidedBy);
        Assert.NotNull(result.DecidedAt);
    }

    // Interim, fail-closed behaviour of task 1: nobody can approve above 500,000.00 alone.
    // Replaced by the two-approver rule in task 2.
    [Fact]
    public void Approve_DirectorAboveLimit_IsRefusedUntilTwoApproverRuleExists()
    {
        AssertRefused(
            PendingInvoice("500000.01"),
            service => service.Approve("INV-1", Director, "Director"),
            "Director approval limit is 500,000.00; invoice INV-1 is 500,000.01.");
    }

    // ---- Roles without an approval limit ----

    [Theory]
    [InlineData("Admin")]
    [InlineData("Approver")]
    [InlineData("manager")]
    [InlineData("")]
    public void Approve_RoleWithoutLimit_IsRefusedAndInvoiceUnchanged(string role)
    {
        AssertRefused(
            PendingInvoice("100.00"),
            service => service.Approve("INV-1", "someone", role),
            $"Role {role} cannot approve invoices.");
    }
}
