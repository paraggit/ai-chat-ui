/** @type {Record<string, string>} */
const LANGUAGE_ALIASES = {
  js: 'javascript',
  javascript: 'javascript',
  ts: 'typescript',
  typescript: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  py: 'python',
  python: 'python',
  python3: 'python',
  rb: 'ruby',
  ruby: 'ruby',
  sh: 'bash',
  shell: 'bash',
  bash: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  yaml: 'yaml',
  md: 'markdown',
  markdown: 'markdown',
  'c++': 'cpp',
  cpp: 'cpp',
  cs: 'csharp',
  csharp: 'csharp',
  golang: 'go',
  go: 'go',
  rs: 'rust',
  rust: 'rust',
  kt: 'kotlin',
  kotlin: 'kotlin',
  ps1: 'powershell',
  powershell: 'powershell',
  dockerfile: 'docker',
  docker: 'docker',
  json: 'json',
  html: 'html',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  sql: 'sql',
  java: 'java',
  c: 'c',
  php: 'php',
  swift: 'swift',
  r: 'r',
  lua: 'lua',
  perl: 'perl',
  scala: 'scala',
  dart: 'dart',
  vue: 'vue',
  svelte: 'svelte',
  text: 'text',
  plaintext: 'text',
  txt: 'text',
};

/**
 * @param {string | undefined} raw
 * @returns {string}
 */
export function normalizeLanguage(raw) {
  if (!raw) return 'text';
  const key = raw.toLowerCase().trim();
  return LANGUAGE_ALIASES[key] || key;
}

/**
 * Guess language from code content when the model omits a fence label.
 * @param {string} code
 * @returns {string}
 */
export function detectLanguage(code) {
  const sample = code.slice(0, 800).trim();

  if (/^<\?php/i.test(sample) || /<\?=\s/.test(sample)) return 'php';
  if (/^#!\/usr\/bin\/env (python|bash|sh)/i.test(sample)) {
    return sample.includes('python') ? 'python' : 'bash';
  }
  if (/^import .+ from ['"]/.test(sample) || /export (default )?(function|class|const)/.test(sample)) {
    return 'javascript';
  }
  if (/^(interface|type) \w+/.test(sample) || /:\s*(string|number|boolean|void)\b/.test(sample)) {
    return 'typescript';
  }
  if (/^(def |class .+\(|import |from .+ import |print\()/m.test(sample)) return 'python';
  if (/^(package |public class |import java\.)/m.test(sample)) return 'java';
  if (/^#include [<"]/.test(sample)) return 'cpp';
  if (/^(fn |let mut |impl |use std::)/m.test(sample)) return 'rust';
  if (/^(func |package main|import \()/m.test(sample)) return 'go';
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE TABLE)\b/im.test(sample)) return 'sql';
  if (/^(\{\s*"[^"]+"\s*:|<\?xml|<!DOCTYPE html|<html\b)/im.test(sample)) {
    if (/^\s*\{/.test(sample)) return 'json';
    return 'html';
  }
  if (/^\s*\.\w[\w-]*\s*\{/.test(sample) || /@media/.test(sample)) return 'css';
  if (/^(dockerfile|from |run |cmd |entrypoint )/im.test(sample)) return 'docker';

  return 'text';
}

/**
 * @param {string | undefined} className
 * @param {string} code
 * @returns {string}
 */
export function resolveLanguage(className, code) {
  const match = /language-([\w+#.-]+)/i.exec(className || '');
  if (match?.[1]) {
    return normalizeLanguage(match[1]);
  }
  return detectLanguage(code);
}

/**
 * @param {string} className
 * @param {string} code
 * @param {import('hast').Element | undefined} [node]
 */
export function isBlockCode(className, code, node) {
  if (/language-[\w+#.-]+/i.test(className || '')) return true;
  if (code.includes('\n')) return true;
  if (node?.position && node.position.start.line !== node.position.end.line) return true;
  return false;
}
