import { useEffect, useMemo, useState } from 'react';
import countries from '../../utils/countries';
import { supabase } from '../../utils/supabaseClient';
import { OPERATOR_LOGO_BUCKET } from '../../utils/operatorStorageBuckets';

const OP_LOGO_BUCKET = OPERATOR_LOGO_BUCKET;

const deriveStoragePathFromPublicUrl = (publicUrl, bucket) => {
  if (!publicUrl || !bucket) return '';
  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return '';
  return publicUrl.substring(idx + marker.length);
};

const FALLBACK_NAME = 'Organisation profile';

const normalizeStatusLabel = (value) => {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const resolveCountryName = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const match = countries.find((item) => {
    return item.value === raw || item.label?.toLowerCase() === raw.toLowerCase();
  });
  if (!match) return raw;
  if (match.label && match.value && match.label !== match.value) {
    return `${match.label} (${match.value})`;
  }
  return match.label || match.value || raw;
};

const toInitials = (value) => {
  if (!value) return 'OP';
  const words = String(value)
    .replace(/[^A-Za-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return 'OP';
  const initials = words.slice(0, 2).map((word) => word[0].toUpperCase());
  return initials.join('');
};

const buildWebsiteLink = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const label = url.hostname + (url.pathname && url.pathname !== '/' ? url.pathname : '');
    return { href: url.toString(), label: label || url.toString() };
  } catch (err) {
    return { href: withProtocol, label: trimmed };
  }
};

const determineChipTone = (key, value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (key === 'status') {
    if (normalized === 'active') return 'success';
    if (normalized === 'suspended' || normalized === 'inactive') return 'danger';
    return 'neutral';
  }
  if (key === 'wizard') {
    if (['complete', 'completed', 'submitted', 'approved'].includes(normalized)) return 'success';
    if (['in_review', 'in_progress', 'pending'].includes(normalized)) return 'warning';
    return 'neutral';
  }
  return 'accent';
};

const renderValue = (value, styles) => {
  if (value == null) {
    return <span style={styles.muted}>Not provided</span>;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return <span style={styles.muted}>Not provided</span>;
    }
    return trimmed;
  }
  return value;
};

const StateMessage = ({ tone = 'default', children }) => {
  const baseStyle = { ...styles.stateBox };
  if (tone === 'error') Object.assign(baseStyle, styles.stateBoxError);
  return <div style={baseStyle}>{children}</div>;
};

const InfoRow = ({ label, value }) => (
  <div style={styles.infoRow}>
    <span style={styles.infoLabel}>{label}</span>
    <div style={styles.infoValue}>{renderValue(value, styles)}</div>
  </div>
);

const Chip = ({ label, tone = 'neutral' }) => {
  const base = { ...styles.chip };
  if (tone === 'success') Object.assign(base, styles.chipSuccess);
  if (tone === 'warning') Object.assign(base, styles.chipWarning);
  if (tone === 'danger') Object.assign(base, styles.chipDanger);
  if (tone === 'accent') Object.assign(base, styles.chipAccent);
  return <span style={base}>{label}</span>;
};

