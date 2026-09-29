/**
 * Resolves DocEngine_Button_Config__c presets for record Quick Actions / URL buttons.
 */
public with sharing class DocEngineButtonController {
  public class ButtonConfig {
    @AuraEnabled public String developerName { get; set; }
    @AuraEnabled public String label { get; set; }
    @AuraEnabled public String templateId { get; set; }
    @AuraEnabled public String objectApiName { get; set; }
    @AuraEnabled public Boolean fillMode { get; set; }
    @AuraEnabled public String exportMode { get; set; }
    @AuraEnabled public Boolean showPreview { get; set; }
    @AuraEnabled public Boolean hideEmpty { get; set; }
    @AuraEnabled public Boolean attachToRecord { get; set; }
  }

  @AuraEnabled(cacheable=true)
  public static ButtonConfig getConfig(String developerName) {
    if (String.isBlank(developerName)) {
      throw new AuraHandledException('developerName is required.');
    }
    List<DocEngine_Button_Config__c> rows = [
      SELECT
        Id,
        Name,
        Developer_Name__c,
        Template__c,
        Template__r.Name,
        Template__r.Object_API_Name__c,
        Fill_Mode__c,
        Export_Mode__c,
        Show_Preview__c,
        Hide_Empty__c,
        Attach_To_Record__c
      FROM DocEngine_Button_Config__c
      WHERE Developer_Name__c = :developerName.trim()
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('DocEngine button config not found: ' + developerName);
    }
    if (rows[0].Template__c != null) {
      DocEngineAccess.assertTemplateAccess(rows[0].Template__c);
    }
    return toConfig(rows[0]);
  }

  /**
   * Resolve button settings from a template Id (when Developer Name does not match
   * the Quick Action default Account_Generate_Document key).
   * Returns null when no config points at the template.
   */
  @AuraEnabled(cacheable=true)
  public static ButtonConfig getConfigForTemplate(Id templateId) {
    if (templateId == null) {
      return null;
    }
    DocEngineAccess.assertTemplateAccess(templateId);
    List<DocEngine_Button_Config__c> rows = [
      SELECT
        Id,
        Name,
        Developer_Name__c,
        Template__c,
        Template__r.Name,
        Template__r.Object_API_Name__c,
        Fill_Mode__c,
        Export_Mode__c,
        Show_Preview__c,
        Hide_Empty__c,
        Attach_To_Record__c
      FROM DocEngine_Button_Config__c
      WHERE Template__c = :templateId
      WITH USER_MODE
      ORDER BY LastModifiedDate DESC
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      return null;
    }
    return toConfig(rows[0]);
  }

  /**
   * Resolve a template Id (validates it exists when provided).
   */
  @AuraEnabled(cacheable=true)
  public static Id resolveTemplateId(String templateId) {
    if (String.isBlank(templateId)) {
      throw new AuraHandledException('templateId is required.');
    }
    Id tid;
    try {
      tid = Id.valueOf(templateId.trim());
    } catch (Exception e) {
      throw new AuraHandledException('Invalid templateId.');
    }
    DocEngineAccess.assertTemplateAccess(tid);
    return tid;
  }

  @TestVisible
  private static ButtonConfig toConfig(DocEngine_Button_Config__c row) {
    ButtonConfig cfg = new ButtonConfig();
    cfg.developerName = row.Developer_Name__c;
    cfg.label = row.Name;
    cfg.templateId = row.Template__c;
    cfg.objectApiName = row.Template__r != null ? row.Template__r.Object_API_Name__c : null;
    cfg.fillMode = row.Fill_Mode__c == null ? true : row.Fill_Mode__c;
    // Blank / None → pdf (Finish default). Explicit html stays html.
    String mode = String.isBlank(row.Export_Mode__c) ? 'pdf' : row.Export_Mode__c.toLowerCase();
    cfg.exportMode = mode == 'html' ? 'html' : 'pdf';
    cfg.showPreview = row.Show_Preview__c == null ? true : row.Show_Preview__c;
    cfg.hideEmpty = row.Hide_Empty__c == true;
    cfg.attachToRecord = row.Attach_To_Record__c == true;
    return cfg;
  }
}
