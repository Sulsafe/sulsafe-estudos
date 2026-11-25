# SECURITY_AUDIT_SULSAFE.md — Auditoria consolidada da SulSafe

**Etapa:** PROMPT SULSAFE 01 — fundação, baseline e auditoria consolidada.
**Data:** 2026-11-24.
**Pasta analisada:** `C:\Users\maike\Desktop\sulsafe-estudos-main`.
**Referências:** OWASP Top 10 (2021), OWASP ASVS v4.0, princípios da LGPD (Lei nº 13.709/2018).
**Escopo:** 11 migrations Supabase + front-end HTML/JS **no momento da auditoria**. MR Tecnologia e OpenMAIC **não foram analisados nem modificados** nesta etapa.

**Atualização em 25/11/2026:** o escopo implantado passou a 12 migrations (inclui `20261124100000_tutor_distribuicao.sql`) e a DEC-005 foi autorizada e executada. As novas migrations e RPCs do TUTOR-Sulsafe foram revisadas nos testes de regressão (`npm test`: 192 testes); este documento permanece como o registro da auditoria da Etapa 01.

---

## 1. Resumo executivo

| Severidade | Quantidade | Corrigidos | Pendentes de código |
|---|---:|---:|---:|
| CRÍTICO | 0 | 0 | 0 |
| ALTO | 6 | 6 | 0 |
| MÉDIO | 10 | 10 | 0 |
| BAIXO | 6 | 6 | 0 |
| **TOTAL** | **22** | **22** | **0** |

Há **4 pendências que exigem decisão do proprietário** (multiempresa, cadastro, MFA por role e aplicação remota). Elas não são falhas de código e não foram corrigidas por conta própria — estão em `DECISIONS_SULSAFE.md`.

Nenhum achado foi classificado como CRÍTICO porque nenhum permitia comprometimento total do projeto sem interação do usuário. Os três achados ALTO originais da auditoria em curso (XSS no fórum, XSS em notificações e herança de `GRANT ALL`) tinham vetor de persistência no banco ou falha sistêmica silenciosa e foram priorizados.

---

## 2. Matriz de achados

