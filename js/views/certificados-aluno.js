// ============================================================
// VIEW: MEUS CERTIFICADOS (FASE 5.4)
// ============================================================
// Lista exclusiva do aluno autenticado. A leitura usa sbGetCertificadosAluno,
// cuja RLS limita as linhas ao usuario_id da sessão. Nenhuma emissão acontece
// aqui: certificados só existem após emissão do professor/admin pela RPC.
// ============================================================

import { S, NRS, nav } from '../state.js'
import { sbGetCertificadosAluno } from '../supabase-client.js'
import { $, sanitizar } from '../utils.js'

function nomeCurso(cert) {
    const nrId = Number(cert?.nr_id)
    const nr = NRS.find(item => Number(item.n) === nrId)
    return nr
        ? `NR-${String(nr.n).padStart(2, '0')} · ${nr.nome}`
        : 'Certificado SulSafe'
}

function formatarData(valor) {
    if (!valor) return 'Data não informada'
    const data = new Date(valor)
    return Number.isNaN(data.getTime()) ? 'Data não informada' : data.toLocaleDateString('pt-BR')
}

export function vAlunoCertificados() {
    if (!S.user || (S.user.role && S.user.role !== 'aluno')) return nav('inicio')

    return `
        <div class="btn-back" onclick="window.nav('aluno-dashboard')">
            <i class="fas fa-arrow-left"></i> Voltar ao painel
        </div>
        <div class="god-hd">
            <h2><i class="fas fa-award"></i> Meus Certificados</h2>
            <p>Certificados emitidos pela secretaria. Consulte, visualize e imprima quando necessário.</p>
        </div>
        <div id="certAlunoList">
            <div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando certificados...</p></div>
        </div>
    `
}

export async function iniciarAlunoCertificados() {
    const container = $('#certAlunoList')
    if (!container) return

    if (!S.user?.id) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-user-lock"></i>
                <p>Faça login para consultar seus certificados.</p>
            </div>
        `
        return
    }

    const { data, error } = await sbGetCertificadosAluno(S.user.id)

    if (error) {
        console.error('Certificados do aluno:', error)
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-triangle-exclamation"></i>
                <p>Não foi possível carregar seus certificados.</p>
            </div>
        `
        return
    }

    const itens = (Array.isArray(data) ? data : []).filter(cert => cert && cert.revogado !== true)

    if (!itens.length) {
        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-award"></i>
                <p>Nenhum certificado emitido até o momento.</p>
                <small>Conclua as aulas e a prova do NR para solicitar a emissão à secretaria.</small>
            </div>
        `
        return
    }

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px">
            ${itens.map(cert => {
                const id = sanitizar(String(cert.id))
                const titulo = sanitizar(nomeCurso(cert))
                const dataEmissao = sanitizar(formatarData(cert.emitido_em || cert.criado_em))
                const nota = cert.nota_final ?? cert.nota
                const notaTexto = nota === null || nota === undefined || nota === '' ? '' : sanitizar(String(nota))

                return `
                    <article class="nr-c" style="flex-direction:column;gap:10px;padding:18px;border:1px solid var(--bd);border-radius:var(--radius)">
                        <div style="display:flex;align-items:center;gap:12px">
                            <i class="fas fa-award" style="font-size:30px;color:var(--dourado)"></i>
                            <div>
                                <strong>${titulo}</strong>
                                <div style="font-size:12px;color:var(--tx3)">Emitido em ${dataEmissao}</div>
                                ${notaTexto ? `<div style="font-size:12px;color:var(--tx2)">Nota final: ${notaTexto}</div>` : ''}
                            </div>
                        </div>
                        <div style="display:flex;justify-content:flex-end;border-top:1px solid var(--bd2);padding-top:10px">
                            <button type="button" class="btn btn-sm btn-p"
                                onclick="window.visualizarCertificadoAluno('${id}')">
                                <i class="fas fa-eye"></i> Visualizar Certificado
                            </button>
                        </div>
                    </article>
                `
            }).join('')}
        </div>
    `
}

// A janela de visualização premium pertence ao módulo de certificados;
// este atalho mantém a rota do aluno independente do painel administrativo.
window.visualizarCertificadoAluno = function (id) {
    if (typeof window.visualizarCert !== 'function') {
        console.error('Visualizador de certificado indisponível.')
        return
    }
    window.visualizarCert(id)
}
