# Twenty CRM MCP Server - Coolify Deployment Guide

## Schritt-für-Schritt Anleitung

### 1. GitHub Repository vorbereiten

Stelle sicher, dass folgende Dateien in deinem Repository sind:
- [x] `Dockerfile`
- [x] `.dockerignore`
- [x] Alle Source-Dateien

Push alles zu GitHub:
```bash
git add .
git commit -m "Add Docker configuration for Coolify deployment"
git push origin main
```

### 2. Coolify Projekt erstellen

1. Logge dich in Coolify ein
2. Gehe zu "New Project" oder wähle ein bestehendes Projekt
3. Klicke auf "New Service"
4. Wähle "Docker" als Service-Typ
5. Wähle "GitHub" als Source

### 3. GitHub Repository verbinden

1. Wähle dein Twenty CRM MCP Repository
2. Branch: `main` (oder dein Hauptbranch)
3. Dockerfile Path: `/Dockerfile` (Root-Verzeichnis)

### 4. Umgebungsvariablen konfigurieren

Füge folgende Environment Variables in Coolify hinzu:

```env
# Required
PORT=3000
NODE_ENV=production

# Twenty CRM (Optional - nur wenn du einen Standard-API-Key setzen willst)
# TWENTY_API_KEY=dein-api-key

# OAuth Settings
BASE_URL=https://twenty.mcp.tools.ole.de

# Logging
LOG_LEVEL=info

# Session Secret (generiere einen zufälligen String)
SESSION_SECRET=generiere-einen-sicheren-zufaelligen-string
```

### 5. Netzwerk & Domain konfigurieren

1. **Domain**: `twenty.mcp.tools.ole.de`
2. **Port**: 3000 (intern)
3. **SSL**: Aktiviere "Force HTTPS" (Traefik macht das automatisch)
4. **Health Check Path**: `/health`

### 6. Deployment Settings

1. **Build Command**: Wird automatisch vom Dockerfile übernommen
2. **Start Command**: Wird automatisch vom Dockerfile übernommen
3. **Resource Limits** (empfohlen):
   - Memory: 512MB
   - CPU: 0.5

### 7. Deploy

1. Klicke auf "Deploy"
2. Warte bis der Build abgeschlossen ist
3. Überprüfe die Logs auf Fehler

### 8. Testen

Nach erfolgreichem Deployment:

1. **Health Check**: 
   ```bash
   curl https://twenty.mcp.tools.ole.de/health
   ```

2. **OAuth Metadata**:
   ```bash
   curl https://twenty.mcp.tools.ole.de/.well-known/oauth-protected-resource
   ```

3. **MCP Inspector Test**:
   - Transport: SSE
   - URL: `https://twenty.mcp.tools.ole.de/sse`
   - Mit OAuth Flow oder Bearer Token

### 9. Monitoring

In Coolify kannst du:
- Logs in Echtzeit verfolgen
- Resource-Nutzung überwachen
- Automatische Restarts bei Crashes

### Troubleshooting

**Problem**: CORS Fehler
- Lösung: Die App hat bereits CORS mit `origin: true` konfiguriert

**Problem**: WebSocket/SSE Connection failed
- Lösung: Stelle sicher, dass Traefik WebSocket/SSE Support aktiviert hat

**Problem**: OAuth Redirect funktioniert nicht
- Lösung: Überprüfe dass `BASE_URL` korrekt auf `https://twenty.mcp.tools.ole.de` gesetzt ist

### Traefik Labels (Optional)

Falls du zusätzliche Traefik-Konfiguration brauchst, füge diese Labels in Coolify hinzu:

```yaml
traefik.http.routers.twenty-mcp.rule: Host(`twenty.mcp.tools.ole.de`)
traefik.http.routers.twenty-mcp.tls: true
traefik.http.routers.twenty-mcp.tls.certresolver: letsencrypt
traefik.http.services.twenty-mcp.loadbalancer.server.port: 3000
# SSE Support
traefik.http.services.twenty-mcp.loadbalancer.server.buffering: false
``` 