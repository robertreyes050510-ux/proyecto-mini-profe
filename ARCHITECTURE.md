# Proyecto Mini Profe - Arquitectura Base

## 1. Vision del producto

`Proyecto Mini Profe` es una aplicacion web ejecutada en un telefono Android integrado dentro de un peluche interactivo. El estudiante habla con el personaje y recibe respuestas breves, siempre en espanol, alineadas con una leccion configurada por el profesor.

No es un chat general. Es un asistente educativo con voz, limites pedagogicos estrictos y control curricular desde un panel del profesor.

## 2. Objetivos funcionales

### Flujo principal del estudiante

1. El sistema espera la palabra de activacion, por ejemplo `Hola Paco`.
2. Detecta la activacion y entra en modo escucha.
3. Convierte voz a texto.
4. Envia la transcripcion y el contexto de la leccion a OpenAI.
5. Recibe una respuesta en espanol y validada por reglas.
6. Reproduce la respuesta con voz natural.
7. Regresa al estado de espera.

### Reglas de comportamiento del personaje

- Responder solo en espanol.
- Nunca traducir al ingles.
- Si el alumno habla ingles, responder exactamente o casi exactamente:
  `Solo hablo espanol. Intentalo otra vez.`
- Mantener respuestas cortas.
- Maximo dos oraciones.
- Solo una pregunta a la vez.
- Mantenerse dentro del tema, objetivo y vocabulario permitido de la leccion.
- Corregir con tono positivo.

## 3. Stack tecnico

- `Next.js` con App Router
- `TypeScript`
- `Tailwind CSS`
- `Firebase Authentication`
- `Firestore`
- `OpenAI API`
- Web Speech / audio browser APIs para captura y reproduccion

## 4. Principios de arquitectura

- Modularidad por dominio, no por tipo de archivo solamente.
- Separacion fuerte entre `UI`, `logica de sesion`, `reglas pedagogicas`, `infraestructura` y `persistencia`.
- El cliente no habla directamente con OpenAI.
- Toda llamada sensible a IA pasa por rutas servidoras de Next.js.
- El prompt del modelo se genera desde reglas estructuradas, no desde texto libre disperso.
- Debe existir una capa de validacion posterior al modelo para asegurar que la respuesta cumpla las reglas.

## 5. Arquitectura general

## 5.1 Capas

### Capa 1: Presentacion

Responsable de la experiencia visual y de audio.

Submodulos:

- `student-app`
- `teacher-panel`
- `shared-ui`

### Capa 2: Orquestacion de conversacion

Coordina estados del flujo de voz.

Submodulos:

- `wake-word-orchestrator`
- `speech-session-manager`
- `turn-controller`
- `audio-playback-manager`

### Capa 3: Inteligencia educativa

Aplica las reglas didacticas y define el contexto enviado al modelo.

Submodulos:

- `lesson-context-builder`
- `pedagogy-rules-engine`
- `allowed-vocabulary-guard`
- `response-validator`
- `language-policy-enforcer`

### Capa 4: Integracion IA

Habla con OpenAI desde el servidor.

Submodulos:

- `openai-client`
- `prompt-builder`
- `response-normalizer`

### Capa 5: Datos y autenticacion

Persistencia y acceso seguro.

Submodulos:

- `firebase-auth`
- `firestore-repositories`
- `session-store`
- `settings-store`

## 5.2 Diagrama de alto nivel

```text
Estudiante
  -> Wake Word Detector
  -> Speech To Text
  -> Turn Controller
  -> Lesson Context Builder
  -> OpenAI Server Route
  -> Response Validator
  -> Text To Speech
  -> Espera de nuevo

Profesor
  -> Teacher Panel
  -> Firebase Auth
  -> Firestore
  -> Configuracion de personaje y leccion
```

## 6. Modulos principales

## 6.1 Aplicacion del estudiante

Ruta sugerida: `/student`

Responsabilidades:

- Escuchar la palabra de activacion.
- Mostrar estado actual: espera, escuchando, pensando, hablando.
- Capturar audio del alumno.
- Mostrar subtitulos simples opcionales.
- Reproducir respuesta con voz.
- Reiniciar el ciclo de escucha.