| ID | Sev. | Evidência técnica | Status | Correção aplicada |
|---|---|---|---|---|
| SEC-SUL-01 | ALTO | `js/views/forum.js` (handler `onclick="window.abrirModalResponder('${p.id}', '${sanitizar(p.topico)...}')"`) | CORRIGIDO | Tópico removido do JS inline; botão usa `data-id` + `addEventListener`; modal lê o array local e usa `sanitizar()` apenas no texto |
| SEC-SUL-02 | ALTO | `js/app.js` (`onclick="window.clicarNotificacao('${n.id}', '${n.link || ''}')"`) | CORRIGIDO | `data-notif-id` + delegação de evento; `link` validado contra `LINKS_NOTIFICACAO` (allowlist) antes de `nav()` |
| SEC-SUL-03 | ALTO | `supabase/schema-base.sql:566-589` — `GRANT ALL` futuro para `anon`/`authenticated` | CORRIGIDO | Migration `20261124000000_endurece_default_privileges.sql` revoga herança para anon/authenticated em TABLES/SEQUENCES/FUNCTIONS/TYPES; `auto_expose_new_tables = false` |
| SEC-SUL-04 | ALTO | Policies amplas em `20261022000000_direcionamento_conteudo.sql` e `20261024001000_isolamento_academico.sql` | CORRIGIDO (baseline) | Policies `AS RESTRICTIVE` exigem `publico = true` ou vínculo via `auth.uid()`; coberto por `tests/seguranca-acesso.test.mjs` |
| SEC-SUL-05 | ALTO | Helpers e RPCs `SECURITY DEFINER` sem validação própria de `auth.uid()` | CORRIGIDO (baseline) | Helpers validam sessão/role internamente, com `SET search_path = ''`; `tests/concurrency-last-admin.test.mjs` confirma que `anon` não executa as 11 funções sensíveis |
| SEC-SUL-06 | ALTO | GUC `sulsafe.dossie_self_update` (`20261024000000_seguranca_profiles.sql`) manipulável pelo cliente | CORRIGIDO (baseline) | Removido em `20261025000000_endurece_protecao_perfil.sql`; trigger virou `SECURITY INVOKER` com `current_user` |
| SEC-SUL-07 | MÉDIO | Escrita em `profiles` sem auditoria (`schema-base.sql` + trigger `handle_new_user`) | CORRIGIDO (baseline) | Trigger auditado, colunas privilegiadas e último admin protegidos; `tests/seguranca-acesso.test.mjs` e `tests/concurrency-last-admin.test.mjs` |
| SEC-SUL-08 | MÉDIO | Deletes soltos no front (`js/views/admin.js`) | CORRIGIDO (baseline) | RPCs atômicas `SECURITY DEFINER`, `search_path = ''`, rollback em `EXCEPTION`, log em `exclusao_logs`; `tests/exclusao-atomica.test.mjs` |
| SEC-SUL-09 | MÉDIO | Exposição de segredos / chaves de API | CORRIGIDO (baseline + etapa) | Chave do Professor I.A apenas no Vault; `api_key_encriptada` guarda `vault:<nome>`; anon key é pública por design; service_role só em `popular-nrs.mjs` via `process.env` |
| SEC-SUL-10 | MÉDIO | `js/supabase-client.js:4` (CDN 2.39.0) vs `package.json:15` (`^2.45.0`) | CORRIGIDO | Versão canônica **2.118.0** fixa em CDN, `package.json` e lockfile — ver DEC-001 |
| SEC-SUL-11 | MÉDIO | `supabase/config.toml:177,183,186,227,229` — senha mínima 6, sem requirements, sem confirmação, troca insegura | CORRIGIDO | `minimum_password_length = 12`, `password_requirements = "lower_upper_letters_digits_symbols"`, `enable_confirmations = true`, `secure_password_change = true` |
| SEC-SUL-12 | MÉDIO | `supabase/config.toml:298-310` — MFA TOTP e phone desligados | CORRIGIDO (parcial) | TOTP habilitado localmente. **Exigência por role está pendente (DEC-004)** — decisão de produto |
| SEC-SUL-13 | MÉDIO | `js/app.js:37,161-162` e `js/views/config.js:31` — `nome_completo` cru em `innerHTML`/atributo | CORRIGIDO | `sanitizar()` no shell; no config o campo escapa na renderização e o nome é gravado como texto puro (remove controles e `<`/`>`), evitando dupla codificação |
| SEC-SUL-14 | MÉDIO | `js/views/provas.js:155,185` — `href="${p.arquivo_url}"` sem validação de esquema | CORRIGIDO | `hrefSeguro()` exportado de `js/chat-seguro.js` e reutilizado; só `http/https` vira âncora; `rel="noopener noreferrer"` |
| SEC-SUL-15 | BAIXO | `supabase/config.toml:5` — `project_id = "SulSafeEstudos"` divergente do ref `acqbidvknbqppkjidvsq` | CORRIGIDO | Ajustado ao ref real (risco operacional de `supabase link`/`db push` mirar projeto errado) |
| SEC-SUL-16 | BAIXO | `vercel.json:11-15` — CORS `*` com `Authorization` e ausência de headers de segurança | CORRIGIDO | Origem restrita a `https://sulsafe.com.br`, `Vary: Origin`, sem `Authorization` no wildcard; adicionados `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` e HSTS |
| SEC-SUL-17 | BAIXO | `supabase/config.toml:74-86` — `0.0.0.0/0` e SSL enforcement comentado | CORRIGIDO (documentado) | Comentário explícito de que é configuração local do CLI; remote exige allowlist + SSL (DEC-005) |
| SEC-SUL-18 | MÉDIO | Colisão de `window.liberarUsuario` entre `js/views/admin.js:247` e `js/views/pendentes.js:76` | CORRIGIDO | Pendentes renomeado para `liberarPendente`, usa `data-id` + `addEventListener`; a global do ADMIN permanece intacta |
| SEC-SUL-19 | MÉDIO | `js/views/pendentes.js:53` usava `created_at`; a coluna real é `criado_em` | CORRIGIDO | Trocado para `fmtD(u.criado_em)` |
| SEC-SUL-20 | BAIXO | `js/views/config.js:73` dependia do global `event.currentTarget` | CORRIGIDO | `setTema(id, el)` recebe o elemento clicado via `onclick="setTema('...', this)"` |
| SEC-SUL-21 | BAIXO | `js/videoaulas.js:40-44` — classes CSS dentro do atributo `style` | CORRIGIDO | Classes movidas para `class`; filtros voltaram a receber `.filtro-va-btn.on` |
| SEC-SUL-22 | BAIXO | `js/views/nrs.js:19` — botão "Saúde" chamava `filterNR('saude')`, categoria inexistente | CORRIGIDO | Botão inexistente removido; categorias reais: `gerais`, `especificas`, `setoriais` |

