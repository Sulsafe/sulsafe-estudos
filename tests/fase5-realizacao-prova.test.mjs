// ============================================================
// FASE 5 — ETAPA 6/8: REALIZAÇÃO E CORREÇÃO AUTOMÁTICA
// ============================================================
// TDD: cabeçalho de contexto, leitura sem gabarito, submissão,
// correção por pesos e persistência em provas_progresso.
// ============================================================

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import handlerSubmeter from '../api/aluno/provas/[id]/submeter.mjs'
import { vProvaAlunoIA, renderCabecalhoContextoIA } from '../js/views/prova-aluno-ia.js'

const ler = caminho => fs.readFileSync(new URL(caminho, import.meta.url), 'utf8')
const fundacao = ler('../supabase/migrations/20261125000000_fase5_fundacao.sql')
const estrutura = ler('../supabase/migrations/20261125010000_fase5_estrutura_prova.sql')
const geracao = ler('../supabase/migrations/20261125020000_fase5_geracao_prova.sql')
const aprovacao = ler('../supabase/migrations/20261125030000_fase5_aprovacao_prova.sql')
const distribuicao = ler('../supabase/migrations/20261125040000_fase5_distribuicao_prova.sql')
const realizacao = ler('../supabase/migrations/20261125050000_fase5_realizacao_prova.sql')

const uuid = sufixo => `00000000-0000-4000-8000-${sufixo.padStart(12, '0')}`
const PROF_A = uuid('02')
const ALUNO_A = uuid('04')
const OUTRO_ALUNO = uuid('06')
const EMPRESA_A = uuid('11')
const EMPRESA_B = uuid('12')
const JOB_A = uuid('21')
const JOB_B = uuid('22')
const CONTEUDO_A = uuid('31')
const CONTEUDO_B = uuid('32')
const TURMA_A = uuid('41')
const PROVA_A = uuid('51')
const PROVA_B = uuid('52')
const Q1 = uuid('61')
const Q2 = uuid('62')
const Q3 = uuid('63')

const ASSINATURAS = {
    sulsafe_carregar_prova_aluno_ia: ['p_prova_id'],
    sulsafe_submeter_prova_aluno_ia: ['p_prova_id', 'p_respostas']
}
const CASTES = { p_prova_id: 'uuid', p_respostas: 'jsonb' }

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
                if (nome.startsWith('sulsafe_carregar_')) {
                    const { rows } = await db.query(`select * from public.${nome}(${parametros.join(', ')})`, valores)
                    return { data: rows, error: null }
                }
                const { rows } = await db.query(
                    `select public.${nome}(${parametros.join(', ')}) as resultado`, valores
                )
                return { data: rows[0]?.resultado ?? null, error: null }
            } catch (erro) {
                return { data: null, error: { message: erro.message } }
            }
        }
    }
}

