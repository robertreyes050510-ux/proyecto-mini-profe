# Proyecto Mini Profe - Migracion a Realtime Voice

Fecha: 2026-07-27

## 1. Decision de producto

La app actual funciona como un prototipo por etapas:

1. escucha en el navegador
2. transcribe con Web Speech
3. envia texto al servidor
4. OpenAI responde en texto
5. el navegador intenta leer la respuesta con su voz local

Eso permite validar reglas pedagogicas, pero no se siente como una conversacion fluida.

La migracion recomendada es cambiar la app del estudiante a una sesion de voz en tiempo real con OpenAI Realtime API y conservar el panel del profesor como cerebro pedagogico.

## 2. Por que migrar

### Problemas del modo actual

- el alumno tiene que apretar un boton o reiniciar turnos con demasiada frecuencia
- la escucha se corta por tiempos del navegador
- la voz de salida depende de `speechSynthesis`, que varia mucho entre navegadores
- la conversacion se siente fragmentada
- la logica de `wake word`, STT, texto, respuesta y TTS esta demasiado separada

### Ventajas de Realtime

- audio de entrada y salida en la misma sesion
- menor latencia
- mejor continuidad conversacional
- menos pegamento manual entre STT y TTS
- mas parecido a la experiencia de voz de ChatGPT

## 3. Base tecnica oficial

OpenAI documenta la Realtime API como una interfaz de baja latencia para audio y multimodalidad en tiempo real, con soporte para `WebRTC`, `WebSocket` y `SIP`.

Referencias oficiales:

- `Realtime API reference`: https://platform.openai.com/docs/api-reference/realtime?lang=javascript
- `gpt-realtime model`: https://developers.openai.com/api/docs/models/gpt-realtime
- `Introducing the Realtime API`: https://openai.com/index/introducing-the-realtime-api/

## 4. Lo que se conserva del proyecto actual

No vamos a tirar lo ya construido.

Se conserva:

- `/teacher`
- Firebase Authentication
- Firestore
- personajes
- lecciones
- configuracion activa publicada en `studentRuntime/default`
- reglas curriculares del profesor
- limites de idioma, objetivo, longitud y vocabulario

## 5. Lo que cambia

La ruta `/student` deja de ser:

`Web Speech STT -> texto -> Responses API -> speechSynthesis`

y pasa a ser:

`wake layer local -> session token server route -> WebRTC Realtime session -> audio bidireccional`

## 6. Nueva arquitectura

## 6.1 Capas

### Capa 1 - Panel del profesor

Sin grandes cambios funcionales.

Responsabilidades:

- definir personaje
- definir voz preferida
- definir tono y personalidad
- definir leccion activa
- publicar runtime para el peluche

### Capa 2 - Runtime del peluche

Nueva capa central.

Responsabilidades:

- cargar la configuracion activa publicada
- abrir la sesion realtime
- gestionar estados del peluche
- controlar apertura y cierre del microfono
- evitar que el peluche se escuche a si mismo

### Capa 3 - Session broker del servidor

Nuevo modulo.

Responsabilidades:

- leer Firestore
- construir instrucciones de sesion seguras
- pedir a OpenAI una sesion Realtime o credencial efimera
- devolver al cliente solo lo necesario para iniciar la conexion

### Capa 4 - Politica pedagogica

Se mantiene, pero cambia el punto de aplicacion.

Antes:

- se aplicaba por turno, sobre una llamada puntual de texto

Ahora:

- se aplica al crear o actualizar la sesion realtime
- tambien se puede reforzar al comienzo de cada turno si hace falta

## 6.2 Diagrama

```text
Profesor
  -> /teacher
  -> Firebase Auth
  -> Firestore
  -> studentRuntime/default

Estudiante / Peluche
  -> /student
  -> runtime loader
  -> local wake layer
  -> /api/realtime/session
  -> OpenAI Realtime API
  -> audio in / audio out

Servidor Next.js
  -> runtime config reader
  -> realtime session builder
  -> policy prompt builder
```

## 7. Flujo objetivo

## 7.1 Arranque

