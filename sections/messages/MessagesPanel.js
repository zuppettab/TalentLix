'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Inbox,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
  Shield,
  ShieldOff,
  Trash2,
} from 'lucide-react';
import { supabase } from '../../utils/supabaseClient';
import { OPERATOR_LOGO_BUCKET } from '../../utils/operatorStorageBuckets';
import { useSignedUrlCache } from '../../utils/useSignedUrlCache';

const MAX_PREVIEW = 160;
const OP_LOGO_BUCKET = OPERATOR_LOGO_BUCKET;

const PANEL_MAX_HEIGHT = 'min(720px, 80vh)';

const styles = {
  wrapper: {
    display: 'grid',
    gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)',
    gap: 18,
    width: '100%',
    maxHeight: PANEL_MAX_HEIGHT,
    alignItems: 'stretch',
  },
  wrapperMobile: {
    display: 'flex',
    flexDirection: 'column',
    gap: 18,
    maxHeight: PANEL_MAX_HEIGHT,
  },
  card: {
    background: '#fff',
    borderRadius: 18,
    border: '1px solid rgba(15,23,42,0.06)',
    boxShadow: '0 16px 40px -32px rgba(15,23,42,0.35)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: PANEL_MAX_HEIGHT,
    overflow: 'hidden',
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
    minWidth: 110,
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
    whiteSpace: 'nowrap',
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
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    alignItems: 'stretch',
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
    gridTemplateColumns: '60px 1fr',
    gridTemplateRows: 'auto auto',
    gridTemplateAreas: '"avatar content" "avatar preview"',
    columnGap: 12,
    rowGap: 12,
    alignItems: 'start',
    cursor: 'pointer',
    transition: 'border 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease',
  },
  conversationBtnMobile: {
    padding: 14,
    columnGap: 10,
    rowGap: 10,
  },
  conversationBtnActive: {
    borderColor: '#27E3DA',
    boxShadow: '0 18px 36px -28px rgba(2,115,115,0.65)',
    transform: 'translateY(-1px)',
  },
  avatarCell: {
    gridArea: 'avatar',
    width: 52,
    height: 52,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(39,227,218,0.32), rgba(15,23,42,0.08))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 16,
    color: '#027373',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  contentCell: {
    gridArea: 'content',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  contentCellMobile: {
    gap: 8,
  },
  conversationTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  conversationTopMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
  },
  conversationTopLeft: {
    display: 'grid',
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  conversationTopRight: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  conversationTopRightMobile: {
    width: '100%',
    alignItems: 'flex-start',
  },
  conversationTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  conversationTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 700,
    color: '#0f172a',
    letterSpacing: '-0.01em',
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
  legalName: {
    margin: 0,
    fontSize: 13,
    color: '#334155',
    opacity: 0.85,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  locationText: {
    margin: 0,
    fontSize: 12,
    color: '#64748b',
    display: 'flex',
    gap: 6,
    alignItems: 'center',
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  locationTextMobile: {
    whiteSpace: 'normal',
  },
  conversationMeta: {
    margin: 0,
    fontSize: 12,
    color: '#64748b',
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  conversationMetaMobile: {
    display: 'grid',
    gap: 2,
    alignItems: 'flex-start',
    whiteSpace: 'normal',
  },
  previewRow: {
    gridArea: 'preview',
    minWidth: 0,
  },
  conversationPreview: {
    margin: 0,
    fontSize: 13,
    color: '#475569',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  conversationPreviewMobile: {
    whiteSpace: 'normal',
  },
  entityTag: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 10px',
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '.04em',
    textTransform: 'uppercase',
    background: 'linear-gradient(120deg, rgba(39,227,218,0.24), rgba(2,115,115,0.12))',
    color: '#045f5f',
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
    boxSizing: 'border-box',
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
    console.error('MessagesPanel: unable to serialise error', serializationError);
    return fallback;
  }
};

const logSupabaseError = (context, error) => {
  if (!error) return;
  const message = getErrorMessage(error);
  console.error(`[MessagesPanel:${context}]`, message, error);
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

const unwrapSingle = (value) => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] ?? null : null;
  }
  return value ?? null;
};

const sanitizeString = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const deriveStoragePathFromPublicUrl = (value, bucket) => {
  if (!value || !bucket) return '';
  const bucketName = String(bucket).replace(/^\/+|\/+$/g, '');
  if (!bucketName) return '';
  const stringValue = String(value);
  const markers = [
    `/storage/v1/object/public/${bucketName}/`,
    `/storage/v1/object/sign/${bucketName}/`,
  ];
  for (const marker of markers) {
    const index = stringValue.indexOf(marker);
    if (index !== -1) {
      const start = index + marker.length;
      const remainder = stringValue.substring(start);
      const withoutQuery = remainder.split(/[?#]/)[0];
      return withoutQuery.replace(/^\/+/, '');
    }
  }
  return '';
};

const normalizeLogoReference = (rawValue) => {
  const value = sanitizeString(rawValue);
  if (!value) {
    return { url: '', path: '' };
  }
  const derivedFromUrl = deriveStoragePathFromPublicUrl(value, OP_LOGO_BUCKET);
  if (derivedFromUrl) {
    return { url: '', path: derivedFromUrl };
  }
  if (/^https?:\/\//i.test(value)) {
    return { url: value, path: '' };
  }
  const trimmed = value.replace(/^\/+/, '');
  if (!trimmed) {
    return { url: '', path: '' };
  }
  const bucketPrefixed = trimmed.startsWith(`${OP_LOGO_BUCKET}/`)
    ? trimmed.slice(OP_LOGO_BUCKET.length + 1)
    : trimmed;
  return { url: '', path: bucketPrefixed.replace(/^\/+/, '') };
};

const sanitizeProfile = (profile) => {
  if (!profile || typeof profile !== 'object') return null;
  return {
    legal_name: sanitizeString(profile.legal_name),
    trade_name: sanitizeString(profile.trade_name),
    logo_url: sanitizeString(profile.logo_url),
    city: sanitizeString(profile.city),
    state_region: sanitizeString(profile.state_region),
    country: sanitizeString(profile.country),
  };
};

const sanitizeType = (type) => {
  if (!type || typeof type !== 'object') return null;
  return {
    code: sanitizeString(type.code),
    name: sanitizeString(type.name),
  };
};

const pickFirstNonEmpty = (...values) => {
  for (const value of values) {
    const normalized = sanitizeString(value);
    if (normalized) return normalized;
  }
  return null;
};

const normalizeOperatorId = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  try {
    const stringified = String(value);
    const trimmed = stringified.trim();
    return trimmed || null;
  } catch (error) {
    console.error('[MessagesPanel:normalizeOperatorId] Failed to normalize operator id', error, value);
    return null;
  }
};

const normalizeOperator = (operator) => {
  const base = unwrapSingle(operator);
  if (!base) return null;
  const profile = unwrapSingle(base.profile);
  const type = unwrapSingle(base.type);
  return {
    ...base,
    profile: sanitizeProfile(profile),
    type: sanitizeType(type),
  };
};

const isDevEnvironment = process.env.NODE_ENV !== 'production';

const resolveOperatorName = (operator) => {
  const normalized = normalizeOperator(operator);
  if (!normalized) return 'Unknown operator';
  const profile = normalized.profile || {};
  const candidates = [
    normalized.resolved_name,
    normalized.name,
    normalized.label,
    profile.trade_name,
    profile.legal_name,
    normalized.display_name,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  if (normalized?.id) {
    try {
      const truncated = String(normalized.id).slice(0, 8);
      if (truncated) return `Operator ${truncated}`;
    } catch (error) {
      if (isDevEnvironment && typeof console?.debug === 'function') {
        console.debug('[MessagesPanel:resolveOperatorName] Failed to stringify operator id', error);
      }
    }
  }
  return 'Unnamed operator';
};

const resolveTradeName = (operator, fallback) => {
  const profile = operator?.profile || {};
  return pickFirstNonEmpty(profile.trade_name, fallback, profile.legal_name, operator?.resolved_name, operator?.name);
};

const resolveLegalName = (operator) => {
  const profile = operator?.profile || {};
  const legal = sanitizeString(profile.legal_name);
  const trade = sanitizeString(profile.trade_name);
  if (legal && legal !== trade) return legal;
  return null;
};

const formatLocation = (profile) => {
  if (!profile) return '';
  const parts = [profile.city, profile.country, profile.state_region]
    .map((value) => sanitizeString(value))
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.join(' · ');
};

const resolveEntityTypeLabel = (operator) => {
  const type = operator?.type || {};
  const direct = sanitizeString(type.name);
  if (direct) return direct;
  const code = sanitizeString(type.code);
  if (!code) return null;
  return code
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1).toLowerCase() : ''))
    .join(' ');
};

