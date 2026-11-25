# Relatório — Fase 5, Etapa 2/8: estrutura de provas e progresso

## Escopo entregue

- `provas_questoes` com `prova_id`, `ordem`, `enunciado`, `alternativas`, `gabarito` (objeto com `resposta_correta` e `justificativa`) e `peso`.
- `provas_progresso` com `prova_id`, `aluno_id`, `status` enum (`PENDENTE`, `EM_ANDAMENTO`, `CONCLUIDA`), `nota`, `iniciado_em` e `concluido_em`.
- RLS: aluno vê apenas o próprio progresso; professor/admin veem o progresso da própria empresa, sem coluna `empresa_id` nova (isolamento herdado de `ia_conteudos.empresa_id`).
- Gabarito nunca é lido por aluno: `REVOKE ALL` + `GRANT SELECT` por coluna, sem `gabarito`/`justificativa`. Leitura segura de questões via RPC; gabarito apenas via RPC restrita a professor/admin ou por `service_role` no momento da correção.
- Materialização atômica: `sulsafe_materializar_prova_ia(uuid)` grava prova (`publicado = false`, `origem = 'IA_TUTOR'`) e todas as questões em uma transação; qualquer questão inválida desfaz tudo.
- Adaptador `js/materializar-prova-fase5.js` valida o JSON com o mesmo núcleo Zod da Etapa 1 antes de chamar a RPC.

## Arquivos alterados/criados

| Arquivo | Finalidade |
|---|---|
| `supabase/migrations/20261125010000_fase5_estrutura_prova.sql` | Nova migration forward-only; nenhuma migration aplicada foi editada. |
| `js/materializar-prova-fase5.js` | Adaptador de backend/Deno com validação Zod e chamada RPC. |
| `tests/fase5-estrutura-prova.test.mjs` | 7 testes PGlite/Node cobrindo gabarito, RLS, enum/timestamps, materialização, rollback e validação. |
| `package.json` | Novo teste registrado no script `npm test`. |
| `RELATORIO_FASE5_ETAPA2.md` | Este relatório. |

## Evidência TDD (RED → GREEN)

### RED

Comando: `node --test tests/fase5-estrutura-prova.test.mjs`

Resultado inicial: `ERR_MODULE_NOT_FOUND: Cannot find module .../js/materializar-prova-fase5.js` — o adaptador e a migration ainda não existiam. Após criar a implementação, apareceram falhas no próprio harness do teste (reutilização de `$1` com tipos distintos, fixture com uma única alternativa e constraint de destino); todas foram corrigidas no teste, sem alterar a regra de negócio para esconder a falha.

### GREEN

| Comando | Resultado |
|---|---|
| `node --test tests/fase5-estrutura-prova.test.mjs` | 7 testes, 7 passam, 0 falhas. |
| `npm test` | 210 testes, 210 passam, 0 falhas. |
| `npm run check` | 39 arquivos JavaScript analisados, 0 problemas reais. |

## Garantias verificadas

| # | Garantia | Teste |
|---|---|---|
| 1 | Aluno lê enunciado/alternativas/peso, mas `gabarito`, `SELECT *` e a RPC de gabarito são negados. | `aluno lê enunciado, mas nunca o gabarito; professor lê via RPC restrita` |
| 2 | Professor da empresa lê o gabarito; professor de outra empresa é bloqueado. | idem |
| 3 | Progresso é isolado por empresa e o aluno vê somente o seu; aluno não consegue inserir progresso via `authenticated`. | `RLS isola progresso entre empresas e o aluno vê somente o seu` |
| 4 | `status` rejeita valor fora do enum e os horários são preenchidos pelo banco nas transições. | `status do progresso usa enum e os horários são preenchidos pelo banco` |
| 5 | RPC cria rascunho sem destino, `publicado = false`, `origem = 'IA_TUTOR'`, grava todas as questões e marca o rascunho como materializado; segunda chamada é bloqueada. | `materialização cria rascunho e questões em uma única transação` |
| 6 | Uma questão inválida desfaz prova, questões e marcação de materialização. | `falha em qualquer questão desfaz toda a materialização` |
| 7 | JSON inválido segundo Zod nunca chega ao banco. | `materializador valida com Zod antes de chamar a RPC` |
| 8 | Migration é forward-only, sem comandos destrutivos, sem GRANT de gabarito e sem segredos. | `migration é forward-only e não concede leitura do gabarito` |

## Limites desta etapa

- Nenhum deploy em Supabase remoto ou Vercel.
- Nenhuma alteração em frontend, videoaulas, fluxo do Tutor já homologado ou migrations já aplicadas.
- Distribuição da prova, notificação ao aluno, correção e cálculo de nota pertencem às etapas seguintes; esta etapa entrega apenas estrutura, visibilidade segura e materialização atômica.
