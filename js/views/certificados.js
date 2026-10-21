// ============================================================
// VIEW: CERTIFICADOS
// ============================================================

import { S, isAdmin, isProf, nav } from '../state.js'
import { toast, handleError, sanitizar } from '../utils.js'
import { sb, sbGetCertificadosAluno } from '../supabase-client.js'

window.nav = nav

export function vCerts() {
    let h = `<div class="btn-back" onclick="nav('inicio')"><i class="fas fa-arrow-left"></i> Voltar</div>`
    h += `<h2 class="wc">Certificados</h2><p class="wcs">Consulte os certificados disponíveis para sua conta.</p>`
    h += `<div id="certList"><div class="empty"><i class="fas fa-spinner fa-spin"></i><p>Carregando...</p></div></div>`

    setTimeout(() => {
        carregarCertificados()
    }, 100)

    return h
}

// ============================================================
// CARREGAR CERTIFICADOS
// ============================================================

export async function carregarCertificados() {
    const container = document.getElementById('certList')

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

    try {
        let certs
        let error

        if (isAdmin() || isProf()) {
            const result = await sb
                .from('certificados')
                .select('*')
                .order('emitido_em', { ascending: false })

            certs = result.data
            error = result.error
        } else {
            const result = await sbGetCertificadosAluno(S.user.id)

            certs = result.data
            error = result.error
        }

        if (error) throw error

        if (!certs || certs.length === 0) {
            container.innerHTML = `
                <div class="empty">
                    <i class="fas fa-certificate"></i>
                    <p>Nenhum certificado encontrado.</p>
                </div>
            `
            return
        }

        let html = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        `

        certs.forEach(cert => {
            const titulo = sanitizar(cert.titulo || 'Certificado')
            const id = sanitizar(String(cert.id))
            const emitidoEm = cert.emitido_em
                ? new Date(cert.emitido_em).toLocaleDateString('pt-BR')
                : 'Data não informada'
            const revogado = cert.revogado === true

            html += `
                <div class="nr-c" style="flex-direction:column;gap:8px;padding:16px;border:1px solid var(--bd);border-radius:var(--radius);">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <i class="fas fa-certificate" style="font-size:28px;color:var(--dourado);"></i>
                        <div>
                            <strong>${titulo}</strong>
                            <br>
                            <span style="font-size:12px;color:var(--tx3);">
                                Emitido em ${emitidoEm}
                            </span>
                            ${revogado ? `
                                <br><span style="font-size:12px;color:#dc2626;font-weight:700;">
                                    Certificado revogado
                                </span>
                            ` : ''}
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--bd2);padding-top:8px;">
                        <button class="btn btn-sm btn-p" data-id="${id}" onclick="visualizarCert(this.dataset.id)" ${revogado ? 'disabled' : ''}>
                            <i class="fas fa-eye"></i> Visualizar
                        </button>
                        <button class="btn btn-sm btn-s" data-id="${id}" onclick="baixarCert(this.dataset.id)" ${revogado ? 'disabled' : ''}>
                            <i class="fas fa-download"></i> Baixar
                        </button>
                        ${(isAdmin() || isProf()) ? `
                            ${revogado ? '' : `
                                <button class="btn btn-sm btn-danger" data-id="${id}" onclick="revogarCert(this.dataset.id)">
                                    <i class="fas fa-ban"></i> Revogar
                                </button>
                            `}
                        ` : ''}
                    </div>
                </div>
            `
        })

        html += '</div>'
        container.innerHTML = html
    } catch (error) {
        console.error('Erro ao carregar certificados:', error)

        container.innerHTML = `
            <div class="empty">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Não foi possível carregar os certificados.</p>
            </div>
        `
    }
}

// ============================================================
// BUSCAR UM CERTIFICADO
// ============================================================

async function buscarCertificado(id) {
    if (!S.user?.id || !id) {
        throw new Error('Sessão ou identificador do certificado inválido.')
    }

    const { data: cert, error } = await sb
        .from('certificados')
        .select('*')
        .eq('id', id)
        .single()

    if (error) throw error

    if (!cert) {
        throw new Error('Certificado não encontrado.')
    }

    if (!isAdmin() && !isProf()) {
        const { data: meusCertificados, error: meusCertificadosError } =
            await sbGetCertificadosAluno(S.user.id)

        if (meusCertificadosError) throw meusCertificadosError

        const autorizado = (meusCertificados || []).some(
            item => String(item.id) === String(cert.id)
        )

        if (!autorizado) {
            throw new Error('Você não tem permissão para acessar este certificado.')
        }
    }

    if (cert.revogado === true) {
        throw new Error('Este certificado foi revogado.')
    }

    return cert
}

// ============================================================
// VISUALIZAR CERTIFICADO
// ============================================================

window.visualizarCert = async function (id) {
    let win = null

    try {
        // Abre a janela durante o clique para reduzir bloqueios do navegador.
        win = window.open('', '_blank')

        if (!win) {
            toast('Permita janelas pop-up para visualizar o certificado.', 'err')
            return
        }

        const cert = await buscarCertificado(id)

        const titulo = sanitizar(cert.titulo || 'Certificado SulSafe')
        const nome = sanitizar(S.user.nome_completo || 'Usuário')
        const data = cert.emitido_em
            ? new Date(cert.emitido_em).toLocaleDateString('pt-BR')
            : 'Data não informada'
        const codigo = sanitizar(String(cert.id).slice(0, 8))
        const nr = sanitizar(String(cert.nr_id ?? 'Não informada'))

        win.document.open()
        win.document.write(`
            <!doctype html>
            <html lang="pt-BR">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>${titulo}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: #f0f2f5;
                        margin: 0;
                        padding: 20px;
                        box-sizing: border-box;
                    }
                    .cert {
                        background: #fff;
                        padding: 40px;
                        border: 4px solid #c6a54b;
                        border-radius: 12px;
                        text-align: center;
                        max-width: 650px;
                        width: 100%;
                        box-sizing: border-box;
                    }
                    h1 { color: #174c36; }
                    .data { color: #555; overflow-wrap: anywhere; }
                    button {
                        padding: 10px 18px;
                        border: 0;
                        border-radius: 6px;
                        background: #174c36;
                        color: #fff;
                        cursor: pointer;
                    }
                    @media print {
                        body { background: #fff; }
                        button { display: none; }
                    }
                </style>
            </head>
            <body>
                <main class="cert">
                    <h1>Certificado SulSafe</h1>
                    <h2>${titulo}</h2>
                    <p>Outorgado a <strong>${nome}</strong></p>
                    <p>NR ${nr} · Emitido em ${data}</p>
                    <p class="data">Código: ${codigo}</p>
                    <p>Certificado ativo</p>
                    <button onclick="window.print()">Imprimir</button>
                </main>
            </body>
            </html>
        `)
        win.document.close()
    } catch (error) {
        if (win && !win.closed) win.close()
        console.error('Erro ao visualizar certificado:', error)
        handleError(error)
    }
}

// ============================================================
// BAIXAR CERTIFICADO EM PDF
// ============================================================

window.baixarCert = async function (id) {
    try {
        const cert = await buscarCertificado(id)

        if (!window.jspdf?.jsPDF) {
            toast('O recurso de PDF não está disponível nesta página.', 'err')
            return
        }

        const { jsPDF } = window.jspdf
        const doc = new jsPDF()

        const titulo = cert.titulo || 'Certificado SulSafe'
        const nome = S.user.nome_completo || 'Usuário'
        const data = cert.emitido_em
            ? new Date(cert.emitido_em).toLocaleDateString('pt-BR')
            : 'Data não informada'
        const codigo = String(cert.id).slice(0, 8)

        doc.setFontSize(22)
        doc.text('Certificado SulSafe', 20, 30)

        doc.setFontSize(16)
        doc.text(doc.splitTextToSize(`Título: ${titulo}`, 170), 20, 50)
        doc.text(doc.splitTextToSize(`Nome: ${nome}`, 170), 20, 70)
        doc.text(`NR: ${cert.nr_id ?? 'Não informada'}`, 20, 90)
        doc.text(`Emitido em: ${data}`, 20, 110)
        doc.text(`Código: ${codigo}`, 20, 130)

        doc.save(`certificado_${codigo}.pdf`)
    } catch (error) {
        console.error('Erro ao baixar certificado:', error)
        handleError(error)
    }
}

// ============================================================
// REVOGAR CERTIFICADO
// ============================================================

window.revogarCert = async function (id) {
    if (!isAdmin() && !isProf()) {
        toast('Você não tem permissão para revogar certificados.', 'err')
        return
    }

    if (!confirm('Tem certeza que deseja revogar este certificado?')) {
        return
    }

    try {
        const { data: cert, error: buscaError } = await sb
            .from('certificados')
            .select('id, revogado')
            .eq('id', id)
            .single()

        if (buscaError) throw buscaError

        if (!cert) {
            toast('Certificado não encontrado.', 'err')
            return
        }

        if (cert.revogado === true) {
            toast('Este certificado já foi revogado.', 'info')
            await carregarCertificados()
            return
        }

        const { error } = await sb
            .from('certificados')
            .update({ revogado: true })
            .eq('id', id)

        if (error) throw error

        toast('Certificado revogado.', 'success')
        await carregarCertificados()
    } catch (error) {
        console.error('Erro ao revogar certificado:', error)
        handleError(error)
    }
}