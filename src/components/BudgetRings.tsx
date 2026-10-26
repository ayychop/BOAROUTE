import { useState } from 'react';
import { View } from 'react-native';
import { formatPence, type BudgetSummary } from '@/lib/budget';
import { useTheme } from '@/theme/ThemeProvider';
import { ProgressRing } from './ProgressRing';
import { Txt } from './Txt';

/**
 * Three rings: Standard (monthly), Sales Day / OOH (weekly cap, with sessions
 * left) and Special Events (Town Takeover day budgets). Sizes come from the
 * measured width, so they shrink on the Flip and Fold covers instead of
 * pushing text off the card. Amounts scale with each ring.
 */
export function BudgetRings({ budget, large = false }: { budget: BudgetSummary; large?: boolean }) {
  const { palette } = useTheme();
  const [width, setWidth] = useState(0);

  const gap = 8;
  const col = Math.max(0, Math.floor((width - gap * 2) / 3));
  const size = Math.round(Math.min(large ? 128 : 100, col * 0.86));
  const { sessions, takeover } = budget;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: large ? 190 : 160 }}>
      {width > 0 && (
        <>
          <Pool
            width={col}
            size={size}
            ratio={budget.standard.remainingRatio}
            over={budget.standard.over}
            remaining={budget.standard.remaining}
            colors={budget.standard.over ? [palette.danger, palette.warning] : [palette.gold, palette.primaryDeep]}
            title="Standard"
            total={budget.standard.budget}
            sub="per month"
          />
          <Pool
            width={col}
            size={size}
            ratio={budget.special.remainingRatio}
            over={budget.special.over}
            remaining={budget.special.remaining}
            colors={budget.special.over ? [palette.danger, palette.warning] : [palette.rose, palette.gold]}
            title="OOH weekly"
            total={budget.special.budget}
            sub={sessions.left > 0 ? `${sessions.left} × ${formatPence(sessions.allowance).replace('.00', '')} left` : 'Cap reached'}
          />
          <Pool
            width={col}
            size={size}
            ratio={takeover.budget > 0 ? takeover.remainingRatio : 0}
            over={takeover.over}
            remaining={takeover.remaining}
            colors={takeover.over ? [palette.danger, palette.warning] : [palette.platinum, palette.primary]}
            title="Special Events"
            total={takeover.budget}
            sub={takeover.days === 0 ? 'No takeovers yet' : `${takeover.days} takeover day${takeover.days === 1 ? '' : 's'}`}
            empty={takeover.days === 0}
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
  sub,
  empty = false,
}: {
  width: number;
  size: number;
  ratio: number;
  over: boolean;
  remaining: number;
  colors: [string, string];
  title: string;
  total: number;
  sub?: string;
  empty?: boolean;
}) {
  const stroke = Math.max(5, Math.round(size * 0.07));
  // Sized from the string so long amounts fit inside the ring without Android's clipped auto-fit.
  const amount = empty ? 'None' : formatPence(Math.abs(remaining));
  const inner = size - stroke * 2 - 12;
  const amountSize = Math.min(size * 0.18, inner / (amount.length * 0.62));
  const labelSize = Math.max(8, size * 0.075);
  return (
    <View style={{ width, alignItems: 'center' }}>
      <ProgressRing value={ratio} size={size} stroke={stroke} colors={colors} accessibilityLabel={`${title}: ${formatPence(remaining)} ${over ? 'over' : 'remaining'} of ${formatPence(total)}`}>
        <Txt
          variant="metric"
          tone={over ? 'danger' : 'default'}
          numberOfLines={1}
          maxFontSizeMultiplier={1}
          style={{ flexShrink: 0, fontSize: amountSize, lineHeight: Math.round(amountSize * 1.3), includeFontPadding: false, textAlign: 'center' }}
        >
          {amount}
        </Txt>
        <Txt variant="label" tone="faint" numberOfLines={1} maxFontSizeMultiplier={1} style={{ flexShrink: 0, fontSize: labelSize, lineHeight: Math.round(labelSize * 1.4), letterSpacing: 1.2, includeFontPadding: false }}>
          {empty ? 'Per day' : over ? 'Over' : 'Left'}
        </Txt>
      </ProgressRing>
      <Txt variant="caption" tone="dim" align="center" numberOfLines={2} maxFontSizeMultiplier={1.1} style={{ flexShrink: 0, alignSelf: 'stretch', marginTop: 10, paddingHorizontal: 2, fontSize: 12, lineHeight: 16 }}>
        {empty ? title : `${title} ${formatPence(total).replace('.00', '')}`}
      </Txt>
      {sub ? (
        <Txt variant="caption" tone={over ? 'danger' : 'faint'} align="center" numberOfLines={2} maxFontSizeMultiplier={1.1} style={{ flexShrink: 0, alignSelf: 'stretch', marginTop: 2, paddingHorizontal: 2, fontSize: 11.5, lineHeight: 15 }}>
          {sub}
        </Txt>
      ) : null}
    </View>
  );
}
