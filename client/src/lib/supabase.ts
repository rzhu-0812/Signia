import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function submitVote(word: string, isCorrect: boolean) {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase credentials missing. Vote not submitted.");
    return;
  }

  const { error } = await supabase.from("translations_feedback").insert([
    { 
      word, 
      is_correct: isCorrect,
      timestamp: new Date().toISOString()
    }
  ]);

  if (error) {
    console.error("Error submitting vote:", error);
    throw error;
  }
}
