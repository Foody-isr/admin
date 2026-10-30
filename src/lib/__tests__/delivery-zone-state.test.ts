import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkedDeliveryZones, deliveryZoneDraft, deliveryZoneDraftError, deliveryZonePayload, deliveryZoneSignature, deliveryZoneCanDraw, validZoneCoordinate, parseDeliveryPostalCodes, validDeliverySchedule, deliveryScheduleWeekdays } from '../delivery-zone-state';
import type { DeliveryZone } from '../api';
const zone: DeliveryZone={id:1,restaurant_id:2,name:'Centre',type:'radius',is_active:true,center_lat:32,center_lng:34,radius_m:5000,delivery_fee:0,min_order:null,created_at:''};
test('delivery radius edits keep the stored centre instead of moving to the restaurant address',()=>{const draft=deliveryZoneDraft(zone,{lat:31,lng:35});draft.deliveryFee='12.5';const payload=deliveryZonePayload(draft,zone);assert.equal(payload.center_lat,32);assert.equal(payload.center_lng,34);assert.equal(payload.delivery_fee,12.5);assert.equal(payload.min_order,null);assert.equal(payload.tour_only,undefined);});
test('delivery zone prices preserve blank versus zero and reject invalid numbers',()=>{const draft=deliveryZoneDraft(zone);draft.deliveryFee='';draft.minOrder='0';assert.equal(deliveryZonePayload(draft,zone).delivery_fee,null);assert.equal(deliveryZonePayload(draft,zone).min_order,0);draft.deliveryFee='-1';assert.equal(deliveryZoneDraftError(draft),'invalidPrice');draft.deliveryFee='Infinity';assert.equal(deliveryZoneDraftError(draft),'invalidPrice');});
test('delivery geometry rejects nonfinite, out-of-range and sub-metre radius data without drawing it',()=>{const draft=deliveryZoneDraft(zone);draft.radiusKm='0.0001';assert.equal(deliveryZoneDraftError(draft),'deliveryZoneRadiusInvalid');draft.radiusKm='';assert.equal(deliveryZoneDraftError(draft),'deliveryZoneRadiusInvalid');draft.radiusKm='1e309';assert.equal(deliveryZoneDraftError(draft),'deliveryZoneRadiusInvalid');assert.equal(validZoneCoordinate({lat:91,lng:34}),false);assert.equal(deliveryZoneCanDraw({...zone,radius_m:-1}),false);assert.equal(deliveryZoneCanDraw({...zone,center_lat:100}),false);assert.equal(validZoneCoordinate({lat:0,lng:0}),true);});
test('delivery legacy polygons and inactive geometry round trip during unrelated edits',()=>{const polygon:DeliveryZone={...zone,type:'polygon',polygon:[[34,32],[35,32],[34,33]],cities:['Historical']};const draft=deliveryZoneDraft(polygon);draft.name='Renamed';const payload=deliveryZonePayload(draft,polygon);assert.deepEqual(payload.polygon,polygon.polygon);assert.deepEqual(payload.cities,['Historical']);assert.equal(payload.center_lat,32);assert.equal(payload.radius_m,5000);});
test('delivery readback equality handles Go omitted null fields without conflating a zero minimum',()=>{assert.equal(deliveryZoneSignature({...zone,delivery_fee:undefined}),deliveryZoneSignature({...zone,delivery_fee:null}));assert.notEqual(deliveryZoneSignature(zone),deliveryZoneSignature({...zone,min_order:0}));assert.notEqual(deliveryZoneSignature(zone),deliveryZoneSignature({...zone,center_lat:31}));});
test('delivery inventory never silently filters wrong restaurant or malformed records',()=>{assert.deepEqual(checkedDeliveryZones([zone,{...zone,id:2,tour_only:true}],2).map(row=>row.id),[1,2]);assert.throws(()=>checkedDeliveryZones([zone],1));assert.throws(()=>checkedDeliveryZones([zone,zone],2));assert.throws(()=>checkedDeliveryZones([{...zone,cities:'bad'} as any],2));assert.throws(()=>checkedDeliveryZones([{...zone,delivery_fee:NaN}],2));});

test('delivery department calendars survive fee edits and explicitly return to legacy',()=>{const scheduled:DeliveryZone={...zone,type:'departments',departments:['94','93'],schedule:{mode:'restaurant',windows:[{days:[1,5],start:'14:00',end:'18:00'}],offer_pickup:true}};const draft=deliveryZoneDraft(scheduled);draft.deliveryFee='8';assert.deepEqual(deliveryZonePayload(draft,scheduled).schedule,scheduled.schedule);draft.schedule=null;assert.equal(deliveryZonePayload(draft,scheduled).schedule,null);draft.departments=['20'];assert.equal(deliveryZoneDraftError(draft),'deliveryDepartmentsRequired');});
test('delivery calendar rejects overlapping windows and corrupt server calendars',()=>{const draft=deliveryZoneDraft(zone);draft.schedule={mode:'automatic',windows:[{days:[1],start:'14:00',end:'18:00'},{days:[1],start:'17:00',end:'19:00'}],offer_pickup:false};assert.equal(deliveryZoneDraftError(draft),'deliveryScheduleInvalid');assert.throws(()=>checkedDeliveryZones([{...zone,schedule:{mode:'automatic',windows:null} as any}],2));});