function respostaJson() {
    const res = {
        statusCode: 200,
        headers: {},
        corpo: null,
        texto: '',
        status(code) { res.statusCode = code; return res },
        setHeader(nome, valor) { res.headers[nome] = valor; return res },
        set(nome, valor) { return res.setHeader(nome, valor) },
        json(obj) { res.corpo = obj; res.texto = JSON.stringify(obj); return res },
        end(texto) {
            res.texto = String(texto ?? '')
            try { res.corpo = JSON.parse(res.texto) } catch { res.corpo = null }
            return res
        }
    }
    return res
}

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

        create table public.profiles (
            id uuid primary key, role text, status text, nome_completo text
        );
        insert into public.profiles (id, role, status, nome_completo) values
            ('${PROF_A}', 'professor', 'ativo', 'Professor A'),
            ('${ALUNO_A}', 'aluno', 'ativo', 'Aluno A'),
            ('${OUTRO_ALUNO}', 'aluno', 'ativo', 'Outro Aluno');

        create function public.sulsafe_conta_ativa() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.status = 'ativo')
        $$;
        create function public.sulsafe_empresa_id() returns uuid
        language sql stable security definer set search_path = ''
        as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'empresa_id', '')::uuid $$;
        create function public.sulsafe_is_admin() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.status = 'ativo' and p.role = 'admin')
        $$;
        create function public.sulsafe_is_professor() returns boolean
        language sql stable security definer set search_path = '' as $$
            select exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.status = 'ativo'
                  and p.role in ('professor', 'admin'))
        $$;
        grant execute on function public.sulsafe_conta_ativa() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_empresa_id() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_admin() to authenticated, anon, service_role;
        grant execute on function public.sulsafe_is_professor() to authenticated, anon, service_role;

        create table public.turmas (
            id uuid primary key, nome text not null,
            criado_por uuid not null references public.profiles(id)
        );
        create table public.turma_alunos (
            turma_id uuid not null references public.turmas(id) on delete cascade,
            aluno_id uuid not null references public.profiles(id) on delete cascade,
            primary key (turma_id, aluno_id)
        );
        insert into public.turmas (id, nome, criado_por) values ('${TURMA_A}', 'Turma A', '${PROF_A}');
        insert into public.turma_alunos (turma_id, aluno_id) values ('${TURMA_A}', '${ALUNO_A}');

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
            select public.sulsafe_is_professor() and public.sulsafe_is_admin()
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

        create table public.ia_jobs (
            id uuid primary key, empresa_id uuid,
            criado_por uuid not null references public.profiles(id),
            tipo text not null, titulo text not null, prompt text not null,
            provedor text, status text not null default 'PENDENTE',
            tentativas integer not null default 0, erro_mensagem text,
            resultado jsonb, criado_em timestamptz not null default now(),
            atualizado_em timestamptz not null default now(),
            iniciado_em timestamptz, concluido_em timestamptz
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
            atualizado_em timestamptz not null default now(),
            constraint ia_conteudos_aprovado_publicado check (not publicado or aprovado),
            constraint ia_conteudos_aprovado_rejeitado check (not (aprovado and rejeitado))
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
        create function public.sulsafe_atualizar_status_ia_job(
            p_job_id uuid, p_status text, p_erro_mensagem text default null, p_resultado jsonb default null
        ) returns void language plpgsql security definer set search_path = '' as $$
        begin
            update public.ia_jobs j set status = p_status,
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

    for (const sql of [fundacao, estrutura, geracao, aprovacao, distribuicao, realizacao]) {
        await db.exec(sql)
    }

    await db.query('update public.turmas set empresa_id = $1 where id = $2', [EMPRESA_A, TURMA_A])

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt, status)
        values ($1, $2, $3, 'PROVA', 'Prova A', 'Pedido A', 'CONCLUIDO'),
               ($4, $5, $3, 'PROVA', 'Prova B', 'Pedido B', 'CONCLUIDO')
    `, [JOB_A, EMPRESA_A, PROF_A, JOB_B, EMPRESA_B])

    const conteudo = JSON.stringify({ origem: 'TUTOR_SULSAFE', questoes: [{ enunciado: 'Q1' }] })
    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, criado_por, tipo, titulo, conteudo, aprovado, aprovado_por, aprovado_em, publicado, publicado_por, publicado_em)
        values ($1, $2, $3, 'PROVA', 'Avaliação: NR-35 - Trabalho em Altura', $4::jsonb, true, $3, now(), true, $3, now()),
               ($5, $6, $3, 'PROVA', 'Outra Avaliação', $4::jsonb, true, $3, now(), true, $3, now())
    `, [CONTEUDO_A, JOB_A, PROF_A, conteudo, CONTEUDO_B, JOB_B])

    await db.query(`
        insert into public.provas_direcionadas
            (id, titulo, descricao, nr_id, tipo, publicado, origem, ia_conteudo_id, criado_por)
        values
            ($1, 'Avaliação: NR-35 - Trabalho em Altura', 'Descrição', 35, 'prova', true, 'IA_TUTOR', $3, $5),
            ($2, 'Outra Avaliação', 'Descrição', 35, 'prova', true, 'IA_TUTOR', $4, $5)
    `, [PROVA_A, PROVA_B, CONTEUDO_A, CONTEUDO_B, PROF_A])

    await db.query(`
        insert into public.provas_questoes (id, prova_id, ordem, enunciado, alternativas, gabarito, peso)
        values
            ($1, $4, 1, 'Questão 1',
             '[{"chave":"A","texto":"Altura 1"},{"chave":"B","texto":"Altura 2"}]'::jsonb,
             '{"resposta_correta":"A","justificativa":"Justificativa 1"}'::jsonb, 2),
            ($2, $4, 2, 'Questão 2',
             '[{"chave":"A","texto":"Altura 3"},{"chave":"B","texto":"Altura 4"}]'::jsonb,
             '{"resposta_correta":"B","justificativa":"Justificativa 2"}'::jsonb, 3),
            ($3, $4, 3, 'Questão 3',
             '[{"chave":"A","texto":"Altura 5"},{"chave":"B","texto":"Altura 6"}]'::jsonb,
             '{"resposta_correta":"A","justificativa":"Justificativa 3"}'::jsonb, 1)
    `, [Q1, Q2, Q3, PROVA_A])

    await db.query(`
        insert into public.provas_distribuicoes
            (prova_id, aluno_id, destino_tipo, destino_id, distribuido_por, distribuido_em)
        values ($1, $2, 'TURMA', $3, $4, now())
    `, [PROVA_A, ALUNO_A, TURMA_A, PROF_A])

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

