// ============================================================
// FASE 5.4 — EMISSÃO, VISUALIZAÇÃO E VALIDAÇÃO DE CERTIFICADOS
// ============================================================
// TDD: a emissão passa somente pela RPC (professor/admin), exige todas as
// aulas do NR concluídas e nota mínima, não duplica, e a validação pública
// não expõe dados pessoais do aluno.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const ler = caminho => {
    try {
        return fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
    } catch {
        return ''
    }
}

const MIGRACAO = ler('../supabase/migrations/20261126000000_fase5_4_certificados.sql')
const ISOLAMENTO = ler('../supabase/migrations/20261024001000_isolamento_academico.sql')

const EMPRESA = '00000000-0000-4000-8000-000000000301'
const PROF = '00000000-0000-4000-8000-000000000302'
const ALUNO_APTO = '00000000-0000-4000-8000-000000000311'
const ALUNO_INAPTO = '00000000-0000-4000-8000-000000000312'
const ALUNO_OUTRA = '00000000-0000-4000-8000-000000000313'
const AULA_1 = '00000000-0000-4000-8000-000000000321'
const AULA_2 = '00000000-0000-4000-8000-000000000322'

async function criarBanco() {
    const db = new PGlite()
    await db.exec(`
        create role anon nologin;
        create role authenticated nologin;
        create role service_role nologin bypassrls;
        create schema auth;
        create table auth.sessao (
            uid uuid, papel text, empresa_id uuid
        );
        create function auth.uid() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select uid from auth.sessao limit 1 $$;
        create function auth.jwt() returns jsonb
        language sql stable security definer set search_path = ''
        as $$
            select jsonb_build_object(
                'role', papel,
                'app_metadata', jsonb_build_object('empresa_id', empresa_id)
            ) from auth.sessao limit 1
        $$;
        create function auth.role() returns text
        language sql stable security definer set search_path = ''
        as $$ select papel from auth.sessao limit 1 $$;
        grant usage on schema auth, public to anon, authenticated, service_role;
        grant execute on function auth.uid() to anon, authenticated, service_role;
        grant execute on function auth.jwt() to anon, authenticated, service_role;
        grant execute on function auth.role() to anon, authenticated, service_role;

        create table public.profiles (
            id uuid primary key, role text, status text,
            nome_completo text, email text, cpf text,
            criado_em timestamptz default now()
        );
        insert into public.profiles (id, role, status, nome_completo, email, cpf) values
            ('${PROF}', 'professor', 'ativo', 'Prof 5.4', 'prof54@teste.local', null),
            ('${ALUNO_APTO}', 'aluno', 'ativo', 'Aluno Apto', 'apto@teste.local', '111.444.777-35'),
            ('${ALUNO_INAPTO}', 'aluno', 'ativo', 'Aluno Inapto', 'inapto@teste.local', null),
            ('${ALUNO_OUTRA}', 'aluno', 'ativo', 'Aluno Outra Turma', 'outra@teste.local', null);

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                            where p.id = auth.uid() and p.status = 'ativo')
        $$;
        create function public.sulsafe_is_admin() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                            where p.id = auth.uid() and p.status = 'ativo'
                              and p.role in ('admin', 'super_admin'))
        $$;
        create function public.sulsafe_is_professor() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                            where p.id = auth.uid() and p.status = 'ativo'
                              and p.role in ('professor', 'admin', 'super_admin'))
        $$;
        create function public.sulsafe_perfil_aluno(p_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                            where p.id = p_id and p.role = 'aluno')
        $$;
        create function public.sulsafe_acessa_aluno(p_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select public.sulsafe_is_professor() and p_id <> '${ALUNO_OUTRA}'
        $$;
        grant execute on function public.sulsafe_conta_ativa() to anon, authenticated, service_role;
        grant execute on function public.sulsafe_is_admin() to anon, authenticated, service_role;
        grant execute on function public.sulsafe_is_professor() to anon, authenticated, service_role;
        grant execute on function public.sulsafe_perfil_aluno(uuid) to anon, authenticated, service_role;
        grant execute on function public.sulsafe_acessa_aluno(uuid) to anon, authenticated, service_role;

        create table public.videoaulas (
            id uuid primary key, nr_id integer not null,
            titulo text not null, publico boolean not null default true
        );
        insert into public.videoaulas (id, nr_id, titulo, publico) values
            ('${AULA_1}', 35, 'NR-35 Aula 1', true),
            ('${AULA_2}', 35, 'NR-35 Aula 2', true);

        create table public.progresso_aulas (
            id uuid primary key default gen_random_uuid(),
            user_id uuid references public.profiles(id),
            aula_id uuid references public.videoaulas(id),
            "concluído" boolean default false,
            unique (user_id, aula_id)
        );
        insert into public.progresso_aulas (user_id, aula_id, "concluído") values
            ('${ALUNO_APTO}', '${AULA_1}', true),
            ('${ALUNO_APTO}', '${AULA_2}', true),
            ('${ALUNO_INAPTO}', '${AULA_1}', true),
            ('${ALUNO_INAPTO}', '${AULA_2}', false);

        create table public.notas (
            id uuid primary key default gen_random_uuid(),
            usuario_id uuid references public.profiles(id),
            nr_id integer not null, nota numeric(5,2),
            criado_em timestamptz default now()
        );
        insert into public.notas (usuario_id, nr_id, nota) values
            ('${ALUNO_APTO}', 35, 8.5),
            ('${ALUNO_INAPTO}', 35, 5.0),
            ('${ALUNO_OUTRA}', 35, 9.0);

        create table public.certificados (
            id uuid primary key default gen_random_uuid(),
            usuario_id uuid,
            nr_id integer not null,
            codigo text unique,
            nota numeric(5,2),
            carga_horaria integer default 40,
            emitido_por uuid,
            criado_em timestamptz default now(),
            revogado boolean not null default false
        );
        grant all on public.certificados to anon, authenticated, service_role;
    `)
    return db
}

