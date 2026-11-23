/* =====================================================================
   KONFIGURASI SERVER — satu-satunya file yang perlu Anda isi.
   Dipakai oleh index.html (aplikasi) dan verifikasi.html (portal verifikasi klien).

   SUPABASE_URL / SUPABASE_KEY : Supabase -> Project Settings -> API.
   SUPABASE_KEY = kunci PUBLIK (anon / publishable). JANGAN isi kunci service_role / secret.
   Selama SUPABASE_URL masih kosong, aplikasi memakai API_URL (Apps Script + Sheets) dan
   menu-menu baru v0.3.0 belum berfungsi.
   ===================================================================== */
window.COA_CONFIG = {
  SUPABASE_URL: 'https://fzxtsyfoxjjowjdvxurv.supabase.co',
  SUPABASE_KEY: 'sb_publishable_hQaIj3OyCYRMnvSyfAqlyQ_6ikF9QFI',
  API_URL: 'https://script.google.com/macros/s/AKfycbzs0wLBSWuOcEdqlFuLWrDQUWQMFIuzDln2zpZ4dJ2uHp9n9aIzaHbr_oJbqNXrc38/exec',
  // Berapa scan boleh menunggu jawaban server sekaligus. 3 = operator bisa scan beruntun
  // tanpa menunggu; 1 = scan berikutnya baru bisa setelah server menjawab (paling aman).
  SCAN_QUEUE: 3
};
