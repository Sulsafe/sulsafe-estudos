# 🦺 SulSafe — Plataforma de Cursos de NR Online

Plataforma SaaS de ensino de Segurança do Trabalho com 38 NRs, videoaulas, aulas ao vivo, certificados PDF, trabalhos/avaliações estilo faculdade, **Secretária interna inclusa (grátis, sem API)** e **TUTOR-Sulsafe / Professor I.A com API plugável (sob consulta)**. A geração cria rascunhos revisáveis por humanos; nada é publicado para alunos sem aprovação. Cobrança manual via orçamento — sem pagamento online.

## 📦 Arquivos deste pacote

```
sulsafe/
├── index.html              ← Landing page comercial (1.845 linhas)
├── login.html              ← App principal completo (9.958 linhas)
├── manifest.json           ← PWA manifest
├── README.md               ← Este arquivo
└── assets/
    ├── sulsafe.png         ← Logo principal (hero da landing)
    ├── logo1.png           ← Logo simplificado (header)
    ├── seg.png             ← Brasão dourado clássico
    ├── simbolopreto.png    ← Símbolo preto
    ├── sipat-seguranca.png ← Mascote 3D (ajudante pop-up)
    ├── certificado.png     ← Modelo do certificado (referência)
    ├── elementos.png       ← Ícones de EPI (decorativo)
    └── elementos2.png      ← 16 ícones 3D de equipamentos
```

## 🚀 Como subir pro GitHub Pages (5 minutos)

### 1. Subir os arquivos no seu repo

Você já tem um repo no GitHub com `index.html`, `login.html`, `CNAME` e as imagens. Só precisa substituir os arquivos antigos pelos novos:

1. Acesse seu repo no GitHub: `https://github.com/SEU_USUARIO/sulsafe` (ou o nome que deu)
2. Substitua os arquivos:
   - `index.html` → cole o NOVO `index.html` deste pacote
   - `login.html` → cole o NOVO `login.html` deste pacote
   - Adicione `manifest.json` (novo)
   - Mantenha o `CNAME` (já tem — aponta pra `sulsafe.com.br`)
3. Os arquivos em `assets/` já existem no seu repo (são os mesmos que você me mandou). Se quiser, pode manter os que já estão lá.

### 2. Aguardar o GitHub Pages atualizar (1-2 min)

O GitHub Pages rebuilda automaticamente a cada push. Acesse:
- **https://sulsafe.com.br** (sua landing nova)
- **https://sulsafe.com.br/login.html** (seu app novo)

### 3. Configurar o admin master

O email `sulsafetreinamentos@gmail.com` já está hardcoded como admin master no código. Quando você logar com esse email, entra direto no "Modo Deus" (vê tudo).

Para mudar o admin master (se quiser):
1. Abra `js/utils.js` e altere a constante `ADMIN_EMAIL`
2. A migration do Almoxarifado também valida esse e-mail master (ou `role` igual a `admin`/`super_admin`)

### 4. Configurar o Professor I.A (opcional, cobrado à parte)

A **Secretária** já funciona sem configuração e continua grátis. O Professor I.A é separado:

1. Aplique a migration `supabase/migrations/20261027000000_config_ia_professor.sql`
2. Faça login como admin (`sulsafetreinamentos@gmail.com`) e abra o **Modo Deus**
3. Na seção **PROFESSOR I.A — API**, escolha:
   - **Desativado** (padrão): o botão "Criar com I.A" fica oculto
   - **Usar API da SulSafe**: fale com o suporte e negocie o valor — cada empresa tem um preço diferente conforme volume
   - **Usar minha própria API**: informe provedor (OpenAI, Gemini, Anthropic ou custom), URL `https://`, chave e modelo
4. Salve. A chave vai direto para o **Supabase Vault**; nunca fica no navegador nem volta em claro na tela

Com a configuração ativa, o menu mostra **Criar com o TUTOR-Sulsafe**. O fluxo gera a ementa como **rascunho**, exige revisão humana (aprovar/rejeitar) e só materializa em `videoaulas`/`materiais` com `publico = false` após decisão explícita. A chave fica no Supabase Vault e nunca passa pelo navegador.

## ✨ O que tem nesta versão (Up completo)

### 🎨 Visual
- ✅ Nova landing page comercial (hero + 38 NRs + depoimentos + FAQ)
- ✅ App principal redesenhado (glassmorphism, dark mode, animações)
- ✅ Mascote pop-up melhorado (8 opções de ajuda, frases rotativas, animação)
- ✅ 7 redes sociais no footer (YouTube, Instagram, WhatsApp, LinkedIn, Facebook, TikTok, X)
- ✅ Responsivo mobile-first

### 👥 3 papéis com permissões (RBAC)
- 🔵 **ADMIN** (Modo Deus) — `sulsafetreinamentos@gmail.com`:
  - Gerencia usuários, métricas, certificados e configurações
  - Configura o Professor I.A e registra cobranças manuais
  - Pode promover/rebaixar/bloquear usuários
- 🟢 **PROFESSOR** — só ensina:
  - Sobe materiais, cria trabalhos, dá notas
  - Gera certificados dos alunos
  - **NÃO vê** cobranças nem configuração de API
