import { io } from "@interval/sdk";
import { getBases, getBaseSchema } from "../services/airtable";
import { tableModelSchema } from "../services/airtable/schemas";
import { z } from "zod";

type Table = z.infer<typeof tableModelSchema>;

export interface AirtableBaseConfig {
  baseId: string;
  baseName: string;
  tableId: string;
  tableName: string;
  selectedTable: Table;
  viewId: string;
  filterByFormula?: string;
  recordsToProcessLimit?: number;
  overrideExisting: boolean;
}

export function buildFilterFormula(userFormula?: string, targetFieldName?: string, overrideExisting?: boolean): string | undefined {
  let conditions: string[] = [];

  // Add condition to skip records with existing values if override is disabled
  if (targetFieldName && !overrideExisting) {
    conditions.push(`NOT({${targetFieldName}})`);
  }

  // Add user's custom formula if provided
  if (userFormula && userFormula.trim()) {
    conditions.push(`(${userFormula.trim()})`);
  }

  // Combine conditions with AND
  if (conditions.length === 0) {
    return undefined;
  } else if (conditions.length === 1) {
    return conditions[0];
  } else {
    return `AND(${conditions.join(', ')})`;
  }
}

export async function selectAirtableBaseConfig(): Promise<AirtableBaseConfig> {
  const bases = await getBases();
  const base = await io.select.single("Select Airtable Base", {
    options: bases.map((base) => ({
      label: base.name,
      value: base.id,
    })),
  });

  const tables = await getBaseSchema(base.value);
  const table = await io.select.single("Select Table", {
    options: tables.map((table) => ({
      label: table.name,
      value: table.id,
    })),
  });

  const selectedTable = tables.find((item) => item.id === table.value);
  if (!selectedTable) throw new Error("Table not found");

  const {
    view,
    filterByFormula,
    recordsToProcessLimit,
    overrideExisting,
  } = await io.group({
    view: io.select.single("Select View", {
      helpText: "The view that contains the records to process",
      options: selectedTable.views.map((view) => ({
        label: view.name,
        value: view.id,
      })),
    }),
    filterByFormula: io.input
      .text("Filter By Formula", {
        helpText:
          "An optional formula to filter the records to process. If combined with the view parameter, only records in that view which satisfy the formula will be returned.",
        defaultValue: "",
      })
      .optional(),
    recordsToProcessLimit: io.input
      .number("Records to Process Limit", {
        helpText: "The number of records to process",
        min: 1,
      })
      .optional(),
    overrideExisting: io.input
      .boolean("Override Existing", {
        helpText: "Override existing values in the target field",
        defaultValue: false,
      })
      .optional(),
  });

  return {
    baseId: base.value,
    baseName: base.label,
    tableId: table.value,
    tableName: table.label,
    selectedTable,
    viewId: view.value,
    filterByFormula,
    recordsToProcessLimit,
    overrideExisting: overrideExisting ?? false,
  };
}