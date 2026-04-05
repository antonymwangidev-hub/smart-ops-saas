import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface UserPreferences {
  ai_recommendations: boolean;
  auto_escalate: boolean;
}

export function useUserPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: preferences, isLoading } = useQuery({
    queryKey: ["user_preferences", user?.id],
    queryFn: async (): Promise<UserPreferences | null> => {
      if (!user) return null;
      const { data } = await supabase
        .from("user_preferences" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle() as any;
      return data as UserPreferences | null;
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (prefs: Partial<UserPreferences>) => {
      if (!user) throw new Error("Not authenticated");
      const { data: existing } = await supabase
        .from("user_preferences" as any)
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase
          .from("user_preferences" as any)
          .update({ ...prefs, updated_at: new Date().toISOString() })
          .eq("user_id", user.id);
      } else {
        await supabase
          .from("user_preferences" as any)
          .insert({ user_id: user.id, ...prefs });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user_preferences", user?.id] });
    },
  });

  return {
    aiEnabled: preferences?.ai_recommendations ?? true,
    autoEscalate: preferences?.auto_escalate ?? true,
    loading: isLoading,
    updatePreference: mutation.mutate,
  };
}
