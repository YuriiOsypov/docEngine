/**
 * Elevated public-form orchestration (token resolve, writeback DML, document save).
 * Bypasses sharing so Guest User can submit; DML uses SYSTEM_MODE with allowlisted fields
 * from DocEngineWriteback. Do not expose this class to LWC — call via PublicFormController.
 */
public with sharing class DocEnginePublicFormService {
  public static final String DEFAULT_SITE_PATH = '/s/docengine-form';
  public static final Integer DOCUMENT_JSON_MAX = 131072;

  public class ResolvedLink {
    public DocEngine_Form_Link__c link;
    public DocEngine_Template__c template;
    public DocEngine_Template_Version__c version;
  }

  public static ResolvedLink resolveLink(String token) {
    return resolveLink(token, false);
  }

  @TestVisible
  private static ResolvedLink resolveLink(String token, Boolean lockForSubmit) {
    if (String.isBlank(token)) {
      throw auraError('token is required.');
    }
    String t = token.trim();
    // Guest token resolution intentionally bypasses guest CRUD/FLS.
    String linkQuery =
      'SELECT Id, Name, Token__c, Template__c, Template_Version__c, ' +
      'Object_API_Name__c, Mode__c, Is_Active__c, Expires_At__c, ' +
      'Max_Submissions__c, Submission_Count__c, Site_Path__c, ' +
      'Owner_User__c, Record_Id__c, Allow_Pdf_Attach__c, Require_Captcha__c ' +
      'FROM DocEngine_Form_Link__c WHERE Token__c = :token LIMIT 1';
    if (lockForSubmit == true) {
      linkQuery += ' FOR UPDATE';
    }
    List<DocEngine_Form_Link__c> links = Database.queryWithBinds(
      linkQuery,
      new Map<String, Object>{ 'token' => t },
      AccessLevel.SYSTEM_MODE
    );
    if (links.isEmpty()) {
      throw auraError('Form link not found.');
    }
    DocEngine_Form_Link__c link = links[0];
    assertLinkUsable(link, lockForSubmit);
    assertCaptchaDisabled(link);

    List<DocEngine_Template__c> templates = Database.queryWithBinds(
      'SELECT Id, Name, Object_API_Name__c, Is_Active__c, Public_Form_Enabled__c, ' +
        'Public_Form_Mode__c, Hide_Empty__c, Output_Format__c, PDF_Filename__c, ' +
        'Current_Version__c FROM DocEngine_Template__c WHERE Id = :templateId LIMIT 1',
      new Map<String, Object>{ 'templateId' => link.Template__c },
      AccessLevel.SYSTEM_MODE
    );
    if (templates.isEmpty()) {
      throw auraError('Form template not found.');
    }
    DocEngine_Template__c tmpl = templates[0];
    if (tmpl.Public_Form_Enabled__c != true) {
      throw auraError('Public form is not enabled for this template.');
    }
    if (tmpl.Is_Active__c != true) {
      throw auraError('Form template is inactive.');
    }
    if (
      String.isBlank(link.Object_API_Name__c) ||
      String.isBlank(tmpl.Object_API_Name__c) ||
      !link.Object_API_Name__c.equalsIgnoreCase(tmpl.Object_API_Name__c)
    ) {
      throw auraError('Form link object mapping no longer matches its template.');
    }

    List<DocEngine_Template_Version__c> versions = Database.queryWithBinds(
      'SELECT Id, Template__c, Version__c, Template_JSON__c ' +
        'FROM DocEngine_Template_Version__c WHERE Id = :versionId LIMIT 1',
      new Map<String, Object>{ 'versionId' => link.Template_Version__c },
      AccessLevel.SYSTEM_MODE
    );
    if (
      versions.isEmpty() ||
      versions[0].Template__c != link.Template__c ||
      String.isBlank(versions[0].Template_JSON__c)
    ) {
      throw auraError('Form template version not found.');
    }
    validatePinnedRecordMapping(link);

    ResolvedLink resolved = new ResolvedLink();
    resolved.link = link;
    resolved.template = tmpl;
    resolved.version = versions[0];
    return resolved;
  }

  /**
   * @param forSubmit when true, also enforces max submissions.
   */
  public static void assertLinkUsable(DocEngine_Form_Link__c link, Boolean forSubmit) {
    if (link == null) {
      throw auraError('Form link not found.');
    }
    if (link.Is_Active__c != true) {
      throw auraError('This form link is no longer active.');
    }
    if (link.Expires_At__c != null && link.Expires_At__c < Datetime.now()) {
      throw auraError('This form link has expired.');
    }
    if (
      forSubmit == true &&
      link.Max_Submissions__c != null &&
      link.Submission_Count__c != null &&
      link.Submission_Count__c >= link.Max_Submissions__c
    ) {
      throw auraError('This form has reached its submission limit.');
    }
  }

  public static void assertCaptchaDisabled(DocEngine_Form_Link__c link) {
    if (link != null && link.Require_Captcha__c == true) {
      throw auraError(
        'This link requires CAPTCHA, but no CAPTCHA provider is configured. ' +
        'Ask a DocEngine administrator to revoke it and create a new link with CAPTCHA disabled.'
      );
    }
  }

  public static Map<String, Object> buildPublicFormDto(ResolvedLink resolved) {
    DocEngine_Form_Link__c link = resolved.link;
    DocEngine_Template__c tmpl = resolved.template;
    Map<String, Object> out = new Map<String, Object>();
    out.put('linkId', link.Id);
    out.put('name', link.Name);
    out.put('objectApiName', link.Object_API_Name__c);
    out.put('mode', link.Mode__c);
    out.put('templateId', link.Template__c);
    out.put('templateVersionId', link.Template_Version__c);
    out.put('templateJson', sanitizeTemplateJson(resolved.version.Template_JSON__c));
    out.put('hideEmpty', tmpl.Hide_Empty__c == true);
    out.put(
      'outputFormat',
      String.isBlank(tmpl.Output_Format__c)
        ? 'pdf'
        : (tmpl.Output_Format__c.trim().equalsIgnoreCase('html') ? 'html' : 'pdf')
    );
    out.put('pdfFilename', tmpl.PDF_Filename__c);
    out.put('requireCaptcha', false);
    out.put('allowPdfAttach', link.Allow_Pdf_Attach__c == true);
    out.put('sitePath', String.isBlank(link.Site_Path__c) ? DEFAULT_SITE_PATH : link.Site_Path__c);
    out.put('prefill', buildPrefillSafe(resolved));
    return out;
  }

  @TestVisible
  private static Object buildPrefillSafe(ResolvedLink resolved) {
    try {
      String mode = String.isBlank(resolved.link.Mode__c) ? 'Create' : resolved.link.Mode__c;
      if (!mode.equalsIgnoreCase('Update') || String.isBlank(resolved.link.Record_Id__c)) {
        return null;
      }
      Id recordId = Id.valueOf(resolved.link.Record_Id__c.trim());
      return DocEngineWriteback.buildPrefill(
        resolved.version.Template_JSON__c,
        recordId,
        resolved.link.Object_API_Name__c
      );
    } catch (Exception e) {
      return null;
    }
  }

  /**
   * Strip fieldMapping (incl. sourceSample) so guests never see SF path map / sample data.
   * Structure + fieldSchemas remain for the fill editor.
   */
  @TestVisible
  public static String sanitizeTemplateJson(String templateJson) {
    if (String.isBlank(templateJson)) {
      return templateJson;
    }
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(templateJson);
    } catch (Exception e) {
      throw auraError('Invalid template JSON.');
    }
    if (!(parsed instanceof Map<String, Object>)) {
      return templateJson;
    }
    Map<String, Object> root = (Map<String, Object>) parsed;
    root.remove('fieldMapping');
    return JSON.serialize(root);
  }

  public static Map<String, Object> submit(
    String token,
    String answersJson,
    String html,
    String captchaToken
  ) {
    // Lock before checking limits. Concurrent submits serialize on this row and
    // each transaction rechecks the latest active/expiry/count values.
    ResolvedLink resolved = resolveLink(token, true);

    if (String.isBlank(answersJson)) {
      throw auraError('answersJson is required.');
    }
    if (answersJson.length() > DOCUMENT_JSON_MAX) {
      throw auraError(
        'Document JSON is too large (' +
          String.valueOf(answersJson.length()) +
          ' chars; max ' +
          String.valueOf(DOCUMENT_JSON_MAX) +
          ').'
      );
    }

    String objectApiName = resolved.link.Object_API_Name__c;
    // Elevated: Guest profiles often lack Account/Lead CRUD; DML below uses SYSTEM_MODE.
    DocEngineWriteback.Result wb = DocEngineWriteback.applyElevated(
      resolved.version.Template_JSON__c,
      answersJson,
      objectApiName
    );

    Id parentId;
    String mode = String.isBlank(resolved.link.Mode__c) ? 'Create' : resolved.link.Mode__c;
    if (mode.equalsIgnoreCase('Update')) {
      if (String.isBlank(resolved.link.Record_Id__c)) {
        throw auraError('Update form link is missing Record_Id__c.');
      }
      parentId = Id.valueOf(resolved.link.Record_Id__c.trim());
      if (!wb.appliedFields.isEmpty()) {
        SObject row = DocEngineWriteback.sanitizeElevatedForDml(wb, true);
        row.put('Id', parentId);
        Database.update(row, AccessLevel.SYSTEM_MODE);
      }
    } else if (!wb.appliedFields.isEmpty() && wb.record != null) {
      // Optional writeback — Create works with Document JSON only when nothing maps.
      SObject row = DocEngineWriteback.sanitizeElevatedForDml(wb, false);
      Database.insert(row, AccessLevel.SYSTEM_MODE);
      parentId = (Id) row.get('Id');
      if (parentId == null) {
        throw auraError('Record create did not return an Id.');
      }
    } else {
      parentId = null;
    }

    DocEngine_Document__c doc = new DocEngine_Document__c();
    doc.Template__c = resolved.link.Template__c;
    doc.Template_Version__c = resolved.link.Template_Version__c;
    doc.Record_Id__c = parentId == null ? null : String.valueOf(parentId);
    doc.Object_API_Name__c = objectApiName;
    doc.Document_JSON__c = answersJson;
    doc.Status__c = 'Completed';
    doc.Completed_Date__c = Datetime.now();
    doc.Form_Link__c = resolved.link.Id;
    doc.Source__c = 'PublicForm';
    // Guest submission is a validated package boundary; these fixed package fields
    // cannot receive guest FLS in a managed 1GP permission set.
    // Code-analyzer-suppress(sfge:ApexFlsViolation)
    Database.insert(doc, AccessLevel.SYSTEM_MODE);
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation)

    String pdfWarning = null;
    if (resolved.link.Allow_Pdf_Attach__c == true && String.isNotBlank(html)) {
      try {
        String format = resolved.template.Output_Format__c;
        Boolean asHtml = format != null && format.trim().equalsIgnoreCase('html');
        String filename = String.isBlank(resolved.template.PDF_Filename__c)
          ? (asHtml ? 'document.html' : 'document.pdf')
          : resolved.template.PDF_Filename__c;
        if (asHtml) {
          filename = filename.replaceAll('(?i)\\.pdf$', '.html');
          if (!filename.toLowerCase().endsWith('.html')) {
            filename = filename + '.html';
          }
          attachFileElevated(doc.Id, parentId, Blob.valueOf(html), filename, 'html');
        } else {
          if (!filename.toLowerCase().endsWith('.pdf')) {
            filename = filename + '.pdf';
          }
          attachFileElevated(doc.Id, parentId, Blob.toPdf(html), filename, 'pdf');
        }
      } catch (Exception e) {
        pdfWarning = e.getMessage();
      }
    }

    Decimal count = resolved.link.Submission_Count__c == null
      ? 0
      : resolved.link.Submission_Count__c;
    // The row is locked and limits were rechecked; only the package counter is updated.
    // Code-analyzer-suppress(sfge:ApexFlsViolation)
    Database.update(
      new DocEngine_Form_Link__c(
        Id = resolved.link.Id,
        Submission_Count__c = count + 1
      ),
      AccessLevel.SYSTEM_MODE
    );
    // Code-analyzer-unsuppress(sfge:ApexFlsViolation)

    Map<String, Object> out = new Map<String, Object>();
    out.put('ok', true);
    out.put('recordId', parentId);
    out.put('documentId', doc.Id);
    out.put('message', 'Thank you. Your application was submitted.');
    if (String.isNotBlank(pdfWarning)) {
      out.put('pdfWarning', pdfWarning);
    }
    return out;
  }

  private static void validatePinnedRecordMapping(DocEngine_Form_Link__c link) {
    String mode = normalizeMode(link.Mode__c, null);
    if (mode == 'Create') {
      if (String.isNotBlank(link.Record_Id__c)) {
        throw auraError('Create form link has an invalid pinned source record.');
      }
      return;
    }
    if (String.isBlank(link.Record_Id__c)) {
      throw auraError('Update form link is missing its pinned source record.');
    }
    Id targetId;
    try {
      targetId = Id.valueOf(link.Record_Id__c.trim());
    } catch (Exception e) {
      throw auraError('Update form link has an invalid pinned source record.');
    }
    String actualObject = targetId.getSObjectType().getDescribe().getName();
    if (!actualObject.equalsIgnoreCase(link.Object_API_Name__c)) {
      throw auraError('Update form link source record does not match its configured object.');
    }
    List<SObject> targets = Database.queryWithBinds(
      'SELECT Id FROM ' + actualObject + ' WHERE Id = :targetId LIMIT 1',
      new Map<String, Object>{ 'targetId' => targetId },
      AccessLevel.SYSTEM_MODE
    );
    if (targets.isEmpty()) {
      throw auraError('The pinned update record no longer exists.');
    }
  }

  /**
   * Guest-safe Files attach (SYSTEM_MODE) — avoids DocEngineAccess / FLS gates on InstanceController.
   */
  @TestVisible
  private static void attachFileElevated(
    Id docInstanceId,
    Id parentRecordId,
    Blob body,
    String filename,
    String kind
  ) {
    if (docInstanceId == null || body == null || body.size() == 0) {
      return;
    }
    String ext = kind == 'html' ? '.html' : '.pdf';
    if (String.isBlank(filename)) {
      filename = 'document' + ext;
    }
    if (!filename.toLowerCase().endsWith(ext)) {
      filename = filename + ext;
    }
    ContentVersion cv = new ContentVersion();
    String title = filename;
    Integer dot = title.lastIndexOf('.');
    if (dot > 0) {
      title = title.substring(0, dot);
    }
    cv.Title = title.left(255);
    cv.PathOnClient = filename;
    cv.VersionData = body;
    cv.FirstPublishLocationId = docInstanceId;
    Database.insert(cv, AccessLevel.SYSTEM_MODE);

    // Guest file finalization intentionally reads the system-created file.
    List<ContentVersion> versions = Database.queryWithBinds(
      'SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :versionId LIMIT 1',
      new Map<String, Object>{ 'versionId' => cv.Id },
      AccessLevel.SYSTEM_MODE
    );
    cv = versions[0];

    if (parentRecordId != null) {
      List<ContentDocumentLink> existing = Database.queryWithBinds(
        'SELECT Id FROM ContentDocumentLink ' +
          'WHERE ContentDocumentId = :documentId AND LinkedEntityId = :parentId LIMIT 1',
        new Map<String, Object>{
          'documentId' => cv.ContentDocumentId,
          'parentId' => parentRecordId
        },
        AccessLevel.SYSTEM_MODE
      );
      if (existing.isEmpty()) {
        ContentDocumentLink link = new ContentDocumentLink();
        link.ContentDocumentId = cv.ContentDocumentId;
        link.LinkedEntityId = parentRecordId;
        link.ShareType = 'V';
        link.Visibility = 'AllUsers';
        Database.insert(link, AccessLevel.SYSTEM_MODE);
      }
    }

    Database.update(
      new DocEngine_Document__c(
        Id = docInstanceId,
        Content_Document_Id__c = String.valueOf(cv.ContentDocumentId)
      ),
      AccessLevel.SYSTEM_MODE
    );
  }

  public static String newToken() {
    // 64 hex chars from 32 random bytes.
    return EncodingUtil.convertToHex(Crypto.generateAesKey(256));
  }

  public static String normalizeMode(String mode, String templateDefault) {
    String m = String.isBlank(mode) ? templateDefault : mode;
    if (String.isBlank(m)) {
      return 'Create';
    }
    m = m.trim();
    return m.equalsIgnoreCase('Update') ? 'Update' : 'Create';
  }

  public static AuraHandledException auraError(String message) {
    String msg = String.isBlank(message) ? 'DocEngine public form request failed.' : message;
    AuraHandledException e = new AuraHandledException(msg);
    e.setMessage(msg);
    return e;
  }
}
