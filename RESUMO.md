# Resumo do trabalho — SulSafe Estudos

**Data:** 22/10/2026

**Projeto Supabase:** `acqbidvknbqppkjidvsq`
**Bucket de PDFs:** `documentos-nrs`

---

## 1. Objetivo

Popular a plataforma com os PDFs oficiais das 38 NRs, aplicar as migrations pendentes no Supabase remoto, garantir que os materiais apareçam na tela **Materiais de Apoio** e iniciar a geração automática de certificados em PDF.

---

## 2. Migrations

### Criadas no repositório

- `supabase/migrations/20261021000000_almoxarifado.sql`
  - Estrutura do módulo de Almoxarifado.
  - Tabelas, índices, RLS, funções RPC e testes de segurança.
- `supabase/migrations/20261022000000_direcionamento_conteudo.sql`
  - Adiciona `publico` em `materiais` e `videoaulas`.
  - Cria `turmas`, `turma_alunos`, `turma_materiais` e `provas_direcionadas`.
  - Cria índices, políticas RLS e funções auxiliares.
  - Mantém conteúdos antigos como globais (`publico = true`).
- `supabase/migrations/20261023000000_certificados_cpf_revogado.sql`
  - Adiciona `profiles.cpf`.
  - Adiciona `certificados.revogado` com valor padrão `false`.
  - Cria índice parcial para certificados revogados.

### Aplicadas no Supabase remoto

Comando utilizado:

```powershell
npx --yes supabase@2.121.0 db push --linked --yes
```

Resultado:

- `20261021000000_almoxarifado.sql` — aplicada.
- `20261022000000_direcionamento_conteudo.sql` — aplicada.
- `20261023000000_certificados_cpf_revogado.sql` — aplicada.

Verificação do histórico:

```powershell
npx --yes supabase@2.121.0 migration list
```

As três migrations aparecem iguais no local e no remoto.

### Estruturas confirmadas no remoto

- `materiais.publico`
- `videoaulas.publico`
- `turmas`
- `turma_alunos`
- `turma_materiais`
- `provas_direcionadas`
- `almox_itens`
- `almox_lotes`
- `almox_movimentacoes`
- `profiles.cpf`
- `certificados.revogado`

---

## 3. PDFs das NRs

### Script criado

`popular-nrs.mjs`

Responsabilidades:

- Baixar os PDFs oficiais das 38 NRs.
- Criar/reutilizar o bucket público `documentos-nrs`.
- Fazer upload com sobrescrita.
- Inserir ou atualizar os registros em `public.materiais`.
- Repetir downloads com falha.
- Aguardar 2 segundos entre cada NR.
- Exibir resumo final.

Script npm adicionado em `package.json`:

```json
"popular-nrs": "node popular-nrs.mjs"
```

### Execução

```powershell
node popular-nrs.mjs
```

Resultado:

- 38 inseridos
- 0 atualizados
- 0 falhas

### Verificações realizadas

- 38 registros em `public.materiais`.
- NRs 1 a 38 presentes.
- Nenhuma duplicidade.
- Bucket `documentos-nrs` público.
- 38/38 URLs públicas retornando PDF.
- NR-02 e NR-27 são revogadas e foram incluídas com “(Revogada)” no título.

---

## 4. Ajuste de `publico = true`

Após a migration, os 38 PDFs foram atualizados para ficarem visíveis:

- Filtro usado: `tipo = 'PDF'` e URL do bucket `documentos-nrs`.
- `PATCH` em `public.materiais` com `{ "publico": true }`.

Resultado verificado:

- 38 materiais encontrados.
- 38 atualizados.
- 38/38 com `publico = true`.
- NRs 1 a 38 confirmadas.

---

## 5. Diagnóstico da tela “Materiais de Apoio”

Arquivos envolvidos:

- `js/materiais.js` — view “Materiais de Apoio”, renderiza `#materiaisGrid`.
- `js/supabase-client.js` — função `sbGetMateriais`.
- `js/views/professor.js` — também usa `sbGetMateriais(null, null)`.

Testes realizados:

- Consulta com a chave de serviço: retornava os 38 registros.
- Consulta com a chave anônima e sem sessão: retornava 0 por causa da RLS
  (`auth.role() = 'authenticated'`).
- Consulta com usuário autenticado temporário: retornava os 38 registros.
- Usuário temporário removido após o teste.

Conclusão: os dados, o bucket e a consulta estavam corretos. O problema era
ambiental (sessão não ativa na aba, página carregada antes da inserção ou código
antigo em cache/deploy).

