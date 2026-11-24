import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sql = fs.readFileSync(
    new URL('../supabase/migrations/20261124010000_ia_jobs_conteudos.sql', import.meta.url),
    'utf8'
)

const ADMIN = '00000000-0000-4000-8000-0000000000a1'
const PROF_A = '00000000-0000-4000-8000-0000000000a2'
const PROF_B = '00000000-0000-4000-8000-0000000000a3'
const ALUNO_A = '00000000-0000-4000-8000-0000000000a4'
const EMP_A = '00000000-0000-4000-8000-0000000000b1'
const EMP_B = '00000000-0000-4000-8000-0000000000b2'

function bloco(inicioMarca, fimMarca) {
    const inicio = sql.indexOf(inicioMarca)
    const fim = sql.indexOf(fimMarca, inicio)
    assert.notEqual(inicio, -1, `bloco ${inicioMarca} ausente`)
    assert.notEqual(fim, -1, `fim do bloco ${fimMarca} ausente`)
    return sql.slice(inicio, fim)
}

const rpcJob = bloco('create or replace function public.sulsafe_criar_ia_job(', '-- 6. RPCs DO WORKER')

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role nologin bypassrls;

        create schema auth;
        create table auth.sessao (uid uuid, empresa_id uuid);
        insert into auth.sessao (uid, empresa_id) values (null, null);

        create function auth.uid() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select uid from auth.sessao limit 1 $$;

        create function auth.jwt() returns jsonb
        language sql stable security definer set search_path = ''
        as $$
            select jsonb_build_object(
                'app_metadata', jsonb_build_object('empresa_id', empresa_id)
            )
            from auth.sessao limit 1
        $$;

        -- No Supabase real, auth.uid()/auth.jwt() são executáveis por authenticated.
        grant usage on schema auth to authenticated, anon;
        grant execute on function auth.uid() to authenticated, anon;
        grant execute on function auth.jwt() to authenticated, anon;

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${PROF_A}', 'professor', 'ativo'),
            ('${PROF_B}', 'professor', 'ativo'),
            ('${ALUNO_A}', 'aluno', 'ativo');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable as $$ select true $$;

        create function public.sulsafe_is_admin() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin' and p.status = 'ativo'
            )
        $$;

        create function public.sulsafe_is_professor() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'professor' and p.status = 'ativo'
            )
        $$;
    `)

    await db.exec(sql)
    return db
}

async function sessao(db, uid, empresa) {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2', [uid, empresa])
}

async function contarConteudosVisiveis(db, uid, empresa) {
    await sessao(db, uid, empresa)
    await db.exec('set role authenticated')
    const resultado = await db.query('select count(*)::int as total from public.ia_conteudos')
    await db.exec('reset role')
    return resultado.rows[0].total
}

test('migration cria o contrato de jobs e conteúdos do Professor I.A', () => {
    assert.match(sql, /create table if not exists public\.ia_jobs/i)
    assert.match(sql, /create table if not exists public\.ia_conteudos/i)

    for (const coluna of ['empresa_id', 'status', 'criado_por', 'criado_em']) {
        assert.ok(sql.includes(coluna), `coluna ${coluna} ausente`)
    }

    assert.match(sql, /aprovado boolean not null default false/i)
    assert.match(sql, /publicado boolean not null default false/i)
    assert.match(sql, /check \(not publicado or aprovado\)/i)
})

test('DEC-002 opção C: empresa vem do claim do JWT, sem coluna em profiles', () => {
    assert.match(sql, /auth\.jwt\(\) -> 'app_metadata' ->> 'empresa_id'/i)
    assert.doesNotMatch(sql, /alter table public\.profiles/i)
    assert.match(sql, /empresa_id is not distinct from public\.sulsafe_empresa_id\(\)/i)
})

test('RLS, grants mínimos e nenhum acesso direto de escrita', () => {
    for (const tabela of ['ia_jobs', 'ia_conteudos']) {
        assert.match(sql, new RegExp(`alter table public\\.${tabela} enable row level security`, 'i'))
        assert.match(sql, new RegExp(`revoke all on public\\.${tabela} from anon, authenticated`, 'i'))
        assert.match(sql, new RegExp(`grant select on public\\.${tabela} to authenticated`, 'i'))
    }

    assert.match(sql, /create policy sulsafe_ia_jobs_select/i)
    assert.match(sql, /create policy sulsafe_ia_conteudos_select/i)
    assert.doesNotMatch(sql, /grant (all|insert|update|delete) on public\.ia_(jobs|conteudos) to authenticated/i)
})

test('Human-in-the-Loop: aluno só lê publicado e publicar exige aprovação', () => {
    assert.match(sql, /publicado\s*\)\s*\)\s*;?\s*--|$/m)
    assert.match(sql, /\(public\.sulsafe_is_admin\(\) or public\.sulsafe_is_professor\(\)\)\s+or publicado/i)
    assert.match(sql, /Somente conteúdo aprovado pode ser publicado/i)
    assert.match(sql, /constraint ia_conteudos_aprovado_publicado/i)
})

test('RPCs usam security definer com search_path vazio', () => {
    for (const assinatura of [
        'public.sulsafe_criar_ia_job(',
        'public.sulsafe_atualizar_status_ia_job(',
        'public.sulsafe_salvar_ia_conteudo(',
        'public.sulsafe_revisar_ia_conteudo('
    ]) {
        const inicio = sql.indexOf(`create or replace function ${assinatura}`)
        assert.notEqual(inicio, -1, `RPC ${assinatura} ausente`)
        const cabecalho = sql.slice(inicio, sql.indexOf('as $$', inicio))
        assert.match(cabecalho, /security definer/i)
        assert.match(cabecalho, /set search_path\s*=\s*''/i)
    }

    assert.match(sql, /grant execute on function public\.sulsafe_criar_ia_job/i)
    assert.match(sql, /grant execute on function public\.sulsafe_atualizar_status_ia_job\(uuid, text, text, jsonb\) to service_role/i)
    assert.match(sql, /grant execute on function public\.sulsafe_salvar_ia_conteudo\(uuid, text, text, jsonb\) to service_role/i)
    assert.match(sql, /grant execute on function public\.sulsafe_revisar_ia_conteudo/i)
    assert.doesNotMatch(rpcJob, /api[_-]?key|vault|token/i)
})

test('a criação do job impõe RBAC e isolamento de empresa', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await sessao(db, PROF_A, EMP_A)
    const criado = await db.query(
        `select public.sulsafe_criar_ia_job($1, $2, $3)`,
        ['Curso NR-35', 'Crie um curso de trabalho em altura', 'CURSO']
    )
    const jobId = criado.rows[0].sulsafe_criar_ia_job

    const job = await db.query('select empresa_id, criado_por, status from public.ia_jobs where id = $1', [jobId])
    assert.equal(job.rows[0].empresa_id, EMP_A)
    assert.equal(job.rows[0].criado_por, PROF_A)
    assert.equal(job.rows[0].status, 'PENDENTE')

    await assert.rejects(
        () => db.query(
            `select public.sulsafe_criar_ia_job($1, $2, $3, $4)`,
            ['Curso indevido', 'Pedido', 'CURSO', EMP_B]
        ),
        /outra empresa/i
    )

    await sessao(db, ALUNO_A, EMP_A)
    await assert.rejects(
        () => db.query(
            `select public.sulsafe_criar_ia_job($1, $2)`,
            ['Curso', 'Pedido']
        ),
        /Somente administradores e professores/i
    )
})

test('rascunho gerado fica invisível ao aluno e a outra empresa até revisão', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await sessao(db, PROF_A, EMP_A)
    const criado = await db.query(
        `select public.sulsafe_criar_ia_job($1, $2)`,
        ['Curso NR-35', 'Pedido de geração']
    )
    const jobId = criado.rows[0].sulsafe_criar_ia_job

    await db.exec('set role service_role')
    await db.query(`select public.sulsafe_atualizar_status_ia_job($1, $2)`, [jobId, 'PROCESSANDO'])
    const salvo = await db.query(
        `select public.sulsafe_salvar_ia_conteudo($1, $2, $3, $4)`,
        [jobId, 'CURSO', 'NR-35 — Trabalho em altura', JSON.stringify({ modulos: [] })]
    )
    await db.exec('reset role')
    const conteudoId = salvo.rows[0].sulsafe_salvar_ia_conteudo

    const herdado = await db.query('select empresa_id from public.ia_conteudos where id = $1', [conteudoId])
    assert.equal(herdado.rows[0].empresa_id, EMP_A)

    assert.equal(await contarConteudosVisiveis(db, ALUNO_A, EMP_A), 0, 'aluno não vê rascunho')
    assert.equal(await contarConteudosVisiveis(db, PROF_A, EMP_A), 1, 'professor da empresa vê rascunho')
    assert.equal(await contarConteudosVisiveis(db, PROF_B, EMP_B), 0, 'outra empresa não vê rascunho')
    assert.equal(await contarConteudosVisiveis(db, ADMIN, null), 1, 'admin vê rascunho para revisão')

    await sessao(db, PROF_A, EMP_A)
    await assert.rejects(
        () => db.query(`select public.sulsafe_revisar_ia_conteudo($1, $2)`, [conteudoId, 'PUBLICAR']),
        /Somente conteúdo aprovado pode ser publicado/i
    )

    await db.query(`select public.sulsafe_revisar_ia_conteudo($1, $2)`, [conteudoId, 'APROVAR'])
    await db.query(`select public.sulsafe_revisar_ia_conteudo($1, $2)`, [conteudoId, 'PUBLICAR'])

    const publicado = await db.query(
        'select aprovado, publicado, aprovado_por, publicado_por from public.ia_conteudos where id = $1',
        [conteudoId]
    )
    assert.deepEqual(
        {
            aprovado: publicado.rows[0].aprovado,
            publicado: publicado.rows[0].publicado,
            aprovadoPor: publicado.rows[0].aprovado_por,
            publicadoPor: publicado.rows[0].publicado_por
        },
        { aprovado: true, publicado: true, aprovadoPor: PROF_A, publicadoPor: PROF_A }
    )

    assert.equal(await contarConteudosVisiveis(db, ALUNO_A, EMP_A), 1, 'aluno vê conteúdo publicado')
    assert.equal(await contarConteudosVisiveis(db, PROF_B, EMP_B), 0, 'outra empresa continua sem acesso')

    await sessao(db, PROF_B, EMP_B)
    await assert.rejects(
        () => db.query(`select public.sulsafe_revisar_ia_conteudo($1, $2, $3)`, [conteudoId, 'REJEITAR', 'Motivo de teste']),
        /outra empresa/i
    )
})

test('migration não contém comandos destrutivos', () => {
    assert.doesNotMatch(sql, /\bdrop\s+table\b/i)
    assert.doesNotMatch(sql, /\btruncate\b/i)
    assert.doesNotMatch(sql, /\bdelete\s+from\b/i)
    assert.doesNotMatch(sql, /\bdrop\s+schema\b/i)
})
