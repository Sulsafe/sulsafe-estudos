# Relatório — Fase 5, Etapa 3.1: quantidade de questões na geração de provas

## Escopo entregue

- O formulário **Criar com o TUTOR-Sulsafe** (`js/views/tutor.js`) agora oferece o tipo **PROVA** e um seletor **5 / 10 / 20 / 30 / 50 questões**, visível somente para esse tipo. O padrão continua 10, preservando o fluxo já homologado de matéria/curso/palestra.
- `montarPromptBaseFase5()` em `js/tutor-sulsafe.js` monta o `prompt_base` com PROVA sem alterar `montarPromptTutor()` nem `TIPOS_TUTOR` legados.
- `sbCriarJobTutor()` envia `p_quantidade_questoes`; a RPC `sulsafe_criar_ia_job` persiste `ia_jobs.quantidade_questoes` com `CHECK (1..50)`.
- A Edge Function lê a coluna do job e repassa a quantidade ao dispatcher; `montarPromptFase5()` produz a instrução explícita **`Gere exatamente N questões...`** e o gerador/stub recebe as mesmas opções.
- O contrato Zod (`js/tutor-contratos-fase5-core.js`) valida `.length(N)` e bloqueia valores fora de 1..50 antes de qualquer escrita. O rascunho registra `quantidade_questoes` para auditoria.

## Decisões aplicadas

- **Limite de segurança:** 50 questões por prova, imposto em quatro camadas — seletor do front, `CHECK` da migration, validação da RPC e normalização no worker/contrato. Um pedido de 100 é rejeitado antes de montar o prompt ou gravar anything.
- **Forward-only:** nova migration `20261125060000_etapa3_1_quantidade_questoes.sql`. Nenhuma migration aplicada foi editada, nenhuma tabela foi recriada e nenhum dado foi apagado. O overload de 5 argumentos é substituído por um de 6 com `DEFAULT`, então chamadas legadas continuam funcionando.
- **Compatibilidade:** `MATERIA`, `CURSO`, `PALESTRA` e o dispatcher de `MODULO` seguem com o mesmo prompt, contrato e comportamento de antes. PALESTRA permanece no fluxo legado da Edge Function.
- **Chamadas sensíveis:** RPC `SECURITY DEFINER` com `search_path = ''`, RBAC e empresa do JWT; nenhuma chave de API no navegador, em log ou na resposta.
- **HITL inalterado:** a prova gerada continua `publicado = false` até aprovação humana; a quantidade não autoriza publicação nem distribuição.

## Validação executada

### Testes automatizados

- `node --test tests/fase3-1-quantidade-questoes.test.mjs`: **8/8** testes passando.
- `npm test`: **269/269** testes passando (suíte da Etapa 3.1 registrada no script).
- `npm run check` (`node auditar-imports.mjs`): **42 arquivos JavaScript, 0 problemas reais**.

Cobertura da suíte da Etapa 3.1: constantes e normalização (padrão 10, teto 50, 0 e 100 rejeitados); migration com coluna/`CHECK`/novo overload e sem comandos destrutivos; prompt base e prompt da Edge Function com `Gere exatamente 20 questões`; Zod aceitando 20 e rejeitando 19 e 100; front com seletor e envio de `p_quantidade_questoes`; integração PGlite com **20 questões persistidas** (`ordem` 1..20 e `conteudo.quantidade_questoes = 20`); e **100 bloqueados** na RPC e no worker com zero gravações.

### Regressão

- `tests/fase5-geracao-prova.test.mjs`, `tests/fase5-contratos.test.mjs`, `tests/fase5-realizacao-prova.test.mjs`, `tests/tutor-sulsafe.test.mjs`, `tests/tutor-worker.test.mjs`, `tests/empresas-convite.test.mjs` e `tests/ia-jobs-conteudos.test.mjs` permanecem verdes.
- Etapas 1–6 da Fase 5 intactas: 261 testes anteriores + 8 novos = 269.

## Arquivos alterados/criados

- `supabase/migrations/20261125060000_etapa3_1_quantidade_questoes.sql` (nova)
- `tests/fase3-1-quantidade-questoes.test.mjs` (novo)
- `js/tutor-contratos-fase5-core.js`, `js/tutor-sulsafe.js`, `js/views/tutor.js`, `js/supabase-client.js`
- `supabase/functions/tutor-sulsafe/index.ts`, `supabase/functions/tutor-sulsafe/processar-job-fase5.js`
- `package.json`, `ROADMAP_SULSAFE.md`, `DECISIONS_SULSAFE.md`, `RELATORIO_FASE5_ETAPA3_1.md`

## Estado de entrega

- **Não** foi aplicada migration ao Supabase remoto.
- **Não** houve deploy na Vercel nem atualização da Edge Function em produção.
- **Não** houve commit nem push (a pasta não é repositório git ativo).
- Restam pendentes, conforme o roadmap: tela administrativa de acompanhamento, correção manual/HITL de discursivas e autorização para migration/deploy (Etapas 7 e 8).
