# ROADMAP_SULSAFE.md — Governança e direção da plataforma

Documento adaptado do `ROADMAP.md` da MR Tecnologia para a realidade da SulSafe.
**Plano de trabalho.** O deploy foi autorizado e executado em 24/11/2026 no projeto `acqbidvknbqppkjidvsq`: 12 migrations aplicadas, chave no Vault, configuração Gemini ativa e duas Edge Functions deployadas. O push ao GitHub foi autorizado e executado; a Vercel acompanha a branch `main`.

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
| Estado | **Implementada e testada** | **Implementada e homologada**: geração real, revisão, materialização e distribuição por turma/trilha ou catálogo da NR |
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

## 4. Plano de automação — Fases 0 a 6

| Fase | Entrega | Situação |
|---|---|---|
| **0 — Fundação e auditoria** | XSS corrigido, deletes atômicos, Secretária local, config do Professor I.A, default privileges endurecidos, versão única do supabase-js, documentos de governança | **CONCLUÍDA** |
| **1 — Contrato de dados** | Tabelas `ia_jobs` / `ia_conteudos` com `status`, `aprovado`, `criado_por`, `empresa_id`, `aprovado_por`; decisão multiempresa aplicada | **CONCLUÍDA e aplicada ao remoto** (`20261124010000_ia_jobs_conteudos.sql`, 8 testes) |
| **2 — Fila + adaptador** | RPC cria job; worker consome; adaptador por provedor via Vault; testes com stub, sem chave real | **CONCLUÍDA e aplicada ao remoto** (`20261124030000_tutor_worker_config.sql`, `supabase/functions/tutor-sulsafe/index.ts`) |
| **3 — Revisão humana** | Tela ADMIN/PROFESSOR para aprovar/rejeitar rascunho; RLS esconde rascunho do aluno | **CONCLUÍDA e aplicada ao remoto** (`js/views/tutor.js`, `20261124020000_tutor_materializacao.sql`). **Item em aberto (UX/Admin):** reenviar convite / realocar conta existente quando o e-mail já está cadastrado — hoje a Edge Function `admin-convidar-usuario` responde "Já existe uma conta com este e-mail." |
| **4 — Geração real** | Ementa → módulos → aulas → questões; depois palestra e distribuição por turma | Parcial: ementa, materialização em videoaula/material e **distribuição por turma/trilha ou catálogo da NR** prontas; questões automáticas pendentes (Fase 5) |
| **5 - Agente Direcionado** | Prova, módulo e palestra gerados por agente, revisados, distribuídos para turma/aluno/catálogo com notificação e realizados pelo aluno com correção automática | **EM IMPLANTAÇÃO - capítulo 10**; Etapas 1-8/8 e 3.1 implementadas e testadas (281 testes); **banco (8 migrations), Edge Function `tutor-sulsafe` v3 e GitHub (`e2198a3`) publicados em 25/11/2026**; Vercel ainda não publicada. Roteiro em `PASSO_A_PASSO_DEPLOY.md`, evidências em `RELATORIO_DEPLOY_FASE1_MIGRACOES.md` e `RELATORIO_DEPLOY_FASE2.md` |
| **6 — Cobrança e escala** | Registro manual em `transacoes`, BYOA por empresa, auditoria completa | NÃO INICIADA |

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
- Toda correção de segurança entra com teste de regressão. Baseline: 116 testes → 135 após a Etapa 01 → 143 após a Fase 1 → 175 após a correção do parser → 183 após a Opção A (empresas e convite com claim) → 184 após a correção da referência do Vault (D-TUTOR-14) → **192 após a distribuição do conteúdo e a correção do 502**.
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
4. **DEC-005 (AUTORIZADA E EXECUTADA em 24/11)** — migrations e `vercel.json` aplicados e publicados; resta apenas conferir, em janela própria, se algum parâmetro de `auth` do `config.toml` ainda diverge no remoto.

