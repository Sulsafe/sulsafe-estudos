import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { materializarProvaIA } from '../js/materializar-prova-fase5.js'

const fundacao = fs.readFileSync(
    new URL('../supabase/migrations/20261125000000_fase5_fundacao.sql', import.meta.url),
    'utf8'
)
const estrutura = fs.readFileSync(
    new URL('../supabase/migrations/20261125010000_fase5_estrutura_prova.sql', import.meta.url),
    'utf8'
)

const uuid = (sufixo) => `00000000-0000-4000-8000-${sufixo.padStart(12, '0')}`

const ADMIN = uuid('e1')
const PROF_A = uuid('e2')
const PROF_B = uuid('e3')
const ALUNO_A = uuid('e4')
const ALUNO_B = uuid('e5')
const EMP_A = uuid('f1')
const EMP_B = uuid('f2')
const JOB_A = uuid('a1')
const JOB_B = uuid('a2')
const CONTEUDO_A = uuid('b1')
const CONTEUDO_B = uuid('b2')
const CONTEUDO_INVALIDO = uuid('b3')
const TURMA_A = uuid('c1')
const PROVA_A = uuid('d1')
const PROVA_B = uuid('d2')
const Q1_A = uuid('111')
const Q2_A = uuid('112')
const PROGRESSO_A = uuid('121')
const PROGRESSO_B = uuid('122')

