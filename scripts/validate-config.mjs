import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(import.meta.dirname, '..');
const inputSource = await readFile(resolve(root, 'src/config/validate.ts'), 'utf8');
const source = ts.transpileModule(inputSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { validateConfig } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const input = JSON.parse(await readFile(resolve(root, 'demo/assistant.config.json'), 'utf8'));
const validation = validateConfig(input, 'https://demo.example/');
for (const warning of validation.warnings) console.warn(warning);
if (!validation.config) {
  for (const error of validation.errors) console.error(error);
  process.exitCode = 1;
} else console.log('Demo configuration is valid.');
