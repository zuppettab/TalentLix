import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../utils/supabaseClient';
import {
  buildOperatorUnauthorizedQuery,
  isOperatorUser,
  OPERATOR_LOGIN_PATH,
} from '../utils/authRoles';

export const useOperatorGuard = ({
  redirectTo = OPERATOR_LOGIN_PATH,
  includeReason = true,
} = {}) => {
  const router = useRouter();
  const [state, setState] = useState({ loading: true, user: null, error: null });

  useEffect(() => {
    let active = true;

    const verify = async () => {
      if (!supabase) {
        if (active) {
          setState({ loading: false, user: null, error: new Error('Supabase not configured') });
        }
        return;
      }

      const { data, error } = await supabase.auth.getUser();
      if (!active) return;

      const user = data?.user || null;

      if (error || !user) {
        if (redirectTo) {
          router.replace(redirectTo);
        }
        setState({ loading: false, user: null, error: error || null });
        return;
      }

      if (!isOperatorUser(user)) {
        await supabase.auth.signOut();
        if (redirectTo) {
          const query = includeReason ? buildOperatorUnauthorizedQuery() : undefined;
          router.replace(
            query ? { pathname: redirectTo, query } : redirectTo,
            undefined,
            { shallow: true }
          );
        }
        if (active) {
          setState({ loading: true, user: null, error: null });
        }
        return;
      }

      setState({ loading: false, user, error: null });
    };

    verify();

    return () => {
      active = false;
    };
  }, [includeReason, redirectTo, router]);

  return state;
};
