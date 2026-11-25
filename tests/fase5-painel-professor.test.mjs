// ============================================================
// FASE 5 — ETAPA 7/8: PAINEL DE ACOMPANHAMENTO DO PROFESSOR
// ============================================================
// TDD: rotas de resultados/detalhe, isolamento por empresa, nota,
// gabarito restrito ao professor, correção manual de discursivas e UI.
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

const fundacao = ler('../supabase/migrations/20261125000000_fase5_fundacao.sql')
const estrutura = ler('../supabase/migrations/20261125010000_fase5_estrutura_prova.sql')
const geracao = ler('../supabase/migrations/20261125020000_fase5_geracao_prova.sql')
const aprovacao = ler('../supabase/migrations/20261125030000_fase5_aprovacao_prova.sql')
const distribuicao = ler('../supabase/migrations/20261125040000_fase5_distribuicao_prova.sql')
const realizacao = ler('../supabase/migrations/20261125050000_fase5_realizacao_prova.sql')
const painel = ler('../supabase/migrations/20261125070000_fase5_painel_professor.sql')

const rotaResultados = ler('../api/tutor/provas/[id]/resultados.mjs')
const rotaDetalhe = ler('../api/tutor/provas/[id]/resultados/[alunoId].mjs')
const rotaCorrigir = ler('../api/tutor/provas/[id]/resultados/[alunoId]/corrigir.mjs')
const ui = ler('../js/views/provas-resultados-ia.js')
const uiDistribuicao = ler('../js/views/provas-distribuicao-ia.js')
const cliente = ler('../js/supabase-client.js')
const main = ler('../js/main.js')
const app = ler('../js/app.js')
const vercel = JSON.parse(ler('../vercel.json') || '{"rewrites":[]}')

const uuid = sufixo => `00000000-0000-4000-8000-${String(sufixo).padStart(12, '0')}`
const PROF_A = uuid('02')
const PROF_B = uuid('03')
const ALUNO_A1 = uuid('04')
const ALUNO_A2 = uuid('05')
const ALUNO_B1 = uuid('06')
const EMPRESA_A = uuid('11')
const EMPRESA_B = uuid('12')
const JOB_A = uuid('21')
const JOB_B = uuid('22')
const CONTEUDO_A = uuid('31')
const CONTEUDO_B = uuid('32')
const TURMA_A = uuid('41')
const TURMA_B = uuid('42')
const PROVA_A = uuid('51')
const PROVA_B = uuid('52')
const Q1 = uuid('61')
const Q2 = uuid('62')
const Q3 = uuid('63')

const CASTES = {
    p_prova_id: 'uuid',
    p_aluno_id: 'uuid',
    p_questao_id: 'uuid',
    p_nota: 'numeric',
    p_respostas: 'jsonb'
}

