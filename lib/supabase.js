import { createClient } from "@supabase/supabase-js";
let c;
export const sb = () => (c ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY));
