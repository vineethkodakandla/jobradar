import { SkillsEditor } from "@/components/skills/skills-editor";

// Skills profile editor — drives fit scoring.
export default function SkillsPage() {
  return (
    <div className="h-full overflow-y-auto scrollbar-thin">
      <SkillsEditor />
    </div>
  );
}
