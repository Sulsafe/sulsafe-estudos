// ============================================================
// SUPABASE CLIENT + CRUD
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { ADMIN_EMAIL, uid, sanitizar, toast, handleError } from './utils.js'
import { S } from './state.js'

// Configurações
const SUPABASE_URL = 'https://acqbidvknbqppkjidvsq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjcWJpZHZrbmJxcHBramlkdnNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1Njc2NzgsImV4cCI6MjEwMDE0MzY3OH0.W-bAmATd7meg8RyWunmsgfN9nUxj18ya6d4AKx4aG7E'

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export const STORAGE_BUCKET = 'arquivos'

// ============================================================
// USUÁRIOS
// ============================================================
export async function sbGetUser(id) {
    try {
        // AJUSTE: select('*') para evitar erro 500 de coluna
        const { data, error } = await sb.from('profiles')
            .select('*')
            .eq('id', id)
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbUpdateUser(id, dados) {
    try {
        const { data, error } = await sb.from('profiles').update(dados).eq('id', id).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetAllUsers(page = 0, limit = 20) {
    try {
        // AJUSTE: select('*') para evitar erro 500 de coluna
        const { data, error, count } = await sb.from('profiles')
            .select('*', { count: 'exact' })
            .order('nome_completo')
            .range(page * limit, (page + 1) * limit - 1)
        if (error) throw error
        return { data, error: null, count }
    } catch (error) {
        return { data: null, error, count: 0 }
    }
}

export async function sbGetAlunos() {
    try {
        const { data, error } = await sb.from('profiles')
            .select('*')
            .eq('role', 'aluno')
            .order('nome_completo')
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetPendentes() {
    try {
        const { data, error } = await sb.from('profiles')
            .select('*')
            .eq('status', 'pendente')
            .eq('role', 'aluno')
            .order('criado_em', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbLiberarUsuario(id) {
    try {
        const { data, error } = await sb.from('profiles').update({ status: 'ativo' }).eq('id', id).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbBloquearUsuario(id) {
    try {
        const { data, error } = await sb.from('profiles').update({ status: 'bloqueado' }).eq('id', id).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// VIDEOAULAS
// ============================================================
export async function sbGetVideoaulas(nrId = null) {
    try {
        let query = sb.from('videoaulas').select('*, profiles(nome_completo)')
        if (nrId) query = query.eq('nr_id', nrId)
        const { data, error } = await query.order('ordem', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarVideoaula(videoaula) {
    try {
        const { data, error } = await sb.from('videoaulas').insert(videoaula).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// MATERIAIS
// ============================================================
export async function sbGetMateriais(nrId = null) {
    try {
        let query = sb.from('materiais').select('*, profiles(nome_completo)')
        if (nrId) query = query.eq('nr_id', nrId)
        const { data, error } = await query.order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarMaterial(material) {
    try {
        const { data, error } = await sb.from('materiais').insert(material).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// UPLOAD ARQUIVOS (STORAGE)
// ============================================================
export async function sbUploadArquivo(bucket, path, file) {
    try {
        const { data, error } = await sb.storage.from(bucket).upload(path, file, {
            cacheControl: '3600',
            upsert: false
        })
        if (error) throw error
        const { data: urlData } = sb.storage.from(bucket).getPublicUrl(path)
        return { data: { ...data, publicUrl: urlData.publicUrl }, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// PROGRESSO
// ============================================================
export async function sbSalvarProgresso(userId, aulaId, segundos, concluido = false) {
    try {
        const { data, error } = await sb.from('progresso_aulas').upsert({
            user_id: userId,
            aula_id: aulaId,
            assistiu_segundos: segundos,
            concluído: concluido,
            ultima_atualizacao: new Date().toISOString()
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProgressoUsuario(userId) {
    try {
        const { data, error } = await sb.from('progresso_aulas')
            .select('*, videoaulas(*)')
            .eq('user_id', userId)
            .order('ultima_atualizacao', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// NOTAS
// ============================================================
export async function sbGetNotasAluno(userId) {
    try {
        const { data, error } = await sb.from('notas')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbLancarNota(userId, nrId, nota, obs = '', professorId = null) {
    try {
        const { data, error } = await sb.from('notas').insert({
            usuario_id: userId,
            nr_id: nrId,
            nota,
            obs: sanitizar(obs),
            professor_id: professorId
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetMediasNRs() {
    try {
        const { data, error } = await sb.from('view_medias_nrs').select('*').order('nr_id')
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// CERTIFICADOS
// ============================================================
export async function sbEmitirCertificado(userId, nrId, nota, cargaHoraria = 40) {
    try {
        const codigo = 'SS-' + Math.random().toString(36).substr(2, 8).toUpperCase()
        const { data, error } = await sb.from('certificados').insert({
            usuario_id: userId,
            nr_id: nrId,
            codigo,
            nota,
            carga_horaria: cargaHoraria,
            emitido_por: uid()
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetCertificadosAluno(userId) {
    try {
        const { data, error } = await sb.from('certificados')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// PROVAS
// ============================================================
export async function sbEnviarProva(userId, nrId, titulo, arquivoUrl) {
    try {
        const { data, error } = await sb.from('provas').insert({
            usuario_id: userId,
            nr_id: nrId,
            titulo: sanitizar(titulo),
            arquivo_url: arquivoUrl,
            status: 'pendente'
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProvasPendentes() {
    try {
        const { data, error } = await sb.from('provas')
            .select('*, profiles(nome_completo, email)')
            .eq('status', 'pendente')
            .order('criado_em', { ascending: true })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetProvasAluno(userId) {
    try {
        const { data, error } = await sb.from('provas')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCorrigirProva(provaId, nota, status = 'corrigido') {
    try {
        const { data, error } = await sb.from('provas')
            .update({ nota, status, corrigido_em: new Date().toISOString() })
            .eq('id', provaId)
            .select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// SALAS
// ============================================================
export async function sbCriarSala(topico, meetId, criadoPor) {
    try {
        const { data, error } = await sb.from('salas').insert({
            topico: sanitizar(topico),
            meet_id: sanitizar(meetId),
            criado_por: criadoPor,
            ativa: true
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetSalasAtivas() {
    try {
        const { data, error } = await sb.from('salas')
            .select('*, profiles(nome_completo)')
            .eq('ativa', true)
            .order('created_at', { ascending: false })
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// NOTIFICAÇÕES
// ============================================================
export async function sbCriarNotificacao(userId, titulo, mensagem, link = null) {
    try {
        const { data, error } = await sb.from('notificacoes').insert({
            usuario_id: userId,
            titulo: sanitizar(titulo),
            mensagem: sanitizar(mensagem),
            link,
            lida: false
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetNotificacoes(userId, limit = 10) {
    try {
        const { data, error } = await sb.from('notificacoes')
            .select('*')
            .eq('usuario_id', userId)
            .order('criado_em', { ascending: false })
            .limit(limit)
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbMarcarNotificacaoLida(notificacaoId) {
    try {
        const { data, error } = await sb.from('notificacoes')
            .update({ lida: true })
            .eq('id', notificacaoId)
            .select()
            .single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbMarcarTodasNotificacoesLidas(userId) {
    try {
        const { data, error } = await sb.from('notificacoes')
            .update({ lida: true })
            .eq('usuario_id', userId)
            .eq('lida', false)
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// FÓRUM DE DÚVIDAS (COMUNIDADE)
// ============================================================
export async function sbGetMensagensForum(nrId = null) {
    try {
        let query = sb.from('mensagens_forum')
            .select('*, profiles(nome_completo, role)')
            .order('criado_em', { ascending: false })
        if (nrId) {
            query = query.eq('nr_id', Number(nrId))
        }
        const { data, error } = await query
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbCriarMensagemForum(topico, mensagem, nrId, userId) {
    try {
        const { data, error } = await sb.from('mensagens_forum').insert({
            usuario_id: userId,
            topico: sanitizar(topico),
            mensagem: sanitizar(mensagem),
            nr_id: nrId ? Number(nrId) : null,
            status: 'aberta'
        }).select().single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

// ============================================================
// DASHBOARD
// ============================================================
export async function sbGetDashboardMetrics() {
    try {
        const { data, error } = await sb.from('view_dashboard_admin').select('*').single()
        if (error) throw error
        return { data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}

export async function sbGetRankingAlunos() {
    try {
        const { data, error } = await sb.from('view_ranking_alunos').select('*')
        if (error) throw error
        return { data: error ? null : data, error: null }
    } catch (error) {
        return { data: null, error }
    }
}