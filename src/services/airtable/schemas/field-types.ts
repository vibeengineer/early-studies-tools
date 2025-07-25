import { z } from "zod";

export const fieldTypeModelSchema = z.enum([
  "singleLineText",
  "email",
  "url",
  "multilineText",
  "number",
  "percent",
  "currency",
  "singleSelect",
  "multipleSelects",
  "singleCollaborator",
  "multipleCollaborators",
  "multipleRecordLinks",
  "date",
  "dateTime",
  "phoneNumber",
  "multipleAttachments",
  "checkbox",
  "formula",
  "createdTime",
  "rollup",
  "count",
  "lookup",
  "multipleLookupValues",
  "autoNumber",
  "barcode",
  "rating",
  "richText",
  "duration",
  "lastModifiedTime",
  "button",
  "createdBy",
  "lastModifiedBy",
  "externalSyncSource",
  "aiText",
]);

const colorSchema = z.enum([
  "blueLight2",
  "cyanLight2",
  "tealLight2",
  "greenLight2",
  "yellowLight2",
  "orangeLight2",
  "redLight2",
  "pinkLight2",
  "purpleLight2",
  "grayLight2",
  "blueLight1",
  "cyanLight1",
  "tealLight1",
  "greenLight1",
  "yellowLight1",
  "orangeLight1",
  "redLight1",
  "pinkLight1",
  "purpleLight1",
  "grayLight1",
  "blueBright",
  "cyanBright",
  "tealBright",
  "greenBright",
  "yellowBright",
  "orangeBright",
  "redBright",
  "pinkBright",
  "purpleBright",
  "grayBright",
  "blueDark1",
  "cyanDark1",
  "tealDark1",
  "greenDark1",
  "yellowDark1",
  "orangeDark1",
  "redDark1",
  "pinkDark1",
  "purpleDark1",
  "grayDark1",
]);

const timezoneSchema = z.string();

const checkboxOptionsSchema = z.object({
  color: z.enum([
    "greenBright",
    "tealBright",
    "cyanBright",
    "blueBright",
    "purpleBright",
    "pinkBright",
    "redBright",
    "orangeBright",
    "yellowBright",
    "grayBright",
  ]),
  icon: z.enum(["check", "xCheckbox", "star", "heart", "thumbsUp", "flag", "dot"]),
});

const currencyOptionsSchema = z.object({
  precision: z.number().min(0).max(7),
  symbol: z.string(),
});

const dateFormatSchema = z.object({
  format: z.enum(["l", "LL", "M/D/YYYY", "D/M/YYYY", "YYYY-MM-DD"]),
  name: z.enum(["local", "friendly", "us", "european", "iso"]),
});

const timeFormatSchema = z.object({
  format: z.enum(["h:mma", "HH:mm"]),
  name: z.enum(["12hour", "24hour"]),
});

const dateOptionsSchema = z.object({
  dateFormat: dateFormatSchema,
});

const dateTimeOptionsSchema = z.object({
  timeZone: timezoneSchema,
  dateFormat: dateFormatSchema,
  timeFormat: timeFormatSchema,
});

const durationOptionsSchema = z.object({
  durationFormat: z.enum(["h:mm", "h:mm:ss", "h:mm:ss.S", "h:mm:ss.SS", "h:mm:ss.SSS"]),
});

const numberOptionsSchema = z.object({
  precision: z.number().min(0).max(8),
});

const percentOptionsSchema = z.object({
  precision: z.number().min(0).max(8),
});

const ratingOptionsSchema = z.object({
  color: z.enum([
    "yellowBright",
    "orangeBright",
    "redBright",
    "pinkBright",
    "purpleBright",
    "blueBright",
    "cyanBright",
    "tealBright",
    "greenBright",
    "grayBright",
  ]),
  icon: z.enum(["star", "heart", "thumbsUp", "flag", "dot"]),
  max: z.number().min(1).max(10),
});

const selectChoiceSchema = z.object({
  id: z.string().optional(),
  color: colorSchema.optional(),
  name: z.string(),
});

const singleSelectOptionsSchema = z.object({
  choices: z.array(selectChoiceSchema),
});

const multipleSelectsOptionsSchema = z.object({
  choices: z.array(selectChoiceSchema),
});

const multipleAttachmentsOptionsSchema = z.object({
  isReversed: z.boolean(),
});

