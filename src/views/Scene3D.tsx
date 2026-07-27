import { useRef, useState, useEffect, useCallback } from 'react'
import type { ComponentType } from 'react'
import {
  createScene3D,
  loadLiveDataConfig,
  type Scene3DHandle,
  type CardState,
  type CardComponentRegistry,
} from '@/3d'
import { CardHost } from '@/adapters/react'
import { cardRules } from '@/adapters/react/sceneCardRules'

export default function Scene3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('加载场景...')
  const [error, setError] = useState('')
  const [cardStates, setCardStates] = useState<CardState[]>([])
  const [cardRegistry, setCardRegistry] = useState<CardComponentRegistry<ComponentType> | null>(null)
  const handleRef = useRef<Scene3DHandle | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      setError('Canvas 不存在')
      setLoading(false)
      return
    }

    let disposed = false

    ;(async () => {
      try {
        const data = await loadLiveDataConfig()

        const handle = await createScene3D(canvas, data, {
          cardRules,
          controls: {
            maxPolarAngle: Math.PI / 2.3,
          },
        })

        if (disposed) {
          handle.dispose()
          return
        }

        handleRef.current = handle
        setCardRegistry(handle.cardManager.registry as CardComponentRegistry<ComponentType>)
        handle.onCardState((states) => {
          setCardStates(states)
        })
        setLoading(false)
        setStatusText('')

        ;(window as unknown as { scene3d?: Scene3DHandle }).scene3d = handle
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[Scene3D] 加载失败:', msg)
        setError(`场景加载失败: ${msg}`)
        setLoading(false)
      }
    })()

    return () => {
      disposed = true
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [])

  const handleErrorClick = useCallback(() => setError(''), [])

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
        <div className="error-overlay" onClick={handleErrorClick}>
          <p>{error}</p>
        </div>
      )}
    </div>
  )
}
