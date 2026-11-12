import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { importPlan } from './import-agent-skills.mjs';

const skill = (dir, name) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Test skill.\n---\n\nInstructions.\n`);
};

test('imports only skills missing from the platform library', () => {
  const base = mkdtempSync(join(tmpdir(), 'platform-skills-import-'));
  try {
    const source = join(base, 'project', '.agents', 'skills');
    const destination = join(base, 'library', 'Skills');
    skill(join(source, 'alpha'), 'alpha');
    skill(join(source, 'beta'), 'beta');
    skill(join(destination, 'existing'), 'alpha');
    assert.deepEqual(importPlan(source, destination).map(({ name, action }) => [name, action]), [
      ['alpha', 'skip-installed'],
      ['beta', 'import'],
    ]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('no project skills produces an empty plan', () => {
  const base = mkdtempSync(join(tmpdir(), 'platform-skills-empty-'));
  try {
    assert.deepEqual(importPlan(join(base, 'absent'), join(base, 'Skills')), []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
