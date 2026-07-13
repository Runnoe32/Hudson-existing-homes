import { IMPORTABLE_KEYS, type ImportableKey } from "./constants";

/**
 * Heuristic auto-mapping: for each CSV header, guess which lead field it maps to.
 * Users can override every guess in the mapping UI before importing.
 */
const SYNONYMS: Record<ImportableKey, string[]> = {
  parcelId: ["parcel", "parcelid", "parcelno", "pin", "parcelnumber", "taxid", "computerno"],
  address: ["address", "situs", "siteaddress", "propaddress", "propertyaddress", "location"],
  municipality: ["municipality", "muni", "town", "township", "city", "placename", "taxdistrict"],
  inHudsonSd: ["hudsonsd", "inhudson", "schooldist", "district", "sd"],
  ownerName: ["owner", "ownername", "ownernme1", "taxpayer", "name"],
  mailingAddress: ["mailing", "mailaddress", "mailingaddress", "pstladress", "billingaddress"],
  acreage: ["acre", "acres", "acreage", "gisacres", "deedacres", "lotsize"],
  yearBuilt: ["yearbuilt", "yrbuilt", "built", "yearblt"],
  sqft: ["sqft", "sqfeet", "squarefeet", "finishedsqft", "livingarea", "gla", "totalsqft"],
  beds: ["bed", "beds", "bedrooms", "br", "numbeds"],
  assessedValue: ["assessed", "assessedvalue", "cntassdvalue", "totalassessed", "assmt"],
  estMarket: ["market", "estmarket", "estfmkvalue", "fairmarket", "fmv", "marketvalue"],
  lotteryCredit: ["lottery", "lotterycredit", "gamingcredit", "lgc"],
  tenureYears: ["tenure", "tenureyears", "yearsowned", "ownedyears", "yrsowned"],
  source: ["source", "leadsource"],
  probateCaseNo: ["probate", "probatecase", "caseno", "casenumber"],
  prName: ["pr", "prname", "personalrep", "personalrepresentative", "executor"],
  prAttorney: ["prattorney", "attorney", "estateattorney", "counsel"],
  fitScore: ["fit", "fitscore"],
  motivationScore: ["motivation", "motivationscore", "motiv"],
  status: ["status", "stage", "pipeline"],
  nextAction: ["nextaction", "action", "todo"],
  nextActionDate: ["nextactiondate", "actiondate", "duedate", "followup", "followupdate"],
  notes: ["notes", "note", "comment", "comments", "remarks"],
};

function normalize(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Returns a mapping { csvHeader -> leadKey | "" (ignore) }. */
export function guessMapping(headers: string[]): Record<string, ImportableKey | ""> {
  const used = new Set<ImportableKey>();
  const out: Record<string, ImportableKey | ""> = {};
  for (const header of headers) {
    const norm = normalize(header);
    let best: ImportableKey | "" = "";
    // 1) exact key name or exact synonym
    for (const key of IMPORTABLE_KEYS) {
      if (used.has(key)) continue;
      if (normalize(key) === norm || SYNONYMS[key].some((s) => s === norm)) {
        best = key;
        break;
      }
    }
    // 2) fuzzy contains (header contains synonym or vice versa)
    if (!best) {
      for (const key of IMPORTABLE_KEYS) {
        if (used.has(key)) continue;
        if (SYNONYMS[key].some((s) => norm.includes(s) || s.includes(norm))) {
          best = key;
          break;
        }
      }
    }
    if (best) used.add(best);
    out[header] = best;
  }
  return out;
}
