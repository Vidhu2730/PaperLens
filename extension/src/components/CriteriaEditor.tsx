import { Box, Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { Check, Edit3, Plus, Trash2, X } from 'lucide-react';
import { KeyboardEvent, useState } from 'react';
import BorderedIconButton from './BorderedIconButton';

interface Props {
  criteria: string[];
  onChange: (criteria: string[]) => void;
}

function clean(value: string) {
  return value.replace(/\r\n/g, '\n').trim();
}

function comparisonKey(value: string) {
  return clean(value).replace(/\s+/g, ' ').toLowerCase();
}

export default function CriteriaEditor({ criteria, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const cleanCriteria = criteria.map(clean).filter(Boolean);
  const editDuplicate = editingIndex !== null && cleanCriteria.some(
    (criterion, idx) => idx !== editingIndex && comparisonKey(criterion) === comparisonKey(editDraft),
  );

  const add = () => {
    const next = clean(draft);
    if (!next) return;
    const exists = cleanCriteria.some((criterion) => comparisonKey(criterion) === comparisonKey(next));
    if (exists) {
      setDraft('');
      return;
    }
    onChange([...cleanCriteria, next]);
    setDraft('');
  };

  const remove = (idx: number) => {
    onChange(cleanCriteria.filter((_, i) => i !== idx));
    setDeleteIndex(null);
  };

  const beginEdit = (idx: number) => {
    setEditingIndex(idx);
    setEditDraft(cleanCriteria[idx] ?? '');
  };

  const saveEdit = () => {
    if (editingIndex === null) return;
    const next = clean(editDraft);
    if (!next) return;
    const duplicate = cleanCriteria.some(
      (criterion, idx) => idx !== editingIndex && comparisonKey(criterion) === comparisonKey(next),
    );
    if (duplicate) return;
    onChange(cleanCriteria.map((criterion, idx) => (idx === editingIndex ? next : criterion)));
    setEditingIndex(null);
    setEditDraft('');
  };

  const closeEdit = () => {
    setEditingIndex(null);
    setEditDraft('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      add();
    }
  };

  return (
    <Stack gap="sm">
      <Stack gap={8}>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={onKeyDown}
          placeholder="Add a detailed inclusion criterion"
          radius="md"
          autosize
          minRows={6}
          maxRows={14}
        />
        <Group justify="flex-end">
          <Button
            color="elsevierOrange"
            radius="md"
            leftSection={<Plus size={14} />}
            onClick={add}
            disabled={!clean(draft)}
          >
            Add criterion
          </Button>
        </Group>
      </Stack>

      {cleanCriteria.length === 0 ? (
        <Box
          style={{
            padding: 14,
            border: '1px dashed #D4D4D0',
            borderRadius: 10,
            textAlign: 'center',
          }}
        >
          <Text fz="xs" c="dimmed">
            Add inclusion criteria the article should match.
          </Text>
        </Box>
      ) : (
        <Stack gap="sm">
          {cleanCriteria.map((value, idx) => {
            if (editingIndex === idx) {
              return (
                <Stack key={`${value}-${idx}`} gap={6}>
                  <Box style={{ position: 'relative' }}>
                    <Textarea
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.currentTarget.value)}
                      autoFocus
                      autosize
                      minRows={6}
                      maxRows={16}
                      styles={{
                        input: {
                          display: 'block',
                          width: '100%',
                          border: `1px solid ${editDuplicate ? '#FA5252' : '#EAA76E'}`,
                          borderRadius: 8,
                          background: '#FFFFFF',
                          padding: '14px 90px 14px 14px',
                          color: '#2F2F2A',
                          fontSize: 14,
                          lineHeight: 1.6,
                          boxShadow: editDuplicate
                            ? '0 0 0 3px rgba(250, 82, 82, 0.12)'
                            : '0 0 0 3px rgba(232, 119, 34, 0.12)',
                          resize: 'none',
                        },
                      }}
                    />
                    <Group
                      gap={6}
                      wrap="nowrap"
                      style={{
                        position: 'absolute',
                        top: 10,
                        right: 10,
                      }}
                    >
                      <BorderedIconButton
                        label="Save criterion"
                        tone="green"
                        size={30}
                        radius={8}
                        onClick={saveEdit}
                        disabled={!clean(editDraft) || editDuplicate}
                      >
                        <Check size={15} />
                      </BorderedIconButton>
                      <BorderedIconButton
                        label="Cancel edit"
                        tone="orange"
                        size={30}
                        radius={8}
                        onClick={closeEdit}
                      >
                        <X size={15} />
                      </BorderedIconButton>
                    </Group>
                  </Box>
                  {editDuplicate && (
                    <Text fz="xs" c="red">
                      Another criterion already uses this text.
                    </Text>
                  )}
                </Stack>
              );
            }

            return (
              <Box
                key={`${value}-${idx}`}
                style={{
                  padding: 14,
                  border: '1px solid #E5E5E2',
                  borderRadius: 8,
                  background: '#FFFFFF',
                }}
              >
                <Group align="flex-start" gap="sm" wrap="nowrap">
                  <Text
                    fz="sm"
                    lh={1.6}
                    c="dark.7"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: 'pre-wrap',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {value}
                  </Text>
                  <Group gap={6} wrap="nowrap" style={{ flexShrink: 0 }}>
                    <BorderedIconButton
                      label="Edit criterion"
                      tone="neutral"
                      size={30}
                      radius={8}
                      onClick={() => beginEdit(idx)}
                    >
                      <Edit3 size={15} />
                    </BorderedIconButton>
                    <BorderedIconButton
                      label="Delete criterion"
                      tone="danger"
                      size={30}
                      radius={8}
                      onClick={() => setDeleteIndex(idx)}
                    >
                      <Trash2 size={15} />
                    </BorderedIconButton>
                  </Group>
                </Group>
              </Box>
            );
          })}
        </Stack>
      )}

      <Modal opened={deleteIndex !== null} onClose={() => setDeleteIndex(null)} title="Delete criterion?" radius="md" centered>
        <Stack gap="md">
          <Text fz="sm" c="dimmed">
            This criterion will be removed from the project.
          </Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setDeleteIndex(null)}>
              Cancel
            </Button>
            <Button color="red" leftSection={<Trash2 size={14} />} onClick={() => deleteIndex !== null && remove(deleteIndex)}>
              Delete criterion
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
