type MobileZoom = { scale: number; x: number; y: number };

export function panZoomedScreen(
  screen: Element,
  zoom: MobileZoom,
  videoScale: number,
  deltaX: number,
  deltaY: number
): MobileZoom {
  const viewport = screen.parentElement;
  const container = viewport?.parentElement;
  if (!viewport || !container) return zoom;

  const rect = container.getBoundingClientRect();
  const scale = videoScale * zoom.scale;
  const maxX = Math.max(0, (viewport.offsetWidth * scale - rect.width) / 2);
  const maxY = Math.max(0, (viewport.offsetHeight * scale - rect.height) / 2);
  return {
    ...zoom,
    x: Math.max(-maxX, Math.min(maxX, zoom.x + deltaX)),
    y: Math.max(-maxY, Math.min(maxY, zoom.y + deltaY))
  };
}
