// ============================================================
// VIEW: CERTIFICADOS
// ============================================================

import { S, NRS, isAdmin, isProf, nav } from '../state.js'
import { toast, handleError, sanitizar } from '../utils.js'
import { sb, sbGetCertificadosAluno, sbGetUser, sbCriarUrlDocumento } from '../supabase-client.js'
import { mascararCpf } from '../dossie-constants.js'
import { gerarCertificadoPDF } from '../certificado-pdf.js'

window.nav = nav

// URL absoluta: a janela de visualização é about:blank e não resolve
// caminhos relativos como "logo1.png".
const LOGO_URL = new URL('../../logo1.png', import.meta.url).href

function tituloCertificado(cert) {
    const nrId = Number(cert?.nr_id)
    const nr = NRS.find(item => Number(item.n) === nrId)

    if (!nr) return 'Certificado SulSafe'

    return `Certificado NR-${String(nr.n).padStart(2, '0')} - ${nr.nome}`
}

function formatarData(valor) {
    if (!valor) return 'Data não informada'

    const data = new Date(valor)
    return Number.isNaN(data.getTime())
        ? 'Data não informada'
        : data.toLocaleDateString('pt-BR')
}

function codigoCertificado(cert) {
    return cert?.codigo || String(cert?.id ?? '').slice(0, 8)
}

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
                .order('criado_em', { ascending: false })

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
            const titulo = sanitizar(tituloCertificado(cert))
            const id = sanitizar(String(cert.id))
            const emitidoEm = formatarData(cert.criado_em)
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
// DADOS DO ALUNO / FOTO
// ============================================================

async function carregarAlunoCertificado(cert) {
    const { data: aluno } = await sbGetUser(cert.usuario_id)

    if (aluno) return aluno
    if (String(cert.usuario_id) === String(S.user?.id)) return S.user

    return null
}

