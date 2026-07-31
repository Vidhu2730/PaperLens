import {
  CircleCheck,
  CircleX,
  SlidersHorizontal,
  ThumbsUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  level: number;
  title?: string;
  heading?: ReactNode;
  description?: ReactNode;
  multiline?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
  clickTooltip?: string;
  action?: ReactNode;
  className?: string;
  style?: CSSProperties;
  compact?: boolean;
}

interface EvaluationPresentation {
  icon: LucideIcon;
  label: string;
  subtext: string;
  score: number;
  filledSegments: number;
  text: string;
  background: string;
  border: string;
  iconBackground: string;
  fill: string;
  empty: string;
}

const PRESENTATION: Record<number, EvaluationPresentation> = {
  1: {
    icon: CircleX,
    label: 'No match',
    subtext: 'Exclude',
    score: 0,
    filledSegments: 0,
    text: '#8E2427',
    background: '#FFF8F7',
    border: '#F1CCC7',
    iconBackground: '#F6DEDA',
    fill: '#C84A43',
    empty: '#EEDAD6',
  },
  2: {
    icon: TriangleAlert,
    label: 'Weak match',
    subtext: 'Likely exclude',
    score: 2,
    filledSegments: 2,
    text: '#5F5F5A',
    background: '#FAFAF7',
    border: '#DADAD5',
    iconBackground: '#ECEBE6',
    fill: '#8D8D86',
    empty: '#DEDDD8',
  },
  3: {
    icon: SlidersHorizontal,
    label: 'Partial match',
    subtext: 'Review manually',
    score: 3,
    filledSegments: 3,
    text: '#75410B',
    background: '#FFF9EF',
    border: '#E9D3A5',
    iconBackground: '#FFE3AC',
    fill: '#C06F0B',
    empty: '#EFDDB9',
  },
  4: {
    icon: ThumbsUp,
    label: 'Good match',
    subtext: 'Worth including',
    score: 4,
    filledSegments: 4,
    text: '#8B3F13',
    background: '#FFF8F2',
    border: '#F2C49E',
    iconBackground: '#FFE0C2',
    fill: '#E87722',
    empty: '#EFD6C2',
  },
  5: {
    icon: CircleCheck,
    label: 'Strong match',
    subtext: 'Include',
    score: 5,
    filledSegments: 5,
    text: '#2F6416',
    background: '#F7FBF3',
    border: '#D4E6C6',
    iconBackground: '#E4F1D7',
    fill: '#4F7F2B',
    empty: '#DFEBDD',
  },
};

function normalizedLevel(level: number): number {
  const parsed = Number.isFinite(level) ? Math.round(level) : 1;
  return Math.max(1, Math.min(5, parsed));
}