**Encerramento desta etapa:** Fases 1, 2 e 3 implementadas e aplicadas ao remoto, incluindo o botão "Criar com o TUTOR-Sulsafe", a revisão humana e a Opção A (empresas + convite com claim), com **192 testes verdes** e `npm run check` limpo. Relatório em `TUTOR_SULSAFE_REPORT.md`. Smoke test REAL concluído: geração de ementa NR-35, aprovação, materialização em videoaula com `publico = false` e escolha de destino. Push ao GitHub concluído (`2d929cf`) e Vercel em `Ready/Production`; front atualizado disponível em `https://www.sulsafe.com.br`. Pendente: convite real e validação com conta Aluno. A Fase 5 está detalhada no capítulo 10; as Etapas 1-8 e a Etapa 3.1 foram implementadas e testadas (281 testes verdes). A Etapa 8 entregou a exportação CSV em `/admin/provas-resultados` e o roteiro `PASSO_A_PASSO_DEPLOY.md`. Em 25/11/2026, autorização específica aplicou as 8 migrations ao remoto (banco validado: 6 tabelas com RLS, `quantidade_questoes` com CHECK 1..50 e 29 RPCs `SECURITY DEFINER`); Edge Function, GitHub e Vercel permanecem intocados.

---

## 10. Fase 5 - O Agente Direcionado (EM IMPLANTAÇÃO - Etapas 1-8 e 3.1/8 concluídas em 25/11/2026; banco, Edge Function e GitHub publicados)

**Objetivo do proprietário:** o usuário pede, o agente cria, o usuário analisa, aprova e escolhe o destino; o sistema distribui e notifica. Exemplo real: *"Crie uma prova com 10 questões sobre o curso X"* ou *"crie um módulo sobre assunto tal"*, destinando depois à turma/aluno "x".

### 10.1 Princípios (herdados do TUTOR, inegociáveis)

1. **Agente propõe, humano aprova, sistema distribui.** Conforme o requisito da Etapa 4, aprovar uma prova I.A. marca `publicado = true` — interpretado como "aprovada e pronta para distribuição", **sem** turma/aluno e sem `distribuido_por`/`distribuido_em`. A distribuição (Etapa 5) é o ato que cria o vínculo com o destinatário; ela nunca acontece sem aprovação. Rejeitar mantém `publicado = false`.
2. **Um destino por pedido.** Todos os itens gerados no mesmo job (questões, módulos, roteiro) recebem o mesmo endereço escolhido pelo revisor.
3. **Reaproveitar, não reconstruir.** `ia_jobs`/`ia_conteudos`, RLS por empresa, `sulsafe_revisar_ia_conteudo`, `sulsafe_direcionar_conteudo_tutor`, `sulsafe_publicar_conteudo_tutor`, `turma_materiais`, `provas_direcionadas`, `notificacoes` e a atual tela do Tutor.
4. **Mesma infra da Fase 4.** Supabase + Edge Function + Postgres/RLS/RPC. Sem Docker, Next.js, Redis, LiveKit ou OpenMAIC local. Chave apenas no Vault.
5. **Nada de novo em produção sem autorização.** Banco, Edge Function e GitHub foram promovidos em 25/11/2026 com autorização explícita: 8 migrations (`--remote --yes`), `tutor-sulsafe` v3 e push `e2198a3`. A Vercel segue intacta até autorização específica; a seção 6 de `PASSO_A_PASSO_DEPLOY.md` não foi executada.

### 10.2 Fluxo ponta a ponta e estados

