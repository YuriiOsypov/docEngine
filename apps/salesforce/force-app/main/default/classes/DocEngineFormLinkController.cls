/**
 * Admin APIs to mint / revoke / list public form links.
 * Requires DocEngine template access (Public Group + Admin/User session).
 */
public with sharing class DocEngineFormLinkController {
  public class FormLinkDTO {
    @AuraEnabled public Id id;
    @AuraEnabled public String name;
    @AuraEnabled public String token;
    @AuraEnabled public Id templateId;
    @AuraEnabled public Id templateVersionId;
    @AuraEnabled public String objectApiName;
    @AuraEnabled public String mode;
    @AuraEnabled public Boolean isActive;
    @AuraEnabled public Datetime expiresAt;
    @AuraEnabled public Decimal maxSubmissions;
    @AuraEnabled public Decimal submissionCount;
    @AuraEnabled public String sitePath;
    @AuraEnabled public String recordId;
    @AuraEnabled public Boolean allowPdfAttach;
    @AuraEnabled public Boolean requireCaptcha;
    @AuraEnabled public String publicPath;
    /** Absolute URL when org Public Form Site Base URL is set. */
    @AuraEnabled public String publicUrl;
  }

  /**
   * JSON in/out — same pattern as saveInstanceJson / saveTemplateJson.
   * Request keys: templateId, templateVersionId, name, mode, expiresAt,
   * maxSubmissions, sitePath, recordId (Update), allowPdfAttach, requireCaptcha.
   */
  @AuraEnabled
  public static String createFormLinkJson(String requestJson) {
    try {
      return JSON.serialize(createFormLink(parseCreateRequest(requestJson)));
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw DocEnginePublicFormService.auraError(e.getMessage());
    }
  }

  @AuraEnabled
  public static FormLinkDTO createFormLink(FormLinkDTO req) {
    DocEngineAccess.assertManageAccess();
    if (req == null || req.templateId == null) {
      throw DocEnginePublicFormService.auraError('templateId is required.');
    }
    DocEngineAccess.assertTemplateAccess(req.templateId);

    List<DocEngine_Template__c> templates = [
      SELECT
        Id,
        Name,
        Object_API_Name__c,
        Is_Active__c,
        Public_Form_Enabled__c,
        Public_Form_Mode__c,
        Current_Version__c
      FROM DocEngine_Template__c
      WHERE Id = :req.templateId
      WITH USER_MODE
      LIMIT 1
    ];
    if (templates.isEmpty()) {
      throw DocEnginePublicFormService.auraError('Template not found.');
    }
    DocEngine_Template__c tmpl = templates[0];
    if (tmpl.Public_Form_Enabled__c != true) {
      throw DocEnginePublicFormService.auraError(
        'Enable Public Form on the template before minting a link.'
      );
    }
    if (String.isBlank(tmpl.Object_API_Name__c)) {
      throw DocEnginePublicFormService.auraError('Template has no Object_API_Name__c.');
    }
    if (
      String.isNotBlank(req.objectApiName) &&
      !tmpl.Object_API_Name__c.equalsIgnoreCase(req.objectApiName.trim())
    ) {
      throw DocEnginePublicFormService.auraError(
        'Form link object must match the template object.'
      );
    }
    if (req.requireCaptcha == true) {
      throw DocEnginePublicFormService.auraError(
        'CAPTCHA is not available. Clear Require Captcha before creating the link.'
      );
    }

    Id versionId = DocEngineTemplateVersionService.resolveVersionId(
      tmpl.Id,
      req.templateVersionId
    );
    String mode = DocEnginePublicFormService.normalizeMode(req.mode, tmpl.Public_Form_Mode__c);
    if (mode == 'Update' && String.isBlank(req.recordId)) {
      throw DocEnginePublicFormService.auraError('recordId is required for Update mode links.');
    }
    if (mode == 'Create' && String.isNotBlank(req.recordId)) {
      throw DocEnginePublicFormService.auraError(
        'recordId is only allowed for Update mode links.'
      );
    }
    Id targetRecordId = mode == 'Update'
      ? validateTargetRecord(req.recordId, tmpl.Object_API_Name__c)
      : null;

    DocEngine_Form_Link__c link = new DocEngine_Form_Link__c();
    link.Name = String.isBlank(req.name) ? (tmpl.Name + ' Form') : req.name.trim();
    if (link.Name.length() > 80) {
      link.Name = link.Name.substring(0, 80);
    }
    link.Token__c = DocEnginePublicFormService.newToken();
    link.Template__c = tmpl.Id;
    link.Template_Version__c = versionId;
    link.Object_API_Name__c = tmpl.Object_API_Name__c;
    link.Mode__c = mode;
    link.Is_Active__c = true;
    link.Expires_At__c = req.expiresAt;
    link.Max_Submissions__c = req.maxSubmissions;
    link.Submission_Count__c = 0;
    link.Site_Path__c = String.isBlank(req.sitePath)
      ? DocEnginePublicFormService.DEFAULT_SITE_PATH
      : req.sitePath.trim();
    link.Record_Id__c = targetRecordId == null ? null : String.valueOf(targetRecordId);
    link.Allow_Pdf_Attach__c = req.allowPdfAttach == null ? false : req.allowPdfAttach;
    link.Require_Captcha__c = false;

    SObjectAccessDecision decision = Security.stripInaccessible(
      AccessType.CREATABLE,
      new List<DocEngine_Form_Link__c>{ link }
    );
    List<DocEngine_Form_Link__c> safe = (List<DocEngine_Form_Link__c>) decision.getRecords();
    if (safe == null || safe.isEmpty()) {
      throw DocEnginePublicFormService.auraError(
        'Insufficient access to create form links. Assign DocEngine Admin.'
      );
    }
    Database.insert(safe, AccessLevel.USER_MODE);
    return toDto(
      [
        SELECT
          Id,
          Name,
          Token__c,
          Template__c,
          Template_Version__c,
          Object_API_Name__c,
          Mode__c,
          Is_Active__c,
          Expires_At__c,
          Max_Submissions__c,
          Submission_Count__c,
          Site_Path__c,
          Record_Id__c,
          Allow_Pdf_Attach__c,
          Require_Captcha__c
        FROM DocEngine_Form_Link__c
        WHERE Id = :safe[0].Id
        WITH USER_MODE
        LIMIT 1
      ][0]
    );
  }

  /**
   * Saved Experience site origin (no trailing slash), or a best-effort Live Network suggestion.
   */
  @AuraEnabled
  public static String getPublicFormSiteBaseUrl() {
    DocEngineAccess.assertManageAccess();
    try {
      String saved = normalizeSiteBaseUrl(readSavedSiteBaseUrl());
      if (String.isNotBlank(saved)) {
        return saved;
      }
      return suggestExperienceSiteBaseUrl();
    } catch (Exception e) {
      return null;
    }
  }

  @AuraEnabled
  public static String savePublicFormSiteBaseUrl(String siteBaseUrl) {
    DocEngineAccess.assertManageAccess();
    String normalized = normalizeSiteBaseUrl(siteBaseUrl);
    if (String.isBlank(normalized)) {
      throw DocEnginePublicFormService.auraError(
        'Experience site base URL is required (e.g. https://myorg.my.site.com).'
      );
    }
    if (!normalized.startsWith('https://') && !normalized.startsWith('http://')) {
      throw DocEnginePublicFormService.auraError(
        'Site base URL must start with https:// (or http:// for sandboxes).'
      );
    }
    String lower = normalized.toLowerCase();
    if (
      lower.contains('.lightning.force.com') ||
      lower.contains('.salesforce.com') ||
      lower.contains('login.salesforce.com')
    ) {
      throw DocEnginePublicFormService.auraError(
        'Use the Experience Cloud domain (*.my.site.com), not lightning.force.com. ' +
          'Example: https://yourorg.my.site.com'
      );
    }
    DocEngine_Settings__c settings = DocEngine_Settings__c.getOrgDefaults();
    if (settings.Id == null) {
      settings = new DocEngine_Settings__c();
      settings.SetupOwnerId = UserInfo.getOrganizationId();
    }
    settings.Public_Form_Site_Base_URL__c = normalized;
    SObjectAccessDecision settingsDecision = Security.stripInaccessible(
      AccessType.UPSERTABLE,
      new List<DocEngine_Settings__c>{ settings }
    );
    List<DocEngine_Settings__c> safeSettings =
      (List<DocEngine_Settings__c>) settingsDecision.getRecords();
    Database.upsert(safeSettings, AccessLevel.USER_MODE);
    return normalized;
  }

  @AuraEnabled
  public static void revokeFormLink(Id formLinkId) {
    DocEngineAccess.assertManageAccess();
    if (formLinkId == null) {
      throw DocEnginePublicFormService.auraError('formLinkId is required.');
    }
    List<DocEngine_Form_Link__c> rows = [
      SELECT Id, Template__c, Is_Active__c
      FROM DocEngine_Form_Link__c
      WHERE Id = :formLinkId
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw DocEnginePublicFormService.auraError('Form link not found.');
    }
    DocEngineAccess.assertTemplateAccess(rows[0].Template__c);
    rows[0].Is_Active__c = false;
    SObjectAccessDecision decision = Security.stripInaccessible(
      AccessType.UPDATABLE,
      rows
    );
    Database.update(decision.getRecords(), AccessLevel.USER_MODE);
  }

  // Not cacheable — mint must refresh the list immediately.
  @AuraEnabled
  public static String listFormLinksJson(Id templateId) {
    try {
      List<FormLinkDTO> rows = listFormLinks(templateId);
      return JSON.serialize(rows);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw DocEnginePublicFormService.auraError(e.getMessage());
    }
  }

  @AuraEnabled
  public static List<FormLinkDTO> listFormLinks(Id templateId) {
    DocEngineAccess.assertManageAccess();
    if (templateId == null) {
      throw DocEnginePublicFormService.auraError('templateId is required.');
    }
    DocEngineAccess.assertTemplateAccess(templateId);
    List<DocEngine_Form_Link__c> rows = [
      SELECT
        Id,
        Name,
        Token__c,
        Template__c,
        Template_Version__c,
        Object_API_Name__c,
        Mode__c,
        Is_Active__c,
        Expires_At__c,
        Max_Submissions__c,
        Submission_Count__c,
        Site_Path__c,
        Record_Id__c,
        Allow_Pdf_Attach__c,
        Require_Captcha__c
      FROM DocEngine_Form_Link__c
      WHERE Template__c = :templateId
      WITH USER_MODE
      ORDER BY CreatedDate DESC
      LIMIT 200
    ];
    List<FormLinkDTO> out = new List<FormLinkDTO>();
    for (DocEngine_Form_Link__c row : rows) {
      out.add(toDto(row));
    }
    return out;
  }

  private static FormLinkDTO parseCreateRequest(String requestJson) {
    if (String.isBlank(requestJson)) {
      throw DocEnginePublicFormService.auraError('Request JSON is required.');
    }
    Map<String, Object> raw;
    try {
      raw = (Map<String, Object>) JSON.deserializeUntyped(requestJson);
    } catch (Exception e) {
      throw DocEnginePublicFormService.auraError('Invalid request JSON.');
    }
    FormLinkDTO req = new FormLinkDTO();
    Object tid = raw.get('templateId');
    if (tid != null && String.isNotBlank(String.valueOf(tid))) {
      req.templateId = Id.valueOf(String.valueOf(tid));
    }
    Object versionId = raw.get('templateVersionId');
    if (versionId != null && String.isNotBlank(String.valueOf(versionId))) {
      req.templateVersionId = Id.valueOf(String.valueOf(versionId));
    }
    req.name = (String) raw.get('name');
    req.objectApiName = (String) raw.get('objectApiName');
    req.mode = (String) raw.get('mode');
    req.sitePath = (String) raw.get('sitePath');
    req.recordId = raw.get('recordId') == null ? null : String.valueOf(raw.get('recordId'));
    Object maxSub = raw.get('maxSubmissions');
    if (maxSub != null && String.isNotBlank(String.valueOf(maxSub))) {
      req.maxSubmissions = Decimal.valueOf(String.valueOf(maxSub));
    }
    Object allowPdf = raw.get('allowPdfAttach');
    req.allowPdfAttach = allowPdf == null ? null : (Boolean) allowPdf;
    Object reqCaptcha = raw.get('requireCaptcha');
    req.requireCaptcha = reqCaptcha == null ? null : (Boolean) reqCaptcha;
    Object expires = raw.get('expiresAt');
    if (expires != null && String.isNotBlank(String.valueOf(expires))) {
      try {
        req.expiresAt = Datetime.valueOfGmt(
          String.valueOf(expires).replace('T', ' ').replace('Z', '')
        );
      } catch (Exception e) {
        req.expiresAt = null;
      }
    }
    return req;
  }

  private static Id validateTargetRecord(String recordId, String objectApiName) {
    Id targetId;
    try {
      targetId = Id.valueOf(recordId == null ? null : recordId.trim());
    } catch (Exception e) {
      throw DocEnginePublicFormService.auraError('Invalid Update recordId.');
    }
    if (targetId == null) {
      throw DocEnginePublicFormService.auraError('Invalid Update recordId.');
    }
    Schema.DescribeSObjectResult describe = targetId.getSObjectType().getDescribe();
    if (!describe.getName().equalsIgnoreCase(objectApiName)) {
      throw DocEnginePublicFormService.auraError(
        'Update recordId does not match the template object.'
      );
    }
    List<SObject> rows = Database.queryWithBinds(
      'SELECT Id FROM ' + describe.getName() + ' WHERE Id = :targetId LIMIT 1',
      new Map<String, Object>{ 'targetId' => targetId },
      AccessLevel.USER_MODE
    );
    if (rows.isEmpty()) {
      throw DocEnginePublicFormService.auraError(
        'Update record was not found or is not accessible.'
      );
    }
    return targetId;
  }

  @TestVisible
  private static FormLinkDTO toDto(DocEngine_Form_Link__c row) {
    FormLinkDTO dto = new FormLinkDTO();
    dto.id = row.Id;
    dto.name = row.Name;
    dto.token = row.Token__c;
    dto.templateId = row.Template__c;
    dto.templateVersionId = row.Template_Version__c;
    dto.objectApiName = row.Object_API_Name__c;
    dto.mode = row.Mode__c;
    dto.isActive = row.Is_Active__c == true;
    dto.expiresAt = row.Expires_At__c;
    dto.maxSubmissions = row.Max_Submissions__c;
    dto.submissionCount = row.Submission_Count__c;
    dto.sitePath = row.Site_Path__c;
    dto.recordId = row.Record_Id__c;
    dto.allowPdfAttach = row.Allow_Pdf_Attach__c == true;
    dto.requireCaptcha = row.Require_Captcha__c == true;
    String path = String.isBlank(row.Site_Path__c)
      ? DocEnginePublicFormService.DEFAULT_SITE_PATH
      : row.Site_Path__c;
    dto.publicPath = path + (path.contains('?') ? '&' : '?') + 'token=' + row.Token__c;
    String base = normalizeSiteBaseUrl(readSavedSiteBaseUrl());
    if (String.isNotBlank(base) && String.isNotBlank(dto.publicPath)) {
      dto.publicUrl =
        base + (dto.publicPath.startsWith('/') ? dto.publicPath : '/' + dto.publicPath);
    }
    return dto;
  }

  @TestVisible
  private static String readSavedSiteBaseUrl() {
    DocEngine_Settings__c settings = DocEngine_Settings__c.getInstance();
    if (settings == null) {
      return null;
    }
    return settings.Public_Form_Site_Base_URL__c;
  }

  @TestVisible
  private static String normalizeSiteBaseUrl(String value) {
    if (String.isBlank(value)) {
      return null;
    }
    String base = value.trim();
    while (base.endsWith('/')) {
      base = base.substring(0, base.length() - 1);
    }
    // Accidental full form URL pasted as base — trim path.
    Integer marker = base.indexOf('/s/docengine-form');
    if (marker > 0) {
      base = base.substring(0, marker);
      while (base.endsWith('/')) {
        base = base.substring(0, base.length() - 1);
      }
    }
    return String.isBlank(base) ? null : base;
  }

  /**
   * Best-effort: Experience *.my.site.com domain, else Network login URL.
   * Includes sites still UnderConstruction (common in scratch/dev orgs).
   */
  @TestVisible
  private static String suggestExperienceSiteBaseUrl() {
    try {
      List<Domain> domains = [
        SELECT Domain
        FROM Domain
        WHERE Domain LIKE '%.my.site.com'
        WITH USER_MODE
        ORDER BY CreatedDate ASC
        LIMIT 5
      ];
      if (!domains.isEmpty() && String.isNotBlank(domains[0].Domain)) {
        return normalizeSiteBaseUrl('https://' + domains[0].Domain);
      }
    } catch (Exception e) {
      // Domain object may be restricted in some orgs — fall through.
      System.debug(LoggingLevel.FINE, 'Experience domain lookup is unavailable.');
    }

    // Experience Cloud / Networks is optional. Typed Schema.Network fails to compile when
    // the feature is off, so use dynamic SOQL only. Network.getLoginUrl requires the same
    // type at compile time — when Domains did not resolve, we cannot safely build a site URL.
    try {
      List<SObject> networks = Database.query(
        'SELECT Id, Name, UrlPathPrefix, Status FROM Network ' +
          'WHERE Status IN (\'Live\', \'UnderConstruction\') ' +
          'WITH USER_MODE ORDER BY CreatedDate ASC LIMIT 10'
      );
      if (networks == null || networks.isEmpty()) {
        return null;
      }
      // Without Network.getLoginUrl (compile-gated), Domain lookup above is the supported path.
      System.debug(
        LoggingLevel.FINE,
        'Network rows exist but login URL resolution requires Experiences-enabled compile context.'
      );
      return null;
    } catch (Exception e) {
      System.debug(LoggingLevel.FINE, 'Network lookup is unavailable.');
      return null;
    }
  }
}