const multipleRecordLinksOptionsSchema = z.object({
  isReversed: z.boolean(),
  linkedTableId: z.string(),
  prefersSingleRecordLink: z.boolean(),
  inverseLinkFieldId: z.string().optional(),
  viewIdForRecordSelection: z.string().optional(),
});

const countOptionsSchema = z.object({
  isValid: z.boolean(),
  recordLinkFieldId: z.string().nullable(),
});

const formulaOptionsSchema = z.object({
  formula: z.string(),
  isValid: z.boolean(),
  referencedFieldIds: z.array(z.string()).nullable(),
  result: z.any().nullable(),
});

const lookupOptionsSchema = z.object({
  fieldIdInLinkedTable: z.string().nullable(),
  isValid: z.boolean(),
  recordLinkFieldId: z.string().nullable(),
  result: z.any().nullable(),
});

const rollupOptionsSchema = z.object({
  fieldIdInLinkedTable: z.string().optional(),
  recordLinkFieldId: z.string().optional(),
  result: z.any().nullable().optional(),
  isValid: z.boolean().optional(),
  referencedFieldIds: z.array(z.string()).optional(),
});

const lastModifiedTimeOptionsSchema = z.object({
  isValid: z.boolean(),
  referencedFieldIds: z.array(z.string()).nullable(),
  result: z.union([dateOptionsSchema, dateTimeOptionsSchema]).nullable(),
});

const aiTextOptionsSchema = z.object({
  prompt: z
    .array(
      z.union([
        z.string(),
        z.object({
          field: z.object({
            fieldId: z.string(),
          }),
        }),
      ])
    )
    .optional(),
  referencedFieldIds: z.array(z.string()).optional(),
});

const externalSyncSourceOptionsSchema = z.object({
  choices: z.array(
    z.object({
      id: z.string(),
      color: colorSchema.optional(),
      name: z.string(),
    })
  ),
});

export const fieldOptionsSchemaMap = {
  singleLineText: z.object({}).optional(),
  email: z.object({}).optional(),
  url: z.object({}).optional(),
  multilineText: z.object({}).optional(),
  number: numberOptionsSchema,
  percent: percentOptionsSchema,
  currency: currencyOptionsSchema,
  singleSelect: singleSelectOptionsSchema,
  multipleSelects: multipleSelectsOptionsSchema,
  singleCollaborator: z.object({}).optional(),
  multipleCollaborators: z.object({}).optional(),
  multipleRecordLinks: multipleRecordLinksOptionsSchema,
  date: dateOptionsSchema,
  dateTime: dateTimeOptionsSchema,
  phoneNumber: z.object({}).optional(),
  multipleAttachments: multipleAttachmentsOptionsSchema,
  checkbox: checkboxOptionsSchema,
  formula: formulaOptionsSchema,
  createdTime: z.object({
    result: z.union([dateOptionsSchema, dateTimeOptionsSchema]).optional(),
  }),
  rollup: rollupOptionsSchema,
  count: countOptionsSchema,
  lookup: lookupOptionsSchema,
  multipleLookupValues: lookupOptionsSchema,
  autoNumber: z.object({}).optional(),
  barcode: z.object({}).optional(),
  rating: ratingOptionsSchema,
  richText: z.object({}).optional(),
  duration: durationOptionsSchema,
  lastModifiedTime: lastModifiedTimeOptionsSchema,
  button: z.object({}).optional(),
  createdBy: z.object({}).optional(),
  lastModifiedBy: z.object({}).optional(),
  externalSyncSource: externalSyncSourceOptionsSchema,
  aiText: aiTextOptionsSchema,
} as const;

function getFieldOptionsSchema(fieldType: FieldType) {
  return fieldOptionsSchemaMap[fieldType];
}

export const fieldSchema = z
  .object({
    id: z.string(),
    type: fieldTypeModelSchema,
    name: z.string(),
    description: z.string().optional(),
    options: z.any().optional(),
  })
  .transform((field) => {
    const optionsSchema = getFieldOptionsSchema(field.type as FieldType);
    return {
      ...field,
      options: optionsSchema ? optionsSchema.parse(field.options) : field.options,
    };
  });

export type FieldOptionsMap = typeof fieldOptionsSchemaMap;
export type FieldType = keyof FieldOptionsMap;
export type FieldOptions<T extends FieldType> = z.infer<FieldOptionsMap[T]>;