function reqSubmeter(provaId = PROVA_A, respostas = []) {
    return {
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        query: { id: provaId },
        body: { respostas }
    }
}

test('migration da Etapa 6 é forward-only, SECURITY DEFINER e não expõe gabarito', () => {
    assert.ok(realizacao.includes('sulsafe_carregar_prova_aluno_ia'))
    assert.ok(realizacao.includes('sulsafe_submeter_prova_aluno_ia'))
    assert.ok(!/\bdrop table\b|\btruncate\b/i.test(realizacao))
    assert.match(realizacao, /security definer[\s\S]*?set search_path = ''/i)

    // Inspeciona somente a assinatura/corpo da RPC de leitura. A RPC de
    // correção precisa ler o gabarito internamente; o que não pode acontecer
    // é a leitura do aluno devolver essas colunas.
    const leitura = realizacao.match(
        /create or replace function public\.sulsafe_carregar_prova_aluno_ia[\s\S]*?\$\$;\n/
    )?.[0] || ''
    assert.ok(leitura.includes('returns table'))
    assert.doesNotMatch(
        leitura,
        /\b(gabarito|resposta_correta|justificativa)\b/i,
        'RPC de leitura não deve retornar gabarito'
    )
    assert.match(realizacao, /grant execute on function public\.sulsafe_carregar_prova_aluno_ia\(uuid\) to authenticated/)
    assert.match(realizacao, /grant execute on function public\.sulsafe_submeter_prova_aluno_ia\(uuid, jsonb\) to authenticated/)
})

test('cabeçalho de contexto renderiza título, aluno, data, tempo e instruções', () => {
    const html = renderCabecalhoContextoIA({
        titulo: 'Avaliação: NR-35 - Trabalho em Altura',
        alunoNome: 'Aluno A',
        data: '25/11/2026',
        tempoEstimado: '60 minutos',
        notaMinima: 7,
        instrucoes: 'Esta prova contém 10 questões. Você tem 60 minutos para concluir.'
    })

    for (const trecho of [
        'Avaliação: NR-35 - Trabalho em Altura',
        'Aluno A',
        '25/11/2026',
        '60 minutos',
        'Nota mínima: 7',
        'Esta prova contém 10 questões. Você tem 60 minutos para concluir.',
        'SulSafe',
        'cabeçalho-contexto'
    ]) {
        assert.ok(html.includes(trecho), `deve conter: ${trecho}`)
    }
})

