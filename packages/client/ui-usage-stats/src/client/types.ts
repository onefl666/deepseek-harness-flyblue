/**
 * Browser copies of the usage Remote's wire types. They restate the Host's
 * `@deepseek-ai/dsh-usage-stats/types` because a Client bundle cannot import a
 * Host package; the Host owns the wire, and these mirror it field for field.
 * @module @deepseek-ai/dsh-client-ui-usage-stats/types
 */

/** A supported inclusive history range. */
export type UsageDays = 7 | 30

/** Token buckets shown by this browser surface. Reasoning is a subset of output. */
export interface TokenBuckets {
  /** Input tokens that were neither read from nor written to a cache. */
  uncachedInputTokens: number
  /** Output tokens, including any reasoning tokens reported separately. */
  outputTokens: number
  /** Input tokens read from a provider cache. */
  cacheReadTokens: number
  /** Input tokens written to a provider cache. */
  cacheWriteTokens: number
  /** Informational subset of output attributed to reasoning. */
  reasoningTokens: number
}

/** Usage and activity for one Host calendar day. */
export interface UsageDay extends TokenBuckets {
  /** Local ISO calendar date (`YYYY-MM-DD`). */
  date: string
  /** Sum of the four disjoint token buckets. */
  totalTokens: number
  /** Distinct sessions active on this date. */
  sessionCount: number
  /** Direct-user and non-empty assistant messages on this date. */
  messageCount: number
}

/** Usage attributed to one provider/model pair. */
export interface ModelUsage extends TokenBuckets {
  /** Provider route recorded with the request. */
  provider: string
  /** Provider model recorded with the request. */
  model: string
  /** Sum of the four disjoint token buckets. */
  totalTokens: number
  /** Distinct sessions that used this model in the selected range. */
  sessionCount: number
}

/** One session log the Host could not interpret, excluded from every count. */
export interface SkippedSession {
  /** Opaque local session id. */
  id: string
  /** The interpretation failure as reported by session persistence. */
  error: string
}

/** Browser copy of the historical Host snapshot. */
export interface Stats extends TokenBuckets {
  /** Selected inclusive history window. */
  days: UsageDays
  /** Host IANA timezone used for calendar-day boundaries. */
  timeZone: string
  /** First included local ISO calendar date. */
  startDate: string
  /** Last included local ISO calendar date. */
  endDate: string
  /** Unix epoch milliseconds at which the Host scan began. */
  generatedAt: number
  /** Sum of the four disjoint token buckets. */
  totalTokens: number
  /** Distinct sessions with visible messages or usage in the range. */
  sessionCount: number
  /** Direct-user and non-empty assistant messages in the range. */
  messageCount: number
  /** Number of dates with at least one visible message. */
  activeDays: number
  /** Consecutive visible-message days ending today; zero when today is inactive. */
  currentStreakDays: number
  /** Dense chronological daily series. */
  daily: UsageDay[]
  /** Provider/model usage ordered by tokens then identity. */
  models: ModelUsage[]
  /** Sessions excluded because their logs could not be interpreted. */
  skippedSessions: SkippedSession[]
}
