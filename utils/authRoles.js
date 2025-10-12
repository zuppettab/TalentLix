export const ATHLETE_ROLE = 'athlete';
export const OPERATOR_ROLE = 'operator';
export const ADMIN_ROLE = 'admin';
export const ADMIN_EMAIL_WHITELIST = ['pietro@zuppetta.com'];
export const OPERATOR_LOGIN_PATH = '/login-operator';
export const OPERATOR_GUARD_REDIRECT_QUERY_KEY = 'reason';
export const OPERATOR_GUARD_UNAUTHORIZED_VALUE = 'not_operator';
export const OPERATOR_UNAUTHORIZED_MESSAGE = 'This account is not authorized for operator access.';

const normalizeRole = (role) => (typeof role === 'string' ? role.toLowerCase() : null);
const isTruthy = (value) => value === true || value === 'true';

export const hasRole = (user, role) => {
  if (!user || !role) return false;

  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;

  const metadataRole = normalizeRole(user?.user_metadata?.role);
  if (metadataRole && metadataRole === normalizedRole) {
    return true;
  }

  const metadataRoleType = normalizeRole(user?.user_metadata?.role_type);
  if (metadataRoleType && metadataRoleType === normalizedRole) {
    return true;
  }

  const metadataRoles = user?.user_metadata?.roles;
  if (Array.isArray(metadataRoles) && metadataRoles.some((value) => normalizeRole(value) === normalizedRole)) {
    return true;
  }

  const metadataPermissions = user?.user_metadata?.permissions;
  if (Array.isArray(metadataPermissions) && metadataPermissions.some((value) => normalizeRole(value) === normalizedRole)) {
    return true;
  }

  const appMetadataRole = normalizeRole(user?.app_metadata?.role);
  if (appMetadataRole && appMetadataRole === normalizedRole) {
    return true;
  }

  const appRoles = user?.app_metadata?.roles;
  if (Array.isArray(appRoles) && appRoles.some((value) => normalizeRole(value) === normalizedRole)) {
    return true;
  }

  const appPermissions = user?.app_metadata?.permissions;
  if (Array.isArray(appPermissions) && appPermissions.some((value) => normalizeRole(value) === normalizedRole)) {
    return true;
  }

  if (normalizedRole === ADMIN_ROLE) {
    const explicitAdminFlags = [
      user?.user_metadata?.admin,
      user?.user_metadata?.is_admin,
      user?.user_metadata?.isAdmin,
      user?.app_metadata?.admin,
      user?.app_metadata?.is_admin,
      user?.app_metadata?.isAdmin,
    ];

    if (explicitAdminFlags.some((value) => isTruthy(value))) {
      return true;
    }

    const allowlist = (process.env.NEXT_PUBLIC_INTERNAL_ADMIN_EMAILS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (allowlist.length > 0 && typeof user?.email === 'string') {
      const email = user.email.toLowerCase();
      if (allowlist.includes(email)) {
        return true;
      }
    }
  }

  const athleteRole = normalizeRole(user?.athlete?.role);
  if (athleteRole) {
    return athleteRole === normalizedRole;
  }

  return false;
};

export const isOperatorUser = (user) => hasRole(user, OPERATOR_ROLE);
export const isAthleteUser = (user) => hasRole(user, ATHLETE_ROLE);
export const isAdminUser = (user) => {
  const email = typeof user?.email === 'string' ? user.email.toLowerCase() : null;
  if (email && ADMIN_EMAIL_WHITELIST.includes(email)) {
    return true;
  }
  return hasRole(user, ADMIN_ROLE);
};

export const buildOperatorUnauthorizedQuery = () => ({
  [OPERATOR_GUARD_REDIRECT_QUERY_KEY]: OPERATOR_GUARD_UNAUTHORIZED_VALUE,
});
