// ============================================================
// VIEW: NRs (Catálogo)
// ============================================================

import { nav, NRS } from '../state.js'
import { openMdl, closeMdl, $, $$ } from '../utils.js'

// Expõe as funções utilizadas pelo HTML
window.nav = nav
window.closeMdl = closeMdl

export function vNRs() {
    let h = `<div class="btn-back" onclick="nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc">Catálogo de NRs</h2><p class="wcs">Consulte todas as 38 Normas Regulamentadoras.</p>`
    h += `<div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap">
        <button class="btn btn-sm btn-p" style="width:auto;flex:none;" onclick="filterNR('all')">Todas</button>
        <button class="btn btn-sm btn-s" style="width:auto;flex:none;" onclick="filterNR('gerais')">Gerais</button>
        <button class="btn btn-sm btn-s" style="width:auto;flex:none;" onclick="filterNR('especificas')">Específicas</button>
        <button class="btn btn-sm btn-s" style="width:auto;flex:none;" onclick="filterNR('saude')">Saúde</button>
        <button class="btn btn-sm btn-s" style="width:auto;flex:none;" onclick="filterNR('setoriais')">Setoriais</button>
    </div>`
    h += `<input class="search" placeholder="Buscar NR..." oninput="filterNRT(this.value)">
    <div class="nr-g" id="nrGrid">`

    NRS.forEach(nr => {
        h += `<div class="nr-c" data-cat="${nr.cat}" data-s="nr ${nr.n} ${nr.nome.toLowerCase()}" onclick="verNR(${nr.n})">
            <div class="nr-ic"><i class="fas fa-hard-hat"></i></div>
            <div><div class="nr-num">NR ${nr.n}</div><div class="nr-nm">${nr.nome}</div></div>
        </div>`
    })

    h += `</div>`
    return h
}

function filterNR(c) {
    $$('#nrGrid .nr-c').forEach(e => {
        e.style.display = c === 'all' || e.dataset.cat === c ? '' : 'none'
    })
}

function filterNRT(q) {
    q = q.toLowerCase().trim()
    $$('#nrGrid .nr-c').forEach(e => {
        e.style.display = e.dataset.s.includes(q) ? '' : 'none'
    })
}

function verNR(id) {
    const nr = NRS.find(n => n.n === Number(id))
    if (!nr) return

    openMdl(`<button class="mdl-x" onclick="closeMdl()"><i class="fas fa-times"></i></button>
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">
            <div style="width:50px;height:50px;background:linear-gradient(135deg,var(--p),var(--p2));border-radius:14px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:22px;flex-shrink:0">
                <i class="fas fa-hard-hat"></i>
            </div>
            <div>
                <div style="font-size:11px;font-weight:800;color:var(--gold);letter-spacing:1px">NR ${nr.n}</div>
                <h2 style="font-size:18px;font-weight:700">${nr.nome}</h2>
            </div>
        </div>
        <p style="font-size:14px;line-height:1.7;color:var(--tx2);margin-bottom:16px">Esta Norma Regulamentadora estabelece requisitos relacionados a ${nr.nome.toLowerCase()}.</p>
        <button class="btn btn-p btn-block" onclick="closeMdl();nav('ia')"><i class="fas fa-robot"></i> Perguntar à IA sobre NR ${nr.n}</button>
    `)
}

window.filterNR = filterNR
window.filterNRT = filterNRT
window.verNR = verNR