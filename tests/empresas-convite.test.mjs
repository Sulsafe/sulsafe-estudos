import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const sqlBase = fs.readFileSync(
    new URL('../supabase/migrations/20261124010000_ia_jobs_conteudos.sql', import.meta.url),
    'utf8'
)
const sqlEmpresas = fs.readFileSync(
    new URL('../supabase/migrations/20261124040000_empresas_convite.sql', import.meta.url),
    'utf8'
)
const edge = fs.readFileSync(
    new URL('../supabase/functions/admin-convidar-usuario/index.ts', import.meta.url),
    'utf8'
)
const adminView = fs.readFileSync(new URL('../js/views/admin.js', import.meta.url), 'utf8')
const cliente = fs.readFileSync(new URL('../js/supabase-client.js', import.meta.url), 'utf8')

const ADMIN = '00000000-0000-4000-8000-0000000000a1'
const PROF_A = '00000000-0000-4000-8000-0000000000a2'
const PROF_B = '00000000-0000-4000-8000-0000000000a3'
const ALUNO = '00000000-0000-4000-8000-0000000000a4'
const CONVIDADO = '00000000-0000-4000-8000-0000000000a5'
const EMP_A = '00000000-0000-4000-8000-0000000000b1'
const EMP_B = '00000000-0000-4000-8000-0000000000b2'
const EMP_INATIVA = '00000000-0000-4000-8000-0000000000b3'

const claim = empresaId => ({ empresa_id: empresaId, provider: 'email' })

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role nologin bypassrls;

        -- Simulação do Auth: o JWT do convidado é exatamente o app_metadata
        -- que a Edge Function passa ao createUser (sem Docker/Auth real).
        create schema auth;
        create table auth.sessao (uid uuid, claims jsonb);
        insert into auth.sessao (uid, claims) values (null, '{"app_metadata":{}}'::jsonb);

        create function auth.uid() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select uid from auth.sessao limit 1 $$;

        create function auth.jwt() returns jsonb
        language sql stable security definer set search_path = ''
        as $$ select claims from auth.sessao limit 1 $$;

        grant usage on schema auth to authenticated, anon;
        grant execute on function auth.uid() to authenticated, anon;
        grant execute on function auth.jwt() to authenticated, anon;

        create table public.profiles (id uuid primary key, email text, nome_completo text, role text, status text);
        insert into public.profiles (id, email, nome_completo, role, status) values
            ('${ADMIN}', 'admin@sulsafe.test', 'Admin', 'admin', 'ativo'),
            ('${PROF_A}', 'prof-a@sulsafe.test', 'Prof A', 'professor', 'ativo'),
            ('${PROF_B}', 'prof-b@sulsafe.test', 'Prof B', 'professor', 'ativo'),
            ('${ALUNO}', 'aluno@sulsafe.test', 'Aluno', 'aluno', 'ativo'),
            ('${CONVIDADO}', 'convidado@sulsafe.test', 'Convidado', 'professor', 'ativo');

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

    await db.exec(sqlBase)
    await db.exec(sqlEmpresas)

    await db.exec(`
        insert into public.empresas (id, nome, ativo, criado_por) values
            ('${EMP_A}', 'Empresa A', true, '${ADMIN}'),
            ('${EMP_B}', 'Empresa B', true, '${ADMIN}'),
            ('${EMP_INATIVA}', 'Empresa Inativa', false, '${ADMIN}');
    `)

    return db
}

async function sessao(db, uid, appMetadata) {
    await db.exec('reset role')
    await db.query(
        "update auth.sessao set uid = $1, claims = jsonb_build_object('app_metadata', $2::jsonb)",
        [uid, JSON.stringify(appMetadata || {})]
    )
}

async function como(db, uid, appMetadata, sql, params = []) {
    await sessao(db, uid, appMetadata)
    await db.exec('set role authenticated')
    try {
        return await db.query(sql, params)
    } finally {
        await db.exec('reset role')
    }
}

