'use client';

import { useEffect, useState } from 'react';
import { hasFirebaseClientConfig, getFirebaseProjectId } from '@/lib/firebase/config';
import { prepareTeacherAuthSession } from '@/lib/firebase/auth';

type Status = 'loading' | 'ready' | 'error';

export function FirebaseStatusCard() {
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Preparando Firebase Authentication...');

  useEffect(() => {
    async function bootstrap() {
      if (!hasFirebaseClientConfig()) {
        setStatus('error');
        setMessage('Faltan variables de entorno de Firebase.');
        return;
      }

      try {
        await prepareTeacherAuthSession();
        setStatus('ready');
        setMessage('Firebase Authentication esta listo para el panel del profesor.');
      } catch (error) {
        setStatus('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'No se pudo inicializar Firebase en el cliente.',
        );
      }
    }

    void bootstrap();
  }, []);

  return (
    <article className="rounded-[2rem] bg-ink p-6 text-white">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky">
        Estado de Firebase
      </p>
      <p className="mt-4 text-base leading-7 text-white/85">{message}</p>
      <div className="mt-6 grid gap-3 text-sm text-white/75">
        <div className="rounded-2xl bg-white/10 px-4 py-3">
          Proyecto: <span className="font-bold text-white">{getFirebaseProjectId()}</span>
        </div>
        <div className="rounded-2xl bg-white/10 px-4 py-3">
          Estado:{' '}
          <span className="font-bold text-white">
            {status === 'loading'
              ? 'Inicializando'
              : status === 'ready'
                ? 'Conectado'
                : 'Revisar configuracion'}
          </span>
        </div>
      </div>
    </article>
  );
}
