# ROADMAP_SULSAFE.md — Governança e direção da plataforma

Documento adaptado do `ROADMAP.md` da MR Tecnologia para a realidade da SulSafe.
**Plano de trabalho.** O deploy foi autorizado e executado em 24/11/2026 no projeto `acqbidvknbqppkjidvsq`: 11 migrations aplicadas, chave no Vault, configuração Gemini ativa e duas Edge Functions deployadas. O push do código ao GitHub continua bloqueado até autorização expressa.

---

## 1. Visão da SulSafe

Plataforma de ensino de Segurança do Trabalho já no ar: HTML/CSS/JavaScript puro no front (GitHub Pages/Vercel) e Supabase no back (Postgres + Auth + Storage + RLS + RPC). Catálogo de 38 NRs, videoaulas, trilhas, materiais, salas ao vivo, fórum, trabalhos e avaliações com notas, boletim, dossiê/SISTEC, almoxarifado e certificados PDF com QR Code.

Papéis: **ADMIN** (Modo Deus), **PROFESSOR** e **ALUNO**. Cobrança manual registrada em `transacoes` — sem Mercado Pago, sem plano fixo e sem checkout.

Restrição de arquitetura: **não há Docker, não há Next.js e não haverá migração de stack**. As ideias da MR são portadas como conceito, não como infraestrutura.

---

## 2. Duas IAs — fronteira obrigatória

| | **IA 1 — Secretária SulSafe** | **IA 2 — Professor I.A** |
|---|---|---|
| Natureza | Recepcionista institucional | Motor de automação de conteúdo |
| Custo | Inclusa, sempre grátis | Cobrada à parte, sob consulta |
| Execução | 100% local no navegador, sem API e sem internet | API plugável (SulSafe ou do cliente) |
| Função | Navegar pelas 38 NRs, páginas, certificado, trabalho, boletim; recusar gabarito | Criar curso, palestra e avaliação; distribuir por turma |
| Chave de API | Nenhuma | Supabase Vault, nunca no front |
| Estado | **Implementada e testada** | **Só estrutura/config pronta; geração não implementada** |
| Visibilidade | Sempre disponível | Botão "Criar com I.A" oculto por padrão |
| Provedores | Não se aplica | `sulsafe_api`, `openai`, `gemini`, `anthropic`, `custom` |

**Regra inegociável:** a Secretária nunca vira API, nunca cobra e nunca gera conteúdo. O Professor I.A nunca é desligado por conta própria e nunca substitui a Secretária.

---

## 3. O que aproveitar da MR (sem copiar infra)

1. **IA produz entidades de banco, não texto solto.** Na MR a saída do OpenMAIC vira `courses` + `modules` + `lessons`; aqui virará registros SulSafe (curso/NR, aulas, questões, material).
2. **Human-in-the-Loop obrigatório.** `DRAFT_AI` + `aprovado = false`; nada gerado é publicado sem revisão de PROFESSOR/ADMIN. Aluno nunca vê rascunho.
3. **Fila assíncrona do jeito Supabase.** Em vez de Redis/BullMQ + Docker: tabela `ia_jobs`, RPC de criação e worker/Edge Function, com estados `PENDENTE → PROCESSANDO → CONCLUIDO/ERRO`.
4. **Provider-neutrality / BYOA.** O OpenMAIC separa *providers* de *slots*; a SulSafe já separa provedor de configuração em `js/ia-professor.js` + `config_ia_professor`.
5. **Isolamento por empresa/tenant.** A MR usa `organization_id` com RLS. DEC-002 foi decidida: **Opção C (meio-termo)**, com `empresa_id` lido do claim `app_metadata.empresa_id` do JWT.
6. **Auditoria e rastreabilidade.** Quem pediu, qual provedor/modelo, quando aprovou, quando publicou, quando cobrou. Já existem `exclusao_logs` e `transacoes` como base.
7. **Contrato estável em pt-BR.** UI, erros e logs em português; identificadores técnicos em inglês; prompt pede JSON e adaptador converte para o formato SulSafe.

**Não aproveitar:** Docker Compose, Next.js, LiveKit, Redis, OpenMAIC rodando na máquina, infra de containers.

---

## 4. Plano de automação — Fases 0 a 5

| Fase | Entrega | Situação |
|---|---|---|
| **0 — Fundação e auditoria** | XSS corrigido, deletes atômicos, Secretária local, config do Professor I.A, default privileges endurecidos, versão única do supabase-js, documentos de governança | **CONCLUÍDA nesta etapa** |
| **1 — Contrato de dados** | Tabelas `ia_jobs` / `ia_conteudos` com `status`, `aprovado`, `criado_por`, `empresa_id`, `aprovado_por`; decisão multiempresa aplicada | **CONCLUÍDA localmente** (`20261124010000_ia_jobs_conteudos.sql`, 8 testes) |
| **2 — Fila + adaptador** | RPC cria job; worker consome; adaptador por provedor via Vault; testes com stub, sem chave real | **CONCLUÍDA localmente** (`20261124030000_tutor_worker_config.sql`, `supabase/functions/tutor-sulsafe/index.ts`) |
| **3 — Revisão humana** | Tela ADMIN/PROFESSOR para aprovar/rejeitar rascunho; RLS esconde rascunho do aluno | **CONCLUÍDA localmente** (`js/views/tutor.js`, `20261124020000_tutor_materializacao.sql`). **Item em aberto (UX/Admin):** reenviar convite / realocar conta existente quando o e-mail já está cadastrado — hoje a Edge Function `admin-convidar-usuario` responde "Já existe uma conta com este e-mail." |
| **4 — Geração real** | Ementa → módulos → aulas → questões; depois palestra e distribuição por turma | Parcial: ementa e materialização em videoaula/material prontas; questões e distribuição por turma pendentes |
| **5 — Cobrança e escala** | Registro manual em `transacoes`, BYOA por empresa, auditoria completa | NÃO INICIADA |

