// ============================================================
// FASE 5.3 — NOTIFICAÇÕES ALUNO → PROFESSOR E GATE HITL DA NOTA
// ============================================================
// TDD: conclusão de videoaula, finalização de prova I.A. e envio de PDF
// avisam professores/admins da empresa sem duplicar; a nota da I.A. fica
// oculta até revisão/liberação do professor; a liberação publica no boletim,
// notifica o aluno e alimenta a tela "Progresso dos Alunos".
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

const MIGRACOES = [
    '../supabase/migrations/20261125000000_fase5_fundacao.sql',
    '../supabase/migrations/20261125010000_fase5_estrutura_prova.sql',
    '../supabase/migrations/20261125020000_fase5_geracao_prova.sql',
    '../supabase/migrations/20261125030000_fase5_aprovacao_prova.sql',
    '../supabase/migrations/20261125040000_fase5_distribuicao_prova.sql',
    '../supabase/migrations/20261125050000_fase5_realizacao_prova.sql',
    '../supabase/migrations/20261125070000_fase5_painel_professor.sql',
    '../supabase/migrations/20261125110000_fase5_3_gate_hitl.sql',
    '../supabase/migrations/20261125110100_fase5_3_gate_hitl_backfill.sql'
].map(ler)

const appJS = ler('../js/app.js')
const mainJS = ler('../js/main.js')
const professorJS = ler('../js/views/professor.js')
const resultadoJS = ler('../js/views/provas-resultados-ia.js')
const provaAlunoJS = ler('../js/views/prova-aluno-ia.js')
const clienteJS = ler('../js/supabase-client.js')
const progressoCore = ler('../js/progresso-alunos-core.js')
const progressoView = ler('../js/views/progresso-alunos.js')
const apiSubmeter = ler('../api/aluno/provas/[id]/submeter.mjs')
// A Fase 5.2 já foi aplicada em produção: esta migration não entra no banco
// do teste, mas precisa continuar no repositório como prova do fluxo antigo.
const fase52SQL = ler('../supabase/migrations/20261125100000_fase5_2_palestras.sql')

const uuid = (sufixo) => `00000000-0000-4000-9000-${sufixo.padStart(12, '0')}`
const ADMIN = uuid('1')
const PROF_A = uuid('2')
const PROF_B = uuid('3')
const ALUNO_A1 = uuid('4')
const ALUNO_A2 = uuid('5')
const ALUNO_B1 = uuid('6')
const EMPRESA_A = uuid('a')
const EMPRESA_B = uuid('b')
const TURMA_A = uuid('c')
const TURMA_B = uuid('d')
const JOB_A = uuid('e')
const CONTEUDO_A = uuid('f')
const PROVA_A = uuid('10')
const Q1 = uuid('11')
const AULA_A = uuid('12')
const PDF_A = uuid('13')

