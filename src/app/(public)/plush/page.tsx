import { RealtimeStudentSessionShell } from '@/components/student/realtime-student-session-shell';
import { StudentSessionShell } from '@/components/student/student-session-shell';
import { getVoiceMode } from '@/features/realtime/realtimeConfig';

export default function PlushPage() {
  return getVoiceMode() === 'legacy' ? (
    <StudentSessionShell />
  ) : (
    <RealtimeStudentSessionShell surface="plush" />
  );
}