---

## 3. Cobertura dos 10 pontos exigidos

| Ponto da §3.3 | ID(s) | Cobertura |
|---|---|---|
| Policies amplas | SEC-SUL-04 | Migrations de RLS + `tests/seguranca-acesso.test.mjs` |
| `SECURITY DEFINER` sem `auth.uid()` | SEC-SUL-05 | Helpers validam sessão + `search_path = ''` + testes de runtime |
| `GRANT` excessivo | SEC-SUL-03 | Migration `20261124000000` + `auto_expose_new_tables = false` + teste PGlite |
| GUC manipulável pelo cliente | SEC-SUL-06 | GUC removido em `20261025000000` + testes |
| Escrita em `profiles` sem auditoria | SEC-SUL-07 | Trigger auditado + testes de acesso e concorrência |
| Deletes soltos | SEC-SUL-08 | RPCs atômicas com rollback + log + `tests/exclusao-atomica.test.mjs` |
| Exposição de segredos | SEC-SUL-09 | Vault, anon key pública, service_role só no servidor |
| `project_id` divergente | SEC-SUL-15 | Corrigido no `config.toml` |
| Colisão de `window.liberarUsuario` | SEC-SUL-18 | Delegação de evento no pendentes; global do ADMIN preservada |
| `created_at` onde é `criado_em` | SEC-SUL-19 | Corrigido no pendentes |

---

## 4. Falsos positivos confirmados (não corrigidos)

- `supabase/schema-base.sql:13` — `SET row_security = off` é artefato de `pg_dump`; as migrations habilitam RLS e os testes validam.
- GUC `almox.internal_movement` — sem leitores na migration atual; os triggers usam `current_user <> pg_get_userbyid(...)` e grants por coluna. Coberto por `tests/almoxarifado-migration.test.mjs`.
- `revoke ... from public` sem `from anon` em helpers — testes em runtime confirmam que `anon` não executa as funções sensíveis.
- Policies `to anon, authenticated` em conteúdo direcionado — são `AS RESTRICTIVE` e exigem `publico = true`; `anon` só lê conteúdo público, de forma intencional.
- `localStorage` — só `ss_cfg`, preferências, filtros e cópia local do fórum; sessão e perfil não são persistidos (`auth.js:145-146`, `main.js:112-113`).
- `innerHTML` em certificados/almoxarifado/dossiê/auditoria — interpolações passam por `sanitizar()`; handlers recebem UUIDs.

---

## 5. Testes de regressão desta etapa

| Arquivo | Cobre |
|---|---|
| `tests/hardening-seguranca.test.mjs` | SEC-SUL-01, 02, 03, 10, 11, 12, 13, 14, 15, 16 |
| `tests/bugs-front.test.mjs` | SEC-SUL-15/18/19/20/21/22 (front) e versão única do supabase-js |
| `tests/default-privileges-runtime.test.mjs` | SEC-SUL-03 em PGlite: tabela nova não é legível por anon/authenticated; service_role mantém acesso |
| `tests/seguranca-acesso.test.mjs` | SEC-SUL-04, 06, 07, 09 |
| `tests/exclusao-atomica.test.mjs` | SEC-SUL-08 |
| `tests/concurrency-last-admin.test.mjs` | SEC-SUL-05, 07 |

**Baseline:** 116/116 antes → **135/135 depois** (19 testes novos de regressão), `npm run check` com 0 problemas.

---

## 6. Pendências que exigem decisão do proprietário

1. **DEC-002 — multiempresa:** escolher isolamento real (A), rótulo comercial (B) ou meio-termo (C). Recomendação técnica: C. Impacta o desenho de `ia_jobs`/`ia_conteudos`.
2. **DEC-003 — cadastro:** manter cadastro público no remoto ou exigir convite/aprovação. Existe fluxo de pendentes, o que sugere convite.
3. **DEC-004 — MFA por role:** exigir MFA imediatamente para ADMIN ou usar transição de 30 dias.
4. **DEC-005 — aplicação remota:** autorizar aplicar `config.toml`, `vercel.json` e as migrations ao Supabase/Vercel.

Nenhuma dessas pendências foi corrigida por conta própria. Nenhuma migration remota foi aplicada.
