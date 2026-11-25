// ============================================================
// ETAPA 3.1 — PARAMETRIZAÇÃO DA QUANTIDADE DE QUESTÕES
// ============================================================
// TDD: quantity viaja do front → RPC → ia_jobs → prompt do Gemini →
// contrato Zod → provas_questoes. O limite de 50 é imposto no banco,
// no worker e no seletor do Admin.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import {
    QUANTIDADE_QUESTOES_PADRAO,
    QUANTIDADE_QUESTOES_MAX,
    QUANTIDADES_PROVA_PERMITIDAS,
    normalizarQuantidadeQuestoes
} from '../js/tutor-contratos-fase5-core.js'
import { montarPromptBaseFase5 } from '../js/tutor-sulsafe.js'
import {
    montarPromptFase5,
    gerarStubFase5,
    processarJobFase5
} from '../supabase/functions/tutor-sulsafe/processar-job-fase5.js'
import { validarSaidaIA } from '../js/tutor-contratos-fase5.js'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')

const fundacao = ler('../supabase/migrations/20261125000000_fase5_fundacao.sql')
const estrutura = ler('../supabase/migrations/20261125010000_fase5_estrutura_prova.sql')
const geracao = ler('../supabase/migrations/20261125020000_fase5_geracao_prova.sql')
const migracao = ler('../supabase/migrations/20261125060000_etapa3_1_quantidade_questoes.sql')
const edge = ler('../supabase/functions/tutor-sulsafe/index.ts')
const front = ler('../js/views/tutor.js')
const clienteFront = ler('../js/supabase-client.js')

const uuid = sufixo => `00000000-0000-4000-8000-${sufixo.padStart(12, '0')}`
const ADMIN = uuid('a01')
const PROF_A = uuid('a02')
const EMP_A = uuid('b01')
const BASE = 'Pedido do instrutor: crie uma prova sobre NR-35 para trabalhadores em altura.'

// ------------------------------------------------------------
// Banco PGlite com as migrations da Fase 5 + a nova migration.
// ------------------------------------------------------------

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

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${PROF_A}', 'professor', 'ativo');

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

        create function public.sulsafe_gerencia_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.turmas t
                 where t.id = p_turma_id and t.criado_por = auth.uid()
            )
        $$;
        grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, anon, service_role;

        create table public.ia_jobs (
            id uuid primary key default gen_random_uuid(),
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
            p_job_id uuid,
            p_status text,
            p_erro_mensagem text default null,
            p_resultado jsonb default null
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
            if not found then
                raise exception 'Job de I.A. não encontrado';
            end if;
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
    await db.exec(migracao)

    return db
}

async function sessao(db, usuario, empresa, papelJwt = 'authenticated', papelBanco = 'authenticated') {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2, papel = $3', [usuario, empresa, papelJwt])
    if (papelBanco) await db.exec(`set role ${papelBanco}`)
}

const CASTES = {
    p_job_id: 'uuid',
    p_conteudo_id: 'uuid',
    p_id: 'uuid',
    p_tipo: 'text',
    p_status: 'text',
    p_modo: 'text',
    p_titulo: 'text',
    p_erro_mensagem: 'text',
    p_conteudo: 'jsonb',
    p_resultado: 'jsonb'
}

const ASSINATURAS = Object.freeze({
    sulsafe_atualizar_status_ia_job: ['p_job_id', 'p_status', 'p_erro_mensagem', 'p_resultado'],
    sulsafe_salvar_ia_conteudo: ['p_job_id', 'p_tipo', 'p_titulo', 'p_conteudo'],
    sulsafe_materializar_prova_ia: ['p_conteudo_id', 'p_modo']
})

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
            const sql = `select public.${nome}(${parametros.join(', ')}) as resultado`
            try {
                const { rows } = await db.query(sql, valores)
                return { data: rows[0]?.resultado ?? null, error: null }
            } catch (erro) {
                return { data: null, error: { message: erro.message } }
            }
        }
    }
}

