// ============================================================
// FASE 5 — ETAPA 3/8: GERAÇÃO DE PROVAS/MÓDULOS PELO TUTOR
// ============================================================
// TDD: este arquivo é executado antes da implementação. Ele cobre
//   * prompt específico por tipo + reuso do prompt_base lido do banco;
//   * mock do provedor (Gemini) com gravação atômica e status CONCLUIDO;
//   * JSON inválido vira ERRO sem nenhum dado sendo salvo;
//   * HITL: prova nasce publicado = false e aparece na fila de aprovação;
//   * rota GET /api/tutor/provas-pendentes sem expor gabarito nem segredo.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import handlerPendentes from '../api/tutor/provas-pendentes.mjs'
import {
    TIPOS_GERACAO_FASE5,
    montarPromptFase5,
    gerarStubFase5,
    processarJobFase5,
    registrarFalhaJob
} from '../supabase/functions/tutor-sulsafe/processar-job-fase5.js'
import { validarSaidaIA } from '../js/tutor-contratos-fase5.js'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')

const fundacao = ler('../supabase/migrations/20261125000000_fase5_fundacao.sql')
const estrutura = ler('../supabase/migrations/20261125010000_fase5_estrutura_prova.sql')
const geracao = ler('../supabase/migrations/20261125020000_fase5_geracao_prova.sql')
const edge = ler('../supabase/functions/tutor-sulsafe/index.ts')
const rota = ler('../api/tutor/provas-pendentes.mjs')
const adaptador = ler('../js/materializar-prova-fase5.js')

const uuid = sufixo => `00000000-0000-4000-8000-${sufixo.padStart(12, '0')}`

const ADMIN = uuid('a01')
const PROF_A = uuid('a02')
const PROF_B = uuid('a03')
const EMP_A = uuid('b01')
const EMP_B = uuid('b02')
const JOB_PROVA = uuid('c01')
const JOB_MODULO = uuid('c02')
const JOB_INVALIDA = uuid('c03')

const PROMPT_BASE = 'Pedido do instrutor: crie uma prova com 10 questões sobre NR-35 para trabalhadores em altura.'

function jobFase5(id, tipo, titulo) {
    return {
        id,
        tipo,
        titulo,
        prompt: PROMPT_BASE,
        status: 'PROCESSANDO',
        criado_por: PROF_A
    }
}

function mockCliente(registro = []) {
    return {
        rpc: async (nome, argumentos) => {
            registro.push({ nome, argumentos })
            if (nome === 'sulsafe_salvar_ia_conteudo') return { data: uuid('d01'), error: null }
            if (nome === 'sulsafe_materializar_prova_ia') {
                return { data: { prova_id: uuid('d02'), questoes: 10, publicado: false }, error: null }
            }
            return { data: null, error: null }
        },
        registro
    }
}

// ------------------------------------------------------------
// Banco PGlite com as três migrations da Fase 5 já aplicadas.
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
            ('${PROF_A}', 'professor', 'ativo'),
            ('${PROF_B}', 'professor', 'ativo');

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
        insert into public.turmas (id, nome, criado_por)
        values ('${uuid('e01')}', 'Turma NR-35', '${PROF_A}');

        create function public.sulsafe_gerencia_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (
                select 1 from public.turmas t
                 where t.id = p_turma_id and t.criado_por = auth.uid()
            )
        $$;
        grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, anon, service_role;

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

        -- Espelho mínimo da RPC do worker (migration 20261124010000), usada
        -- para marcar CONCLUIDO/ERRO exatamente como a Edge Function faz.
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

    await db.query(`
        -- O worker marca PROCESSANDO antes de chamar processarJobFase5().
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt, status)
        values
            ($1, $2, $3, 'PROVA', 'Prova NR-35', $4, 'PROCESSANDO'),
            ($5, $2, $3, 'MODULO', 'Módulo NR-35', $4, 'PROCESSANDO'),
            ($6, $7, $8, 'PROVA', 'Prova da empresa B', $4, 'PROCESSANDO')
    `, [JOB_PROVA, EMP_A, PROF_A, PROMPT_BASE, JOB_MODULO, JOB_INVALIDA, EMP_B, PROF_B])

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

