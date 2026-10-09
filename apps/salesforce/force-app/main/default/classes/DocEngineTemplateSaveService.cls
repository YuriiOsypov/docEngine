/**
 * System-context template save for managed-package required fields.
 * DocEngine_Template__c.Object_API_Name__c is required but cannot ship FLS in 1GP packages;
 * stripInaccessible + with sharing DML fails in subscriber orgs even when object CRUD is granted.
 * Callers must validate inputs and object permissions before invoking save().
 */
public with sharing class DocEngineTemplateSaveService {
  public class SaveResult {
    public Id templateId { get; set; }
    public DocEngine_Template_Version__c version { get; set; }
    public Decimal versionNumber { get; set; }
    public DocEngine_Template__c head { get; set; }
  }

  public static SaveResult save(
    DocEngineTemplateController.TemplateDTO dto,
    DocEngine_Template__c row,
    Decimal nextVersion
  ) {
    DocEngineAccess.assertManageAccess();
    if (dto == null || row == null || nextVersion == null) {
      throw new SecurityException('Validated template save input is required.');
    }
    row.Name = dto.name.trim();
    row.Object_API_Name__c = dto.objectApiName.trim();
    row.Template_JSON__c = dto.templateJson;
    row.Is_Active__c = dto.isActive == null ? true : dto.isActive;
    row.Description__c = dto.description;
    row.PDF_Filename__c = dto.pdfFilename;
    row.Hide_Empty__c = dto.hideEmpty == true;
    row.Attach_File__c = dto.attachFile != false;
    row.Output_Format__c = String.isBlank(dto.outputFormat)
      ? 'pdf'
      : (dto.outputFormat.trim().equalsIgnoreCase('html') ? 'html' : 'pdf');
    row.Access_Group_Id__c = dto.accessGroupId;
    row.Version__c = nextVersion;

    // Authorized package save must set required 1GP fields that cannot ship subscriber FLS.
    // Code-analyzer-suppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
    Database.upsert(row, AccessLevel.SYSTEM_MODE);
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
    Id templateId = row.Id;

    DocEngine_Template_Version__c ver = DocEngineTemplateVersionService.insertVersion(
      templateId,
      nextVersion,
      dto.templateJson
    );

    // Authorized snapshot pinning maintains package-owned fields unavailable through 1GP FLS.
    // Code-analyzer-suppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
    Database.update(
      new DocEngine_Template__c(
        Id = templateId,
        Current_Version__c = ver.Id,
        Version__c = nextVersion,
        Template_JSON__c = dto.templateJson
      ),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation,pmd:ApexCRUDViolation)
    DocEngineTemplateSharingService.syncTemplate(templateId);

    SaveResult out = new SaveResult();
    out.templateId = templateId;
    out.version = ver;
    out.versionNumber = nextVersion;
    out.head = row;
    return out;
  }
}