1. `/student` carga `studentRuntime/default`
2. obtiene:
   - personaje activo
   - leccion activa
   - voz preferida
   - frase de activacion y variantes
3. la app entra en `idle`

## 7.2 Apertura de sesion de voz

1. el cliente detecta `Hola Sasa` o una variante
2. llama a `/api/realtime/session`
3. el servidor:
   - lee el runtime publicado
   - genera instrucciones de sesion
   - configura voz, idioma y reglas
   - crea la sesion realtime
4. el cliente abre una conexion `WebRTC`
5. el alumno habla y recibe audio de vuelta

## 7.3 Conversacion

Mientras la sesion siga viva:

- el alumno puede seguir hablando sin recrear todo el pipeline
- el modelo conserva mejor continuidad
- la app solo controla:
  - estado visual
  - wake / re-wake
  - tiempo maximo de sesion
  - interrupcion manual

## 7.4 Cierre

La sesion se cierra cuando:

- pasa un tiempo maximo de inactividad
- el profesor cambia runtime y pedimos refresco
- el usuario toca `terminar`
- ocurre un error de red

## 8. Cambios concretos por archivo

## 8.1 Nuevos archivos propuestos

- `src/app/api/realtime/session/route.ts`
- `src/features/realtime/services/realtime-session-service.ts`
- `src/features/realtime/services/realtime-prompt-builder.ts`
- `src/features/realtime/types/realtime.ts`
- `src/features/realtime/hooks/use-realtime-student-session.ts`
- `src/features/realtime/utils/webrtc-client.ts`
- `src/features/realtime/utils/wake-phrase.ts`

## 8.2 Archivos actuales a conservar y adaptar

- `src/components/student/student-session-shell.tsx`
  - dejar de orquestar todo directamente
  - delegar en `useRealtimeStudentSession`

- `src/features/teacher-config/services/student-runtime-service.ts`
  - se mantiene
  - sigue siendo la fuente de configuracion publicada

- `src/lib/openai/client.ts`
  - dejar de usarlo como camino principal para voz del estudiante
  - puede quedarse para:
    - fallback textual
    - pruebas internas
    - herramientas docentes futuras

- `src/app/api/conversation/respond/route.ts`
  - mantenerlo como fallback
  - ya no sera el camino principal del peluche

## 9. Diseño del endpoint nuevo

## 9.1 `POST /api/realtime/session`

Entrada:

```ts
type RealtimeSessionRequest = {
  deviceId?: string;
}
```

Salida:

```ts
type RealtimeSessionResponse = {
  sessionClientSecret: string;
  model: string;
  voice: string;
  expiresAt?: string;
  runtime: {
    characterName: string;
    wakePhrase: string;
    wakeAliases: string[];
    topic: string;
    objective: string;
  };
}
```

Responsabilidades:

- cargar runtime publicado
- validar que exista personaje y leccion
- mapear `voiceId` del panel a una voz real de Realtime
- construir las instrucciones de sesion
- crear la sesion con OpenAI
- devolver solo el secreto efimero o datos minimos necesarios

## 10. Prompt de sesion recomendado

La sesion Realtime debe nacer con instrucciones fuertes y breves.

Ejemplo de estructura:

```text
Eres Sasa, un personaje educativo que ensena espanol a ninos.

Habla solo en espanol.
No traduzcas al ingles.
Si el alumno habla en ingles de forma general, responde exactamente:
"Solo hablo espanol. Intentalo otra vez."

Tema actual: Saludos.
Objetivo: Aprender los saludos en espanol.
Vocabulario prioritario: hola, buenos dias, buenas tardes, buenas noches.

Responde con tono alegre y motivador.
Respuesta maxima: 2 oraciones.
Haz como maximo 1 pregunta por turno.
No te salgas del tema salvo una respuesta social muy breve y natural.
Corrige de forma positiva.
```

## 11. Cambio de UI en `/student`

La UI debe simplificarse.

### Ahora

- muchos estados tecnicos
- boton de escucha muy visible
- mucho texto diagnostico

### Objetivo

