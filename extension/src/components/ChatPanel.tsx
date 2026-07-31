import {
  Alert,
  Box,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Transition,
} from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import {
  AlertCircle,
  BarChart3,
  BookOpenCheck,
  ClipboardList,
  FileText,
  Lightbulb,
  ListChecks,
  MessageCircleQuestion,
  Minus,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { streamChat, type ArticleSuggestions, type ChatMessage } from '../api';
import { getSavedEmail } from '../auth';
import BorderedIconButton from './BorderedIconButton';

interface Props {
  sgrid: string | null;
  doi: string | null;
  title?: string | null;
  height?: number | string;
  onMinimize?: () => void;
  suggestions?: ArticleSuggestions | null;
}

interface QuickPrompt {
  icon: typeof FileText;
  label: string;
  prompt: string;
}

const QUICK_QUESTIONS: QuickPrompt[] = [
  {
    icon: MessageCircleQuestion,
    label: 'What is the central claim of this paper?',
    prompt:
      'What is the central claim of this paper? Answer concisely and cite only evidence present in the article text.',
  },
  {
    icon: BarChart3,
    label: 'What evidence supports the main conclusion?',
    prompt:
      'What evidence supports the main conclusion of this article? Use bullets and distinguish findings from interpretation.',
  },
  {
    icon: ListChecks,
    label: 'Which methods matter most for judging reliability?',
    prompt:
      'Which methods, sample details, or experimental design choices matter most for judging the reliability of this article?',
  },
];

const QUESTION_ICONS = [MessageCircleQuestion, BarChart3, ListChecks];
const ACTION_ICONS = [ClipboardList, BookOpenCheck, Lightbulb];
const MOTION_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const QUICK_ACTIONS: QuickPrompt[] = [
  {
    icon: FileText,
    label: 'Summarize this article',
    prompt:
      'Summarize this article in plain language. Include the research question, approach, key findings, and why it matters.',
  },
  {
    icon: ClipboardList,
    label: 'Extract key findings',
    prompt: 'Extract the key findings from this article as concise bullet points.',
  },
  {
    icon: BookOpenCheck,
    label: 'Explain the methods',
    prompt:
      'Explain the methodology and study design used in this article. Keep it concise and grounded in the text.',
  },
  {
    icon: Lightbulb,
    label: 'Identify limitations',
    prompt:
      'Identify the limitations, gaps, and caveats discussed or directly implied by the article text.',
  },
];

const colors = {
  ink: '#22221F',
  muted: '#6B6B66',
  panel: '#FFFFFF',
  surface: '#FAFAF7',
  border: '#E5E5E2',
  borderStrong: '#D4D4D0',
  orange: '#E87722',
  orangeDark: '#C96015',
  orangePale: '#FFF3EA',
  blue: '#0B6FB3',
  bluePale: '#EAF6FF',
};

function ThinkingDots() {
  return (
    <Group gap={5} h={22} align="center" aria-label="PaperLens is thinking">
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          component="span"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: colors.orange,
            animation: `paperlens-chat-dot 950ms ${i * 120}ms ease-in-out infinite`,
          }}
        />
      ))}
    </Group>
  );
}

function InlineMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: JSX.Element[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <Box component="ul" key={`list-${blocks.length}`} style={{ margin: '6px 0 8px', paddingLeft: 20 }}>
        {listItems.map((item, idx) => (
          <Box component="li" key={`${item}-${idx}`} style={{ marginBottom: 4 }}>
            {renderInline(item)}
          </Box>
        ))}
      </Box>,
    );
    listItems = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    // Bullet list: - item or * item
    const bullet = trimmed.match(/^[-*]\s+(.+)$/);
    if (bullet) {
      listItems.push(bullet[1]);
      return;
    }

    // Numbered list: 1. item or 1) item
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numbered) {
      listItems.push(numbered[1]);
      return;
    }

    flushList();

    if (!trimmed) {
      blocks.push(<Box key={`spacer-${blocks.length}`} h={6} />);
      return;
    }

    // ## Heading
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <Text
          key={`heading-${blocks.length}`}
          fw={700}
          mt={blocks.length ? 10 : 0}
          mb={3}
          c={colors.ink}
          style={{ fontSize: heading[1].length === 1 ? '15px' : '14px', lineHeight: 1.35 }}
        >
          {renderInline(heading[2])}
        </Text>,
      );
      return;
    }

    // **Bold heading** on its own line — GPT fallback pattern
    const boldHeading = trimmed.match(/^\*\*(.+?)\*\*:?$/);
    if (boldHeading) {
      blocks.push(
        <Text
          key={`bheading-${blocks.length}`}
          fw={700}
          mt={blocks.length ? 10 : 0}
          mb={3}
          c={colors.ink}
          style={{ fontSize: '14px', lineHeight: 1.35 }}
        >
          {boldHeading[1].replace(/:$/, '')}
        </Text>,
      );
      return;
    }

    blocks.push(
      <Text
        key={`p-${blocks.length}`}
        c={colors.ink}
        style={{ fontSize: '14px', lineHeight: 1.6, wordBreak: 'break-word' }}
      >
        {renderInline(trimmed)}
      </Text>,
    );
  });

  flushList();
  return <>{blocks}</>;
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[0-9]+\])/g).filter(Boolean);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Box component="strong" key={`${part}-${idx}`} style={{ fontWeight: 700 }}>
          {part.slice(2, -2)}
        </Box>
      );
    }
    if (/^\[[0-9]+\]$/.test(part)) {
      return (
        <Box
          component="span"
          key={`${part}-${idx}`}
          style={{
            display: 'inline-grid',
            placeItems: 'center',
            minWidth: 20,
            height: 20,
            padding: '0 5px',
            margin: '0 2px',
            borderRadius: 7,
            background: colors.bluePale,
            border: '1px solid #B9DDF3',
            color: colors.blue,
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {part.slice(1, -1)}
        </Box>
      );
    }
    return part;
  });
}

function MessageBubble({
  children,
  isUser,
  reduceMotion,
}: {
  children: ReactNode;
  isUser: boolean;
  reduceMotion: boolean;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <Transition
      mounted={mounted}
      duration={reduceMotion ? 1 : 140}
      timingFunction={MOTION_EASE}
      transition={{
        common: { transformOrigin: isUser ? 'right bottom' : 'left bottom' },
        in: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        out: { opacity: 0, transform: 'translate3d(0, 6px, 0) scale(0.99)' },
        transitionProperty: 'opacity, transform',
      }}
    >
      {(styles) => (
        <Box
          style={{
            display: 'flex',
            justifyContent: isUser ? 'flex-end' : 'flex-start',
            ...styles,
          }}
        >
          {children}
        </Box>
      )}
    </Transition>
  );
}

