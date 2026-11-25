# RELATORIO_FINAL_FASE5.md — Smoke completo de produção (25/11/2026)

## 1. Escopo

Homologação final da Fase 5 em `https://www.sulsafe.com.br`, projeto Supabase `acqbidvknbqppkjidvsq` (`supabaseSulsafe`) e Vercel `sulsafe-estudos-4ppk`.

Objetivo: validar em produção os quatro destinos de distribuição (`INTERNO`, `ALUNO`, `TURMA`, `CATALOGO`), a realização da prova pelo aluno, o cálculo da nota e a visualização do resultado pelo professor/admin.

Não houve alteração de código, migration, `vercel.json` ou variáveis de ambiente nesta rodada. Todas as mutações foram **somente dados de homologação** em produção.

---

## 2. Preparação do aluno e da turma de teste

| Item | Valor |
|---|---|
| Empresa | `SulSafe Homologacao` — `9b1dc8db-dc1b-4109-9071-5423346de35e` (ativa) |
| Aluno | `c4e6f5a1-0c2d-4b3e-9f87-2a1b6d5e4c30` — `Aluno Smoke Fase 5` |
| Claim JWT | `app_metadata.empresa_id = 9b1dc8db-dc1b-4109-9071-5423346de35e` |
| Perfil | `role = aluno`, `status = ativo` |
| Turma | `b7e2c1a4-5d63-4f08-9a21-7c3e8f4b6d90` — `Turma Smoke Fase 5` (1 aluno) |
| Admin de homologação | `9fd31d05-8a57-4f8e-9d64-3b002edcdab4` |

A conta foi criada por SQL direto em `auth.users`; o trigger `on_auth_user_created` criou o perfil como `pendente`. A ativação foi feita por PATCH autenticado com o JWT do Admin, para respeitar RLS/trigger. O login do aluno falhou inicialmente com HTTP 500 do GoTrue (`Database error querying schema`); após alinhar as colunas de token da conta de teste com as da conta Admin, `POST /auth/v1/token?grant_type=password` retornou HTTP 200 com `sub = c4e6f5a1-...` e o claim de empresa correto.

Validação com JWT do aluno:

- `sulsafe_conta_ativa()` → `true`
- `sulsafe_empresa_id()` → `9b1dc8db-dc1b-4109-9071-5423346de35e`

---

## 3. Provas aprovadas e distribuição

A prova original NR-10 (`60be610d-35dd-4fa2-b8c0-2d2ec6928b9e`) já estava aprovada e com `destino_tipo = INTERNO` desde o deploy anterior. Como `sulsafe_prova_distribuivel` exige `distribuido_por IS NULL`, foram criadas **duas cópias controladas** da mesma NR-10, somente em dados, para testar `TURMA` e `CATALOGO` sem reaproveitar uma prova já entregue.

| Destino | Prova | Distribuída em (UTC) | Vínculo em `provas_distribuicoes` |
|---|---|---|---|
| `ALUNO` | `60be610d-35dd-4fa2-b8c0-2d2ec6928b9e` — `Prova de NR-10` | `2026-11-25 18:48:13.702803+00` | `aluno_id = c4e6f5a1-...`, `destino_id = c4e6f5a1-...` |
| `TURMA` | `4e0a8d53-9c64-4f3b-9d2d-8c3f7a5e9c63` — `Prova de NR-10 - Turma Smoke Fase 5` | `2026-11-25 18:56:33.807479+00` | `aluno_id = c4e6f5a1-...`, `destino_id = b7e2c1a4-...` |
| `CATALOGO` | `713c0e86-cf97-426e-8a50-bf62828fcf96` — `Prova de NR-10 - Catalogo Smoke Fase 5` | `2026-11-25 18:56:49.886413+00` | `aluno_id = c4e6f5a1-...`, `destino_id = null` |

Antes da distribuição, as RPCs com JWT do Admin retornaram `sulsafe_prova_distribuivel = true` para as duas provas copiadas, e `sulsafe_listar_provas_aprovadas_ia()` listou as três provas elegíveis.

As três distribuições foram feitas pela interface de produção em `/admin/provas-distribuicao`. Cada card passou para **“Distribuída / Já distribuída”** e a tela exibiu `Prova distribuída e alunos notificados.` A distribuição `ALUNO` teve a chamada `POST /api/tutor/provas/:id/distribuir` confirmada com HTTP 200; para as duas cópias, a inspeção direta de rede falhou, mas o estado persistido, a mensagem de sucesso e a auditoria confirmam a operação. O console do navegador não registrou erros.

Auditoria em `provas_revisao_auditoria`:

- `DISTRIBUIDO` — `ALUNO — 1 aluno(s)` — `18:48:13Z`
- `DISTRIBUIDO` — `TURMA — 1 aluno(s)` — `18:56:33Z`
- `DISTRIBUIDO` — `CATALOGO — 1 aluno(s)` — `18:56:49Z`

Todas com `actor_id = 9fd31d05-...`.

---

## 4. Realização da prova, nota e persistência

