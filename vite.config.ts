import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// 生产构建注入严格 CSP。
// 只在 build 阶段注入：开发时 Vite 需要 ws 连接与内联脚本做 HMR，注入会直接打断开发。
// 说明：style-src 必须保留 'unsafe-inline'，因为界面大量使用 React 的 style={{}} 内联样式，
// 而 CSP 的 style-src 同时管 <style> 元素与 style 属性。
// 由于页面通过 file:// 加载，资源来源同时列出 'self' 与 file:。
const CSP = [
  "default-src 'self' file:",
  "script-src 'self' file:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' file: data:",
  "font-src 'self' file:",
  "connect-src 'self' file:",
  "media-src 'self' file:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'ai-chronicle:csp',
    apply: 'build',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicyPlugin()],
  test: {
    // 单元测试只覆盖纯逻辑（格式化、摘要、日志解析），不依赖 DOM
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
  },
})
