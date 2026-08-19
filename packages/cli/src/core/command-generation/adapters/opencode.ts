import path from 'path';
import type { CommandContent, ToolCommandAdapter } from '../types.js';

function escapeYamlValue(value: string): string {
  return JSON.stringify(value);
}

export const opencodeAdapter: ToolCommandAdapter = {
  toolId: 'opencode',

  getFilePath(commandId: string): string {
    return path.join('.opencode', 'commands', 'learn', `${commandId}.md`);
  },

  formatFile(content: CommandContent): string {
    return `---
description: ${escapeYamlValue(content.description)}
---

${content.body}

Arguments: $ARGUMENTS
`;
  },
};
