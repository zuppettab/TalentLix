const normalizeBucketName = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed;
};

const BASE_BUCKET = normalizeBucketName(process.env.NEXT_PUBLIC_SUPABASE_OPERATOR_ASSETS_BUCKET);
const DOCUMENTS_BUCKET = normalizeBucketName(process.env.NEXT_PUBLIC_SUPABASE_OPERATOR_DOCUMENTS_BUCKET);
const LOGO_BUCKET = normalizeBucketName(process.env.NEXT_PUBLIC_SUPABASE_OPERATOR_LOGO_BUCKET);

const OPERATOR_ASSETS_BUCKET = BASE_BUCKET || 'op_assets';
const OPERATOR_DOCUMENTS_BUCKET = DOCUMENTS_BUCKET || OPERATOR_ASSETS_BUCKET;
const OPERATOR_LOGO_BUCKET = LOGO_BUCKET || OPERATOR_ASSETS_BUCKET;

export { OPERATOR_ASSETS_BUCKET, OPERATOR_DOCUMENTS_BUCKET, OPERATOR_LOGO_BUCKET };
