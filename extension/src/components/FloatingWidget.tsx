import { Loader, MantineProvider, Transition } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { ArrowRight, BookOpen, ExternalLink, FileSearch, FileText, FolderPlus, Minus, Sparkles, Trash2 } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectArticle, ResolveResult } from '../api';
import { useProjectsContext } from '../contexts/ProjectsContext';
import { theme } from '../theme';
import BorderedIconButton from './BorderedIconButton';
import ChatPanel from './ChatPanel';
import EvaluationProgressCard from './EvaluationProgressCard';

interface Props {
  result: ResolveResult | null;
  shadowContainer?: HTMLElement;
}

const ORANGE = '#E87722';
const ORANGE_DARK = '#C96015';
const INK = '#22221F';
const MUTED = '#6B6B66';
const BORDER = '#E5E5E2';
const SURFACE = '#FAFAF7';
const BLUE = '#0B6FB3';

const PANEL_WIDTH = 244;
const PANEL_HEIGHT = 344;
const PANEL_HEIGHT_WITH_MATCH = 502;
const MINIMIZED_SIZE = 42;
const CHAT_WIDTH = 400;
const CHAT_HEIGHT = 560;
const MOTION_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        color: MUTED,
        fontSize: 11,
        fontWeight: 800,
        lineHeight: 1,
        letterSpacing: 0,
        textTransform: 'uppercase',
        padding: '2px 0 0',
      }}
    >
      {children}
    </div>
  );
}

function RowIcon({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'orange' | 'blue' }) {
  const colors =
    tone === 'orange'
      ? { color: ORANGE_DARK, background: '#FFE0C2', border: '#FFB070' }
      : tone === 'blue'
        ? { color: BLUE, background: '#F8FCFF', border: '#D8EAF5' }
        : { color: INK, background: '#FFFFFF', border: BORDER };

  return (
    <span
      style={{
        width: 31,
        height: 31,
        minWidth: 31,
        display: 'inline-grid',
        placeItems: 'center',
        borderRadius: 9,
        border: `1px solid ${colors.border}`,
        background: colors.background,
        color: colors.color,
      }}
    >
      {children}
    </span>
  );
}

function matchingSavedArticle(result: ResolveResult, projectArticles: ProjectArticle[]) {
  return projectArticles.find(
    (saved) =>
      (result.sgrid && saved.sgrid === result.sgrid) ||
      (result.doi && saved.doi === result.doi) ||
      (result.pii && saved.pii === result.pii),
  );
}

