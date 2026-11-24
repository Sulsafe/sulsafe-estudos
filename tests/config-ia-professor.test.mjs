import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {
    PROVEDORES_IA_PROFESSOR,
    CONFIG_IA_PROFESSOR_PADRAO,
    deveMostrarBotaoProfessorIA,
    modoDoSelect,
    provedorDoModo,
    camposVisiveisDoModo,
    textoOrientacaoDoModo,
    normalizarConfigIAProfessor,
    payloadConfigIAProfessor
} from '../js/ia-professor.js'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const sql = ler('../supabase/migrations/20261027000000_config_ia_professor.sql')
const admin = ler('../js/views/admin.js')
const modulo = ler('../js/ia-professor.js')

test('padrão é desativado e o botão "Criar com I.A" fica oculto', () => {
    assert.equal(CONFIG_IA_PROFESSOR_PADRAO.provedor, 'desativado')
    assert.equal(CONFIG_IA_PROFESSOR_PADRAO.ativo, false)
    assert.equal(deveMostrarBotaoProfessorIA(CONFIG_IA_PROFESSOR_PADRAO), false)
    assert.equal(deveMostrarBotaoProfessorIA(null), false)
})

test('botão some quando desativado ou quando ativo é falso', () => {
    assert.equal(deveMostrarBotaoProfessorIA({ provedor: 'desativado', ativo: true }), false)
    assert.equal(deveMostrarBotaoProfessorIA({ provedor: 'sulsafe_api', ativo: false }), false)
    assert.equal(deveMostrarBotaoProfessorIA({ provedor: 'custom', ativo: false }), false)
})

test('botão aparece apenas com provedor válido e ativo', () => {
    assert.equal(deveMostrarBotaoProfessorIA({ provedor: 'sulsafe_api', ativo: true }), true)
    assert.equal(deveMostrarBotaoProfessorIA({ provedor: 'openai', ativo: true, chave_configurada: true }), true)
    assert.equal(deveMostrarBotaoProfessorIA({ provedor: 'desconhecido', ativo: true }), false)
})

test('API própria sem chave configurada não pode ativar o botão', () => {
    assert.equal(
        deveMostrarBotaoProfessorIA({ provedor: 'gemini', ativo: true, chave_configurada: false }),
        false
    )
    assert.equal(
        deveMostrarBotaoProfessorIA({ provedor: 'gemini', ativo: true, chave_configurada: true }),
        true
    )
})

test('conversão entre modos da tela e provedores do banco', () => {
    assert.equal(modoDoSelect('sulsafe_api'), 'sulsafe_api')
    assert.equal(modoDoSelect('openai'), 'proprio')
    assert.equal(modoDoSelect('desativado'), 'desativado')
    assert.equal(provedorDoModo('sulsafe_api', 'openai'), 'sulsafe_api')
    assert.equal(provedorDoModo('proprio', 'anthropic'), 'anthropic')
    assert.equal(provedorDoModo('proprio', 'invalido'), 'desativado')
    assert.equal(provedorDoModo('desativado', 'openai'), 'desativado')
})

test('campos e textos de orientação mudam conforme o modo', () => {
    assert.deepEqual(camposVisiveisDoModo('desativado'), { url: false, chave: false, modelo: false, ativo: false })
    assert.equal(camposVisiveisDoModo('proprio').chave, true)

    assert.match(textoOrientacaoDoModo('sulsafe_api'), /fale com o suporte e negocie o valor/i)
    assert.match(textoOrientacaoDoModo('sulsafe_api'), /cada empresa tem um preço diferente/i)
    assert.match(textoOrientacaoDoModo('proprio'), /Sua empresa paga a API dela/i)
    assert.match(textoOrientacaoDoModo('desativado'), /fica oculto/i)
})

test('payload da RPC nunca grava a chave em Storage local', () => {
    const payload = payloadConfigIAProfessor(
        { provedor: 'custom', api_url: 'https://api.empresa.com', modelo: 'gpt-4o', ativo: true },
        '  sk-super-secreta  '
    )

    assert.equal(payload.p_api_key, 'sk-super-secreta')
    assert.equal(payload.p_ativo, true)
    assert.doesNotMatch(modulo, /localStorage|sessionStorage/)
    assert.doesNotMatch(modulo, /api[_-]?key[^\n]*localStorage/i)
})

