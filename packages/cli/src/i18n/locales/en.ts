import type { LocaleMessages } from '../types.js';

export const en: LocaleMessages = {
  cli: {
    programDescription:
      'AI-powered recursive learning system with Socratic method and TDD practice',
    initCommandDescription: 'Initialize Learn Anything learning skills in the current project',
    updateCommandDescription: 'Update Learn Anything skill files to latest version',
    toolsOptionDescription: (ids: string) =>
      `Specify AI tools (non-interactive mode). Use "all", "none", or comma-separated list: ${ids}`,
    notDirectory: (path: string) => `Path "${path}" is not a directory`,
    dirNotExist: (path: string) =>
      `Directory "${path}" does not exist, it will be created automatically.`,
    cannotAccess: (path: string, msg: string) => `Cannot access path "${path}": ${msg}`,
    errorPrefix: (msg: string) => `Error: ${msg}`,
    updateComplete: 'Learn Anything skill files have been updated.',
    forceOption: 'Overwrite existing generated files',
    langOption: 'Display language: en, es, or zh-CN (default: system locale)',
    portOption: 'Port for the dev server (default: 24278)',
    strictPortOption: 'Use the exact port from --port; do not auto-pick a free one when busy',
    noOpenOption: 'Do not open browser automatically',
    context7Option: 'Enable Context7 documentation verification',
    noContext7Option: 'Disable Context7 documentation verification',
    serveCommandDescription: 'Start a local site to visualize learning progress',
    serveHint: 'Run npx learn-anything-cli serve to view your learning progress in browser',
  },

  init: {
    header: '\n🧠 Learn Anything — AI-Powered Recursive Learning System\n',
    noToolsSelected:
      'No AI tools selected. Use --tools option to specify, or select in interactive mode.',
    availableTools: (tools: string) => `Available tools: ${tools}`,
    skillGenerated: (toolName: string) => `  ✓ ${toolName} — learning integration ready`,
    initComplete: '🎉 Learn Anything initialization complete!\n',
    globalDataPath: (dir: string) => `  Learning data stored at ${dir}/`,
    startLearning: (example: string) => `  Run ${example} to start your first learning topic\n`,
    availableCommands: 'Available learning commands:',
    cmdLine: (cmd: string, desc: string) => `  ${cmd}${desc}`,
    interactiveSelectPrompt:
      'Select AI tools to generate skills for (space to select, enter to confirm):',
    migrationComplete: (count: number) =>
      `Migrated ${count} topic(s) from v0 to v1 format (backups created).`,
    migrationV2Complete: (count: number) =>
      `Migrated ${count} topic(s) from V1 to V2 format (backups created).`,
    migrationFailed: (topic) =>
      `Migration failed for topic "${topic}". Fix its legacy files and rerun.`,
    context7Prompt:
      'Enable Context7 for documentation verification? (Provides on-demand access to official library docs)',
    context7Enabled: '  📚 Context7 guidance enabled.',
    context7SetupHint:
      '  💡 To set up Context7 MCP, run `npx ctx7 setup` or visit https://context7.com/docs/resources/all-clients',
    generatedFileConflict: (path, forceAllowed) =>
      forceAllowed
        ? `Generated file conflict: "${path}" has local changes. Rerun with --force to overwrite generated files.`
        : `Generated file conflict: "${path}" is not a safe generated-file target and cannot be replaced with --force.`,
    studyCommandDescription: '      — Follow the deterministic study plan',
    topicCommandDescription: '      — Initialize or load a learning topic',
    explainCommandDescription: '  — Recursively deep-dive into a concept',
    practiceCommandDescription: ' — Deliberate practice with feedback and correction',
    reviewCommandDescription: '    — Review due material with runtime spacing',
    statusCommandDescription: '    — View runtime-derived mastery and review ledger',
    quizCommandDescription: '   — Retrieval quiz with feedback and correction',
  },

  serve: {
    startingServer: 'Starting server...',
    siteReady: (url: string) => `Site ready at ${url}`,
    portInUse: (port: number) =>
      `Port ${port} is already in use. Try a different port with --port option.`,
    portSwitched: (from: number, to: number) =>
      `Port ${from} is already in use — switching to port ${to}.`,
    portRangeExhausted: (start: number, end: number) =>
      `No free port found in range ${start}-${end}. Specify one manually with --port.`,
    emptyTopics: 'No learning topics found in .learn/topics/. Start learning with /learn:topic.',
    serverStopped: 'Server stopped.',
    siteNotBuilt: 'Site files not found. Please reinstall the package or run the build step.',
  },
};
