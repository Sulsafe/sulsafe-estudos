# Relatório — Fase 5, Etapa 5.2: integração da geração I.A. na Área do Professor e dashboard unificado do aluno

**Data:** 25/11/2026  
**Escopo:** somente código local, migrations locais, testes e documentação. Sem push, migration remota, deploy ou alteração de dados em produção.

## Escopo entregue

### Área do Professor unificada

- Nova aba **Provas da IA** em `js/views/professor.js`, com:
  - fila HITL existente reaproveitada por `htmlFilaProvasPendentes()` / `iniciarFilaProvasPendentes()`;
  - lista de provas aprovadas, com selo **Aprovada pela IA** e botão **Distribuir prova**;
  - reuso direto de `abrirDistribuicaoProvaIA()` — o mesmo fluxo `TURMA / ALUNO / CATÁLOGO / INTERNO` da Etapa 5.
- A aba **Provas** passa a marcar provas com `origem = 'IA_TUTOR'` como **Aprovada pela IA**, mantendo a criação manual intacta.
- Nova aba **Palestras** com:
  - formulário de criação manual;
  - conversão de rascunho `PALESTRA` aprovado do Tutor em palestra revisável (`origem = 'IA_TUTOR'`);
  - aprovação HITL (`publicado = true`, sem destinatário);
  - distribuição em modal acessível com os quatro destinos; **Uso Pessoal** = `INTERNO`, sem vínculo e sem notificação.
- Botão **Criar com o TUTOR-SulSafe** continua abrindo o chat. Após gerar, o Tutor redireciona para `professor` na aba `provasIa` (PROVA) ou `palestras` (PALESTRA).
- `S.profTabAtiva` e `nav(view, opcoes)` permitem abrir a Área do Professor já na aba correta; a aba padrão continua `videoaulas`.

### Dashboard unificado do aluno

- Nova rota `/aluno/dashboard` (`aluno-dashboard` no SPA), registrada em `js/main.js`, com rewrite em `vercel.json` e item **Meu Painel** na sidebar do aluno.
- Cards **Meus Cursos**, **Provas Pendentes** e **Palestras Disponíveis**.
- Provas da I.A. e provas manuais são mescladas por `prova_id` em `js/dashboard-aluno-core.js`, sem duplicatas e com prioridade para o rótulo da I.A.
- Palestras exibidas vêm somente de `palestras_distribuicoes` via RPC `sulsafe_listar_palestras_aluno()`.
- Todos os textos dinâmicos passam por `escapeHTML` / `sanitizar`; o link `aluno-dashboard` entrou na allowlist de notificações em `js/app.js`.

### Banco (local, forward-only)

- `supabase/migrations/20261125100000_fase5_2_palestras.sql`:
  - tabelas `palestras` e `palestras_distribuicoes`, chave única `(palestra_id, aluno_id)` e índice único parcial por `ia_conteudo_id`;
  - RLS nas duas tabelas, `revoke all` de `anon`/`authenticated` e somente `grant select`;
  - seis RPCs `SECURITY DEFINER` com `set search_path = ''`: criar manual, criar da I.A., aprovar, distribuir, listar para professor e listar para aluno;
  - `empresa_id` herdado de `ia_conteudos.empresa_id` via `ia_conteudo_id` ou do claim do JWT — **nenhuma coluna nova em tabelas acadêmicas**;
  - `INTERNO` não cria entregas, não notifica e mantém `distribuido_por`/`distribuido_em` nulos; pode ser distribuído depois;
  - distribuição real é única, transacional, isolada por empresa e notifica um aluno por vínculo com `link = 'aluno-dashboard'`.

## Decisões aplicadas

