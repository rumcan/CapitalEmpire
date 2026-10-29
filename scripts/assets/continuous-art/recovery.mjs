/** Exit recovery only. The caller must perform strict action/id/tool/hash/PNG validation first. */
export const TRANSIENT_RETRY_MS = 5 * 60 * 1000;

const hardFailure = /\b(?:unauthori[sz]ed|forbidden|authentication|invalid[_ -]?(?:api[_ -]?)?key|expired[_ -]?(?:token|credential)|capability[_ -]?error|unsupported[_ -]?(?:model|tool)|malformed|invalid checkpoint|invalid json|syntaxerror)\b|(?:http|status(?:\s+code)?)\s*[:=]?\s*(?:401|403)\b/i;
const networkFailure = /\b(?:ECONNRESET|ECONNABORTED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH)\b|os error\s*(?:10053|10054|10060)\b|stream disconnected before completion|connection (?:was )?(?:reset|aborted|timed out)|(?:request|network|connect(?:ion)?)\s+timeout|(?:http|status(?:\s+code)?)\s*[:=]?\s*(?:500|502|503|504)\b|server error\s*[:=]?\s*5\d\d\b/i;

/** Text must come from actual CLI/tool failure fields, never source instructions or assistant prose. */
export function isTransientNetworkFailure(message) {
  return typeof message === 'string' && !hardFailure.test(message) && networkFailure.test(message);
}

export function assessRecovery({
  exitCode, checkpoint = null, checkpointValid = false, actualUsageFailure = false,
  turnError = '', stderr = '', launchError = '', nowMs = Date.now(),
  completedStatuses = ['batch-complete', 'review-checkpointed'],
} = {}) {
  const message = [launchError, turnError, stderr, checkpoint?.error].filter(value => typeof value === 'string' && value.trim()).join('\n');
  if (actualUsageFailure) return {kind:'quota', message}; // Existing five-hour quota handler owns this.
  if (checkpoint?.status === 'capability-error' || hardFailure.test(message)) return {kind:'attention', message:message || 'Worker capability failure'};
  const terminal = checkpoint && completedStatuses.includes(checkpoint.status);
  if (checkpointValid === true && terminal) {
    return {kind:'checkpoint', warning:exitCode === 0 ? null : {
      exitCode:exitCode ?? null,
      message:message || 'CLI failed after a strictly validated durable checkpoint was saved',
    }};
  }
  // A malformed or semantically mismatched completion cannot become successful via a network error.
  if (terminal && checkpointValid !== true) return {kind:'attention', message:'Durable checkpoint failed strict action/id/tool/hash validation'};
  // A saved semantic refusal is the outcome; earlier transport reconnect messages cannot make it retryable.
  if (checkpoint?.status === 'error' && (checkpoint.failure?.code === 'DEPENDENCY_HELD' || /^DEPENDENCY_HELD\b/.test(checkpoint.error ?? ''))) {
    return {kind:'attention', message:checkpoint.error || 'DEPENDENCY_HELD: required source artwork is not accepted'};
  }
  if (isTransientNetworkFailure(message)) return {
    kind:'retry', status:'transient-backoff', message,
    notBeforeUtc:new Date(nowMs + TRANSIENT_RETRY_MS).toISOString(),
  };
  return {kind:'attention', message:message || 'No strictly validated completed checkpoint'};
}
