export const prompts = {
  "enrich-and-create-crm-data": {
    name: "enrich-and-create-crm-data",
    description: "Analysiere unstrukturierte Kontakt-/Unternehmensdaten, suche im Internet nach fehlenden Informationen und erstelle automatisch CRM-Einträge",
    arguments: [
      {
        name: "rawData",
        description: "Unstrukturierte Daten über Person(en) und Unternehmen - kann Text, E-Mails, Namen, teilweise Adressen etc. enthalten",
        required: true
      },
      {
        name: "unternehmenstyp",
        description: "Typ des Unternehmens: HANDWERKSUNTERNEHMEN, PARTNER, DIENSTLEISTER",
        required: false
      },
      {
        name: "status",
        description: "Aktueller Status: INTERESSE, TRIAL, KUNDE, VERLOREN",
        required: false
      },
      {
        name: "priority",
        description: "Priorität für die Demo-Aufgabe: TODO, IN_PROGRESS",
        required: false
      },
      {
        name: "assigneeId", 
        description: "UUID des Workspace-Members dem die Demo-Aufgabe zugewiesen werden soll",
        required: false
      }
    ]
  },

  "research-company-details": {
    name: "research-company-details",
    description: "Recherchiere detaillierte Informationen über ein Unternehmen im Internet",
    arguments: [
      {
        name: "companyName",
        description: "Name des Unternehmens",
        required: true
      },
      {
        name: "domain",
        description: "Website/Domain des Unternehmens falls bekannt",
        required: false
      },
      {
        name: "additionalInfo",
        description: "Zusätzliche bekannte Informationen (Adresse, Branche, etc.)",
        required: false
      },
      {
        name: "unternehmenstyp",
        description: "Erwarteter Unternehmenstyp: HANDWERKSUNTERNEHMEN, PARTNER, DIENSTLEISTER",
        required: false
      }
    ]
  }
};

