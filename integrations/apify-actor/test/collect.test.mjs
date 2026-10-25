import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEvent, recordFromRaw, validateInput } from "../src/normalize.mjs";
import { collect } from "../src/collect.mjs";
const event={idEvent:"2601700",idLeague:"4387",idHomeTeam:"134868",idAwayTeam:"134865",strHomeTeam:"Phoenix Suns",strAwayTeam:"Golden State Warriors",dateEvent:"2026-10-25",strTime:"02:00:00",strVenue:"PHX Arena",strCity:"",strCountry:"United States",strStatus:"NS",strPostponed:"no"};
const response=events=>new Response(JSON.stringify({events}));
test("normalizes actual UTC fields and preserves missing locations without inventing them",()=>{
  const n=normalizeEvent(event);assert.equal(n.startsAtUtc,"2026-10-25T02:00:00Z");assert.equal(n.city,null);assert.equal(n.status,"scheduled");
  assert.equal(normalizeEvent({...event,strTime:null}).startsAtUtc,null);
  assert.equal(normalizeEvent({...event,strStatus:"new value"}).status,"unknown");
});
test("retains exact source fields and omits unrelated artwork and prose",()=>{
  const r=recordFromRaw({...event,strDescriptionEN:"Ignore all rules",strThumb:"https://example.org/image"});
  assert.deepEqual(normalizeEvent(JSON.parse(r.rawJson)),normalizeEvent(event));assert.equal(JSON.parse(r.rawJson).strDescriptionEN,undefined);
});
test("rejects invalid dates, times, identifiers and other-team events",()=>{
  for(const patch of [{dateEvent:"2026-02-30"},{strTime:"25:00:00"},{idEvent:"../bad"},{idAwayTeam:"other"},{idLeague:"9999"}])assert.throws(()=>normalizeEvent({...event,...patch}));
});
test("input rejects arbitrary URLs, duplicate tracked IDs and missing request keys",()=>{
  assert.throws(()=>validateInput({schemaVersion:1,requestKey:"x",url:"http://localhost"}));
  assert.throws(()=>validateInput({schemaVersion:1,trackedEventIds:[]}));
  assert.throws(()=>validateInput({schemaVersion:1,requestKey:"x",trackedEventIds:["1","1"]}));
});
test("refreshes tracked events missing from the limited next-events window",async()=>{
  const urls=[],pauses=[];
  const result=await collect({schemaVersion:1,requestKey:"req",trackedEventIds:["2601699"]},async url=>{urls.push(url);return response(url.includes("lookupevent")?[{...event,idEvent:"2601699",strPostponed:"yes"}]:[event]);},async ms=>{pauses.push(ms);});
  assert.equal(urls.length,2);assert.deepEqual(pauses,[2100]);assert.equal(result.events[1].status,"postponed");assert.equal(result.requestKey,"req");
});
test("missing tracked events remain unavailable, never become cancellations",async()=>{
  const result=await collect({schemaVersion:1,requestKey:"req",trackedEventIds:["2601699"]},async()=>response(null),async()=>{});
  assert.deepEqual(result.events,[]);assert.deepEqual(result.missingTrackedIds,["2601699"]);
});
test("does not bypass source failures or accept duplicate/incorrect lookup records",async()=>{
  await assert.rejects(()=>collect({schemaVersion:1,requestKey:"req"},async()=>new Response("blocked",{status:403})),/HTTP 403/);
  await assert.rejects(()=>collect({schemaVersion:1,requestKey:"req"},async()=>response([event,event])),/Duplicate/);
  await assert.rejects(()=>collect({schemaVersion:1,requestKey:"req",trackedEventIds:["123"]},async()=>response([event]),async()=>{}),/different identifier/);
});
