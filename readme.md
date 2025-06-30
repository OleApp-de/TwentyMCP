# Twenty CRM MCP Server

Ein Model Context Protocol (MCP) Server für Twenty CRM, der es ermöglicht, mit Twenty CRM über Chat-Tools wie Claude zu interagieren.

## Features

- **Multi-Transport Support**: Unterstützt stdio, SSE und Streamable HTTP Transport
- **Vollständige Twenty CRM Integration**: Zugriff auf People, Companies, Tasks, Notes und Opportunities
- **Session Management**: Unterstützt mehrere Benutzer mit eigenen API-Keys
- **Umfassende Tools**: CRUD-Operationen für alle Hauptentitäten
- **Suchfunktionen**: Erweiterte Filter- und Suchoptionen
- **Pipeline Analytics**: Zusammenfassungen und Berichte

## Installation

```bash
# Repository klonen
git clone <repository-url>
cd twenty-crm-mcp-server

# Dependencies installieren
npm install

# Umgebungsvariablen konfigurieren
cp .env.example .env
# .env bearbeiten und TWENTY_CRM_URL anpassen

# TypeScript kompilieren
npm run build
```

## Verwendung

### 1. STDIO Transport (für Claude Desktop)

```bash
# Development
npm run dev

# Production
npm start
```

Für Claude Desktop, füge folgende Konfiguration zu deiner MCP-Konfiguration hinzu:

```json
{
  "mcpServers": {
    "twenty-crm": {
      "command": "node",
      "args": ["path/to/twenty-crm-mcp-server/dist/index.js", "stdio"]
    }
  }
}
```

### 2. SSE Transport (Legacy, für ältere Clients)

```bash
npm run dev sse
# Server läuft auf http://localhost:3000
```

Endpoints:
- SSE Stream: `GET http://localhost:3000/sse`
- Messages: `POST http://localhost:3000/messages?sessionId=<id>`

### 3. Streamable HTTP Transport (Empfohlen für Web)

```bash
npm run dev streamable-http
# Server läuft auf http://localhost:3000
```

Endpoint:
- `POST/GET/DELETE http://localhost:3000/mcp`

## Authentifizierung

### Methode 1: Umgebungsvariable (für stdio)

Setze `TWENTY_API_KEY` in der `.env` Datei:

```env
TWENTY_API_KEY=your-bearer-token-here
```

### Methode 2: Authenticate Tool (empfohlen)

Verwende das `authenticate` Tool nach der Verbindung:

```
authenticate mit API Key: <dein-twenty-api-key>
```

## Verfügbare Tools

### People Management
- `list-people` - Personen auflisten und suchen
- `get-person` - Details einer Person abrufen
- `create-person` - Neue Person erstellen
- `update-person` - Person aktualisieren
- `delete-person` - Person löschen

### Company Management
- `list-companies` - Unternehmen auflisten und suchen
- `get-company` - Details eines Unternehmens abrufen
- `create-company` - Neues Unternehmen erstellen
- `update-company` - Unternehmen aktualisieren
- `delete-company` - Unternehmen löschen

### Task Management
- `list-tasks` - Aufgaben auflisten und filtern
- `get-task` - Details einer Aufgabe abrufen
- `create-task` - Neue Aufgabe erstellen
- `update-task` - Aufgabe aktualisieren
- `delete-task` - Aufgabe löschen
- `complete-task` - Aufgabe als erledigt markieren

### Notes
- `list-notes` - Notizen auflisten und suchen
- `create-note` - Neue Notiz erstellen

### Opportunities
- `list-opportunities` - Verkaufschancen auflisten
- `create-opportunity` - Neue Verkaufschance erstellen
- `get-pipeline-summary` - Pipeline-Übersicht abrufen

### System
- `get-server-info` - Server-Informationen abrufen
- `authenticate` - API-Key setzen

## Beispiele

### Personen suchen
```
Verwende list-people mit search: "Schmidt"
```

### Neue Aufgabe erstellen
```
Verwende create-task mit:
- title: "Follow-up mit Kunde"
- body: "Angebot nachfassen"
- dueAt: "2024-12-20T10:00:00Z"
- status: "TODO"
```

### Pipeline-Übersicht
```
Verwende get-pipeline-summary
```

## Entwicklung

### Projekt-Struktur
```
twenty-crm-mcp-server/
├── src/
│   ├── index.ts          # Hauptserver mit Transport-Handling
│   ├── twenty-client.ts  # Twenty CRM API Client
│   └── tools/           # Tool-Implementierungen
│       ├── people.ts
│       ├── companies.ts
│       ├── tasks.ts
│       ├── notes.ts
│       └── opportunities.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Logging

Das Log-Level kann über die Umgebungsvariable `LOG_LEVEL` gesteuert werden:
- `error`: Nur Fehler
- `warn`: Warnungen und Fehler
- `info`: Allgemeine Informationen (Standard)
- `debug`: Detaillierte Debug-Informationen

## Troubleshooting

### Authentication Fehler
- Stelle sicher, dass dein API-Key das Bearer-Token-Format hat
- Überprüfe die Twenty CRM URL in der .env Datei
- Verwende das `authenticate` Tool zur Laufzeit

### Connection Issues
- Für SSE: Stelle sicher, dass der Server auf dem richtigen Port läuft
- Für stdio: Überprüfe die Pfade in der MCP-Konfiguration
- Aktiviere Debug-Logging für mehr Details

### API Limits
- Twenty CRM limitiert Abfragen auf maximal 60 Einträge
- Verwende Pagination mit `startingAfter` und `endingBefore`
- Nutze Filter für gezielte Abfragen

## Lizenz

MIT

## Support

Bei Fragen oder Problemen erstelle ein Issue im Repository oder kontaktiere den Support.