Estados recomendados:

- `idle`
- `wake_detected`
- `listening`
- `transcribing`
- `thinking`
- `speaking`
- `error`

## 6.2 Panel del profesor

Ruta sugerida: `/teacher`

Responsabilidades:

- Iniciar sesion.
- Crear y editar perfiles de personaje.
- Crear lecciones.
- Configurar:
  - nombre del personaje
  - nivel
  - tema
  - vocabulario permitido
  - objetivo
  - personalidad
  - velocidad de voz
  - longitud maxima de respuesta
- Activar una leccion para un dispositivo o sesion.
- Revisar historial basico de interacciones.

## 6.3 Motor de reglas pedagogicas

Es el nucleo que diferencia esta app de un chat generico.

Responsabilidades:

- Convertir la configuracion del profesor en reglas operativas.
- Limitar el vocabulario y tema.
- Forzar tono positivo.
- Forzar longitud maxima.
- Permitir una sola pregunta por respuesta.
- Detectar ingles o mezcla de idiomas.

Salida esperada:

- Un `system prompt` estructurado.
- Un conjunto de validaciones posteriores.

## 6.4 Orquestador de voz

Responsabilidades:

- Manejar activacion.
- Iniciar y detener captura.
- Coordinar STT y TTS.
- Evitar que el microfono capture la voz del propio personaje mientras habla.

Regla importante:

Mientras el personaje este hablando, la escucha activa debe estar suspendida para evitar retroalimentacion.

## 6.5 Backend de IA

Responsabilidades:

- Recibir texto del alumno y contexto de leccion.
- Construir prompt seguro.
- Enviar la peticion a OpenAI.
- Validar la salida.
- Devolver texto final listo para TTS.

Nunca debe vivir en el cliente:

- API key de OpenAI
- Logica sensible de enforcement
- Reglas maestras de seguridad

## 7. Flujo de solicitud-respuesta

## 7.1 Secuencia ideal

1. `Wake word detector` detecta `Hola Paco`.
2. `Speech session manager` cambia a `listening`.
3. Se captura la frase del alumno.
4. `Speech-to-text` devuelve texto.
5. `Language policy enforcer` detecta si hablo ingles.
6. Si hablo ingles:
   - se responde `Solo hablo espanol. Intentalo otra vez.`
   - no se llama al modelo, o se llama solo si queremos auditoria
7. Si hablo espanol:
   - `Lesson context builder` prepara contexto
   - `Prompt builder` genera instrucciones
   - `OpenAI client` obtiene respuesta
   - `Response validator` verifica cumplimiento
8. `Audio playback manager` reproduce la respuesta.
9. El sistema vuelve a `idle`.

## 7.2 Secuencia de validacion

Despues de recibir respuesta del modelo:

1. Verificar idioma: debe ser espanol.
2. Verificar longitud: maximo de oraciones permitido.
3. Verificar numero de preguntas: maximo una.
4. Verificar vocabulario prohibido o fuera de tema.
5. Si falla:
   - aplicar una version de respaldo segura
   - registrar el evento

Respuesta de respaldo sugerida:

`Vamos a practicar en espanol. Intentalo otra vez.`

## 8. Modelo de datos en Firestore

## 8.1 Colecciones principales

### `users`

Profesores o administradores.

Campos sugeridos:

- `uid`
- `email`
- `displayName`
- `role`
- `createdAt`

### `characters`

Configuracion reutilizable de personajes.

Campos sugeridos:

- `id`
- `ownerId`
- `name`
- `personality`
- `voiceId`
- `voiceSpeed`
- `wakePhrase`
- `createdAt`
- `updatedAt`

### `lessons`

Configuracion academica.

Campos sugeridos:

- `id`
- `ownerId`
- `gradeLevel`
- `topic`
- `objective`
- `allowedVocabulary`
- `maxResponseSentences`
- `maxQuestionsPerTurn`
- `englishFallbackText`
- `isActive`
- `createdAt`
- `updatedAt`