async function criarBanco() {
    const db = new PGlite()

    await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role;

        create schema auth;
        create table auth.sessao (uid uuid, empresa_id uuid, papel text not null default 'anon');
        insert into auth.sessao (uid, empresa_id, papel) values (null, null, 'anon');
        create table auth.users (
            id uuid primary key,
            raw_app_meta_data jsonb not null default '{}'::jsonb,
            last_sign_in_at timestamptz
        );
        insert into auth.users (id, raw_app_meta_data, last_sign_in_at) values
            ('${PROF_A}', jsonb_build_object('empresa_id', '${EMPRESA_A}'), now()),
            ('${PROF_B}', jsonb_build_object('empresa_id', '${EMPRESA_B}'), now()),
            ('${ADMIN}', jsonb_build_object('empresa_id', '${EMPRESA_A}'), now()),
            ('${ALUNO_A1}', jsonb_build_object('empresa_id', '${EMPRESA_A}'), now()),
            ('${ALUNO_A2}', jsonb_build_object('empresa_id', '${EMPRESA_A}'), now()),
            ('${ALUNO_B1}', jsonb_build_object('empresa_id', '${EMPRESA_B}'), now());

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
            id uuid primary key, role text, status text, nome_completo text,
            email text, criado_em timestamptz default now()
        );
        insert into public.profiles (id, role, status, nome_completo, email) values
            ('${ADMIN}', 'admin', 'ativo', 'Admin A', 'admin@empresa-a.test'),
            ('${PROF_A}', 'professor', 'ativo', 'Professor A', 'prof-a@empresa-a.test'),
            ('${PROF_B}', 'professor', 'ativo', 'Professor B', 'prof-b@empresa-b.test'),
            ('${ALUNO_A1}', 'aluno', 'ativo', 'Aluno A1', 'a1@empresa-a.test'),
            ('${ALUNO_A2}', 'aluno', 'ativo', 'Aluno A2', 'a2@empresa-a.test'),
            ('${ALUNO_B1}', 'aluno', 'ativo', 'Aluno B1', 'b1@empresa-b.test');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                            where p.id = auth.uid() and p.status = 'ativo')
        $$;
        create function public.sulsafe_empresa_id() returns uuid
        language sql stable security definer set search_path = '' as $$
            select nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid
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
        grant execute on function public.sulsafe_conta_ativa() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_empresa_id() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_admin() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_professor() to authenticated, anon, service_role;

        create table public.turmas (
            id uuid primary key, nome text not null, empresa_id uuid,
            criado_por uuid not null references public.profiles(id)
        );
        create table public.turma_alunos (
            turma_id uuid not null references public.turmas(id) on delete cascade,
            aluno_id uuid not null references public.profiles(id) on delete cascade,
            primary key (turma_id, aluno_id)
        );
        insert into public.turmas (id, nome, empresa_id, criado_por) values
            ('${TURMA_A}', 'Turma A', '${EMPRESA_A}', '${PROF_A}'),
            ('${TURMA_B}', 'Turma B', '${EMPRESA_B}', '${PROF_B}');
        insert into public.turma_alunos (turma_id, aluno_id) values
            ('${TURMA_A}', '${ALUNO_A1}'), ('${TURMA_A}', '${ALUNO_A2}'),
            ('${TURMA_B}', '${ALUNO_B1}');

        create function public.sulsafe_gerencia_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.turmas t
                            where t.id = p_turma_id and t.criado_por = auth.uid())
        $$;
        create function public.sulsafe_acessa_turma(p_turma_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select public.sulsafe_is_professor()
               and (public.sulsafe_is_admin() or public.sulsafe_gerencia_turma(p_turma_id))
        $$;
        create function public.sulsafe_acessa_aluno(p_aluno_id uuid) returns boolean
        language sql stable security definer set search_path = '' as $$
            select public.sulsafe_is_admin() or exists (
                select 1 from public.turma_alunos ta
                  join public.turmas t on t.id = ta.turma_id
                 where ta.aluno_id = p_aluno_id and t.criado_por = auth.uid()
            )
        $$;
        grant execute on function public.sulsafe_gerencia_turma(uuid) to authenticated, anon, service_role;
        grant execute on function public.sulsafe_acessa_turma(uuid) to authenticated, anon, service_role;
        grant execute on function public.sulsafe_acessa_aluno(uuid) to authenticated, anon, service_role;

        create table public.notificacoes (
            id uuid primary key default gen_random_uuid(),
            usuario_id uuid references public.profiles(id), titulo text not null,
            mensagem text not null, link text, lida boolean default false,
            criado_em timestamptz default now()
        );
        create table public.notas (
            id uuid primary key default gen_random_uuid(),
            usuario_id uuid references public.profiles(id), nr_id integer not null,
            nota numeric(5,2), obs text, professor_id uuid,
            criado_em timestamptz default now()
        );
        create table public.videoaulas (
            id uuid primary key, titulo text not null, nr_id integer
        );
        insert into public.videoaulas (id, titulo, nr_id) values
            ('${AULA_A}', 'NR 35 — Trabalho em Altura', 35);
        create table public.progresso_aulas (
            id uuid primary key default gen_random_uuid(),
            user_id uuid references public.profiles(id), aula_id uuid references public.videoaulas(id),
            assistiu_segundos integer default 0, "concluído" boolean default false,
            ultima_atualizacao timestamptz default now()
        );
        create table public.provas (
            id uuid primary key default gen_random_uuid(),
            usuario_id uuid references public.profiles(id), nr_id integer not null,
            titulo text, arquivo_url text, status text default 'pendente',
            nota numeric(5,2), corrigido_em timestamptz, criado_em timestamptz default now()
        );
        create view public.view_ranking_alunos as
            select p.id, p.nome_completo, p.email,
                   count(pr.id) as aulas_concluidas,
                   coalesce((count(case when pr."concluído" then 1 else null end)::numeric * 100.0)
                            / nullif((select count(*) from public.videoaulas), 0)::numeric, 0) as progresso
              from public.profiles p
              left join public.progresso_aulas pr on pr.user_id = p.id
             where p.role = 'aluno'
             group by p.id, p.nome_completo, p.email;

        create table public.ia_jobs (
            id uuid primary key, empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null, titulo text not null, prompt text not null,
            provedor text, status text not null default 'PENDENTE',
            tentativas integer not null default 0, erro_mensagem text,
            resultado jsonb, criado_em timestamptz not null default now(),
            atualizado_em timestamptz not null default now()
        );
        create table public.ia_conteudos (
            id uuid primary key default gen_random_uuid(),
            job_id uuid not null references public.ia_jobs(id),
            empresa_id uuid, criado_por uuid not null references public.profiles(id),
            tipo text not null, titulo text not null,
            conteudo jsonb not null default '{}'::jsonb,
            aprovado boolean not null default false,
            aprovado_por uuid references public.profiles(id), aprovado_em timestamptz,
            rejeitado boolean not null default false, rejeitado_por uuid,
            rejeitado_em timestamptz, observacao text,
            publicado boolean not null default false,
            publicado_por uuid, publicado_em timestamptz,
            criado_em timestamptz not null default now(),
            atualizado_em timestamptz not null default now()
        );
        create function public.sulsafe_ia_conteudo_herda_empresa() returns trigger
        language plpgsql set search_path = '' as $$
        begin
            select j.empresa_id into new.empresa_id from public.ia_jobs j where j.id = new.job_id;
            return new;
        end;
        $$;
        create trigger trg_ia_conteudos_empresa
            before insert or update of job_id on public.ia_conteudos
            for each row execute function public.sulsafe_ia_conteudo_herda_empresa();

        create table public.provas_direcionadas (
            id uuid primary key default gen_random_uuid(),
            titulo text not null, descricao text, nr_id integer,
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
        create table public.provas_revisao_auditoria (
            id uuid primary key default gen_random_uuid(),
            prova_id uuid not null references public.provas_direcionadas(id) on delete cascade,
            conteudo_id uuid, acao text not null, motivo text,
            actor_id uuid references public.profiles(id) on delete set null,
            criado_em timestamptz not null default now()
        );
        create table public.notificacoes_eventos_teste (chave text);

        grant select on public.ia_jobs, public.ia_conteudos, public.turmas,
            public.turma_alunos, public.profiles, public.videoaulas,
            public.view_ranking_alunos to authenticated;
        grant select, insert, update on public.progresso_aulas, public.provas,
            public.notificacoes, public.notas to authenticated;
    `)

    for (const sql of MIGRACOES) await db.exec(sql || '-- migration ainda não criada')

    await db.exec(`
        grant select, insert, update on public.provas_progresso to authenticated;
        grant execute on function public.sulsafe_submeter_prova_aluno_ia(uuid, jsonb) to authenticated;
    `)

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt, status)
        values ($1, $2, $3, 'PROVA', 'Prova A', 'Pedido', 'CONCLUIDO')
    `, [uuid('e'), EMPRESA_A, PROF_A])
    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, criado_por, tipo, titulo, conteudo, aprovado, aprovado_por, aprovado_em, publicado, publicado_por, publicado_em)
        values ($1, $2, $3, 'PROVA', 'Avaliação A', '{}'::jsonb, true, $3, now(), true, $3, now())
    `, [CONTEUDO_A, uuid('e'), PROF_A])
    await db.query(`
        insert into public.provas_direcionadas
            (id, titulo, nr_id, turma_id, publicado, origem, ia_conteudo_id, criado_por)
        values ($1, 'Avaliação A', 35, $2, true, 'IA_TUTOR', $3, $4)
    `, [PROVA_A, TURMA_A, CONTEUDO_A, PROF_A])
    await db.query(`
        insert into public.provas_questoes (id, prova_id, ordem, enunciado, alternativas, gabarito, peso, tipo)
        values ($1, $2, 1, 'Questão 1',
            '[{"chave":"A","texto":"A"},{"chave":"B","texto":"B"}]'::jsonb,
            '{"resposta_correta":"A","justificativa":"J"}'::jsonb, 10, 'OBJETIVA')
    `, [Q1, PROVA_A])
    await db.query(`
        insert into public.provas_distribuicoes
            (prova_id, aluno_id, destino_tipo, destino_id, distribuido_por, distribuido_em)
        values ($1, $2, 'TURMA', $3, $4, now()), ($1, $5, 'TURMA', $3, $4, now())
    `, [PROVA_A, ALUNO_A1, TURMA_A, PROF_A, ALUNO_A2])

    return db
}

async function sessao(db, usuario, empresa, papelBanco = 'authenticated') {
    await db.exec('reset role')
    await db.query('update auth.sessao set uid = $1, empresa_id = $2, papel = $3', [usuario, empresa, 'aluno'])
    await db.exec(`set role ${papelBanco}`)
}

async function comBanco(t, fn) {
    const db = await criarBanco()
    t.after(async () => {
        await db.exec('reset role')
        await db.close()
    })
    return fn(db)
}

async function notificacoes(db, usuarioId) {
    await db.exec('reset role')
    const r = await db.query(
        `select titulo, mensagem, link from public.notificacoes
          where usuario_id = $1 order by criado_em, id`,
        [usuarioId]
    )
    return r.rows
}

test('conclusão de videoaula notifica professores/admins da empresa com link do progresso', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A1, EMPRESA_A)
        await db.query(`insert into public.progresso_aulas (user_id, aula_id, "concluído")
                        values ($1, $2, true)`, [ALUNO_A1, AULA_A])

        for (const destino of [PROF_A, ADMIN]) {
            const notifs = await notificacoes(db, destino)
            assert.equal(notifs.length, 1)
            assert.match(notifs[0].titulo, /videoaula/i)
            assert.match(notifs[0].mensagem, /NR 35/)
            assert.equal(notifs[0].link, 'progresso-alunos')
        }
        assert.equal((await notificacoes(db, PROF_B)).length, 0)
    })
})

test('reprocessar a mesma conclusão não duplica a notificação', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A1, EMPRESA_A)
        await db.query(`insert into public.progresso_aulas (user_id, aula_id, "concluído")
                        values ($1, $2, false)`, [ALUNO_A1, AULA_A])
        await db.query(`update public.progresso_aulas set "concluído" = true
                         where user_id = $1 and aula_id = $2`, [ALUNO_A1, AULA_A])
        await db.query(`update public.progresso_aulas set assistiu_segundos = 90
                         where user_id = $1 and aula_id = $2`, [ALUNO_A1, AULA_A])
        await db.query(`update public.progresso_aulas set "concluído" = true
                         where user_id = $1 and aula_id = $2`, [ALUNO_A1, AULA_A])

        assert.equal((await notificacoes(db, PROF_A)).length, 1)
    })
})

test('finalizar prova I.A. notifica o professor com link direto e não devolve a nota ao aluno', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A1, EMPRESA_A)
        const r = await db.query(
            `select public.sulsafe_submeter_prova_aluno_ia($1, $2::jsonb) as resultado`,
            [PROVA_A, JSON.stringify([{ questao_id: Q1, alternativa: 'A' }])]
        )
        const resultado = r.rows[0].resultado
        assert.equal(resultado.status, 'CONCLUIDA')
        assert.equal(resultado.nota, null)

        const notifs = await notificacoes(db, PROF_A)
        assert.equal(notifs.length, 1)
        assert.match(notifs[0].titulo, /prova/i)
        assert.equal(notifs[0].link, `provas-resultados-ia|${PROVA_A}`)

        // Reenvio/duplicate submit não gera segunda notificação.
        await db.query(
            `select public.sulsafe_submeter_prova_aluno_ia($1, $2::jsonb)`,
            [PROVA_A, JSON.stringify([{ questao_id: Q1, alternativa: 'A' }])]
        )
        assert.equal((await notificacoes(db, PROF_A)).length, 1)
    })
})

test('envio de PDF para correção notifica o professor com link da fila, sem duplicar', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A1, EMPRESA_A)
        await db.query(`insert into public.provas (id, usuario_id, nr_id, titulo, arquivo_url, status)
                        values ($1, $2, 35, 'Prova PDF NR35', 'https://storage.test/prova.pdf', 'pendente')`,
                       [PDF_A, ALUNO_A1])

        const notifs = await notificacoes(db, PROF_A)
        assert.equal(notifs.length, 1)
        assert.match(notifs[0].titulo, /pdf|prova/i)
        assert.equal(notifs[0].link, 'provas-pendentes-ia')

        // Chamada explícita com a mesma chave lógica não deve duplicar.
        await db.exec('reset role')
        await db.query(`
            select public.sulsafe_notificar_evento(
                $1, 'pdf_enviado:${ALUNO_A1}:${PDF_A}:${PROF_A}', $2, 'Prova enviada', 'PDF recebido', 'provas-pendentes-ia'
            )
        `, [EMPRESA_A, PROF_A])
        assert.equal((await notificacoes(db, PROF_A)).length, 1)
    })
})

test('nota da prova I.A. permanece oculta para o aluno até a liberação', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A1, EMPRESA_A)
        await db.query(
            `select public.sulsafe_submeter_prova_aluno_ia($1, $2::jsonb)`,
            [PROVA_A, JSON.stringify([{ questao_id: Q1, alternativa: 'A' }])]
        )
        await db.exec('reset role')
        const antes = await db.query(
            `select public.sulsafe_nota_aluno_ia($1) as nota`, [PROVA_A]
        )
        assert.equal(antes.rows[0].nota, null)
    })
})

test('professor ajusta e libera a nota: boletim publicado e aluno notificado uma única vez', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A1, EMPRESA_A)
        await db.query(
            `select public.sulsafe_submeter_prova_aluno_ia($1, $2::jsonb)`,
            [PROVA_A, JSON.stringify([{ questao_id: Q1, alternativa: 'A' }])]
        )

        await sessao(db, PROF_A, EMPRESA_A)
        const lib = await db.query(
            `select public.sulsafe_revisar_liberar_nota_ia($1, $2, $3) as liberada`,
            [PROVA_A, ALUNO_A1, 8.5]
        )
        assert.equal(lib.rows[0].liberada, true)

        await db.exec('reset role')
        const progresso = await db.query(
            `select nota, liberado from public.provas_progresso
              where prova_id = $1 and aluno_id = $2`, [PROVA_A, ALUNO_A1]
        )
        assert.equal(Number(progresso.rows[0].nota), 8.5)
        assert.equal(progresso.rows[0].liberado, true)

        const boletim = await db.query(
            `select nota, obs from public.notas where usuario_id = $1 and nr_id = 35`, [ALUNO_A1]
        )
        assert.equal(boletim.rows.length, 1)
        assert.equal(Number(boletim.rows[0].nota), 8.5)

        const notifs = await notificacoes(db, ALUNO_A1)
        const liberacao = notifs.filter(n => /liberada/i.test(n.titulo))
        assert.equal(liberacao.length, 1)
        assert.match(liberacao[0].mensagem, /Avaliação A/)
        assert.match(liberacao[0].mensagem, /8\.5/)
        assert.equal(liberacao[0].link, 'boletim')

        // Segunda liberação é idempotente: não duplica nota nem notificação.
        await sessao(db, PROF_A, EMPRESA_A)
        await db.query(
            `select public.sulsafe_revisar_liberar_nota_ia($1, $2, $3)`,
            [PROVA_A, ALUNO_A1, 8.5]
        )
        await db.exec('reset role')
        const boletim2 = await db.query(
            `select id from public.notas where usuario_id = $1 and nr_id = 35`, [ALUNO_A1]
        )
        assert.equal(boletim2.rows.length, 1)
        assert.equal((await notificacoes(db, ALUNO_A1)).filter(n => /liberada/i.test(n.titulo)).length, 1)
    })
})

test('liberação e listagem de progresso respeitam a empresa do professor', async t => {
    await comBanco(t, async db => {
        await sessao(db, PROF_B, EMPRESA_B)
        await assert.rejects(
            () => db.query(`select public.sulsafe_revisar_liberar_nota_ia($1, $2, 9)`,
                           [PROVA_A, ALUNO_A1]),
            /permissão|permissao/i
        )
        const daEmpresa = await db.query(
            `select public.sulsafe_listar_progresso_alunos(null, null) as linhas`
        )
        assert.equal(daEmpresa.rows[0].linhas.length, 1)
        assert.equal(daEmpresa.rows[0].linhas[0].aluno_id, ALUNO_B1)
        assert.ok(daEmpresa.rows[0].linhas.every(l => l.empresa_id === EMPRESA_B))
    })
})

test('tela de progresso carrega alunos, status das provas e filtra por turma e aluno', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A1, EMPRESA_A)
        await db.query(
            `select public.sulsafe_submeter_prova_aluno_ia($1, $2::jsonb)`,
            [PROVA_A, JSON.stringify([{ questao_id: Q1, alternativa: 'A' }])]
        )
        await db.query(`insert into public.progresso_aulas (user_id, aula_id, "concluído")
                        values ($1, $2, true)`, [ALUNO_A1, AULA_A])

        await sessao(db, PROF_A, EMPRESA_A)
        const todos = await db.query(
            `select public.sulsafe_listar_progresso_alunos(null, null) as linhas`
        )
        const linhas = todos.rows[0].linhas
        assert.equal(linhas.length, 2)
        assert.ok(linhas.every(l => l.empresa_id === null || l.empresa_id === EMPRESA_A))
        const a1 = linhas.find(l => l.aluno_id === ALUNO_A1)
        assert.equal(a1.aulas_concluidas, 1)
        assert.equal(Number(a1.progresso), 100)
        assert.match(a1.status_provas, /AGUARDANDO REVISÃO/)

        const porTurma = await db.query(
            `select public.sulsafe_listar_progresso_alunos($1, null) as linhas`, [TURMA_A]
        )
        assert.equal(porTurma.rows[0].linhas.length, 2)

        const porAluno = await db.query(
            `select public.sulsafe_listar_progresso_alunos(null, $1) as linhas`, [ALUNO_A2]
        )
        assert.equal(porAluno.rows[0].linhas.length, 1)
        assert.equal(porAluno.rows[0].linhas[0].aluno_id, ALUNO_A2)

        await db.query(
            `select public.sulsafe_revisar_liberar_nota_ia($1, $2, null)`, [PROVA_A, ALUNO_A1]
        )
        const depois = await db.query(
            `select public.sulsafe_listar_progresso_alunos(null, $1) as linhas`, [ALUNO_A1]
        )
        assert.match(depois.rows[0].linhas[0].status_provas, /NOTA LIBERADA/)
    })
})

test('UI mantém fluxos Professor → Aluno e expõe a nova tela e o texto de aguardo', async () => {
    for (const trecho of [
        'Novo Material', 'Material adicionado', 'Nova prova/teste',
        'Nova prova disponível', 'Nova palestra disponível', 'Nota Lançada'
    ]) {
        assert.ok(
            [appJS, professorJS, clienteJS, ler('../js/materiais.js'),
             ler('../js/views/provas.js'), ler('../js/views/palestras-professor.js'),
             ler('../js/views/boletim.js'),
             fase52SQL, MIGRACOES[4], MIGRACOES[7]].some(conteudo => conteudo.includes(trecho)),
            `Fluxo existente removido: ${trecho}`
        )
    }
    assert.match(appJS, /progresso-alunos/)
    assert.match(mainJS, /progresso-alunos/)
    assert.match(professorJS, /progresso-alunos/)
    assert.match(progressoView, /Progresso dos Alunos/)
    assert.match(progressoCore, /AGUARDANDO REVISÃO/)
    assert.match(progressoCore, /NOTA LIBERADA/)
    assert.match(provaAlunoJS, /Prova enviada! Aguarde a revisão do professor para ver sua nota\./)
    assert.doesNotMatch(provaAlunoJS, /Nota parcial:/)
    assert.match(resultadoJS, /Liberar Nota/)
    assert.doesNotMatch(apiSubmeter, /nota:\s*Number\(data\?\.nota/)
    assert.match(ler('../js/supabase-client.js'), /sbLiberarNotaIA/)
})
