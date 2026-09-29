@IsTest
private class DocEngineValueSetControllerTest {
  private static DocEngine_Template__c makeTemplate() {
    DocEngine_Template__c t = new DocEngine_Template__c(
      Name = 'Value Set Template',
      Object_API_Name__c = 'Account',
      Is_Active__c = true,
      Template_JSON__c = '{"kind":"template","version":2,"fieldSchemas":{},"blocks":[]}',
      Version__c = 1
    );
    insert t;
    return t;
  }

  @IsTest
  static void saveListGetRoundTrip() {
    DocEngine_Template__c t = makeTemplate();
    String valuesJson =
      '{"kind":"field","version":2,"sections":{"Exam":{"notes":"Routine"}}}';

    DocEngineValueSetController.ValueSetDTO dto = new DocEngineValueSetController.ValueSetDTO();
    dto.templateId = t.Id;
    dto.name = 'Standard visit';
    dto.description = 'Baseline pack';
    dto.isActive = true;
    dto.valuesJson = valuesJson;

    Test.startTest();
    DocEngineValueSetController.ValueSetDTO saved = DocEngineValueSetController.saveValueSet(dto);
    System.assertNotEquals(null, saved.id);
    System.assertEquals('Standard visit', saved.name);

    String jsonResult = DocEngineValueSetController.saveValueSetJson(
      JSON.serialize(
        new Map<String, Object>{
          'id' => saved.id,
          'templateId' => t.Id,
          'name' => 'Standard visit v2',
          'description' => 'Updated',
          'isActive' => true,
          'valuesJson' => valuesJson
        }
      )
    );
    Map<String, Object> updated = (Map<String, Object>) JSON.deserializeUntyped(jsonResult);
    System.assertEquals('Standard visit v2', (String) updated.get('name'));

    List<DocEngineValueSetController.ValueSetSummary> listed =
      DocEngineValueSetController.listValueSets(t.Id);
    System.assertEquals(1, listed.size());
    System.assertEquals(saved.id, listed[0].id);

    DocEngineValueSetController.ValueSetDTO loaded = DocEngineValueSetController.getValueSet(
      saved.id
    );
    System.assertEquals(valuesJson, loaded.valuesJson);
    System.assertEquals(t.Id, loaded.templateId);
    Test.stopTest();
  }

  @IsTest
  static void listRequiresTemplateId() {
    Boolean threw = false;
    try {
      DocEngineValueSetController.listValueSets(null);
    } catch (AuraHandledException e) {
      threw = true;
    }
    System.assertEquals(true, threw);
  }

  @IsTest
  static void inactiveNotListed() {
    DocEngine_Template__c t = makeTemplate();
    DocEngineValueSetController.ValueSetDTO dto = new DocEngineValueSetController.ValueSetDTO();
    dto.templateId = t.Id;
    dto.name = 'Hidden';
    dto.isActive = false;
    dto.valuesJson = '{"kind":"field","version":2,"sections":{}}';
    DocEngineValueSetController.saveValueSet(dto);

    List<DocEngineValueSetController.ValueSetSummary> listed =
      DocEngineValueSetController.listValueSets(t.Id);
    System.assertEquals(0, listed.size());
  }
}
