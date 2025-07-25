import Airtable from "airtable";
import { getBaseSchemaResponseSchema, listBasesResponseSchema } from "./schemas";

const META_BASE_URL = "https://api.airtable.com/v0/meta/bases";

export async function getBases({ offset }: { offset?: string } = {}) {
  const request = await fetch(`${META_BASE_URL}${offset ? `?offset=${offset}` : ""}`, {
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    },
  });
  const data = listBasesResponseSchema.parse(await request.json());
  return data.bases;
}

export async function getBaseSchema(baseId: string) {
  const request = await fetch(`${META_BASE_URL}/${baseId}/tables`, {
    headers: {
      Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}`,
    },
  });
  const data = getBaseSchemaResponseSchema.parse(await request.json());
  return data.tables;
}

export async function getViewRecords({
  baseId,
  tableId,
  viewId,
  filterByFormula,
  maxRecords,
}: {
  baseId: string;
  tableId: string;
  viewId: string;
  filterByFormula?: string;
  maxRecords?: number;
}) {
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(baseId);
  const records = await base(tableId)
    .select({
      view: viewId,
      ...(filterByFormula ? { filterByFormula } : {}),
      ...(maxRecords ? { maxRecords } : {}),
    })
    .all();
  return records;
}

export async function updateRecord({
  baseId,
  tableId,
  recordId,
  fields,
  typecast = true,
}: {
  baseId: string;
  tableId: string;
  recordId: string;
  fields: Record<string, any>;
  typecast?: boolean;
}) {
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(baseId);
  const record = await base(tableId).update(recordId, fields, { typecast });
  return record;
}

export async function updateRecords({
  baseId,
  tableId,
  records,
  typecast = true,
}: {
  baseId: string;
  tableId: string;
  records: Array<{
    id: string;
    fields: Record<string, any>;
  }>;
  typecast?: boolean;
}) {
  const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(baseId);
  const updatedRecords = await base(tableId).update(records, { typecast });
  return updatedRecords;
}
