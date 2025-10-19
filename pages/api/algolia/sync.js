// pages/api/algolia/sync.js
import algoliasearch from "algoliasearch";
import { createClient } from "@supabase/supabase-js";

const VIEW_NAME = "algolia_athlete_search";
const INDEX_NAME =
  process.env.ALGOLIA_INDEX_ATHLETE_SEARCH ||
  process.env.NEXT_PUBLIC_ALGOLIA_INDEX_ATHLETE_SEARCH ||
  "athlete_search";

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALGOLIA_APP_ID =
  process.env.ALGOLIA_APP_ID || process.env.NEXT_PUBLIC_ALGOLIA_APP_ID;
const ALGOLIA_ADMIN_API_KEY = process.env.ALGOLIA_ADMIN_API_KEY;

const BATCH_SIZE = 1000;

function checkEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ALGOLIA_APP_ID) missing.push("ALGOLIA_APP_ID (o NEXT_PUBLIC_ALGOLIA_APP_ID)");
  if (!ALGOLIA_ADMIN_API_KEY) missing.push("ALGOLIA_ADMIN_API_KEY");
  if (!INDEX_NAME) missing.push("ALGOLIA_INDEX_ATHLETE_SEARCH");
  if (missing.length) {
    const err = new Error(
      "Mancano variabili d'ambiente obbligatorie: " + missing.join(", ")
    );
    err.status = 500;
    throw err;
  }
}

function supabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function normalizeRow(row) {
  const objectID =
    (row.objectID ?? row.id ?? row.athlete_id ?? row.uuid ?? row.slug)?.toString();
  row.objectID =
    objectID ||
    [
      row.athlete_id,
      row.id,
      row.slug,
      row.uuid,
      row.email,
      row.username,
    ]
      .filter(Boolean)
      .map(String)
      .join("_") ||
    "unknown_" + Math.random().toString(36).slice(2);
  return row;
}

async function fetchAllFromView(sb) {
  const pageSize = 2000;
  let from = 0;
  let all = [];
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await sb.from(VIEW_NAME).select("*").range(from, to);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data.map(normalizeRow));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function saveObjectsBatched(client, indexName, objects) {
  let pushed = 0;
  for (let i = 0; i < objects.length; i += BATCH_SIZE) {
    const slice = objects.slice(i, i + BATCH_SIZE);
    await client.saveObjects({ indexName, objects: slice });
    pushed += slice.length;
  }
  return pushed;
}

export default async function handler(req, res) {
  // Endpoint pubblico (nessuna password) — ATTENZIONE: solo per ora
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, max-age=0");

  try {
    checkEnv();

    const mode = String(req.query.mode || "save"); // "save" | "replace"

    const sb = supabaseClient();
    const client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY);

    const rows = await fetchAllFromView(sb);

    if (mode === "replace") {
      // v5: metodo sul client, non sull'index
      await client.replaceAllObjects({ indexName: INDEX_NAME, objects: rows });
      return res.status(200).json({
        ok: true,
        mode: "replaceAllObjects",
        index: INDEX_NAME,
        totalFetched: rows.length,
        pushed: rows.length,
      });
    }

    const pushed = await saveObjectsBatched(client, INDEX_NAME, rows);
    return res.status(200).json({
      ok: true,
      mode: "saveObjects",
      index: INDEX_NAME,
      totalFetched: rows.length,
      pushed,
    });
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ ok: false, error: err.message || "Unknown error" });
  }
}
