# Relatório — Fase 5, Etapa 3/8: geração de provas/módulos ligada ao worker

## Escopo entregue

- Edge Function `tutor-sulsafe` com dispatcher para `PROVA` e `MODULO`. `PALESTRA`, `MATERIA`, `CURSO` e `MATERIAL` **continuam** no fluxo legado de videoaulas/materiais já homologado.
- Prompt do sistema por tipo, reaproveitando o `prompt_base` persistido no banco. Não existe coluna `prompt_base`: o texto é `ia_jobs.prompt`, montado pelo front com `montarPromptTutor()` e a base das 38 NRs. A instrução acrescentada para `PROVA` pede “10 questões de múltipla escolha sobre o assunto, com 5 alternativas (A–E), apenas uma correta, retornando JSON estrito” com `resposta_correta`, `justificativa` e `peso`.
- Saída do provedor (Gemini/OpenAI/Anthropic) parseada por `extrair-json.js` e **validada com o mesmo núcleo Zod da Etapa 1** (`criarContratosFase5(z)`, `zod@4.6.7`) antes de qualquer gravação.
- Prova materializada via `sulsafe_materializar_prova_ia` no modo `RASCUNHO_IA`: prova nasce com `publicado = false`, `origem = 'IA_TUTOR'`, sem turma/aluno, e questões gravadas atomicamente. Módulo vira rascunho em `ia_conteudos` sem materialização de prova.
- Job marcado `CONCLUIDO` (equivalente a `COMPLETED` no pedido); qualquer falha marca `ERRO` (equivalente a `FAILED`) com `p_erro_mensagem` em até 2000 caracteres. Nenhum dado parcial é gravado.
- Fila HITL: `GET /api/tutor/provas-pendentes` lista provas geradas pela I.A. ainda não aprovadas, com JWT do professor/admin e chave **anônima**; a RPC `sulsafe_listar_provas_pendentes_ia()` devolve somente metadados e filtra por `ia_conteudos.empresa_id`.
- Migration nova e forward-only: nenhuma migration já aplicada foi editada.

## Arquivos alterados/criados

| Arquivo | Finalidade |
|---|---|
| `supabase/migrations/20261125020000_fase5_geracao_prova.sql` | Tipos `PROVA`/`MODULO` nas RPCs de job/rascunho; modo `RASCUNHO_IA` na materialização; RPC de fila HITL sem gabarito. |
| `supabase/functions/tutor-sulsafe/processar-job-fase5.js` | Camada pura (Deno + Node): builders de prompt, stub determinístico, validação, materialização e status. |
| `supabase/functions/tutor-sulsafe/index.ts` | Dispatcher por tipo, contratos Zod no runtime, falha registrada via `registrarFalhaJob`; fluxo legado preservado. |
| `js/materializar-prova-fase5.js` | Aceita `opcoes.modo` (`RASCUNHO_IA`) mantendo o padrão `APROVADO` da Etapa 2. |
| `api/tutor/provas-pendentes.mjs` | Rota Vercel (Node) com whitelist de campos, `no-store` e sem `service_role`. |
| `tests/fase5-geracao-prova.test.mjs` | 13 testes: mock do Gemini, JSON inválido, HITL, isolamento entre empresas, rota HTTP e garantias estáticas. |
| `package.json` | Novo teste registrado no script `npm test`. |
| `ROADMAP_SULSAFE.md`, `DECISIONS_SULSAFE.md` | Capítulo 10.9 e decisões D-TUTOR-26/27. |
| `RELATORIO_FASE5_ETAPA3.md` | Este relatório. |

## Evidência TDD (RED → GREEN)

### RED

1. Com o teste escrito e antes da implementação:

   ```
   node --test tests/fase5-geracao-prova.test.mjs
   ℹ tests 1
   ℹ pass 0
   ℹ fail 1
   Error [ERR_MODULE_NOT_FOUND]: Cannot find module
   'C:\Users\maike\Desktop\sulsafe-estudos-main\api\tutor\provas-pendentes.mjs'
   ```

2. Depois de criados dispatcher, migration e rota, ainda com 7/12 falhas — incluindo `true !== false` em `publicado`, `O job não está em etapa de geração`, `function public.sulsafe_atualizar_status_ia_job(uuid, text, text) does not exist` e vazamento de cabeçalho por caixa no mock.

### Correções guiadas pelos testes

