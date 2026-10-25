import { useState } from 'react';
import { View } from 'react-native';
import { formatPence, type BudgetSummary } from '@/lib/budget';
import { useTheme } from '@/theme/ThemeProvider';
import { ProgressRing } from './ProgressRing';
import { Txt } from './Txt';

/**
 * The standard ring and the Sales Day / OOH ring side by side. Sizes come from
 * the measured width, so they shrink with the screen (Flip cover, Fold cover)
 * instead of pushing text off the card. Amounts scale with each ring.
 */
export function BudgetRings({ budget, large = false }: { budget: BudgetSummary; large?: boolean }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);

  const gap = 12;
  // The standard ring gets 55% of the row, the special ring 45%.
  const colBig = Math.max(0, (width - gap) * 0.55);
  const colSmall = Math.max(0, (width - gap) * 0.45);
  const maxBig = large ? 220 : 150;
  const big = Math.round(Math.min(maxBig, colBig * 0.92));
  const small = Math.round(Math.min(maxBig * 0.78, colSmall * 0.86));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap, minHeight: 80 }}>
      {width > 0 && (
        <>
          <Pool
            width={colBig}
            size={big}
            ratio={budget.standard.remainingRatio}
            over={budget.standard.over}
            remaining={budget.standard.remaining}
            colors={budget.standard.over ? [palette.danger, palette.warning] : [palette.gold, palette.primaryDeep]}
            title="Standard"
            total={budget.standard.budget}
          />
          <Pool
            width={colSmall}
            size={small}
            ratio={budget.special.remainingRatio}
            over={budget.special.over}
            remaining={budget.special.remaining}
            colors={budget.special.over ? [palette.danger, palette.warning] : [palette.rose, palette.gold]}
            title="Sales Day / OOH"
            total={budget.special.budget}
          />
        </>
      )}
    </View>
  );
}

function Pool({
  width,
  size,
  ratio,
  over,
  remaining,
  colors,
  title,
  total,
}: {
  width: number;
  size: number;
  ratio: number;
  over: boolean;
  remaining: number;
  colors: [string, string];
  title: string;
  total: number;
}) {
  const stroke = Math.max(5, Math.round(size * 0.07));
  return (
    <View style={{ width, alignItems: 'center', gap: 8 }}>
      <ProgressRing value={ratio} size={size} stroke={stroke} colors={colors} accessibilityLabel={`${title}: ${formatPence(remaining)} ${over ? 'over' : 'remaining'} of ${formatPence(total)}`}>
        <Txt
          variant="metric"
          tone={over ? 'danger' : 'default'}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
          maxFontSizeMultiplier={1}
          style={{ fontSize: size * 0.17, lineHeight: size * 0.21 }}
        >
          {formatPence(Math.abs(remaining))}
        </Txt>
        <Txt variant="label" tone="faint" numberOfLines={1} maxFontSizeMultiplier={1} style={{ fontSize: Math.max(7.5, size * 0.065), lineHeight: Math.max(10, size * 0.09) }}>
          {over ? 'Over' : 'Left'}
        </Txt>
      </ProgressRing>
      <Txt variant="caption" tone="dim" align="center" numberOfLines={2} style={{ width }}>
        {title} · {formatPence(total).replace('.00', '')}
      </Txt>
    </View>
  );
}
