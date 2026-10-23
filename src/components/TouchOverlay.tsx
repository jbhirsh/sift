import React, { useEffect, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLORS } from '../theme';
import { showTouches, touchMarks } from '../services/touchOverlay';
import { dotOpacity, hasMarks, pressLook, type TouchMarks } from '../utils/touchMarks';

const RING = 34;
const DOT = 8;

/**
 * Draws each touch for PR GIFs (e2e/gifs, scripts/take-gifs.sh): a ring where
 * a finger presses, there from the first frame and fading out on release,
 * and a trail of fading dots where it drags. Only when the recording asked for it
 * (services/touchOverlay `showTouches`); otherwise it renders nothing.
 * It never takes a touch (pointerEvents none) and VoiceOver never sees it.
 * The app's root has one; each Modal has its own (`inModal`), as a Modal
 * draws in its own window above the root. Only one draws at a time: the
 * newest Modal's while one is up, otherwise the root's.
 */
export default function TouchOverlay({ inModal = false }: { inModal?: boolean }) {
  if (!showTouches) return null;
  return <Marks inModal={inModal} />;
}

function Marks({ inModal }: { inModal: boolean }) {
  const layer = useId();
  const [frame, setFrame] = useState<{ marks: TouchMarks; now: number }>(() => ({
    marks: touchMarks.get(),
    now: performance.now(),
  }));

  useEffect(() => {
    let raf: number | null = null;
    // Redraw every frame while something is on screen, so marks fade
    // smoothly; stop once they're all gone.
    const loop = () => {
      const now = performance.now();
      const marks = touchMarks.tick(now);
      setFrame({ marks, now });
      raf = hasMarks(marks) ? requestAnimationFrame(loop) : null;
    };
    const start = () => {
      if (raf === null) raf = requestAnimationFrame(loop);
    };
    const unsubscribe = touchMarks.subscribe(start);
    // A Modal's overlay takes over drawing; subscribed first, so the claim
    // redraws this one too.
    const release = inModal ? touchMarks.claimLayer(layer) : null;
    // Mounted mid-fade (a sheet opening as a ring scales out): carry it on.
    if (hasMarks(touchMarks.get())) start();
    return () => {
      release?.();
      unsubscribe();
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [inModal, layer]);

  const top = touchMarks.topLayer();
  if (inModal ? top !== layer : top !== null) return null;
  const { marks, now } = frame;
  const press = marks.press ? pressLook(marks.press, now) : null;
  return (
    <View
      testID="touch-overlay"
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {marks.trail.map((dot) => (
        <View
          key={`${dot.at}-${dot.x}-${dot.y}`}
          style={[styles.dot, { left: dot.x - DOT / 2, top: dot.y - DOT / 2, opacity: dotOpacity(dot, now) }]}
        />
      ))}
      {marks.press && press && (
        <View
          testID="touch-ring"
          style={[
            styles.ring,
            {
              left: marks.press.x - RING / 2,
              top: marks.press.y - RING / 2,
              opacity: press.opacity,
              transform: [{ scale: press.scale }],
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    borderWidth: 3,
    borderColor: COLORS.touch,
    backgroundColor: `${COLORS.touch}33`,
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: COLORS.touch,
  },
});
