# DECISIONS_SULSAFE.md — Registro de decisões da SulSafe

Documento de governança da Etapa 01 (fundação, baseline e auditoria consolidada).
Toda decisão aqui registrada é **local**. Nenhuma migration remota, push ou deploy foi aplicado.

---

## DEC-001 — Versão canônica do `@supabase/supabase-js` (DECIDIDA)

**Status:** DECIDIDA e aplicada.

**Decisão:** fixar a versão **2.118.0** em todos os pontos de uso, sem `^`, sem `@latest` e sem range.

| Ponto de uso | Antes | Depois |
|---|---|---|
| `js/supabase-client.js:6` (CDN esm.sh) | `2.39.0` | `2.118.0` |
| `package.json` (`dependencies`) | `^2.45.0` | `2.118.0` |
| `package-lock.json` (raiz e pacote instalado) | `^2.45.0` / `2.118.0` | `2.118.0` / `2.118.0` |

**Motivo:** o navegador carregava `2.39.0` enquanto o Node e o lockfile já resolviam `2.118.0`. Isso quer dizer que o código testado não era o código executado pelo usuário. A versão `2.118.0` já estava instalada e travada no lockfile — alinhá-la é a menor alteração possível: **não é um upgrade novo**, é a eliminação da divergência. Subir para uma versão além dessa não era necessário e foi evitado.

**Por que não fixar em 2.45.0:** exigiria downgrade do lockfile (que já entrega 2.118.0) e reintroduziria correções de segurança publicadas entre 2.45 e 2.118.

**Regra daqui em diante:** qualquer alteração de versão deve mudar os três pontos acima no mesmo commit e atualizar o teste de regressão em `tests/hardening-seguranca.test.mjs` ("supabase-js tem versão única, fixa e idêntica em CDN, package.json e lockfile"). Não usar `npm update` sem revisão.

**Teste de regressão:** `tests/hardening-seguranca.test.mjs`.

---

## DEC-002 — Modelo multiempresa (DECIDIDA — OPÇÃO C)

**Status:** DECIDIDA PELO PROPRIETÁRIO em 24/11/2026 e implementada na Fase 1 do roadmap.

**Decisão:** adotar a **Opção C — meio-termo**. `empresa_id` em `ia_jobs` e `ia_conteudos` (e futuramente `transacoes`); o catálogo das 38 NRs permanece global; conteúdo gerado pelo Professor I.A é isolado por RLS por empresa.

**Origem da empresa:** claim `app_metadata.empresa_id` do JWT, lido por `public.sulsafe_empresa_id()`. Não foi adicionada coluna em `profiles` e nenhuma tabela acadêmica existente foi alterada. Contas sem o claim ficam com `empresa_id = null` e só são visíveis para administradores — o que mantém o comportamento atual intacto até que o vínculo empresa usuário seja definido. A forma de gravar esse claim foi decidida depois, em **D-TUTOR-11 (Opção A)**.

**Entrega:** `supabase/migrations/20261124010000_ia_jobs_conteudos.sql` + `tests/ia-jobs-conteudos.test.mjs`. Nenhuma migration foi aplicada ao Supabase remoto.

A SulSafe hoje é organizada por papéis (ADMIN / PROFESSOR / ALUNO), não por tenant. O Professor I.A será cobrado à parte por empresa, então foi necessário decidir onde a empresa entra no modelo de dados antes da Fase 1 do roadmap.

### Opção A — Isolamento real por `empresa_id` com RLS

Cada empresa é um tenant completo. Todas as tabelas acadêmicas ganham `empresa_id` e toda policy filtra por ele.

- **Prós:** isolamento forte; atende contratos corporativos com exigência de segregação; Auditável por empresa; próximo do modelo da MR.
- **Contras:** mudança grande e arriscada em todas as migrations e no front; exige definir quem cria a empresa, quem é dono e como um aluno migra de empresa; pode quebrar o catálogo global de 38 NRs se aplicado sem critério; alto custo de implementação agora.

### Opção B — Apenas rótulo comercial

Conteúdo global para todos; a empresa aparece só como texto em `transacoes` e na comunicação comercial.

- **Prós:** zero mudança de esquema; zero risco para o que já está no ar; cobrança manual continua simples.
- **Contras:** nenhum isolamento real; não permite atribuir cursos gerados por empresa; não escala para contratos corporativos; auditoria por empresa fica frágil (texto livre).

### Opção C — Meio-termo (RECOMENDAÇÃO TÉCNICA)

