# Relatório — Fase 5, Etapa 4/8: HITL visual de aprovação de provas

## Escopo entregue

- Tela `/admin/provas-pendentes` (SPA + rewrite) com cards de **Título**, **NR associada**, **Data de Geração** e botão **Revisar Prova**, alimentada por `GET /api/tutor/provas-pendentes` (a fila da Etapa 3, somente metadados).
- Modal de revisão com enunciado e alternativas numeradas e **gabarito visível apenas para professor/admin** (`resposta_correta` + `justificativa`), `role="dialog"`, `aria-modal="true"`, foco inicial e fechamento por `Escape`. Nenhum `prompt()`/`confirm()`.
- **Editar Questão**: enunciado, alternativas (`A|texto`, de 2 a 5) e gabarito persistidos no banco, com validação de que a resposta correta está entre as alternativas. Edição bloqueada após aprovação/rejeição.
- **Aprovar e Publicar**: `publicado = true`, `aprovado = true`, `aprovado_por`/`aprovado_em` e `publicado_por`/`publicado_em`. **Não** cria vínculo com turma/aluno e **não** preenche `distribuido_por`/`distribuido_em` — a distribuição pertence à Etapa 5.
- **Rejeitar**: motivo opcional gravado em `ia_conteudos.observacao`, `rejeitado = true`, `publicado = false`; prova rejeitada não pode ser aprovada depois.
- Auditoria em `provas_revisao_auditoria` para `APROVADO`, `REJEITADO` e `EDITADO`, com ator (`auth.uid()`), timestamp e motivo.
- Autorização única em `sulsafe_prova_revisavel`: professor vê/aprova somente provas da própria empresa; admin pode revisar também outras empresas, alinhado ao comportamento da fila da Etapa 3. Alunos não recebem a RPC de leitura do gabarito.
- Rotas `POST /api/tutor/provas/:id/aprovar` e `/rejeitar` com JWT do chamador + `SUPABASE_ANON_KEY`, validação de UUID, corpo JSON opcional, `Cache-Control: no-store`, 401 sem token, 405 em GET e resposta mínima sem segredo.
- Migration nova e forward-only: nenhuma migration já aplicada foi editada.

## Arquivos alterados/criados

| Arquivo | Finalidade |
|---|---|
| `supabase/migrations/20261125030000_fase5_aprovacao_prova.sql` | Auditoria, autorização única, RPCs de leitura/edição/aprovação/rejeição e ajuste do CHECK para prova I.A. aprovada sem destino. |
| `api/tutor/provas/_handler-decisao.mjs` | Base das rotas de decisão: JWT do chamador, anon key, UUID, motivo e whitelist da resposta. |
| `api/tutor/provas/[id]/aprovar.mjs`, `api/tutor/provas/[id]/rejeitar.mjs` | Handlers POST da aprovação e da rejeição. |
| `js/views/provas-pendentes-ia.js` | Tela HITL: cards, modal, edição e decisões. |
| `js/supabase-client.js` | Helpers `sbGetRevisaoProvaFilaIA`, `sbObterRevisaoProvaIA`, `sbEditarQuestaoProvaIA`, `sbAprovarProvaIA`, `sbRejeitarProvaIA`. |
| `js/main.js`, `js/app.js` | Registro da view, atalho na sidebar e inicialização da rota `/admin/provas-pendentes`. |
| `login.html` | `<base href="/">` para não quebrar CSS/JS quando o rewrite serve o HTML em URL aninhada. |
| `vercel.json` | Rewrite de `/admin/provas-pendentes` para `/login.html`. |
| `tests/fase5-aprovacao-prova.test.mjs` | 15 testes PGlite + estáticos: aprovação, rejeição, edição, auditoria, isolamento, rotas e UI. |
| `tests/tutor-worker.test.mjs` | Asserção antiga refinada: proíbe `api_key`/`service_role`/bearer fixo, continua permitindo bearer do usuário. |
| `package.json` | Novo teste registrado no script `npm test`. |
| `ROADMAP_SULSAFE.md`, `DECISIONS_SULSAFE.md` | Capítulo 10 atualizado e decisão D-TUTOR-28. |
| `RELATORIO_FASE5_ETAPA4.md` | Este relatório. |

## Evidência TDD (RED → GREEN)

### RED

Com o teste escrito antes da implementação:

```
node --test tests/fase5-aprovacao-prova.test.mjs
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'C:\Users\maike\Desktop\sulsafe-estudos-main\api\tutor\provas\[id]\aprovar.mjs'
```

Depois da primeira implementação, 13/15 passaram: a fila retornava `conteudo_id` (ID, não conteúdo) e a view usa o helper `sbGetRevisaoProvaFilaIA` em vez do literal da rota. Ajustes nas **asserções**, sem relaxar a garantia: o texto da fila passou a ser verificado após remover o campo de ID, e a tela passou a ser verificada pelos helpers efetivamente importados.

### Correções guiadas pelos testes

