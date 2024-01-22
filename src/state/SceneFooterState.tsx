import { useIsFocused } from '@react-navigation/native'
import { DependencyList, useCallback, useEffect, useMemo } from 'react'
import { LayoutChangeEvent, Platform } from 'react-native'
import { runOnJS, useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated'

import { SceneWrapperInfo } from '../components/common/SceneWrapper'
import { useHandler } from '../hooks/useHandler'
import { useSharedEvent } from '../hooks/useSharedEvent'
import { useState } from '../types/reactHooks'
import { createStateProvider } from './createStateProvider'
import { useSceneScrollContext } from './SceneScrollState'

//
// Providers
//

/**
 * This contains footer state with respect to it's dimensions and open/collapse.
 * This state is more internal and shouldn't be used directly be components and
 * scenes. Instead use `useFooterOpenRatio` for application components.
 */
export const [SceneFooterProvider, useSceneFooterState] = createStateProvider(() => {
  const [keepOpen, setKeepOpen] = useState(false)
  const [footerHeight, setFooterHeight] = useState<number | undefined>(undefined)
  const footerOpenRatio = useSharedValue(1)
  const footerOpenRatioStart = useSharedValue(1)

  return useMemo(
    () => ({
      footerOpenRatio,
      footerOpenRatioStart,
      keepOpen,
      setKeepOpen,
      footerHeight,
      setFooterHeight
    }),
    [footerOpenRatio, footerOpenRatioStart, keepOpen, footerHeight]
  )
})

export type FooterRender = (sceneWrapperInfo?: SceneWrapperInfo) => React.ReactNode
const defaultFooterRender: FooterRender = () => null

/**
 * This is the global provider for the footer render function.
 */
export const [SceneFooterRenderProvider, useSceneFooterRenderState] = createStateProvider(() => {
  const [renderFooter, setRenderFooter] = useState<FooterRender>(() => defaultFooterRender)

  return useMemo(
    () => ({
      renderFooter,
      setRenderFooter
    }),
    [renderFooter, setRenderFooter]
  )
})

//
// Derived Hooks
//

/**
 * Used by scenes to register a render function for the global footer area.
 *
 * @param renderFn the render function to be used in the scene/tab-bar footer
 * @param deps the dependencies for the render function to trigger re-renders
 */
export const useSceneFooterRender = (renderFn: FooterRender = defaultFooterRender, deps: DependencyList) => {
  const { setRenderFooter } = useSceneFooterRenderState()

  // The callback will allow us to trigger a re-render when the deps change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const render = useCallback(renderFn, [...deps])

  // This will be used to determine if our render function should be cast
  // to the global state.
  const isFocused = useIsFocused()

  useEffect(() => {
    setRenderFooter((renderFooter: FooterRender) => {
      // Only cast our render function to the global state if we're focused
      // and we haven't already cast our function to the global state.
      if (isFocused && render !== renderFooter) {
        return render
      }
      if (!isFocused && render === renderFooter) {
        // Reset the global state if we're not focused and our render function
        // is currently the global state.
        return defaultFooterRender
      }
      // Leave global state unchanged
      return renderFooter
    })

    // For unmount:
    return () => {
      setRenderFooter((renderFooter: FooterRender) => {
        if (render === renderFooter) {
          // Reset the global state our render function is currently the
          // global state.
          return defaultFooterRender
        }
        // Leave global state unchanged
        return renderFooter
      })
    }
  }, [isFocused, render, setRenderFooter])
}

/**
 * This hook provides access to footer open/collapse state and API to lock the
 * footer in place. This should be used by scenes or components which should
 * respond to these values.
 */
export const useFooterOpenRatio = () => {
  const { scrollState } = useSceneScrollContext()
  const { scrollBeginEvent, scrollEndEvent, scrollMomentumBeginEvent, scrollMomentumEndEvent, scrollY } = scrollState

  const scrollYStart = useSharedValue<number | undefined>(undefined)
  const snapTo = useSharedValue<number | undefined>(undefined)
  const { footerOpenRatio, footerOpenRatioStart, keepOpen, setKeepOpen, footerHeight = 1 } = useSceneFooterState()

  function resetFooterRatio() {
    snapTo.value = 1
  }

  function snapWorklet() {
    'worklet'
    scrollYStart.value = undefined
    snapTo.value = Math.round(footerOpenRatio.value)
  }
  function snap() {
    scrollYStart.value = undefined
    snapTo.value = Math.round(footerOpenRatio.value)
  }
  function delayedSnap() {
    setTimeout(snap, 300)
  }

  // Scroll event subscriptions:
  useSharedEvent(scrollBeginEvent, nativeEvent => {
    'worklet'
    scrollYStart.value = nativeEvent?.contentOffset.y
    footerOpenRatioStart.value = footerOpenRatio.value
  })
  useSharedEvent(scrollEndEvent, () => {
    'worklet'
    if (Platform.OS === 'android') {
      runOnJS(delayedSnap)()
      return
    }
    if (scrollYStart.value != null) {
      snapWorklet()
    }
  })
  useSharedEvent(scrollMomentumBeginEvent, nativeEvent => {
    'worklet'
    if (Platform.OS === 'android') return
    scrollYStart.value = nativeEvent?.contentOffset.y
    footerOpenRatioStart.value = footerOpenRatio.value
  })
  useSharedEvent(scrollMomentumEndEvent, () => {
    'worklet'
    if (Platform.OS === 'android') return
    if (scrollYStart.value != null) {
      snapWorklet()
    }
  })

  useAnimatedReaction(
    () => {
      // Keep it open when disabled
      if (keepOpen) return 1

      // Scrolling hasn't started yet
      if (scrollYStart.value == null) return

      const scrollYDelta = scrollY.value - scrollYStart.value
      const ratioDelta = scrollYDelta / footerHeight // Constant is to lower jumpy-ness

      return Math.min(1, Math.max(0, footerOpenRatioStart.value - ratioDelta))
    },
    (currentValue, previousValue) => {
      if (currentValue == null) return
      if (previousValue == null) return
      if (currentValue === previousValue) return

      if (currentValue > previousValue && currentValue > 0.3) {
        snapTo.value = 1
        scrollYStart.value = scrollY.value
        footerOpenRatioStart.value = 1
        return
      }
      if (currentValue < previousValue && currentValue < 0.7) {
        snapTo.value = 0
        scrollYStart.value = scrollY.value
        footerOpenRatioStart.value = 0
        return
      }

      snapTo.value = undefined
      footerOpenRatio.value = currentValue
    },
    [keepOpen, footerHeight]
  )

  useAnimatedReaction(
    () => {
      // Keep it open when disabled
      if (keepOpen) return 1

      return snapTo.value
    },
    (currentValue, previousValue) => {
      if (currentValue === previousValue) return
      if (currentValue == null) return

      footerOpenRatio.value = withTiming(currentValue, { duration: 300 })
    },
    [keepOpen]
  )

  return {
    footerOpenRatio,
    resetFooterRatio,

    keepOpen,
    setKeepOpen
  }
}

/**
 * Registers a component's height via a returned onLayout handler function
 * to the footer's height calculation. This is to be used for the SceneFooter
 * and any component which should expand the footer height value while it's mounted.
 *
 * @returns layout handler for the component which height you want to measure
 */
export const useLayoutHeightInFooter = (): ((event: LayoutChangeEvent) => void) => {
  const { setFooterHeight } = useSceneFooterState()

  const [layoutHeight, setLayoutHeight] = useState<number | undefined>(undefined)

  const isFocused = useIsFocused()
  const maybeLayoutHeight = isFocused ? layoutHeight ?? 0 : 0

  // One-time layout measurement handler:
  const handleLayout = useHandler((event: LayoutChangeEvent) => {
    if (layoutHeight == null) {
      const layoutHeight = event.nativeEvent.layout.height
      setLayoutHeight((prev = 0) => prev + layoutHeight)
    }
  })

  // Add/subtract container height to the tab-bar height when mounted/unmounted
  useEffect(() => {
    setFooterHeight((footerHeight = 0) => footerHeight + maybeLayoutHeight)
    return () => {
      setFooterHeight((footerHeight = 0) => footerHeight - maybeLayoutHeight)
    }
  }, [maybeLayoutHeight, setFooterHeight])

  return handleLayout
}
