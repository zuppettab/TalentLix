// pages/api/algolia/sync.js
import algoliasearch from "algoliasearch";
import { createClient } from "@supabase/supabase-js";

// === CONFIG BASICA (metti i nomi delle env già usate nel progetto) ===
const VIEW_NAME = "algolia_athlete_search"; // nome della VIEW su Supabase
const INDEX_NAME =
  process.env.ALGOLIA_INDEX_ATHLETE_SEARCH ||
  process.env.NEXT_PUBLIC_ALGOLIA_INDEX_ATHLETE_SEARCH ||
  "athlete_search";

// Per Supabase usiamo la Service Role (server-side)
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Per Algolia usiamo le admin key (server-side)
const ALGOLIA_APP_ID =
  process.env.ALGOLIA_APP_ID || process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_API_KEY = process.env.ALGOLIA_ADMIN_API_KEY;

// Batch per caricare su Algolia senza esplodere la memoria
const BATCH_SIZE = 1000;

// Helper: verifica env minime
function checkEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ALGOLIA_APP_ID) missing.push("ALGOLIA_APP_ID (o NEXT_PUBLIC_ALGOLIA_APP_ID)");
  if (!ALGOLIA_ADMIN_API_KEY) missing.push("ALGOLIA_ADMIN_API_KEY");
  if (!INDEX_NAME) missing.push("ALGOLIA_INDEX_ATHLETE_SEARCH");
  if (missing.length) {
    const msg =
      "Mancano variabili d'ambiente obbligatorie: " + missing.join(", ");
    const err = new Error(msg);
    err.status = 500;
    throw err;
  }
}

// Helper: crea Supabase client (service role)
function supabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// Helper: normalizza una riga e imposta objectID
function normalizeRow(row) {
  const objectID =
    (row.objectID ?? row.id ?? row.athlete_id ?? row.uuid ?? row.slug)?.toString();
  if (!objectID) {
    // fallback finale: genera un id riproducibile da alcune colonne "stabili"
    const fallback = [
      row.athlete_id,
      row.id,
      row.slug,
      row.uuid,
      row.email,
      row.username,
    ]
      .filter(Boolean)
      .map(String)
      .join("_");
    row.objectID = fallback || "unknown_" + Math.random().toString(36).slice(2);
  } else {
    row.objectID = objectID;
  }
  return row;
}

// Helper: scarica tutte le righe dalla VIEW a pagine
async function fetchAllFromView(sb) {
  const pageSize = 2000; // pagina grande per ridurre round-trip DB
  let from = 0;
  let all = [];
  // Loop a pagine finché arrivano record
  // Nota: .range è inclusivo; (from) .. (to)
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await sb
      .from(VIEW_NAME)
      .select("*")
      .range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;

    all = all.concat(data.map(normalizeRow));
    if (data.length < pageSize) break; // ultima pagina
    from += pageSize;
  }
  return all;
}

// Helper: salva in Algolia a batch
async function saveObjectsBatched(index, objects) {
  let pushed = 0;
  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const slice = objects.slice(i, i + BATCH_SIZE);
    await index.saveObjects(slice, { autoGenerateObjectIDIfNotExist: true });
    pushed += slice.length;
  }
  return pushed;
}

export default async function handler(req, res) {
  // Niente password: endpoint pubblico (ATTENZIONE in produzione!)
  // Solo GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");
  try {
    checkEnv();

    // Legge modalità: default "save" (incrementale). "replace" per refresh totale.
    const mode = (req.query.mode || "save").toString();

    // Init client
    const sb = supabaseClient();
    const agClient = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);
    const index = agClient.initIndex(INDEX_NAME);

    // Scarica tutti i record dalla VIEW
    const rows = await fetchAllFromView(sb);

    let pushed = 0;
    if (mode === "replace") {
      // Replace all objects (swap atomico)
      await index.replaceAllObjects(rows, {
        autoGenerateObjectIDIfNotExist: true,
        // safe: true // opzionale: aspetta completamento; Vercel può stare nei 10s?
      });
      pushed = rows.length;
      return res.status(200).json({
        ok: true,
        mode: "replaceAllObjects",
        index: INDEX_NAME,
        totalFetched: rows.length,
        pushed,
      });
    }

    // Default: saveObjects (upsert)
    pushed = await saveObjectsBatched(index, rows);
    return res.status(200).json({
      ok: true,
      mode: "saveObjects",
      index: INDEX_NAME,
      totalFetched: rows.length,
      pushed,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({
      ok: false,
      error: err.message || "Unknown error",
    });
  }
}