function clienteMock() {
    const registro = []
    return {
        registro,
        rpc: async (nome, argumentos) => {
            registro.push({ nome, argumentos })
            return { data: null, error: null }
        }
    }
}

async function criarJob(db, quantidade) {
    const { rows } = await db.query(
        `select public.sulsafe_criar_ia_job(
            $1, $2, $3, $4::uuid, $5::text, $6::integer
         ) as id`,
        ['Prova NR-35', BASE, 'PROVA', null, null, quantidade]
    )
    return rows[0].id
}

function jobDoBanco(id, quantidade) {
    return {
        id,
        tipo: 'PROVA',
        titulo: 'Prova NR-35',
        prompt: BASE,
        status: 'PROCESSANDO',
        criado_por: PROF_A,
        quantidade_questoes: quantidade
    }
}

// ------------------------------------------------------------
// 1. Limite de segurança e contrato
// ------------------------------------------------------------

test('limite de segurança é 50 questões e o padrão continua 10', () => {
    assert.equal(QUANTIDADE_QUESTOES_PADRAO, 10)
    assert.equal(QUANTIDADE_QUESTOES_MAX, 50)
    assert.deepEqual([...QUANTIDADES_PROVA_PERMITIDAS], [5, 10, 20, 30, 50])

    assert.equal(normalizarQuantidadeQuestoes(null), 10)
    assert.equal(normalizarQuantidadeQuestoes('20'), 20)
    assert.equal(normalizarQuantidadeQuestoes(50), 50)
    assert.throws(() => normalizarQuantidadeQuestoes(100), /máximo 50/i)
    assert.throws(() => normalizarQuantidadeQuestoes(0), /pelo menos 1/i)
    assert.throws(() => normalizarQuantidadeQuestoes(true), /número inteiro/i)
})

test('migration persiste a quantidade e bloqueia valores acima de 50', () => {
    assert.match(migracao, /add column if not exists quantidade_questoes integer/i)
    assert.match(migracao, /quantidade_questoes between 1 and 50/i)
    assert.match(migracao, /drop function if exists public\.sulsafe_criar_ia_job/i)
    assert.match(migracao, /p_quantidade_questoes integer default null/i)
    assert.match(migracao, /grant execute on function public\.sulsafe_criar_ia_job\(text, text, text, uuid, text, integer\) to authenticated/i)
    assert.doesNotMatch(migracao, /\bdrop\s+table\b|\btruncate\b|\bdelete\s+from\b/i)
})

test('prompt base e prompt da Edge Function pedem exatamente a quantidade escolhida', () => {
    const base = montarPromptBaseFase5({ assunto: BASE, tipo: 'PROVA' })
    assert.match(base, /Pedido do instrutor:/)
    assert.match(base, /prova/i)
    assert.match(base, /NR-35/)

    const prompt = montarPromptFase5('PROVA', base, { quantidadeQuestoes: 20 })
    assert.match(prompt, /Gere exatamente 20 questões/i)
    assert.match(prompt, /base/i)
})

test('Zod aceita 20 questões e rejeita quantidade diferente da solicitada', () => {
    const dados = gerarStubFase5('PROVA', BASE, { quantidadeQuestoes: 20 })
    assert.equal(dados.questoes.length, 20)

    const ok = validarSaidaIA('PROVA', dados, { quantidadeQuestoes: 20 })
    assert.equal(ok.sucesso, true, JSON.stringify(ok.erros))

    const incompleta = validarSaidaIA('PROVA', { ...dados, questoes: dados.questoes.slice(0, 19) }, { quantidadeQuestoes: 20 })
    assert.equal(incompleta.sucesso, false)
    assert.match(incompleta.erros.join(' '), /exatamente 20/i)

    const acimaDoLimite = validarSaidaIA('PROVA', dados, { quantidadeQuestoes: 100 })
    assert.equal(acimaDoLimite.sucesso, false)
    assert.match(acimaDoLimite.erros.join(' '), /máximo 50/i)
})

