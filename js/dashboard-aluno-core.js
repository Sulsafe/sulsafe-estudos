// ============================================================
// NÚCLEO PURO — DASHBOARD DO ALUNO (FASE 5.2)
// ============================================================
// Unifica cursos, provas e palestras em um único painel. Nenhuma
// chamada de rede, nenhum DOM: apenas transformação e render segura.
// ============================================================

import { escapeHTML } from './chat-seguro.js'

function comoArray(valor) {
    return Array.isArray(valor) ? valor : []
}

// A mesma prova pode aparecer em mais de uma origem de leitura. O ID é a
// chave de deduplicação; a versão I.A. tem prioridade por conter o rótulo.
export function mesclarProvasAluno({ ia = [], manuais = [], direcionadas = [] } = {}) {
    const mapa = new Map()

    // A ordem de leitura começa pela I.A. para que a prova aprovada pelo
    // Tutor apareça primeiro e não seja sobrescrita pela leitura manual.
    for (const prova of [...comoArray(ia), ...comoArray(manuais), ...comoArray(direcionadas)]) {
        if (!prova) continue
        const chave = String(prova.prova_id ?? prova.id ?? '')
        if (!chave) continue
        if (mapa.get(chave)?.origem === 'IA_TUTOR') continue
        mapa.set(chave, { ...prova, prova_id: chave })
    }

    return [...mapa.values()]
}

function cartao(titulo, icone, conteudo, id = '') {
    return `
        <section class="pnl" ${id ? `id="${escapeHTML(id)}"` : ''} style="margin-bottom:16px">
            <div class="pnl-h"><div class="pnl-t"><i class="fas ${escapeHTML(icone)}"></i> ${escapeHTML(titulo)}</div></div>
            <div style="padding:14px">${conteudo}</div>
        </section>
    `
}

function listaCursos(cursos) {
    const itens = comoArray(cursos)
    if (!itens.length) {
        return '<div class="empty"><i class="fas fa-book-open"></i><p>Nenhum curso disponível no momento.</p></div>'
    }
    return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">
        ${itens.map(curso => `
            <article class="pnl" style="margin:0;padding:12px">
                <div class="pnl-t"><i class="fas fa-circle-play"></i> ${escapeHTML(curso?.titulo || 'Curso')}</div>
                ${curso?.descricao ? `<p style="font-size:12px;color:var(--tx2);margin:8px 0 0">${escapeHTML(curso.descricao)}</p>` : ''}
            </article>
        `).join('')}
    </div>`
}

function listaProvas(provas) {
    const itens = comoArray(provas)
    if (!itens.length) {
        return '<div class="empty"><i class="fas fa-file-circle-check"></i><p>Nenhuma prova pendente.</p></div>'
    }
    return `<div style="display:grid;gap:8px">
        ${itens.map(prova => {
            const id = escapeHTML(prova?.prova_id ?? prova?.id ?? '')
            const titulo = escapeHTML(prova?.titulo || 'Prova')
            const origem = prova?.origem === 'IA_TUTOR'
                ? '<span class="badge bg-info">Aprovada pela IA</span>'
                : '<span class="badge">Criação manual</span>'
            return `
                <article class="pnl" style="margin:0;padding:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                    <div style="flex:1;min-width:180px">
                        <div class="pnl-t"><i class="fas fa-file-lines"></i> ${titulo}</div>
                        <div style="margin-top:4px">${origem}</div>
                    </div>
                    <a class="btn btn-sm btn-p" href="/aluno/prova/${id}">
                        <i class="fas fa-play"></i> Resolver prova
                    </a>
                </article>
            `
        }).join('')}
    </div>`
}

function listaPalestras(palestras) {
    const itens = comoArray(palestras)
    if (!itens.length) {
        return '<div class="empty"><i class="fas fa-microphone"></i><p>Nenhuma palestra disponível no momento.</p></div>'
    }
    return `<div style="display:grid;gap:8px">
        ${itens.map(palestra => `
            <article class="pnl" style="margin:0;padding:12px">
                <div class="pnl-t"><i class="fas fa-microphone"></i> ${escapeHTML(palestra?.titulo || 'Palestra')}</div>
                ${palestra?.descricao ? `<p style="font-size:12px;color:var(--tx2);margin:6px 0 0">${escapeHTML(palestra.descricao)}</p>` : ''}
            </article>
        `).join('')}
    </div>`
}

export function renderDashboardAlunoHtml({ cursos = [], provas = [], palestras = [] } = {}) {
    let h = `
        <div class="btn-back" onclick="window.nav('inicio')">
            <i class="fas fa-arrow-left"></i> Voltar
        </div>
        <div class="god-hd">
            <h2><i class="fas fa-gauge-high"></i> Meu Painel</h2>
            <p>Cursos, provas e palestras em um só lugar.</p>
        </div>
    `
    h += cartao('Meus Cursos', 'fa-graduation-cap', listaCursos(cursos), 'dashCursos')
    h += cartao('Provas Pendentes', 'fa-file-circle-check', listaProvas(provas), 'dashProvas')
    h += cartao('Palestras Disponíveis', 'fa-microphone', listaPalestras(palestras), 'dashPalestras')
    return h
}
