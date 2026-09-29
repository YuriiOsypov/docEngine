@IsTest
private class DocEnginePdfControllerTest {
  @TestSetup
  static void setupData() {
    DocEngine_Template__c tmpl = new DocEngine_Template__c(
      Name = 'PDF Test Template',
      Object_API_Name__c = 'Account',
      Is_Active__c = true,
      Template_JSON__c = '{"kind":"template","blocks":[],"fieldSchemas":{}}',
      PDF_Filename__c = 'out.pdf'
    );
    insert tmpl;

    Account acc = new Account(Name = 'PDF Test Account');
    insert acc;

    insert new DocEngine_Document__c(
      Record_Id__c = acc.Id,
      Object_API_Name__c = 'Account',
      Template__c = tmpl.Id,
      Status__c = 'Draft',
      Document_JSON__c = '{"kind":"field","sections":{}}'
    );
  }

  @IsTest
  static void defaultProviderIsSalesforce() {
    System.assertEquals('Salesforce', DocEnginePdfController.getPdfProvider());
    System.assertEquals(true, DocEnginePdfController.isAvailable());
  }

  @IsTest
  static void salesforceGenerateAndSavePdf() {
    DocEngine_Document__c doc = [SELECT Id FROM DocEngine_Document__c LIMIT 1];
    String html = '<html><body><h1>Hello PDF</h1><p>DocEngine Salesforce provider</p></body></html>';

    Test.startTest();
    DocEnginePdfController.PdfGenerateResult result = DocEnginePdfController.generateAndSavePdf(
      doc.Id,
      html
    );
    Test.stopTest();

    System.assertNotEquals(null, result);
    System.assertNotEquals(null, result.contentVersionId);
    System.assertNotEquals(null, result.contentDocumentId);
    System.assertEquals(doc.Id, result.docInstanceId);
  }

  @IsTest
  static void salesforceGeneratePdfBase64RequiresHtml() {
    Boolean threw = false;
    try {
      DocEnginePdfController.generatePdfBase64('{"kind":"document","blocks":[]}', null);
    } catch (AuraHandledException e) {
      // AuraHandledException.getMessage() is often "Script-thrown exception" in tests.
      threw = true;
    }
    System.assert(threw, 'Expected AuraHandledException when html is blank');
  }

  @IsTest
  static void salesforceGeneratePdfBase64Succeeds() {
    String html = '<html><body>Preview</body></html>';
    Test.startTest();
    String b64 = DocEnginePdfController.generatePdfBase64(null, html);
    Test.stopTest();
    System.assert(String.isNotBlank(b64));
    Blob pdf = EncodingUtil.base64Decode(b64);
    System.assert(pdf.size() > 0);
  }

  @IsTest
  static void salesforcePreviewUsesAuthenticatedFileUrl() {
    Test.startTest();
    String url = DocEnginePdfController.storePreviewAndGetUrl(
      Blob.valueOf('%PDF-1.4 preview')
    );
    Test.stopTest();

    System.assert(
      url.contains('/sfc/servlet.shepherd/version/download/'),
      'preview should use an authenticated Salesforce File URL'
    );
    System.assertEquals(
      0,
      [SELECT COUNT() FROM ContentDistribution],
      'normal PDF preview must not create a public distribution'
    );
  }

  @IsTest
  static void externalProviderRequiresCalloutClass() {
    upsertOrgSetting(true);
    System.assertEquals('External', DocEnginePdfController.getPdfProvider());

    Boolean calloutPresent = Type.forName('DocEnginePdfCallout') != null
      || Type.forName('docengine', 'DocEnginePdfCallout') != null;
    System.assertEquals(calloutPresent, DocEnginePdfController.isAvailable());

    if (calloutPresent) {
      return;
    }

    Boolean threw = false;
    try {
      DocEnginePdfController.generatePdfBase64('{"kind":"document","blocks":[]}', null);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assert(threw, 'Expected install message when External selected without callout');
  }

  @IsTest
  static void isAvailableReflectsProvider() {
    upsertOrgSetting(false);
    System.assertEquals(true, DocEnginePdfController.isAvailable());

    upsertOrgSetting(true);
    System.assertEquals(
      Type.forName('DocEnginePdfCallout') != null
        || Type.forName('docengine', 'DocEnginePdfCallout') != null,
      DocEnginePdfController.isAvailable()
    );
  }

  private static void upsertOrgSetting(Boolean useExternal) {
    DocEngine_Settings__c settings = DocEngine_Settings__c.getOrgDefaults();
    settings.Use_External_PDF__c = useExternal;
    upsert settings;
  }
}