| Etapa | Quem | O que acontece | Estado |
|---|---|---|---|
| 1. Pedido | ADMIN/PROFESSOR | Escolhe tipo (`PROVA`, `MODULO`, `PALESTRA`), assunto, NR de contexto, público-alvo e parâmetros. Para `PROVA`, escolhe **5 / 10 / 20 / 30 / 50 questões** (padrão 10, teto 50); `sulsafe_criar_ia_job` registra `empresa_id` do JWT e `quantidade_questoes`. | `PENDENTE` |
| 2. Criação | Agente (`tutor-sulsafe`) | Valida JWT por RPC, monta prompt específico por tipo, chama o provedor configurado (hoje Gemini 2.5 Flash), converte a saída para o contrato pt-BR e grava o rascunho. Retry de 429/5xx e mensagem pt-BR já existentes. | `PROCESSANDO` → `CONCLUIDO` (ou `ERRO`) |
| 3. Análise | ADMIN/PROFESSOR | Tela mostra a prova numerada, o módulo com aulas ou o roteiro da palestra. Gabarito aparece só nesta área restrita. | rascunho `aprovado = false`, `publicado = false` |
| 4. Decisão | ADMIN/PROFESSOR | Tela `/admin/provas-pendentes`: **Aprovar e Publicar** ou **Rejeitar com motivo** (campo inline, sem `prompt()`), com edição de questões antes da decisão. | Aprovação: `aprovado = true` e `publicado = true`, ainda sem destino; rejeição: `rejeitado = true` e `publicado = false`. Auditoria em ambos os casos. |
| 5. Destino | ADMIN/PROFESSOR | Tela `/admin/provas-distribuicao` com **TURMA**, **ALUNO**, **CATÁLOGO** (todos os alunos da empresa) ou **INTERNO** (rascunho sem entrega). | `destino_tipo` e os vínculos gravados com quem decidiu e quando; uma prova só é distribuída uma vez (INTERNO pode ser revisitado) |
| 6. Distribuição | Sistema | RPC transacional `sulsafe_distribuir_prova_ia` cria um vínculo por aluno em `provas_distribuicoes` e registra auditoria. | `publicado = true`, `distribuido_por`/`distribuido_em` preenchidos (salvo INTERNO) |
| 7. Notificação e realização | Sistema/Aluno/Professor | Uma notificação por aluno destinatário com link permitido; tela do aluno entregue na Etapa 6 com cabeçalho de contexto e questões sem gabarito; acompanhamento administrativo entregue na Etapa 7 (status, nota, detalhe com gabarito e correção manual de discursivas); Etapa 8 acrescenta exportação CSV de todos os resultados da prova. | entregue → visualizado → concluído (discursiva: `EM_ANDAMENTO` até correção) |

### 10.3 Backend

**Tipos e contratos**

- `ia_jobs` aceita `MATERIA`, `CURSO`, `PALESTRA`, `AVALIACAO`, `MATERIAL` **e, desde a Etapa 1, `PROVA` e `MODULO`**. `ia_conteudos` aceita os tipos anteriores **e `PROVA`** (`MODULO`, `AULA`, `QUESTAO` e `PALESTRA` já existiam). `AVALIACAO` permanece como legado.
- Feito na Etapa 1: `20261125000000_fase5_fundacao.sql` amplia os dois `CHECK` e cria os contratos Zod compartilhados (`js/tutor-contratos-fase5-core.js` + adaptador Node), com erros em pt-BR e o mesmo núcleo reutilizável pela Edge Function. `zod` fixado em **4.6.7** — a 3.25.76 tinha aviso de alta severidade (GHSA-mrhx-c7xc-m3w5); `npm audit` agora reporta 0 vulnerabilidades.
- Etapa 3.1: `20261125060000_etapa3_1_quantidade_questoes.sql` acrescenta `ia_jobs.quantidade_questoes` com `CHECK (1..50)` e substitui `sulsafe_criar_ia_job` por overload de 6 argumentos com `DEFAULT` (chamadas de 5 argumentos continuam válidas). O mesmo limite vive no front, na RPC e no contrato Zod `.length(N)`.
- Contratos de saída (pt-BR, validados antes de gravar):
  - `PROVA`: `{ titulo, descricao, nr_id, questoes: [{ enunciado, alternativas: [{ chave, texto }], resposta_correta, justificativa, peso }] }`
  - `MODULO`: `{ titulo, descricao, objetivos, aulas: [{ titulo, descricao, ordem }] }`
  - `PALESTRA`: `{ titulo, descricao, publicoAlvo, duracao_min, roteiro: [{ bloco, minutos, conteudo }] }`
- A validação estrita hoje em débito (**D-TUTOR-10**) precisa ser compartilhada com a Edge Function aqui: uma única fonte de verdade para o contrato.

**Tabelas**

