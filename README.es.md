<p align="center">
  <img src="./logo.png" alt="Logo de Learn Anything" width="120" />
</p>

# Learn Anything V2

[English](./README.md) · [Español](./README.es.md) · [中文](./README.zh-CN.md)

Fork V2 independiente de [ChenChenyaqi/learn-anything](https://github.com/ChenChenyaqi/learn-anything). Conserva la licencia MIT y la atribución original, y hace que los datos de aprendizaje sean durables, con control de revisión y locales. El paquete CLI es privado por ahora: instalalo y ejecutalo desde la rama `v2` de este repositorio.

## Camino rápido

```bash
git clone --branch v2 https://github.com/eduardojvieira/learn-anything.git
cd learn-anything
pnpm install
pnpm build

# Generá integraciones para un proyecto y levantá el dashboard.
node packages/cli/bin/learn-anything.js init ../mi-proyecto --tools claude --lang es
node packages/cli/bin/learn-anything.js serve ../mi-proyecto --no-open
```

El servidor muestra `http://localhost:24278` (o el siguiente puerto libre). El acceso LAN es deliberado: usá `http://<tu-IP-LAN>:24278` sólo dentro de una red local confiable. No hay una capa de autenticación.

## Aprendé con siete workflows

`/learn:study` es el workflow principal: pide al runtime determinista el siguiente paso. Los demás son entradas especializadas.

| Workflow                    | Propósito                                            |
| --------------------------- | ---------------------------------------------------- |
| `/learn:study [topic]`      | Planifica y registra el próximo paso determinista.   |
| `/learn:topic <topic>`      | Crea o inspecciona un tema V2.                       |
| `/learn:explain <concept>`  | Ejecuta una explicación socrática persistente.       |
| `/learn:practice <concept>` | Registra práctica observada y corrección.            |
| `/learn:review [topic]`     | Resuelve la revisión de retrieval pendiente.         |
| `/learn:status [topic]`     | Lee el ledger de dominio derivado y el próximo paso. |
| `/learn:quiz <concept>`     | Ejecuta y evalúa un quiz de retrieval persistente.   |

La forma con slash es la forma mostrada, pero Codex y Hermes son integraciones sólo de skills: invocá la skill correspondiente o pedilo en lenguaje natural cuando el host no exponga slash commands.

## Qué garantiza V2

`learnctl` es el único escritor canónico. Agentes y dashboard leen snapshots y mandan pedidos con revisión; nunca editan archivos canónicos de aprendizaje directamente.

- `StateStore` usa locks, revisiones compare-and-swap, escrituras atómicas, journal y recuperación.
- Los temas tienen IDs estables. La numeración visible (`1`, `1.1`, `1.1.1`) es derivada, no se guarda en nombres, slugs ni IDs.
- El estado registra prerrequisitos, relaciones, evidencia, calibración y revisión. El nivel de dominio se deriva de la evidencia; una IA no puede marcarlo arbitrariamente.
- El motor cubre diagnóstico, retrieval, autoexplicación, feedback, corrección, spacing, interleaving, transferencia y evaluación demorada. Su scheduler está detrás de una interfaz reemplazable compatible con FSRS; V2 no afirma implementar FSRS.

### Datos canónicos y vistas derivadas

```text
.learn/
├── config.json                         # idioma, zona horaria, numeración
└── topics/<slug>/
    ├── state.json                       # estado canónico V2 del tema
    ├── state.v1.json.bak                # sólo tras migración V1 → V2
    ├── knowledge-map.md                 # vista derivada
    └── sessions/<uuid>/
        ├── session.json                 # sesión canónica
        └── views/{en,es,zh-CN}.md       # vistas localizadas derivadas
```

No trates Markdown legado, ejercicios ni quizzes como estado canónico.

## Dashboard e integraciones

`serve` abre Mastery Ledger: una vista paper/serif de nivel de dominio derivado, sesiones canónicas y respuestas socráticas editables. Las escrituras del dashboard usan revisión (`If-Match`) e idempotency keys: una actualización vieja produce un conflicto explícito, no un overwrite silencioso.

Todas las integraciones generadas llaman a `learnctl`. Codex y Hermes instalan skills estándar en `.agents/skills/`; OpenCode recibe comandos reales en `.opencode/commands/`; las demás herramientas mantienen sus skills/adapters. Inglés, español y chino simplificado (`en`, `es`, `zh-CN`) comparten `.learn/config.json` entre CLI, skills y dashboard.

`init` y `update` encadenan la migración V0 → V1 → V2 antes de generar integraciones. El estado V1 queda respaldado, repetir es idempotente, y estado inválido o paths inseguros abortan la generación. `learnctl migrate` queda para uso avanzado del runtime. `--force` sólo reemplaza archivos de integración generados; nunca evita validación de estado ni protecciones contra symlinks/escapes.

## Desarrollo

```bash
pnpm lint
pnpm test
pnpm build
cd packages/cli
npm pack --dry-run
cd ../..
```

Leé [CONTRIBUTING.md](./CONTRIBUTING.md) para el flujo del fork y [UPSTREAM.md](./UPSTREAM.md) para extraer mejoras puntuales al proyecto original.

## Licencia y atribución

[MIT](./LICENSE) © [yaqi chen](https://github.com/ChenChenyaqi). V2 se mantiene como fork [eduardojvieira/learn-anything](https://github.com/eduardojvieira/learn-anything); el proyecto original sigue siendo [ChenChenyaqi/learn-anything](https://github.com/ChenChenyaqi/learn-anything).