Cada fase só avança para deploy com autorização do proprietário. O trabalho local continua para manter o contrato pronto e testado.

---

## 5. Modelo multiempresa

Três opções documentadas com prós, contras e recomendação em `DECISIONS_SULSAFE.md` (DEC-002):

- **A — Isolamento real por `empresa_id` + RLS** em todas as tabelas acadêmicas.
- **B — Rótulo comercial**, conteúdo global e empresa só em `transacoes`.
- **C — Meio-termo (recomendado e DECIDIDA):** `empresa_id` em `ia_jobs`/`ia_conteudos` (e futuremente `transacoes`); NRs globais; conteúdo gerado isolado por RLS.

**Implementada localmente na Fase 1.** A origem do claim foi decidida em **D-TUTOR-11: Opção A** e implementada localmente na Fase 2: o ADMIN cadastra a empresa em **Modo Deus → Empresas e Convites** e convida o usuário pela Edge Function `admin-convidar-usuario`, que valida o JWT do ADMIN por RPC e injeta `app_metadata.empresa_id` no `createUser` com `service_role`. A tabela `usuario_empresas` (Opção C) fica pré-aprovada como evolução futura para multiempresa real; domínio de e-mail (Opção D) foi descartado por segurança.

---

## 6. Modelo comercial

| Produto | Regra |
|---|---|
| Plataforma SulSafe + Secretária | Inclusas. Secretária é local, sem API e sempre grátis. |
| Professor I.A | Cobrado à parte, sob consulta, sem preço fixo e sem Mercado Pago. Ativação registrada manualmente em `transacoes` com motivo `Ativação Professor I.A - Empresa X - Valor Y`. BYOA: o cliente pode usar a API da SulSafe ou a própria. |
| Produção personalizada | Sob orçamento, fora do escopo automático. |

Chave de API do Professor I.A fica no Supabase Vault. Nunca no front, nunca em `localStorage`.

---

## 7. Segurança como requisito transversal

Segurança não é uma fase final: cada entrega passa pelos critérios abaixo.

- RLS habilitada e policies restritivas em toda tabela nova; `auto_expose_new_tables = false`.
- RPCs `SECURITY DEFINER` com `search_path = ''`, validação interna de `auth.uid()`/RBAC e rollback em bloco `EXCEPTION`.
- Nenhuma interpolação de dado do banco em `onclick`, `href` ou atributo sem escape/allowlist.
- Output de IA passa por Markdown → HTML → sanitização (`js/chat-seguro.js`).
- Segredos apenas no Vault; `anon key` é pública por design; `service_role` só no servidor.
- Toda correção de segurança entra com teste de regressão. Baseline: 116 testes → 135 após a Etapa 01 → 143 após a Fase 1 → 175 após a correção do parser → 183 após a Opção A (empresas e convite com claim) → 184 após a correção da referência do Vault (D-TUTOR-14).
- Matriz completa em `SECURITY_AUDIT_SULSAFE.md`.

---

## 8. Governança

| Papel | Responsabilidade |
|---|---|
| **Code (construtor)** | Executa, mantém testes verdes, aplica correções seguras e testáveis, registra decisões. Não inventa regra de negócio nem autoriza deploy. |
| **Proprietário (supervisor 2)** | Decide produto, modelo multiempresa, cobrança, MFA e autoriza push/deploy/migrations remotas. |
| **Assistente (arquiteto/revisor)** | Revisa desenho, aponta riscos e valida que a implementação respeita as decisões registradas. |

Fluxo: proposta → decisão registrada → implementação local → testes → revisão → autorização de deploy.

---

## 9. Decisões em aberto

1. **DEC-002 (decidida: C; origem do claim decidida em D-TUTOR-11: Opção A)** — cadastro de empresas e convite com claim implementados e deployed; empresa de teste criada. Falta testar o convite com um e-mail real e conferir o claim no JWT do convidado. Múltiplos vínculos por usuário ficam para a evolução pré-aprovada em D-TUTOR-12.
2. **DEC-003** — cadastro público vs convite no remoto; verificação de e-mail.
3. **DEC-004** — MFA obrigatório para roles administrativas e período de transição.
4. **DEC-005** — autorização para aplicar `config.toml`, `vercel.json` e migrations ao remoto.

**Encerramento desta etapa:** Fases 1, 2 e 3 implementadas e aplicadas ao remoto, incluindo o botão "Criar com o TUTOR-Sulsafe", a revisão humana e a Opção A (empresas + convite com claim), com 184 testes verdes e `npm run check` limpo. Relatório em `TUTOR_SULSAFE_REPORT.md`. Smoke test REAL concluído: geração de ementa NR-35, aprovação e materialização em videoaula com `publico = false`. Pendente: convite real, validação com conta Aluno e publicação do front atualizado no domínio. Nada foi enviado ao GitHub.
