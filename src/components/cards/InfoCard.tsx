/**
 * 通用信息卡片 — 用于树 / 建筑 (React 版)
 * 点击 3D 物体后弹出，显示编号、坐标、高度。
 *
 * 接收的 props：
 * - cardId:   卡片 ID
 * - objectId: 关联的 3D 物体 ID（如 tree01 / buildingA）
 * - kind:     'tree' | 'building'，不传则按 objectId 前缀推断
 * - label:    标题（如 "树 01"）
 * - position: 地面坐标 [x, z]
 * - height:   高度
 */

import React, { useMemo } from 'react'

interface InfoCardProps {
  cardId: string
  objectId: string
  kind?: 'tree' | 'building'
  label?: string
  position?: [number, number]
  height?: number
}

const InfoCard: React.FC<InfoCardProps> = ({
  cardId: _cardId,
  objectId,
  kind: kindProp,
  label: labelProp,
  position: positionProp,
  height: heightProp,
}) => {
  const kind = useMemo<'tree' | 'building'>(() => {
    if (kindProp) return kindProp
    return objectId?.startsWith('building') ? 'building' : 'tree'
  }, [kindProp, objectId])

  const label = useMemo(() => labelProp ?? objectId, [labelProp, objectId])

  const posX = useMemo(() => positionProp?.[0]?.toFixed(1) ?? '0.0', [positionProp])
  const posZ = useMemo(() => positionProp?.[1]?.toFixed(1) ?? '0.0', [positionProp])

  const height = useMemo(() => heightProp ?? 0, [heightProp])

  return (
    <div className={`info-card kind-${kind}`} onClick={(e) => e.stopPropagation()}>
      <div className="info-head">
        <span className="info-icon">{kind === 'tree' ? '🌲' : '🏢'}</span>
        <span className="info-title">{label}</span>
      </div>
      <div className="info-row">
        <span className="info-key">坐标</span>
        <span className="info-val">{posX}, {posZ}</span>
      </div>
      <div className="info-row">
        <span className="info-key">高度</span>
        <span className="info-val">{height.toFixed(1)} m</span>
      </div>
    </div>
  )
}

export default InfoCard
