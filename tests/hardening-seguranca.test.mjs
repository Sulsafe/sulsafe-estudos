import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')

const forum = ler('../js/views/forum.js')
const app = ler('../js/app.js')
const config = ler('../js/views/config.js')
const provas = ler('../js/views/provas.js')
const chatSeguro = ler('../js/chat-seguro.js')
const supabaseClient = ler('../js/supabase-client.js')
const migration = ler('../supabase/migrations/20261124000000_endurece_default_privileges.sql')
const toml = ler('../supabase/config.toml')
const vercel = JSON.parse(ler('../vercel.json'))
const packageJson = JSON.parse(ler('../package.json'))
const lock = JSON.parse(ler('../package-lock.json'))

// ---------------------------------------------------------------
// ALTA — Fórum: tópico do aluno não pode virar código JS inline.
// ---------------------------------------------------------------

test('fórum não interpola tópico em onclick nem quebra literal com apóstrofo', () => {
    assert.doesNotMatch(forum, /onclick="window\.abrirModalResponder/)
    assert.doesNotMatch(forum, /sanitizar\(p\.topico\)\.replace/)
    assert.match(forum, /class="btn btn-sm btn-s btn-responder-forum"/)
    assert.match(forum, /data-id="\$\{escapeHTML\(p\.id\)\}"/)
    assert.match(forum, /botao\.addEventListener\('click'/)
})

test('modal de resposta lê o tópico do array local e usa submit sem inline JS', () => {
    assert.match(forum, /function abrirModalResponder\(id\)/)
    assert.match(forum, /forumPosts\.find/)
    assert.match(forum, /const topico = sanitizar\(post\?\.topico/)
    assert.doesNotMatch(forum, /onsubmit="window\.enviarRespostaForum/)
    assert.match(forum, /id="formRespostaForum"/)
    assert.match(forum, /addEventListener\('submit'/)
})

// ---------------------------------------------------------------
// ALTA — Notificações: link/id do banco não viram código JS inline.
// ---------------------------------------------------------------

test('notificações usam data-* e delegação de evento, sem onclick interpolado', () => {
    assert.doesNotMatch(app, /onclick="window\.clicarNotificacao/)
    assert.match(app, /data-notif-id="\$\{escapeHTML\(n\.id\)\}"/)
    assert.match(app, /function ligarNotificacoes\(container\)/)
    assert.match(app, /dataset\.notifId/)
    assert.match(app, /ligarNotificacoes\(listContainer\)/)
})

test('link de notificação passa por allowlist antes de navegar', () => {
    assert.match(app, /const LINKS_NOTIFICACAO = new Set/)
    assert.match(app, /LINKS_NOTIFICACAO\.has\(linkBruto\)/)
    assert.match(app, /S\.views\[link\]/)
    assert.doesNotMatch(app, /nav\(n\.link\)/)
})

test('nome do usuário é escapado no shell e no campo de configurações', () => {
    assert.match(app, /const userNome = sanitizar\(S\.user\?\.nome_completo/)
    assert.match(app, /class="sb-name" title="\$\{userNome\}"\>\$\{userNome\}/)
    assert.match(config, /value="\$\{sanitizar\(S\.user\?\.nome_completo/)
})

test('nome salvo não grava entidades HTML no banco', () => {
    assert.doesNotMatch(config, /const nomeLimpo = sanitizar\(nome\)/)
    assert.match(config, /replace\(\/\[\\u0000-\\u001F<>\]\/g, ''\)/)
})

// ---------------------------------------------------------------
// MÉDIO — Links de arquivo com esquema arbitrário.
// ---------------------------------------------------------------

test('hrefSeguro é exportado e reutilizado nos links de PDF', () => {
    assert.match(chatSeguro, /export function hrefSeguro/)
    assert.match(provas, /import \{ hrefSeguro \}/)
    assert.match(provas, /linkArquivoSeguro\(p\.arquivo_url\)/)
    assert.doesNotMatch(provas, /href="\$\{p\.arquivo_url\}"/)
    assert.match(provas, /rel="noopener noreferrer"/)
})

// ---------------------------------------------------------------
// ALTA — Default privileges do schema-base.
// ---------------------------------------------------------------

test('migration revoga herança de GRANT ALL para anon/authenticated', () => {
    for (const objeto of ['TABLES', 'SEQUENCES', 'FUNCTIONS', 'TYPES']) {
        assert.match(
            migration,
            new RegExp(`alter default privileges in schema public revoke all on ${objeto} from anon, authenticated`, 'i'),
            `faltou revogar ${objeto}`
        )
        assert.match(
            migration,
            new RegExp(`alter default privileges in schema public grant all on ${objeto} to service_role`, 'i'),
            `faltou grants de service_role em ${objeto}`
        )
    }
    assert.doesNotMatch(migration, /grant\s+all[\s\S]*to\s+anon\/authenticated/i)
})

test('CLI do Supabase não expõe tabelas novas automaticamente', () => {
    assert.match(toml, /auto_expose_new_tables = false/)
    assert.doesNotMatch(toml, /^# auto_expose_new_tables/)
})

// ---------------------------------------------------------------
// Configuração remota/local e supply chain.
// ---------------------------------------------------------------

test('config.toml usa o project_id real e exige MFA/senha forte', () => {
    assert.match(toml, /project_id = "acqbidvknbqppkjidvsq"/)
    assert.match(toml, /minimum_password_length = 12/)
    assert.match(toml, /password_requirements = "lower_upper_letters_digits_symbols"/)
    assert.match(toml, /secure_password_change = true/)
    assert.match(toml, /\[auth\.mfa\.totp\][\s\S]*?enroll_enabled = true[\s\S]*?verify_enabled = true/)
})

test('supabase-js tem versão única, fixa e idêntica em CDN, package.json e lockfile', () => {
    const versaoLock = lock.packages['node_modules/@supabase/supabase-js'].version
    const versaoDeclarada = packageJson.dependencies['@supabase/supabase-js']
    const versaoRaizLock = lock.packages[''].dependencies['@supabase/supabase-js']
    const versaoCDN = supabaseClient.match(/@supabase\/supabase-js@([0-9]+\.[0-9]+\.[0-9]+)/)?.[1]

    assert.equal(versaoDeclarada, versaoLock, 'package.json divergiu do lockfile')
    assert.equal(versaoRaizLock, versaoLock, 'a raiz do lockfile divergiu do pacote instalado')
    assert.equal(versaoCDN, versaoLock, 'CDN divergiu do lockfile')

    // Nenhum caret, "latest" ou range pode reaparecer.
    assert.doesNotMatch(versaoDeclarada, /[\^~><=*]|^latest$/)
    assert.doesNotMatch(supabaseClient, /supabase-js@latest|supabase-js@\^|supabase-js@2\.39\.0/)
    assert.match(supabaseClient, new RegExp(`@supabase/supabase-js@${versaoLock.replace(/\./g, '\\.')}`))
})

test('Vercel não usa CORS wildcard com Authorization e inclui headers de segurança', () => {
    const api = vercel.headers.find(h => h.source === '/api/(.*)')
    const global = vercel.headers.find(h => h.source === '/(.*)')

    assert.ok(api)
    assert.ok(global)

    const corsOrigin = api.headers.find(h => h.key === 'Access-Control-Allow-Origin')
    assert.equal(corsOrigin.value, 'https://sulsafe.com.br')
    assert.doesNotMatch(JSON.stringify(api), /Authorization/)
    assert.doesNotMatch(JSON.stringify(vercel), /Access-Control-Allow-Origin","value":"\*/)

    const chaves = global.headers.map(h => h.key)
    for (const necessaria of [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Permissions-Policy',
        'Strict-Transport-Security'
    ]) {
        assert.ok(chaves.includes(necessaria), `faltou header ${necessaria}`)
    }
})

test('novo teste de hardening está registrado no npm test', () => {
    assert.match(packageJson.scripts.test, /tests\/hardening-seguranca\.test\.mjs/)
})
