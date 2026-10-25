import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type SizeClass = 'compact' | 'regular' | 'expanded';

/** Breakpoints tuned for Galaxy Flip cover screens up to Fold inner screens. */
export function sizeClassFor(width: number, height: number): SizeClass {
  if (width < 380 || height < 560) return 'compact'; // Flip cover screen, split-screen
  if (width >= 700) return 'expanded'; // Fold inner screen, landscape
  return 'regular'; // S26 Ultra, Fold cover screen
}

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = sizeClassFor(width, height);
  const compact = size === 'compact';
  const expanded = size === 'expanded';

  const gutter = compact ? 12 : expanded ? 28 : 16;
  const maxContent = 1180;
  const contentWidth = Math.min(width, maxContent) - gutter * 2;
  // Type scales gently with the screen. System font size still applies on top,
  // capped per component via maxFontSizeMultiplier so layouts never overflow.
  const scale = compact ? 0.9 : expanded ? 1.08 : 1;
  const columns = width >= 1040 ? 3 : expanded ? 2 : 1;

  return {
    width,
    height,
    insets,
    size,
    compact,
    expanded,
    gutter,
    maxContent,
    contentWidth,
    scale,
    columns,
    /** Width of one grid cell given the column count and a gap. */
    cell: (gap = 12, cols = columns) => (contentWidth - gap * (cols - 1)) / cols,
  };
}
