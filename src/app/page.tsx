import Link from 'next/link';

const cards = [
  {
    href: '/student',
    title: 'Modo Estudiante',
    description:
      'Interfaz de voz para el peluche interactivo, con estados claros para escuchar, pensar y hablar.',
  },
  {
    href: '/teacher',
    title: 'Panel del Profesor',
    description:
      'Centro de configuracion para personaje, nivel, vocabulario permitido y objetivos de la leccion.',
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-hero-glow px-6 py-10 text-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <section className="overflow-hidden rounded-[2rem] bg-white/75 p-8 shadow-card backdrop-blur md:p-12">
          <div className="grid gap-10 md:grid-cols-[1.2fr_0.8fr] md:items-center">
            <div className="space-y-6">
              <span className="inline-flex rounded-full bg-coral/15 px-4 py-2 text-sm font-bold uppercase tracking-[0.2em] text-coral">
                Modulo 1
              </span>
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-extrabold leading-tight md:text-6xl">
                  El cerebro web de un peluche que ensena espanol con voz.
                </h1>
                <p className="max-w-2xl text-lg leading-8 text-ink/75">
                  Esta base prepara dos mundos: la experiencia del estudiante y el
                  panel del profesor. La logica de voz, OpenAI y Firebase quedara
                  conectada en modulos separados para evitar un chat generico.
                </p>
              </div>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/student"
                  className="rounded-full bg-coral px-6 py-3 font-bold text-white transition hover:translate-y-[-1px] hover:bg-[#ef7444]"
                >
                  Abrir modo estudiante
                </Link>
                <Link
                  href="/teacher"
                  className="rounded-full border border-ink/10 bg-white px-6 py-3 font-bold text-ink transition hover:border-coral hover:text-coral"
                >
                  Abrir panel del profesor
                </Link>
              </div>
            </div>

            <div className="rounded-[2rem] bg-ink p-6 text-white shadow-card">
              <div className="space-y-4">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-sky">
                  Enfoque del sistema
                </p>
                <ul className="space-y-3 text-base leading-7 text-white/85">
                  <li>Solo espanol y respuestas breves.</li>
                  <li>Lecciones controladas por vocabulario permitido.</li>
                  <li>Arquitectura modular con Next.js, TypeScript y Firebase.</li>
                  <li>Preparado para evolucionar hacia wake word real.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-[2rem] bg-white p-8 shadow-card transition hover:translate-y-[-2px]"
            >
              <div className="space-y-4">
                <h2 className="text-2xl font-extrabold group-hover:text-coral">
                  {card.title}
                </h2>
                <p className="leading-7 text-ink/70">{card.description}</p>
                <span className="inline-flex font-bold text-coral">
                  Entrar ahora
                </span>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