- **Código de produção:** `publicado` refletia “foi materializada” em vez do estado real da prova; passou a derivar de `prova.publicado`. O título do rascunho voltou a ser `job.titulo`, como no fluxo legado. A conclusão do job agora falha explicitamente se a RPC de status falhar.
- **Harness PGlite:** o banco de teste não definia `sulsafe_atualizar_status_ia_job`, não tinha `default gen_random_uuid()` em `ia_conteudos.id`, mantinha jobs em `PENDENTE` (o worker os coloca em `PROCESSANDO`) e chamava RPCs posicionais sem preencher os parâmetros com DEFAULT. Tudo corrigido no teste, sem relaxar regra de negócio.
- **Regressão de escopo detectada na revisão:** `PALESTRA` estava no conjunto do dispatcher e desviaria o fluxo de videoaulas. Separou-se o conjunto `TIPOS_GERACAO_FASE5` (`PROVA`, `MODULO`) dos tipos que o builder de contrato ainda conhece; teste de não-regressão adicionado.

### GREEN

| Comando | Resultado |
|---|---|
| `node --test tests/fase5-geracao-prova.test.mjs` | 13 testes, 13 passam, 0 falhas. |
| `npm test` | 223 testes, 223 passam, 0 falhas. |
| `npm run check` | 39 arquivos JavaScript analisados, 0 problemas reais. |

## Garantias verificadas

| # | Garantia | Teste |
|---|---|---|
| 1 | `prompt_base` do banco é reaproveitado; PROVA pede 10 questões A–E, uma correta, JSON estrito e `resposta_correta`. | `prompt_base do banco é reaproveitado com instrução específica por tipo` |
| 2 | Stubs de cada tipo passam no contrato Zod da Etapa 1. | `stub de cada tipo gera JSON válido segundo o contrato Zod da Etapa 1` |
| 3 | Mock do Gemini salva rascunho, chama materialização com `RASCUNHO_IA` e marca `CONCLUIDO`, sem segredo na resposta. | `worker salva rascunho, materializa prova e marca job CONCLUIDO` |
| 4 | Módulo não chama materialização de prova. | `worker de MODULO salva rascunho validado sem chamar materialização de prova` |
| 5 | PALESTRA não entra no dispatcher; fluxo legado intacto. | `PALESTRA permanece no fluxo legado e não é despachada pela Fase 5` |
| 6 | JSON inválido vira `ERRO` e nenhum RPC de gravação é chamado. | `resposta inválida do Gemini vira ERRO e não salva dado sujo` |
| 7 | Integração real: prova `publicado = false`, `origem = 'IA_TUTOR'`, 10 questões ordenadas, job `CONCLUIDO`. | `worker grava no banco: prova em rascunho, questões e job CONCLUIDO` |
| 8 | Falha não deixa prova, questão nem rascunho e grava `erro_mensagem`. | `falha do provedor marca job ERRO sem prova, questão ou rascunho` |
| 9 | Fila isola empresas e nunca devolve `resposta_correta`/`justificativa`/gabarito. | `RPC de pendentes isola empresas e nunca devolve gabarito` |
| 10 | Rota exige JWT, usa anon key, whitelist de campos, `no-store`, 401 sem token e 405 em POST. | `rota GET /api/tutor/provas-pendentes repassa o JWT e não vaza segredos` |
| 11 | Edge Function mantém `adaptarSaida`, `gerarStub`, `extrairOutline`, retry e modo stub. | `Edge Function despacha por tipo sem alterar o fluxo de videoaulas` |
| 12 | Migration não é destrutiva, aceita os tipos novos e protege a fila. | `migration da Etapa 3 é forward-only, aceita novos tipos e protege a fila` |
| 13 | Rota não lê `SUPABASE_SERVICE_ROLE_KEY`; adaptador repassa `p_modo`. | `rota usa somente a chave anônima e whitelist de campos` |

## Limites desta etapa

- Nenhuma migration foi aplicada ao Supabase remoto; nenhum deploy foi feito na Vercel; nenhum frontend foi alterado.
- A fila de provas pendentes existe para consumo futuro do front — esta etapa não altera a tela do Tutor nem adiciona botões.
- Distribuição da prova, notificação ao aluno, correção, cálculo de nota e aprovação na UI pertencem às etapas seguintes.
- A Edge Function só foi verificada por testes estáticos + módulo puro em Node; não há runtime Deno instalado neste ambiente para `deno check`.
