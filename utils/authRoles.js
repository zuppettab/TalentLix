export const ATHLETE_ROLE = 'athlete';
export const OPERATOR_ROLE = 'operator';
export const ADMIN_ROLE = 'admin';
export const OPERATOR_LOGIN_PATH = '/login-operator';
export const OPERATOR_GUARD_REDIRECT_QUERY_KEY = 'reason';
export const OPERATOR_GUARD_UNAUTHORIZED_VALUE = 'not_operator';
export const OPERATOR_UNAUTHORIZED_MESSAGE = 'This account is not authorized for operator access.';

const normalizeRole = (role) => (typeof role === 'string' ? role.toLowerCase() : null);

export const hasRole = (user, role) => {
  if (!user || !role) return false;

  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;

  const metadataRole = normalizeRole(user?.user_metadata?.role);
  if (metadataRole && metadataRole === normalizedRole) {
    return true;
  }

  const metadataRoles = user?.user_metadata?.roles;
  if (Array.isArray(metadataRoles) && metadataRoles.some((value) => normalizeRole(value) === normalizedRole)) {
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

  const athleteRole = normalizeRole(user?.athlete?.role);
  if (athleteRole) {
    return athleteRole === normalizedRole;
  }

  return false;
};

export const isOperatorUser = (user) => hasRole(user, OPERATOR_ROLE);
export const isAthleteUser = (user) => hasRole(user, ATHLETE_ROLE);
export const isAdminUser = (user) => hasRole(user, ADMIN_ROLE);

export const buildOperatorUnauthorizedQuery = () => ({
  [OPERATOR_GUARD_REDIRECT_QUERY_KEY]: OPERATOR_GUARD_UNAUTHORIZED_VALUE,
});
