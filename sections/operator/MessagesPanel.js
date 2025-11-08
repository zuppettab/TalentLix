'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Inbox,
  Loader2,
  MessageCircle,
  MessageSquarePlus,
  RefreshCcw,
  Send,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';

const MAX_PREVIEW = 160;

const styles = {
  wrapper: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)',
    gap: 18,
    width: '100%',
    alignItems: 'stretch',
  },
  wrapperMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
  },
  card: {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid rgba(15,23,42,0.06)',
    boxShadow: '0 16px 40px -32px rgba(15,23,42,0.35)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  mobileCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  mobileHidden: {
    display: 'none',
  },
  columnHeader: {
    padding: '18px 20px',
    borderBottom: '1px solid rgba(148,163,184,0.18)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  columnTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  headerBadge: {
    fontSize: 12,
    padding: '3px 9px',
    borderRadius: 999,
    background: 'rgba(39,227,218,0.16)',
    color: '#0f172a',
    fontWeight: 700,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
  },
  tabs: {
    display: 'flex',
    padding: '0 16px 12px',
    gap: 8,
    borderBottom: '1px solid rgba(148,163,184,0.18)',
  },
  tabBtn: {
    flex: 1,
    border: '1px solid rgba(148,163,184,0.4)',
    background: '#fff',
    color: '#0f172a',
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 12px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  tabBtnActive: {
    borderColor: '#27E3DA',
    background: 'linear-gradient(120deg, rgba(39,227,218,0.22), rgba(2,115,115,0.12))',
    color: '#027373',
    boxShadow: '0 12px 26px -20px rgba(2,115,115,0.55)',
  },
  listBody: {
    flex: 1,
    overflowY: 'auto',
    padding: 8,
    display: 'grid',
    gap: 8,
  },
  listEmpty: {
    padding: '32px 20px',
    textAlign: 'center',
    color: '#475569',
    fontSize: 14,
  },
  conversationBtn: {
    width: '100%',
    border: '1px solid transparent',
    borderRadius: 14,
    background: '#fff',
    textAlign: 'left',
    padding: 12,
    display: 'grid',
    gap: 6,
    cursor: 'pointer',
    transition: 'border 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
  },
  conversationBtnActive: {
    borderColor: '#27E3DA',
    boxShadow: '0 18px 36px -28px rgba(2,115,115,0.65)',
    transform: 'translateY(-1px)',
  },
  conversationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(39,227,218,0.32), rgba(15,23,42,0.08))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    color: '#027373',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  conversationTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: '#0f172a',
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  unreadBadge: {
    display: 'inline-flex',
    padding: '2px 6px',
    borderRadius: 999,
    background: 'rgba(2,115,115,0.12)',
    color: '#027373',
    fontSize: 11,
    fontWeight: 700,
  },
  conversationMeta: {
    margin: 0,
    fontSize: 12,
    color: '#64748b',
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  conversationPreview: {
    margin: 0,
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.4,
  },
  threadBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'grid',
    gap: 16,
    background: 'linear-gradient(180deg, rgba(15,23,42,0.02), rgba(39,227,218,0.06))',
  },
  systemMessage: {
    textAlign: 'center',
    fontSize: 12,
    color: '#475569',
  },
  messageRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxWidth: '72%',
  },
  messageBubble: {
    borderRadius: 16,
    padding: '10px 14px',
    fontSize: 14,
    lineHeight: 1.5,
    wordBreak: 'break-word',
    background: '#fff',
    boxShadow: '0 14px 26px -24px rgba(15,23,42,0.45)',
  },
  messageBubbleOwn: {
    background: 'linear-gradient(135deg, rgba(39,227,218,0.35), rgba(2,115,115,0.22))',
    color: '#0f172a',
  },
  messageTimestamp: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: 500,
  },
  composer: {
    borderTop: '1px solid rgba(148,163,184,0.2)',
    padding: '16px 20px',
    display: 'grid',
    gap: 10,
    background: '#fff',
  },
  textarea: {
    width: '100%',
    minHeight: 72,
    borderRadius: 12,
    border: '1px solid rgba(148,163,184,0.4)',
    padding: '12px 14px',
    fontSize: 14,
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none',
  },
  composerActions: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  primaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 16px',
    borderRadius: 999,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 700,
    background: 'linear-gradient(120deg, rgba(39,227,218,0.85), rgba(2,115,115,0.85))',
    color: '#0f172a',
    boxShadow: '0 14px 30px -22px rgba(2,115,115,0.65)',
  },
  primaryBtnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  secondaryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.4)',
    background: '#fff',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  disabledBtn: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  dangerBtn: {
    borderColor: 'rgba(239,68,68,0.4)',
    color: '#b91c1c',
  },
  infoBanner: {
    background: 'rgba(59,130,246,0.12)',
    border: '1px solid rgba(59,130,246,0.32)',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 13,
    color: '#1d4ed8',
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  },
  warningBanner: {
    background: 'rgba(249,115,22,0.12)',
    border: '1px solid rgba(249,115,22,0.32)',
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 13,
    color: '#c2410c',
    display: 'flex',
    gap: 10,
    alignItems: 'flex-start',
  },
  errorText: {
    color: '#b91c1c',
    fontSize: 13,
    fontWeight: 600,
    padding: '12px 16px',
  },
  helperText: {
    color: '#475569',
    fontSize: 13,
  },
  headerActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  headerActionsMobile: {
    width: '100%',
    justifyContent: 'flex-start',
  },
  newConversationCard: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(148,163,184,0.14)',
    display: 'grid',
    gap: 8,
  },
  select: {
    borderRadius: 10,
    border: '1px solid rgba(148,163,184,0.4)',
    padding: '8px 10px',
    fontSize: 13,
    width: '100%',
  },
  metaLine: {
    fontSize: 12,
    color: '#475569',
  },
  threadHeader: {
    padding: '18px 20px',
    borderBottom: '1px solid rgba(148,163,184,0.18)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  threadHeaderMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 16,
  },
  participantTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
  },
  participantSubtitle: {
    margin: 0,
    fontSize: 13,
    color: '#475569',
  },
  participantMeta: {
    display: 'grid',
    gap: 4,
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '40px 24px',
    gap: 12,
    color: '#475569',
  },
  mobileBackButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 12px',
    borderRadius: 999,
    border: '1px solid rgba(148,163,184,0.4)',
    background: '#fff',
    color: '#0f172a',
    fontSize: 13,
    fontWeight: 600,
    alignSelf: 'flex-start',
  },
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const truncate = (value, max = MAX_PREVIEW) => {
  const text = `${value || ''}`.trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
};

