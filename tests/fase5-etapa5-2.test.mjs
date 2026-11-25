// ============================================================
// FASE 5.2 — INTEGRAÇÃO DA GERAÇÃO I.A. NA ÁREA DO PROFESSOR
// ============================================================
// TDD: aprovação deixa a prova pronta para distribuir; palestras têm
// "Uso Pessoal" (INTERNO, sem entrega) ou distribuição real; o aluno vê
// provas e palestras entregues em um dashboard único.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import {
    DESTINOS_PALESTRA,
    rotuloStatusPalestra,
    prontaParaDistribuir,
    renderPalestrasProfessorHtml,
    renderPalestrasAlunoHtml
} from '../js/palestras-core.js'
import {
    mesclarProvasAluno,
    renderDashboardAlunoHtml
} from '../js/dashboard-aluno-core.js'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const migration = ler('../supabase/migrations/20261125100000_fase5_2_palestras.sql')
const professor = ler('../js/views/professor.js')
const tutor = ler('../js/views/tutor.js')
const state = ler('../js/state.js')
const main = ler('../js/main.js')
const app = ler('../js/app.js')
const cliente = ler('../js/supabase-client.js')
const pendentes = ler('../js/views/provas-pendentes-ia.js')
const distribuicao = ler('../js/views/provas-distribuicao-ia.js')
const palestrasProfessor = ler('../js/views/palestras-professor.js')
const provaAluno = ler('../js/views/prova-aluno-ia.js')
const resultadosIA = ler('../js/views/provas-resultados-ia.js')
const vercel = JSON.parse(ler('../vercel.json'))