- `provas_direcionadas` **já existe** (`20261022000000_direcionamento_conteudo.sql`): não recriar. A Etapa 1 acrescentou `ia_conteudo_id`, `origem = 'IA_TUTOR'`, `distribuido_por` e `distribuido_em`, mudou `publicado` para `default false` e recolheu apenas linhas `origem = 'IA_TUTOR'` que estavam publicadas. Provas manuais continuam com `publicado: true` explícito no fluxo do professor.
- `provas_questoes` (**criada na Etapa 2**): `prova_id`, `ordem`, `enunciado`, `alternativas jsonb`, `gabarito jsonb` (`resposta_correta` + `justificativa`), `peso` e, **desde a Etapa 7**, `tipo` (`OBJETIVA`/`DISCURSIVA`, default `OBJETIVA`). Sem SELECT para `authenticated`; o gabarito só sai pelas RPCs restritas da Etapa 4 e da Etapa 7. `provas_revisao_auditoria` (**Etapa 4**) registra `APROVADO`/`REJEITADO`/`EDITADO` e, desde a Etapa 7, `CORRIGIDO_MANUAL`, com ator e timestamp.
- `modulos_direcionados` (**criada na Etapa 1**): `titulo`, `descricao`, `nr_id`, `ia_conteudo_id` (único), `criado_por`, `destino`, `publico = false`, `distribuido_por`, `distribuido_em`. Trigger HITL impede `publico = true` sem rascunho aprovado; RLS herdada de `ia_conteudos.empresa_id`, sem coluna `empresa_id` nova.
- Acompanhamento de conclusão: `modulos_aluno_progresso` (nova) por aluno/módulo segue proposta; para provas, a **Etapa 7** acrescenta `provas_respostas_aluno` (uma linha por prova/aluno/questão, com `alternativa`, `texto_resposta`, `nota_manual` e carimbos de correção), RLS herdada da empresa da prova e toda escrita via RPC.
- **Não adicionar `empresa_id` nessas tabelas acadêmicas** (DEC-002 / D-TUTOR-01). O isolamento é herdado de `ia_conteudos.empresa_id` via `ia_conteudo_id` nas policies.

**Orquestração e RPCs**

- `tutor-sulsafe` passa a despachar por tipo: mesmo job, um `ia_conteudo` por entidade gerada, com `ordem` gravada no JSON. O prompt específico por tipo reaproveita a base das 38 NRs. Para `PROVA`, a base vem de `montarPromptBaseFase5()` e a Edge Function lê `ia_jobs.quantidade_questoes`, gerando `Gere exatamente N questões...` antes de validar a saída com Zod; o rascunho guarda `quantidade_questoes` para auditoria.
- Etapa 5 entregue para provas: `sulsafe_listar_provas_aprovadas_ia`, `sulsafe_listar_destinos_distribuicao_ia` e `sulsafe_distribuir_prova_ia`, transacionais e com empresa do chamador validada também para ADMIN. `sulsafe_direcionar_conteudo_tutor`/`sulsafe_publicar_conteudo_tutor` seguem restritos a videoaulas/materiais materializados e **não** foram reutilizados para provas I.A.
- Etapa 6 entregue para o aluno: `sulsafe_prova_entregue_aluno_ia`, `sulsafe_carregar_cabecalho_prova_aluno_ia`, `sulsafe_listar_provas_aluno_ia`, `sulsafe_carregar_prova_aluno_ia` (somente `id`, `ordem`, `enunciado`, `alternativas`, `peso` e, na Etapa 7, `tipo`) e `sulsafe_submeter_prova_aluno_ia` (soma os pesos das corretas, grava `provas_progresso` e auditoria `SUBMETIDO`). A RPC de correção lê o gabarito internamente.
- Etapa 7 entregue para o professor: `sulsafe_listar_resultados_prova_ia` (status/nota/conclusão, sem gabarito), `sulsafe_detalhe_resultado_prova_ia` (respostas + gabarito, só para a empresa da prova) e `sulsafe_corrigir_resposta_discursiva_ia` (nota manual, recálculo, conclusão e auditoria `CORRIGIDO_MANUAL`). A submissão foi estendida para gravar respostas e manter provas com discursiva em `EM_ANDAMENTO`; provas só objetivas permanecem como na Etapa 6.
- Toda RPC: `security definer`, `search_path = ''`, validação interna de `auth.uid()`, RBAC, conta ativa e empresa; `revoke all from public, anon`; `service_role` só no servidor. Logs e respostas sem chave de API.

### 10.4 Frontend

