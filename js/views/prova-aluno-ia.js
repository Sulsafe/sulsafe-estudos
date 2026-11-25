// ============================================================
// VIEW: REALIZAÇÃO DA PROVA PELO ALUNO (FASE 5, ETAPA 6)
// ============================================================
// Cabeçalho de contexto reutilizável (Prova/Palestra/Curso) + questões sem
// gabarito. A confirmação antes de enviar é um modal acessível, nunca prompt().
// ============================================================

import { S, fmtD, nav } from '../state.js'
import { $, toast, handleError, openMdl, closeMdl, sanitizar } from '../utils.js'

let provaAtual = null
let ouvinteTeclado = null

/**
 * Cabeçalho de contexto. Serve para PROVA, PALESTRA e CURSO: o tipo só muda
 * o rótulo exibido, mantendo a mesma identidade verde/escuro da SulSafe.
 */
export function renderCabecalhoContextoIA(dados = {}) {
    const tipo = sanitizar(dados.tipo || 'Prova')
    const titulo = sanitizar(dados.titulo || 'Avaliação sem título')
    const alunoNome = sanitizar(dados.alunoNome || S.user?.nome_completo || S.user?.email || '')
    const data = sanitizar(dados.data || fmtD(new Date()))
    const tempoEstimado = sanitizar(dados.tempoEstimado || '60 minutos')
    const instrucoes = sanitizar(
        dados.instrucoes ||
        'Leia cada questão com atenção. Ao finalizar, sua nota será calculada automaticamente.'
    )
    const notaMinima = dados.notaMinima === null || dados.notaMinima === undefined || dados.notaMinima === ''
        ? ''
        : `<span class="ctx-meta-item"><i class="fas fa-award" aria-hidden="true"></i> Nota mínima: ${sanitizar(String(dados.notaMinima))}</span>`
    const quantidade = dados.quantidadeQuestoes
        ? `<span class="ctx-meta-item"><i class="fas fa-list-ol" aria-hidden="true"></i> ${sanitizar(String(dados.quantidadeQuestoes))} questões</span>`
        : ''

    return `
        <header class="cabeçalho-contexto" aria-labelledby="tituloContextoIA">
            <div class="ctx-topo">
                <div class="ctx-marca">
                    <img src="/logo1.png" alt="" class="ctx-logo">
                    <span class="ctx-marca-nome">SulSafe</span>
                </div>
                <span class="ctx-tipo">${tipo}</span>
            </div>
            <div class="ctx-corpo">
                <p class="ctx-olho">Avaliação de Segurança do Trabalho</p>
                <h2 id="tituloContextoIA" class="ctx-titulo">${titulo}</h2>
                <div class="ctx-meta" aria-label="Dados da avaliação">
                    <span class="ctx-meta-item"><i class="fas fa-user" aria-hidden="true"></i> ${alunoNome}</span>
                    <span class="ctx-meta-item"><i class="fas fa-calendar-day" aria-hidden="true"></i> ${data}</span>
                    <span class="ctx-meta-item"><i class="fas fa-clock" aria-hidden="true"></i> ${tempoEstimado}</span>
                    ${notaMinima}
                    ${quantidade}
                </div>
                <p class="ctx-instrucoes">${instrucoes}</p>
            </div>
        </header>
    `
}

function questaoHtml(questao) {
    const id = sanitizar(questao.id)
    const ordem = sanitizar(String(questao.ordem ?? ''))
    const enunciado = sanitizar(questao.enunciado || '')
    const discursiva = questao.tipo === 'DISCURSIVA'
    const alternativas = Array.isArray(questao.alternativas) ? questao.alternativas : []

    const campo = discursiva
        ? `
            <div class="discursiva-ia">
                <label for="resposta_${id}">Resposta discursiva</label>
                <textarea id="resposta_${id}" name="questao_${id}" rows="6" maxlength="4000"
                    aria-label="Resposta da questão ${ordem}"
                    placeholder="Escreva sua resposta..." required
                    style="width:100%;box-sizing:border-box;margin-top:8px;padding:12px;background:var(--ip);border:1px solid var(--bd);border-radius:var(--r);color:var(--tx);font:inherit"></textarea>
            </div>
        `
        : `
            <div class="alternativas-ia">
                ${alternativas.map((alternativa, indice) => {
                    const chave = sanitizar(alternativa?.chave ?? String.fromCharCode(65 + indice))
                    const texto = sanitizar(alternativa?.texto ?? '')
                    return `
                        <label class="alternativa-ia">
                            <input type="radio" name="questao_${id}" value="${chave}" required>
                            <span class="alternativa-chave" aria-hidden="true">${chave}</span>
                            <span>${texto}</span>
                        </label>
                    `
                }).join('')}
            </div>
        `

    return `
        <fieldset class="questao-ia" data-questao="${id}" data-tipo="${discursiva ? 'DISCURSIVA' : 'OBJETIVA'}">
            <legend><span class="questao-num">Questão ${ordem}</span> ${enunciado}</legend>
            ${campo}
        </fieldset>
    `
}

