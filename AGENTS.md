# Project instructions

## Stack e gates do repositório

- Front: HTML/CSS/PWA + módulos ES (`"type": "module"`), pt-BR, foco em acessibilidade (`acessibilidade.css`, `js/accessibility.js`).
- Back: Supabase (Postgres/RLS/RPCs `SECURITY DEFINER`, migrations em `supabase/`, Edge Functions em Deno/TS), com Vault para segredos.
- Testes/gates: Node `>=18` + npm, `npm test` (`node --test`, com PGlite) e `npm run check` (`node auditar-imports.mjs`).
- Deploy: Vercel estático (`vercel.json`). Sem Docker, Next.js, Redis, LiveKit ou OpenMAIC local (`ROADMAP_SULSAFE.md`).
- Estado atual: esta pasta não é um git repo ativo e não tem `.planning/`. `ROADMAP_SULSAFE.md` e `DECISIONS_SULSAFE.md` são a governança vigente.
- Não assumir `tsc`, lint/build, Playwright, bun/pnpm/yarn, tmux ou hooks ativos. Hooks ECC continuam desativados (`hookConsent: declined`).

## Seleção automática de skills

Antes de qualquer tarefa não trivial, escolha e carregue somente as skills relevantes, usando o ID exato com a sintaxe `@id`. Não carregue o catálogo inteiro de uma vez: mantenha no máximo 3–5 skills por tarefa e informe brevemente quais foram escolhidas e por quê.

### Classificação das skills ECC

- `@agent-sort` já foi executado neste repositório (25/11/2026). O pool **DAILY** está definido abaixo; todo o restante é **LIBRARY**.
- DAILY não significa carregar tudo: é o conjunto de onde escolher 3–5 skills por tarefa.
- Se a tarefa envolver ambiente, MCP, plugins, hooks ou cobertura de capacidades, carregue `@workspace-surface-audit`.
- `@agent-sort` e `@workspace-surface-audit` são advisory: apresente o plano antes de alterar instalação, configuração ou arquivos do projeto.

### Pool DAILY por tipo de tarefa

Escolha no máximo 3–5 destas skills:

| Tipo de tarefa | Skills preferenciais |
|---|---|
| Arquitetura, callers, impacto de mudança | `@graphify` (se existir `graphify-out/`, consulte o grafo antes de grepar) |
| Teste/regressão | `@tdd-workflow`, `@eval-harness`, `@ai-regression-testing` |
| Segurança, RLS, LGPD | `@security-review`, `@postgres-patterns`, `@database-migrations`, `@production-audit` |
| Supabase/Postgres | `@postgres-patterns`, `@database-migrations`, `@documentation-lookup` |
| Tutor I.A. | `@agent-architecture-audit`, `@cost-aware-llm-pipeline`, `@regex-vs-llm-structured-text`, `@eval-harness` |
| Verificação/entrega | `@verification-loop`, `@terminal-ops`, `@deployment-patterns`, `@git-workflow` (somente se houver `.git`) |
| UI/a11y | `@ui-ux-pro-max`, `@awesome-design-md`, `@browser-qa`, `@click-path-audit` |
| Decisões/docs | `@architecture-decision-records`, `@intent-driven-development`, `@living-docs-governance`, `@knowledge-ops`, `@search-first` |

- **Planejamento/spec-driven**: use `@gsd-*` somente quando existir `.planning/`; caso contrário, leia `ROADMAP_SULSAFE.md` e `DECISIONS_SULSAFE.md`.
- **Comandos ECC com `agent:` ausente** (`tdd.md`, `security.md`, etc.): prefira as skills equivalentes da tabela; não dependa dos agents não instalados.
- **Antes de criar uma skill nova**: procure uma existente com `@skill-scout`.

### Comportamento esperado

1. Identifique o tipo de tarefa e use a stack descrita no início deste arquivo.
2. Carregue no máximo 3–5 skills com os IDs exatos.
3. Informe em uma linha: `Skills carregadas: @a, @b — motivo`.
4. Se nenhuma skill corresponder, continue sem carregar e diga que não houve match.
5. Use o ID do diretório, não o título de exibição. Exemplo: `@ui-ux-pro-max`, não `@UI/UX Pro Max`.
