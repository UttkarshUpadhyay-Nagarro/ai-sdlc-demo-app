namespace InvoiceApp.Domain;

/// <summary>
/// An approval attempt was refused by an approval rule (role, limit, two-approver or same-user).
/// The message is the reason shown to the user. Thrown before the invoice is changed.
/// Deliberately not an <see cref="InvalidOperationException"/>, which the API maps to 409.
/// </summary>
public class ApprovalDeniedException : Exception
{
    public ApprovalDeniedException(string reason) : base(reason)
    {
    }
}
