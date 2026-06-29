import type { MockMethod } from 'vite-plugin-mock'

export default [
  {
    url: '/api/scene/data',
    method: 'get',
    response: (): { code: number; data: Record<string, unknown>; message: string } => {
      return {
        code: 0,
        data: {
          config: {
            backgroundColor: '#1a1a2e',
            fogColor: '#1a1a2e',
            fogNear: 10,
            fogFar: 100,
            cameraPosition: [8, 6, 12] as [number, number, number],
            cameraTarget: [0, 0, 0] as [number, number, number],
            enableShadows: true,
          },
          lights: [
            { type: 'ambient', color: '#ffffff', intensity: 0.4 },
            { type: 'directional', color: '#ffffff', intensity: 1.0, position: [5, 10, 5], castShadow: true },
            { type: 'point', color: '#ff6b6b', intensity: 0.8, position: [-3, 2, -3], castShadow: false },
          ],
          models: [
            {
              id: 'ground',
              type: 'plane',
              position: [0, -0.01, 0] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [1, 1, 1] as [number, number, number],
              color: '#2a2a3e',
            },
            {
              id: 'agv-001',
              type: 'cube',
              position: [-2, 0.5, 2] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [0.8, 0.4, 1.2] as [number, number, number],
              color: '#4ecdc4',
              // ★ AGV 气泡卡片 — 常显
              card: {
                cardType: 'agv',
                mode: 'always',
                offset: [0, 1.2, 0] as [number, number, number],
                props: {
                  status: 'online',
                  label: 'AGV-001',
                  battery: 85,
                },
              },
            },
            {
              id: 'agv-002',
              type: 'cube',
              position: [2, 0.5, -1] as [number, number, number],
              rotation: [0, 0.4, 0] as [number, number, number],
              scale: [0.8, 0.4, 1.2] as [number, number, number],
              color: '#f0c040',
              // ★ AGV 气泡卡片 — 常显
              card: {
                cardType: 'agv',
                mode: 'always',
                offset: [0, 1.2, 0] as [number, number, number],
                props: {
                  status: 'busy',
                  label: 'AGV-002',
                  battery: 42,
                },
              },
            },
            {
              id: 'container-A1',
              type: 'cube',
              position: [-1.5, 1, 1] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [1.2, 1.2, 1.2] as [number, number, number],
              color: '#e94560',
              // ★ 集装箱卡片 — 点击切换
              card: {
                cardType: 'container',
                mode: 'click',
                interactiveGroup: 'container',
                offset: [0, 1.8, 0] as [number, number, number],
                props: {
                  title: '集装箱 A1',
                  cargo: '电子产品',
                  weight: '12.5 吨',
                  destination: '上海港',
                },
              },
            },
            {
              id: 'container-B2',
              type: 'cube',
              position: [1.5, 1, -1.5] as [number, number, number],
              rotation: [0, 0.3, 0] as [number, number, number],
              scale: [1.2, 1.2, 1.2] as [number, number, number],
              color: '#7c3aed',
              // ★ 集装箱卡片 — 点击切换
              card: {
                cardType: 'container',
                mode: 'click',
                interactiveGroup: 'container',
                offset: [0, 1.8, 0] as [number, number, number],
                props: {
                  title: '集装箱 B2',
                  cargo: '机械零件',
                  weight: '8.2 吨',
                  destination: '深圳港',
                },
              },
            },
          ],
        },
        message: 'ok',
      }
    },
  },
] as MockMethod[]