- Harness PGlite precisou de `create schema auth` antes de `auth.sessao`.
- A RPC de fila é set-returning; o cliente de teste passou a tratá-la com `select * from` em vez de agregá-la em `jsonb`.
- `TIPOS_GERACAO_FASE5` é `Object.freeze([...])` no worker; o teste de não-regressão da Etapa 3 foi alinhado ao código real.
- Regressão detectada pela suíte completa: `tests/tutor-worker.test.mjs` proibia literalmente `Bearer ` no cliente. Como o bearer do **usuário** é o mecanismo seguro exigido pela Etapa 4, a asserção foi refinada para continuar proibindo chave embutida (`api_key`, `service_role`, bearer longo fixo).

### GREEN

| Comando | Resultado |
|---|---|
| `node --test tests/fase5-aprovacao-prova.test.mjs` | 15 testes, 15 passam, 0 falhas. |
| `npm test` | 238 testes, 238 passam, 0 falhas. |
| `npm run check` | 40 arquivos JavaScript analisados, 0 problemas reais. |

## Verificação no navegador

Servidor estático local em `http://127.0.0.1:4173` (fora do repositório), com o rewrite emulado para `/admin/provas-pendentes`:

1. **Bug real encontrado e corrigido:** `login.html` usava caminhos relativos; com o rewrite da Vercel, `/admin/style.css`, `/admin/js/main.js` etc. retornavam 404. `<base href="/">` resolveu — a rota agora carrega `window.nav` e `window.renderV` com **0 erros de console**.
2. Com um usuário professor em memória e stubs **apenas no runtime do navegador** (nenhum arquivo de produção alterado): listagem mostrou `Prova NR-35`, `Aguardando revisão`, `NR 35 — Trabalho em Altura`, `Data de Geração: 25/11/2026` e o botão **Revisar Prova**.
3. Modal abriu com `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, foco no botão de fechar e todos os trechos esperados: enunciado, alternativas, gabarito e justificativa, **Editar Questão**, **Aprovar e Publicar** e **Rejeitar**.
4. Editar o enunciado e salvar refletiu o novo texto na lista; **Aprovar e Publicar** chamou a rota de aprovação e fechou o modal.

## Garantias verificadas

| # | Garantia | Teste |
|---|---|---|
| 1 | Aprovação marca `publicado = true` e registra quem/quando em `ia_conteudos` e na auditoria. | `aprovar prova I.A. marca publicado=true e registra quem/quando` |
| 2 | Aprovação não distribui (Etapa 5 intacta). | `aprovar não preenche distribuido_por/distribuido_em (Etapa 5)` |
| 3 | Rejeição grava motivo, mantém `publicado = false` e auditoria. | `rejeitar prova I.A. grava motivo, impede publicação e auditoria` |
| 4 | Prova rejeitada não pode ser aprovada depois. | `prova rejeitada não pode ser aprovada depois` |
| 5 | Professor da Empresa A não aprova nem lê gabarito da Empresa B. | `professor da Empresa A não aprova nem lê prova da Empresa B` |
| 6 | Modal devolve questões/gabarito só a professor/admin; fila não vaza gabarito. | `revisão devolve questões e gabarito só para professor/admin da empresa` |
| 7 | Edição persiste enunciado/alternativas/gabarito com auditoria. | `edição persiste enunciado, alternativas e gabarito com auditoria` |
| 8 | Gabarito fora das alternativas é rejeitado. | `edição rejeita gabarito fora das alternativas` |
| 9 | Rotas POST exigem JWT, usam anon key, `no-store`, 401/405/400 e resposta mínima. | `rota POST /aprovar ...` e `rota POST /rejeitar ...` |
| 10 | Tela traz cards/modal/ações, sanitiza e não usa `prompt()`/`confirm()`. | `tela HITL traz cards, modal, edição e ações sem prompt()/confirm()` |
| 11 | Rota SPA registrada no app e no rewrite. | `rota /admin/provas-pendentes é registrada no SPA e no rewrite` |
| 12 | Cliente usa JWT do chamador e não expõe segredo. | `cliente usa JWT do chamador nas ações e não expõe gabarito na fila` |
| 13 | Migration é forward-only e protege gabarito/auditoria. | `migration da Etapa 4 é forward-only e protege gabarito/auditoria` |
| 14 | Etapa 3 preservada: fila sem conteúdo e dispatcher sem `PALESTRA`. | `Etapa 3 permanece intacta: fila sem conteúdo e dispatcher sem PALESTRA` |
| 15 | Navegador: rota, cards, modal e ações funcionais, sem erros de console. | Verificação manual com servidor local e stubs de runtime |

## Limites desta etapa

- Nenhuma migration foi aplicada ao Supabase remoto; nenhum deploy foi feito na Vercel; nenhum commit/push foi realizado.
- Distribuição da prova para turma/aluno, escolha de destino e notificação pertencem à Etapa 5.
- Videoaulas, fluxo de currículo e `PALESTRA` permanecem intactos.
- A validação no navegador usou stubs de runtime: a integração real depende da aplicação da migration e do deploy autorizado na Etapa 8.
