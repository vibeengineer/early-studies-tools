import { z } from "zod";
import { fieldSchema } from "./field-types";

export const listBasesResponseSchema = z.object({
  offset: z.string().optional(),
  bases: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      permissionLevel: z.enum(["none", "read", "comment", "edit", "create"]),
    })
  ),
});

export const viewTypeModelSchema = z.enum([
  "grid",
  "form",
  "calendar",
  "gallery",
  "kanban",
  "timeline",
  "block",
]);

export const tableModelSchema = z.object({
  id: z.string(),
  primaryFieldId: z.string(),
  dateDependency: z
    .object({
      durationFieldId: z.string(),
      endDateFieldId: z.string(),
      isEnabled: z.boolean(),
      predecessorFieldId: z.string().nullable(),
      reschedulingMode: z.enum(["flexible", "fixed", "none"]),
      shouldSkipWeekendsAndHolidays: z.boolean(),
      startDateFieldId: z.string(),
      holidays: z.array(z.string()),
    })
    .optional(),
  name: z.string(),
  description: z.string().optional(),
  fields: z.array(fieldSchema),
  views: z.array(
    z.object({
      id: z.string(),
      type: viewTypeModelSchema,
      name: z.string(),
      visibleFieldIds: z.array(z.string()).optional(),
    })
  ),
});

export const getBaseSchemaResponseSchema = z.object({
  tables: z.array(tableModelSchema),
});