test('normalização neutralize tags e provider inválido', () => {
    const cfg = normalizarConfigIAProfessor({
        provedor: 'fake',
        api_url: 'https://ok.com<script>x</script>',
        modelo: '<b>modelo</b>',
        ativo: 'false'
    })

    assert.equal(cfg.provedor, 'desativado')
    assert.equal(cfg.api_url, 'https://ok.com')
    assert.equal(cfg.modelo, 'modelo')
    assert.equal(cfg.ativo, false)
})

test('migration cria a tabela com os 6 provedores e padrão desativado', () => {
    assert.match(sql, /create table if not exists public\.config_ia_professor/i)
    assert.match(sql, /provedor text not null default 'desativado'/i)

    for (const p of ['sulsafe_api', 'openai', 'gemini', 'anthropic', 'custom', 'desativado']) {
        assert.ok(sql.includes(`'${p}'`), `provedor ${p} ausente`)
    }

    assert.match(sql, /api_key_encriptada text/i)
    assert.match(sql, /ativo boolean not null default false/i)
    assert.match(sql, /api_url ~\* '\^https:\/\/'/i)
    assert.match(sql, /on conflict \(id\) do nothing/i)
})

test('migration protege a tabela com RLS e acesso só por RPC', () => {
    assert.match(sql, /alter table public\.config_ia_professor enable row level security/i)
    assert.match(sql, /revoke all on public\.config_ia_professor from anon, authenticated/i)
    assert.match(sql, /using \(public\.sulsafe_is_admin\(\)\)/i)
    assert.match(sql, /Somente administradores podem ver a configuração/i)
})

test('chave vai para o Vault; a RPC de leitura nunca devolve a chave', () => {
    assert.match(sql, /vault:<\s*nome\s*>/i)
    assert.match(sql, /vault\.create_secret/i)
    assert.match(sql, /to_regprocedure\('vault\.create_secret\(text,text,text\)'\)/i)
    assert.match(sql, /raise exception 'Supabase Vault não está habilitado/i)

    const leitura = sql.slice(
        sql.indexOf('create or replace function public.sulsafe_get_config_ia_professor()'),
        sql.indexOf('-- ESCRITA SEGURA')
    )
    assert.doesNotMatch(leitura, /api_key_encriptada\s*$/im)
    assert.match(leitura, /chave_configurada boolean/i)
    assert.match(leitura, /c\.api_key_encriptada is not null/i)
})

test('RPCs de escrita validam admin, provedor e chave de API própria', () => {
    const escrita = sql.slice(sql.indexOf('create or replace function public.sulsafe_configurar_ia_professor('))

    assert.match(escrita, /security definer/i)
    assert.match(escrita, /set search_path = ''/i)
    assert.match(escrita, /Somente administradores podem configurar/i)
    assert.match(escrita, /Provedor inválido/i)
    assert.match(escrita, /deve começar com https/i)
    assert.match(escrita, /Configure a chave da API própria antes de ativar/i)
    assert.match(escrita, /if p_provedor = 'desativado' then[\s\S]*v_ativo := false;/i)
    assert.match(escrita, /grant execute on function public\.sulsafe_configurar_ia_professor/i)
})

test('tela do admin tem seletor de provedor e botão condicional', () => {
    assert.match(admin, /PROFESSOR I\.A — API/i)
    assert.match(admin, /deveMostrarBotaoProfessorIA\(cfgIA\)/)
    assert.match(admin, /id="btnIaProfessorSlot"/)
    assert.match(admin, /Criar com I\.A/)
    assert.match(admin, /id="iaModo"/)
    assert.match(admin, /Usar API da SulSafe \(cobrada à parte\)/)
    assert.match(admin, /Usar minha própria API/)
    assert.match(admin, /type="password"/)
    assert.doesNotMatch(admin, /localStorage|sessionStorage/)
})

test('PROVEDORES_IA_PROFESSOR tem exatamente as opções de negócio', () => {
    assert.deepEqual(Object.values(PROVEDORES_IA_PROFESSOR), [
        'desativado', 'sulsafe_api', 'openai', 'gemini', 'anthropic', 'custom'
    ])
})
