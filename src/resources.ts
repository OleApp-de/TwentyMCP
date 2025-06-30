export const resources = [
  {
    uri: "twenty://api-documentation",
    name: "Twenty CRM API Documentation", 
    description: "Vollständige API-Dokumentation für Twenty CRM",
    mimeType: "text/markdown",
  },
  {
    uri: "twenty://quick-reference",
    name: "Quick API Reference",
    description: "Schnellreferenz für häufige Twenty CRM API-Operationen", 
    mimeType: "text/plain",
  },
  {
    uri: "twenty://available-tools",
    name: "Available Twenty CRM Tools",
    description: "Liste aller verfügbaren MCP Tools für Twenty CRM",
    mimeType: "text/markdown",
  }
];

export const resourceHandlers = {
  "twenty://api-documentation": () => ({
    contents: [
      {
        uri: "twenty://api-documentation",
        text: `# Twenty CRM API - Vollständige Dokumentation

## Base URL
https://crm.tools.ole.de/rest/

## Authentication
Bearer Token im Authorization Header erforderlich.

---

## Personen (People) API

### Datenmodell Person

#### Person Schema (Erstellen/Aktualisieren)
\`\`\`json
{
  "emails": {
    "primaryEmail": "string",
    "additionalEmails": ["email1@example.com", "email2@example.com"]
  },
  "name": {
    "firstName": "string",
    "lastName": "string"
  },
  "phones": {
    "primaryPhoneNumber": "string",
    "primaryPhoneCountryCode": "string",
    "primaryPhoneCallingCode": "string",
    "additionalPhones": ["string"]
  },
  "companyId": "uuid",
  "jobTitle": "string",
  "city": "string",
  "avatarUrl": "string",
  "position": "number",
  "katgeorie": "KUNDE|VERBÄNDE|PARTNER|DIENSTLEISTER",
  "linkedinLink": {
    "primaryLinkLabel": "string",
    "primaryLinkUrl": "string",
    "secondaryLinks": [
      {
        "url": "uri",
        "label": "string"
      }
    ]
  },
  "xLink": {
    "primaryLinkLabel": "string",
    "primaryLinkUrl": "string",
    "secondaryLinks": [
      {
        "url": "uri",
        "label": "string"
      }
    ]
  },
  "createdBy": {
    "source": "EMAIL|CALENDAR|WORKFLOW|API|IMPORT|MANUAL|SYSTEM|WEBHOOK"
  }
}
\`\`\`

### API-Endpunkte für Personen

#### 1. Alle Personen abrufen
\`\`\`http
GET /people
\`\`\`

**Parameter:**
- \`orderBy\` (optional): Sortierung (z.B. "createdAt", "name.lastName")
- \`filter\` (optional): Filter-Kriterien als JSON-Objekt
- \`limit\` (optional): Anzahl der Ergebnisse (max. 60)
- \`depth\` (optional): Tiefe der verknüpften Daten (0-3)

#### 2. Person erstellen
\`\`\`http
POST /people
\`\`\`

---

## Unternehmen (Companies) API

### Datenmodell Unternehmen

#### Company Schema (Erstellen/Aktualisieren)
\`\`\`json
{
  "name": "string",
  "domainName": {
    "primaryLinkLabel": "string",
    "primaryLinkUrl": "string",
    "secondaryLinks": [
      {
        "url": "uri",
        "label": "string"
      }
    ]
  },
  "address": {
    "addressStreet1": "string",
    "addressStreet2": "string",
    "addressCity": "string",
    "addressState": "string",
    "addressPostcode": "string",
    "addressCountry": "string",
    "addressLat": "number",
    "addressLng": "number"
  },
  "employees": "integer",
  "linkedinLink": {
    "primaryLinkLabel": "string",
    "primaryLinkUrl": "string",
    "secondaryLinks": [
      {
        "url": "uri",
        "label": "string"
      }
    ]
  },
  "xLink": {
    "primaryLinkLabel": "string",
    "primaryLinkUrl": "string",
    "secondaryLinks": [
      {
        "url": "uri",
        "label": "string"
      }
    ]
  },
  "annualRecurringRevenue": {
    "amountMicros": "number",
    "currencyCode": "string"
  },
  "createdBy": {
    "source": "EMAIL|CALENDAR|WORKFLOW|API|IMPORT|MANUAL|SYSTEM|WEBHOOK"
  },
  "position": "number",
  "idealCustomerProfile": "boolean",
  "accountOwnerId": "uuid",
  "status": "INTERESSE|TRIAL|KUNDE|VERLOREN",
  "unternehmenstyp": "HANDWERKSUNTERNEHMEN|PARTNER|DIENSTLEISTER"
}
\`\`\`

### API-Endpunkte für Unternehmen

#### 1. Unternehmen erstellen
\`\`\`http
POST /companies
\`\`\`

---

## Aufgaben (Tasks) API

### Datenmodell Aufgabe

#### Task Schema (Erstellen/Aktualisieren)
\`\`\`json
{
  "title": "string",
  "body": "string",
  "bodyV2": {
    "blocknote": "string",
    "markdown": "string"
  },
  "status": "TODO|IN_PROGRESS|DONE",
  "dueAt": "date-time",
  "assigneeId": "uuid",
  "position": "number",
  "createdBy": {
    "source": "EMAIL|CALENDAR|WORKFLOW|API|IMPORT|MANUAL|SYSTEM|WEBHOOK"
  }
}
\`\`\`

### API-Endpunkte für Aufgaben

#### 1. Aufgabe erstellen
\`\`\`http
POST /tasks
\`\`\`

---

## TaskTargets API (Aufgaben-Verknüpfungen)

TaskTargets verbinden Aufgaben mit Personen, Unternehmen oder anderen Objekten.

### Datenmodell TaskTarget

#### TaskTarget Schema
\`\`\`json
{
  "taskId": "uuid",
  "personId": "uuid",
  "companyId": "uuid",
  "opportunityId": "uuid",
  "neusDatenmodelId": "uuid"
}
\`\`\`

### API-Endpunkte für TaskTargets

#### 1. TaskTarget erstellen
\`\`\`http
POST /taskTargets
\`\`\`

---

## Wichtige Status-Felder

### Task Status-Felder
- \`TODO\`: Zu erledigen
- \`IN_PROGRESS\`: In Bearbeitung
- \`DONE\`: Erledigt

### Person Kategorien
- \`KUNDE\`: Kunde
- \`VERBÄNDE\`: Verband/Organisation  
- \`PARTNER\`: Geschäftspartner
- \`DIENSTLEISTER\`: Dienstleister

### Unternehmen Status-Felder
- \`status\`: 
  - \`INTERESSE\`: Interessent/Lead
  - \`TRIAL\`: In der Testphase
  - \`KUNDE\`: Bestehender Kunde
  - \`VERLOREN\`: Verloren/Abgelehnt
- \`idealCustomerProfile\`: Boolean - Markiert Unternehmen als idealen Kunden
- \`unternehmenstyp\`:
  - \`HANDWERKSUNTERNEHMEN\`: Handwerksbetrieb
  - \`PARTNER\`: Geschäftspartner
  - \`DIENSTLEISTER\`: Dienstleistungsunternehmen
- \`accountOwnerId\`: UUID - Zuständiger Account Manager

### Erstellungsquellen (createdBy.source)
- \`EMAIL\`: Über E-Mail importiert
- \`CALENDAR\`: Über Kalender erstellt
- \`WORKFLOW\`: Durch Workflow erstellt
- \`API\`: Über API erstellt
- \`IMPORT\`: Durch Import erstellt
- \`MANUAL\`: Manuell erstellt
- \`SYSTEM\`: Systemgeneriert
- \`WEBHOOK\`: Über Webhook erstellt`,
      },
    ],
  }),

  "twenty://quick-reference": () => ({
    contents: [
      {
        uri: "twenty://quick-reference", 
        text: `Twenty CRM Quick Reference

REIHENFOLGE für neue Daten:
1. create-company (speichere company.id)
2. create-person mit companyId 
3. create-task (speichere task.id)
4. link-task-to-company mit taskId + companyId

WICHTIGE FELDER:
- Company: name, status, unternehmenstyp, idealCustomerProfile: true
- Person: name.firstName/lastName, emails.primaryEmail, companyId, katgeorie: "KUNDE"
- Task: title, body, status: "TODO", dueAt (ISO date)
- TaskTarget: taskId, companyId

STATUS-WERTE:
- Company.status: INTERESSE, TRIAL, KUNDE, VERLOREN
- Company.unternehmenstyp: HANDWERKSUNTERNEHMEN, PARTNER, DIENSTLEISTER
- Task.status: TODO, IN_PROGRESS, DONE

DATUM-FORMATIERUNG:
- dueAt: ISO 8601 Format (z.B. "2025-07-07T23:59:00.000Z")
- +7 Tage von heute: new Date(Date.now() + 7*24*60*60*1000).toISOString()

BASE URL: https://crm.tools.ole.de/rest/`
      }
    ]
  }),

  "twenty://available-tools": () => ({
    contents: [
      {
        uri: "twenty://available-tools",
        text: `# Verfügbare Twenty CRM MCP Tools

## 🏢 Company Management
- **create-company** - Neues Unternehmen erstellen
- **get-company** - Unternehmen abrufen
- **list-companies** - Unternehmen auflisten/suchen
- **update-company** - Unternehmen aktualisieren
- **delete-company** - Unternehmen löschen
- **batch-create-companies** - Mehrere Unternehmen erstellen
- **find-company-duplicates** - Duplikate finden

## 👥 People Management  
- **create-person** - Neue Person erstellen
- **get-person** - Person abrufen
- **list-people** - Personen auflisten/suchen
- **update-person** - Person aktualisieren
- **delete-person** - Person löschen
- **batch-create-people** - Mehrere Personen erstellen
- **find-people-duplicates** - Duplikate finden

## ✅ Task Management
- **create-task** - Neue Aufgabe erstellen
- **get-task** - Aufgabe abrufen
- **list-tasks** - Aufgaben auflisten/suchen
- **update-task** - Aufgabe aktualisieren
- **delete-task** - Aufgabe löschen
- **complete-task** - Aufgabe als erledigt markieren
- **batch-create-tasks** - Mehrere Aufgaben erstellen
- **find-task-duplicates** - Duplikate finden

## 🔗 Task Target Management
- **create-task-target** - Aufgaben-Verknüpfung erstellen
- **get-task-target** - Verknüpfung abrufen
- **list-task-targets** - Verknüpfungen auflisten
- **update-task-target** - Verknüpfung aktualisieren
- **delete-task-target** - Verknüpfung löschen
- **link-task-to-company** - Aufgabe mit Unternehmen verknüpfen
- **link-task-to-person** - Aufgabe mit Person verknüpfen
- **get-tasks-for-company** - Alle Aufgaben eines Unternehmens
- **get-tasks-for-person** - Alle Aufgaben einer Person

## 🖥️ System Tools
- **get-server-info** - Server-Informationen

## 💡 Empfohlener Workflow für CRM-Enrichment:

1. **create-company** (mit recherchierten Daten)
   → Speichere \`companyId\`

2. **create-person** (mit \`companyId\`)
   → Für jede identifizierte Person

3. **create-task** (Demo-Task)
   → Speichere \`taskId\`

4. **link-task-to-company** (mit \`taskId\` + \`companyId\`)
   → Verknüpfung erstellen

## 🔍 Filter-Beispiele:

- Alle Handwerksunternehmen: \`{"unternehmenstyp":{"eq":"HANDWERKSUNTERNEHMEN"}}\`
- Offene Aufgaben: \`{"status":{"in":["TODO","IN_PROGRESS"]}}\`
- Personen ohne Unternehmen: \`{"companyId":{"is":"NULL"}}\`
- Überfällige Aufgaben: \`{"status":{"neq":"DONE"},"dueAt":{"lt":"2025-06-30T00:00:00.000Z"}}\`

## 📊 Depth Parameter:
- 0: Nur Basis-Objektdaten
- 1: Erste Ebene verknüpfter Objekte (Standard)
- 2: Zweite Ebene verknüpfter Objekte  
- 3: Dritte Ebene verknüpfter Objekte`
      }
    ]
  })
};