export const promptHandlers = {
  "enrich-and-create-crm-data": async ({ 
    rawData, 
    unternehmenstyp = "HANDWERKSUNTERNEHMEN", 
    status = "INTERESSE",
    priority = "TODO", 
    assigneeId 
  }: { 
    rawData: string,
    unternehmenstyp?: string,
    status?: string,
    priority?: string,
    assigneeId?: string 
  }) => {
    // Validierung der Parameter
    const validUnternehmenstypen = ["HANDWERKSUNTERNEHMEN", "PARTNER", "DIENSTLEISTER"];
    const validStatuses = ["INTERESSE", "TRIAL", "KUNDE", "VERLOREN"];
    const validPriorities = ["TODO", "IN_PROGRESS"];

    if (unternehmenstyp && !validUnternehmenstypen.includes(unternehmenstyp)) {
      throw new Error(`Ungültiger Unternehmenstyp. Mögliche Werte: ${validUnternehmenstypen.join(", ")}`);
    }

    if (status && !validStatuses.includes(status)) {
      throw new Error(`Ungültiger Status. Mögliche Werte: ${validStatuses.join(", ")}`);
    }

    if (priority && !validPriorities.includes(priority)) {
      throw new Error(`Ungültige Priorität. Mögliche Werte: ${validPriorities.join(", ")}`);
    }

    // UUID Validierung für assigneeId falls vorhanden
    if (assigneeId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assigneeId)) {
      throw new Error('AssigneeId muss eine gültige UUID sein');
    }

    return {
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Ich habe folgende unstrukturierte Daten erhalten und möchte diese in unser Twenty CRM-System einpflegen:

${rawData}

**KONFIGURATION:**
- Unternehmenstyp: ${unternehmenstyp}
- Status: ${status}
- Task-Priorität: ${priority}
${assigneeId ? `- Zugewiesen an: ${assigneeId}` : ''}

Bitte führe folgende Schritte aus:

**SCHRITT 1 - DATENANALYSE:**
Analysiere die bereitgestellten Daten und identifiziere:
- Unternehmensinformationen (Name, Branche, Website, etc.)
- Personeninformationen (Namen, E-Mails, Positionen, etc.)
- Fehlende wichtige Informationen

**SCHRITT 2 - INTERNET-RECHERCHE:**
Suche im Internet nach fehlenden Informationen für jedes identifizierte Unternehmen:
- Vollständige Firmenadresse
- Website/Domain
- Mitarbeiteranzahl (Schätzung)
- Branche/Geschäftsfeld (bestätige ob es zum Unternehmenstyp "${unternehmenstyp}" passt)
- LinkedIn-Profil
- Kurze Unternehmensbeschreibung

**SCHRITT 3 - CRM-EINTRÄGE ERSTELLEN:**
Erstelle mit den gesammelten Informationen:

1. **Unternehmen anlegen** mit Twenty API:
   - Verwende: create-company Tool
   - Nutze alle gefundenen Daten (Name, Adresse, Website, etc.)
   - Setze unternehmenstyp: "${unternehmenstyp}"
   - Setze status: "${status}"
   - Setze idealCustomerProfile: true (da es sich um potentielle Neukunden handelt)

2. **Personen anlegen** mit Twenty API:
   - Verwende: create-person Tool für jede identifizierte Person
   - Nutze companyId Parameter um Person mit Unternehmen zu verknüpfen
   - Setze katgeorie: "KUNDE"

3. **Demo-Aufgabe erstellen** mit Twenty API:
   - Verwende: create-task Tool
   - Titel: "Demo Accounts anlegen"
   - Body: "Demo-Accounts für [Unternehmensname] (${unternehmenstyp}, Status: ${status}) erstellen und konfigurieren"
   - Status: "${priority}"
   ${assigneeId ? `- AssigneeId: "${assigneeId}"` : ''}
   - dueAt: +7 Tage von heute (ISO 8601 Format)
   - WICHTIG: Speichere die Task-UUID aus der Antwort für nächsten Schritt!

4. **Aufgabe mit Unternehmen verknüpfen**:
   - Verwende: create-task-target Tool  
   - taskId: [UUID der erstellten Aufgabe aus Schritt 3]
   - companyId: [UUID des erstellten Unternehmens aus Schritt 1]

5. **Erstberatung-Notiz erstellen** (optional) mit Twenty API:
   - Verwende: create-note Tool
   - Titel: "Erstberatung [Unternehmensname]"
   - bodyMarkdown: Strukturierte Notiz mit Gesprächsinhalten und nächsten Schritten
   - WICHTIG: Speichere die Note-UUID aus der Antwort für nächsten Schritt!

6. **Notiz mit Unternehmen und Person verknüpfen** (optional):
   - Verwende: create-note-target Tool (2x aufrufen)
   - 1. Aufruf: noteId + companyId [UUID des Unternehmens]  
   - 2. Aufruf: noteId + personId [UUID der Hauptkontaktperson]

**WICHTIGE HINWEISE:**
- Nutze die verfügbaren Twenty CRM Tools die ich dir zur Verfügung gestellt habe
- Verwende web_search um fehlende Unternehmensdaten zu finden
- Prüfe ob die recherchierten Informationen zum gewählten Unternehmenstyp "${unternehmenstyp}" passen
- create-person akzeptiert companyId Parameter für direkte Verknüpfung
- create-task erstellt NUR die Aufgabe - KEINE Verknüpfungsparameter verwenden!
- create-note erstellt NUR die Notiz - KEINE Verknüpfungsparameter verwenden!  
- Verwende create-task-target und create-note-target für Verknüpfungen in separaten Schritten
- Dies ist der korrekte API-Workflow für Tasks und Notes
- Falls Daten unklar sind, frage mich bevor du API-Calls machst

**STATUS-BEDEUTUNGEN:**
- INTERESSE: Erster Kontakt, Lead-Qualifizierung
- TRIAL: Testphase läuft, Demo vereinbart
- KUNDE: Aktiver zahlender Kunde
- VERLOREN: Lead verloren oder Kunde abgesprungen

**UNTERNEHMENSTYP-BEDEUTUNGEN:**
- HANDWERKSUNTERNEHMEN: Handwerksbetriebe, Bauunternehmen, Installation, etc.
- PARTNER: Geschäftspartner, Kooperationen, Allianzen
- DIENSTLEISTER: IT-Services, Beratung, andere Dienstleistungen

Starte mit der Analyse der bereitgestellten Daten und der Internet-Recherche.`
          }
        }
      ]
    };
  },

  "research-company-details": async ({ 
    companyName, 
    domain, 
    additionalInfo,
    unternehmenstyp = "HANDWERKSUNTERNEHMEN"
  }: {
    companyName: string,
    domain?: string,
    additionalInfo?: string,
    unternehmenstyp?: string
  }) => {
    const validUnternehmenstypen = ["HANDWERKSUNTERNEHMEN", "PARTNER", "DIENSTLEISTER"];
    
    if (unternehmenstyp && !validUnternehmenstypen.includes(unternehmenstyp)) {
      throw new Error(`Ungültiger Unternehmenstyp. Mögliche Werte: ${validUnternehmenstypen.join(", ")}`);
    }

    return {
      messages: [
        {
          role: "user" as const, 
          content: {
            type: "text" as const,
            text: `Recherchiere detaillierte Informationen über folgendes Unternehmen:

**Unternehmensname:** ${companyName}
${domain ? `**Website/Domain:** ${domain}` : ''}
${additionalInfo ? `**Zusätzliche Infos:** ${additionalInfo}` : ''}
**Erwarteter Typ:** ${unternehmenstyp}

Suche im Internet nach folgenden Informationen:

**BASISDATEN:**
- Vollständiger Firmenname
- Website/Domain (falls nicht bekannt)
- Hauptgeschäftssitz (vollständige Adresse)
- Geschäftsführung/CEO
- Gründungsjahr

**GESCHÄFTSDATEN:**
- Branche/Geschäftsfeld (spezifisch)
- Hauptprodukte/Dienstleistungen
- Geschäftsmodell (B2B, B2C, etc.)
- Mitarbeiteranzahl (Schätzung)
- Umsatz (falls öffentlich verfügbar)

**TYP-VALIDIERUNG:**
- Bestätige ob das Unternehmen wirklich ein "${unternehmenstyp}" ist
- Falls nicht, schlage den passenden Typ vor:
  * HANDWERKSUNTERNEHMEN: Bau, Installation, Reparatur, klassisches Handwerk
  * PARTNER: Andere Softwareanbieter, Systemintegratoren, Berater die Partnerschaften eingehen
  * DIENSTLEISTER: IT-Services, Beratung, Professional Services

**KONTAKTDATEN:**
- Allgemeine E-Mail-Adresse
- Telefonnummer
- LinkedIn-Firmenprofil
- Weitere Social Media Profile

**ZUSATZINFORMATIONEN:**
- Kurze Unternehmensbeschreibung (2-3 Sätze)
- Zielgruppe
- Besonderheiten/Alleinstellungsmerkmale
- Aktuelle Nachrichten oder Entwicklungen

Strukturiere die Ergebnisse übersichtlich und markiere fehlende Informationen deutlich. Diese Daten werden dann für die CRM-Erstellung verwendet.`
          }
        }
      ]
    };
  }
};