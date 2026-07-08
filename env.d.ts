/// <reference types="vite/client" />

declare module '*.glb?url' {
  const url: string
  export default url
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