// ------------------------------------------------------------
// 2. Front e Edge Function propagam o parâmetro
// ------------------------------------------------------------

test('Admin escolhe a quantidade e o cliente envia p_quantidade_questoes', () => {
    assert.match(front, /value="PROVA"/)
    assert.match(front, /id="tutorQuantidadeQuestoes"/)
    assert.match(front, /tutorAlternarQuantidade/)
    for (const quantidade of [5, 10, 20, 30, 50]) {
        assert.match(front, new RegExp(`>${quantidade} questões<`))
    }
    assert.match(front, /quantidadeQuestoes: tipo === TIPO_TUTOR_PROVA/)
    assert.match(clienteFront, /p_quantidade_questoes/)
})

test('Edge Function lê a coluna do job e repassa a quantidade ao gerador', () => {
    assert.match(edge, /quantidade_questoes/)
    assert.match(edge, /quantidadeQuestoes: job\.quantidade_questoes/)
    assert.match(edge, /gerarStubFase5\(tipoFase5, prompt, opcoes\)/)
})

// ------------------------------------------------------------
// 3. Integração real (PGlite)
// ------------------------------------------------------------

test('prova com 20 questões é gerada e salva com exatamente 20 no banco', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await sessao(db, PROF_A, EMP_A)
    const jobId = await criarJob(db, 20)

    const { rows: jobs } = await db.query(
        'select tipo, quantidade_questoes, prompt from public.ia_jobs where id = $1', [jobId]
    )
    assert.equal(jobs[0].tipo, 'PROVA')
    assert.equal(jobs[0].quantidade_questoes, 20)

    // O worker real marca PROCESSANDO antes de chamar o dispatcher.
    await db.exec('reset role')
    await db.query("update public.ia_jobs set status = 'PROCESSANDO' where id = $1", [jobId])

    await sessao(db, null, null, 'service_role', null)
    const cliente = clienteDb(db)
    const chamadas = []
    const resultado = await processarJobFase5({
        cliente,
        job: jobDoBanco(jobId, 20),
        validarSaidaIA,
        gerador: async (prompt, opcoes) => {
            chamadas.push({ prompt, opcoes })
            return gerarStubFase5('PROVA', prompt, opcoes)
        }
    })

    assert.equal(chamadas.length, 1)
    assert.equal(chamadas[0].opcoes.quantidadeQuestoes, 20)
    assert.match(chamadas[0].prompt, /Gere exatamente 20 questões/i)
    assert.equal(resultado.dados.questoes.length, 20)
    assert.equal(resultado.resposta.jobStatus, 'CONCLUIDO')

    const { rows: questoes } = await db.query(
        'select ordem from public.provas_questoes order by ordem'
    )
    assert.equal(questoes.length, 20)
    assert.deepEqual(questoes.map(q => q.ordem), Array.from({ length: 20 }, (_, i) => i + 1))

    const { rows: conteudos } = await db.query(
        'select conteudo from public.ia_conteudos where job_id = $1', [jobId]
    )
    assert.equal(conteudos[0].conteudo.questoes.length, 20)
    assert.equal(conteudos[0].conteudo.quantidade_questoes, 20)
})

test('100 questões são bloqueadas na RPC e no worker, sem gravar dado', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())

    await sessao(db, PROF_A, EMP_A)
    await assert.rejects(() => criarJob(db, 100), /máximo 50|between 1 and 50/i)

    const { rows: jobs } = await db.query('select count(*)::int as total from public.ia_jobs')
    assert.equal(jobs[0].total, 0)

    const cliente = clienteMock()
    await assert.rejects(
        () => processarJobFase5({
            cliente,
            job: jobDoBanco(uuid('c99'), 100),
            validarSaidaIA,
            gerador: async (prompt, opcoes) => gerarStubFase5('PROVA', prompt, opcoes)
        }),
        /máximo 50/i
    )
    assert.equal(cliente.registro.length, 0, 'nada pode ser gravado antes da validação')
})