export function FloatingWidget({ result, shadowContainer }: Props) {
  const { ready: projectsReady, projects, addArticleToProject, removeArticleFromProject } = useProjectsContext();
  const [topPx, setTopPx] = useState(() => Math.max(12, window.innerHeight / 2 - MINIMIZED_SIZE / 2));
  const [chatOpen, setChatOpen] = useState(false);
  const [chatVisible, setChatVisible] = useState(false);
  const [minimized, setMinimized] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [compactIntro, setCompactIntro] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [projectArticleBusy, setProjectArticleBusy] = useState<'add' | 'remove' | null>(null);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const [portalEl, setPortalEl] = useState<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion(false) ?? false;
  const canOpenArticle = Boolean(result?.sgrid);
  const canSaveArticle = Boolean(result?.sgrid || result?.doi || result?.pii);
  const canChat = Boolean(result?.sgrid || result?.doi);
  const scopusUrl = result?.scopus_url ?? null;
  const scienceDirectUrl = result?.pii && result.sciencedirect_url ? result.sciencedirect_url : null;
  const projectMatch = result?.project_match ?? null;
  const projectName = projectMatch?.project_name?.trim() || 'Current project';
  const currentProject = projectMatch ? projects.find((project) => project.id === projectMatch.project_id) : null;
  const savedProjectArticle = result && currentProject ? matchingSavedArticle(result, currentProject.articles) : undefined;
  const projectArticleSaved = Boolean(savedProjectArticle);
  const projectArticleActionDisabled =
    !projectMatch || !projectsReady || !canSaveArticle || Boolean(projectArticleBusy) || (projectArticleSaved && !savedProjectArticle);
  const logoUrl = browser.runtime.getURL('elsevier_logo_tree.svg');
  const expandedHeight = projectMatch ? PANEL_HEIGHT_WITH_MATCH : PANEL_HEIGHT;
  const activeHeight = minimized ? MINIMIZED_SIZE : expandedHeight;
  const quickDuration = reduceMotion ? 1 : 140;
  const hoverDuration = reduceMotion ? 1 : 140;
  const chatEnterDuration = reduceMotion ? 1 : 180;
  const chatExitDuration = reduceMotion ? 1 : 135;

  useEffect(() => {
    if (reduceMotion) {
      setCompactIntro(false);
      return;
    }
    const timer = window.setTimeout(() => setCompactIntro(false), 1450);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    if (!chatOpen || dismissed) return;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    (shadowContainer ?? document.body).appendChild(el);
    setPortalEl(el);
    return () => {
      el.remove();
      setPortalEl(null);
    };
  }, [chatOpen, dismissed, shadowContainer]);

  useEffect(() => {
    if (!chatOpen || !portalEl || dismissed) return;
    const frame = window.requestAnimationFrame(() => setChatVisible(!minimized));
    return () => window.cancelAnimationFrame(frame);
  }, [chatOpen, dismissed, minimized, portalEl]);

  useEffect(() => {
    const onResize = () => {
      setTopPx((current) => Math.max(12, Math.min(window.innerHeight - activeHeight - 12, current)));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeHeight]);

  useEffect(() => {
    setTopPx((current) => Math.max(12, Math.min(window.innerHeight - activeHeight - 12, current)));
  }, [activeHeight]);

  const openPaperPage = () => {
    if (!result?.sgrid) return;
    void browser.runtime.sendMessage({
      type: 'paperlens:openArticle',
      sgrid: result.sgrid,
    });
  };

  const openPaperEvaluationPage = () => {
    if (!result?.sgrid) return;
    void browser.runtime.sendMessage({
      type: 'paperlens:openArticle',
      sgrid: result.sgrid,
      tab: 'evaluate',
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, top: topPx, moved: false };
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const delta = e.clientY - drag.current.y;
    if (Math.abs(delta) > 4) {
      drag.current.moved = true;
      e.preventDefault();
      setTopPx(Math.max(12, Math.min(window.innerHeight - activeHeight - 12, drag.current.top + delta)));
    }
  };

  const onPointerUp = () => {
    drag.current = null;
    setIsDragging(false);
  };

  const toggleChat = () => {
    if (!canChat) return;
    if (chatOpen && chatVisible) {
      setChatVisible(false);
      return;
    }
    if (chatOpen && !chatVisible) {
      setChatVisible(true);
      return;
    }
    setChatOpen(true);
  };

  const closeChat = () => {
    setChatVisible(false);
  };

  const toggleCurrentProjectArticle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!result || !projectMatch || projectArticleActionDisabled) return;

    if (projectArticleSaved && savedProjectArticle) {
      setProjectArticleBusy('remove');
      try {
        await removeArticleFromProject(projectMatch.project_id, savedProjectArticle.id);
      } finally {
        setProjectArticleBusy(null);
      }
      return;
    }

    setProjectArticleBusy('add');
    try {
      await addArticleToProject(projectMatch.project_id, {
        sgrid: result.sgrid,
        doi: result.doi,
        pii: result.pii,
      });
    } finally {
      setProjectArticleBusy(null);
    }
  };

  const chatHeight = Math.max(300, Math.min(CHAT_HEIGHT, window.innerHeight - 24));
  const availableChatWidth = Math.max(280, window.innerWidth - PANEL_WIDTH - 28);
  const chatWidth = Math.min(CHAT_WIDTH, availableChatWidth);
  const cardTop = Math.max(12, Math.min(window.innerHeight - chatHeight - 12, topPx - 18));

  const actionRowStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 48,
    borderRadius: 10,
    padding: '8px 10px',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    fontFamily: 'inherit',
    fontSize: 13,
    fontWeight: 750,
    lineHeight: 1.25,
    textDecoration: 'none',
    textAlign: 'left',
  };

  const projectArticleActionLabel = !projectsReady
    ? 'Checking project...'
    : projectArticleSaved
      ? 'Remove from project'
      : 'Add to this project';
  const projectArticleActionIcon = projectArticleBusy ? (
    <Loader size={15} color="currentColor" />
  ) : projectArticleSaved ? (
    <Trash2 size={16} />
  ) : (
    <FolderPlus size={16} />
  );

  const chatTransition = {
    common: { transformOrigin: 'right center' },
    in: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
    out: { opacity: 0, transform: 'translate3d(10px, 4px, 0) scale(0.985)' },
    transitionProperty: 'opacity, transform',
  } as const;

  const fullWidgetTransition = {
    common: { transformOrigin: 'right center' },
    in: { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
    out: { opacity: 0, transform: 'translate3d(8px, 0, 0) scale(0.98)' },
    transitionProperty: 'opacity, transform',
  } as const;

  const compactWidgetTransition = {
    common: { transformOrigin: 'right center' },
    in: { opacity: 1, transform: 'scale(1)' },
    out: { opacity: 0, transform: 'scale(0.9)' },
    transitionProperty: 'opacity, transform',
  } as const;

  if (dismissed) return null;

  return (
    <>
      <style>
        {`
          .paperlens-floating-shell {
            transition:
              width ${quickDuration}ms ${MOTION_EASE},
              height ${quickDuration}ms ${MOTION_EASE},
              top ${quickDuration}ms ${MOTION_EASE};
          }

          @keyframes paperlens-compact-arrive {
            0% {
              opacity: 0;
              transform: translate3d(16px, 0, 0) scale(0.88);
              box-shadow: 0 0 0 0 rgba(232, 119, 34, 0);
            }
            28% {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1.04);
              box-shadow: 0 0 0 9px rgba(232, 119, 34, 0.16);
            }
            58% {
              transform: translate3d(0, 0, 0) scale(1);
              box-shadow: 0 0 0 4px rgba(232, 119, 34, 0.11);
            }
            100% {
              opacity: 1;
              transform: translate3d(0, 0, 0) scale(1);
              box-shadow: 0 12px 28px rgba(232, 119, 34, 0.24), 0 2px 8px rgba(20, 20, 18, 0.08);
            }
          }

          .paperlens-floating-compact-button.paperlens-floating-introduce {
            animation: paperlens-compact-arrive 900ms ${MOTION_EASE} both;
          }

          .paperlens-floating-link,
          .paperlens-floating-ask,
          .paperlens-floating-project-action,
          .paperlens-floating-icon-button,
          .paperlens-floating-compact-button {
            transition:
              transform ${hoverDuration}ms ${MOTION_EASE},
              background-color ${hoverDuration}ms ease,
              border-color ${hoverDuration}ms ease,
              box-shadow ${hoverDuration}ms ease,
              color ${hoverDuration}ms ease,
              opacity ${hoverDuration}ms ease;
          }

          .paperlens-floating-link:not(:disabled):hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 14px rgba(20, 20, 18, 0.08);
          }

          .paperlens-floating-link:not(:disabled):hover .paperlens-floating-external-icon {
            transform: translateX(1px);
          }

          .paperlens-floating-external-icon {
            transition: transform ${hoverDuration}ms ${MOTION_EASE};
          }

          .paperlens-floating-ask {
            position: relative;
            overflow: hidden;
            box-shadow: 0 6px 16px rgba(232, 119, 34, 0.1);
          }

          .paperlens-floating-ask::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: ${ORANGE};
            opacity: 0;
            transform: translateY(-1px);
            transition:
              transform ${hoverDuration + 40}ms ${MOTION_EASE},
              opacity ${hoverDuration + 40}ms ease;
            pointer-events: none;
          }

          .paperlens-floating-ask.paperlens-floating-ask-open {
            box-shadow: 0 6px 16px rgba(232, 119, 34, 0.12);
          }

          .paperlens-floating-ask.paperlens-floating-ask-open::before {
            opacity: 0.9;
            transform: translateY(0);
          }

          .paperlens-floating-icon-button:hover,
          .paperlens-floating-compact-button:hover,
          .paperlens-floating-project-action:not(:disabled):hover,
          .paperlens-floating-ask:not(:disabled):hover {
            transform: translateY(-1px);
            background-color: #FFF8F2;
          }

          .paperlens-floating-icon-button:active,
          .paperlens-floating-compact-button:active,
          .paperlens-floating-project-action:not(:disabled):active,
          .paperlens-floating-ask:not(:disabled):active,
          .paperlens-floating-link:not(:disabled):active {
            transform: translateY(0);
          }
        `}
      </style>
      <div
        className="paperlens-floating-shell"
        style={{
          position: 'fixed',
          right: 0,
          top: topPx,
          width: minimized ? MINIMIZED_SIZE : PANEL_WIDTH,
          height: activeHeight,
          zIndex: 2147483647,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          userSelect: 'none',
          color: INK,
          pointerEvents: 'auto',
        }}
      >
        <Transition
          mounted={minimized}
          transition={compactWidgetTransition}
          duration={quickDuration}
          exitDuration={quickDuration}
          timingFunction={MOTION_EASE}
          keepMounted
        >
          {(styles) => (
            <button
              type="button"
              className={`paperlens-floating-compact-button${compactIntro ? ' paperlens-floating-introduce' : ''}`}
              aria-label="Show Elsevier Lens"
              title="Show Elsevier Lens"
              onClick={() => setMinimized(false)}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: MINIMIZED_SIZE,
                height: MINIMIZED_SIZE,
                display: 'grid',
                placeItems: 'center',
                background: ORANGE,
                border: '1px solid rgba(201, 96, 21, 0.22)',
                borderRight: 'none',
                borderRadius: '10px 0 0 10px',
                boxShadow: '0 12px 28px rgba(232, 119, 34, 0.24), 0 2px 8px rgba(20, 20, 18, 0.08)',
                cursor: 'pointer',
                padding: 0,
                ...styles,
              }}
            >
              <img
                src={logoUrl}
                alt="Elsevier Lens"
                style={{ width: 20, height: 23, objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }}
              />
            </button>
          )}
        </Transition>

        <Transition
          mounted={!minimized}
          transition={fullWidgetTransition}
          duration={quickDuration}
          exitDuration={quickDuration}
          timingFunction={MOTION_EASE}
          keepMounted
        >
          {(styles) => (
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: PANEL_WIDTH,
                background: '#fff',
                border: `1px solid ${BORDER}`,
                borderRight: 'none',
                borderRadius: '10px 0 0 10px',
                boxShadow: '0 14px 34px rgba(20, 20, 18, 0.16), 0 2px 8px rgba(20, 20, 18, 0.08)',
                overflow: 'hidden',
                ...styles,
              }}
            >
            <div
              style={{
                minHeight: 54,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 10px 9px 12px',
                background: '#fff',
                borderBottom: `1px solid ${BORDER}`,
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none',
              }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onLostPointerCapture={onPointerUp}
            >
              <div
                aria-label="Drag Elsevier Lens"
                title="Drag to reposition"
                style={{
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    minWidth: 34,
                    display: 'grid',
                    placeItems: 'center',
                    borderRadius: 9,
                    background: ORANGE,
                    border: '1px solid rgba(201, 96, 21, 0.18)',
                  }}
                >
                  <img
                    src={logoUrl}
                    alt="Elsevier Lens"
                    style={{ width: 18, height: 21, objectFit: 'contain', display: 'block', filter: 'brightness(0) invert(1)' }}
                  />
                </span>
                <span style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                  <span
                    style={{
                      minWidth: 0,
                      color: INK,
                      fontSize: 14,
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    Lens
                  </span>
                  <span style={{ color: MUTED, fontSize: 11, fontWeight: 650, lineHeight: 1.2 }}>by Elsevier</span>
                </span>
              </div>

              <BorderedIconButton
                label="Minimize Elsevier Lens"
                title="Minimize"
                size={30}
                radius={9}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setMinimized(true);
                  closeChat();
                }}
              >
                <Minus size={15} />
              </BorderedIconButton>
            </div>

            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 9, background: SURFACE }}>
              <button
                type="button"
                className={`paperlens-floating-ask${chatOpen ? ' paperlens-floating-ask-open' : ''}`}
                aria-label="Ask PaperLens AI"
                title={canChat ? 'Ask PaperLens AI' : 'Resolving article...'}
                disabled={!canChat}
                onClick={toggleChat}
                style={{
                  ...actionRowStyle,
                  minHeight: 54,
                  background: '#FFF3EA',
                  color: INK,
                  border: '1px solid rgba(232, 119, 34, 0.2)',
                  cursor: canChat ? 'pointer' : 'not-allowed',
                  opacity: canChat ? 1 : 0.55,
                }}
              >
                <span
                  style={{
                    width: 31,
                    height: 31,
                    minWidth: 31,
                    display: 'inline-grid',
                    placeItems: 'center',
                    borderRadius: 9,
                    border: '1px solid rgba(201, 96, 21, 0.16)',
                    background: ORANGE,
                    color: '#FFFFFF',
                  }}
                >
                  <Sparkles size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Ask AI</span>
                  <span
                    style={{
                      color: MUTED,
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    Chat about this article
                  </span>
                </span>
                <ArrowRight size={16} color={ORANGE} />
              </button>

              {projectMatch && (
                <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                  <SectionLabel>Project match</SectionLabel>
                  <EvaluationProgressCard
                    level={projectMatch.rating_level}
                    title={projectName}
                    onClick={openPaperEvaluationPage}
                    disabled={!canOpenArticle}
                    ariaLabel={`Project match for ${projectName}. Open in Lens.`}
                    clickTooltip="View breakdown"
                    compact
                    action={
                      <button
                        type="button"
                        className="paperlens-floating-project-action"
                        disabled={projectArticleActionDisabled}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => void toggleCurrentProjectArticle(event)}
                        style={{
                          width: '100%',
                          minHeight: 42,
                          borderRadius: 9,
                          border: '1px solid rgba(47, 47, 43, 0.18)',
                          background: 'transparent',
                          color: 'inherit',
                          cursor: projectArticleActionDisabled ? 'not-allowed' : 'pointer',
                          opacity: projectArticleActionDisabled ? 0.58 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          fontFamily: 'inherit',
                          fontSize: 12,
                          fontWeight: 800,
                          lineHeight: 1.2,
                          textAlign: 'center',
                        }}
                        title={!canSaveArticle ? 'Article identifiers unavailable' : projectArticleActionLabel}
                      >
                        <span style={{ width: 18, height: 18, display: 'inline-grid', placeItems: 'center' }}>
                          {projectArticleActionIcon}
                        </span>
                        <span
                          style={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {projectArticleActionLabel}
                        </span>
                      </button>
                    }
                  />
                </div>
              )}

              <div style={{ display: 'grid', gap: 6 }}>
                <SectionLabel>Open in extension</SectionLabel>
                <button
                  type="button"
                  className="paperlens-floating-link"
                  aria-label="View in Lens"
                  title={canOpenArticle ? 'View in Lens' : 'Resolving article...'}
                  disabled={!canOpenArticle}
                  onClick={openPaperPage}
                  style={{
                    ...actionRowStyle,
                    background: '#fff',
                    border: `1px solid ${BORDER}`,
                    color: INK,
                    cursor: canOpenArticle ? 'pointer' : 'not-allowed',
                    opacity: canOpenArticle ? 1 : 0.58,
                  }}
                >
                  <RowIcon>
                    <BookOpen size={16} />
                  </RowIcon>
                  <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
                    <span>View in Lens</span>
                    <span
                      style={{
                        color: MUTED,
                        fontSize: 12,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      Full article workspace
                    </span>
                  </span>
                  <ArrowRight className="paperlens-floating-external-icon" size={16} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <SectionLabel>Links</SectionLabel>
                {scopusUrl ? (
                  <a
                    href={scopusUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="paperlens-floating-link"
                    style={{
                      ...actionRowStyle,
                      background: '#fff',
                      border: `1px solid ${BORDER}`,
                      color: INK,
                    }}
                  >
                    <RowIcon tone="blue">
                      <FileSearch size={16} />
                    </RowIcon>
                    <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
                      <span>Scopus</span>
                      <span
                        style={{
                          color: MUTED,
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        Citations
                      </span>
                    </span>
                    <ExternalLink className="paperlens-floating-external-icon" size={15} />
                  </a>
                ) : (
                  <div
                    aria-disabled="true"
                    style={{
                      ...actionRowStyle,
                      background: '#fff',
                      border: `1px solid ${BORDER}`,
                      color: MUTED,
                      opacity: 0.64,
                    }}
                  >
                    <RowIcon>
                      <FileSearch size={16} />
                    </RowIcon>
                    <span style={{ flex: 1 }}>{result ? 'Scopus unavailable' : 'Resolving'}</span>
                  </div>
                )}

                {scienceDirectUrl && (
                  <a
                    href={scienceDirectUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="paperlens-floating-link"
                    style={{
                      ...actionRowStyle,
                      background: '#fff',
                      border: `1px solid ${BORDER}`,
                      color: INK,
                    }}
                  >
                    <RowIcon tone="orange">
                      <FileText size={16} />
                    </RowIcon>
                    <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 3 }}>
                      <span>ScienceDirect</span>
                      <span
                        style={{
                          color: MUTED,
                          fontSize: 12,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        Full text
                      </span>
                    </span>
                    <ExternalLink className="paperlens-floating-external-icon" size={15} />
                  </a>
                )}
              </div>
            </div>
            </div>
          )}
        </Transition>
      </div>

      {chatOpen && portalEl &&
        createPortal(
          <MantineProvider
            theme={theme}
            defaultColorScheme="light"
            cssVariablesSelector={shadowContainer ? ':host' : ':root'}
            getRootElement={shadowContainer ? () => shadowContainer : undefined}
          >
            <Transition
              mounted={chatVisible && !minimized && !dismissed}
              transition={chatTransition}
              duration={chatEnterDuration}
              exitDuration={chatExitDuration}
              timingFunction={MOTION_EASE}
              onExited={() => {
                if (!chatVisible) {
                  setChatOpen(false);
                }
              }}
            >
              {(styles) => (
                <div
                  style={{
                    position: 'fixed',
                    top: cardTop,
                    right: PANEL_WIDTH + 12,
                    width: chatWidth,
                    height: chatHeight,
                    pointerEvents: 'auto',
                    fontFamily:
                      'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                    boxShadow: '0 22px 56px rgba(20, 20, 18, 0.24), 0 4px 16px rgba(20, 20, 18, 0.14)',
                    borderRadius: '14px',
                    overflow: 'visible',
                    background: 'transparent',
                    ...styles,
                  }}
                >
                  <ChatPanel
                    sgrid={result?.sgrid ?? null}
                    doi={result?.doi ?? null}
                    title={null}
                    suggestions={result?.suggestions ?? null}
                    height={chatHeight}
                    onMinimize={closeChat}
                  />
                </div>
              )}
            </Transition>
          </MantineProvider>,
          portalEl,
        )}
    </>
  );
}