async function sessao(db, uid, papel, empresa = EMPRESA) {
    await db.exec('reset role')
    await db.query('delete from auth.sessao')
    await db.query('insert into auth.sessao (uid, papel, empresa_id) values ($1, $2, $3)', [uid, papel, empresa])
}

async function como(db, papel, fn) {
    await db.exec('reset role')
    await db.exec(`set role ${papel}`)
    try {
        return await fn()
    } finally {
        await db.exec('reset role')
    }
}

async function composerBanco() {
    const db = await criarBanco()
    assert.ok(MIGRACAO, 'migration da Fase 5.4 deve existir')
    await db.exec(MIGRACAO)

    // Reaproveita o gatilho real de proteção e a policy real de leitura.
    const gatilho = ISOLAMENTO.match(
        /create or replace function public\.sulsafe_proteger_certificado\(\)[\s\S]*?create trigger trg_certificados_protege[\s\S]*?execute function public\.sulsafe_proteger_certificado\(\);/
    )?.[0] || ''
    assert.ok(gatilho, 'gatilho de proteção de certificados deve existir')
    await db.exec(gatilho)

    const policy = ISOLAMENTO.match(
        /create policy "sulsafe_certificados_select"[\s\S]*?\);/
    )?.[0] || ''
    assert.ok(policy, 'policy de leitura de certificados deve existir')
    await db.exec(`
        alter table public.certificados enable row level security;
        ${policy}
    `)

    await sessao(db, PROF, 'authenticated')
    return db
}

