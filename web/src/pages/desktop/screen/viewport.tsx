import { cloneElement, CSSProperties, ReactElement, useEffect, useRef, useState } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useMediaQuery } from 'react-responsive';

import {
  controlRegionModeAtom,
  inputRegionAtom,
  inputRegionSelectingAtom,
  mobileZoomAtom,
  videoScaleAtom
} from '@/jotai/screen.ts';

type ViewportSize = {
  width: number;
  height: number;
};

type ScreenViewportProps = {
  children: ReactElement<{ style?: CSSProperties }>;
};

export const ScreenViewport = ({ children }: ScreenViewportProps) => {
  const isMobile = useMediaQuery({ maxWidth: 849 });
  const inputRegion = useAtomValue(inputRegionAtom);
  const mode = useAtomValue(controlRegionModeAtom);
  const selecting = useAtomValue(inputRegionSelectingAtom);
  const videoScale = useAtomValue(videoScaleAtom);
  const [mobileZoom, setMobileZoom] = useAtom(mobileZoomAtom);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(mobileZoom);
  const [containerSize, setContainerSize] = useState<ViewportSize>({ width: 0, height: 0 });
  const cropped = mode !== 'off' && !!inputRegion && !selecting;
  zoomRef.current = mobileZoom;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };
    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!isMobile || !container) return;

    type Point = { x: number; y: number };
    type Gesture = {
      distance: number;
      midpoint: Point;
      zoomScale: number;
      anchor: Point;
      mode: 'pending' | 'zoom' | 'pan';
    };
    let gesture: Gesture | null = null;

    const getTouches = (touches: TouchList) => {
      const first = touches[0];
      const second = touches[1];
      return {
        distance: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
        midpoint: {
          x: (first.clientX + second.clientX) / 2,
          y: (first.clientY + second.clientY) / 2
        }
      };
    };

    const getCenter = () => {
      const rect = container.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };

    const startGesture = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      const { distance, midpoint } = getTouches(event.touches);
      if (distance < 1) return;
      const current = zoomRef.current;
      const center = getCenter();
      const scale = videoScale * current.scale;
      gesture = {
        distance,
        midpoint,
        zoomScale: current.scale,
        anchor: {
          x: (midpoint.x - center.x - current.x) / scale,
          y: (midpoint.y - center.y - current.y) / scale
        },
        mode: 'pending'
      };
    };

    const moveGesture = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      event.preventDefault();
      if (!gesture) startGesture(event);
      if (!gesture) return;

      const { distance, midpoint } = getTouches(event.touches);
      const distanceChange = Math.abs(distance - gesture.distance);
      const midpointChange = Math.hypot(
        midpoint.x - gesture.midpoint.x,
        midpoint.y - gesture.midpoint.y
      );
      if (gesture.mode === 'pending') {
        if (distanceChange > 6) gesture.mode = 'zoom';
        else if (videoScale * gesture.zoomScale > 1 && midpointChange > 8) gesture.mode = 'pan';
        else return; // Keep the existing two-finger remote scroll gesture at normal scale.
      }
      if (gesture.mode === 'pan' && distanceChange > 6) gesture.mode = 'zoom';
      event.stopPropagation();

      const scale =
        gesture.mode === 'zoom'
          ? Math.min(
              Math.max(1, 4 / videoScale),
              Math.max(1, (gesture.zoomScale * distance) / gesture.distance)
            )
          : gesture.zoomScale;
      const effectiveScale = videoScale * scale;
      const center = getCenter();
      const rect = container.getBoundingClientRect();
      const viewport = container.querySelector<HTMLElement>('#screen-viewport');
      const baseWidth = viewport?.offsetWidth || rect.width;
      const baseHeight = viewport?.offsetHeight || rect.height;
      const maxX = Math.max(0, (baseWidth * effectiveScale - rect.width) / 2);
      const maxY = Math.max(0, (baseHeight * effectiveScale - rect.height) / 2);
      const next = {
        scale,
        x: Math.max(
          -maxX,
          Math.min(maxX, midpoint.x - center.x - gesture.anchor.x * effectiveScale)
        ),
        y: Math.max(
          -maxY,
          Math.min(maxY, midpoint.y - center.y - gesture.anchor.y * effectiveScale)
        )
      };
      zoomRef.current = next;
      setMobileZoom(next);
    };

    const endGesture = (event: TouchEvent) => {
      if (event.touches.length < 2) gesture = null;
    };

    const options: AddEventListenerOptions = { passive: false, capture: true };
    container.addEventListener('touchstart', startGesture, options);
    container.addEventListener('touchmove', moveGesture, options);
    container.addEventListener('touchend', endGesture, options);
    container.addEventListener('touchcancel', endGesture, options);
    return () => {
      container.removeEventListener('touchstart', startGesture, true);
      container.removeEventListener('touchmove', moveGesture, true);
      container.removeEventListener('touchend', endGesture, true);
      container.removeEventListener('touchcancel', endGesture, true);
    };
  }, [isMobile, setMobileZoom, videoScale]);

  let viewportWidth = containerSize.width;
  let viewportHeight = containerSize.height;
  if (cropped && inputRegion && containerSize.width > 0 && containerSize.height > 0) {
    const scale = Math.min(
      containerSize.width / inputRegion.width,
      containerSize.height / inputRegion.height
    );
    viewportWidth = inputRegion.width * scale;
    viewportHeight = inputRegion.height * scale;
  }

  useEffect(() => {
    if (!isMobile || !containerSize.width || !containerSize.height) return;
    const scale = videoScale * mobileZoom.scale;
    const maxX = Math.max(0, (viewportWidth * scale - containerSize.width) / 2);
    const maxY = Math.max(0, (viewportHeight * scale - containerSize.height) / 2);
    const x = Math.max(-maxX, Math.min(maxX, mobileZoom.x));
    const y = Math.max(-maxY, Math.min(maxY, mobileZoom.y));
    if (x !== mobileZoom.x || y !== mobileZoom.y) setMobileZoom({ ...mobileZoom, x, y });
  }, [
    containerSize.height,
    containerSize.width,
    isMobile,
    mobileZoom,
    setMobileZoom,
    videoScale,
    viewportHeight,
    viewportWidth
  ]);

  const mediaStyle: CSSProperties =
    cropped && inputRegion
      ? {
          ...children.props.style,
          position: 'absolute',
          left: -(inputRegion.left / inputRegion.width) * viewportWidth,
          top: -(inputRegion.top / inputRegion.height) * viewportHeight,
          width: (inputRegion.frameWidth / inputRegion.width) * viewportWidth,
          height: (inputRegion.frameHeight / inputRegion.height) * viewportHeight,
          maxWidth: 'none',
          maxHeight: 'none',
          objectFit: 'fill',
          transform: 'none'
        }
      : {
          ...children.props.style,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transform: 'none'
        };

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 w-full min-w-0 touch-none items-center justify-center overflow-hidden"
    >
      <div
        id="screen-viewport"
        className="relative overflow-hidden"
        data-cropped={cropped ? 'true' : 'false'}
        style={{
          width: viewportWidth || '100%',
          height: viewportHeight || '100%',
          transform: isMobile
            ? `translate(${mobileZoom.x}px, ${mobileZoom.y}px) scale(${videoScale * mobileZoom.scale})`
            : `scale(${videoScale})`,
          transformOrigin: 'center'
        }}
      >
        {cloneElement(children, { style: mediaStyle })}
      </div>
    </div>
  );
};
