import { useRef, useState, useEffect } from 'react'
import type { ComponentType } from 'react'
import * as THREE from 'three'
import {
  createScene3D,
  type Scene3DHandle,
  type SceneUpdatePatch,
  type CardState,
  type CardComponentRegistry,
  type LiveDataConfig,
} from '@/3d'
import { CardHost } from '@/adapters/react'
import { bindPostMessageHost, postToParent } from '@/3d/bridge/postMessage-host'
import { cardRules } from '@/adapters/react/sceneCardRules'

export default function Embed() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('等待场景数据...')
  const [error, setError] = useState('')
  const [cardStates, setCardStates] = useState<CardState[]>([])
  const [cardRegistry, setCardRegistry] = useState<CardComponentRegistry<ComponentType> | null>(null)
  const handleRef = useRef<Scene3DHandle | null>(null)
  const detachBridgeRef = useRef<(() => void) | null>(null)
  const lastRenderedJsonRef = useRef('')

  const isDebug =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'true'

  function logSceneDebug(h: Scene3DHandle): void {
    const w = window as unknown as { __scene?: unknown; __camera?: unknown; __handle?: unknown }
    w.__handle = h
    w.__scene = h.app.scene
    w.__camera = h.app.camera
    try {
      const box = new THREE.Box3().setFromObject(h.app.scene)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      console.log('[embed] 场景包围盒:', {
        isEmpty: box.isEmpty(),
        min: box.min.toArray(),
        max: box.max.toArray(),
        size: size.toArray(),
        center: center.toArray(),
      })
      const cam = h.app.camera as THREE.PerspectiveCamera
      console.log('[embed] 相机:', {
        type: cam.type,
        position: cam.position.toArray(),
        target: h.controls.target.toArray(),
        near: cam.near,
        far: cam.far,
        fov: cam.fov,
      })
      console.log(
        '[embed] 场景直接子节点:',
        h.app.scene.children.length,
        h.app.scene.children.map((c) => c.name || c.type),
      )
    } catch (e) {
      console.warn('[embed] 调试信息计算失败', e)
    }
  }

  async function renderScene(data: LiveDataConfig | null) {
    if (isDebug) console.log('[embed] renderScene 开始, objects=', data?.objects?.length ?? 0)
    const canvas = canvasRef.current
    if (!canvas) {
      postToParent({ type: 'SCENE_ERROR', message: 'Canvas 不存在' })
      return
    }

    handleRef.current?.dispose()
    handleRef.current = null

    if (data === null) {
      setLoading(false)
      setStatusText('')
      return
    }

    setLoading(true)
    setStatusText('渲染场景...')
    try {
      const handle = await createScene3D(canvas, data, {
        cardRules,
        interactive: true,
        controls: {
          maxPolarAngle: Math.PI / 2.3,
        },
      })
      handleRef.current = handle
      setCardRegistry(handle.cardManager.registry as CardComponentRegistry<ComponentType>)
      handle.onCardState((states) => {
        setCardStates(states)
      })

      if (handle.picker) {
        handle.picker.onPick = (info) => {
          postToParent({
            type: 'SCENE_PICK',
            id: info.id,
            name: info.name,
            component: info.component,
            props: info.props,
          })
        }
      }

      if (isDebug) logSceneDebug(handle)

      setLoading(false)
      setStatusText('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[embed] 渲染失败:', msg)
      setError(`场景渲染失败: ${msg}`)
      setLoading(false)
      postToParent({ type: 'SCENE_ERROR', message: msg })
    }
  }

  useEffect(() => {
    postToParent({ type: 'SCENE_READY' })
    console.log('[embed] SCENE_READY sent')

    detachBridgeRef.current = bindPostMessageHost({
      onScene: async (data) => {
        if (isDebug)
          console.log(
            '[embed] 收到 SCENE_UPDATE, objects=',
            (data as { objects?: unknown[] } | null)?.objects?.length ?? 0,
          )
        const json = data === null ? 'null' : JSON.stringify(data)
        if (json === lastRenderedJsonRef.current) {
          if (isDebug) console.log('[embed] 重复 SCENE_UPDATE（同 payload），跳过渲染')
          return
        }
        lastRenderedJsonRef.current = json
        await renderScene(data as LiveDataConfig | null)
      },
      onPickMode: (enabled) => {
        if (!handleRef.current?.picker) return
        enabled ? handleRef.current.picker.enable() : handleRef.current.picker.disable()
      },
      onPickGranularity: (mode) => {
        handleRef.current?.picker?.setGranularity(mode)
      },
      onFlyTo: (targetId) => {
        handleRef.current?.flyTo?.(targetId)
      },
      onTheme: (mode) => {
        handleRef.current?.setTheme?.(mode)
      },
      onResetCamera: () => {
        handleRef.current?.resetCamera?.()
      },
      onPatch: (patch) => {
        handleRef.current?.update(patch as SceneUpdatePatch)
      },
    })

    if (window.self === window.top) {
      const sceneFile = new URLSearchParams(window.location.search).get('scene') ?? 'live-data.json'
      console.log(`[embed] 独立访问，尝试加载默认场景 ${sceneFile}`)
      window.setTimeout(async () => {
        if (handleRef.current) return
        try {
          const res = await fetch(`/${sceneFile}`)
          if (res.ok) {
            const data = (await res.json()) as LiveDataConfig
            await renderScene(data)
          }
        } catch {
          // 静默
        }
      }, 100)
    }

    return () => {
      detachBridgeRef.current?.()
      detachBridgeRef.current = null
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [])

  return (
    <div className="scene-page">
      <canvas ref={canvasRef} className="scene-canvas" />
      <CardHost cards={cardStates} registry={cardRegistry} />

      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <p>{statusText}</p>
        </div>
      )}
      {error && (
        <div className="error-overlay" onClick={() => setError('')}>
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
