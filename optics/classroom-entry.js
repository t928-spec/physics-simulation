import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  await import('./supabase-classroom.js');
} else {
  await import('./classroom.js');
}
