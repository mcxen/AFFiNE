import {
  getMcpServerStatus,
  setMcpServerEnabled,
  startMcpServerFromPreference,
} from '../mcp-server';

export const mcpHandlers = {
  getStatus: async () => getMcpServerStatus(),
  setEnabled: async (enabled: boolean) => setMcpServerEnabled(enabled),
  startFromPreference: async () => startMcpServerFromPreference(),
};
