// ============================================================
// FASE 5 — ETAPA 4/8: HITL VISUAL DE APROVAÇÃO DE PROVAS
// ============================================================
// TDD: aprovação/publicação, rejeição com motivo, auditoria,
// edição persistida, isolamento por empresa, rotas POST e tela.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import handlerAprovar from '../api/tutor/provas/[id]/aprovar.mjs'
import handlerRejeitar from '../api/tutor/provas/[id]/rejeitar.mjs'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const fundacao = ler('../supabase/migrations/20261125000000_fase5_fundacao.sql')
const estrutura = ler('../supabase/migrations/20261125010000_fase5_estrutura_prova.sql')
const geracao = ler('../supabase/migrations/20261125020000_fase5_geracao_prova.sql')
const aprovacao = ler('../supabase/migrations/20261125030000_fase5_aprovacao_prova.sql')
const ui = ler('../js/views/provas-pendentes-ia.js')
const cliente = ler('../js/supabase-client.js')
const main = ler('../js/main.js')
const app = ler('../js/app.js')
const vercel = JSON.parse(ler('../vercel.json'))

const uuid = (sufixo) => `00000000-0000-4000-8000-${sufixo.padStart(12, '0')}`
const ADMIN = uuid('e1')
const PROF_A = uuid('e2')
const PROF_B = uuid('e3')
const ALUNO_A = uuid('e4')
const EMP_A = uuid('f1')
const EMP_B = uuid('f2')
const JOB_A = uuid('a1')
const JOB_B = uuid('a2')
const CONTEUDO_A = uuid('b1')
const CONTEUDO_B = uuid('b2')
const TURMA_A = uuid('c1')
const PROVA_A = uuid('d1')
const PROVA_B = uuid('d2')
const Q1_A = uuid('111')

const CASTES = {
    p_job_id: 'uuid',
    p_conteudo_id: 'uuid',
    p_prova_id: 'uuid',
    p_questao_id: 'uuid',
    p_id: 'uuid',
    p_tipo: 'text',
    p_status: 'text',
    p_modo: 'text',
    p_titulo: 'text',
    p_enunciado: 'text',
    p_motivo: 'text',
    p_erro_mensagem: 'text',
    p_alternativas: 'jsonb',
    p_gabarito: 'jsonb',
    p_conteudo: 'jsonb',
    p_resultado: 'jsonb'
}

