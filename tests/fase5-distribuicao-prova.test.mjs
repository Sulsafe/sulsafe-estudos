// ============================================================
// FASE 5 — ETAPA 5/8: DISTRIBUIÇÃO DIRECIONADA DE PROVAS
// ============================================================
// TDD: turma, aluno, catálogo, interno, aprovação obrigatória,
// isolamento multi-empresa, notificação, auditoria, rota POST e UI.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import handlerDistribuir from '../api/tutor/provas/[id]/distribuir.mjs'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const fundacao = ler('../supabase/migrations/20261125000000_fase5_fundacao.sql')
const estrutura = ler('../supabase/migrations/20261125010000_fase5_estrutura_prova.sql')
const geracao = ler('../supabase/migrations/20261125020000_fase5_geracao_prova.sql')
const aprovacao = ler('../supabase/migrations/20261125030000_fase5_aprovacao_prova.sql')
const distribuicao = ler('../supabase/migrations/20261125040000_fase5_distribuicao_prova.sql')
const ui = ler('../js/views/provas-distribuicao-ia.js')
const uiRevisao = ler('../js/views/provas-pendentes-ia.js')
const cliente = ler('../js/supabase-client.js')
const main = ler('../js/main.js')
const app = ler('../js/app.js')
const vercel = JSON.parse(ler('../vercel.json'))

const uuid = (sufixo) => `00000000-0000-4000-8000-${sufixo.padStart(12, '0')}`
const ADMIN_A = uuid('01')
const PROF_A = uuid('02')
const PROF_B = uuid('03')
const ALUNO_A1 = uuid('04')
const ALUNO_A2 = uuid('05')
const ALUNO_B1 = uuid('06')
const EMP_A = uuid('11')
const EMP_B = uuid('12')
const JOB_A = uuid('21')
const JOB_B = uuid('22')
const CONTEUDO_A = uuid('31')
const CONTEUDO_B = uuid('32')
const TURMA_A = uuid('41')
const TURMA_B = uuid('42')
const PROVA_A = uuid('51')
const PROVA_B = uuid('52')
const PROVA_NAO_APROVADA = uuid('53')
const Q1_A = uuid('61')

const CASTES = {
    p_job_id: 'uuid',
    p_conteudo_id: 'uuid',
    p_prova_id: 'uuid',
    p_destino_id: 'uuid',
    p_destino_tipo: 'text',
    p_motivo: 'text',
    p_enunciado: 'text',
    p_alternativas: 'jsonb',
    p_gabarito: 'jsonb',
    p_conteudo: 'jsonb'
}

