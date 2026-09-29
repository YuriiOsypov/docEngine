/**
 * DocEngine core facade for PDF.
 *
 * Provider is selected via Hierarchy Custom Setting DocEngine_Settings__c.Use_External_PDF__c:
 *   unchecked — Blob.toPdf(html) in-org (Salesforce)
 *   checked   — DocEnginePdfCallout → Named Credential DocEngine_Pdf → POST /api/v1/render/pdf
 *
 * Default when unset: Salesforce (checkbox false).
 */
public with sharing class DocEnginePdfController {
  private static final String CALLOUT_CLASS = 'DocEnginePdfCallout';
  private static final String CALLOUT_NAMESPACE = 'docengine';
  @TestVisible
  private static final String PROVIDER_SALESFORCE = 'Salesforce';
  @TestVisible
  private static final String PROVIDER_EXTERNAL = 'External';

  public class PdfGenerateResult {
    @AuraEnabled public Id contentVersionId;
    @AuraEnabled public Id contentDocumentId;
    @AuraEnabled public Id docInstanceId;
  }

  /**
   * Active PDF provider: Salesforce | External.
   * Cacheable for LWC; unset setting defaults to Salesforce.
   */
  @AuraEnabled(cacheable=true)
  public static String getPdfProvider() {
    return resolveProvider();
  }

  /**
   * True when the active provider can generate PDFs.
   * Salesforce: always. External: DocEnginePdfCallout must be installed.
   */
  @AuraEnabled(cacheable=true)
  public static Boolean isAvailable() {
    if (resolveProvider() == PROVIDER_SALESFORCE) {
      return true;
    }
    return resolveCalloutType() != null;
  }

  /**
   * Preview / download PDF.
   * Salesforce: pass html (documentJson ignored). External: pass documentJson.
   */
  public static String generatePdfBase64(String documentJson, String html) {
    return generatePdfBase64(documentJson, html, null);
  }

  /**
   * Preview / download PDF. External: pass documentJson and optional templateJson
   * when documentJson is values-only (`kind: field`).
   */
  @AuraEnabled
  public static String generatePdfBase64(String documentJson, String html, String templateJson) {
    if (resolveProvider() == PROVIDER_SALESFORCE) {
      Blob pdf = htmlToPdf(html);
      return EncodingUtil.base64Encode(pdf);
    }
    Object result = invoke(
      'generatePdfBase64',
      new Map<String, Object>{
        'documentJson' => documentJson,
        'templateJson' => templateJson
      }
    );
    return result == null ? null : String.valueOf(result);
  }

  /**
   * HTTPS/relative URL for in-modal PDF iframe (LWS blocks blob: iframe.src).
   * Salesforce: pass html. External: pass documentJson.
   */
  @AuraEnabled
  public static String generatePdfPreviewUrl(String documentJson, String html) {
    if (resolveProvider() == PROVIDER_SALESFORCE) {
      return storePreviewAndGetUrl(htmlToPdf(html));
    }
    Object result = invoke(
      'generatePdfPreviewUrl',
      new Map<String, Object>{
        'documentJson' => documentJson,
        'templateJson' => null
      }
    );
    return result == null ? null : String.valueOf(result);
  }

  /**
   * Generate a PDF for a saved DocEngine_Document__c and attach it.
   * Salesforce mode requires html from the LWC (exportPreviewHtml / buildPreviewHtmlDocument).
   */
  @AuraEnabled
  public static PdfGenerateResult generateAndSavePdf(Id docInstanceId, String html) {
    if (resolveProvider() == PROVIDER_SALESFORCE) {
      return generateAndSaveSalesforce(docInstanceId, html);
    }
    Object raw = invoke('generateAndSavePdf', new Map<String, Object>{
      'docInstanceId' => docInstanceId
    });
    return coerceGenerateResult(raw, docInstanceId);
  }

  @TestVisible
  private static String resolveProvider() {
    DocEngine_Settings__c settings = DocEngine_Settings__c.getInstance();
    if (settings != null && settings.Use_External_PDF__c == true) {
      return PROVIDER_EXTERNAL;
    }
    return PROVIDER_SALESFORCE;
  }

  private static PdfGenerateResult generateAndSaveSalesforce(Id docInstanceId, String html) {
    if (docInstanceId == null) {
      throw new AuraHandledException('docInstanceId is required.');
    }
    Blob pdfBlob = htmlToPdf(html);

    DocEngine_Document__c instance = [
      SELECT
        Id,
        Name,
        Template__r.PDF_Filename__c,
        Template__r.Name
      FROM DocEngine_Document__c
      WHERE Id = :docInstanceId
      WITH USER_MODE
      LIMIT 1
    ];

    String filename = resolveFilename(instance);
    DocEngineInstanceController.PdfSaveResult saved = DocEngineInstanceController.savePdfFromBlob(
      instance.Id,
      pdfBlob,
      filename
    );

    PdfGenerateResult result = new PdfGenerateResult();
    result.contentVersionId = saved.contentVersionId;
    result.contentDocumentId = saved.contentDocumentId;
    result.docInstanceId = instance.Id;
    return result;
  }

  @TestVisible
  private static Blob htmlToPdf(String html) {
    if (String.isBlank(html)) {
      throw new AuraHandledException(
        'HTML is required for Salesforce PDF. Export preview HTML from the editor before generating.'
      );
    }
    // Salesforce native HTML→PDF engine (same family as Visualforce renderAs="pdf").
    return Blob.toPdf(html);
  }

  @TestVisible
  private static String storePreviewAndGetUrl(Blob pdfBlob) {
    if (pdfBlob == null || pdfBlob.size() == 0) {
      throw new AuraHandledException('PDF preview data is required.');
    }
    if (pdfBlob.size() > 4500000) {
      throw new AuraHandledException('PDF preview is too large (max ~4.5 MB).');
    }
    if (!Schema.sObjectType.ContentVersion.isCreateable()) {
      throw new AuraHandledException('Insufficient access to create a PDF preview File.');
    }
    if (!Schema.sObjectType.ContentDocumentLink.isCreateable()) {
      throw new AuraHandledException('Insufficient access to link a PDF preview File.');
    }
    Map<String, Schema.SObjectField> fields =
      Schema.sObjectType.ContentVersion.fields.getMap();
    for (
      String fieldName : new Set<String>{
        'Title',
        'PathOnClient',
        'VersionData',
        'FirstPublishLocationId'
      }
    ) {
      if (
        !fields.containsKey(fieldName) ||
        !fields.get(fieldName).getDescribe().isCreateable()
      ) {
        throw new AuraHandledException(
          'Insufficient field access to create a PDF preview File.'
        );
      }
    }
    Map<String, Schema.SObjectField> linkFields =
      Schema.sObjectType.ContentDocumentLink.fields.getMap();
    for (
      String fieldName : new Set<String>{
        'ContentDocumentId',
        'LinkedEntityId',
        'ShareType',
        'Visibility'
      }
    ) {
      if (
        !linkFields.containsKey(fieldName) ||
        !linkFields.get(fieldName).getDescribe().isCreateable()
      ) {
        throw new AuraHandledException(
          'Insufficient field access to link a PDF preview File.'
        );
      }
    }

    ContentVersion cv = new ContentVersion();
    cv.Title = 'DocEngine Preview';
    cv.PathOnClient = 'docengine-preview.pdf';
    cv.VersionData = pdfBlob;
    cv.FirstPublishLocationId = UserInfo.getUserId();
    SObjectAccessDecision decision = Security.stripInaccessible(
      AccessType.CREATABLE,
      new List<ContentVersion>{ cv }
    );
    List<ContentVersion> safeVersions =
      (List<ContentVersion>) decision.getRecords();
    Database.insert(safeVersions, AccessLevel.USER_MODE);
    return System.URL.getOrgDomainUrl().toExternalForm() +
      '/sfc/servlet.shepherd/version/download/' +
      safeVersions[0].Id;
  }

  private static String resolveFilename(DocEngine_Document__c instance) {
    if (instance.Template__r != null && String.isNotBlank(instance.Template__r.PDF_Filename__c)) {
      return instance.Template__r.PDF_Filename__c;
    }
    if (String.isNotBlank(instance.Name)) {
      return instance.Name + '.pdf';
    }
    return 'document.pdf';
  }

  private static PdfGenerateResult coerceGenerateResult(Object raw, Id fallbackInstanceId) {
    if (raw == null) {
      return null;
    }
    if (raw instanceof PdfGenerateResult) {
      return (PdfGenerateResult) raw;
    }
    if (raw instanceof Map<String, Object>) {
      Map<String, Object> m = (Map<String, Object>) raw;
      PdfGenerateResult result = new PdfGenerateResult();
      result.contentVersionId = (Id) m.get('contentVersionId');
      result.contentDocumentId = (Id) m.get('contentDocumentId');
      Object docId = m.get('docInstanceId');
      result.docInstanceId = docId == null ? fallbackInstanceId : (Id) docId;
      return result;
    }
    throw new AuraHandledException('Unexpected PDF result type: ' + String.valueOf(raw));
  }

  @TestVisible
  private static Type resolveCalloutType() {
    Type t = Type.forName(CALLOUT_CLASS);
    if (t != null) {
      return t;
    }
    t = Type.forName(CALLOUT_NAMESPACE, CALLOUT_CLASS);
    if (t != null) {
      return t;
    }
    return Type.forName(CALLOUT_NAMESPACE + '.' + CALLOUT_CLASS);
  }

  @TestVisible
  private static Object invoke(String action, Map<String, Object> args) {
    Type t = resolveCalloutType();
    if (t == null) {
      throw new AuraHandledException(
        'External PDF is selected but DocEngine_PDF is not installed. ' +
          'Install DocEngine_PDF and configure Named Credential DocEngine_Pdf ' +
          '(DocEngine.pro /api/v1/render/pdf), or uncheck DocEngine Settings → Use External PDF.'
      );
    }
    Object instance = t.newInstance();
    if (!(instance instanceof System.Callable)) {
      throw new AuraHandledException('DocEnginePdfCallout must implement System.Callable.');
    }
    try {
      return ((System.Callable) instance).call(action, args);
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw new AuraHandledException(e.getMessage());
    }
  }
}