function corpoProvaAlunoIA(dados) {
    return `
        ${renderCabecalhoContextoIA(dados)}
        <form id="formProvaAlunoIA" class="prova-aluno-ia" novalidate>
            <div class="pnl">
                <div class="pnl-h"><div class="pnl-t"><i class="fas fa-list-check"></i> Questões</div></div>
                ${dados.questoes.map(questaoHtml).join('')}
            </div>
            <div class="prova-acoes">
                <button type="submit" class="btn btn-p" id="btnFinalizarProvaIA">
                    <i class="fas fa-check-to-slot"></i> Finalizar Prova
                </button>
            </div>
            <div id="resultadoProvaAlunoIA" role="status" aria-live="polite"></div>
        </form>
    `
}

export function vProvaAlunoIA(dados = null) {
    const voltar = `
        <div class="btn-back" onclick="window.nav('provas')">
            <i class="fas fa-arrow-left"></i> Voltar para Minhas Provas
        </div>
    `

    if (!dados || !Array.isArray(dados.questoes)) {
        return `
            ${voltar}
            <div id="conteudoProvaAlunoIA" aria-live="polite" aria-busy="true">
                <div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando avaliação...</p></div>
            </div>
        `
    }

    return `
        ${voltar}
        <div id="conteudoProvaAlunoIA" aria-live="polite" aria-busy="false">
            ${corpoProvaAlunoIA(dados)}
        </div>
    `
}

function tempoFormatado(minutos) {
    const valor = Number(minutos) || 60
    return `${valor} ${valor === 1 ? 'minuto' : 'minutos'}`
}

export async function iniciarProvaAlunoIA(provaId) {
    const container = $('#conteudoProvaAlunoIA')
    if (!container) return

    if (!provaId) {
        container.innerHTML = `<div class="empty" role="alert"><p>Prova não informada.</p></div>`
        container.setAttribute('aria-busy', 'false')
        return
    }

    provaAtual = provaId
    container.setAttribute('aria-busy', 'true')
    container.innerHTML = `<div class="empty" role="status"><i class="fas fa-spinner fa-spin"></i><p>Carregando avaliação...</p></div>`

    // Importação dinâmica: a renderização pura continua testável no Node,
    // onde o.cliente Supabase (CDN ESM) não é resolvido.
    const {
        sbCarregarCabecalhoProvaAlunoIA,
        sbCarregarQuestoesProvaAlunoIA
    } = await import('../supabase-client.js')

    const [cabecalho, questoes] = await Promise.all([
        sbCarregarCabecalhoProvaAlunoIA(provaId),
        sbCarregarQuestoesProvaAlunoIA(provaId)
    ])

    if (!container.isConnected) return
    if (cabecalho.error || questoes.error) {
        container.setAttribute('aria-busy', 'false')
        container.innerHTML = `<div class="empty" role="alert"><i class="fas fa-triangle-exclamation"></i><p>${sanitizar(
            cabecalho.error?.message || questoes.error?.message || 'Não foi possível carregar a avaliação.'
        )}</p></div>`
        return
    }

    const meta = cabecalho.data && typeof cabecalho.data === 'object' ? cabecalho.data : {}
    provaAtual = meta.prova_id || provaId

    const dados = {
        tipo: 'Prova',
        titulo: meta.titulo || 'Avaliação',
        alunoNome: meta.aluno_nome || S.user?.nome_completo || '',
        data: meta.data || fmtD(new Date()),
        tempoEstimado: tempoFormatado(meta.tempo_estimado_minutos),
        notaMinima: meta.nota_minima,
        instrucoes: meta.instrucoes,
        quantidadeQuestoes: meta.quantidade_questoes,
        questoes: Array.isArray(questoes.data) ? questoes.data : []
    }

    // O container já é o `#conteudoProvaAlunoIA` criado por vProvaAlunoIA:
    // injetar a view inteira aqui geraria um container aninhado.
    container.innerHTML = corpoProvaAlunoIA(dados)

    container.querySelector('#formProvaAlunoIA')?.addEventListener('submit', aoSubmeter)
}

function respostasDoFormulario(formulario) {
    const respostas = []
    const grupos = formulario.querySelectorAll('fieldset.questao-ia')

    for (const grupo of grupos) {
        const questaoId = grupo.dataset.questao
        const campoTexto = grupo.querySelector('textarea[name]')

        if (campoTexto) {
            const texto = String(campoTexto.value ?? '').trim()
            if (!texto) return null
            respostas.push({ questao_id: questaoId, texto_resposta: texto })
            continue
        }

        const marcada = grupo.querySelector('input[type="radio"]:checked')
        if (!marcada) return null
        respostas.push({ questao_id: questaoId, alternativa: marcada.value })
    }
    return respostas
}

