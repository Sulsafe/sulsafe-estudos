// ============================================================
// VIEW: DASHBOARD UNIFICADO DO ALUNO (FASE 5.2)
// ============================================================
// Um único painel com cursos, provas pendentes e palestras. Provas da
// I.A. e criações manuais são mescladas por ID, sem duplicatas.
// ============================================================

import { isAdmin, isProf, nav } from '../state.js'
import {
    sbGetVideoaulas,
    sbGetMateriais,
    sbGetProvasDirecionadasAluno,
    sbListarProvasDistribuidasAluno,
    sbListarPalestrasAluno
} from '../supabase-client.js'
import { renderDashboardAlunoHtml, mesclarProvasAluno } from '../dashboard-aluno-core.js'
import { $ } from '../utils.js'

export function vAlunoDashboard() {
    if (isAdmin() || isProf()) return nav('professor')
    return renderDashboardAlunoHtml({})
}

export async function iniciarAlunoDashboard() {
    const app = $('#appContent')
    if (!app) return

    const [videoaulas, materiais, provasIA, provasManuais, palestras] = await Promise.all([
        sbGetVideoaulas(),
        sbGetMateriais(),
        sbListarProvasDistribuidasAluno(),
        sbGetProvasDirecionadasAluno(),
        sbListarPalestrasAluno()
    ])

    if (provasIA.error) console.error('Dashboard: provas da I.A.', provasIA.error)
    if (provasManuais.error) console.error('Dashboard: provas manuais.', provasManuais.error)
    if (palestras.error) console.error('Dashboard: palestras.', palestras.error)

    const cursos = [
        ...(Array.isArray(videoaulas.data) ? videoaulas.data : []).map(item => ({
            titulo: item?.titulo || 'Videoaula',
            descricao: item?.descricao || ''
        })),
        ...(Array.isArray(materiais.data) ? materiais.data : []).map(item => ({
            titulo: item?.titulo || 'Material',
            descricao: item?.descricao || ''
        }))
    ]

    const provas = mesclarProvasAluno({
        ia: (Array.isArray(provasIA.data) ? provasIA.data : []).map(prova => ({
            ...prova,
            origem: 'IA_TUTOR'
        })),
        manuais: Array.isArray(provasManuais.data) ? provasManuais.data : []
    })

    const html = renderDashboardAlunoHtml({
        cursos,
        provas,
        palestras: Array.isArray(palestras.data) ? palestras.data : []
    })

    if (app.isConnected) app.innerHTML = html
}
