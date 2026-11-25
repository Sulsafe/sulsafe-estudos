# Relatório — Fase 5, Etapa 5/8: Distribuição direcionada de provas aprovadas

## Escopo entregue

- Tela `/admin/provas-distribuicao` (SPA + rewrite em `vercel.json`) com cards das provas aprovadas prontas para distribuição.
- Botão **Distribuir Prova** e modal acessível (`role="dialog"`, `aria-modal="true"`, foco inicial, fechamento por `Escape`, sem `prompt()`/`confirm()`) com quatro destinos:
  - **TURMA** — seleção de turma existente;
  - **ALUNO** — seleção de aluno específico;
  - **CATÁLOGO** — todos os alunos da empresa do chamador;
  - **INTERNO** — mantém a prova no banco, sem distribuir.
- Rota `POST /api/tutor/provas/:id/distribuir` com `destino_tipo` e `destino_id`, JWT do chamador, `SUPABASE_ANON_KEY`, nunca `service_role` e `Cache-Control: no-store`.
- RPCs `security definer` com `search_path = ''`: `sulsafe_listar_provas_aprovadas_ia`, `sulsafe_listar_destinos_distribuicao_ia` e `sulsafe_distribuir_prova_ia`.
- Um vínculo em `provas_distribuicoes` e uma notificação em `notificacoes` por aluno alcançado. `INTERNO` não cria entregas, notificações nem carimbos de distribuição.
- Auditoria em `provas_revisao_auditoria` com `DISTRIBUIDO` ou `INTERNO`, ator, timestamp e destino.
- `turmas.empresa_id` com trigger que herda `app_metadata.empresa_id` do JWT no INSERT; `DEFAULT 42` somente para o legado local de testes.

## Decisões aplicadas

- **Etapa 4 preservada:** `publicado = true` continua significando “aprovada e pronta para distribuição”. A distribuição é que preenche `distribuido_por`/`distribuido_em`.
- **Isolamento reforçado:** diferente da revisão (Etapa 4), a distribuição exige a mesma empresa entre chamador, prova e destino **inclusive para ADMIN**. `turma.empresa_id` nulo falha fechado.
- **Distribuição única:** RPC exige `distribuido_por is null` e `destino_tipo` nulo/`INTERNO`. Uma segunda distribuição é rejeitada; trocar destino não é permitido. `INTERNO` pode ser distribuído depois.
- **Catálogo por empresa:** `CATALOGO` usa a empresa do JWT, não o flag legado `publico = true`, e não reaproveita `sulsafe_direcionar_conteudo_tutor`.
- **Sem vazamento de segredo:** nenhuma chave de serviço aparece no cliente; a rota usa somente a chave anônima e o JWT do usuário.

## Validação executada

### Testes automatizados

- `node --test tests/fase5-distribuicao-prova.test.mjs`: **14/14** testes passando.
- `npm test`: **252/252** testes passando (suíte da Etapa 5 incluída no script).
- `npm run check` (`node auditar-imports.mjs`): **41 arquivos JavaScript, 0 problemas reais**.

Cobertura da suíte da Etapa 5: migration forward-only e grants; turma; aluno; `publicado = false`; isolamento multiempresa (Admin A não distribui para turma da Empresa B); `CATALOGO`; `INTERNO`; segunda distribuição rejeitada; aluno sem permissão e fila restrita; rota com JWT/anon key; modal acessível com quatro destinos e sem `prompt`/`confirm`; registro SPA/rewrite; cliente sem segredo; Etapa 4 intacta.

### Navegador (UAT local com stubs de runtime)

Servidor local temporário em `127.0.0.1:4177` com import map substituindo apenas `js/supabase-client.js` por stubs. Nenhuma chamada ao Supabase remoto.

- Rota `/__uat.html` carregou a tela **Distribuir Provas Aprovadas** com o card da prova aprovada.
- Botão **Distribuir Prova** abriu o modal com TURMA, ALUNO, CATÁLOGO e INTERNO.
- Seleção de **ALUNO**, confirmação e envio chamaram `sbDistribuirProvaIA` com `{ provaId, destinoTipo: 'ALUNO', destinoId }`; mensagem **“Prova distribuída e alunos notificados.”** apareceu; modal fechou e a lista recarregou.
- `Escape` fechou o modal.
- **0 erros de console**.

## Arquivos alterados/criados

- `supabase/migrations/20261125040000_fase5_distribuicao_prova.sql` (nova, forward-only)
- `api/tutor/provas/[id]/distribuir.mjs` (nova)
- `js/views/provas-distribuicao-ia.js` (nova)
- `tests/fase5-distribuicao-prova.test.mjs` (nova)
- `js/supabase-client.js`, `js/main.js`, `js/app.js`, `vercel.json`, `package.json`
- `ROADMAP_SULSAFE.md`, `DECISIONS_SULSAFE.md`, `RELATORIO_FASE5_ETAPA5.md`

## Estado de entrega

- **Não** foi aplicada migration ao Supabase remoto.
- **Não** houve deploy na Vercel.
- **Não** houve commit nem push (a pasta não é repositório git ativo).
- Etapas 1–4 permanecem intactas; Etapa 6 (tela do aluno) estava pendente **na data deste relatório** e foi concluída em `RELATORIO_FASE5_ETAPA6.md`.
