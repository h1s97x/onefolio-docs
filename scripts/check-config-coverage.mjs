#!/usr/bin/env node
/**
 * 文档站「配置项覆盖」校验
 *
 * 交付现场最贵的一类问题是「客户照着文档配完，起不来」——通常是新增了环境变量，
 * 但配置参考页没写。这类分叉不会让编译或测试失败，只会在部署那天暴露。
 *
 * 两种模式：
 *
 *   1) 同仓模式（默认，源码仓 CI 用）
 *      node docs-site/scripts/check-config-coverage.mjs
 *      直接从 .env.example + docker-compose.yml 派生配置面。
 *
 *   2) 工件模式（文档站独立成仓后用）
 *      node scripts/check-config-coverage.mjs --surface config-surface.json
 *      读取源码仓发布的 config-surface.json（见源码仓 scripts/export-config-surface.mjs）。
 *      单向依赖：文档仓只消费清单，不需要拿到源码仓权限。
 *
 * 可选参数：--doc <path> 指定配置参考页（默认 guide/configuration.md）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildConfigSurface } from './config-surface.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
/** docs-site/scripts → docs-site */
const docsRoot = path.resolve(scriptDir, '..');
/** docs-site/scripts → 仓根（独立成仓后这里是文档仓根，不会有 .env.example） */
const repoRoot = path.resolve(scriptDir, '..', '..');

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

const docPath = path.resolve(docsRoot, readArg('--doc') ?? 'guide/configuration.md');
const surfacePath = readArg('--surface');

let doc;
try {
  doc = readFileSync(docPath, 'utf8');
} catch {
  console.error(`❌ 未找到文档站配置参考页：${path.relative(process.cwd(), docPath)}`);
  process.exit(1);
}

let surface;
let mode;

if (surfacePath) {
  mode = `工件模式（${surfacePath}）`;
  try {
    const artifact = JSON.parse(readFileSync(surfacePath, 'utf8'));
    if (!Array.isArray(artifact.keys) || artifact.keys.length === 0) {
      console.error('❌ 配置面工件里没有 keys（文件损坏或版本不匹配）');
      process.exit(1);
    }
    surface = artifact;
  } catch (error) {
    console.error(`❌ 无法读取配置面工件 ${surfacePath}：${error.message}`);
    process.exit(1);
  }
} else {
  mode = '同仓模式（.env.example + docker-compose.yml）';
  const envExamplePath = path.join(repoRoot, '.env.example');
  const composePath = path.join(repoRoot, 'docker-compose.yml');
  let envExampleText;
  let composeText;
  try {
    envExampleText = readFileSync(envExamplePath, 'utf8');
    composeText = readFileSync(composePath, 'utf8');
  } catch {
    console.error('❌ 未找到配置来源文件（.env.example / docker-compose.yml）。');
    console.error('   若文档站已独立成仓，请改用工件模式：');
    console.error('     node scripts/check-config-coverage.mjs --surface config-surface.json');
    process.exit(1);
  }
  surface = buildConfigSurface({ envExampleText, composeText });
}

const missing = surface.keys.filter((key) => !doc.includes(key.name)).map((key) => key.name);

if (missing.length > 0) {
  console.error(
    `❌ 有 ${missing.length} 个配置项未出现在 ${path.relative(process.cwd(), docPath)}：`,
  );
  for (const name of missing) console.error(`   - ${name}`);
  console.error(
    '\n请在配置参考页补上这些变量的说明与默认值（新增环境变量时最容易漏，' +
      '漏了会在客户部署现场才暴露）。',
  );
  process.exit(1);
}

const requiredCount = surface.keys.filter((key) => key.required).length;
const extra =
  typeof surface.version === 'string' && surface.version ? `，对应版本 ${surface.version}` : '';
console.log(
  `✅ 配置项覆盖完整（${surface.keys.length} 项，其中必填 ${requiredCount} 项${extra}）· ${mode}`,
);
