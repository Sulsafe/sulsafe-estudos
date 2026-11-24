import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')

const edge = ler('../supabase/functions/tutor-sulsafe/index.ts')
const worker = ler('../supabase/migrations/20261124030000_tutor_worker_config.sql')
const front = ler('../js/views/tutor.js')
const cliente = ler('../js/supabase-client.js')
const app = ler('../js/app.js')
const main = ler('../js/main.js')
const admin = ler('../js/views/admin.js')
const professor = ler('../js/views/professor.js')
const materializacao = ler('../supabase/migrations/20261124020000_tutor_materializacao.sql')
const extrator = ler('../supabase/functions/tutor-sulsafe/extrair-json.js')

test('Edge Function usa service_role e nunca recebe chave do navegador', () => {
    assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.match(edge, /sulsafe_obter_config_ia_worker/)
    assert.doesNotMatch(edge, /body\?\.api_key|payload\?\.api_key|payload\.chave/)
    assert.match(edge, /TUTOR_SULSAFE_STUB/)
    assert.match(edge, /req\.headers\.get\('authorization'\)/)
    assert.match(edge, /SUPABASE_ANON_KEY/)
    assert.match(edge, /sulsafe_pode_processar_ia_job/)
    assert.match(edge, /SEM_PERMISSAO/)
})

test('RPC de autorização do chamador é RBAC e isolada por empresa', () => {
    assert.match(worker, /create or replace function public\.sulsafe_pode_processar_ia_job\(p_job_id uuid\)/i)
    assert.match(worker, /sulsafe_is_admin\(\) or public\.sulsafe_is_professor\(\)/i)
    assert.match(worker, /grant execute on function public\.sulsafe_pode_processar_ia_job\(uuid\) to authenticated/i)
    assert.match(worker, /revoke all on function public\.sulsafe_pode_processar_ia_job\(uuid\) from public, anon/i)
})

test('parser de JSON da Edge Function é o módulo robusto, sem remoção ancorada de crases', () => {
    assert.match(edge, /import \{ extrairJson \} from '\.\/extrair-json\.js'/)
    assert.doesNotMatch(edge, /replace\(\/\^```/)
    assert.match(extrator, /```\[ \\t\]\*\(json\)\?/)
    assert.match(extrator, /JSON\.parse\(candidato\)/)
    assert.match(extrator, /throw new Error\(MENSAGEM_ERRO\)/)
})

test('Edge Function marca job como ERRO e nunca expõe a chave na resposta', () => {
    assert.match(edge, /p_status:\s*'PROCESSANDO'/)
    assert.match(edge, /p_status:\s*'CONCLUIDO'/)
    assert.match(edge, /p_status:\s*'ERRO'/)
    assert.match(edge, /p_erro_mensagem/)
    assert.doesNotMatch(edge, /api_key:\s*config|api_key[^\n]*resposta/)
})

test('Edge Function converte formato nativo e grava rascunho via RPC', () => {
    assert.match(edge, /courseTitle/)
    assert.match(edge, /outlines/)
    assert.match(edge, /publicoAlvo/)
    assert.match(edge, /sulsafe_salvar_ia_conteudo/)
    assert.match(edge, /sulsafe_atualizar_status_ia_job/)
})

test('RPC de worker é somente service_role e lê chave do Vault', () => {
    assert.match(worker, /security definer/i)
    assert.match(worker, /set search_path = ''/i)
    assert.match(worker, /vault\.decrypted_secrets/)
    assert.match(worker, /grant execute on function public\.sulsafe_obter_config_ia_worker\(\) to service_role/i)
    assert.match(worker, /revoke all on function public\.sulsafe_obter_config_ia_worker\(\) from public, anon, authenticated/i)
    assert.match(worker, /sulsafe_ia_chave_global/)
})

test('referência vault:<nome> é extraída sem os dois-pontos iniciais', () => {
    assert.match(worker, /substring\(v_config\.api_key_encriptada from 7\)/)
    assert.doesNotMatch(worker, /substring\(v_config\.api_key_encriptada from 6\)/)
    assert.equal('vault:sulsafe_ia_chave_global'.substring(6), 'sulsafe_ia_chave_global')
})

test('materialização não publica automaticamente', () => {
    assert.match(materializacao, /publico=false/)
    assert.match(materializacao, /Aprovado\.|Aprove o rascunho antes de materializá-lo/)
    assert.doesNotMatch(materializacao, /publicado = true/)
})

test('flag de habilitação não devolve segredos', () => {
    assert.match(worker, /create or replace function public\.sulsafe_tutor_habilitado\(\)/i)
    assert.match(worker, /grant execute on function public\.sulsafe_tutor_habilitado\(\) to authenticated/i)
    assert.doesNotMatch(worker, /create or replace function public\.sulsafe_tutor_habilitado[\s\S]{0,600}api_key/i)
})

test('front do Tutor escapa saída da IA e não pede chave', () => {
    assert.match(front, /escapeHTML\(contrato\.titulo\)/)
    assert.match(front, /escapeHTML\(aula\.descricao\)/)
    assert.match(front, /publico = false/)
    assert.doesNotMatch(front, /api[_-]?key|localStorage\.setItem/)
    assert.match(front, /window\.tutorGerar/)
})

test('botão "Criar com o TUTOR-Sulsafe" está ligado à navegação', () => {
    assert.match(admin, /Criar com o TUTOR-Sulsafe/)
    assert.ok(admin.includes("window.nav(\\'tutor\\')"), 'botão-admin não navega para tutor')
    assert.doesNotMatch(admin, /disabled title="Geração disponível em breve"/)
    assert.ok(professor.includes("window.nav('tutor')"), 'botão-professor não navega para tutor')
    assert.match(professor, /Criar com o TUTOR-Sulsafe/)
    assert.match(app, /id: 'tutor'/)
    assert.match(main, /registerView\('tutor', vTutor\)/)
})

test('helpers do cliente não expõem chave e usam as RPCs corretas', () => {
    for (const rpc of [
        'sulsafe_criar_ia_job',
        'sulsafe_tutor_habilitado',
        'sulsafe_listar_rascunhos_tutor',
        'sulsafe_revisar_ia_conteudo',
        'sulsafe_materializar_rascunho_tutor'
    ]) {
        assert.ok(cliente.includes(rpc), `RPC ${rpc} ausente no cliente`)
    }
    assert.match(cliente, /functions\.invoke\('tutor-sulsafe'/)
    assert.doesNotMatch(cliente, /api_key|Bearer /)
})

test('Edge Function retenta falhas transitórias e usa mensagem pt-BR', () => {
    assert.match(edge, /chamarProvedorComRetentativa/)
    assert.match(edge, /chamarProvedorComRetentativa\(config\[0\] as ConfigIA, job\.prompt\)/)
    assert.match(edge, /tentativas = 3/)
    assert.match(edge, /status === 429 \|\| status >= 500/)
    assert.match(edge, /temporariamente indisponível por alta demanda/)
})

test('cliente extrai a mensagem da Edge Function em vez do erro genérico', () => {
    assert.match(cliente, /erroAmigavelFunction/)
    assert.match(cliente, /error\?\.context/)
    assert.match(cliente, /contexto\.clone/)
    assert.match(cliente, /corpo\?\.error\?\.message \|\| corpo\?\.message/)
    assert.match(cliente, /throw await erroAmigavelFunction\(error\)/)
})
