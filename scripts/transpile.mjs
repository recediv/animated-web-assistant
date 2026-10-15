import { readdir, readFile, writeFile, mkdir, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import ts from 'typescript';

const workspace = resolve(import.meta.dirname, '..');
const compilationRoot = resolve(workspace, '.local/compilation');
const compiledTrees = new Set();
// A runner owns only its own tree. Cleanup also covers failed setup and failed
// checks; no caller needs to duplicate teardown or delete another runner's work.
process.once('exit', () => {
  for (const destination of compiledTrees) {
    try {
      rmSync(destination, { recursive: true, force: true });
    } catch (error) {
      console.error(`Could not remove compilation cache ${destination}: ${error.message}`);
      process.exitCode = 1;
    }
  }
});

export async function transpileTree(source, destination) {
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const input = join(source, entry.name);
    const output = join(destination, entry.name);
    if (entry.isDirectory()) await transpileTree(input, output);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      const content = await readFile(input, 'utf8');
      const result = ts.transpileModule(content, {
        fileName: input,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          useDefineForClassFields: true,
          isolatedModules: true,
        },
      });
      await writeFile(output.replace(/\.ts$/, '.js'), result.outputText, 'utf8');
    } else await copyFile(input, output);
  }
}

export async function prepareCompiledTree(name, directories = ['src', 'demo', 'tests/unit']) {
  if (!/^[a-z]+$/.test(name)) throw new Error('Unsafe compilation directory');
  await mkdir(compilationRoot, { recursive: true });
  const destination = resolve(await mkdtemp(resolve(compilationRoot, `.tmp-${name}-`)));
  if (!destination.startsWith(`${compilationRoot}${sep}.tmp-${name}-`))
    throw new Error('Unsafe compilation directory');
  compiledTrees.add(destination);
  try {
    for (const directory of directories) {
      const source = resolve(workspace, directory);
      const target = resolve(destination, directory);
      if (!source.startsWith(`${workspace}${sep}`) || !target.startsWith(`${destination}${sep}`))
        throw new Error('Compilation source must stay inside workspace');
      await transpileTree(source, target);
    }
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    compiledTrees.delete(destination);
    throw error;
  }
}
