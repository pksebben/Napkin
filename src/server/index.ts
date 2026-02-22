import { SessionManager } from "./session-manager.js";
import { SessionPersistence } from "./persistence.js";
import { createMcpServer, startMcpServer } from "./mcp.js";

const persistence = new SessionPersistence();
const sessionManager = new SessionManager(persistence);
const mcpServer = createMcpServer(sessionManager);

startMcpServer(mcpServer).catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