const fetchAthleteProfile = async (authUserId) => {
  if (!supabase || !authUserId) return null;
  const { data, error } = await supabase
    .from('athlete')
    .select('id, first_name, last_name, profile_picture_url')
    .eq('id', authUserId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') throw error;
  if (error && error.code === 'PGRST116') {
    const { data: latest } = await supabase
      .from('athlete')
      .select('id, first_name, last_name, profile_picture_url, created_at')
      .eq('id', authUserId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (Array.isArray(latest) && latest[0]) return latest[0];
    return null;
  }
  return data || null;
};

const fetchOperatorProfiles = async (operatorIds) => {
  const unique = Array.from(
    new Set(
      ensureArray(operatorIds)
        .map((value) => {
          if (typeof value === 'string') {
            const trimmed = value.trim();
            return trimmed || null;
          }
          if (typeof value === 'number') {
            return String(value);
          }
          return null;
        })
        .filter(Boolean)
    )
  );

  if (!unique.length) {
    return new Map();
  }

  try {
    const response = await fetch('/api/athlete/operator-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operatorIds: unique }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      console.error('[MessagesPanel:fetchOperatorProfiles] Failed to parse response', parseError);
      payload = null;
    }

    if (!response.ok) {
      const message =
        typeof payload?.error === 'string' && payload.error
          ? payload.error
          : `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    const map = new Map();
    ensureArray(payload?.operators).forEach((raw) => {
      if (!raw || (typeof raw !== 'object' && !Array.isArray(raw))) return;
      const candidate = normalizeOperator({
        ...raw,
        id:
          typeof raw.id === 'string'
            ? raw.id
            : raw.id != null
              ? String(raw.id)
              : null,
      });
      if (candidate?.id) {
        map.set(candidate.id, candidate);
      }
    });
    return map;
  } catch (error) {
    console.error('[MessagesPanel:fetchOperatorProfiles] Failed to load operator profiles', error);
    return new Map();
  }
};

const fetchThreadsForAthlete = async (athleteId) => {
  if (!supabase || !athleteId) return [];
  try {
    const { data, error } = await supabase
      .from('chat_thread')
      .select(
        `
          id,
          op_id,
          athlete_id,
          created_at,
          last_message_at,
          last_message_text,
          last_message_sender,
          op_deleted_at,
          athlete_deleted_at,
          operator:op_id(
            id,
            type:op_type(code, name),
            profile:op_profile(
              legal_name,
              trade_name,
              logo_url,
              city,
              state_region,
              country
            )
          )
        `
      )
      .eq('athlete_id', athleteId)
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    const rows = ensureArray(data).map((row) => ({
      ...row,
      op_id: normalizeOperatorId(row?.op_id),
      operator: normalizeOperator(row?.operator),
    }));
    rows.sort((a, b) => {
      const tsA = a?.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tsB = b?.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tsB - tsA;
    });
    return rows;
  } catch (error) {
    logSupabaseError('fetchThreadsForAthlete', error);
    throw error;
  }
};

const fetchBlockMapForAthlete = async (athleteId) => {
  if (!supabase || !athleteId) return new Map();
  try {
    const { data, error } = await supabase
      .from('chat_block')
      .select('op_id, blocked_by, blocked_at')
      .eq('athlete_id', athleteId);
    if (error) throw error;
    const map = new Map();
    ensureArray(data).forEach((row) => {
      const opId = normalizeOperatorId(row?.op_id);
      if (!opId) return;
      map.set(opId, { ...row, op_id: opId });
    });
    return map;
  } catch (error) {
    logSupabaseError('fetchBlockMapForAthlete', error);
    return new Map();
  }
};

const fetchUnreadCount = async (threadId, role) => {
  if (!supabase || !threadId) return 0;
  const { error, count } = await supabase
    .from('chat_message')
    .select('id', { head: true, count: 'exact' })
    .eq('thread_id', threadId)
    .eq('sender_kind', role === 'athlete' ? 'OP' : 'ATHLETE')
    .is(role === 'athlete' ? 'read_by_athlete_at' : 'read_by_op_at', null);
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

const markThreadRead = async (threadId) => {
  if (!supabase || !threadId) return;
  const now = new Date().toISOString();
  await supabase
    .from('chat_message')
    .update({ read_by_athlete_at: now })
    .eq('thread_id', threadId)
    .eq('sender_kind', 'OP')
    .is('read_by_athlete_at', null);
};

const upsertBlock = async ({ athleteId, operatorId, action }) => {
  if (!supabase || !athleteId || !operatorId) return;
  if (action === 'block') {
    await supabase.from('chat_block').upsert(
      [
        {
          op_id: operatorId,
          athlete_id: athleteId,
          blocked_by: 'ATHLETE',
        },
      ],
      { onConflict: 'op_id,athlete_id' }
    );
  } else {
    await supabase
      .from('chat_block')
      .delete()
      .eq('op_id', operatorId)
      .eq('athlete_id', athleteId)
      .eq('blocked_by', 'ATHLETE');
  }
};

const updateArchiveStatus = async ({ threadId, archived }) => {
  if (!supabase || !threadId) return;
  await supabase
    .from('chat_thread')
    .update({ athlete_deleted_at: archived ? new Date().toISOString() : null })
    .eq('id', threadId);
};

const deleteConversation = async (threadId) => {
  if (!supabase || !threadId) return;
  await supabase
    .from('chat_thread')
    .delete()
    .eq('id', threadId);
};

const sendMessage = async ({ threadId, text, athleteId }) => {
  if (!supabase || !threadId || !text || !athleteId) return;
  const trimmed = text.trim();
  const now = new Date().toISOString();
  const { error } = await supabase.from('chat_message').insert([
    {
      thread_id: threadId,
      sender_kind: 'ATHLETE',
      sender_op_id: null,
      sender_athlete_id: athleteId,
      body_text: trimmed,
      payload: {},
      attachments: [],
    },
  ]);
  if (error) throw error;
  await supabase
    .from('chat_thread')
    .update({
      last_message_at: now,
      last_message_text: truncate(trimmed),
      last_message_sender: 'ATHLETE',
      op_deleted_at: null,
      athlete_deleted_at: null,
    })
    .eq('id', threadId);
};

export default function MessagesPanel({ isMobile }) {
  const [athlete, setAthlete] = useState(null);
  const [loadingAthlete, setLoadingAthlete] = useState(true);
  const [athleteError, setAthleteError] = useState(null);
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
  const [blockInfo, setBlockInfo] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const [mobileView, setMobileView] = useState('list');
  const operatorCacheRef = useRef(new Map());
  const getSignedLogoUrl = useSignedUrlCache(OP_LOGO_BUCKET);
  const [logoPreviewMap, setLogoPreviewMap] = useState({});

  useEffect(() => {
    if (!supabase) {
      setLoadingAthlete(false);
      setAthleteError('Supabase client is not configured.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoadingAthlete(true);
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) {
          throw new Error('Missing authenticated user.');
        }
        const profile = await fetchAthleteProfile(userId);
        if (!profile) throw new Error('Athlete profile not found for your account.');
        if (!cancelled) setAthlete(profile);
      } catch (err) {
        if (!cancelled) setAthleteError(err.message || 'Unable to load athlete profile.');
      } finally {
        if (!cancelled) setLoadingAthlete(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const athleteId = athlete?.id ?? null;

  const loadThreads = useCallback(async () => {
    if (!athleteId || !supabase) return;
    setThreadsLoading(true);
    setThreadsError(null);
    try {
      const threadsResult = await fetchThreadsForAthlete(athleteId);
      const operatorCache = operatorCacheRef.current;

      threadsResult.forEach((thread) => {
        const opId = normalizeOperatorId(thread?.op_id);
        const joinedOperator = normalizeOperator(thread?.operator);
        if (opId && joinedOperator && !operatorCache.has(opId)) {
          operatorCache.set(opId, joinedOperator);
        }
      });

      const operatorIds = Array.from(
        new Set(
          threadsResult
            .map((thread) => normalizeOperatorId(thread?.op_id))
            .filter(Boolean)
        )
      );

      if (operatorIds.length) {
        const missing = operatorIds.filter((id) => !operatorCache.has(id));
        if (missing.length) {
          if (isDevEnvironment && typeof console?.debug === 'function') {
            console.debug('[MessagesPanel] operator-profiles request', missing);
          }
          const fetched = await fetchOperatorProfiles(missing);
          if (isDevEnvironment && typeof console?.debug === 'function') {
            console.debug('[MessagesPanel] operator-profiles result', {
              requested: missing,
              received: Array.from(fetched.keys()),
            });
          }
          missing.forEach((id) => {
            if (!fetched.has(id) && !operatorCache.has(id)) {
              operatorCache.set(id, null);
            }
          });
          fetched.forEach((value, key) => {
            operatorCache.set(key, value || null);
          });
        }
      }

      const [blockMapOutcome, unreadOutcome] = await Promise.allSettled([
        fetchBlockMapForAthlete(athleteId),
        Promise.allSettled(
          threadsResult.map(async (thread) => {
            try {
              const unread = await fetchUnreadCount(thread.id, 'athlete');
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
        logSupabaseError('fetchBlockMapForAthlete', blockMapOutcome.reason);
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

      const prepared = threadsResult.map((thread) => {
        const opId = normalizeOperatorId(thread?.op_id);
        const cachedOperator = opId ? operatorCache.get(opId) ?? null : null;
        return {
          ...thread,
          op_id: opId,
          operator: normalizeOperator(cachedOperator ?? thread.operator ?? null),
          unreadCount: unreadMap[thread.id] ?? 0,
          block: opId ? blockMap.get(opId) || null : null,
        };
      });
      setThreads(prepared);
      setTotalUnread(prepared.reduce((sum, thread) => sum + (thread.unreadCount || 0), 0));
    } catch (err) {
      setThreadsError(getErrorMessage(err, 'Unable to load conversations.'));
    } finally {
      setThreadsLoading(false);
    }
  }, [athleteId]);

  useEffect(() => {
    if (!athleteId) return;
    loadThreads();
  }, [athleteId, loadThreads]);

  useEffect(() => {
    if (!threads || threads.length === 0) {
      setLogoPreviewMap((prev) => {
        if (!prev || Object.keys(prev).length === 0) return prev;
        return {};
      });
      return;
    }

    const activeOpIds = new Set();
    const immediateValues = {};
    const pending = [];

    threads.forEach((thread) => {
      const opId = thread?.op_id;
      if (!opId || activeOpIds.has(opId)) return;
      const reference = normalizeLogoReference(thread?.operator?.profile?.logo_url);
      activeOpIds.add(opId);
      if (reference.url) {
        immediateValues[opId] = reference.url;
        return;
      }
      if (reference.path) {
        pending.push({ opId, path: reference.path });
        return;
      }
      immediateValues[opId] = '';
    });

    const applyResolved = (resolvedMap) => {
      setLogoPreviewMap((prev) => {
        const candidate = {};
        let changed = false;
        activeOpIds.forEach((opId) => {
          const hasResolved = Object.prototype.hasOwnProperty.call(resolvedMap, opId);
          const nextValue = (hasResolved ? resolvedMap[opId] : prev[opId]) || '';
          candidate[opId] = nextValue;
          if (!changed && (prev[opId] || '') !== nextValue) {
            changed = true;
          }
        });
        const prevKeys = Object.keys(prev);
        if (!changed) {
          if (prevKeys.length !== activeOpIds.size) {
            changed = true;
          } else {
            for (const key of prevKeys) {
              if (!activeOpIds.has(key)) {
                changed = true;
                break;
              }
            }
          }
        }
        return changed ? candidate : prev;
      });
    };

    applyResolved(immediateValues);

    if (pending.length === 0 || !supabase) {
      return;
    }

    let cancelled = false;

    Promise.all(
      pending.map(async ({ opId, path }) => {
        try {
          const url = await getSignedLogoUrl(path);
          return [opId, url || ''];
        } catch (error) {
          if (isDevEnvironment && typeof console?.error === 'function') {
            console.error('[MessagesPanel] Failed to resolve logo signed URL', { opId, path, error });
          }
          return [opId, ''];
        }
      })
    )
      .then((results) => {
        if (cancelled) return;
        const resolved = { ...immediateValues };
        results.forEach(([opId, url]) => {
          resolved[opId] = url;
        });
        applyResolved(resolved);
      })
      .catch((error) => {
        if (isDevEnvironment && typeof console?.error === 'function') {
          console.error('[MessagesPanel] Unexpected error resolving logo URLs', error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [threads, getSignedLogoUrl, supabase]);

  const selectedThread = useMemo(
    () => threads.find((thread) => thread.id === selectedThreadId) || null,
    [threads, selectedThreadId]
  );

  const filteredThreads = useMemo(() => {
    const subset = threads.filter((thread) => {
      const isArchived = !!thread?.athlete_deleted_at;
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
        const [messagesOutcome, blockOutcome] = await Promise.allSettled([
          fetchMessagesForThread(thread.id),
          supabase
            .from('chat_block')
            .select('op_id, athlete_id, blocked_by, blocked_at')
            .eq('op_id', thread.op_id)
            .eq('athlete_id', thread.athlete_id)
            .maybeSingle(),
        ]);

        if (messagesOutcome.status === 'fulfilled') {
          setMessages(messagesOutcome.value);
        } else {
          logSupabaseError('fetchMessagesForThread', messagesOutcome.reason);
          throw messagesOutcome.reason;
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

        await markThreadRead(thread.id);
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
    []
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
    if (blockInfo && blockInfo.blocked_by && blockInfo.blocked_by !== 'ATHLETE') return;
    setSending(true);
    setActionError(null);
    try {
      await sendMessage({ threadId: selectedThread.id, text: messageDraft.trim(), athleteId });
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
      await updateArchiveStatus({ threadId: thread.id, archived });
      await loadThreads();
      if (!archived) setSelectedThreadId(thread.id);
      if (archived && selectedThreadId === thread.id) setSelectedThreadId(null);
    } catch (err) {
      setActionError(err.message || 'Unable to update archive state.');
    }
  };

  const handleBlockToggle = async (thread, blocked) => {
    if (!thread) return;
    const canToggle = !blockInfo || blockInfo.blocked_by === 'ATHLETE';
    if (!canToggle) return;
    try {
      await upsertBlock({ athleteId, operatorId: thread.op_id, action: blocked ? 'block' : 'unblock' });
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

  useEffect(() => {
    if (!isMobile) {
      setMobileView('list');
      return;
    }
    if (!selectedThread) {
      setMobileView('list');
    }
  }, [isMobile, selectedThread?.id]);

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

  if (loadingAthlete) {
    return (
      <div style={styles.card}>
        <div style={styles.emptyState}>
          <Loader2 className="spin" size={28} />
          <p>Preparing your inbox…</p>
        </div>
      </div>
    );
  }

  if (athleteError) {
    return (
      <div style={styles.card}>
        <div style={styles.emptyState}>
          <p style={{ color: '#b91c1c', fontWeight: 600 }}>{athleteError}</p>
        </div>
      </div>
    );
  }

  const filteredEmptyMessage = totalUnread > 0
    ? `No ${activeTab === 'archived' ? 'archived' : 'active'} conversations to show.`
    : 'No conversations yet. Operators will reach out here once they contact you.';

  const composerDisabled =
    !selectedThread || (blockInfo && blockInfo.blocked_by && blockInfo.blocked_by !== 'ATHLETE');

  const selectedName = selectedThread ? resolveOperatorName(selectedThread.operator) : '';
  const blockOwnedByAthlete = blockInfo?.blocked_by === 'ATHLETE';
  const blockOwnedByOperator = blockInfo?.blocked_by === 'OP';
  const canToggleBlock = !blockInfo || blockOwnedByAthlete;
  const blockButtonLabel = blockOwnedByAthlete ? 'Unblock' : blockOwnedByOperator ? 'Blocked' : 'Block';

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

  return (
    <div style={wrapperStyle}>
      <div style={listCardStyle}>
        <div style={styles.columnHeader}>
          <h3 style={styles.columnTitle}>
            <MessageCircle size={18} /> Inbox
          </h3>
          <span style={styles.headerBadge}>{totalUnread} unread</span>
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
          <button
            type="button"
            onClick={loadThreads}
            style={styles.secondaryBtn}
          >
            <RefreshCcw size={15} />
          </button>
        </div>
        {threadsError && <div style={styles.errorText}>{threadsError}</div>}
        <div style={styles.listBody}>
          {threadsLoading ? (
            <div style={styles.listEmpty}>
              <Loader2 size={20} className="spin" /> Loading conversations…
            </div>
          ) : filteredThreads.length === 0 ? (
            <div style={styles.listEmpty}>{filteredEmptyMessage}</div>
          ) : (
            filteredThreads.map((thread) => {
              const name = resolveOperatorName(thread.operator);
              const isSelected = selectedThreadId === thread.id;
              const blocked = !!thread.block;
              const profile = thread.operator?.profile || {};
              const logoReference = normalizeLogoReference(profile?.logo_url);
              const resolvedLogoUrl = logoReference.url || (thread.op_id ? logoPreviewMap[thread.op_id] : '');
              const tradeName = resolveTradeName(thread.operator, name) || name;
              const legalName = resolveLegalName(thread.operator);
              const location = formatLocation(profile);
              const entityTypeLabel = resolveEntityTypeLabel(thread.operator);
              const timestampLabel = formatDateTime(thread.last_message_at || thread.created_at);
              const avatarAlt = pickFirstNonEmpty(tradeName, legalName, name) || 'Operator logo';
              const avatarInitials = initials(tradeName || name);
              return (
                <button
                  key={thread.id}
                  type="button"
                  onClick={() => handleSelectThread(thread.id)}
                  style={{
                    ...styles.conversationBtn,
                    ...(isMobile ? styles.conversationBtnMobile : null),
                    ...(isSelected ? styles.conversationBtnActive : null),
                  }}
                >
                  <div style={styles.avatarCell}>
                    <div style={styles.avatar}>
                      {resolvedLogoUrl ? (
                        <img src={resolvedLogoUrl} alt={avatarAlt} style={styles.avatarImg} />
                      ) : (
                        avatarInitials
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      ...styles.contentCell,
                      ...(isMobile ? styles.contentCellMobile : null),
                    }}
                  >
                    <div
                      style={{
                        ...styles.conversationTop,
                        ...(isMobile ? styles.conversationTopMobile : null),
                      }}
                    >
                      <div style={styles.conversationTopLeft}>
                        <div style={styles.conversationTitleRow}>
                          <span style={styles.conversationTitle}>{tradeName}</span>
                          {thread.unreadCount > 0 && (
                            <span style={styles.unreadBadge}>{thread.unreadCount}</span>
                          )}
                        </div>
                        {legalName && <p style={styles.legalName}>{legalName}</p>}
                      </div>
                      {entityTypeLabel ? (
                        <div
                          style={{
                            ...styles.conversationTopRight,
                            ...(isMobile ? styles.conversationTopRightMobile : null),
                          }}
                        >
                          <span style={styles.entityTag}>{entityTypeLabel}</span>
                        </div>
                      ) : null}
                    </div>
                    {location && (
                      <p
                        style={{
                          ...styles.locationText,
                          ...(isMobile ? styles.locationTextMobile : null),
                        }}
                      >
                        {location}
                      </p>
                    )}
                    <p
                      style={{
                        ...styles.conversationMeta,
                        ...(isMobile ? styles.conversationMetaMobile : null),
                      }}
                    >
                      <span>{timestampLabel}</span>
                      {blocked && <span>Blocked</span>}
                    </p>
                  </div>
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
            <p>Select a conversation to read and respond.</p>
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
                {blockInfo && (
                  <div style={styles.warningBanner}>
                    <ShieldOff size={16} />
                    <span>
                      Conversation blocked by {blockInfo.blocked_by === 'ATHLETE' ? 'you' : 'the operator'}. {blockInfo.blocked_by === 'ATHLETE' ? 'Unblock to resume messaging.' : 'Wait for the operator to unblock.'}
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
                  onClick={() => handleArchiveToggle(selectedThread, !selectedThread.athlete_deleted_at)}
                >
                  {selectedThread.athlete_deleted_at ? <Inbox size={16} /> : <Archive size={16} />}
                  {selectedThread.athlete_deleted_at ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.secondaryBtn,
                    ...(canToggleBlock ? null : styles.disabledBtn),
                  }}
                  onClick={() => {
                    if (!canToggleBlock) return;
                    handleBlockToggle(selectedThread, !(blockInfo && blockInfo.blocked_by === 'ATHLETE'));
                  }}
                  disabled={!canToggleBlock}
                >
                  {blockOwnedByAthlete ? <ShieldOff size={16} /> : <Shield size={16} />}
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
                <div style={styles.listEmpty}>No messages yet. Replies will appear here.</div>
              ) : (
                messages.map((message) => {
                  const isOwn = message.sender_kind === 'ATHLETE';
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
                placeholder={composerDisabled ? 'Messaging disabled while blocked.' : 'Write a reply…'}
                style={{
                  ...styles.textarea,
                  ...(composerDisabled ? { background: '#f8fafc', cursor: 'not-allowed' } : null),
                }}
                disabled={composerDisabled}
              />
              <div style={styles.composerActions}>
                <div style={styles.helperText}>
                  Replies are visible only to you and the operator.
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
        @keyframes athleteMessagesSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: athleteMessagesSpin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