test('tela do aluno sanitiza dados dinâmicos e não embute gabarito', () => {
    const html = vProvaAlunoIA({
        titulo: '<script>alert(1)</script>Prova',
        alunoNome: 'Aluno A',
        data: '25/11/2026',
        tempoEstimado: '60 minutos',
        notaMinima: 7,
        instrucoes: 'Leia com atenção',
        questoes: [{
            id: Q1,
            ordem: 1,
            enunciado: '<img src=x onerror=alert(1)>Enunciado',
            alternativas: [{ chave: 'A', texto: '<b>Altura</b>' }, { chave: 'B', texto: 'Outra' }]
        }]
    })

    // O texto malicioso aparece escapado (&lt;img ... onerror=...), o que é
    // seguro: a regex detecta apenas tags HTML reais, não entidades escapadas.
    assert.doesNotMatch(html, /<script\b|<img\b[^>]*\bonerror\s*=/i)
    assert.match(html, /&lt;script&gt;/)
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.doesNotMatch(html, /gabarito|resposta_correta|justificativa/i)
    assert.match(html, /Finalizar Prova/)
})

test('a tela carregada não aninha um segundo container de conteúdo', () => {
    const html = vProvaAlunoIA({
        titulo: 'Prova',
        questoes: [{ id: Q1, ordem: 1, enunciado: 'Questão 1', alternativas: [{ chave: 'A', texto: 'A' }] }]
    })

    assert.equal((html.match(/id="conteudoProvaAlunoIA"/g) || []).length, 1)
    assert.ok(html.includes('cabeçalho-contexto'))
    assert.ok(html.includes('id="formProvaAlunoIA"'))

    // iniciarProvaAlunoIA já recebe o container criado pela view: injetar a
    // view inteira ali dentro duplicaria o cabeçalho e o próprio container.
    const codigo = ler('../js/views/prova-aluno-ia.js')
    assert.doesNotMatch(codigo, /container\.innerHTML = vProvaAlunoIA\(/)
    assert.match(codigo, /container\.innerHTML = corpoProvaAlunoIA\(dados\)/)
})

test('aluno carrega questões sem gabarito; professor é bloqueado na leitura', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A, EMPRESA_A)
        const cliente = clienteDb(db)
        const { data, error } = await cliente.rpc('sulsafe_carregar_prova_aluno_ia', { p_prova_id: PROVA_A })
        assert.equal(error, null)
        assert.equal(data.length, 3)
        assert.equal(data[0].enunciado, 'Questão 1')
        assert.deepEqual(Object.keys(data[0]).sort(), ['alternativas', 'enunciado', 'id', 'ordem', 'peso'].sort())
        assert.doesNotMatch(JSON.stringify(data), /gabarito|resposta_correta|justificativa/i)

        await sessao(db, PROF_A, EMPRESA_A)
        const bloqueio = await cliente.rpc('sulsafe_carregar_prova_aluno_ia', { p_prova_id: PROVA_A })
        assert.match(bloqueio.error?.message || '', /Somente alunos/i)
    })
})

