export type SubagentRow = { label: string; model: string; effort?: string }

declare module 'claude-code' {
  interface PluginState {
    'subagent-models': { running: Record<string, SubagentRow> }
  }
}
