// US state options for the location filter (postal code -> name).
export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "DC", name: "Washington, D.C." },
];

export function stateName(code: string): string {
  return US_STATES.find((s) => s.code === code)?.name ?? code;
}

// Known job sources (slugs match the `sources.slug` column / src[] filter).
export const SOURCE_OPTIONS: { slug: string; label: string }[] = [
  { slug: "adzuna", label: "Adzuna" },
  { slug: "themuse", label: "The Muse" },
  { slug: "remotive", label: "Remotive" },
  { slug: "remoteok", label: "RemoteOK" },
  { slug: "greenhouse", label: "Greenhouse" },
  { slug: "lever", label: "Lever" },
  { slug: "ashby", label: "Ashby" },
];

// Role quick-pick chips map to keyword search terms.
export const ROLE_QUICK_PICKS: { label: string; q: string }[] = [
  { label: "SWE", q: "software engineer" },
  { label: "ML", q: "machine learning engineer" },
  { label: "AI", q: "ai engineer" },
  { label: "FDE", q: "forward deployed engineer" },
];

export const EXPERIENCE_OPTIONS: { value: string; label: string }[] = [
  { value: "intern", label: "Internship" },
  { value: "new_grad", label: "New grad" },
  { value: "entry", label: "Entry" },
  { value: "mid", label: "Mid (1–3 yr)" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead / Staff" },
];

export const WORKTYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
];

export const DATE_POSTED_OPTIONS: { value: string; label: string }[] = [
  { value: "24h", label: "Past 24 hours" },
  { value: "3d", label: "Past 3 days" },
  { value: "7d", label: "Past week" },
  { value: "14d", label: "Past 2 weeks" },
  { value: "30d", label: "Past month" },
  { value: "any", label: "Any time" },
];