const uuid = (sufixo) => `00000000-0000-4000-9000-${sufixo.padStart(12, '0')}`
const ADMIN = uuid('1')
const PROF_A = uuid('2')
const PROF_B = uuid('3')
const ALUNO_A1 = uuid('4')
const ALUNO_A2 = uuid('5')
const ALUNO_B1 = uuid('6')
const EMP_A = uuid('a')
const EMP_B = uuid('b')
const TURMA_A = uuid('c')
const TURMA_B = uuid('d')
const JOB_A = uuid('e')
const JOB_B = uuid('f')
const RASCUNHO_A = uuid('10')
const RASCUNHO_B = uuid('11')

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;

        create schema auth;
        create table auth.sessao (uid uuid, empresa_id uuid, papel text not null default 'anon');
        insert into auth.sessao (uid, empresa_id, papel) values (null, null, 'anon');

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

        grant usage on schema auth, public to authenticated, anon, service_role;
        grant execute on function auth.uid() to authenticated, anon, service_role;
        grant execute on function auth.jwt() to authenticated, anon, service_role;

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${PROF_A}', 'professor', 'ativo'),
            ('${PROF_B}', 'professor', 'ativo'),
            ('${ALUNO_A1}', 'aluno', 'ativo'),
            ('${ALUNO_A2}', 'aluno', 'ativo'),
            ('${ALUNO_B1}', 'aluno', 'ativo');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'ativo'
            )
        $$;
        create function public.sulsafe_empresa_id() returns uuid
        language sql stable security definer set search_path = '' as $$
            select nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid
        $$;
        create function public.sulsafe_is_admin() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'ativo'
                   and p.role in ('admin', 'super_admin')
            )
        $$;
        create function public.sulsafe_is_professor() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'ativo'
                   and p.role in ('professor', 'admin', 'super_admin')
            )
        $$;
        grant execute on function public.sulsafe_conta_ativa() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_empresa_id() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_admin() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_professor() to authenticated, anon, service_role;

        create table public.turmas (
            id uuid primary key,
            nome text not null,
            criado_por uuid not null references public.profiles(id),
            empresa_id uuid
        );
        create table public.turma_alunos (
            turma_id uuid not null references public.turmas(id) on delete cascade,
            aluno_id uuid not null references public.profiles(id) on delete cascade,
            primary key (turma_id, aluno_id)
        );
        insert into public.turmas (id, nome, criado_por, empresa_id) values
            ('${TURMA_A}', 'Turma A', '${PROF_A}', '${EMP_A}'),
            ('${TURMA_B}', 'Turma B', '${PROF_B}', '${EMP_B}');
        insert into public.turma_alunos (turma_id, aluno_id) values
            ('${TURMA_A}', '${ALUNO_A1}'),
            ('${TURMA_A}', '${ALUNO_A2}'),
            ('${TURMA_B}', '${ALUNO_B1}');

        create function public.sulsafe_gerencia_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.turmas t
                 where t.id = p_turma_id and t.criado_por = auth.uid()
            )
        $$;
        create function public.sulsafe_acessa_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select public.sulsafe_is_professor()
               and (public.sulsafe_is_admin() or public.sulsafe_gerencia_turma(p_turma_id))
        $$;
        create function public.sulsafe_acessa_aluno(p_aluno_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select public.sulsafe_is_professor()
               and (
                    public.sulsafe_is_admin()
                    or exists (
                        select 1 from public.turma_alunos ta
                         where ta.aluno_id = p_aluno_id
                           and public.sulsafe_acessa_turma(ta.turma_id)
                    )
               )
        $$;
        grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, anon, service_role;
        grant execute on function public.sulsafe_acessa_turma(uuid) to authenticated, anon, service_role;
        grant execute on function public.sulsafe_acessa_aluno(uuid) to authenticated, anon, service_role;

        create table public.notificacoes (
            id uuid primary key default gen_random_uuid(),
            usuario_id uuid references public.profiles(id),
            titulo text not null,
            mensagem text not null,
            link text,
            lida boolean default false,
            criado_em timestamptz default now()
        );

        create table public.ia_jobs (
            id uuid primary key,
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null,
            titulo text not null,
            prompt text not null,
            status text not null default 'CONCLUIDO',
            criado_em timestamptz not null default now()
        );
        create table public.ia_conteudos (
            id uuid primary key,
            job_id uuid not null references public.ia_jobs(id),
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null,
            titulo text not null,
            conteudo jsonb not null default '{}'::jsonb,
            aprovado boolean not null default false,
            rejeitado boolean not null default false,
            criado_em timestamptz not null default now()
        );
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt) values
            ('${JOB_A}', '${EMP_A}', '${PROF_A}', 'PALESTRA', 'Palestra NR-35 A', 'Pedido A'),
            ('${JOB_B}', '${EMP_B}', '${PROF_B}', 'PALESTRA', 'Palestra NR-35 B', 'Pedido B');
        insert into public.ia_conteudos
            (id, job_id, empresa_id, criado_por, tipo, titulo, conteudo, aprovado)
        values
            ('${RASCUNHO_A}', '${JOB_A}', '${EMP_A}', '${PROF_A}', 'PALESTRA', 'Palestra NR-35 A',
             '{"descricao":"Trabalho em altura","publicoAlvo":"Alunos","duracao_min":30,"roteiro":[{"bloco":"Abertura","minutos":5,"conteudo":"Introducao"}]}'::jsonb, true),
            ('${RASCUNHO_B}', '${JOB_B}', '${EMP_B}', '${PROF_B}', 'PALESTRA', 'Palestra NR-35 B',
             '{"descricao":"Outra empresa","roteiro":[]}'::jsonb, true);
    `)

    await db.exec(migration)
    return db
}

async function sessao(db, usuario, empresa, papelJwt = 'authenticated', papelBanco = 'authenticated') {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2, papel = $3', [usuario, empresa, papelJwt])
    if (papelBanco) await db.exec(`set role ${papelBanco}`)
}

async function comBanco(t, fn) {
    const db = await criarBanco()
    t.after(async () => {
        await db.exec('reset role')
        await db.close()
    })
    return fn(db)
}

async function criarPalestra(db, titulo = 'Palestra NR-35') {
    const { rows } = await db.query(
        `select public.sulsafe_criar_palestra($1, $2, $3, $4, $5) as id`,
        [titulo, 'Descrição da palestra', 'Alunos', 30,
         JSON.stringify([{ bloco: 'Abertura', minutos: 5, conteudo: 'Introdução' }])]
    )
    return rows[0].id
}

test('migration 5.2 é forward-only e protege toda escrita por RPC', () => {
    assert.ok(!/\bdrop table\b|\btruncate\b/i.test(migration))
    assert.match(migration, /create table if not exists public\.palestras/)
    assert.match(migration, /create table if not exists public\.palestras_distribuicoes/)
    assert.match(migration, /unique \(palestra_id, aluno_id\)/)
    assert.match(migration, /enable row level security/)
    for (const nome of [
        'sulsafe_criar_palestra',
        'sulsafe_criar_palestra_ia',
        'sulsafe_aprovar_palestra',
        'sulsafe_distribuir_palestra',
        'sulsafe_listar_palestras_professor',
        'sulsafe_listar_palestras_aluno'
    ]) {
        assert.match(migration, new RegExp(`create or replace function public\\.${nome}\\(`), nome)
        assert.match(migration, new RegExp(`revoke all on function public\\.${nome}\\([\\s\\S]*?\\) from public, anon`), nome)
        assert.match(migration, new RegExp(`grant execute on function public\\.${nome}\\([\\s\\S]*?\\) to authenticated`), nome)
    }
    assert.match(migration, /security definer[\s\S]*?set search_path = ''/i)
    assert.doesNotMatch(migration, /service_role/i)
})

test('aprovar palestra deixa publicado=true e sem distribuição', async (t) => {
    await comBanco(t, async (db) => {
        await sessao(db, PROF_A, EMP_A)
        const id = await criarPalestra(db)

        let { rows } = await db.query('select publicado, origem, distribuido_por, distribuido_em from public.palestras where id = $1', [id])
        assert.equal(rows[0].publicado, false)
        assert.equal(rows[0].origem, 'MANUAL')

        const { rows: aprovadas } = await db.query('select public.sulsafe_aprovar_palestra($1) as ok', [id])
        assert.equal(aprovadas[0].ok, true)

        ;({ rows } = await db.query('select publicado, aprovado_por, distribuido_por, distribuido_em, destino_tipo from public.palestras where id = $1', [id]))
        assert.equal(rows[0].publicado, true)
        assert.equal(rows[0].aprovado_por, PROF_A)
        assert.equal(rows[0].distribuido_por, null)
        assert.equal(rows[0].distribuido_em, null)
        assert.equal(rows[0].destino_tipo, null)
    })
})

test('Uso Pessoal (INTERNO) não entrega nem notifica, e permite distribuir depois', async (t) => {
    await comBanco(t, async (db) => {
        await sessao(db, PROF_A, EMP_A)
        const id = await criarPalestra(db)
        await db.query('select public.sulsafe_aprovar_palestra($1)', [id])

        const { rows: internas } = await db.query(
            `select public.sulsafe_distribuir_palestra($1, $2, null) as total`, [id, 'INTERNO']
        )
        assert.equal(internas[0].total, 0)

        let { rows } = await db.query(
            `select destino_tipo, distribuido_por, distribuido_em from public.palestras where id = $1`, [id]
        )
        assert.equal(rows[0].destino_tipo, 'INTERNO')
        assert.equal(rows[0].distribuido_por, null)
        assert.equal(rows[0].distribuido_em, null)

        // Verificações de tabela direta seguem o padrão dos demais testes:
        // authenticated não lê notificacoes sem a RLS da migration original.
        await db.exec('reset role')
        ;({ rows } = await db.query('select count(*)::integer as total from public.palestras_distribuicoes'))
        assert.equal(rows[0].total, 0)
        ;({ rows } = await db.query('select count(*)::integer as total from public.notificacoes'))
        assert.equal(rows[0].total, 0)
        await db.exec('set role authenticated')

        const { rows: catalogo } = await db.query(
            `select public.sulsafe_distribuir_palestra($1, $2, null) as total`, [id, 'CATALOGO']
        )
        assert.equal(catalogo[0].total, 2)

        ;({ rows } = await db.query(
            `select destino_tipo, distribuido_por, distribuido_em from public.palestras where id = $1`, [id]
        ))
        assert.equal(rows[0].destino_tipo, 'CATALOGO')
        assert.equal(rows[0].distribuido_por, PROF_A)
        assert.ok(rows[0].distribuido_em)

        // A leitura direta de notificações exige bypass da RLS neste teste.
        await db.exec('reset role')
        ;({ rows } = await db.query('select count(*)::integer as total from public.notificacoes'))
        assert.equal(rows[0].total, 2)
        ;({ rows } = await db.query('select link from public.notificacoes limit 1'))
        assert.equal(rows[0].link, 'aluno-dashboard')
    })
})

test('distribuição é idempotente e não alcança outra empresa', async (t) => {
    await comBanco(t, async (db) => {
        await sessao(db, PROF_A, EMP_A)
        const id = await criarPalestra(db)
        await db.query('select public.sulsafe_aprovar_palestra($1)', [id])
        await db.query(`select public.sulsafe_distribuir_palestra($1, 'TURMA', $2)`, [id, TURMA_A])

        await assert.rejects(
            () => db.query(`select public.sulsafe_distribuir_palestra($1, 'CATALOGO', null)`, [id]),
            /já distribuída/i
        )
        await assert.rejects(
            () => db.query(`select public.sulsafe_distribuir_palestra($1, 'TURMA', $2)`, [id, TURMA_B]),
            /Turma inválida ou de outra empresa/i
        )
    })
})

test('aluno vê somente palestras distribuídas da sua empresa', async (t) => {
    await comBanco(t, async (db) => {
        await sessao(db, PROF_A, EMP_A)
        const idA = await criarPalestra(db, 'Palestra da Empresa A')
        await db.query('select public.sulsafe_aprovar_palestra($1)', [idA])
        await db.query(`select public.sulsafe_distribuir_palestra($1, 'TURMA', $2)`, [idA, TURMA_A])

        await sessao(db, PROF_B, EMP_B)
        const idB = await criarPalestra(db, 'Palestra da Empresa B')
        await db.query('select public.sulsafe_aprovar_palestra($1)', [idB])
        await db.query(`select public.sulsafe_distribuir_palestra($1, 'TURMA', $2)`, [idB, TURMA_B])

        await sessao(db, ALUNO_A1, EMP_A)
        let { rows } = await db.query('select titulo from public.sulsafe_listar_palestras_aluno()')
        assert.deepEqual(rows.map(r => r.titulo), ['Palestra da Empresa A'])

        await sessao(db, ALUNO_B1, EMP_B)
        ;({ rows } = await db.query('select titulo from public.sulsafe_listar_palestras_aluno()'))
        assert.deepEqual(rows.map(r => r.titulo), ['Palestra da Empresa B'])

        await sessao(db, PROF_A, EMP_A)
        ;({ rows } = await db.query('select titulo, origem from public.sulsafe_listar_palestras_professor()'))
        assert.deepEqual(rows.map(r => r.titulo), ['Palestra da Empresa A'])
        assert.equal(rows[0].origem, 'MANUAL')
    })
})

test('rascunho PALESTRA do Tutor vira palestra I.A. uma única vez', async (t) => {
    await comBanco(t, async (db) => {
        await sessao(db, PROF_A, EMP_A)
        const { rows } = await db.query('select public.sulsafe_criar_palestra_ia($1) as id', [RASCUNHO_A])
        const id = rows[0].id
        assert.ok(id)

        let { rows: detalhe } = await db.query(
            'select origem, ia_conteudo_id, publicado, roteiro from public.palestras where id = $1', [id]
        )
        assert.equal(detalhe[0].origem, 'IA_TUTOR')
        assert.equal(detalhe[0].ia_conteudo_id, RASCUNHO_A)
        assert.equal(detalhe[0].publicado, false)
        assert.equal(detalhe[0].roteiro[0].bloco, 'Abertura')

        const { rows: novamente } = await db.query('select public.sulsafe_criar_palestra_ia($1) as id', [RASCUNHO_A])
        assert.equal(novamente[0].id, id)

        await assert.rejects(
            () => db.query('select public.sulsafe_criar_palestra_ia($1)', [RASCUNHO_B]),
            /outra empresa|Rascunho de I.A. inválido/i
        )
    })
})

test('authenticated não grava diretamente nas tabelas de palestras', async (t) => {
    await comBanco(t, async (db) => {
        await sessao(db, PROF_A, EMP_A)
        await assert.rejects(
            () => db.query(
                `insert into public.palestras (titulo, criado_por) values ('Invasão', $1)`, [PROF_A]
            ),
            /permission denied/i
        )
    })
})

test('status e cards de palestra mostram "pronta para distribuir" e Uso Pessoal', () => {
    assert.deepEqual([...DESTINOS_PALESTRA], ['INTERNO', 'TURMA', 'ALUNO', 'CATALOGO'])
    assert.equal(rotuloStatusPalestra({ publicado: false }), 'Aguardando aprovação')
    assert.equal(rotuloStatusPalestra({ publicado: true }), 'Aprovada — pronta para distribuir')
    assert.equal(rotuloStatusPalestra({ publicado: true, destino_tipo: 'INTERNO' }), 'Uso Pessoal')
    assert.equal(rotuloStatusPalestra({ publicado: true, distribuido_em: '2026-11-25T00:00:00Z' }), 'Distribuída')
    assert.equal(prontaParaDistribuir({ publicado: true }), true)
    assert.equal(prontaParaDistribuir({ publicado: true, distribuido_em: '2026-11-25T00:00:00Z' }), false)

    const html = renderPalestrasProfessorHtml([
        { id: 'p1', titulo: 'Palestra A', publicado: true },
        { id: 'p2', titulo: '<img onerror=alert(1)>', publicado: false }
    ])
    for (const trecho of [
        'Aprovada — pronta para distribuir',
        'Aprovar Palestra',
        'Distribuir',
        'data-acao="distribuir"',
        'data-acao="aprovar"',
        '&lt;img onerror=alert(1)&gt;'
    ]) {
        assert.ok(html.includes(trecho), `trecho ausente: ${trecho}`)
    }
    assert.doesNotMatch(html, /<img\b/i)

    const htmlAluno = renderPalestrasAlunoHtml([
        { id: 'p1', titulo: 'Palestra A', roteiro: [{ bloco: '<script>x</script>', minutos: 5, conteudo: 'Intro' }] }
    ])
    assert.match(htmlAluno, /Palestras Disponíveis|Abrir palestra/)
    assert.doesNotMatch(htmlAluno, /<script\b/i)
})

test('dashboard do aluno unifica I.A. e criação manual sem duplicatas', () => {
    const provas = mesclarProvasAluno({
        ia: [{ prova_id: 'p1', titulo: 'Prova I.A.', origem: 'IA_TUTOR' }],
        manuais: [{ prova_id: 'p2', titulo: 'Prova Manual', origem: 'MANUAL' }],
        direcionadas: [{ prova_id: 'p1', titulo: 'Prova I.A.', origem: 'IA_TUTOR' }]
    })
    assert.equal(provas.length, 2)
    assert.deepEqual(provas.map(p => p.prova_id), ['p1', 'p2'])

    const html = renderDashboardAlunoHtml({
        cursos: [{ id: 'c1', titulo: 'Curso NR-35' }],
        provas,
        palestras: [{ id: 'pa1', titulo: 'Palestra NR-35' }]
    })
    for (const trecho of [
        'Meus Cursos',
        'Provas Pendentes',
        'Palestras Disponíveis',
        'Curso NR-35',
        'Prova I.A.',
        'Prova Manual',
        'Palestra NR-35',
        '/aluno/prova/p1'
    ]) {
        assert.ok(html.includes(trecho), `trecho ausente: ${trecho}`)
    }
    assert.doesNotMatch(html, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})

test('aba Provas da IA reaproveita HITL e marca aprovadas na aba Provas', () => {
    for (const trecho of [
        "switchProfTab('provasIa'",
        "switchProfTab('palestras'",
        'profTabProvasIa',
        'profTabPalestras',
        'htmlFilaProvasPendentes',
        'iniciarFilaProvasPendentes',
        'abrirDistribuicaoProvaIA',
        'Aprovada pela IA',
        'iniciarPalestrasProfessor'
    ]) {
        assert.ok(professor.includes(trecho), `trecho ausente em professor.js: ${trecho}`)
    }
    assert.match(pendentes, /export function htmlFilaProvasPendentes\(/)
    assert.match(pendentes, /export function iniciarFilaProvasPendentes\(/)
    assert.match(distribuicao, /export async function abrirDistribuicaoProvaIA\(/)
    assert.doesNotMatch(professor, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})

test('Tutor redireciona para a aba correta após gerar prova ou palestra', () => {
    assert.match(tutor, /nav\('professor', \{ tab: 'provasIa' \}\)/)
    assert.match(tutor, /nav\('professor', \{ tab: 'palestras' \}\)/)
    assert.match(state, /profTabAtiva/)
    assert.match(state, /export function nav\(view, opcoes/)
    assert.match(main, /navComRota\(view, opcoes/)
})

test('/aluno/dashboard está registrado no SPA, na sidebar e no rewrite', () => {
    assert.match(main, /registerView\(['"]aluno-dashboard['"]/)
    assert.match(main, /\/aluno\/dashboard/)
    assert.match(main, /iniciarAlunoDashboard/)
    assert.match(app, /aluno-dashboard/)
    assert.ok(vercel.rewrites.some(r => r.source === '/aluno/dashboard' && r.destination === '/login'))
})

test('cliente expõe helpers de palestra sem segredo', () => {
    for (const nome of [
        'sbCriarPalestraManual',
        'sbCriarPalestraIA',
        'sbAprovarPalestra',
        'sbDistribuirPalestra',
        'sbListarPalestrasProfessor',
        'sbListarPalestrasAluno'
    ]) {
        assert.match(cliente, new RegExp(`export async function ${nome}\\(`), nome)
    }
    assert.doesNotMatch(cliente, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})

test('novas views não usam prompt()/confirm() interpolados', () => {
    for (const arquivo of [
        '../js/palestras-core.js',
        '../js/dashboard-aluno-core.js',
        '../js/views/palestras-professor.js',
        '../js/views/aluno-dashboard.js'
    ]) {
        const fonte = ler(arquivo)
        assert.doesNotMatch(fonte, /\b(?:prompt|confirm)\s*\(/i, arquivo)
        assert.doesNotMatch(fonte, /onclick\s*=\s*["'][^"']*\$\{/, arquivo)
    }
})

test('redirect do Tutor destaca a aba e não interrompe o carregamento da fila', () => {
    assert.match(professor, /const alvo = btn \|\| Array\.from\(\$\$\('\.tab-b'\)\)\.find/)
    assert.match(professor, /\(b\.getAttribute\('onclick'\) \|\| ''\)\.includes\(`'\$\{tabId\}'`\)/)
})

test('notificações decodificam um nível de escape antes de renderizar', () => {
    const utils = ler('../js/utils.js')
    assert.match(utils, /export function desanitizar\(str\)/)
    assert.ok(utils.includes('&(?:amp|lt|gt|quot|#039);'))
    assert.match(app, /import \{[^}]*desanitizar[^}]*\} from '\.\/utils\.js'/)
    assert.match(app, /sanitizar\(desanitizar\(n\.mensagem\)\)/)
    assert.match(app, /sanitizar\(desanitizar\(n\.titulo\)\)/)
})

test('modais reaproveitados não acumulam handlers de aberturas anteriores', () => {
    for (const [nome, fonte] of Object.entries({
        palestras: palestrasProfessor,
        distribuicao,
        pendentes,
        'prova do aluno': provaAluno,
        resultados: resultadosIA
    })) {
        assert.doesNotMatch(fonte, /modal\.addEventListener\('(?:click|submit)'/, nome)
    }

    assert.match(distribuicao, /modal\.onsubmit = async \(evento\) =>/)
    assert.match(palestrasProfessor, /modal\.onsubmit = async \(evento\) =>/)
    assert.match(pendentes, /modal\.onclick = async \(evento\) =>/)
    assert.match(resultadosIA, /modal\.onclick = async \(evento\) =>/)
    assert.match(provaAluno, /modal\.onclick = \(evento\) =>/)
})