function aoSubmeter(evento) {
    evento.preventDefault()
    const formulario = evento.currentTarget
    const respostas = respostasDoFormulario(formulario)

    if (!respostas || respostas.length === 0) {
        toast('Responda todas as questões antes de finalizar.', 'warn')
        return
    }

    const temDiscursiva = Boolean(formulario.querySelector('fieldset.questao-ia[data-tipo="DISCURSIVA"]'))
    const avisoCorrecao = temDiscursiva
        ? 'As objetivas serão corrigidas automaticamente e as discursivas aguardarão a correção do professor.'
        : 'Depois disso a nota será calculada automaticamente.'

    const modal = openMdl(`
        <button class="mdl-x" data-acao="cancelar" aria-label="Fechar confirmação"><i class="fas fa-times"></i></button>
        <div class="god-hd" style="margin-bottom:16px">
            <h2 id="tituloConfirmarProvaIA" style="font-size:20px"><i class="fas fa-circle-check"></i> Finalizar Prova</h2>
            <p>Confirme para enviar ${respostas.length} ${respostas.length === 1 ? 'resposta' : 'respostas'}. ${avisoCorrecao}</p>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button type="button" class="btn btn-p" data-acao="confirmar"><i class="fas fa-paper-plane"></i> Confirmar envio</button>
            <button type="button" class="btn" data-acao="cancelar" style="background:transparent;border:1px solid var(--bd)">Revisar respostas</button>
        </div>
    `, { maxWidth: '520px' })

    const caixa = modal?.firstElementChild
    if (caixa) {
        caixa.setAttribute('role', 'dialog')
        caixa.setAttribute('aria-modal', 'true')
        caixa.setAttribute('aria-labelledby', 'tituloConfirmarProvaIA')
    }

    const fecharComEscape = (eventoTeclado) => {
        if (eventoTeclado.key === 'Escape') fecharConfirmacao()
    }
    ouvinteTeclado = fecharComEscape
    document.addEventListener('keydown', fecharComEscape)

    const confirmar = async () => {
        const botao = modal.querySelector('[data-acao="confirmar"]')
        if (botao) botao.disabled = true
        fecharConfirmacao()

        const { sbSubmeterProvaAlunoIA } = await import('../supabase-client.js')
        const { data, error } = await sbSubmeterProvaAlunoIA(provaAtual, respostas)
        if (error) {
            if (botao) botao.disabled = false
            handleError(error)
            return
        }

        const resultado = $('#resultadoProvaAlunoIA')
        const aguardaCorrecao = String(data?.status || '') === 'EM_ANDAMENTO'
        if (resultado) {
            resultado.innerHTML = `
                <div class="pnl prova-resultado" role="status">
                    <div class="pnl-t"><i class="fas fa-graduation-cap"></i> ${aguardaCorrecao ? 'Respostas enviadas' : 'Prova finalizada'}</div>
                    <p>Nota parcial: <strong>${sanitizar(String(data?.nota ?? 0))}</strong> de ${sanitizar(String(data?.total ?? 0))} pontos.</p>
                    <p>Acertos: ${sanitizar(String(data?.acertos ?? 0))} de ${sanitizar(String(data?.quantidade_questoes ?? 0))} questões objetivas.</p>
                    ${aguardaCorrecao
                        ? '<p>Suas respostas discursivas aguardam a correção do professor.</p>'
                        : ''}
                </div>
            `
        }
        const envio = $('#btnFinalizarProvaIA')
        if (envio) envio.disabled = true
        toast(aguardaCorrecao ? 'Respostas enviadas com sucesso.' : 'Prova finalizada com sucesso.', 'success')
    }

    modal.addEventListener('click', (evento) => {
        if (evento.target.closest('[data-acao="cancelar"]')) fecharConfirmacao()
        if (evento.target.closest('[data-acao="confirmar"]')) confirmar()
    })
    modal.querySelector('[data-acao="confirmar"]')?.focus()
}

function fecharConfirmacao() {
    if (ouvinteTeclado) {
        document.removeEventListener('keydown', ouvinteTeclado)
        ouvinteTeclado = null
    }
    closeMdl()
}

export function provaIdDaRota(caminho = '') {
    const trecho = String(caminho || '').match(/\/aluno\/prova\/([^/?#]+)/i)
    if (!trecho) return null
    try {
        return decodeURIComponent(trecho[1])
    } catch {
        return trecho[1]
    }
}

export function navParaProvaAluno(provaId) {
    if (!provaId) return
    nav(`/aluno/prova/${encodeURIComponent(provaId)}`)
}
