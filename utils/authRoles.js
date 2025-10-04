export const ATHLETE_ROLE = 'athlete';
export const OPERATOR_ROLE = 'operator';
export const OPERATOR_LOGIN_PATH = '/login-operator';
export const OPERATOR_GUARD_REDIRECT_QUERY_KEY = 'reason';
export const OPERATOR_GUARD_UNAUTHORIZED_VALUE = 'not_operator';
export const OPERATOR_UNAUTHORIZED_MESSAGE = 'Account non abilitato come operatore.';

const normalizeRole = (role) => (typeof role === 'string' ? role.toLowerCase() : null);

export const hasRole = (user, role) => {
  if (!user || !role) return false;

  const normalizedRole = normalizeRole(role);
  if (!normalizedRole) return false;

  const metadataRole = normalizeRole(user?.user_metadata?.role);
  if (metadataRole) {
    return metadataRole === normalizedRole;
  }

  const appRoles = user?.app_metadata?.roles;
  if (Array.isArray(appRoles)) {
    return appRoles.some((value) => normalizeRole(value) === normalizedRole);
  }

  return false;
};

export const isOperatorUser = (user) => hasRole(user, OPERATOR_ROLE);
export const isAthleteUser = (user) => hasRole(user, ATHLETE_ROLE);

export const buildOperatorUnauthorizedQuery = () => ({
  [OPERATOR_GUARD_REDIRECT_QUERY_KEY]: OPERATOR_GUARD_UNAUTHORIZED_VALUE,
});