function provaJson(quantidade = 2) {
    return {
        titulo: 'Prova NR-35',
        descricao: 'Avaliação de trabalho em altura.',
        nr_id: 35,
        questoes: Array.from({ length: quantidade }, (_, indice) => ({
            enunciado: `Questão ${indice + 1}`,
            alternativas: [
                { chave: 'A', texto: 'Primeira' },
                { chave: 'B', texto: 'Segunda' },
                { chave: 'C', texto: 'Terceira' }
            ],
            resposta_correta: indice % 2 === 0 ? 'A' : 'B',
            justificativa: 'A NR 35 exige proteção contra quedas.',
            peso: 1
        }))
    }
}

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;

        create schema auth;
        create table auth.sessao (uid uuid, empresa_id uuid);
        insert into auth.sessao (uid, empresa_id) values (null, null);

        create function auth.uid() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select uid from auth.sessao limit 1 $$;

        create function auth.jwt() returns jsonb
        language sql stable security definer set search_path = ''
        as $$
            select jsonb_build_object('app_metadata', jsonb_build_object('empresa_id', empresa_id))
              from auth.sessao limit 1
        $$;

        grant usage on schema auth, public to authenticated, anon, service_role;
        grant execute on function auth.uid() to authenticated, anon, service_role;
        grant execute on function auth.jwt() to authenticated, anon, service_role;

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${PROF_A}', 'professor', 'ativo'),
            ('${PROF_B}', 'professor', 'ativo'),
            ('${ALUNO_A}', 'aluno', 'ativo'),
            ('${ALUNO_B}', 'aluno', 'ativo');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable as $$ select true $$;

        create function public.sulsafe_empresa_id() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid $$;

        create function public.sulsafe_is_admin() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin' and p.status = 'ativo')
        $$;

        create function public.sulsafe_is_professor() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role in ('professor', 'admin') and p.status = 'ativo')
        $$;

        grant execute on function public.sulsafe_conta_ativa() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_empresa_id() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_admin() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_professor() to authenticated, anon, service_role;

        create table public.turmas (
            id uuid primary key,
            nome text not null,
            criado_por uuid not null references public.profiles(id)
        );
        create table public.turma_alunos (
            turma_id uuid not null references public.turmas(id) on delete cascade,
            aluno_id uuid not null references public.profiles(id) on delete cascade,
            primary key (turma_id, aluno_id)
        );
        insert into public.turmas (id, nome, criado_por)
        values ('${TURMA_A}', 'Turma NR-35', '${PROF_A}');
        insert into public.turma_alunos (turma_id, aluno_id)
        values ('${TURMA_A}', '${ALUNO_A}');

        create function public.sulsafe_gerencia_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.turmas t
                where t.id = p_turma_id
                  and (t.criado_por = auth.uid() or public.sulsafe_is_admin()))
        $$;
        grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, anon, service_role;

        create table public.ia_jobs (
            id uuid primary key,
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null,
            titulo text not null,
            prompt text not null
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
            aprovado_por uuid references public.profiles(id),
            rejeitado boolean not null default false,
            publicado boolean not null default false
        );

        create table public.provas_direcionadas (
            id uuid primary key default gen_random_uuid(),
            titulo text not null,
            descricao text,
            nr_id integer,
            tipo text not null default 'prova',
            turma_id uuid references public.turmas(id) on delete cascade,
            aluno_id uuid references public.profiles(id) on delete cascade,
            publicado boolean not null default true,
            origem text not null default 'MANUAL'
                check (origem in ('MANUAL', 'IA_TUTOR')),
            criado_por uuid not null references public.profiles(id),
            criado_em timestamptz not null default now(),
            ia_conteudo_id uuid references public.ia_conteudos(id) on delete set null,
            distribuido_por uuid references public.profiles(id) on delete set null,
            distribuido_em timestamptz,
            constraint provas_direcionadas_um_destino_check
                check (num_nonnulls(turma_id, aluno_id) = 1)
        );

        grant select on public.ia_conteudos, public.turmas, public.turma_alunos, public.profiles
            to authenticated;
    `)

    await db.exec(fundacao)
    await db.exec(estrutura)

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt) values
            ('${JOB_A}', '${EMP_A}', '${PROF_A}', 'PROVA', 'Prova A', 'Pedido A'),
            ('${JOB_B}', '${EMP_B}', '${PROF_B}', 'PROVA', 'Prova B', 'Pedido B')
    `)

    const invalida = provaJson(2)
    invalida.questoes[1].enunciado = ''

    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, empresa_id, criado_por, tipo, titulo, conteudo, aprovado, aprovado_por)
        values
            ($1, $2, $3, $4, 'PROVA', 'Prova aprovada A', $5::jsonb, true, $4),
            ($6, $7, $8, $9, 'PROVA', 'Prova aprovada B', $10::jsonb, true, $9),
            ($11, $2, $3, $4, 'PROVA', 'Prova com questão inválida', $12::jsonb, true, $4)
    `, [
        CONTEUDO_A, JOB_A, EMP_A, PROF_A, JSON.stringify(provaJson(2)),
        CONTEUDO_B, JOB_B, EMP_B, PROF_B, JSON.stringify(provaJson(2)),
        CONTEUDO_INVALIDO, JSON.stringify(invalida)
    ])

    return db
}

async function sessao(db, usuario, empresa, papel = 'authenticated') {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2', [usuario, empresa])
    if (papel) await db.exec(`set role ${papel}`)
}

async function criarProva(db, id, conteudoId, criadoPor, alunoId = null) {
    await db.query(`
        insert into public.provas_direcionadas
            (id, titulo, descricao, nr_id, tipo, turma_id, aluno_id,
             publicado, origem, ia_conteudo_id, criado_por)
        values
            ($1, $4, 'Descrição', 35, 'prova',
             case when $5::uuid is null then '${TURMA_A}'::uuid else null end,
             $5, true, 'IA_TUTOR', $2, $3)
    `, [id, conteudoId, criadoPor, `Prova ${id}`, alunoId])
}

async function criarQuestoes(db, provaId) {
    await db.query(`
        insert into public.provas_questoes (id, prova_id, ordem, enunciado, alternativas, gabarito, peso)
        values
            ($1, $2, 1, 'Questão 1', '[{"chave":"A","texto":"Primeira"},{"chave":"B","texto":"Segunda"}]'::jsonb,
                '{"resposta_correta":"A","justificativa":"Justificativa 1"}'::jsonb, 1),
            ($3, $2, 2, 'Questão 2', '[{"chave":"A","texto":"Primeira"},{"chave":"B","texto":"Segunda"}]'::jsonb,
                '{"resposta_correta":"B","justificativa":"Justificativa 2"}'::jsonb, 2)
    `, [Q1_A, provaId, Q2_A])
}

async function criarProgresso(db, id, provaId, alunoId, status, nota = null) {
    await db.query(`
        insert into public.provas_progresso (id, prova_id, aluno_id, status, nota)
        values ($1, $2, $3, $4::public.prova_progresso_status, $5)
    `, [id, provaId, alunoId, status, nota])
}

test('aluno lê enunciado, mas nunca o gabarito; professor lê via RPC restrita', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarProva(db, PROVA_A, CONTEUDO_A, PROF_A)
    await criarQuestoes(db, PROVA_A)

    await sessao(db, ALUNO_A, EMP_A)
    const { rows } = await db.query(`
        select ordem, enunciado, alternativas, peso
          from public.provas_questoes where prova_id = $1 order by ordem
    `, [PROVA_A])
    assert.equal(rows.length, 2)
    assert.equal(rows[0].enunciado, 'Questão 1')
    assert.equal(rows[0].alternativas[0].chave, 'A')

    await assert.rejects(
        () => db.query('select gabarito from public.provas_questoes'),
        /permission denied/i
    )
    await assert.rejects(
        () => db.query('select * from public.provas_questoes'),
        /permission denied/i
    )
    await assert.rejects(
        () => db.query('select * from public.sulsafe_listar_gabarito_prova($1)', [PROVA_A]),
        /Somente administradores e professores/i
    )

    await sessao(db, PROF_A, EMP_A)
    const gabarito = await db.query(
        'select * from public.sulsafe_listar_gabarito_prova($1)', [PROVA_A]
    )
    assert.equal(gabarito.rows.length, 2)
    assert.equal(gabarito.rows[0].gabarito.resposta_correta, 'A')

    await sessao(db, PROF_B, EMP_B)
    await assert.rejects(
        () => db.query('select * from public.sulsafe_listar_gabarito_prova($1)', [PROVA_A]),
        /outra empresa/i
    )
})

test('RLS isola progresso entre empresas e o aluno vê somente o seu', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarProva(db, PROVA_A, CONTEUDO_A, PROF_A)
    await criarProva(db, PROVA_B, CONTEUDO_B, PROF_B, ALUNO_B)
    await criarProgresso(db, PROGRESSO_A, PROVA_A, ALUNO_A, 'EM_ANDAMENTO')
    await criarProgresso(db, PROGRESSO_B, PROVA_B, ALUNO_B, 'CONCLUIDA', 8.5)

    async function visiveis(usuario, empresa) {
        await sessao(db, usuario, empresa)
        const { rows } = await db.query('select id from public.provas_progresso order by id')
        return rows.map(row => row.id)
    }

    assert.deepEqual(await visiveis(ALUNO_A, EMP_A), [PROGRESSO_A])
    assert.deepEqual(await visiveis(ALUNO_B, EMP_B), [PROGRESSO_B])
    assert.deepEqual(await visiveis(PROF_A, EMP_A), [PROGRESSO_A])
    assert.deepEqual(await visiveis(PROF_B, EMP_B), [PROGRESSO_B])
    assert.deepEqual(await visiveis(ADMIN, EMP_A), [PROGRESSO_A])

    await sessao(db, ALUNO_A, EMP_A)
    await assert.rejects(
        () => db.query(`
            insert into public.provas_progresso (prova_id, aluno_id)
            values ($1, $2)
        `, [PROVA_A, ALUNO_A]),
        /permission denied/i
    )
})

test('status do progresso usa enum e os horários são preenchidos pelo banco', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await criarProva(db, PROVA_A, CONTEUDO_A, PROF_A)

    await assert.rejects(
        () => criarProgresso(db, PROGRESSO_A, PROVA_A, ALUNO_A, 'INVALIDO'),
        /invalid input value for enum|prova_progresso_status/i
    )

    await criarProgresso(db, PROGRESSO_A, PROVA_A, ALUNO_A, 'PENDENTE')
    await db.query(`
        update public.provas_progresso
           set status = 'EM_ANDAMENTO'::public.prova_progresso_status
         where id = $1
    `, [PROGRESSO_A])
    await db.query(`
        update public.provas_progresso
           set status = 'CONCLUIDA'::public.prova_progresso_status, nota = 9
         where id = $1
    `, [PROGRESSO_A])

    const { rows } = await db.query(`
        select status::text, nota, iniciado_em, concluido_em
          from public.provas_progresso where id = $1
    `, [PROGRESSO_A])
    assert.equal(rows[0].status, 'CONCLUIDA')
    assert.equal(Number(rows[0].nota), 9)
    assert.ok(rows[0].iniciado_em)
    assert.ok(rows[0].concluido_em)
})

test('materialização cria rascunho e questões em uma única transação', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    // O materializador é chamado pelo backend (service_role), não pelo browser.
    await sessao(db, PROF_A, EMP_A, null)
    const { rows } = await db.query(
        'select public.sulsafe_materializar_prova_ia($1) as resultado', [CONTEUDO_A]
    )
    const resultado = rows[0].resultado
    assert.equal(resultado.publicado, false)
    assert.equal(resultado.questoes, 2)
    assert.ok(resultado.prova_id, 'a RPC devolve o id da prova criada')

    const prova = await db.query(`
        select titulo, publicado, origem, ia_conteudo_id, turma_id, aluno_id
          from public.provas_direcionadas where id = $1
    `, [resultado.prova_id])
    assert.equal(prova.rows.length, 1)
    assert.equal(prova.rows[0].publicado, false)
    assert.equal(prova.rows[0].origem, 'IA_TUTOR')
    assert.equal(prova.rows[0].ia_conteudo_id, CONTEUDO_A)
    assert.equal(prova.rows[0].turma_id, null)
    assert.equal(prova.rows[0].aluno_id, null)

    const questoes = await db.query(`
        select ordem, enunciado, alternativas, gabarito, peso
          from public.provas_questoes where prova_id = $1 order by ordem
    `, [resultado.prova_id])
    assert.deepEqual(questoes.rows.map(row => row.ordem), [1, 2])
    assert.equal(questoes.rows[0].enunciado, 'Questão 1')
    assert.equal(questoes.rows[0].alternativas.length, 3)
    assert.equal(questoes.rows[0].gabarito.resposta_correta, 'A')
    assert.equal(Number(questoes.rows[1].peso), 1)

    const rascunho = await db.query(
        'select conteudo from public.ia_conteudos where id = $1', [CONTEUDO_A]
    )
    assert.equal(rascunho.rows[0].conteudo.materializado_id, resultado.prova_id)

    await assert.rejects(
        () => db.query('select public.sulsafe_materializar_prova_ia($1)', [CONTEUDO_A]),
        /já foi materializado/i
    )
})

test('falha em qualquer questão desfaz toda a materialização', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await sessao(db, PROF_A, EMP_A, null)
    await assert.rejects(
        () => db.query('select public.sulsafe_materializar_prova_ia($1)', [CONTEUDO_INVALIDO]),
        /Enunciado inválido na questão 2/i
    )

    const provas = await db.query(`
        select id from public.provas_direcionadas where ia_conteudo_id = $1
    `, [CONTEUDO_INVALIDO])
    assert.equal(provas.rows.length, 0, 'a prova não pode ficar órfã após a falha')

    const questoes = await db.query(`
        select count(*)::int as total
          from public.provas_questoes q
          join public.provas_direcionadas p on p.id = q.prova_id
         where p.ia_conteudo_id = $1
    `, [CONTEUDO_INVALIDO])
    assert.equal(questoes.rows[0].total, 0)

    const rascunho = await db.query(
        'select conteudo from public.ia_conteudos where id = $1', [CONTEUDO_INVALIDO]
    )
    assert.equal(rascunho.rows[0].conteudo.materializado_id, undefined)
})

test('materializador valida com Zod antes de chamar a RPC', async (t) => {
    const chamadas = []
    const cliente = {
        rpc: async (nome, argumentos) => {
            chamadas.push({ nome, argumentos })
            return {
                data: { prova_id: PROVA_A, questoes: 2, publicado: false },
                error: null
            }
        }
    }

    const valida = await materializarProvaIA(cliente, CONTEUDO_A, {
        dados: provaJson(2),
        quantidadeQuestoes: 2
    })
    assert.equal(valida.sucesso, true)
    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].nome, 'sulsafe_materializar_prova_ia')
    assert.equal(chamadas[0].argumentos.p_conteudo_id, CONTEUDO_A)

    const invalida = provaJson(2)
    invalida.questoes[0].resposta_correta = 'Z'
    const recusada = await materializarProvaIA(cliente, CONTEUDO_A, {
        dados: invalida,
        quantidadeQuestoes: 2
    })
    assert.equal(recusada.sucesso, false)
    assert.ok(recusada.erros.some(erro => /gabarito/i.test(erro)))
    assert.equal(chamadas.length, 1, 'JSON inválido não pode chegar ao banco')
})

test('migration é forward-only e não concede leitura do gabarito', () => {
    assert.match(estrutura, /enable row level security/i)
    assert.match(estrutura, /create type public\.prova_progresso_status as enum/i)
    assert.doesNotMatch(estrutura, /\bdrop\s+table\b/i)
    assert.doesNotMatch(estrutura, /\btruncate\b/i)
    assert.doesNotMatch(estrutura, /\bdelete\s+from\b/i)
    assert.doesNotMatch(estrutura, /grant\s+select\s*\([^)]*gabarito/i)
    assert.doesNotMatch(estrutura, /(api_key|sk-[a-z0-9])/i)
})
