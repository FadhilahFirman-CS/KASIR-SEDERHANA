window.SUPABASE_CONFIG = {
  url: "https://civadjrdijpunafruqkr.supabase.co",
  anonKey: "sb_publishable_8cwblTsbqsNcIulEkylsfw_TkxRQ7ij"
};

window.supabaseClient = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);
