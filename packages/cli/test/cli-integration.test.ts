import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LEARN_DIR } from '../src/core/config.js';
import { InitCommand } from '../src/core/init.js';
import { initializeLearnConfig, learnConfigStore } from '../src/core/learn-config.js';

describe('CLI Integration — init', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-cli-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should not create .learn/site/ directory after init', async () => {
    const cmd = new InitCommand({ tools: 'none' });
    await cmd.execute(tmpDir);

    const sd = path.join(tmpDir, LEARN_DIR, 'site');
    expect(fs.existsSync(sd)).toBe(false);
  });

  it('should not affect existing .learn/ data after init', async () => {
    const topicsDir = path.join(tmpDir, LEARN_DIR, 'topics', 'python');
    fs.mkdirSync(topicsDir, { recursive: true });
    const statePath = path.join(topicsDir, 'state.json');
    fs.writeFileSync(statePath, '{"slug":"python"}', 'utf-8');

    const cmd = new InitCommand({ tools: 'none' });
    await cmd.execute(tmpDir);

    expect(fs.existsSync(statePath)).toBe(true);
    const sd = path.join(tmpDir, LEARN_DIR, 'site');
    expect(fs.existsSync(sd)).toBe(false);
  });

  it('uses existing config locale, preserves it for force, and changes only an explicit locale', async () => {
    const learnDir = path.join(tmpDir, LEARN_DIR);
    const initial = await initializeLearnConfig(learnDir, 'es');
    const beforeBytes = fs.readFileSync(path.join(learnDir, 'config.json'));
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...values: unknown[]) => {
      logs.push(values.join(' '));
    };
    try {
      expect(await new InitCommand({ tools: 'none' }).execute(tmpDir)).toBe('es');
      expect(logs.join('\n')).toContain('No se seleccionaron herramientas de IA.');
      expect(fs.readFileSync(path.join(learnDir, 'config.json'))).toEqual(beforeBytes);
      expect((await learnConfigStore(learnDir).read()).revision).toBe(initial.revision);

      await new InitCommand({ tools: 'none', force: true }).execute(tmpDir);
      expect(fs.readFileSync(path.join(learnDir, 'config.json'))).toEqual(beforeBytes);

      await new InitCommand({ tools: 'none', update: true, configLocale: 'zh-CN' }).execute(tmpDir);
      const changed = await learnConfigStore(learnDir).read();
      expect(changed.revision).not.toBe(initial.revision);
      expect(changed.state).toEqual({ ...initial.state, locale: 'zh-CN' });
    } finally {
      console.log = originalLog;
    }
  });

  it('generates seven runtime-only skills without V1 helper scripts', async () => {
    await new InitCommand({ tools: 'claude', context7: false }).execute(tmpDir);
    const skillsDir = path.join(tmpDir, '.claude', 'skills');
    const names = fs.readdirSync(skillsDir).sort();
    expect(names).toEqual([
      'learn-anything-explain',
      'learn-anything-practice',
      'learn-anything-quiz',
      'learn-anything-review',
      'learn-anything-status',
      'learn-anything-study',
      'learn-anything-topic',
    ]);
    const study = fs.readFileSync(path.join(skillsDir, 'learn-anything-study', 'SKILL.md'), 'utf8');
    expect(study).toContain('learnctl study');
    expect(fs.existsSync(path.join(skillsDir, 'learn-anything-study', 'scripts'))).toBe(false);
    expect(fs.existsSync(path.join(skillsDir, 'learn-anything-topic', 'scripts'))).toBe(false);
  });

  it('injects Context7 before the workflow execution contract only when enabled', async () => {
    await new InitCommand({ tools: 'claude', context7: true }).execute(tmpDir);
    const enabled = fs.readFileSync(
      path.join(tmpDir, '.claude', 'skills', 'learn-anything-study', 'SKILL.md'),
      'utf8',
    );
    expect(enabled).toContain('## Documentation Verification (Context7)');
    expect(enabled.indexOf('## Documentation Verification (Context7)')).toBeLessThan(
      enabled.indexOf('## Decision Gates'),
    );

    const disabledDir = path.join(tmpDir, 'disabled');
    await new InitCommand({ tools: 'claude', context7: false }).execute(disabledDir);
    const disabled = fs.readFileSync(
      path.join(disabledDir, '.claude', 'skills', 'learn-anything-study', 'SKILL.md'),
      'utf8',
    );
    expect(disabled).not.toContain('## Documentation Verification (Context7)');
  });

  it('suggests the V2 topic command for the first topic', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...values: unknown[]) => {
      logs.push(values.join(' '));
    };
    try {
      await new InitCommand({ tools: 'claude', context7: false }).execute(tmpDir);
    } finally {
      console.log = originalLog;
    }
    expect(logs.join('\n')).toContain('/learn:topic javascript');
    expect(logs.join('\n')).not.toContain('Run /learn javascript');
  });
});