test('submissão com todas as corretas gera nota máxima e status CONCLUIDA', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A, EMPRESA_A)
        const res = respostaJson()
        await handlerSubmeter(
            reqSubmeter(PROVA_A, [
                { questao_id: Q1, alternativa: 'A' },
                { questao_id: Q2, alternativa: 'B' },
                { questao_id: Q3, alternativa: 'A' }
            ]),
            res,
            clienteDb(db)
        )

        assert.equal(res.statusCode, 200)
        assert.equal(res.corpo.nota, null)
        assert.equal(res.corpo.liberado, false)
        assert.match(res.corpo.mensagem, /Aguarde a revisão do professor/)
        assert.equal(res.corpo.total, 6)
        assert.equal(res.corpo.status, 'CONCLUIDA')
        assert.equal(res.headers['Cache-Control'], 'no-store')

        // Inspeção de persistência feita como DBA: a leitura do próprio aluno
        // depende da RLS de provas_progresso, que não é o escopo deste teste.
        await db.exec('reset role')
        const { rows } = await db.query(
            `select nota, status, concluido_em from public.provas_progresso where prova_id = $1 and aluno_id = $2`,
            [PROVA_A, ALUNO_A]
        )
        assert.equal(rows.length, 1)
        assert.equal(Number(rows[0].nota), 6)
        assert.equal(rows[0].status, 'CONCLUIDA')
        assert.ok(rows[0].concluido_em)
    })
})

test('submissão com respostas erradas gera nota zero', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A, EMPRESA_A)
        const res = respostaJson()
        await handlerSubmeter(
            reqSubmeter(PROVA_A, [
                { questao_id: Q1, alternativa: 'B' },
                { questao_id: Q2, alternativa: 'A' },
                { questao_id: Q3, alternativa: 'B' }
            ]),
            res,
            clienteDb(db)
        )

        assert.equal(res.statusCode, 200)
        assert.equal(res.corpo.nota, null)
        assert.equal(res.corpo.liberado, false)
        assert.match(res.corpo.mensagem, /Aguarde a revisão do professor/)
        assert.equal(res.corpo.total, 6)
    })
})

test('submissão mista calcula nota parcial pelos pesos', async t => {
    await comBanco(t, async db => {
        await sessao(db, ALUNO_A, EMPRESA_A)
        const res = respostaJson()
        await handlerSubmeter(
            reqSubmeter(PROVA_A, [
                { questao_id: Q1, alternativa: 'A' },
                { questao_id: Q2, alternativa: 'A' },
                { questao_id: Q3, alternativa: 'A' }
            ]),
            res,
            clienteDb(db)
        )

        assert.equal(res.statusCode, 200)
        assert.equal(res.corpo.nota, null)
        assert.equal(res.corpo.liberado, false)
        assert.match(res.corpo.mensagem, /Aguarde a revisão do professor/)
        assert.equal(res.corpo.total, 6)
    })
})

test('submissão rejeita aluno sem distribuição, empresa diferente e resposta inválida', async t => {
    await comBanco(t, async db => {
        await sessao(db, OUTRO_ALUNO, EMPRESA_A)
        let res = respostaJson()
        await handlerSubmeter(
            reqSubmeter(PROVA_A, [{ questao_id: Q1, alternativa: 'A' }]),
            res,
            clienteDb(db)
        )
        assert.equal(res.statusCode, 403)

        await sessao(db, ALUNO_A, EMPRESA_B)
        res = respostaJson()
        await handlerSubmeter(
            reqSubmeter(PROVA_A, [{ questao_id: Q1, alternativa: 'A' }]),
            res,
            clienteDb(db)
        )
        assert.equal(res.statusCode, 403)

        await sessao(db, ALUNO_A, EMPRESA_A)
        res = respostaJson()
        await handlerSubmeter(
            reqSubmeter(PROVA_A, [{ questao_id: Q1, alternativa: 'Z' }]),
            res,
            clienteDb(db)
        )
        assert.equal(res.statusCode, 400)

        res = respostaJson()
        await handlerSubmeter(
            reqSubmeter(PROVA_B, [{ questao_id: Q1, alternativa: 'A' }]),
            res,
            clienteDb(db)
        )
        assert.equal(res.statusCode, 403)

        res = respostaJson()
        await handlerSubmeter({ ...reqSubmeter(), method: 'GET' }, res, clienteDb(db))
        assert.equal(res.statusCode, 405)
    })
})