`empresa_id` em `transacoes`, `ia_jobs` e `ia_conteudos` para cobrança e auditoria; **conteúdo das 38 NRs permanece global**; conteúdo gerado pelo Professor I.A é isolado por RLS por empresa.

- **Prós:** resolve a necessidade imediata (cobrança e rastreabilidade do Professor I.A); preserva o catálogo público de NRs; introduz RLS só onde há dado gerado/pago; implementação incremental na Fase 1; mantém a regra de negócio atual intacta.
- **Contras:** ainda exige definir a role/claim que identifica a empresa do usuário; dois modelos de visibilidade convivendo (global e por empresa) exigem documentação clara para o suporte.

**Recomendação do construtor:** Opção C. Ela entrega isolamento onde há risco real (conteúdo pago e gerado) sem refatorar a fundação que já está estável. A Opção A deve ser reconsiderada apenas se um contrato corporativo exigir segregação de dados acadêmicos completos.

**Pendência decorrente (não bloqueante para a Fase 1):** definir como o claim `app_metadata.empresa_id` é gravado quando uma empresa for cadastrada, e se um usuário pode pertencer a mais de uma empresa. Enquanto isso não é decidido, a regra implementada é **uma empresa por usuário, vinda do JWT**.

---

## DEC-003 — Cadastro público e verificação de e-mail (PENDENTE)

**Status:** AGUARDANDO DECISÃO. Parcialmente endereçado: `config.toml` local agora exige senha de 12 caracteres com complexidade e `enable_confirmations = true`.

Ainda depende de decisão: o ingresso na SulSafe deve ser **por convite/aprovação do ADMIN** (o fluxo de `profiles.status = 'pendente'` sugere que sim) ou **cadastro livre**?

- **Recomendação:** manter `enable_signup = true` apenas no Supabase local de desenvolvimento; no remoto, desabilitar cadastro público e usar convites, já existe tela de pendentes de aprovação.
- **Não alterado aqui:** aplicar `config.toml` ao projeto remoto depende de autorização de deploy.

---

## DEC-004 — MFA obrigatório para roles administrativas (PENDENTE)

**Status:** AGUARDANDO DECISÃO. TOTP foi habilitado no `config.toml` local (`enroll_enabled`/`verify_enabled = true`), mas **não** foi criada policy que exija MFA para ADMIN/SUPER_ADMIN.

- **Motivo da pendência:** exigir MFA por role pode tratar usuários já cadastrados sem fator configurado. Precisa de decisão de produto: exigência imediata com bloqueio, ou período de transição com aviso.
- **Recomendação:** período de transição de 30 dias com aviso no dashboard, depois exigência para `admin`/`super_admin`.

---

## DEC-005 — Aplicação da configuração de segurança ao projeto remoto (PENDENTE)

**Status:** AGUARDANDO AUTORIZAÇÃO.

`supabase/config.toml`, `vercel.json` e a migration `20261124000000_endurece_default_privileges.sql` estão prontos localmente. Nenhum foi aplicado ao Supabase remoto nem publicado. A aplicação depende de autorização expressa de deploy (fora de escopo da Etapa 01).

---

## D-TUTOR — Decisões do TUTOR-Sulsafe (24/11/2026)

