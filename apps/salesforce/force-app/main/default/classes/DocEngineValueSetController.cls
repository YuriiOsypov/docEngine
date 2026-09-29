/**
 * CRUD for DocEngine_Value_Set__c — reusable scenario packs (unmapped values)
 * applied in fill mode after Salesforce merge.
 */
public with sharing class DocEngineValueSetController {
  private static final Integer MAX_VALUES_JSON_CHARS = 131072;

  public class ValueSetSummary {
    @AuraEnabled public Id id;
    @AuraEnabled public String name;
    @AuraEnabled public String description;
    @AuraEnabled public Boolean isActive;
  }

  public class ValueSetDTO {
    @AuraEnabled public Id id;
    @AuraEnabled public String name;
    @AuraEnabled public Id templateId;
    @AuraEnabled public String description;
    @AuraEnabled public Boolean isActive;
    @AuraEnabled public String valuesJson;
  }

  @AuraEnabled
  public static List<ValueSetSummary> listValueSets(Id templateId) {
    try {
      if (templateId == null) {
        throw auraError('templateId is required.');
      }
      DocEngineAccess.assertTemplateAccess(templateId);
      List<DocEngine_Value_Set__c> rows = [
        SELECT Id, Name, Description__c, Is_Active__c
        FROM DocEngine_Value_Set__c
        WHERE Template__c = :templateId AND Is_Active__c = TRUE
        WITH USER_MODE
        ORDER BY Name ASC
        LIMIT 200
      ];
      List<ValueSetSummary> out = new List<ValueSetSummary>();
      for (DocEngine_Value_Set__c row : rows) {
        ValueSetSummary s = new ValueSetSummary();
        s.id = row.Id;
        s.name = row.Name;
        s.description = row.Description__c;
        s.isActive = row.Is_Active__c == true;
        out.add(s);
      }
      return out;
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  @AuraEnabled
  public static ValueSetDTO getValueSet(Id valueSetId) {
    try {
      if (valueSetId == null) {
        throw auraError('valueSetId is required.');
      }
      List<DocEngine_Value_Set__c> rows = [
        SELECT
          Id,
          Name,
          Template__c,
          Description__c,
          Is_Active__c,
          Values_JSON__c,
          Template__r.Access_Group_Id__c
        FROM DocEngine_Value_Set__c
        WHERE Id = :valueSetId
        WITH USER_MODE
        LIMIT 1
      ];
      if (rows.isEmpty()) {
        throw auraError('Value set not found.');
      }
      DocEngine_Value_Set__c row = rows[0];
      DocEngineAccess.assertGroupAccess(row.Template__r.Access_Group_Id__c);
      return toDto(row);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  /**
   * LWC entry — JSON in/out avoids Aura DTO mapping issues in managed packages.
   * Request keys: id (optional), templateId, name, description, isActive, valuesJson.
   */
  @AuraEnabled
  public static String saveValueSetJson(String dtoJson) {
    try {
      ValueSetDTO saved = saveValueSetImpl(parseDto(dtoJson));
      Map<String, Object> out = new Map<String, Object>();
      out.put('id', saved.id);
      out.put('name', saved.name);
      out.put('templateId', saved.templateId);
      out.put('description', saved.description);
      out.put('isActive', saved.isActive);
      // Do not echo valuesJson — keeps the Aura response small.
      return JSON.serialize(out);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  @AuraEnabled
  public static ValueSetDTO saveValueSet(ValueSetDTO dto) {
    try {
      return saveValueSetImpl(dto);
    } catch (AuraHandledException ahe) {
      throw ahe;
    } catch (Exception e) {
      throw auraError(e);
    }
  }

  private static ValueSetDTO saveValueSetImpl(ValueSetDTO dto) {
    if (dto == null) {
      throw auraError('Value set payload is required.');
    }
    if (dto.templateId == null) {
      throw auraError('templateId is required.');
    }
    if (String.isBlank(dto.name)) {
      throw auraError('name is required.');
    }
    if (String.isBlank(dto.valuesJson)) {
      throw auraError('valuesJson is required.');
    }
    Integer jsonLen = dto.valuesJson.length();
    if (jsonLen > MAX_VALUES_JSON_CHARS) {
      throw auraError(
        'Values JSON is too large (' +
          String.valueOf(jsonLen) +
          ' chars; max ' +
          String.valueOf(MAX_VALUES_JSON_CHARS) +
          ').'
      );
    }
    DocEngineAccess.assertTemplateAccess(dto.templateId);

    DocEngine_Value_Set__c row;
    if (dto.id != null) {
      List<DocEngine_Value_Set__c> existing = [
        SELECT Id, Template__c, Template__r.Access_Group_Id__c
        FROM DocEngine_Value_Set__c
        WHERE Id = :dto.id
        WITH USER_MODE
        LIMIT 1
      ];
      if (existing.isEmpty()) {
        throw auraError('Value set not found.');
      }
      row = existing[0];
      DocEngineAccess.assertGroupAccess(row.Template__r.Access_Group_Id__c);
      if (row.Template__c != dto.templateId) {
        throw auraError('Cannot change the template on an existing value set.');
      }
    } else {
      row = new DocEngine_Value_Set__c();
      row.Template__c = dto.templateId;
    }

    row.Name = dto.name.trim().left(80);
    row.Values_JSON__c = dto.valuesJson;
    row.Description__c = String.isBlank(dto.description) ? null : dto.description.trim();
    row.Is_Active__c = dto.isActive == null ? true : dto.isActive;

    if (dto.id != null) {
      if (!Schema.sObjectType.DocEngine_Value_Set__c.isUpdateable()) {
        throw auraError('Insufficient access to update value sets.');
      }
      SObjectAccessDecision decision = Security.stripInaccessible(
        AccessType.UPDATABLE,
        new List<DocEngine_Value_Set__c>{ row }
      );
      List<DocEngine_Value_Set__c> safe = (List<DocEngine_Value_Set__c>) decision.getRecords();
      if (safe == null || safe.isEmpty()) {
        throw auraError('Insufficient access to update value sets.');
      }
      try {
        Database.update(safe, AccessLevel.USER_MODE);
      } catch (DmlException e) {
        throw auraError(e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage());
      }
      row = safe[0];
    } else {
      if (!Schema.sObjectType.DocEngine_Value_Set__c.isCreateable()) {
        throw auraError('Insufficient access to create value sets.');
      }
      SObjectAccessDecision decision = Security.stripInaccessible(
        AccessType.CREATABLE,
        new List<DocEngine_Value_Set__c>{ row }
      );
      List<DocEngine_Value_Set__c> safe = (List<DocEngine_Value_Set__c>) decision.getRecords();
      if (safe == null || safe.isEmpty()) {
        throw auraError('Insufficient access to create value sets.');
      }
      try {
        Database.insert(safe, AccessLevel.USER_MODE);
      } catch (DmlException e) {
        throw auraError(e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage());
      }
      row = safe[0];
    }

    ValueSetDTO out = new ValueSetDTO();
    out.id = row.Id;
    out.name = row.Name;
    out.templateId = dto.templateId;
    out.description = row.Description__c;
    out.isActive = row.Is_Active__c == true;
    out.valuesJson = dto.valuesJson;
    return out;
  }

  private static ValueSetDTO toDto(DocEngine_Value_Set__c row) {
    ValueSetDTO out = new ValueSetDTO();
    out.id = row.Id;
    out.name = row.Name;
    out.templateId = row.Template__c;
    out.description = row.Description__c;
    out.isActive = row.Is_Active__c == true;
    out.valuesJson = row.Values_JSON__c;
    return out;
  }

  private static ValueSetDTO parseDto(String dtoJson) {
    if (String.isBlank(dtoJson)) {
      throw auraError('Value set payload is required.');
    }
    try {
      return (ValueSetDTO) JSON.deserialize(dtoJson, ValueSetDTO.class);
    } catch (Exception e) {
      throw auraError('Invalid value set JSON.');
    }
  }

  private static AuraHandledException auraError(String message) {
    return new AuraHandledException(
      String.isBlank(message) ? 'Value set operation failed.' : message
    );
  }

  private static AuraHandledException auraError(Exception e) {
    return auraError(e == null ? null : e.getMessage());
  }
}