const ASSINATURAS = Object.freeze({
    sulsafe_listar_provas_aprovadas_ia: [],
    sulsafe_listar_destinos_distribuicao_ia: [],
    sulsafe_distribuir_prova_ia: ['p_prova_id', 'p_destino_tipo', 'p_destino_id']
})

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;

        create schema auth;
        create table auth.sessao (
            uid uuid,
            empresa_id uuid,
            papel text not null default 'anon'
        );
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

        create table public.profiles (
            id uuid primary key,
            role text,
            status text,
            nome_completo text
        );
        insert into public.profiles (id, role, status, nome_completo) values
            ('${ADMIN_A}', 'admin', 'ativo', 'Admin A'),
            ('${PROF_A}', 'professor', 'ativo', 'Professor A'),
            ('${PROF_B}', 'professor', 'ativo', 'Professor B'),
            ('${ALUNO_A1}', 'aluno', 'ativo', 'Aluno A1'),
            ('${ALUNO_A2}', 'aluno', 'ativo', 'Aluno A2'),
            ('${ALUNO_B1}', 'aluno', 'ativo', 'Aluno B1');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable security definer set search_path = ''
        as $$
            select exists (
                select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'ativo'
            )
        $$;

        create function public.sulsafe_empresa_id() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid $$;

        create function public.sulsafe_is_admin() returns boolean
        language sql stable security definer set search_path = ''
        as $$
            select exists (
                select 1 from public.profiles p
                 where p.id = auth.uid() and p.status = 'ativo'
                   and p.role in ('admin', 'super_admin')
            )
        $$;

        create function public.sulsafe_is_professor() returns boolean
        language sql stable security definer set search_path = ''
        as $$
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
            criado_por uuid not null references public.profiles(id)
        );
        create table public.turma_alunos (
            turma_id uuid not null references public.turmas(id) on delete cascade,
            aluno_id uuid not null references public.profiles(id) on delete cascade,
            primary key (turma_id, aluno_id)
        );
        insert into public.turmas (id, nome, criado_por) values
            ('${TURMA_A}', 'Turma A', '${PROF_A}'),
            ('${TURMA_B}', 'Turma B', '${PROF_B}');
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
            provedor text,
            status text not null default 'PENDENTE',
            tentativas integer not null default 0,
            erro_mensagem text,
            resultado jsonb,
            criado_em timestamptz not null default now(),
            atualizado_em timestamptz not null default now(),
            iniciado_em timestamptz,
            concluido_em timestamptz
        );

        create table public.ia_conteudos (
            id uuid primary key default gen_random_uuid(),
            job_id uuid not null references public.ia_jobs(id),
            empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null,
            titulo text not null,
            conteudo jsonb not null default '{}'::jsonb,
            aprovado boolean not null default false,
            aprovado_por uuid references public.profiles(id),
            aprovado_em timestamptz,
            rejeitado boolean not null default false,
            rejeitado_por uuid,
            rejeitado_em timestamptz,
            observacao text,
            publicado boolean not null default false,
            publicado_por uuid,
            publicado_em timestamptz,
            criado_em timestamptz not null default now(),
            atualizado_em timestamptz not null default now(),
            constraint ia_conteudos_aprovado_publicado check (not publicado or aprovado),
            constraint ia_conteudos_aprovado_rejeitado check (not (aprovado and rejeitado))
        );
        create function public.sulsafe_ia_conteudo_herda_empresa() returns trigger
        language plpgsql set search_path = '' as $$
        begin
            select j.empresa_id into new.empresa_id
              from public.ia_jobs j where j.id = new.job_id;
            return new;
        end;
        $$;
        create trigger trg_ia_conteudos_empresa
            before insert or update of job_id on public.ia_conteudos
            for each row execute function public.sulsafe_ia_conteudo_herda_empresa();

        create table public.provas_direcionadas (
            id uuid primary key default gen_random_uuid(),
            titulo text not null,
            descricao text,
            nr_id integer,
            tipo text not null default 'prova',
            turma_id uuid references public.turmas(id) on delete cascade,
            aluno_id uuid references public.profiles(id) on delete cascade,
            publicado boolean not null default true,
            origem text not null default 'MANUAL' check (origem in ('MANUAL', 'IA_TUTOR')),
            criado_por uuid not null references public.profiles(id),
            criado_em timestamptz not null default now(),
            ia_conteudo_id uuid references public.ia_conteudos(id) on delete set null,
            distribuido_por uuid references public.profiles(id) on delete set null,
            distribuido_em timestamptz,
            constraint provas_direcionadas_um_destino_check
                check (num_nonnulls(turma_id, aluno_id) = 1)
        );

        create function public.sulsafe_atualizar_status_ia_job(
            p_job_id uuid, p_status text, p_erro_mensagem text default null, p_resultado jsonb default null
        ) returns void
        language plpgsql security definer set search_path = '' as $$
        begin
            update public.ia_jobs j
               set status = p_status,
                   erro_mensagem = case when p_status = 'ERRO'
                       then nullif(btrim(coalesce(p_erro_mensagem, '')), '') else null end,
                   resultado = coalesce(p_resultado, j.resultado),
                   concluido_em = case when p_status in ('CONCLUIDO', 'ERRO', 'CANCELADO')
                       then now() else j.concluido_em end
             where j.id = p_job_id;
            if not found then raise exception 'Job não encontrado'; end if;
        end;
        $$;

        grant execute on function public.sulsafe_atualizar_status_ia_job(uuid, text, text, jsonb)
            to authenticated, anon, service_role;
        grant select on public.ia_jobs, public.ia_conteudos, public.turmas,
            public.turma_alunos, public.profiles to authenticated;
    `)

    await db.exec(fundacao)
    await db.exec(estrutura)
    await db.exec(geracao)
    await db.exec(aprovacao)
    await db.exec(distribuicao)

    await db.query('update public.turmas set empresa_id = $1 where id = $2', [EMP_A, TURMA_A])
    await db.query('update public.turmas set empresa_id = $1 where id = $2', [EMP_B, TURMA_B])

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt, status)
        values
            ($1, $2, $3, 'PROVA', 'Prova NR-35 A', 'Pedido A', 'CONCLUIDO'),
            ($4, $5, $6, 'PROVA', 'Prova NR-35 B', 'Pedido B', 'CONCLUIDO')
    `, [JOB_A, EMP_A, PROF_A, JOB_B, EMP_B, PROF_B])

    const conteudo = JSON.stringify({
        origem: 'TUTOR_SULSAFE',
        descricao: 'Prova sobre trabalho em altura',
        nr_id: 35,
        questoes: [{ enunciado: 'Q1' }]
    })
    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, criado_por, tipo, titulo, conteudo, aprovado, aprovado_por, aprovado_em, publicado, publicado_por, publicado_em)
        values
            ($1, $2, $3, 'PROVA', 'Prova NR-35 A', $4::jsonb, true, $3, now(), true, $3, now()),
            ($5, $6, $7, 'PROVA', 'Prova NR-35 B', $4::jsonb, true, $7, now(), true, $7, now())
    `, [CONTEUDO_A, JOB_A, PROF_A, conteudo, CONTEUDO_B, JOB_B, PROF_B])

    await db.query(`
        insert into public.provas_direcionadas
            (id, titulo, descricao, nr_id, tipo, publicado, origem, ia_conteudo_id, criado_por)
        values
            ($1, 'Prova NR-35 A', 'Descrição', 35, 'prova', true, 'IA_TUTOR', $4, $6),
            ($2, 'Prova NR-35 B', 'Descrição', 35, 'prova', true, 'IA_TUTOR', $5, $7),
            ($3, 'Prova sem aprovação', 'Descrição', 35, 'prova', false, 'IA_TUTOR', $4, $6)
    `, [PROVA_A, PROVA_B, PROVA_NAO_APROVADA, CONTEUDO_A, CONTEUDO_B, PROF_A, PROF_B])

    await db.query(`
        insert into public.provas_questoes
            (id, prova_id, ordem, enunciado, alternativas, gabarito, peso)
        values
            ($1, $2, 1, 'Enunciado original',
             '[{"chave":"A","texto":"Primeira"},{"chave":"B","texto":"Segunda"}]'::jsonb,
             '{"resposta_correta":"A","justificativa":"Justificativa"}'::jsonb, 1)
    `, [Q1_A, PROVA_A])

    return db
}

async function sessao(db, usuario, empresa, papelJwt = 'authenticated', papelBanco = 'authenticated') {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2, papel = $3', [usuario, empresa, papelJwt])
    if (papelBanco) await db.exec(`set role ${papelBanco}`)
}

function clienteDb(db) {
    const registro = []
    return {
        registro,
        async rpc(nome, argumentos = {}) {
            registro.push({ nome, argumentos })
            const ordem = ASSINATURAS[nome] || Object.keys(argumentos)
            const entradas = ordem.map(chave => [chave, argumentos[chave] ?? null])
            const parametros = entradas.map(([chave], indice) => `$${indice + 1}::${CASTES[chave] || 'text'}`)
            const valores = entradas.map(([chave, valor]) => {
                if (CASTES[chave] === 'jsonb' && valor !== null && typeof valor !== 'string') {
                    return JSON.stringify(valor)
                }
                return valor
            })
            try {
                if (nome.startsWith('sulsafe_listar_')) {
                    const { rows } = await db.query(`select * from public.${nome}()`)
                    // PostgREST devolve o valor escalar de uma RPC jsonb diretamente,
                    // sem o invólucro de linha usado por funções que retornam tabela.
                    const primeira = rows[0]
                    const escalar = primeira && Object.keys(primeira).length === 1
                        && Object.prototype.hasOwnProperty.call(primeira, nome)
                    return { data: escalar ? primeira[nome] : rows, error: null }
                }
                const sql = `select public.${nome}(${parametros.join(', ')}) as resultado`
                const { rows } = await db.query(sql, valores)
                return { data: rows[0]?.resultado ?? null, error: null }
            } catch (erro) {
                return { data: null, error: { message: erro.message } }
            }
        }
    }
}

async function respostaJson() {
    return {
        statusCode: 200,
        headers: {},
        setHeader(nome, valor) { this.headers[nome.toLowerCase()] = valor },
        end(texto) { this.corpo = texto }
    }
}

async function comBanco(t, fn) {
    const db = await criarBanco()
    t.after(async () => {
        await db.exec('reset role')
        await db.close()
    })
    return fn(db, clienteDb(db))
}

async function estado(db, provaId = PROVA_A) {
    await db.exec('reset role')
    const { rows: prova } = await db.query(`
        select turma_id, aluno_id, destino_tipo, distribuido_por, distribuido_em
          from public.provas_direcionadas where id = $1
    `, [provaId])
    const { rows: entregas } = await db.query(`
        select aluno_id, destino_tipo, destino_id from public.provas_distribuicoes
         where prova_id = $1 order by aluno_id
    `, [provaId])
    const { rows: notificacoes } = await db.query(`
        select usuario_id, titulo, mensagem, link, lida from public.notificacoes order by usuario_id
    `)
    const { rows: auditoria } = await db.query(`
        select acao, motivo, actor_id, criado_em from public.provas_revisao_auditoria
         where prova_id = $1 order by criado_em
    `, [provaId])
    return { prova: prova[0], entregas, notificacoes, auditoria }
}

test('migration da Etapa 5 é forward-only, autorizada e registra distribuição', () => {
    assert.ok(distribuicao.includes('provas_distribuicoes'))
    assert.ok(distribuicao.includes('destino_tipo'))
    assert.ok(!/\bdrop table\b|\btruncate\b/i.test(distribuicao))
    for (const nome of [
        'sulsafe_listar_provas_aprovadas_ia',
        'sulsafe_listar_destinos_distribuicao_ia',
        'sulsafe_distribuir_prova_ia'
    ]) {
        assert.match(distribuicao, new RegExp(`create or replace function public\\.${nome}\\(`))
        assert.match(distribuicao, new RegExp(`revoke all on function public\\.${nome}\\([\\s\\S]*?\\) from public, anon`), nome)
        assert.match(distribuicao, new RegExp(`grant execute on function public\\.${nome}\\([\\s\\S]*?\\) to authenticated`), nome)
    }
    assert.match(distribuicao, /security definer[\s\S]*?set search_path = ''/i)
    assert.match(distribuicao, /'DISTRIBUIDO'/)
    assert.doesNotMatch(distribuicao, /service_role/i)
})

test('distribuir para turma entrega a prova a todos os alunos e notifica', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, ADMIN_A, EMP_A)
        const { data, error } = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'TURMA',
            p_destino_id: TURMA_A
        })
        assert.equal(error, null)
        assert.equal(data.destino_tipo, 'TURMA')
        assert.equal(data.quantidade_alunos, 2)

        const final = await estado(db)
        assert.equal(final.prova.turma_id, TURMA_A)
        assert.equal(final.prova.aluno_id, null)
        assert.equal(final.prova.destino_tipo, 'TURMA')
        assert.equal(final.prova.distribuido_por, ADMIN_A)
        assert.ok(final.prova.distribuido_em)
        assert.deepEqual(final.entregas.map(e => e.aluno_id).sort(), [ALUNO_A1, ALUNO_A2].sort())
        assert.equal(final.notificacoes.length, 2)
        assert.equal(final.notificacoes[0].lida, false)
        assert.equal(final.auditoria.length, 1)
        assert.equal(final.auditoria[0].acao, 'DISTRIBUIDO')
        assert.equal(final.auditoria[0].actor_id, ADMIN_A)
        assert.ok(final.auditoria[0].criado_em)
    })
})

test('distribuir para um aluno específico cria apenas um vínculo e uma notificação', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const { data, error } = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'ALUNO',
            p_destino_id: ALUNO_A2
        })
        assert.equal(error, null)
        assert.equal(data.quantidade_alunos, 1)

        const final = await estado(db)
        assert.equal(final.prova.aluno_id, ALUNO_A2)
        assert.equal(final.prova.turma_id, null)
        assert.equal(final.prova.destino_tipo, 'ALUNO')
        assert.deepEqual(final.entregas.map(e => e.aluno_id), [ALUNO_A2])
        assert.equal(final.notificacoes.length, 1)
        assert.equal(final.notificacoes[0].usuario_id, ALUNO_A2)
    })
})

test('prova não aprovada (publicado=false) não pode ser distribuída', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, ADMIN_A, EMP_A)
        const { error } = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_NAO_APROVADA,
            p_destino_tipo: 'TURMA',
            p_destino_id: TURMA_A
        })
        assert.ok(error, 'distribuição de prova não aprovada deve falhar')

        const final = await estado(db, PROVA_NAO_APROVADA)
        assert.equal(final.prova.distribuido_por, null)
        assert.equal(final.prova.destino_tipo, null)
        assert.equal(final.entregas.length, 0)
        assert.equal(final.notificacoes.length, 0)
        assert.equal(final.auditoria.length, 0)
    })
})

test('admin da Empresa A não distribui prova nem turma da Empresa B', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, ADMIN_A, EMP_A)
        const provaB = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_B,
            p_destino_tipo: 'TURMA',
            p_destino_id: TURMA_A
        })
        assert.ok(provaB.error, 'prova da empresa B não pode ser distribuída por admin A')

        const turmaB = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'TURMA',
            p_destino_id: TURMA_B
        })
        assert.ok(turmaB.error, 'turma da empresa B não pode receber prova da empresa A')

        const alunoB = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'ALUNO',
            p_destino_id: ALUNO_B1
        })
        assert.ok(alunoB.error, 'aluno da empresa B não pode receber prova da empresa A')

        await db.exec('reset role')
        const { rows } = await db.query('select count(*)::int as total from public.notificacoes')
        assert.equal(rows[0].total, 0)
    })
})

test('CATALOGO disponibiliza a prova para todos os alunos da empresa', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const { data, error } = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'CATALOGO'
        })
        assert.equal(error, null)
        assert.equal(data.destino_tipo, 'CATALOGO')
        assert.equal(data.quantidade_alunos, 2)

        const final = await estado(db)
        assert.equal(final.prova.turma_id, null)
        assert.equal(final.prova.aluno_id, null)
        assert.equal(final.prova.destino_tipo, 'CATALOGO')
        assert.deepEqual(final.entregas.map(e => e.aluno_id).sort(), [ALUNO_A1, ALUNO_A2].sort())
        assert.equal(final.notificacoes.length, 2)
    })
})

test('INTERNO mantém a prova no banco sem entregas e permite distribuição depois', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, ADMIN_A, EMP_A)
        const interno = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'INTERNO'
        })
        assert.equal(interno.error, null)
        assert.equal(interno.data.quantidade_alunos, 0)

        let final = await estado(db)
        assert.equal(final.prova.destino_tipo, 'INTERNO')
        assert.equal(final.prova.distribuido_por, null)
        assert.equal(final.prova.distribuido_em, null)
        assert.equal(final.entregas.length, 0)
        assert.equal(final.notificacoes.length, 0)
        assert.equal(final.auditoria[0].acao, 'INTERNO')

        const distribuido = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'ALUNO',
            p_destino_id: ALUNO_A1
        })
        assert.equal(distribuido.error, null)
        final = await estado(db)
        assert.equal(final.prova.destino_tipo, 'ALUNO')
        assert.deepEqual(final.entregas.map(e => e.aluno_id), [ALUNO_A1])
    })
})

test('uma prova já distribuída não pode ser distribuída duas vezes', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const primeira = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'TURMA',
            p_destino_id: TURMA_A
        })
        assert.equal(primeira.error, null)

        const segunda = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'ALUNO',
            p_destino_id: ALUNO_A1
        })
        assert.ok(segunda.error, 'segunda distribuição deve falhar')

        const final = await estado(db)
        assert.equal(final.entregas.length, 2)
        assert.equal(final.notificacoes.length, 2)
        assert.equal(final.auditoria.length, 1)
    })
})

test('aluno não pode distribuir prova e a fila de aprovadas é restrita', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, ALUNO_A1, EMP_A)
        const negado = await cliente.rpc('sulsafe_distribuir_prova_ia', {
            p_prova_id: PROVA_A,
            p_destino_tipo: 'ALUNO',
            p_destino_id: ALUNO_A1
        })
        assert.ok(negado.error, 'aluno não pode distribuir')

        const filaNegada = await cliente.rpc('sulsafe_listar_provas_aprovadas_ia')
        assert.equal(filaNegada.data.length, 0)

        await sessao(db, PROF_A, EMP_A)
        const { data } = await cliente.rpc('sulsafe_listar_provas_aprovadas_ia')
        assert.ok(data.length >= 1)
        assert.equal(data[0].prova_id, PROVA_A)
        assert.doesNotMatch(JSON.stringify(data), /resposta_correta|justificativa|gabarito|alternativas/i)

        const destinos = await cliente.rpc('sulsafe_listar_destinos_distribuicao_ia')
        assert.equal(destinos.error, null)
        const grupo = Array.isArray(destinos.data) ? destinos.data[0] : destinos.data
        assert.equal(grupo.turmas.length, 1)
        assert.equal(grupo.turmas[0].id, TURMA_A)
        assert.equal(grupo.alunos.length, 2)
    })
})

test('rota POST /distribuir exige JWT, usa anon key e responde o mínimo', async (t) => {
    const originalFetch = globalThis.fetch
    const originalUrl = process.env.SUPABASE_URL
    const originalAnon = process.env.SUPABASE_ANON_KEY
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-publico'
    t.after(() => {
        globalThis.fetch = originalFetch
        if (originalUrl === undefined) delete process.env.SUPABASE_URL
        else process.env.SUPABASE_URL = originalUrl
        if (originalAnon === undefined) delete process.env.SUPABASE_ANON_KEY
        else process.env.SUPABASE_ANON_KEY = originalAnon
    })

    const chamadas = []
    globalThis.fetch = async (url, opcoes) => {
        chamadas.push({ url, opcoes })
        return {
            ok: true,
            status: 200,
            json: async () => ({ prova_id: PROVA_A, destino_tipo: 'TURMA', quantidade_alunos: 2 })
        }
    }

    const req = {
        method: 'POST',
        headers: { authorization: 'Bearer jwt-do-admin' },
        query: { id: PROVA_A },
        body: JSON.stringify({ destino_tipo: 'TURMA', destino_id: TURMA_A })
    }
    const res = await respostaJson()
    await handlerDistribuir(req, res)

    assert.equal(res.statusCode, 200)
    assert.match(chamadas[0].url, /\/rest\/v1\/rpc\/sulsafe_distribuir_prova_ia$/)
    assert.equal(chamadas[0].opcoes.headers.authorization, 'Bearer jwt-do-admin')
    assert.equal(chamadas[0].opcoes.headers.apikey, 'anon-publico')
    assert.equal(chamadas[0].opcoes.method, 'POST')
    assert.equal(chamadas[0].opcoes.cache, 'no-store')
    const corpoEnviado = JSON.parse(chamadas[0].opcoes.body)
    assert.equal(corpoEnviado.p_destino_tipo, 'TURMA')
    assert.equal(corpoEnviado.p_destino_id, TURMA_A)
    assert.match(res.headers['cache-control'], /no-store/)
    assert.doesNotMatch(res.corpo, /service_role|anon-publico|gabarito|resposta_correta/i)
    assert.match(res.corpo, /"quantidade_alunos":2/)

    const semToken = await respostaJson()
    await handlerDistribuir({ method: 'POST', headers: {}, query: { id: PROVA_A }, body: {} }, semToken)
    assert.equal(semToken.statusCode, 401)

    const get = await respostaJson()
    await handlerDistribuir({ method: 'GET', headers: { authorization: 'Bearer x' }, query: { id: PROVA_A } }, get)
    assert.equal(get.statusCode, 405)

    const tipoInvalido = await respostaJson()
    await handlerDistribuir({
        method: 'POST',
        headers: { authorization: 'Bearer x' },
        query: { id: PROVA_A },
        body: { destino_tipo: 'SORTED', destino_id: TURMA_A }
    }, tipoInvalido)
    assert.equal(tipoInvalido.statusCode, 400)

    const semDestino = await respostaJson()
    await handlerDistribuir({
        method: 'POST',
        headers: { authorization: 'Bearer x' },
        query: { id: PROVA_A },
        body: { destino_tipo: 'TURMA' }
    }, semDestino)
    assert.equal(semDestino.statusCode, 400)
})

test('tela de distribuição traz modal acessível com quatro destinos e sem prompt/confirm', () => {
    for (const trecho of [
        'Distribuir Prova',
        'TURMA',
        'ALUNO',
        'CATALOGO',
        'INTERNO',
        'Turma',
        'Aluno',
        'Catálogo',
        'Rascunho Interno',
        'sbListarProvasAprovadasIA',
        'sbListarDestinosDistribuicaoIA',
        'sbDistribuirProvaIA'
    ]) {
        assert.ok(ui.includes(trecho), `trecho ausente na tela: ${trecho}`)
    }
    assert.match(ui, /dialog/i)
    assert.match(ui, /aria-modal/i)
    assert.match(ui, /sanitizar|escapeHTML/i)
    assert.doesNotMatch(ui, /\b(?:prompt|confirm)\s*\(/i)
    assert.doesNotMatch(ui, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})

test('rota /admin/provas-distribuicao é registrada no SPA e no rewrite', () => {
    assert.match(main, /registerView\(['"]provas-distribuicao-ia['"]/)
    assert.match(main, /\/admin\/provas-distribuicao/)
    assert.match(app, /provas-distribuicao-ia/)
    assert.ok(vercel.rewrites.some(r => r.source === '/admin/provas-distribuicao' && r.destination === '/login'))
})

test('cliente envia JWT do chamador na distribuição e não expõe segredo', () => {
    for (const nome of [
        'sbListarProvasAprovadasIA',
        'sbListarDestinosDistribuicaoIA',
        'sbDistribuirProvaIA'
    ]) {
        assert.match(cliente, new RegExp(`export async function ${nome}\\(`))
    }
    assert.match(cliente, /\/api\/tutor\/provas\/\$\{encodeURIComponent\(provaId\)\}\/distribuir/)
    assert.match(cliente, /Authorization: `Bearer \$\{token\}`/)
    assert.doesNotMatch(cliente, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})

test('Etapa 4 permanece intacta: revisão, aprovação e edição continuam presentes', () => {
    for (const trecho of ['Revisar Prova', 'Aprovar e Publicar', 'Rejeitar', 'Editar Questão']) {
        assert.ok(uiRevisao.includes(trecho), `trecho ausente na revisão: ${trecho}`)
    }
    assert.match(aprovacao, /sulsafe_aprovar_prova_ia/)
    assert.match(aprovacao, /sulsafe_rejeitar_prova_ia/)
    assert.match(aprovacao, /provas_revisao_auditoria/)
})
