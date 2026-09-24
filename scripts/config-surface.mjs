/**
 * 配置面（config surface）派生：从「配置来源文件」算出这个版本对外暴露的配置项清单。
 *
 * 为什么单独抽出来：
 * - 源码仓的导出脚本（scripts/export-config-surface.mjs）与文档站的校验脚本
 *   （scripts/check-config-coverage.mjs）必须用**同一份**解析逻辑，否则两边口径会分叉；
 * - 文档站可能独立成仓，因此本模块不依赖任何仓内其它文件，只吃文本。
 *
 * 只导出「名字 + 是否必填 + 来源文件」，**不导出取值**：
 * 这份清单会被传到文档仓的 CI，取值里可能含内部厂商地址（如镜像仓库域名），
 * 没必要跟着走。
 */

/** .env.example：抓取 `KEY=` 与注释掉的 `#KEY=`（注释掉的是选填项） */
export function parseEnvExampleKeys(text) {
  const keys = new Map(); // name -> required
  for (const line of text.split('\n')) {
    const match = line.match(/^(\s*)(#?)\s*([A-Z][A-Z0-9_]+)\s*=(.*)$/);
    if (!match) continue;
    const [, , commented, name, value] = match;
    // 未注释 = 交付时必须处理（模板里是占位值）；注释掉 = 选填
    const required = commented !== '#';
    if (!keys.has(name)) keys.set(name, { required, source: '.env.example' });
    void value;
  }
  return keys;
}

/** docker-compose.yml：`${VAR}` / `${VAR:-默认}`（有默认 → 选填）/ `${VAR:?报错}`（必填） */
export function parseComposeVars(text) {
  const keys = new Map();
  for (const match of text.matchAll(/\$\{([A-Z][A-Z0-9_]+)(:-|:\?)?/g)) {
    const [, name, modifier] = match;
    const required = modifier === ':?';
    const prev = keys.get(name);
    // 同一变量多处引用时，只要有一处要求必填就算必填
    if (!prev || (required && !prev.required))
      keys.set(name, { required, source: 'docker-compose.yml' });
  }
  return keys;
}

/**
 * 合并多来源，产出清单。
 *
 * @param {{ envExampleText?: string, composeText?: string }} input
 * @returns {{ sources: string[], keys: Array<{name: string, source: string, required: boolean}> }}
 */
export function buildConfigSurface({ envExampleText = '', composeText = '' } = {}) {
  const merged = new Map();
  const sources = [];

  if (envExampleText) {
    sources.push('.env.example');
    for (const [name, meta] of parseEnvExampleKeys(envExampleText)) merged.set(name, { ...meta });
  }
  if (composeText) {
    sources.push('docker-compose.yml');
    for (const [name, meta] of parseComposeVars(composeText)) {
      const prev = merged.get(name);
      if (!prev) merged.set(name, { ...meta });
      else if (meta.required) prev.required = true;
    }
  }

  const keys = [...merged.entries()]
    .map(([name, meta]) => ({ name, ...meta }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { sources, keys };
}
