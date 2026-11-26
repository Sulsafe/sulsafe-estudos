# RELATÓRIO FINAL — FASE 5.3

**Data:** 25/11/2026  
**Escopo:** implementação local. Nenhuma migration desta fase foi aplicada em produção e nenhum deploy foi feito.

## 1. Objetivo

Notificar professores/admins sobre ações do aluno, colocar a nota da prova I.A. sob controle Human-in-the-Loop (HITL) e entregar a tela **Progresso dos Alunos** para Professor/Admin. A I.A. continua calculando a nota; o aluno só a vê depois da revisão e liberação do professor.

## 2. Jornadas cobertas

1. **Aluno conclui videoaula, finaliza prova I.A. ou envia PDF** → professores/admins ativos da mesma empresa são notificados uma única vez, com link útil.
2. **Aluno finaliza prova** → vê exatamente `Prova enviada! Aguarde a revisão do professor para ver sua nota.`; nota e acertos não são devolvidos ao navegador.
3. **Professor revisa** → vê a nota calculada pela I.A., ajusta se necessário, clica em `Liberar Nota` → nota publicada no boletim e aluno notificado uma vez.
4. **Professor/Admin abre Progresso dos Alunos** → vê videoaulas, status das provas, último acesso e filtra por turma/aluno, sem sair da própria empresa.

## 3. Entregas

### Banco (forward-only, validado em PGlite)

- `supabase/migrations/20261125110000_fase5_3_gate_hitl.sql`
  - Colunas em `provas_progresso`: `liberado`, `liberado_por`, `liberado_em`, `nota_ia`.
  - Tabela de dedupe `public.notificacoes_eventos` com `chave` como PK.
  - Helper `sulsafe_usuario_empresa_id(uuid)` e RPC `sulsafe_notificar_evento(...)` com empresa do JWT de `auth.users.raw_app_meta_data`.
  - Triggers: conclusão de videoaula → `progresso-alunos`; envio de PDF → `provas-pendentes-ia`; finalização de prova I.A. → `provas-resultados-ia|<provaId>`.
  - RPCs: `sulsafe_submeter_prova_aluno_ia(uuid, jsonb)` revisada (resposta sem nota), `sulsafe_nota_aluno_ia(uuid)`, `sulsafe_revisar_liberar_nota_ia(uuid, uuid, numeric)` e `sulsafe_listar_progresso_alunos(uuid, uuid)`.
  - `notas.origem_chave` com índice único parcial e constraint de auditoria com `LIBERADO`.
- `supabase/migrations/20261125110100_fase5_3_gate_hitl_backfill.sql`
  - Publica histórico `CONCLUIDA` como `liberado = true`, preenche `nota_ia` e evita duplicar `notas.origem_chave`.

### API, cliente e interface

- `api/aluno/provas/[id]/submeter.mjs`: resposta com `nota: null`, `liberado: false`, `total`, `quantidade_questoes`, `status` e a mensagem exata de aguardo.
- `js/views/prova-aluno-ia.js`: remove “Nota parcial”; instruções e confirmação passam a falar em revisão do professor.
- `js/supabase-client.js`: novos helpers `sbLiberarNotaIA`, `sbListarProgressoAlunos` e `sbNotaAlunoIA`.
- `js/views/provas-resultados-ia.js`: mostra `Nota calculada pela I.A.`, campo de nota final ajustável e botão `Liberar Nota`; salva correções discursivas pendentes antes de publicar.
- `js/progresso-alunos-core.js`: normalização dos status `AGUARDANDO REVISÃO` / `NOTA LIBERADA`, progresso 0–100 e formatação de último acesso.
- `js/views/progresso-alunos.js`: tela com tabela acessível, filtros por turma/aluno, `aria-live` e tratamento de vazio/erro.
- `js/main.js`: registro da view `progresso-alunos`, rota `/professor/progresso`, iniciador automático e exposição de `window.abrirResultadosProva`.
- `js/app.js`: `progresso-alunos` entra na allowlist; links no formato `view|parâmetro` continuam validados antes de navegar.
- `js/views/professor.js`: aba **Progresso dos Alunos** na Área do Professor.
- `package.json`: novo arquivo de teste registrado no script `test`.

