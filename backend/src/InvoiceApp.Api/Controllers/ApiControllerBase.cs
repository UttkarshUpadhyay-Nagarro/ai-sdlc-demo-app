using InvoiceApp.Domain;
using Microsoft.AspNetCore.Mvc;

namespace InvoiceApp.Api.Controllers;

public abstract class ApiControllerBase : ControllerBase
{
    /// <summary>Runs a service call and maps its failures to HTTP status codes (refused approval 403, missing 404, wrong state 409, bad input 400).</summary>
    protected ActionResult<Invoice> Handle(Func<Invoice> action)
    {
        try
        {
            return Ok(action());
        }
        catch (ApprovalDeniedException ex)
        {
            return StatusCode(StatusCodes.Status403Forbidden, new { error = ex.Message });
        }
        catch (KeyNotFoundException ex)
        {
            return NotFound(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { error = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
