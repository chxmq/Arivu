// Consent enforced at the data layer (deck slides 12 & 18).
// OPEN / COMMUNITY / EMBARGOED is not a label — it gates what a viewer can
// actually see and play.
import { KnowledgeEntry, ViewerRole } from '@/types';

export type Visibility = {
  // Whether the transcript + audio may be shown to this viewer.
  showContent: boolean;
  // Whether the record is locked (encrypted / multi-key release).
  locked: boolean;
  // Placeholder text shown when content is withheld.
  reason: string;
};

export function resolveVisibility(
  entry: KnowledgeEntry,
  role: ViewerRole
): Visibility {
  switch (entry.consent_level) {
    case 'OPEN':
      return { showContent: true, locked: false, reason: '' };
    case 'COMMUNITY_ONLY':
      if (role === 'BMC' || role === 'ZSI') {
        return { showContent: true, locked: false, reason: '' };
      }
      return {
        showContent: false,
        locked: true,
        reason:
          'Community-only knowledge. Visible to the originating community and ' +
          'their BMC. Outsiders see this placeholder until ABS consent is signed.',
      };
    case 'EMBARGOED':
      return {
        showContent: false,
        locked: true,
        reason:
          'Embargoed — sacred or ritual knowledge marked not-for-diffusion. ' +
          'Stored encrypted; multi-key release only.',
      };
    default:
      return { showContent: true, locked: false, reason: '' };
  }
}
