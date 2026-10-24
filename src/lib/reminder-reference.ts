import {decryptSecret} from "./crypto";

/** Resolves the owned journey reference kept in an encrypted delivery record. */
export function reminderJourneyId(payload:string):string|undefined {
  if(!payload)return undefined;
  const value=JSON.parse(decryptSecret(payload)??"{}");
  return typeof value.journeyId==="string"?value.journeyId:undefined;
}
