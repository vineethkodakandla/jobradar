import type { ProfileSkill } from "@/lib/types";

// ============================================================================
// Built-in client-side skill taxonomy. Drives the AddSkillCombobox autocomplete
// and the ResumePasteSeeder keyword match. Categories + seed weights follow the
// build prompt §2 + §9 (Languages / LLM-AI / ML-DL / Vector DBs / MLOps-Cloud /
// Domain). `aliases` enable alias-aware matching (k8s=kubernetes, etc.).
// ============================================================================

export const SKILL_CATEGORIES = [
  "Languages",
  "LLM-AI",
  "ML-DL",
  "Vector DBs",
  "MLOps-Cloud",
  "Domain",
] as const;

export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

export interface TaxonomyEntry {
  skill: string;
  aliases: string[];
  weight: number;
  category: SkillCategory;
}

export const SKILL_TAXONOMY: TaxonomyEntry[] = [
  // --- Languages ---
  { skill: "Python", aliases: ["py"], weight: 1.0, category: "Languages" },
  { skill: "SQL", aliases: ["postgres", "postgresql", "mysql"], weight: 1.0, category: "Languages" },
  { skill: "TypeScript", aliases: ["ts"], weight: 1.0, category: "Languages" },
  { skill: "JavaScript", aliases: ["js", "node", "nodejs"], weight: 1.0, category: "Languages" },
  { skill: "Java", aliases: [], weight: 0.6, category: "Languages" },
  { skill: "Go", aliases: ["golang"], weight: 0.6, category: "Languages" },
  { skill: "C++", aliases: ["cpp"], weight: 0.6, category: "Languages" },
  { skill: "Rust", aliases: [], weight: 0.5, category: "Languages" },

  // --- LLM-AI ---
  { skill: "OpenAI API", aliases: ["openai", "gpt", "gpt-4", "chatgpt"], weight: 1.0, category: "LLM-AI" },
  { skill: "Anthropic / Claude API", aliases: ["anthropic", "claude"], weight: 1.0, category: "LLM-AI" },
  { skill: "Hugging Face Transformers", aliases: ["hugging face", "huggingface", "hf", "transformers"], weight: 1.0, category: "LLM-AI" },
  { skill: "LangChain", aliases: ["langchain"], weight: 1.0, category: "LLM-AI" },
  { skill: "LangGraph", aliases: ["langgraph"], weight: 1.0, category: "LLM-AI" },
  { skill: "CrewAI", aliases: ["crew ai"], weight: 1.0, category: "LLM-AI" },
  { skill: "vLLM", aliases: ["vllm"], weight: 1.0, category: "LLM-AI" },
  { skill: "RAG", aliases: ["retrieval augmented generation", "retrieval-augmented"], weight: 1.0, category: "LLM-AI" },
  { skill: "Prompt engineering", aliases: ["prompting"], weight: 1.0, category: "LLM-AI" },
  { skill: "LoRA / QLoRA fine-tuning", aliases: ["lora", "qlora", "fine-tuning", "finetuning"], weight: 1.0, category: "LLM-AI" },
  { skill: "Agent orchestration", aliases: ["agents", "agentic", "multi-agent"], weight: 1.0, category: "LLM-AI" },
  { skill: "Function / tool calling", aliases: ["tool calling", "function calling", "tool use"], weight: 1.0, category: "LLM-AI" },
  { skill: "LLM evaluation", aliases: ["ragas", "deepeval", "llm eval", "evals"], weight: 0.8, category: "LLM-AI" },

  // --- ML-DL ---
  { skill: "PyTorch", aliases: ["torch"], weight: 1.0, category: "ML-DL" },
  { skill: "TensorFlow", aliases: ["tf", "keras"], weight: 1.0, category: "ML-DL" },
  { skill: "scikit-learn", aliases: ["sklearn", "scikit learn"], weight: 0.8, category: "ML-DL" },
  { skill: "NumPy", aliases: ["numpy"], weight: 0.8, category: "ML-DL" },
  { skill: "pandas", aliases: ["pandas"], weight: 0.8, category: "ML-DL" },
  { skill: "LSTM / time-series", aliases: ["lstm", "time series", "time-series", "rnn"], weight: 0.4, category: "ML-DL" },

  // --- Vector DBs ---
  { skill: "Pinecone", aliases: ["pinecone"], weight: 0.8, category: "Vector DBs" },
  { skill: "Qdrant", aliases: ["qdrant"], weight: 0.8, category: "Vector DBs" },
  { skill: "FAISS", aliases: ["faiss"], weight: 0.8, category: "Vector DBs" },
  { skill: "Chroma", aliases: ["chromadb", "chroma db"], weight: 0.8, category: "Vector DBs" },
  { skill: "pgvector", aliases: ["pg vector"], weight: 0.6, category: "Vector DBs" },

  // --- MLOps-Cloud ---
  { skill: "Docker", aliases: ["docker"], weight: 0.8, category: "MLOps-Cloud" },
  { skill: "Kubernetes", aliases: ["k8s", "kube"], weight: 0.8, category: "MLOps-Cloud" },
  { skill: "AWS", aliases: ["amazon web services", "s3", "ec2", "sagemaker", "bedrock"], weight: 0.8, category: "MLOps-Cloud" },
  { skill: "GCP", aliases: ["google cloud", "vertex ai"], weight: 0.8, category: "MLOps-Cloud" },
  { skill: "FastAPI", aliases: ["fastapi"], weight: 0.8, category: "MLOps-Cloud" },
  { skill: "REST APIs", aliases: ["rest", "restful"], weight: 0.8, category: "MLOps-Cloud" },
  { skill: "CI/CD", aliases: ["cicd", "github actions", "gitlab ci"], weight: 0.8, category: "MLOps-Cloud" },
  { skill: "Model serving", aliases: ["model serving", "inference serving", "triton"], weight: 0.8, category: "MLOps-Cloud" },

  // --- Domain ---
  { skill: "Financial NLP", aliases: ["finbert", "fingpt", "bloomberggpt", "fintech nlp"], weight: 0.4, category: "Domain" },
  { skill: "Computer Forensics", aliases: ["autopsy", "sleuth kit", "kali", "forensics"], weight: 0.4, category: "Domain" },
  { skill: "Network Security", aliases: ["network security", "cybersecurity"], weight: 0.4, category: "Domain" },
];

