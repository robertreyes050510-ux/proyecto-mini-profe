import type { CharacterConfig } from '@/types/domain';

export type TeacherCharacterRecord = CharacterConfig & {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type CharacterDraft = Omit<
  TeacherCharacterRecord,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
>;
