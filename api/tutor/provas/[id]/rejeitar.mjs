// POST /api/tutor/provas/:id/rejeitar — rejeição HITL com motivo opcional.
import { criarHandlerDecisao } from '../_handler-decisao.mjs'

export default criarHandlerDecisao({
    rpc: 'sulsafe_rejeitar_prova_ia',
    mensagemErro: 'Não foi possível rejeitar a prova.'
})
