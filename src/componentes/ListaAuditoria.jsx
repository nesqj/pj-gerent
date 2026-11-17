// Lista de registros de atividade (quem fez o quê e quando). Usada nas Configurações da loja e no painel da plataforma.
import * as Org from '../organizacoes.js'
import { t } from '../i18n.js'
import { dataTs, hora } from '../utils.js'

const momento = (ts) => (ts ? `${dataTs(ts)} ${hora(ts)}` : '-')

export function ListaAuditoria({ eventos, mostrarLoja, onAbrir }) {
  return (
    <div className="tw">
      <table>
        <thead><tr><th>{t('Quando')}</th>{mostrarLoja && <th>{t('Loja')}</th>}<th>{t('Quem')}</th><th>{t('Ação')}</th><th>{t('Detalhe')}</th></tr></thead>
        <tbody>
          {eventos.length === 0 && <tr><td colSpan={mostrarLoja ? 5 : 4} className="vazio">{t('Nenhum registro.')}</td></tr>}
          {eventos.map((e) => (
            <tr key={e.id} className={onAbrir ? 'clicavel' : ''} onClick={onAbrir ? () => onAbrir(e.id) : undefined}>
              <td>{momento(e.criado_em)}</td>
              {mostrarLoja && <td>{e.org_nome || (e.org_id ? '-' : t('Plataforma'))}</td>}
              <td>{e.email || t('Sistema')}</td>
              <td>{Org.nomeAcao(e.acao)}</td>
              <td className="quebra">{e.detalhe || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