test('postal coverage keeps exact five-digit strings, fees and calendars through edits',()=>{
 const saved:DeliveryZone={...zone,type:'postal_codes',postal_codes:['75016','01000'],departments:['75'],schedule:{mode:'automatic',windows:[{days:[1,4],start:'14:00',end:'18:00'}],offer_pickup:false}};
 const draft=deliveryZoneDraft(saved);assert.equal(draft.postalCodesText,'75016, 01000');draft.deliveryFee='10';
 assert.deepEqual(JSON.parse(JSON.stringify(deliveryZonePayload(draft,saved))),{name:'Centre',type:'postal_codes',is_active:true,delivery_fee:10,min_order:null,departments:['75'],postal_codes:['75016','01000'],schedule:saved.schedule,center_lat:32,center_lng:34,radius_m:5000});
 assert.notEqual(deliveryZoneSignature(saved),deliveryZoneSignature({...saved,postal_codes:['75015']}));
 assert.equal(checkedDeliveryZones([saved],2)[0],saved);
 for(const invalid of [[],['75'],['7501'],['750160'],['75A16'],['７５０１６'],Array(1001).fill('75016')]){draft.postalCodes=invalid;assert.equal(deliveryZoneDraftError(draft),'deliveryPostalCodesRequired');}
 for(const codes of [['75016'],['01000'],['20000'],['97100']]){draft.postalCodes=codes;assert.equal(deliveryZoneDraftError(draft),null);}
 assert.throws(()=>checkedDeliveryZones([{...saved,postal_codes:[75016]} as any],2));
});

test('department input explains postal codes while retaining Corsica and overseas departments',()=>{
 const draft=deliveryZoneDraft({...zone,type:'departments',departments:['75','2A','2B','971','976']});assert.equal(deliveryZoneDraftError(draft),null);
 draft.departments=['75016'];assert.equal(deliveryZoneDraftError(draft),'deliveryDepartmentPostalCode');
});


test('postal lists accept multiline pastes and retain each exact code once',()=>{
 const codes=parseDeliveryPostalCodes('75016 75015\n01000\r\n75017, 75008;92100\t75016  01000');
 assert.deepEqual(codes,['75016','75015','01000','75017','75008','92100']);
 const draft=deliveryZoneDraft({...zone,type:'postal_codes',postal_codes:codes});assert.deepEqual(deliveryZonePayload(draft).postal_codes,codes);
 assert.deepEqual(parseDeliveryPostalCodes('  \n,;\t'),[]);
 assert.deepEqual(parseDeliveryPostalCodes('75016 heading'),['75016','heading']);
 draft.postalCodes=parseDeliveryPostalCodes('75016 heading');assert.equal(deliveryZoneDraftError(draft),'deliveryPostalCodesRequired');
});


test('delivery zones accept weekdays without times and retain legacy days when editing',()=>{
 const policy={mode:'customer' as const, days:[5,0],offer_pickup:false};
 assert.equal(validDeliverySchedule(policy),true);
 const draft=deliveryZoneDraft({...zone,schedule:policy});assert.deepEqual(deliveryZonePayload(draft).schedule,policy);
 assert.deepEqual(checkedDeliveryZones([{...zone,schedule:policy}],2)[0].schedule,policy);
 assert.deepEqual(deliveryScheduleWeekdays({mode:'customer',windows:[{days:[5],start:'10:00',end:'18:00'},{days:[0,5],start:'19:00',end:'20:00'}],offer_pickup:false}),[5,0]);
 for(const days of [[],[7],[-1],[5,5],[1.5]])assert.equal(validDeliverySchedule({...policy,days}),false);
 assert.equal(validDeliverySchedule({...policy,windows:[{days:[5],start:'10:00',end:'18:00'}]}),false);
});


test('zone writes carry the loaded revision without changing the content signature',()=>{
 const saved={...zone,updated_at:'2026-10-29T10:00:00.123456Z'};
 const payload=deliveryZonePayload(deliveryZoneDraft(saved),saved);
 assert.equal(payload.expected_updated_at,saved.updated_at);
 assert.equal(deliveryZoneSignature(saved),deliveryZoneSignature({...saved,updated_at:'2026-10-29T11:00:00Z'}));
 assert.equal('expected_updated_at' in JSON.parse(JSON.stringify(deliveryZonePayload(deliveryZoneDraft(zone),zone))),false);
});

test('zone same-day weekdays stay within the delivery calendar and survive fee edits',()=>{
 const schedule={mode:'customer' as const,days:[0,1,5],offer_pickup:false,same_day:{days:[1,5],transit_minutes:60,time_mode:'restaurant' as const}};
 const saved={...zone,schedule};const draft=deliveryZoneDraft(saved);draft.deliveryFee='15';
 assert.deepEqual(deliveryZonePayload(draft,saved).schedule,schedule);
 assert.notEqual(deliveryZoneSignature(saved),deliveryZoneSignature({...saved,schedule:{...schedule,same_day:{...schedule.same_day,days:[]}}}));
 for(const same_day of [{...schedule.same_day,days:[6]},{...schedule.same_day,days:[1,1]},{...schedule.same_day,days:null},{...schedule.same_day,transit_minutes:NaN},{...schedule.same_day,transit_minutes:1441},{...schedule.same_day,time_mode:'customer'}])assert.equal(validDeliverySchedule({...schedule,same_day} as any),false);
 assert.equal(validDeliverySchedule({...schedule,same_day:{...schedule.same_day,days:[]}}),true);
});
