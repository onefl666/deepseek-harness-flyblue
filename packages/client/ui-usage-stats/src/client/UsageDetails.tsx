/**
 * Complete usage tables. They restate every charted figure as text, which is
 * how the dashboard stays readable without relying on the charts' colors.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/UsageDetails
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { dateText, exactText } from './format.ts'
import { NS } from './locales.ts'
import type { ModelUsage, UsageDay } from './types.ts'
import css from './UsageDetails.module.css'

/**
 * Render the expandable detail tables.
 * @param props.t - translate seat of this plugin's namespace.
 * @param props.days - dense chronological range as returned by the Host.
 * @param props.models - model aggregates ordered by tokens, as the Host returns them.
 * @returns the disclosure element.
 */
export function UsageDetails({ t, days, models }: {
  t: TranslateNS<typeof NS>
  days: readonly UsageDay[]
  models: readonly ModelUsage[]
}) {
  return (
    <details className={css.details}>
      <summary>{t('details')}</summary>
      <div className={css.tableWrap}>
        <table>
          <caption>{t('models.table')}</caption>
          <thead>
            <tr>
              <th>{t('provider')}</th>
              <th>{t('model')}</th>
              <th>{t('tokens')}</th>
              <th>{t('sessions')}</th>
            </tr>
          </thead>
          <tbody>
            {models.map(model => (
              <tr key={`${model.provider}/${model.model}`}>
                <td>{model.provider}</td>
                <td>{model.model}</td>
                <td>{exactText(model.totalTokens)}</td>
                <td>{exactText(model.sessionCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table>
          <caption>{t('daily.table')}</caption>
          <thead>
            <tr>
              <th>{t('date')}</th>
              <th>{t('tokens')}</th>
              <th>{t('kpi.messages')}</th>
              <th>{t('sessions')}</th>
            </tr>
          </thead>
          <tbody>
            {days.map(day => (
              <tr key={day.date}>
                <td>{dateText(day.date, true)}</td>
                <td>{exactText(day.totalTokens)}</td>
                <td>{exactText(day.messageCount)}</td>
                <td>{exactText(day.sessionCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
