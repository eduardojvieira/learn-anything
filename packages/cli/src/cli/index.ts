import { Command } from 'commander';
import { createRequire } from 'module';
import path from 'path';
import { promises as fs } from 'fs';
import chalk from 'chalk';
import { AI_TOOLS } from '../core/config.js';
import { resolveLocale } from '../i18n/index.js';
import { getMessages } from '../i18n/index.js';

const program = new Command();
const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const langIdx = process.argv.indexOf('--lang');
const earlyLocale = langIdx !== -1 ? resolveLocale(process.argv[langIdx + 1]) : resolveLocale();
const m = getMessages(earlyLocale);

program.name('learn-anything').description(m.cli.programDescription).version(version);

const availableToolIds = AI_TOOLS.filter((tool) => tool.skillsDir).map((tool) => tool.value);

program
  .command('init [path]')
  .description(m.cli.initCommandDescription)
  .option('--tools <tools>', m.cli.toolsOptionDescription(availableToolIds.join(', ')))
  .option('--force', m.cli.forceOption)
  .option('--lang <locale>', m.cli.langOption)
  .option('--context7', m.cli.context7Option)
  .option('--no-context7', m.cli.noContext7Option)
  .action(
    async (
      targetPath = '.',
      options?: {
        tools?: string;
        force?: boolean;
        lang?: string;
        context7?: boolean;
      },
    ) => {
      const cliLocale = resolveLocale(options?.lang);
      const localeMsgs = cliLocale !== earlyLocale ? getMessages(cliLocale) : m;
      const mc = localeMsgs.cli;
      try {
        const resolvedPath = path.resolve(targetPath);

        try {
          const stats = await fs.stat(resolvedPath);
          if (!stats.isDirectory()) {
            throw new Error(mc.notDirectory(targetPath));
          }
        } catch (error: any) {
          if (error.code === 'ENOENT') {
            console.log(chalk.yellow(mc.dirNotExist(targetPath)));
          } else if (error.message && error.message.includes('not a directory')) {
            throw error;
          } else {
            throw new Error(mc.cannotAccess(targetPath, error.message), { cause: error });
          }
        }

        const { InitCommand } = await import('../core/init.js');
        const initCommand = new InitCommand({
          tools: options?.tools,
          force: options?.force,
          locale: cliLocale,
          configLocale: options?.lang ? cliLocale : undefined,
          context7: options?.context7,
        });
        const effectiveLocale = await initCommand.execute(targetPath);
        console.log(chalk.dim(getMessages(effectiveLocale).cli.serveHint));
      } catch (error) {
        console.log();
        console.error(chalk.red(mc.errorPrefix((error as Error).message)));
        process.exit(1);
      }
    },
  );

program
  .command('update [path]')
  .description(m.cli.updateCommandDescription)
  .option('--force', m.cli.forceOption)
  .option('--lang <locale>', m.cli.langOption)
  .action(async (targetPath = '.', options?: { force?: boolean; lang?: string }) => {
    const cliLocale = resolveLocale(options?.lang);
    const localeMsgs = cliLocale !== earlyLocale ? getMessages(cliLocale) : m;
    const mc = localeMsgs.cli;
    try {
      const resolvedPath = path.resolve(targetPath);

      const { InitCommand } = await import('../core/init.js');
      const initCommand = new InitCommand({
        update: true,
        force: options?.force,
        locale: cliLocale,
        configLocale: options?.lang ? cliLocale : undefined,
      });
      const effectiveLocale = await initCommand.execute(resolvedPath);
      console.log(chalk.green(getMessages(effectiveLocale).cli.updateComplete));
      console.log(chalk.dim(getMessages(effectiveLocale).cli.serveHint));
    } catch (error) {
      console.log();
      console.error(chalk.red(mc.errorPrefix((error as Error).message)));
      process.exit(1);
    }
  });

program
  .command('serve [path]')
  .description(m.cli.serveCommandDescription)
  .option('--port <number>', m.cli.portOption, parseInt)
  .option('--strict-port', m.cli.strictPortOption)
  .option('--no-open', m.cli.noOpenOption)
  .option('--lang <locale>', m.cli.langOption)
  .action(
    async (
      targetPath = '.',
      options?: { port?: number; strictPort?: boolean; open?: boolean; lang?: string },
    ) => {
      const cliLocale = resolveLocale(options?.lang);
      const selectedLocale = options?.lang ? cliLocale : undefined;
      const mc = options?.lang ? getMessages(cliLocale).cli : m.cli;
      try {
        const { executeServe } = await import('../core/serve.js');
        await executeServe({
          targetPath,
          port: options?.port,
          strictPort: options?.strictPort,
          open: options?.open,
          locale: selectedLocale,
        });
      } catch (error) {
        console.log();
        console.error(chalk.red(mc.errorPrefix((error as Error).message)));
        process.exit(1);
      }
    },
  );

program.parse();
