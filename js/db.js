/* Shared Supabase client. All pages import this. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const isConfigured =
  SUPABASE_URL.includes("supabase.co") &&
  !SUPABASE_URL.includes("YOUR-PROJECT-REF");

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/** Show a friendly banner if the owner hasn't pasted their Supabase keys yet. */
export function guardConfig(el) {
  if (!isConfigured && el) {
    el.innerHTML = `<div class="notice">
      <strong>Setup needed:</strong> this site isn't connected to its database yet.
      If you're the owner, open <code>js/config.js</code> and paste in your
      Supabase URL and anon key (see README Step 1).
    </div>`;
  }
  return isConfigured;
}