const ASSINATURAS = Object.freeze({
    sulsafe_obter_revisao_prova_ia: ['p_prova_id'],
    sulsafe_aprovar_prova_ia: ['p_prova_id', 'p_motivo'],
    sulsafe_rejeitar_prova_ia: ['p_prova_id', 'p_motivo'],
    sulsafe_editar_questao_prova_ia: ['p_questao_id', 'p_enunciado', 'p_alternativas', 'p_gabarito'],
    sulsafe_listar_provas_pendentes_ia: []
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

        create table public.profiles (id uuid primary key, role text, status text);
        insert into public.profiles (id, role, status) values
            ('${ADMIN}', 'admin', 'ativo'),
            ('${PROF_A}', 'professor', 'ativo'),
            ('${PROF_B}', 'professor', 'ativo'),
            ('${ALUNO_A}', 'aluno', 'ativo');

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
        values ('${TURMA_A}', 'Turma NR-35', '${PROF_A}');

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
    await db.exec(aprovacao)

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
        insert into public.ia_conteudos (id, job_id, criado_por, tipo, titulo, conteudo)
        values
            ($1, $2, $3, 'PROVA', 'Prova NR-35 A', $5::jsonb),
            ($4, $6, $7, 'PROVA', 'Prova NR-35 B', $5::jsonb)
    `, [CONTEUDO_A, JOB_A, PROF_A, CONTEUDO_B, conteudo, JOB_B, PROF_B])

    await db.query(`
        insert into public.provas_direcionadas
            (id, titulo, descricao, nr_id, tipo, publicado, origem, ia_conteudo_id, criado_por)
        values
            ($1, 'Prova NR-35 A', 'Descrição', 35, 'prova', false, 'IA_TUTOR', $3, $5),
            ($2, 'Prova NR-35 B', 'Descrição', 35, 'prova', false, 'IA_TUTOR', $4, $6)
    `, [PROVA_A, PROVA_B, CONTEUDO_A, CONTEUDO_B, PROF_A, PROF_B])

    await db.query(`
        insert into public.provas_questoes
            (id, prova_id, ordem, enunciado, alternativas, gabarito, peso)
        values
            ($1, $2, 1, 'Enunciado original',
             '[{"chave":"A","texto":"Primeira"},{"chave":"B","texto":"Segunda"}]'::jsonb,
             '{"resposta_correta":"A","justificativa":"Justificativa original"}'::jsonb, 1),
            ($3, $4, 1, 'Questão B',
             '[{"chave":"A","texto":"Primeira"},{"chave":"B","texto":"Segunda"}]'::jsonb,
             '{"resposta_correta":"B","justificativa":"Justificativa B"}'::jsonb, 1)
    `, [Q1_A, PROVA_A, uuid('222'), PROVA_B])

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
                if (nome === 'sulsafe_listar_provas_pendentes_ia') {
                    const { rows } = await db.query(`select * from public.${nome}()`)
                    return { data: rows, error: null }
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

test('migration da Etapa 4 é forward-only e protege gabarito/auditoria', () => {
    assert.ok(aprovacao.includes('provas_revisao_auditoria'))
    assert.ok(!/\bdrop table\b|\btruncate\b/i.test(aprovacao))
    for (const nome of [
        'sulsafe_obter_revisao_prova_ia',
        'sulsafe_editar_questao_prova_ia',
        'sulsafe_aprovar_prova_ia',
        'sulsafe_rejeitar_prova_ia'
    ]) {
        assert.match(aprovacao, new RegExp(`create or replace function public\\.${nome}\\(`))
        assert.match(aprovacao, new RegExp(`revoke all on function public\\.${nome}\\([\\s\\S]*?\\) from public, anon`), nome)
        assert.match(aprovacao, new RegExp(`grant execute on function public\\.${nome}\\([\\s\\S]*?\\) to authenticated`), nome)
    }
    assert.match(aprovacao, /security definer[\s\S]*?set search_path = ''/i)
    assert.doesNotMatch(aprovacao, /service_role/i)
})

test('aprovar prova I.A. marca publicado=true e registra quem/quando', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const { data, error } = await cliente.rpc('sulsafe_aprovar_prova_ia', { p_prova_id: PROVA_A })
        assert.equal(error, null)

        await db.exec('reset role')
        const { rows: prova } = await db.query('select publicado from public.provas_direcionadas where id = $1', [PROVA_A])
        assert.equal(prova[0].publicado, true)

        const { rows: conteudo } = await db.query(`
            select aprovado, aprovado_por, aprovado_em, publicado, publicado_por, publicado_em
              from public.ia_conteudos where id = $1
        `, [CONTEUDO_A])
        assert.equal(conteudo[0].aprovado, true)
        assert.equal(conteudo[0].aprovado_por, PROF_A)
        assert.ok(conteudo[0].aprovado_em)
        assert.equal(conteudo[0].publicado, true)
        assert.equal(conteudo[0].publicado_por, PROF_A)
        assert.ok(conteudo[0].publicado_em)

        const { rows: auditoria } = await db.query(`
            select acao, actor_id, criado_em, motivo
              from public.provas_revisao_auditoria where prova_id = $1
        `, [PROVA_A])
        assert.equal(auditoria.length, 1)
        assert.equal(auditoria[0].acao, 'APROVADO')
        assert.equal(auditoria[0].actor_id, PROF_A)
        assert.ok(auditoria[0].criado_em)
        assert.equal(data.publicado, true)
    })
})

test('aprovar não preenche distribuido_por/distribuido_em (Etapa 5)', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        await cliente.rpc('sulsafe_aprovar_prova_ia', { p_prova_id: PROVA_A })

        await db.exec('reset role')
        const { rows } = await db.query(`
            select distribuido_por, distribuido_em from public.provas_direcionadas where id = $1
        `, [PROVA_A])
        assert.equal(rows[0].distribuido_por, null)
        assert.equal(rows[0].distribuido_em, null)
    })
})

test('rejeitar prova I.A. grava motivo, impede publicação e auditoria', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const { error } = await cliente.rpc('sulsafe_rejeitar_prova_ia', {
            p_prova_id: PROVA_A,
            p_motivo: 'Questões fora da NR solicitada'
        })
        assert.equal(error, null)

        await db.exec('reset role')
        const { rows: prova } = await db.query('select publicado from public.provas_direcionadas where id = $1', [PROVA_A])
        assert.equal(prova[0].publicado, false)

        const { rows: conteudo } = await db.query(`
            select rejeitado, rejeitado_por, rejeitado_em, observacao, aprovado
              from public.ia_conteudos where id = $1
        `, [CONTEUDO_A])
        assert.equal(conteudo[0].rejeitado, true)
        assert.equal(conteudo[0].rejeitado_por, PROF_A)
        assert.ok(conteudo[0].rejeitado_em)
        assert.equal(conteudo[0].observacao, 'Questões fora da NR solicitada')
        assert.equal(conteudo[0].aprovado, false)

        const { rows: auditoria } = await db.query(`
            select acao, motivo, actor_id from public.provas_revisao_auditoria where prova_id = $1
        `, [PROVA_A])
        assert.equal(auditoria.length, 1)
        assert.equal(auditoria[0].acao, 'REJEITADO')
        assert.equal(auditoria[0].motivo, 'Questões fora da NR solicitada')
        assert.equal(auditoria[0].actor_id, PROF_A)
    })
})

test('prova rejeitada não pode ser aprovada depois', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        await cliente.rpc('sulsafe_rejeitar_prova_ia', { p_prova_id: PROVA_A, p_motivo: 'Rejeitada' })
        const { error } = await cliente.rpc('sulsafe_aprovar_prova_ia', { p_prova_id: PROVA_A })
        assert.ok(error, 'aprovar prova rejeitada deve falhar')

        await db.exec('reset role')
        const { rows } = await db.query('select publicado from public.provas_direcionadas where id = $1', [PROVA_A])
        assert.equal(rows[0].publicado, false)
        const { rows: eventos } = await db.query('select acao from public.provas_revisao_auditoria where prova_id = $1', [PROVA_A])
        assert.deepEqual(eventos.map(e => e.acao), ['REJEITADO'])
    })
})

test('professor da Empresa A não aprova nem lê prova da Empresa B', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const aprovacaoB = await cliente.rpc('sulsafe_aprovar_prova_ia', { p_prova_id: PROVA_B })
        assert.ok(aprovacaoB.error, 'professor A não pode aprovar prova da empresa B')
        const leituraB = await cliente.rpc('sulsafe_obter_revisao_prova_ia', { p_prova_id: PROVA_B })
        assert.ok(leituraB.error, 'professor A não pode ler gabarito da empresa B')

        await db.exec('reset role')
        const { rows } = await db.query('select publicado from public.provas_direcionadas where id = $1', [PROVA_B])
        assert.equal(rows[0].publicado, false)
        const { rows: eventos } = await db.query('select 1 from public.provas_revisao_auditoria where prova_id = $1', [PROVA_B])
        assert.equal(eventos.length, 0)
    })
})

test('revisão devolve questões e gabarito só para professor/admin da empresa', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const { data, error } = await cliente.rpc('sulsafe_obter_revisao_prova_ia', { p_prova_id: PROVA_A })
        assert.equal(error, null)
        assert.equal(data.prova_id, PROVA_A)
        assert.equal(data.questoes.length, 1)
        assert.equal(data.questoes[0].enunciado, 'Enunciado original')
        assert.equal(data.questoes[0].gabarito.resposta_correta, 'A')
        assert.ok(data.questoes[0].gabarito.justificativa)

        const { data: fila } = await cliente.rpc('sulsafe_listar_provas_pendentes_ia')
        assert.equal(fila.length, 1)
        const textoFila = JSON.stringify(fila).replace(/"conteudo_id":"[^"]+"/g, '')
        assert.doesNotMatch(textoFila, /resposta_correta|justificativa|gabarito|"conteudo"|alternativas/i)

        await sessao(db, ALUNO_A, EMP_A)
        const negado = await cliente.rpc('sulsafe_obter_revisao_prova_ia', { p_prova_id: PROVA_A })
        assert.ok(negado.error, 'aluno não pode ver gabarito')
    })
})

test('edição persiste enunciado, alternativas e gabarito com auditoria', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const alternativas = [
            { chave: 'A', texto: 'Alternativa A revisada' },
            { chave: 'B', texto: 'Alternativa B revisada' }
        ]
        const gabarito = { resposta_correta: 'B', justificativa: 'Justificativa revisada' }
        const { error } = await cliente.rpc('sulsafe_editar_questao_prova_ia', {
            p_questao_id: Q1_A,
            p_enunciado: 'Enunciado revisado pelo professor',
            p_alternativas: alternativas,
            p_gabarito: gabarito
        })
        assert.equal(error, null)

        const { data } = await cliente.rpc('sulsafe_obter_revisao_prova_ia', { p_prova_id: PROVA_A })
        assert.equal(data.questoes[0].enunciado, 'Enunciado revisado pelo professor')
        assert.equal(data.questoes[0].alternativas[0].texto, 'Alternativa A revisada')
        assert.equal(data.questoes[0].gabarito.resposta_correta, 'B')

        await db.exec('reset role')
        const { rows } = await db.query(`
            select acao, questao_id, actor_id from public.provas_revisao_auditoria where prova_id = $1
        `, [PROVA_A])
        assert.equal(rows.length, 1)
        assert.equal(rows[0].acao, 'EDITADO')
        assert.equal(rows[0].questao_id, Q1_A)
        assert.equal(rows[0].actor_id, PROF_A)
    })
})

test('edição rejeita gabarito fora das alternativas', async (t) => {
    await comBanco(t, async (db, cliente) => {
        await sessao(db, PROF_A, EMP_A)
        const { error } = await cliente.rpc('sulsafe_editar_questao_prova_ia', {
            p_questao_id: Q1_A,
            p_enunciado: 'Enunciado válido',
            p_alternativas: [{ chave: 'A', texto: 'A' }, { chave: 'B', texto: 'B' }],
            p_gabarito: { resposta_correta: 'Z', justificativa: 'Fora das alternativas' }
        })
        assert.ok(error, 'gabarito precisa apontar uma alternativa existente')
    })
})

test('rota POST /aprovar exige JWT, usa anon key e não devolve segredo', async (t) => {
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
            json: async () => ({ prova_id: PROVA_A, publicado: true, aprovado_por: PROF_A })
        }
    }

    const req = {
        method: 'POST',
        headers: { authorization: 'Bearer jwt-do-professor' },
        query: { id: PROVA_A },
        body: {}
    }
    const res = await respostaJson()
    await handlerAprovar(req, res)
    assert.equal(res.statusCode, 200)
    assert.match(chamadas[0].url, /\/rest\/v1\/rpc\/sulsafe_aprovar_prova_ia$/)
    assert.equal(chamadas[0].opcoes.headers.authorization, 'Bearer jwt-do-professor')
    assert.equal(chamadas[0].opcoes.headers.apikey, 'anon-publico')
    assert.equal(chamadas[0].opcoes.method, 'POST')
    assert.equal(chamadas[0].opcoes.cache, 'no-store')
    assert.match(res.headers['cache-control'], /no-store/)
    assert.doesNotMatch(res.corpo, /service_role|anon-publico|gabarito|resposta_correta/i)
    assert.match(res.corpo, /"publicado":true/)

    const semToken = await respostaJson()
    await handlerAprovar({ method: 'POST', headers: {}, query: { id: PROVA_A }, body: {} }, semToken)
    assert.equal(semToken.statusCode, 401)

    const get = await respostaJson()
    await handlerAprovar({ method: 'GET', headers: { authorization: 'Bearer x' }, query: { id: PROVA_A } }, get)
    assert.equal(get.statusCode, 405)

    const idInvalido = await respostaJson()
    await handlerAprovar({ method: 'POST', headers: { authorization: 'Bearer x' }, query: { id: 'x' }, body: {} }, idInvalido)
    assert.equal(idInvalido.statusCode, 400)
})

test('rota POST /rejeitar repassa motivo opcional e mantém resposta mínima', async (t) => {
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
        return { ok: true, status: 200, json: async () => ({ rejeitada: true }) }
    }

    const res = await respostaJson()
    await handlerRejeitar({
        method: 'POST',
        headers: { authorization: 'Bearer jwt-do-professor' },
        query: { id: PROVA_B },
        body: JSON.stringify({ motivo: 'Conteúdo inadequado' })
    }, res)

    assert.equal(res.statusCode, 200)
    assert.match(chamadas[0].url, /\/rest\/v1\/rpc\/sulsafe_rejeitar_prova_ia$/)
    const corpo = JSON.parse(chamadas[0].opcoes.body)
    assert.equal(corpo.p_prova_id, PROVA_B)
    assert.equal(corpo.p_motivo, 'Conteúdo inadequado')
    assert.match(res.corpo, /"rejeitada":true/)
    assert.doesNotMatch(res.corpo, /gabarito|anon-publico|service_role/i)
})

test('tela HITL traz cards, modal, edição e ações sem prompt()/confirm()', () => {
    for (const trecho of [
        'Revisar Prova',
        'Aprovar e Publicar',
        'Rejeitar',
        'Editar Questão',
        'NR',
        'Data de Geração',
        'sbObterRevisaoProvaIA',
        'sbEditarQuestaoProvaIA',
        'sbGetRevisaoProvaFilaIA',
        'sbAprovarProvaIA',
        'sbRejeitarProvaIA'
    ]) {
        assert.ok(ui.includes(trecho), `trecho ausente na tela: ${trecho}`)
    }
    assert.match(ui, /dialog/i)
    assert.match(ui, /sanitizar|escapeHTML/i)
    assert.doesNotMatch(ui, /\b(?:prompt|confirm)\s*\(/i)
    assert.doesNotMatch(ui, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})

test('rota /admin/provas-pendentes é registrada no SPA e no rewrite', () => {
    assert.match(main, /registerView\(['"]provas-pendentes-ia['"]/)
    assert.match(main, /\/admin\/provas-pendentes/)
    assert.match(app, /provas-pendentes-ia/)
    assert.ok(vercel.rewrites.some(r => r.source === '/admin/provas-pendentes' && r.destination === '/login.html'))
})

test('cliente usa JWT do chamador nas ações e não expõe gabarito na fila', () => {
    for (const nome of [
        'sbObterRevisaoProvaIA',
        'sbEditarQuestaoProvaIA',
        'sbAprovarProvaIA',
        'sbRejeitarProvaIA'
    ]) {
        assert.match(cliente, new RegExp(`export async function ${nome}\\(`))
    }
    assert.match(cliente, /auth\.getSession\(\)/)
    assert.match(cliente, /Authorization: `Bearer \$\{token\}`/)
    assert.doesNotMatch(cliente, /service_role|SUPABASE_SERVICE_ROLE_KEY/i)
})

test('Etapa 3 permanece intacta: fila sem conteúdo e dispatcher sem PALESTRA', () => {
    const worker = ler('../supabase/functions/tutor-sulsafe/processar-job-fase5.js')
    assert.match(geracao, /sulsafe_listar_provas_pendentes_ia/)
    assert.doesNotMatch(geracao, /prompt_base/i)
    assert.match(worker, /TIPOS_GERACAO_FASE5 = Object\.freeze\(\['PROVA', 'MODULO'\]\)/)
})
