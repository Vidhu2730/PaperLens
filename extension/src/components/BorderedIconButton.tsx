import {
  forwardRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type Ref,
  type ReactNode,
} from 'react';

type Tone = 'neutral' | 'orange' | 'green' | 'danger';

interface Props {
  children: ReactNode;
  label: string;
  title?: string;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: (event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement | HTMLAnchorElement>) => void;
  disabled?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  size?: number;
  radius?: number;
  tone?: Tone;
  active?: boolean;
  className?: string;
  style?: CSSProperties;
}

const palette: Record<Tone, { color: string; hover: string; activeBg: string; border: string; activeBorder: string }> = {
  neutral: {
    color: '#3F3F3A',
    hover: '#FAFAF7',
    activeBg: '#F5F5F1',
    border: '#D4D4D0',
    activeBorder: '#BEBEB8',
  },
  orange: {
    color: '#C96015',
    hover: '#FFF8F2',
    activeBg: '#FFF3EA',
    border: '#F2C49E',
    activeBorder: '#EAA76E',
  },
  green: {
    color: '#15803D',
    hover: '#F0FDF4',
    activeBg: '#DCFCE7',
    border: '#BBF7D0',
    activeBorder: '#86EFAC',
  },
  danger: {
    color: '#C2410C',
    hover: '#FFF7F2',
    activeBg: '#FFF1EA',
    border: '#F2B8A0',
    activeBorder: '#E58A67',
  },
};

const BorderedIconButton = forwardRef<HTMLElement, Props>(function BorderedIconButton({
  children,
  label,
  title,
  href,
  target,
  rel,
  onClick,
  onPointerDown,
  disabled = false,
  type = 'button',
  size = 36,
  radius = 10,
  tone = 'neutral',
  active = false,
  className,
  style,
}: Props, ref) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const colors = palette[tone];
  const interactive = !disabled;

  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    display: 'inline-grid',
    placeItems: 'center',
    flexShrink: 0,
    padding: 0,
    borderRadius: radius,
    border: `1px solid ${active ? colors.activeBorder : colors.border}`,
    background: active ? colors.activeBg : hovered && interactive ? colors.hover : '#FFFFFF',
    color: colors.color,
    cursor: interactive ? 'pointer' : 'not-allowed',
    opacity: interactive ? 1 : 0.55,
    textDecoration: 'none',
    lineHeight: 1,
    transform: pressed && interactive ? 'translateY(0)' : hovered && interactive ? 'translateY(-1px)' : 'translateY(0)',
    boxShadow: focused
      ? '0 0 0 3px rgba(232, 119, 34, 0.16)'
      : hovered && interactive
        ? '0 7px 18px rgba(20, 20, 18, 0.08)'
        : 'none',
    transition:
      'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, opacity 140ms ease',
    ...style,
  };

  const sharedProps = {
    className,
    'aria-label': label,
    title: title ?? label,
    style: baseStyle,
    onClick,
    onPointerDown,
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

  if (href && !disabled) {
    return (
      <a ref={ref as Ref<HTMLAnchorElement>} href={href} target={target} rel={rel} {...sharedProps}>
        {children}
      </a>
    );
  }

  return (
    <button ref={ref as Ref<HTMLButtonElement>} type={type} disabled={disabled} {...sharedProps}>
      {children}
    </button>
  );
});

export default BorderedIconButton;
