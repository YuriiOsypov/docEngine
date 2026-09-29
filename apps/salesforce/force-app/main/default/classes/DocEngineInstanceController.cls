/**
 * CRUD for DocEngine_Document__c — filled documents linked to any Salesforce record.
 * PDF storage via ContentVersion + ContentDocumentLink (instance + source record).
 */
public with sharing class DocEngineInstanceController {
  public class InstanceDTO {
    @AuraEnabled public Id id { get; set; }
    @AuraEnabled public String name { get; set; }
    @AuraEnabled public Id templateId { get; set; }
    /** Pinned DocEngine_Template_Version__c used for this fill. */
    @AuraEnabled public Id templateVersionId { get; set; }
    /** Template JSON from the pinned version (reopen); null when unset/legacy. */
    @AuraEnabled public String templateJson { get; set; }
    @AuraEnabled public Decimal templateVersion { get; set; }
    @AuraEnabled public String recordId { get; set; }
    @AuraEnabled public String objectApiName { get; set; }
    @AuraEnabled public String documentJson { get; set; }
    @AuraEnabled public String status { get; set; }
    @AuraEnabled public Datetime completedDate { get; set; }
  }

  public class InstanceSummary {
    @AuraEnabled public Id id { get; set; }
    @AuraEnabled public String name { get; set; }
    @AuraEnabled public Id templateId { get; set; }
    @AuraEnabled public String templateName { get; set; }
    @AuraEnabled public String status { get; set; }
    @AuraEnabled public Datetime completedDate { get; set; }
    @AuraEnabled public Datetime lastModifiedDate { get; set; }
    /** Attached ContentDocument Id when a file was saved on Complete. */
    @AuraEnabled public String contentDocumentId { get; set; }
    /** Lightning preview URL for the attached file (null when none). */
    @AuraEnabled public String fileUrl { get; set; }
  }

  public class FileSaveResult {
    @AuraEnabled public Id contentVersionId { get; set; }
    @AuraEnabled public Id contentDocumentId { get; set; }
  }

  /** Result of prepareShare — file on record plus optional public Content Delivery URL. */
  public class SharePrepareResult {
    @AuraEnabled public Id contentVersionId { get; set; }
    @AuraEnabled public Id contentDocumentId { get; set; }
    @AuraEnabled public String publicUrl { get; set; }
    @AuraEnabled public String filename { get; set; }
  }

  /** @deprecated Use FileSaveResult — kept for binary compatibility with existing LWCs. */
  public class PdfSaveResult {
    @AuraEnabled public Id contentVersionId { get; set; }
    @AuraEnabled public Id contentDocumentId { get; set; }
  }

  /** Field-image upload for fill/design (keeps Document_JSON__c under Long Text Area limits). */
  public class ImageUploadResult {
    @AuraEnabled public String url { get; set; }
    @AuraEnabled public Id contentVersionId { get; set; }
    @AuraEnabled public Id contentDocumentId { get; set; }
  }

  /** Image File linked to a source record (for the image picker browse list). */
  public class RecordImageItem {
    @AuraEnabled public Id contentDocumentId { get; set; }
    @AuraEnabled public Id contentVersionId { get; set; }
    @AuraEnabled public String title { get; set; }
    @AuraEnabled public String fileExtension { get; set; }
    @AuraEnabled public String thumbnailUrl { get; set; }
  }

  private static final Set<String> IMAGE_EXTENSIONS = new Set<String>{
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'
  };
  private static final Integer MAX_FILE_BYTES = 4500000;
  private static final Integer MAX_EMAIL_ATTACHMENT_BYTES = 3500000;
  private static final Integer MAX_FILENAME_LENGTH = 255;
  private static final Integer SHARE_EXPIRY_DAYS = 7;

  @AuraEnabled(cacheable=true)
  public static InstanceDTO getInstance(Id instanceId) {
    try {
      if (instanceId == null) {
        throw auraError('instanceId is required.');
      }
      List<DocEngine_Document__c> rows = [
        SELECT
          Id,
          Name,
          Template__c,
          Template__r.Access_Group_Id__c,
          Template_Version__c,
          Template_Version__r.Template_JSON__c,
          Template_Version__r.Version__c,
          Record_Id__c,
          Object_API_Name__c,
          Document_JSON__c,
          Status__c,
          Completed_Date__c
        FROM DocEngine_Document__c
        WHERE Id = :instanceId
        WITH USER_MODE
        LIMIT 1
      ];
      if (rows.isEmpty()) {
        throw auraError('Document instance not found.');
      }
      String groupId = rows[0].Template__r != null
        ? rows[0].Template__r.Access_Group_Id__c
        : null;
      DocEngineAccess.assertGroupAccess(groupId);
      return toDto(rows[0]);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  /**
   * Instances for a source record (record page related list / picker).
   */
  @AuraEnabled(cacheable=true)
  public static List<InstanceSummary> listForRecord(String recordId) {
    if (String.isBlank(recordId)) {
      throw new AuraHandledException('recordId is required.');
    }
    List<DocEngine_Document__c> rows = [
      SELECT
        Id,
        Name,
        Template__c,
        Template__r.Name,
        Template__r.Access_Group_Id__c,
        Status__c,
        Completed_Date__c,
        LastModifiedDate,
        Content_Document_Id__c
      FROM DocEngine_Document__c
      WHERE Record_Id__c = :recordId
      WITH USER_MODE
      ORDER BY LastModifiedDate DESC
    ];
    List<InstanceSummary> out = new List<InstanceSummary>();
    for (DocEngine_Document__c row : rows) {
      String groupId = row.Template__r != null ? row.Template__r.Access_Group_Id__c : null;
      if (!DocEngineAccess.canAccessByGroup(groupId)) {
        continue;
      }
      InstanceSummary s = new InstanceSummary();
      s.id = row.Id;
      s.name = row.Name;
      s.templateId = row.Template__c;
      s.templateName = row.Template__r != null ? row.Template__r.Name : null;
      s.status = row.Status__c;
      s.completedDate = row.Completed_Date__c;
      s.lastModifiedDate = row.LastModifiedDate;
      if (String.isNotBlank(row.Content_Document_Id__c)) {
        s.contentDocumentId = row.Content_Document_Id__c.trim();
        s.fileUrl = contentDocumentViewUrl(s.contentDocumentId);
      }
      out.add(s);
    }
    return out;
  }

  @AuraEnabled
  public static void deleteInstance(Id instanceId) {
    if (instanceId == null) {
      throw new AuraHandledException('instanceId is required.');
    }
    DocEngineAccess.assertDocumentAccess(instanceId);
    if (!Schema.sObjectType.DocEngine_Document__c.isDeletable()) {
      throw new AuraHandledException('Insufficient access to delete document instances.');
    }
    List<DocEngine_Document__c> rows = [
      SELECT Id, Content_Document_Id__c
      FROM DocEngine_Document__c
      WHERE Id = :instanceId
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('Document instance not found.');
    }
    Id contentDocumentId = resolveExistingContentDocumentId(rows[0].Content_Document_Id__c);
    if (contentDocumentId != null) {
      List<ContentDocumentLink> instanceLinks = [
        SELECT Id
        FROM ContentDocumentLink
        WHERE
          ContentDocumentId = :contentDocumentId
          AND LinkedEntityId = :instanceId
        WITH USER_MODE
        LIMIT 1
      ];
      if (instanceLinks.isEmpty()) {
        throw new AuraHandledException(
          'The attached Salesforce File is not linked to this document instance.'
        );
      }
      if (!Schema.sObjectType.ContentDocument.isDeletable()) {
        throw new AuraHandledException(
          'Insufficient access to delete the attached Salesforce File.'
        );
      }
    }
    // USER_MODE enforces CRUD + sharing for the running user (not only UI).
    Database.delete(rows, AccessLevel.USER_MODE);
    // Keep both deletes in one transaction: a denied file delete rolls back the instance delete.
    if (contentDocumentId != null) {
      Database.delete(
        new List<ContentDocument>{ new ContentDocument(Id = contentDocumentId) },
        AccessLevel.USER_MODE
      );
    }
  }

  /**
   * LWC entry point — JSON in/out avoids Aura InstanceDTO mapping failures in
   * managed-package subscriber orgs (null Id / nested types → cryptic GACK).
   * Same pattern as DocEngineTemplateController.saveTemplateJson.
   */
  @AuraEnabled
  public static String saveInstanceJson(String dtoJson) {
    try {
      InstanceDTO saved = saveInstanceImpl(parseInstanceDto(dtoJson));
      Map<String, Object> out = new Map<String, Object>();
      out.put('id', saved.id);
      out.put('name', saved.name);
      out.put('templateId', saved.templateId);
      out.put('templateVersionId', saved.templateVersionId);
      out.put('recordId', saved.recordId);
      out.put('objectApiName', saved.objectApiName);
      out.put('status', saved.status);
      out.put('completedDate', saved.completedDate);
      // Do not echo documentJson — keeps the Aura response small.
      return JSON.serialize(out);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  @AuraEnabled
  public static InstanceDTO saveInstance(InstanceDTO dto) {
    try {
      return saveInstanceImpl(dto);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  private static InstanceDTO saveInstanceImpl(InstanceDTO dto) {
    if (dto == null) {
      throw auraError('Instance payload is required.');
    }
    if (dto.templateId == null) {
      throw auraError('templateId is required.');
    }
    if (String.isBlank(dto.recordId)) {
      throw auraError('recordId is required.');
    }
    if (String.isBlank(dto.objectApiName)) {
      throw auraError('objectApiName is required.');
    }
    if (String.isBlank(dto.documentJson)) {
      throw auraError('documentJson is required.');
    }
    // Long Text Area max — embedded data:image URLs blow this limit quickly.
    Integer jsonLen = dto.documentJson.length();
    if (jsonLen > 131072) {
      throw auraError(
        'Document JSON is too large (' +
          String.valueOf(jsonLen) +
          ' chars; max 131072). Re-upload images so they are stored as Files, not embedded data URLs.'
      );
    }

    DocEngineAccess.assertTemplateAccess(dto.templateId);
    if (dto.id != null) {
      DocEngineAccess.assertDocumentAccess(dto.id);
    }

    DocEngine_Template__c template = [
      SELECT Id, Object_API_Name__c
      FROM DocEngine_Template__c
      WHERE Id = :dto.templateId
      WITH USER_MODE
      LIMIT 1
    ];
    String objectApiName = dto.objectApiName.trim();
    if (
      String.isBlank(template.Object_API_Name__c) ||
      !template.Object_API_Name__c.equalsIgnoreCase(objectApiName)
    ) {
      throw auraError('Document object must match the template object.');
    }
    Id sourceRecordId = assertSourceRecordReadable(dto.recordId, objectApiName);

    DocEngine_Document__c row = dto.id != null
      ? [
          SELECT
            Id,
            Template__c,
            Template_Version__c,
            Record_Id__c,
            Object_API_Name__c,
            Status__c,
            Completed_Date__c
          FROM DocEngine_Document__c
          WHERE Id = :dto.id
          WITH USER_MODE
          LIMIT 1
        ]
      : new DocEngine_Document__c();

    if (dto.id != null) {
      if (
        row.Template__c != dto.templateId ||
        !sameRecordId(row.Record_Id__c, sourceRecordId) ||
        String.isBlank(row.Object_API_Name__c) ||
        !row.Object_API_Name__c.equalsIgnoreCase(objectApiName) ||
        (dto.templateVersionId != null && row.Template_Version__c != dto.templateVersionId)
      ) {
        throw auraError(
          'Existing documents cannot change template, template version, object, or source record.'
        );
      }
    } else {
      row.Template__c = dto.templateId;
      row.Record_Id__c = String.valueOf(sourceRecordId);
      row.Object_API_Name__c = template.Object_API_Name__c;
    }
    row.Document_JSON__c = dto.documentJson;

    // Pin template version on first save; never retarget on later drafts/completes.
    if (row.Template_Version__c == null) {
      row.Template_Version__c = DocEngineTemplateVersionService.resolveVersionId(
        dto.templateId,
        dto.templateVersionId
      );
    } else {
      DocEngineTemplateVersionService.resolveVersionId(
        dto.templateId,
        row.Template_Version__c
      );
    }

    String status = String.isBlank(dto.status) ? 'Draft' : dto.status.trim();
    row.Status__c = status;
    if (status == 'Completed' && row.Completed_Date__c == null) {
      row.Completed_Date__c = System.now();
    }
    if (dto.completedDate != null) {
      row.Completed_Date__c = dto.completedDate;
    }

    SObjectAccessDecision decision = Security.stripInaccessible(
      AccessType.UPSERTABLE,
      new List<DocEngine_Document__c>{ row }
    );
    List<DocEngine_Document__c> safe = (List<DocEngine_Document__c>) decision.getRecords();
    if (safe == null || safe.isEmpty()) {
      throw auraError(
        'Insufficient access to save document instances. Assign the DocEngine User or DocEngine Admin permission set.'
      );
    }
    try {
      Database.upsert(safe, AccessLevel.USER_MODE);
    } catch (DmlException e) {
      throw auraError(e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage());
    }
    if (safe[0].Id == null) {
      throw auraError('Document save did not return an Id.');
    }

    // Return a lightweight DTO — callers only need id/status after save.
    // Avoid getInstance() here: a user-mode re-query failure used to
    // surface as a cryptic Aura "internal server error" after a successful upsert.
    InstanceDTO out = new InstanceDTO();
    out.id = safe[0].Id;
    out.name = dto.name;
    out.templateId = dto.templateId;
    out.templateVersionId = row.Template_Version__c != null
      ? row.Template_Version__c
      : dto.templateVersionId;
    out.recordId = row.Record_Id__c;
    out.objectApiName = row.Object_API_Name__c;
    out.documentJson = dto.documentJson;
    out.status = status;
    out.completedDate = row.Completed_Date__c != null ? row.Completed_Date__c : dto.completedDate;
    return out;
  }

  /**
   * Upload a field image as ContentVersion (optionally linked to recordId) and return a URL
   * suitable for &lt;img src&gt;. Prefers Content Delivery download URL; falls back to
   * authenticated shepherd download URL.
   */
  @AuraEnabled
  public static ImageUploadResult uploadFieldImage(
    String recordId,
    String base64Data,
    String filename
  ) {
    try {
      return uploadFieldImageImpl(recordId, base64Data, filename);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  private static ImageUploadResult uploadFieldImageImpl(
    String recordId,
    String base64Data,
    String filename
  ) {
    if (String.isBlank(base64Data)) {
      throw auraError('base64Data is required.');
    }
    String raw = base64Data.trim();
    Integer comma = raw.indexOf(',');
    if (raw.startsWithIgnoreCase('data:') && comma > 0) {
      raw = raw.substring(comma + 1);
    }
    Blob body;
    try {
      body = EncodingUtil.base64Decode(raw);
    } catch (Exception e) {
      throw auraError('Invalid image data.');
    }
    if (body == null || body.size() == 0) {
      throw auraError('Image data is empty.');
    }
    // Keep headroom under synchronous Apex heap for base64 round-trips.
    if (body.size() > 3500000) {
      throw auraError('Image is too large (max ~3.5 MB). Use a smaller file.');
    }

    filename = normalizeFilename(filename, 'image.png', null);
    String lower = filename.toLowerCase();
    if (
      !(
        lower.endsWith('.png') ||
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.gif') ||
        lower.endsWith('.webp') ||
        lower.endsWith('.svg')
      )
    ) {
      filename = normalizeFilename(filename + '.png', 'image.png', '.png');
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

    Id parentId = null;
    if (String.isNotBlank(recordId)) {
      try {
        parentId = Id.valueOf(recordId.trim());
      } catch (Exception e) {
        parentId = null;
      }
    }
    if (parentId != null) {
      assertSourceRecordReadable(parentId);
      cv.FirstPublishLocationId = parentId;
    }
    assertContentVersionCreateAccess(parentId != null, false);
    try {
      List<ContentVersion> safeVersions = sanitizeContentVersions(
        new List<ContentVersion>{ cv }
      );
      Database.insert(safeVersions, AccessLevel.USER_MODE);
      cv = safeVersions[0];
    } catch (DmlException e) {
      throw auraError(e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage());
    }

    cv = [
      SELECT Id, ContentDocumentId
      FROM ContentVersion
      WHERE Id = :cv.Id
      WITH USER_MODE
      LIMIT 1
    ];

    ImageUploadResult out = new ImageUploadResult();
    out.contentVersionId = cv.Id;
    out.contentDocumentId = cv.ContentDocumentId;
    out.url = authenticatedVersionDownloadUrl(cv.Id);
    return out;
  }

  /**
   * Image Files linked to a Salesforce record (Notes &amp; Attachments / Files related list).
   * Newest first; capped at 50.
   */
  @AuraEnabled(cacheable=true)
  public static List<RecordImageItem> listRecordImages(String recordId) {
    if (String.isBlank(recordId)) {
      throw new AuraHandledException('recordId is required.');
    }
    Id parentId;
    try {
      parentId = Id.valueOf(recordId.trim());
    } catch (Exception e) {
      throw new AuraHandledException('Invalid recordId.');
    }

    List<ContentDocumentLink> links = [
      SELECT ContentDocumentId
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :parentId
      WITH USER_MODE
    ];
    if (links.isEmpty()) {
      return new List<RecordImageItem>();
    }

    Set<Id> docIds = new Set<Id>();
    for (ContentDocumentLink link : links) {
      docIds.add(link.ContentDocumentId);
    }

    List<ContentVersion> versions = [
      SELECT Id, ContentDocumentId, Title, FileExtension, ContentModifiedDate
      FROM ContentVersion
      WHERE ContentDocumentId IN :docIds AND IsLatest = TRUE
      WITH USER_MODE
      ORDER BY ContentModifiedDate DESC
      LIMIT 200
    ];

    List<RecordImageItem> out = new List<RecordImageItem>();
    for (ContentVersion cv : versions) {
      String ext = String.isBlank(cv.FileExtension) ? '' : cv.FileExtension.toLowerCase();
      if (!IMAGE_EXTENSIONS.contains(ext)) {
        continue;
      }
      RecordImageItem item = new RecordImageItem();
      item.contentDocumentId = cv.ContentDocumentId;
      item.contentVersionId = cv.Id;
      item.title = cv.Title;
      item.fileExtension = ext;
      item.thumbnailUrl =
        System.URL.getOrgDomainUrl().toExternalForm() +
        '/sfc/servlet.shepherd/version/renditionDownload?rendition=THUMB720BY480&versionId=' +
        String.valueOf(cv.Id);
      out.add(item);
      if (out.size() >= 50) {
        break;
      }
    }
    return out;
  }

  /**
   * Resolve an existing ContentVersion to a URL suitable for &lt;img src&gt; (no re-upload).
   */
  @AuraEnabled
  public static ImageUploadResult resolveFieldImage(
    String contentVersionId,
    String sourceRecordId
  ) {
    if (String.isBlank(contentVersionId)) {
      throw new AuraHandledException('contentVersionId is required.');
    }
    Id versionId;
    try {
      versionId = Id.valueOf(contentVersionId.trim());
    } catch (Exception e) {
      throw new AuraHandledException('Invalid contentVersionId.');
    }

    List<ContentVersion> rows = [
      SELECT Id, ContentDocumentId, Title, FileExtension
      FROM ContentVersion
      WHERE Id = :versionId
      WITH USER_MODE
      LIMIT 1
    ];
    if (rows.isEmpty()) {
      throw new AuraHandledException('ContentVersion not found.');
    }
    ContentVersion cv = rows[0];
    assertFileLinkedToAuthorizedRecord(cv.ContentDocumentId, sourceRecordId);
    String ext = String.isBlank(cv.FileExtension) ? '' : cv.FileExtension.toLowerCase();
    if (!IMAGE_EXTENSIONS.contains(ext)) {
      throw new AuraHandledException('Selected file is not an image.');
    }

    ImageUploadResult out = new ImageUploadResult();
    out.contentVersionId = cv.Id;
    out.contentDocumentId = cv.ContentDocumentId;
    out.url = authenticatedVersionDownloadUrl(cv.Id);
    return out;
  }

  private static String authenticatedVersionDownloadUrl(Id contentVersionId) {
    return System.URL.getOrgDomainUrl().toExternalForm() +
      '/sfc/servlet.shepherd/version/download/' +
      String.valueOf(contentVersionId);
  }

  /**
   * Store a PDF against the DocEngine_Document__c and the source record (Files related list).
   */
  @AuraEnabled
  public static PdfSaveResult savePdf(Id docInstanceId, String base64Data, String filename) {
    if (String.isBlank(base64Data)) {
      throw new AuraHandledException('base64Data is required.');
    }
    FileSaveResult file = saveFileFromBlob(
      docInstanceId,
      decodeFileData(base64Data),
      filename,
      'pdf'
    );
    PdfSaveResult result = new PdfSaveResult();
    result.contentVersionId = file.contentVersionId;
    result.contentDocumentId = file.contentDocumentId;
    return result;
  }

  /**
   * Attach a PDF Blob (used by DocEnginePdfController after callout — avoids base64 round-trip).
   */
  public static PdfSaveResult savePdfFromBlob(Id docInstanceId, Blob pdfBlob, String filename) {
    FileSaveResult file = saveFileFromBlob(docInstanceId, pdfBlob, filename, 'pdf');
    PdfSaveResult result = new PdfSaveResult();
    result.contentVersionId = file.contentVersionId;
    result.contentDocumentId = file.contentDocumentId;
    return result;
  }

  /**
   * Attach HTML (base64) to the DocEngine_Document__c and source record Files list.
   */
  @AuraEnabled
  public static FileSaveResult saveHtml(Id docInstanceId, String base64Data, String filename) {
    if (String.isBlank(base64Data)) {
      throw new AuraHandledException('base64Data is required.');
    }
    return saveFileFromBlob(
      docInstanceId,
      decodeFileData(base64Data),
      filename,
      'html'
    );
  }

  /**
   * Save preview artifact to Files and create a Content Delivery public URL when possible.
   * Hosts use this for email / Slack / copy-link share flows.
   */
  @AuraEnabled
  public static SharePrepareResult prepareShare(
    Id docInstanceId,
    String base64Data,
    String filename,
    String format
  ) {
    if (String.isBlank(base64Data)) {
      throw new AuraHandledException('base64Data is required.');
    }
    String kind = String.isBlank(format) ? 'html' : format.trim().toLowerCase();
    if (kind != 'pdf' && kind != 'html') {
      kind = 'html';
    }
    String shareExtension = kind == 'pdf' ? '.pdf' : '.html';
    filename = normalizeFilename(filename, 'document' + shareExtension, null);
    if (!filename.toLowerCase().endsWith(shareExtension)) {
      filename = normalizeFilename(
        filename + shareExtension,
        'document' + shareExtension,
        shareExtension
      );
    }
    FileSaveResult file = saveFileFromBlob(
      docInstanceId,
      decodeFileData(base64Data),
      filename,
      kind
    );

    SharePrepareResult out = new SharePrepareResult();
    out.contentVersionId = file.contentVersionId;
    out.contentDocumentId = file.contentDocumentId;
    out.filename = filename;

    if (!Schema.sObjectType.ContentDistribution.isCreateable()) {
      throw new AuraHandledException(
        'Insufficient access to create a public Salesforce File link.'
      );
    }
    assertCreateableFields(
      Schema.sObjectType.ContentDistribution,
      new Set<String>{
        'Name',
        'ContentVersionId',
        'PreferencesAllowViewInBrowser',
        'PreferencesLinkLatestVersion',
        'PreferencesNotifyOnVisit',
        'PreferencesPasswordRequired',
        'PreferencesAllowOriginalDownload'
      },
      'public Salesforce File link'
    );

    ContentDistribution cd = new ContentDistribution();
    String title = out.filename;
    Integer dot = title.lastIndexOf('.');
    if (dot > 0) {
      title = title.substring(0, dot);
    }
    cd.Name = title.left(100);
    cd.ContentVersionId = file.contentVersionId;
    cd.PreferencesAllowViewInBrowser = true;
    cd.PreferencesLinkLatestVersion = true;
    cd.PreferencesNotifyOnVisit = false;
    cd.PreferencesPasswordRequired = false;
    cd.PreferencesAllowOriginalDownload = false;
    setDistributionExpiryIfSupported(cd);

    SObjectAccessDecision distributionDecision = Security.stripInaccessible(
      AccessType.CREATABLE,
      new List<ContentDistribution>{ cd }
    );
    List<ContentDistribution> safeDistributions =
      (List<ContentDistribution>) distributionDecision.getRecords();
    Database.insert(safeDistributions, AccessLevel.USER_MODE);
    Id distributionId = safeDistributions[0].Id;

    ContentDistribution created = [
      SELECT Id, DistributionPublicUrl, ContentDownloadUrl
      FROM ContentDistribution
      WHERE Id = :distributionId
      WITH USER_MODE
      LIMIT 1
    ];
    out.publicUrl = String.isNotBlank(created.DistributionPublicUrl)
      ? created.DistributionPublicUrl
      : created.ContentDownloadUrl;
    return out;
  }

  /**
   * Email the saved file (ContentVersion) to one or more addresses.
   * When createTask is true and docInstanceId resolves to a parent Record_Id__c,
   * inserts a Completed Task on that parent (Account, Sales Order, etc.).
   * Requires org email deliverability; fails with a clear AuraHandledException otherwise.
   */
  @AuraEnabled
  public static void sendShareEmail(
    Id contentVersionId,
    String toAddresses,
    String subject,
    String body,
    Boolean createTask,
    Id docInstanceId
  ) {
    if (contentVersionId == null) {
      throw new AuraHandledException('contentVersionId is required.');
    }
    if (String.isBlank(toAddresses)) {
      throw new AuraHandledException('At least one recipient email is required.');
    }

    List<String> recipients = new List<String>();
    for (String part : toAddresses.split('[,;]')) {
      String email = part == null ? '' : part.trim();
      if (String.isNotBlank(email)) {
        recipients.add(email);
      }
    }
    if (recipients.isEmpty()) {
      throw new AuraHandledException('At least one recipient email is required.');
    }
    if (recipients.size() > 10) {
      throw new AuraHandledException('Too many recipients (max 10).');
    }
    if (createTask == true) {
      assertTaskCreateAccess();
    }

    if (docInstanceId == null) {
      throw new AuraHandledException('docInstanceId is required.');
    }
    DocEngineAccess.assertDocumentAccess(docInstanceId);
    DocEngine_Document__c instance = [
      SELECT Id, Record_Id__c, Content_Document_Id__c
      FROM DocEngine_Document__c
      WHERE Id = :docInstanceId
      WITH USER_MODE
      LIMIT 1
    ];

    ContentVersion cvMetadata = [
      SELECT Id, ContentDocumentId, Title, PathOnClient, FileExtension, ContentSize
      FROM ContentVersion
      WHERE Id = :contentVersionId
      WITH USER_MODE
      LIMIT 1
    ];
    if (!isAuthorizedShareFile(cvMetadata.ContentDocumentId, instance)) {
      throw new AuraHandledException(
        'The selected file is not attached to this document or its source record.'
      );
    }
    if (
      cvMetadata.ContentSize != null &&
      cvMetadata.ContentSize > MAX_EMAIL_ATTACHMENT_BYTES
    ) {
      throw new AuraHandledException(
        'File is too large to email (max ~3.5 MB). Share a public link instead.'
      );
    }
    ContentVersion cv = [
      SELECT Id, Title, PathOnClient, VersionData, FileExtension
      FROM ContentVersion
      WHERE Id = :contentVersionId
      WITH USER_MODE
      LIMIT 1
    ];

    Messaging.EmailFileAttachment attachment = new Messaging.EmailFileAttachment();
    String fileName = normalizeFilename(
      String.isNotBlank(cv.PathOnClient) ? cv.PathOnClient : (cv.Title + '.bin'),
      'document.bin',
      null
    );
    attachment.setFileName(fileName);
    attachment.setBody(cv.VersionData);
    String ext = String.isBlank(cv.FileExtension) ? '' : cv.FileExtension.toLowerCase();
    if (ext == 'pdf') {
      attachment.setContentType('application/pdf');
    } else if (ext == 'html' || ext == 'htm') {
      attachment.setContentType('text/html');
    }

    String resolvedSubject = (String.isBlank(subject) ? fileName : subject.trim()).left(255);
    String resolvedBody = String.isBlank(body)
      ? 'Please find the attached document.'
      : body;

    Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
    mail.setToAddresses(recipients);
    mail.setSubject(resolvedSubject);
    mail.setPlainTextBody(resolvedBody);
    mail.setFileAttachments(new List<Messaging.EmailFileAttachment>{ attachment });
    mail.setSaveAsActivity(false);

    try {
      Messaging.SendEmailResult[] results = Messaging.sendEmail(
        new List<Messaging.SingleEmailMessage>{ mail },
        false
      );
      if (results == null || results.isEmpty() || !results[0].isSuccess()) {
        String err = 'Email send failed.';
        if (results != null && !results.isEmpty() && results[0].getErrors() != null && !results[0].getErrors().isEmpty()) {
          err = results[0].getErrors()[0].getMessage();
        }
        throw new AuraHandledException(err);
      }
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw new AuraHandledException(
        'Email send failed: ' + e.getMessage() +
        ' Check Deliverability (Setup → Email → Deliverability) and that outbound email is allowed.'
      );
    }

    if (createTask == true) {
      createShareEmailTask(docInstanceId, recipients, resolvedSubject, resolvedBody);
    }
  }

  /**
   * Creates a Completed Task on the document's parent record (Record_Id__c).
   * No-ops when parent is missing or Activities are not allowed on that object.
   */
  private static void createShareEmailTask(
    Id docInstanceId,
    List<String> recipients,
    String subject,
    String body
  ) {
    if (docInstanceId == null) {
      return;
    }
    DocEngineAccess.assertDocumentAccess(docInstanceId);

    DocEngine_Document__c instance = [
      SELECT Id, Record_Id__c
      FROM DocEngine_Document__c
      WHERE Id = :docInstanceId
      WITH USER_MODE
      LIMIT 1
    ];
    if (String.isBlank(instance.Record_Id__c)) {
      return;
    }

    Id whatId;
    try {
      whatId = Id.valueOf(instance.Record_Id__c);
    } catch (Exception e) {
      return;
    }

    Schema.DescribeSObjectResult parentDescribe = whatId.getSObjectType().getDescribe();
    // Activities are enabled when LastActivityDate is present (no Describe isActivityEnabled API).
    if (!parentDescribe.fields.getMap().containsKey('LastActivityDate')) {
      return;
    }
    assertTaskCreateAccess();

    Task t = new Task();
    t.Subject = ('Email: ' + subject).left(255);
    t.Description =
      'To: ' + String.join(recipients, ', ') + '\n\n' + (body == null ? '' : body);
    t.Status = 'Completed';
    t.Priority = 'Normal';
    t.ActivityDate = Date.today();
    t.WhatId = whatId;
    t.OwnerId = UserInfo.getUserId();
    if (Schema.sObjectType.Task.fields.TaskSubtype.isCreateable()) {
      t.TaskSubtype = 'Email';
    }

    SObjectAccessDecision decision = Security.stripInaccessible(
      AccessType.CREATABLE,
      new List<Task>{ t }
    );
    List<Task> safeTasks = (List<Task>) decision.getRecords();
    Database.insert(safeTasks, AccessLevel.USER_MODE);
  }

  /**
   * Attach a file Blob to the instance + source record.
   * When Content_Document_Id__c is set and still valid, inserts a new ContentVersion
   * on that document (edit/revise). Otherwise creates a new ContentDocument and stores its Id.
   * @param fileKind 'pdf' | 'html' — drives PathOnClient extension / MIME expectations.
   */
  public static FileSaveResult saveFileFromBlob(
    Id docInstanceId,
    Blob fileBlob,
    String filename,
    String fileKind
  ) {
    if (docInstanceId == null) {
      throw new AuraHandledException('docInstanceId is required.');
    }
    DocEngineAccess.assertDocumentAccess(docInstanceId);
    if (fileBlob == null || fileBlob.size() == 0) {
      throw new AuraHandledException('File data is required.');
    }
    if (fileBlob.size() > MAX_FILE_BYTES) {
      throw new AuraHandledException('File is too large (max ~4.5 MB).');
    }
    String kind = String.isBlank(fileKind) ? 'pdf' : fileKind.trim().toLowerCase();
    String ext = kind == 'html' ? '.html' : '.pdf';
    filename = normalizeFilename(filename, 'document' + ext, null);
    if (!filename.toLowerCase().endsWith(ext)) {
      filename = normalizeFilename(filename + ext, 'document' + ext, ext);
    }

    DocEngine_Document__c instance = [
      SELECT Id, Record_Id__c, Name, Content_Document_Id__c
      FROM DocEngine_Document__c
      WHERE Id = :docInstanceId
      WITH USER_MODE
      LIMIT 1
    ];

    Id existingDocId = resolveExistingContentDocumentId(instance.Content_Document_Id__c);

    ContentVersion cv = new ContentVersion();
    String title = filename;
    Integer dot = title.lastIndexOf('.');
    if (dot > 0) {
      title = title.substring(0, dot);
    }
    cv.Title = title;
    cv.PathOnClient = filename;
    cv.VersionData = fileBlob;
    if (existingDocId != null) {
      cv.ContentDocumentId = existingDocId;
    } else {
      cv.FirstPublishLocationId = instance.Id;
    }
    assertContentVersionCreateAccess(existingDocId == null, existingDocId != null);
    List<ContentVersion> safeVersions = sanitizeContentVersions(
      new List<ContentVersion>{ cv }
    );
    Database.insert(safeVersions, AccessLevel.USER_MODE);
    cv = safeVersions[0];

    cv = [
      SELECT Id, ContentDocumentId
      FROM ContentVersion
      WHERE Id = :cv.Id
      WITH USER_MODE
      LIMIT 1
    ];

    // Link to the source record so the file appears under Files / Notes & Attachments.
    if (String.isNotBlank(instance.Record_Id__c)) {
      Id parentId;
      try {
        parentId = Id.valueOf(instance.Record_Id__c);
      } catch (Exception e) {
        parentId = null;
      }
      if (parentId != null) {
        assertSourceRecordReadable(parentId);
        List<ContentDocumentLink> existing = [
          SELECT Id
          FROM ContentDocumentLink
          WHERE ContentDocumentId = :cv.ContentDocumentId AND LinkedEntityId = :parentId
          WITH USER_MODE
          LIMIT 1
        ];
        if (existing.isEmpty()) {
          assertContentDocumentLinkCreateAccess();
          ContentDocumentLink link = new ContentDocumentLink();
          link.ContentDocumentId = cv.ContentDocumentId;
          link.LinkedEntityId = parentId;
          link.ShareType = 'V';
          link.Visibility = 'AllUsers';
          SObjectAccessDecision linkDecision = Security.stripInaccessible(
            AccessType.CREATABLE,
            new List<ContentDocumentLink>{ link }
          );
          List<ContentDocumentLink> safeLinks =
            (List<ContentDocumentLink>) linkDecision.getRecords();
          Database.insert(safeLinks, AccessLevel.USER_MODE);
        }
      }
    }

    String newDocId = String.valueOf(cv.ContentDocumentId);
    if (instance.Content_Document_Id__c != newDocId) {
      DocEngine_Document__c patch = new DocEngine_Document__c(
        Id = instance.Id,
        Content_Document_Id__c = newDocId
      );
      SObjectAccessDecision decision = Security.stripInaccessible(
        AccessType.UPDATABLE,
        new List<DocEngine_Document__c>{ patch }
      );
      Database.update(decision.getRecords(), AccessLevel.USER_MODE);
    }

    FileSaveResult result = new FileSaveResult();
    result.contentVersionId = cv.Id;
    result.contentDocumentId = cv.ContentDocumentId;
    return result;
  }

  private static Id resolveExistingContentDocumentId(String rawId) {
    if (String.isBlank(rawId)) {
      return null;
    }
    Id docId;
    try {
      docId = Id.valueOf(rawId.trim());
    } catch (Exception e) {
      return null;
    }
    List<ContentDocument> docs = [
      SELECT Id
      FROM ContentDocument
      WHERE Id = :docId
      WITH USER_MODE
      LIMIT 1
    ];
    return docs.isEmpty() ? null : docs[0].Id;
  }

  private static void assertFileLinkedToAuthorizedRecord(
    Id contentDocumentId,
    String sourceRecordId
  ) {
    Id sourceId;
    if (String.isNotBlank(sourceRecordId)) {
      try {
        sourceId = Id.valueOf(sourceRecordId.trim());
      } catch (Exception e) {
        throw new AuraHandledException('Invalid sourceRecordId.');
      }
    }

    List<ContentDocumentLink> links = [
      SELECT LinkedEntityId
      FROM ContentDocumentLink
      WHERE ContentDocumentId = :contentDocumentId
      WITH USER_MODE
    ];
    Set<Id> documentInstanceIds = new Set<Id>();
    for (ContentDocumentLink link : links) {
      if (sourceId != null && link.LinkedEntityId == sourceId) {
        return;
      }
      if (
        link.LinkedEntityId != null &&
        link.LinkedEntityId.getSObjectType() == DocEngine_Document__c.SObjectType
      ) {
        documentInstanceIds.add(link.LinkedEntityId);
      }
    }
    if (!documentInstanceIds.isEmpty()) {
      List<DocEngine_Document__c> documents = [
        SELECT Template__r.Access_Group_Id__c
        FROM DocEngine_Document__c
        WHERE Id IN :documentInstanceIds
        WITH USER_MODE
      ];
      for (DocEngine_Document__c document : documents) {
        String groupId = document.Template__r == null
          ? null
          : document.Template__r.Access_Group_Id__c;
        if (DocEngineAccess.canAccessByGroup(groupId)) {
          return;
        }
      }
    }
    throw new AuraHandledException(
      'The selected file is not linked to the supplied source record or an accessible DocEngine document.'
    );
  }

  private static Boolean isAuthorizedShareFile(
    Id contentDocumentId,
    DocEngine_Document__c instance
  ) {
    if (
      String.isNotBlank(instance.Content_Document_Id__c) &&
      instance.Content_Document_Id__c.trim() == String.valueOf(contentDocumentId)
    ) {
      return true;
    }
    Set<Id> authorizedParents = new Set<Id>{ instance.Id };
    if (String.isNotBlank(instance.Record_Id__c)) {
      try {
        authorizedParents.add(Id.valueOf(instance.Record_Id__c.trim()));
      // A malformed legacy source Id is denied by excluding it from authorizedParents.
      // Code-analyzer-suppress(pmd:EmptyCatchBlock)
      } catch (Exception e) {
        // Intentionally empty: fail closed; only successfully parsed Ids authorize access.
      }
      // Code-analyzer-unsuppress(pmd:EmptyCatchBlock)
    }
    List<ContentDocumentLink> links = [
      SELECT Id
      FROM ContentDocumentLink
      WHERE
        ContentDocumentId = :contentDocumentId
        AND LinkedEntityId IN :authorizedParents
      WITH USER_MODE
      LIMIT 1
    ];
    return !links.isEmpty();
  }

  private static Blob decodeFileData(String base64Data) {
    try {
      Blob decoded = EncodingUtil.base64Decode(base64Data.trim());
      if (decoded == null || decoded.size() == 0) {
        throw new AuraHandledException('File data is required.');
      }
      return decoded;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw new AuraHandledException('Invalid base64 file data.');
    }
  }

  private static String normalizeFilename(
    String filename,
    String fallback,
    String requiredSuffix
  ) {
    String safe = String.isBlank(filename) ? fallback : filename.trim();
    safe = safe.replace('\\', '_').replace('/', '_');
    safe = safe.replaceAll('[\\x00-\\x1F\\x7F]', '_');
    if (String.isBlank(safe) || safe == '.' || safe == '..') {
      safe = fallback;
    }
    if (safe.length() > MAX_FILENAME_LENGTH) {
      Integer suffixLength = String.isBlank(requiredSuffix) ? 0 : requiredSuffix.length();
      safe = safe.left(MAX_FILENAME_LENGTH - suffixLength);
      if (suffixLength > 0 && !safe.toLowerCase().endsWith(requiredSuffix)) {
        safe += requiredSuffix;
      }
    }
    return safe;
  }

  private static void assertContentVersionCreateAccess(
    Boolean needsFirstPublishLocation,
    Boolean needsContentDocument
  ) {
    if (!Schema.sObjectType.ContentVersion.isCreateable()) {
      throw new AuraHandledException('Insufficient access to create Salesforce Files.');
    }
    Set<String> fields = new Set<String>{ 'Title', 'PathOnClient', 'VersionData' };
    if (needsFirstPublishLocation) {
      fields.add('FirstPublishLocationId');
      assertContentDocumentLinkCreateAccess();
    }
    if (needsContentDocument) {
      fields.add('ContentDocumentId');
    }
    assertCreateableFields(
      Schema.sObjectType.ContentVersion,
      fields,
      'Salesforce File'
    );
  }

  private static void assertContentDocumentLinkCreateAccess() {
    if (!Schema.sObjectType.ContentDocumentLink.isCreateable()) {
      throw new AuraHandledException(
        'Insufficient access to link the Salesforce File.'
      );
    }
    assertCreateableFields(
      Schema.sObjectType.ContentDocumentLink,
      new Set<String>{
        'ContentDocumentId',
        'LinkedEntityId',
        'ShareType',
        'Visibility'
      },
      'Salesforce File link'
    );
  }

  /**
   * Proves both Id/object consistency and running-user row visibility before a
   * document or Salesforce File is associated with a source record.
   */
  @TestVisible
  private static Id assertSourceRecordReadable(String recordId, String objectApiName) {
    Id sourceId;
    try {
      sourceId = Id.valueOf(recordId == null ? null : recordId.trim());
    } catch (Exception e) {
      throw new AuraHandledException('Invalid source record Id.');
    }
    if (sourceId == null || String.isBlank(objectApiName)) {
      throw new AuraHandledException('Source record and object are required.');
    }
    String actualObject = sourceId.getSObjectType().getDescribe().getName();
    if (!actualObject.equalsIgnoreCase(objectApiName.trim())) {
      throw new AuraHandledException('Source record Id does not match the configured object.');
    }
    assertSourceRecordReadable(sourceId);
    return sourceId;
  }

  private static void assertSourceRecordReadable(Id sourceId) {
    if (sourceId == null) {
      throw new AuraHandledException('Invalid source record Id.');
    }
    Schema.DescribeSObjectResult describe = sourceId.getSObjectType().getDescribe();
    if (!describe.isAccessible()) {
      throw new AuraHandledException('You do not have read access to the source record.');
    }
    List<SObject> rows = Database.queryWithBinds(
      'SELECT Id FROM ' + describe.getName() + ' WHERE Id = :sourceId LIMIT 1',
      new Map<String, Object>{ 'sourceId' => sourceId },
      AccessLevel.USER_MODE
    );
    if (rows.isEmpty()) {
      throw new AuraHandledException('Source record not found or is not accessible.');
    }
  }

  private static Boolean sameRecordId(String storedId, Id requestedId) {
    if (String.isBlank(storedId) || requestedId == null) {
      return false;
    }
    try {
      return Id.valueOf(storedId.trim()) == requestedId;
    } catch (Exception e) {
      return false;
    }
  }

  private static void assertTaskCreateAccess() {
    if (!Schema.sObjectType.Task.isCreateable()) {
      throw new AuraHandledException('Insufficient access to create a Task.');
    }
    assertCreateableFields(
      Schema.sObjectType.Task,
      new Set<String>{
        'Subject',
        'Description',
        'Status',
        'Priority',
        'ActivityDate',
        'WhatId',
        'OwnerId'
      },
      'Task'
    );
  }

  private static List<ContentVersion> sanitizeContentVersions(
    List<ContentVersion> versions
  ) {
    SObjectAccessDecision decision = Security.stripInaccessible(
      AccessType.CREATABLE,
      versions
    );
    return (List<ContentVersion>) decision.getRecords();
  }

  private static void assertCreateableFields(
    Schema.DescribeSObjectResult objectDescribe,
    Set<String> fieldNames,
    String label
  ) {
    Map<String, Schema.SObjectField> fields = objectDescribe.fields.getMap();
    for (String fieldName : fieldNames) {
      if (
        !fields.containsKey(fieldName) ||
        !fields.get(fieldName).getDescribe().isCreateable()
      ) {
        throw new AuraHandledException(
          'Insufficient field access to create ' + label + '.'
        );
      }
    }
  }

  private static void setDistributionExpiryIfSupported(ContentDistribution distribution) {
    Map<String, Schema.SObjectField> fields =
      Schema.sObjectType.ContentDistribution.fields.getMap();
    if (
      fields.containsKey('PreferencesExpires') &&
      fields.get('PreferencesExpires').getDescribe().isCreateable()
    ) {
      distribution.put('PreferencesExpires', true);
    }
    if (
      fields.containsKey('ExpiryDate') &&
      fields.get('ExpiryDate').getDescribe().isCreateable()
    ) {
      distribution.put('ExpiryDate', Datetime.now().addDays(SHARE_EXPIRY_DAYS));
    }
  }

  @TestVisible
  private static String contentDocumentViewUrl(String contentDocumentId) {
    if (String.isBlank(contentDocumentId)) {
      return null;
    }
    return '/lightning/r/ContentDocument/' + contentDocumentId.trim() + '/view';
  }

  private static InstanceDTO toDto(DocEngine_Document__c row) {
    InstanceDTO dto = new InstanceDTO();
    dto.id = row.Id;
    dto.name = row.Name;
    dto.templateId = row.Template__c;
    dto.templateVersionId = row.Template_Version__c;
    if (row.Template_Version__r != null) {
      dto.templateJson = row.Template_Version__r.Template_JSON__c;
      dto.templateVersion = row.Template_Version__r.Version__c;
    }
    dto.recordId = row.Record_Id__c;
    dto.objectApiName = row.Object_API_Name__c;
    dto.documentJson = row.Document_JSON__c;
    dto.status = row.Status__c;
    dto.completedDate = row.Completed_Date__c;
    return dto;
  }

  @TestVisible
  private static InstanceDTO parseInstanceDto(String dtoJson) {
    if (String.isBlank(dtoJson)) {
      throw auraError('Instance payload is required.');
    }
    Map<String, Object> raw;
    try {
      raw = (Map<String, Object>) JSON.deserializeUntyped(dtoJson);
    } catch (Exception e) {
      throw auraError('Invalid instance payload JSON.');
    }
    if (raw == null) {
      throw auraError('Instance payload is required.');
    }
    InstanceDTO dto = new InstanceDTO();
    dto.name = (String) raw.get('name');
    dto.recordId = raw.get('recordId') == null ? null : String.valueOf(raw.get('recordId'));
    dto.objectApiName = (String) raw.get('objectApiName');
    dto.documentJson = (String) raw.get('documentJson');
    dto.status = (String) raw.get('status');
    dto.id = toId(raw.get('id'));
    dto.templateId = toId(raw.get('templateId'));
    dto.templateVersionId = toId(raw.get('templateVersionId'));
    Object completed = raw.get('completedDate');
    if (completed != null && String.isNotBlank(String.valueOf(completed))) {
      try {
        dto.completedDate = Datetime.valueOfGmt(String.valueOf(completed).replace('T', ' ').replace('Z', ''));
      } catch (Exception e) {
        try {
          dto.completedDate = (Datetime) JSON.deserialize(
            '"' + String.valueOf(completed) + '"',
            Datetime.class
          );
        } catch (Exception e2) {
          dto.completedDate = null;
        }
      }
    }
    return dto;
  }

  private static Id toId(Object value) {
    if (value == null) {
      return null;
    }
    String s = String.valueOf(value).trim();
    if (String.isBlank(s) || s == 'null' || s == 'undefined') {
      return null;
    }
    try {
      return Id.valueOf(s);
    } catch (Exception e) {
      throw auraError('Invalid Id value: ' + s);
    }
  }

  /**
   * AuraHandledException must call setMessage or Lightning often shows a generic
   * "An internal server error has occurred" instead of the real message.
   */
  private static AuraHandledException auraError(String message) {
    String msg = String.isBlank(message) ? 'DocEngine request failed.' : message;
    AuraHandledException e = new AuraHandledException(msg);
    e.setMessage(msg);
    return e;
  }

  private static AuraHandledException auraError(Exception e) {
    if (e == null) {
      return auraError('DocEngine request failed.');
    }
    String msg = e.getMessage();
    if (String.isBlank(msg)) {
      msg = e.getTypeName();
    }
    return auraError(msg);
  }
}