/** Lowercased lookup of every skill name + alias -> taxonomy entry. */
const MATCH_INDEX: { needle: string; entry: TaxonomyEntry }[] = SKILL_TAXONOMY.flatMap(
  (entry) => [
    { needle: entry.skill.toLowerCase(), entry },
    ...entry.aliases.map((a) => ({ needle: a.toLowerCase(), entry })),
  ],
);

/** Escape a string for use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match resume text against the taxonomy. Returns a deduped, weight-seeded
 * ProfileSkill[] for each taxonomy entry whose name/alias appears as a word.
 */
export function matchResumeToSkills(resume: string): ProfileSkill[] {
  const text = resume.toLowerCase();
  const found = new Map<string, TaxonomyEntry>();

  for (const { needle, entry } of MATCH_INDEX) {
    if (found.has(entry.skill)) continue;
    // Word-ish boundary match (handles "c++", "ci/cd", multiword phrases).
    const re = new RegExp(`(^|[^a-z0-9+])${escapeRe(needle)}([^a-z0-9+]|$)`, "i");
    if (re.test(text)) found.set(entry.skill, entry);
  }

  return Array.from(found.values()).map((e) => ({
    skill: e.skill,
    aliases: e.aliases,
    weight: e.weight,
    category: e.category,
  }));
}

/** Taxonomy entries not already present in the profile, for autocomplete. */
export function taxonomySuggestions(
  query: string,
  existing: string[],
): TaxonomyEntry[] {
  const q = query.trim().toLowerCase();
  const have = new Set(existing.map((s) => s.toLowerCase()));
  return SKILL_TAXONOMY.filter((e) => {
    if (have.has(e.skill.toLowerCase())) return false;
    if (!q) return true;
    return (
      e.skill.toLowerCase().includes(q) ||
      e.aliases.some((a) => a.toLowerCase().includes(q))
    );
  }).slice(0, 8);
}