## 4. Evidência TDD

| # | Garantia | Evidência | Resultado |
|---|---|---|---|
| 1 | Conclusão de aula notifica professores/admins da empresa com link do progresso | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 2 | Reprocessar o mesmo evento não duplica notificação | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 3 | Prova I.A. finalizada avisa o professor e não devolve nota ao aluno | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 4 | PDF enviado avisa o professor e é deduplicado | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 5 | Nota fica oculta até liberação | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 6 | Ajuste + liberação publica boletim e notifica o aluno uma vez | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 7 | Isolamento por empresa na liberação e na listagem | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 8 | Tela carrega alunos, status e filtros | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 9 | Fluxos Professor → Aluno permanecem e nova UI expõe textos/ações | `tests/fase5-3-notificacoes-hitl.test.mjs` | PASS |
| 10 | Contrato legado de submissão sem nota na resposta | `tests/fase5-realizacao-prova.test.mjs` | PASS (9/9) |
| 11 | Allowlist de links de notificação não foi enfraquecida | `tests/hardening-seguranca.test.mjs` | PASS (13/13) |

**RED válido:** antes da implementação, `node --test tests/fase5-3-notificacoes-hitl.test.mjs` executou 9 testes com **0 pass / 9 fail**, pela ausência das colunas, RPCs, triggers, helpers e arquivos de UI.

**GREEN:** após a implementação, o mesmo comando terminou com **9 pass / 0 fail**.

## 5. Gates executados

| Gate | Comando | Resultado |
|---|---|---|
| Teste direcionado da fase | `node --test tests/fase5-3-notificacoes-hitl.test.mjs` | 9/9 PASS |
| Regressão de realização de prova | `node --test tests/fase5-realizacao-prova.test.mjs` | 9/9 PASS |
| Segurança de notificações | `node --test tests/hardening-seguranca.test.mjs` | 13/13 PASS |
| Suíte completa | `npm test` | **307 testes, 307 pass, 0 fail** |
| Auditoria de imports | `npm run check` | 50 arquivos, 0 problemas |
| Sintaxe dos arquivos alterados | `node --check` em 7 arquivos JS/MJS | limpo |

Durante a suíte completa surgiu uma falha transitória no teste legado `link de notificação passa por allowlist antes de navegar`: ele exige literalmente `LINKS_NOTIFICACAO.has(linkBruto)`. O suporte ao sufixo `|parâmetro` foi reescrito mantendo esse identificador, e a suíte final ficou verde.

## 6. Segurança e isolamento

- Empresa do destinatário e do chamador vem de `app_metadata.empresa_id`/`auth.users.raw_app_meta_data`; `profiles.empresa_id` não é usado.
- RPCs de escrita/leitura são `SECURITY DEFINER` com `search_path` vazio e validam papel ativo + empresa.
- Dedupe usa chave primária em `notificacoes_eventos`; reprocessar evento não gera nova linha nem nova notificação.
- `notas.origem_chave` única por prova/aluno evita publicação duplicada no boletim.
- Link de notificação continua passando por allowlist; o parâmetro opcional após `|` nunca vira JS inline.

## 7. Fora do escopo

- Sem deploy, sem aplicação de migrations em produção e sem alteração na Fase 5.2 já publicada.
- Sem Playwright/E2E de navegador: o repositório não possui esse gate. A UI foi validada por testes estáticos, parsed `node --check` e pela suíte PGlite.
- Antes de qualquer publicação futura, aplicar as duas migrations em ambiente controlado e repetir a validação com dados reais de empresa/turma.