- una tarjeta principal grande del personaje
- estado simple:
  - `En espera`
  - `Escuchando`
  - `Pensando`
  - `Hablando`
- un boton secundario:
  - `Activar`
  - `Terminar`
  - `Silenciar`
- panel de debug opcional oculto para pruebas, no para produccion

## 12. Estrategia de wake word

Importante: OpenAI Realtime no sustituye por si solo la activacion local del peluche.

Se recomienda:

### Fase 1

- mantener activacion local simple
- usar:
  - `Hola Sasa`
  - `Sasa`
  - alias configurados

### Fase 2

- activar escucha continua ligera
- abrir sesion realtime solo al detectar la activacion

### Fase 3

- evaluar un detector local mas robusto para Android si el navegador no basta

## 13. Estrategia de voces

Hoy el profesor guarda `voiceId` como texto libre del navegador, por ejemplo `es-US-1`.

Eso debe cambiar.

Nueva idea:

- en el panel del profesor mostrar opciones amigables
- guardar una de estas dos cosas:
  - `realtimeVoiceId`
  - o un `voiceProfile`

Ejemplo:

```ts
type CharacterVoiceProfile =
  | 'calida'
  | 'juguetona'
  | 'serena'
  | 'energica';
```

Luego el servidor mapea eso a una voz real disponible en OpenAI.

## 14. Seguridad

- nunca enviar `OPENAI_API_KEY` al cliente
- crear la sesion realtime solo desde el servidor
- usar secreto efimero o la mecanica oficial equivalente de sesion
- no exponer reglas internas completas en el cliente si no hace falta

## 15. Telemetria minima recomendada

Agregar una coleccion futura, por ejemplo:

- `studentSessions`
- `studentTurns`

Guardar:

- fecha
- personaje
- leccion
- duracion
- texto transcrito final
- si hubo fallback de ingles
- si hubo error de audio o red

No guardar audio crudo en la primera fase.

## 16. Plan de implementación por fases

## Fase A - Preparacion

Objetivo:

- dejar el panel del profesor listo para Realtime

Tareas:

1. cambiar modelo de voz en personajes
2. separar `voiceProfile` de la voz del navegador
3. mantener `voiceSpeed`
4. documentar runtime realtime

## Fase B - Session broker

Objetivo:

- crear el nuevo endpoint seguro de sesion realtime

Tareas:

1. crear `src/app/api/realtime/session/route.ts`
2. crear `realtime-prompt-builder`
3. crear `realtime-session-service`
4. validar que el runtime publicado exista

## Fase C - Cliente realtime

Objetivo:

- conectar `/student` a una sesion `WebRTC`

Tareas:

1. crear `useRealtimeStudentSession`
2. abrir la sesion desde el cliente
3. enviar microfono
4. recibir audio de vuelta
5. simplificar UI

## Fase D - Wake word y continuidad

Objetivo:

- hacer la interaccion mas natural

Tareas:

1. mantener wake local
2. permitir conversacion durante una ventana de sesion
3. cerrar por inactividad
4. reactivar con nombre o frase completa

## Fase E - Observabilidad

Objetivo:

- saber que pasa en clase real

Tareas:

1. registrar eventos de sesion
2. registrar fallbacks
3. registrar errores
4. añadir panel simple de diagnostico futuro

## 17. Que dejamos de priorizar

Con esta migracion, ya no conviene invertir demasiado en:

- perfeccionar `speechSynthesis` del navegador
- pulir demasiado el STT actual del navegador
- complicar mucho la logica actual de `push-to-talk`

Esas piezas nos sirvieron para validar producto, pero no son la base final.

## 18. Recomendacion final

La direccion correcta del producto es:

- `teacher` sigue siendo el panel curricular
- `student` migra a `Realtime API`
- el navegador deja de hacer tanto trabajo manual
- OpenAI pasa a manejar la conversacion de voz de forma mas natural

## 19. Proximo modulo a construir

El siguiente modulo recomendado es:

`POST /api/realtime/session`

Ese es el punto de entrada real para dejar atras el prototipo actual y empezar la arquitectura correcta del peluche.