const initials = (name) => {
  if (!name) return '—';
  const parts = String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '—';
  return parts.map((part) => part[0]?.toUpperCase() || '').join('') || '—';
};

const resolveAthleteName = (athlete) => {
  if (!athlete) return 'Unknown athlete';
  const first = athlete.first_name?.trim();
  const last = athlete.last_name?.trim();
  const full = [first, last].filter(Boolean).join(' ');
  return full || 'Unnamed athlete';
};

const ensureArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
};

const getErrorMessage = (error, fallback = 'Unexpected error.') => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error.message === 'string' && error.message.trim()) return error.message;
  if (typeof error.error_description === 'string' && error.error_description.trim()) {
    return error.error_description;
  }
  if (typeof error.hint === 'string' && error.hint.trim()) {
    return error.hint;
  }
  try {
    return JSON.stringify(error);
  } catch (serializationError) {
    console.error('OperatorMessagesPanel: unable to serialise error', serializationError);
    return fallback;
  }
};

const logSupabaseError = (context, error) => {
  if (!error) return;
  const message = getErrorMessage(error);
  console.error(`[OperatorMessagesPanel:${context}]`, message, error);
};

const fetchOperatorAccount = async (authUserId) => {
  if (!supabase || !authUserId) return { id: null };
  const { data, error } = await supabase
    .from('op_account')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (error && error.code === 'PGRST116') {
    const { data: latest } = await supabase
      .from('op_account')
      .select('id, created_at')
      .eq('auth_user_id', authUserId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (Array.isArray(latest) && latest[0]) {
      const { id } = latest[0];
      return { id };
    }
    return { id: null };
  }
  return { id: data?.id ?? null };
};

const fetchThreadsForOperator = async (operatorId) => {
  if (!supabase || !operatorId) return [];
  try {
    const { data, error } = await supabase
      .from('chat_thread')
      .select(
        `id, op_id, athlete_id, created_at, last_message_at, last_message_text, last_message_sender, op_deleted_at, athlete_deleted_at,
       athlete:athlete_id(id, first_name, last_name, profile_picture_url)`
      )
      .eq('op_id', operatorId)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const rows = ensureArray(data);
    rows.sort((a, b) => {
      const tsA = a?.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tsB = b?.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tsB - tsA;
    });
    return rows;
  } catch (error) {
    logSupabaseError('fetchThreadsForOperator', error);
    throw error;
  }
};

const fetchBlockMapForOperator = async (operatorId) => {
  if (!supabase || !operatorId) return new Map();
  try {
    const { data, error } = await supabase
      .from('chat_block')
      .select('athlete_id, blocked_by, blocked_at')
      .eq('op_id', operatorId);
    if (error) throw error;
    const map = new Map();
    ensureArray(data).forEach((row) => {
      map.set(row.athlete_id, row);
    });
    return map;
  } catch (error) {
    logSupabaseError('fetchBlockMapForOperator', error);
    return new Map();
  }
};

const fetchUnreadCount = async (threadId, role) => {
  if (!supabase || !threadId) return 0;
  const isOperator = role === 'operator';
  const { error, count } = await supabase
    .from('chat_message')
    .select('id', { head: true, count: 'exact' })
    .eq('thread_id', threadId)
    .eq('sender_kind', isOperator ? 'ATHLETE' : 'OP')
    .is(isOperator ? 'read_by_op_at' : 'read_by_athlete_at', null);
  if (error) return 0;
  return count || 0;
};

const fetchMessagesForThread = async (threadId) => {
  if (!supabase || !threadId) return [];
  try {
    const { data, error } = await supabase
      .from('chat_message')
      .select(
        'id, thread_id, created_at, sender_kind, sender_op_id, sender_athlete_id, body_text, payload, attachments, read_by_op_at, read_by_athlete_at'
      )
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return ensureArray(data);
  } catch (error) {
    logSupabaseError('fetchMessagesForThread', error);
    throw error;
  }
};

const markThreadRead = async (threadId, role) => {
  if (!supabase || !threadId) return;
  const now = new Date().toISOString();
  if (role === 'operator') {
    await supabase
      .from('chat_message')
      .update({ read_by_op_at: now })
      .eq('thread_id', threadId)
      .eq('sender_kind', 'ATHLETE')
      .is('read_by_op_at', null);
  } else {
    await supabase
      .from('chat_message')
      .update({ read_by_athlete_at: now })
      .eq('thread_id', threadId)
      .eq('sender_kind', 'OP')
      .is('read_by_athlete_at', null);
  }
};

const fetchUnlockStatus = async (operatorId, athleteId) => {
  if (!supabase || !operatorId || !athleteId) return { active: false, expires_at: null };
  const { data, error } = await supabase
    .from('v_op_unlocks_active')
    .select('expires_at')
    .eq('op_id', operatorId)
    .eq('athlete_id', athleteId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data?.expires_at) return { active: false, expires_at: null };
  const expires = new Date(data.expires_at);
  const active = !Number.isNaN(expires.getTime()) && expires.getTime() > Date.now();
  return { active, expires_at: data.expires_at };
};

const fetchUnlockedAthletes = async (operatorId) => {
  if (!supabase || !operatorId) return [];
  const { data, error } = await supabase
    .from('v_op_unlocks_active')
    .select('athlete_id, expires_at, athlete:athlete_id(id, first_name, last_name, profile_picture_url)')
    .eq('op_id', operatorId)
    .order('expires_at', { ascending: true });
  if (error) throw error;
  return ensureArray(data);
};

const upsertBlock = async ({ operatorId, athleteId, action }) => {
  if (!supabase || !operatorId || !athleteId) return;
  if (action === 'block') {
    await supabase.from('chat_block').upsert(
      [
        {
          op_id: operatorId,
          athlete_id: athleteId,
          blocked_by: 'OP',
        },
      ],
      { onConflict: 'op_id,athlete_id' }
    );
  } else {
    await supabase
      .from('chat_block')
      .delete()
      .eq('op_id', operatorId)
      .eq('athlete_id', athleteId);
  }
};

const updateArchiveStatus = async ({ threadId, role, archived }) => {
  if (!supabase || !threadId) return;
  const patch =
    role === 'operator'
      ? { op_deleted_at: archived ? new Date().toISOString() : null }
      : { athlete_deleted_at: archived ? new Date().toISOString() : null };
  await supabase
    .from('chat_thread')
    .update(patch)
    .eq('id', threadId);
};

const deleteConversation = async (threadId) => {
  if (!supabase || !threadId) return;
  await supabase
    .from('chat_thread')
    .delete()
    .eq('id', threadId);
};

const ensureThread = async ({ operatorId, athleteId }) => {
  if (!supabase || !operatorId || !athleteId) return null;
  const { data: existing, error: existingError } = await supabase
    .from('chat_thread')
    .select('id')
    .eq('op_id', operatorId)
    .eq('athlete_id', athleteId)
    .maybeSingle();
  if (!existingError && existing?.id) return existing;
  if (existingError && existingError.code !== 'PGRST116') throw existingError;
  const { data, error } = await supabase
    .from('chat_thread')
    .insert([{ op_id: operatorId, athlete_id: athleteId }])
    .select('id')
    .single();
  if (error) throw error;
  return data;
};

const sendMessage = async ({ threadId, text, operatorId }) => {
  if (!supabase || !threadId || !text || !operatorId) return;
  const payload = {
    thread_id: threadId,
    sender_kind: 'OP',
    sender_op_id: operatorId,
    sender_athlete_id: null,
    body_text: text,
    payload: {},
    attachments: [],
  };
  const trimmed = text.trim();
  const now = new Date().toISOString();
  const { error } = await supabase.from('chat_message').insert([payload]);
  if (error) throw error;
  await supabase
    .from('chat_thread')
    .update({
      last_message_at: now,
      last_message_text: truncate(trimmed),
      last_message_sender: 'OP',
      op_deleted_at: null,
      athlete_deleted_at: null,
    })
    .eq('id', threadId);
};

export default function MessagesPanel({ operatorData, authUser, isMobile }) {
  const [operatorAccount, setOperatorAccount] = useState(() => ({
    id: operatorData?.account?.id ?? null,
  }));
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState(null);
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [threadsError, setThreadsError] = useState(null);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [activeTab, setActiveTab] = useState('active');
  const [unlockStatus, setUnlockStatus] = useState({ active: false, expires_at: null });
  const [blockInfo, setBlockInfo] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [unlockedAthletes, setUnlockedAthletes] = useState([]);
  const [selectedUnlockAthleteId, setSelectedUnlockAthleteId] = useState('');
  const [refreshingUnlocks, setRefreshingUnlocks] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [mobileView, setMobileView] = useState('list');

  const operatorId = operatorAccount?.id ?? null;

  useEffect(() => {
    if (!operatorData?.account?.id) return;
    setOperatorAccount((prev) => ({
      ...prev,
      id: operatorData.account.id,
    }));
  }, [operatorData?.account?.id]);

  useEffect(() => {
    if (!supabase || !authUser?.id || operatorAccount?.id) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingAccount(true);
        setAccountError(null);
        const account = await fetchOperatorAccount(authUser.id);
        if (!cancelled) {
          setOperatorAccount(account);
        }
      } catch (err) {
        if (!cancelled) {
          setAccountError(err.message || 'Unable to load operator account.');
        }
      } finally {
        if (!cancelled) setLoadingAccount(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, operatorAccount?.id]);

  const loadThreads = useCallback(async () => {
    if (!operatorId || !supabase) return;
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const threadsResult = await fetchThreadsForOperator(operatorId);
      const [blockMapOutcome, unreadOutcome] = await Promise.allSettled([
        fetchBlockMapForOperator(operatorId),
        Promise.allSettled(
          threadsResult.map(async (thread) => {
            try {
              const unread = await fetchUnreadCount(thread.id, 'operator');
              return [thread.id, unread];
            } catch (error) {
              logSupabaseError('fetchUnreadCount', error);
              return [thread.id, 0];
            }
          })
        ),
      ]);

      const blockMap =
        blockMapOutcome.status === 'fulfilled' ? blockMapOutcome.value : new Map();
      if (blockMapOutcome.status === 'rejected') {
        logSupabaseError('fetchBlockMapForOperator', blockMapOutcome.reason);
      }

      const unreadMap = {};
      if (unreadOutcome.status === 'fulfilled') {
        unreadOutcome.value.forEach((result, index) => {
          const thread = threadsResult[index];
          if (!thread) return;
          if (result.status === 'fulfilled') {
            const [threadId, count] = result.value || [];
            unreadMap[threadId] = typeof count === 'number' ? count : 0;
          } else {
            unreadMap[thread.id] = 0;
            logSupabaseError('fetchUnreadCount', result.reason);
          }
        });
      } else {
        logSupabaseError('fetchUnreadCount', unreadOutcome.reason);
      }

      const prepared = threadsResult.map((thread) => ({
        ...thread,
        unreadCount: unreadMap[thread.id] ?? 0,
        block: blockMap.get(thread.athlete_id) || null,
      }));
      setThreads(prepared);
      setTotalUnread(prepared.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0));
    } catch (err) {
      setThreadsError(getErrorMessage(err, 'Unable to load conversations.'));
    } finally {
      setThreadsLoading(false);
    }
  }, [operatorId]);

  useEffect(() => {
    if (!operatorId) return;
    loadThreads();
  }, [operatorId, loadThreads]);

  const loadUnlocked = useCallback(async () => {
    if (!operatorId || !supabase) return;
    setRefreshingUnlocks(true);
    try {
      const rows = await fetchUnlockedAthletes(operatorId);
      setUnlockedAthletes(rows);
    } catch (err) {
      setActionError(err.message || 'Unable to load unlocked athletes.');
    } finally {
      setRefreshingUnlocks(false);
    }
  }, [operatorId]);

  useEffect(() => {
    if (!operatorId) return;
    loadUnlocked();
  }, [operatorId, loadUnlocked]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const filteredThreads = useMemo(() => {
    const subset = threads.filter((thread) => {
      const isArchived = !!thread?.op_deleted_at;
      return activeTab === 'archived' ? isArchived : !isArchived;
    });
    return subset;
  }, [threads, activeTab]);

  const refreshMessages = useCallback(
    async (thread) => {
      if (!thread?.id) return;
      setMessagesLoading(true);
      setMessagesError(null);
      try {
        const [messagesOutcome, unlockOutcome, blockOutcome] = await Promise.allSettled([
          fetchMessagesForThread(thread.id),
          fetchUnlockStatus(operatorId, thread.athlete_id),
          supabase
            .from('chat_block')
            .select('op_id, athlete_id, blocked_by, blocked_at')
            .eq('op_id', operatorId)
            .eq('athlete_id', thread.athlete_id)
            .maybeSingle(),
        ]);

        if (messagesOutcome.status === 'fulfilled') {
          setMessages(messagesOutcome.value);
        } else {
          logSupabaseError('fetchMessagesForThread', messagesOutcome.reason);
          throw messagesOutcome.reason;
        }

        if (unlockOutcome.status === 'fulfilled') {
          setUnlockStatus(unlockOutcome.value);
        } else {
          logSupabaseError('fetchUnlockStatus', unlockOutcome.reason);
          setUnlockStatus({ active: false, expires_at: null });
        }

        if (blockOutcome.status === 'fulfilled') {
          if (blockOutcome.value?.error) {
            logSupabaseError('fetchBlockStatus', blockOutcome.value.error);
            setBlockInfo(null);
          } else {
            setBlockInfo(blockOutcome.value?.data ?? null);
          }
        } else {
          logSupabaseError('fetchBlockStatus', blockOutcome.reason);
          setBlockInfo(null);
        }

        await markThreadRead(thread.id, 'operator');
        setThreads((prev) =>
          prev.map((item) => (item.id === thread.id ? { ...item, unreadCount: 0 } : item))
        );
        setTotalUnread((prev) => Math.max(0, prev - (thread.unreadCount || 0)));
      } catch (err) {
        setMessagesError(getErrorMessage(err, 'Unable to load messages.'));
        setMessages([]);
      } finally {
        setMessagesLoading(false);
      }
    },
    [operatorId]
  );

  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      setMessagesError(null);
      setBlockInfo(null);
      return;
    }
    refreshMessages(selectedThread);
  }, [selectedThread?.id]);

  const handleSelectThread = (threadId) => {
    if (!threadId) return;
    setActionError(null);
    setMessagesError(null);
    setSelectedThreadId(threadId);
    if (isMobile) {
      setMobileView('thread');
    }
  };

  const handleSend = async () => {
    if (!selectedThread || !messageDraft.trim()) return;
    if (!unlockStatus.active) return;
    if (blockInfo && blockInfo.blocked_by && blockInfo.blocked_by !== 'OP') return;
    setSending(true);
    setActionError(null);
    try {
      await sendMessage({ threadId: selectedThread.id, text: messageDraft.trim(), operatorId });
      setMessageDraft('');
      await refreshMessages(selectedThread);
      await loadThreads();
    } catch (err) {
      setActionError(err.message || 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleArchiveToggle = async (thread, archived) => {
    if (!thread) return;
    try {
      await updateArchiveStatus({ threadId: thread.id, role: 'operator', archived });
      await loadThreads();
      if (!archived) {
        setSelectedThreadId(thread.id);
      } else if (selectedThreadId === thread.id) {
        setSelectedThreadId(null);
      }
    } catch (err) {
      setActionError(err.message || 'Unable to update archive state.');
    }
  };

  const handleBlockToggle = async (thread, blocked) => {
    if (!thread) return;
    const canToggle = !blockInfo || blockInfo.blocked_by === 'OP';
    if (!canToggle) return;
    try {
      await upsertBlock({ operatorId, athleteId: thread.athlete_id, action: blocked ? 'block' : 'unblock' });
      await loadThreads();
      if (selectedThreadId === thread.id) {
        await refreshMessages(thread);
      }
    } catch (err) {
      setActionError(err.message || 'Unable to update block state.');
    }
  };

  const handleDelete = async (thread) => {
    if (!thread) return;
    const confirmation = typeof window === 'undefined' ? true : window.confirm('Delete conversation permanently?');
    if (!confirmation) return;
    try {
      await deleteConversation(thread.id);
      setSelectedThreadId((prev) => (prev === thread.id ? null : prev));
      await loadThreads();
      setMessages([]);
    } catch (err) {
      setActionError(err.message || 'Unable to delete conversation.');
    }
  };

  const handleStartConversation = async () => {
    if (!selectedUnlockAthleteId) return;
    setActionError(null);
    try {
      const thread = await ensureThread({ operatorId, athleteId: selectedUnlockAthleteId });
      await loadThreads();
      setActiveTab('active');
      setSelectedThreadId(thread?.id || null);
      setSelectedUnlockAthleteId('');
      if (thread?.id && isMobile) {
        setMobileView('thread');
      }
    } catch (err) {
      setActionError(err.message || 'Unable to start conversation.');
    }
  };

  const conversationEmptyMessage = totalUnread > 0
    ? `No ${activeTab === 'archived' ? 'archived' : 'active'} conversations match this filter.`
    : 'No conversations yet. Start a new one from the unlocked athletes list.';

  const composerDisabled =
    !selectedThread ||
    !unlockStatus.active ||
    (blockInfo && blockInfo.blocked_by && blockInfo.blocked_by !== 'OP');

  const selectedName = selectedThread ? resolveAthleteName(selectedThread.athlete) : '';
  const blockOwnedByOperator = blockInfo?.blocked_by === 'OP';
  const blockOwnedByAthlete = blockInfo && blockInfo.blocked_by && blockInfo.blocked_by !== 'OP';
  const canToggleBlock = !blockInfo || blockOwnedByOperator;
  const blockButtonLabel = blockOwnedByOperator ? 'Unblock' : blockOwnedByAthlete ? 'Blocked' : 'Block';

  useEffect(() => {
    if (!isMobile) {
      setMobileView('list');
      return;
    }
    if (!selectedThread) {
      setMobileView('list');
    }
  }, [isMobile, selectedThread?.id]);

  const handleMobileBack = () => {
    setMobileView('list');
  };

  const wrapperStyle = {
    ...styles.wrapper,
    ...(isMobile ? styles.wrapperMobile : null),
  };

  const listCardStyle = {
    ...styles.card,
    ...(isMobile ? styles.mobileCard : null),
    ...(isMobile && mobileView !== 'list' ? styles.mobileHidden : null),
  };

  const threadCardStyle = {
    ...styles.card,
    ...(isMobile ? styles.mobileCard : null),
    ...(isMobile && mobileView !== 'thread' ? styles.mobileHidden : null),
  };

  if (!supabase) {
    return (
      <div style={styles.card}>
        <div style={styles.emptyState}>
          <MessageCircle size={40} color="#94a3b8" />
          <p>Messaging is unavailable because Supabase is not configured.</p>
        </div>
      </div>
    );
  }

  if (loadingAccount) {
    return (
      <div style={styles.card}>
        <div style={styles.emptyState}>
          <Loader2 className="spin" size={28} />
          <p>Loading messaging workspace…</p>
        </div>
      </div>
    );
  }

  if (accountError) {
    return (
      <div style={styles.card}>
        <div style={styles.emptyState}>
          <p style={{ color: '#b91c1c', fontWeight: 600 }}>{accountError}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapperStyle}>
      <div style={listCardStyle}>
        <div style={styles.columnHeader}>
          <h3 style={styles.columnTitle}>
            <MessageCircle size={18} /> Inbox
          </h3>
          <span style={styles.headerBadge}>{totalUnread} unread</span>
        </div>
        <div style={styles.newConversationCard}>
          <div style={styles.helperText}>Start a new conversation with an unlocked athlete.</div>
          <select
            value={selectedUnlockAthleteId}
            onChange={(event) => setSelectedUnlockAthleteId(event.target.value)}
            style={styles.select}
          >
            <option value="">Select athlete…</option>
            {unlockedAthletes.map((row) => {
              const name = resolveAthleteName(row.athlete);
              const label = row.expires_at
                ? `${name} (unlock until ${new Date(row.expires_at).toLocaleDateString()})`
                : name;
              return (
                <option key={row.athlete_id} value={row.athlete_id}>
                  {label}
                </option>
              );
            })}
          </select>
          <div style={styles.headerActions}>
            <button
              type="button"
              style={{
                ...styles.primaryBtn,
                ...(selectedUnlockAthleteId ? null : styles.primaryBtnDisabled),
              }}
              disabled={!selectedUnlockAthleteId}
              onClick={handleStartConversation}
            >
              <MessageSquarePlus size={16} />
              Start chat
            </button>
            <button
              type="button"
              style={styles.secondaryBtn}
              onClick={loadUnlocked}
              disabled={refreshingUnlocks}
            >
              {refreshingUnlocks ? <Loader2 size={16} className="spin" /> : <RefreshCcw size={16} />}
              Refresh
            </button>
          </div>
        </div>
        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => setActiveTab('active')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'active' ? styles.tabBtnActive : null),
            }}
          >
            <Inbox size={15} /> Active
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('archived')}
            style={{
              ...styles.tabBtn,
              ...(activeTab === 'archived' ? styles.tabBtnActive : null),
            }}
          >
            <Archive size={15} /> Archived
          </button>
        </div>
        {threadsError && <div style={styles.errorText}>{threadsError}</div>}
        <div style={styles.listBody}>
          {threadsLoading ? (
            <div style={styles.listEmpty}>
              <Loader2 size={20} className="spin" /> Loading conversations…
            </div>
          ) : filteredThreads.length === 0 ? (
            <div style={styles.listEmpty}>{conversationEmptyMessage}</div>
          ) : (
            filteredThreads.map((thread) => {
              const name = resolveAthleteName(thread.athlete);
              const preview = thread.last_message_text
                ? `${thread.last_message_sender === 'OP' ? 'You: ' : ''}${truncate(thread.last_message_text)}`
                : 'No messages yet';
              const isSelected = selectedThreadId === thread.id;
              const blocked = !!thread.block;
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleSelectThread(thread.id)}
                  style={{
                    ...styles.conversationBtn,
                    ...(isSelected ? styles.conversationBtnActive : null),
                  }}
                >
                  <div style={styles.conversationHeader}>
                    <div style={styles.avatar}>
                      {thread.athlete?.profile_picture_url ? (
                        <img
                          src={thread.athlete.profile_picture_url}
                          alt={name}
                          style={styles.avatarImg}
                        />
                      ) : (
                        initials(name)
                      )}
                    </div>
                    <div>
                      <p style={styles.conversationTitle}>
                        {name}
                        {thread.unreadCount > 0 && (
                          <span style={styles.unreadBadge}>{thread.unreadCount}</span>
                        )}
                      </p>
                      <p style={styles.conversationMeta}>
                        <span>{formatDateTime(thread.last_message_at || thread.created_at)}</span>
                        {blocked && <span>Blocked</span>}
                      </p>
                    </div>
                  </div>
                  <p style={styles.conversationPreview}>{preview}</p>
                </button>
              );
            })
          )}
        </div>
      </div>
      <div style={threadCardStyle}>
        {!selectedThread ? (
          <div style={styles.emptyState}>
            <MessageCircle size={42} color="#94a3b8" />
            <p>Select a conversation to view the timeline.</p>
          </div>
        ) : (
          <>
            <div
              style={{
                ...styles.threadHeader,
                ...(isMobile ? styles.threadHeaderMobile : null),
              }}
            >
              {isMobile && (
                <button type="button" onClick={handleMobileBack} style={styles.mobileBackButton}>
                  <ArrowLeft size={16} /> Back to conversations
                </button>
              )}
              <div style={styles.participantMeta}>
                <h3 style={styles.participantTitle}>{selectedName}</h3>
                <p style={styles.participantSubtitle}>
                  Last update {formatDateTime(selectedThread.last_message_at || selectedThread.created_at)}
                </p>
                {!unlockStatus.active && (
                  <div style={styles.warningBanner}>
                    <Shield size={16} />
                    <span>
                      Unlock expired. Renew the contact to resume messaging.
                      {unlockStatus.expires_at && (
                        <>
                          <br />Expired on {new Date(unlockStatus.expires_at).toLocaleString()}
                        </>
                      )}
                    </span>
                  </div>
                )}
                {blockInfo && (
                  <div style={styles.warningBanner}>
                    <ShieldOff size={16} />
                    <span>
                      Conversation blocked by {blockInfo.blocked_by === 'OP' ? 'you' : 'the athlete'}. Sending is disabled until the block is removed.
                    </span>
                  </div>
                )}
              </div>
              <div
                style={{
                  ...styles.headerActions,
                  justifyContent: isMobile ? 'flex-start' : 'flex-end',
                  ...(isMobile ? styles.headerActionsMobile : null),
                }}
              >
                <button
                  type="button"
                  style={styles.secondaryBtn}
                  onClick={() => handleArchiveToggle(selectedThread, !selectedThread.op_deleted_at)}
                >
                  {selectedThread.op_deleted_at ? <Inbox size={16} /> : <Archive size={16} />}
                  {selectedThread.op_deleted_at ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.secondaryBtn,
                    ...(canToggleBlock ? null : styles.disabledBtn),
                  }}
                  onClick={() => {
                    if (!canToggleBlock) return;
                    handleBlockToggle(selectedThread, !(blockInfo && blockInfo.blocked_by === 'OP'));
                  }}
                  disabled={!canToggleBlock}
                >
                  {blockOwnedByOperator ? <ShieldOff size={16} /> : <Shield size={16} />}
                  {blockButtonLabel}
                </button>
                <button
                  type="button"
                  style={{ ...styles.secondaryBtn, ...styles.dangerBtn }}
                  onClick={() => handleDelete(selectedThread)}
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            </div>
            <div style={styles.threadBody}>
              {messagesError && <div style={styles.errorText}>{messagesError}</div>}
              {messagesLoading ? (
                <div style={styles.listEmpty}>
                  <Loader2 size={20} className="spin" /> Loading messages…
                </div>
              ) : messages.length === 0 ? (
                <div style={styles.listEmpty}>No messages yet. Be the first to reach out!</div>
              ) : (
                messages.map((message) => {
                  const isOwn = message.sender_kind === 'OP';
                  const isSystem = message.sender_kind === 'SYSTEM';
                  if (isSystem) {
                    return (
                      <div key={message.id} style={styles.systemMessage}>
                        {message.body_text || message.payload?.label || 'System notification'}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={message.id}
                      style={{
                        ...styles.messageRow,
                        alignSelf: isOwn ? 'flex-end' : 'flex-start',
                        textAlign: isOwn ? 'right' : 'left',
                      }}
                    >
                      <div
                        style={{
                          ...styles.messageBubble,
                          ...(isOwn ? styles.messageBubbleOwn : null),
                        }}
                      >
                        {message.body_text}
                      </div>
                      <span style={styles.messageTimestamp}>{formatDateTime(message.created_at)}</span>
                    </div>
                  );
                })
              )}
            </div>
            <div style={styles.composer}>
              {actionError && <div style={styles.errorText}>{actionError}</div>}
              <textarea
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder={unlockStatus.active ? 'Write a message…' : 'Unlock required to send messages'}
                style={{
                  ...styles.textarea,
                  ...(composerDisabled ? { background: '#f8fafc', cursor: 'not-allowed' } : null),
                }}
                disabled={composerDisabled}
              />
              <div style={styles.composerActions}>
                <div style={styles.helperText}>
                  {unlockStatus.active
                    ? 'Messages are shared with the selected athlete only.'
                    : 'Renew the unlock to resume the conversation.'}
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  style={{
                    ...styles.primaryBtn,
                    ...(composerDisabled || sending || !messageDraft.trim() ? styles.primaryBtnDisabled : null),
                  }}
                  disabled={composerDisabled || sending || !messageDraft.trim()}
                >
                  {sending ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                  Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <style jsx global>{`
        @keyframes operatorMessagesSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: operatorMessagesSpin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}

