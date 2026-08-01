import type { TeacherCharacterRecord } from '@/features/teacher-config/types/character';
import type { TeacherLessonRecord } from '@/features/teacher-config/types/lesson';

export type StudentRuntimeConfig = {
  activeCharacter: TeacherCharacterRecord;
  activeLesson: TeacherLessonRecord;
  ownerId: string;
  publishedAt: string;
};
