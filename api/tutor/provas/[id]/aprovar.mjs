// POST /api/tutor/provas/:id/aprovar — aprovação HITL da prova gerada pela I.A.
import { criarHandlerDecisao } from '../_handler-decisao.mjs'

export default criarHandlerDecisao({
    rpc: 'sulsafe_aprovar_prova_ia',
    mensagemErro: 'Não foi possível aprovar a prova.'
})
