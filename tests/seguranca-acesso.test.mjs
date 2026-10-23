import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')

const schemaBase = ler('../supabase/schema-base.sql')
const profilesSql = ler('../supabase/migrations/20261024000000_seguranca_profiles.sql')
const academicSql = ler('../supabase/migrations/20261024001000_isolamento_academico.sql')
const hardeningSql = ler('../supabase/migrations/20261025000000_endurece_protecao_perfil.sql')
const escopoSql = ler('../supabase/migrations/20261025000002_escopo_professor_turmas.sql')
const cliente = ler('../js/supabase-client.js')
const config = ler('../js/views/config.js')
const main = ler('../js/main.js')
const auth = ler('../js/auth.js')
const reset = ler('../reset-password.html')
const packageJson = JSON.parse(ler('../package.json'))

test('profiles tem RLS habilitada e policies sem leitura ampla', () => {
    assert.match(profilesSql, /alter table public\.profiles enable row level security/i)
    assert.match(profilesSql, /create policy "sulsafe_profiles_select_proprio"/i)
    assert.match(profilesSql, /create policy "sulsafe_profiles_select_admin"/i)
    assert.match(profilesSql, /create policy "sulsafe_profiles_update_proprio"/i)
    assert.match(profilesSql, /create policy "sulsafe_profiles_update_admin"/i)
    assert.doesNotMatch(
        profilesSql,
        /create policy[\s\S]*?on public\.profiles[\s\S]*?auth\.role\(\)\s*=\s*'authenticated'/i
    )
})

test('helpers de autorizacao exigem conta ativa e usam security definer', () => {
    for (const fn of [
        'sulsafe_conta_ativa',
        'sulsafe_is_admin',
        'sulsafe_is_super_admin',
        'is_admin'
    ]) {
        const inicio = profilesSql.indexOf(`create or replace function public.${fn}(`)
        assert.notEqual(inicio, -1, `funcao ${fn} ausente`)
        const fim = profilesSql.indexOf('as $$', inicio)
        assert.notEqual(fim, -1, `cabecalho de ${fn} incompleto`)
        const cabecalho = profilesSql.slice(inicio, fim)
        assert.match(cabecalho, /security definer/i)
        assert.match(cabecalho, /set search_path\s*=\s*''/i)
    }

    assert.match(
        profilesSql,
        /p\.status = 'ativo'[\s\S]*?p\.role::text in \('admin', 'super_admin'\)/i
    )
})

test('CPF e validado por digitos verificadores no servidor', () => {
    assert.match(profilesSql, /create or replace function public\.sulsafe_cpf_valido/i)
    assert.match(profilesSql, /v_digito1/i)
    assert.match(profilesSql, /v_digito2/i)
    assert.match(profilesSql, /\\1\{10\}/i)
    assert.match(profilesSql, /not public\.sulsafe_cpf_valido\(v_cpf\)/i)
    assert.match(profilesSql, /not public\.sulsafe_cpf_valido\(v_new->>'cpf'\)/i)
})

test('campos privilegiados e ultimo admin sao protegidos por trigger', () => {
    assert.match(profilesSql, /create trigger trg_profiles_protege_campos[\s\S]*?before update on public\.profiles/i)
    assert.match(profilesSql, /Somente administradores podem alterar o perfil de acesso/i)
    assert.match(profilesSql, /Somente administradores podem alterar o status da conta/i)
    assert.match(profilesSql, /O email da conta nao pode ser alterado pelo perfil/i)
    assert.match(profilesSql, /ultimo administrador ativo/i)
    assert.match(profilesSql, /create trigger trg_profiles_protege_exclusao[\s\S]*?before delete on public\.profiles/i)
})

