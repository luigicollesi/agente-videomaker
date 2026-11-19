#!/usr/bin/env node
/**
 * One-time, opt-in import of repository-local .agents/skills into the desktop
 * application's own skills library. No project skill is moved or deleted.
 *
 * Preview: node scripts/import-agent-skills.mjs
 * Import:  node scripts/import-agent-skills.mjs --apply
 */
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSkills, mySkillsDir, skillsIn } from '../packages/openfilm/src/skills.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '..');
const source = join(repository, '.agents', 'skills');

/** A conservative plan: a skill with the same public name is never replaced. */
export function importPlan(src = source, destination = mySkillsDir()) {
  const available = existsSync(src) ? skillsIn(src, 'mine') : [];
  const installed = new Set(skillsIn(destination, 'mine').map((s) => s.name));
  const seen = new Set();
  return available.map((skill) => {
    const duplicate = seen.has(skill.name);
    seen.add(skill.name);
    return {
      name: skill.name,
      folder: skill.folder,
      action: installed.has(skill.name) ? 'skip-installed'
        : duplicate ? 'skip-duplicate' : 'import',
    };
  });
}

export async function main(args = process.argv.slice(2)) {
  if (args.some((a) => !['--apply', '--help'].includes(a))) {
    console.error('Usage: node scripts/import-agent-skills.mjs [--apply]');
    return 2;
  }
  if (args.includes('--help')) {
    console.log('Preview repository skills by default. Use --apply to copy them into the platform library; no existing skill is overwritten.');
    return 0;
  }
  const apply = args.includes('--apply');
  const destination = mySkillsDir();
  const plan = importPlan();
  console.log(`Source:      ${source}`);
  console.log(`Destination: ${destination}`);
  if (!plan.length) {
    console.error('No project skills were found. Nothing to import.');
    return 1;
  }
  let added = 0;
  for (const item of plan) {
    if (item.action !== 'import') {
      console.log(`SKIP    ${item.name}: ${item.action}`);
      continue;
    }
    if (!apply) {
      console.log(`PREVIEW ${item.name}`);
      continue;
    }
    const installed = await addSkills(item.folder, {
      mine: destination,
      move: false,
      origin: { from: 'folder', address: item.folder },
    });
    if (installed.length !== 1 || installed[0].name !== item.name) {
      throw new Error(`Unexpected import result for ${item.name}`);
    }
    console.log(`IMPORTED ${item.name}`);
    added++;
  }
  if (!apply) console.log('\nNo changes made. Run with --apply after reviewing the skill sources.');
  else console.log(`\nImported ${added} skills. Project copies were preserved. Restart the agent session to refresh the skill list.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