export default function ChatPanel({ sgrid, doi, title, height = 560, onMinimize, suggestions }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion(false) ?? false;
  const hoverDuration = reduceMotion ? 1 : 140;

  useEffect(() => {
    const el = scrollViewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    if (!sgrid && !doi) {
      setError('No article context available yet.');
      return;
    }

    if (!(await getSavedEmail())) {
      setError('Sign in required. Opening PaperLens sign-in page...');
      void browser.runtime.sendMessage({ type: 'paperlens:openHome' });
      return;
    }

    setError(null);
    const userMsg: ChatMessage = { role: 'user', content: trimmed };
    const history = [...messages, userMsg];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChat(
        { sgrid, doi, messages: history },
        (delta) => {
          setMessages((prev) => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + delta };
            }
            return next;
          });
        },
        controller.signal,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Chat request failed';
      setError(msg);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const reset = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput('');
    setError(null);
    setStreaming(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const isEmpty = messages.length === 0;
  const disabled = streaming || (!sgrid && !doi);
  const questionPrompts: QuickPrompt[] = suggestions?.questions?.length
    ? suggestions.questions.map((qa, idx) => ({
        ...qa,
        icon: QUESTION_ICONS[idx] ?? MessageCircleQuestion,
      }))
    : QUICK_QUESTIONS;
  const actionPrompts: QuickPrompt[] = suggestions?.actions?.length
    ? [
        QUICK_ACTIONS[0],
        ...suggestions.actions.map((qa, idx) => ({
          ...qa,
          icon: ACTION_ICONS[idx] ?? ClipboardList,
        })),
      ]
    : QUICK_ACTIONS;

  return (
    <Paper
      withBorder
      className="paperlens-chat-panel"
      style={{
        height,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: colors.panel,
        borderColor: colors.borderStrong,
        borderRadius: '14px',
        boxShadow: '0 18px 50px rgba(20, 20, 18, 0.14), 0 2px 8px rgba(20, 20, 18, 0.08)',
        color: colors.ink,
        fontFamily:
          'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '16px',
      }}
    >
      <style>
        {`
          @keyframes paperlens-chat-dot {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
            40% { transform: translateY(-4px); opacity: 1; }
          }

          .paperlens-chat-prompt-button,
          .paperlens-chat-icon-button {
            transition:
              transform ${hoverDuration}ms ${MOTION_EASE},
              border-color ${hoverDuration}ms ease,
              box-shadow ${hoverDuration}ms ease,
              background-color ${hoverDuration}ms ease,
              color ${hoverDuration}ms ease,
              opacity ${hoverDuration}ms ease;
          }

          .paperlens-chat-prompt-button:not(:disabled):hover {
            transform: translateY(-1px);
            box-shadow: 0 7px 18px rgba(20, 20, 18, 0.08);
          }

          .paperlens-chat-prompt-button:not(:disabled):active,
          .paperlens-chat-icon-button:not(:disabled):active {
            transform: translateY(0);
          }

          .paperlens-chat-question-button:not(:disabled):hover {
            border-color: #AED8EF;
            background-color: #F8FCFF;
          }

          .paperlens-chat-action-button:not(:disabled):hover {
            border-color: #EAA76E;
            background-color: #FFF8F2;
          }

          .paperlens-chat-icon-button:not(:disabled):hover {
            transform: translateY(-1px);
          }
        `}
      </style>

      <Group
        justify="space-between"
        align="center"
        style={{
          borderBottom: `1px solid ${colors.border}`,
          background: colors.panel,
          padding: '14px 18px',
        }}
      >
        <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
          <Box
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              display: 'grid',
              placeItems: 'center',
              background: colors.orange,
              border: '1px solid rgba(201, 96, 21, 0.16)',
              flexShrink: 0,
            }}
          >
            <Sparkles size={17} color="#FFFFFF" strokeWidth={2.2} />
          </Box>
          <Box style={{ minWidth: 0 }}>
            <Text fw={700} c={colors.ink} style={{ fontSize: '14px', lineHeight: 1.2 }}>
              Reading Assistant
            </Text>
          </Box>
        </Group>

        <Group gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
          <BorderedIconButton
            className="paperlens-chat-icon-button"
            onClick={reset}
            disabled={messages.length === 0 && !input && !error}
            label="Restart chat"
            title="Restart chat"
            size={36}
          >
            <RotateCcw size={16} />
          </BorderedIconButton>
          {onMinimize && (
            <BorderedIconButton
              className="paperlens-chat-icon-button"
              onClick={onMinimize}
              label="Minimize chat"
              title="Minimize chat"
              size={36}
            >
              <Minus size={17} />
            </BorderedIconButton>
          )}
        </Group>
      </Group>

      <ScrollArea
        style={{ flex: 1, minHeight: 0, background: colors.surface }}
        viewportRef={scrollViewportRef}
        type="auto"
        scrollbarSize={6}
      >
        <Stack gap={14} style={{ padding: 18 }}>
          {isEmpty && (
            <Stack gap={18}>
              <Stack gap={6}>
                <Text fw={750} c={colors.ink} style={{ fontSize: '20px', lineHeight: 1.2 }}>
                  Ask about this article
                </Text>
                <Text c={colors.muted} style={{ fontSize: '13px', lineHeight: 1.45 }}>
                  Explore the paper, challenge the methods, or turn dense sections into a concise research summary.
                </Text>
                {title && (
                  <Text
                    c={colors.muted}
                    lineClamp={2}
                    mt={4}
                    style={{ fontSize: '12px', lineHeight: 1.35, fontStyle: 'italic' }}
                  >
                    {title}
                  </Text>
                )}
              </Stack>

              <Stack gap={8}>
                <Text
                  fw={700}
                  c={colors.muted}
                  tt="uppercase"
                  style={{ fontSize: '11px', lineHeight: 1.25, letterSpacing: 0.9 }}
                >
                  Questions you could ask
                </Text>
                {questionPrompts.map((qa) => {
                  const Icon = qa.icon;
                  return (
                    <button
                      key={qa.label}
                      type="button"
                      className="paperlens-chat-prompt-button paperlens-chat-question-button"
                      disabled={disabled}
                      onClick={() => void send(qa.prompt)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        textAlign: 'left',
                        border: '1px solid #D8EAF5',
                        background: '#FFFFFF',
                        color: colors.blue,
                        borderRadius: 10,
                        padding: '11px 12px',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        opacity: disabled ? 0.55 : 1,
                        fontFamily: 'inherit',
                        fontSize: '14px',
                        fontWeight: 500,
                        lineHeight: 1.35,
                      }}
                    >
                      <Icon size={17} style={{ flexShrink: 0, marginTop: 1 }} />
                      <span>{qa.label}</span>
                    </button>
                  );
                })}
              </Stack>

              <Stack gap={8}>
                <Text
                  fw={700}
                  c={colors.muted}
                  tt="uppercase"
                  style={{ fontSize: '11px', lineHeight: 1.25, letterSpacing: 0.9 }}
                >
                  Actions you could take
                </Text>
                <Group gap={8}>
                  {actionPrompts.map((qa) => {
                    const Icon = qa.icon;
                    return (
                      <button
                        key={qa.label}
                        type="button"
                        className="paperlens-chat-prompt-button paperlens-chat-action-button"
                        disabled={disabled}
                        onClick={() => void send(qa.prompt)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 7,
                          minHeight: 34,
                          border: '1px solid #F2C49E',
                          background: '#FFFFFF',
                          color: colors.orangeDark,
                          borderRadius: 9,
                          padding: '7px 10px',
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          opacity: disabled ? 0.55 : 1,
                          fontFamily: 'inherit',
                          fontSize: '13px',
                          fontWeight: 600,
                        }}
                      >
                        <Icon size={15} />
                        <span>{qa.label}</span>
                      </button>
                    );
                  })}
                </Group>
              </Stack>
            </Stack>
          )}

          {messages.map((m, i) => {
            const isUser = m.role === 'user';
            return (
              <MessageBubble
                key={`${m.role}-${i}`}
                isUser={isUser}
                reduceMotion={reduceMotion}
              >
                <Paper
                  radius={12}
                  style={{
                    maxWidth: isUser ? '82%' : '100%',
                    background: isUser ? colors.bluePale : colors.panel,
                    border: `1px solid ${isUser ? '#CFE7F8' : colors.border}`,
                    boxShadow: isUser ? 'none' : '0 1px 2px rgba(20, 20, 18, 0.04)',
                    padding: isUser ? '10px 12px' : '14px',
                  }}
                >
                  {m.content ? (
                    isUser ? (
                      <Text
                        c={colors.ink}
                        style={{
                          fontSize: '14px',
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {m.content}
                      </Text>
                    ) : (
                      <Box style={{ fontSize: '14px', lineHeight: 1.6 }}>
                        <InlineMarkdown content={m.content} />
                      </Box>
                    )
                  ) : streaming && !isUser ? (
                    <ThinkingDots />
                  ) : null}
                </Paper>
              </MessageBubble>
            );
          })}

          {error && (
            <Alert
              variant="light"
              color="red"
              radius="md"
              icon={<AlertCircle size={16} />}
              title="Chat error"
            >
              {error}
            </Alert>
          )}
        </Stack>
      </ScrollArea>

      <Box
        style={{
          borderTop: `1px solid ${colors.border}`,
          background: colors.panel,
          padding: 12,
        }}
      >
        <Group align="flex-end" gap={8} wrap="nowrap">
          <Textarea
            placeholder={sgrid || doi ? 'Ask about this article' : 'Waiting for article context'}
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            autosize
            minRows={1}
            maxRows={5}
            disabled={!sgrid && !doi}
            radius="md"
            styles={{
              root: { flex: 1 },
              input: {
                borderColor: colors.borderStrong,
                fontSize: '14px',
                lineHeight: 1.45,
                padding: '11px 12px',
                fontFamily:
                  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              },
            }}
          />
          <BorderedIconButton
            className="paperlens-chat-icon-button"
            onClick={() => void send(input)}
            disabled={disabled || input.trim().length === 0}
            label="Send message"
            title="Send message"
            size={44}
            tone="orange"
            style={{ flexShrink: 0 }}
          >
            <Send size={18} />
          </BorderedIconButton>
        </Group>
      </Box>
    </Paper>
  );
}