test('protecao de perfil nao confia em GUC controlavel pelo cliente', () => {
    assert.match(hardeningSql, /create or replace function public\.sulsafe_proteger_perfil/i)
    assert.match(hardeningSql, /security invoker/i)
    assert.match(hardeningSql, /current_user not in \('authenticated', 'anon'\)/i)
    assert.doesNotMatch(hardeningSql, /(?:current_setting|set_config)\(['"]sulsafe\.dossie_self_update/i)
    assert.match(hardeningSql, /v_new->>'nome_completo' is distinct from v_old->>'nome_completo'/i)
    assert.match(hardeningSql, /coalesce\(v_old_role, 'aluno'\) = 'aluno'/i)
    assert.match(hardeningSql, /O nome nao pode ficar vazio/i)
})

test('aluno nao edita o nome fora do dossie na tela de configuracoes', () => {
    assert.match(config, /S\.user\.role !== 'aluno'/)
    assert.match(config, /role === 'aluno'[\s\S]*?Abrir meu dossiê/)
})



const encontrarFuncoesNaoAuditadas = sqls => {
    const permitidas = new Set([
        'handle_new_user',
        'atualizar_meu_dossie',
        'definir_foto_perfil',
        'auditar_dossie'
    ])

    const escritas =
        /\b(?:update\s+(?:only\s+)?public\.profiles\b|insert\s+into\s+public\.profiles\b|delete\s+from\s+public\.profiles\b)/i

    const funcoes =
        /create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns\b([\s\S]*?)\$\$;/gi

    const naoAuditadas = []

    for (const sql of sqls) {
        for (const match of sql.matchAll(funcoes)) {
            const [, nome, parametros, definicao] = match
            const bloco = parametros + definicao

            if (
                /security definer/i.test(bloco) &&
                escritas.test(bloco) &&
                !permitidas.has(nome)
            ) {
                naoAuditadas.push(nome)
            }
        }
    }

    return naoAuditadas
}

test('somente funcoes auditadas escrevem em profiles com security definer', () => {
    const arquivosSql = [
        schemaBase,
        profilesSql,
        academicSql,
        hardeningSql,
        escopoSql
    ]

    assert.deepEqual(
        encontrarFuncoesNaoAuditadas(arquivosSql),
        [],
        'Existe funcao SECURITY DEFINER nao auditada escrevendo em profiles'
    )
})

test('auditoria rejeita funcao SECURITY DEFINER nao autorizada', () => {
    const sqlMalicioso = `
        CREATE OR REPLACE FUNCTION public.funcao_nao_autorizada()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
            UPDATE public.profiles SET status = 'ativo';
            RETURN NEW;
        END;
        $$;
    `

    assert.deepEqual(
        encontrarFuncoesNaoAuditadas([sqlMalicioso]),
        ['funcao_nao_autorizada']
    )
})

test('ultimo admin e serializado por advisory lock', () => {
    assert.match(hardeningSql, /pg_advisory_xact_lock\(20261024, 1\)/i)
    assert.match(hardeningSql, /create or replace function public\.sulsafe_existe_outro_admin\(p_id uuid\)/i)
    assert.match(hardeningSql, /language plpgsql\s+volatile\s+security definer/i)
    assert.match(hardeningSql, /for update/i)
    assert.match(hardeningSql, /before update on public\.profiles[\s\S]*?sulsafe_proteger_perfil/i)
    assert.match(hardeningSql, /before delete on public\.profiles[\s\S]*?sulsafe_proteger_exclusao_perfil/i)
    assert.match(hardeningSql, /revoke all on function public\.sulsafe_existe_outro_admin\(uuid\) from public, anon/i)
})

test('RPCs do dossie nao definem mais o GUC removido', () => {
    assert.match(hardeningSql, /create or replace function public\.atualizar_meu_dossie/i)
    assert.match(hardeningSql, /create or replace function public\.definir_foto_perfil/i)
    assert.doesNotMatch(hardeningSql, /(?:current_setting|set_config)\(['"]sulsafe\.dossie_self_update/i)
    for (const fn of [
        'atualizar_meu_dossie',
        'definir_foto_perfil',
        'auditar_dossie'
    ]) {
        assert.match(
            hardeningSql,
            new RegExp(`revoke all on function public\\.${fn}\\([\\s\\S]*?\\) from public, anon`, 'i'),
            `${fn} deve revogar anon explicitamente`
        )
    }
})

test('dossie tem trilha de auditoria restrita a administradores', () => {
    assert.match(profilesSql, /create table if not exists public\.dossie_auditoria/i)
    assert.match(profilesSql, /alter table public\.dossie_auditoria enable row level security/i)
    assert.match(profilesSql, /create trigger trg_profiles_audita_dossie[\s\S]*?after update on public\.profiles/i)
    assert.match(profilesSql, /using \(public\.sulsafe_is_admin\(\)\);[\s\S]*?revoke all on public\.dossie_auditoria from anon, authenticated/i)
})

test('migration remove grants anon de profiles', () => {
    assert.match(profilesSql, /revoke all on public\.profiles from anon, authenticated/i)
    assert.match(profilesSql, /grant select, update on public\.profiles to authenticated/i)
    assert.doesNotMatch(profilesSql, /grant\s+[^;]+\s+to anon/i)
})

test('policies academicas nao usam mais leitura ampla para autenticados', () => {
    assert.doesNotMatch(academicSql, /create policy "Leitura para autenticados"/i)
    assert.doesNotMatch(
        academicSql,
        /create policy[\s\S]*?using \(\(?auth\.role\(\) = 'authenticated'::text\)?\)/i
    )

    for (const policy of [
        'sulsafe_notas_select',
        'sulsafe_certificados_select',
        'sulsafe_provas_select',
        'sulsafe_progresso_select',
        'sulsafe_notificacoes_select',
        'sulsafe_forum_select',
        'sulsafe_salas_select',
        'sulsafe_materiais_select',
        'sulsafe_videoaulas_select'
    ]) {
        assert.match(academicSql, new RegExp(`create policy "${policy}"`, 'i'))
    }
})

test('usuario so acessa os proprios registros academicos', () => {
    assert.match(academicSql, /usuario_id = auth\.uid\(\) or public\.sulsafe_is_professor\(\)/i)
    assert.match(academicSql, /user_id = auth\.uid\(\)/i)
    assert.match(academicSql, /usuario_id = auth\.uid\(\)\s*\)/i)
    assert.match(academicSql, /and usuario_id = auth\.uid\(\)/i)
})

test('escritas academicas validam propriedade e aluno real', () => {
    assert.match(academicSql, /create trigger trg_notas_protege[\s\S]*?before insert or update on public\.notas/i)
    assert.match(academicSql, /create trigger trg_provas_protege[\s\S]*?before insert or update on public\.provas/i)
    assert.match(academicSql, /create trigger trg_certificados_protege[\s\S]*?before insert or update on public\.certificados/i)
    assert.match(academicSql, /public\.sulsafe_perfil_aluno\(new\.usuario_id\)/i)
    assert.match(academicSql, /public\.sulsafe_perfil_aluno\(usuario_id\)/i)
    assert.match(academicSql, /O aluno da prova nao pode ser alterado/i)
    assert.match(academicSql, /O aluno e o emissor do certificado nao podem ser alterados/i)
})

test('RPCs seguros substituem joins diretos em profiles', () => {
    for (const fn of [
        'sulsafe_listar_alunos',
        'sulsafe_obter_perfil_publico',
        'sulsafe_listar_provas_pendentes',
        'sulsafe_listar_salas_ativas',
        'sulsafe_listar_mensagens_forum'
    ]) {
        assert.match(academicSql, new RegExp(`create or replace function public\\.${fn}\\(`, 'i'))
        assert.match(cliente, new RegExp(`rpc\\(['"]${fn}['"]`, 'i'))
    }

    assert.match(academicSql, /create or replace function public\.sulsafe_listar_alunos\(\)[\s\S]*?returns table \([\s\S]*?id uuid,[\s\S]*?nome_completo text,[\s\S]*?email text,[\s\S]*?status text/i)
})

test('anon perde acesso e views usam security_invoker', () => {
    for (const tabela of [
        'certificados',
        'materiais',
        'mensagens_forum',
        'notas',
        'notificacoes',
        'progresso_aulas',
        'provas',
        'salas',
        'videoaulas'
    ]) {
        assert.match(
            academicSql,
            new RegExp(`revoke all on public\\.${tabela} from anon, authenticated`, 'i')
        )
    }

    for (const view of [
        'view_dashboard_admin',
        'view_medias_nrs',
        'view_ranking_alunos'
    ]) {
        assert.match(
            academicSql,
            new RegExp(`alter view public\\.${view} set \\(security_invoker = true\\)`, 'i')
        )
        assert.match(
            academicSql,
            new RegExp(`revoke all on public\\.${view} from anon, authenticated`, 'i')
        )
    }

    assert.doesNotMatch(academicSql, /grant\s+[^;]+\s+to anon/i)
})

test('front-end nao persiste sessao ou perfil em storage', () => {
    for (const codigo of [cliente, main, auth]) {
        assert.doesNotMatch(codigo, /localStorage\.setItem\(\s*['"]ss_session['"]/i)
        assert.doesNotMatch(codigo, /localStorage\.setItem\(\s*['"]ss_user['"]/i)
    }

    assert.doesNotMatch(main, /localStorage\.getItem\(\s*['"]ss_session['"]/i)
    assert.match(main, /sb\.auth\.getSession\(\)/i)
    assert.match(main, /sb\.auth\.getUser\(\)/i)
    assert.match(main, /user\.status !== 'ativo'/i)
})

test('pagina de redefinicao usa updateUser e valida a sessao', () => {
    assert.match(reset, /sb\.auth\.getSession\(\)/i)
    assert.match(reset, /sb\.auth\.getUser\(\)/i)
    assert.match(reset, /sb\.auth\.updateUser\(\{\s*password:/i)
    assert.match(reset, /history\.replaceState/i)
    assert.match(reset, /As senhas não coincidem/i)
})

test('migrations nao contem comandos destrutivos de dados', () => {
    for (const sql of [profilesSql, academicSql, hardeningSql, escopoSql]) {
        assert.doesNotMatch(sql, /\bdrop\s+table\b/i)
        assert.doesNotMatch(sql, /\btruncate\b/i)
        assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
        assert.doesNotMatch(sql, /\bdrop\s+schema\b/i)
    }
})

test('novo teste esta registrado no script npm test', () => {
    assert.match(packageJson.scripts.test, /tests\/seguranca-acesso\.test\.mjs/)
})
