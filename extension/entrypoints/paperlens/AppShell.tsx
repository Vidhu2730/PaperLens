import { ActionIcon, Badge, Box, Group, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { CheckCircle2, FolderKanban, LogOut, Plus, Search, Sparkles } from 'lucide-react';
import { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useProjectsContext } from '../../src/contexts/ProjectsContext';

interface NavItemConfig {
  to: string;
  icon: ReactNode;
  label: string;
  matchPrefix: string;
}

const NAV: NavItemConfig[] = [
  { to: '/article?tab=discover', icon: <Search size={18} />, label: 'Discover', matchPrefix: '/article' },
  { to: '/projects', icon: <FolderKanban size={18} />, label: 'Projects', matchPrefix: '/projects' },
];

const SIDEBAR_WIDTH = 240;
const EXPANDED_SIDEBAR_WIDTH = 340;
const RAIL_WIDTH = 64;
const LABEL_AREA_WIDTH = SIDEBAR_WIDTH - RAIL_WIDTH;
const PROJECTS_PANEL_WIDTH = EXPANDED_SIDEBAR_WIDTH - RAIL_WIDTH;
const EASE = '220ms cubic-bezier(0.2, 0.8, 0.2, 1)';

export default function AppShell({
  children,
  email,
  onLogout,
}: {
  children: ReactNode;
  email: string;
  onLogout: () => void;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeId = pathname.startsWith('/projects/') ? pathname.split('/')[2] : undefined;
  const { projects, createProject } = useProjectsContext();

  const isProjectsSection = pathname.startsWith('/projects');

  const handleCreate = async () => {
    const project = await createProject('Untitled project');
    navigate(`/projects/${project.id}`);
  };

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', background: 'var(--mantine-other-surface, #FAFAF7)' }}>
      <style>
        {`
          @media (prefers-reduced-motion: reduce) {
            [data-paperlens-sidebar='true'],
            [data-paperlens-sidebar='true'] * {
              transition-duration: 1ms !important;
            }
          }
        `}
      </style>
      <Box
        component="nav"
        aria-label="PaperLens navigation"
        data-paperlens-sidebar="true"
        style={{
          width: isProjectsSection ? EXPANDED_SIDEBAR_WIDTH : SIDEBAR_WIDTH,
          flexShrink: 0,
          borderRight: '1px solid #E5E5E2',
          background: '#FFFFFF',
          position: 'sticky',
          top: 0,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          transition: `width ${EASE}`,
        }}
      >
        <Box style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
          <Box
            style={{
              width: isProjectsSection ? RAIL_WIDTH : SIDEBAR_WIDTH,
              flexShrink: 0,
              borderRight: isProjectsSection ? '1px solid #E5E5E2' : '1px solid transparent',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              transition: `width ${EASE}, border-color ${EASE}`,
            }}
          >
            <Box
              style={{
                height: 66,
                display: 'flex',
                alignItems: 'center',
                overflow: 'hidden',
              }}
            >
              <Box style={{ width: RAIL_WIDTH, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                <Box
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #F59848 0%, #E87722 100%)',
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 4px 12px rgba(232, 119, 34, 0.35)',
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={16} color="white" strokeWidth={2.5} />
                </Box>
              </Box>
              <Stack
                gap={0}
                style={{
                  width: isProjectsSection ? 0 : LABEL_AREA_WIDTH,
                  opacity: isProjectsSection ? 0 : 1,
                  overflow: 'hidden',
                  transform: isProjectsSection ? 'translateX(-6px)' : 'translateX(0)',
                  transition: `opacity ${EASE}, transform ${EASE}, width ${EASE}`,
                  whiteSpace: 'nowrap',
                }}
              >
                <Text fz="sm" fw={700} c="dark.8" style={{ letterSpacing: -0.2 }}>
                  PaperLens
                </Text>
                <Text fz={10} c="dimmed" tt="uppercase" style={{ letterSpacing: 1.2 }}>
                  Elsevier
                </Text>
              </Stack>
            </Box>

            <Stack
              gap={2}
              style={{
                padding: 0,
              }}
            >
              {NAV.map((item) => {
                const active = pathname.startsWith(item.matchPrefix);
                return (
                  <Tooltip
                    key={item.to}
                    label={item.label}
                    position="right"
                    withArrow
                    disabled={!isProjectsSection}
                    transitionProps={{ duration: 0 }}
                  >
                    <UnstyledButton
                      component={Link}
                      to={item.to}
                      aria-label={item.label}
                      style={{
                        width: isProjectsSection ? 40 : SIDEBAR_WIDTH - 16,
                        height: 40,
                        margin: isProjectsSection ? '0 12px' : '0 8px',
                        padding: 0,
                        borderRadius: 10,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        fontSize: 14,
                        fontWeight: active ? 600 : 500,
                        color: active ? '#C96015' : '#3F3F3A',
                        background: active ? 'rgba(232, 119, 34, 0.08)' : 'transparent',
                        overflow: 'hidden',
                        transition: `background 120ms ease, width ${EASE}, margin ${EASE}`,
                      }}
                      onMouseEnter={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.03)';
                      }}
                      onMouseLeave={(e) => {
                        if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      <Box
                        style={{
                          width: isProjectsSection ? 40 : 48,
                          flexShrink: 0,
                          display: 'grid',
                          placeItems: 'center',
                          transition: `width ${EASE}`,
                        }}
                      >
                        {item.icon}
                      </Box>
                      <Box
                        component="span"
                        style={{
                          width: isProjectsSection ? 0 : SIDEBAR_WIDTH - 64,
                          opacity: isProjectsSection ? 0 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          transform: isProjectsSection ? 'translateX(-6px)' : 'translateX(0)',
                          transition: `opacity ${EASE}, transform ${EASE}, width ${EASE}`,
                        }}
                      >
                        <Box component="span" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.label}
                        </Box>
                        {item.matchPrefix === '/projects' && projects.length > 0 && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="elsevierOrange"
                            style={{
                              flexShrink: 0,
                              fontWeight: 600,
                              opacity: isProjectsSection ? 0 : 1,
                              transform: isProjectsSection ? 'scale(0.86)' : 'scale(1)',
                              transition: `opacity ${EASE}, transform ${EASE}`,
                            }}
                          >
                            {projects.length}
                          </Badge>
                        )}
                      </Box>
                    </UnstyledButton>
                  </Tooltip>
                );
              })}
            </Stack>

            <Box style={{ flex: 1, minHeight: 0 }} />

            <Box
              style={{
                height: isProjectsSection ? 46 : 92,
                display: 'flex',
                alignItems: 'center',
                justifyContent: isProjectsSection ? 'flex-start' : 'center',
                overflow: 'hidden',
                transition: `height ${EASE}`,
              }}
            >
              <Box
                style={{
                  width: isProjectsSection ? RAIL_WIDTH : SIDEBAR_WIDTH,
                  display: 'flex',
                  justifyContent: 'center',
                  transition: `width ${EASE}`,
                }}
              >
                <img
                  src="/elsevier_logo_tree.svg"
                  alt="Elsevier"
                  style={{
                    width: isProjectsSection ? 24 : 72,
                    height: 'auto',
                    opacity: isProjectsSection ? 0.62 : 0.55,
                    transition: `width ${EASE}, opacity ${EASE}`,
                  }}
                />
              </Box>
            </Box>
          </Box>

          <Box
            aria-hidden={!isProjectsSection}
            style={{
              width: isProjectsSection ? PROJECTS_PANEL_WIDTH : 0,
              flexShrink: 0,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              opacity: isProjectsSection ? 1 : 0,
              transform: isProjectsSection ? 'translateX(0)' : 'translateX(-10px)',
              pointerEvents: isProjectsSection ? 'auto' : 'none',
              transition: `width ${EASE}, opacity ${EASE}, transform ${EASE}`,
            }}
          >
            <Box style={{ width: PROJECTS_PANEL_WIDTH, display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
              <Group px="sm" pt="md" pb="xs" justify="space-between" align="center" wrap="nowrap">
                <Stack gap={1} style={{ minWidth: 0 }}>
                  <Text fz={10} fw={600} c="dimmed" tt="uppercase" style={{ letterSpacing: 1.1 }}>
                    Projects
                  </Text>
                  <Text fz="sm" fw={700} c="dark.8" lineClamp={1}>
                    Research spaces
                  </Text>
                </Stack>
                <Tooltip label="New project">
                  <ActionIcon
                    variant="light"
                    color="elsevierOrange"
                    radius="md"
                    size="sm"
                    onClick={handleCreate}
                    aria-label="New project"
                    tabIndex={isProjectsSection ? 0 : -1}
                  >
                    <Plus size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>

              <ScrollArea style={{ flex: 1, minHeight: 0 }} scrollbarSize={4}>
                <Stack gap={3} px="xs" pb="xs">
                  {projects.length === 0 ? (
                    <Text fz="xs" c="dimmed" px="xs" py="sm">
                      No projects yet.
                    </Text>
                  ) : (
                    projects.map((p) => {
                      const active = p.id === activeId;
                      const current = p.is_current;
                      return (
                        <UnstyledButton
                          key={p.id}
                          component={Link}
                          to={`/projects/${p.id}`}
                          tabIndex={isProjectsSection ? 0 : -1}
                          style={{
                            borderRadius: 10,
                            border: active ? '1px solid rgba(232, 119, 34, 0.24)' : '1px solid transparent',
                            background: active ? '#FFFFFF' : 'transparent',
                            boxShadow: active ? '0 4px 12px rgba(20, 20, 18, 0.06)' : 'none',
                            display: 'block',
                            textAlign: 'left',
                            width: '100%',
                            transition: 'background 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
                          }}
                          onMouseEnter={(e) => {
                            if (!active) (e.currentTarget as HTMLElement).style.background = 'rgba(0,0,0,0.03)';
                          }}
                          onMouseLeave={(e) => {
                            if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent';
                          }}
                        >
                          <Group gap={8} align="flex-start" wrap="nowrap" p="10px">
                            <Box style={{ flex: 1, minWidth: 0 }}>
                              <Text
                                fz="sm"
                                fw={active ? 700 : 500}
                                c={active ? 'elsevierOrange.8' : 'dark.7'}
                                lineClamp={1}
                              >
                                {p.name || 'Untitled project'}
                              </Text>
                              <Text fz={11} c="dimmed" mt={5}>
                                {p.criteria.length} criteria / {p.articles.length} articles
                              </Text>
                            </Box>

                            {current && (
                              <Badge
                                variant="light"
                                color="green"
                                radius="sm"
                                leftSection={<CheckCircle2 size={10} />}
                                style={{ flexShrink: 0, height: 26, marginTop: -1 }}
                              >
                                Current
                              </Badge>
                            )}
                          </Group>
                        </UnstyledButton>
                      );
                    })
                  )}
                </Stack>
              </ScrollArea>
            </Box>
          </Box>
        </Box>

        <Box
          style={{
            flexShrink: 0,
            padding: '10px 12px 12px',
            borderTop: '1px solid #E5E5E2',
          }}
        >
          <Group gap={8} wrap="nowrap" align="center" justify="space-between">
            <Tooltip label="Logout">
              <ActionIcon
                variant="default"
                size={30}
                radius="md"
                onClick={onLogout}
                aria-label="Logout"
                style={{
                  flexShrink: 0,
                }}
              >
                <LogOut size={15} />
              </ActionIcon>
            </Tooltip>
            <Text fz={11} c="dimmed" lineClamp={1} ta="right" style={{ flex: 1, minWidth: 0 }}>
              {email}
            </Text>
          </Group>
        </Box>
      </Box>

      <Box style={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}
