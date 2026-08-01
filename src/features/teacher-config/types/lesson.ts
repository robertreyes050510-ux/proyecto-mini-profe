import type { LessonConfig } from '@/types/domain';

export type TeacherLessonRecord = LessonConfig & {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type LessonDraft = Omit<
  TeacherLessonRecord,
  'id' | 'ownerId' | 'createdAt' | 'updatedAt'
>;
