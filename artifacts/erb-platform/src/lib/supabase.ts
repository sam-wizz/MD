import { createClient } from '@supabase/supabase-js';
import { setAuthTokenGetter } from '@workspace/api-client-react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'http://localhost';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'anon';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Attach the Supabase access token to every API request so the server can
// verify the caller's identity.
setAuthTokenGetter(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
});
