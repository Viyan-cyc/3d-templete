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
              id: 'red-cube',
              type: 'cube',
              position: [-1.5, 0.5, 0] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [1, 1, 1] as [number, number, number],
              color: '#ff6b6b',
            },
            {
              id: 'teal-sphere',
              type: 'sphere',
              position: [1.5, 0.8, 0] as [number, number, number],
              rotation: [0, 0, 0] as [number, number, number],
              scale: [0.8, 0.8, 0.8] as [number, number, number],
              color: '#4ecdc4',
            },
          ],
        },
        message: 'ok',
      }
    },
  },
] as MockMethod[]
