// The owner's gold-on-charcoal UI icons (cut from docs/ui/icon-sheet.webp by scripts/assets/prep-ui-icons.mjs), by name.
const URLS = import.meta.glob('../assets/ui/icons/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export type IconName =
  | 'leaf' | 'road' | 'house' | 'junction' | 'bulldozer' | 'bus' | 'power' | 'civic'
  | 'tree' | 'buildings' | 'bank' | 'people' | 'briefcase' | 'sun' | 'income' | 'gear'
  | 'trophy' | 'calendar' | 'info' | 'compass' | 'terrain' | 'layers' | 'chart' | 'camera'
  | 'pause' | 'play' | 'fast' | 'skip' | 'rewind' | 'start' | 'zoom-in' | 'zoom-out'
  | 'pin' | 'oneway' | 'trees' | 'sidewalk' | 'forest' | 'road-edge' | 'hills' | 'fullscreen'
  | 'help' | 'up' | 'down' | 'left' | 'right' | 'back2' | 'forward2' | 'swap' | 'open' | 'close';

/** an icon at size px (square); decorative, so it has no alt text: the button around it carries the title */
export function Icon({ name, size = 24, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <img src={URLS[`../assets/ui/icons/${name}.webp`]} width={size} height={size} alt="" draggable={false} className={`pointer-events-none select-none ${className}`} />;
}
