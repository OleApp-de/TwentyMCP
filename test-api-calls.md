# Twenty CRM API - Korrekte Implementierung Test

## ✅ Funktionierende Task-Erstellung (Minimaler Test)

### 1. Task erstellen (ohne Verknüpfungsparameter)
```json
POST /rest/tasks
{
  "title": "Demo Accounts anlegen"
}
```

### 2. Mit mehr Daten
```json
POST /rest/tasks
{
  "title": "Demo Accounts anlegen",
  "body": "Demo-Accounts für Müller Elektrotechnik erstellen",
  "status": "TODO",
  "dueAt": "2025-07-07T23:59:00.000Z"
}
```

### 3. TaskTarget für Verknüpfung
```json
POST /rest/taskTargets
{
  "taskId": "uuid-aus-schritt-2",
  "companyId": "company-uuid"
}
```

## ✅ Funktionierende Note-Erstellung (Minimaler Test)

### 1. Note erstellen (ohne Verknüpfungsparameter)
```json
POST /rest/notes
{
  "title": "Erstkontakt Müller Elektrotechnik"
}
```

### 2. Mit mehr Daten
```json
POST /rest/notes
{
  "title": "Erstkontakt Müller Elektrotechnik",
  "body": "Kontaktdaten erhalten und erste Informationen gesammelt"
}
```

### 3. Mit Markdown
```json
POST /rest/notes
{
  "title": "Meeting Protokoll",
  "bodyV2": {
    "markdown": "## Meeting Details\n\n- Datum: 2025-06-30\n- Ergebnis: Positiv"
  }
}
```

### 4. NoteTarget für Verknüpfung
```json
POST /rest/noteTargets
{
  "noteId": "uuid-aus-schritt-2",
  "companyId": "company-uuid"
}
```

## ❌ Fehlerhafte Aufrufe (nicht verwenden!)

```json
// FALSCH - linkToCompanyId existiert nicht!
POST /rest/tasks
{
  "title": "Demo Task",
  "linkToCompanyId": "company-uuid"  // ❌ Führt zu 400 Error
}

// FALSCH - linkToPersonId existiert nicht!
POST /rest/notes
{
  "title": "Meeting Note",
  "linkToPersonId": "person-uuid"    // ❌ Führt zu 400 Error
}

// FALSCH - leeres bodyV2 könnte Probleme verursachen
POST /rest/notes
{
  "title": "Test",
  "bodyV2": {}  // ❌ Besser weglassen
}
```

## 🔧 Korrekte MCP Tool Aufrufe

### Task-Workflow
```bash
1. create-task title="Demo Task" body="Description" status="TODO"
   → Ergebnis: taskId = "uuid-123"

2. create-task-target taskId="uuid-123" companyId="company-uuid"
   → Task ist mit Company verknüpft
```

### Note-Workflow  
```bash
1. create-note title="Meeting Note" bodyMarkdown="## Meeting\n- Ergebnis: Positiv"
   → Ergebnis: noteId = "uuid-456"

2. create-note-target noteId="uuid-456" companyId="company-uuid"
   → Note ist mit Company verknüpft

3. create-note-target noteId="uuid-456" personId="person-uuid"  
   → Note ist auch mit Person verknüpft
```

## 🚀 Vollständiger CRM-Enrichment Workflow

```bash
# 1. Company erstellen
create-company name="Müller Elektrotechnik" status="INTERESSE" unternehmenstyp="HANDWERKSUNTERNEHMEN"
→ companyId = "comp-123"

# 2. Person erstellen (mit direkter Company-Verknüpfung)
create-person firstName="Hans" lastName="Müller" companyId="comp-123" katgeorie="KUNDE"
→ personId = "pers-456" 

# 3. Task erstellen (OHNE Verknüpfung)
create-task title="Demo Accounts anlegen" body="Demo für Müller Elektrotechnik" status="TODO"
→ taskId = "task-789"

# 4. Task mit Company verknüpfen
create-task-target taskId="task-789" companyId="comp-123"

# 5. Note erstellen (OHNE Verknüpfung)
create-note title="Erstkontakt" bodyMarkdown="## Erstkontakt\n- Interesse sehr hoch"
→ noteId = "note-101"

# 6. Note mit Company und Person verknüpfen
create-note-target noteId="note-101" companyId="comp-123"
create-note-target noteId="note-101" personId="pers-456"
```

## 🎯 Key Takeaways

1. **Nur Person hat direkte Company-Verknüpfung** über `companyId`
2. **Tasks und Notes verwenden SEPARATE Target-APIs** für Verknüpfungen
3. **Niemals `linkToCompanyId` oder `linkToPersonId`** bei Task/Note-Erstellung verwenden
4. **2-Schritt-Prozess** für Tasks und Notes: Erst erstellen, dann verknüpfen
5. **bodyV2 nur verwenden** wenn auch Inhalt vorhanden ist