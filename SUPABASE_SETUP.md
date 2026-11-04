# Setup database Supabase

1. Buat project di Supabase.
2. Jalankan seluruh `supabase-schema.sql` di SQL Editor.
3. Salin `supabase-config.example.js` menjadi `supabase-config.js`.
4. Isi URL project dan `anonKey` dari Project Settings > API.
5. Jangan masukkan `service_role key` ke frontend.

Aplikasi saat ini tetap memakai `localStorage` sebagai fallback offline. Skema
dan konfigurasi ini menyiapkan database cloud; tahap berikutnya adalah
menghubungkan form login ke Supabase Auth dan mengganti adapter `load`/`save`.
