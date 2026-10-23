
import fs from 'node:fs'

const arquivo = 'supabase/migrations/20261021000000_almoxarifado.sql'
const sqlOriginal = fs.readFileSync(arquivo, 'utf8')
let sql = sqlOriginal

function substituirUnico(antes, depois, descricao) {
    const primeira = sql.indexOf(antes)
    if (primeira === -1 || sql.indexOf(antes, primeira + antes.length) !== -1) {
        throw new Error(`Trecho ausente ou repetido: ${descricao}. Nada foi salvo.`)
    }
    sql = sql.slice(0, primeira) + depois + sql.slice(primeira + antes.length)
    console.log(`OK: ${descricao}`)
}

// 1. Search path vazio nas funções privilegiadas.
substituirUnico(
    'create or replace function public.almox_assert_admin()\nreturns void\nlanguage plpgsql\nstable\nsecurity definer\nset search_path = public',
    'create or replace function public.almox_assert_admin()\nreturns void\nlanguage plpgsql\nstable\nsecurity definer\nset search_path = \'\'',
    'search_path de almox_assert_admin'
)

for (const nome of [
    'almox_registrar_entrada',
    'almox_registrar_saida',
    'almox_registrar_ajuste',
    'almox_transferir',
    'almox_estornar_movimentacao'
]) {
    const inicio = `create or replace function public.${nome}(`
    const pos = sql.indexOf(inicio)
    if (pos === -1) throw new Error(`Função não encontrada: ${nome}. Nada foi salvo.`)

    const fimCabecalho = sql.indexOf('as $$', pos)
    if (fimCabecalho === -1) throw new Error(`Cabeçalho incompleto: ${nome}. Nada foi salvo.`)

    const cabecalho = sql.slice(pos, fimCabecalho)
    const ocorrencias = cabecalho.match(/set search_path = public/g) || []
    if (ocorrencias.length !== 1) {
        throw new Error(`search_path inesperado em ${nome}. Nada foi salvo.`)
    }

    sql = sql.slice(0, pos) +
        cabecalho.replace('set search_path = public', "set search_path = ''") +
        sql.slice(fimCabecalho)

    console.log(`OK: search_path de ${nome}`)
}

// 2. Gatilhos: não confiar apenas numa variável de sessão
// que um cliente pode definir por conta própria.
substituirUnico(
    `    if new.saldo_atual is distinct from old.saldo_atual
       and coalesce(current_setting('almox.internal_movement', true), '') <> 'on' then`,
    `    if new.saldo_atual is distinct from old.saldo_atual
       and current_user <> pg_catalog.pg_get_userbyid(
           (select relowner from pg_catalog.pg_class
            where oid = 'public.almox_itens'::pg_catalog.regclass)
       ) then`,
    'proteção do saldo em UPDATE'
)

substituirUnico(
    `    if coalesce(new.saldo_atual, 0) <> 0
       and coalesce(current_setting('almox.internal_movement', true), '') <> 'on' then`,
    `    if coalesce(new.saldo_atual, 0) <> 0
       and current_user <> pg_catalog.pg_get_userbyid(
           (select relowner from pg_catalog.pg_class
            where oid = 'public.almox_itens'::pg_catalog.regclass)
       ) then`,
    'proteção do saldo em INSERT'
)

substituirUnico(
    `    if new.quantidade_atual is distinct from old.quantidade_atual
       and coalesce(current_setting('almox.internal_movement', true), '') <> 'on' then`,
    `    if new.quantidade_atual is distinct from old.quantidade_atual
       and current_user <> pg_catalog.pg_get_userbyid(
           (select relowner from pg_catalog.pg_class
            where oid = 'public.almox_lotes'::pg_catalog.regclass)
       ) then`,
    'proteção da quantidade dos lotes'
)

// 3. Permissões por coluna: o frontend não envia saldo nem auditoria.
substituirUnico(
    `grant select, insert, update, delete on public.almox_itens to authenticated;`,
    `revoke insert, update on public.almox_itens from authenticated;

grant insert (
    codigo, nome, descricao, categoria_id, marca, modelo,
    unidade_medida, tipo_controle, estoque_minimo, estoque_maximo,
    localizacao, prateleira, armario, setor, fornecedor_padrao_id,
    custo_unitario, numero_serie, patrimonio, situacao, observacoes
) on public.almox_itens to authenticated;

grant update (
    codigo, nome, descricao, categoria_id, marca, modelo,
    unidade_medida, tipo_controle, estoque_minimo, estoque_maximo,
    localizacao, prateleira, armario, setor, fornecedor_padrao_id,
    custo_unitario, numero_serie, patrimonio, situacao, observacoes
) on public.almox_itens to authenticated;

grant select, delete on public.almox_itens to authenticated;`,
    'permissões por coluna em almox_itens'
)

if (sql === sqlOriginal) throw new Error('Nenhuma alteração foi produzida.')
fs.writeFileSync(arquivo, sql, 'utf8')
console.log('\nPatch local aplicado. A migração remota NÃO foi executada.')
