import path from 'path';
import chalk from 'chalk';
import * as fs from 'fs';
import { createRequire } from 'module';
import {
  FileSystemUtils,
  GeneratedFileConflictError,
  type GeneratedFile,
} from '../utils/file-system.js';
import { AI_TOOLS, AIToolOption, LEARN_DIR } from './config.js';
import { isInteractive } from '../utils/interactive.js';
import { generateCommands, CommandAdapterRegistry } from './command-generation/index.js';
import { getSkillTemplates, getCommandContents, generateSkillContent } from './shared/index.js';
import type { SupportedLocale } from '../i18n/types.js';
import { getMessages } from '../i18n/index.js';
import { CONTEXT7_GUIDANCE } from './templates/context7-guidance.js';
import { initializeLearnConfig } from './learn-config.js';

const require = createRequire(import.meta.url);
const { version: VERSION } = require('../../package.json');

type InitCommandOptions = {
  tools?: string;
  force?: boolean;
  locale?: SupportedLocale;
  update?: boolean;
  context7?: boolean;
  configLocale?: SupportedLocale;
};

export class InitCommand {
  private readonly toolsArg?: string;
  private readonly force: boolean;
  private locale: SupportedLocale;
  private readonly isUpdate: boolean;
  private readonly context7Arg?: boolean;
  private readonly configLocale?: SupportedLocale;
  private context7Enabled: boolean = false;

  constructor(options: InitCommandOptions = {}) {
    this.toolsArg = options.tools;
    this.force = options.force ?? false;
    this.locale = options.locale ?? 'en';
    this.isUpdate = options.update ?? false;
    this.context7Arg = options.context7;
    this.configLocale = options.configLocale;
  }

  async execute(targetPath: string = '.'): Promise<SupportedLocale> {
    const resolvedPath = path.resolve(targetPath);

    // Ensure target directory exists
    await FileSystemUtils.ensureDir(resolvedPath);
    const canonicalProjectRoot = await fs.promises.realpath(resolvedPath);

    // Create .learn/ directory in the target project
    const learnDir = await FileSystemUtils.ensureSafeDirectories(canonicalProjectRoot, LEARN_DIR);
    const topicsDir = await FileSystemUtils.ensureSafeDirectories(learnDir, 'topics');
    const config = await initializeLearnConfig(learnDir, this.configLocale);
    this.locale = config.state.locale;
    const m = getMessages(this.locale);

    // Run v0→v1 migration for any existing learning data
    const { migrateAll, migrateAllV1ToV2 } = await import('./learn-protocol/index.js');
    const v0Report = await migrateAll(topicsDir);
    const v0Failure = v0Report.results.find(
      (result) => result.reason === 'error' || result.reason === 'not_v0',
    );
    if (v0Failure) throw new Error(m.init.migrationFailed(v0Failure.topic));
    if (v0Report.migratedCount > 0) {
      console.log(chalk.green(m.init.migrationComplete(v0Report.migratedCount)));
    }
    const v2Report = await migrateAllV1ToV2(topicsDir);
    if (v2Report.migratedCount > 0) {
      console.log(chalk.green(m.init.migrationV2Complete(v2Report.migratedCount)));
    }

    console.log(chalk.bold(m.init.header));

    // Detect available tools
    const availableTools = await this.detectTools(resolvedPath);

    // Select tools
    let selectedTools: AIToolOption[];
    if (this.toolsArg === 'all') {
      selectedTools = availableTools.filter((t) => t.available);
    } else if (this.toolsArg === 'none') {
      selectedTools = [];
    } else if (this.toolsArg) {
      const toolIds = this.toolsArg.split(',').map((t) => t.trim());
      selectedTools = availableTools.filter((t) => toolIds.includes(t.value));
    } else if (this.isUpdate || !isInteractive()) {
      // Update mode or non-interactive: auto-detect existing tool dirs
      selectedTools = availableTools.filter((t) => t.available && this.hasToolDir(resolvedPath, t));
    } else {
      selectedTools = await this.interactiveSelect(availableTools);
    }

    if (selectedTools.length === 0) {
      console.log(chalk.yellow(m.init.noToolsSelected));
      console.log(
        chalk.dim(
          m.init.availableTools(
            availableTools
              .filter((t) => t.available)
              .map((t) => t.value)
              .join(', '),
          ),
        ),
      );
      return this.locale;
    }

    // Context7 setup
    this.context7Enabled = await this.promptContext7();
    if (this.context7Enabled) {
      console.log(chalk.dim(m.init.context7Enabled));
    }

    console.log('');

    const generatedFiles: GeneratedFile[] = [];
    for (const tool of selectedTools) {
      generatedFiles.push(...this.generatedFilesForTool(canonicalProjectRoot, tool));
    }
    try {
      await FileSystemUtils.writeGeneratedFiles(generatedFiles, this.force, canonicalProjectRoot);
    } catch (error) {
      if (error instanceof GeneratedFileConflictError) {
        throw new Error(m.init.generatedFileConflict(error.filePath, error.forceAllowed), {
          cause: error,
        });
      }
      throw error;
    }

    for (const tool of selectedTools) {
      console.log(chalk.green(m.init.skillGenerated(tool.name)));
    }

    console.log('');
    console.log(chalk.bold(m.init.initComplete));
    console.log(chalk.dim(m.init.globalDataPath(LEARN_DIR)));
    console.log(chalk.dim(m.init.startLearning('/learn:topic javascript')));

    console.log(chalk.bold(m.init.availableCommands));
    const cmd = m.init.cmdLine;
    console.log(
      cmd(chalk.cyan('/learn:study [topic-name]'), chalk.dim(m.init.studyCommandDescription)),
    );
    console.log(
      cmd(chalk.cyan('/learn:topic <topic-name>'), chalk.dim(m.init.topicCommandDescription)),
    );
    console.log(
      cmd(chalk.cyan('/learn:explain <concept-name>'), chalk.dim(m.init.explainCommandDescription)),
    );
    console.log(
      cmd(
        chalk.cyan('/learn:practice <concept-name>'),
        chalk.dim(m.init.practiceCommandDescription),
      ),
    );
    console.log(
      cmd(chalk.cyan('/learn:review [topic-name]'), chalk.dim(m.init.reviewCommandDescription)),
    );
    console.log(
      cmd(chalk.cyan('/learn:status [topic-name]'), chalk.dim(m.init.statusCommandDescription)),
    );
    console.log(
      cmd(chalk.cyan('/learn:quiz <concept-name>'), chalk.dim(m.init.quizCommandDescription)),
    );
    console.log('');

    if (this.context7Enabled) {
      console.log(chalk.dim(m.init.context7SetupHint));
      console.log('');
    }
    return this.locale;
  }