| ID | Decisão |
|---|---|
| D-TUTOR-01 | DEC-002 Opção C aplicada ao fluxo: `empresa_id` vem do claim `app_metadata.empresa_id`; nenhuma coluna nova em `profiles`; catálogo das 38 NRs permanece global. |
| D-TUTOR-02 | Human-in-the-Loop obrigatório: geração vira rascunho; aprovação e materialização são decisões humanas. Entidades criadas com `publico = false`; liberação para alunos é etapa separada. Aluno nunca vê rascunho (RLS). |
| D-TUTOR-03 | Contrato público em pt-BR: `{ titulo, descricao, publicoAlvo, objetivos, modulos[].aulas[] }`. O formato nativo do OpenMAIC (`courseTitle`, `languageDirective`, `outlines[]`) é convertido em um único adaptador. |
| D-TUTOR-04 | Chave de API apenas no Supabase Vault. `anon`/`authenticated` não têm EXECUTE na RPC do worker; a UI recebe somente um booleano de habilitação. |
| D-TUTOR-05 | Worker com modo `STUB` (`TUTOR_SULSAFE_STUB=1`) para homologar o fluxo sem chave, sem custo e sem rede. Não é modo de produção. |
| D-TUTOR-06 | Nada de Docker, Next.js, Redis, LiveKit ou OpenMAIC rodando na máquina da SulSafe. Infra é Supabase (RLS + RPC + Edge Function). |
| D-TUTOR-07 | Não existe tabela `cursos` na SulSafe: o conteúdo aprovado vira `videoaulas`, `materiais` (ou, no futuro, `provas_direcionadas`) com `nr_id` do catálogo de NRs. |
| D-TUTOR-08 | A Edge Function valida o JWT do chamador por RPC (`sulsafe_pode_processar_ia_job`) antes de agir com `service_role`. Ter o `job_id` não basta para disparar a geração. Aprovada na revisão de arquitetura sem ressalvas. |
| D-TUTOR-09 | Parser de JSON extraído para módulo único `supabase/functions/tutor-sulsafe/extrair-json.js`: captura bloco markdown em qualquer posição ou trecho entre o primeiro `{` e o último `}`; JSON inválido lança erro e o job vira `ERRO`, sem gravação de rascunho. Correção exigida pela revisão de arquitetura antes do deploy. |
| **D-TUTOR-10 (PENDENTE — Fase 2)** | **Débito técnico:** a validação estrita `validarContratoTutor()` de `js/tutor-sulsafe.js` ainda não é chamada pelo worker. Hoje o worker usa os fallbacks do adaptador e a checagem mínima de título/módulos. Avaliar na Fase 2 se o módulo puro será compartilhado com a Edge Function (mantendo uma única fonte de verdade). Não bloqueia o deploy aprovado. |
| **D-TUTOR-11 (DECIDIDA)** | **Origem do claim `app_metadata.empresa_id`: Opção A.** O ADMIN cadastra a empresa (tabela mínima `empresas`) e convida o usuário por uma Edge Function com `service_role`, que injeta `app_metadata: { empresa_id }` no `createUser`/`inviteUser`. O claim é emitido pelo servidor, nunca pelo navegador. |
| **D-TUTOR-12 (PRÉ-APROVADA — evolução futura)** | **Opção C — tabela `usuario_empresas`.** Fica aprovada para ser implementada quando houver demanda real de multiempresa (um usuário pertencer a mais de uma empresa). Fora de escopo desta etapa: tabela de vínculo, múltiplos vínculos e gestão de domínios. |
| **D-TUTOR-13 (DESCARTADA)** | **Opção D — claim por domínio de e-mail.** Descartada por risco de segurança (domínios compartilhados/não verificados permitiriam falsificar vínculo). |
| **D-TUTOR-14 (CORRIGIDA NO DEPLOY)** | A extração de `vault:<nome>` usava `substring(... from 6)` e devolvia o nome com os dois-pontos iniciais, fazendo a RPC acusar chave ausente no Vault. Corrigida para `from 7` na migration original e na migration 20261124050000, com teste de regressão. |
| **D-TUTOR-15 (DECIDIDA)** | **Distribuição explícita após a materialização.** A tela do Tutor oferece três destinos: turma/trilha/aluno individual (vínculo em `turma_materiais`, aluno vê em Meus Cursos/Trilhas), catálogo global da NR (`publico = true`) ou rascunho interno. A ementa completa acompanha a descrição do conteúdo, e `sulsafe_publicar_conteudo_tutor` registra quem decidiu a liberação. Continua proibido publicar automaticamente. |

---

## Histórico

| Data | Decisão | Registro |
|---|---|---|
| 2026-11-24 | Versão canônica do supabase-js | DEC-001 |
| 2026-11-24 | Modelo multiempresa | DEC-002 (DECIDIDA — Opção C) |
| 2026-11-24 | Fluxo do TUTOR-Sulsafe e origem do claim | D-TUTOR-01 a D-TUTOR-13 |
| 2026-11-24 | Revisão de arquitetura | RPC aprovada; parser corrigido; deploy condicionado ao status |
| 2026-11-24 | Origem do claim `empresa_id` | D-TUTOR-11 (Opção A), D-TUTOR-12 (pré-aprovada), D-TUTOR-13 (descartada) |
| 2026-11-24 | Correção da referência do Vault no worker | D-TUTOR-14 (migration 20261124050000) |
| 2026-11-24 | Deploy autorizado e executado | 12 migrations, Vault, config Gemini, 2 Edge Functions e smoke test REAL |
| 2026-11-24 | Distribuição do conteúdo gerado | D-TUTOR-15 (turma/trilha, catálogo ou rascunho interno) |
| 2026-11-24 | Cadastro e verificação | DEC-003 (pendente) |
| 2026-11-24 | MFA por role | DEC-004 (pendente) |
| 2026-11-24 | Aplicação remota | DEC-005 (pendente) |