Login do aluno feito pela tela de produção. Em `Minhas Provas`, a prova `Prova de NR-10` apareceu em **“Avaliações I.A. para você”** com ação **“Realizar prova”**.

- A prova carregou 5 questões objetivas.
- Gabarito conferido somente fora da interface do aluno: `A`, `C`, `C`, `B`, `B`.
- Envio confirmado pelo modal acessível (`Confirmar envio`), sem `prompt()`/`confirm()`.
- Resposta da aplicação: **“Prova finalizada”**, `Nota parcial: 5 de 5 pontos.`, `Acertos: 5 de 5 questões objetivas.`

Persistência em `provas_progresso`:

| Prova | Aluno | Status | Nota | Concluída em (UTC) |
|---|---|---|---|---|
| `60be610d-35dd-4fa2-b8c0-2d2ec6928b9e` | `c4e6f5a1-...` | `CONCLUIDA` | `5.00` | `2026-11-25 18:50:49.077819+00` |

Auditoria: `SUBMETIDO` — `Correção automática: 5.00 de 5.00 pontos` — actor `c4e6f5a1-...`.

A submissão pela interface concluiu sem erro e o console do navegador permaneceu limpo.

---

## 5. Painel do professor / admin

A tela `/admin/provas-resultados?prova=60be610d-35dd-4fa2-b8c0-2d2ec6928b9e` carregou sem erro e exibiu:

| Nome | Status | Nota | Data de Conclusão |
|---|---|---|---|
| `Aluno Smoke Fase 5` | `CONCLUIDA` | `5.00` | `25/11/2026` |

Console do navegador: nenhum erro.

Validação adicional por RPC com JWT do Admin:

| Prova | Situação no painel |
|---|---|
| `60be610d-...` (ALUNO) | `CONCLUIDA`, nota `5.00`, `concluido_em = 18:50:49Z` |
| `4e0a8d53-...` (TURMA) | `PENDENTE`, nota `null` |
| `713c0e86-...` (CATALOGO) | `PENDENTE`, nota `null` |

As duas últimas estão `PENDENTE` porque foram distribuídas apenas para validar o destino; não foram respondidas. Isso é o comportamento esperado.

---

## 6. Isolamento e gabarito

Com o JWT do aluno:

- `sulsafe_listar_provas_aluno_ia()` devolveu exatamente as três provas distribuídas, cada uma com `distribuido_em` preenchido.
- `sulsafe_carregar_prova_aluno_ia()` devolveu 5 questões para as provas de `TURMA` e `CATALOGO`.
- A serialização das respostas não continha `gabarito`, `resposta_correta` nem `justificativa`.

O acesso exige `sulsafe_conta_ativa()`, papel `aluno`, mesma empresa do claim e vínculo real em `provas_distribuicoes`. Nenhuma chamada usou `service_role` no navegador.

---

## 7. Evidências e limitações

Evidências coletadas:

- `npx supabase db query --remote --read-only` para empresa, aluno, turma, provas, vínculos, progresso, auditoria e notificações.
- REST do Supabase com JWT real para login e RPCs (`sulsafe_prova_distribuivel`, `sulsafe_listar_provas_aprovadas_ia`, `sulsafe_listar_provas_aluno_ia`, `sulsafe_carregar_prova_aluno_ia`, `sulsafe_listar_resultados_prova_ia`).
- Snapshot de DOM nas telas de distribuição, realização e resultados, com console sem erros; a captura de rede direta ficou indisponível para as duas distribuições copiadas, compensada por SQL e auditoria.

Limitações:

- A API de captura de tela do navegador não conseguiu fotografar a janela desktop invisível; por isso as evidências visuais foram substituídas por texto do DOM, status de rede e console.
- Senhas de teste e chaves reais não foram registradas neste relatório nem em arquivos do repositório.

---

## 8. Ressalvas e limpeza

- Os dados de homologação permanecem em produção: 1 aluno, 1 turma, 3 provas, 3 vínculos de distribuição, notificações e registros de auditoria. Devem ser removidos em janela própria se a SulSafe desejar limpar o ambiente.
- As duas provas copiadas são réplicas da NR-10, com títulos sufixados por `Turma Smoke Fase 5` e `Catalogo Smoke Fase 5`; elas não representam novo conteúdo pedagógico.
- `INTERNO` havia sido homologado no deploy anterior; `ALUNO`, `TURMA` e `CATALOGO` foram homologados nesta rodada.

---

## 9. Veredito

**PASS — Fase 5 homologada em produção.**

Todos os critérios foram atendidos: os quatro destinos de distribuição criam vínculos e notificações corretos; o aluno realiza a prova e recebe nota automaticamente; o resultado aparece no painel do professor/admin; o gabarito não é exposto ao aluno; não houve erro de console nem alteração de código/migration nesta rodada.

A ressalva registrada em D-TUTOR-38 (`TURMA`/`ALUNO`/`CATALOGO` não homologados por falta de alunos) está **superada** por D-TUTOR-39.