  private async promptContext7(): Promise<boolean> {
    const m = getMessages(this.locale);

    if (this.context7Arg === true) return true;
    if (this.context7Arg === false) return false;

    if (!isInteractive()) return true;

    const { confirm } = await import('@inquirer/prompts');
    return confirm({ message: m.init.context7Prompt, default: true });
  }

  private async detectTools(_resolvedPath: string): Promise<AIToolOption[]> {
    return AI_TOOLS;
  }

  private hasToolDir(resolvedPath: string, tool: AIToolOption): boolean {
    return [tool.skillsDir, ...(tool.detectionPaths ?? [])].filter(Boolean).some((candidate) => {
      try {
        fs.statSync(path.join(resolvedPath, candidate!));
        return true;
      } catch {
        return false;
      }
    });
  }

  private async interactiveSelect(tools: AIToolOption[]): Promise<AIToolOption[]> {
    const availableTools = tools.filter((t) => t.available && t.skillsDir);
    const { checkbox } = await import('@inquirer/prompts');

    // Auto-detect existing tool dirs and pre-select them
    const detected = availableTools.filter((t) => this.hasToolDir(process.cwd(), t));
    const detectedValues = new Set(detected.map((t) => t.value));

    const choices = availableTools.map((t) => ({
      name: t.name,
      value: t.value,
      checked: detectedValues.has(t.value),
    }));

    const selected = await checkbox({
      message: getMessages(this.locale).init.interactiveSelectPrompt,
      choices,
      pageSize: 15,
    });

    return availableTools.filter((t) => selected.includes(t.value));
  }

  private generatedFilesForTool(resolvedPath: string, tool: AIToolOption): GeneratedFile[] {
    if (!tool.skillsDir) return [];
    const skillTemplates = getSkillTemplates();
    const files: GeneratedFile[] = [];

    for (const entry of skillTemplates) {
      const skillDir = path.join(resolvedPath, tool.skillsDir!, 'skills', entry.dirName);
      const skillFile = path.join(skillDir, 'SKILL.md');
      const content = generateSkillContent(
        entry.template,
        VERSION,
        this.context7Enabled && isDocVerificationTemplate(entry.workflowId)
          ? injectContext7Guidance
          : undefined,
      );
      files.push({ path: skillFile, content });
    }

    const adapter = CommandAdapterRegistry.get(tool.value);
    if (adapter) {
      for (const cmd of generateCommands(getCommandContents(), adapter)) {
        files.push({ path: path.resolve(resolvedPath, cmd.path), content: cmd.fileContent });
      }
    }
    return files;
  }
}

const DOC_VERIFICATION_WORKFLOWS = new Set(['study', 'topic', 'explain', 'practice', 'quiz']);

function isDocVerificationTemplate(workflowId: string): boolean {
  return DOC_VERIFICATION_WORKFLOWS.has(workflowId);
}

function injectContext7Guidance(instructions: string): string {
  const marker = instructions.includes('\n## Decision Gates')
    ? '\n## Decision Gates'
    : '\n## Execution Steps';
  const index = instructions.indexOf(marker);
  if (index === -1) return instructions + CONTEXT7_GUIDANCE;
  return instructions.slice(0, index) + CONTEXT7_GUIDANCE + instructions.slice(index);
}