- Tela do Tutor: **Etapa 3.1 entregue** — seletor com `PROVA` e campo de quantidade (5/10/20/30/50), enviado como `p_quantidade_questoes` e refletido no rascunho. NR é detectada do assunto e público-alvo permanece opcional; prazo segue pendente.
- Visualização do rascunho: **Etapa 4 entregue** em `js/views/provas-pendentes-ia.js` — prova com alternativas numeradas e gabarito restrito a ADMIN/PROFESSOR em modal `role="dialog"`, edição inline e decisões sem `prompt()`/`confirm()`. Módulo com aulas em `<details>` e palestra com roteiro/duração seguem pendentes. Todo texto da IA passa por sanitização.
- Seletor de destino (Etapa 5 entregue): `js/views/provas-distribuicao-ia.js` em `/admin/provas-distribuicao`, modal `role="dialog"` com **TURMA**, **ALUNO**, **CATÁLOGO** e **INTERNO**, sem `prompt()`/`confirm()`. O painel "Para onde vai?" das videoaulas segue intacto.
- Realização (Etapa 6 entregue): `js/views/prova-aluno-ia.js` em `/aluno/prova/:id`, com cabeçalho de contexto reutilizável (marca SulSafe, título, aluno, data, tempo, nota mínima e instruções), questões sem gabarito, radio por alternativa e modal de confirmação acessível antes de enviar. A lista `js/views/provas.js` mostra as avaliações I.A. distribuídas com botão **Realizar prova**.
- Acompanhamento (Etapa 7 entregue): `js/views/provas-resultados-ia.js` em `/admin/provas-resultados`, acessível pelo botão **Ver Resultados** em `/admin/provas-distribuicao`. Tabela Nome/Status/Nota/Data de Conclusão, filtro **Apenas Pendentes**, **Ver Detalhes** com gabarito em modal `role="dialog"`, e **Corrigir Discursivas** desabilitado quando não há discursivas. Sem join direto em `profiles` — dados vêm das RPCs seguras. Exportação (Etapa 8 entregue): botão **Exportar Resultados** em `js/views/provas-resultados-ia.js`, com gerador em `js/exportar-resultados-ia.js` — CSV com BOM UTF-8, `;`, cabeçalhos pt-BR, nota com vírgula decimal e neutralização de fórmulas; usa a mesma RPC autorizada e ignora o filtro da tela. A lista geral "Distribuições" com prazo/link de notificação segue como proposta futura.
- Manter o padrão já homologado: rejeição inline e nenhum `prompt()`/`confirm()`.

### 10.5 Testes e critérios de aceite

- **RLS por empresa:** aluno/professor da empresa A não vê prova ou rascunho da empresa B; admin não é usado como brecha para leak.
- **HITL obrigatório:** distribuir sem `aprovado = true` falha; rascunho rejeitado não distribui nem pode ser aprovado depois; aprovar marca `publicado = true` mas não cria destino; distribuir registra `distribuido_por`/`distribuido_em` (Etapa 5).
- **Visibilidade:** aluno nunca vê `aprovado = false`, `publicado = false` nem gabarito; `provas_direcionadas` criada por IA começa com `publicado = false`; "tornar privado" recolhe.
- **Contrato do agente:** exatamente N questões quando N é solicitado (5/10/20/30/50; padrão 10), alternativas válidas e resposta dentro das alternativas; JSON inválido ou quantidade fora de 1..50 vira job `ERRO` sem rascunho. **`Gere exatamente 20 questões...` no prompt e 20 persistidas** é o caso de aceite; **100 é bloqueado** na RPC e no worker.
- **Notificação:** criada somente após a distribuição, uma por destinatário, com link na allowlist de destinos.
- **Idempotência (Etapa 5):** uma segunda distribuição é **rejeitada**, sem duplicar vínculos ou notificações; troca de destino não é permitida (o destino é definitivo), exceto para `INTERNO`, que pode ser distribuído depois.
- **Regressão:** `npm test` (**281 testes verdes** após a Etapa 8) e `npm run check` (44 arquivos, 0 problemas), com novos testes em PGlite para as migrations. Relatórios: `RELATORIO_FASE5_ETAPA3_1.md`, `RELATORIO_FASE5_ETAPA7.md` e `RELATORIO_FASE5_ETAPA8.md`.
- **Segredo:** nenhuma chave em arquivo, log, navegador ou resposta HTTP. Varredura final da Etapa 8: 81 arquivos públicos, 0 achados (anon key permitida por ser pública).

### 10.6 Sequência de tarefas (prontas para implementação futura)

