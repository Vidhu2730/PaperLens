import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Box, Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { Sparkles } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import AppShell from './AppShell';
import ArticlePage from './pages/ArticlePage';
import SearchPage from './pages/SearchPage';
import ProjectsPage from './pages/ProjectsPage';
import { clearEmail, getSavedEmail, saveEmail } from '../../src/auth';
import { ProjectsProvider } from '../../src/contexts/ProjectsContext';

function LoginPage({ onLogin }: { onLogin: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const elsevierLogoUrl = browser.runtime.getURL('/elsevier_logo_tree.svg');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized) {
      setError('Email address is required.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!normalized.endsWith('@elsevier.com')) {
      setError('Only @elsevier.com addresses are permitted.');
      return;
    }
    void saveEmail(normalized).then(() => onLogin(normalized));
  };

  return (
    <Box
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #FFFBF7 0%, #FFF3EA 55%, #FAFAF7 100%)',
        padding: '32px 16px',
      }}
    >
      <Box style={{ width: '100%', maxWidth: 400 }}>
        {/* Branding — outside the card */}
        <Stack align="center" gap={10} mb={28}>
          <Box
            component="img"
            src={elsevierLogoUrl}
            alt="Elsevier"
            style={{ width: 116, height: 'auto' }}
          />
          <Stack align="center" gap={6} mt={4}>
            <Group gap={8} align="center">
              <Box
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 7,
                  background: 'linear-gradient(135deg, #F59848 0%, #E87722 100%)',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 2px 10px rgba(232, 119, 34, 0.38)',
                  flexShrink: 0,
                }}
              >
                <Sparkles size={14} color="white" strokeWidth={2.5} />
              </Box>
              <Text fz={21} fw={700} c="dark.8" style={{ letterSpacing: -0.4 }}>
                PaperLens
              </Text>
            </Group>
            <Text fz="sm" c="dimmed" ta="center" style={{ maxWidth: 280 }}>
              AI-powered literature review for Elsevier researchers
            </Text>
          </Stack>
        </Stack>

        {/* Sign-in card */}
        <Box
          component="form"
          onSubmit={submit}
          style={{
            background: '#FFFFFF',
            border: '1px solid #E5E5E2',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(20, 20, 18, 0.07), 0 1px 4px rgba(20, 20, 18, 0.05)',
          }}
        >
          {/* Orange top accent */}
          <Box
            style={{
              height: 3,
              background: 'linear-gradient(90deg, #F59848 0%, #E87722 100%)',
            }}
          />

          <Stack gap="lg" p={28}>
            <Stack gap={4}>
              <Text fz={16} fw={700} c="dark.8">
                Sign in to your account
              </Text>
              <Text fz="sm" c="dimmed">
                Access your projects and saved articles.
              </Text>
            </Stack>

            <TextInput
              label="Email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                if (error) setError(null);
              }}
              placeholder="you@elsevier.com"
              error={error}
              autoFocus
              radius="md"
              size="sm"
            />

            <Button type="submit" color="elsevierOrange" radius="md" fullWidth size="sm">
              Sign in
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}

export default function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSavedEmail().then((saved) => {
      setEmail(saved);
      setLoading(false);
    });
  }, []);

  if (loading) return null;

  if (!email) {
    return <LoginPage onLogin={setEmail} />;
  }

  return (
    <HashRouter>
      <ProjectsProvider>
        <AppShell
          email={email}
          onLogout={() => {
            void clearEmail().then(() => setEmail(null));
          }}
        >
          <Routes>
            <Route path="/article" element={<ArticlePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/projects/:id?" element={<ProjectsPage />} />
            <Route path="*" element={<Navigate to="/article?tab=discover" replace />} />
          </Routes>
        </AppShell>
      </ProjectsProvider>
    </HashRouter>
  );
}