const ASSINATURAS = Object.freeze({
    sulsafe_listar_resultados_prova_ia: ['p_prova_id'],
    sulsafe_detalhe_resultado_prova_ia: ['p_prova_id', 'p_aluno_id'],
    sulsafe_corrigir_resposta_discursiva_ia: ['p_prova_id', 'p_aluno_id', 'p_questao_id', 'p_nota'],
    sulsafe_submeter_prova_aluno_ia: ['p_prova_id', 'p_respostas']
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
            try {
                if (nome.startsWith('sulsafe_listar_')) {
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
        setHeader(nome, valor) {
            res.headers[nome] = valor
            res.headers[String(nome).toLowerCase()] = valor
            return res
        },
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
            ('${PROF_B}', 'professor', 'ativo', 'Professor B'),
            ('${ALUNO_A1}', 'aluno', 'ativo', 'Aluno A1'),
            ('${ALUNO_A2}', 'aluno', 'ativo', 'Aluno A2'),
            ('${ALUNO_B1}', 'aluno', 'ativo', 'Aluno B1');

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
                where p.id = auth.uid() and p.status = 'ativo' and p.role in ('admin', 'super_admin'))
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
            criado_em timestamptz not null default now(),
            constraint provas_revisao_auditoria_acao_check
                check (acao in ('APROVADO', 'REJEITADO', 'EDITADO', 'DISTRIBUIDO', 'INTERNO', 'SUBMETIDO'))
        );

        grant select on public.ia_jobs, public.ia_conteudos, public.turmas,
            public.turma_alunos, public.profiles to authenticated;
    `)

    for (const sql of [fundacao, estrutura, geracao, aprovacao, distribuicao, realizacao, painel]) {
        await db.exec(sql)
    }

    await db.query(`
        insert into public.ia_jobs (id, empresa_id, criado_por, tipo, titulo, prompt, status)
        values ($1, $2, $3, 'PROVA', 'Prova A', 'Pedido A', 'CONCLUIDO'),
               ($4, $5, $3, 'PROVA', 'Prova B', 'Pedido B', 'CONCLUIDO')
    `, [JOB_A, EMPRESA_A, PROF_A, JOB_B, EMPRESA_B])

    const conteudo = JSON.stringify({ origem: 'TUTOR_SULSAFE', questoes: [{ enunciado: 'Q1' }] })
    await db.query(`
        insert into public.ia_conteudos
            (id, job_id, criado_por, tipo, titulo, conteudo, aprovado, aprovado_por, aprovado_em, publicado, publicado_por, publicado_em)
        values ($1, $2, $3, 'PROVA', 'Avaliação A', $4::jsonb, true, $3, now(), true, $3, now()),
               ($5, $6, $3, 'PROVA', 'Avaliação B', $4::jsonb, true, $3, now(), true, $3, now())
    `, [CONTEUDO_A, JOB_A, PROF_A, conteudo, CONTEUDO_B, JOB_B])

    await db.query(`
        insert into public.provas_direcionadas
            (id, titulo, nr_id, tipo, turma_id, publicado, origem, ia_conteudo_id, criado_por)
        values ($1, 'Avaliação A', 35, 'prova', $5, true, 'IA_TUTOR', $3, $7),
               ($2, 'Avaliação B', 35, 'prova', $6, true, 'IA_TUTOR', $4, $7)
    `, [PROVA_A, PROVA_B, CONTEUDO_A, CONTEUDO_B, TURMA_A, TURMA_B, PROF_A])

    await db.query(`
        insert into public.provas_questoes (id, prova_id, ordem, enunciado, alternativas, gabarito, peso, tipo)
        values
            ($1, $4, 1, 'Questão 1',
             '[{"chave":"A","texto":"Altura 1"},{"chave":"B","texto":"Altura 2"}]'::jsonb,
             '{"resposta_correta":"A","justificativa":"Justificativa 1"}'::jsonb, 2, 'OBJETIVA'),
            ($2, $4, 2, 'Questão 2',
             '[{"chave":"A","texto":"Altura 3"},{"chave":"B","texto":"Altura 4"}]'::jsonb,
             '{"resposta_correta":"B","justificativa":"Justificativa 2"}'::jsonb, 3, 'OBJETIVA'),
            ($3, $4, 3, 'Questão 3 discursiva',
             '[{"chave":"A","texto":"Não se aplica"},{"chave":"B","texto":"Não se aplica"}]'::jsonb,
             '{"resposta_correta":"","resposta_referencia":"Resposta esperada"}'::jsonb, 5, 'DISCURSIVA')
    `, [Q1, Q2, Q3, PROVA_A])

    await db.query(`
        insert into public.provas_distribuicoes
            (prova_id, aluno_id, destino_tipo, destino_id, distribuido_por, distribuido_em)
        values
            ($1, $2, 'TURMA', $4, $6, now()),
            ($1, $3, 'TURMA', $4, $6, now()),
            ($5, $6, 'TURMA', $7, $8, now())
    `, [PROVA_A, ALUNO_A1, ALUNO_A2, TURMA_A, PROVA_B, ALUNO_B1, TURMA_B, PROF_A])

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

async function comFetch(t, resposta, callback) {
    const originalFetch = globalThis.fetch
    const originalUrl = process.env.SUPABASE_URL
    const originalAnon = process.env.SUPABASE_ANON_KEY
    process.env.SUPABASE_URL = 'https://projeto.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon-publico'
    const chamadas = []
    globalThis.fetch = async (url, opcoes) => {
        chamadas.push({ url, opcoes })
        return {
            ok: true,
            status: 200,
            json: async () => resposta
        }
    }
    t.after(() => {
        globalThis.fetch = originalFetch
        if (originalUrl === undefined) delete process.env.SUPABASE_URL
        else process.env.SUPABASE_URL = originalUrl
        if (originalAnon === undefined) delete process.env.SUPABASE_ANON_KEY
        else process.env.SUPABASE_ANON_KEY = originalAnon
    })
    return callback(chamadas)
}

// ------------------------------------------------------------
// 1. Garantias estáticas
// ------------------------------------------------------------

test('migration da Etapa 7 é forward-only, SECURITY DEFINER e protege gabarito/RLS', () => {
    assert.ok(painel.length > 500, 'migration nova deve existir')
    assert.doesNotMatch(painel, /\bdrop table\b|\btruncate\b/i)
    assert.match(painel, /create table if not exists public\.provas_respostas_aluno/i)
    assert.match(painel, /create or replace function public\.sulsafe_listar_resultados_prova_ia/i)
    assert.match(painel, /create or replace function public\.sulsafe_detalhe_resultado_prova_ia/i)
    assert.match(painel, /create or replace function public\.sulsafe_corrigir_resposta_discursiva_ia/i)
    assert.match(painel, /sulsafe_prova_gerenciada\(p_prova_id\)/)
    assert.match(painel, /sulsafe_acessa_aluno\(p_aluno_id\)/)
    assert.match(painel, /security definer[\s\S]*?set search_path = ''/i)
    assert.match(painel, /revoke all on function public\.sulsafe_detalhe_resultado_prova_ia\(uuid, uuid\) from public, anon/)
    assert.match(painel, /grant execute on function public\.sulsafe_detalhe_resultado_prova_ia\(uuid, uuid\) to authenticated/)
    assert.match(painel, /alter table public\.provas_respostas_aluno enable row level security/i)
    assert.doesNotMatch(
        painel.match(/create or replace function public\.sulsafe_listar_resultados_prova_ia[\s\S]*?\$\$;\n/)?.[0] || '',
        /gabarito|resposta_correta|justificativa/i,
        'a listagem não deve devolver gabarito'
    )
})

test('rotas de resultado usam JWT do professor, chave anônima, whitelist e no-store', async (t) => {
    assert.ok(rotaResultados.includes('sulsafe_listar_resultados_prova_ia'))
    assert.ok(rotaDetalhe.includes('sulsafe_detalhe_resultado_prova_ia'))
    assert.ok(rotaCorrigir.includes('sulsafe_corrigir_resposta_discursiva_ia'))
    for (const codigo of [rotaResultados, rotaDetalhe, rotaCorrigir]) {
        assert.doesNotMatch(codigo, /service_role|SERVICE_ROLE/i)
        assert.match(codigo, /no-store/)
        assert.match(codigo, /Bearer \$\{token\}/)
    }

    const handlerResultados = (await import('../api/tutor/provas/[id]/resultados.mjs')).default
    const handlerDetalhe = (await import('../api/tutor/provas/[id]/resultados/[alunoId].mjs')).default

    await comFetch(t, [{
        aluno_id: ALUNO_A1,
        nome_completo: 'Aluno A1',
        status: 'CONCLUIDA',
        nota: 7.8,
        concluido_em: '2026-11-25T12:00:00Z',
        secreto: 'nao-devo-vazar'
    }], async (chamadas) => {
        const req = {
            method: 'GET',
            headers: { authorization: 'Bearer jwt-do-professor' },
            query: { id: PROVA_A }
        }
        const res = respostaJson()
        await handlerResultados(req, res)

        assert.equal(res.statusCode, 200)
        assert.equal(res.corpo.resultados[0].nota, 7.8)
        assert.equal(res.corpo.resultados[0].secreto, undefined)
        assert.match(chamadas[0].url, /\/rest\/v1\/rpc\/sulsafe_listar_resultados_prova_ia/)
        assert.equal(chamadas[0].opcoes.headers.authorization, 'Bearer jwt-do-professor')
        assert.equal(chamadas[0].opcoes.headers.apikey, 'anon-publico')
        assert.match(res.headers['cache-control'], /no-store/)

        const semToken = respostaJson()
        await handlerResultados({ method: 'GET', headers: {}, query: { id: PROVA_A } }, semToken)
        assert.equal(semToken.statusCode, 401)

        const post = respostaJson()
        await handlerResultados({ method: 'POST', headers: { authorization: 'Bearer x' } }, post)
        assert.equal(post.statusCode, 405)
    })

    await comFetch(t, {
        aluno_id: ALUNO_A1,
        aluno_nome: 'Aluno A1',
        nota: 7.8,
        questoes: [{
            id: Q1,
            ordem: 1,
            enunciado: 'Questão 1',
            tipo: 'OBJETIVA',
            alternativas: [{ chave: 'A', texto: 'Altura 1' }],
            resposta_aluno: 'A',
            gabarito: { resposta_correta: 'A', justificativa: 'Justificativa 1' },
            segredo: 'nao-devo-vazar'
        }]
    }, async (chamadas) => {
        const req = {
            method: 'GET',
            headers: { authorization: 'Bearer jwt-do-professor' },
            query: { id: PROVA_A, alunoId: ALUNO_A1 }
        }
        const res = respostaJson()
        await handlerDetalhe(req, res)

        assert.equal(res.statusCode, 200)
        assert.equal(res.corpo.detalhe.nota, 7.8)
        assert.deepEqual(res.corpo.detalhe.questoes[0].gabarito, {
            resposta_correta: 'A', justificativa: 'Justificativa 1'
        })
        assert.equal(res.corpo.detalhe.questoes[0].segredo, undefined)
        assert.match(chamadas[0].url, /\/rest\/v1\/rpc\/sulsafe_detalhe_resultado_prova_ia/)
        assert.match(chamadas[0].url, new RegExp(PROVA_A))
        assert.match(chamadas[0].url, new RegExp(ALUNO_A1))

        const semToken = respostaJson()
        await handlerDetalhe({ method: 'GET', headers: {}, query: {} }, semToken)
        assert.equal(semToken.statusCode, 401)
    })
})

test('painel traz tabela, filtro por status, detalhes e correção desabilitada sem discursiva', () => {
    assert.ok(ui.includes('Ver Resultados'), 'lista de provas distribuídas precisa do botão')
    assert.ok(uiDistribuicao.includes('Ver Resultados'))
    for (const trecho of ['Nome', 'Status', 'Nota', 'Data de Conclusão', 'Ver Detalhes', 'Apenas Pendentes', 'Corrigir Discursivas']) {
        assert.ok(ui.includes(trecho), `painel deve conter: ${trecho}`)
    }
    assert.match(ui, /setAttribute\(['"]role['"], ['"]dialog['"]\)/)
    assert.match(ui, /setAttribute\(['"]aria-modal['"], ['"]true['"]\)/)
    assert.match(ui, /disabled/, 'botão de correção começa desabilitado quando não há discursiva')
    assert.match(cliente, /sbListarResultadosProvaIA/)
    assert.match(cliente, /sbCarregarDetalheResultadoIA/)
    assert.match(cliente, /sbCorrigirRespostaDiscursivaIA/)
    assert.match(main, /registerView\(['"]provas-resultados-ia['"]/)
    assert.match(main, /\/admin\/provas-resultados/)
    assert.match(app, /provas-resultados-ia/)
    assert.ok(vercel.rewrites.some(r => r.source === '/admin/provas-resultados' && r.destination === '/login'))
})

// ------------------------------------------------------------
// 2. Integração PGlite
// ------------------------------------------------------------

test('professor da Empresa A não vê resultados da Empresa B (RLS)', async (t) => {
    await comBanco(t, async (db) => {
        const cliente = clienteDb(db)

        await sessao(db, PROF_A, EMPRESA_A)
        const daEmpresaA = await cliente.rpc('sulsafe_listar_resultados_prova_ia', { p_prova_id: PROVA_A })
        assert.equal(daEmpresaA.error, null)
        assert.equal(daEmpresaA.data.length, 2)
        assert.ok(daEmpresaA.data.every(item => [ALUNO_A1, ALUNO_A2].includes(item.aluno_id)))

        await sessao(db, PROF_B, EMPRESA_B)
        const daEmpresaB = await cliente.rpc('sulsafe_listar_resultados_prova_ia', { p_prova_id: PROVA_A })
        assert.equal(daEmpresaB.error, null)
        assert.deepEqual(daEmpresaB.data, [])

        const detalheNegado = await cliente.rpc('sulsafe_detalhe_resultado_prova_ia', {
            p_prova_id: PROVA_A, p_aluno_id: ALUNO_A1
        })
        assert.match(detalheNegado.error?.message || '', /empresa|permiss/i)
        assert.equal(detalheNegado.data, null)
    })
})

test('listagem devolve nota correta e detalhe entrega gabarito somente ao professor', async (t) => {
    await comBanco(t, async (db) => {
        const cliente = clienteDb(db)

        await db.exec('reset role')
        await db.query(`
            insert into public.provas_respostas_aluno (prova_id, aluno_id, questao_id, alternativa, texto_resposta)
            values
                ($1, $2, $3, 'A', null),
                ($1, $2, $4, 'B', null),
                ($1, $2, $5, null, 'Resposta do aluno')
        `, [PROVA_A, ALUNO_A1, Q1, Q2, Q3])
        await db.query(`
            insert into public.provas_progresso (prova_id, aluno_id, status, nota, concluido_em)
            values ($1, $2, 'CONCLUIDA', 9.5, now()), ($1, $3, 'EM_ANDAMENTO', 5, null)
        `, [PROVA_A, ALUNO_A1, ALUNO_A2])

        await sessao(db, PROF_A, EMPRESA_A)
        const resultados = await cliente.rpc('sulsafe_listar_resultados_prova_ia', { p_prova_id: PROVA_A })
        assert.equal(resultados.error, null)
        const concluido = resultados.data.find(item => item.aluno_id === ALUNO_A1)
        assert.equal(concluido.nome_completo, 'Aluno A1')
        assert.equal(concluido.status, 'CONCLUIDA')
        assert.equal(Number(concluido.nota), 9.5)
        assert.ok(concluido.concluido_em)
        assert.equal(concluido.possui_discursiva, true)
        assert.equal(resultados.data.find(item => item.aluno_id === ALUNO_A2).status, 'EM_ANDAMENTO')

        const detalhe = await cliente.rpc('sulsafe_detalhe_resultado_prova_ia', {
            p_prova_id: PROVA_A, p_aluno_id: ALUNO_A1
        })
        assert.equal(detalhe.error, null)
        assert.equal(Number(detalhe.data.nota), 9.5)
        assert.equal(detalhe.data.questoes.length, 3)
        assert.equal(detalhe.data.questoes[0].resposta_aluno, 'A')
        assert.equal(detalhe.data.questoes[0].gabarito.resposta_correta, 'A')
        assert.equal(detalhe.data.questoes[2].resposta_aluno, 'Resposta do aluno')

        await sessao(db, ALUNO_A1, EMPRESA_A)
        const comoAluno = await cliente.rpc('sulsafe_detalhe_resultado_prova_ia', {
            p_prova_id: PROVA_A, p_aluno_id: ALUNO_A1
        })
        assert.match(comoAluno.error?.message || '', /professor|permiss/i)
        assert.equal(comoAluno.data, null)
    })
})

test('correção manual de discursiva recalcula nota e fica restrita à empresa', async (t) => {
    await comBanco(t, async (db) => {
        const cliente = clienteDb(db)

        await db.exec('reset role')
        await db.query(`
            insert into public.provas_respostas_aluno (prova_id, aluno_id, questao_id, alternativa, texto_resposta)
            values
                ($1, $2, $3, 'A', null),
                ($1, $2, $4, 'B', null),
                ($1, $2, $5, null, 'Resposta discursiva')
        `, [PROVA_A, ALUNO_A1, Q1, Q2, Q3])
        await db.query(`
            insert into public.provas_progresso (prova_id, aluno_id, status, nota)
            values ($1, $2, 'EM_ANDAMENTO', 5)
        `, [PROVA_A, ALUNO_A1])

        await sessao(db, PROF_B, EMPRESA_B)
        const negado = await cliente.rpc('sulsafe_corrigir_resposta_discursiva_ia', {
            p_prova_id: PROVA_A, p_aluno_id: ALUNO_A1, p_questao_id: Q3, p_nota: 4.5
        })
        assert.match(negado.error?.message || '', /empresa|permiss/i)
        assert.equal(negado.data, null)

        await sessao(db, PROF_A, EMPRESA_A)
        const invalida = await cliente.rpc('sulsafe_corrigir_resposta_discursiva_ia', {
            p_prova_id: PROVA_A, p_aluno_id: ALUNO_A1, p_questao_id: Q3, p_nota: 6
        })
        assert.match(invalida.error?.message || '', /nota/i)

        const corrigida = await cliente.rpc('sulsafe_corrigir_resposta_discursiva_ia', {
            p_prova_id: PROVA_A, p_aluno_id: ALUNO_A1, p_questao_id: Q3, p_nota: 4.5
        })
        assert.equal(corrigida.error, null)
        assert.equal(Number(corrigida.data.nota), 9.5)
        assert.equal(corrigida.data.status, 'CONCLUIDA')

        await db.exec('reset role')
        const { rows } = await db.query(`
            select status, nota, concluido_em from public.provas_progresso
             where prova_id = $1 and aluno_id = $2
        `, [PROVA_A, ALUNO_A1])
        assert.equal(rows[0].status, 'CONCLUIDA')
        assert.equal(Number(rows[0].nota), 9.5)
        assert.ok(rows[0].concluido_em)

        const { rows: auditoria } = await db.query(`
            select acao from public.provas_revisao_auditoria
             where prova_id = $1 and acao = 'CORRIGIDO_MANUAL'
        `, [PROVA_A])
        assert.equal(auditoria.length, 1)
    })
})

test('submissão salva respostas e mantém discursiva em EM_ANDAMENTO', async (t) => {
    await comBanco(t, async (db) => {
        const cliente = clienteDb(db)

        await sessao(db, ALUNO_A2, EMPRESA_A)
        const resultado = await cliente.rpc('sulsafe_submeter_prova_aluno_ia', {
            p_prova_id: PROVA_A,
            p_respostas: [
                { questao_id: Q1, alternativa: 'A' },
                { questao_id: Q2, alternativa: 'B' },
                { questao_id: Q3, texto_resposta: 'Minha resposta discursiva' }
            ]
        })
        assert.equal(resultado.error, null)
        assert.equal(resultado.data.status, 'EM_ANDAMENTO')

        await db.exec('reset role')
        const { rows } = await db.query(`
            select alternativa, texto_resposta from public.provas_respostas_aluno
             where prova_id = $1 and aluno_id = $2 and questao_id = $3
        `, [PROVA_A, ALUNO_A2, Q3])
        assert.equal(rows[0].texto_resposta, 'Minha resposta discursiva')
    })
})