---

## 6. Alterações no front-end

### `js/supabase-client.js`

`sbGetMateriais` foi reforçada:

- Evita repetir a consulta com `publico` quando a coluna não existe.
- Se a coluna existir, usa o filtro normalmente.
- Se o embed `profiles(nome_completo)` falhar, refaz a consulta sem o embed.
- Retorna `[]` em vez de `null` quando não há registros.

### `js/materiais.js`

Melhorias na tela:

- Botão **Atualizar**.
- Estado de carregamento.
- Contador de materiais encontrados.
- Mensagem de erro com detalhe e botão **Tentar novamente**.
- Aviso de **sessão expirada** com link para login.
- Ícone específico para PDF (`fa-file-pdf`).

---

## 7. Outras entregas presentes no working tree

Além do trabalho das NRs, o repositório contém mudanças staged para:

- Acessibilidade (`acessibilidade.css`, `js/accessibility.js`).
- Almoxarifado (`js/almoxarifado-rules.js`, `js/almoxarifado.js`, `js/views/almoxarifado.js`).
- Central administrativa e gráficos (`js/views/central.js`, `js/charts-admin.js`).
- Trilhas (`js/views/trilhas.js`).
- Área do professor: turmas, vínculo de conteúdos e provas direcionadas.
- Ajustes em videoaulas, provas, início, estado, utils, app e main.
- Schema base do Supabase (`supabase/schema-base.sql`).
- Configuração local do Supabase (`supabase/config.toml`, `supabase/.gitignore`).
- Testes das migrations e regras de Almoxarifado/Direcionamento.
- Atualizações de `README.md`, `package.json`, `style.css`, `index.html` e `login.html`.

---

## 8. Testes e validações

### Testes automatizados

```powershell
npm test
```

Resultado:

- 33 testes
- 33 passando
- 0 falhas

### Verificação de imports/sintaxe

```powershell
npm run check
```

Resultado:

- 28 arquivos JavaScript analisados
- 0 problemas

### Validação pós-migration

- Usuário autenticado temporário consultou `materiais` com `publico = true`.
- Resultado: 38 linhas, NRs 1 a 38.
- Acesso à tabela `turmas`: OK.
- Usuário de teste deletado ao final.

---

## 9. Estado atual

- Migrations aplicadas no remoto.
- 38 PDFs cadastrados e públicos.
- Estruturas de turmas e direcionamento criadas.
- Testes passando.
- Nenhum commit realizado.
- Nenhum deploy realizado.
- Alterações de front-end estão staged no Git.
- Credenciais ficam em `.env`, que é ignorado pelo `.gitignore`.

---

## 10. Próximos passos

1. Fazer commit das alterações quando desejado.
2. Publicar/deployar o front-end atualizado.
3. Acessar o site logado e usar **Ctrl+F5** para limpar o cache.
4. Abrir **Materiais de Apoio** e confirmar os 38 PDFs.
5. Se ainda houver problema, verificar no console:
   - se existe sessão Supabase ativa;
   - o resultado de `sbGetMateriais()`;
   - a mensagem exibida pela nova tela de diagnóstico.

---

## 11. Gerador de certificados

### Dependência

- `pdf-lib` instalado via npm (`^1.17.1`).
- No navegador, o módulo carrega `pdf-lib` por `https://esm.sh/pdf-lib@1.17.1`.
- Para testes em Node, o módulo aceita `opcoes.pdfLib`.

### Arquivo criado

- `js/certificado-pdf.js`

### Funções principais

- `criarCertificadoPDF(aluno, curso, opcoes)` — gera frente + verso e retorna os bytes.
- `gerarCertificadoPDF(aluno, curso, opcoes)` — gera e faz o download automático.
- `montarDadosCertificado({ certificado, aluno, instrutor, nr })` — monta os objetos a partir das linhas do Supabase.

### Dados usados

- `public.certificados`: `id`, `usuario_id`, `nr_id`, `codigo`, `nota`, `carga_horaria`, `emitido_por`, `criado_em`, `revogado`.
- `public.profiles` (aluno): `id`, `nome_completo`, `email`, `cpf`.
- `public.profiles` (instrutor): `id`, `nome_completo`.
- `NRS` em `js/state.js`: `n` → nome do curso/NR.

### Layout

- Frente: usa `certificado.png` como fundo.
- Verso: gerado programaticamente com conteúdo programático, normas, dados do certificado e assinaturas.
- Coordenadas: `POSICOES_CERTIFICADO` no início de `js/certificado-pdf.js`.
- Modo de alinhamento: `debugCoordenadas: true` desenha cruzes vermelhas nas posições.

