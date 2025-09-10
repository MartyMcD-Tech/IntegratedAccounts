// /api/supabase-env.js
export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL || "";
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
  res.status(200).json({ SUPABASE_URL, SUPABASE_ANON_KEY, configured: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) });
}

