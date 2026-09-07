import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * True once a Supabase session with a bearer token exists. Protected server
 * functions 401 without it, so gate `useQuery({ enabled })` on this instead of
 * firing during the signed-out or pre-hydration window.
 */
export function useSignedIn(): boolean {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session?.access_token));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session?.access_token));
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return signedIn;
}
