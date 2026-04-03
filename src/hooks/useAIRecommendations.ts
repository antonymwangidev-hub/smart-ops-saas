import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AIRecommendation } from "@/components/AIRecommendationCard";

export function useAIRecommendations() {
  const [recommendation, setRecommendation] = useState<AIRecommendation | null>(null);
  const [loading, setLoading] = useState(false);

  const getRecommendation = async (title: string, description: string, organizationId: string) => {
    setLoading(true);
    setRecommendation(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("ai-task-recommendations", {
        body: { title, description, organization_id: organizationId },
      });

      if (error) throw error;
      setRecommendation(data as AIRecommendation);
    } catch (err) {
      console.error("AI recommendation error:", err);
    } finally {
      setLoading(false);
    }
  };

  const dismiss = () => setRecommendation(null);

  return { recommendation, loading, getRecommendation, dismiss, setRecommendation };
}