// O cliente real (supabase-js) envia argumentos nomeados e o Postgres aplica
// os DEFAULTs. No PGlite a chamada é posicional, então o harness precisa
// preencher a assinatura completa para não trocar p_resultado por p_erro_mensagem.
const ASSINATURAS = Object.freeze({
    sulsafe_atualizar_status_ia_job: ['p_job_id', 'p_status', 'p_erro_mensagem', 'p_resultado'],
    sulsafe_salvar_ia_conteudo: ['p_job_id', 'p_tipo', 'p_titulo', 'p_conteudo'],
    sulsafe_materializar_prova_ia: ['p_conteudo_id', 'p_modo']
})

/** Cliente compatível com supabase-js para executar as RPCs no PGlite. */
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

async function respostaJson(corpo, status = 200) {
    return {
        statusCode: status,
        headers: {},
        // Cabeçalhos HTTP são case-insensitive; normalizo para minúsculas.
        setHeader(nome, valor) { this.headers[nome.toLowerCase()] = valor },
        end(texto) { this.corpo = texto }
    }
}

// ------------------------------------------------------------
// 1. Prompt por tipo e reuso do prompt_base lido do banco
// ------------------------------------------------------------

test('prompt_base do banco é reaproveitado com instrução específica por tipo', () => {
    assert.ok(TIPOS_GERACAO_FASE5.includes('PROVA'))
    assert.ok(TIPOS_GERACAO_FASE5.includes('MODULO'))

    const promptProva = montarPromptFase5('PROVA', PROMPT_BASE)
    const promptModulo = montarPromptFase5('MODULO', PROMPT_BASE)
    const promptPalestra = montarPromptFase5('PALESTRA', PROMPT_BASE)

    assert.ok(promptProva.includes(PROMPT_BASE), 'prompt_base do banco deve aparecer no prompt')
    assert.match(promptProva, /10 questões/i)
    assert.match(promptProva, /A-E/)
    assert.match(promptProva, /apenas uma correta/i)
    assert.match(promptProva, /JSON estrito/i)
    assert.match(promptProva, /resposta_correta/)
    assert.match(promptModulo, /objetivos/)
    assert.match(promptModulo, /aulas/)
    assert.match(promptPalestra, /roteiro/)
    assert.notEqual(promptProva, promptModulo)
    assert.notEqual(promptModulo, promptPalestra)
    assert.match(promptProva, /Nome: TUTOR-Sulsafe|Você é o TUTOR-Sulsafe/i)
})

test('stub de cada tipo gera JSON válido segundo o contrato Zod da Etapa 1', () => {
    for (const tipo of TIPOS_GERACAO_FASE5) {
        const dados = gerarStubFase5(tipo, PROMPT_BASE)
        const validacao = validarSaidaIA(tipo, dados)
        assert.equal(validacao.sucesso, true, `${tipo}: ${JSON.stringify(validacao.erros)}`)
    }
    assert.equal(gerarStubFase5('PROVA', PROMPT_BASE).questoes.length, 10)
})

// ------------------------------------------------------------
// 2. Worker com mock do provedor
// ------------------------------------------------------------

test('worker salva rascunho, materializa prova e marca job CONCLUIDO', async () => {
    const cliente = mockCliente()
    const prompPerguntado = []
    const gerador = async (prompt) => {
        prompPerguntado.push(prompt)
        return gerarStubFase5('PROVA', prompt)
    }

    const resultado = await processarJobFase5({
        cliente,
        job: jobFase5(JOB_PROVA, 'PROVA', 'Prova NR-35'),
        validarSaidaIA,
        gerador
    })

    assert.equal(resultado.tipo, 'PROVA')
    assert.equal(resultado.resposta.jobStatus, 'CONCLUIDO')
    assert.equal(resultado.publicado, false)
    assert.equal(prompPerguntado.length, 1)
    assert.match(prompPerguntado[0], /NR-35/)

    const nomes = cliente.registro.map(chamada => chamada.nome)
    assert.deepEqual(nomes, [
        'sulsafe_salvar_ia_conteudo',
        'sulsafe_materializar_prova_ia',
        'sulsafe_atualizar_status_ia_job'
    ])
    const materializacao = cliente.registro[1].argumentos
    assert.equal(materializacao.p_modo, 'RASCUNHO_IA')
    const status = cliente.registro[2].argumentos
    assert.equal(status.p_status, 'CONCLUIDO')
    assert.equal(status.p_job_id, JOB_PROVA)
    assert.doesNotMatch(JSON.stringify(resultado), /api_key|Bearer|sk-/i)
})

