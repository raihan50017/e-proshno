using EProshno.Core.Common;
using EProshno.Core.Questions;
using EProshno.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace EProshno.Api.Features.QuestionBanks;

/// <summary>
/// Who may do what with a custom bank. Everything runs under the tenant filter, so banks of other
/// institutions are simply not found (404).
/// <list type="bullet">
/// <item>Read: the owner, anyone for shared banks, institution admins for every bank.</item>
/// <item>Manage settings / delete questions of others: the owner or an institution admin.</item>
/// <item>Add questions: the owner, any member for shared banks, admins.</item>
/// <item>Edit a question: bank managers and the question's author.</item>
/// </list>
/// </summary>
public sealed class BankAccess(AppDbContext db, ITenantContext tenant)
{
    public IQueryable<QuestionBank> Readable()
    {
        var userId = tenant.UserId;
        var banks = db.QuestionBanks.Where(b => b.ArchivedAt == null);
        return tenant.IsInstitutionAdmin
            ? banks
            : banks.Where(b => b.OwnerId == userId || b.Sharing == BankSharing.Institution);
    }

    public async Task<QuestionBank> GetReadableAsync(Guid id, CancellationToken ct) =>
        await Readable().Where(b => b.Id == id).FirstOr404Async(ct);

    public async Task<QuestionBank> GetManageableAsync(Guid id, CancellationToken ct)
    {
        var bank = await GetReadableAsync(id, ct);
        return CanManage(bank) ? bank : throw AppException.Forbidden(Messages.BankNotEditable);
    }

    public async Task<QuestionBank> GetWritableAsync(Guid id, CancellationToken ct)
    {
        var bank = await GetReadableAsync(id, ct);
        return CanWrite(bank) ? bank : throw AppException.Forbidden(Messages.BankNotEditable);
    }

    public bool CanManage(QuestionBank bank) => bank.OwnerId == tenant.CurrentUserId || tenant.IsInstitutionAdmin;

    public bool CanWrite(QuestionBank bank) => CanManage(bank) || bank.Sharing == BankSharing.Institution;

    public bool CanEditQuestion(QuestionBank bank, Question question) =>
        CanManage(bank) || question.CreatedById == tenant.CurrentUserId;

    /// <summary>New and edited questions wait for approval in banks that require it, unless an admin writes them.</summary>
    public ContentStatus StatusForNew(QuestionBank bank) =>
        bank.RequireApproval && !tenant.IsInstitutionAdmin ? ContentStatus.PendingApproval : ContentStatus.Published;

    /// <summary>Loads a question of the bank (any status) for editing.</summary>
    public async Task<Question> GetQuestionAsync(QuestionBank bank, Guid questionId, CancellationToken ct) =>
        await db.Questions.Where(q => q.Id == questionId && q.BankId == bank.Id).FirstOr404Async(ct);
}
