import { Button, createTheme, MantineColorsTuple } from '@mantine/core';

const elsevierOrange: MantineColorsTuple = [
  '#FFF3EA',
  '#FFE0C2',
  '#FFCA9A',
  '#FFB070',
  '#F59848',
  '#EC8528',
  '#E87722',
  '#C96015',
  '#A84C0B',
  '#8A3C06',
];

export const theme = createTheme({
  primaryColor: 'elsevierOrange',
  primaryShade: 6,
  colors: { elsevierOrange },
  components: {
    Button: Button.extend({
      styles: {
        root: {
          transition:
            'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, opacity 140ms ease',
          '&:not(:disabled):not([data-disabled]):hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 7px 18px rgba(20, 20, 18, 0.08)',
          },
          '&:not(:disabled):not([data-disabled]):active': {
            transform: 'translateY(0)',
          },
          '&[data-variant="default"]': {
            borderColor: '#D4D4D0',
            color: '#3F3F3A',
          },
          '&[data-variant="default"]:not(:disabled):not([data-disabled]):hover': {
            backgroundColor: '#FFF8F2',
            borderColor: '#EAA76E',
          },
        },
      },
    }),
  },
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  headings: {
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    fontWeight: '700',
  },
  defaultRadius: 'md',
  other: {
    surface: '#FAFAF7',
    border: '#E5E5E2',
    borderStrong: '#D4D4D0',
    muted: '#6B6B66',
    cardShadow: '0 1px 2px rgba(20, 20, 18, 0.04), 0 4px 12px rgba(20, 20, 18, 0.04)',
    hoverLift: 'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 140ms ease',
  },
});