### `deviceProfiles`

Representa un telefono/peluche instalado.

Campos sugeridos:

- `id`
- `label`
- `assignedCharacterId`
- `assignedLessonId`
- `schoolId`
- `lastSeenAt`
- `status`

### `conversationSessions`

Sesiones de uso.

Campos sugeridos:

- `id`
- `deviceProfileId`
- `lessonId`
- `startedAt`
- `endedAt`
- `status`

### `conversationTurns`

Turnos individuales.

Campos sugeridos:

- `id`
- `sessionId`
- `studentTranscript`
- `detectedLanguage`
- `assistantResponse`
- `usedFallback`
- `validationFlags`
- `createdAt`

## 8.2 Relacion sugerida

```text
users -> characters
users -> lessons
deviceProfiles -> characters
deviceProfiles -> lessons
conversationSessions -> conversationTurns
```

## 9. Estructura de carpetas recomendada

```text
proyecto-mini-profe/
  src/
    app/
      (public)/
        student/page.tsx
      (protected)/
        teacher/page.tsx
        teacher/characters/page.tsx
        teacher/lessons/page.tsx
        teacher/devices/page.tsx
      api/
        auth/
        conversation/route.ts
        tts/route.ts
        stt/route.ts
    components/
      student/
      teacher/
      shared/
    features/
      conversation/
        components/
        hooks/
        services/
        state/
        types/
      teacher-config/
        components/
        services/
        state/
        schemas/
      audio/
        hooks/
        services/
        types/
      lesson-engine/
        services/
        validators/
        prompts/
        types/
    lib/
      firebase/
        client.ts
        admin.ts
        auth.ts
      openai/
        client.ts
      utils/
    server/
      conversation/
      lessons/
      validators/
      repositories/
    types/
    styles/
  firestore.rules
  firestore.indexes.json
  tailwind.config.ts
  next.config.ts
```

## 10. Contratos de dominio recomendados

## 10.1 `CharacterConfig`

```ts
type CharacterConfig = {
  id: string;
  name: string;
  personality: string;
  voiceId: string;
  voiceSpeed: number;
  wakePhrase: string;
};
```

## 10.2 `LessonConfig`

```ts
type LessonConfig = {
  id: string;
  gradeLevel: 'Pre-K' | 'K' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8';
  topic: string;
  objective: string;
  allowedVocabulary: string[];
  maxResponseSentences: number;
  maxQuestionsPerTurn: number;
  englishFallbackText: string;
};
```

## 10.3 `ConversationTurnInput`

```ts
type ConversationTurnInput = {
  sessionId: string;
  studentTranscript: string;
  character: CharacterConfig;
  lesson: LessonConfig;
};
```

## 10.4 `ConversationTurnResult`

```ts
type ConversationTurnResult = {
  text: string;
  detectedLanguage: 'es' | 'en' | 'mixed' | 'unknown';
  usedFallback: boolean;
  validationFlags: string[];
};
```

## 11. Prompting strategy

## 11.1 System prompt

Debe construirse dinamicamente usando:

- nombre del personaje
- nivel escolar
- tema
- vocabulario permitido
- objetivo de la leccion
- personalidad
- reglas de idioma
- longitud maxima

## 11.2 Reglas duras del prompt

- Siempre responde en espanol.
- Nunca respondas en ingles.
- Si el estudiante usa ingles, responde con el fallback definido.
- Usa solo vocabulario permitido o variaciones minimas indispensables para modelar la correccion.
- No hagas mas de una pregunta.
- No escribas mas de dos oraciones.
- Corrige de manera amable y positiva.

## 11.3 Validacion posterior al prompt

El prompt no es suficiente. Tambien debe haber validacion de salida:

- detector simple de ingles
- contador de oraciones
- contador de signos de pregunta
- chequeo de vocabulario fuera de lista

## 12. Autenticacion y autorizacion

### Firebase Authentication

Uso inicial:

- Profesores con email/password

Roles sugeridos a futuro:

- `teacher`
- `admin`

