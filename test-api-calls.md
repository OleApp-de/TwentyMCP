# Twenty CRM API - Korrekte Implementierung Test

## ✅ Funktionierende Task-Erstellung 

### 1. Task erstellen (minimal)
```json
POST /rest/tasks
{
  "title": "Demo Accounts anlegen"
}
```

### 2. Task mit allen Details (korrekte API-Struktur)
```json
POST /rest/tasks
{
  "title": "Demo Accounts anlegen",
  "body": "Demo-Accounts für Müller Elektrotechnik erstellen",
  "bodyV2": {
    "markdown": "# Demo Accounts\n- Account 1\n- Account 2"
  },
  "status": "TODO",
  "dueAt": "2025-07-07T23:59:00.000Z",
  "assigneeId": "user-uuid",
  "position": 1,
  "createdBy": {
    "source": "API"
  }
}
```

### 3. MCP Tool: Task mit automatischer Verknüpfung
```bash
create-task \
  title="Demo Accounts anlegen" \
  body="Demo für Müller Elektrotechnik" \
  status="TODO" \
  linkToCompanyId="company-uuid" \
  linkToPersonId="person-uuid"
```
→ Erstellt Task UND TaskTargets automatisch!

## ✅ Funktionierende Note-Erstellung

### 1. Note erstellen (minimal)
```json
POST /rest/notes
{
  "title": "Erstkontakt Müller Elektrotechnik"
}
```

### 2. Note mit allen Details (korrekte API-Struktur)
```json
POST /rest/notes
{
  "title": "Meeting Protokoll",
  "body": "Besprochene Punkte im Meeting",
  "bodyV2": {
    "markdown": "## Meeting Agenda\n1. Punkt 1\n2. Punkt 2"
  },
  "position": 1,
  "createdBy": {
    "source": "MANUAL"
  }
}
```

### 3. MCP Tool: Note mit automatischer Verknüpfung
```bash
create-note \
  title="Meeting Protokoll" \
  bodyMarkdown="## Meeting\n- Ergebnis: Positiv" \
  linkToCompanyId="company-uuid" \
  linkToPersonId="person-uuid"
```
→ Erstellt Note UND NoteTargets automatisch!

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

## 🚀 Vollständiger CRM-Enrichment Workflow (EINFACH!)

```bash
# 1. Company erstellen
create-company name="Müller Elektrotechnik" status="INTERESSE" unternehmenstyp="HANDWERKSUNTERNEHMEN"
→ companyId = "comp-123"

# 2. Person erstellen (mit direkter Company-Verknüpfung)
create-person firstName="Hans" lastName="Müller" companyId="comp-123" katgeorie="KUNDE"
→ personId = "pers-456" 

# 3. Task erstellen (MIT automatischer Verknüpfung)
create-task \
  title="Demo Accounts anlegen" \
  body="Demo für Müller Elektrotechnik" \
  status="TODO" \
  linkToCompanyId="comp-123" \
  linkToPersonId="pers-456"
→ Erstellt Task UND beide TaskTargets automatisch!

# 4. Note erstellen (MIT automatischer Verknüpfung)
create-note \
  title="Erstkontakt" \
  bodyMarkdown="## Erstkontakt\n- Interesse sehr hoch" \
  linkToCompanyId="comp-123" \
  linkToPersonId="pers-456"
→ Erstellt Note UND beide NoteTargets automatisch!
```

**Statt 8 API-Calls nur noch 4! 🎉**

## 🎯 Key Takeaways

1. **Nur Person hat direkte Company-Verknüpfung** über `companyId`
2. **Tasks und Notes verwenden SEPARATE Target-APIs** für Verknüpfungen
3. **Niemals `linkToCompanyId` oder `linkToPersonId`** bei Task/Note-Erstellung verwenden
4. **2-Schritt-Prozess** für Tasks und Notes: Erst erstellen, dann verknüpfen
5. **bodyV2 nur verwenden** wenn auch Inhalt vorhanden ist