# Relatório — Fase 5, Etapa 6/8: realização da prova e correção automática

## Escopo entregue

- Cabeçalho de contexto reutilizável (`renderCabecalhoContextoIA`) no topo da tela do aluno: marca SulSafe, tipo, título da avaliação, nome do aluno, data, tempo estimado, nota mínima (quando houver), quantidade de questões e instruções. Visual verde/escuro com acento dourado; o mesmo componente serve para prova, palestra e curso.
- Rota SPA `/aluno/prova/:id` (rewrite em `vercel.json`) com `js/views/prova-aluno-ia.js`: carrega as questões por RPC, sem gabarito, e permite selecionar uma alternativa por questão.
- Botão **Finalizar Prova** com modal de confirmação acessível (`role="dialog"`, `aria-modal="true"`, foco inicial, `Escape` e botão **Revisar respostas**), sem `prompt()`/`confirm()`.
- Envio no formato `[{ questao_id: 1, alternativa: "A" }, ...]` para `POST /api/aluno/provas/:id/submeter`, com JWT do aluno + `SUPABASE_ANON_KEY`, nunca `service_role` e `Cache-Control: no-store`.
- RPCs `security definer` com `search_path = ''`: `sulsafe_prova_entregue_aluno_ia`, `sulsafe_carregar_cabecalho_prova_aluno_ia`, `sulsafe_listar_provas_aluno_ia`, `sulsafe_carregar_prova_aluno_ia` e `sulsafe_submeter_prova_aluno_ia`.
- Correção automática no backend: soma dos `peso` das questões corretas; grava `nota` e `status = CONCLUIDA` em `provas_progresso`, atualiza `concluido_em`/`atualizado_em` e registra auditoria `SUBMETIDO` apenas com nota/total — nunca com gabarito.
- `js/views/provas.js` passa a listar as avaliações I.A. distribuídas ao aluno com botão **Realizar prova**.

## Decisões aplicadas

- **Acesso:** o aluno só entra na prova com conta ativa, papel `aluno`, prova `publicado = true`, mesma empresa e vínculo real em `provas_distribuicoes`. Professor e aluno sem distribuição são bloqueados na leitura e na submissão.
- **Gabarito invisível:** `sulsafe_carregar_prova_aluno_ia` devolve somente `id`, `ordem`, `enunciado`, `alternativas` e `peso`. `gabarito`/`justificativa` não têm grant para `authenticated` e só são lidos internamente pela RPC de correção. O teste estático de “sem gabarito” inspeciona apenas o corpo da RPC de leitura.
- **Nota:** soma dos pesos das questões corretas; resposta inválida, questão fora da prova, questão repetida ou respostas incompletas são rejeitadas antes de gravar.
- **Correção manual (HITL):** prevista para questões discursivas, mas fora deste escopo. Nenhuma resposta é enviada ao provedor de I.A.; a nota das objetivas é calculada integralmente no banco.
- **Front sem segredo:** helpers usam RPC com o JWT da sessão; a escrita vai pela rota servidora, que mantém a chave anônima no servidor. Nenhuma chave em DOM, log ou resposta.
- **Renderização:** `js/utils.js` protege `document`/`window` com `typeof`, evitando que os stubs enganem o PGlite nos testes. `iniciarProvaAlunoIA` injeta apenas o corpo da prova no container já existente, evitando cabeçalho/container duplicados.

## Validação executada

### Testes automatizados

- `node --test tests/fase5-realizacao-prova.test.mjs`: **9/9** testes passando.
- `npm test`: **261/261** testes passando (suíte da Etapa 6 incluída no script).
- `npm run check` (`node auditar-imports.mjs`): **42 arquivos JavaScript, 0 problemas reais**.

Cobertura da suíte da Etapa 6: migration forward-only, `security definer` e grants; cabeçalho com todos os metadados; sanitização e ausência de gabarito no HTML; container único (sem aninhamento); leitura pelo aluno com colunas exatas e bloqueio do professor; nota máxima, nota zero e nota parcial por peso; persistência de `nota`/`status`/`concluido_em`; rejeição de aluno sem distribuição, empresa diferente, alternativa inválida, prova sem distribuição e método incorreto.

### Navegador (UAT local com stubs de runtime)

Servidor local temporário em `127.0.0.1:4177` com import map substituindo apenas `js/supabase-client.js` por stubs. Nenhuma chamada ao Supabase remoto.

- Rota `/aluno/prova/00000000-0000-4000-8000-000000000051` carregou o cabeçalho **Avaliação: NR-35 - Trabalho em Altura**, com SulSafe, aluno, data, 45 minutos, nota mínima 7, 3 questões e instruções.
- Identidade visual confirmada por estilo computado: gradiente `rgb(26,43,30) → rgb(27,94,32) → rgb(46,125,50)`, texto branco e raio de 18 px.
- 3 questões renderizadas; `1` container `#conteudoProvaAlunoIA` e `1` cabeçalho; nenhuma ocorrência de `gabarito`/`resposta_correta`/`justificativa` no DOM.
- **Finalizar Prova** sem respostas exibiu o aviso “Responda todas as questões antes de finalizar.” e **não** enviou nada.
- Após marcar as alternativas, o modal de confirmação abriu com `role="dialog"`, `aria-modal="true"` e o texto “Confirme para enviar 3 respostas”; `Escape` o fechou sem envio.
- A confirmação enviou exatamente `[{questao_id: …61, alternativa: 'A'}, {…62, 'A'}, {…63, 'A'}]`; o resultado mostrou **“Sua nota: 6 de 6 pontos. Acertos: 3 de 3 questões.”** e o botão foi desabilitado.
- **0 erros de console**.

## Arquivos alterados/criados

- `supabase/migrations/20261125050000_fase5_realizacao_prova.sql` (nova, forward-only)
- `api/aluno/provas/[id]/submeter.mjs` (nova)
- `js/views/prova-aluno-ia.js` (nova)
- `tests/fase5-realizacao-prova.test.mjs` (nova)
- `js/supabase-client.js`, `js/main.js`, `js/views/provas.js`, `js/utils.js`, `style.css`, `vercel.json`, `package.json`
- `ROADMAP_SULSAFE.md`, `DECISIONS_SULSAFE.md`, `RELATORIO_FASE5_ETAPA6.md`

## Estado de entrega

- **Não** foi aplicada migration ao Supabase remoto.
- **Não** houve deploy na Vercel.
- **Não** houve commit nem push (a pasta não é repositório git ativo).
- Etapas 1–5 permanecem intactas. Seguem pendentes a tela administrativa de acompanhamento, a correção manual de discursivas e a autorização para migration/deploy (Etapas 7 e 8).