### Schema e front-end ajustados

- `profiles.cpf` foi criada no remoto.
- `certificados.revogado` foi criada no remoto.
- `js/views/certificados.js` agora usa `criado_em` em vez de `emitido_em`.
- O título exibido é montado a partir de `nr_id` + `NRS`, sem depender de `titulo`.
- O código exibido usa `certificados.codigo` com fallback para o `id`.
- A revogação usa a coluna real `revogado`.
- Ainda falta adicionar o campo de CPF no cadastro/perfil para preenchê-lo automaticamente.

### Validação feita

- `node --check js/certificado-pdf.js`: OK.
- `node --check js/views/certificados.js`: OK.
- `npm run check`: 28 arquivos, 0 problemas.
- `npm test`: 33 testes, 33 passando.
- Geração de teste em Node: PDF com 2 páginas, 1228x864, ~1,25 MB.
- Teste com `debugCoordenadas: true` salvo em `C:\Users\maike\Desktop\teste-certificado.pdf`.

---

## 12. Comandos úteis

```powershell
# Popular/atualizar os PDFs
node popular-nrs.mjs

# Aplicar migrations pendentes
npx --yes supabase@2.121.0 db push --linked --yes

# Conferir histórico
npx --yes supabase@2.121.0 migration list

# Rodar testes
npm test

# Verificar imports/sintaxe
npm run check
```

---

## 13. Correções de segurança (migrations aplicadas no remoto)

**Data:** 22/10/2026

### Migrations criadas

- `supabase/migrations/20261024000000_seguranca_profiles.sql`
  - Ativa RLS em `profiles` e remove leitura ampla.
  - Cria helpers de conta ativa, admin e super admin.
  - Protege `role`, `status`, `email`, CPF e campos do dossiê via trigger.
  - Impede rebaixar/bloquear/excluir o último administrador ativo.
  - Valida CPF com dígitos verificadores no servidor.
  - Cria `dossie_auditoria` e registra alterações de status/observações.
  - Recria `atualizar_meu_dossie` e `definir_foto_perfil` com validação e normalização de CPF.
- `supabase/migrations/20261024001000_isolamento_academico.sql`
  - Remove as policies `"Leitura para autenticados"`.
  - Cria policies por proprietário/professor/admin para notas, provas, certificados, progresso, fórum e salas.
  - Mantém as policies restritivas de direcionamento de materiais/videoaulas.
  - Cria RPCs seguros para listar alunos, perfis públicos, provas, salas e fórum.
  - Adiciona triggers de propriedade em notas, provas e certificados.
  - Revoga `anon` das tabelas acadêmicas e ativa `security_invoker` nas views.

### Ordem de aplicação

1. `20261023100000_dossie_sistec.sql` (pré-requisito)
2. `20261024000000_seguranca_profiles.sql`
3. `20261024001000_isolamento_academico.sql`

### Front-end

- Removida a persistência de `ss_session` e `ss_user` no `localStorage`.
- Sessão restaurada somente com `getSession()` + `getUser()` e status `ativo`.
- `sbGetUser`, listagem de alunos, provas, salas e fórum usam RPCs seguros com fallback de deploy.
- Criada `reset-password.html` usando `updateUser`.

### Validações executadas

- `npm test`: 58 testes, 58 passando.
- `npm run check`: 31 arquivos JavaScript, 0 problemas.
- SQL validado com parser PostgreSQL real.
- Migrations aplicadas em PostgreSQL 18 via PGlite com stubs de `auth`/`storage`; cenários de RLS, CPF, dossiê, notas, certificados, último admin e `anon` passaram.

### Aplicação no remoto

As duas migrations foram aplicadas em 22/10/2026 com:

```powershell
npx --yes supabase@2.121.0 db push --linked --yes
```

Verificações após a aplicação:

- Histórico local e remoto iguais para `20261024000000` e `20261024001000`.
- `profiles` com RLS ativa e 4 policies, sem policies de leitura ampla.
- `anon` sem acesso a `profiles` e `notas`.
- 19 helpers `sulsafe_*`, 6 triggers de proteção e 3 views com `security_invoker`.
- `dossie_auditoria` criada.
- Admin vê os 2 perfis; aluno vê somente o próprio perfil.
- RPC `sulsafe_listar_alunos` respondeu corretamente para admin.

### Estado

- Migrations de segurança aplicadas no Supabase remoto.
- Nenhum deploy e nenhum commit foram realizados.
