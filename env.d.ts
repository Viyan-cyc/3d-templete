/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module 'vite-plugin-mock' {
  import type { Plugin } from 'vite'
  interface MockOptions {
    mockPath?: string
    enable?: boolean
    ignore?: RegExp | ((fileName: string) => boolean)
  }
  export function viteMockServe(options?: MockOptions): Plugin[]
}