Reglas:

- El panel del profesor requiere autenticacion.
- La app del estudiante puede operar sin login si el dispositivo ya esta asignado a una leccion activa.

## 13. Consideraciones clave de voz

## 13.1 Deteccion de palabra de activacion

En una app web pura, la deteccion continua de wake word puede ser limitada por navegador, permisos de microfono, suspension en segundo plano y politicas de ahorro de bateria.

Por eso recomiendo dividirlo en fases:

### Fase 1

- Activacion semisimulada:
  - boton grande de activacion
  - o escucha corta iniciada por gesto del usuario

### Fase 2

- Wake word real en Android WebView o capa nativa complementaria

Conclusion:

La arquitectura debe dejar el `wake-word-orchestrator` desacoplado para poder empezar en web y luego reemplazarlo por una implementacion mas robusta.

## 13.2 Speech to text

Opciones:

- API del navegador si el entorno Android la soporta bien
- Servicio remoto de STT desde una ruta segura

Recomendacion de arquitectura:

- definir una interfaz `SpeechRecognizer`
- permitir cambiar implementacion sin tocar el resto del sistema

## 13.3 Text to speech

Opciones:

- Web Speech Synthesis del navegador
- TTS remoto con voz mas natural

Recomendacion:

- definir una interfaz `SpeechSynthesizer`
- empezar simple y luego sustituir por voces de mayor calidad

## 14. Seguridad

- API keys solo en servidor.
- Firestore rules estrictas por `ownerId`.
- Sanitizar texto antes de registrar.
- Limitar longitud de entrada del alumno.
- Registrar fallos de validacion.
- Preparar rate limiting en rutas `api/conversation`.

## 15. Observabilidad

Registrar:

- latencia de transcripcion
- latencia de OpenAI
- latencia de TTS
- porcentaje de respuestas fallback
- frecuencia de deteccion de ingles
- errores por dispositivo

Esto sera muy util para pulir la experiencia del peluche real.

## 16. Roadmap recomendado de construccion

### Paso 1

Scaffold del proyecto:

- Next.js
- TypeScript
- Tailwind
- Firebase base

### Paso 2

Modelo de datos y panel del profesor:

- auth
- CRUD de personajes
- CRUD de lecciones

### Paso 3

Motor pedagogico:

- prompt builder
- language policy
- response validator

### Paso 4

Experiencia del estudiante sin wake word real:

- boton para iniciar escucha
- STT
- llamada a OpenAI
- TTS

### Paso 5

Persistencia de sesiones y turnos

### Paso 6

Wake word desacoplado y mejoras Android

## 17. Decision recomendada para empezar

La mejor primera version no deberia intentar resolver el wake word continuo desde el dia uno.

Debemos empezar con:

- panel del profesor
- configuracion de personaje y leccion
- motor de restricciones
- flujo estudiante con boton de hablar

Eso nos permite validar el nucleo educativo antes de entrar en las limitaciones de audio continuo en Android web.

## 18. Primera entrega tecnica sugerida

Modulo 1:

- scaffold Next.js + TypeScript + Tailwind
- estructura de carpetas
- Firebase configurado
- layout base
- rutas `/student` y `/teacher`

Modulo 2:

- autenticacion profesor
- esquema Firestore

Modulo 3:

- creador de lecciones
- creador de personajes

Modulo 4:

- motor de conversacion restringida

## 19. Preguntas tecnicas ya resueltas por esta arquitectura

- Como evitar que sea un chat generico:
  - con `lesson-engine`, `allowed-vocabulary-guard` y `response-validator`
- Como mantener solo espanol:
  - con `language-policy-enforcer` mas fallback
- Como permitir crecimiento:
  - interfaces para STT, TTS y wake word
- Como mantenerlo modular:
  - carpetas por dominio y capas claras

## 20. Siguiente paso recomendado

Construir el `Modulo 1`:

- inicializar app Next.js
- instalar Tailwind
- preparar Firebase
- crear estructura base de carpetas
- dejar el esqueleto de `/student` y `/teacher`
