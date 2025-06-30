# Twenty CRM MCP Server

A Model Context Protocol (MCP) server that provides tools for interacting with Twenty CRM.

## Features

- **OAuth 2.1 Support**: Full OAuth authentication for Claude Web compatibility
- **Dual Authentication**: Supports both API keys (Claude Desktop) and OAuth (Claude Web)
- **Streamable HTTP**: Modern transport protocol with SSE fallback
- **Multiple Tools**: People, Companies, Tasks, Notes, and Opportunities management
- **Session Management**: Secure session handling for multi-user environments

## Quick Start

### Claude Web (OAuth)

Add to your Claude Web configuration:

```json
{
  "mcpServers": {
    "twenty-crm": {
      "url": "https://twenty.mcp.ole.de/mcp"
    }
  }
}
```

### Claude Desktop (API Key)

1. Clone this repository
2. Install dependencies: `npm install`
3. Add to Claude Desktop config:

```json
{
  "twenty-crm": {
    "command": "node",
    "args": ["/path/to/twenty-mcp/dist/index.js", "stdio"],
    "env": {
      "TWENTY_API_KEY": "your-api-key-here"
    }
  }
}
```

## Available Tools

- **authenticate**: Set API key for Twenty CRM authentication
- **list_people**: List all people/contacts
- **create_person**: Create a new person
- **update_person**: Update person details
- **delete_person**: Delete a person
- **list_companies**: List all companies
- **create_company**: Create a new company
- **update_company**: Update company details
- **delete_company**: Delete a company
- **list_tasks**: List all tasks
- **create_task**: Create a new task
- **update_task**: Update task details
- **delete_task**: Delete a task
- **list_notes**: List all notes
- **create_note**: Create a new note
- **update_note**: Update note details
- **delete_note**: Delete a note
- **list_opportunities**: List all opportunities
- **create_opportunity**: Create a new opportunity
- **update_opportunity**: Update opportunity details
- **delete_opportunity**: Delete an opportunity

## Authentication

### OAuth Flow (Claude Web)
1. Connect to the server URL
2. You'll be redirected to authorize
3. Enter your Twenty CRM API key
4. Grant access to Claude

### Direct API Key (Claude Desktop)
Use the `authenticate` tool with your API key:
```
authenticate({ apiKey: "your-twenty-crm-api-key" })
```

## Development

### Local Development
```bash
npm install
npm run dev
```

### Building
```bash
npm run build
```

### Docker
```bash
docker build -t twenty-mcp .
docker run -p 3000:3000 twenty-mcp
```

## Environment Variables

- `PORT`: Server port (default: 3000)
- `BASE_URL`: Base URL for OAuth callbacks
- `SESSION_SECRET`: Secret for session encryption
- `LOG_LEVEL`: Logging level (default: info)

## License

MIT