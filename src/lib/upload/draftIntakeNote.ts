export const DRAFT_INTAKE_NOTE_KEY = "runmate:draftIntakeNote";

export type DraftIntakeNote = {
  type: "pain" | "sick";
  text: string;
};

export function readDraftIntakeNote(expectedType: "pain" | "sick"): string | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_INTAKE_NOTE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DRAFT_INTAKE_NOTE_KEY);
    const draft = JSON.parse(raw) as DraftIntakeNote;
    if (draft.type !== expectedType || !draft.text) return null;
    return draft.text;
  } catch {
    return null;
  }
}