test('worker de MODULO salva rascunho validado sem chamar materialização de prova', async () => {
    const cliente = mockCliente()
    const gerador = async (prompt) => gerarStubFase5('MODULO', prompt)

    const resultado = await processarJobFase5({
        cliente,
        job: jobFase5(JOB_MODULO, 'MODULO', 'Módulo NR-35'),
        validarSaidaIA,
        gerador
    })

    assert.equal(resultado.tipo, 'MODULO')
    assert.deepEqual(cliente.registro.map(chamada => chamada.nome), [
        'sulsafe_salvar_ia_conteudo',
        'sulsafe_atualizar_status_ia_job'
    ])
    assert.equal(cliente.registro[0].argumentos.p_tipo, 'MODULO')
})

test('PALESTRA permanece no fluxo legado e não é despachada pela Fase 5', async () => {
    assert.deepEqual([...TIPOS_GERACAO_FASE5], ['PROVA', 'MODULO'])

    const cliente = mockCliente()
    await assert.rejects(
        () => processarJobFase5({
            cliente,
            job: jobFase5(uuid('c10'), 'PALESTRA', 'Palestra NR-35'),
            validarSaidaIA,
            gerador: async (prompt) => gerarStubFase5('PALESTRA', prompt)
        }),
        /não suportado pela Fase 5/i
    )
    assert.equal(cliente.registro.length, 0)
    // O builder ainda conhece PALESTRA para reuso do contrato da Etapa 1.
    assert.match(montarPromptFase5('PALESTRA', PROMPT_BASE), /roteiro/)
})

test('resposta inválida do Gemini vira ERRO e não salva dado sujo', async () => {
    const cliente = mockCliente()
    const invalida = gerarStubFase5('PROVA', PROMPT_BASE)
    invalida.questoes[0].resposta_correta = 'Z'

    await assert.rejects(
        () => processarJobFase5({
            cliente,
            job: jobFase5(JOB_PROVA, 'PROVA', 'Prova NR-35'),
            validarSaidaIA,
            gerador: async () => invalida
        }),
        /Saída inválida da I.A.|gabarito/i
    )

    assert.equal(cliente.registro.length, 0, 'JSON inválido não pode chegar ao banco')
    await registrarFalhaJob(cliente, JOB_PROVA, 'Saída inválida da I.A.')
    assert.deepEqual(cliente.registro.map(chamada => chamada.nome), [
        'sulsafe_atualizar_status_ia_job'
    ])
    assert.equal(cliente.registro[0].argumentos.p_status, 'ERRO')
    assert.match(cliente.registro[0].argumentos.p_erro_mensagem, /Saída inválida/)
})

// ------------------------------------------------------------
// 3. Integração real nas migrations (PGlite)
// ------------------------------------------------------------

test('worker grava no banco: prova em rascunho, questões e job CONCLUIDO', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())
    await sessao(db, null, null, 'service_role', null)

    const cliente = clienteDb(db)
    const gerador = async (prompt) => gerarStubFase5('PROVA', prompt)
    const resultado = await processarJobFase5({
        cliente,
        job: jobFase5(JOB_PROVA, 'PROVA', 'Prova NR-35'),
        validarSaidaIA,
        gerador
    })

    assert.equal(resultado.publicado, false)

    const { rows: jobs } = await db.query(
        'select status, erro_mensagem from public.ia_jobs where id = $1', [JOB_PROVA]
    )
    assert.equal(jobs[0].status, 'CONCLUIDO')
    assert.equal(jobs[0].erro_mensagem, null)

    const { rows: conteudos } = await db.query(`
        select aprovado, rejeitado, publicado, conteudo
          from public.ia_conteudos where job_id = $1
    `, [JOB_PROVA])
    assert.equal(conteudos.length, 1)
    assert.equal(conteudos[0].aprovado, false, 'HITL: ninguém aprovou a prova ainda')
    assert.equal(conteudos[0].publicado, false)

    const { rows: provas } = await db.query(`
        select publicado, origem, ia_conteudo_id, turma_id, aluno_id
          from public.provas_direcionadas
    `)
    assert.equal(provas.length, 1)
    assert.equal(provas[0].publicado, false)
    assert.equal(provas[0].origem, 'IA_TUTOR')
    assert.equal(provas[0].turma_id, null)
    assert.equal(provas[0].aluno_id, null)

    const { rows: questoes } = await db.query(`
        select ordem, gabarito from public.provas_questoes order by ordem
    `)
    assert.equal(questoes.length, 10)
    assert.deepEqual(questoes.map(q => q.ordem), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.equal(questoes[0].gabarito.resposta_correta, 'A')
})

