import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const sql = ler('../supabase/migrations/20261026000000_exclusao_atomica.sql')
const adminJs = ler('../js/views/admin.js')

const ADMIN = '00000000-0000-4000-8000-0000000000aa'
const OUTRO = '00000000-0000-4000-8000-0000000000bb'
const TRABALHO = '00000000-0000-4000-8000-000000000001'
const SUBMISSAO = '00000000-0000-4000-8000-000000000002'

function extrairBloco(inicioMarca, fimMarca) {
    const inicio = sql.indexOf(inicioMarca)
    const fim = sql.indexOf(fimMarca, inicio)
    assert.notEqual(inicio, -1, `bloco ${inicioMarca} ausente`)
    assert.notEqual(fim, -1, `fim do bloco ${fimMarca} ausente`)
    return sql.slice(inicio, fim)
}

const tabelasSql = extrairBloco(
    '-- 1. TABELAS DE TRABALHOS/SUBMISSÕES',
    '-- 2. RPC: EXCLUIR TRABALHO COMPLETO'
)

const funcaoSql = extrairBloco(
    'create or replace function public.excluir_trabalho_completo',
    '-- 3. RPC: EXCLUIR CURSO/NR COMPLETO'
)

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        -- Stubs dos papéis do Supabase para o SQL de grants funcionar no PGlite.
        create role anon;
        create role authenticated;

        create schema auth;
        create table auth.sessao (uid uuid not null);
        insert into auth.sessao (uid) values ('${ADMIN}');

        create function auth.uid() returns uuid
        language sql stable as $$ select uid from auth.sessao limit 1 $$;

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${OUTRO}', 'aluno', 'ativo');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable as $$ select true $$;

        create function public.sulsafe_is_admin() returns boolean
        language sql stable as $$
            select (select uid from auth.sessao limit 1) = '${ADMIN}'::uuid
        $$;

        create function public.sulsafe_is_professor() returns boolean
        language sql stable as $$ select false $$;

        create function public.sulsafe_gerencia_turma(p uuid) returns boolean
        language sql stable as $$ select true $$;
    `)

    await db.exec(tabelasSql)
    await db.exec(funcaoSql)

    await db.exec(`
        insert into public.trabalhos (id, nr_id, professor_id, titulo)
        values ('${TRABALHO}', 35, '${ADMIN}', 'Trabalho NR-35');
        insert into public.trabalhos_submissao (id, trabalho_id, aluno_id, resposta)
        values ('${SUBMISSAO}', '${TRABALHO}', '${OUTRO}', 'Resposta do aluno');
    `)

    return db
}

async function contar(db) {
    const trabalho = await db.query('select count(*)::int as total from public.trabalhos')
    const submissao = await db.query('select count(*)::int as total from public.trabalhos_submissao')
    const logs = await db.query('select count(*)::int as total from public.exclusao_logs')
    return {
        trabalho: trabalho.rows[0].total,
        submissao: submissao.rows[0].total,
        logs: logs.rows[0].total
    }
}

test('exclusão concluída remove filho e pai e registra log', async () => {
    const db = await criarBanco()

    await db.query('select public.excluir_trabalho_completo($1)', [TRABALHO])

    assert.deepEqual(await contar(db), { trabalho: 0, submissao: 0, logs: 1 })
})

test('falha no meio do delete faz ROLLBACK: nada é apagado', async () => {
    const db = await criarBanco()

    // O delete do filho acontece primeiro; a falha é disparada no delete do pai.
    await db.exec(`
        create function public.falhar_delete_pai() returns trigger
        language plpgsql as $$ begin raise exception 'falha simulada no pai'; end; $$;

        create trigger trg_falha_simulada
        before delete on public.trabalhos
        for each row execute function public.falhar_delete_pai();
    `)

    await assert.rejects(
        () => db.query('select public.excluir_trabalho_completo($1)', [TRABALHO]),
        /falha simulada no pai|nada foi alterado/i
    )

    // Prova da atomicidade: o filho volta, o pai continua e nenhum log foi gravado.
    assert.deepEqual(await contar(db), { trabalho: 1, submissao: 1, logs: 0 })
})

test('RBAC: professor que não criou o trabalho não consegue excluir', async () => {
    const db = await criarBanco()

    await db.exec(`update auth.sessao set uid = '${OUTRO}'`)

    await assert.rejects(
        () => db.query('select public.excluir_trabalho_completo($1)', [TRABALHO]),
        /Sem permissão/i
    )

    assert.deepEqual(await contar(db), { trabalho: 1, submissao: 1, logs: 0 })
})

test('todas as RPCs de exclusão usam bloco EXCEPTION com rollback', () => {
    for (const assinatura of [
        'excluir_trabalho_completo',
        'excluir_curso_completo',
        'excluir_turma_completo',
        'excluir_material_completo',
        'excluir_nota_completo',
        'sulsafe_apagar_tudo'
    ]) {
        const inicio = sql.indexOf(`create or replace function public.${assinatura}(`)
        assert.notEqual(inicio, -1, `RPC ${assinatura} ausente`)

        const prox = sql.indexOf('create or replace function public.', inicio + 10)
        const bloco = sql.slice(inicio, prox === -1 ? sql.length : prox)

        assert.match(bloco, /exception when others then/i, `${assinatura} sem EXCEPTION`)
        assert.match(bloco, /nada foi alterado/i, `${assinatura} sem mensagem de rollback`)
        assert.match(bloco, /set search_path\s*=\s*''/i, `${assinatura} sem search_path travado`)
        assert.match(bloco, /security definer/i, `${assinatura} sem security definer`)
    }
})

test('curso e apagar-tudo excluem filhos antes dos pais', () => {
    const curso = sql.indexOf('create or replace function public.excluir_curso_completo(')
    const blocoCurso = sql.slice(curso, sql.indexOf('-- 4. RPC', curso))

    assert.ok(
        blocoCurso.indexOf('delete from public.trabalhos_submissao') <
            blocoCurso.indexOf('delete from public.trabalhos where'),
        'submissões precisam ser apagadas antes dos trabalhos'
    )
    assert.ok(
        blocoCurso.indexOf('delete from public.videoaulas where') <
            blocoCurso.indexOf('delete from public.materiais where'),
        'videoaulas precisam ser apagadas antes de materiais vinculados'
    )

    const tudo = sql.indexOf('create or replace function public.sulsafe_apagar_tudo(')
    const blocoTudo = sql.slice(tudo, sql.indexOf('-- 6. PERMISSÕES', tudo))

    assert.doesNotMatch(blocoTudo, /delete from public\.documentos_aluno/i)
    assert.doesNotMatch(blocoTudo, /delete from public\.dossie_auditoria/i)
    assert.doesNotMatch(blocoTudo, /delete from public\.exclusao_logs/i)
})

test('front-end não faz mais deletes soltos no apagar-tudo', () => {
    const inicio = adminJs.indexOf('async function execApagar()')
    const bloco = adminJs.slice(inicio, adminJs.indexOf('\n}', inicio))

    assert.match(bloco, /sbApagarTudo\(\)/)
    assert.doesNotMatch(bloco, /sb\.from\('salas'\)\.delete/)
    assert.doesNotMatch(bloco, /sb\.from\('materiais'\)\.delete/)
})
