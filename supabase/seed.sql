-- ============================================================================
-- JobRadar seed. Run AFTER 0001_init.sql.
--   1. The `sources` block can run immediately.
--   2. The `skills_profile` block needs your real OWNER_USER_ID — replace the
--      placeholder UUID after your first magic-link sign-in (README step 10).
-- Because `default auth.uid()` is NULL in the SQL Editor / service role, the
-- profile insert MUST pass owner_id explicitly (a NULL PK insert fails).
-- ============================================================================

-- 1) Job sources -------------------------------------------------------------
insert into sources (slug, kind, display_name, base_url, enabled) values
  ('adzuna',     'aggregator', 'Adzuna',     'https://api.adzuna.com/v1/api/jobs/us', true),
  ('themuse',    'aggregator', 'The Muse',   'https://www.themuse.com/api/public/jobs', true),
  ('remotive',   'aggregator', 'Remotive',   'https://remotive.com/api/remote-jobs', true),
  ('remoteok',   'aggregator', 'RemoteOK',   'https://remoteok.com/api', true),
  ('greenhouse', 'ats',        'Greenhouse', 'https://boards-api.greenhouse.io/v1/boards', true),
  ('lever',      'ats',        'Lever',      'https://api.lever.co/v0/postings', true),
  ('ashby',      'ats',        'Ashby',      'https://api.ashbyhq.com/posting-api/job-board', true)
on conflict (slug) do nothing;

-- 2) Owner skills profile ----------------------------------------------------
-- Replace '00000000-0000-0000-0000-000000000000' with your OWNER_USER_ID, then
-- run. The scraper fills `embedding`/`profile_hash` on its next run; the app's
-- Skills page lets you edit `skills` / `resume_text` afterward.
insert into skills_profile
  (owner_id, headline, summary, skills, target_roles, experience_level, years_experience, open_to_relocate, resume_text)
values (
  '00000000-0000-0000-0000-000000000000',
  'Early-career AI/ML Engineer',
  'AI Engineer focused on production LLM systems — RAG, multi-agent orchestration, agent memory. M.S. CS candidate.',
  '[
    {"skill":"Python","aliases":["py"],"weight":1.0,"category":"Languages"},
    {"skill":"SQL","aliases":[],"weight":1.0,"category":"Languages"},
    {"skill":"TypeScript","aliases":["ts","javascript","js"],"weight":1.0,"category":"Languages"},
    {"skill":"OpenAI API","aliases":["gpt","openai"],"weight":1.0,"category":"LLM-AI"},
    {"skill":"Anthropic API","aliases":["claude","anthropic"],"weight":1.0,"category":"LLM-AI"},
    {"skill":"Hugging Face Transformers","aliases":["hf","transformers"],"weight":1.0,"category":"LLM-AI"},
    {"skill":"LangChain","aliases":[],"weight":1.0,"category":"LLM-AI"},
    {"skill":"LangGraph","aliases":[],"weight":1.0,"category":"LLM-AI"},
    {"skill":"CrewAI","aliases":[],"weight":1.0,"category":"LLM-AI"},
    {"skill":"vLLM","aliases":[],"weight":1.0,"category":"LLM-AI"},
    {"skill":"RAG","aliases":["retrieval augmented generation","retrieval-augmented"],"weight":1.0,"category":"LLM-AI"},
    {"skill":"Prompt Engineering","aliases":["prompting"],"weight":1.0,"category":"LLM-AI"},
    {"skill":"Fine-tuning","aliases":["lora","qlora","peft"],"weight":1.0,"category":"LLM-AI"},
    {"skill":"Agent Orchestration","aliases":["agents","multi-agent","tool calling","function calling"],"weight":1.0,"category":"LLM-AI"},
    {"skill":"PyTorch","aliases":["torch"],"weight":1.0,"category":"ML-DL"},
    {"skill":"TensorFlow","aliases":["tf","keras"],"weight":1.0,"category":"ML-DL"},
    {"skill":"Docker","aliases":["containers"],"weight":0.8,"category":"MLOps-Cloud"},
    {"skill":"Kubernetes","aliases":["k8s"],"weight":0.8,"category":"MLOps-Cloud"},
    {"skill":"AWS","aliases":["s3","ec2","sagemaker","bedrock"],"weight":0.8,"category":"MLOps-Cloud"},
    {"skill":"GCP","aliases":["google cloud"],"weight":0.8,"category":"MLOps-Cloud"},
    {"skill":"FastAPI","aliases":[],"weight":0.8,"category":"MLOps-Cloud"},
    {"skill":"REST APIs","aliases":["rest","api"],"weight":0.8,"category":"MLOps-Cloud"},
    {"skill":"CI/CD","aliases":["github actions","ci"],"weight":0.8,"category":"MLOps-Cloud"},
    {"skill":"Pinecone","aliases":[],"weight":0.8,"category":"Vector-DBs"},
    {"skill":"Qdrant","aliases":[],"weight":0.8,"category":"Vector-DBs"},
    {"skill":"FAISS","aliases":[],"weight":0.8,"category":"Vector-DBs"},
    {"skill":"Chroma","aliases":["chromadb"],"weight":0.8,"category":"Vector-DBs"},
    {"skill":"scikit-learn","aliases":["sklearn"],"weight":0.8,"category":"ML-DL"},
    {"skill":"NumPy","aliases":["numpy"],"weight":0.8,"category":"ML-DL"},
    {"skill":"pandas","aliases":[],"weight":0.8,"category":"ML-DL"},
    {"skill":"LLM Evaluation","aliases":["ragas","deepeval","eval"],"weight":0.8,"category":"LLM-AI"},
    {"skill":"Financial NLP","aliases":["finbert","fingpt","bloomberggpt"],"weight":0.4,"category":"Domain"},
    {"skill":"Computer Forensics","aliases":["autopsy","sleuth kit","kali"],"weight":0.4,"category":"Domain"},
    {"skill":"Time-series / LSTM","aliases":["lstm","forecasting"],"weight":0.4,"category":"ML-DL"}
  ]'::jsonb,
  '{Software Engineer,ML Engineer,AI Engineer,Forward Deployed Engineer}',
  'mid',
  1.0,
  true,
  'Vineeth Reddy Kodakandla — AI Engineer specializing in production LLM systems: RAG pipelines, multi-agent orchestration, agent memory. M.S. Computer Science candidate (Texas A&M Corpus Christi). Built ANANTA (local-first autonomous AI OS, ~120K LOC Python/FastAPI, 5-layer memory, local Llama 3.3 70B, MCP servers), Edith (multi-agent financial AI platform with LangGraph/CrewAI/Mem0, RAG, Reflexion self-review), PathwiseAI (LSTM SD-WAN SLA prediction, FastAPI + React/TypeScript). Skills: Python, SQL, TypeScript, OpenAI/Anthropic APIs, Hugging Face, LangChain, LangGraph, CrewAI, vLLM, RAG, prompt engineering, LoRA/QLoRA fine-tuning, agent orchestration, PyTorch, TensorFlow, Docker, Kubernetes, AWS, GCP, FastAPI, Pinecone, Qdrant, FAISS, Chroma. Graduate Research Assistant in Computer Forensics / Network Security. Certified: Building with the Claude API (Anthropic).'
)
on conflict (owner_id) do nothing;