test('falha do provedor marca job ERRO sem prova, questão ou rascunho', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())
    await sessao(db, null, null, 'service_role', null)

    const cliente = clienteDb(db)
    const invalida = gerarStubFase5('PROVA', PROMPT_BASE)
    invalida.questoes[3].alternativas = [{ chave: 'A', texto: 'Única' }]

    try {
        await processarJobFase5({
            cliente,
            job: jobFase5(JOB_INVALIDA, 'PROVA', 'Prova da empresa B'),
            validarSaidaIA,
            gerador: async () => invalida
        })
        assert.fail('a validação deveria ter falhado')
    } catch (erro) {
        await registrarFalhaJob(cliente, JOB_INVALIDA, erro.message)
    }

    const { rows: jobs } = await db.query(
        'select status, erro_mensagem from public.ia_jobs where id = $1', [JOB_INVALIDA]
    )
    assert.equal(jobs[0].status, 'ERRO')
    assert.match(jobs[0].erro_mensagem, /Saída inválida da I.A./)

    for (const tabela of ['ia_conteudos', 'provas_direcionadas', 'provas_questoes']) {
        const { rows } = await db.query(`select count(*)::int as total from public.${tabela}`)
        assert.equal(rows[0].total, 0, `${tabela} não pode conter dado sujo`)
    }
})

// ------------------------------------------------------------
// 4. Fila de aprovação (HITL) e rota HTTP
// ------------------------------------------------------------

test('RPC de pendentes isola empresas e nunca devolve gabarito', async (t) => {
    const db = await criarBanco()
    t.after(() => db.close())
    await sessao(db, null, null, 'service_role', null)

    const cliente = clienteDb(db)
    await processarJobFase5({
        cliente,
        job: jobFase5(JOB_PROVA, 'PROVA', 'Prova NR-35'),
        validarSaidaIA,
        gerador: async (prompt) => gerarStubFase5('PROVA', prompt)
    })

    const { rows: outras } = await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt)
        values ($1, $2, $3, 'PROVA', 'Prova B', $4) returning id
    `, [uuid('c99'), EMP_B, PROF_B, PROMPT_BASE])

    // Segunda prova, da empresa B, direto no banco para testar o isolamento.
    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, empresa_id, criado_por, tipo, titulo, conteudo)
        values ($1, $2, $3, $4, 'PROVA', 'Prova B pendente', $5::jsonb)
    `, [uuid('d99'), outras[0].id, EMP_B, PROF_B, JSON.stringify({
        ...gerarStubFase5('PROVA', PROMPT_BASE),
        origem: 'TUTOR_SULSAFE'
    })])

    async function listar(usuario, empresa) {
        await sessao(db, usuario, empresa)
        const { rows } = await db.query('select * from public.sulsafe_listar_provas_pendentes_ia()')
        return rows
    }

    const visiveisA = await listar(PROF_A, EMP_A)
    assert.equal(visiveisA.length, 1)
    assert.equal(visiveisA[0].titulo, 'Prova NR-35')
    assert.equal(visiveisA[0].publicado, false)
    assert.equal(visiveisA[0].aprovado, false)
    assert.equal(visiveisA[0].quantidade_questoes, 10)
    assert.doesNotMatch(JSON.stringify(visiveisA), /resposta_correta|justificativa|gabarito/i)

    const visiveisB = await listar(PROF_B, EMP_B)
    assert.equal(visiveisB.length, 1)
    assert.equal(visiveisB[0].titulo, 'Prova B pendente')
})