async function resolverFotoAluno(aluno) {
    const caminho = aluno?.foto_url

    if (!caminho) return ''

    if (/^https?:\/\//i.test(caminho)) return caminho

    const { data } = await sbCriarUrlDocumento(caminho, 900)
    return data?.signedUrl || ''
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
        const aluno = await carregarAlunoCertificado(cert)
        const fotoUrl = await resolverFotoAluno(aluno)

        const titulo = sanitizar(tituloCertificado(cert))
        const nome = sanitizar(aluno?.nome_completo || 'Aluno SulSafe')
        const cpf = aluno?.cpf ? sanitizar(mascararCpf(aluno.cpf)) : ''
        const data = formatarData(cert.criado_em)
        const codigo = sanitizar(codigoCertificado(cert))
        const nr = sanitizar(String(cert.nr_id ?? 'Não informada'))
        const hash = sanitizar(String(cert.hash_validacao || codigo))
        const notaBruta = cert.nota_final ?? cert.nota
        const notaTexto = notaBruta === null || notaBruta === undefined || notaBruta === ''
            ? 'Não informada'
            : sanitizar(String(notaBruta))
        const cargaTexto = sanitizar(String(Number(cert.carga_horaria) || 40))
        const dataEmissao = sanitizar(formatarData(cert.emitido_em || cert.criado_em))
        const urlValidacao = sanitizar(
            `${window.location.origin}/validar/${encodeURIComponent(hash)}`
        )

        win.document.open()
        win.document.write(`
            <!doctype html>
            <html lang="pt-BR">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>${titulo}</title>
                <style>
                    :root { --verde: #174c36; --ouro: #c6a54b; }
                    * { box-sizing: border-box; }
                    body {
                        font-family: 'Inter', Arial, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        background: #eef1f4;
                        margin: 0;
                        padding: 28px;
                    }
                    .cert {
                        position: relative;
                        background: #fff;
                        padding: 48px 56px;
                        border: 1px solid var(--ouro);
                        border-radius: 14px;
                        box-shadow: 0 18px 60px rgba(23, 76, 54, .14);
                        text-align: center;
                        max-width: 820px;
                        width: 100%;
                    }
                    .cert::before {
                        content: '';
                        position: absolute;
                        inset: 10px;
                        border: 1px solid rgba(198, 165, 75, .5);
                        border-radius: 8px;
                        pointer-events: none;
                    }
                    .logo { width: 112px; height: auto; display: block; margin: 0 auto 10px; }
                    .marca { font-size: 11px; letter-spacing: .32em; text-transform: uppercase; color: var(--ouro); font-weight: 700; }
                    h1 { color: var(--verde); font-size: 26px; margin: 8px 0 18px; }
                    .linha { height: 1px; background: linear-gradient(90deg, transparent, var(--ouro), transparent); margin: 20px 0; }
                    .curso { font-size: 19px; font-weight: 700; color: var(--verde); margin: 0 0 6px; }
                    .aluno { font-family: Georgia, serif; font-size: 30px; margin: 14px 0; color: #1b1b1b; }
                    .foto {
                        width: 92px;
                        height: 116px;
                        object-fit: cover;
                        border: 3px solid var(--ouro);
                        border-radius: 8px;
                        margin: 6px auto 12px;
                        display: block;
                    }
                    .dados { display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; font-size: 13px; color: #666; }
                    .dados strong { display: block; color: #222; font-size: 14px; margin-top: 3px; }
                    .hash { font-family: ui-monospace, Consolas, monospace; font-size: 11px; color: #555; overflow-wrap: anywhere; margin: 6px 0; }
                    .acoes { margin-top: 28px; display: flex; gap: 12px; justify-content: center; }
                    .acoes button, .acoes a {
                        padding: 10px 18px;
                        border: 0;
                        border-radius: 6px;
                        background: var(--verde);
                        color: #fff;
                        font-size: 13px;
                        text-decoration: none;
                        cursor: pointer;
                    }
                    @page { size: A4 landscape; margin: 16mm; }
                    @media print {
                        body { background: #fff; padding: 0; }
                        .cert { box-shadow: none; border-width: 2px; max-width: none; }
                        .acoes { display: none; }
                    }
                </style>
            </head>
            <body>
                <main class="cert">
                    <img class="logo" src="${sanitizar(LOGO_URL)}" alt="SulSafe">
                    <div class="marca">SulSafe Treinamentos</div>
                    <h1>Certificado de Conclusão</h1>
                    ${fotoUrl ? `<img class="foto" src="${sanitizar(fotoUrl)}" alt="Foto do aluno">` : ''}
                    <p class="curso">${titulo}</p>
                    <p style="font-size:13px;color:#666;margin:0">Certificamos que</p>
                    <p class="aluno">${nome}</p>
                    <p style="font-size:13px;color:#555;max-width:560px;margin:0 auto">
                        concluiu com aproveitamento o curso acima, com nota final
                        <strong>${notaTexto}</strong> e carga horária de ${cargaTexto} horas.
                    </p>
                    <div class="linha"></div>
                    <div class="dados">
                        <div><span>Nota final</span><strong>${notaTexto}</strong></div>
                        <div><span>Carga horária</span><strong>${cargaTexto} h</strong></div>
                        <div><span>Data de emissão</span><strong>${dataEmissao}</strong></div>
                    </div>
                    <div class="linha"></div>
                    <p class="hash">Código / hash de validação: ${hash}</p>
                    <p class="hash">Validação pública: ${urlValidacao}</p>
                    ${cpf ? `<p class="hash">CPF: ${cpf}</p>` : ''}
                    <p style="font-size:11px;color:#888;letter-spacing:.08em">CERTIFICADO ATIVO · NR ${nr}</p>
                    <div class="acoes">
                        <button type="button" onclick="window.print()"><i class="fas fa-print"></i> Imprimir / Salvar PDF</button>
                        <a href="${urlValidacao}" target="_blank" rel="noopener">Validar certificado</a>
                    </div>
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

function baixarCertificadoSimples(cert, aluno) {
    if (!window.jspdf?.jsPDF) {
        toast('O recurso de PDF não está disponível nesta página.', 'err')
        return false
    }

    const { jsPDF } = window.jspdf
    const doc = new jsPDF()

    const titulo = tituloCertificado(cert)
    const nome = aluno?.nome_completo ||
        (String(cert.usuario_id) === String(S.user?.id) ? S.user?.nome_completo : '') ||
        'Aluno SulSafe'
    const cpf = aluno?.cpf ? mascararCpf(aluno.cpf) : ''
    const data = formatarData(cert.criado_em)
    const codigo = codigoCertificado(cert)

    doc.setFontSize(22)
    doc.text('Certificado SulSafe', 20, 30)

    doc.setFontSize(16)
    doc.text(doc.splitTextToSize(`Título: ${titulo}`, 170), 20, 50)
    doc.text(doc.splitTextToSize(`Nome: ${nome}`, 170), 20, 70)

    let y = 90
    if (cpf) {
        doc.text(`CPF: ${cpf}`, 20, y)
        y += 20
    }

    doc.text(`NR: ${cert.nr_id ?? 'Não informada'}`, 20, y)
    doc.text(`Emitido em: ${data}`, 20, y + 20)
    doc.text(`Código: ${codigo}`, 20, y + 40)

    doc.save(`certificado_${codigo}.pdf`)
    return true
}

window.baixarCert = async function (id) {
    let cert = null
    let aluno = null

    try {
        cert = await buscarCertificado(id)
        aluno = await carregarAlunoCertificado(cert)

        const nr = NRS.find(item => Number(item.n) === Number(cert.nr_id))
        let instrutor = null

        if (cert.emitido_por) {
            const { data } = await sbGetUser(cert.emitido_por)
            instrutor = data
        }

        await gerarCertificadoPDF(
            {
                nome_completo: aluno?.nome_completo || 'Aluno SulSafe',
                cpf: aluno?.cpf || '',
                email: aluno?.email || ''
            },
            {
                nr_id: cert.nr_id,
                nome: nr?.nome || `NR-${cert.nr_id}`,
                carga_horaria: Number(cert.carga_horaria) || 40
            },
            {
                instrutor: instrutor
                    ? { nome_completo: instrutor.nome_completo || '' }
                    : undefined,
                codigo: cert.codigo,
                nota: cert.nota,
                dataConclusao: cert.criado_em || new Date(),
                baixar: true
            }
        )

        toast('Certificado gerado com sucesso!', 'success')
    } catch (error) {
        console.warn('Gerador completo indisponível; usando fallback em jsPDF:', error)

        if (cert) {
            try {
                if (baixarCertificadoSimples(cert, aluno)) {
                    toast('Certificado gerado em modo simplificado.', 'warn')
                    return
                }
            } catch (fallbackError) {
                handleError(fallbackError)
                return
            }
        }

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