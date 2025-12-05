# yt-tag-generator

YouTube SEO Optimization MCP Agent

## Quick Start

1. Click "Run" to start the server
2. The WebSocket server will be available at the URL shown in the console
3. Connect using an MCP client

## Deployment

Click the "Deploy" button in Replit to deploy this agent.
The deployed URL will be your agent's permanent endpoint.

## API

This agent exposes its functionality through the MCP protocol over WebSocket.

### Methods

- `ping` - Health check
- `tools/list` - List available tools
- `tools/call` - Execute a tool

## Environment Variables

- `PORT` - Server port (default: 3000)