test('rota GET /api/tutor/provas-pendentes repassa o JWT e não vaza segredos', async (t) => {
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
            json: async () => [{
                conteudo_id: uuid('d01'),
                titulo: 'Prova NR-35',
                quantidade_questoes: 10,
                publicado: false
            }]
        }
    }

    const req = { method: 'GET', headers: { authorization: 'Bearer jwt-do-professor' } }
    const res = await respostaJson()
    await handlerPendentes(req, res)

    assert.equal(res.statusCode, 200)
    assert.match(chamadas[0].url, /\/rest\/v1\/rpc\/sulsafe_listar_provas_pendentes_ia/)
    assert.equal(chamadas[0].opcoes.headers.authorization, 'Bearer jwt-do-professor')
    assert.equal(chamadas[0].opcoes.headers.apikey, 'anon-publico')
    assert.doesNotMatch(res.corpo, /resposta_correta|justificativa|gabarito|service_role|anon-publico/i)
    assert.match(res.headers['cache-control'], /no-store/)

    const semToken = await respostaJson()
    await handlerPendentes({ method: 'GET', headers: {} }, semToken)
    assert.equal(semToken.statusCode, 401)

    const post = await respostaJson()
    await handlerPendentes({ method: 'POST', headers: { authorization: 'Bearer x' } }, post)
    assert.equal(post.statusCode, 405)
})

// ------------------------------------------------------------
// 5. Garantias estáticas (regressão do fluxo homologado)
// ------------------------------------------------------------

test('Edge Function despacha por tipo sem alterar o fluxo de videoaulas', () => {
    assert.match(edge, /processarJobFase5/)
    assert.match(edge, /TIPOS_GERACAO_FASE5/)
    assert.match(edge, /npm:zod@4\.6\.7/)
    assert.match(edge, /criarContratosFase5\(z\)/)
    assert.match(edge, /registrarFalhaJob/)
    assert.match(edge, /adaptarSaida\(/)
    assert.match(edge, /gerarStub\(/)
    assert.match(edge, /extrairOutline\(/)
    assert.match(edge, /chamarProvedorComRetentativa\(/)
    assert.match(edge, /TUTOR_SULSAFE_STUB/)
    assert.doesNotMatch(edge, /api_key:\s*['"]sk-/i)
})

test('migration da Etapa 3 é forward-only, aceita novos tipos e protege a fila', () => {
    assert.match(geracao, /create or replace function public\.sulsafe_criar_ia_job/i)
    assert.match(geracao, /'PROVA', 'MODULO'/i)
    assert.match(geracao, /create or replace function public\.sulsafe_salvar_ia_conteudo/i)
    assert.match(geracao, /p_modo text default 'APROVADO'/i)
    assert.match(geracao, /RASCUNHO_IA/i)
    assert.match(geracao, /auth\.jwt\(\) ->> 'role'/i)
    assert.match(geracao, /create or replace function public\.sulsafe_listar_provas_pendentes_ia/i)
    assert.match(geracao, /revoke all on function public\.sulsafe_listar_provas_pendentes_ia/i)
    assert.doesNotMatch(geracao, /\bdrop\s+table\b/i)
    assert.doesNotMatch(geracao, /\btruncate\b/i)
    assert.doesNotMatch(geracao, /\bdelete\s+from\b/i)

    // O gabarito precisa existir no corpo da materialização (gravado na tabela
    // protegida), mas nunca pode sair da RPC de listagem da fila HITL.
    const inicioFila = geracao.indexOf('create or replace function public.sulsafe_listar_provas_pendentes_ia')
    const fimFila = geracao.indexOf('revoke all on function public.sulsafe_listar_provas_pendentes_ia', inicioFila)
    assert.ok(inicioFila >= 0 && fimFila > inicioFila, 'a RPC da fila deve existir')
    const corpoFila = geracao.slice(inicioFila, fimFila)
    assert.doesNotMatch(corpoFila, /resposta_correta|justificativa|gabarito/i)
    assert.doesNotMatch(geracao, /api_key|sk-[a-z0-9]/i)
})

test('rota usa somente a chave anônima e whitelist de campos', () => {
    const rotaCodigo = rota.split('\n').filter(linha => !linha.trim().startsWith('//')).join('\n')
    assert.match(rotaCodigo, /SUPABASE_ANON_KEY/)
    assert.doesNotMatch(rotaCodigo, /SUPABASE_SERVICE_ROLE_KEY|service_role/i)
    assert.match(rota, /conteudo_id|quantidade_questoes/)
    assert.match(adaptador, /p_modo/)
    assert.match(adaptador, /opcoes\.modo/)
})
