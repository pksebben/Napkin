import { SessionManager } from "./session-manager.js";
import { createMcpServer, startMcpServer } from "./mcp.js";

const sessionManager = new SessionManager();
const mcpServer = createMcpServer(sessionManager);

startMcpServer(mcpServer).catch((err) => {
  console.error("MCP server failed:", err);
  process.exit(1);
});
