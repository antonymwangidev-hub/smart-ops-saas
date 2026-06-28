import {
  createContext, useContext, useEffect, useState, useRef, ReactNode,
} from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

/**
 * AuthProvider — fixed race condition.
 *
 * ORIGINAL BUG
 * ────────────
 * The original code called BOTH:
 *   supabase.auth.onAuthStateChange(...)
 *   supabase.auth.getSession()
 *
 * These run concurrently. If getSession() resolves AFTER the auth state
 * change fires (which happens on slow connections), the second setState
 * call overwrites valid session data with potentially stale data, leaving
 * loading=false with the wrong session state.
 *
 * FIX
 * ───
 * Use ONLY onAuthStateChange. Per Supabase docs, it fires immediately with
 * the current session on mount (INITIAL_SESSION event), so getSession() is
 * redundant. The `initialised` ref prevents any double-loading flash.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initialised = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        // Only set loading=false once — on the initial INITIAL_SESSION event.
        // Subsequent auth changes (sign in, sign out) should not flash a
        // loading spinner; the UI should update in place.
        if (!initialised.current) {
          initialised.current = true;
          setLoading(false);
        }
      }
    );

    // Safety net: if the auth state change never fires within 3 seconds
    // (edge case: no network, stale cookie), stop blocking the UI.
    const timeout = setTimeout(() => {
      if (!initialised.current) {
        initialised.current = true;
        setLoading(false);
      }
    }, 3000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
