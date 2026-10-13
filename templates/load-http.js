import http from 'k6/http';
import exec from 'k6/execution';
import {Counter} from 'k6/metrics';
const dispatched=new Counter('business_experiments');
const config=JSON.parse(__ENV.TARGET_CONFIG);
export const options={scenarios:{target:{executor:'constant-arrival-rate',rate:config.rate,timeUnit:'1s',duration:config.durationSeconds+'s',preAllocatedVUs:config.maxVUs,maxVUs:config.maxVUs,gracefulStop:config.settlementMs+'ms'}},maxRedirects:0,discardResponseBodies:true};
export default function(){
  if(exec.scenario.iterationInTest>=config.rate*config.durationSeconds)return;
  dispatched.add(1);
  http.post(__ENV.BRIDGE_URL+'/iteration',JSON.stringify({index:exec.scenario.iterationInTest}),{headers:{'Content-Type':'application/json','Authorization':'Bearer '+__ENV.BRIDGE_SECRET},timeout:(config.settlementMs+60000)+'ms'});
}
export function handleSummary(data){return {stdout:'T8_SUMMARY '+JSON.stringify({dropped:data.metrics.dropped_iterations?.values.count??0,iterations:data.metrics.business_experiments?.values.count??0})+'\n'};}
