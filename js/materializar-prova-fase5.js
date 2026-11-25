// ============================================================
// MATERIALIZAÇÃO DE PROVAS DA FASE 5 — ADAPTADOR DE BACKEND
// ============================================================
// O JSON da I.A. é validado pelo mesmo núcleo Zod da Etapa 1 antes de
// chegar ao banco. A RPC SECURITY DEFINER grava prova + questões em uma
// única transação: se qualquer questão falhar, nada é gravado.
//
// Este módulo é independente de runtime (Node agora, Deno na Etapa 3):
// recebe um cliente com `.rpc(nome, argumentos)` e o JSON já extraído.
// Nenhuma chave de API é lida, logada ou devolvida aqui.
// ============================================================

import { z } from 'zod'
import { criarContratosFase5 } from './tutor-contratos-fase5-core.js'

const { validarSaidaIA } = criarContratosFase5(z)

export const RPC_MATERIALIZAR_PROVA = 'sulsafe_materializar_prova_ia'

export function validarProvaFase5(dados, opcoes = {}) {
    return validarSaidaIA('PROVA', dados, opcoes)
}

export async function materializarProvaIA(cliente, conteudoId, opcoes = {}) {
    const validacao = validarProvaFase5(opcoes.dados, {
        quantidadeQuestoes: opcoes.quantidadeQuestoes ?? 10
    })

    if (!validacao.sucesso) {
        return { sucesso: false, erros: validacao.erros }
    }

    const argumentos = { p_conteudo_id: conteudoId }
    // O worker usa RASCUNHO_IA (o banco ainda não tem aprovação humana);
    // chamadas legadas continuam no modo APROVADO padrão da Etapa 2.
    if (opcoes.modo) argumentos.p_modo = opcoes.modo

    const { data, error } = await cliente.rpc(RPC_MATERIALIZAR_PROVA, argumentos)

    if (error) {
        throw new Error(error.message || 'Não foi possível materializar a prova')
    }

    return { sucesso: true, ...(data ?? {}) }
}