- **AC-001:** o HITL de provas foi reaproveitado, sem duplicar a tela de revisão; a antiga rota administrativa continua funcionando.
- **AC-002:** aprovar muda `publicado` para `true` e deixa a prova "pronta para distribuir", sem destino e sem carimbos de entrega; distribuir continua sendo ato separado.
- **AC-003:** após a geração, o Tutor chama `nav('professor', { tab: 'provasIa' })` ou `nav('professor', { tab: 'palestras' })`.
- **AC-004:** **Uso Pessoal** equivale a `INTERNO`; **Distribuir** equivale a `TURMA`, `ALUNO` ou `CATÁLOGO`. Admin não é exceção: vale o mesmo gerenciamento da turma/prova da Etapa 5.
- **AC-005:** o dashboard do aluno unifica I.A. e criação manual em um único painel, sem duplicatas.
- **AC-006:** gates locais verdes (ver abaixo).
- O worker da Fase 5 continua despachando somente `PROVA` e `MODULO`; `PALESTRA` segue o fluxo legado e agora ganha apenas a tela integrada na Área do Professor.
- Nenhuma migration já aplicada foi editada; a migration 5.2 é nova e não foi aplicada ao remoto.

## Validação executada

### Testes automatizados

| Comando | Resultado |
|---|---|
| `node --test tests/fase5-etapa5-2.test.mjs` | **14/14** passes (GREEN; RED anterior com 5 falhas intencionais) |
| `npm test` | **295/295** passes |
| `npm run check` (`node auditar-imports.mjs`) | **48 arquivos JavaScript, 0 problemas reais** |

Cobertura do arquivo de teste 5.2:

1. migration forward-only, RLS, grants e nenhum `service_role`;
2. aprovar palestra publica sem distribuir;
3. `INTERNO` não cria vínculo nem notificação e permite distribuir depois;
4. distribuição idempotente e sem alcance entre empresas;
5. aluno vê somente palestras distribuídas da própria empresa;
6. rascunho `PALESTRA` do Tutor vira palestra I.A. uma única vez;
7. `authenticated` não grava diretamente nas tabelas de palestras;
8. status/cards mostram "pronta para distribuir" e "Uso Pessoal";
9. dashboard mescla I.A. e manual sem duplicata;
10. aba Provas da IA reaproveita o HITL e marca aprovadas na aba Provas;
11. Tutor redireciona para a aba correta;
12. rota/sidebar/rewrite do dashboard registrados;
13. cliente expõe os seis helpers sem segredo;
14. novas views sem `prompt()`/`confirm()` e sem `onclick` interpolado.

### Verificação manual de código

- Views novas lidas e revisadas: sem interpolação de dado do usuário em `onclick`, sem chave de serviço e sem escrita direta via `supabase-js` (`sb.*`).
- Erros de sintaxe e imports corrigidos antes da execução dos gates; `npm run check` confirma os imports.
- Não houve UAT em navegador nesta etapa: a validação foi PGlite + leitura de fonte, sem chamadas ao Supabase remoto.

## Arquivos criados

- `supabase/migrations/20261125100000_fase5_2_palestras.sql`
- `js/palestras-core.js`
- `js/dashboard-aluno-core.js`
- `js/views/palestras-professor.js`
- `js/views/aluno-dashboard.js`
- `tests/fase5-etapa5-2.test.mjs`
- `RELATORIO_FASE5_ETAPA5_2.md`

## Arquivos alterados

- `js/views/professor.js`
- `js/views/provas-pendentes-ia.js`
- `js/views/provas-distribuicao-ia.js`
- `js/views/tutor.js`
- `js/supabase-client.js`
- `js/state.js`
- `js/main.js`
- `js/app.js`
- `vercel.json`
- `package.json`
- `DECISIONS_SULSAFE.md`

## Estado de entrega

- Migration **não** aplicada ao Supabase remoto (`acqbidvknbqppkjidvsq`).
- **Nenhum** deploy na Vercel e **nenhuma** chave/variável alterada.
- **Nenhum** commit ou push: esta pasta não é repositório git ativo.
- Fase 5 (Etapas 1–8) e deploys anteriores permanecem como histórico, sem revert.
- Para publicar: aplicar a migration nova em janela própria, fazer deploy do front e homologar a aba de palestras e o dashboard com o aluno de teste. Só com nova autorização explícita.
