import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  createScene3D,
  CardHost,
  loadLiveDataConfig,
  type Scene3DHandle,
  type CardState,
} from '@/3d'
import { cardRules } from '@/cards/sceneCardRules'

const Scene3D: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const handleRef = useRef<Scene3DHandle | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('加载场景...')
  const [error, setError] = useState('')
  const [cardStates, setCardStates] = useState<CardState[]>([])

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
        // 数据由业务方请求（这里用包提供的可选工具 loadLiveDataConfig；
        // 生产环境换成你自己的接口即可）
        const data = await loadLiveDataConfig()

        const handle = await createScene3D(canvas, data, {
          cardRules,
          controls: {
            // 本场景是正交相机（见 live-data.json），minDistance/maxDistance 对正交无效，
            // 只有 maxPolarAngle 起作用：防止轨道旋到地面以下。要限制缩放请用 minZoom/maxZoom。
            maxPolarAngle: Math.PI / 2.3,
          },
        })

        if (disposed) {
          handle.dispose()
          return
        }

        handle.onCardState((states) => {
          setCardStates(states)
        })

        handleRef.current = handle
        setLoading(false)
        setStatusText('')

        // 便于在控制台手动验证增量更新（demo 用，可删）：
        //   scene3d.update({ objects: { remove: ['tree01_trunk'] } })
        //   scene3d.update({ objects: { upsert: [{ id:'marker01', parentId:'sceneRoot', type:'mesh',
        //     geometry:{type:'sphere',params:{radius:1}}, material:{type:'standard',color:'#ff0'},
        //     position:[0,5,0] }] } })
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

  const handleErrorClick = useCallback(() => {
    setError('')
  }, [])

  return (
    <div className="scene-page">
      <canvas ref={canvasRef} className="scene-canvas" />

      <CardHost cards={cardStates} />

      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
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

export default Scene3D
