/**
 * Model usage: a ring of provider/model shares beside the ranked list naming
 * them, with the range's leading model in the header. Pointing at a ring
 * segment or a row highlights the other, so a share can be traced to its model
 * without reading the palette by color alone.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/ModelUsage
 */

import { useMemo, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { compactText, exactText, percentText } from './format.ts'
import { modelShares, RING_STROKE, ringArc } from './models.ts'
import { SERIES_CLASSES } from './series.ts'
import { NS } from './locales.ts'
import type { ModelUsage as ModelUsageRow } from './types.ts'
import css from './ModelUsage.module.css'

/** Models kept separate before the remainder segment. */
const LEADING_SEGMENTS = 4

/**
 * Render the model-usage card.
 * @param props.t - translate seat of this plugin's namespace.
 * @param props.models - model aggregates ordered by tokens, as the Host returns them.
 * @param props.totalTokens - range Token total the shares are taken against.
 * @returns the model-usage card.
 */
export function ModelUsage({ t, models, totalTokens }: {
  t: TranslateNS<typeof NS>
  models: readonly ModelUsageRow[]
  totalTokens: number
}) {
  const [active, setActive] = useState<number>()
  const shares = useMemo(() => modelShares(models, totalTokens, LEADING_SEGMENTS), [models, totalTokens])
  const leading = shares[0]
  const reveal = (tone: number) => { setActive(tone) }
  const clear = () => { setActive(undefined) }
  return (
    <article className={css.panel}>
      <div className={css.header}>
        <h3 className={css.title}>{t('models.title')}</h3>
        {leading !== undefined && (
          <span className={css.top}>
            {t('models.top', { model: leading.model, share: percentText(leading.share) })}
          </span>
        )}
      </div>
      {shares.length === 0
        ? <div className={css.empty}>{t('models.empty')}</div>
        : (
          <div className={css.chart}>
            <div className={css.ring}>
              <svg
                className={css.svg}
                viewBox="0 0 100 100"
                role="img"
                aria-label={t('models.summary', { count: exactText(models.length) })}
              >
                <circle className={css.track} cx="50" cy="50" r="40" strokeWidth={RING_STROKE} />
                {shares.map((share, tone) => (
                  <path
                    key={tone}
                    className={SERIES_CLASSES[tone]}
                    d={ringArc(share.offset, share.share)}
                    strokeWidth={RING_STROKE}
                    data-muted={active !== undefined && active !== tone ? '' : undefined}
                    onPointerEnter={() => { reveal(tone) }}
                    onPointerLeave={clear}
                  />
                ))}
              </svg>
              <span className={css.center}>{compactText(totalTokens)}</span>
            </div>
            <ol className={css.ranking}>
              {shares.map((share, tone) => (
                <li
                  key={tone}
                  data-active={active === tone ? '' : undefined}
                  onPointerEnter={() => { reveal(tone) }}
                  onPointerLeave={clear}
                >
                  <i className={SERIES_CLASSES[tone]} />
                  <span>{share.remainder ? t('other') : share.model}<small>{share.provider}</small></span>
                  <span className={css.rank}>
                    <span>{percentText(share.share)}</span>
                    <small>{t('models.tokens', { tokens: compactText(share.totalTokens) })}</small>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
    </article>
  )
}