- 🟡 **ALUNO** — só estuda:
  - Videoaulas, aulas ao vivo, materiais, NRs
  - Vê só seu boletim e seus certificados
  - Usa a Secretária inclusa
  - Faz trabalhos e avaliações

### 📜 Gerador de Certificado PDF
- Modelo idêntico ao `certificado.png` (verde + dourado, retrato)
- **Busca de aluno com autocomplete** (digita nome → puxa dados)
- 2 modos: "Para aluno cadastrado" + "Avulso" (pra presentiar)
- Upload de assinatura digital (diretor + instrutor)
- Persiste assinaturas no navegador (não precisa subir toda vez)
- Pré-visualização em tempo real
- Gera PDF com jsPDF

### 💰 Cobrança manual (sem pagamento online)
- **Não há Mercado Pago, planos fixos nem checkout na plataforma**
- O admin registra o pagamento manualmente em `transacoes`, com motivo como
  `Ativação Professor I.A - Empresa X - Valor Y`
- Valores são negociados caso a caso, por orçamento — não existe tabela de preços
- **Professor I.A com API da SulSafe**: cobrado à parte, valor conforme volume
- **Professor I.A com API própria**: a empresa paga a API dela; a SulSafe só faz a ponte
- **Secretária**: inclusa, grátis, sem custo adicional

### 📝 Trabalhos e Avaliações (estilo UniCesumar)
- Cards em grade com badges coloridos de status
  - 🔵 PENDENTE / 🟡 EM CORREÇÃO / 🟢 ENTREGUE / 🔴 ATRASADO
- Contador regressivo ("restam X dias")
- Professor cria atividades (trabalho OU avaliação com questões)
- Aluno envia resposta + arquivo
- Professor avalia (nota + feedback)
- Avaliações com questões de múltipla escolha + nota automática
- Boletim integrado (60% trabalhos + 40% avaliações)

### 🤖 Duas IAS separadas (não confundir)

**IA 1 — Secretária SulSafe (inclusa, grátis, sempre local)**
- Recepcionista da plataforma: não cria curso, não corrige prova, não dá gabarito
- Sabe onde fica cada página e o conteúdo dos cards das 38 NRs
- Responde com base em `js/base-conhecimento-sulsafe.js` — sem API, sem internet, sem custo
- Recusa gabarito de prova e perguntas fora da SulSafe
- Toda saída passa pelo sanitizador `js/chat-seguro.js`

**IA 2 — TUTOR-Sulsafe / Professor I.A (com API, cobrada à parte)**
- Cria cursos, palestras e avaliações a partir de um assunto ("Crie um curso sobre NR 35 para novos colaboradores")
- Usa as 38 NRs locais como contexto; converte a saída para o contrato pt-BR `{ titulo, descricao, publicoAlvo, objetivos, modulos }`
- API plugável (BYOA): API da SulSafe, OpenAI, Gemini, Anthropic ou custom
- Configurada somente pelo ADMIN; chave no Supabase Vault
- **Human-in-the-Loop obrigatório**: geração vira rascunho; aluno nunca vê; publicar é decisão separada
- Empresas e convites em **Modo Deus → Empresas e Convites** gravam `app_metadata.empresa_id` no JWT pela Edge Function
- Cobrança manual por orçamento — sem Mercado Pago

### 📚 38 NRs do catálogo com explicações
Todas as 38 Normas Regulamentadoras cadastradas com:
- Número (NR-01 a NR-38, incluindo as revogadas NR-02 e NR-27 como referência histórica)
- Título completo
- Categoria (Gerais / Específicas / Setoriais)
- Ícone (emoji)
- Descrição resumida
- Objetivos principais (lista)
- Link para o PDF oficial
- Busca + filtros por categoria

## 🔧 Configurações necessárias no Supabase

As migrations ficam em `supabase/migrations/`. Aplique no Supabase Studio → SQL Editor:
- `20261026000000_exclusao_atomica.sql` — RPCs de exclusão atômica + tabelas `trabalhos`/`trabalhos_submissao`
- `20261027000000_config_ia_professor.sql` — tabela `config_ia_professor` e RPCs do Professor I.A

Tabelas usadas: `profiles`, `transacoes` (cobrança manual) e as criações acima. Se alguma não existir, a tela mostra mensagem gracefulmente sem quebrar o app.

## 🎯 Próximos passos recomendados

1. ✅ Subir os arquivos no GitHub
2. ⏳ Aplicar as migrations de exclusão atômica e de `config_ia_professor`
3. ⏳ Testar a Secretária (já inclusa, sem configuração)
4. ⏳ Negociar o Professor I.A com o suporte **ou** configurar a API própria no Modo Deus
5. ⏳ Registrar a ativação manualmente em `transacoes` (motivo: Empresa X / Valor Y)
6. ⏳ Testar com 1-2 alunos reais
7. 🚀 Publicar o front atualizado no domínio e concluir o teste com convite real e conta Aluno

## 📞 Suporte

Se algo quebrar ou precisar de ajuste, me chama!

---

**SulSafe** · Sua segurança, nosso compromisso · © 2025
