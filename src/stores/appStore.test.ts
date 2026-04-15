import { describe, it, expect } from 'vitest'
import { useAppStore } from './appStore'

// __APP_VERSION__ define 이 vitest 환경에 주입되었는지 검증하는 smoke test.
// closeReleaseNotes 는 본문에서 __APP_VERSION__ 를 직접 참조하므로,
// define 이 누락되면 ReferenceError 가 발생한다.
describe('appStore — __APP_VERSION__ wiring', () => {
  it('closeReleaseNotes runs without ReferenceError on __APP_VERSION__', () => {
    expect(() => useAppStore.getState().closeReleaseNotes()).not.toThrow()
    expect(useAppStore.getState().releaseNotesOpen).toBe(false)
  })
})
