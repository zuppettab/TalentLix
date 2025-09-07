"use client";

import { useRef, useCallback } from 'react';
import { supabase } from './supabaseClient';

export function useSignedUrlCache(bucket) {
  const cacheRef = useRef(new Map());
  return useCallback(
    async (storagePath) => {
      if (!storagePath) return '';
      const key = `${bucket}:${storagePath}`;
      const hit = cacheRef.current.get(key);
      const now = Date.now();
      if (hit && hit.exp > now + 2000) return hit.url;
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60);
      if (error) return '';
      const url = data?.signedUrl || '';
      cacheRef.current.set(key, { url, exp: now + 55_000 });
      return url;
    },
    [bucket]
  );
}