1. ✅ **CONCLUÍDA (Etapa 1/8):** migration `20261125000000_fase5_fundacao.sql` — tipos `PROVA`/`MODULO`, HITL em `provas_direcionadas`, `modulos_direcionados` e colunas de auditoria. `provas_questoes` e `modulos_aluno_progresso` ficam para a Etapa 2, quando o formato final das questões for materializado.
2. ✅ **CONCLUÍDA (Etapa 1/8):** contratos e validadores compartilhados (núcleo independente de runtime + adaptador Node com Zod 4.6.7), incluindo a resolução de D-TUTOR-10. O adaptador Deno entrará com a Edge Function.
3. ✅ **CONCLUÍDA (Etapa 3/8, somente local):** Edge Function com dispatcher `PROVA`/`MODULO`, prompt específico por tipo reaproveitando `ia_jobs.prompt`, validação Zod, materialização atômica em rascunho e rota `GET /api/tutor/provas-pendentes`. PALESTRA/MATERIA/CURSO/MATERIAL permanecem no fluxo homologado de videoaulas.
4. ✅ **CONCLUÍDA (Etapa 4/8, somente local):** HITL visual em `/admin/provas-pendentes`, modal com questões/gabarito restrito, edição persistida, aprovação (`publicado = true`) e rejeição com motivo, ambas com auditoria quem/quando. RPCs `sulsafe_obter_revisao_prova_ia`, `sulsafe_editar_questao_prova_ia`, `sulsafe_aprovar_prova_ia` e `sulsafe_rejeitar_prova_ia`, em nova migration; rotas POST com JWT do chamador + chave anônima. Relatório em `RELATORIO_FASE5_ETAPA4.md`.
5. ✔ **CONCLUÍDA (Etapa 5/8, somente local):** distribuição transacional de provas aprovadas a turma, aluno ou catálogo, com `INTERNO` como rascunho, vínculo por aluno em `provas_distribuicoes`, uma notificação por destinatário, auditoria `DISTRIBUIDO`/`INTERNO` e isolamento por empresa também para ADMIN. Rota `POST /api/tutor/provas/:id/distribuir` com JWT do chamador + chave anônima. Nova migration `20261125040000`; nada aplicado ao remoto. Relatório em `RELATORIO_FASE5_ETAPA5.md`.
6. ✔ **CONCLUÍDA (Etapa 6/8, somente local):** realização da prova pelo aluno com cabeçalho de contexto reutilizável em `/aluno/prova/:id`, questões carregadas sem gabarito e confirmação antes do envio. Rota `POST /api/aluno/provas/:id/submeter` com JWT do aluno + chave anônima, correção automática por pesos em `sulsafe_submeter_prova_aluno_ia`, `provas_progresso` com `CONCLUIDA`/`nota`/`concluido_em` e auditoria `SUBMETIDO`. Nova migration `20261125050000`; nada aplicado ao remoto. Relatório em `RELATORIO_FASE5_ETAPA6.md`.
6.1. ✅ **CONCLUÍDA (Etapa 3.1/8, somente local):** quantidade de questões parametrizada do Admin ao prompt/contrato/persistência, com limite de 50 em quatro camadas. Nova migration `20261125060000`; 20 questões persistidas e 100 bloqueadas em PGlite. Relatório em `RELATORIO_FASE5_ETAPA3_1.md`.
7. ✔ **CONCLUÍDA (Etapa 7/8, somente local):** acompanhamento do professor em `/admin/provas-resultados` — listagem, filtro, detalhe com gabarito e correção manual de discursivas. Nova migration `20261125070000`, rotas GET/GET/POST com JWT do chamador + chave anônima, TDD com 7 testes de RLS Empresa A/B, nota correta e gabarito restrito. Smoke visual em harness local com dados simulados, 0 erros de console. Nada aplicado ao remoto. Relatório em `RELATORIO_FASE5_ETAPA7.md`.
8. ✔ **CONCLUÍDA (Etapa 8/8, somente local):** exportação CSV de resultados em `/admin/provas-resultados` (BOM UTF-8, `;`, cabeçalhos pt-BR, escape e anti-fórmula), coberta por 5 novos testes, e roteiro `PASSO_A_PASSO_DEPLOY.md` com migrations, Edge Function, push, Vercel, smoke e rollback. Varredura de segredos limpa; 281 testes verdes. Na ocasião nada havia sido aplicado ao remoto, deployado ou pushado.
9. ✔ **DEPLOY FASE 1 CONCLUÍDO (25/11/2026, somente banco):** autorização explícita → `npx supabase link --project-ref acqbidvknbqppkjidvsq` → `npx supabase db push --remote --yes` aplicou as 8 migrations; `migration list` passou de 17 para 25/25 aplicadas. Validação read-only: 6 tabelas novas com RLS ON, `ia_jobs.quantidade_questoes` com CHECK 1..50, 29 RPCs `SECURITY DEFINER` com `search_path=""` e sem `anon`/`public` nas críticas. Evidência em `RELATORIO_DEPLOY_FASE1_MIGRACOES.md`.
10. ✔ **DEPLOY FASE 2 CONCLUÍDO (25/11/2026, Edge Function e GitHub):** autorização explícita → `npx supabase functions deploy tutor-sulsafe --project-ref acqbidvknbqppkjidvsq --yes` → v3 `ACTIVE`/`verify_jwt true`; clone sincronizado com varredura de 176 arquivos/0 segredos, 281 testes e `npm run check` limpos; commit `e2198a3` enviado a `main`. Evidência em `RELATORIO_DEPLOY_FASE2.md`. **Vercel não foi publicada** — exige nova autorização.