export default function EvaluationProgressCard({
  level,
  title,
  heading,
  description,
  multiline = false,
  onClick,
  disabled = false,
  ariaLabel,
  clickTooltip,
  action,
  className,
  style,
  compact = false,
}: Props) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const presentation = PRESENTATION[normalizedLevel(level)];
  const Icon = presentation.icon;
  const renderNativeButton = Boolean(onClick) && !action;
  const interactive = Boolean(onClick) && !disabled;
  const cardInteractive = renderNativeButton && interactive;
  const displayTitle = title?.trim();
  const displayHeading = heading ?? presentation.label;
  const displayDescription = description ?? presentation.subtext;
  const defaultAriaLabel = displayTitle
    ? `${displayTitle}: ${presentation.label}, ${presentation.score} of 5`
    : `${presentation.label}: ${presentation.score} of 5`;
  const spacing = compact
    ? {
        cardGap: 8,
        cardPadding: '9px 10px',
        contentGap: 7,
        iconSize: 28,
        iconRadius: 8,
        headingSize: 12,
        descriptionSize: 11,
        scoreSize: 12,
        scoreSuffixSize: 10,
        titleSize: 10,
        segmentHeight: 5,
      }
    : {
        cardGap: 10,
        cardPadding: '12px 12px 11px',
        contentGap: 10,
        iconSize: 32,
        iconRadius: 9,
        headingSize: 13,
        descriptionSize: 12,
        scoreSize: 14,
        scoreSuffixSize: 12,
        titleSize: 11,
        segmentHeight: 6,
      };

  const baseStyle: CSSProperties = {
    width: '100%',
    minWidth: 0,
    display: 'grid',
    gap: spacing.cardGap,
    padding: spacing.cardPadding,
    margin: 0,
    boxSizing: 'border-box',
    appearance: 'none',
    borderRadius: 10,
    border: `1px solid ${presentation.border}`,
    background: presentation.background,
    color: presentation.text,
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: cardInteractive ? 'pointer' : disabled ? 'not-allowed' : 'default',
    opacity: disabled ? 0.58 : 1,
    transform: pressed && cardInteractive ? 'translateY(0)' : hovered && cardInteractive ? 'translateY(-1px)' : 'translateY(0)',
    boxShadow: focused && cardInteractive
      ? '0 0 0 3px rgba(232, 119, 34, 0.14)'
      : hovered && cardInteractive
        ? '0 10px 22px rgba(20, 20, 18, 0.08)'
        : 'none',
    transition:
      'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 140ms ease, box-shadow 140ms ease, opacity 140ms ease',
    ...style,
  };

  const clickableContentStyle: CSSProperties = {
    width: '100%',
    minWidth: 0,
    display: 'grid',
    gap: spacing.cardGap,
    padding: 0,
    margin: 0,
    border: 0,
    borderRadius: 8,
    appearance: 'none',
    background: 'transparent',
    color: presentation.text,
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: interactive ? 'pointer' : disabled ? 'not-allowed' : 'default',
    transform: pressed && interactive ? 'translateY(0)' : hovered && interactive ? 'translateY(-1px)' : 'translateY(0)',
    boxShadow: focused
      ? '0 0 0 3px rgba(232, 119, 34, 0.14)'
      : hovered && interactive
        ? '0 8px 18px rgba(20, 20, 18, 0.07)'
        : 'none',
    transition:
      'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 140ms ease, opacity 140ms ease',
  };

  const titleContent = displayTitle ? (
    <span
      title={displayTitle}
      style={{
        minWidth: 0,
        color: presentation.text,
        fontSize: spacing.titleSize,
        fontWeight: 700,
        lineHeight: 1.15,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {displayTitle}
    </span>
  ) : null;

  const scoreContent = (
    <div style={{ display: 'grid', gap: spacing.cardGap, minWidth: 0 }}>
      {renderNativeButton ? titleContent : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${spacing.iconSize}px minmax(0, 1fr) auto`,
          gap: spacing.contentGap,
          alignItems: multiline ? 'start' : 'center',
          minWidth: 0,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: spacing.iconSize,
            height: spacing.iconSize,
            minWidth: spacing.iconSize,
            display: 'grid',
            placeItems: 'center',
            borderRadius: spacing.iconRadius,
            background: presentation.iconBackground,
            color: presentation.text,
          }}
        >
          <Icon size={compact ? 14 : 16} strokeWidth={2.4} />
        </span>

        <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
          <span
            style={{
              minWidth: 0,
              color: presentation.text,
              fontSize: spacing.headingSize,
              fontWeight: 750,
              lineHeight: 1.25,
              whiteSpace: multiline ? 'normal' : 'nowrap',
              overflow: multiline ? 'visible' : 'hidden',
              textOverflow: multiline ? 'clip' : 'ellipsis',
            }}
          >
            {displayHeading}
          </span>
          <span
            style={{
              minWidth: 0,
              color: presentation.text,
              fontSize: spacing.descriptionSize,
              fontWeight: 600,
              lineHeight: multiline ? 1.45 : 1.25,
              whiteSpace: multiline ? 'normal' : 'nowrap',
              overflow: multiline ? 'visible' : 'hidden',
              textOverflow: multiline ? 'clip' : 'ellipsis',
            }}
          >
            {displayDescription}
          </span>
        </span>

        <span
          style={{
            minWidth: 34,
            display: 'grid',
            justifyItems: 'end',
            color: presentation.text,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: spacing.scoreSize, fontWeight: 850, lineHeight: 1 }}>{presentation.score}</span>
          <span style={{ fontSize: spacing.scoreSuffixSize, fontWeight: 700, lineHeight: 1.1 }}>of 5</span>
        </span>
      </div>

      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={5}
        aria-valuenow={presentation.score}
        aria-label={defaultAriaLabel}
        style={{
          display: 'flex',
          gap: 4,
          minWidth: 0,
          height: spacing.segmentHeight,
        }}
      >
        {Array.from({ length: 5 }, (_, index) => {
          const filled = index < presentation.filledSegments;
          return (
            <span
              key={index}
              aria-hidden="true"
              style={{
                flex: '1 1 0',
                minWidth: 0,
                height: spacing.segmentHeight,
                borderRadius: 999,
                background: filled ? presentation.fill : presentation.empty,
              }}
            />
          );
        })}
      </div>
    </div>
  );

  const content = (
    <>
      {scoreContent}
      {action && (
        <div
          style={{
            borderTop: `1px solid ${presentation.empty}`,
            paddingTop: 10,
            minWidth: 0,
          }}
        >
          {action}
        </div>
      )}
    </>
  );

  const sharedEvents = {
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => {
      setHovered(false);
      setPressed(false);
    },
    onMouseDown: () => setPressed(true),
    onMouseUp: () => setPressed(false),
    onFocus: () => setFocused(true),
    onBlur: () => {
      setFocused(false);
      setPressed(false);
    },
  };

  const clickableScore = (
    <button
      type="button"
      aria-label={ariaLabel ?? defaultAriaLabel}
      disabled={disabled}
      onClick={onClick}
      title={clickTooltip}
      style={clickableContentStyle}
      {...sharedEvents}
    >
      {scoreContent}
    </button>
  );

  if (renderNativeButton) {
    return (
      <button
        type="button"
        className={className}
        aria-label={ariaLabel ?? defaultAriaLabel}
        disabled={disabled}
        onClick={onClick}
        style={baseStyle}
        {...sharedEvents}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={className}
      aria-label={ariaLabel ?? defaultAriaLabel}
      aria-disabled={disabled || undefined}
      style={baseStyle}
    >
      {titleContent}
      {onClick ? (
        clickableScore
      ) : (
        scoreContent
      )}
      {action && (
        <div
          style={{
            borderTop: `1px solid ${presentation.empty}`,
            paddingTop: 10,
            minWidth: 0,
          }}
        >
          {action}
        </div>
      )}
    </div>
  );
}
