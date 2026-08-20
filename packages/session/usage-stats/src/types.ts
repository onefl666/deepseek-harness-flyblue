/** A supported inclusive history window. */
export type UsageStatsDays = 7 | 30

/** One request for a usage-statistics snapshot. */
export interface UsageStatsRequest {
  /** Number of Host calendar days to include, including today. */
  days: UsageStatsDays
}

/** Provider-reported token buckets. Reasoning is a subset of output. */
export interface UsageTokenBuckets {
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
export interface UsageStatsDay extends UsageTokenBuckets {
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
export interface UsageStatsModel extends UsageTokenBuckets {
  /** Provider route recorded with the request. */
  provider: string
  /** Provider model recorded with the request. */
  model: string
  /** Sum of the four disjoint token buckets. */
  totalTokens: number
  /** Distinct sessions that used this model in the selected range. */
  sessionCount: number
}

/** One session log that could not be interpreted and was excluded from the snapshot. */
export interface UsageStatsSkippedSession {
  /** Opaque local session id. */
  id: string
  /** The interpretation failure as reported by session persistence or the projection. */
  error: string
}

/** Complete browser-safe usage snapshot derived from local session logs. */
export interface UsageStatsSnapshot extends UsageTokenBuckets {
  /** Selected inclusive history window. */
  days: UsageStatsDays
  /** Host IANA timezone used for calendar-day boundaries. */
  timeZone: string
  /** First included local ISO calendar date. */
  startDate: string
  /** Last included local ISO calendar date. */
  endDate: string
  /** Unix epoch milliseconds at which this scan began. */
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
  daily: UsageStatsDay[]
  /** Provider/model usage ordered by tokens then identity. */
  models: UsageStatsModel[]
  /** Sessions excluded because their logs could not be interpreted; every other count omits them. */
  skippedSessions: UsageStatsSkippedSession[]
}