test('Opção A: claim é gravado pelo servidor no createUser, não pelo payload do navegador', () => {
    assert.match(edge, /auth\.admin\.createUser\(\{/s)
    assert.match(edge, /app_metadata:\s*\{\s*empresa_id:\s*empresaId\s*\}/)
    assert.doesNotMatch(edge, /user_metadata:\s*\{\s*empresa_id/)
    assert.match(edge, /sulsafe_pode_convidar_empresa/)
    assert.match(edge, /p_empresa_id:\s*empresaId/)
    assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/)
    assert.match(edge, /SUPABASE_ANON_KEY/)
    assert.match(edge, /inviteUserByEmail/)
    assert.match(edge, /deleteUser\(usuarioId\)/)
    assert.doesNotMatch(edge, /console\.(log|info|debug)/)
})

test('painel do ADMIN cadastra empresas e convida sem receber o claim do navegador', () => {
    assert.match(adminView, /id="adminEmpresas"/)
    assert.match(adminView, /sbCriarEmpresa\(nome\)/)
    assert.match(adminView, /sbConvidarUsuarioEmpresa\(\{ email, nome, empresaId, role \}\)/)
    assert.match(adminView, /window\.convidarEmpresa = convidarEmpresa/)
    assert.match(cliente, /functions\.invoke\('admin-convidar-usuario'/)
    assert.match(cliente, /body: \{ email, nome, empresa_id: empresaId, role \}/)
    assert.doesNotMatch(cliente, /app_metadata:\s*\{/)
})

test('migration cria empresas mínimas sem vínculo múltiplo nem domínio de e-mail', () => {
    assert.match(sqlEmpresas, /create table if not exists public\.empresas/i)
    assert.match(sqlEmpresas, /ativo boolean not null default true/i)
    assert.match(sqlEmpresas, /alter table public\.empresas enable row level security/i)
    assert.match(sqlEmpresas, /revoke all on public\.empresas from anon, authenticated/i)
    assert.doesNotMatch(sqlEmpresas, /for delete/i)
    const semComentarios = sqlEmpresas.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n')
    assert.doesNotMatch(semComentarios, /usuario_empresas|dominio/i)
    assert.match(sqlEmpresas, /security definer/i)
    assert.match(sqlEmpresas, /set search_path = ''/i)
    assert.match(sqlEmpresas, /revoke all on function public\.sulsafe_pode_convidar_empresa\(uuid\) from public, anon/i)
})

test('JWT do convidado carrega o empresa_id correto e sulsafe_empresa_id() o lê', async t => {
    const db = await criarBanco()
    t.after(() => db.close())

    await sessao(db, CONVIDADO, claim(EMP_A))
    await db.exec('set role authenticated')
    const empresa = await db.query('select public.sulsafe_empresa_id() as id')
    await db.exec('reset role')

    assert.equal(empresa.rows[0].id, EMP_A)
})

test('convidado da Empresa A cria job na própria empresa e não vê a Empresa B', async t => {
    const db = await criarBanco()
    t.after(() => db.close())

    const jobId = (await como(
        db,
        CONVIDADO,
        claim(EMP_A),
        `select public.sulsafe_criar_ia_job(
            'NR 35 — Trabalho em altura', 'Pedido do instrutor: montar uma aula sobre NR 35',
            'MATERIA'
        ) as id`
    )).rows[0].id

    const gravado = (await como(
        db, CONVIDADO, claim(EMP_A),
        'select empresa_id::text, criado_por::text from public.ia_jobs where id = $1', [jobId]
    )).rows[0]

    assert.equal(gravado.empresa_id, EMP_A)
    assert.equal(gravado.criado_por, CONVIDADO)

    const visiveisA = await como(
        db, CONVIDADO, claim(EMP_A), 'select count(*)::int as total from public.ia_jobs'
    )
    assert.equal(visiveisA.rows[0].total, 1)

    const visiveisB = await como(
        db, PROF_B, claim(EMP_B), 'select count(*)::int as total from public.ia_jobs'
    )
    assert.equal(visiveisB.rows[0].total, 0)

    await assert.rejects(
        como(
            db, PROF_B, claim(EMP_B),
            `select public.sulsafe_criar_ia_job('Teste', 'Pedido', 'CURSO', $1)`, [EMP_A]
        ),
        /outra empresa/i
    )
})

test('RLS de empresas: professor vê só a sua, ADMIN vê todas e professor não cadastra', async t => {
    const db = await criarBanco()
    t.after(() => db.close())

    const doProfessor = await como(
        db, PROF_A, claim(EMP_A), 'select id::text from public.empresas order by nome'
    )
    assert.deepEqual(doProfessor.rows.map(r => r.id), [EMP_A])

    const doAdmin = await como(
        db, ADMIN, {}, 'select id::text from public.empresas order by nome'
    )
    assert.equal(doAdmin.rows.length, 3)

    await assert.rejects(
        como(
            db, PROF_A, claim(EMP_A),
            `insert into public.empresas (nome) values ('Empresa Fantasma')`
        ),
        /row-level security|permission denied/i
    )
})

test('RPC de convite autoriza só ADMIN e empresa ativa', async t => {
    const db = await criarBanco()
    t.after(() => db.close())

    const pode = async (uid, appMetadata, empresaId) => (await como(
        db, uid, appMetadata,
        'select public.sulsafe_pode_convidar_empresa($1) as ok', [empresaId]
    )).rows[0].ok

    assert.equal(await pode(ADMIN, {}, EMP_A), true)
    assert.equal(await pode(ADMIN, {}, EMP_INATIVA), false)
    assert.equal(await pode(ADMIN, {}, null), false)
    assert.equal(await pode(PROF_A, claim(EMP_A), EMP_A), false)
    assert.equal(await pode(CONVIDADO, claim(EMP_A), EMP_A), false)
    assert.equal(await pode(ADMIN, {}, '00000000-0000-4000-8000-000000000099'), false)
})

test('sem claim, o usuário não enxerga rascunhos de nenhuma empresa', async t => {
    const db = await criarBanco()
    t.after(() => db.close())

    await db.exec('set role service_role')
    const job = await db.query(`
        insert into public.ia_jobs (empresa_id, criado_por, tipo, titulo, prompt)
        values ('${EMP_A}', '${PROF_A}', 'MATERIA', 'NR 35', 'Pedido do instrutor: NR 35')
        returning id
    `)
    await db.query(`
        insert into public.ia_conteudos (job_id, criado_por, tipo, titulo, conteudo)
        values ($1, '${PROF_A}', 'MATERIA', 'Rascunho A', '{"titulo":"Rascunho A"}'::jsonb)
    `, [job.rows[0].id])
    await db.exec('reset role')

    const semClaim = await como(db, ALUNO, {}, 'select count(*)::int as total from public.ia_conteudos')
    assert.equal(semClaim.rows[0].total, 0)

    const doAlunoA = await como(db, ALUNO, claim(EMP_A), 'select count(*)::int as total from public.ia_conteudos')
    assert.equal(doAlunoA.rows[0].total, 0)

    const doAdmin = await como(db, ADMIN, {}, 'select count(*)::int as total from public.ia_conteudos')
    assert.equal(doAdmin.rows[0].total, 1)
})
