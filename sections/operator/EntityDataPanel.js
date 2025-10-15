import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import countries from '../../utils/countries';
import { supabase } from '../../utils/supabaseClient';
import { OPERATOR_LOGO_BUCKET } from '../../utils/operatorStorageBuckets';
import { useSignedUrlCache } from '../../utils/useSignedUrlCache';

const OP_LOGO_BUCKET = OPERATOR_LOGO_BUCKET;

const analyzeWebsiteValue = (raw) => {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { isValid: true, normalized: null, error: '' };
  }
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }
    return { isValid: true, normalized: parsed.toString(), error: '' };
  } catch (err) {
    return {
      isValid: false,
      normalized: null,
      error: 'Invalid website URL. Please use a valid domain (e.g. https://example.com).',
    };
  }
};

const toNullable = (value) => {
  if (value == null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return value;
};

const normalizeFileExtension = (file) => {
  if (!file) return '';
  const name = file.name || '';
  const parts = name.split('.');
  if (parts.length < 2) {
    if (file.type === 'image/svg+xml') return 'svg';
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/jpeg') return 'jpg';
    return '';
  }
  const ext = parts.pop() || '';
  return ext.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
};

const LOGO_FILE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/svg+xml';

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

export default function EntityDataPanel({ operatorData = {}, onRefresh, isMobile = false }) {
  const router = useRouter();
  const { profile, account, type } = operatorData || {};
  const sectionState = operatorData?.sectionStatus?.entity || {};
  const loading = sectionState.loading ?? operatorData.loading;
  const error = sectionState.error ?? operatorData.error;
  const operatorId = operatorData?.account?.id;

  const [form, setForm] = useState({ trade_name: '', website: '', logo_url: '' });
  const [snapshot, setSnapshot] = useState({ trade_name: '', website: '', logo_url: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [logoFile, setLogoFile] = useState(null);
  const [logoMarkedForRemoval, setLogoMarkedForRemoval] = useState(false);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
  const [logoStoragePath, setLogoStoragePath] = useState('');
  const logoObjectUrlRef = useRef('');

  const cleanupLogoObjectUrl = useCallback(() => {
    if (logoObjectUrlRef.current) {
      URL.revokeObjectURL(logoObjectUrlRef.current);
      logoObjectUrlRef.current = '';
    }
  }, []);

  const getSignedLogoUrl = useSignedUrlCache(OP_LOGO_BUCKET);

  useEffect(() => {
    return () => {
      cleanupLogoObjectUrl();
    };
  }, [cleanupLogoObjectUrl]);

  useEffect(() => {
    const nextForm = {
      trade_name: profile?.trade_name || '',
      website: profile?.website || '',
      logo_url: profile?.logo_url || '',
    };
    setForm(nextForm);
    setSnapshot(nextForm);
    setErrors({});
    setDirty(false);
    setStatus({ type: '', msg: '' });
    setLogoMarkedForRemoval(false);
    setLogoFile(null);
    cleanupLogoObjectUrl();
    setLogoPreviewUrl('');
    setLogoStoragePath(deriveStoragePathFromPublicUrl(nextForm.logo_url, OP_LOGO_BUCKET) || '');
  }, [profile?.logo_url, profile?.trade_name, profile?.website, cleanupLogoObjectUrl]);

  const fallbackLogoUrl = useMemo(() => {
    const raw = form.logo_url || '';
    return /^https?:\/\//i.test(raw) ? raw : '';
  }, [form.logo_url]);

  useEffect(() => {
    if (logoFile) return;

    let active = true;
    let refreshTimer = null;

    const updatePreview = async () => {
      if (!active) return;
      if (logoStoragePath) {
        const url = await getSignedLogoUrl(logoStoragePath);
        if (!active) return;
        setLogoPreviewUrl(url || '');
        if (refreshTimer) clearTimeout(refreshTimer);
        if (url) {
          refreshTimer = setTimeout(updatePreview, 55_000);
        }
        return;
      }
      setLogoPreviewUrl(fallbackLogoUrl || '');
    };

    updatePreview();

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [logoFile, logoStoragePath, getSignedLogoUrl, fallbackLogoUrl]);

  useEffect(() => {
    const beforeUnload = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', beforeUnload);
    }

    const handleRouteChangeStart = () => {
      if (!dirty) return;
      const ok = typeof window === 'undefined' ? true : window.confirm('You have unsaved changes. Leave without saving?');
      if (!ok) {
        router.events.emit('routeChangeError');
        // eslint-disable-next-line no-throw-literal
        throw 'Route change aborted due to unsaved changes';
      }
    };

    router.events.on('routeChangeStart', handleRouteChangeStart);

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', beforeUnload);
      }
      router.events.off('routeChangeStart', handleRouteChangeStart);
    };
  }, [dirty, router.events]);

  const displayName = useMemo(() => {
    const trade = form?.trade_name?.trim();
    const legal = profile?.legal_name?.trim();
    if (trade) return trade;
    if (legal) return legal;
    return FALLBACK_NAME;
  }, [form?.trade_name, profile?.legal_name]);

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

  const websiteLink = useMemo(() => buildWebsiteLink(form?.website), [form?.website]);
  const countryName = useMemo(() => resolveCountryName(profile?.country), [profile?.country]);
  const initials = useMemo(() => toInitials(displayName || legalName || FALLBACK_NAME), [displayName, legalName]);
  const logoInputId = useMemo(() => `operator-logo-upload-${operatorId || 'current'}`, [operatorId]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setDirty(true);
    setStatus({ type: '', msg: '' });
    if (name === 'website') {
      const meta = analyzeWebsiteValue(value);
      setErrors((prev) => ({ ...prev, website: meta.isValid ? '' : meta.error }));
    } else if (name === 'trade_name') {
      setErrors((prev) => ({ ...prev, trade_name: '' }));
    }
  };

  const handleWebsiteBlur = () => {
    const meta = analyzeWebsiteValue(form.website);
    if (meta.isValid) {
      setForm((prev) => ({ ...prev, website: meta.normalized || '' }));
      setErrors((prev) => ({ ...prev, website: '' }));
    } else if (form.website) {
      setErrors((prev) => ({ ...prev, website: meta.error || 'Invalid website URL. Please use a valid domain (e.g. https://example.com).' }));
    }
  };

  const autoSaveLogo = useCallback(
    async (file, context = {}) => {
      if (!file) return;

      const { previousPreviewUrl = '', previousStoragePath = '' } = context;

      if (!operatorId || !supabase) {
        setStatus({ type: 'error', msg: 'Unable to update logo right now.' });
        setLogoPreviewUrl(previousPreviewUrl || '');
        setLogoStoragePath(previousStoragePath || '');
        setLogoFile(null);
        cleanupLogoObjectUrl();
        return;
      }

      let uploadedLogoPath = '';
      const ext = normalizeFileExtension(file) || (file.type === 'image/svg+xml' ? 'svg' : 'png');
      const timestamp = Date.now();
      const path = `op/${operatorId}/logo/logo-${timestamp}.${ext || 'png'}`;

      try {
        setSaving(true);
        setStatus({ type: '', msg: '' });

        const { error: uploadError } = await supabase.storage
          .from(OP_LOGO_BUCKET)
          .upload(path, file, {
            cacheControl: '3600',
            upsert: true,
            contentType: file.type || undefined,
          });

        if (uploadError) throw uploadError;

        uploadedLogoPath = path;

        const { data } = supabase.storage.from(OP_LOGO_BUCKET).getPublicUrl(path);
        const newLogoUrlValue = data?.publicUrl || path;

        const { data: existingRow, error: existingErr } = await supabase
          .from('op_profile')
          .select('op_id')
          .eq('op_id', operatorId)
          .maybeSingle();

        if (existingErr && existingErr.code !== 'PGRST116') throw existingErr;

        if (existingRow) {
          const { error: updateErr } = await supabase
            .from('op_profile')
            .update({ logo_url: newLogoUrlValue ? newLogoUrlValue : null })
            .eq('op_id', operatorId);
          if (updateErr) throw updateErr;
        } else {
          const insertPayload = {
            op_id: operatorId,
            legal_name: toNullable(profile?.legal_name) || null,
            trade_name: toNullable(profile?.trade_name) || null,
            website: toNullable(profile?.website) || null,
            address1: toNullable(profile?.address1),
            address2: toNullable(profile?.address2),
            city: toNullable(profile?.city),
            state_region: toNullable(profile?.state_region),
            postal_code: toNullable(profile?.postal_code),
            country: toNullable(profile?.country),
            logo_url: newLogoUrlValue ? newLogoUrlValue : null,
          };
          const { error: insertErr } = await supabase.from('op_profile').insert([insertPayload]);
          if (insertErr) throw insertErr;
        }

        if (previousStoragePath && previousStoragePath !== path) {
          const { error: cleanupErr } = await supabase.storage
            .from(OP_LOGO_BUCKET)
            .remove([previousStoragePath]);
          if (cleanupErr) {
            console.warn('Unable to remove previous logo from storage', cleanupErr);
          }
        }

        const hasPendingTextChanges =
          (form.trade_name || '') !== (snapshot.trade_name || '') ||
          (form.website || '') !== (snapshot.website || '');

        setSnapshot((prev) => ({ ...prev, logo_url: newLogoUrlValue || '' }));
        setForm((prev) => ({ ...prev, logo_url: newLogoUrlValue || '' }));
        const signedPreviewUrl = await getSignedLogoUrl(path);
        setLogoPreviewUrl(signedPreviewUrl || newLogoUrlValue || '');
        setLogoStoragePath(path || '');
        setLogoFile(null);
        setLogoMarkedForRemoval(false);
        cleanupLogoObjectUrl();
        setDirty(hasPendingTextChanges);
        setStatus({ type: 'success', msg: 'Logo updated ✓' });

        if (onRefresh) {
          try {
            await onRefresh({ silent: true });
          } catch (refreshErr) {
            console.warn('Refresh after logo auto-save failed', refreshErr);
          }
        }
      } catch (err) {
        console.error('Auto logo update failed', err);
        if (uploadedLogoPath) {
          const { error: cleanupErr } = await supabase.storage
            .from(OP_LOGO_BUCKET)
            .remove([uploadedLogoPath]);
          if (cleanupErr) {
            console.warn('Failed to rollback uploaded logo after auto-save error', cleanupErr);
          }
        }
        setLogoPreviewUrl(previousPreviewUrl || '');
        setLogoStoragePath(previousStoragePath || '');
        setLogoFile(null);
        cleanupLogoObjectUrl();
        setStatus({ type: 'error', msg: 'Logo update failed. Please try again.' });
      } finally {
        setSaving(false);
      }
    },
    [
      operatorId,
      supabase,
      profile?.legal_name,
      profile?.trade_name,
      profile?.website,
      profile?.address1,
      profile?.address2,
      profile?.city,
      profile?.state_region,
      profile?.postal_code,
      profile?.country,
      getSignedLogoUrl,
      form.trade_name,
      form.website,
      snapshot.trade_name,
      snapshot.website,
      cleanupLogoObjectUrl,
      onRefresh,
    ]
  );

  const handleLogoSelect = (file) => {
    if (!file) return;
    const previousPreviewUrl = logoPreviewUrl;
    const previousStoragePath = logoStoragePath;
    cleanupLogoObjectUrl();
    try {
      const objectUrl = URL.createObjectURL(file);
      logoObjectUrlRef.current = objectUrl;
      setLogoPreviewUrl(objectUrl);
      setLogoFile(file);
      setLogoMarkedForRemoval(false);
      setStatus({ type: '', msg: '' });
      autoSaveLogo(file, { previousPreviewUrl, previousStoragePath });
    } catch (err) {
      console.error('Unable to preview selected logo file', err);
      setStatus({ type: 'error', msg: 'Unable to preview selected file.' });
    }
  };

  const handleLogoRemove = () => {
    if (!logoFile && !form.logo_url) return;
    cleanupLogoObjectUrl();
    setLogoFile(null);
    setLogoMarkedForRemoval(true);
    setForm((prev) => ({ ...prev, logo_url: '' }));
    setLogoPreviewUrl('');
    setLogoStoragePath('');
    setDirty(true);
    setStatus({ type: '', msg: '' });
  };

  const hasErrors = useMemo(() => Object.values(errors).some(Boolean), [errors]);
  const isSaveDisabled =
    saving || !dirty || hasErrors || !operatorId || !supabase;

  const saveBtnStyle = isSaveDisabled
    ? { ...styles.saveBtn, ...styles.saveBtnDisabled }
    : { ...styles.saveBtn, ...styles.saveBtnEnabled };
  const saveBarStyle = isMobile ? { ...styles.saveBar, justifyContent: 'flex-start' } : styles.saveBar;

  const onSave = async () => {
    if (isSaveDisabled) return;

    const websiteMeta = analyzeWebsiteValue(form.website);
    if (!websiteMeta.isValid) {
      setErrors((prev) => ({ ...prev, website: websiteMeta.error }));
      return;
    }

    if (!supabase) {
      setStatus({ type: 'error', msg: 'Service unavailable.' });
      return;
    }

    const trimmedTradeName = form.trade_name?.trim() || '';
    const previousLogoValue = snapshot.logo_url || '';
    const previousLogoPath = deriveStoragePathFromPublicUrl(previousLogoValue, OP_LOGO_BUCKET);
    let newLogoUrlValue = previousLogoValue;
    let newLogoStoragePath = logoStoragePath;
    let uploadedLogoPath = '';
    let removePreviousPath = '';
    const wasRemovingLogo = logoMarkedForRemoval;

    const hadLogoFile = Boolean(logoFile);
    let shouldCleanupLogoObjectUrl = false;

    try {
      setSaving(true);
      setStatus({ type: '', msg: '' });

      if (logoFile) {
        if (!operatorId) {
          throw new Error('Missing operator ID.');
        }
        const ext = normalizeFileExtension(logoFile) || (logoFile.type === 'image/svg+xml' ? 'svg' : 'png');
        const timestamp = Date.now();
        const path = `op/${operatorId}/logo/logo-${timestamp}.${ext || 'png'}`;
        const { error: uploadError } = await supabase.storage
          .from(OP_LOGO_BUCKET)
          .upload(path, logoFile, {
            cacheControl: '3600',
            upsert: true,
            contentType: logoFile.type || undefined,
          });
        if (uploadError) throw uploadError;
        uploadedLogoPath = path;
        const { data } = supabase.storage.from(OP_LOGO_BUCKET).getPublicUrl(path);
        newLogoUrlValue = data?.publicUrl || path;
        newLogoStoragePath = path;
        if (previousLogoPath && previousLogoPath !== path) {
          removePreviousPath = previousLogoPath;
        }
      } else if (logoMarkedForRemoval) {
        newLogoUrlValue = '';
        newLogoStoragePath = '';
        if (previousLogoPath) {
          removePreviousPath = previousLogoPath;
        }
      }

      const payload = {
        trade_name: toNullable(trimmedTradeName),
        website: websiteMeta.normalized ? websiteMeta.normalized : null,
        logo_url: newLogoUrlValue ? newLogoUrlValue : null,
      };

      const { data: existingRow, error: existingErr } = await supabase
        .from('op_profile')
        .select('op_id')
        .eq('op_id', operatorId)
        .maybeSingle();

      if (existingErr && existingErr.code !== 'PGRST116') throw existingErr;

      if (existingRow) {
        const { error: updateErr } = await supabase
          .from('op_profile')
          .update(payload)
          .eq('op_id', operatorId);
        if (updateErr) throw updateErr;
      } else {
        const insertPayload = {
          op_id: operatorId,
          legal_name: toNullable(profile?.legal_name) || null,
          trade_name: payload.trade_name,
          website: payload.website,
          address1: toNullable(profile?.address1),
          address2: toNullable(profile?.address2),
          city: toNullable(profile?.city),
          state_region: toNullable(profile?.state_region),
          postal_code: toNullable(profile?.postal_code),
          country: toNullable(profile?.country),
          logo_url: payload.logo_url,
        };
        const { error: insertErr } = await supabase.from('op_profile').insert([insertPayload]);
        if (insertErr) throw insertErr;
      }

      if (removePreviousPath) {
        const { error: cleanupErr } = await supabase.storage
          .from(OP_LOGO_BUCKET)
          .remove([removePreviousPath]);
        if (cleanupErr) {
          console.warn('Unable to remove previous logo from storage', cleanupErr);
        }
      }

      const normalizedWebsiteValue = websiteMeta.normalized || '';
      const nextSnapshot = {
        trade_name: trimmedTradeName,
        website: normalizedWebsiteValue,
        logo_url: newLogoUrlValue || '',
      };

      setSnapshot(nextSnapshot);
      setForm(nextSnapshot);
      setDirty(false);
      setLogoMarkedForRemoval(false);
      setLogoFile(null);
      const shouldUpdatePreview = Boolean(logoFile || wasRemovingLogo);
      let nextPreviewUrl = logoPreviewUrl;
      let nextStoragePath = newLogoStoragePath || '';

      if (shouldUpdatePreview) {
        if (newLogoStoragePath) {
          const signedUrl = await getSignedLogoUrl(newLogoStoragePath);
          nextPreviewUrl = signedUrl || (newLogoUrlValue || '');
          nextStoragePath = newLogoStoragePath;
        } else {
          const trimmed = typeof newLogoUrlValue === 'string' ? newLogoUrlValue.trim() : '';
          nextPreviewUrl = /^https?:\/\//i.test(trimmed) ? trimmed : '';
          nextStoragePath = '';
        }
      }

      setLogoPreviewUrl(shouldUpdatePreview ? nextPreviewUrl : logoPreviewUrl);
      setLogoStoragePath(nextStoragePath);
      setErrors({});
      setStatus({ type: 'success', msg: 'Saved ✓' });
      if (hadLogoFile) {
        shouldCleanupLogoObjectUrl = true;
      }

      if (onRefresh) {
        try {
          await onRefresh();
        } catch (refreshErr) {
          console.warn('Refresh after save failed', refreshErr);
        }
      }
    } catch (err) {
      console.error('Save failed', err);
      if (uploadedLogoPath) {
        const { error: rollbackErr } = await supabase.storage
          .from(OP_LOGO_BUCKET)
          .remove([uploadedLogoPath]);
        if (rollbackErr) {
          console.warn('Failed to rollback uploaded logo after error', rollbackErr);
        }
      }
      setStatus({ type: 'error', msg: 'Save failed. Please try again.' });
    } finally {
      if (shouldCleanupLogoObjectUrl) {
        cleanupLogoObjectUrl();
      }
      setSaving(false);
    }
  };

  const resolvedLogoUrl = useMemo(() => {
    const base = logoPreviewUrl || fallbackLogoUrl;
    if (!base) return '';
    if (/^(blob:|data:)/i.test(base)) {
      return base;
    }
    return base;
  }, [logoPreviewUrl, fallbackLogoUrl]);

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
            <InfoRow
              label="Trade name"
              value={(
                <div style={styles.editField}>
                  <input
                    name="trade_name"
                    value={form.trade_name}
                    onChange={handleInputChange}
                    placeholder="Public or professional name"
                    style={styles.input}
                  />
                </div>
              )}
            />
            <InfoRow
              label="Website"
              value={(
                <div style={styles.editField}>
                  <input
                    name="website"
                    value={form.website}
                    onChange={handleInputChange}
                    onBlur={handleWebsiteBlur}
                    placeholder="https://example.com"
                    style={{
                      ...styles.input,
                      borderColor: errors.website ? '#b00' : '#E0E0E0',
                    }}
                  />
                  {errors.website && <div style={styles.error}>{errors.website}</div>}
                  {!errors.website && websiteLink && websiteLink.href && (
                    <a href={websiteLink.href} target="_blank" rel="noreferrer" style={styles.link}>
                      Open website
                    </a>
                  )}
                </div>
              )}
            />
            <InfoRow
              label="Logo"
              value={(
                <div style={styles.editField}>
                  {resolvedLogoUrl ? (
                    <div style={styles.logoActions}>
                      <a href={resolvedLogoUrl} target="_blank" rel="noreferrer" style={styles.link}>
                        Open logo
                      </a>
                      <button type="button" style={styles.removeLogoBtn} onClick={handleLogoRemove}>
                        Remove logo
                      </button>
                    </div>
                  ) : (
                    <span style={styles.muted}>No logo uploaded</span>
                  )}
                  <div style={styles.logoUploadRow}>
                    <label htmlFor={logoInputId} style={styles.uploadLabel}>
                      Choose file
                    </label>
                    <input
                      id={logoInputId}
                      type="file"
                      accept={LOGO_FILE_ACCEPT}
                      style={{ display: 'none' }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handleLogoSelect(file);
                        if (event.target) event.target.value = '';
                      }}
                    />
                    {logoFile && <span style={styles.logoFileName}>{logoFile.name}</span>}
                  </div>
                </div>
              )}
            />
          </div>
          <div style={saveBarStyle}>
            <button type="button" onClick={onSave} disabled={isSaveDisabled} style={saveBtnStyle}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {status.msg ? (
              <span style={status.type === 'error' ? styles.statusError : styles.statusSuccess}>{status.msg}</span>
            ) : null}
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
  editField: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #E0E0E0',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 500,
    background: '#FFFFFF',
  },
  error: {
    fontSize: 12,
    color: '#b00',
    fontWeight: 500,
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
  logoActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  logoUploadRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  uploadLabel: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    borderRadius: 8,
    padding: '0.45rem 0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
  },
  removeLogoBtn: {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    padding: '0.45rem 0.9rem',
    fontWeight: 600,
    color: '#c92a2a',
    cursor: 'pointer',
  },
  logoFileName: {
    fontSize: 12,
    color: '#475569',
    fontWeight: 500,
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
  saveBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  saveBtn: {
    height: 38,
    padding: '0 16px',
    borderRadius: 8,
    fontWeight: 600,
    border: 'none',
  },
  saveBtnEnabled: {
    background: 'linear-gradient(90deg, #27E3DA, #F7B84E)',
    color: '#fff',
    cursor: 'pointer',
  },
  saveBtnDisabled: {
    background: '#EEE',
    color: '#999',
    border: '1px solid #E0E0E0',
    cursor: 'not-allowed',
  },
  statusSuccess: {
    color: '#2E7D32',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  statusError: {
    color: '#b00',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
};
