// ============================================================
// NÚCLEO PURO — PALESTRAS (FASE 5.2)
// ============================================================
// Regras de apresentação e status compartilhadas pela Área do Professor
// e pelo dashboard do aluno. Sem Supabase, sem DOM, testável no Node.
// ============================================================

import { escapeHTML } from './chat-seguro.js'

export const DESTINOS_PALESTRA = Object.freeze(['INTERNO', 'TURMA', 'ALUNO', 'CATALOGO'])

const ROTULOS_DESTINO = Object.freeze({
    INTERNO: 'Uso Pessoal (sem entrega)',
    TURMA: 'Turma',
    ALUNO: 'Aluno',
    CATALOGO: 'Catálogo'
})

export function rotuloDestinoPalestra(destino) {
    return ROTULOS_DESTINO[destino] || 'Destino não definido'
}

export function prontaParaDistribuir(palestra) {
    return Boolean(palestra?.publicado) && !palestra?.distribuido_em
}

export function rotuloStatusPalestra(palestra) {
    if (!palestra?.publicado) return 'Aguardando aprovação'
    if (palestra?.destino_tipo === 'INTERNO') return 'Uso Pessoal'
    if (palestra?.distribuido_em) return 'Distribuída'
    return 'Aprovada — pronta para distribuir'
}

function classeStatus(palestra) {
    if (!palestra?.publicado) return 'badge bg-pendente'
    if (palestra?.destino_tipo === 'INTERNO') return 'badge'
    if (palestra?.distribuido_em) return 'badge bg-ok'
    return 'badge bg-info'
}

function comoArray(valor) {
    if (Array.isArray(valor)) return valor
    if (typeof valor !== 'string' || !valor.trim()) return []
    try {
        const convertido = JSON.parse(valor)
        return Array.isArray(convertido) ? convertido : []
    } catch {
        return []
    }
}

export function roteiroHtml(roteiro) {
    const blocos = comoArray(roteiro)
    if (blocos.length === 0) return '<p class="empty">Roteiro não informado.</p>'
    return `<ol style="margin:0;padding-left:20px">${blocos.map(bloco => `
        <li style="margin:6px 0">
            <strong>${escapeHTML(bloco?.bloco || 'Bloco')}</strong>
            <span style="opacity:.75"> — ${escapeHTML(bloco?.minutos ?? 0)} min</span>
            <div style="opacity:.85">${escapeHTML(bloco?.conteudo || '')}</div>
        </li>
    `).join('')}</ol>`
}

export function renderPalestrasProfessorHtml(palestras) {
    const itens = Array.isArray(palestras) ? palestras : []
    if (itens.length === 0) {
        return '<div class="empty"><i class="fas fa-microphone"></i><p>Nenhuma palestra cadastrada.</p></div>'
    }

    return itens.map(palestra => {
        const id = escapeHTML(palestra?.id ?? '')
        const titulo = escapeHTML(palestra?.titulo || 'Palestra sem título')
        const descricao = escapeHTML(palestra?.descricao || '')
        const status = rotuloStatusPalestra(palestra)
        const acoes = []

        if (!palestra?.publicado) {
            acoes.push(`<button type="button" class="btn btn-sm btn-p" data-acao="aprovar" data-id="${id}">
                <i class="fas fa-check"></i> Aprovar Palestra
            </button>`)
        }
        if (prontaParaDistribuir(palestra)) {
            acoes.push(`<button type="button" class="btn btn-sm btn-p" data-acao="distribuir" data-id="${id}" data-titulo="${titulo}">
                <i class="fas fa-paper-plane"></i> Distribuir
            </button>`)
        }

        return `
            <article class="pnl" data-palestra="${id}" style="margin-bottom:12px">
                <div class="pnl-h">
                    <div class="pnl-t"><i class="fas fa-microphone"></i> ${titulo}</div>
                    <span class="${classeStatus(palestra)}">${escapeHTML(status)}</span>
                </div>
                <div style="font-size:13px;color:var(--tx2);margin-bottom:12px">
                    ${descricao || 'Sem descrição'}
                    <div>Origem: ${escapeHTML(palestra?.origem === 'IA_TUTOR' ? 'TUTOR-SulSafe' : 'Criação manual')}</div>
                    <div>Destino: ${escapeHTML(rotuloDestinoPalestra(palestra?.destino_tipo))}</div>
                </div>
                <details style="margin-bottom:12px"><summary>Roteiro</summary>${roteiroHtml(palestra?.roteiro)}</details>
                <div style="display:flex;gap:8px;flex-wrap:wrap">${acoes.join('')}</div>
            </article>
        `
    }).join('')
}

export function renderRascunhosPalestraHtml(rascunhos) {
    const itens = Array.isArray(rascunhos) ? rascunhos : []
    if (itens.length === 0) {
        return '<div class="empty"><i class="fas fa-wand-magic-sparkles"></i><p>Nenhum rascunho de palestra aguardando uso.</p></div>'
    }

    return itens.map(rascunho => {
        const id = escapeHTML(rascunho?.id || rascunho?.conteudo_id || '')
        const titulo = escapeHTML(rascunho?.titulo || 'Palestra da I.A.')
        return `
            <article class="pnl" style="margin-bottom:10px">
                <div class="pnl-h">
                    <div class="pnl-t"><i class="fas fa-wand-magic-sparkles"></i> ${titulo}</div>
                    <span class="badge bg-info">Rascunho da I.A.</span>
                </div>
                <button type="button" class="btn btn-sm" data-acao="criar-ia" data-id="${id}">
                    <i class="fas fa-plus"></i> Criar palestra a partir da I.A.
                </button>
            </article>
        `
    }).join('')
}

export function renderPalestrasAlunoHtml(palestras) {
    const itens = Array.isArray(palestras) ? palestras : []
    if (itens.length === 0) {
        return '<div class="empty"><i class="fas fa-microphone"></i><p>Nenhuma palestra disponível no momento.</p></div>'
    }

    return itens.map(palestra => `
        <article class="pnl" data-palestra="${escapeHTML(palestra?.id ?? '')}" style="margin-bottom:12px">
            <div class="pnl-h">
                <div class="pnl-t"><i class="fas fa-microphone"></i> ${escapeHTML(palestra?.titulo || 'Palestra')}</div>
                <span class="badge bg-ok">Disponível</span>
            </div>
            <div style="font-size:13px;color:var(--tx2);margin-bottom:10px">
                ${escapeHTML(palestra?.descricao || '')}
                ${palestra?.duracao_min ? `<div>Duração estimada: ${escapeHTML(palestra.duracao_min)} min</div>` : ''}
            </div>
            <details><summary>Abrir palestra</summary>${roteiroHtml(palestra?.roteiro)}</details>
        </article>
    `).join('')
}
