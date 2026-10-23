# 🦺 SulSafe — Plataforma de Cursos de NR Online

Plataforma SaaS de ensino de Segurança do Trabalho com 38 NRs, videoaulas, aulas ao vivo, certificados PDF, trabalhos/avaliações estilo faculdade, IA com pesquisa na internet e pagamentos via Mercado Pago.

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

### 4. Configurar Mercado Pago (quando tiver a chave)

Quando você tiver a chave do Mercado Pago:

1. Faça login como admin (`sulsafetreinamentos@gmail.com`)
2. Vá em "Gerenciar Usuários" → "Configurações da Plataforma"
3. Cole sua **Public Key** no campo "MERCADO PAGO — PUBLIC KEY"
4. Clique "Salvar configurações"
5. Pronto! Os botões "Assinar" e "Pagar boleto" vão funcionar

**Para obter a chave**:
- Sandbox (testes): https://www.mercadopago.com.br/developers/panel/credentials/sandbox
- Produção: https://www.mercadopago.com.br/developers/panel/credentials
- Começa com `TEST-` (sandbox) ou `APP_USR-` (produção)

## ✨ O que tem nesta versão (Up completo)

### 🎨 Visual
- ✅ Nova landing page comercial (hero + 38 NRs + planos + depoimentos + FAQ)
- ✅ App principal redesenhado (glassmorphism, dark mode, animações)
- ✅ Mascote pop-up melhorado (8 opções de ajuda, frases rotativas, animação)
- ✅ 7 redes sociais no footer (YouTube, Instagram, WhatsApp, LinkedIn, Facebook, TikTok, X)
- ✅ Responsivo mobile-first

### 👥 3 papéis com permissões (RBAC)
- 🔵 **ADMIN** (Modo Deus) — `sulsafetreinamentos@gmail.com`:
  - Vê TUDO: financeiro, usuários, métricas, certificados, configurações
  - Pode editar preços (R$ 49,90 - R$ 100,00)
  - Pode promover/rebaixar/suspender usuários
- 🟢 **PROFESSOR** — só ensina:
  - Subir materiais, criar trabalhos, dar notas
  - Gerar certificados dos alunos
  - **NÃO vê** dinheiro/faturamento
- 🟡 **ALUNO** — só estuda:
  - Videoaulas, aulas ao vivo, materiais, NRs
  - Vê só **seus próprios boletos**
  - Usa Assistente NR (IA)
  - Faz trabalhos e avaliações

### 📜 Gerador de Certificado PDF
- Modelo idêntico ao `certificado.png` (verde + dourado, retrato)
- **Busca de aluno com autocomplete** (digita nome → puxa dados)
- 2 modos: "Para aluno cadastrado" + "Avulso" (pra presentiar)
- Upload de assinatura digital (diretor + instrutor)
- Persiste assinaturas no navegador (não precisa subir toda vez)
- Pré-visualização em tempo real
- Gera PDF com jsPDF

### 💰 Financeiro + Mercado Pago
- **Admin**: vê todos os pagamentos, faturamento, métricas
- **Aluno**: vê só seus boletos + plano atual
- **Professor**: não vê nada de dinheiro
- 3 planos: Mensal R$ 49,90 / Trimestral R$ 129,90 / Anual R$ 399,90
- Admin pode editar preços quando quiser
- Mercado Pago SDK integrado (só colar a chave)
- Registrar pagamento manual (alternativa sem MP)
- Histórico de pagamentos + comprovante PDF

### 📝 Trabalhos e Avaliações (estilo UniCesumar)
- Cards em grade com badges coloridos de status
  - 🔵 PENDENTE / 🟡 EM CORREÇÃO / 🟢 ENTREGUE / 🔴 ATRASADO
- Contador regressivo ("restam X dias")
- Professor cria atividades (trabalho OU avaliação com questões)
- Aluno envia resposta + arquivo
- Professor avalia (nota + feedback)
- Avaliações com questões de múltipla escolha + nota automática
- Boletim integrado (60% trabalhos + 40% avaliações)

### 🤖 Assistente NR com IA + Internet
- Chat com IA (Gemini via Supabase Edge Function)
- **Pesquisa na internet em tempo real** (DuckDuckGo via proxy CORS)
- Mostra fontes consultadas em cada resposta
- Botões de perguntas rápidas
- Contextualizado por NR
- Fallback gracioso (resposta local se internet/IA falharem)

### 📚 38 NRs vigentes com explicações
Todas as 38 Normas Regulamentadoras cadastradas com:
- Número (NR-01 a NR-38)
- Título completo
- Categoria (Geral / Específica / Saúde / Setorial)
- Ícone (emoji)
- Descrição resumida
- Objetivos principais (lista)
- Busca + filtros por categoria

## 🔧 Configurações necessárias no Supabase

Algumas tabelas precisam ser criadas no Supabase Studio → SQL Editor. O SQL completo está documentado nos comentários dentro do `login.html` (procure por `CREATE TABLE`).

Tabelas necessárias:
- `profiles` (provavelmente já existe)
- `transacoes` (provavelmente já existe)
- `trabalhos` (novo — SQL no código)
- `trabalhos_submissao` (novo — SQL no código)
- `certificados_emitidos` (novo — SQL no código)

Se alguma tabela não existir, o código falha graciosamente (mostra mensagem mas não quebra).

## 🎯 Próximos passos recomendados

1. ✅ Subir os arquivos no GitHub (5 min)
2. ⏳ Criar tabelas no Supabase (15 min — SQL no código)
3. ⏳ Conseguir chave do Mercado Pago (1 dia)
4. ⏳ Configurar MP Public Key no painel admin (1 min)
5. ⏳ Subir suas assinaturas digitais (5 min)
6. ⏳ Testar com 1-2 alunos reais (1 dia)
7. 🚀 Começar a vender!

## 📞 Suporte

Se algo quebrar ou precisar de ajuste, me chama!

---

**SulSafe** · Sua segurança, nosso compromisso · © 2025
