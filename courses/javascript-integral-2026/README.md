# JavaScript integral — de cero a avanzado (2026)

Pack fuente para un curso V2 en español: 11 dominios, 30 conceptos y assets copiables. El progreso personal no vive acá.

## Instalación reproducible

    pnpm build
    COURSES_ROOT=/ruta/durable/learn-courses
    node packages/cli/bin/learn-anything.js init "$COURSES_ROOT" --tools codex,hermes,opencode --lang es --context7
    node packages/cli/bin/learnctl.js init-topic "$COURSES_ROOT/.learn/topics/javascript-integral-2026" courses/javascript-integral-2026/curriculum.json
    cp -R courses/javascript-integral-2026/topic-assets/. "$COURSES_ROOT/.learn/topics/javascript-integral-2026/"
    node packages/cli/bin/learnctl.js validate-course "$COURSES_ROOT/.learn/topics/javascript-integral-2026"
    node packages/cli/bin/learnctl.js render "$COURSES_ROOT/.learn/topics/javascript-integral-2026"
    node packages/cli/bin/learnctl.js snapshot "$COURSES_ROOT/.learn/topics/javascript-integral-2026"
    node packages/cli/bin/learnctl.js study "$COURSES_ROOT/.learn/topics/javascript-integral-2026" "$(date --iso-8601=seconds)"
    node packages/cli/bin/learn-anything.js serve "$COURSES_ROOT" --port 24377 --strict-port --no-open

La app escucha en LAN y no tiene autenticación: no la expongas fuera de una red confiable. Copiá sólo topic-assets; state.json, journal, sesiones y progreso pertenecen al alumno y los escribe learnctl. Usá study más topic, explain, practice, review, quiz y status. El scheduler decide retrieval, spacing e interleaving; la sesión recoge autoexplicación, feedback/corrección y transferencia. La evaluación diferida ocurre después de 48 horas. Nunca se fabrican sesiones, evidencia ni mastery. Zona horaria: America/Argentina/Buenos_Aires.