### 10.7 O que NÃO fazer nesta fase

- Não publicar automaticamente nem pular a revisão humana.
- Não mexer no Tutor atual nem no fluxo de videoaulas/materialização já homologado.
- Não expor gabarito ao aluno nem confiar em dado do navegador para `empresa_id`.
- Não copiar infra da MR (Docker/Next.js/Redis/OpenMAIC local).
- Não alterar migrations já aplicadas: toda mudança entra em nova migration.
- Não usar `prompt()`/`confirm()` na UI.

### 10.8 Etapa 1/8 — fundação do banco e dos contratos (concluída, local)

**Arquivos novos**

| Arquivo | Função |
|---|---|
| `supabase/migrations/20261125000000_fase5_fundacao.sql` | HITL em `provas_direcionadas`, `CHECK` de `ia_jobs`/`ia_conteudos` ampliado, `modulos_direcionados` com RLS e trigger HITL |
| `js/tutor-contratos-fase5-core.js` | Núcleo dos schemas `PROVA`, `MODULO` e `PALESTRA`, sem importar runtime (reutilizável em Deno) |
| `js/tutor-contratos-fase5.js` | Adaptador Node com `zod@4.6.7` (versão fixa, `npm audit` limpo) |
| `tests/fase5-fundacao.test.mjs` | PGlite: default de `publicado`, correção cirúrgica, checks, destino, HITL e RLS por empresa |
| `tests/fase5-contratos.test.mjs` | Zod: 10 questões, gabarito dentro das alternativas, chaves repetidas, campos extras, erros pt-BR |

**Validação:** `npm test` → 203/203; `npm run check` → 38 arquivos, 0 problemas. Nada foi aplicado ao Supabase remoto, deployado na Vercel ou enviado ao GitHub.

### 10.9 Etapas 2 e 3/8 — materialização e geração ligada ao worker (concluídas, locais)

| Etapa | Arquivos principais | Resultado |
|---|---|---|
| 2/8 — estrutura de prova | `20261125010000_fase5_estrutura_prova.sql`, `js/materializar-prova-fase5.js`, `tests/fase5-estrutura-prova.test.mjs` | `provas_questoes`, `provas_progresso`, gabarito protegido, materialização atômica; 7 testes novos |
| 3/8 — geração no worker | `20261125020000_fase5_geracao_prova.sql`, `supabase/functions/tutor-sulsafe/processar-job-fase5.js`, `api/tutor/provas-pendentes.mjs`, `tests/fase5-geracao-prova.test.mjs` | dispatcher `PROVA`/`MODULO`, prompt por tipo a partir de `ia_jobs.prompt`, Zod antes de gravar, rascunho `publicado = false`, fila HITL sem gabarito; 13 testes novos |

**Estado atual:** `npm test` → 223/223; `npm run check` → 39 arquivos, 0 problemas. Nenhuma migration foi aplicada ao Supabase remoto, nenhum deploy foi feito na Vercel e nenhum frontend foi alterado. Relatórios: `RELATORIO_FASE5_ETAPA2.md` e `RELATORIO_FASE5_ETAPA3.md`.

---

## 11. Dívida Técnica

Remover dados de teste em produção (Turma Smoke 5.3, Prova NR-10, Aluno TESTE) e resetar o contador de notificações.