test('migration da Fase 5.4 cria RPC de emissão com hash e colunas compatíveis', () => {
    assert.match(MIGRACAO, /create table if not exists public\.certificados/i)
    assert.match(MIGRACAO, /add column if not exists empresa_id/i)
    assert.match(MIGRACAO, /add column if not exists hash_validacao/i)
    assert.match(MIGRACAO, /add column if not exists emitido_em/i)
    assert.match(MIGRACAO, /create or replace function public\.sulsafe_emitir_certificado/i)
    assert.match(MIGRACAO, /sha256\(/i)
    assert.match(MIGRACAO, /grant execute on function public\.sulsafe_emitir_certificado/i)
    assert.doesNotMatch(MIGRACAO, /grant[^\n]*on public\.certificados[^\n]*to anon/i)
})

test('emissão exige aulas concluídas e nota mínima, e não duplica', async t => {
    const db = await composerBanco()
    t.after(() => db.close())

    const ok = await db.query(
        `select public.sulsafe_emitir_certificado($1, $2) as cert`,
        [ALUNO_APTO, 35]
    )
    const cert = ok.rows[0].cert
    assert.equal(cert.ja_existia, false)
    assert.equal(Number(cert.nota), 8.5)
    assert.equal(cert.nr_id, 35)
    assert.match(cert.hash, /^[0-9a-f]{64}$/)

    const linhas = await db.query(
        'select usuario_id, nr_id, nota, nota_final, emitido_por, empresa_id, hash_validacao from public.certificados'
    )
    assert.equal(linhas.rows.length, 1)
    assert.equal(linhas.rows[0].usuario_id, ALUNO_APTO)
    assert.equal(linhas.rows[0].emitido_por, PROF)
    assert.equal(linhas.rows[0].empresa_id, EMPRESA)
    assert.equal(linhas.rows[0].hash_validacao, cert.hash)

    const repetido = await db.query(
        `select public.sulsafe_emitir_certificado($1, $2) as cert`,
        [ALUNO_APTO, 35]
    )
    assert.equal(repetido.rows[0].cert.ja_existia, true)
    assert.equal(repetido.rows[0].cert.codigo, cert.codigo)
    const total = await db.query('select count(*)::int as total from public.certificados')
    assert.equal(total.rows[0].total, 1, 'emissão repetida não pode duplicar certificado')

    await assert.rejects(
        db.query(`select public.sulsafe_emitir_certificado($1, $2)`, [ALUNO_INAPTO, 35]),
        /aulas|Nota mínima/i
    )
    const depois = await db.query('select count(*)::int as total from public.certificados')
    assert.equal(depois.rows[0].total, 1, 'aluno inapto não pode gerar certificado')
})

test('aluno não emite certificado manualmente nem vê certificado de outro aluno', async t => {
    const db = await composerBanco()
    t.after(() => db.close())

    await sessao(db, PROF, 'authenticated')
    await db.query(`select public.sulsafe_emitir_certificado($1, $2)`, [ALUNO_APTO, 35])

    await sessao(db, ALUNO_APTO, 'authenticated')
    await assert.rejects(
        db.query(`insert into public.certificados (usuario_id, nr_id, codigo)
                  values ($1, 35, 'SS-FRAUDE')`, [ALUNO_APTO]),
        /Apenas professores e administradores podem emitir certificados/
    )

    const visiveis = await como(db, 'authenticated', () =>
        db.query('select usuario_id from public.certificados')
    )
    assert.equal(visiveis.rows.length, 1)
    assert.equal(visiveis.rows[0].usuario_id, ALUNO_APTO)

    await sessao(db, ALUNO_INAPTO, 'authenticated')
    await assert.rejects(
        db.query(`select public.sulsafe_emitir_certificado($1, $2)`, [ALUNO_INAPTO, 35]),
        /Acesso negado/
    )
})

test('elegibilidade marca apto somente quem concluiu e tem nota', async t => {
    const db = await composerBanco()
    t.after(() => db.close())

    await sessao(db, PROF, 'authenticated')
    const { rows } = await db.query('select * from public.sulsafe_listar_elegibilidade_certificados()')
    const apto = rows.find(r => r.aluno_id === ALUNO_APTO && r.nr_id === 35)
    const inapto = rows.find(r => r.aluno_id === ALUNO_INAPTO && r.nr_id === 35)
    assert.equal(apto.apto, true)
    assert.equal(apto.aulas_concluidas, 2)
    assert.equal(apto.aulas_total, 2)
    assert.equal(Number(apto.nota), 8.5)
    assert.equal(inapto.apto, false)
    assert.equal(rows.some(r => r.aluno_id === ALUNO_OUTRA), false)

    await sessao(db, ALUNO_APTO, 'authenticated')
    const comoAluno = await db.query('select * from public.sulsafe_listar_elegibilidade_certificados()')
    assert.equal(comoAluno.rows.length, 0)
})

test('validação pública informa curso e data sem expor nome ou CPF', async t => {
    const db = await composerBanco()
    t.after(() => db.close())

    await sessao(db, PROF, 'authenticated')
    const emitido = (await db.query(
        `select public.sulsafe_emitir_certificado($1, $2) as cert`, [ALUNO_APTO, 35]
    )).rows[0].cert

    await sessao(db, null, 'anon')
    const valido = await como(db, 'anon', () =>
        db.query(`select public.sulsafe_validar_certificado_publico($1) as r`, [emitido.hash])
    )
    const r = valido.rows[0].r
    assert.equal(r.valido, true)
    assert.equal(r.nr_id, 35)
    assert.ok(r.emitido_em)
    assert.equal(JSON.stringify(r).includes('Aluno Apto'), false)
    assert.equal(JSON.stringify(r).includes('111.444.777-35'), false)

    const invalido = await como(db, 'anon', () =>
        db.query(`select public.sulsafe_validar_certificado_publico($1) as r`, ['hash-inexistente'])
    )
    assert.equal(invalido.rows[0].r.valido, false)

    await sessao(db, PROF, 'authenticated')
    await db.query(`update public.certificados set revogado = true where hash_validacao = $1`, [emitido.hash])
    await sessao(db, null, 'anon')
    const revogado = await como(db, 'anon', () =>
        db.query(`select public.sulsafe_validar_certificado_publico($1) as r`, [emitido.hash])
    )
    assert.equal(revogado.rows[0].r.valido, false)
})

test('frontend: emissão no progresso, card do aluno, dossiê e validação pública', () => {
    const progresso = ler('../js/views/progresso-alunos.js')
    const cliente = ler('../js/supabase-client.js')
    const dashboard = ler('../js/dashboard-aluno-core.js')
    const dashboardView = ler('../js/views/aluno-dashboard.js')
    const dossie = ler('../js/views/dossie.js')
    const certs = ler('../js/views/certificados.js')
    const main = ler('../js/main.js')
    const validar = ler('../js/validar-certificado.js')
    const pagina = ler('../validar.html')
    const rewrites = ler('../vercel.json')

    assert.match(progresso, /Emitir Certificado/)
    assert.match(progresso, /sbListarElegibilidadeCertificados/)
    assert.match(progresso, /sbEmitirCertificadoRPC/)
    assert.match(cliente, /sulsafe_emitir_certificado/)
    assert.match(cliente, /sulsafe_listar_elegibilidade_certificados/)
    assert.match(dashboard, /Meus Certificados/)
    assert.match(dashboardView, /sbGetCertificadosAluno/)
    assert.match(dossie, /Certificados Emitidos/)
    assert.match(certs, /window\.print\(\)/)
    assert.match(certs, /hash_validacao|cert\.hash/)
    assert.match(main, /aluno-certificados/)
    assert.match(pagina, /validar-certificado\.js/)
    assert.match(validar, /sulsafe_validar_certificado_publico/)
    assert.match(rewrites, /\/validar\/:hash/)
})