export default function EntityDataPanel({ operatorData = {} }) {
  const { profile, account, type } = operatorData || {};
  const sectionState = operatorData?.sectionStatus?.entity || {};
  const loading = sectionState.loading ?? operatorData.loading;
  const error = sectionState.error ?? operatorData.error;

  const displayName = useMemo(() => {
    const trade = profile?.trade_name?.trim();
    const legal = profile?.legal_name?.trim();
    if (trade) return trade;
    if (legal) return legal;
    return FALLBACK_NAME;
  }, [profile?.legal_name, profile?.trade_name]);

  const legalName = profile?.legal_name?.trim() || '';
  const typeLabel = type?.name || (type?.code ? String(type.code).toUpperCase() : '');
  const locationLine = useMemo(() => {
    const parts = [profile?.city, profile?.country ? resolveCountryName(profile.country) : '', profile?.state_region]
      .map((value) => (value || '').trim())
      .filter(Boolean);
    return parts.join(' · ');
  }, [profile?.city, profile?.country, profile?.state_region]);

  const heroSubtitle = useMemo(() => {
    if (displayName && legalName && displayName !== legalName) {
      return legalName;
    }
    if (typeLabel) return typeLabel;
    return locationLine;
  }, [displayName, legalName, locationLine, typeLabel]);

  const chips = useMemo(() => {
    const out = [];
    if (typeLabel) {
      out.push({ key: 'type', label: typeLabel, tone: 'accent' });
    }
    if (account?.status) {
      out.push({ key: 'status', label: `Status: ${normalizeStatusLabel(account.status)}`, tone: determineChipTone('status', account.status) });
    }
    if (account?.wizard_status) {
      out.push({ key: 'wizard', label: `Wizard: ${normalizeStatusLabel(account.wizard_status)}`, tone: determineChipTone('wizard', account.wizard_status) });
    }
    return out;
  }, [account?.status, account?.wizard_status, typeLabel]);

  const websiteLink = useMemo(() => buildWebsiteLink(profile?.website), [profile?.website]);
  const countryName = useMemo(() => resolveCountryName(profile?.country), [profile?.country]);

  const logoUrl = profile?.logo_url ? String(profile.logo_url) : '';
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const initials = useMemo(() => toInitials(displayName || legalName || FALLBACK_NAME), [displayName, legalName]);

  useEffect(() => {
    let active = true;

    const resolveLogoUrl = async () => {
      const rawValue = typeof logoUrl === 'string' ? logoUrl.trim() : '';

      if (!rawValue) {
        if (active) setLogoPreviewUrl('');
        return;
      }

      const isHttpUrl = /^https?:\/\//i.test(rawValue);
      const resolvedPath = deriveStoragePathFromPublicUrl(rawValue, OP_LOGO_BUCKET) || rawValue;
      const normalizedPath = resolvedPath.startsWith(`${OP_LOGO_BUCKET}/`)
        ? resolvedPath.slice(OP_LOGO_BUCKET.length + 1)
        : resolvedPath.replace(/^\/+/, '');
      const sanitizedPath = normalizedPath.replace(/^\/+/, '');

      if (!supabase || !supabase.storage) {
        if (active) {
          if (isHttpUrl) {
            setLogoPreviewUrl(rawValue);
          } else {
            console.warn('Supabase client is not available while resolving operator logo preview.');
            setLogoPreviewUrl('');
          }
        }
        return;
      }

      if (!normalizedPath) {
        if (active) {
          if (isHttpUrl) {
            setLogoPreviewUrl(rawValue);
          } else {
            setLogoPreviewUrl('');
          }
        }
        return;
      }

      if (isHttpUrl && normalizedPath === rawValue) {
        if (active) setLogoPreviewUrl(rawValue);
        return;
      }

      const resolvePublicUrl = () => {
        if (!supabase?.storage) return '';
        const { data } = supabase.storage.from(OP_LOGO_BUCKET).getPublicUrl(sanitizedPath);
        return data?.publicUrl || '';
      };

      let signedUrl = '';

      try {
        const { data, error } = await supabase.storage
          .from(OP_LOGO_BUCKET)
          .createSignedUrl(sanitizedPath, 300);

        if (error) throw error;

        signedUrl = data?.signedUrl || '';
      } catch (err) {
        console.warn('Failed to resolve operator logo preview for dashboard', err);
      }

      if (!active) return;

      if (signedUrl) {
        setLogoPreviewUrl(signedUrl);
        return;
      }

      const publicUrl = resolvePublicUrl();

      if (publicUrl) {
        setLogoPreviewUrl(publicUrl);
        return;
      }

      if (isHttpUrl) {
        setLogoPreviewUrl(rawValue);
        return;
      }

      setLogoPreviewUrl('');
    };

    resolveLogoUrl();

    return () => {
      active = false;
    };
  }, [logoUrl]);

  const resolvedLogoUrl = logoPreviewUrl || (/^https?:\/\//i.test(logoUrl) ? logoUrl : '');

  if (loading) {
    return <StateMessage>Loading entity information…</StateMessage>;
  }

  if (error) {
    return <StateMessage tone="error">Unable to load entity data. Please try refreshing the page.</StateMessage>;
  }

  const hasData = Boolean(profile || type || account);
  if (!hasData) {
    return <StateMessage>No entity data available yet. Complete the onboarding wizard to populate this section.</StateMessage>;
  }

  const addressRows = [
    { label: 'Address line 1', value: profile?.address1 },
    { label: 'Address line 2', value: profile?.address2 },
    { label: 'City', value: profile?.city },
    { label: 'State / Province', value: profile?.state_region },
    { label: 'Postal / ZIP code', value: profile?.postal_code },
    { label: 'Country', value: countryName },
  ];

  return (
    <div style={styles.wrap}>
      <div style={styles.hero}>
        <div style={styles.heroAvatar} aria-hidden>
          {resolvedLogoUrl ? (
            <img src={resolvedLogoUrl} alt="Organisation logo" style={styles.heroAvatarImage} />
          ) : (
            <span style={styles.heroAvatarInitials}>{initials}</span>
          )}
        </div>
        <div style={styles.heroText}>
          <h3 style={styles.heroTitle}>{displayName}</h3>
          {heroSubtitle && <p style={styles.heroSubtitle}>{heroSubtitle}</p>}
          {locationLine && <p style={styles.heroMeta}>{locationLine}</p>}
          {chips.length > 0 && (
            <div style={styles.heroChips}>
              {chips.map((chip) => (
                <Chip key={chip.key} label={chip.label} tone={chip.tone} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Organisation basics</h4>
          <div style={styles.cardBody}>
            <InfoRow label="Operator type" value={typeLabel} />
            <InfoRow label="Legal name" value={profile?.legal_name} />
            <InfoRow label="Trade name" value={profile?.trade_name} />
            <InfoRow
              label="Website"
              value={websiteLink ? (
                <a href={websiteLink.href} target="_blank" rel="noreferrer" style={styles.link}>
                  {websiteLink.label}
                </a>
              ) : null}
            />
            <InfoRow
              label="Logo"
              value={resolvedLogoUrl ? (
                <div style={styles.logoRow}>
                  <span style={styles.logoThumb}>
                    <img src={resolvedLogoUrl} alt="Organisation logo preview" style={styles.logoThumbImage} />
                  </span>
                  <a href={resolvedLogoUrl} target="_blank" rel="noreferrer" style={styles.link}>
                    Open logo
                  </a>
                </div>
              ) : null}
            />
          </div>
        </div>

        <div style={styles.card}>
          <h4 style={styles.cardTitle}>Registered address</h4>
          <div style={styles.cardBody}>
            {addressRows.map((row) => (
              <InfoRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 24,
  },
  hero: {
    display: 'flex',
    gap: 20,
    alignItems: 'center',
    flexWrap: 'wrap',
    padding: '20px 24px',
    borderRadius: 20,
    background: 'linear-gradient(135deg, rgba(39,227,218,0.08), rgba(247,184,78,0.08))',
    border: '1px solid rgba(15,23,42,0.08)',
  },
  heroAvatar: {
    width: 84,
    height: 84,
    borderRadius: 20,
    background: '#FFFFFF',
    border: '1px solid rgba(15,23,42,0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 12px 24px rgba(15,23,42,0.08)',
    overflow: 'hidden',
  },
  heroAvatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  heroAvatarInitials: {
    fontSize: 28,
    fontWeight: 700,
    color: '#0F172A',
  },
  heroText: {
    flex: '1 1 240px',
    minWidth: 220,
  },
  heroTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: '#0F172A',
  },
  heroSubtitle: {
    margin: '8px 0 0 0',
    fontSize: 15,
    fontWeight: 600,
    color: '#1E293B',
  },
  heroMeta: {
    margin: '6px 0 0 0',
    fontSize: 13,
    color: '#475569',
  },
  heroChips: {
    marginTop: 12,
    display: 'flex',
    gap: 10,
    flexWrap: 'wrap',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 20,
  },
  card: {
    background: '#FFFFFF',
    borderRadius: 18,
    border: '1px solid #E2E8F0',
    boxShadow: '0 10px 30px rgba(15,23,42,0.06)',
    padding: 24,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  cardTitle: {
    margin: 0,
    fontSize: 17,
    fontWeight: 600,
    color: '#0F172A',
  },
  cardBody: {
    display: 'grid',
    gap: 12,
  },
  infoRow: {
    display: 'grid',
    gap: 6,
  },
  infoLabel: {
    fontSize: 12,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: '#64748B',
    fontWeight: 600,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: 600,
    color: '#0F172A',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
  },
  muted: {
    color: '#94A3B8',
    fontWeight: 500,
  },
  link: {
    color: '#2563EB',
    textDecoration: 'underline',
    fontWeight: 600,
    wordBreak: 'break-word',
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  logoThumb: {
    width: 56,
    height: 56,
    borderRadius: 14,
    border: '1px solid #E2E8F0',
    background: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoThumbImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #CBD5F5',
    background: '#F1F5F9',
    fontSize: 13,
    fontWeight: 600,
    color: '#0F172A',
  },
  chipAccent: {
    background: 'linear-gradient(135deg, #27E3DA, #F7B84E)',
    borderColor: 'transparent',
    color: '#0F172A',
    boxShadow: '0 6px 14px rgba(39,227,218,0.24)',
  },
  chipSuccess: {
    background: '#DCFCE7',
    borderColor: '#86EFAC',
    color: '#166534',
  },
  chipWarning: {
    background: '#FEF3C7',
    borderColor: '#FCD34D',
    color: '#92400E',
  },
  chipDanger: {
    background: '#FEE2E2',
    borderColor: '#FCA5A5',
    color: '#B91C1C',
  },
  stateBox: {
    borderRadius: 16,
    border: '1px dashed #CBD5F5',
    background: '#F8FAFC',
    padding: 28,
    textAlign: 'center',
    fontSize: 15,
    color: '#475569',
    fontWeight: 500,
  },
  stateBoxError: {
    borderColor: '#FCA5A5',
    background: '#FEF2F2',
    color: '#B91C1C',
  },
};
