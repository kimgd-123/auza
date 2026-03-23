import { create } from 'zustand'
import type { Asset } from '@/types'

interface AssetState {
  assets: Record<string, Asset>   // id → Asset
  nextSeq: number

  /** 이미지를 등록하고 고유 ID 반환 */
  registerAsset: (params: Omit<Asset, 'id'>) => string

  /** ID로 Asset 조회 */
  getAsset: (id: string) => Asset | undefined

  /** 블록 삭제 시 관련 Asset 정리 */
  removeAssetsByBlock: (blockId: string) => void

  /** 전체 초기화 */
  clearAssets: () => void
}

function makeId(seq: number, type: Asset['type']): string {
  const prefix = type === 'image' ? 'IMG' : type === 'capture' ? 'CAP' : 'TMP'
  return `${prefix}_${String(seq).padStart(3, '0')}`
}

export const useAssetStore = create<AssetState>((set, get) => ({
  assets: {},
  nextSeq: 1,

  registerAsset: (params) => {
    const { nextSeq } = get()
    const id = makeId(nextSeq, params.type)
    const asset: Asset = { ...params, id }
    set((state) => ({
      assets: { ...state.assets, [id]: asset },
      nextSeq: nextSeq + 1,
    }))
    return id
  },

  getAsset: (id) => get().assets[id],

  removeAssetsByBlock: (blockId) =>
    set((state) => {
      const filtered: Record<string, Asset> = {}
      for (const [id, asset] of Object.entries(state.assets)) {
        if (asset.sourceBlock !== blockId) {
          filtered[id] = asset
        }
      }
      return { assets: filtered }
    }),

  clearAssets: () => set({ assets: {}, nextSeq: 1 }),
}))
