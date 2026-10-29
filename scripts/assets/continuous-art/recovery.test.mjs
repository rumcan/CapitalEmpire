import test from 'node:test';
import assert from 'node:assert/strict';
import {assessRecovery, isTransientNetworkFailure, TRANSIENT_RETRY_MS} from './recovery.mjs';

const nowMs=Date.parse('2026-10-28T09:00:00Z');
const network='Reconnecting... 5/5 (stream disconnected before completion: IO error: An established connection was aborted by the software in your host machine. (os error 10053))';

test('validated generation checkpoint survives an outer stream disconnect as a warning',()=>{
  const result=assessRecovery({exitCode:1,checkpoint:{status:'batch-complete'},checkpointValid:true,turnError:network,nowMs});
  assert.equal(result.kind,'checkpoint'); assert.equal(result.warning.exitCode,1); assert.match(result.warning.message,/10053/); assert.equal(result.notBeforeUtc,undefined);
});
test('validated review checkpoint survives a nonzero outer exit without repeating the review',()=>{
  assert.equal(assessRecovery({exitCode:1,checkpoint:{status:'review-checkpointed'},checkpointValid:true,turnError:network}).kind,'checkpoint');
});
test('success remains success and records no warning',()=>{
  assert.deepEqual(assessRecovery({exitCode:0,checkpoint:{status:'batch-complete'},checkpointValid:true}),{kind:'checkpoint',warning:null});
});
test('no checkpoint plus real 10053 schedules five-minute retry, not quota or permanent attention',()=>{
  const result=assessRecovery({exitCode:1,turnError:network,nowMs});
  assert.equal(result.kind,'retry'); assert.equal(result.status,'transient-backoff'); assert.equal(Date.parse(result.notBeforeUtc),nowMs+TRANSIENT_RETRY_MS);
});
test('known transient network and server statuses retry',()=>{
  for(const message of ['ECONNRESET','ETIMEDOUT','os error 10054','HTTP 503 Service Unavailable','status code: 502','request timeout'])assert.equal(isTransientNetworkFailure(message),true,message);
});
test('auth and capability failures never become transient retries',()=>{
  for(const message of ['HTTP 401 authentication required','HTTP 403 forbidden','capability-error: imagegen missing','unsupported model','invalid_api_key','expired token','malformed JSON after HTTP 503'])assert.equal(assessRecovery({exitCode:1,turnError:message,nowMs}).kind,'attention',message);
});
test('invalid or action-mismatched completion is not accepted because the stream disconnected',()=>{
  for(const status of ['batch-complete','review-checkpointed'])assert.equal(assessRecovery({exitCode:1,checkpoint:{status},checkpointValid:false,turnError:network,nowMs}).kind,'attention');
});
test('actual quota retains the existing five-hour handler and never gets five-minute recovery',()=>{
  const result=assessRecovery({exitCode:1,actualUsageFailure:true,turnError:network,nowMs});assert.equal(result.kind,'quota');assert.equal(result.notBeforeUtc,undefined);
});
test('quota words alone and arbitrary error text are not transient network errors',()=>{
  for(const message of ['usage limit','unknown worker failure','the prompt discusses HTTP examples','all good'])assert.equal(isTransientNetworkFailure(message),false);
});
test('an error checkpoint can retry real network failure, but a capability checkpoint cannot',()=>{
  assert.equal(assessRecovery({exitCode:1,checkpoint:{status:'error',error:network},nowMs}).kind,'retry');
  assert.equal(assessRecovery({exitCode:1,checkpoint:{status:'capability-error',error:network},nowMs}).kind,'attention');
});
test('semantic dependency checkpoint outranks incidental websocket reconnect diagnostics',()=>{
  for(const checkpoint of [
    {status:'error',builtinImagegenUsed:false,error:'DEPENDENCY_HELD: view1 remains held; no imagegen call made.',failure:{origin:'dependency-validation',actualError:true,code:'DEPENDENCY_HELD'}},
    {status:'error',builtinImagegenUsed:false,error:'DEPENDENCY_HELD: required accepted view is missing.'},
  ])for(const exitCode of [0,1]){
    const result=assessRecovery({exitCode,checkpoint,turnError:network,stderr:'Falling back from WebSockets to HTTPS transport.',nowMs});
    assert.equal(result.kind,'attention');assert.equal(result.notBeforeUtc,undefined);assert.equal(result.message,checkpoint.error);
  }
});
test('real tool quota still outranks a semantic dependency checkpoint',()=>{
  assert.equal(assessRecovery({exitCode:1,checkpoint:{status:'error',error:'DEPENDENCY_HELD: view1'},actualUsageFailure:true,turnError:network,nowMs}).kind,'quota');
});
test('caller may extend completed statuses only after its own strict subjob validation',()=>{
  const options={exitCode:1,checkpoint:{status:'subjob-complete'},checkpointValid:true,turnError:network,nowMs};
  assert.equal(assessRecovery(options).kind,'retry');
  assert.equal(assessRecovery({...options,completedStatuses:['subjob-complete']}).kind,'checkpoint');
});
