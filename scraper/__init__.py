"""JobRadar scraper package.

The Python half of JobRadar: scrapes free job APIs + public ATS boards once
daily, normalizes/de-dupes into Supabase Postgres, and computes a $0 local
embedding fit-score against the owner's skills profile.

Run with:  python -m scraper.main   (from the repo root)
"""

__version__ = "1.0.0"
